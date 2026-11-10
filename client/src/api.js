// Small wrapper around fetch. The session cookie is httpOnly, so no token is ever stored in the browser.
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(method, url, body, { form } = {}) {
  const headers = { 'x-crm-client': '1' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) onUnauthorized();
    const msg = (data && data.error) || `Verzoek mislukt (${res.status})`;
    throw new ApiError(data?.hint ? `${msg} — ${data.hint}` : msg, res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  upload: (url, file, extra = {}) => {
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return request('POST', url, undefined, { form });
  },
};

export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== undefined && v !== null) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const STATUS_LABELS = {
  new: 'Nieuw',
  contacted: 'Benaderd',
  information_requested: 'Informatie gevraagd',
  information_complete: 'Informatie compleet',
  available: 'Beschikbaar',
  sent_to_agency: 'Naar bureau gestuurd',
  interview: 'Sollicitatiegesprek',
  placed: 'Geplaatst',
  rejected: 'Afgewezen',
  not_interested: 'Geen interesse',
};
export const STATUSES = Object.keys(STATUS_LABELS);

export const ENGLISH_LABELS = { none: 'Geen', basic: 'Basis', good: 'Goed', fluent: 'Vloeiend' };

export const fmtPhone = (p) => (p ? `+${p}` : '');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '');
export const yesNo = (v) => (v === true ? 'Ja' : v === false ? 'Nee' : '—');
