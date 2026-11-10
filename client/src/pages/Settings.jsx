import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MessageCircle, Bot, Mail, Users, ShieldCheck, KeyRound, Copy, CheckCircle2, XCircle, PlugZap, Activity, Save, UserPlus,
} from 'lucide-react';
import { api, fmtDateTime } from '../api.js';
import { useAsync, Spinner, ErrorBox, Alert, Field, Modal, useToast } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

const TABS = [
  ['whatsapp', 'WhatsApp API', MessageCircle, 'admin'], ['bot', 'Assistent', Bot, 'admin'], ['email', 'E-mail', Mail, 'admin'],
  ['users', 'Gebruikers', Users, 'admin'], ['privacy', 'Privacy & logboek', ShieldCheck, 'admin'], ['account', 'Mijn account', KeyRound, 'viewer'],
];

export default function Settings() {
  const { tab = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const tabs = TABS.filter(([, , , r]) => can(r));
  const active = tabs.find(([k]) => k === tab)?.[0] || tabs[0][0];
  const settings = useAsync(() => (can('admin') ? api.get('/settings') : Promise.resolve(null)), []);
  return (
    <>
      <div className="page-head"><div><h1>Instellingen</h1><p>Stel WhatsApp, de assistent, e-mail en gebruikers in.</p></div></div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="tabs">
          {tabs.map(([k, l, I]) => <button type="button" key={k} className={active === k ? 'on' : ''} onClick={() => navigate(`/settings/${k}`)}><I size={15} /> {l}</button>)}
        </div>
      </div>
      {settings.error && <ErrorBox error={settings.error} />}
      {can('admin') && !settings.data && active !== 'account' ? <Spinner /> : (
        <>
          {active === 'whatsapp' && <WhatsAppTab s={settings.data} onSaved={(d) => settings.setData((x) => ({ ...x, ...d }))} reload={() => settings.reload(true)} />}
          {active === 'bot' && <BotTab s={settings.data} reload={() => settings.reload(true)} />}
          {active === 'email' && <EmailTab s={settings.data} reload={() => settings.reload(true)} />}
          {active === 'users' && <UsersTab />}
          {active === 'privacy' && <PrivacyTab s={settings.data} reload={() => settings.reload(true)} />}
          {active === 'account' && <AccountTab />}
        </>
      )}
    </>
  );
}

// Generic settings form for a list of keys.
function SettingsForm({ s, keys, reload, hints = {}, types = {}, options = {} }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const v = {};
    for (const k of keys) v[k] = s.settings[k].secret ? '' : s.settings[k].value;
    setValues(v);
  }, [s, keys.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/settings', { values });
      toast('Instellingen opgeslagen', 'success');
      reload();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="form-grid">
        {keys.map((k) => {
          const def = s.settings[k];
          const fromEnv = def.source === 'env';
          return (
            <Field key={k} label={def.label} hint={fromEnv ? 'Ingesteld in Railway (variabelen). Deze waarde wordt gebruikt en kan hier niet worden aangepast.' : def.secret && def.isSet ? `Opgeslagen (${def.value}). Laat leeg om te bewaren.` : hints[k]}>
              {options[k] ? (
                <select value={values[k] ?? ''} disabled={fromEnv} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                  {options[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input type={def.secret ? 'password' : types[k] || 'text'} autoComplete="off" disabled={fromEnv} value={values[k] ?? ''}
                  placeholder={def.secret && def.isSet ? '•••••••• (opgeslagen)' : ''} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
              )}
            </Field>
          );
        })}
      </div>
      <div><button type="button" className="btn primary" onClick={save} disabled={busy}><Save size={15} /> Opslaan</button></div>
    </div>
  );
}

function CopyField({ value }) {
  const toast = useToast();
  return (
    <div className="copy-box">
      <input type="text" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn icon" aria-label="Kopiëren" onClick={() => { navigator.clipboard?.writeText(value); toast('Gekopieerd', 'success'); }}><Copy size={15} /></button>
    </div>
  );
}

const WA_KEYS = ['whatsapp.access_token', 'whatsapp.phone_number_id', 'whatsapp.business_account_id', 'whatsapp.app_secret', 'whatsapp.verify_token', 'whatsapp.graph_version'];

function WhatsAppTab({ s, reload }) {
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const runTest = async () => {
    setBusy(true); setTest(null);
    try { setTest(await api.post('/settings/whatsapp/test')); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const subscribe = async () => {
    try { await api.post('/settings/whatsapp/subscribe'); toast('App gekoppeld aan je WhatsApp Business-account', 'success'); runTest(); } catch (err) { toast(err.message, 'error'); }
  };
  const verifySet = s.settings['whatsapp.verify_token'].isSet;
  return (
    <div className="split">
      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h3>Meta WhatsApp Business Cloud API</h3></div>
          <div className="card-body stack">
            {s.whatsappMissing.length > 0
              ? <Alert type="warn"><b>WhatsApp is nog niet gekoppeld.</b> Ontbreekt: {s.whatsappMissing.join(', ')}. Zolang dit niet compleet is, kunnen er geen berichten worden verstuurd of ontvangen (gebruik “Testchat” in de inbox om de assistent te proberen).</Alert>
              : <Alert type="info">Alles is ingevuld. Gebruik <b>Verbinding testen</b> om het bij Meta te controleren.</Alert>}
            <SettingsForm s={s} keys={WA_KEYS} reload={reload} hints={{
              'whatsapp.access_token': 'Gebruik een permanente token van een systeemgebruiker (Bedrijfsinstellingen → Systeemgebruikers), niet de testtoken van 24 uur.',
              'whatsapp.phone_number_id': 'Meta-app → WhatsApp → API-instellingen → Phone number ID (niet het telefoonnummer zelf).',
              'whatsapp.business_account_id': 'Het ID van je WhatsApp Business-account (WABA-ID).',
              'whatsapp.app_secret': 'Meta-app → App-instellingen → Algemeen → App-geheim. Hiermee worden webhooks gecontroleerd.',
              'whatsapp.verify_token': 'Een willekeurige tekst die je zelf kiest. Vul precies dezelfde tekst in bij de webhook in Meta.',
              'whatsapp.graph_version': 'Versie van de Graph API, bijv. v23.0',
            }} />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Verbindingstest</h3>
            <div className="actions">
              <button type="button" className="btn sm" onClick={subscribe}><PlugZap size={14} /> App koppelen</button>
              <button type="button" className="btn sm primary" disabled={busy} onClick={runTest}><Activity size={14} /> {busy ? 'Bezig met testen…' : 'Verbinding testen'}</button>
            </div>
          </div>
          <div className="card-body">
            {!test && <p className="muted small">Controleert je token, telefoonnummer, registratie en webhook rechtstreeks bij Meta. Er wordt niets nagedaan: als een controle mislukt, zie je de reden van Meta.</p>}
            {test && (
              <ul className="check-list">
                {test.steps.map((st) => (
                  <li key={st.name}>
                    {st.ok ? <CheckCircle2 size={18} className="ok" /> : <XCircle size={18} className="no" />}
                    <div><b>{st.name}</b><div className="small muted">{st.detail}</div>{st.hint && <div className="small" style={{ color: '#a15c00' }}>{st.hint}</div>}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h3>Webhook voor Meta</h3></div>
          <div className="card-body stack">
            <Field label="Callback URL"><CopyField value={s.webhookUrl} /></Field>
            {!s.publicUrlConfigured && <Alert type="warn">Stel <code>PUBLIC_URL</code> in (in Railway bij Variables) op je openbare <b>https</b>-adres. Meta kan localhost niet bereiken.</Alert>}
            <Field label="Verify token" hint={verifySet ? 'Gebruik de verify token die links is opgeslagen.' : 'Sla eerst een verify token op.'}><input type="text" readOnly value={verifySet ? s.settings['whatsapp.verify_token'].value : '—'} /></Field>
            <div className="small muted">In de Meta-app: <b>WhatsApp → Configuratie → Webhook → Bewerken</b>. Plak de URL en de verify token, klik op <b>Verify and save</b> en zet daarna het veld <b>messages</b> aan (en <b>smb_message_echoes</b> als je Coexistence gebruikt).</div>
          </div>
        </div>
        <WebhookLog />
      </div>
    </div>
  );
}

function WebhookLog() {
  const { data, reload } = useAsync(() => api.get('/settings/webhook-events'), [], { interval: 10000 });
  return (
    <div className="card">
      <div className="card-head"><h3>Webhook-activiteit</h3><button type="button" className="btn sm ghost" onClick={() => reload(true)}>Vernieuwen</button></div>
      <div className="card-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
        {!data?.length && <p className="small muted">Nog geen webhook-berichten ontvangen. Nadat je de webhook in Meta hebt geverifieerd, zie je hier elk bericht (zonder de inhoud).</p>}
        <ul className="check-list small">
          {data?.map((e) => (
            <li key={e.id}>
              {e.ok ? <CheckCircle2 size={15} className="ok" /> : <XCircle size={15} className="no" />}
              <div><b>{e.kind}</b> <span className="faint">{fmtDateTime(e.created_at)}</span><div className="muted">{e.detail}</div></div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BotTab({ s, reload }) {
  return (
    <div className="split">
      <div className="card">
        <div className="card-head"><h3>WhatsApp-assistent</h3></div>
        <div className="card-body">
          <SettingsForm s={s} reload={reload}
            keys={['bot.enabled', 'bot.question_mode', 'bot.recruiter_name', 'bot.ask_consent', 'bot.offer_cv', 'general.default_country_code', 'bot.intro_template_name', 'bot.intro_template_language', 'bot.followup_template_name', 'bot.followup_template_language']}
            options={{ 'bot.enabled': [['true', 'Aan – automatisch antwoorden'], ['false', 'Uit – alle gesprekken handmatig']], 'bot.question_mode': [['all', 'Alle vragen in één bericht'], ['one', 'Eén vraag tegelijk']], 'bot.ask_consent': [['true', 'Ja (aanbevolen)'], ['false', 'Nee']], 'bot.offer_cv': [['true', 'Ja'], ['false', 'Nee']] }}
            hints={{
              'bot.recruiter_name': 'Wordt gebruikt in “Hi! My name is …”',
              'general.default_country_code': 'Voor nummers zoals 06…, bijv. 31 voor Nederland',
              'bot.intro_template_name': 'Goedgekeurde template voor als JIJ het gesprek start (verplicht van WhatsApp).',
              'bot.intro_template_language': 'Taalcode van die template, bijv. en of nl',
              'bot.followup_template_name': 'Goedgekeurde template voor herinneringen na 24 uur.',
            }} />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Zo werkt de assistent</h3></div>
        <div className="card-body stack small">
          <p>1. Een kandidaat stuurt een bericht naar je WhatsApp-nummer (of jij start het gesprek met een template).</p>
          <p>2. De assistent vraagt: <i>“Is it correct that you are looking for a job?”</i> (of in het Nederlands)</p>
          <p>3. Na JA (en privacytoestemming) stuurt hij de 12 vragen — <b>allemaal in één genummerd bericht</b> of <b>één voor één</b> (jij kiest). Elk antwoord wordt meteen opgeslagen. Ontbrekende of onduidelijke antwoorden worden daarna één voor één opnieuw gevraagd.</p>
          <p>4. Vragen die al beantwoord zijn, worden overgeslagen. Begrijpt de kandidaat een vraag niet, dan legt de assistent die uit. Onduidelijke antwoorden worden opnieuw gevraagd (3 keer, daarna krijg jij een melding).</p>
          <p>5. Engels en Nederlands worden ondersteund; de taal wordt automatisch herkend.</p>
          <p>6. Je krijgt een melding als de inschrijving compleet is. Zet een chat op <b>Handmatig</b> om het gesprek over te nemen.</p>
          <p className="muted">Kandidaten kunnen STOP sturen om automatische berichten te stoppen, en DELETE / VERWIJDER om hun gegevens te laten verwijderen.</p>
          <Alert type="info">Voorbeeld van een template voor het eerste bericht (categorie <b>Utility</b> of <b>Marketing</b>): “Hi! My name is Mohamad. Is it correct that you are looking for a job?”</Alert>
        </div>
      </div>
    </div>
  );
}

function EmailTab({ s, reload }) {
  const [to, setTo] = useState('');
  const toast = useToast();
  return (
    <div className="split">
      <div className="card">
        <div className="card-head"><h3>E-mail (SMTP)</h3></div>
        <div className="card-body stack">
          <p className="small muted">Optioneel. Nodig om profielen en cv's na jouw goedkeuring naar bureaus te mailen. Gebruik de SMTP-gegevens van je e-mailprovider (bijv. Microsoft 365, Google Workspace, Brevo).</p>
          <SettingsForm s={s} reload={reload} keys={['smtp.host', 'smtp.port', 'smtp.user', 'smtp.pass', 'smtp.from']} hints={{ 'smtp.from': 'bijv. Recruitmen <jobs@jouwbedrijf.nl>' }} />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Test-e-mail sturen</h3></div>
        <div className="card-body stack">
          {!s.smtpConfigured && <Alert type="warn">SMTP is nog niet ingesteld.</Alert>}
          <Field label="Versturen naar"><input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { try { await api.post('/settings/smtp/test', { to }); toast('Test-e-mail verstuurd', 'success'); } catch (err) { toast(err.message, 'error'); } }}>Test versturen</button>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { data, error, reload } = useAsync(() => api.get('/users'), []);
  const [add, setAdd] = useState(false);
  const { user } = useAuth();
  const toast = useToast();
  const update = async (id, body) => { try { await api.patch(`/users/${id}`, body); reload(true); } catch (err) { toast(err.message, 'error'); } };
  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Gebruikers</h3><div className="small muted">Beheerder: alles. Recruiter: kandidaten, chats, vacatures (geen instellingen, niets verwijderen). Alleen lezen: alleen bekijken.</div></div>
        <button type="button" className="btn primary sm" onClick={() => setAdd(true)}><UserPlus size={14} /> Gebruiker toevoegen</button>
      </div>
      <ErrorBox error={error} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Naam</th><th>Rol</th><th>Laatst ingelogd</th><th>Actief</th></tr></thead>
        <tbody>{data?.map((u) => (
          <tr key={u.id}>
            <td><b>{u.name}</b><div className="sub">{u.email}</div></td>
            <td><select value={u.role} disabled={u.id === user.id} onChange={(e) => update(u.id, { role: e.target.value })} style={{ width: 140 }}><option value="admin">Beheerder</option><option value="recruiter">Recruiter</option><option value="viewer">Alleen lezen</option></select></td>
            <td className="sub">{fmtDateTime(u.last_login_at)}</td>
            <td><label className="checkbox"><input type="checkbox" checked={u.active} disabled={u.id === user.id} onChange={(e) => update(u.id, { active: e.target.checked })} /> {u.active ? 'Actief' : 'Uitgeschakeld'}</label></td>
          </tr>
        ))}</tbody>
      </table></div>
      {add && <AddUser onClose={() => setAdd(false)} onDone={() => reload(true)} />}
    </div>
  );
}

function AddUser({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'recruiter' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => { try { await api.post('/users', f); onDone(); onClose(); } catch (err) { setError(err); } };
  return (
    <Modal title="Gebruiker toevoegen" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Annuleren</button><button type="button" className="btn primary" onClick={save}>Gebruiker maken</button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Naam"><input type="text" value={f.name} onChange={set('name')} /></Field>
        <Field label="E-mail"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Tijdelijk wachtwoord" hint="Minstens 10 tekens met letters en cijfers. Vraag de gebruiker om het te veranderen."><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Rol"><select value={f.role} onChange={set('role')}><option value="recruiter">Recruiter</option><option value="viewer">Alleen lezen</option><option value="admin">Beheerder</option></select></Field>
      </div>
    </Modal>
  );
}

function PrivacyTab({ s, reload }) {
  const { data } = useAsync(() => api.get('/settings/audit-log'), []);
  return (
    <div className="split">
      <div className="card">
        <div className="card-head"><h3>Logboek</h3><span className="small muted">Wie deed wat (laatste 200 acties)</span></div>
        <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}><table className="table">
          <tbody>{data?.map((a) => (
            <tr key={a.id}><td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td><td>{a.user_name || 'Systeem'}</td><td><b>{a.action.replaceAll('_', ' ')}</b> {a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td><td className="sub">{a.detail}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Privacy (AVG)</h3></div>
        <div className="card-body stack small">
          <p>• De assistent vraagt om toestemming voordat hij antwoorden verzamelt (in te stellen bij Assistent).</p>
          <p>• Kandidaten kunnen <b>DELETE</b> / <b>VERWIJDER</b> sturen. Je krijgt een melding en verwijdert het profiel met één klik.</p>
          <p>• Beheerders kunnen alle gegevens van een kandidaat exporteren (recht op inzage) en alles verwijderen (recht op vergetelheid).</p>
          <p>• Alleen “heeft een geldig BSN” (ja/nee) wordt bewaard, nooit het BSN-nummer. API-tokens worden versleuteld opgeslagen.</p>
          <p>• Cv's worden privé opgeslagen en zijn alleen te zien na inloggen.</p>
          <p>• Openbare pagina's voor Meta: <a href="/privacy" target="_blank" rel="noreferrer">privacybeleid</a>, <a href="/terms" target="_blank" rel="noreferrer">voorwaarden</a> en <a href="/data-deletion" target="_blank" rel="noreferrer">gegevens verwijderen</a>.</p>
          <SettingsForm s={s} reload={reload} keys={['privacy.retention_months', 'general.company_name']} types={{ 'privacy.retention_months': 'number' }} hints={{ 'privacy.retention_months': 'Hoe lang je gegevens bewaart. Controleer en verwijder oude kandidaten regelmatig.' }} />
        </div>
      </div>
    </div>
  );
}

function AccountTab() {
  const { user } = useAuth();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const toast = useToast();
  const [error, setError] = useState(null);
  const save = async () => {
    setError(null);
    try { await api.post('/auth/change-password', f); toast('Wachtwoord gewijzigd', 'success'); setF({ currentPassword: '', newPassword: '' }); } catch (err) { setError(err); }
  };
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-head"><h3>Mijn account</h3></div>
      <div className="card-body stack">
        <dl className="details"><dt>Naam</dt><dd>{user.name}</dd><dt>E-mail</dt><dd>{user.email}</dd><dt>Rol</dt><dd>{{ admin: 'Beheerder', recruiter: 'Recruiter', viewer: 'Alleen lezen' }[user.role]}</dd></dl>
        <ErrorBox error={error} />
        <Field label="Huidig wachtwoord"><input type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
        <Field label="Nieuw wachtwoord" hint="Minstens 10 tekens met letters en cijfers."><input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" /></Field>
        <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={save}>Wachtwoord wijzigen</button>
      </div>
    </div>
  );
}
