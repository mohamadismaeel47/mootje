import { many } from '../db/pool.js';

const LEVELS = ['none', 'basic', 'good', 'fluent'];
const LEVEL_LABEL = { none: 'no English', basic: 'basic English', good: 'good English', fluent: 'fluent English' };

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
      detail: v === true ? `Has ${label.toLowerCase()}` : v === false ? `No ${label.toLowerCase()}` : `${label}: not known yet`,
    });
  };

  if (vacancy.req_driving_licence) yesNo('driving_licence', 'Driving licence', 15);
  if (vacancy.req_own_car) yesNo('own_car', 'Own car', 15);
  if (vacancy.req_forklift) yesNo('forklift', 'Forklift certificate', 20);
  if (vacancy.req_ept) yesNo('ept', 'EPT certificate', 20);
  if (vacancy.req_reach_truck) yesNo('reach_truck', 'Reach truck certificate', 20);
  if (vacancy.req_experience) {
    const v = candidate.has_experience;
    checks.push({
      label: 'Experience', weight: 15, ok: v === true, unknown: v === null || v === undefined,
      detail: v === true ? 'Has warehouse/production experience' : v === false ? 'No relevant experience' : 'Experience: not known yet',
    });
  }
  if (vacancy.min_english_level && vacancy.min_english_level !== 'none') {
    const need = LEVELS.indexOf(vacancy.min_english_level);
    const have = candidate.english_level ? LEVELS.indexOf(candidate.english_level) : -1;
    checks.push({
      label: 'English', weight: 15, ok: have >= need, unknown: have === -1,
      detail: have === -1 ? 'English level: not known yet'
        : `Speaks ${LEVEL_LABEL[candidate.english_level]} (needs ${LEVEL_LABEL[vacancy.min_english_level]})`,
    });
  }
  for (const lang of vacancy.required_languages || []) {
    const ok = !!hasLanguage(candidate, lang);
    checks.push({ label: `Language: ${lang}`, weight: 10, ok, unknown: false, detail: ok ? `Speaks ${lang}` : `Does not speak ${lang} (or not recorded)` });
  }

  // Availability always counts a little: is the candidate ready to work?
  const readyStatuses = ['available', 'information_complete'];
  const today = new Date().toISOString().slice(0, 10);
  const availableNow = readyStatuses.includes(candidate.status) || (candidate.available_from && candidate.available_from <= today);
  checks.push({
    label: 'Availability', weight: 10, ok: !!availableNow, unknown: !candidate.availability && !candidate.available_from,
    detail: availableNow ? `Available${candidate.availability ? `: ${candidate.availability}` : ''}`
      : candidate.availability ? `Availability: ${candidate.availability}` : 'Availability not known yet',
  });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  const score = total ? Math.round((got / total) * 100) : 100;

  const info = [];
  if (vacancy.location && (candidate.current_city || candidate.current_country)) {
    const near = candidate.current_city && vacancy.location.toLowerCase().includes(candidate.current_city.toLowerCase());
    info.push(near ? `Lives in ${candidate.current_city}, same place as the job` : `Lives in ${[candidate.current_city, candidate.current_country].filter(Boolean).join(', ')}; job is in ${vacancy.location}`);
  }
  if (candidate.desired_job) info.push(`Wants: ${candidate.desired_job}`);

  const blockers = checks.filter((c) => !c.ok && !c.unknown && c.label !== 'Availability').map((c) => c.detail);
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
  return candidates
    .map((c) => ({
      candidate: { id: c.id, full_name: c.full_name, phone: c.phone, status: c.status, current_city: c.current_city },
      submission_status: submitted.get(c.id) || null,
      ...computeMatch(c, vacancy),
    }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
