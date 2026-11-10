import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, MessageCircle, Briefcase, Building2, Send, Settings, LogOut, Menu, Bell,
} from 'lucide-react';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../App.jsx';
import { initials, useAsync } from './ui.jsx';

const TITLES = [
  ['/candidates', 'Candidates'], ['/inbox', 'WhatsApp inbox'], ['/vacancies', 'Vacancies'], ['/agencies', 'Agencies'],
  ['/submissions', 'Sent to agencies'], ['/settings', 'Settings'], ['/', 'Dashboard'],
];

export default function Layout({ children }) {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const unread = useAsync(() => api.get('/dashboard').then((d) => d.stats.unread_messages), [], { interval: 15000 });
  useEffect(() => setOpen(false), [location.pathname]);
  const title = TITLES.find(([p]) => location.pathname.startsWith(p))?.[1] || '';
  const fullBleed = location.pathname.startsWith('/inbox');

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src="/logo.svg" alt="" />
          <div>Recruitment CRM<small>Candidates &amp; WhatsApp</small></div>
        </div>
        <nav className="nav">
          <NavLink to="/" end><LayoutDashboard size={18} /> Dashboard</NavLink>
          <NavLink to="/candidates"><Users size={18} /> Candidates</NavLink>
          <NavLink to="/inbox"><MessageCircle size={18} /> WhatsApp inbox
            {unread.data > 0 && <span className="count">{unread.data}</span>}
          </NavLink>
          <div className="nav-section">Jobs</div>
          <NavLink to="/vacancies"><Briefcase size={18} /> Vacancies</NavLink>
          <NavLink to="/agencies"><Building2 size={18} /> Agencies</NavLink>
          <NavLink to="/submissions"><Send size={18} /> Sent to agencies</NavLink>
          <div className="nav-section">System</div>
          <NavLink to="/settings"><Settings size={18} /> Settings{!can('admin') && ' & account'}</NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{initials(user.name)}</div>
          <div className="who"><b>{user.name}</b><span>{user.role}</span></div>
          <button type="button" onClick={logout} title="Log out" aria-label="Log out"><LogOut size={18} /></button>
        </div>
      </aside>
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button type="button" className="btn ghost icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="title">{title}</div>
          <Notifications />
        </header>
        <main className={`content ${fullBleed ? 'full' : ''}`}>{children}</main>
      </div>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data, reload } = useAsync(() => api.get('/notifications'), [], { interval: 20000 });
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const unread = data?.unread || 0;
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="btn ghost icon" onClick={() => setOpen((o) => !o)} aria-label="Notifications"><Bell size={19} /></button>
      {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
      {open && (
        <div className="dropdown">
          <div className="card-head">
            <h3>Notifications</h3>
            {unread > 0 && <button type="button" className="btn sm ghost" onClick={async () => { await api.post('/notifications/read-all'); reload(true); }}>Mark all read</button>}
          </div>
          <div className="dropdown-list">
            {!data?.items?.length && <div className="empty small">No notifications yet</div>}
            {data?.items?.map((n) => (
              <Link key={n.id} to={n.link || '#'} className={`notif ${n.read_at ? '' : 'unread'}`}
                onClick={() => { setOpen(false); if (!n.read_at) api.post(`/notifications/${n.id}/read`).then(() => reload(true)); }}>
                <b>{n.title}</b>
                {n.body && <span>{n.body}</span>}
                <div className="faint small">{fmtDateTime(n.created_at)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
