import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, UserRoundSearch, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { Alert, Field, Spinner } from '../components/ui.jsx';

export default function Login({ onLogin, redirect }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', setupToken: '' });
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
      const r = setup ? await api.post('/auth/setup', form) : await api.post('/auth/login', { email: form.email, password: form.password });
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
          <div className="brand-logo"><UserRoundSearch size={18} /></div>
          <div>Recruitment CRM</div>
        </div>
        <div>
          <h1>Find the right people,<br />faster.</h1>
          <p>Manage candidates, vacancies and agencies in one place — and let WhatsApp collect candidate information for you.</p>
          <ul>
            {['Automatic WhatsApp registration', 'Smart vacancy matching', 'Secure, GDPR-friendly storage'].map((t) => (
              <li key={t}><CheckCircle2 size={18} color="#4ea1ff" /> {t}</li>
            ))}
          </ul>
        </div>
        <div className="small" style={{ color: '#8fa6c4' }}><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> Personal data is encrypted and only visible after login.</div>
      </div>
      <div className="auth-form">
        <form onSubmit={submit}>
          <div>
            <h1>{setup ? 'Create admin account' : 'Log in'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{setup ? 'This is the first start. Create the main admin account.' : 'Welcome back. Log in to continue.'}</p>
          </div>
          {error && <Alert type="error">{error}</Alert>}
          {setup && <Field label="Your name"><input type="text" value={form.name} onChange={set('name')} required autoFocus /></Field>}
          <Field label="Email"><input type="email" value={form.email} onChange={set('email')} required autoComplete="username" autoFocus={!setup} /></Field>
          <Field label="Password" hint={setup ? 'At least 10 characters, with letters and numbers.' : undefined}>
            <input type="password" value={form.password} onChange={set('password')} required autoComplete={setup ? 'new-password' : 'current-password'} />
          </Field>
          {setup && status.setupTokenRequired && (
            <Field label="Setup token" hint="The SETUP_TOKEN value from the .env file on the server.">
              <input type="password" value={form.setupToken} onChange={set('setupToken')} required />
            </Field>
          )}
          <button type="submit" className="btn primary" style={{ height: 42 }} disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create account' : 'Log in'}</button>
        </form>
      </div>
    </div>
  );
}
