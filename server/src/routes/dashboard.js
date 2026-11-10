import { Router } from 'express';
import { one, many } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  const stats = await one(`
    SELECT
      (SELECT count(*) FROM candidates) AS total_candidates,
      (SELECT count(*) FROM candidates WHERE status = 'new') AS new_candidates,
      (SELECT count(*) FROM candidates WHERE created_at > now() - interval '7 days') AS new_this_week,
      (SELECT count(*) FROM candidates WHERE status NOT IN ('new')) AS contacted,
      (SELECT count(*) FROM candidates WHERE status IN ('available','information_complete')) AS available,
      (SELECT count(*) FROM candidates WHERE status = 'placed') AS placed,
      (SELECT count(*) FROM vacancies WHERE status = 'open') AS active_vacancies,
      (SELECT count(*) FROM submissions WHERE status = 'interview') AS interviews,
      (SELECT count(*) FROM conversations
         WHERE mode = 'auto' AND status IN ('in_progress','waiting')
           AND last_outbound_at IS NOT NULL
           AND (last_inbound_at IS NULL OR last_outbound_at > last_inbound_at)) AS waiting_for_reply,
      (SELECT COALESCE(sum(unread_count),0) FROM conversations) AS unread_messages,
      (SELECT count(*) FROM conversations WHERE status = 'needs_attention') AS needs_attention,
      (SELECT count(*) FROM conversations WHERE status = 'completed' AND NOT simulated) AS completed_registrations,
      (SELECT count(DISTINCT h.candidate_id) FROM candidate_status_history h
         WHERE h.to_status = 'information_complete' AND h.changed_at > now() - interval '7 days') AS completed_this_week
  `);

  // Candidates who did not get a WhatsApp message from us (recruiter or assistant) for more than 2 days.
  // Candidates who never got a message count from their registration date. Finished cases are left out.
  const noContactWhere = `
    FROM candidates cand LEFT JOIN conversations c ON c.candidate_id = cand.id
    WHERE (c.id IS NULL OR NOT c.simulated)
      AND cand.status NOT IN ('placed','rejected','not_interested')
      AND (c.status IS NULL OR c.status <> 'closed')
      AND COALESCE(c.last_outbound_at, cand.created_at) < now() - interval '2 days'`;
  const noContactCount = (await one(`SELECT count(*) AS n ${noContactWhere}`)).n;
  const noContact = await many(`
    SELECT cand.id AS candidate_id, cand.full_name, cand.phone, cand.status, c.id AS conversation_id,
           c.bot_state->>'profile_name' AS profile_name, c.last_outbound_at, c.last_inbound_at
    ${noContactWhere}
    ORDER BY COALESCE(c.last_outbound_at, cand.created_at) ASC LIMIT 15`);
  stats.no_contact_2d = noContactCount;

  // Last 12 weeks: registrations and placements per week.
  const chart = await many(`
    WITH weeks AS (
      SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS week
    )
    SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
      (SELECT count(*) FROM candidates c WHERE date_trunc('week', c.created_at) = w.week) AS registrations,
      (SELECT count(DISTINCT h.candidate_id) FROM candidate_status_history h
         WHERE h.to_status = 'placed' AND date_trunc('week', h.changed_at) = w.week) AS placements
    FROM weeks w ORDER BY w.week
  `);

  const byStatus = await many('SELECT status, count(*) AS count FROM candidates GROUP BY status');

  const recentCandidates = await many(
    'SELECT id, full_name, phone, status, created_at FROM candidates ORDER BY created_at DESC LIMIT 6',
  );

  res.json({ stats, chart, byStatus, recentCandidates, noContact });
});

export default router;
