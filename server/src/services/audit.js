import { query } from '../db/pool.js';

export async function audit(userId, action, entity, entityId, detail) {
  await query('INSERT INTO audit_log(user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)', [
    userId || null, action, entity || null, entityId || null, detail || null,
  ]);
}

export async function notify(type, title, body, link) {
  await query('INSERT INTO notifications(type, title, body, link) VALUES ($1,$2,$3,$4)', [type, title, body || null, link || null]);
}
