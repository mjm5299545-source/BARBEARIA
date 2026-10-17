import {supabaseMode} from '../server/auth-config.mjs';
if(supabaseMode()){console.error('No Supabase, crie a conta em Authentication → Users e autorize o primeiro acesso em /admin. Este comando é exclusivo do modo local.');process.exit(1);}
import { createInterface } from 'node:readline/promises';
import { db, uid } from '../server/db.mjs';
import { passwordHash } from '../server/security.mjs';
if (!process.stdin.isTTY) {
    console.error('Use um terminal interativo ou npm run admin:create com variáveis seguras.');
    process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('E-mail do administrador: ')).trim().toLowerCase();
rl.close();
function hidden(prompt) { return new Promise(resolve => { process.stdout.write(prompt); let answer = ''; process.stdin.setRawMode(true); process.stdin.resume(); const onData = chunk => { for (const char of chunk.toString()) {
    if (char === '\r' || char === '\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(answer);
        return;
    }
    if (char === '\u0003') {
        process.stdin.setRawMode(false);
        process.exit(130);
    }
    if (char === '\u007f' || char === '\b') {
        answer = answer.slice(0, -1);
    }
    else if (char >= ' ') {
        answer += char;
    }
} }; process.stdin.on('data', onData); }); }
const password = await hidden('Senha (mínimo 12 caracteres; entrada oculta): ');
const confirm = await hidden('Confirme a senha: ');
if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password !== confirm) {
    console.error('E-mail inválido, senha curta ou confirmação diferente. Nenhuma conta foi criada.');
    process.exit(1);
}
if (await db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
    console.error('Esse e-mail já está cadastrado.');
    process.exit(1);
}
await db.prepare('INSERT INTO users(id,email,password,role) VALUES(?,?,?,?)').run(uid(), email, passwordHash(password), 'admin');
console.log('Administrador criado. Entre em /admin com seu e-mail e senha.');

await db.close();
