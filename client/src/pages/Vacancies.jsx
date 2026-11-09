import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Plus, Search, MapPin, Building2 } from 'lucide-react';
import { api, qs, ENGLISH_LABELS } from '../api.js';
import { useAsync, useDebounced, Spinner, ErrorBox, Empty, Modal, Field, useToast } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

export const VACANCY_STATUS = { open: ['Open', 'green'], paused: ['Paused', 'amber'], filled: ['Filled', 'blue'], closed: ['Closed', ''] };
export function VacancyStatus({ status }) {
  const [l, c] = VACANCY_STATUS[status] || [status, ''];
  return <span className={`badge ${c}`}>{l}</span>;
}

export function requirementTags(v) {
  return [
    v.req_driving_licence && 'Driving licence', v.req_own_car && 'Own car', v.req_forklift && 'Forklift', v.req_ept && 'EPT',
    v.req_reach_truck && 'Reach truck', v.req_experience && 'Experience',
    v.min_english_level && v.min_english_level !== 'none' && `English: ${ENGLISH_LABELS[v.min_english_level]}+`,
    ...(v.required_languages || []),
  ].filter(Boolean);
}

export default function Vacancies() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('open');
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => api.get(`/vacancies${qs({ q: dq, status })}`), [dq, status]);
  const [edit, setEdit] = useState(null);
  const { can } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div className="page-head">
        <div><h1>Vacancies</h1><p>Jobs from your agencies. Matching uses the requirements you set here.</p></div>
        {can('recruiter') && <button type="button" className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> New vacancy</button>}
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={16} /><input type="search" placeholder="Search title or location" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search vacancies" /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(VACANCY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : data?.length === 0 ? <Empty icon={Briefcase} title="No vacancies">Create your first vacancy.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Job</th><th>Agency</th><th>Requirements</th><th>Positions</th><th>Candidates</th><th>Status</th></tr></thead>
              <tbody>
                {data?.map((v) => (
                  <tr key={v.id} className="click" onClick={() => navigate(`/vacancies/${v.id}`)}>
                    <td><Link to={`/vacancies/${v.id}`} className="name" onClick={(e) => e.stopPropagation()}>{v.title}</Link><div className="sub">{[v.location, v.salary, v.working_hours].filter(Boolean).join(' · ')}</div></td>
                    <td className="sub">{v.agency_name || '—'}</td>
                    <td><div className="tags">{requirementTags(v).map((t) => <span key={t} className="tag">{t}</span>)}</div></td>
                    <td>{v.positions}</td>
                    <td>{v.submission_count}</td>
                    <td><VacancyStatus status={v.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <VacancyForm vacancy={edit} onClose={() => setEdit(null)} onSaved={(v) => { reload(true); navigate(`/vacancies/${v.id}`); }} />}
    </>
  );
}

const EMPTY = {
  title: '', agency_id: '', location: '', salary: '', working_hours: '', req_driving_licence: false, req_own_car: false, req_forklift: false,
  req_ept: false, req_reach_truck: false, req_experience: false, required_experience: '', min_english_level: 'none', required_languages: [],
  positions: 1, description: '', status: 'open',
};

export function VacancyForm({ vacancy, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...vacancy, agency_id: vacancy.agency_id ? String(vacancy.agency_id) : '', languages_input: (vacancy.required_languages || []).join(', ') }));
  const { data: agencies } = useAsync(() => api.get('/agencies'), []);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      title: f.title, agency_id: f.agency_id ? Number(f.agency_id) : null, location: f.location, salary: f.salary, working_hours: f.working_hours,
      req_driving_licence: f.req_driving_licence, req_own_car: f.req_own_car, req_forklift: f.req_forklift, req_ept: f.req_ept,
      req_reach_truck: f.req_reach_truck, req_experience: f.req_experience, required_experience: f.required_experience,
      min_english_level: f.min_english_level, required_languages: f.languages_input.split(',').map((s) => s.trim()).filter(Boolean),
      positions: Number(f.positions || 0), description: f.description, status: f.status,
    };
    try {
      const v = vacancy.id ? await api.put(`/vacancies/${vacancy.id}`, body) : await api.post('/vacancies', body);
      toast('Vacancy saved', 'success'); onSaved(v); onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const cb = (k, l) => <label className="checkbox"><input type="checkbox" checked={!!f[k]} onChange={set(k)} /> {l}</label>;
  return (
    <Modal title={vacancy.id ? 'Edit vacancy' : 'New vacancy'} wide onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !f.title} onClick={save}>Save vacancy</button></>}>
      <ErrorBox error={error} />
      <div className="form-section">Job</div>
      <div className="form-grid">
        <Field label="Job title" className="span-2"><input type="text" value={f.title} onChange={set('title')} required autoFocus /></Field>
        <Field label="Agency" hint={agencies?.length === 0 ? 'Create an agency first' : undefined}>
          <select value={f.agency_id} onChange={set('agency_id')}><option value="">— No agency —</option>{agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label="Location"><input type="text" value={f.location || ''} onChange={set('location')} placeholder="e.g. Breda" /></Field>
        <Field label="Salary"><input type="text" value={f.salary || ''} onChange={set('salary')} placeholder="e.g. €14.50 per hour" /></Field>
        <Field label="Working hours"><input type="text" value={f.working_hours || ''} onChange={set('working_hours')} placeholder="e.g. 40 h, 2 shifts" /></Field>
        <Field label="Available positions"><input type="number" min="0" value={f.positions} onChange={set('positions')} /></Field>
        <Field label="Status"><select value={f.status} onChange={set('status')}>{Object.entries(VACANCY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div className="form-section">Requirements (used for matching)</div>
      <div className="grid grid-3" style={{ gap: 10 }}>
        {cb('req_driving_licence', 'Driving licence')}{cb('req_own_car', 'Own car')}{cb('req_experience', 'Warehouse/production experience')}
        {cb('req_forklift', 'Forklift certificate')}{cb('req_ept', 'EPT certificate')}{cb('req_reach_truck', 'Reach truck certificate')}
      </div>
      <div className="form-grid mt">
        <Field label="Minimum English level"><select value={f.min_english_level} onChange={set('min_english_level')}>{Object.entries(ENGLISH_LABELS).map(([k, l]) => <option key={k} value={k}>{k === 'none' ? 'Not required' : l}</option>)}</select></Field>
        <Field label="Other required languages" hint="Comma separated, e.g. Dutch, Polish"><input type="text" value={f.languages_input} onChange={set('languages_input')} /></Field>
        <Field label="Required experience (description)" className="span-2"><input type="text" value={f.required_experience || ''} onChange={set('required_experience')} placeholder="e.g. 1 year order picking" /></Field>
        <Field label="Job description" className="span-2"><textarea rows={5} value={f.description || ''} onChange={set('description')} /></Field>
      </div>
    </Modal>
  );
}

export { MapPin, Building2 };
