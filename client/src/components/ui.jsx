import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle2, AlertCircle, Inbox } from 'lucide-react';
import { STATUS_LABELS } from '../api.js';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Data loading ---------- */
export function useAsync(fn, deps = [], { interval } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, []);
  useEffect(() => {
    load();
    if (!interval) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, interval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/* ---------- Small components ---------- */
export function Spinner() { return <div className="center"><div className="spinner" /></div>; }

export function ErrorBox({ error }) {
  if (!error) return null;
  return <Alert type="error">{error.message || String(error)}</Alert>;
}

export function Alert({ type = 'info', children }) {
  const Icon = { info: Info, warn: AlertTriangle, error: AlertCircle, success: CheckCircle2 }[type];
  return <div className={`alert ${type}`}><Icon size={17} /><div>{children}</div></div>;
}

export function Empty({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h3>{title}</h3>
      {children && <div className="small" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

const STATUS_COLOR = {
  new: 'blue', contacted: '', information_requested: 'amber', information_complete: 'purple', available: 'green',
  sent_to_agency: 'navy', interview: 'purple', placed: 'green', rejected: 'red', not_interested: '',
};
export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_COLOR[status] || ''}`}>{STATUS_LABELS[status] || status}</span>;
}

const SUB_COLOR = { proposed: 'amber', sent: 'blue', interview: 'purple', placed: 'green', rejected: 'red', withdrawn: '' };
export function SubmissionBadge({ status }) {
  return <span className={`badge ${SUB_COLOR[status] || ''}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, children, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={(
      <>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className={`btn ${danger ? 'danger solid' : 'primary'}`} disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>
          {confirmLabel}
        </button>
      </>
    )}>
      {children}
    </Modal>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

// Yes / No / Unknown selector for boolean fields.
export function TriState({ value, onChange, disabled }) {
  return (
    <div className="tri" role="group">
      <button type="button" disabled={disabled} className={value === true ? 'on' : ''} onClick={() => onChange(value === true ? null : true)}>Yes</button>
      <button type="button" disabled={disabled} className={value === false ? 'on no' : ''} onClick={() => onChange(value === false ? null : false)}>No</button>
      <button type="button" disabled={disabled} className={value === null || value === undefined ? 'on no' : ''} onClick={() => onChange(null)}>?</button>
    </div>
  );
}

export function initials(name, fallback = '?') {
  if (!name) return fallback;
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function scoreColor(score) {
  return score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red';
}

export function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
