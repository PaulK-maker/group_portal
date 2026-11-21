export function amountInCents(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ''] = text.replace(/[$,]/g, '').split('.');
  if (whole.length > 16) return NaN;
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : NaN;
}

export function matchMember(name, members) {
  const normalized = String(name ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const matches = members.filter((member) =>
    String(member.name || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === normalized
  );
  return matches.length === 1 ? matches[0].id : '';
}

export function dateFromCell(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

export function makeImportRows({ sheet, headerRow, layout, nameColumn, amountColumn, dateColumn, categoryColumn, memoColumn = '', columns, year, defaultDate, defaultCategory, categories, members, makeId }) {
  const results = [];
  const append = (rowIndex, columnIndex, rawAmount, category, date, reportingMonth, memo) => {
    const cents = amountInCents(rawAmount);
    if (cents === null || cents === 0) return;
    const name = String(sheet.rows[rowIndex][nameColumn] ?? '').trim();
    results.push({
      id: makeId(),
      origin: `Row ${rowIndex + 1}, column ${columnIndex + 1}`,
      name,
      membershipId: matchMember(name, members),
      amount: String(rawAmount),
      date,
      reportingMonth,
      category,
      memo,
      selected: true,
    });
  };
  for (let r = headerRow; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    if (layout === 'matrix') {
      columns.forEach((column, i) => {
        if (!column.kind) return;
        const month = column.kind === 'other' ? defaultDate.slice(0, 7) : `${year}-${column.kind}`;
        const memo = column.kind === 'other' ? String(sheet.rows[headerRow - 1][i] ?? '').trim() : '';
        append(r, i, row[i], column.category, defaultDate, month, memo);
      });
    } else {
      const sourceDate = dateColumn === '' || row[dateColumn] === '' || row[dateColumn] == null
        ? defaultDate : dateFromCell(row[dateColumn]);
      const rawCategory = categoryColumn === '' ? '' : String(row[categoryColumn] ?? '').trim();
      const category = rawCategory ? (categories.find((c) => c.toLocaleLowerCase() === rawCategory.toLocaleLowerCase()) || '') : defaultCategory;
      const memo = memoColumn === '' ? '' : String(row[memoColumn] ?? '').trim();
      append(r, amountColumn, row[amountColumn], category, sourceDate, sourceDate.slice(0, 7), memo);
    }
  }
  return results;
}
