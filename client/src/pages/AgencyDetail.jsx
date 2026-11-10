import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Briefcase, Send } from 'lucide-react';
import { api, fmtDateTime } from '../api.js';
import { useAsync, Spinner, ErrorBox, Empty, Confirm, SubmissionBadge } from '../components/ui.jsx';
import { AgencyForm } from './Agencies.jsx';
import { VacancyStatus } from './Vacancies.jsx';
import { useAuth } from '../App.jsx';

export default function AgencyDetail() {
  const { id } = useParams();
  const { data: a, error, loading, reload } = useAsync(() => api.get(`/agencies/${id}`), [id]);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const { can } = useAuth();
  const navigate = useNavigate();
  if (loading && !a) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><Link to="/agencies" className="btn ghost sm"><ArrowLeft size={15} /> Uitzendbureaus</Link></div>
      <div className="page-head">
        <div><h1>{a.name}</h1><p>{a.contact_person || 'Geen contactpersoon'}</p></div>
        <div className="actions">
          {can('recruiter') && <button type="button" className="btn" onClick={() => setEdit(true)}><Pencil size={15} /> Bewerken</button>}
          {can('admin') && <button type="button" className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /> Verwijderen</button>}
        </div>
      </div>
      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>Vacatures</h3><Link to="/vacancies" className="small">Alle vacatures</Link></div>
            {a.vacancies.length === 0 ? <Empty icon={Briefcase} title="Geen vacatures voor dit bureau" /> : (
              <div className="table-wrap"><table className="table"><tbody>{a.vacancies.map((v) => (
                <tr key={v.id}><td><Link to={`/vacancies/${v.id}`} className="name">{v.title}</Link><div className="sub">{v.location}</div></td><td>{v.positions} plaatsen</td><td><VacancyStatus status={v.status} /></td></tr>
              ))}</tbody></table></div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>Kandidaten gestuurd naar dit bureau</h3></div>
            {a.submissions.length === 0 ? <Empty icon={Send} title="Nog geen kandidaten gestuurd" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Kandidaat</th><th>Vacature</th><th>Status</th><th>Verstuurd</th></tr></thead>
                <tbody>{a.submissions.map((s) => (
                  <tr key={s.id}><td><Link to={`/candidates/${s.candidate_id}`}>{s.full_name || 'Kandidaat'}</Link></td><td className="sub">{s.vacancy_title || '—'}</td><td><SubmissionBadge status={s.status} /></td><td className="sub">{fmtDateTime(s.sent_at)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Contactgegevens</h3></div>
          <div className="card-body">
            <dl className="details">
              <dt>Contactpersoon</dt><dd>{a.contact_person || '—'}</dd>
              <dt>E-mail</dt><dd>{a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : '—'}</dd>
              <dt>Telefoon</dt><dd>{a.phone || '—'}</dd>
              <dt>Adres</dt><dd>{a.address || '—'}</dd>
              <dt>Notities</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.notes || '—'}</dd>
            </dl>
          </div>
        </div>
      </div>
      {edit && <AgencyForm agency={a} onClose={() => setEdit(false)} onSaved={() => reload(true)} />}
      {del && <Confirm title="Bureau verwijderen?" danger confirmLabel="Verwijderen" onClose={() => setDel(false)} onConfirm={async () => { await api.del(`/agencies/${a.id}`); navigate('/agencies'); }}><p>Vacatures en voorstellen blijven bewaard, maar zijn niet meer gekoppeld aan dit bureau.</p></Confirm>}
    </>
  );
}
