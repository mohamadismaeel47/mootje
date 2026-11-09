import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import { ToastProvider, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Candidates from './pages/Candidates.jsx';
import CandidateDetail from './pages/CandidateDetail.jsx';
import Inbox from './pages/Inbox.jsx';
import Vacancies from './pages/Vacancies.jsx';
import VacancyDetail from './pages/VacancyDetail.jsx';
import Agencies from './pages/Agencies.jsx';
import AgencyDetail from './pages/AgencyDetail.jsx';
import Submissions from './pages/Submissions.jsx';
import Settings from './pages/Settings.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(undefined);
  const location = useLocation();

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <Spinner />;

  const can = (role) => {
    const rank = { viewer: 1, recruiter: 2, admin: 3 };
    return !!user && rank[user.role] >= rank[role];
  };
  const logout = async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); };

  return (
    <ToastProvider>
      <AuthCtx.Provider value={{ user, setUser, can, logout }}>
        {!user ? (
          <Routes>
            <Route path="*" element={<Login onLogin={setUser} redirect={location.pathname} />} />
          </Routes>
        ) : (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/candidates" element={<Candidates />} />
              <Route path="/candidates/:id" element={<CandidateDetail />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/inbox/:id" element={<Inbox />} />
              <Route path="/vacancies" element={<Vacancies />} />
              <Route path="/vacancies/:id" element={<VacancyDetail />} />
              <Route path="/agencies" element={<Agencies />} />
              <Route path="/agencies/:id" element={<AgencyDetail />} />
              <Route path="/submissions" element={<Submissions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:tab" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        )}
      </AuthCtx.Provider>
    </ToastProvider>
  );
}
