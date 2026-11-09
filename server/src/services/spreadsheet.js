import ExcelJS from 'exceljs';

// Column definitions shared by export and import. `key` = database column.
export const SHEET_COLUMNS = [
  { key: 'full_name', header: 'Full name' },
  { key: 'phone', header: 'Phone', format: (v) => (v ? `+${v}` : '') },
  { key: 'email', header: 'Email' },
  { key: 'nationality', header: 'Nationality' },
  { key: 'current_country', header: 'Country' },
  { key: 'current_city', header: 'City' },
  { key: 'has_bsn', header: 'Has BSN', type: 'bool' },
  { key: 'date_of_birth', header: 'Date of birth' },
  { key: 'age', header: 'Age', type: 'int' },
  { key: 'languages', header: 'Languages', type: 'list' },
  { key: 'english_level', header: 'English level' },
  { key: 'driving_licence', header: 'Driving licence', type: 'bool' },
  { key: 'own_car', header: 'Own car', type: 'bool' },
  { key: 'forklift', header: 'Forklift certificate', type: 'bool' },
  { key: 'ept', header: 'EPT certificate', type: 'bool' },
  { key: 'reach_truck', header: 'Reach truck certificate', type: 'bool' },
  { key: 'has_experience', header: 'Warehouse/production experience', type: 'bool' },
  { key: 'work_experience', header: 'Work experience' },
  { key: 'previous_jobs', header: 'Previous jobs' },
  { key: 'desired_job', header: 'Desired job' },
  { key: 'availability', header: 'Availability' },
  { key: 'available_from', header: 'Available from' },
  { key: 'status', header: 'Status' },
  { key: 'notes', header: 'Notes' },
  { key: 'created_at', header: 'Registration date', exportOnly: true },
];

function cellOut(col, v) {
  if (v === null || v === undefined) return '';
  if (col.format) return col.format(v);
  if (col.type === 'bool') return v ? 'Yes' : 'No';
  if (col.type === 'list') return (v || []).join(', ');
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

// Protect against CSV/Excel formula injection (cells starting with = + - @).
function safe(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^\+\d/.test(v)) return `'${v}`;
  return v;
}

export async function toXlsx(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Recruitment CRM';
  const ws = wb.addWorksheet('Candidates');
  ws.columns = SHEET_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A4A' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    const out = {};
    for (const c of SHEET_COLUMNS) out[c.key] = safe(cellOut(c, r[c.key]));
    ws.addRow(out);
  }
  return wb.xlsx.writeBuffer();
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(safe(v) ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [SHEET_COLUMNS.map((c) => esc(c.header)).join(',')];
  for (const r of rows) lines.push(SHEET_COLUMNS.map((c) => esc(cellOut(c, r[c.key]))).join(','));
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join('\r\n')}`;
}

export async function templateXlsx() {
  return toXlsx([]);
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const HEADER_ALIASES = {
  name: 'full_name', fullname: 'full_name', naam: 'full_name',
  phone: 'phone', phonenumber: 'phone', telefoon: 'phone', mobile: 'phone', whatsapp: 'phone',
  email: 'email', emailaddress: 'email', mail: 'email',
  nationality: 'nationality', nationaliteit: 'nationality',
  country: 'current_country', currentcountry: 'current_country', land: 'current_country',
  city: 'current_city', currentcity: 'current_city', woonplaats: 'current_city', plaats: 'current_city',
};
for (const c of SHEET_COLUMNS) HEADER_ALIASES[norm(c.header)] = c.key;

function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['yes', 'y', 'ja', 'j', 'true', '1', 'x'].includes(s)) return true;
  if (['no', 'n', 'nee', 'false', '0'].includes(s)) return false;
  return null;
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join('');
  }
  return String(v).trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  const delimiter = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Returns an array of plain objects with database keys. Unknown columns are ignored.
export async function parseUpload(buffer, filename) {
  let table;
  if (/\.csv$/i.test(filename)) {
    table = parseCsv(buffer.toString('utf8').replace(/^﻿/, ''));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    table = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = [];
      for (let i = 1; i <= ws.columnCount; i += 1) vals.push(cellText(r.getCell(i).value));
      table.push(vals);
    });
  }
  if (table.length < 2) return [];
  const keys = table[0].map((h) => HEADER_ALIASES[norm(h)] || null);
  const colByKey = Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, c]));
  return table.slice(1).map((cells) => {
    const obj = {};
    keys.forEach((key, i) => {
      if (!key || colByKey[key]?.exportOnly) return;
      const raw = cellText(cells[i]).replace(/^'/, '');
      if (raw === '') return;
      const col = colByKey[key];
      if (col?.type === 'bool') { const b = parseBool(raw); if (b !== null) obj[key] = b; }
      else if (col?.type === 'int') { const n = parseInt(raw, 10); if (!Number.isNaN(n)) obj[key] = n; }
      else if (col?.type === 'list') obj[key] = raw.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
      else if (key === 'english_level') {
        const s = raw.toLowerCase();
        obj[key] = ['none', 'basic', 'good', 'fluent'].includes(s) ? s : undefined;
      } else if (key === 'status') {
        obj[key] = raw.toLowerCase().replace(/\s+/g, '_');
      } else obj[key] = raw;
    });
    return obj;
  });
}
