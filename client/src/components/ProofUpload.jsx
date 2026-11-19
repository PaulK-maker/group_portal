import { useState } from 'react';
import { api, METHOD_LABELS } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const SEND_METHODS = ['cashapp', 'venmo', 'zelle', 'pushpay'];

// Shrinks a phone screenshot to a JPEG small enough to send.
function shrinkImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = Object.assign(document.createElement('canvas'), {
        width: Math.round(img.width * scale),
        height: Math.round(img.height * scale),
      });
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

// A member sends a screenshot of a payment they made. The treasurer confirms it
// on the Pending page before it counts.
export default function ProofUpload() {
  const { groupId } = useAuth();
  const blank = { amount: '', method: 'cashapp', date: today(), memo: '' };
  const [form, setForm] = useState(blank);
  const [image, setImage] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({});
  const g = `/groups/${groupId}`;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = async (e) => {
    const file = e.target.files?.[0];
    setStatus({});
    setImage(null);
    if (!file) return;
    try { setImage(await shrinkImage(file)); }
    catch (err) { setStatus({ error: err.message }); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!image) {
      setStatus({ error: 'Add a screenshot first' });
      return;
    }
    setBusy(true);
    setStatus({});
    try {
      await api(`${g}/payment-proofs`, { method: 'POST', body: { ...form, imageDataUrl: image } });
      setForm(blank);
      setImage(null);
      setFileKey((k) => k + 1);
      setStatus({ done: true });
    } catch (err) { setStatus({ error: err.message }); }
    finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2>Send a payment screenshot</h2>
      <p className="small muted">Paid with Cash App, Venmo, Zelle or Pushpay? Send a screenshot to your treasurer. It counts once they confirm it.</p>
      <form onSubmit={submit}>
        <div className="form-row">
          <label>Amount ($)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} /></label>
          <label>How you paid
            <select value={form.method} onChange={set('method')}>
              {SEND_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </label>
          <label>Date<input type="date" value={form.date} onChange={set('date')} /></label>
          <label>Memo (optional)<input value={form.memo} onChange={set('memo')} /></label>
        </div>
        <label>Screenshot<input key={fileKey} type="file" accept="image/*" onChange={pick} /></label>
        {status.error && <p className="error">{status.error}</p>}
        {status.done && <p className="muted small">Sent. Your treasurer will review it.</p>}
        <div className="actions">
          <button disabled={busy || !image}>{busy ? 'Sending…' : 'Send to treasurer'}</button>
        </div>
      </form>
    </section>
  );
}
