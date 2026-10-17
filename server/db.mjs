import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync,mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {initial,seedServices} from './defaults.mjs';

export class ConfigurationError extends Error {
  constructor(message='Conecte um banco PostgreSQL ao projeto da Vercel e configure DATABASE_URL.') {
    super(message); this.code='SETUP_REQUIRED'; this.status=503;
  }
}
export const dataDir=path.resolve(process.env.DATA_DIR||'data');
export const isVercel=process.env.VERCEL==='1';
export const databaseConfigured=()=>!!process.env.DATABASE_URL||!isVercel;
export const databaseKind=process.env.DATABASE_URL?'postgres':'sqlite';
const context=new AsyncLocalStorage();
let initPromise,pool,sqlite;
let queue=Promise.resolve();
function exclusive(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
const schema=process.env.DATABASE_SCHEMA||'grecco';
if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new ConfigurationError('DATABASE_SCHEMA inválido.');

// Preserve SQL strings and comments while adapting placeholders and reserved column names.
function postgresSQL(source){
 let n=0;
 return source.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|\b(?:start|end)\b/g,part=>part==='?'?'$'+(++n):/^(start|end)$/.test(part)?'"'+part+'"':part);
}
function normalize(row){if(!row)return row;return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString():v]));}
async function executeRaw(sql,params=[],client){
 if(databaseKind==='postgres'){
  const result=await (client||context.getStore()||pool).query(postgresSQL(sql),params);
  return {rows:(result.rows||[]).map(normalize),changes:result.rowCount||0};
 }
 const execute=()=>{
  const statement=sqlite.prepare(sql);
  if(statement.columns().length)return {rows:statement.all(...params),changes:sqlite.prepare('SELECT changes() n').get().n};
  const result=statement.run(...params);return {rows:[],changes:Number(result.changes)};
 };
 return context.getStore()?execute():exclusive(execute);
}
async function initialize(){
 if(!databaseConfigured())throw new ConfigurationError();
 if(databaseKind==='postgres'){
  const {Pool}=await import('pg');
  let url;try{url=new URL(process.env.DATABASE_URL);}catch{throw new ConfigurationError('DATABASE_URL precisa ser uma conexão PostgreSQL válida.');}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new ConfigurationError('Use uma conexão PostgreSQL em DATABASE_URL.');
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(!local&&['disable','allow','prefer'].includes(url.searchParams.get('sslmode')))throw new ConfigurationError('O banco externo exige TLS com verificação de certificado.');
  for(const key of ['sslcert','sslkey','sslrootcert'])if(url.searchParams.has(key))throw new ConfigurationError('Configure certificados personalizados em PG_CA_CERT, sem opções TLS na URL.');
  url.searchParams.delete('sslmode');url.searchParams.delete('uselibpqcompat');
  pool=new Pool({connectionString:url.toString(),max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true,options:`-c search_path=${schema},public`,ssl:local?false:{rejectUnauthorized:true,...(process.env.PG_CA_CERT?{ca:process.env.PG_CA_CERT}:{})}});
  pool.on('error',()=>console.error('Conexão PostgreSQL interrompida.'));
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['grecco-database-migrations']);
   await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
   const installed=(await client.query("SELECT to_regclass('schema_migrations') AS name")).rows[0].name;
   const version=installed&&(await client.query('SELECT version FROM schema_migrations WHERE version=1')).rows.length;
   if(!version){
    // Migration is trusted, versioned SQL. Do not transform its PL/pgSQL keywords.
    await client.query(readFileSync(new URL('../migrations/postgres.sql',import.meta.url),'utf8'));
    await seed(client);
    await client.query('INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING');
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }else{
  const {DatabaseSync}=await import('node:sqlite');
  mkdirSync(dataDir,{recursive:true,mode:0o700});sqlite=new DatabaseSync(path.join(dataDir,'grecco.sqlite'));chmodSync(path.join(dataDir,'grecco.sqlite'),0o600);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sqlite.exec(readFileSync(new URL('../migrations/sqlite.sql',import.meta.url),'utf8'));
  if(!sqlite.prepare('PRAGMA table_info(services)').all().some(c=>c.name==='featured'))sqlite.exec('ALTER TABLE services ADD COLUMN featured INTEGER NOT NULL DEFAULT 0');
  if(!sqlite.prepare('PRAGMA table_info(barbers)').all().some(c=>c.name==='photo'))sqlite.exec("ALTER TABLE barbers ADD COLUMN photo TEXT NOT NULL DEFAULT ''");
  if(!sqlite.prepare('SELECT id FROM settings').get())await context.run(sqlite,()=>seed());
 }
}
async function seed(client){
 await executeRaw('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO NOTHING',[JSON.stringify(initial)],client);
 for(const s of seedServices)await executeRaw('INSERT INTO services(id,name,description,price,duration,kind,items,image,position) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',[s.id,s.name,s.description,s.price,s.duration,s.kind,JSON.stringify(s.items),s.image,s.position],client);
}
export async function ready(){if(!initPromise)initPromise=initialize().catch(async error=>{if(pool){await pool.end().catch(()=>{});pool=null;}initPromise=undefined;throw error;});return initPromise;}
export const db={
 prepare(sql){return {
  async all(...params){await ready();return (await executeRaw(sql,params)).rows;},
  async get(...params){await ready();return (await executeRaw(sql,params)).rows[0];},
  async run(...params){await ready();const result=await executeRaw(sql,params);return {changes:result.changes};}
 };},
 async transaction(fn){
  await ready();if(context.getStore())return fn();
  if(databaseKind==='postgres'){
   const client=await pool.connect();try{await client.query('BEGIN');const result=await context.run(client,fn);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  return exclusive(()=>context.run(sqlite,async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const result=await fn();sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}));
 },
 async lockBarbers(ids){if(databaseKind==='postgres')for(const id of [...new Set(ids)].sort())await this.prepare('SELECT id FROM barbers WHERE id=? FOR UPDATE').get(id);},
 async lockServices(ids){if(databaseKind==='postgres')for(const id of [...new Set(ids)].sort())await this.prepare('SELECT id FROM services WHERE id=? FOR SHARE').get(id);},
 async lockSettings(){if(databaseKind==='postgres')await this.prepare('SELECT id FROM settings WHERE id=1 FOR SHARE').get();},
 async lockSetup(){if(databaseKind==='postgres')await this.prepare("SELECT pg_advisory_xact_lock(hashtext('grecco-first-admin'))").get();},
 async close(){if(pool)await pool.end();if(sqlite)sqlite.close();},
 async backup(file){await ready();if(databaseKind!=='sqlite')throw new ConfigurationError('Use o backup gerenciado do PostgreSQL ou pg_dump; esse comando é exclusivo do SQLite local.');const {backup}=await import('node:sqlite');await backup(sqlite,file);},
 async dropTestSchema(){if(process.env.NODE_ENV!=='test'||!schema.startsWith('grecco_test_'))throw new Error('Remoção permitida apenas em schemas descartáveis de testes.');if(pool)await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}
};
export const uid=()=>crypto.randomUUID();
export const parseService=s=>({...s,items:JSON.parse(s.items),active:!!s.active,configured:!!s.configured,featured:!!s.featured});
export async function settings(){return {...initial,...JSON.parse((await db.prepare('SELECT value FROM settings WHERE id=1').get()).value)};}
export async function allServices(){return (await db.prepare('SELECT * FROM services ORDER BY position,name').all()).map(parseService);}
export async function allBarbers(){const rows=await db.prepare('SELECT * FROM barbers').all(),hours=await db.prepare('SELECT * FROM working_hours ORDER BY day,start').all();return rows.map(b=>({...b,active:!!b.active,services:JSON.parse(b.services),hours:hours.filter(h=>h.barber_id===b.id)}));}
