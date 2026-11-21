import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { amountInCents, makeImportRows } from './contributionImportData.js';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthHeaders = [
  /^(jan|january)$/, /^(feb|february)$/, /^(mar|marc|march)$/, /^(apr|april)$/,
  /^may$/, /^(jun|june)$/, /^(jul|july)$/, /^(aug|augu|august)$/,
  /^(sep|sept|september)$/, /^(oct|october)$/, /^(nov|november)$/, /^(dec|december)$/,
];
const currentDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const makeId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((n) => n.toString(16).padStart(2, '0')).join('');

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export default function ContributionImport({ groupId, members, categories, onImported }) {
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(1);
  const [layout, setLayout] = useState('matrix');
  const [nameColumn, setNameColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');
  const [dateColumn, setDateColumn] = useState('');
  const [categoryColumn, setCategoryColumn] = useState('');
  const [memoColumn, setMemoColumn] = useState('');
  const [columns, setColumns] = useState([]);
  const [year, setYear] = useState('');
  const [defaultDate, setDefaultDate] = useState(currentDate);
  const [defaultCategory, setDefaultCategory] = useState(categories[0]);
  const [rows, setRows] = useState(null);
  const [review, setReview] = useState(null);
  const [approved, setApproved] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const sheet = sheets[sheetIndex];
  const headers = sheet?.rows[headerRow - 1] || [];

  useEffect(() => {
    if (!sheet) return;
    const row = sheet.rows[headerRow - 1] || [];
    const find = (pattern) => {
      const index = row.findIndex((value) => pattern.test(String(value).trim()));
      return index < 0 ? '' : String(index);
    };
    setNameColumn(find(/^(member|member name|name)$/i));
    setAmountColumn(find(/^(amount|payment|contribution)$/i));
    setDateColumn(find(/^(date|payment date)$/i));
    setCategoryColumn(find(/^category$/i));
    setMemoColumn(find(/^(memo|note|notes|event)$/i));
    setColumns(row.map((value) => {
      const header = String(value).trim().toLowerCase();
      const index = monthHeaders.findIndex((pattern) => pattern.test(header));
      return {
        kind: index >= 0 ? String(index + 1).padStart(2, '0') : header === 'special' ? 'other' : '',
        category: categories.find((category) => category.toLowerCase() === header) ||
          categories.find((category) => category.toLowerCase() === (header === 'special' ? 'other' : 'dues')) || categories[0],
      };
    }));
    setRows(null);
    setReview(null);
  }, [sheet, headerRow, categories]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 750 * 1024 || !file.size) {
      setError('Choose a non-empty .xlsx file no larger than 750 KB.');
      return;
    }
    setBusy(true);
    try {
      const result = await api(`/groups/${groupId}/imports/workbook`, { method: 'POST', body: { data: await readFile(file) } });
      setSheets(result.sheets);
      setSheetIndex(0);
      setHeaderRow(1);
      setRows(null);
      setReview(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const options = headers.map((header, i) => <option key={i} value={String(i)}>{i + 1}: {String(header || '(blank heading)')}</option>);
  const columnSelect = (label, value, setter, optional = false) => (
    <label>{label}
      <select value={value} onChange={(event) => setter(event.target.value)}>
        <option value="">{optional ? 'Not in this sheet' : 'Choose a column'}</option>
        {options}
      </select>
    </label>
  );
  const changeColumn = (i, update) => setColumns((previous) => previous.map((column, index) => index === i ? { ...column, ...update } : column));
  const changeRow = (id, update) => {
    setRows((previous) => previous.map((row) => row.id === id ? { ...row, ...update } : row));
    setReview(null);
    setApproved({});
  };

  const preview = () => {
    setError('');
    setMessage('');
    if (!sheet || nameColumn === '' || !defaultDate) return setError('Choose a member column and default date.');
    if (layout === 'matrix') {
      if (!columns.some((column) => column.kind)) return setError('Choose at least one payment column.');
      if (columns.some((column) => column.kind && column.kind !== 'other') && !/^\d{4}$/.test(year)) return setError('Enter the four-digit year for the month columns.');
      if (columns[Number(nameColumn)]?.kind) return setError('The member column cannot also be a payment column.');
    } else if (amountColumn === '' || amountColumn === nameColumn) return setError('Choose separate member and amount columns.');
    const result = makeImportRows({
      sheet, headerRow, layout, nameColumn: Number(nameColumn), amountColumn: Number(amountColumn),
      dateColumn: dateColumn === '' ? '' : Number(dateColumn), categoryColumn: categoryColumn === '' ? '' : Number(categoryColumn),
      memoColumn: memoColumn === '' ? '' : Number(memoColumn),
      columns, year, defaultDate, defaultCategory, categories, members, makeId,
    });
    if (!result.length) return setError('No non-zero payment cells were found in the selected columns.');
    if (result.length > 1000) return setError('This selection has more than 1,000 payments. Split the workbook into smaller imports.');
    setRows(result);
    setReview(null);
    setApproved({});
  };

  const selectedPayload = () => {
    const selected = rows.filter((row) => row.selected);
    if (!selected.length) throw new Error('Select at least one payment.');
    return selected.map((row) => {
      const cents = amountInCents(row.amount);
      if (row.memo.length > 200) throw new Error(`Shorten the memo for ${row.origin} to 200 characters or fewer.`);
      if (!row.membershipId || !Number.isSafeInteger(cents) || cents < 1 || !row.date ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.reportingMonth) || !categories.includes(row.category)) {
        throw new Error(`Complete the member, positive amount, date, reporting month and category for ${row.origin}.`);
      }
      return { id: row.id, membershipId: row.membershipId, amountCents: cents, date: row.date, reportingMonth: row.reportingMonth, category: row.category, memo: row.memo };
    });
  };

  const check = async () => {
    setError('');
    setMessage('');
    setReview(null);
    setApproved({});
    try {
      const payload = selectedPayload();
      setBusy(true);
      const result = await api(`/groups/${groupId}/imports/check`, { method: 'POST', body: { rows: payload } });
      setReview(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    setError('');
    setMessage('');
    try {
      const payload = selectedPayload();
      if (payload.some((row) => review.conflicts[row.id].length && !approved[row.id])) throw new Error('Confirm each possible duplicate or unselect it and check again.');
      setBusy(true);
      const result = await api(`/groups/${groupId}/imports/commit`, {
        method: 'POST', body: { rows: payload, acknowledged: review.conflicts, confirmedDuplicates: Object.keys(approved).filter((id) => approved[id]) },
      });
      setMessage(`Imported ${result.saved} payment(s). ${result.alreadySaved ? `${result.alreadySaved} previously saved payment(s) were not added again.` : ''}`);
      setRows(null);
      setReview(null);
      onImported();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="card stack">
      <fieldset disabled={busy} className="import-controls stack">
      <h2>Import contributions from Excel</h2>
      <p className="small muted">Finance roles can review every payment before saving. Totals should be left as ignored columns; they are not payments.</p>
      {error && <p className="error">{error}</p>}
      {message && <p role="status">{message}</p>}
      <label>Excel workbook (.xlsx, up to 750 KB)
        <input type="file" accept=".xlsx" disabled={busy} onChange={upload} />
      </label>
      {sheet && !rows && <>
        <div className="form-row">
          <label>Worksheet<select value={sheetIndex} onChange={(event) => setSheetIndex(Number(event.target.value))}>
            {sheets.map((item, i) => <option key={i} value={i}>{item.name}</option>)}
          </select></label>
          <label>Heading row<input type="number" min="1" max={sheet.rows.length} value={headerRow}
            onChange={(event) => setHeaderRow(Number(event.target.value))} /></label>
          <label>Layout<select value={layout} onChange={(event) => setLayout(event.target.value)}>
            <option value="matrix">One row per member, payment columns</option>
            <option value="payments">One row per payment</option>
          </select></label>
          {columnSelect('Member name', nameColumn, setNameColumn)}
          <label>Default payment date<input type="date" value={defaultDate} onChange={(event) => setDefaultDate(event.target.value)} /></label>
          {layout === 'matrix' ? <label>Year for month columns<input type="number" min="1000" max="9999" value={year} onChange={(event) => setYear(event.target.value)} /></label> :
            <label>Default category<select value={defaultCategory} onChange={(event) => setDefaultCategory(event.target.value)}>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select></label>}
        </div>
        {layout === 'payments' ? <div className="form-row">
          {columnSelect('Amount', amountColumn, setAmountColumn)}
          {columnSelect('Payment date (YYYY-MM-DD or Excel date)', dateColumn, setDateColumn, true)}
          {columnSelect('Category', categoryColumn, setCategoryColumn, true)}
          {columnSelect('Memo or event name', memoColumn, setMemoColumn, true)}
        </div> : <>
          <p className="small muted">Map each payment column to a month or an event/other payment. Leave totals and other columns ignored.</p>
          <div className="import-table"><table><thead><tr><th>Column</th><th>Use as</th><th>Category</th></tr></thead><tbody>
            {headers.map((header, i) => <tr key={i}>
              <td>{i + 1}: {String(header || '(blank heading)')}</td>
              <td><select value={columns[i]?.kind || ''} onChange={(event) => changeColumn(i, { kind: event.target.value })}>
                <option value="">Ignore</option>
                {months.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
                <option value="other">Event / other</option>
              </select></td>
              <td><select value={columns[i]?.category || categories[0]} disabled={!columns[i]?.kind}
                onChange={(event) => changeColumn(i, { category: event.target.value })}>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select></td>
            </tr>)}
          </tbody></table></div>
        </>}
        <button type="button" disabled={busy || headerRow < 1 || headerRow > sheet.rows.length} onClick={preview}>Create preview</button>
      </>}
      {rows && <>
        <p className="small">Check member matches, amounts, dates, reporting months and categories. Unselect rows you do not want to import. Date defaults to the chosen date when the sheet has none; reporting month is separate.</p>
        <div className="import-table"><table><thead><tr><th>Import</th><th>Spreadsheet</th><th>Member match</th><th>Amount</th><th>Payment date</th><th>Reporting month</th><th>Category</th><th>Memo</th><th>Duplicate review</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td><input aria-label={`Import ${row.origin}`} type="checkbox" checked={row.selected} onChange={(event) => changeRow(row.id, { selected: event.target.checked })} /></td>
            <td>{row.origin}<br /><strong>{row.name || '(no name)'}</strong></td>
            <td><select aria-label={`Member for ${row.origin}`} value={row.membershipId} onChange={(event) => changeRow(row.id, { membershipId: event.target.value })}>
              <option value="">Match a member</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select></td>
            <td><input aria-label={`Amount for ${row.origin}`} type="text" inputMode="decimal" value={row.amount} onChange={(event) => changeRow(row.id, { amount: event.target.value })} /></td>
            <td><input aria-label={`Date for ${row.origin}`} type="date" value={row.date} onChange={(event) => changeRow(row.id, { date: event.target.value })} /></td>
            <td><input aria-label={`Reporting month for ${row.origin}`} type="month" value={row.reportingMonth} onChange={(event) => changeRow(row.id, { reportingMonth: event.target.value })} /></td>
            <td><select aria-label={`Category for ${row.origin}`} value={row.category} onChange={(event) => changeRow(row.id, { category: event.target.value })}>
              <option value="">Choose category</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select></td>
            <td><input aria-label={`Memo for ${row.origin}`} type="text" maxLength="200" value={row.memo} onChange={(event) => changeRow(row.id, { memo: event.target.value })} /></td>
            <td>{review && row.selected && <>
              {review.alreadySaved.includes(row.id) && <span>Already saved. </span>}
              {review.conflicts[row.id]?.length > 0 && <>
                <span>Possible duplicate: same member, category and reporting month.</span>
                <ul>{review.conflicts[row.id].map((id) => <li key={id}>
                  {review.details[id]?.source === 'import' && rows.some((item) => item.id === id) ? 'Another preview row' : 'Existing payment'}: {money(review.details[id]?.amountCents)}, {review.details[id]?.date}
                </li>)}</ul>
                <label className="inline"><input type="checkbox" checked={!!approved[row.id]} onChange={(event) => setApproved({ ...approved, [row.id]: event.target.checked })} /> Import anyway</label>
              </>}
            </>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => { setRows(null); setReview(null); setError(''); }}>Change mapping</button>
          <button type="button" disabled={busy} onClick={check}>Check for duplicates</button>
          {review && <button type="button" disabled={busy} onClick={commit}>Import selected payments</button>}
        </div>
      </>}
      </fieldset>
    </section>
  );
}
