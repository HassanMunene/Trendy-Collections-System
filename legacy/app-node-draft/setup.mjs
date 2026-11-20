import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openDb } from './db.mjs';
import { hashPassword } from './security.mjs';

const db = openDb();
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.log('Owner already exists. Sign in and create more users in the app.');
  process.exit(0);
}
const rl = createInterface({ input: stdin, output: stdout });
try {
  const username = (await rl.question('Owner username: ')).trim();
  const name = (await rl.question('Owner display name: ')).trim();
  const password = await rl.question('Owner password (10+ characters; terminal input is visible): ');
  if (!username || !name) throw new Error('Username and display name are required');
  db.prepare("INSERT INTO users(username,name,role,password_hash) VALUES (?,?, 'owner', ?)")
    .run(username, name, hashPassword(password));
  console.log('Owner account created. Run npm start and sign in.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rl.close(); db.close(); }
