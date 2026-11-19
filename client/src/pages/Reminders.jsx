import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const AUDIENCE_LABELS = { behind: 'Members with a balance left on their pledge', all: 'All active members' };
const blank = { audience: 'behind', subject: '', body: '' };

// Treasurer and admin email reminders to members. Members who turned reminders off are skipped.
export default function Reminders() {
  const { groupId } = useAuth();
  const [form, setForm] = useState(blank);
  const [count, setCount] = useState(null);
  const [history, setHistory] = useState([]);
  const [emailReady, setEmailReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const g = `/groups/${groupId}`;

  const load = useCallback(() => {
    api(`${g}/reminders`)
      .then((d) => { setHistory(d.reminders); setEmailReady(d.emailConfigured); })
      .catch((e) => setError(e.message));
  }, [g]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setCount(null);
    api(`${g}/reminders/preview?audience=${form.audience}`)
      .then((d) => setCount(d.count))
      .catch((e) => setError(e.message));
  }, [g, form.audience]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!window.confirm(`Email ${count} member${count === 1 ? '' : 's'} now? This can't be undone.`)) return;
    setBusy(true);
    try {
      const { reminder, dryRun } = await api(`${g}/reminders`, { method: 'POST', body: form });
      setNotice(dryRun
        ? `Logged ${reminder.sent} email${reminder.sent === 1 ? '' : 's'} to the server console. No email provider is connected yet.`
        : `Sent ${reminder.sent}${reminder.failed ? `, ${reminder.failed} failed` : ''}.`);
      setForm((f) => ({ ...blank, audience: f.audience }));
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      {!emailReady && <p className="muted small">No email provider is connected yet, so reminders are only logged to the server console.</p>}

      <form className="card" onSubmit={send}>
        <h2>Send a reminder</h2>
        <label>Who gets it
          <select value={form.audience} onChange={set('audience')}>
            {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <p className="small muted">
          {count === null ? 'Counting…' : `${count} member${count === 1 ? '' : 's'} will get this. Members who turned reminders off are skipped.`}
        </p>
        <label>Subject<input required value={form.subject} onChange={set('subject')} /></label>
        <label>Message<textarea required rows={5} value={form.body} onChange={set('body')} /></label>
        <p className="small muted">
          Use {'{name}'}, {'{balance}'}, {'{pledge}'}, {'{paid}'} or {'{group}'}. Each member gets their own numbers.
        </p>
        <div className="actions">
          <button disabled={busy || !count}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>

      <section className="card">
        <h2>Sent reminders</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Who</th><th>Subject</th><th>Sent</th><th>By</th></tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r._id}>
                <td>{fmtDate(r.createdAt)}</td>
                <td>{r.audience === 'behind' ? 'Balance left' : 'All members'}</td>
                <td>{r.subject}</td>
                <td>{r.sent}{r.failed > 0 && <span className="tag warn">{r.failed} failed</span>}</td>
                <td>{r.sentBy?.name}</td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan="5" className="muted">Nothing sent yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
