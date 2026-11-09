import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus, Search } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAsync, useDebounced, Spinner, ErrorBox, Empty, Modal, Field, useToast } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

export default function Agencies() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useAsync(() => api.get(`/agencies${qs({ q: dq })}`), [dq]);
  const [edit, setEdit] = useState(null);
  const { can } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div className="page-head">
        <div><h1>Agencies</h1><p>Recruitment and staffing agencies you work with.</p></div>
        {can('recruiter') && <button type="button" className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> New agency</button>}
      </div>
      <div className="card">
        <div className="toolbar"><div className="search"><Search size={16} /><input type="search" placeholder="Search agencies" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agencies" /></div></div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : data?.length === 0 ? <Empty icon={Building2} title="No agencies yet">Add the agencies you send candidates to.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Agency</th><th>Contact</th><th>Email / phone</th><th>Active vacancies</th><th>Candidates sent</th></tr></thead>
            <tbody>{data?.map((a) => (
              <tr key={a.id} className="click" onClick={() => navigate(`/agencies/${a.id}`)}>
                <td><Link to={`/agencies/${a.id}`} className="name" onClick={(e) => e.stopPropagation()}>{a.name}</Link><div className="sub">{a.address || ''}</div></td>
                <td>{a.contact_person || '—'}</td>
                <td className="sub">{a.email || '—'}<br />{a.phone || ''}</td>
                <td>{a.active_vacancies}</td>
                <td>{a.candidates_sent}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <AgencyForm agency={edit} onClose={() => setEdit(null)} onSaved={(a) => { reload(true); navigate(`/agencies/${a.id}`); }} />}
    </>
  );
}

export function AgencyForm({ agency, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', contact_person: '', email: '', phone: '', address: '', notes: '', ...agency });
  const [error, setError] = useState(null);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const body = { name: f.name, contact_person: f.contact_person, email: f.email, phone: f.phone, address: f.address, notes: f.notes };
    try {
      const a = agency.id ? await api.put(`/agencies/${agency.id}`, body) : await api.post('/agencies', body);
      toast('Agency saved', 'success'); onSaved(a); onClose();
    } catch (err) { setError(err); }
  };
  return (
    <Modal title={agency.id ? 'Edit agency' : 'New agency'} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={!f.name} onClick={save}>Save agency</button></>}>
      <ErrorBox error={error} />
      <div className="form-grid">
        <Field label="Agency name" className="span-2"><input type="text" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Contact person"><input type="text" value={f.contact_person || ''} onChange={set('contact_person')} /></Field>
        <Field label="Phone"><input type="tel" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email" className="span-2" hint="Used to email candidates after your approval"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Address" className="span-2"><input type="text" value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="Notes" className="span-2"><textarea value={f.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}
