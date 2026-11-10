import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { Alert, Field, Spinner } from '../components/ui.jsx';

export default function Login({ onLogin, redirect }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', setupToken: '', code: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { api.get('/auth/status').then(setStatus).catch(() => setStatus({ needsSetup: false })); }, []);
  if (!status) return <Spinner />;
  const setup = status.needsSetup;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = setup ? await api.post('/auth/setup', form)
        : await api.post('/auth/login', { email: form.email, password: form.password, ...(needsCode ? { code: form.code } : {}) });
      if (r.needs2fa) { setNeedsCode(true); return; }
      onLogin(r.user);
      navigate(redirect && redirect !== '/login' ? redirect : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-side">
        <div className="brand" style={{ padding: 0 }}>
          <img className="brand-logo" src="/logo.svg" alt="" />
          <div>Recruitment CRM</div>
        </div>
        <div>
          <h1>Vind sneller<br />de juiste mensen.</h1>
          <p>Beheer kandidaten, vacatures en uitzendbureaus op één plek — en laat WhatsApp de informatie van kandidaten voor je verzamelen.</p>
          <ul>
            {['Automatische inschrijving via WhatsApp', 'Slimme matching met vacatures', 'Veilige opslag volgens de AVG'].map((t) => (
              <li key={t}><CheckCircle2 size={18} color="#4ea1ff" /> {t}</li>
            ))}
          </ul>
        </div>
        <div className="small" style={{ color: '#8fa6c4' }}><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> Persoonsgegevens zijn beveiligd en alleen zichtbaar na inloggen.</div>
      </div>
      <div className="auth-form">
        <form onSubmit={submit}>
          <div>
            <h1>{setup ? 'Beheerdersaccount maken' : 'Inloggen'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{setup ? 'Dit is de eerste keer. Maak het hoofdaccount voor de beheerder.' : 'Welkom terug. Log in om verder te gaan.'}</p>
          </div>
          {error && <Alert type="error">{error}</Alert>}
          {setup && <Field label="Je naam"><input type="text" value={form.name} onChange={set('name')} required autoFocus /></Field>}
          <Field label="E-mail"><input type="email" value={form.email} onChange={set('email')} required autoComplete="username" autoFocus={!setup} /></Field>
          <Field label="Wachtwoord" hint={setup ? 'Minstens 10 tekens, met letters en cijfers.' : undefined}>
            <input type="password" value={form.password} onChange={set('password')} required autoComplete={setup ? 'new-password' : 'current-password'} />
          </Field>
          {needsCode && (
            <Field label="Code" hint="Open Google Authenticator of Microsoft Authenticator en typ de code van 6 cijfers.">
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={set('code')} required autoFocus />
            </Field>
          )}
          {setup && status.setupTokenRequired && (
            <Field label="Setup-token" hint="De waarde van SETUP_TOKEN uit Railway (variabelen).">
              <input type="password" value={form.setupToken} onChange={set('setupToken')} required />
            </Field>
          )}
          <button type="submit" className="btn primary" style={{ height: 42 }} disabled={busy}>{busy ? 'Even geduld…' : setup ? 'Account maken' : 'Inloggen'}</button>
        </form>
      </div>
    </div>
  );
}
