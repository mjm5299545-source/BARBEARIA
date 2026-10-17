// Disposable PostgreSQL + official Supabase Auth (GoTrue). Never uses a real
// project or user credentials; all container names and secrets are generated.
import {spawnSync,spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const id='grecco-test-'+randomUUID().slice(0,8),network=id+'-net',postgres=id+'-db',auth=id+'-auth',directory=mkdtempSync(path.join(tmpdir(),'grecco-test-'));
const selector=['--host=unix:///var/run/docker.sock'];
function docker(args,{ignore=false}={}){
 const result=spawnSync('docker',[...selector,...args],{encoding:'utf8',env:process.env});
 if(result.status!==0&&!ignore)throw new Error('Docker não concluiu '+args[0]+' ('+(result.status??'indisponível')+'). Confira o daemon e as imagens postgres:17-alpine e supabase/gotrue:v2.177.0.');
 return result.stdout?.trim();
}
async function wait(check,label){const until=Date.now()+45000;while(Date.now()<until){try{if(await check())return;}catch{}await new Promise(r=>setTimeout(r,300));}throw new Error(label+' não iniciou no prazo de 45 segundos.');}
const password=randomBytes(32).toString('hex'),jwt=randomBytes(32).toString('hex');
try{
 docker(['info','--format','{{.ServerVersion}}']);
 docker(['network','create',network]);
 const pgEnv=path.join(directory,'pg.env');writeFileSync(pgEnv,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 docker(['run','-d','--name',postgres,'--network',network,'-p','127.0.0.1::5432','--env-file',pgEnv,'postgres:17-alpine']);
 const pgPort=docker(['port',postgres,'5432/tcp']).split(':').at(-1);
 await wait(()=>spawnSync('docker',[...selector,'exec',postgres,'pg_isready','-U','postgres'],{stdio:'ignore'}).status===0,'PostgreSQL');
 docker(['exec',postgres,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-c','CREATE DATABASE grecco_auth_test']);
 docker(['exec',postgres,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-c','CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;']);
 docker(['exec',postgres,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','grecco_auth_test','-c','CREATE SCHEMA auth; ALTER DATABASE grecco_auth_test SET search_path=auth,public']);
 const authEnv=path.join(directory,'auth.env');const variables={GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgresql://postgres:${password}@${postgres}:5432/grecco_auth_test`,GOTRUE_SITE_URL:'http://127.0.0.1',GOTRUE_JWT_SECRET:jwt,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role'};
 writeFileSync(authEnv,Object.entries(variables).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
 docker(['run','-d','--name',auth,'--network',network,'-p','127.0.0.1::9999','--env-file',authEnv,'supabase/gotrue:v2.177.0']);
 const authPort=docker(['port',auth,'9999/tcp']).split(':').at(-1),authUrl='http://127.0.0.1:'+authPort;
 await wait(async()=>{const r=await fetch(authUrl+'/health',{signal:AbortSignal.timeout(2000)});return r.ok;},'Supabase Auth');
 console.log('PostgreSQL e Supabase Auth reais disponíveis; executando toda a suíte em bancos descartáveis.');
 const database=`postgresql://postgres:${password}@127.0.0.1:${pgPort}/`;
 const env={...process.env,TEST_DATABASE_URL:database+'postgres',TEST_SUPABASE_DATABASE_URL:database+'grecco_auth_test',TEST_SUPABASE_AUTH_URL:authUrl,TEST_SUPABASE_JWT_SECRET:jwt};
 // Local suites explicitly own their configuration; inherited production settings
 // must never redirect tests to an external project.
 for(const key of ['SUPABASE_URL','SUPABASE_PROJECT_REF','SUPABASE_PUBLISHABLE_KEY','DATABASE_URL','DATABASE_SCHEMA','VERCEL'])delete env[key];
 const child=spawn(process.execPath,['--test','tests/*.test.mjs'],{stdio:'inherit',env});
 process.exitCode=await new Promise(resolve=>child.once('exit',code=>resolve(code??1)));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{docker(['rm','--force','--volumes',auth,postgres],{ignore:true});docker(['network','rm',network],{ignore:true});rmSync(directory,{recursive:true,force:true});}
