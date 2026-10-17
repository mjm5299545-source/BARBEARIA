import {db,settings,allServices,allBarbers,uid} from './db.mjs';
import {randomToken,hashToken} from './security.mjs';
export class Problem extends Error{constructor(message,status=400){super(message);this.status=status;}}
export const localDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function validDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export const stamp=(date,time)=>new Date(`${date}T${time}:00-03:00`).toISOString();
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export const clock=m=>`${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
export async function selectedServices(ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>12||new Set(ids).size!==ids.length)throw new Problem('Escolha pelo menos um serviço, sem repetir.');
 const rows=(await allServices()).filter(s=>ids.includes(s.id)&&s.active);
 if(rows.length!==ids.length||rows.some(s=>!s.configured))throw new Problem('Este serviço ainda não está disponível para agendamento.');
 const components=rows.flatMap(s=>s.kind==='combo'?s.items:[s.id]);
 if(new Set(components).size!==components.length)throw new Problem('O combo já inclui um dos serviços selecionados.');return rows;
}
async function barberFor(id,services){const barber=(await allBarbers()).find(b=>b.id===id&&b.active);if(!barber||services.some(s=>!barber.services.includes(s.id)))throw new Problem('Escolha um profissional disponível para esses serviços.');return barber;}
export async function availability(date,barberId,ids,exclude=null,manual=false){
 const config=await settings();if(!manual&&!config.onlineEnabled)return [];
 if(!validDate(date))throw new Problem('Informe uma data válida.');
 const services=await selectedServices(ids),barber=await barberFor(barberId,services);
 const now=Date.now(),duration=services.reduce((n,s)=>n+s.duration,0),buffer=config.bufferMinutes;
 const day=new Date(date+'T12:00:00Z').getUTCDay(),slots=[];
 const busy=await db.prepare("SELECT start,end FROM appointments WHERE barber_id=? AND status IN ('confirmed','completed') AND id!=? UNION ALL SELECT start,end FROM time_blocks WHERE barber_id=?").all(barberId,exclude||'',barberId);
 for(const h of barber.hours.filter(h=>h.day===day))for(let t=minutes(h.start);t+duration+buffer<=minutes(h.end);t+=config.slotMinutes){
  const start=stamp(date,clock(t)),end=new Date(Date.parse(start)+(duration+buffer)*60000).toISOString();
  if(Date.parse(start)<now+(manual?0:config.minNoticeMinutes*60000)||Date.parse(start)>now+config.maxDays*86400000)continue;
  if(!busy.some(b=>start<b.end&&end>b.start))slots.push({time:clock(t),start,end:new Date(Date.parse(start)+duration*60000).toISOString()});
 }
 return slots.sort((a,b)=>a.start.localeCompare(b.start)).filter((x,i,a)=>!i||x.start!==a[i-1].start);
}
export async function book(input,{manual=false,exclude=null}={}){
 return db.transaction(async()=>{
  const previous=exclude?await db.prepare('SELECT barber_id FROM appointments WHERE id=?').get(exclude):null;
  await db.lockBarbers([input.barberId,...(previous?[previous.barber_id]:[])]);
  await db.lockServices(input.serviceIds);
  await db.lockSettings();
  const config=await settings();
  if(!manual&&!config.onlineEnabled)throw new Problem('O agendamento online ainda não foi habilitado. Entre em contato ou consulte a localização.',409);
  if(exclude){const existing=await db.prepare('SELECT status,start FROM appointments WHERE id=?').get(exclude);if(!existing||existing.status!=='confirmed')throw new Problem('Este agendamento não pode mais ser alterado.',409);if(!manual&&Date.parse(existing.start)-Date.now()<config.cancelHours*3600000)throw new Problem('O prazo para alteração pelo site terminou.',409);}
  const services=await selectedServices(input.serviceIds),slots=await availability(input.date,input.barberId,input.serviceIds,exclude,manual),slot=slots.find(s=>s.time===input.time);
  if(!slot)throw new Problem('Esse horário não está mais disponível. Escolha outro horário.',409);
  const now=new Date().toISOString(),total=services.every(s=>s.price!==null)?services.reduce((n,s)=>n+s.price,0):null;
  const storedEnd=new Date(Date.parse(slot.end)+config.bufferMinutes*60000).toISOString();
  const snapshot=JSON.stringify(services.map(s=>({id:s.id,name:s.name,duration:s.duration,price:s.price})));
  if(exclude){await db.prepare('UPDATE appointments SET barber_id=?,services=?,start=?,end=?,total=?,status=?,updated_at=? WHERE id=?').run(input.barberId,snapshot,slot.start,storedEnd,total,'confirmed',now,exclude);return {id:exclude};}
  const token=randomToken(),id=uid(),reference='GR-'+randomToken().slice(0,8).toUpperCase();
  await db.prepare('INSERT INTO appointments(id,reference,token_hash,customer,phone,barber_id,services,start,end,total,status,source,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,reference,hashToken(token),input.customer,input.phone,input.barberId,snapshot,slot.start,storedEnd,total,'confirmed',manual?(input.source||'manual'):'site',manual?(input.notes||''):'',now,now);
  return {id,reference,token,start:slot.start,total};
 });
}
