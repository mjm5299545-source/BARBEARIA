import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {authConfiguration,checkProjectDatabase} from '../server/auth-config.mjs';
process.env.SUPABASE_URL='https://greccodedicated.supabase.co';process.env.SUPABASE_PROJECT_REF='greccodedicated';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_configuration_test';process.env.SESSION_ENCRYPTION_KEY=randomBytes(32).toString('hex');delete process.env.DATABASE_MIGRATING;
test('configuração rejeita outro projeto Supabase, conexão privilegiada e pool de transações',()=>{
 assert.equal(authConfiguration().ref,'greccodedicated');
 assert.throws(()=>checkProjectDatabase(new URL('postgresql://grecco_backend.otherproject@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')),/não corresponde/);
 assert.throws(()=>checkProjectDatabase(new URL('postgresql://grecco_backend@db.otherproject.supabase.co:5432/postgres')),/não corresponde/);
 assert.throws(()=>checkProjectDatabase(new URL('postgresql://postgres.greccodedicated@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')),/restrito/);
 assert.throws(()=>checkProjectDatabase(new URL('postgresql://grecco_backend.greccodedicated@aws-0-sa-east-1.pooler.supabase.com:6543/postgres')),/5432/);
 assert.doesNotThrow(()=>checkProjectDatabase(new URL('postgresql://grecco_backend.greccodedicated@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')));
});
test('configuração rejeita secret key e referência divergente antes de fazer qualquer consulta',()=>{
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_configuration_test';assert.throws(authConfiguration,/publicável/);process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_configuration_test';
 process.env.SUPABASE_PROJECT_REF='otherproject';assert.throws(authConfiguration,/corresponder/);
});
