import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Shows a screenshot a member uploaded. Fetched with the session token,
// because an <img> tag can't send one.
export default function ProofImage({ path }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let url;
    api(path, { raw: true })
      .then((res) => res.blob())
      .then((blob) => { url = URL.createObjectURL(blob); setSrc(url); })
      .catch((e) => setError(e.message));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [path]);

  if (error) return <p className="error">{error}</p>;
  if (!src) return <p className="muted small">Loading screenshot…</p>;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt="Payment screenshot" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 6 }} />
    </a>
  );
}
