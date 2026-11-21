import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, money, toCents, fmtDate, METHOD_LABELS } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ProofUpload from '../components/ProofUpload.jsx';
import ContributionImport from '../components/ContributionImport.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function Ledger() {
  const { groupId, isFinance, membership } = useAuth();
  const categories = useMemo(() => membership?.group?.settings?.categories || ['Dues'], [membership]);
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [showVoided, setShowVoided] = useState(false);
  const [error, setError] = useState('');
  const [exportCategory, setExportCategory] = useState(() =>
    categories.includes('Dues') ? 'Dues' : categories[0]
  );
  const blank = { membershipId: '', amount: '', method: 'cashapp', category: categories[0], date: today(), reference: '', memo: '' };
  const [form, setForm] = useState(blank);
  const g = `/groups/${groupId}`;

  const load = useCallback(() => {
    api(`${g}/contributions?includeVoided=${showVoided}`).then((d) => setRows(d.contributions)).catch((e) => setError(e.message));
  }, [g, showVoided]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true;
    setMembers([]);
    if (isFinance) api(`${g}/members`).then((d) => {
      if (active) setMembers(d.members.filter((m) => m.status === 'active'));
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [g, isFinance]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api(`${g}/contributions`, { method: 'POST', body: { ...form, amountCents: toCents(form.amount) } });
      setForm({ ...blank, method: form.method, category: form.category, date: form.date });
      load();
    } catch (err) { setError(err.message); }
  };

  const voidEntry = async (c) => {
    const reason = window.prompt(`Void ${money(c.amountCents)} from ${c.memberName}? Reason:`);
    if (!reason) return;
    try { await api(`${g}/contributions/${c._id}/void`, { method: 'POST', body: { reason } }); load(); }
    catch (err) { setError(err.message); }
  };

  const editImportedDate = async (c) => {
    const date = window.prompt('Enter the payment date (YYYY-MM-DD). The reporting month will stay the same.', c.date.slice(0, 10));
    if (date === null) return;
    setError('');
    try { await api(`${g}/contributions/${c._id}/date`, { method: 'PATCH', body: { date } }); load(); }
    catch (err) { setError(err.message); }
  };

  const exportExcel = async () => {
    try {
      const res = await api(`${g}/export?category=${encodeURIComponent(exportCategory)}`, { raw: true });
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'ledger.xlsx';
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) { setError(err.message); }
  };

  const total = rows.filter((r) => !r.voided).reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}

      {isFinance && (
        <form className="card" onSubmit={add}>
          <h2>Record a payment</h2>
          <div className="form-row">
            <label>Member
              <select required value={form.membershipId} onChange={set('membershipId')}>
                <option value="">Choose…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label>Amount ($)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} /></label>
            <label>Method
              <select value={form.method} onChange={set('method')}>
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Category
              <select value={form.category} onChange={set('category')}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={form.date} onChange={set('date')} /></label>
            <label>Reference #<input value={form.reference} onChange={set('reference')} /></label>
            <label>Memo<input value={form.memo} onChange={set('memo')} /></label>
          </div>
          <button>Save payment</button>
        </form>
      )}

      <ProofUpload />

      {isFinance && <ContributionImport key={groupId} groupId={groupId} members={members} categories={categories} onImported={load} />}

      <section className="card">
        <div className="row-between">
          <h2>{isFinance ? 'Ledger' : 'My payments'} · {money(total)}</h2>
          <div className="actions">
            {isFinance && (
              <label className="inline small">
                <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> show voided
              </label>
            )}
            {isFinance && (
              <>
                <label className="inline small">
                  Monthly report category
                  <select value={exportCategory} onChange={(e) => setExportCategory(e.target.value)}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <button className="secondary" onClick={exportExcel}>Export to Excel</button>
              </>
            )}
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Date</th><th>Member</th><th>Amount</th><th>Method</th><th>Category</th><th>Ref / memo</th>{isFinance && <th />}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c._id} className={c.voided ? 'voided' : ''}>
                <td>{c.source === 'import' ? c.date.slice(0, 10) : fmtDate(c.date)}{c.reportingMonth && <div className="small muted">Reporting: {c.reportingMonth}</div>}</td>
                <td>{c.memberName}</td>
                <td><strong>{money(c.amountCents)}</strong></td>
                <td>{METHOD_LABELS[c.method]}{c.source === 'email' && <span className="tag">email</span>}</td>
                <td>{c.category}</td>
                <td className="small">{c.reference}{c.reference && c.memo && ' · '}{c.memo}{c.voided && ` · VOID: ${c.voidReason}`}</td>
                {isFinance && <td>{!c.voided && <div className="actions">
                  {c.source === 'import' && <button className="link" onClick={() => editImportedDate(c)}>Edit date</button>}
                  <button className="link" onClick={() => voidEntry(c)}>Void</button>
                </div>}</td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="7" className="muted">No payments yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
