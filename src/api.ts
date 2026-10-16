export type Service={id:string;name:string;description:string;price:number|null;duration:number;featured?:boolean;kind:'individual'|'combo';items:string[];image:string;active:boolean;position:number;configured:boolean};
export type Hours={id?:string;day:number;start:string;end:string};
export type Barber={id:string;name:string;services:string[];active?:boolean;photo?:string;hours?:Hours[]};
export type Settings={brand:string;latitude:number;longitude:number;heroTitle:string;primaryCta:string;secondaryCta:string;heroSubtitle:string;aboutTitle:string;aboutText:string;address:string;city:string;postcode:string;whatsapp:string;phone:string;instagram:string;privacyContact:string;hoursLabel:string;onlineEnabled:boolean;minNoticeMinutes:number;maxDays:number;cancelHours:number;bufferMinutes:number;slotMinutes:number;retentionDays:number;accent:string;heroImage:string;logo:string;contentProvisional:boolean};
export type Gallery={id:string;url:string;alt:string;position:number};
export type Appointment={id:string;reference:string;customer:string;phone:string;barber_id:string;barber?:string;services:Service[];start:string;end:string;total:number|null;status:string;source:string;notes:string;created_at:string};
export type PublicData={settings:Settings;services:Service[];barbers:Barber[];gallery:Gallery[]};
export type AdminData=PublicData&{appointments:Appointment[];blocks:{id:string;barber_id:string;start:string;end:string;reason:string}[];draft:Settings|null};
export let csrf='';export const setCsrf=(s:string)=>{csrf=s;};
export async function api<T=any>(url:string,options:RequestInit={}):Promise<T>{const isForm=options.body instanceof FormData;const response=await fetch('/api'+url,{...options,headers:{...(!isForm&&options.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});const data=await response.json().catch(()=>({error:'O servidor não respondeu. Tente novamente.'}));if(!response.ok)throw new Error(data.error||'Não foi possível concluir.');return data;}
export const send=(method:string,body?:unknown):RequestInit=>({method,...(body!==undefined?{body:JSON.stringify(body)}:{})});
export const money=(n:number|null)=>n===null?'Consulte os valores':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export const dateLabel=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
export const dayKey=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const statusLabel:Record<string,string>={confirmed:'Confirmado',cancelled:'Cancelado',completed:'Concluído'};
export const mapsUrl='https://www.google.com/maps/dir/?api=1&destination=-10.216057,-36.8375574';
