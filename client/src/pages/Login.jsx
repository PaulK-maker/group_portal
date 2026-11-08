import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState('email');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const identity = mode === 'phone' ? { phone: value } : { email: value };
  const switchMode = (m) => { setMode(m); setValue(''); setCode(''); setSent(false); setError(''); };

  const run = (fn) => async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const requestCode = run(async () => {
    await api('/auth/request-code', { method: 'POST', body: identity });
    setSent(true);
  });

  const verify = run(async () => {
    const { token } = await api('/auth/verify', { method: 'POST', body: { ...identity, code } });
    await login(token);
  });

  return (
    <div className="center">
      <form className="card narrow" onSubmit={sent ? verify : requestCode}>
        <h1>PayPortal</h1>
        <p className="muted">
          Sign in with your {mode === 'phone' ? 'phone number' : 'email'}. We'll send you a 6-digit code.
        </p>
        <div className="actions">
          <button type="button" className={mode === 'email' ? '' : 'secondary'} onClick={() => switchMode('email')}>Email</button>
          <button type="button" className={mode === 'phone' ? '' : 'secondary'} onClick={() => switchMode('phone')}>Phone</button>
        </div>
        {mode === 'phone' ? (
          <label>Phone number
            <input type="tel" required placeholder="+1 555 123 4567" value={value} disabled={sent} onChange={(e) => setValue(e.target.value)} />
          </label>
        ) : (
          <label>Email
            <input type="email" required value={value} disabled={sent} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        {sent && (
          <label>Code
            <input inputMode="numeric" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{sent ? 'Sign in' : 'Send code'}</button>
        {sent && <button type="button" className="link" onClick={() => { setSent(false); setCode(''); }}>Use a different {mode === 'phone' ? 'number' : 'email'}</button>}
      </form>
    </div>
  );
}
