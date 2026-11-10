import ExcelJS from 'exceljs';

// Column definitions shared by export and import. `key` = database column.
export const SHEET_COLUMNS = [
  { key: 'full_name', header: 'Volledige naam', en: 'Full name' },
  { key: 'phone', header: 'Telefoon', en: 'Phone', format: (v) => (v ? `+${v}` : '') },
  { key: 'email', header: 'E-mail', en: 'Email' },
  { key: 'nationality', header: 'Nationaliteit', en: 'Nationality' },
  { key: 'current_country', header: 'Land', en: 'Country' },
  { key: 'current_city', header: 'Woonplaats', en: 'City' },
  { key: 'has_bsn', header: 'Heeft BSN', en: 'Has BSN', type: 'bool' },
  { key: 'date_of_birth', header: 'Geboortedatum', en: 'Date of birth' },
  { key: 'age', header: 'Leeftijd', en: 'Age', type: 'int' },
  { key: 'languages', header: 'Talen', en: 'Languages', type: 'list' },
  { key: 'english_level', header: 'Niveau Engels', en: 'English level' },
  { key: 'driving_licence', header: 'Rijbewijs', en: 'Driving licence', type: 'bool' },
  { key: 'own_car', header: 'Eigen auto', en: 'Own car', type: 'bool' },
  { key: 'forklift', header: 'Heftruckcertificaat', en: 'Forklift certificate', type: 'bool' },
  { key: 'ept', header: 'EPT-certificaat', en: 'EPT certificate', type: 'bool' },
  { key: 'reach_truck', header: 'Reachtruckcertificaat', en: 'Reach truck certificate', type: 'bool' },
  { key: 'has_experience', header: 'Ervaring magazijn/productie', en: 'Warehouse/production experience', type: 'bool' },
  { key: 'work_experience', header: 'Werkervaring', en: 'Work experience' },
  { key: 'previous_jobs', header: 'Vorige banen', en: 'Previous jobs' },
  { key: 'desired_job', header: 'Gewenst werk', en: 'Desired job' },
  { key: 'availability', header: 'Beschikbaarheid', en: 'Availability' },
  { key: 'available_from', header: 'Beschikbaar vanaf', en: 'Available from' },
  { key: 'status', header: 'Status', en: 'Status' },
  { key: 'notes', header: 'Notities', en: 'Notes' },
  { key: 'created_at', header: 'Inschrijfdatum', en: 'Registration date', exportOnly: true },
];

function cellOut(col, v) {
  if (v === null || v === undefined) return '';
  if (col.format) return col.format(v);
  if (col.type === 'bool') return v ? 'Ja' : 'Nee';
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
  const ws = wb.addWorksheet('Kandidaten');
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

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
const HEADER_ALIASES = {
  name: 'full_name', fullname: 'full_name', naam: 'full_name',
  phone: 'phone', phonenumber: 'phone', telefoon: 'phone', mobile: 'phone', whatsapp: 'phone',
  email: 'email', emailaddress: 'email', mail: 'email',
  nationality: 'nationality', nationaliteit: 'nationality',
  country: 'current_country', currentcountry: 'current_country', land: 'current_country',
  city: 'current_city', currentcity: 'current_city', woonplaats: 'current_city', plaats: 'current_city',
};
for (const c of SHEET_COLUMNS) { HEADER_ALIASES[norm(c.header)] = c.key; if (c.en) HEADER_ALIASES[norm(c.en)] = c.key; }

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
