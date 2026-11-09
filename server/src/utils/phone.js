// Normalises phone numbers to the WhatsApp "wa_id" format: digits only, with country code, no "+".
// Examples (default country 31): "06 1234 5678" -> "31612345678", "+48 600 100 200" -> "48600100200".
export function normalizePhone(input, defaultCountryCode = '31') {
  if (!input) return '';
  let s = String(input).trim();
  const hasPlus = s.startsWith('+');
  let d = s.replace(/\D/g, '');
  if (!d) return '';
  if (hasPlus) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return `${defaultCountryCode}${d.slice(1)}`;
  return d;
}

export function isValidPhone(normalized) {
  return /^\d{8,15}$/.test(normalized);
}

export function formatPhone(normalized) {
  return normalized ? `+${normalized}` : '';
}
