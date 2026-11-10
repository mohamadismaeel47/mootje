import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MessageCircle, Trash2, FileDown, Check, AlertCircle, Loader2, Upload, FileText, ExternalLink, Download,
  Send, Target, History, UserRound, Paperclip, CheckCircle2, XCircle, HelpCircle,
} from 'lucide-react';
import { api, fmtDate, fmtDateTime, fmtPhone, STATUS_LABELS } from '../api.js';
import {
  useAsync, Spinner, ErrorBox, StatusBadge, SubmissionBadge, Empty, Confirm, Modal, Alert, Field, useToast, initials, scoreColor, downloadUrl,
} from '../components/ui.jsx';
import CandidateForm, { toPayload } from '../components/CandidateForm.jsx';
import { useAuth } from '../App.jsx';

export default function CandidateDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.get(`/candidates/${id}`), [id]);
  const [tab, setTab] = useState('profile');
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [starting, setStarting] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const c = data;

  const startChat = async () => {
    setStarting(true);
    try {
      const r = await api.post(`/conversations/start/${c.id}`);
      toast('Eerste WhatsApp-bericht verstuurd', 'success');
      navigate(`/inbox/${r.conversationId}`);
    } catch (err) { toast(err.message, 'error'); } finally { setStarting(false); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/candidates" className="btn ghost sm"><ArrowLeft size={15} /> Kandidaten</Link>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body row wrap" style={{ gap: 16 }}>
          <div className="avatar lg light">{initials(c.full_name)}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1>{c.full_name || 'Naam nog onbekend'}</h1>
            <div className="row wrap muted small" style={{ marginTop: 4, gap: 12 }}>
              <span>{fmtPhone(c.phone)}</span>
              {c.email && <span>{c.email}</span>}
              <span>Ingeschreven {fmtDate(c.created_at)}</span>
              <span className="badge">{c.source === 'whatsapp' ? 'Via WhatsApp' : c.source === 'import' ? 'Geïmporteerd' : 'Handmatig toegevoegd'}</span>
              {!c.consent_given && <span className="badge amber">Geen privacytoestemming</span>}
            </div>
          </div>
          <StatusBadge status={c.status} />
          <div className="actions">
            {c.conversation
              ? <Link to={`/inbox/${c.conversation.id}`} className="btn blue"><MessageCircle size={16} /> Chat openen{c.conversation.unread_count > 0 ? ` (${c.conversation.unread_count})` : ''}</Link>
              : can('recruiter') && <button type="button" className="btn blue" disabled={starting} onClick={startChat}><MessageCircle size={16} /> WhatsApp starten</button>}
            {can('admin') && <button type="button" className="btn" onClick={() => downloadUrl(`/api/candidates/${c.id}/data-export`)} title="AVG: gegevens exporteren"><FileDown size={16} /> Gegevens exporteren</button>}
            {can('admin') && <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Verwijderen</button>}
          </div>
        </div>
        {c.deletion_requested_at && (
          <div style={{ padding: '0 18px 16px' }}>
            <Alert type="error"><b>Deze kandidaat heeft gevraagd om zijn gegevens te verwijderen</b> op {fmtDateTime(c.deletion_requested_at)} (AVG). Verwijder de kandidaat{can('admin') ? '' : ' (vraag een beheerder)'} en laat het de kandidaat weten.</Alert>
          </div>
        )}
        <div className="tabs">
          {[
            ['profile', 'Profiel', UserRound], ['matches', 'Passende vacatures', Target], ['files', `Cv & bestanden (${c.files.length})`, Paperclip],
            ['submissions', `Bureaus (${c.submissions.length})`, Send], ['history', 'Geschiedenis', History],
          ].map(([k, l, I]) => <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} /> {l}</button>)}
        </div>
      </div>

      {tab === 'profile' && <Profile candidate={c} onSaved={() => reload(true)} />}
      {tab === 'matches' && <Matches candidate={c} onChange={() => reload(true)} />}
      {tab === 'files' && <Files candidate={c} onChange={() => reload(true)} />}
      {tab === 'submissions' && <CandidateSubmissions candidate={c} onChange={() => reload(true)} />}
      {tab === 'history' && (
        <div className="card"><div className="card-body">
          <ul className="timeline">
            {c.history.map((h) => (
              <li key={h.id}>
                <b>{h.from_status ? `${STATUS_LABELS[h.from_status]} → ${STATUS_LABELS[h.to_status]}` : `Aangemaakt als ${STATUS_LABELS[h.to_status]}`}</b>
                <div className="small muted">{fmtDateTime(h.changed_at)} · {h.user_name || 'WhatsApp-assistent / systeem'}</div>
              </li>
            ))}
          </ul>
        </div></div>
      )}

      {confirmDelete && (
        <Confirm title="Kandidaat definitief verwijderen?" danger confirmLabel="Definitief verwijderen" onClose={() => setConfirmDelete(false)}
          onConfirm={async () => { await api.del(`/candidates/${c.id}`); toast('Kandidaat en alle gegevens verwijderd', 'success'); navigate('/candidates'); }}>
          <p>Hiermee verwijder je <b>{c.full_name || fmtPhone(c.phone)}</b>, alle WhatsApp-berichten, cv's en voorstellen aan bureaus. Dit kan niet ongedaan worden gemaakt.</p>
        </Confirm>
      )}
    </>
  );
}

// Profile form with automatic saving.
function Profile({ candidate, onSaved }) {
  const { can, user } = useAuth();
  const [form, setForm] = useState(() => ({ ...candidate, phone_input: fmtPhone(candidate.phone) }));
  const [dirty, setDirty] = useState({});
  const [state, setState] = useState('idle');
  const [errors, setErrors] = useState({});
  const timer = useRef(null);
  const editable = can('recruiter');

  const save = useCallback(async (fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    setState('saving');
    try {
      const payload = toPayload(Object.fromEntries(keys.map((k) => [k, fields[k]])));
      await api.patch(`/candidates/${candidate.id}`, payload);
      setDirty((d) => { const n = { ...d }; for (const k of keys) if (n[k] === fields[k]) delete n[k]; return n; });
      setErrors({});
      setState('saved');
      onSaved();
    } catch (err) {
      const field = err.message.split(':')[0];
      setErrors({ [field]: err.message.replace(/^[^:]+:\s*/, '') });
      setState('error');
    }
  }, [candidate.id, onSaved]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!Object.keys(dirty).length) return undefined;
    const fields = { ...dirty };
    timer.current = setTimeout(() => save(fields), 900);
    return () => clearTimeout(timer.current);
  }, [dirty, save]);

  const onChange = (k, v) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === 'phone' ? { phone_input: v } : {}), ...(k === 'languages' ? { languages_input: v } : {}) }));
    setDirty((d) => ({ ...d, [k]: v }));
    setState('pending');
  };

  return (
    <div className="split">
      <div className="card">
        <div className="card-head">
          <h3>Profiel kandidaat</h3>
          <span className={`saved-indicator ${state === 'saved' ? 'ok' : state === 'error' ? 'err' : ''}`}>
            {state === 'saving' || state === 'pending' ? <><Loader2 size={14} className="spin" /> Opslaan…</> : state === 'saved' ? <><Check size={14} /> Alles opgeslagen</> : state === 'error' ? <><AlertCircle size={14} /> Niet opgeslagen – controleer het veld</> : 'Wijzigingen worden automatisch opgeslagen'}
          </span>
        </div>
        <div className="card-body">
          <CandidateForm value={form} onChange={onChange} disabled={!editable} isAdmin={user.role === 'admin'} errors={errors} />
        </div>
      </div>
      <div className="stack">
        <div className="card">
          <div className="card-head"><h3>Voortgang inschrijving</h3></div>
          <div className="card-body"><Progress c={candidate} /></div>
        </div>
        {candidate.conversation && (
          <div className="card">
            <div className="card-head"><h3>WhatsApp</h3><Link to={`/inbox/${candidate.conversation.id}`} className="small">Chat openen</Link></div>
            <div className="card-body stack small">
              <div className="row between"><span className="muted">Modus</span><span className={`badge ${candidate.conversation.mode === 'auto' ? 'blue' : 'amber'}`}>{candidate.conversation.mode === 'auto' ? 'Automatisch' : 'Handmatig'}</span></div>
              <div className="row between"><span className="muted">Status</span><span>{{ new: 'Nieuw', in_progress: 'Bezig', waiting: 'Wacht op antwoord', completed: 'Afgerond', needs_attention: 'Aandacht nodig', closed: 'Gesloten' }[candidate.conversation.status]}</span></div>
              <div className="row between"><span className="muted">Laatste bericht</span><span>{fmtDateTime(candidate.conversation.last_message_at)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const REQUIRED = [
  ['Volledige naam', (c) => c.full_name], ['Leeftijd', (c) => c.age != null], ['Nationaliteit', (c) => c.nationality],
  ['Woonplaats', (c) => c.current_city || c.current_country], ['BSN (ja/nee)', (c) => c.has_bsn != null], ['Engels', (c) => c.english_level],
  ['Rijbewijs', (c) => c.driving_licence != null], ['Eigen auto', (c) => c.own_car != null], ['Ervaring', (c) => c.has_experience != null],
  ['Certificaten', (c) => c.forklift != null && c.ept != null && c.reach_truck != null], ['Beschikbaarheid', (c) => c.availability || c.available_from],
  ['Gewenst werk', (c) => c.desired_job],
];

function Progress({ c }) {
  const done = REQUIRED.filter(([, f]) => f(c)).length;
  const pct = Math.round((done / REQUIRED.length) * 100);
  return (
    <div className="stack">
      <div className="row between"><b>{done} van {REQUIRED.length} beantwoord</b><span className="muted">{pct}%</span></div>
      <div className={`progress ${pct === 100 ? 'green' : ''}`}><div style={{ width: `${pct}%` }} /></div>
      <ul className="check-list small">
        {REQUIRED.map(([l, f]) => (
          <li key={l}>{f(c) ? <CheckCircle2 size={16} className="ok" /> : <HelpCircle size={16} className="faint" />}<span className={f(c) ? '' : 'muted'}>{l}</span></li>
        ))}
      </ul>
    </div>
  );
}

export function MatchChecks({ m }) {
  return (
    <>
      <div className="checks">
        {m.checks.map((ch) => (
          <span key={ch.label} className={`check ${ch.ok ? 'ok' : ch.unknown ? 'unknown' : 'no'}`} title={ch.detail}>
            {ch.ok ? <CheckCircle2 size={14} /> : ch.unknown ? <HelpCircle size={14} /> : <XCircle size={14} />} {ch.detail}
          </span>
        ))}
      </div>
      {m.info.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>{m.info.join(' · ')}</div>}
    </>
  );
}

function Matches({ candidate, onChange }) {
  const { data, error, loading, reload } = useAsync(() => api.get(`/candidates/${candidate.id}/matches`), [candidate.id]);
  const { can } = useAuth();
  const toast = useToast();
  const propose = async (m) => {
    try {
      await api.post('/submissions', { candidate_id: candidate.id, vacancy_id: m.vacancy.id });
      toast('Voorstel gemaakt. Keur het goed in het tabblad "Bureaus" om het te versturen.', 'success');
      reload(true); onChange();
    } catch (err) { toast(err.message, 'error'); }
  };
  if (loading && !data) return <Spinner />;
  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Passende vacatures</h3><div className="small muted">Open vacatures vergeleken met de antwoorden van deze kandidaat. Er wordt niets verstuurd zonder jouw goedkeuring.</div></div>
      </div>
      <ErrorBox error={error} />
      {data?.length === 0 && <Empty icon={Target} title="Geen open vacatures">Voeg vacatures toe om matches te zien.</Empty>}
      {data?.map((m) => (
        <div key={m.vacancy.id} className="match">
          <div className="row wrap">
            <span className={`score ${scoreColor(m.score)}`}>{m.score}%</span>
            <div style={{ flex: 1, minWidth: 180 }}>
              <Link to={`/vacancies/${m.vacancy.id}`} className="name"><b>{m.vacancy.title}</b></Link>
              <div className="small muted">{[m.vacancy.agency_name, m.vacancy.location, m.vacancy.salary].filter(Boolean).join(' · ')}</div>
            </div>
            {!m.eligible && <span className="badge red">Voldoet niet aan de eisen</span>}
            {m.submission_status ? <SubmissionBadge status={m.submission_status} /> : can('recruiter') && (
              <button type="button" className="btn sm" onClick={() => propose(m)} disabled={!m.vacancy.agency_id} title={m.vacancy.agency_id ? '' : 'Vacature heeft geen bureau'}><Send size={14} /> Voorstellen</button>
            )}
          </div>
          <MatchChecks m={m} />
        </div>
      ))}
    </div>
  );
}

function Files({ candidate, onChange }) {
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [del, setDel] = useState(null);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { await api.upload(`/candidates/${candidate.id}/files`, file, { kind: 'cv' }); toast('Bestand geüpload', 'success'); onChange(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="card-head"><h3>Cv &amp; bestanden</h3><span className="small muted">PDF, Word, JPG of PNG · max 10 MB · privé opgeslagen</span></div>
      <div className="card-body stack">
        {can('recruiter') && (
          <label className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}>
            <input type="file" hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={(e) => upload(e.target.files[0])} />
            <Upload size={22} /><div>{busy ? 'Bezig met uploaden…' : 'Sleep een cv hierheen of klik om te uploaden'}</div>
          </label>
        )}
        {candidate.files.length === 0 ? <p className="muted small">Nog geen bestanden. Kandidaten kunnen hun cv ook via WhatsApp sturen.</p> : (
          <div>
            {candidate.files.map((f) => (
              <div key={f.id} className="file-row">
                <FileText size={22} className="faint" />
                <div className="meta"><b>{f.original_name}</b><span className="small muted">{(f.size_bytes / 1024).toFixed(0)} KB · {f.source === 'whatsapp' ? 'Ontvangen via WhatsApp' : 'Geüpload'} · {fmtDateTime(f.created_at)}</span></div>
                <a className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Openen</a>
                <a className="btn sm" href={`/api/files/${f.id}?download=1`}><Download size={14} /> Downloaden</a>
                {can('recruiter') && <button type="button" className="btn sm danger icon" aria-label="Bestand verwijderen" onClick={() => setDel(f)}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
      {del && <Confirm title="Bestand verwijderen?" danger confirmLabel="Verwijderen" onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/files/${del.id}`); onChange(); }}><p><b>{del.original_name}</b> verwijderen?</p></Confirm>}
    </div>
  );
}

function CandidateSubmissions({ candidate, onChange }) {
  const { can } = useAuth();
  const [sendItem, setSendItem] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Bureaus &amp; vacatures</h3>
        {can('recruiter') && <button type="button" className="btn sm" onClick={() => setShowAdd(true)}><Send size={14} /> Voorstellen aan bureau</button>}
      </div>
      {candidate.submissions.length === 0 ? <Empty icon={Send} title="Nog niet voorgesteld">Gebruik “Passende vacatures” of de knop hierboven.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vacature</th><th>Bureau</th><th>Match</th><th>Status</th><th>Verstuurd</th><th /></tr></thead>
            <tbody>
              {candidate.submissions.map((s) => (
                <tr key={s.id}>
                  <td>{s.vacancy_id ? <Link to={`/vacancies/${s.vacancy_id}`}>{s.vacancy_title}</Link> : '—'}</td>
                  <td>{s.agency_name || '—'}</td>
                  <td>{s.match_score != null ? `${s.match_score}%` : '—'}</td>
                  <td><SubmissionBadge status={s.status} /></td>
                  <td className="sub">{fmtDateTime(s.sent_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {s.status === 'proposed' && can('recruiter') && <button type="button" className="btn sm primary" onClick={() => setSendItem(s)}><Check size={14} /> Goedkeuren &amp; versturen</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sendItem && <SendModal submission={{ ...sendItem, full_name: candidate.full_name, candidate_id: candidate.id }} files={candidate.files} consent={candidate.consent_given} onClose={() => setSendItem(null)} onDone={onChange} />}
      {showAdd && <ProposeModal candidateId={candidate.id} onClose={() => setShowAdd(false)} onDone={onChange} />}
    </div>
  );
}

export function ProposeModal({ candidateId, onClose, onDone }) {
  const { data: agencies } = useAsync(() => api.get('/agencies'), []);
  const { data: vacancies } = useAsync(() => api.get('/vacancies?status=open'), []);
  const [form, setForm] = useState({ agency_id: '', vacancy_id: '', notes: '' });
  const [error, setError] = useState(null);
  const toast = useToast();
  const submit = async () => {
    try {
      await api.post('/submissions', { candidate_id: candidateId, agency_id: form.agency_id || null, vacancy_id: form.vacancy_id || null, notes: form.notes || null });
      toast('Voorstel gemaakt', 'success'); onDone(); onClose();
    } catch (err) { setError(err); }
  };
  return (
    <Modal title="Voorstellen aan bureau" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" onClick={submit}>Voorstel maken</button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Vacature (optioneel)">
          <select value={form.vacancy_id} onChange={(e) => {
            const v = vacancies?.find((x) => String(x.id) === e.target.value);
            setForm({ ...form, vacancy_id: e.target.value, agency_id: v?.agency_id ? String(v.agency_id) : form.agency_id });
          }}>
            <option value="">— Geen specifieke vacature —</option>
            {vacancies?.map((v) => <option key={v.id} value={v.id}>{v.title}{v.agency_name ? ` (${v.agency_name})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Bureau">
          <select value={form.agency_id} onChange={(e) => setForm({ ...form, agency_id: e.target.value })}>
            <option value="">Kies een bureau…</option>
            {agencies?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Notities"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <p className="small muted">Dit maakt alleen een voorstel. In de volgende stap keur je het goed en verstuur je het.</p>
      </div>
    </Modal>
  );
}

export function SendModal({ submission, files, consent, onClose, onDone }) {
  const [sendEmail, setSendEmail] = useState(false);
  const [cv, setCv] = useState(files?.[0]?.id ? String(files[0].id) : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/submissions/${submission.id}/send`, { confirm: true, send_email: sendEmail, cv_file_id: cv ? Number(cv) : null });
      toast(r.emailed ? 'Kandidaat gemaild naar het bureau' : 'Gemarkeerd als verstuurd naar het bureau', 'success');
      onDone(); onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="Goedkeuren en versturen naar bureau" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" onClick={submit} disabled={busy}><Check size={15} /> Ik keur goed – versturen</button></>}>
      <div className="stack">
        <p>Je gaat <b>{submission.full_name || 'deze kandidaat'}</b> versturen naar <b>{submission.agency_name}</b>{submission.vacancy_title ? <> voor <b>{submission.vacancy_title}</b></> : null}.</p>
        {!consent && <Alert type="warn">Deze kandidaat heeft geen privacytoestemming gegeven. Vraag eerst toestemming voordat je gegevens deelt met een bureau.</Alert>}
        <Field label="Cv bijvoegen">
          <select value={cv} onChange={(e) => setCv(e.target.value)}>
            <option value="">Geen cv</option>
            {files?.map((f) => <option key={f.id} value={f.id}>{f.original_name}</option>)}
          </select>
        </Field>
        <label className="checkbox"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Het profiel {cv ? 'en het cv ' : ''}nu naar het bureau mailen</label>
        <p className="small muted">Zonder e-mail wordt het voorstel alleen als “verstuurd” gemarkeerd (bijvoorbeeld als je het zelf verstuurt). Voor e-mail zijn SMTP-instellingen nodig.</p>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}
