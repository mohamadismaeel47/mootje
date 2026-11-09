// Usage: npm run create-admin -- "Name" email@example.com "StrongPassword123"
import bcrypt from 'bcryptjs';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- "Name" email@example.com "Password (min 10 chars)"');
  process.exit(1);
}
await migrate();
await pool.query(
  `INSERT INTO users(name, email, password_hash, role) VALUES ($1,$2,$3,'admin')
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', active = true`,
  [name, email.toLowerCase(), await bcrypt.hash(password, 12)],
);
console.log(`Admin account ready for ${email}`);
await pool.end();
