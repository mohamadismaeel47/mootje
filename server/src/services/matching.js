import { many } from '../db/pool.js';

const LEVELS = ['none', 'basic', 'good', 'fluent'];
const LEVEL_LABEL = { none: 'geen Engels', basic: 'een beetje Engels', good: 'goed Engels', fluent: 'vloeiend Engels' };

function hasLanguage(candidate, lang) {
  const l = lang.trim().toLowerCase();
  if (l === 'english' || l === 'engels') return candidate.english_level && candidate.english_level !== 'none';
  return (candidate.languages || []).some((x) => x.trim().toLowerCase() === l);
}

// Compares one candidate with one vacancy.
// Returns a percentage plus a list of reasons, so the recruiter can see WHY someone matches.
// Unknown candidate data (not answered yet) counts as "not met" and is marked as unknown.
export function computeMatch(candidate, vacancy) {
  const checks = [];
  const yesNo = (key, label, weight) => {
    const v = candidate[key];
    checks.push({
      label,
      weight,
      ok: v === true,
      unknown: v === null || v === undefined,
      detail: v === true ? `Heeft ${label.toLowerCase()}` : v === false ? `Geen ${label.toLowerCase()}` : `${label}: nog onbekend`,
    });
  };

  if (vacancy.req_driving_licence) yesNo('driving_licence', 'Rijbewijs', 15);
  if (vacancy.req_own_car) yesNo('own_car', 'Eigen auto', 15);
  if (vacancy.req_forklift) yesNo('forklift', 'Heftruckcertificaat', 20);
  if (vacancy.req_ept) yesNo('ept', 'EPT-certificaat', 20);
  if (vacancy.req_reach_truck) yesNo('reach_truck', 'Reachtruckcertificaat', 20);
  if (vacancy.req_experience) {
    const v = candidate.has_experience;
    checks.push({
      label: 'Ervaring', weight: 15, ok: v === true, unknown: v === null || v === undefined,
      detail: v === true ? 'Heeft ervaring in magazijn/productie' : v === false ? 'Geen relevante ervaring' : 'Ervaring: nog onbekend',
    });
  }
  if (vacancy.min_english_level && vacancy.min_english_level !== 'none') {
    const need = LEVELS.indexOf(vacancy.min_english_level);
    const have = candidate.english_level ? LEVELS.indexOf(candidate.english_level) : -1;
    checks.push({
      label: 'Engels', weight: 15, ok: have >= need, unknown: have === -1,
      detail: have === -1 ? 'Niveau Engels: nog onbekend'
        : `Spreekt ${LEVEL_LABEL[candidate.english_level]} (nodig: ${LEVEL_LABEL[vacancy.min_english_level]})`,
    });
  }
  for (const lang of vacancy.required_languages || []) {
    const ok = !!hasLanguage(candidate, lang);
    checks.push({ label: `Taal: ${lang}`, weight: 10, ok, unknown: false, detail: ok ? `Spreekt ${lang}` : `Spreekt geen ${lang} (of niet ingevuld)` });
  }

  // Availability always counts a little: is the candidate ready to work?
  const readyStatuses = ['available', 'information_complete'];
  const today = new Date().toISOString().slice(0, 10);
  const availableNow = readyStatuses.includes(candidate.status) || (candidate.available_from && candidate.available_from <= today);
  checks.push({
    label: 'Beschikbaarheid', weight: 10, ok: !!availableNow, unknown: !candidate.availability && !candidate.available_from,
    detail: availableNow ? `Beschikbaar${candidate.availability ? `: ${candidate.availability}` : ''}`
      : candidate.availability ? `Beschikbaarheid: ${candidate.availability}` : 'Beschikbaarheid nog onbekend',
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  const score = total ? Math.round((got / total) * 100) : 100;

  const info = [];
  if (vacancy.location && (candidate.current_city || candidate.current_country)) {
    const near = candidate.current_city && vacancy.location.toLowerCase().includes(candidate.current_city.toLowerCase());
    info.push(near ? `Woont in ${candidate.current_city}, dezelfde plaats als het werk` : `Woont in ${[candidate.current_city, candidate.current_country].filter(Boolean).join(', ')}; het werk is in ${vacancy.location}`);
  }
  if (candidate.desired_job) info.push(`Wil graag: ${candidate.desired_job}`);

  const blockers = checks.filter((c) => !c.ok && !c.unknown && c.label !== 'Beschikbaarheid').map((c) => c.detail);
  return { score, checks, info, blockers, eligible: blockers.length === 0 };
}

const BLOCKED_STATUSES = ['rejected', 'not_interested', 'placed'];

export async function matchCandidateToVacancies(candidate) {
  const vacancies = await many(`SELECT v.*, a.name AS agency_name FROM vacancies v LEFT JOIN agencies a ON a.id = v.agency_id
                                WHERE v.status = 'open' ORDER BY v.created_at DESC`);
  const submitted = new Map((await many('SELECT vacancy_id, status FROM submissions WHERE candidate_id = $1', [candidate.id]))
    .map((s) => [s.vacancy_id, s.status]));
  return vacancies
    .map((v) => ({
      vacancy: { id: v.id, title: v.title, location: v.location, agency_id: v.agency_id, agency_name: v.agency_name, salary: v.salary },
      submission_status: submitted.get(v.id) || null,
      ...computeMatch(candidate, v),
    }))
    .sort((a, b) => b.score - a.score);
}

export async function matchVacancyToCandidates(vacancy, { minScore = 0, limit = 100 } = {}) {
  const candidates = await many(
    'SELECT * FROM candidates WHERE NOT (status = ANY($1)) ORDER BY updated_at DESC LIMIT 2000',
    [BLOCKED_STATUSES],
  );
  const submitted = new Map((await many('SELECT candidate_id, status FROM submissions WHERE vacancy_id = $1', [vacancy.id]))
    .map((s) => [s.candidate_id, s.status]));
  const offers = new Map((await many(`SELECT DISTINCT ON (candidate_id) candidate_id, status, created_at FROM outreach
                                      WHERE kind = 'vacancy' AND vacancy_id = $1 ORDER BY candidate_id, created_at DESC`, [vacancy.id]))
    .map((o) => [o.candidate_id, { status: o.status, at: o.created_at }]));
  return candidates
    .map((c) => ({
      candidate: { id: c.id, full_name: c.full_name, phone: c.phone, status: c.status, current_city: c.current_city },
      submission_status: submitted.get(c.id) || null,
      offer: offers.get(c.id) || null,
      ...computeMatch(c, vacancy),
    }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Number of good matches (score >= 75 and no blocking requirement) per open vacancy.
export async function goodMatchCounts(vacancies) {
  const candidates = await many('SELECT * FROM candidates WHERE NOT (status = ANY($1)) LIMIT 2000', [BLOCKED_STATUSES]);
  const out = {};
  for (const v of vacancies) {
    out[v.id] = v.status === 'open' ? candidates.filter((c) => { const m = computeMatch(c, v); return m.score >= 75 && m.eligible; }).length : null;
  }
  return out;
}
