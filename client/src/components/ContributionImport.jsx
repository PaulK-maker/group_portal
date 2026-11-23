import { useEffect, useRef, useState } from 'react';
import { apiWithTimeout, money } from '../api.js';
import {
  amountInCents, assignMemberToGroup, assignMonthlyColumns, assignSpecialColumn, columnLetter,
  dateFromCell, fillMissingDates, importIssues, makeImportRows, matchMember, unmatchedNameGroups,
} from './contributionImportData.js';

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
const headerMatches = (header, pattern) => pattern.test(String(header ?? '').trim());
const suggestedHeaderRow = (sheet) => {
  const index = sheet.rows.slice(0, 10).findIndex((row) =>
    row.filter((value) => monthHeaders.some((pattern) => pattern.test(String(value).trim().toLowerCase()))).length >= 2
  );
  return index < 0 ? 1 : index + 1;
};

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
  const [fileName, setFileName] = useState('');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(1);
  const [firstDataRow, setFirstDataRow] = useState(2);
  const [layout, setLayout] = useState('matrix');
  const [nameColumn, setNameColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');
  const [dateColumn, setDateColumn] = useState('');
  const [dateFormat, setDateFormat] = useState('');
  const [categoryColumn, setCategoryColumn] = useState('');
  const [memoColumn, setMemoColumn] = useState('');
  const [columns, setColumns] = useState([]);
  const [firstMonthColumn, setFirstMonthColumn] = useState('');
  const [monthCategory, setMonthCategory] = useState(categories.find((category) => category.toLowerCase() === 'dues') || categories[0]);
  const [specialColumn, setSpecialColumn] = useState('');
  const [specialCategory, setSpecialCategory] = useState(categories.find((category) => category.toLowerCase() === 'other') || categories[0]);
  const [specialName, setSpecialName] = useState('Special contribution');
  const [year, setYear] = useState('');
  const [defaultDate, setDefaultDate] = useState(currentDate);
  const [defaultCategory, setDefaultCategory] = useState(categories[0]);
  const [bulkDate, setBulkDate] = useState(currentDate);
  const [bulkCategory, setBulkCategory] = useState(categories[0]);
  const [rows, setRows] = useState(null);
  const [review, setReview] = useState(null);
  const [sourceReviewed, setSourceReviewed] = useState(false);
  const [commitAttempted, setCommitAttempted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const errorRef = useRef(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const sheet = sheets[sheetIndex];
  const headers = headerRow === 0
    ? Array(sheet?.rows[0]?.length || 0).fill('')
    : sheet?.rows[headerRow - 1] || [];

  useEffect(() => {
    if (!sheet) return;
    const row = headerRow === 0 ? Array(sheet.rows[0]?.length || 0).fill('') : sheet.rows[headerRow - 1] || [];
    const find = (pattern) => {
      const index = row.findIndex((value) => headerMatches(value, pattern));
      return index < 0 ? '' : String(index);
    };
    const amount = find(/^(amount|payment|contribution)$/i);
    const hasMonths = row.some((value) => monthHeaders.some((pattern) => pattern.test(String(value).trim().toLowerCase())));
    setLayout(amount !== '' && !hasMonths ? 'payments' : 'matrix');
    setNameColumn(find(/^(member|member name|name|payer)$/i));
    setAmountColumn(amount);
    setDateColumn(find(/^(date|payment date)$/i));
    setDateFormat('');
    setCategoryColumn(find(/^category$/i));
    setMemoColumn(find(/^(memo|note|notes|event)$/i));
    setFirstMonthColumn('');
    setSpecialColumn('');
    setColumns(row.map((value) => {
      const header = String(value).trim().toLowerCase();
      const index = monthHeaders.findIndex((pattern) => pattern.test(header));
      return {
        kind: index >= 0 ? String(index + 1).padStart(2, '0') : header === 'special' ? 'other' : '',
        category: categories.find((category) => category.toLowerCase() === header) ||
          categories.find((category) => category.toLowerCase() === (header === 'special' ? 'other' : 'dues')) || categories[0],
      };
    }));
  }, [sheet, headerRow, categories]);

  const chooseSheet = (index, availableSheets = sheets) => {
    setSheetIndex(index);
    const heading = index < 0 ? 1 : suggestedHeaderRow(availableSheets[index]);
    setHeaderRow(heading);
    setFirstDataRow(heading + 1);
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 750 * 1024 || !file.size) {
      setError('Choose a non-empty Excel file ending in .xlsx, no larger than 750 KB.');
      return;
    }
    setBusy('reading');
    try {
      const result = await apiWithTimeout(`/groups/${groupId}/imports/workbook`, { method: 'POST', body: { data: await readFile(file) } },
        'Reading the file took too long. No payments were saved. Try again.');
      setSheets(result.sheets);
      setFileName(file.name);
      chooseSheet(result.sheets.length === 1 ? 0 : -1, result.sheets);
      setRows(null);
      setReview(null);
      setSourceReviewed(false);
      setCommitAttempted(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const columnDescription = (header, i) => {
    const example = sheet?.rows.slice(Math.max(0, firstDataRow - 1)).map((row) => row[i]).find((value) => value !== '' && value != null);
    return `Column ${columnLetter(i)}: ${String(header || '(blank heading)')}${example == null ? '' : ` — example: ${String(example).slice(0, 60)}`}`;
  };
  const options = headers.map((header, i) => <option key={i} value={String(i)}>{columnDescription(header, i)}</option>);
  const columnSelect = (label, value, setter, optional = false) => (
    <label>{label}
      <select value={value} onChange={(event) => setter(event.target.value)}>
        <option value="">{optional ? 'Not in this file' : 'Choose a column'}</option>
        {options}
      </select>
    </label>
  );
  const changeColumn = (i, update) => setColumns((previous) => previous.map((column, index) => index === i ? { ...column, ...update } : column));
  const updateRows = (update) => {
    setRows(update);
    setReview(null);
    setSourceReviewed(false);
    setError('');
  };
  const changeRow = (id, update) => updateRows((previous) => previous.map((row) => row.id === id ? { ...row, ...update } : row));

  const preview = () => {
    setError('');
    setMessage('');
    if (!sheet || nameColumn === '' || !dateFromCell(defaultDate)) return setError('Choose the column with member names and a valid date to use when dates are missing.');
    if (!Number.isInteger(firstDataRow) || firstDataRow < 1 || firstDataRow > sheet.rows.length) return setError('Choose the first row containing payments.');
    if (headerRow > 0 && firstDataRow <= headerRow) return setError('The first payment row must be after the heading row, or choose “No headings”.');
    if (layout === 'matrix') {
      if (!columns.some((column) => column.kind)) return setError('Open “Change column choices” and choose at least one payment column.');
      if (columns.some((column) => column.kind && column.kind !== 'other') && !/^\d{4}$/.test(year)) return setError('Enter the year that the month columns refer to.');
      if (columns[Number(nameColumn)]?.kind) return setError('The member name column cannot also be a payment column.');
    } else if (amountColumn === '' || amountColumn === nameColumn) return setError('Choose different columns for member names and payment amounts.');
    const voidedIndex = headers.findIndex((header) => headerMatches(header, /^voided$/i));
    const result = makeImportRows({
      sheet, headerRow, firstDataRow, layout, nameColumn: Number(nameColumn), amountColumn: Number(amountColumn),
      dateColumn: dateColumn === '' ? '' : Number(dateColumn), dateFormat,
      categoryColumn: categoryColumn === '' ? '' : Number(categoryColumn),
      memoColumn: memoColumn === '' ? '' : Number(memoColumn),
      voidedColumn: layout === 'payments' && voidedIndex >= 0 ? voidedIndex : '',
      columns, year, defaultDate, defaultCategory, categories, members, makeId,
    });
    if (!result.length) return setError('No payments with a non-zero amount were found. Check your column choices.');
    if (result.length > 1000) return setError('This selection has more than 1,000 payments. Split the file into smaller imports.');
    setRows(result);
    setReview(null);
    setSourceReviewed(false);
    setCommitAttempted(false);
  };

  const selectedPayload = () => {
    const selected = rows.filter((row) => row.selected);
    if (!selected.length) throw new Error('Choose at least one payment to include.');
    if (selected.some((row) => importIssues(row, categories).length)) {
      throw new Error('Some payments need attention. Open the payments marked below and complete the missing details.');
    }
    return selected.map((row) => ({
      id: row.id, membershipId: row.membershipId, amountCents: amountInCents(row.amount),
      date: row.date, reportingMonth: row.reportingMonth, category: row.category, memo: row.memo,
    }));
  };

  const check = async () => {
    setError('');
    setMessage('');
    setReview(null);
    setSourceReviewed(false);
    try {
      const payload = selectedPayload();
      setBusy('checking');
      const result = await apiWithTimeout(`/groups/${groupId}/imports/check`, { method: 'POST', body: { rows: payload } },
        'The duplicate check took too long. No payments were saved. Try again.');
      setReview(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const commit = async () => {
    setError('');
    setMessage('');
    let started = false;
    try {
      const payload = selectedPayload();
      if (!sourceReviewed) throw new Error('Confirm that you checked the names and amounts before importing.');
      setBusy('saving');
      setCommitAttempted(true);
      started = true;
      const result = await apiWithTimeout(`/groups/${groupId}/imports/commit`, {
        method: 'POST', body: { rows: payload, acknowledged: review.conflicts, confirmedDuplicates: payload.filter((row) => review.conflicts[row.id].length).map((row) => row.id) },
      }, 'The request timed out.');
      setMessage(`Imported ${result.saved} payment(s). ${result.alreadySaved ? `${result.alreadySaved} previously saved payment(s) were not added again.` : ''}`);
      setRows(null);
      setReview(null);
      setCommitAttempted(false);
      onImported();
    } catch (err) {
      setError(started ? `Import did not finish: ${err.message} Some payments may have been saved. Check the ledger, then check for duplicates and retry this same review.` : err.message);
      if (started) onImported();
    }
    finally { setBusy(''); }
  };

  const backToSettings = () => {
    if (commitAttempted && !window.confirm('Some payments may already have been saved. Going back creates a new preview. Check the ledger first to avoid importing them twice. Go back anyway?')) return;
    setRows(null);
    setReview(null);
    setError('');
  };

  const selected = rows?.filter((row) => row.selected) || [];
  const needsAttention = selected.filter((row) => importIssues(row, categories).length);
  const unmatched = unmatchedNameGroups(rows || []);
  const missingDates = selected.filter((row) => !dateFromCell(row.date)).length;
  const missingCategories = selected.filter((row) => !categories.includes(row.category)).length;
  const voidedCount = rows?.filter((row) => row.excludedReason).length || 0;
  const voidedIncluded = rows?.filter((row) => row.excludedReason && row.selected).length || 0;
  const duplicateCount = review ? selected.filter((row) => review.conflicts[row.id]?.length).length : 0;
  const hasWrittenDates = layout === 'payments' && dateColumn !== '' &&
    sheet?.rows.slice(Math.max(0, firstDataRow - 1)).some((row) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(row[Number(dateColumn)] ?? '').trim()));
  const selectedColumns = columns.map((column, i) => column.kind
    ? `${columnLetter(i)}: ${column.kind === 'other' ? (column.note || headers[i] || 'extra payment') : months[Number(column.kind) - 1]} (${column.category})` : '').filter(Boolean);

  return (
    <section className="card">
      <fieldset disabled={!!busy} aria-busy={!!busy} className="import-controls stack">
        <h2>Bring in payments from Excel</h2>
        <p className="small muted">Choose your file, check what we found, then review possible duplicates. Nothing is saved until you choose Import.</p>
        {error && <p className="error" role="alert" tabIndex="-1" ref={errorRef}>{error}</p>}
        {message && <p role="status">{message}</p>}

        {!rows && <>
          <div className="import-step">
            <h3>1. Choose your Excel file</h3>
            <label>Excel file (.xlsx, up to 750 KB)
              <input type="file" accept=".xlsx" onChange={upload} />
            </label>
            {fileName && <p className="small">File loaded: <strong>{fileName}</strong></p>}
            {sheets.length > 1 && <label>Which sheet has the payments?
              <select value={sheetIndex < 0 ? '' : sheetIndex} onChange={(event) => {
                chooseSheet(event.target.value === '' ? -1 : Number(event.target.value));
              }}>
                <option value="">Choose a sheet</option>
                {sheets.map((item, i) => <option key={i} value={i}>{item.name}</option>)}
              </select>
            </label>}
            {sheet && <p className="small">Selected sheet: <strong>{sheet.name}</strong></p>}
          </div>

          {sheet && <div className="import-step stack">
            <div>
              <h3>2. Tell us about your file</h3>
              <p className="small muted">We suggest column choices below. Check them before continuing. Totals should not be imported as payments.</p>
            </div>
            <label className="inline"><input type="checkbox" checked={headerRow === 0} onChange={(event) => {
              const heading = event.target.checked ? 0 : suggestedHeaderRow(sheet);
              setHeaderRow(heading);
              setFirstDataRow(heading + 1);
            }} /> My sheet has no column headings</label>
            <div className="form-row">
              {headerRow !== 0 && <label>Row with column headings
                <input type="number" min="1" max={sheet.rows.length} value={headerRow} onChange={(event) => {
                  const heading = Number(event.target.value);
                  setHeaderRow(heading);
                  if (heading >= 1) setFirstDataRow(heading + 1);
                }} />
              </label>}
              <label>First row with member payments
                <input type="number" min="1" max={sheet.rows.length} value={firstDataRow} onChange={(event) => setFirstDataRow(Number(event.target.value))} />
              </label>
            </div>
            <div className="stack">
              <p className="small">First rows from your sheet. Check the names and amounts here before selecting columns; totals are not individual payments.</p>
              <div className="import-source-table"><table>
                <thead><tr><th>Row</th>{headers.map((header, i) => <th key={i}>{columnLetter(i)}</th>)}</tr></thead>
                <tbody>{sheet.rows.slice(Math.max(0, firstDataRow - 1), Math.max(0, firstDataRow - 1) + 3).map((row, i) => <tr key={i}>
                  <td>{firstDataRow + i}</td>{headers.map((header, column) => <td key={column}>{String(row[column] ?? '')}</td>)}
                </tr>)}</tbody>
              </table></div>
            </div>
            <div className="form-row">
              <label>How is your file arranged?
                <select value={layout} onChange={(event) => setLayout(event.target.value)}>
                  <option value="matrix">Names down the page, months or events across</option>
                  <option value="payments">One payment on each row</option>
                </select>
              </label>
              {columnSelect('Column with member names', nameColumn, setNameColumn)}
              {layout === 'payments' && columnSelect('Column with payment amounts', amountColumn, setAmountColumn)}
              <label>Date to use when a payment has no date
                <input type="date" value={defaultDate} onChange={(event) => setDefaultDate(event.target.value)} />
              </label>
              {layout === 'matrix' ? <label>What year are the month columns for?
                <input type="number" min="1000" max="9999" placeholder="For example, 2025" value={year} onChange={(event) => setYear(event.target.value)} />
              </label> : <label>Category to use when none is provided
                <select value={defaultCategory} onChange={(event) => setDefaultCategory(event.target.value)}>
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>}
            </div>
            {hasWrittenDates && <label>How are dates with slashes written in your file?
              <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value)}>
                <option value="">I will check these dates in the next step</option>
                <option value="month-day-year">Month / day / year (example: 12/31/2025)</option>
                <option value="day-month-year">Day / month / year (example: 31/12/2025)</option>
              </select>
            </label>}
            {layout === 'matrix' && <div className="import-help stack">
              <h3>12 months in consecutive columns?</h3>
              <p className="small">Choose the January column. We will select the next 11 columns for February through December, replacing previous month selections. Check the column letters and examples against your file.</p>
              <div className="form-row">
                {columnSelect('January column', firstMonthColumn, setFirstMonthColumn)}
                <label>Category for these months
                  <select value={monthCategory} onChange={(event) => setMonthCategory(event.target.value)}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
              </div>
              <div><button type="button" className="secondary" onClick={() => {
                try {
                  if (nameColumn === '' || firstMonthColumn === '') throw new Error('Choose the member name column and January column first.');
                  setColumns(assignMonthlyColumns(columns, headers, Number(firstMonthColumn), Number(nameColumn), monthCategory));
                  setError('');
                } catch (err) { setError(err.message); }
              }}>Select January to December</button></div>
              <h3>Extra contributions (optional)</h3>
              <p className="small">Select an extra payment column only if you want to import it. Do not select a total column.</p>
              <div className="form-row">
                {columnSelect('Extra payment column', specialColumn, setSpecialColumn, true)}
                <label>Category
                  <select value={specialCategory} onChange={(event) => setSpecialCategory(event.target.value)}>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>Payment note<input type="text" maxLength="200" value={specialName} onChange={(event) => setSpecialName(event.target.value)} /></label>
              </div>
              <div><button type="button" className="secondary" onClick={() => {
                try {
                  if (nameColumn === '' || specialColumn === '') throw new Error('Choose the member name column and extra payment column first.');
                  setColumns(assignSpecialColumn(columns, headers, Number(specialColumn), Number(nameColumn), specialCategory, specialName));
                  setError('');
                } catch (err) { setError(err.message); }
              }}>Add extra payment column</button></div>
            </div>}
            {busy && <p role="status" aria-live="polite">{busy === 'reading' ? 'Reading the file…' : busy === 'checking' ? 'Checking for possible duplicates…' : 'Importing payments… Please wait.'}</p>}
            {layout === 'matrix' && <p className="small">
              <strong>Payment columns selected:</strong> {selectedColumns.length ? selectedColumns.join(', ') : 'None yet. Open the choices below to select them.'}
            </p>}
            {layout === 'payments' && <p className="small">
              <strong>Also using:</strong> {[
                dateColumn !== '' && `date: ${headers[Number(dateColumn)] || `column ${Number(dateColumn) + 1}`}`,
                categoryColumn !== '' && `category: ${headers[Number(categoryColumn)] || `column ${Number(categoryColumn) + 1}`}`,
                memoColumn !== '' && `note: ${headers[Number(memoColumn)] || `column ${Number(memoColumn) + 1}`}`,
              ].filter(Boolean).join(', ') || 'no date, category or note column'}
            </p>}
            <details className="import-options">
              <summary>Change individual column choices</summary>
              <div className="stack">
                {layout === 'payments' ? <div className="form-row">
                  {columnSelect('Payment date column', dateColumn, setDateColumn, true)}
                  {columnSelect('Category column', categoryColumn, setCategoryColumn, true)}
                  {columnSelect('Note or event name column', memoColumn, setMemoColumn, true)}
                </div> : <div className="stack">
                  <p className="small muted">Choose what each column contains. Leave totals and anything you do not want to import as “Do not import”.</p>
                  {headers.map((header, i) => <div className="import-column" key={i}>
                    <strong>{columnDescription(header, i)}</strong>
                    <label>Use this column for
                      <select value={columns[i]?.kind || ''} onChange={(event) => changeColumn(i, { kind: event.target.value })}>
                        <option value="">Do not import</option>
                        {months.map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
                        <option value="other">Event or other payments</option>
                      </select>
                    </label>
                    {columns[i]?.kind && <label>Category
                      <select value={columns[i].category} onChange={(event) => changeColumn(i, { category: event.target.value })}>
                        {categories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>}
                  </div>)}
                </div>}
              </div>
            </details>
            <div><button type="button" onClick={preview}>Continue to payment review</button></div>
          </div>}
        </>}

        {rows && <div className="import-step stack">
          <div>
            <h3>3. Check your payments</h3>
            <p className="small">File: <strong>{fileName}</strong> · Sheet: <strong>{sheet.name}</strong></p>
            <p>{selected.length} selected {selected.length === 1 ? 'payment' : 'payments'}{needsAttention.length > 0
              ? ` · ${needsAttention.length} ${needsAttention.length === 1 ? 'needs' : 'need'} attention`
              : selected.length ? ' · ready to check for duplicates' : ' · choose at least one to continue'}</p>
            <p className="small muted">Compare the file value with the amount to be saved. For example, 50 in the file should show as $50.00. Open a payment to change it or leave it out. The payment date and the month used for reports are kept separately.</p>
            {voidedCount > 0 && <p className="small">{voidedCount} {voidedCount === 1 ? 'payment was' : 'payments were'} marked voided in the file. {voidedIncluded ? `${voidedIncluded} selected for import.` : 'All are left out.'} Including one records it as an active payment.</p>}
          </div>

          {unmatched.length > 0 && <div className="import-help">
            <h3>Match names from your file</h3>
            <p className="small">For each name, choose the person already in this group. A choice applies to all unmatched payments with that name; check that they belong to the same person.</p>
            <p className="small">Members are not created by this import. Add missing people on the Members page first; you will need to choose this file again afterwards.</p>
            {unmatched.map((group) => <label key={group.key}>
              {group.name || `No name (${rows.find((row) => row.id === group.key.slice(6))?.origin || 'one payment'})`} · {group.count} {group.count === 1 ? 'payment' : 'payments'}
              <select value="" onChange={(event) => {
                if (event.target.value) updateRows((previous) => assignMemberToGroup(previous, group.key, event.target.value));
              }}>
                <option value="">Choose a member</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>)}
          </div>}

          {missingDates > 0 && <div className="import-help">
            <h3>Help with {missingDates} {missingDates === 1 ? 'date' : 'dates'}</h3>
            <p className="small">Some dates were missing or could not be read. You can fix each payment below, or use one date for all of them. Existing dates and report months will not be changed; where the report month is missing, it will use this date's month.</p>
            <div className="actions">
              <label>Date to use<input type="date" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} /></label>
              <button type="button" className="secondary" onClick={() => {
                if (!dateFromCell(bulkDate)) return setError('Choose a valid date first.');
                updateRows((previous) => fillMissingDates(previous, bulkDate));
              }}>Use this date for missing dates</button>
            </div>
          </div>}

          {missingCategories > 0 && <div className="import-help">
            <h3>Help with {missingCategories} {missingCategories === 1 ? 'category' : 'categories'}</h3>
            <p className="small">You can choose a category for each payment below, or apply one to every payment without a recognized category, even if the labels in the file differ.</p>
            <div className="actions">
              <label>Category to use<select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select></label>
              <button type="button" className="secondary" onClick={() => updateRows((previous) => previous.map((row) =>
                row.selected && !categories.includes(row.category) ? { ...row, category: bulkCategory } : row
              ))}>Use this category for missing categories</button>
            </div>
          </div>}

          {review && <div className="import-help">
            <h3>4. Review possible duplicates</h3>
            <p>{duplicateCount ? `${duplicateCount} selected ${duplicateCount === 1 ? 'payment has' : 'payments have'} possible matches. They may be separate payments. Compare them before deciding.` : 'No possible duplicates were found.'}</p>
            {review.alreadySaved.length > 0 && <p className="small">Some payments in this preview were already saved. They will not be added again.</p>}
            {duplicateCount > 0 && <details>
              <summary>Compare possible matches for this sheet</summary>
              <ul>{selected.filter((row) => review.conflicts[row.id]?.length).map((row) => <li key={row.id}>
                {members.find((member) => member.id === row.membershipId)?.name || row.name} · {row.reportingMonth} · {money(amountInCents(row.amount))}
                <ul>{review.conflicts[row.id].map((id) => <li key={id}>
                  {review.details[id]?.source === 'import' && rows.some((item) => item.id === id) ? 'Also in this preview' : 'Already in the ledger'}: {money(review.details[id]?.amountCents)}, {review.details[id]?.date}
                </li>)}</ul>
              </li>)}</ul>
            </details>}
            {duplicateCount > 0 && <button type="button" className="secondary" onClick={() => updateRows((previous) => previous.map((row) =>
              review.conflicts[row.id]?.length ? { ...row, selected: false } : row
            ))}>Leave out all possible duplicates</button>}
          </div>}

          <div className="stack">
            {rows.map((row) => {
              const issues = row.selected ? importIssues(row, categories) : [];
              const conflicts = review && row.selected ? review.conflicts[row.id] || [] : [];
              const cents = amountInCents(row.amount);
              const member = members.find((item) => item.id === row.membershipId);
              return <div className="import-payment" key={row.id}>
                <label className="inline small"><input type="checkbox" checked={row.selected}
                  onChange={(event) => changeRow(row.id, { selected: event.target.checked })} /> Include this payment</label>
                <details>
                  <summary>
                    <span>File: <strong>{row.name || 'No name'}</strong> · amount {row.sourceAmount || 'blank'} · {row.origin}</span>
                    <span>Will save: <strong>{member?.name || 'Choose a member'}</strong> · {Number.isSafeInteger(cents) ? money(cents) : row.amount || 'No amount'} · {row.reportingMonth || 'Month not set'}</span>
                    <span className="small muted">{!row.selected ? `Not included${row.excludedReason ? ` — ${row.excludedReason}` : ''}` : issues.length ? `Needs attention: ${issues.join('; ')}` : conflicts.length ? 'Possible duplicate — open to review' : member && matchMember(row.name, [member]) !== member.id ? 'Name differs from file — check this match' : 'Ready to review'}</span>
                    <span className="small">View or edit</span>
                  </summary>
                  <div className="stack import-payment-details">
                    <p className="small muted">From {row.origin} in {fileName}</p>
                    {row.excludedReason && <p className="small">{row.excludedReason}. If included, it will be recorded as an active payment.</p>}
                    {issues.length > 0 && <p className="error">{issues.join('. ')}.</p>}
                    <div className="form-row">
                      <label>Member
                        <select value={row.membershipId} onChange={(event) => changeRow(row.id, { membershipId: event.target.value })}>
                          <option value="">Choose a member</option>
                          {members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>
                      <label>Amount<input type="text" inputMode="decimal" value={row.amount} onChange={(event) => changeRow(row.id, { amount: event.target.value })} /></label>
                      <label>Payment date<input type="date" value={row.date} onChange={(event) => changeRow(row.id, {
                        date: event.target.value, reportingMonth: row.reportingMonth || event.target.value.slice(0, 7),
                      })} /></label>
                      <label>Month for reports<input type="month" value={row.reportingMonth} onChange={(event) => changeRow(row.id, { reportingMonth: event.target.value })} /></label>
                      <label>Category<select value={row.category} onChange={(event) => changeRow(row.id, { category: event.target.value })}>
                        <option value="">Choose a category</option>
                        {categories.map((category) => <option key={category}>{category}</option>)}
                      </select></label>
                      <label>Note<input type="text" maxLength="200" value={row.memo} onChange={(event) => changeRow(row.id, { memo: event.target.value })} /></label>
                    </div>
                    {review?.alreadySaved.includes(row.id) && <p className="small">This payment was already saved and will not be added again.</p>}
                    {conflicts.length > 0 && <div className="import-help">
                      <p>These payments have the same member, category and report month. They may be separate payments:</p>
                      <ul>{conflicts.map((id) => <li key={id}>
                        {review.details[id]?.source === 'import' && rows.some((item) => item.id === id) ? 'Another payment in this preview' : 'Payment already in the ledger'}: {money(review.details[id]?.amountCents)}, {review.details[id]?.date}
                      </li>)}</ul>
                    </div>}
                  </div>
                </details>
              </div>;
            })}
          </div>
          {review && <label className="inline">
            <input type="checkbox" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />
            I checked the names and amounts against the file{duplicateCount > 0 ? ` and want to include the ${duplicateCount} payments with possible matches` : ''}.
          </label>}
          <div className="actions">
            <button type="button" className="secondary" onClick={backToSettings}>Back to file settings</button>
            <button type="button" onClick={check}>Check for duplicates</button>
            {review && <button type="button" onClick={commit}>Import selected payments</button>}
          </div>
        </div>}
      </fieldset>
    </section>
  );
}
