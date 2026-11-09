import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Send, Target, Check } from 'lucide-react';
import { api, fmtDateTime, fmtPhone } from '../api.js';
import { useAsync, Spinner, ErrorBox, Empty, Confirm, SubmissionBadge, StatusBadge, useToast, scoreColor } from '../components/ui.jsx';
import { VacancyForm, VacancyStatus, requirementTags } from './Vacancies.jsx';
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
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (loading && !v) return <Spinner />;
  if (error) return <ErrorBox error={error} />;

  const propose = async (m) => {
    try {
      await api.post('/submissions', { candidate_id: m.candidate.id, vacancy_id: v.id });
      toast('Proposal created – approve it below to send', 'success');
      reload(true); matches.reload(true);
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><Link to="/vacancies" className="btn ghost sm"><ArrowLeft size={15} /> Vacancies</Link></div>
      <div className="page-head">
        <div>
          <div className="row"><h1>{v.title}</h1><VacancyStatus status={v.status} /></div>
          <p>{[v.agency_name && <Link key="a" to={`/agencies/${v.agency_id}`}>{v.agency_name}</Link>, v.location, v.salary, v.working_hours].filter(Boolean).reduce((acc, x, i) => [...acc, i ? ' · ' : '', x], [])}</p>
        </div>
        <div className="actions">
          {can('recruiter') && <button type="button" className="btn" onClick={() => setEdit(true)}><Pencil size={15} /> Edit</button>}
          {can('admin') && <button type="button" className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /> Delete</button>}
        </div>
      </div>

      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div><h3>Matching candidates</h3><div className="small muted">Ranked by match percentage. Placed, rejected and not-interested candidates are hidden.</div></div>
              <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Minimum score">
                {[0, 25, 50, 75, 100].map((s) => <option key={s} value={s}>Score ≥ {s}%</option>)}
              </select>
            </div>
            {matches.loading && !matches.data ? <Spinner /> : matches.data?.length === 0 ? <Empty icon={Target} title="No matching candidates">Lower the minimum score, or collect more candidate information.</Empty> : matches.data?.map((m) => (
              <div key={m.candidate.id} className="match">
                <div className="row wrap">
                  <span className={`score ${scoreColor(m.score)}`}>{m.score}%</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Link to={`/candidates/${m.candidate.id}`} className="name"><b>{m.candidate.full_name || fmtPhone(m.candidate.phone)}</b></Link>
                    <div className="small muted">{m.candidate.current_city || ''}</div>
                  </div>
                  <StatusBadge status={m.candidate.status} />
                  {m.submission_status ? <SubmissionBadge status={m.submission_status} /> : can('recruiter') && v.agency_id && (
                    <button type="button" className="btn sm" onClick={() => propose(m)}><Send size={14} /> Propose</button>
                  )}
                </div>
                <MatchChecks m={m} />
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-head"><h3>Proposed &amp; sent candidates</h3></div>
            {v.submissions.length === 0 ? <Empty icon={Send} title="Nobody proposed yet" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Candidate</th><th>Match</th><th>Status</th><th>Sent</th><th /></tr></thead>
                <tbody>{v.submissions.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/candidates/${s.candidate_id}`}>{s.full_name || fmtPhone(s.phone)}</Link></td>
                    <td>{s.match_score != null ? `${s.match_score}%` : '—'}</td>
                    <td><SubmissionBadge status={s.status} /></td>
                    <td className="sub">{fmtDateTime(s.sent_at)}</td>
                    <td style={{ textAlign: 'right' }}>{s.status === 'proposed' && can('recruiter') && <button type="button" className="btn sm primary" onClick={() => setSendItem(s)}><Check size={14} /> Approve &amp; send</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Details</h3></div>
          <div className="card-body stack">
            <div><div className="small muted" style={{ marginBottom: 6 }}>Requirements</div><div className="tags">{requirementTags(v).length ? requirementTags(v).map((t) => <span key={t} className="tag">{t}</span>) : <span className="muted small">No special requirements</span>}</div></div>
            {v.required_experience && <div><div className="small muted">Experience</div>{v.required_experience}</div>}
            <div><div className="small muted">Positions</div>{v.positions}</div>
            {v.description && <div><div className="small muted">Description</div><div style={{ whiteSpace: 'pre-wrap' }}>{v.description}</div></div>}
          </div>
        </div>
      </div>

      {edit && <VacancyForm vacancy={v} onClose={() => setEdit(false)} onSaved={() => { reload(true); matches.reload(true); }} />}
      {sendItem && <SendWrapper submission={{ ...sendItem, agency_name: v.agency_name, vacancy_title: v.title }} onClose={() => setSendItem(null)} onDone={() => reload(true)} />}
      {del && <Confirm title="Delete vacancy?" danger confirmLabel="Delete" onClose={() => setDel(false)} onConfirm={async () => { await api.del(`/vacancies/${v.id}`); navigate('/vacancies'); }}><p>Submissions stay saved but are no longer linked to this vacancy.</p></Confirm>}
    </>
  );
}

// Loads the candidate's files and consent before showing the send dialog.
export function SendWrapper({ submission, onClose, onDone }) {
  const { data } = useAsync(() => api.get(`/candidates/${submission.candidate_id}`), [submission.candidate_id]);
  if (!data) return null;
  return <SendModal submission={{ ...submission, full_name: data.full_name }} files={data.files} consent={data.consent_given} onClose={onClose} onDone={onDone} />;
}
