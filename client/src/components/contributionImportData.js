export function amountInCents(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ''] = text.replace(/[$,]/g, '').split('.');
  if (whole.length > 16) return NaN;
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : NaN;
}

export function columnLetter(index) {
  let number = index + 1;
  let result = '';
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

export function assignMonthlyColumns(columns, headers, first, nameColumn, category) {
  if (!Number.isInteger(first) || first < 0 || first + 12 > columns.length) {
    throw new Error('Choose a starting column with 12 consecutive month columns after it.');
  }
  if (nameColumn >= first && nameColumn < first + 12) throw new Error('The member name column cannot be one of the month columns.');
  for (let i = first; i < first + 12; i += 1) {
    if (/^(grand\s+)?(total|subtotal|balance|remaining)\b/i.test(String(headers[i] ?? '').trim())) {
      throw new Error(`Column ${columnLetter(i)} looks like a total, not a month. Check the starting column.`);
    }
    if (columns[i].kind === 'other') throw new Error(`Column ${columnLetter(i)} is already selected for other payments. Change that choice first.`);
  }
  return columns.map((column, i) => {
    if (i >= first && i < first + 12) return { ...column, kind: String(i - first + 1).padStart(2, '0'), category };
    return /^\d{2}$/.test(column.kind) ? { ...column, kind: '' } : column;
  });
}

export function assignSpecialColumn(columns, headers, index, nameColumn, category, note) {
  if (!Number.isInteger(index) || index < 0 || index >= columns.length) throw new Error('Choose the column with the extra payments.');
  if (index === nameColumn) throw new Error('The member name column cannot also be a payment column.');
  if (columns[index].kind && columns[index].kind !== 'other') throw new Error('That column is already used for a month. Choose a different column.');
  if (/^(grand\s+)?(total|subtotal|balance|remaining)\b/i.test(String(headers[index] ?? '').trim())) {
    throw new Error(`Column ${columnLetter(index)} looks like a total. Do not import totals as payments.`);
  }
  if (!note.trim() || note.length > 200) throw new Error('Enter a short name for the extra payments.');
  return columns.map((column, i) => i === index ? { ...column, kind: 'other', category, note: note.trim() } : column);
}

export function matchMember(name, members) {
  const normalized = String(name ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const matches = members.filter((member) =>
    String(member.name || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === normalized
  );
  return matches.length === 1 ? matches[0].id : '';
}

export function dateFromCell(value, format = '') {
  const text = String(value ?? '').trim();
  let iso = text;
  const parts = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts && (format === 'month-day-year' || format === 'day-month-year')) {
    const month = format === 'month-day-year' ? parts[1] : parts[2];
    const day = format === 'month-day-year' ? parts[2] : parts[1];
    iso = `${parts[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const date = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

export function makeImportRows({ sheet, headerRow, layout, nameColumn, amountColumn, dateColumn, dateFormat = '', categoryColumn, memoColumn = '', voidedColumn = '', columns, year, defaultDate, defaultCategory, categories, members, makeId }) {
  const results = [];
  const append = (rowIndex, columnIndex, rawAmount, category, date, reportingMonth, memo, originalDate = '', originalCategory = '', excludedReason = '') => {
    const cents = amountInCents(rawAmount);
    if (cents === null || cents === 0) return;
    const name = String(sheet.rows[rowIndex][nameColumn] ?? '').trim();
    results.push({
      id: makeId(),
      origin: `Row ${rowIndex + 1}, column ${columnLetter(columnIndex)}`,
      name,
      membershipId: matchMember(name, members),
      amount: String(rawAmount),
      sourceAmount: String(rawAmount),
      date,
      reportingMonth,
      category,
      memo,
      originalDate,
      originalCategory,
      excludedReason,
      selected: !excludedReason,
    });
  };
  for (let r = headerRow; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    if (layout === 'matrix') {
      columns.forEach((column, i) => {
        if (!column.kind) return;
        const month = column.kind === 'other' ? defaultDate.slice(0, 7) : `${year}-${column.kind}`;
        const memo = column.kind === 'other' ? (column.note || String(sheet.rows[headerRow - 1][i] ?? '').trim()) : '';
        append(r, i, row[i], column.category, defaultDate, month, memo);
      });
    } else {
      const sourceDate = dateColumn === '' || row[dateColumn] === '' || row[dateColumn] == null
        ? defaultDate : dateFromCell(row[dateColumn], dateFormat);
      const rawCategory = categoryColumn === '' ? '' : String(row[categoryColumn] ?? '').trim();
      const category = rawCategory ? (categories.find((c) => c.toLocaleLowerCase() === rawCategory.toLocaleLowerCase()) || '') : defaultCategory;
      const memo = memoColumn === '' ? '' : String(row[memoColumn] ?? '').trim();
      const voided = voidedColumn === '' ? '' : String(row[voidedColumn] ?? '').trim();
      const excludedReason = /^(true|yes|1|void|voided)(:.*)?$/i.test(voided) ? 'Marked voided in the file' : '';
      append(r, amountColumn, row[amountColumn], category, sourceDate, sourceDate.slice(0, 7), memo,
        sourceDate ? '' : String(row[dateColumn] ?? ''), category ? '' : rawCategory, excludedReason);
    }
  }
  return results;
}

export function importIssues(row, categories) {
  const issues = [];
  const cents = amountInCents(row.amount);
  if (!row.membershipId) issues.push('Choose a member');
  if (!Number.isSafeInteger(cents) || cents < 1) issues.push('Enter an amount greater than zero');
  if (!dateFromCell(row.date)) issues.push(row.originalDate ? `Check the date "${row.originalDate}"` : 'Choose a payment date');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.reportingMonth)) issues.push('Choose a month for the report');
  if (!categories.includes(row.category)) issues.push(row.originalCategory ? `Choose a category for "${row.originalCategory}"` : 'Choose a category');
  if (row.memo.length > 200) issues.push('Shorten the note to 200 characters or fewer');
  return issues;
}

function nameGroupKey(row) {
  const name = row.name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return name ? `name:${name}` : `blank:${row.id}`;
}

export function unmatchedNameGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.selected || row.membershipId) continue;
    const key = nameGroupKey(row);
    if (!groups.has(key)) groups.set(key, { key, name: row.name, count: 0 });
    groups.get(key).count += 1;
  }
  return [...groups.values()];
}

export function assignMemberToGroup(rows, key, membershipId) {
  return rows.map((row) => row.selected && !row.membershipId && nameGroupKey(row) === key
    ? { ...row, membershipId } : row);
}

export function fillMissingDates(rows, date) {
  if (!dateFromCell(date)) throw new Error('Choose a valid date first.');
  return rows.map((row) => row.selected && !dateFromCell(row.date)
    ? { ...row, date, reportingMonth: row.reportingMonth || date.slice(0, 7) } : row);
}
