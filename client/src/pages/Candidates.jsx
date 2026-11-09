import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, UserPlus, Download, Upload, FileSpreadsheet, Users, Paperclip } from 'lucide-react';
import { api, qs, fmtDate, fmtPhone, STATUS_LABELS, STATUSES, ENGLISH_LABELS } from '../api.js';
import { useAsync, useDebounced, Spinner, ErrorBox, StatusBadge, Empty, Modal, Alert, useToast, downloadUrl } from '../components/ui.jsx';
import CandidateForm, { toPayload } from '../components/CandidateForm.jsx';
import { useAuth } from '../App.jsx';

const FLAGS = [
  ['driving_licence', 'Driving licence'], ['own_car', 'Own car'], ['forklift', 'Forklift'], ['ept', 'EPT'],
  ['reach_truck', 'Reach truck'], ['has_bsn', 'BSN'], ['has_experience', 'Experience'],
];

export default function Candidates() {
  const [params, setParams] = useSearchParams();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const dq = useDebounced(q);
  const status = params.get('status') || '';
  const english = params.get('english_level') || '';
  const sort = params.get('sort') || 'newest';
  const page = Number(params.get('page') || 1);
  const flags = FLAGS.filter(([k]) => params.get(k) === 'true').map(([k]) => k);
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [showImport, setShowImport] = useState(false);

  const filters = { q: dq, status, english_level: english, sort, ...Object.fromEntries(flags.map((f) => [f, 'true'])) };
  const { data, error, loading, reload } = useAsync(() => api.get(`/candidates${qs({ ...filters, page, limit: 25 })}`), [JSON.stringify(filters), page]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in changes)) next.delete('page');
    next.delete('new');
    setParams(next, { replace: true });
  };
  useEffect(() => { if (dq !== (params.get('q') || '')) update({ q: dq }); /* eslint-disable-next-line */ }, [dq]);

  const exportFile = (format) => downloadUrl(`/api/candidates/export${qs({ ...filters, format })}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Candidates</h1>
          <p>{data ? `${data.total} candidate${data.total === 1 ? '' : 's'}` : 'Loading…'}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => exportFile('xlsx')}><FileSpreadsheet size={16} /> Excel</button>
          <button type="button" className="btn" onClick={() => exportFile('csv')}><Download size={16} /> CSV</button>
          {can('recruiter') && <button type="button" className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Import</button>}
          {can('recruiter') && <button type="button" className="btn primary" onClick={() => setShowNew(true)}><UserPlus size={16} /> Add candidate</button>}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input type="search" placeholder="Search name, phone, email, city, job…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search candidates" />
          </div>
          <select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select value={english} onChange={(e) => update({ english_level: e.target.value })} aria-label="English level">
            <option value="">Any English</option>
            {Object.entries(ENGLISH_LABELS).filter(([k]) => k !== 'none').map(([k, l]) => <option key={k} value={k}>English: {l}+</option>)}
          </select>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="updated">Recently updated</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="toolbar" style={{ paddingTop: 8, paddingBottom: 10 }}>
          <span className="small muted">Must have:</span>
          <div className="chips">
            {FLAGS.map(([k, l]) => (
              <button type="button" key={k} className={`chip ${flags.includes(k) ? 'on' : ''}`} onClick={() => update({ [k]: flags.includes(k) ? '' : 'true' })}>{l}</button>
            ))}
          </div>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : data?.items.length === 0 ? (
          <Empty icon={Users} title="No candidates found">Try other filters, or add a new candidate.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Candidate</th><th>Status</th><th>Location</th><th>Skills</th><th>Desired job</th><th>Registered</th></tr>
              </thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={c.id} className="click" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td>
                      <Link to={`/candidates/${c.id}`} className="name" onClick={(e) => e.stopPropagation()}>{c.full_name || 'Name not known yet'}</Link>
                      <div className="sub">{fmtPhone(c.phone)}{c.file_count > 0 && <> · <Paperclip size={12} style={{ verticalAlign: -1 }} /> CV</>}</div>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="sub">{[c.current_city, c.current_country].filter(Boolean).join(', ') || '—'}</td>
                    <td>
                      <div className="tags">
                        {c.driving_licence && <span className="tag">Licence</span>}
                        {c.own_car && <span className="tag">Car</span>}
                        {c.forklift && <span className="tag">Forklift</span>}
                        {c.ept && <span className="tag">EPT</span>}
                        {c.reach_truck && <span className="tag">Reach</span>}
                        {c.english_level && c.english_level !== 'none' && <span className="tag">EN {c.english_level}</span>}
                      </div>
                    </td>
                    <td className="sub">{c.desired_job || '—'}</td>
                    <td className="sub">{fmtDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="pagination">
            <span>Page {data.page} of {Math.ceil(data.total / data.limit)}</span>
            <div className="actions">
              <button type="button" className="btn sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
              <button type="button" className="btn sm" disabled={page * data.limit >= data.total} onClick={() => update({ page: String(page + 1) })}>Next</button>
            </div>
          </div>
        )}
      </div>

      {showNew && <NewCandidate isAdmin={user.role === 'admin'} onClose={() => { setShowNew(false); update({}); }} onCreated={(c) => navigate(`/candidates/${c.id}`)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => reload()} />}
    </>
  );
}

function NewCandidate({ onClose, onCreated, isAdmin }) {
  const [form, setForm] = useState({ status: 'new', languages: [] });
  const [error, setError] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const phone = useDebounced(form.phone || '', 500);

  useEffect(() => {
    if (phone.replace(/\D/g, '').length < 8) { setDup(null); return; }
    api.get(`/candidates/check-phone${qs({ phone })}`).then((r) => setDup(r.exists ? r : null)).catch(() => {});
  }, [phone]);

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'languages' ? { languages_input: v } : {}) }));
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const c = await api.post('/candidates', toPayload(form));
      toast('Candidate added', 'success');
      onCreated(c);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add candidate" wide onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={submit} disabled={busy || !form.phone || !!dup}>Save candidate</button>
      </>
    )}>
      {error && <div style={{ marginBottom: 12 }}><Alert type="error">{error.message}{error.data?.details?.existingId && <> — <Link to={`/candidates/${error.data.details.existingId}`}>open existing candidate</Link></>}</Alert></div>}
      {dup && <div style={{ marginBottom: 12 }}><Alert type="warn">This phone number already belongs to <Link to={`/candidates/${dup.existingId}`}>{dup.existingName || 'an existing candidate'}</Link>. Duplicates are not allowed.</Alert></div>}
      <CandidateForm value={form} onChange={onChange} isAdmin={isAdmin} />
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setError(null);
    try { const r = await api.upload('/candidates/import', file); setResult(r); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import candidates" onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
        {!result && <button type="button" className="btn primary" disabled={!file || busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>}
      </>
    )}>
      <div className="stack">
        <p className="muted">Upload an Excel (.xlsx) or CSV file. The first row must contain column names like <b>Full name</b>, <b>Phone</b>, <b>Email</b>, <b>City</b>. Candidates whose phone number already exists are skipped.</p>
        <a href="/api/candidates/import-template" className="btn sm" style={{ alignSelf: 'flex-start' }}><Download size={14} /> Download template</a>
        <label className="dropzone">
          <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => setFile(e.target.files[0])} />
          <Upload size={22} /><div>{file ? file.name : 'Click to choose a file'}</div>
        </label>
        <ErrorBox error={error} />
        {result && (
          <Alert type={result.errors.length ? 'warn' : 'success'}>
            <b>{result.created}</b> candidates imported. <b>{result.duplicates.length}</b> duplicates skipped. <b>{result.errors.length}</b> rows with errors.
            {result.errors.slice(0, 8).map((e) => <div key={e.line} className="small">Row {e.line}: {e.error}</div>)}
            {result.duplicates.slice(0, 8).map((d) => <div key={d.line} className="small">Row {d.line}: phone {d.phone} already exists</div>)}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
