import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Pool} from 'pg';
import express from 'express';
import {chromium,expect} from '@playwright/test';
const enabled=!!(process.env.TEST_SUPABASE_DATABASE_URL&&process.env.TEST_SUPABASE_AUTH_URL&&process.env.TEST_SUPABASE_JWT_SECRET);
let db,app,server,gateway,base,owner,plain,adminPool,restrictedPool,cookie,csrf,barberId,day,reservation,browser;
const probeRole='grecco_rls_probe_'+process.pid;
const password=randomBytes(24).toString('hex');
function jwt(role){const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const part=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iss:'supabase',exp:Math.floor(Date.now()/1000)+3600});return part+'.'+createHmac('sha256',process.env.TEST_SUPABASE_JWT_SECRET).update(part).digest('base64url');}
async function provider(path,body){const r=await fetch(process.env.TEST_SUPABASE_AUTH_URL+path,{method:'POST',headers:{Authorization:'Bearer '+jwt('service_role'),'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.ok,true,'Supabase Auth respondeu '+r.status);return r.json();}
async function request(path,{method='GET',body,admin=false,headers={}}={}){const r=await fetch(base+'/api'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(admin?{cookie,'x-csrf-token':csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),response:r};}
before(async()=>{
 if(!enabled)return;
 const target=new URL(process.env.TEST_SUPABASE_DATABASE_URL);assert.ok(['127.0.0.1','localhost'].includes(target.hostname)&&/^\/grecco_(auth_test|test_[a-z0-9_]+)$/.test(target.pathname),'Use somente um banco local descartável identificado como grecco_auth_test ou grecco_test_*.');
 process.env.NODE_ENV='test';delete process.env.VERCEL;
 const proxy=express();proxy.use(express.raw({type:()=>true}));proxy.use('/auth/v1',async(req,res)=>{try{const r=await fetch(process.env.TEST_SUPABASE_AUTH_URL+req.url,{method:req.method,headers:{'Content-Type':'application/json',...(req.get('authorization')?{Authorization:req.get('authorization')}:{})},...(!['GET','HEAD'].includes(req.method)?{body:req.body}:{}),signal:AbortSignal.timeout(10000)});res.status(r.status).type('json').send(await r.text());}catch{res.sendStatus(502);}});
 gateway=proxy.listen(0,'127.0.0.1');await new Promise(r=>gateway.once('listening',r));
 process.env.SUPABASE_URL=`http://127.0.0.1:${gateway.address().port}`;process.env.SUPABASE_PROJECT_REF='greccolocal';process.env.SUPABASE_PUBLISHABLE_KEY='local-gateway-key';process.env.SESSION_ENCRYPTION_KEY=randomBytes(32).toString('hex');process.env.SETUP_TOKEN=randomBytes(32).toString('hex');
 adminPool=new Pool({connectionString:process.env.TEST_SUPABASE_DATABASE_URL});
 await adminPool.query('CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions');
 const migrationEnv={...process.env,DATABASE_MIGRATION_URL:process.env.TEST_SUPABASE_DATABASE_URL,DATABASE_APP_PASSWORD:randomBytes(32).toString('hex'),GRECCO_CONFIRM_PROJECT_REF:'greccolocal'};
 await promisify(execFile)(process.execPath,['scripts/migrate.mjs'],{env:migrationEnv});
 // Repeat the migration to prove versioning and seed preservation.
 await promisify(execFile)(process.execPath,['scripts/migrate.mjs'],{env:migrationEnv});
 const restricted=new URL(process.env.TEST_SUPABASE_DATABASE_URL);restricted.username='grecco_backend';restricted.password=migrationEnv.DATABASE_APP_PASSWORD;
 process.env.DATABASE_URL=restricted.toString();process.env.DATABASE_SCHEMA='grecco';
 restrictedPool=new Pool({connectionString:restricted.toString()});
 ({db}=await import('../server/db.mjs'));({app}=await import('../server/index.mjs'));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 owner=await provider('/admin/users',{email:'owner@grecco.example.test',password,email_confirm:true});plain=await provider('/admin/users',{email:'visitor@grecco.example.test',password,email_confirm:true,user_metadata:{role:'admin'}});
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{if(!enabled)return;await browser?.close();if(server)await new Promise(r=>server.close(r));if(gateway)await new Promise(r=>gateway.close(r));await db?.close();if(adminPool){await adminPool.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])',[[owner?.id,plain?.id].filter(Boolean)]);await adminPool.query('DROP SCHEMA grecco CASCADE');await adminPool.query('DROP ROLE IF EXISTS '+probeRole);}await adminPool?.end();await restrictedPool?.end();});
const real=(name,fn)=>test(name,{skip:!enabled},fn);
real('Supabase: RLS ativo, papel restrito e usuários comuns sem acesso aos dados',async()=>{
 const tables=(await adminPool.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='grecco'")).rows;assert.ok(tables.length>=14);assert.ok(tables.every(t=>t.rowsecurity));
 const flags=(await restrictedPool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(flags.rolsuper,false);assert.equal(flags.rolbypassrls,false);
 for(const role of ['anon','authenticated']){const c=await adminPool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);await assert.rejects(c.query('SELECT * FROM grecco.appointments'),e=>e.code==='42501');await c.query('ROLLBACK');}finally{c.release();}}
 // Exercise row policies independently of schema/table privilege denials.
 await adminPool.query('CREATE ROLE '+probeRole+' NOLOGIN; GRANT USAGE ON SCHEMA grecco TO '+probeRole+'; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA grecco TO '+probeRole);
 const c=await adminPool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+probeRole);assert.equal((await c.query('SELECT * FROM grecco.services')).rows.length,0);await assert.rejects(c.query("INSERT INTO grecco.customers VALUES('probe','Probe','79999999999',now(),now())"),e=>e.code==='42501');await c.query('ROLLBACK');}finally{c.release();}
 await assert.rejects(restrictedPool.query("UPDATE grecco.schema_migrations SET version=99"),e=>e.code==='42501');
});
real('Supabase Auth: primeiro administrador pelo navegador, senha incorreta e conta comum bloqueadas',async()=>{
 assert.equal((await request('/admin/data')).status,401);
 assert.equal((await request('/setup',{method:'POST',headers:{'X-Setup-Token':'invalid'},body:{email:owner.email,password}})).status,403);
 const page=await browser.newPage();await page.goto(base+'/admin');await expect(page.getByRole('heading',{name:'Vamos liberar seu acesso.'})).toBeVisible();await page.getByLabel('Chave de configuração',{exact:true}).fill(process.env.SETUP_TOKEN);await page.getByLabel('Seu e-mail',{exact:true}).fill(owner.email);await page.getByLabel('Senha da conta Supabase',{exact:true}).fill(password);await page.getByLabel('Confirme a senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Autorizar conta e entrar'}).click();await expect(page.getByRole('heading',{name:'Visão geral',exact:true})).toBeVisible();await page.close();
 assert.equal((await request('/setup',{method:'POST',headers:{'X-Setup-Token':process.env.SETUP_TOKEN},body:{email:plain.email,password}})).status,409);
 assert.equal((await request('/login',{method:'POST',body:{email:owner.email,password:'incorrect-password'}})).status,401);
 assert.equal((await request('/login',{method:'POST',body:{email:plain.email,password}})).status,403);
 const login=await request('/login',{method:'POST',body:{email:owner.email,password}});assert.equal(login.status,200);cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;assert.equal(login.data.access_token,undefined);
 assert.equal((await request('/admin/settings',{method:'PUT',headers:{cookie},body:{}})).status,403);
 const row=await db.prepare('SELECT * FROM sessions WHERE csrf=?').get(csrf);assert.ok(row.provider_data);assert.ok(!row.provider_data.includes('access_token'));assert.ok(!row.provider_data.includes('refresh_token'));
});
real('Supabase Auth: renovação concorrente de sessão, expiração e revogação de permissão',async()=>{
 const prior=await db.prepare('SELECT * FROM sessions WHERE csrf=?').get(csrf);await db.prepare('UPDATE sessions SET provider_expires=? WHERE id=?').run(Date.now()-1,prior.id);
 const results=await Promise.all([request('/admin/session',{admin:true}),request('/admin/session',{admin:true})]);assert.ok(results.every(r=>r.status===200));const after=await db.prepare('SELECT * FROM sessions WHERE id=?').get(prior.id);assert.ok(Number(after.provider_expires)>Date.now());assert.notEqual(after.provider_data,prior.provider_data);
 await db.prepare("UPDATE users SET role='user' WHERE auth_user_id=?").run(owner.id);assert.equal((await request('/admin/session',{admin:true})).status,401);await db.prepare("UPDATE users SET role='admin' WHERE auth_user_id=?").run(owner.id);
 let login=await request('/login',{method:'POST',body:{email:owner.email,password}});cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;await db.prepare('UPDATE sessions SET expires=? WHERE csrf=?').run(Date.now()-1,csrf);assert.equal((await request('/admin/data',{admin:true})).status,401);
 login=await request('/login',{method:'POST',body:{email:owner.email,password}});cookie=login.response.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;
});
real('Supabase Auth: falha real de conexão é informada e a sessão pode ser recuperada',async()=>{
 const offline=express().listen(0,'127.0.0.1');await new Promise(r=>offline.once('listening',r));const port=offline.address().port;await new Promise(r=>offline.close(r));
 const original=process.env.SUPABASE_URL;process.env.SUPABASE_URL=`http://127.0.0.1:${port}`;
 try{const r=await request('/admin/session',{admin:true});assert.equal(r.status,503);assert.equal(r.data.code,'SETUP_REQUIRED');assert.ok(!JSON.stringify(r.data).includes(password));}finally{process.env.SUPABASE_URL=original;}
 assert.equal((await request('/admin/session',{admin:true})).status,200);
});
real('Supabase: serviço, profissional, reserva simultânea, clientes e painel persistem no banco',async()=>{
 const publicData=(await request('/public')).data;const corte=publicData.services.find(s=>s.id==='corte');assert.equal((await request('/admin/services/corte',{method:'PUT',admin:true,body:{...corte,price:4500,duration:40}})).status,200);assert.equal((await request('/public')).data.services.find(s=>s.id==='corte').price,4500);
 day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);const weekday=new Date(day+'T12:00:00Z').getUTCDay();const staff=await request('/admin/barbers',{method:'POST',admin:true,body:{name:'Profissional teste',active:true,photo:'',services:['corte'],hours:[{day:weekday,start:'09:00',end:'12:00'},{day:weekday,start:'13:00',end:'18:00'}]}});assert.equal(staff.status,200);barberId=staff.data.id;
 assert.equal((await request('/admin/settings',{method:'PUT',admin:true,body:{...publicData.settings,onlineEnabled:true,minNoticeMinutes:0}})).status,200);
 const input={customer:'Cliente teste Supabase',phone:'79999999999',barberId,serviceIds:['corte'],date:day,time:'09:00',consent:true};const results=await Promise.all([request('/appointments',{method:'POST',body:input}),request('/appointments',{method:'POST',body:input})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);reservation=results.find(r=>r.status===201).data;
 const rows=(await adminPool.query('SELECT * FROM grecco.appointments')).rows;assert.equal(rows.length,1);assert.equal(rows[0].reference,reservation.reference);assert.ok(rows[0].customer_id);
 assert.equal((await request('/admin/data',{admin:true})).data.appointments[0].reference,reservation.reference);
 const clients=await request('/admin/customers',{admin:true});assert.equal(clients.data.total,1);const id=clients.data.customers[0].id;assert.equal((await request('/admin/customers/'+id,{admin:true})).data.appointments.length,1);assert.equal((await request('/admin/customers/'+id,{method:'PUT',admin:true,body:{name:'Cadastro corrigido',phone:input.phone}})).status,200);assert.equal((await request('/admin/customers/'+id,{admin:true})).data.customer.name,'Cadastro corrigido');assert.equal((await request('/appointments/'+reservation.token)).data.customer_id,undefined);
 const block=await request('/admin/blocks',{method:'POST',admin:true,body:{barberId,start:day+'T16:00:00.000Z',end:day+'T17:00:00.000Z',reason:'Teste'}});assert.equal(block.status,201);assert.ok(!(await request(`/availability?date=${day}&barber=${barberId}&services=corte`)).data.some(s=>s.time==='13:00'));
 assert.equal((await request('/admin/metrics',{admin:true})).data.total,1);
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base+'/admin');await page.getByLabel('E-mail',{exact:true}).fill(owner.email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar no painel'}).click();await expect(page.getByRole('heading',{name:'Visão geral',exact:true})).toBeVisible();await page.getByRole('button',{name:'Abrir navegação'}).click();await page.getByRole('button',{name:'Clientes',exact:true}).click();await expect(page.getByText('Cadastro corrigido',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Ver histórico de Cadastro corrigido'}).click();await expect(page.getByRole('dialog')).toContainText(reservation.reference);await page.close();
});
real('Supabase: cliente agenda no celular, clique duplicado é bloqueado e alteração administrativa aparece na reserva',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.getByRole('button',{name:'Agendar meu horário',exact:true}).first().click();await page.locator('.booking-service').filter({has:page.getByText('Corte',{exact:true})}).click();await page.getByRole('button',{name:'Escolher horário'}).click();await page.getByLabel('Data',{exact:true}).fill(day);await page.getByRole('button',{name:'10:00',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByLabel('Seu nome',{exact:true}).fill('Cliente pelo Supabase mobile');await page.getByLabel('Telefone com DDD',{exact:true}).fill('79988888888');await page.getByRole('checkbox').check();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('dialog').locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});await expect(page.getByText('AGENDAMENTO CONFIRMADO',{exact:true})).toBeVisible();
 const link=await page.getByRole('link',{name:'Ver meu agendamento'}).getAttribute('href');await page.getByRole('link',{name:'Ver meu agendamento'}).click();await expect(page.locator('.manage-card')).toContainText('Confirmado');
 const created=(await adminPool.query("SELECT * FROM grecco.appointments WHERE phone='79988888888'")).rows;assert.equal(created.length,1);
 assert.equal((await request('/admin/appointments/'+created[0].id,{method:'PUT',admin:true,body:{status:'cancelled',notes:''}})).status,200);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.manage-card .status')).toHaveText('Cancelado');
 assert.ok(link.includes('/reserva#'));assert.deepEqual(errors,[]);await page.close();
});
real('Supabase: remarcação, conclusão, exclusão permitida e logout',async()=>{
 assert.equal((await request('/appointments/'+reservation.token+'/reschedule',{method:'POST',body:{barberId,serviceIds:['corte'],date:day,time:'14:00'}})).status,200);
 assert.equal((await request('/admin/appointments/'+reservation.id,{method:'PUT',admin:true,body:{status:'completed',notes:'Concluído'}})).status,200);
 const created=await request('/admin/services',{method:'POST',admin:true,body:{name:'Descartável',description:'Teste de exclusão',price:1000,duration:15,kind:'individual',items:[],image:'',active:false,position:99}});assert.equal(created.status,201);assert.equal((await request('/admin/services/'+created.data.id,{method:'DELETE',admin:true})).status,200);assert.equal((await request('/admin/services/corte',{method:'DELETE',admin:true})).status,409);
 const providerBefore=await db.prepare('SELECT provider_data FROM sessions WHERE csrf=?').get(csrf);const {unseal}=await import('../server/supabase-auth.mjs');const tokens=unseal(providerBefore.provider_data);
 assert.equal((await request('/admin/logout',{method:'POST',admin:true})).status,200);assert.equal((await request('/admin/session',{admin:true})).status,401);
 const retry=await fetch(process.env.TEST_SUPABASE_AUTH_URL+'/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:tokens.refresh_token})});assert.equal(retry.ok,false);
});
