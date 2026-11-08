import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Members from './pages/Members.jsx';
import Ledger from './pages/Ledger.jsx';
import Pending from './pages/Pending.jsx';
import Board from './pages/Board.jsx';

export default function App() {
  const { me, loading, isFinance } = useAuth();

  if (loading) return <div className="center muted">Loading…</div>;
  if (!me) return <Login />;
  if (!me.memberships.length) return <Setup />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/pending" element={isFinance ? <Pending /> : <Navigate to="/" />} />
        <Route path="/board" element={<Board />} />
        <Route path="/new-group" element={<Setup />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
