import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// First-run: create an organization and its first group (you become admin).
export default function Setup() {
  const { refresh, chooseGroup, logout, me } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ orgName: '', orgType: 'church', groupName: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { group } = await api('/groups', { method: 'POST', body: form });
      chooseGroup(group._id);
      await refresh();
      navigate('/');
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <h1>Set up your group</h1>
        <p className="muted">
          If your treasurer already added you, ask them to use this {me?.user.email ? 'email' : 'phone number'} ({me?.user.email || me?.user.phone}) and sign in again.
        </p>
        <label>Organization<input required placeholder="e.g. St. Mark's Church" value={form.orgName} onChange={set('orgName')} /></label>
        <label>Type
          <select value={form.orgType} onChange={set('orgType')}>
            <option value="church">Church</option>
            <option value="chama">Chama / savings group</option>
            <option value="club">Club</option>
            <option value="association">Association</option>
            <option value="nonprofit">Nonprofit</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Group<input required placeholder="e.g. Men's Fellowship" value={form.groupName} onChange={set('groupName')} /></label>
        {error && <p className="error">{error}</p>}
        <button>Create group</button>
        <button type="button" className="link" onClick={logout}>Sign out</button>
      </form>
    </div>
  );
}
