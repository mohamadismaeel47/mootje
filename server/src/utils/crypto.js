import crypto from 'node:crypto';
import { config } from '../config.js';

const key = Buffer.from(config.encryptionKey, 'hex');

// AES-256-GCM. Output format: v1:<iv b64>:<tag b64>:<ciphertext b64>
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(payload) {
  if (!payload) return null;
  const [v, iv, tag, data] = String(payload).split(':');
  if (v !== 'v1') throw new Error('Unknown encryption format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export function mask(value, visible = 4) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= visible) return '•'.repeat(s.length);
  return `${'•'.repeat(Math.min(12, s.length - visible))}${s.slice(-visible)}`;
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
