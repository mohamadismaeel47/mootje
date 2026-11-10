import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, UserPlus, Download, Upload, FileSpreadsheet, Users, Paperclip, MessageCircleQuestionMark } from 'lucide-react';
import { api, qs, fmtDate, fmtPhone, STATUS_LABELS, STATUSES, ENGLISH_LABELS } from '../api.js';
import { useAsync, useDebounced, Spinner, ErrorBox, StatusBadge, Empty, Modal, Alert, useToast, downloadUrl, CallButton } from '../components/ui.jsx';
import CandidateForm, { toPayload } from '../components/CandidateForm.jsx';
import { useAuth } from '../App.jsx';

const FLAGS = [
  ['driving_licence', 'Rijbewijs'], ['own_car', 'Eigen auto'], ['forklift', 'Heftruck'], ['ept', 'EPT'],
  ['reach_truck', 'Reachtruck'], ['has_bsn', 'BSN'], ['has_experience', 'Ervaring'],
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
  const [showCheckin, setShowCheckin] = useState(false);

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
          <h1>Kandidaten</h1>
          <p>{data ? `${data.total} kandida${data.total === 1 ? 'at' : 'ten'}` : 'Laden…'}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => exportFile('xlsx')}><FileSpreadsheet size={16} /> Excel</button>
          <button type="button" className="btn" onClick={() => exportFile('csv')}><Download size={16} /> CSV</button>
          {can('recruiter') && <button type="button" className="btn" onClick={() => setShowCheckin(true)}><MessageCircleQuestionMark size={16} /> Zoek je nog werk?</button>}
          {can('recruiter') && <button type="button" className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Importeren</button>}
          {can('recruiter') && <button type="button" className="btn primary" onClick={() => setShowNew(true)}><UserPlus size={16} /> Kandidaat toevoegen</button>}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input type="search" placeholder="Zoek op naam, telefoon, e-mail, plaats, werk…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kandidaten zoeken" />
          </div>
          <select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">Alle statussen</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select value={english} onChange={(e) => update({ english_level: e.target.value })} aria-label="Niveau Engels">
            <option value="">Elk niveau Engels</option>
            {Object.entries(ENGLISH_LABELS).filter(([k]) => k !== 'none').map(([k, l]) => <option key={k} value={k}>Engels: {l}+</option>)}
          </select>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sorteren">
            <option value="newest">Nieuwste eerst</option>
            <option value="oldest">Oudste eerst</option>
            <option value="updated">Laatst gewijzigd</option>
            <option value="name">Naam A–Z</option>
          </select>
        </div>
        <div className="toolbar" style={{ paddingTop: 8, paddingBottom: 10 }}>
          <span className="small muted">Moet hebben:</span>
          <div className="chips">
            {FLAGS.map(([k, l]) => (
              <button type="button" key={k} className={`chip ${flags.includes(k) ? 'on' : ''}`} onClick={() => update({ [k]: flags.includes(k) ? '' : 'true' })}>{l}</button>
            ))}
          </div>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? <Spinner /> : data?.items.length === 0 ? (
          <Empty icon={Users} title="Geen kandidaten gevonden">Probeer andere filters, of voeg een nieuwe kandidaat toe.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Kandidaat</th><th>Status</th><th>Woonplaats</th><th>Vaardigheden</th><th>Gewenst werk</th><th>Ingeschreven</th><th /></tr>
              </thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={c.id} className="click" onClick={() => navigate(`/candidates/${c.id}`)}>
                    <td>
                      <Link to={`/candidates/${c.id}`} className="name" onClick={(e) => e.stopPropagation()}>{c.full_name || 'Naam nog onbekend'}</Link>
                      <div className="sub">{fmtPhone(c.phone)}{c.file_count > 0 && <> · <Paperclip size={12} style={{ verticalAlign: -1 }} /> CV</>}</div>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="sub">{[c.current_city, c.current_country].filter(Boolean).join(', ') || '—'}</td>
                    <td>
                      <div className="tags">
                        {c.driving_licence && <span className="tag">Rijbewijs</span>}
                        {c.own_car && <span className="tag">Auto</span>}
                        {c.forklift && <span className="tag">Heftruck</span>}
                        {c.ept && <span className="tag">EPT</span>}
                        {c.reach_truck && <span className="tag">Reach</span>}
                        {c.english_level && c.english_level !== 'none' && <span className="tag">Engels {ENGLISH_LABELS[c.english_level]}</span>}
                      </div>
                    </td>
                    <td className="sub">{c.desired_job || '—'}</td>
                    <td className="sub">{fmtDate(c.created_at)}</td>
                    <td style={{ textAlign: 'right' }}><CallButton phone={c.phone} small iconOnly /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="pagination">
            <span>Pagina {data.page} van {Math.ceil(data.total / data.limit)}</span>
            <div className="actions">
              <button type="button" className="btn sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Vorige</button>
              <button type="button" className="btn sm" disabled={page * data.limit >= data.total} onClick={() => update({ page: String(page + 1) })}>Volgende</button>
            </div>
          </div>
        )}
      </div>

      {showNew && <NewCandidate isAdmin={user.role === 'admin'} onClose={() => { setShowNew(false); update({}); }} onCreated={(c) => navigate(`/candidates/${c.id}`)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => reload()} />}
      {showCheckin && <CheckinModal onClose={() => setShowCheckin(false)} onDone={() => reload(true)} />}
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
      toast('Kandidaat toegevoegd', 'success');
      onCreated(c);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="Kandidaat toevoegen" wide onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={submit} disabled={busy || !form.phone || !!dup}>Kandidaat opslaan</button>
      </>
    )}>
      {error && <div style={{ marginBottom: 12 }}><Alert type="error">{error.message}{error.data?.details?.existingId && <> — <Link to={`/candidates/${error.data.details.existingId}`}>bestaande kandidaat openen</Link></>}</Alert></div>}
      {dup && <div style={{ marginBottom: 12 }}><Alert type="warn">Dit telefoonnummer hoort al bij <Link to={`/candidates/${dup.existingId}`}>{dup.existingName || 'een bestaande kandidaat'}</Link>. Dubbele kandidaten zijn niet toegestaan.</Alert></div>}
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
    <Modal title="Kandidaten importeren" onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>{result ? 'Sluiten' : 'Annuleren'}</button>
        {!result && <button type="button" className="btn primary" disabled={!file || busy} onClick={run}>{busy ? 'Bezig met importeren…' : 'Importeren'}</button>}
      </>
    )}>
      <div className="stack">
        <p className="muted">Upload een Excel-bestand (.xlsx) of CSV-bestand. In de eerste rij staan kolomnamen zoals <b>Full name</b>, <b>Phone</b>, <b>Email</b>, <b>City</b> (gebruik het voorbeeldbestand). Kandidaten met een telefoonnummer dat al bestaat, worden overgeslagen.</p>
        <a href="/api/candidates/import-template" className="btn sm" style={{ alignSelf: 'flex-start' }}><Download size={14} /> Voorbeeldbestand downloaden</a>
        <label className="dropzone">
          <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => setFile(e.target.files[0])} />
          <Upload size={22} /><div>{file ? file.name : 'Klik om een bestand te kiezen'}</div>
        </label>
        <ErrorBox error={error} />
        {result && (
          <Alert type={result.errors.length ? 'warn' : 'success'}>
            <b>{result.created}</b> kandidaten geïmporteerd. <b>{result.duplicates.length}</b> dubbele overgeslagen. <b>{result.errors.length}</b> rijen met fouten.
            {result.errors.slice(0, 8).map((e) => <div key={e.line} className="small">Rij {e.line}: {e.error}</div>)}
            {result.duplicates.slice(0, 8).map((d) => <div key={d.line} className="small">Rij {d.line}: telefoon {d.phone} bestaat al</div>)}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

// "Are you still looking for work?" to every candidate who is not placed.
function CheckinModal({ onClose, onDone }) {
  const { data: preview, error: previewError } = useAsync(() => api.get('/candidates/checkin-preview'), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const send = async () => {
    setBusy(true); setError(null);
    try { const r = await api.post('/candidates/checkin', { confirm: true }); setResult(r); onDone(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const reachable = preview ? preview.in_window + (preview.template_set ? preview.outside_window : 0) : 0;
  return (
    <Modal title="Vragen of kandidaten nog werk zoeken" onClose={onClose} footer={result
      ? <button type="button" className="btn primary" onClick={onClose}>Sluiten</button>
      : <><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" disabled={busy || !preview || reachable === 0} onClick={send}>{busy ? 'Bezig met versturen…' : `Versturen naar ${reachable}`}</button></>}>
      <div className="stack">
        <ErrorBox error={previewError || error} />
        {!result && preview && (
          <>
            <p>Alle kandidaten die <b>nog niet geplaatst</b> zijn (en niet “geen interesse” hebben gezegd) krijgen dit bericht, in hun eigen taal:</p>
            <div className="bubble out" style={{ alignSelf: 'stretch', maxWidth: 'none' }}>Hoi Anna! Zoek je nog werk? Antwoord JA of NEE.</div>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li><b>{preview.total}</b> kandidaten komen in aanmerking (wie de afgelopen 7 dagen al gevraagd is, slaan we over).</li>
              <li><b>{preview.in_window}</b> schreven de afgelopen 24 uur zelf: zij krijgen een gewoon bericht.</li>
              <li><b>{preview.outside_window}</b> schreven langer geleden: {preview.template_set ? 'zij krijgen je goedgekeurde template.' : <b>zij worden overgeslagen, omdat er nog geen template is ingesteld (Instellingen → Assistent).</b>}</li>
            </ul>
            <Alert type="info">JA → status wordt <b>Beschikbaar</b>. NEE → status wordt <b>Geen interesse</b> en je krijgt een melding.</Alert>
          </>
        )}
        {result && (
          <Alert type={result.sent ? 'success' : 'warn'}>
            <b>{result.sent}</b> verstuurd.
            {result.needs_template > 0 && <> <b>{result.needs_template}</b> overgeslagen (template nodig).</>}
            {result.failed > 0 && <> <b>{result.failed}</b> mislukt.</>}
          </Alert>
        )}
      </div>
    </Modal>
  );
}
