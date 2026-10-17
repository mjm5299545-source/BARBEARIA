import {ConfigurationError} from './errors.mjs';

export const supabaseMode = () => !!process.env.SUPABASE_URL || process.env.VERCEL === '1';
const localTest = url => process.env.NODE_ENV === 'test' && ['127.0.0.1','localhost'].includes(url.hostname);
export function authConfiguration() {
  let url;
  try { url = new URL(process.env.SUPABASE_URL); } catch { throw new ConfigurationError('Configure SUPABASE_URL com a URL do projeto exclusivo da Grecco.'); }
  if (!localTest(url) && (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname))) throw new ConfigurationError('Use a URL HTTPS oficial do projeto Supabase exclusivo da Grecco.');
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!localTest(url) && (!ref || url.hostname !== `${ref}.supabase.co`)) throw new ConfigurationError('SUPABASE_PROJECT_REF precisa corresponder ao projeto exclusivo da Grecco.');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new ConfigurationError('Configure SUPABASE_PUBLISHABLE_KEY no servidor. Não é necessária uma chave service_role.');
  if(!localTest(url)&&!key.startsWith('sb_publishable_')){
    let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;}catch{}
    if(role!=='anon')throw new ConfigurationError('Use a chave publicável ou anon do Supabase, nunca service_role ou secret key.');
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.SESSION_ENCRYPTION_KEY || '')) throw new ConfigurationError('Configure SESSION_ENCRYPTION_KEY com 32 bytes aleatórios em hexadecimal (64 caracteres).');
  return {url:url.origin, key, ref};
}
export function authConfigured() { try { authConfiguration(); return true; } catch { return false; } }
export function checkProjectDatabase(connection) {
  const {ref} = authConfiguration();
  if (localTest(connection)) return;
  const user = decodeURIComponent(connection.username);
  if(connection.hostname.endsWith('.pooler.supabase.com')&&connection.port!=='5432')throw new ConfigurationError('Use o Supabase Session pooler na porta 5432 para preservar transações e o schema privado.');
  if (!(connection.hostname === `db.${ref}.supabase.co` || (connection.hostname.endsWith('.pooler.supabase.com') && user.endsWith(`.${ref}`)))) throw new ConfigurationError('DATABASE_URL não corresponde ao projeto Supabase indicado para a Grecco. Nenhuma alteração foi executada.');
  if (process.env.DATABASE_MIGRATING !== '1' && !/^grecco_backend(?:\.|$)/.test(user)) throw new ConfigurationError('Use o usuário restrito grecco_backend na conexão da aplicação. A conta postgres é exclusiva das migrations.');
}
