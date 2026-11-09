import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  Users, UserPlus, PhoneOutgoing, UserCheck, Trophy, Briefcase, CalendarClock, Hourglass, AlertTriangle, MessageCircle,
} from 'lucide-react';
import { api, fmtDate, fmtPhone, STATUS_LABELS, STATUSES } from '../api.js';
import { useAsync, Spinner, ErrorBox, StatusBadge, Empty, initials } from '../components/ui.jsx';

// Validated categorical slots 1 and 2 (blue, orange).
const SERIES = { registrations: '#2a78d6', placements: '#eb6834' };

function Stat({ icon: Icon, label, value, color, to, sub }) {
  const inner = (
    <>
      <div className={`stat-icon ${color || ''}`}><Icon size={20} /></div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value ?? 0}</div>
        {sub && <div className="faint small">{sub}</div>}
      </div>
    </>
  );
  return to ? <Link to={to} className="card stat">{inner}</Link> : <div className="card stat">{inner}</div>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
      <div className="small muted" style={{ marginBottom: 4 }}>Week of {fmtDate(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row small" style={{ gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: 'inline-block' }} />
          <span style={{ flex: 1 }}>{p.name}</span>
          <b>{p.value}</b>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data, error, loading } = useAsync(() => api.get('/dashboard'), [], { interval: 30000 });
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const s = data.stats;
  const statusCounts = Object.fromEntries(data.byStatus.map((r) => [r.status, r.count]));
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  const chart = data.chart.map((r) => ({ ...r, label: new Date(r.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }));
  const empty = chart.every((r) => !r.registrations && !r.placements);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your candidates, conversations and vacancies.</p>
        </div>
        <div className="actions">
          <Link to="/candidates?new=1" className="btn primary"><UserPlus size={16} /> Add candidate</Link>
          <Link to="/inbox" className="btn"><MessageCircle size={16} /> Inbox{s.unread_messages > 0 ? ` (${s.unread_messages})` : ''}</Link>
        </div>
      </div>

      {s.needs_attention > 0 && (
        <Link to="/inbox?filter=attention" className="alert warn" style={{ marginBottom: 16, textDecoration: 'none' }}>
          <AlertTriangle size={17} />
          <div><b>{s.needs_attention} conversation{s.needs_attention > 1 ? 's need' : ' needs'} your attention</b> — the assistant could not understand an answer, or a candidate asked to delete their data.</div>
        </Link>
      )}

      <div className="grid grid-4">
        <Stat icon={Users} label="Total candidates" value={s.total_candidates} to="/candidates" />
        <Stat icon={UserPlus} label="New candidates" value={s.new_candidates} sub={`${s.new_this_week} registered this week`} to="/candidates?status=new" />
        <Stat icon={PhoneOutgoing} label="Candidates contacted" value={s.contacted} color="purple" />
        <Stat icon={UserCheck} label="Available for work" value={s.available} color="green" to="/candidates?status=available,information_complete" />
        <Stat icon={Trophy} label="Candidates placed" value={s.placed} color="green" to="/candidates?status=placed" />
        <Stat icon={Briefcase} label="Active vacancies" value={s.active_vacancies} to="/vacancies" />
        <Stat icon={CalendarClock} label="Interviews scheduled" value={s.interviews} color="purple" to="/submissions?status=interview" />
        <Stat icon={Hourglass} label="Waiting for candidate reply" value={s.waiting_for_reply} color="amber" to="/inbox" />
      </div>

      <div className="split mt">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Registrations and placements</h3>
              <div className="small muted">Per week, last 12 weeks</div>
            </div>
          </div>
          <div className="card-body" style={{ height: 320 }}>
            {empty ? <Empty title="No data yet">New registrations and placements will appear here.</Empty> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8ecf2" />
                  <XAxis dataKey="week" tickFormatter={(w) => new Date(w).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} tick={{ fontSize: 12, fill: '#5d6b7e' }} axisLine={{ stroke: '#cfd7e2' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#5d6b7e' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,42,74,0.05)' }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12.5 }} formatter={(v) => <span style={{ color: '#34435a' }}>{v}</span>} />
                  <Bar dataKey="registrations" name="Registrations" fill={SERIES.registrations} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="placements" name="Placements" fill={SERIES.placements} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Candidates by status</h3></div>
          <div className="card-body stack" style={{ gap: 10 }}>
            {STATUSES.map((st) => (
              <Link key={st} to={`/candidates?status=${st}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="row between small"><span>{STATUS_LABELS[st]}</span><b>{statusCounts[st] || 0}</b></div>
                <div className="progress" style={{ marginTop: 4 }}><div style={{ width: `${((statusCounts[st] || 0) / maxStatus) * 100}%`, background: '#2a78d6' }} /></div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head"><h3>Newest candidates</h3><Link to="/candidates" className="small">View all</Link></div>
        {data.recentCandidates.length === 0 ? <Empty title="No candidates yet">Add a candidate, import an Excel file, or let candidates message you on WhatsApp.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {data.recentCandidates.map((c) => (
                  <tr key={c.id}>
                    <td style={{ width: 44 }}><div className="avatar light">{initials(c.full_name)}</div></td>
                    <td><Link to={`/candidates/${c.id}`} className="name">{c.full_name || 'Name not known yet'}</Link><div className="sub">{fmtPhone(c.phone)}</div></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="muted small" style={{ textAlign: 'right' }}>{fmtDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
