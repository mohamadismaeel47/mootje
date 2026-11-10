import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Send, Check } from 'lucide-react';
import { api, qs, fmtDateTime, fmtPhone } from '../api.js';
import { useAsync, Spinner, ErrorBox, Empty, Modal, Field, useToast, SubmissionBadge, SUB_LABELS } from '../components/ui.jsx';
import { SendWrapper } from './VacancyDetail.jsx';
import { useAuth } from '../App.jsx';

const STATUSES = ['proposed', 'sent', 'interview', 'placed', 'rejected', 'withdrawn'];

export default function Submissions() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const { data, error, loading, reload } = useAsync(() => api.get(`/submissions${qs({ status })}`), [status]);
  const [sendItem, setSendItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const { can } = useAuth();
  return (
    <>
      <div className="page-head">
        <div><h1>Naar bureaus gestuurd</h1><p>Elk voorstel heeft jouw goedkeuring nodig voordat het wordt verstuurd. Volg hier gesprekken en plaatsingen.</p></div>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="chips">
            <button type="button" className={`chip ${!status ? 'on' : ''}`} onClick={() => setParams({})}>Alles</button>
            {STATUSES.map((s) => <button type="button" key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setParams({ status: s })}>{SUB_LABELS[s]}</button>)}
          </div>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : data?.length === 0 ? <Empty icon={Send} title="Hier staat nog niets">Stel kandidaten voor vanuit een kandidaatprofiel of een vacature.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Kandidaat</th><th>Bureau</th><th>Vacature</th><th>Match</th><th>Status</th><th>Gesprek</th><th>Verstuurd</th><th /></tr></thead>
            <tbody>{data?.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/candidates/${s.candidate_id}`} className="name">{s.full_name || fmtPhone(s.phone)}</Link></td>
                <td>{s.agency_id ? <Link to={`/agencies/${s.agency_id}`}>{s.agency_name}</Link> : '—'}</td>
                <td className="sub">{s.vacancy_id ? <Link to={`/vacancies/${s.vacancy_id}`}>{s.vacancy_title}</Link> : '—'}</td>
                <td>{s.match_score != null ? `${s.match_score}%` : '—'}</td>
                <td><SubmissionBadge status={s.status} /></td>
                <td className="sub">{s.interview_at ? fmtDateTime(s.interview_at) : '—'}</td>
                <td className="sub">{s.sent_at ? `${fmtDateTime(s.sent_at)}${s.approved_by_name ? ` door ${s.approved_by_name}` : ''}` : '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {can('recruiter') && (s.status === 'proposed'
                    ? <button type="button" className="btn sm primary" onClick={() => setSendItem(s)}><Check size={14} /> Goedkeuren &amp; versturen</button>
                    : <button type="button" className="btn sm" onClick={() => setEditItem(s)}>Bijwerken</button>)}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {sendItem && <SendWrapper submission={sendItem} onClose={() => setSendItem(null)} onDone={() => reload(true)} />}
      {editItem && <UpdateModal s={editItem} onClose={() => setEditItem(null)} onDone={() => reload(true)} />}
    </>
  );
}

function toLocalInput(d) {
  if (!d) return '';
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function UpdateModal({ s, onClose, onDone }) {
  const [status, setStatus] = useState(s.status);
  const [interview, setInterview] = useState(toLocalInput(s.interview_at));
  const [notes, setNotes] = useState(s.notes || '');
  const [error, setError] = useState(null);
  const toast = useToast();
  const save = async () => {
    try {
      await api.patch(`/submissions/${s.id}`, { status, interview_at: interview ? new Date(interview).toISOString() : null, notes });
      toast('Bijgewerkt', 'success'); onDone(); onClose();
    } catch (err) { setError(err); }
  };
  return (
    <Modal title={`Bijwerken: ${s.full_name || 'kandidaat'}`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" onClick={save}>Opslaan</button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Status" hint="Sollicitatiegesprek en Geplaatst passen ook de status van de kandidaat aan.">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((x) => <option key={x} value={x}>{SUB_LABELS[x]}</option>)}</select>
        </Field>
        <Field label="Datum en tijd gesprek"><input type="datetime-local" value={interview} onChange={(e) => setInterview(e.target.value)} /></Field>
        <Field label="Notities"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
