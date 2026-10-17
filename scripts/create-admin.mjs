import { db, uid } from '../server/db.mjs';
import { passwordHash } from '../server/security.mjs';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(), password = process.env.ADMIN_PASSWORD;
if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 12) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres). Use variáveis seguras do ambiente; não salve a senha no repositório.');
    process.exit(1);
}
if (await db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
    console.error('Esse administrador já existe. Nenhuma alteração realizada.');
    process.exit(1);
}
await db.prepare('INSERT INTO users(id,email,password,role) VALUES(?,?,?,?)').run(uid(), email, passwordHash(password), 'admin');
console.log('Administrador criado com sucesso. Acesse /admin.');

await db.close();
