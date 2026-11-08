import { useCallback, useEffect, useState } from 'react';
import { api, money, fmtDate, METHOD_LABELS } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Payments picked up from forwarded Cash App / Zelle emails.
// Nothing counts toward anyone's total until the treasurer confirms it here.
export default function Pending() {
  const { groupId, membership } = useAuth();
  const categories = membership?.group.settings?.categories || ['Dues'];
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [choice, setChoice] = useState({});
  const [error, setError] = useState('');
  const g = `/groups/${groupId}`;

  const load = useCallback(() => api(`${g}/pending`).then((d) => {
    setItems(d.pending);
    setChoice(Object.fromEntries(d.pending.map((p) => [p._id, {
      membershipId: p.suggestedMembership?._id || '',
      category: p.parsed.category || categories[0],
      rememberPayer: !p.suggestedMembership,
    }])));
  }).catch((e) => setError(e.message)), [g]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api(`${g}/members`).then((d) => setMembers(d.members.filter((m) => m.status === 'active'))); }, [g]);

  const update = (id, k, v) => setChoice({ ...choice, [id]: { ...choice[id], [k]: v } });

  const confirm = async (p) => {
    setError('');
    try { await api(`${g}/pending/${p._id}/confirm`, { method: 'POST', body: choice[p._id] }); load(); }
    catch (err) { setError(err.message); }
  };
  const dismiss = async (p) => {
    if (!window.confirm('Dismiss this? It will not be recorded.')) return;
    try { await api(`${g}/pending/${p._id}/dismiss`, { method: 'POST' }); load(); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}
      <section className="card">
        <h2>Waiting for review ({items.length})</h2>
        {!items.length && <p className="muted">All caught up. New payment emails will show up here.</p>}
        {items.map((p) => (
          <div key={p._id} className="pending">
            <div className="pending-head">
              <div>
                <div className="big">{money(p.parsed.amountCents)}</div>
                <div className="small muted">
                  {METHOD_LABELS[p.parsed.method] || p.parsed.method} · {fmtDate(p.createdAt)}
                  {p.parsed.reference && ` · #${p.parsed.reference}`}
                </div>
              </div>
              <div className="right">
                <div>From: <strong>{p.parsed.payerName || 'unknown'}</strong></div>
                {p.parsed.memo && <div className="small">“{p.parsed.memo}”</div>}
                {p.suggestedMembership
                  ? <span className="tag ok">matched {p.suggestedMembership.user?.name}</span>
                  : <span className="tag warn">no match, pick a member</span>}
              </div>
            </div>
            <div className="form-row">
              <label>Member
                <select value={choice[p._id]?.membershipId || ''} onChange={(e) => update(p._id, 'membershipId', e.target.value)}>
                  <option value="">Choose…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label>Category
                <select value={choice[p._id]?.category || ''} onChange={(e) => update(p._id, 'category', e.target.value)}>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="inline small">
                <input type="checkbox" checked={Boolean(choice[p._id]?.rememberPayer)} onChange={(e) => update(p._id, 'rememberPayer', e.target.checked)} />
                Remember “{p.parsed.payerName}” for this member
              </label>
            </div>
            <details className="small muted"><summary>Original email</summary><pre>{p.raw?.subject}{'\n'}{p.raw?.snippet}</pre></details>
            <div className="actions">
              <button disabled={!choice[p._id]?.membershipId} onClick={() => confirm(p)}>Confirm</button>
              <button className="secondary" onClick={() => dismiss(p)}>Dismiss</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
