import { useEffect, useRef, useState } from 'react';
import { apiWithTimeout, money, METHOD_LABELS } from '../api.js';
import { amountInCents, dateFromCell } from './contributionImportData.js';
import { selectedMonthlyAmounts } from './monthlyPaymentData.js';

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
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const errorRef = useRef(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const member = members.find((item) => item.id === memberId);
  const selections = selectedMonthlyAmounts(selected, amount);
  const cents = selections.map(([, value]) => amountInCents(value));
  const total = cents.reduce((sum, value) => sum + (Number.isSafeInteger(value) ? value : 0), 0);
  const totalIsValid = cents.length > 0 && cents.every((value) => Number.isSafeInteger(value) && value > 0) && Number.isSafeInteger(total);
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 1000;

  const check = async (payments) => {
    setError('');
    setReview(null);
    setApproved({});
    setConfirmed(false);
    setBusy('checking');
    try {
      setReview(await apiWithTimeout(`/groups/${groupId}/imports/monthly/check`, { method: 'POST', body: { rows: payments } },
        'The duplicate check took too long. No payments were saved. Try Check again.'));
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
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
    setBusy('saving');
    setAttempted(true);
    try {
      const result = await apiWithTimeout(`/groups/${groupId}/imports/monthly/commit`,
        { method: 'POST', body: { rows, acknowledged: review.conflicts, confirmedDuplicates: Object.keys(approved).filter((id) => approved[id]) } },
        'The request timed out.');
      setMessage(`Saved ${result.saved} payment(s).${result.alreadySaved ? ` ${result.alreadySaved} previously saved payment(s) were not added again.` : ''}`);
      setRows(null);
      setReview(null);
      setSelected({});
      setAttempted(false);
      onSaved();
    } catch (err) {
      setError(`Saving did not finish: ${err.message} Some payments may have been saved. Check the ledger, then retry this same review; do not start a new one.`);
      onSaved();
    }
    finally { setBusy(''); }
  };

  const back = () => {
    if (attempted && !window.confirm('Some payments may already have been saved. Check the ledger before starting a new review, or retry this same review. Go back anyway?')) return;
    setRows(null);
    setReview(null);
    setError('');
  };

  return <section className="card">
    <fieldset disabled={!!busy} aria-busy={!!busy} className="import-controls stack">
      <h2>Record payments by month</h2>
      <p className="small muted">Choose a member and the months already paid, including advance payments. Each month is saved as a separate ledger payment.</p>
      {error && <p className="error" role="alert" tabIndex="-1" ref={errorRef}>{error}</p>}
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
          <p className="small muted">Choose the months paid and enter the amount for each month. Change the year to select months in another year; your selections will stay.</p>
          <div className="form-row">
            <label>Year<input type="number" min="1000" max="9999" value={year} onChange={(event) => setYear(event.target.value)} /></label>
            <label>Same amount per month ($)<input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          </div>
          <p className="small muted">This amount applies automatically to selected months, even if you enter it after choosing them. You can change individual amounts below.</p>
          {!validYear && <p className="error">Enter a four-digit year to choose months.</p>}
          <div className="actions">
            <button type="button" className="secondary" disabled={!validYear} onClick={() => setSelected((previous) => {
              const next = { ...previous };
              months.forEach((month, index) => {
                const key = `${year}-${String(index + 1).padStart(2, '0')}`;
                if (!Object.hasOwn(next, key)) next[key] = null;
              });
              return next;
            })}>Select all months in {validYear ? year : 'this year'}</button>
            <button type="button" className="secondary" disabled={!validYear} onClick={() => setSelected((previous) =>
              Object.fromEntries(Object.entries(previous).filter(([month]) => !month.startsWith(`${year}-`)))
            )}>Clear {validYear ? year : 'this year'}</button>
          </div>
          <div className="month-grid">
            {months.map((month, index) => {
              const key = `${year}-${String(index + 1).padStart(2, '0')}`;
              return <label className={`inline month-choice${Object.hasOwn(selected, key) ? ' selected' : ''}`} key={month}>
                <input type="checkbox" disabled={!validYear} checked={Object.hasOwn(selected, key)} onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((previous) => {
                    const next = { ...previous };
                    if (checked) next[key] = null;
                    else delete next[key];
                    return next;
                  });
                }} /> {month}
              </label>;
            })}
          </div>
          <p className="small" role="status">{selections.length} {selections.length === 1 ? 'month' : 'months'} selected{totalIsValid ? ` · Total ${money(total)}` : ''}{selections.length > 0 ? `: ${selections.map(([month]) => month).join(', ')}` : ''}.</p>
          {selections.length > 0 && <details className="import-options">
            <summary>Some months have different amounts</summary>
            <div className="stack">
              <p className="small muted">Change only the months that differ. Other months use the same amount above.</p>
              <div className="form-row">{selections.map(([month, value]) => <label key={month}>{month} amount ($)
                <input type="text" inputMode="decimal" value={value} onChange={(event) => {
                  const value = event.target.value;
                  setSelected((previous) => ({ ...previous, [month]: value }));
                }} />
              </label>)}</div>
              <div><button type="button" className="secondary" onClick={() => setSelected((previous) =>
                Object.fromEntries(Object.keys(previous).map((month) => [month, null]))
              )}>Use the same amount for all selected months</button></div>
            </div>
          </details>}
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
          </div>
          <details className="import-options">
            <summary>Add a reference or note (optional)</summary>
            <div className="form-row">
              <label>Reference #<input maxLength="200" value={reference} onChange={(event) => setReference(event.target.value)} /></label>
              <label>Memo<input maxLength="200" value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
            </div>
          </details>
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
      {busy && <p role="status" aria-live="polite">{busy === 'checking' ? 'Checking for possible duplicates…' : 'Saving payments… Please wait.'}</p>}
    </fieldset>
  </section>;
}
