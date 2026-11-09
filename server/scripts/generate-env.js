// Creates a .env file in the project root with strong random secrets.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) {
  console.log('.env already exists - nothing changed.');
  process.exit(0);
}
let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
text = text
  .replace('JWT_SECRET=', `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`)
  .replace('ENCRYPTION_KEY=', `ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`)
  .replace('WHATSAPP_VERIFY_TOKEN=', `WHATSAPP_VERIFY_TOKEN=${crypto.randomBytes(18).toString('hex')}`);
fs.writeFileSync(target, text, { mode: 0o600 });
console.log('.env created with random secrets. Keep this file private and make a backup of ENCRYPTION_KEY.');
