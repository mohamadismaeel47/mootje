import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search, Send, Bot, Hand, Check, CheckCheck, Clock, AlertCircle, ArrowLeft, FileText, RefreshCw, BellRing,
  MessageSquarePlus, FlaskConical, Trash2, LayoutTemplate, Timer, UserRound,
} from 'lucide-react';
import { api, qs, fmtPhone, fmtTime, fmtDateTime, STATUS_LABELS } from '../api.js';
import { useAsync, useDebounced, Spinner, Empty, Modal, Field, Alert, ErrorBox, useToast, initials, Confirm } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

const FILTERS = [['', 'Alles'], ['unread', 'Ongelezen'], ['attention', 'Aandacht'], ['auto', 'Automatisch'], ['manual', 'Handmatig'], ['completed', 'Afgerond']];
const CONV_STATUS = { new: 'Nieuw', in_progress: 'Bezig', waiting: 'Wacht op antwoord', completed: 'Afgerond', needs_attention: 'Aandacht nodig', closed: 'Gesloten' };

const QUESTION_NL = { full_name: 'naam', age: 'leeftijd', nationality: 'nationaliteit', location: 'woonplaats', has_bsn: 'BSN', english_level: 'Engels', driving_licence: 'rijbewijs', own_car: 'eigen auto', has_experience: 'ervaring', certificates: 'certificaten', availability: 'beschikbaarheid', desired_job: 'gewenst werk' };
function STEP_LABEL(step) {
  if (!step) return '—';
  if (step.startsWith('q:')) return `Vraag: ${QUESTION_NL[step.slice(2)] || step.slice(2)}`;
  return { intro: 'Eerste vraag', consent: 'Toestemming', all: 'Alle vragen gestuurd', voice: 'Spraakbericht gevraagd', cv: 'Cv gevraagd', vacancy_offer: 'Vacature gestuurd', checkin: 'Zoek je nog werk?', completed: 'Afgerond', not_interested: 'Geen interesse', closed_no_consent: 'Geen toestemming' }[step] || step;
}

function shortTime(d) {
  if (!d) return '';
  const date = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return fmtTime(d);
  return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function Inbox() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const filter = params.get('filter') || '';
  const [showSim, setShowSim] = useState(false);
  const { can } = useAuth();
  const list = useAsync(() => api.get(`/conversations${qs({ q: dq, filter })}`), [dq, filter], { interval: 5000 });

  return (
    <div className={`inbox ${id ? 'has-active' : ''}`}>
      <div className="inbox-list">
        <div className="head">
          <div className="row between">
            <h2>Gesprekken</h2>
            {can('recruiter') && <button type="button" className="btn sm" onClick={() => setShowSim(true)} title="Test de assistent zonder WhatsApp"><FlaskConical size={14} /> Testchat</button>}
          </div>
          <div className="search" style={{ maxWidth: 'none' }}>
            <Search size={16} />
            <input type="search" placeholder="Zoek op naam, telefoon of bericht" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Gesprekken zoeken" />
          </div>
          <div className="chips">
            {FILTERS.map(([k, l]) => <button type="button" key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setParams(k ? { filter: k } : {}, { replace: true })}>{l}</button>)}
          </div>
        </div>
        <div className="items">
          {list.loading && !list.data && <Spinner />}
          {list.data?.length === 0 && <Empty title="Geen gesprekken">Als kandidaten een WhatsApp sturen, verschijnen ze hier.</Empty>}
          {list.data?.map((c) => {
            const name = c.full_name || c.profile_name || fmtPhone(c.phone);
            return (
              <Link key={c.id} to={`/inbox/${c.id}${filter ? `?filter=${filter}` : ''}`} className={`conv ${String(c.id) === id ? 'active' : ''}`}>
                <div className="avatar light">{initials(c.full_name || c.profile_name, '#')}</div>
                <div className="meta">
                  <div className="top"><b>{name}</b><time>{shortTime(c.last_message_at)}</time></div>
                  <div className="row between" style={{ gap: 6 }}>
                    <div className="preview">{c.last_message_preview || 'Nog geen berichten'}</div>
                    {c.unread_count > 0 && <span className="unread">{c.unread_count}</span>}
                  </div>
                  <div className="flags">
                    <span className={`badge ${c.mode === 'auto' ? 'blue' : 'amber'}`}>{c.mode === 'auto' ? <><Bot size={11} /> Auto</> : <><Hand size={11} /> Handmatig</>}</span>
                    {c.status === 'needs_attention' && <span className="badge red">Aandacht</span>}
                    {c.status === 'completed' && <span className="badge green">Afgerond</span>}
                    {c.simulated && <span className="badge purple">Test</span>}
                    {!c.window_open && <span className="badge" title="24-uursvenster gesloten: alleen templates toegestaan"><Timer size={11} /> 24h</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      {id ? <Chat key={id} id={id} onChange={() => list.reload(true)} /> : (
        <div className="chat"><Empty icon={MessageSquarePlus} title="Kies een gesprek">Kies links een gesprek om te lezen en te antwoorden.</Empty></div>
      )}
      {showSim && <Simulator onClose={() => setShowSim(false)} onCreated={() => list.reload(true)} />}
    </div>
  );
}

function StatusIcon({ m }) {
  if (m.direction === 'in') return null;
  switch (m.status) {
    case 'read': return <CheckCheck size={14} color="#2f7de1" aria-label="Gelezen" />;
    case 'delivered': return <CheckCheck size={14} aria-label="Afgeleverd" />;
    case 'sent': return <Check size={14} aria-label="Verstuurd" />;
    case 'failed': return <AlertCircle size={14} color="#c0352b" aria-label="Mislukt" />;
    case 'simulated': return <FlaskConical size={13} aria-label="Test" />;
    default: return <Clock size={13} aria-label="Bezig met versturen" />;
  }
}

function Chat({ id, onChange }) {
  const { data, error, loading, reload } = useAsync(() => api.get(`/conversations/${id}`), [id], { interval: 4000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [simText, setSimText] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const bodyRef = useRef(null);
  const lastCount = useRef(0);
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();

  useEffect(() => {
    if (!data) return;
    if (data.messages.length !== lastCount.current) {
      lastCount.current = data.messages.length;
      requestAnimationFrame(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; });
      onChange();
    }
  }, [data, onChange]);

  if (loading && !data) return <div className="chat"><Spinner /></div>;
  if (error) return <div className="chat"><div style={{ padding: 20 }}><ErrorBox error={error} /></div></div>;
  const c = data;
  const name = c.full_name || c.profile_name || fmtPhone(c.phone);
  const act = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg, 'success'); await reload(true); onChange(); return r; } catch (err) { toast(err.message, 'error'); return null; } finally { setBusy(false); }
  };
  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    const r = await act(() => api.post(`/conversations/${c.id}/messages`, { text }));
    if (r) setText('');
  };
  const sendSim = async (e) => {
    e.preventDefault();
    if (!simText.trim()) return;
    await act(() => api.post('/conversations/simulate', { phone: c.phone, text: simText }));
    setSimText('');
  };
  const setMode = (mode) => act(() => api.post(`/conversations/${c.id}/mode`, { mode }), mode === 'auto' ? 'Assistent aangezet' : 'Je hebt het gesprek overgenomen');

  let lastDay = '';
  return (
    <>
      <div className="chat">
        <div className="chat-head">
          <Link to="/inbox" className="btn ghost icon back-link" aria-label="Terug"><ArrowLeft size={18} /></Link>
          <div className="avatar light">{initials(c.full_name || c.profile_name, '#')}</div>
          <div className="who">
            <b>{name}</b>
            <span className="small muted">{fmtPhone(c.phone)} · {CONV_STATUS[c.status]}</span>
          </div>
          <div className="mode-switch" style={{ width: 210 }}>
            <button type="button" className={c.mode === 'auto' ? 'on' : ''} disabled={busy || !can('recruiter')} onClick={() => c.mode !== 'auto' && setMode('auto')}><Bot size={15} /> Automatisch</button>
            <button type="button" className={c.mode === 'manual' ? 'on' : ''} disabled={busy || !can('recruiter')} onClick={() => c.mode !== 'manual' && setMode('manual')}><Hand size={15} /> Handmatig</button>
          </div>
        </div>
        <div className="chat-body" ref={bodyRef}>
          {c.messages.length === 0 && <div className="day-sep">Nog geen berichten</div>}
          {c.messages.map((m) => {
            const day = new Date(m.created_at).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' });
            const sep = day !== lastDay ? <div className="day-sep">{day}</div> : null;
            lastDay = day;
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {sep}
                <div className={`bubble ${m.direction} ${m.sender === 'bot' ? 'bot' : ''} ${m.status === 'failed' ? 'failed' : ''}`}>
                  {m.direction === 'out' && <div className="who-tag">{m.sender === 'bot' ? 'Assistent' : m.user_name || 'Jij'}{m.template_name ? ` · template ${m.template_name}` : ''}</div>}
                  {m.file_id && m.file_mime?.startsWith('audio/') ? (
                    <div><div className="small" style={{ marginBottom: 4 }}>🎤 Spraakbericht</div><audio controls preload="none" src={`/api/files/${m.file_id}`} style={{ maxWidth: 260 }} /></div>
                  ) : m.file_id ? (
                    <a href={`/api/files/${m.file_id}`} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 6 }}><FileText size={16} /> {m.file_name || 'Bestand'}</a>
                  ) : m.body}
                  {m.error && <div className="err">{m.error}</div>}
                  <div className="foot">{fmtTime(m.created_at)} <StatusIcon m={m} /></div>
                </div>
              </div>
            );
          })}
        </div>
        {c.simulated && (
          <form className="composer" onSubmit={sendSim} style={{ background: '#f6f2ff' }}>
            <div className="small" style={{ color: '#6a3fc8' }}><FlaskConical size={13} style={{ verticalAlign: -2 }} /> Testgesprek — typ hieronder <b>als de kandidaat</b>. Er wordt niets naar WhatsApp gestuurd.</div>
            <div className="row">
              <input type="text" value={simText} onChange={(e) => setSimText(e.target.value)} placeholder="Antwoord van de kandidaat…" aria-label="Testbericht van kandidaat" />
              <button type="submit" className="btn" disabled={busy}><UserRound size={15} /> Versturen als kandidaat</button>
            </div>
          </form>
        )}
        {can('recruiter') && (
          <form className="composer" onSubmit={send}>
            {!c.window_open && (
              <Alert type="warn">De kandidaat schreef meer dan 24 uur geleden voor het laatst. WhatsApp staat nu alleen een <b>goedgekeurde template</b> toe. <button type="button" className="btn sm" onClick={() => setShowTemplate(true)}><LayoutTemplate size={14} /> Template sturen</button></Alert>
            )}
            {c.window_open && c.mode === 'auto' && <div className="small muted">Als je zelf een bericht stuurt, gaat dit gesprek naar <b>handmatig</b>, zodat de assistent je niet stoort.</div>}
            <div className="row">
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={c.window_open ? 'Typ een bericht…' : '24-uursvenster gesloten'} disabled={!c.window_open || busy}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} aria-label="Bericht" />
              <button type="submit" className="btn primary icon" disabled={!c.window_open || busy || !text.trim()} aria-label="Versturen"><Send size={16} /></button>
            </div>
          </form>
        )}
      </div>
      <aside className="chat-side">
        <div>
          <h3 style={{ marginBottom: 8 }}>Kandidaat</h3>
          <div className="stack small">
            <div className="row between"><span className="muted">Status</span><span>{STATUS_LABELS[c.candidate_status]}</span></div>
            <div className="row between"><span className="muted">Taal</span><span>{c.preferred_language === 'nl' ? 'Nederlands' : 'Engels'}</span></div>
            <div className="row between"><span className="muted">Toestemming</span><span>{c.consent_given ? 'Ja' : 'Nee'}</span></div>
            <div className="row between"><span className="muted">Huidige stap</span><span>{STEP_LABEL(c.bot_step)}</span></div>
            <div className="row between"><span className="muted">24-uursvenster</span><span>{c.simulated ? 'Test' : c.window_open ? `Open tot ${fmtTime(c.window_expires_at)}` : 'Gesloten'}</span></div>
            <Link to={`/candidates/${c.candidate_id}`} className="btn sm"><UserRound size={14} /> Profiel openen</Link>
          </div>
        </div>
        {can('recruiter') && (
          <div>
            <h3 style={{ marginBottom: 8 }}>Acties</h3>
            <div className="stack" style={{ gap: 8 }}>
              <button type="button" className="btn sm" disabled={busy} onClick={() => act(() => api.post(`/conversations/${c.id}/follow-up`), 'Herinnering verstuurd')}><BellRing size={14} /> Herinnering sturen</button>
              <button type="button" className="btn sm" disabled={busy} onClick={() => setShowTemplate(true)}><LayoutTemplate size={14} /> Template sturen</button>
              <button type="button" className="btn sm" disabled={busy} onClick={() => act(() => api.post(`/conversations/${c.id}/restart`), 'Inschrijving opnieuw gestart')}><RefreshCw size={14} /> Inschrijving opnieuw starten</button>
              {c.status === 'needs_attention' && <button type="button" className="btn sm" disabled={busy} onClick={() => act(() => api.post(`/conversations/${c.id}/status`, { status: 'in_progress' }), 'Gemarkeerd als afgehandeld')}><Check size={14} /> Markeren als afgehandeld</button>}
              {c.simulated && <button type="button" className="btn sm danger" onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Testchat verwijderen</button>}
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>Een herinnering stuurt de open vraag opnieuw. Na 24 uur gebruikt hij je template voor herinneringen.</p>
          </div>
        )}
      </aside>
      {showTemplate && <TemplateModal conversationId={c.id} name={c.full_name} onClose={() => setShowTemplate(false)} onSent={() => { reload(true); onChange(); }} />}
      {confirmDel && <Confirm title="Testgesprek verwijderen?" danger confirmLabel="Verwijderen" onClose={() => setConfirmDel(false)} onConfirm={async () => { await api.del(`/conversations/${c.id}`); onChange(); navigate('/inbox'); }}><p>De testkandidaat en alle testberichten worden verwijderd.</p></Confirm>}
    </>
  );
}

function TemplateModal({ conversationId, name, onClose, onSent }) {
  const { data, error, loading } = useAsync(() => api.get('/conversations/templates'), []);
  const [sel, setSel] = useState(null);
  const [params, setParams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(null);
  const approved = (data || []).filter((t) => t.status === 'APPROVED');
  const choose = (t) => { setSel(t); setParams(Array.from({ length: t.variables }, (_, i) => (i === 0 && name ? name.split(' ')[0] : ''))); };
  const preview = sel ? sel.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`) : '';
  const send = async () => {
    setBusy(true); setSendError(null);
    try {
      await api.post(`/conversations/${conversationId}/template`, { name: sel.name, language: sel.language, params, preview: `[Template ${sel.name}] ${preview}` });
      onSent(); onClose();
    } catch (err) { setSendError(err); } finally { setBusy(false); }
  };
  return (
    <Modal title="WhatsApp-template sturen" wide onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" disabled={!sel || busy || params.some((p) => !p)} onClick={send}>Template sturen</button></>}>
      <div className="stack">
        <p className="small muted">Templates zijn berichten die Meta heeft goedgekeurd. Je hebt ze nodig om een gesprek te starten of om na 24 uur te schrijven. Maak ze in WhatsApp Manager → Berichttemplates.</p>
        {loading && <Spinner />}
        <ErrorBox error={error} />
        {data && approved.length === 0 && <Alert type="warn">Geen goedgekeurde templates gevonden in je WhatsApp Business-account.</Alert>}
        <div className="grid grid-2">
          {approved.map((t) => (
            <button type="button" key={`${t.name}-${t.language}`} className="card" style={{ textAlign: 'left', padding: 12, cursor: 'pointer', borderColor: sel === t ? '#2f7de1' : undefined, font: 'inherit' }} onClick={() => choose(t)}>
              <b>{t.name}</b> <span className="badge">{t.language}</span> <span className="badge">{t.category}</span>
              <div className="small muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{t.body}</div>
            </button>
          ))}
        </div>
        {sel && params.map((p, i) => (
          <Field key={i} label={`Variabele {{${i + 1}}}`}><input type="text" value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} /></Field>
        ))}
        {sel && <div className="bubble out" style={{ alignSelf: 'flex-start' }}>{preview}</div>}
        <ErrorBox error={sendError} />
      </div>
    </Modal>
  );
}

function Simulator({ onClose, onCreated }) {
  const [text, setText] = useState('Hoi, ik zoek werk');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const start = async () => {
    try {
      const r = await api.post('/conversations/simulate', { text });
      onCreated();
      onClose();
      navigate(`/inbox/${r.conversationId}`);
    } catch (err) { setError(err); }
  };
  return (
    <Modal title="De WhatsApp-assistent testen" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" onClick={start}>Testchat starten</button></>}>
      <div className="stack">
        <Alert type="info">Dit maakt een <b>testgesprek</b>. Jij typt alsof je de kandidaat bent, en de echte assistent antwoordt. Er wordt niets naar WhatsApp gestuurd en Meta wordt niet gebruikt. Zo kun je de vragen en teksten controleren.</Alert>
        <Field label="Eerste bericht van de testkandidaat"><input type="text" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <ErrorBox error={error} />
      </div>
    </Modal>
  );
}

export { fmtDateTime };
