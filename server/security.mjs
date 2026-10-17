import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
export const hashToken=x=>createHash('sha256').update(x).digest('hex');
export const randomToken=()=>randomBytes(32).toString('hex');
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password,hash){try{const [salt,key]=hash.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}catch{return false;}}
export const safeImage=x=>!x||/^\/images\/[a-zA-Z0-9._-]+$/.test(x)||/^\/uploads\/[a-zA-Z0-9._-]+\.webp$/.test(x);

export const secureEqual=(a,b)=>timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());
