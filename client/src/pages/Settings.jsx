import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MessageCircle, Bot, Mail, Users, ShieldCheck, KeyRound, Copy, CheckCircle2, XCircle, PlugZap, Activity, Save, UserPlus,
} from 'lucide-react';
import { api, fmtDateTime } from '../api.js';
import { useAsync, Spinner, ErrorBox, Alert, Field, Modal, useToast } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

const TABS = [
  ['whatsapp', 'WhatsApp API', MessageCircle, 'admin'], ['bot', 'Assistant', Bot, 'admin'], ['email', 'Email', Mail, 'admin'],
  ['users', 'Users', Users, 'admin'], ['privacy', 'Privacy & logs', ShieldCheck, 'admin'], ['account', 'My account', KeyRound, 'viewer'],
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
      <div className="page-head"><div><h1>Settings</h1><p>Configure WhatsApp, the assistant, email and user access.</p></div></div>
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
      toast('Settings saved', 'success');
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
            <Field key={k} label={def.label} hint={fromEnv ? 'Set in the server .env file (this value is used and cannot be changed here).' : def.secret && def.isSet ? `Saved (${def.value}). Leave empty to keep it.` : hints[k]}>
              {options[k] ? (
                <select value={values[k] ?? ''} disabled={fromEnv} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                  {options[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input type={def.secret ? 'password' : types[k] || 'text'} autoComplete="off" disabled={fromEnv} value={values[k] ?? ''}
                  placeholder={def.secret && def.isSet ? '•••••••• (saved)' : ''} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
              )}
            </Field>
          );
        })}
      </div>
      <div><button type="button" className="btn primary" onClick={save} disabled={busy}><Save size={15} /> Save</button></div>
    </div>
  );
}

function CopyField({ value }) {
  const toast = useToast();
  return (
    <div className="copy-box">
      <input type="text" readOnly value={value} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn icon" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(value); toast('Copied', 'success'); }}><Copy size={15} /></button>
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
    try { await api.post('/settings/whatsapp/subscribe'); toast('App subscribed to your WhatsApp Business Account', 'success'); runTest(); } catch (err) { toast(err.message, 'error'); }
  };
  const verifySet = s.settings['whatsapp.verify_token'].isSet;
  return (
    <div className="split">
      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h3>Meta WhatsApp Business Cloud API</h3></div>
          <div className="card-body stack">
            {s.whatsappMissing.length > 0
              ? <Alert type="warn"><b>WhatsApp is not connected yet.</b> Missing: {s.whatsappMissing.join(', ')}. Until this is complete, messages cannot be sent or received (use “Test chat” in the inbox to try the assistant).</Alert>
              : <Alert type="info">All values are filled in. Use <b>Test connection</b> to check them with Meta.</Alert>}
            <SettingsForm s={s} keys={WA_KEYS} reload={reload} hints={{
              'whatsapp.access_token': 'Use a permanent System User token (Business Settings → System users), not the 24-hour test token.',
              'whatsapp.phone_number_id': 'WhatsApp Manager / App dashboard → API Setup → Phone number ID (not the phone number itself).',
              'whatsapp.business_account_id': 'The WhatsApp Business Account ID (WABA ID).',
              'whatsapp.app_secret': 'Meta app → App settings → Basic → App secret. Used to check webhook signatures.',
              'whatsapp.verify_token': 'Any random text you choose. Enter exactly the same text in the Meta webhook settings.',
              'whatsapp.graph_version': 'Graph API version, e.g. v23.0',
            }} />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Connection test</h3>
            <div className="actions">
              <button type="button" className="btn sm" onClick={subscribe}><PlugZap size={14} /> Subscribe app</button>
              <button type="button" className="btn sm primary" disabled={busy} onClick={runTest}><Activity size={14} /> {busy ? 'Testing…' : 'Test connection'}</button>
            </div>
          </div>
          <div className="card-body">
            {!test && <p className="muted small">Checks your token, phone number, registration and webhook subscription directly with Meta. Nothing is faked: if a check fails, the reason from Meta is shown.</p>}
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
          <div className="card-head"><h3>Webhook for Meta</h3></div>
          <div className="card-body stack">
            <Field label="Callback URL"><CopyField value={s.webhookUrl} /></Field>
            {!s.publicUrlConfigured && <Alert type="warn">Set <code>PUBLIC_URL</code> in the server .env to your public <b>https</b> address. Meta cannot reach localhost.</Alert>}
            <Field label="Verify token" hint={verifySet ? 'Use the verify token you saved on the left.' : 'Save a verify token first.'}><input type="text" readOnly value={verifySet ? s.settings['whatsapp.verify_token'].value : '—'} /></Field>
            <div className="small muted">In the Meta app: <b>WhatsApp → Configuration → Webhook → Edit</b>. Paste the URL and verify token, click <b>Verify and save</b>, then subscribe to the <b>messages</b> field (and <b>smb_message_echoes</b> if you use Coexistence).</div>
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
      <div className="card-head"><h3>Webhook activity</h3><button type="button" className="btn sm ghost" onClick={() => reload(true)}>Refresh</button></div>
      <div className="card-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
        {!data?.length && <p className="small muted">No webhook calls received yet. After you verify the webhook in Meta, every call appears here (without message contents).</p>}
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
        <div className="card-head"><h3>WhatsApp assistant</h3></div>
        <div className="card-body">
          <SettingsForm s={s} reload={reload}
            keys={['bot.enabled', 'bot.recruiter_name', 'bot.ask_consent', 'bot.offer_cv', 'general.default_country_code', 'bot.intro_template_name', 'bot.intro_template_language', 'bot.followup_template_name', 'bot.followup_template_language']}
            options={{ 'bot.enabled': [['true', 'On – reply automatically'], ['false', 'Off – all conversations manual']], 'bot.ask_consent': [['true', 'Yes (recommended)'], ['false', 'No']], 'bot.offer_cv': [['true', 'Yes'], ['false', 'No']] }}
            hints={{
              'bot.recruiter_name': 'Used in “Hi! My name is …”',
              'general.default_country_code': 'For numbers like 06…, e.g. 31 for the Netherlands',
              'bot.intro_template_name': 'Approved template used when YOU start the conversation (required by WhatsApp).',
              'bot.intro_template_language': 'Language code of that template, e.g. en or nl',
              'bot.followup_template_name': 'Approved template for follow-ups after 24 hours.',
            }} />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>How the assistant works</h3></div>
        <div className="card-body stack small">
          <p>1. A candidate writes to your WhatsApp number (or you start the chat with a template).</p>
          <p>2. The assistant asks: <i>“Is it correct that you are looking for a job?”</i></p>
          <p>3. After YES (and privacy consent) it asks 12 questions, <b>one at a time</b>. Every answer is saved immediately in the profile.</p>
          <p>4. Questions that are already answered are skipped. If the candidate does not understand, it explains the question. Unclear answers are asked again (3 tries, then you get a notification).</p>
          <p>5. English and Dutch are supported; the language is detected automatically.</p>
          <p>6. You get a notification when the registration is complete. Switch a chat to <b>Manual</b> at any time to take over.</p>
          <p className="muted">Candidates can send STOP to stop automatic messages and DELETE to ask for data deletion.</p>
          <Alert type="info">Template example for the first message (category <b>Utility</b> or <b>Marketing</b>): “Hi! My name is Mohamad. Is it correct that you are looking for a job?”</Alert>
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
        <div className="card-head"><h3>Email (SMTP)</h3></div>
        <div className="card-body stack">
          <p className="small muted">Optional. Needed to email candidate profiles and CVs to agencies after your approval. Use the SMTP details of your email provider (e.g. Microsoft 365, Google Workspace, Brevo).</p>
          <SettingsForm s={s} reload={reload} keys={['smtp.host', 'smtp.port', 'smtp.user', 'smtp.pass', 'smtp.from']} hints={{ 'smtp.from': 'e.g. Recruitment <jobs@yourcompany.nl>' }} />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Send test email</h3></div>
        <div className="card-body stack">
          {!s.smtpConfigured && <Alert type="warn">SMTP is not configured yet.</Alert>}
          <Field label="Send to"><input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { try { await api.post('/settings/smtp/test', { to }); toast('Test email sent', 'success'); } catch (err) { toast(err.message, 'error'); } }}>Send test</button>
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
        <div><h3>Users</h3><div className="small muted">Admin: everything. Recruiter: candidates, chats, vacancies (no settings, no deleting). Viewer: read only.</div></div>
        <button type="button" className="btn primary sm" onClick={() => setAdd(true)}><UserPlus size={14} /> Add user</button>
      </div>
      <ErrorBox error={error} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Name</th><th>Role</th><th>Last login</th><th>Active</th></tr></thead>
        <tbody>{data?.map((u) => (
          <tr key={u.id}>
            <td><b>{u.name}</b><div className="sub">{u.email}</div></td>
            <td><select value={u.role} disabled={u.id === user.id} onChange={(e) => update(u.id, { role: e.target.value })} style={{ width: 140 }}><option value="admin">Admin</option><option value="recruiter">Recruiter</option><option value="viewer">Viewer</option></select></td>
            <td className="sub">{fmtDateTime(u.last_login_at)}</td>
            <td><label className="checkbox"><input type="checkbox" checked={u.active} disabled={u.id === user.id} onChange={(e) => update(u.id, { active: e.target.checked })} /> {u.active ? 'Active' : 'Disabled'}</label></td>
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
    <Modal title="Add user" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save}>Create user</button></>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Name"><input type="text" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Temporary password" hint="At least 10 characters with letters and numbers. Ask the user to change it."><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Role"><select value={f.role} onChange={set('role')}><option value="recruiter">Recruiter</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></Field>
      </div>
    </Modal>
  );
}

function PrivacyTab({ s, reload }) {
  const { data } = useAsync(() => api.get('/settings/audit-log'), []);
  return (
    <div className="split">
      <div className="card">
        <div className="card-head"><h3>Audit log</h3><span className="small muted">Who did what (last 200 actions)</span></div>
        <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}><table className="table">
          <tbody>{data?.map((a) => (
            <tr key={a.id}><td className="sub" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td><td>{a.user_name || 'System'}</td><td><b>{a.action.replaceAll('_', ' ')}</b> {a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td><td className="sub">{a.detail}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Privacy (GDPR / AVG)</h3></div>
        <div className="card-body stack small">
          <p>• The assistant asks for consent before collecting answers (can be switched in Assistant settings).</p>
          <p>• Candidates can send <b>DELETE</b> / <b>VERWIJDER</b>. You get a notification and delete the profile with one click.</p>
          <p>• Admins can export all data of one candidate (right of access) and delete everything (right to erasure).</p>
          <p>• Only “has a valid BSN” (yes/no) is stored, never the BSN number. API tokens are stored encrypted.</p>
          <p>• CV files are stored privately and are only available after login.</p>
          <SettingsForm s={s} reload={reload} keys={['privacy.retention_months', 'general.company_name']} types={{ 'privacy.retention_months': 'number' }} hints={{ 'privacy.retention_months': 'Your retention policy. Review and delete old candidates regularly.' }} />
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
    try { await api.post('/auth/change-password', f); toast('Password changed', 'success'); setF({ currentPassword: '', newPassword: '' }); } catch (err) { setError(err); }
  };
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-head"><h3>My account</h3></div>
      <div className="card-body stack">
        <dl className="details"><dt>Name</dt><dd>{user.name}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Role</dt><dd style={{ textTransform: 'capitalize' }}>{user.role}</dd></dl>
        <ErrorBox error={error} />
        <Field label="Current password"><input type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
        <Field label="New password" hint="At least 10 characters with letters and numbers."><input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" /></Field>
        <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={save}>Change password</button>
      </div>
    </div>
  );
}
