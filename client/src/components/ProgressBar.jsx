import { money } from '../api.js';

export default function ProgressBar({ paidCents = 0, pledgeCents = 0 }) {
  if (!pledgeCents) return <div className="muted small">{money(paidCents)} paid · no pledge set</div>;
  const pct = Math.min(100, Math.round((paidCents / pledgeCents) * 100));
  return (
    <div className="progress-wrap">
      <div className="progress"><div className="bar" style={{ width: `${pct}%` }} /></div>
      <div className="small muted">
        {money(paidCents)} of {money(pledgeCents)} · {pct}%
      </div>
    </div>
  );
}
