// Understands candidate answers. Every parser returns { ok: true, values } with candidate fields
// to save, or { ok: false } when the answer is unclear and the question must be asked again.

const clean = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/['’`]/g, '').replace(/[.,!?¿¡;:"()*_~]/g, ' ').replace(/\s+/g, ' ').trim();

const YES = new Set([
  'yes', 'y', 'yeah', 'yea', 'yep', 'yup', 'yes please', 'sure', 'ok', 'okay', 'oke', 'oké', 'of course', 'correct', 'right', 'true', 'agree', 'i agree',
  'ja', 'jaa', 'jazeker', 'jawel', 'klopt', 'zeker', 'akkoord', 'ja hoor', 'ja graag', 'ja klopt', 'natuurlijk', 'prima', 'goed',
  'tak', 'da', 'sí', 'si', 'oui', 'evet', 'igen', 'ano', 'áno', 'так', 'да', 'نعم', 'aha', 'po', 'jah', 'taip', 'jā', 'sim', 'ναι', 'ja tak',
  '👍', '✅', '✔️', '👌',
]);
const NO = new Set([
  'no', 'n', 'nope', 'nah', 'not', 'no thanks', 'none', 'never', 'false', 'i dont', 'i do not', 'not yet', 'no i dont', 'no i do not',
  'nee', 'neen', 'nee hoor', 'niet', 'geen', 'nog niet', 'nee dank je', 'nee bedankt', 'nooit', 'helaas niet',
  'nie', 'nu', 'non', 'hayır', 'hayir', 'nem', 'ne', 'ні', 'нет', 'не', 'لا', 'nein', 'não', 'nao', 'όχι', 'nie mam',
  '👎', '❌', '✖️',
]);
const NEGATION = /\b(no|not|dont|do not|havent|have not|never|nee|niet|geen|nie|nein|non)\b/;
const POSITIVE = /\b(yes|i have|i do|i got|ja|ik heb|heb ik|tak|da|oui)\b/;

export function parseYesNo(text) {
  const s = clean(text);
  if (!s) return null;
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  const first = s.split(' ')[0];
  if (YES.has(first)) return true;
  if (NO.has(first)) return false;
  if (NEGATION.test(s)) return false;
  if (POSITIVE.test(s)) return true;
  return null;
}

const HELP_EXACT = new Set(['what', 'wat', 'huh', 'help', 'pardon', 'sorry what', 'explain', 'uitleg', 'hulp', 'eh', 'hä', 'ha']);
const HELP_PREFIX = ['what do you mean', 'what does', 'what is', 'whats', 'what s', 'wat bedoel', 'wat is', 'wat betekent', 'hoe bedoel', 'can you explain', 'kun je uitleggen'];
const HELP_CONTAINS = ['dont understand', 'do not understand', 'not understand', 'didnt understand', 'snap het niet', 'begrijp het niet',
  'begrijp niet', 'snap niet', 'begrijp ik niet', 'snap ik niet', 'nie rozumiem', 'nu inteleg', 'nu înțeleg', 'explain'];

export function isHelpRequest(text) {
  const raw = String(text || '').trim();
  if (/^\?+$/.test(raw)) return true;
  const s = clean(raw);
  if (!s) return false;
  const words = s.split(' ').length;
  if (words > 8) return false; // long answers are real answers
  if (HELP_EXACT.has(s)) return true;
  if (HELP_PREFIX.some((h) => s === h || s.startsWith(`${h} `))) return true;
  if (HELP_CONTAINS.some((h) => s.includes(h))) return true;
  return raw.endsWith('?') && words <= 6;
}

const DUTCH_WORDS = new Set(['ja', 'nee', 'ik', 'ben', 'heb', 'hebben', 'geen', 'niet', 'woon', 'wil', 'werk', 'graag', 'hallo', 'hoi', 'goedemorgen',
  'goedemiddag', 'goedenavond', 'bedankt', 'dank', 'je', 'jij', 'wel', 'een', 'het', 'mijn', 'zoek', 'zoeken', 'baan', 'naar', 'met', 'klopt', 'oké', 'alsjeblieft']);
const ENGLISH_WORDS = new Set(['yes', 'no', 'i', 'am', 'have', 'the', 'my', 'job', 'work', 'looking', 'for', 'hello', 'hi', 'please', 'thanks', 'thank', 'you', 'is', 'a', 'want']);

// Detects whether a message is written in Dutch. Returns 'nl', 'en' or null (not sure).
export function detectLanguage(text) {
  const words = clean(text).split(' ').filter(Boolean);
  if (!words.length) return null;
  let nl = 0;
  let en = 0;
  for (const w of words) { if (DUTCH_WORDS.has(w)) nl += 1; if (ENGLISH_WORDS.has(w)) en += 1; }
  if (words.length <= 2 && ['ja', 'nee', 'hoi', 'hallo', 'goedemorgen', 'goedemiddag', 'klopt'].includes(words[0])) return 'nl';
  if (nl >= 2 && nl > en) return 'nl';
  if (en >= 2 && en > nl) return 'en';
  return null;
}

// Explicit language change requests such as "Nederlands graag" or "English please".
export function parseLanguageSwitch(text) {
  const s = clean(text);
  if (/^(in )?(het )?(nederlands|dutch|nl)( please| alstublieft| alsjeblieft| graag| aub)?$/.test(s)) return 'nl';
  if (/^(in )?(english|engels)( please| alstublieft| alsjeblieft| graag| aub)$/.test(s) || /^in (english|engels)$/.test(s)) return 'en';
  return null;
}

export function isJobInterest(text) {
  return /\b(job|jobs|work|working|vacancy|vacancies|werk|baan|vacature|vacatures|praca|pracy|munca|loc de munca)\b/.test(clean(text));
}

function looksLikeText(s, min = 2) {
  const c = String(s || '').trim();
  return c.length >= min && /\p{L}/u.test(c) && parseYesNo(c) === null;
}

const titleCase = (s) => s.replace(/\s+/g, ' ').trim().split(' ')
  .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

export function parseName(text) {
  let s = String(text || '').trim()
    .replace(/^(my name is|my name's|i am|i'm|im|name:|mijn naam is|ik ben|ik heet|naam:|nazywam się|mă numesc)\s*/i, '')
    .replace(/[.!]+$/, '').trim();
  if (!looksLikeText(s) || s.length > 100 || /\d{3,}/.test(s) || s.split(' ').length > 6) return { ok: false };
  return { ok: true, values: { full_name: titleCase(s) } };
}

function toIsoDate(d, m, y) {
  const year = y < 100 ? (y > 30 ? 1900 + y : 2000 + y) : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function findDate(s) {
  let m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

export function parseAge(text, now = new Date()) {
  const s = String(text || '');
  const dob = findDate(s);
  if (dob) {
    const d = new Date(dob);
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age -= 1;
    if (age >= 14 && age <= 100) return { ok: true, values: { date_of_birth: dob, age } };
    return { ok: false };
  }
  const nums = (s.match(/\b\d{1,3}\b/g) || []).map(Number).filter((n) => n >= 14 && n <= 100);
  if (nums.length === 1) return { ok: true, values: { age: nums[0] } };
  const year = s.match(/\b(19[3-9]\d|20[01]\d)\b/);
  if (year) {
    const age = now.getUTCFullYear() - Number(year[1]);
    if (age >= 14 && age <= 100) return { ok: true, values: { age } };
  }
  return { ok: false };
}

export function parseFreeText(field, max = 200) {
  return (text) => {
    const s = String(text || '').trim();
    if (!looksLikeText(s) || s.length > max) return { ok: false };
    return { ok: true, values: { [field]: s } };
  };
}

export function parseNationality(text) {
  const s = String(text || '').trim().replace(/^(i am|i'm|im|ik ben|my nationality is|mijn nationaliteit is)\s+/i, '').replace(/[.!]+$/, '');
  if (!looksLikeText(s) || s.length > 60) return { ok: false };
  return { ok: true, values: { nationality: titleCase(s) } };
}

const COUNTRIES = {
  netherlands: 'Netherlands', nederland: 'Netherlands', holland: 'Netherlands', 'the netherlands': 'Netherlands', nl: 'Netherlands',
  belgium: 'Belgium', belgië: 'Belgium', belgie: 'Belgium', germany: 'Germany', duitsland: 'Germany', deutschland: 'Germany',
  poland: 'Poland', polen: 'Poland', polska: 'Poland', romania: 'Romania', roemenië: 'Romania', roemenie: 'Romania', românia: 'Romania',
  bulgaria: 'Bulgaria', bulgarije: 'Bulgaria', hungary: 'Hungary', hongarije: 'Hungary', lithuania: 'Lithuania', latvia: 'Latvia',
  slovakia: 'Slovakia', czechia: 'Czech Republic', 'czech republic': 'Czech Republic', portugal: 'Portugal', spain: 'Spain', spanje: 'Spain',
  italy: 'Italy', italië: 'Italy', greece: 'Greece', griekenland: 'Greece', turkey: 'Turkey', turkije: 'Turkey', türkiye: 'Turkey',
  ukraine: 'Ukraine', oekraïne: 'Ukraine', oekraine: 'Ukraine', syria: 'Syria', syrië: 'Syria', syrie: 'Syria', morocco: 'Morocco', marokko: 'Morocco',
  france: 'France', frankrijk: 'France', 'united kingdom': 'United Kingdom', uk: 'United Kingdom', england: 'United Kingdom',
  india: 'India', philippines: 'Philippines', filipijnen: 'Philippines', eritrea: 'Eritrea', afghanistan: 'Afghanistan', iraq: 'Iraq', irak: 'Iraq',
};

export function parseLocation(text) {
  let s = String(text || '').trim()
    .replace(/^(i live in|i am living in|i'm living in|i'm in|i am in|im in|in|ik woon in|ik woon|ik zit in|woon in)\s+/i, '')
    .replace(/[.!]+$/, '').trim();
  if (!looksLikeText(s) || s.length > 120) return { ok: false };
  const parts = s.split(/\s*(?:,|\s-\s|\/|\bin\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  let city = null;
  let country = null;
  for (const p of parts) {
    const c = COUNTRIES[p.toLowerCase()];
    if (c && !country) country = c; else if (!city) city = titleCase(p);
  }
  if (!city && !country) return { ok: false };
  if (city && !country) {
    // "Breda Netherlands" without comma
    const words = city.split(' ');
    const last = COUNTRIES[words[words.length - 1].toLowerCase()];
    if (words.length > 1 && last) { country = last; city = words.slice(0, -1).join(' '); }
  }
  const values = {};
  if (city) values.current_city = city;
  if (country) values.current_country = country;
  return { ok: true, values };
}

export const yesNoField = (field) => (text) => {
  const v = parseYesNo(text);
  return v === null ? { ok: false } : { ok: true, values: { [field]: v } };
};

export function parseEnglish(text) {
  const s = clean(text);
  if (/\b(fluent|fluently|very good|perfect|native|excellent|vloeiend|heel goed|uitstekend|perfect)\b/.test(s)) return { ok: true, values: { english_level: 'fluent' } };
  if (/\b(a little|little|a bit|bit|basic|some|not so good|not very good|not good|so so|beetje|een beetje|matig|redelijk|basis|slecht|weinig)\b/.test(s)) return { ok: true, values: { english_level: 'basic' } };
  if (/\b(good|well|yes i do|i do|goed|ja goed)\b/.test(s)) return { ok: true, values: { english_level: 'good' } };
  const yn = parseYesNo(text);
  if (yn === true) return { ok: true, values: { english_level: 'good' } };
  if (yn === false) return { ok: true, values: { english_level: 'none' } };
  return { ok: false };
}

const EXPERIENCE_WORDS = /\b(warehouse|magazijn|production|productie|factory|fabriek|order ?pick\w*|picking|packing|inpakken|loading|laden|logistic\w*|logistiek|forklift|heftruck|reach ?truck|assembly|montage|operator)\b/;

export function parseExperience(text) {
  const raw = String(text || '').trim();
  const s = clean(raw);
  const yn = parseYesNo(raw);
  const mentions = EXPERIENCE_WORDS.test(s);
  const isLong = s.split(' ').length >= 3;
  if (yn === false && !mentions) return { ok: true, values: { has_experience: false } };
  if (yn === true || mentions) {
    const values = { has_experience: true };
    if (isLong || mentions) values.work_experience = raw.slice(0, 2000);
    return { ok: true, values };
  }
  if (isLong && looksLikeText(raw, 8)) return { ok: true, values: { has_experience: true, work_experience: raw.slice(0, 2000) } };
  return { ok: false };
}

export function parseCertificates(text) {
  const s = clean(text);
  const forklift = /\b(forklift|fork lift|heftruck|vorkheftruck|wózek widłowy|wozek|stivuitor|counterbalance|heftrucks)\b/.test(s);
  const ept = /\b(ept|e p t|pallet ?truck|pallettruck|elektrische pallet\w*|electric pallet\w*|palletwagen)\b/.test(s);
  const reach = /\b(reach ?truck|reachtruck|reach)\b/.test(s);
  const all = /\b(all|all of them|alle|allemaal|all three|alle drie)\b/.test(s);
  if (all) return { ok: true, values: { forklift: true, ept: true, reach_truck: true } };
  if (forklift || ept || reach) {
    // "no forklift but EPT yes" is rare; we accept mentioned certificates as owned.
    if (/^(no|nee|geen|not)\b/.test(s) && !/\b(but|maar|only|alleen)\b/.test(s)) return { ok: true, values: { forklift: false, ept: false, reach_truck: false } };
    return { ok: true, values: { forklift, ept, reach_truck: reach } };
  }
  const yn = parseYesNo(text);
  if (yn === false) return { ok: true, values: { forklift: false, ept: false, reach_truck: false } };
  if (yn === true) return { ok: false, clarify: 'which_certificates' };
  return { ok: false };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseAvailability(text, now = new Date()) {
  const raw = String(text || '').trim();
  const s = clean(raw);
  if (!s || s.length > 200) return { ok: false };
  const today = now.toISOString().slice(0, 10);
  let from = null;
  if (/\b(now|immediately|right now|asap|today|anytime|any time|direct|meteen|nu|vandaag|per direct|zo snel mogelijk|altijd|od razu|teraz|imediat|acum)\b/.test(s)) from = today;
  else if (/\b(tomorrow|morgen)\b/.test(s)) from = addDays(now, 1);
  else if (/\b(next week|volgende week|komende week)\b/.test(s)) {
    const day = now.getUTCDay();
    from = addDays(now, ((8 - day) % 7) || 7);
  } else if (/\b(next month|volgende maand)\b/.test(s)) {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  } else {
    from = findDate(raw);
    if (!from) {
      const m = raw.match(/\b(\d{1,2})[-/.](\d{1,2})\b/);
      if (m) {
        let candidate = toIsoDate(Number(m[1]), Number(m[2]), now.getUTCFullYear());
        if (candidate && candidate < today) candidate = toIsoDate(Number(m[1]), Number(m[2]), now.getUTCFullYear() + 1);
        from = candidate;
      }
    }
  }
  if (!from) {
    // Any meaningful answer is saved as text, e.g. "in two weeks", "after my holiday".
    if (parseYesNo(raw) !== null || !/\p{L}|\d/u.test(raw) || s.length < 3) return { ok: false };
    return { ok: true, values: { availability: raw } };
  }
  return { ok: true, values: { availability: raw, available_from: from } };
}

export const PARSERS = {
  full_name: parseName,
  age: parseAge,
  nationality: parseNationality,
  location: parseLocation,
  has_bsn: yesNoField('has_bsn'),
  english_level: parseEnglish,
  driving_licence: yesNoField('driving_licence'),
  own_car: yesNoField('own_car'),
  has_experience: parseExperience,
  certificates: parseCertificates,
  availability: parseAvailability,
  desired_job: parseFreeText('desired_job', 300),
};

// Is this question already answered for this candidate?
export function isAnswered(key, c) {
  switch (key) {
    case 'age': return c.age !== null && c.age !== undefined;
    case 'location': return !!(c.current_city || c.current_country);
    case 'certificates': return c.forklift !== null && c.forklift !== undefined
      && c.ept !== null && c.ept !== undefined && c.reach_truck !== null && c.reach_truck !== undefined;
    case 'availability': return !!(c.availability || c.available_from);
    default: return c[key] !== null && c[key] !== undefined && c[key] !== '';
  }
}

// Splits a reply to the numbered question list into separate answers.
// Works with one answer per line ("1. Anna\n2. 28") and on one line ("1. Anna 2. 28 3) Polish").
// Returns [{ n, answer }] with 1 <= n <= max.
export function splitNumbered(text, max) {
  const s = String(text || '');
  const marker = /(?:^|[\s,;])(\d{1,2})\s?[.):](?=\s|$)/g;
  const found = [];
  for (const m of s.matchAll(marker)) {
    const n = Number(m[1]);
    if (n < 1 || n > max) continue;
    found.push({ n, start: m.index, end: m.index + m[0].length });
  }
  const out = [];
  found.forEach((f, i) => {
    const next = found[i + 1];
    const answer = s.slice(f.end, next ? next.start : s.length).replace(/^[\s,;]+|[\s,;]+$/g, '');
    if (answer && !out.some((o) => o.n === f.n)) out.push({ n: f.n, answer });
  });
  return out;
}
