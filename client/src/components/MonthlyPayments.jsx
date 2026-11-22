import { useState } from 'react';
import { api, money, METHOD_LABELS } from '../api.js';
import { amountInCents, dateFromCell } from './contributionImportData.js';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const makeId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((n) => n.toString(16).padStart(2, '0')).join('');

export default function MonthlyPayments({ groupId, members, categories, onSaved }) {
  const [memberId, setMemberId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState({});
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('cash');
  const [category, setCategory] = useState(categories.includes('Dues') ? 'Dues' : categories[0]);
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState(null);
  const [review, setReview] = useState(null);
  const [approved, setApproved] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const member = members.find((item) => item.id === memberId);
  const selections = Object.entries(selected).sort(([a], [b]) => a.localeCompare(b));
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 1000;

  const check = async (payments) => {
    setError('');
    setReview(null);
    setApproved({});
    setConfirmed(false);
    setBusy(true);
    try {
      setReview(await api(`/groups/${groupId}/imports/monthly/check`, { method: 'POST', body: { rows: payments } }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const startReview = () => {
    setError('');
    setMessage('');
    if (!member) return setError('Choose an active member.');
    if (!selections.length) return setError('Choose at least one month.');
    if (!dateFromCell(date)) return setError('Choose the actual payment date.');
    const amounts = selections.map(([, value]) => amountInCents(value));
    if (amounts.some((value) => !Number.isSafeInteger(value) || value < 1)) return setError('Enter an amount greater than zero for every selected month.');
    if (!Number.isSafeInteger(amounts.reduce((sum, value) => sum + value, 0))) return setError('The total amount is too large.');
    const payments = selections.map(([reportingMonth], index) => ({
      id: makeId(), membershipId: memberId, amountCents: amounts[index], date, reportingMonth,
      method, category, reference, memo,
    }));
    setRows(payments);
    setAttempted(false);
    check(payments);
  };

  const save = async () => {
    setError('');
    if (!confirmed) return setError('Confirm that you checked the member, months and amounts.');
    if (rows.some((row) => review.conflicts[row.id].length && !approved[row.id])) {
      return setError('Confirm each month with an existing payment, or go back and remove it.');
    }
    setBusy(true);
    setAttempted(true);
    try {
      const result = await api(`/groups/${groupId}/imports/monthly/commit`, {
        method: 'POST', body: { rows, acknowledged: review.conflicts, confirmedDuplicates: Object.keys(approved).filter((id) => approved[id]) },
      });
      setMessage(`Saved ${result.saved} payment(s).${result.alreadySaved ? ` ${result.alreadySaved} previously saved payment(s) were not added again.` : ''}`);
      setRows(null);
      setReview(null);
      setSelected({});
      setAttempted(false);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const back = () => {
    if (attempted && !window.confirm('Some payments may already have been saved. Check the ledger before starting a new review, or retry this same review. Go back anyway?')) return;
    setRows(null);
    setReview(null);
    setError('');
  };

  return <section className="card">
    <fieldset disabled={busy} className="import-controls stack">
      <h2>Record payments by month</h2>
      <p className="small muted">Choose a member and the months already paid, including advance payments. Each month is saved as a separate ledger payment.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!rows ? <>
        <label>1. Choose a member
          <select value={memberId} onChange={(event) => {
            if (selections.length && !window.confirm('Changing the member clears the selected months. Continue?')) return;
            setMemberId(event.target.value);
            setSelected({});
          }}>
            <option value="">Choose a member</option>
            {members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {member && <>
          <h3>2. Choose the months and amounts</h3>
          <p className="small muted">Choose any past or future months. Change the year to select months in another year; your selections will stay.</p>
          <div className="form-row">
            <label>Year<input type="number" min="1000" max="9999" value={year} onChange={(event) => setYear(event.target.value)} /></label>
            <label>Amount per month ($)<input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          </div>
          <div><button type="button" className="secondary" onClick={() => {
            const cents = amountInCents(amount);
            if (!Number.isSafeInteger(cents) || cents < 1) return setError('Enter a valid amount greater than zero first.');
            if (!selections.length) return setError('Choose at least one month first.');
            setSelected(Object.fromEntries(selections.map(([month]) => [month, amount])));
            setError('');
          }}>Use this amount for all selected months</button></div>
          <div className="month-grid">
            {months.map((month, index) => {
              const key = `${year}-${String(index + 1).padStart(2, '0')}`;
              return <label className="inline" key={month}>
                <input type="checkbox" disabled={!validYear} checked={Object.hasOwn(selected, key)} onChange={(event) => {
                  setSelected((previous) => {
                    const next = { ...previous };
                    if (event.target.checked) next[key] = amount;
                    else delete next[key];
                    return next;
                  });
                }} /> {month}
              </label>;
            })}
          </div>
          {selections.length > 0 && <div className="stack">
            <p className="small">Adjust each month if the amounts differ:</p>
            <div className="form-row">{selections.map(([month, value]) => <label key={month}>{month} amount ($)
              <input type="text" inputMode="decimal" value={value} onChange={(event) => setSelected((previous) => ({ ...previous, [month]: event.target.value }))} />
            </label>)}</div>
          </div>}
          <h3>3. Payment details</h3>
          <p className="small muted">Use the actual date received. If payments were received on different dates, record them in separate batches.</p>
          <div className="form-row">
            <label>Payment date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>Method<select value={method} onChange={(event) => setMethod(event.target.value)}>
              {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select></label>
            <label>Reference #<input maxLength="200" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
            <label>Memo<input maxLength="200" value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
          </div>
          <div><button type="button" onClick={startReview}>Review payments</button></div>
        </>}
      </> : <>
        <h3>4. Review before saving</h3>
        <p><strong>{member?.name}</strong> · {rows.length} payments · <strong>{money(rows.reduce((sum, row) => sum + row.amountCents, 0))}</strong></p>
        <p className="small">Received {date} · {METHOD_LABELS[method]} · {category}. These are separate ledger entries; the amounts shown add up to the total received for these months.</p>
        {review?.alreadySaved.length > 0 && <p className="small">Some payments in this review were already saved and will not be added again.</p>}
        <div className="stack">{rows.map((row) => {
          const conflicts = review?.conflicts[row.id] || [];
          return <div className="import-options" key={row.id}>
            <strong>{row.reportingMonth}: {money(row.amountCents)}</strong>
            {review?.alreadySaved.includes(row.id) && <p className="small">Already saved.</p>}
            {conflicts.length > 0 && <div className="import-help">
              <p>There is already a payment for this member, category and month. Check whether this is an additional payment:</p>
              <ul>{conflicts.map((id) => <li key={id}>{money(review.details[id].amountCents)} received {review.details[id].date}</li>)}</ul>
              <label className="inline"><input type="checkbox" checked={!!approved[row.id]}
                onChange={(event) => setApproved({ ...approved, [row.id]: event.target.checked })} /> Save this additional payment anyway</label>
            </div>}
          </div>;
        })}</div>
        {review && <label className="inline"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          I checked the member, months, amounts and total.
        </label>}
        <div className="actions">
          <button type="button" className="secondary" onClick={back}>Back to choices</button>
          <button type="button" className="secondary" onClick={() => check(rows)}>Check again</button>
          {review && <button type="button" onClick={save}>Save monthly payments</button>}
        </div>
      </>}
    </fieldset>
  </section>;
}
