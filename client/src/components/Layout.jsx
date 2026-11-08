import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { me, groupId, chooseGroup, membership, isFinance, logout } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <strong>PayPortal</strong>
          {me.memberships.length > 1 ? (
            <select value={groupId || ''} onChange={(e) => chooseGroup(e.target.value)}>
              {me.memberships.map((m) => (
                <option key={m.group._id} value={m.group._id}>{m.group.name}</option>
              ))}
            </select>
          ) : (
            <span className="muted">{membership?.group.name}</span>
          )}
        </div>
        <div className="who">
          <span className="muted">{me.user.name} · {membership?.role}</span>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/board">Board</NavLink>
        <NavLink to="/members">Members</NavLink>
        <NavLink to="/ledger">{isFinance ? 'Ledger' : 'My payments'}</NavLink>
        {isFinance && <NavLink to="/pending">Pending</NavLink>}
      </nav>

      {/* key forces pages to reload their data when switching groups */}
      <main key={groupId}>{children}</main>
    </div>
  );
}
