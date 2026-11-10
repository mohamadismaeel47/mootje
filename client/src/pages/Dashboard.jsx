import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  Users, UserPlus, PhoneOutgoing, UserCheck, Trophy, Briefcase, CalendarClock, Hourglass, AlertTriangle, MessageCircle, ShieldCheck,
  CheckCheck, MessageSquareOff, Mail,
} from 'lucide-react';
import { api, fmtDate, fmtPhone, STATUS_LABELS, STATUSES } from '../api.js';
import { useAsync, Spinner, ErrorBox, StatusBadge, Empty, initials, CallButton } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

// Validated categorical slots 1 and 2 (blue, orange).
const SERIES = { registrations: '#2a78d6', placements: '#eb6834' };

function daysAgo(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days <= 0 ? 'vandaag' : days === 1 ? '1 dag geleden' : `${days} dagen geleden`;
}

function Stat({ icon: Icon, label, value, color, to, sub }) {
  const isAnchor = to && to.startsWith('#');
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
  if (isAnchor) return <a href={to} className="card stat" onClick={(e) => { e.preventDefault(); document.querySelector(to)?.scrollIntoView({ behavior: 'smooth' }); }}>{inner}</a>;
  return to ? <Link to={to} className="card stat">{inner}</Link> : <div className="card stat">{inner}</div>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
      <div className="small muted" style={{ marginBottom: 4 }}>Week van {fmtDate(label)}</div>
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
  const { user } = useAuth();
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const s = data.stats;
  const statusCounts = Object.fromEntries(data.byStatus.map((r) => [r.status, r.count]));
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  const chart = data.chart.map((r) => ({ ...r, label: new Date(r.week).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) }));
  const empty = chart.every((r) => !r.registrations && !r.placements);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Overzicht van je kandidaten, gesprekken en vacatures.</p>
        </div>
        <div className="actions">
          <Link to="/candidates?new=1" className="btn primary"><UserPlus size={16} /> Kandidaat toevoegen</Link>
          <Link to="/inbox" className="btn"><MessageCircle size={16} /> Inbox{s.unread_messages > 0 ? ` (${s.unread_messages})` : ''}</Link>
        </div>
      </div>

      {!user.totp_enabled && (
        <Link to="/settings/account" className="alert info" style={{ marginBottom: 16, textDecoration: 'none' }}>
          <ShieldCheck size={17} />
          <div><b>Beveilig je account extra</b> — zet tweestapsverificatie aan. Dan heb je bij het inloggen ook een code van je telefoon nodig.</div>
        </Link>
      )}

      {s.needs_attention > 0 && (
        <Link to="/inbox?filter=attention" className="alert warn" style={{ marginBottom: 16, textDecoration: 'none' }}>
          <AlertTriangle size={17} />
          <div><b>{s.needs_attention} {s.needs_attention > 1 ? 'gesprekken hebben' : 'gesprek heeft'} je aandacht nodig</b> — de assistent begreep een antwoord niet, of een kandidaat vroeg om zijn gegevens te verwijderen.</div>
        </Link>
      )}

      <div className="grid grid-4">
        <Stat icon={Users} label="Totaal kandidaten" value={s.total_candidates} to="/candidates" />
        <Stat icon={UserPlus} label="Nieuwe kandidaten" value={s.new_candidates} sub={`${s.new_this_week} ingeschreven deze week`} to="/candidates?status=new" />
        <Stat icon={PhoneOutgoing} label="Kandidaten benaderd" value={s.contacted} color="purple" />
        <Stat icon={UserCheck} label="Beschikbaar voor werk" value={s.available} color="green" to="/candidates?status=available,information_complete" />
        <Stat icon={Trophy} label="Kandidaten geplaatst" value={s.placed} color="green" to="/candidates?status=placed" />
        <Stat icon={Briefcase} label="Actieve vacatures" value={s.active_vacancies} to="/vacancies" />
        <Stat icon={CalendarClock} label="Geplande gesprekken" value={s.interviews} color="purple" to="/submissions?status=interview" />
        <Stat icon={Hourglass} label="Wachten op antwoord" value={s.waiting_for_reply} color="amber" to="/inbox" />
        <Stat icon={CheckCheck} label="Inschrijvingen afgerond" value={s.completed_registrations} sub={`${s.completed_this_week} deze week`} color="green" to="/inbox?filter=completed" />
        <Stat icon={MessageSquareOff} label="Geen bericht in 2 dagen" value={s.no_contact_2d} color={s.no_contact_2d > 0 ? 'red' : ''} to="#geen-contact" />
        <Stat icon={Mail} label="Ongelezen berichten" value={s.unread_messages} color="purple" to="/inbox?filter=unread" />
        <Stat icon={AlertTriangle} label="Aandacht nodig" value={s.needs_attention} color={s.needs_attention > 0 ? 'amber' : ''} to="/inbox?filter=attention" />
      </div>

      <div className="card mt" id="geen-contact">
        <div className="card-head">
          <div><h3>Geen bericht gestuurd in 2 dagen</h3><div className="small muted">Kandidaten naar wie jij of de assistent meer dan 2 dagen geen WhatsApp heeft gestuurd. Geplaatste, afgewezen en niet-geïnteresseerde kandidaten staan hier niet bij.</div></div>
        </div>
        {data.noContact.length === 0 ? <Empty icon={CheckCheck} title="Iedereen is bijgewerkt">Je hebt alle kandidaten de afgelopen 2 dagen een bericht gestuurd.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kandidaat</th><th>Status</th><th>Laatste bericht van jou</th><th>Laatste bericht van kandidaat</th><th /></tr></thead>
              <tbody>
                {data.noContact.map((c) => (
                  <tr key={c.candidate_id}>
                    <td><Link to={`/candidates/${c.candidate_id}`} className="name">{c.full_name || c.profile_name || 'Naam nog onbekend'}</Link><div className="sub">{fmtPhone(c.phone)}</div></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="sub">{c.last_outbound_at ? `${daysAgo(c.last_outbound_at)} (${fmtDate(c.last_outbound_at)})` : 'Nog nooit'}</td>
                    <td className="sub">{c.last_inbound_at ? `${daysAgo(c.last_inbound_at)} (${fmtDate(c.last_inbound_at)})` : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <CallButton phone={c.phone} small iconOnly />{' '}
                      {c.conversation_id
                        ? <Link to={`/inbox/${c.conversation_id}`} className="btn sm"><MessageCircle size={14} /> Chat openen</Link>
                        : <Link to={`/candidates/${c.candidate_id}`} className="btn sm"><MessageCircle size={14} /> WhatsApp starten</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s.no_contact_2d > data.noContact.length && <div className="pagination"><span>En nog {s.no_contact_2d - data.noContact.length} andere kandidaten.</span></div>}
      </div>

      <div className="split mt">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Inschrijvingen en plaatsingen</h3>
              <div className="small muted">Per week, laatste 12 weken</div>
            </div>
          </div>
          <div className="card-body" style={{ height: 320 }}>
            {empty ? <Empty title="Nog geen gegevens">Nieuwe inschrijvingen en plaatsingen verschijnen hier.</Empty> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e8ecf2" />
                  <XAxis dataKey="week" tickFormatter={(w) => new Date(w).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} tick={{ fontSize: 12, fill: '#5d6b7e' }} axisLine={{ stroke: '#cfd7e2' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#5d6b7e' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,42,74,0.05)' }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12.5 }} formatter={(v) => <span style={{ color: '#34435a' }}>{v}</span>} />
                  <Bar dataKey="registrations" name="Inschrijvingen" fill={SERIES.registrations} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="placements" name="Plaatsingen" fill={SERIES.placements} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Kandidaten per status</h3></div>
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
        <div className="card-head"><h3>Nieuwste kandidaten</h3><Link to="/candidates" className="small">Alles bekijken</Link></div>
        {data.recentCandidates.length === 0 ? <Empty title="Nog geen kandidaten">Voeg een kandidaat toe, importeer een Excel-bestand of laat kandidaten je een WhatsApp sturen.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {data.recentCandidates.map((c) => (
                  <tr key={c.id}>
                    <td style={{ width: 44 }}><div className="avatar light">{initials(c.full_name)}</div></td>
                    <td><Link to={`/candidates/${c.id}`} className="name">{c.full_name || 'Naam nog onbekend'}</Link><div className="sub">{fmtPhone(c.phone)}</div></td>
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
