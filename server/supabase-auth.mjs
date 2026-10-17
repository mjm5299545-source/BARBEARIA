import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {authConfiguration} from './auth-config.mjs';
import {Problem} from './booking.mjs';
import {ConfigurationError} from './errors.mjs';

// Provider credentials stay server-side, encrypted at rest. The browser receives
// only the opaque, HttpOnly application session cookie.
export function seal(value) {
  authConfiguration();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.SESSION_ENCRYPTION_KEY,'hex'), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');
}
export function unseal(value) {
  authConfiguration();
  try {
    const bytes = Buffer.from(value,'base64'), decipher = createDecipheriv('aes-256-gcm',Buffer.from(process.env.SESSION_ENCRYPTION_KEY,'hex'),bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
  } catch { throw new Problem('Sua sessão terminou. Entre novamente.',401); }
}
async function request(route,{token,body,method='GET'}={}) {
  const {url,key} = authConfiguration();
  let response;
  try { response = await fetch(`${url}/auth/v1${route}`,{method,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)}); }
  catch { throw new ConfigurationError('Não foi possível conectar à autenticação. Tente novamente em instantes.'); }
  if (!response.ok) {
    // Never forward provider messages, passwords, tokens or arbitrary response bodies.
    if (response.status === 429) throw new Problem('Muitas tentativas de acesso. Aguarde antes de tentar novamente.',429);
    if (response.status >= 500) throw new ConfigurationError('O serviço de autenticação está indisponível. Tente novamente.');
    throw new Problem('Credenciais inválidas ou sessão encerrada. Confira seu acesso.',401);
  }
  return response.status === 204 ? null : response.json();
}
export async function signIn(email,password) {
  const data = await request('/token?grant_type=password',{method:'POST',body:{email,password}});
  if (!data.user?.id || !data.user.email_confirmed_at || !data.access_token || !data.refresh_token) throw new Problem('Confirme o e-mail da conta antes de entrar.',401);
  return data;
}
export const refresh = refresh_token => request('/token?grant_type=refresh_token',{method:'POST',body:{refresh_token}});
export const getUser = access_token => request('/user',{token:access_token});
export const signOut = access_token => request('/logout?scope=local',{method:'POST',token:access_token});
