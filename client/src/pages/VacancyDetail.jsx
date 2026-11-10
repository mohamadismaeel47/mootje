import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Send, Target, Check, MessageCircle, Users } from 'lucide-react';
import { api, fmtDateTime, fmtPhone } from '../api.js';
import { useAsync, Spinner, ErrorBox, Empty, Confirm, SubmissionBadge, StatusBadge, useToast, scoreColor, Modal, Alert } from '../components/ui.jsx';
import { VacancyForm, VacancyStatus, requirementTags, vacancySummary } from './Vacancies.jsx';
import { MatchChecks, SendModal } from './CandidateDetail.jsx';
import { useAuth } from '../App.jsx';

export default function VacancyDetail() {
  const { id } = useParams();
  const { data: v, error, loading, reload } = useAsync(() => api.get(`/vacancies/${id}`), [id]);
  const [minScore, setMinScore] = useState(50);
  const matches = useAsync(() => api.get(`/vacancies/${id}/matches?min_score=${minScore}`), [id, minScore]);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [sendItem, setSendItem] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showOffer, setShowOffer] = useState(false);
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (loading && !v) return <Spinner />;
  if (error) return <ErrorBox error={error} />;

  const propose = async (m) => {
    try {
      await api.post('/submissions', { candidate_id: m.candidate.id, vacancy_id: v.id });
      toast('Voorstel gemaakt – keur het hieronder goed om te versturen', 'success');
      reload(true); matches.reload(true);
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><Link to="/vacancies" className="btn ghost sm"><ArrowLeft size={15} /> Vacatures</Link></div>
      <div className="page-head">
        <div>
          <div className="row"><h1>{v.title}</h1><VacancyStatus status={v.status} /></div>
          <p>{[v.agency_name && <Link key="a" to={`/agencies/${v.agency_id}`}>{v.agency_name}</Link>, v.location, v.salary, v.working_hours].filter(Boolean).reduce((acc, x, i) => [...acc, i ? ' · ' : '', x], [])}</p>
        </div>
        <div className="actions">
          {can('recruiter') && <button type="button" className="btn" onClick={() => setEdit(true)}><Pencil size={15} /> Bewerken</button>}
          {can('admin') && <button type="button" className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /> Verwijderen</button>}
        </div>
      </div>

      <div className="alert info" style={{ marginBottom: 16 }}>
        <Users size={17} />
        <div><b>Wie zoeken ze?</b> {vacancySummary(v)}</div>
      </div>

      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div><h3>Passende kandidaten</h3><div className="small muted">Gesorteerd op matchpercentage. Geplaatste, afgewezen en niet-geïnteresseerde kandidaten worden niet getoond.</div></div>
              <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Minimale score">
                {[0, 25, 50, 75, 100].map((s) => <option key={s} value={s}>Score ≥ {s}%</option>)}
              </select>
            </div>
            {can('recruiter') && matches.data?.length > 0 && (
              <div className="toolbar">
                <button type="button" className="btn sm" onClick={() => setSelected(matches.data.filter((m) => m.score >= 75 && m.eligible && !m.offer).map((m) => m.candidate.id))}>Selecteer goede matches (75%+)</button>
                {selected.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setSelected([])}>Selectie wissen</button>}
                <div style={{ flex: 1 }} />
                <button type="button" className="btn primary" disabled={!selected.length} onClick={() => setShowOffer(true)}><MessageCircle size={15} /> Vacature sturen via WhatsApp ({selected.length})</button>
              </div>
            )}
            {matches.loading && !matches.data ? <Spinner /> : matches.data?.length === 0 ? <Empty icon={Target} title="Geen passende kandidaten">Verlaag de minimale score, of verzamel meer informatie van kandidaten.</Empty> : matches.data?.map((m) => (
              <div key={m.candidate.id} className="match">
                <div className="row wrap">
                  {can('recruiter') && (
                    <input type="checkbox" aria-label="Selecteren" style={{ width: 18, height: 18, accentColor: 'var(--navy-800)' }} checked={selected.includes(m.candidate.id)}
                      onChange={(e) => setSelected((sel) => (e.target.checked ? [...sel, m.candidate.id] : sel.filter((x) => x !== m.candidate.id)))} />
                  )}
                  <span className={`score ${scoreColor(m.score)}`}>{m.score}%</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Link to={`/candidates/${m.candidate.id}`} className="name"><b>{m.candidate.full_name || fmtPhone(m.candidate.phone)}</b></Link>
                    <div className="small muted">{m.candidate.current_city || ''}</div>
                  </div>
                  <StatusBadge status={m.candidate.status} />
                  {m.offer && <OfferBadge offer={m.offer} />}
                  {m.submission_status ? <SubmissionBadge status={m.submission_status} /> : can('recruiter') && v.agency_id && (
                    <button type="button" className="btn sm" onClick={() => propose(m)}><Send size={14} /> Voorstellen</button>
                  )}
                </div>
                <MatchChecks m={m} />
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head"><h3>Voorgestelde &amp; verstuurde kandidaten</h3></div>
            {v.submissions.length === 0 ? <Empty icon={Send} title="Nog niemand voorgesteld" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Kandidaat</th><th>Match</th><th>Status</th><th>Verstuurd</th><th /></tr></thead>
                <tbody>{v.submissions.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/candidates/${s.candidate_id}`}>{s.full_name || fmtPhone(s.phone)}</Link></td>
                    <td>{s.match_score != null ? `${s.match_score}%` : '—'}</td>
                    <td><SubmissionBadge status={s.status} /></td>
                    <td className="sub">{fmtDateTime(s.sent_at)}</td>
                    <td style={{ textAlign: 'right' }}>{s.status === 'proposed' && can('recruiter') && <button type="button" className="btn sm primary" onClick={() => setSendItem(s)}><Check size={14} /> Goedkeuren &amp; versturen</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Gegevens</h3></div>
          <div className="card-body stack">
            <div><div className="small muted" style={{ marginBottom: 6 }}>Eisen</div><div className="tags">{requirementTags(v).length ? requirementTags(v).map((t) => <span key={t} className="tag">{t}</span>) : <span className="muted small">Geen speciale eisen</span>}</div></div>
            {v.required_experience && <div><div className="small muted">Ervaring</div>{v.required_experience}</div>}
            <div><div className="small muted">Plaatsen</div>{v.positions}</div>
            {v.description && <div><div className="small muted">Omschrijving</div><div style={{ whiteSpace: 'pre-wrap' }}>{v.description}</div></div>}
          </div>
        </div>
      </div>

      {showOffer && <OfferModal vacancy={v} candidateIds={selected} onClose={() => setShowOffer(false)} onDone={() => { setSelected([]); matches.reload(true); reload(true); }} />}
      {edit && <VacancyForm vacancy={v} onClose={() => setEdit(false)} onSaved={() => { reload(true); matches.reload(true); }} />}
      {sendItem && <SendWrapper submission={{ ...sendItem, agency_name: v.agency_name, vacancy_title: v.title }} onClose={() => setSendItem(null)} onDone={() => reload(true)} />}
      {del && <Confirm title="Vacature verwijderen?" danger confirmLabel="Verwijderen" onClose={() => setDel(false)} onConfirm={async () => { await api.del(`/vacancies/${v.id}`); navigate('/vacancies'); }}><p>Voorstellen blijven bewaard, maar zijn niet meer gekoppeld aan deze vacature.</p></Confirm>}
    </>
  );
}

// Loads the candidate's files and consent before showing the send dialog.
export function SendWrapper({ submission, onClose, onDone }) {
  const { data } = useAsync(() => api.get(`/candidates/${submission.candidate_id}`), [submission.candidate_id]);
  if (!data) return null;
  return <SendModal submission={{ ...submission, full_name: data.full_name }} files={data.files} consent={data.consent_given} onClose={onClose} onDone={onDone} />;
}

function OfferBadge({ offer }) {
  const map = { sent: ['Vacature gestuurd', 'blue'], interested: ['Heeft interesse', 'green'], declined: ['Geen interesse', 'red'], failed: ['Versturen mislukt', 'amber'] };
  const [label, color] = map[offer.status] || [offer.status, ''];
  return <span className={`badge ${color}`} title={fmtDateTime(offer.at)}>{label}</span>;
}

function OfferModal({ vacancy, candidateIds, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();
  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/vacancies/${vacancy.id}/send-to-candidates`, { candidate_ids: candidateIds, confirm: true });
      setResult(r); onDone();
      if (r.sent) toast(`Vacature gestuurd naar ${r.sent} kandida${r.sent === 1 ? 'at' : 'ten'}`, 'success');
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const details = [vacancy.location && `📍 ${vacancy.location}`, vacancy.salary && `💶 ${vacancy.salary}`, vacancy.working_hours && `🕒 ${vacancy.working_hours}`].filter(Boolean).join('\n');
  return (
    <Modal title="Vacature sturen via WhatsApp" onClose={onClose} footer={result
      ? <button type="button" className="btn primary" onClick={onClose}>Sluiten</button>
      : <><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" disabled={busy} onClick={send}><Send size={15} /> {busy ? 'Bezig met versturen…' : `Versturen naar ${candidateIds.length}`}</button></>}>
      <div className="stack">
        {!result && (
          <>
            <p>Je stuurt de vacature <b>{vacancy.title}</b> naar <b>{candidateIds.length}</b> kandida{candidateIds.length === 1 ? 'at' : 'ten'}. Ze krijgen dit bericht (in hun eigen taal):</p>
            <div className="bubble out" style={{ alignSelf: 'stretch', maxWidth: 'none' }}>{`Hoi Anna! We hebben werk dat misschien bij je past:\n\n*${vacancy.title}*${details ? `\n${details}` : ''}\n\nHeb je interesse? Antwoord JA of NEE.`}</div>
            <Alert type="info">Antwoordt een kandidaat <b>JA</b>? Dan krijg je een melding{vacancy.agency_id ? ' en staat er een voorstel voor het bureau klaar (dat keur je zelf goed)' : ''}.</Alert>
            <p className="small muted">Kandidaten die langer dan 24 uur niets stuurden, krijgen de goedgekeurde vacaturetemplate (Instellingen → Assistent). Zonder template slaan we hen over.</p>
          </>
        )}
        <ErrorBox error={error} />
        {result && (
          <Alert type={result.sent ? 'success' : 'warn'}>
            <b>{result.sent}</b> verstuurd.
            {result.needs_template > 0 && <> <b>{result.needs_template}</b> overgeslagen: langer dan 24 uur geen bericht en nog geen vacaturetemplate ingesteld.</>}
            {result.failed > 0 && <> <b>{result.failed}</b> mislukt.</>}
            {result.results.filter((r) => !r.ok).slice(0, 10).map((r) => <div key={r.candidate_id} className="small">{r.name || 'Kandidaat'}: {r.reason === 'needs_template' ? 'template nodig' : r.error}</div>)}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
