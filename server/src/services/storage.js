import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { one, many } from '../db/pool.js';
import { badRequest } from '../utils/errors.js';

// Only document and image types that make sense for a CV.
export const ALLOWED_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/plain': '.txt',
};

export function isAllowedType(mime) {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, String(mime || '').split(';')[0].trim());
}

function cleanName(name) {
  return String(name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
}

// Files are stored outside the web root with a random name; they can only be
// downloaded through the authenticated /api/files endpoint.
export function filePath(storedName) {
  if (!/^[a-f0-9]{32}\.[a-z]{3,4}$/.test(storedName)) throw new Error('Invalid stored file name');
  return path.join(config.uploadDir, storedName);
}

export async function saveFile({ candidateId, buffer, originalName, mimeType, source = 'upload', userId = null, kind = 'cv' }) {
  const mime = String(mimeType || '').split(';')[0].trim();
  if (!isAllowedType(mime)) throw badRequest('Dit bestandstype is niet toegestaan. Gebruik PDF, Word, JPG of PNG.');
  if (buffer.length > config.maxUploadMb * 1024 * 1024) throw badRequest(`Bestand is groter dan ${config.maxUploadMb} MB`);
  const stored = `${crypto.randomBytes(16).toString('hex')}${ALLOWED_TYPES[mime]}`;
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.writeFile(filePath(stored), buffer, { mode: 0o600 });
  return one(
    `INSERT INTO candidate_files(candidate_id, kind, original_name, stored_name, mime_type, size_bytes, source, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [candidateId, kind, cleanName(originalName), stored, mime, buffer.length, source, userId],
  );
}

export async function deleteStoredFile(storedName) {
  try { await fs.unlink(filePath(storedName)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
}

export async function deleteCandidateFiles(candidateId) {
  const files = await many('SELECT stored_name FROM candidate_files WHERE candidate_id = $1', [candidateId]);
  for (const f of files) await deleteStoredFile(f.stored_name);
}
