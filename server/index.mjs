import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { db, settings, allServices, allBarbers, uid, ConfigurationError, databaseConfigured, isVercel } from './db.mjs';
import { hashToken, randomToken, verifyPassword, safeImage, passwordHash, secureEqual } from './security.mjs';
import { Problem, availability, book, validDate, localDate } from './booking.mjs';
import {supabaseMode,authConfigured} from './auth-config.mjs';
import * as provider from './supabase-auth.mjs';
import {pendingPublicData} from './defaults.mjs';
import {uploadsDir,uploadsConfigured,storeImage,isBlobUrl} from './storage.mjs';
export const app = express();
if (process.env.TRUST_PROXY === '1' || isVercel)
    app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:', 'https://*.public.blob.vercel-storage.com'], connectSrc: process.env.NODE_ENV === 'production' ? ["'self'"] : ["'self'", 'ws:'], frameSrc: ['https://www.google.com'], objectSrc: ["'none'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null } }, strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method))
        return next();
    const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (req.get('origin') && req.get('origin') !== expected)
        return next(new Problem('Origem da solicitação não permitida.', 403));
    if (!req.get('origin') && req.get('sec-fetch-site') === 'cross-site')
        return next(new Problem('Solicitação não permitida.', 403));
    next();
});
function limit(count,minutes){return async(req,res,next)=>{
 const now=Date.now(),until=now+minutes*60000;
 const key=hashToken(req.ip+'|'+req.route.path);
 const row=await db.prepare(`INSERT INTO request_limits(key,window_until,count) VALUES(?,?,1)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_limits.window_until<? THEN 1 ELSE request_limits.count+1 END,
 window_until=CASE WHEN request_limits.window_until<? THEN ? ELSE request_limits.window_until END RETURNING count,window_until`).get(key,until,now,now,until);
 if(Number(row.count)>count){res.set('Retry-After',String(Math.max(1,Math.ceil((Number(row.window_until)-now)/1000))));throw new Problem('Muitas tentativas. Aguarde alguns minutos e tente novamente.',429);}
 if(Math.random()<0.02)await db.prepare('DELETE FROM request_limits WHERE window_until<?').run(now-3600000);
 next();
};}
const text = (max = 200) => z.string().trim().min(1).max(max);
const image = z.string().max(200).refine(safeImage, 'Use uma imagem enviada pelo painel.');
const phone = z.string().transform(s => s.replace(/\D/g, '')).refine(s => /^\d{10,15}$/.test(s), 'Informe um telefone com DDD válido.');
const bookingSchema = z.object({ customer: text(100), phone, barberId: text(80), serviceIds: z.array(text(80)).min(1).max(12), date: z.string().refine(validDate), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), consent: z.literal(true), notes: z.string().max(2000).optional(), source: z.enum(['manual', 'whatsapp']).optional() });
const serviceSchema = z.object({ name: text(80), description: text(500), price: z.number().int().min(0).max(1000000).nullable(), duration: z.number().int().min(5).max(480), featured: z.boolean().default(false), kind: z.enum(['individual', 'combo']), items: z.array(text(80)).max(12), image, active: z.boolean(), position: z.number().int().min(0).max(10000) });
const schedule = z.object({ day: z.number().int().min(0).max(6), start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).refine(v => v.start < v.end, 'O fim deve ser depois do início.');
const barberSchema = z.object({ name: text(80), active: z.boolean(), services: z.array(text(80)).max(100), photo: image.default(''), hours: z.array(schedule).max(35) });
const settingsSchema = z.object({ brand: text(50), latitude: z.number().min(-90).max(90).default(-10.216057), longitude: z.number().min(-180).max(180).default(-36.8375574), heroTitle: text(150), primaryCta: text(40).default('Agendar meu horário'), secondaryCta: text(40).default('Conhecer os serviços'), heroSubtitle: text(500), aboutTitle: text(150), aboutText: text(3000), address: text(200), city: text(100), postcode: text(20), whatsapp: z.string().max(20).refine(s => !s || /^\d{12,15}$/.test(s), 'Use DDI + DDD + número, somente dígitos.'), phone: z.string().max(25), instagram: z.string().max(100).refine(s => !s || /^[a-zA-Z0-9_.]{1,30}$/.test(s), 'Informe apenas o usuário do Instagram.'), privacyContact: z.string().max(150), hoursLabel: text(300), onlineEnabled: z.boolean(), minNoticeMinutes: z.number().int().min(0).max(10080), maxDays: z.number().int().min(1).max(365), cancelHours: z.number().int().min(0).max(168), bufferMinutes: z.number().int().min(0).max(120), slotMinutes: z.number().int().min(5).max(60), retentionDays: z.number().int().min(30).max(3650), accent: z.enum(['#C6A45E', '#B9985A', '#D4B97B']), heroImage: image, logo: image, contentProvisional: z.boolean() });
function cookie(req) { const raw = req.headers.cookie?.split(';').find(s => s.trim().startsWith('grecco_session='))?.trim().slice(15); return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null; }
async function auth(req,res,next) {
 const token=cookie(req);
 if(!token)throw new Problem('Entre no painel para continuar.',401);
 try {
  req.admin=await db.transaction(async()=>{
   const session=await db.prepare('SELECT sessions.*,users.email,users.role,users.auth_user_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND expires>?'+(process.env.DATABASE_URL?' FOR UPDATE OF sessions':'')).get(hashToken(token),Date.now());
   if(!session||session.role!=='admin')throw new Problem('Sua sessão terminou. Entre novamente.',401);
   if(!['GET','HEAD'].includes(req.method)&&req.get('x-csrf-token')!==session.csrf)throw new Problem('Sessão inválida. Entre novamente.',403);
   if(supabaseMode()) {
    if(!session.provider_data||!session.auth_user_id)throw new Problem('Entre novamente com sua conta Supabase.',401);
    let credentials=provider.unseal(session.provider_data);
    if(Number(session.provider_expires)<=Date.now()+60000) {
     const updated=await provider.refresh(credentials.refresh_token);
     if(updated.user?.id!==session.auth_user_id)throw new Problem('Sessão inválida.',401);
     credentials={access_token:updated.access_token,refresh_token:updated.refresh_token};
     session.provider_data=provider.seal(credentials);
     session.provider_expires=Date.now()+updated.expires_in*1000;
     await db.prepare('UPDATE sessions SET provider_data=?,provider_expires=? WHERE id=?').run(session.provider_data,session.provider_expires,session.id);
    }
    const identity=await provider.getUser(credentials.access_token);
    if(identity.id!==session.auth_user_id||!identity.email_confirmed_at)throw new Problem('Seu acesso não está mais disponível.',401);
   }
   return session;
  });
 } catch(error) {
  if(error.status===401){await db.prepare('DELETE FROM sessions WHERE id=?').run(hashToken(token));setCookie(res,'',0);}
  throw error;
 }
 next();
}
function setCookie(res, value, age) { res.cookie('grecco_session', value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: age, path: '/' }); }
async function publicPayload(config) { config??=await settings(); return { settings: config, services: (await allServices()).filter(s => s.active), barbers: (await allBarbers()).filter(b => b.active).map(({ id, name, services, photo }) => ({ id, name, services, photo })), gallery: await db.prepare('SELECT * FROM gallery_images ORDER BY position,id').all() }; }
app.get('/api/public', async (_,res)=>res.json(databaseConfigured()?await publicPayload():pendingPublicData()));
app.get('/api/availability', limit(150, 5), async (req, res) => res.json(await availability(String(req.query.date || ''), String(req.query.barber || ''), String(req.query.services || '').split(',').filter(Boolean), req.get('x-booking-token') ? (await findAppointment(req.get('x-booking-token'))).id : null)));
app.post('/api/appointments', limit(15, 30), async (req, res) => res.status(201).json(await book(bookingSchema.parse(req.body))));
async function findAppointment(token,lock=false) { if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    throw new Problem('Link de agendamento inválido.', 404); const a = await db.prepare('SELECT * FROM appointments WHERE token_hash=?'+(lock&&process.env.DATABASE_URL?' FOR UPDATE':'')).get(hashToken(token)); if (!a)
    throw new Problem('Agendamento não encontrado.', 404); return a; }
async function publicAppointment(a) { const { customer, phone, notes, token_hash, customer_id, ...safe } = a; return { ...safe, services: JSON.parse(a.services), barber: (await db.prepare('SELECT name FROM barbers WHERE id=?').get(a.barber_id))?.name }; }
async function canChange(a) { if (a.status !== 'confirmed')
    throw new Problem('Este agendamento não pode mais ser alterado.', 409); if (Date.parse(a.start) - Date.now() < (await settings()).cancelHours * 3600000)
    throw new Problem('O prazo para alteração pelo site terminou. Entre em contato com a barbearia.', 409); }
app.get('/api/appointments/:token', limit(60, 5), async (req, res) => res.json(await publicAppointment(await findAppointment(req.params.token))));
app.post('/api/appointments/:token/cancel', limit(15, 30), async (req, res) => { await db.transaction(async()=>{const a = await findAppointment(req.params.token,true); await canChange(a); await db.prepare("UPDATE appointments SET status='cancelled',updated_at=? WHERE id=?").run(new Date().toISOString(), a.id);}); res.json({ ok: true }); });
app.post('/api/appointments/:token/reschedule', limit(15, 30), async (req, res) => { const a = await findAppointment(req.params.token); await canChange(a); const data = bookingSchema.parse({ ...req.body, customer: a.customer, phone: a.phone, consent: true }); await book(data, { exclude: a.id }); res.json(await publicAppointment(await findAppointment(req.params.token))); });
async function startSession(user,res,credentials){
 const token=randomToken(),csrf=randomToken();
 await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
 await db.prepare('INSERT INTO sessions(id,user_id,csrf,expires,provider_data,provider_expires) VALUES(?,?,?,?,?,?)').run(hashToken(token),user.id,csrf,Date.now()+8*3600000,credentials?provider.seal({access_token:credentials.access_token,refresh_token:credentials.refresh_token}):null,credentials?Date.now()+credentials.expires_in*1000:null);
 setCookie(res,token,8*3600000);return {email:user.email,csrf};
}
app.post('/api/login',limit(8,15),async(req,res)=>{
 const input=z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).parse(req.body);
 if(supabaseMode()) {
  const credentials=await provider.signIn(input.email,input.password);
  const user=await db.prepare("SELECT * FROM users WHERE auth_user_id=? AND role='admin'").get(credentials.user.id);
  if(!user)throw new Problem('Esta conta não possui acesso administrativo à Grecco.',403);
  return res.json(await startSession(user,res,credentials));
 }
 const user=await db.prepare('SELECT * FROM users WHERE email=?').get(input.email.toLowerCase());
 const dummy='92fae1f087e89f312ff4ff0e7175d395:0e3864ebc0c06118f9d5f151fe28caefac407f787bd511f73e890e11b377d7e0a376de2862736a3c22333446af2e86f74b0be0d2ce874c89e0bbe735c3e78485';
 const valid=verifyPassword(input.password,user?.password||dummy);
 if(!user||!valid)throw new Problem('E-mail ou senha incorretos.',401);
 res.json(await startSession(user,res));
});
app.get('/api/setup/status',async(_,res)=>{
 const configured=databaseConfigured();
 const required=configured?!(await db.prepare("SELECT id FROM users WHERE role='admin'"+(supabaseMode()?' AND auth_user_id IS NOT NULL':'')+' LIMIT 1').get()):true;
 res.json({configured,required,authProvider:supabaseMode()?'supabase':'local',authConfigured:!supabaseMode()||authConfigured(),setupKeyConfigured:!!process.env.SETUP_TOKEN&&process.env.SETUP_TOKEN.length>=32,uploadsConfigured:uploadsConfigured()});
});
app.post('/api/setup',limit(5,30),async(req,res)=>{
 const configured=process.env.SETUP_TOKEN,supplied=req.get('x-setup-token');
 if(!configured||configured.length<32||!supplied||!secureEqual(configured,supplied))throw new Problem('Chave de configuração inválida. Confira a variável protegida SETUP_TOKEN do projeto.',403);
 const input=z.object({email:z.email().max(254),password:z.string().min(12,'Use pelo menos 12 caracteres na senha.').max(256)}).parse(req.body);
 const credentials=supabaseMode()?await provider.signIn(input.email,input.password):null;
 const user={id:uid(),email:credentials?credentials.user.email.toLowerCase():input.email.toLowerCase()};
 await db.transaction(async()=>{
  await db.lockSetup();
  if(await db.prepare("SELECT id FROM users WHERE role='admin'"+(supabaseMode()?' AND auth_user_id IS NOT NULL':'')+' LIMIT 1').get())throw new Problem('O primeiro acesso já foi configurado. Entre com sua conta.',409);
  if(credentials){
   const existing=await db.prepare('SELECT id FROM users WHERE email=?').get(user.email);
   if(existing){user.id=existing.id;await db.prepare("UPDATE users SET auth_user_id=?,password='',role='admin' WHERE id=?").run(credentials.user.id,user.id);}
   else await db.prepare('INSERT INTO users(id,email,password,role,auth_user_id) VALUES(?,?,?,?,?)').run(user.id,user.email,'','admin',credentials.user.id);
  } else await db.prepare('INSERT INTO users(id,email,password,role) VALUES(?,?,?,?)').run(user.id,user.email,passwordHash(input.password),'admin');
 });res.status(201).json(await startSession(user,res,credentials));
});
app.get('/api/admin/session', auth, (req, res) => res.json({ email: req.admin.email, csrf: req.admin.csrf }));
app.post('/api/admin/logout', auth, async (req, res) => { if(supabaseMode()){try{await provider.signOut(provider.unseal(req.admin.provider_data).access_token);}finally{await db.prepare('DELETE FROM sessions WHERE id=?').run(req.admin.id);setCookie(res,'',0);}} else await db.prepare('DELETE FROM sessions WHERE id=?').run(req.admin.id); setCookie(res, '', 0); res.json({ ok: true }); });
app.get('/api/admin/data', auth, async (_, res) => res.json({ ...await publicPayload(), services: await allServices(), barbers: await allBarbers(), blocks: await db.prepare('SELECT * FROM time_blocks ORDER BY start').all(), appointments: (await db.prepare('SELECT * FROM appointments ORDER BY start DESC LIMIT 5000').all()).map(a => ({ ...a, token_hash: undefined, services: JSON.parse(a.services) })), draft: JSON.parse((await db.prepare('SELECT value FROM content_draft WHERE id=1').get())?.value || 'null') }));
app.get('/api/admin/metrics',auth,async(_,res)=>{
 const today=localDate(),tomorrow=localDate(new Date(Date.now()+86400000));
 const totals=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN start>=? AND start<? AND status!='cancelled' THEN 1 ELSE 0 END) today,SUM(CASE WHEN start>? AND status='confirmed' THEN 1 ELSE 0 END) upcoming,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM appointments").get(new Date(today+'T00:00:00-03:00').toISOString(),new Date(tomorrow+'T00:00:00-03:00').toISOString(),new Date().toISOString());
 const next=(await db.prepare("SELECT * FROM appointments WHERE status='confirmed' AND start>? ORDER BY start LIMIT 5").all(new Date().toISOString())).map(({token_hash,...a})=>({...a,services:JSON.parse(a.services)}));
 const popular=await Promise.all((await allServices()).map(async s=>{const match=process.env.DATABASE_URL?"EXISTS(SELECT 1 FROM jsonb_array_elements(appointments.services::jsonb) item WHERE item->>'id'=?)":"EXISTS(SELECT 1 FROM json_each(appointments.services) item WHERE json_extract(item.value,'$.id')=?)";const count=Number((await db.prepare("SELECT COUNT(*) n FROM appointments WHERE status!='cancelled' AND "+match).get(s.id)).n);return {...s,count};}));
 res.json({...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Number(v)||0])),next,popular:popular.sort((a,b)=>b.count-a.count)});
});
app.get('/api/admin/customers',auth,async(req,res)=>{
 const query=String(req.query.q||'').trim().slice(0,100),page=Math.max(0,Math.min(10000,Math.trunc(Number(req.query.page))||0));
 const term='%'+query.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')+'%';
 const where="LOWER(c.name) LIKE LOWER(?) ESCAPE '!' OR c.phone LIKE ? ESCAPE '!'";
 const total=Number((await db.prepare('SELECT COUNT(*) n FROM customers c WHERE '+where).get(term,term)).n);
 const customers=await db.prepare('SELECT c.*,COUNT(a.id) appointments,MAX(a.start) last_appointment FROM customers c LEFT JOIN appointments a ON a.customer_id=c.id WHERE '+where+' GROUP BY c.id ORDER BY c.name,c.id LIMIT 50 OFFSET ?').all(term,term,page*50);
 res.json({customers,total,page});
});
app.get('/api/admin/customers/:id',auth,async(req,res)=>{
 const customer=await db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
 if(!customer)throw new Problem('Cliente não encontrado.',404);
 const appointments=(await db.prepare('SELECT * FROM appointments WHERE customer_id=? ORDER BY start DESC LIMIT 1000').all(customer.id)).map(({token_hash,...a})=>({...a,services:JSON.parse(a.services)}));
 res.json({customer,appointments});
});
app.put('/api/admin/customers/:id',auth,async(req,res)=>{
 const value=z.object({name:text(100),phone}).parse(req.body);
 if(!await db.prepare('SELECT id FROM customers WHERE id=?').get(req.params.id))throw new Problem('Cliente não encontrado.',404);
 if(await db.prepare('SELECT id FROM customers WHERE phone=? AND id!=?').get(value.phone,req.params.id))throw new Problem('Este telefone já pertence a outro cadastro. Confira os dados antes de alterar.',409);
 await db.prepare('UPDATE customers SET name=?,phone=?,updated_at=? WHERE id=?').run(value.name,value.phone,new Date().toISOString(),req.params.id);
 res.json({ok:true});
});
app.delete('/api/admin/services/:id',auth,async(req,res)=>{
 const id=req.params.id;
 await db.transaction(async()=>{
 if(process.env.DATABASE_URL)await db.prepare('SELECT id FROM services WHERE id=? FOR UPDATE').get(id);
 if(!await db.prepare('SELECT id FROM services WHERE id=?').get(id))throw new Problem('Serviço não encontrado.',404);
 const used=(await allServices()).some(s=>s.items.includes(id))||(await allBarbers()).some(b=>b.services.includes(id));
 const history=await db.prepare('SELECT id FROM appointments WHERE services LIKE ? LIMIT 1').get('%'+JSON.stringify(id)+'%');
 if(used||history)throw new Problem('Este serviço possui vínculos ou histórico. Desative-o para preservar os registros.',409);
 await db.prepare('DELETE FROM services WHERE id=?').run(id);});res.json({ok:true});
});
app.post('/api/admin/services', auth, async (req, res) => { const s = serviceSchema.parse(req.body), id = uid(); await validateCombo(s, id); await db.prepare('INSERT INTO services(id,name,description,price,duration,kind,items,image,active,position,configured,featured) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)').run(id, s.name, s.description, s.price, s.duration, s.kind, JSON.stringify(s.items), s.image, Number(s.active), s.position, Number(s.featured)); res.status(201).json({ id }); });
async function validateCombo(s,id){
 const services=await allServices();
 if(s.kind==='combo'&&(new Set(s.items).size!==s.items.length||!s.items.length||s.items.includes(id)||s.items.some(item=>!services.some(x=>x.id===item&&x.kind==='individual'))))throw new Problem('Selecione os serviços individuais incluídos no combo.');
}
app.put('/api/admin/services/:id', auth, async (req, res) => { const s = serviceSchema.parse(req.body); await validateCombo(s, req.params.id); if (!await db.prepare('SELECT id FROM services WHERE id=?').get(req.params.id))
    throw new Problem('Serviço não encontrado.', 404); await db.prepare('UPDATE services SET name=?,description=?,price=?,duration=?,kind=?,items=?,image=?,active=?,position=?,configured=1,featured=? WHERE id=?').run(s.name, s.description, s.price, s.duration, s.kind, JSON.stringify(s.items), s.image, Number(s.active), s.position, Number(s.featured), req.params.id); res.json({ ok: true }); });
async function saveBarber(req,res,id){
 const b=barberSchema.parse(req.body),services=await allServices();
 if(b.services.some(s=>!services.some(x=>x.id===s)))throw new Problem('Serviço inválido.');
 for(let i=0;i<b.hours.length;i++)for(let j=i+1;j<b.hours.length;j++)if(b.hours[i].day===b.hours[j].day&&b.hours[i].start<b.hours[j].end&&b.hours[i].end>b.hours[j].start)throw new Problem('Há períodos de trabalho sobrepostos.');
 await db.transaction(async()=>{
  await db.lockBarbers([id]);
  await db.prepare('INSERT INTO barbers(id,name,services,active,photo) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,services=excluded.services,active=excluded.active,photo=excluded.photo').run(id,b.name,JSON.stringify(b.services),Number(b.active),b.photo);
  await db.prepare('DELETE FROM working_hours WHERE barber_id=?').run(id);
  for(const h of b.hours)await db.prepare('INSERT INTO working_hours(id,barber_id,day,start,end) VALUES(?,?,?,?,?)').run(uid(),id,h.day,h.start,h.end);
 });
 res.json({id});
}
app.post('/api/admin/barbers', auth, (req, res) => saveBarber(req, res, uid()));
app.put('/api/admin/barbers/:id', auth, (req, res) => saveBarber(req, res, req.params.id));
app.post('/api/admin/blocks',auth,async(req,res)=>{
 const b=z.object({barberId:text(80),start:z.iso.datetime(),end:z.iso.datetime(),reason:z.string().max(500)}).parse(req.body);
 b.start=new Date(b.start).toISOString();b.end=new Date(b.end).toISOString();
 const id=uid();
 await db.transaction(async()=>{
  await db.lockBarbers([b.barberId]);
  if(b.start>=b.end||!(await allBarbers()).some(x=>x.id===b.barberId))throw new Problem('Informe um período e profissional válidos.');
  if(await db.prepare("SELECT id FROM appointments WHERE barber_id=? AND status IN ('confirmed','completed') AND start<? AND end>?").get(b.barberId,b.end,b.start))throw new Problem('Há agendamentos neste período. Remarque ou cancele antes de bloquear.',409);
  await db.prepare('INSERT INTO time_blocks(id,barber_id,start,end,reason) VALUES(?,?,?,?,?)').run(id,b.barberId,b.start,b.end,b.reason);
 });res.status(201).json({id});
});
app.delete('/api/admin/blocks/:id', auth, async (req, res) => { await db.prepare('DELETE FROM time_blocks WHERE id=?').run(req.params.id); res.json({ ok: true }); });
app.get('/api/admin/availability', auth, async (req, res) => res.json(await availability(String(req.query.date || ''), String(req.query.barber || ''), String(req.query.services || '').split(',').filter(Boolean), typeof req.query.exclude === 'string' ? req.query.exclude : null, true)));
app.post('/api/admin/appointments', auth, async (req, res) => res.status(201).json(await book(bookingSchema.parse(req.body), { manual: true })));
app.put('/api/admin/appointments/:id', auth, async (req, res) => { const a = await db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id); if (!a)
    throw new Problem('Agendamento não encontrado.', 404); if (req.body.date) {
    if (a.status !== 'confirmed')
        throw new Problem('Somente reservas confirmadas podem ser remarcadas.');
    const b = bookingSchema.parse({ ...req.body, customer: a.customer, phone: a.phone, consent: true });
    await book(b, { exclude: a.id, manual: true });
}
else {
    const b = z.object({ status: z.enum(['confirmed', 'cancelled', 'completed']), notes: z.string().max(2000) }).parse(req.body);
    if (b.status === 'confirmed' && a.status !== 'confirmed')
        throw new Problem('Para reativar uma reserva, crie um novo agendamento e verifique a disponibilidade.');
    await db.prepare('UPDATE appointments SET status=?,notes=?,updated_at=? WHERE id=?').run(b.status, b.notes, new Date().toISOString(), a.id);
} res.json({ ok: true }); });
async function validateSettings(value) { if (value.onlineEnabled && (!(await allServices()).some(s => s.active && s.configured) || !(await allBarbers()).some(b => b.active && b.hours.length && b.services.length)))
    throw new Problem('Antes de habilitar, configure e salve os serviços, um profissional e o expediente.'); return value; }
app.put('/api/admin/settings', auth, async (req, res) => { const s = await validateSettings(settingsSchema.parse(req.body)); await db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(s)); res.json({ ok: true }); });
const contentKeys = ['heroTitle', 'heroSubtitle', 'aboutTitle', 'aboutText', 'heroImage', 'logo', 'accent', 'contentProvisional', 'primaryCta', 'secondaryCta'];
async function mergeContent(value) { return { ...await settings(), ...Object.fromEntries(contentKeys.map(k => [k, value[k]])) }; }
app.put('/api/admin/content-draft', auth, async (req, res) => { const s = await mergeContent(settingsSchema.parse(req.body)); await db.prepare('INSERT INTO content_draft VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(s)); res.json(await publicPayload(s)); });
app.post('/api/admin/content-publish', auth, async (req, res) => { const draft = await db.prepare('SELECT value FROM content_draft WHERE id=1').get(); if (!draft)
    throw new Problem('Salve uma prévia antes de publicar.'); const s = await validateSettings(settingsSchema.parse(await mergeContent(JSON.parse(draft.value)))); await db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(s)); await db.prepare('DELETE FROM content_draft WHERE id=1').run(); res.json({ ok: true }); });
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))});
app.post('/api/admin/upload',auth,upload.single('image'),async(req,res)=>{
 if(!req.file)throw new Problem('Envie uma imagem JPG, PNG ou WebP de até 4 MB.');
 if(!uploadsConfigured())throw new ConfigurationError('Conecte Vercel Blob ao projeto para enviar fotos.');
 let buffer;try{buffer=await sharp(req.file.buffer,{limitInputPixels:40000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{throw new Problem('Não foi possível processar a imagem. Use JPG, PNG ou WebP válido.');}
 res.json({url:await storeImage(buffer)});
});
app.post('/api/admin/gallery', auth, async (req, res) => { const s = z.object({ url: image.refine(Boolean), alt: text(200), position: z.number().int().min(0).max(10000) }).parse(req.body); const id = uid(); await db.prepare('INSERT INTO gallery_images VALUES(?,?,?,?)').run(id, s.url, s.alt, s.position); res.status(201).json({ id }); });
app.put('/api/admin/gallery/:id', auth, async (req, res) => { const s = z.object({ alt: text(200), position: z.number().int().min(0).max(10000) }).parse(req.body); await db.prepare('UPDATE gallery_images SET alt=?,position=? WHERE id=?').run(s.alt, s.position, req.params.id); res.json({ ok: true }); });
app.delete('/api/admin/gallery/:id', auth, async (req, res) => { await db.prepare('DELETE FROM gallery_images WHERE id=?').run(req.params.id); res.json({ ok: true }); });
app.post('/api/admin/retention', auth, async (_, res) => {
 const before=new Date(Date.now()-(await settings()).retentionDays*86400000).toISOString();
 const count=await db.transaction(async()=>{
  const result=await db.prepare("UPDATE appointments SET customer='Dados removidos',phone='',notes='',customer_id=NULL WHERE end<? AND status IN ('cancelled','completed') AND phone!=''").run(before);
  await db.prepare('DELETE FROM customers WHERE NOT EXISTS(SELECT 1 FROM appointments WHERE appointments.customer_id=customers.id)').run();
  return Number(result.changes);
 });res.json({count});
});
app.get('/api/health', async (_, res) => { await db.prepare('SELECT 1').get(); res.json({ ok: true, timezone: 'America/Sao_Paulo' }); });
app.get('/uploads/:filename',async(req,res,next)=>{
 if(!/^[a-f0-9-]{36}\.webp$/.test(req.params.filename))return res.sendStatus(404);
 if(databaseConfigured()){
  const asset=await db.prepare('SELECT url FROM media_assets WHERE id=?').get(req.params.filename);
  if(asset&&isBlobUrl(asset.url)){res.set('Cache-Control','public, max-age=31536000, immutable');return res.redirect(302,asset.url);}
 }
 if(isVercel)return res.sendStatus(404);next();
});
if(!isVercel)app.use('/uploads',express.static(uploadsDir,{immutable:true,maxAge:'1y',setHeaders:res=>res.set('X-Content-Type-Options','nosniff')}));
app.get('/robots.txt', (_, res) => res.type('text').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /reserva\nDisallow: /api/\n'));
app.get('/sitemap.xml', (req, res) => { const origin = process.env.APP_ORIGIN; if (!origin)
    return res.status(503).type('text').send('Configure APP_ORIGIN para gerar o sitemap do domínio publicado.'); res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</loc></url></urlset>`); });
app.use('/api', (_, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
if (!isVercel && existsSync('dist/index.html')) {
    app.use(express.static('dist', { maxAge: '1h' }));
    app.get('/{*path}', (_, res) => res.sendFile(path.resolve('dist/index.html')));
}
app.use((err, req, res, _next) => { if (err instanceof z.ZodError)
    return res.status(400).json({ error: err.issues[0]?.message || 'Revise os dados informados.' }); if (err instanceof Problem)
    return res.status(err.status).json({ error: err.message }); if (err instanceof multer.MulterError)
    return res.status(400).json({ error: 'A imagem deve ter até 4 MB.' }); if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Dados inválidos.' }); if(err instanceof ConfigurationError)return res.status(503).json({error:err.message,code:err.code});if(err.code==='23505')return res.status(409).json({error:'Este registro já existe. Atualize a página e confira os dados.'});if(err.code==='23P01')return res.status(409).json({error:'Esse horário não está mais disponível. Escolha outro horário.'});console.error('Falha interna:',err.code||'erro inesperado'); res.status(500).json({ error: 'Não foi possível concluir. Tente novamente.' }); });
if (process.env.NODE_ENV !== 'test' && !isVercel)
    app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log(`Grecco API iniciada na porta ${process.env.PORT || 3001}`));
