import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate, METHOD_LABELS } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ProgressBar from '../components/ProgressBar.jsx';

export default function Dashboard() {
  const { groupId, isFinance } = useAuth();
  const [mine, setMine] = useState(null);
  const [summary, setSummary] = useState(null);
  const [board, setBoard] = useState({ posts: [], events: [] });
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const g = `/groups/${groupId}`;
    Promise.all([
      api(`${g}/members/me`),
      api(`${g}/contributions/summary`),
      api(`${g}/board`),
      isFinance ? api(`${g}/pending`) : Promise.resolve({ pending: [] }),
    ])
      .then(([m, s, b, p]) => { setMine(m); setSummary(s); setBoard(b); setPendingCount(p.pending.length); })
      .catch((e) => setError(e.message));
  }, [groupId, isFinance]);

  if (error) return <p className="error">{error}</p>;
  if (!mine) return <p className="muted">Loading…</p>;

  return (
    <div className="grid">
      <section className="card">
        <h2>My progress</h2>
        <ProgressBar paidCents={mine.totalCents} pledgeCents={mine.pledgeCents} />
        <ul className="list">
          {mine.contributions.slice(0, 5).map((c) => (
            <li key={c._id}><span>{fmtDate(c.date)} · {METHOD_LABELS[c.method]} · {c.category}</span><strong>{money(c.amountCents)}</strong></li>
          ))}
          {!mine.contributions.length && <li className="muted">No payments recorded yet.</li>}
        </ul>
      </section>

      <section className="card">
        <h2>Group total</h2>
        <div className="big">{money(summary?.groupTotalCents)}</div>
        <div className="muted small">{summary?.count} payments recorded</div>
        {isFinance && pendingCount > 0 && (
          <Link className="alert" to="/pending">{pendingCount} payment{pendingCount > 1 ? 's' : ''} waiting for review →</Link>
        )}
      </section>

      <section className="card">
        <h2>Upcoming</h2>
        <ul className="list">
          {board.events.slice(0, 4).map((e) => (
            <li key={e._id}><span>{e.title}{e.location && ` · ${e.location}`}</span><span className="muted">{fmtDate(e.startsAt)}</span></li>
          ))}
          {!board.events.length && <li className="muted">No upcoming events.</li>}
        </ul>
      </section>

      <section className="card">
        <h2>Latest from the board</h2>
        <ul className="list">
          {board.posts.slice(0, 4).map((p) => (
            <li key={p._id}><span>{p.pinned && '📌 '}{p.title}</span><span className="tag">{p.type}</span></li>
          ))}
          {!board.posts.length && <li className="muted">Nothing posted yet.</li>}
        </ul>
        <Link to="/board" className="small">Open board →</Link>
      </section>
    </div>
  );
}
