import { useCallback, useEffect, useState } from 'react';
import { api, money, toCents } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ProgressBar from '../components/ProgressBar.jsx';

const blank = { name: '', email: '', phone: '', role: 'member', pledge: '' };

export default function Members() {
  const { groupId, isFinance, role } = useAuth();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const base = `/groups/${groupId}/members`;

  const load = useCallback(() => api(base).then((d) => setMembers(d.members)).catch((e) => setError(e.message)), [base]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api(base, { method: 'POST', body: { ...form, pledgeCents: toCents(form.pledge) } });
      setForm(blank);
      load();
    } catch (err) { setError(err.message); }
  };

  const save = async () => {
    setError('');
    try {
      const body = {
        name: editing.name,
        phone: editing.phone,
        status: editing.status,
        pledgeCents: toCents(editing.pledge),
        paymentIdentities: editing.aliases.split(',').map((v) => v.trim()).filter(Boolean).map((value) => ({ type: 'name', value })),
      };
      if (role === 'admin') body.role = editing.role;
      await api(`${base}/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      load();
    } catch (err) { setError(err.message); }
  };

  const startEdit = (m) => setEditing({
    ...m,
    pledge: ((m.pledgeCents || 0) / 100).toString(),
    aliases: (m.paymentIdentities || []).map((i) => i.value).join(', '),
  });

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Members ({members.filter((m) => m.status === 'active').length} active)</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Role</th>
              {'totalCents' in (members[0] || {}) && <th>Progress</th>}
              {isFinance && <th>Contact</th>}
              {isFinance && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className={m.status === 'inactive' ? 'dim' : ''}>
                <td>{m.name}</td>
                <td><span className="tag">{m.role}</span></td>
                {'totalCents' in m && <td><ProgressBar paidCents={m.totalCents} pledgeCents={m.pledgeCents} /></td>}
                {isFinance && <td className="small">{m.email}<br />{m.phone}</td>}
                {isFinance && <td><button className="link" onClick={() => startEdit(m)}>Edit</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <section className="card">
          <h2>Edit {editing.name}</h2>
          <div className="form-row">
            <label>Name<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>Phone<input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></label>
            <label>Pledge ($)<input type="number" min="0" step="0.01" value={editing.pledge} onChange={(e) => setEditing({ ...editing, pledge: e.target.value })} /></label>
            {role === 'admin' && (
              <label>Role
                <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                  {['member', 'treasurer', 'secretary', 'admin'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
            )}
            <label>Status
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="active">active</option><option value="inactive">inactive</option>
              </select>
            </label>
          </div>
          <label>Names they pay under (comma separated: $cashtag, Zelle name, spouse's name)
            <input value={editing.aliases} onChange={(e) => setEditing({ ...editing, aliases: e.target.value })} />
          </label>
          <div className="actions">
            <button onClick={save}>Save</button>
            <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      )}

      {isFinance && (
        <form className="card" onSubmit={add}>
          <h2>Add member</h2>
          <div className="form-row">
            <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Email (for sign-in)<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Phone (for sign-in)<input type="tel" placeholder="+1 555 123 4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>Pledge ($)<input type="number" min="0" step="0.01" value={form.pledge} onChange={(e) => setForm({ ...form, pledge: e.target.value })} /></label>
            {role === 'admin' && (
              <label>Role
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {['member', 'treasurer', 'secretary', 'admin'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
            )}
          </div>
          <button>Add member</button>
        </form>
      )}
    </div>
  );
}
