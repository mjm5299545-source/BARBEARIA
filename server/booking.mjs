import {db,settings,allServices,allBarbers,uid} from './db.mjs';
import {randomToken,hashToken} from './security.mjs';
export class Problem extends Error{constructor(message,status=400){super(message);this.status=status;}}
export const localDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function validDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export const stamp=(date,time)=>new Date(`${date}T${time}:00-03:00`).toISOString();
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export const clock=m=>`${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
export function selectedServices(ids){if(!Array.isArray(ids)||!ids.length||ids.length>12||new Set(ids).size!==ids.length)throw new Problem('Escolha pelo menos um serviço, sem repetir.');const rows=allServices().filter(s=>ids.includes(s.id)&&s.active);if(rows.length!==ids.length||rows.some(s=>!s.configured))throw new Problem('Este serviço ainda não está disponível para agendamento.');const components=rows.flatMap(s=>s.kind==='combo'?s.items:[s.id]);if(new Set(components).size!==components.length)throw new Problem('O combo já inclui um dos serviços selecionados.');return rows;}
function barberFor(id,services){const barber=allBarbers().find(b=>b.id===id&&b.active);if(!barber||services.some(s=>!barber.services.includes(s.id)))throw new Problem('Escolha um profissional disponível para esses serviços.');return barber;}
export function availability(date,barberId,ids,exclude=null,manual=false){
 const config=settings();if(!manual&&!config.onlineEnabled)return [];
 if(!validDate(date))throw new Problem('Informe uma data válida.');
 const services=selectedServices(ids),barber=barberFor(barberId,services);
 const now=Date.now(),duration=services.reduce((n,s)=>n+s.duration,0),buffer=config.bufferMinutes;
 const day=new Date(date+'T12:00:00Z').getUTCDay(),slots=[];
 const busy=db.prepare("SELECT start,end FROM appointments WHERE barber_id=? AND status IN ('confirmed','completed') AND id!=? UNION ALL SELECT start,end FROM time_blocks WHERE barber_id=?").all(barberId,exclude||'',barberId);
 for(const h of barber.hours.filter(h=>h.day===day))for(let t=minutes(h.start);t+duration+buffer<=minutes(h.end);t+=config.slotMinutes){
  const start=stamp(date,clock(t)),end=new Date(Date.parse(start)+(duration+buffer)*60000).toISOString();
  if(Date.parse(start)<now+(manual?0:config.minNoticeMinutes*60000)||Date.parse(start)>now+config.maxDays*86400000)continue;
  if(!busy.some(b=>start<b.end&&end>b.start))slots.push({time:clock(t),start,end:new Date(Date.parse(start)+duration*60000).toISOString()});
 }
 return slots.sort((a,b)=>a.start.localeCompare(b.start)).filter((x,i,a)=>!i||x.start!==a[i-1].start);
}
export function book(input,{manual=false,exclude=null}={}){
 db.exec('BEGIN IMMEDIATE');try{
 const config=settings();if(!manual&&!config.onlineEnabled)throw new Problem('O agendamento online ainda não foi habilitado. Entre em contato ou consulte a localização.',409);
 if(exclude){const existing=db.prepare('SELECT status,start FROM appointments WHERE id=?').get(exclude);if(!existing||existing.status!=='confirmed')throw new Problem('Este agendamento não pode mais ser alterado.',409);if(!manual&&Date.parse(existing.start)-Date.now()<config.cancelHours*3600000)throw new Problem('O prazo para alteração pelo site terminou.',409);}
 const services=selectedServices(input.serviceIds),slots=availability(input.date,input.barberId,input.serviceIds,exclude,manual),slot=slots.find(s=>s.time===input.time);
 if(!slot)throw new Problem('Esse horário não está mais disponível. Escolha outro horário.',409);
 const now=new Date().toISOString(),total=services.every(s=>s.price!==null)?services.reduce((n,s)=>n+s.price,0):null;
 const storedEnd=new Date(Date.parse(slot.end)+config.bufferMinutes*60000).toISOString();
 if(exclude){db.prepare('UPDATE appointments SET barber_id=?,services=?,start=?,end=?,total=?,status=?,updated_at=? WHERE id=?').run(input.barberId,JSON.stringify(services.map(s=>({id:s.id,name:s.name,duration:s.duration,price:s.price}))),slot.start,storedEnd,total,'confirmed',now,exclude);db.exec('COMMIT');return {id:exclude};}
 const token=randomToken(),id=uid(),reference='GR-'+randomToken().slice(0,8).toUpperCase();
 db.prepare('INSERT INTO appointments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,reference,hashToken(token),input.customer,input.phone,input.barberId,JSON.stringify(services.map(s=>({id:s.id,name:s.name,duration:s.duration,price:s.price}))),slot.start,storedEnd,total,'confirmed',manual?(input.source||'manual'):'site',input.notes||'',now,now);
 db.exec('COMMIT');return {id,reference,token,start:slot.start,total};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
