import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInCents, assignMemberToGroup, assignMonthlyColumns, assignSpecialColumn, columnLetter, dateFromCell, fillMissingDates, importIssues, makeImportRows, matchMember, unmatchedNameGroups } from './contributionImportData.js';

test('builds monthly and special payments without importing totals', () => {
  const members = [{ id: 'one', name: 'Sam Lee' }, { id: 'two', name: 'Pat' }, { id: 'three', name: 'Pat' }];
  const sheet = { rows: [
    ['Member', 'JAN', 'FEB', 'SPECIAL', 'TOTAL'],
    ['Sam Lee', 50, '', 150, 200],
    ['Pat', 0, 10, '', 10],
    ['Unknown', 'bad', '', '', 'bad'],
  ] };
  let id = 0;
  const rows = makeImportRows({
    sheet, headerRow: 1, layout: 'matrix', nameColumn: 0, amountColumn: 0, dateColumn: '',
    categoryColumn: '', columns: [{ kind: '' }, { kind: '01', category: 'Dues' }, { kind: '02', category: 'Dues' },
      { kind: 'other', category: 'Other' }, { kind: '' }],
    year: '2024', defaultDate: '2026-11-20', defaultCategory: 'Dues',
    categories: ['Dues', 'Other'], members, makeId: () => String(++id),
  });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.slice(0, 3).map((row) => [row.membershipId, row.amount, row.reportingMonth, row.category]), [
    ['one', '50', '2024-01', 'Dues'],
    ['one', '150', '2026-11', 'Other'],
    ['', '10', '2024-02', 'Dues'],
  ]);
  assert.equal(rows[3].amount, 'bad');
  assert.equal(rows[1].memo, 'SPECIAL');
  assert.equal(rows[3].membershipId, '');
  assert.equal(rows[0].date, '2026-11-20');
});

test('maps an unlabeled monthly sheet without importing totals or changing 50 dollars', () => {
  const headers = ['', '', '', '2026 monthly contributions', '', '', '', '', '', '', '', '', '', '', '', '', ''];
  const data = ['', '', 'Example Member', ...Array(12).fill(50), 150, 750];
  const sheet = { rows: [headers, data] };
  const empty = headers.map(() => ({ kind: '', category: 'Dues' }));
  const months = assignMonthlyColumns(empty, headers, 3, 2, 'Dues');
  const columns = assignSpecialColumn(months, headers, 15, 2, 'Other', 'Special');
  let id = 0;
  const rows = makeImportRows({
    sheet, headerRow: 1, layout: 'matrix', nameColumn: 2, columns, year: '2026',
    defaultDate: '2026-11-20', defaultCategory: 'Dues', categories: ['Dues', 'Other'],
    members: [{ id: 'member-id', name: 'Example Member' }], makeId: () => String(++id),
  });
  assert.deepEqual(rows.map((row) => [row.name, row.membershipId, amountInCents(row.amount), row.reportingMonth, row.memo]), [
    ...Array.from({ length: 12 }, (_, i) => ['Example Member', 'member-id', 5000, `2026-${String(i + 1).padStart(2, '0')}`, '']),
    ['Example Member', 'member-id', 15000, '2026-11', 'Special'],
  ]);
  assert.equal(columns[16].kind, '');
  assert.equal(columnLetter(2), 'C');
  assert.equal(columnLetter(26), 'AA');
  assert.throws(() => assignMonthlyColumns(empty, headers, 6, 2, 'Dues'));
  assert.throws(() => assignMonthlyColumns(empty, headers, 2, 2, 'Dues'));
  assert.throws(() => assignSpecialColumn(months, headers, 3, 2, 'Other', 'Special'));
});

test('maps per-payment dates and categories and leaves unknown values for review', () => {
  const rows = makeImportRows({
    sheet: { rows: [
      ['Name', 'Amount', 'Date', 'Category'],
      ['Sam', '$1,234.56', '2025-03-04', 'Event'],
      ['Sam', 12, '03/04/2025', 'Unrecognized'],
      ['Sam', 5, '', ''],
    ] },
    headerRow: 1, layout: 'payments', nameColumn: 0, amountColumn: 1, dateColumn: 2, categoryColumn: 3,
    columns: [], year: '', defaultDate: '2026-11-20', defaultCategory: 'Dues',
    categories: ['Dues', 'Event'], members: [{ id: 'one', name: 'Sam' }], makeId: () => 'id',
  });
  assert.equal(amountInCents(rows[0].amount), 123456);
  assert.equal(rows[0].reportingMonth, '2025-03');
  assert.equal(rows[0].category, 'Event');
  assert.equal(rows[1].date, '');
  assert.equal(rows[1].originalDate, '03/04/2025');
  assert.equal(rows[1].originalCategory, 'Unrecognized');
  assert.equal(rows[1].category, '');
  assert.equal(rows[2].date, '2026-11-20');
  assert.equal(rows[2].category, 'Dues');
  assert.ok(Number.isNaN(amountInCents('1.234')));
  assert.ok(Number.isNaN(amountInCents('-2')));
  assert.equal(matchMember('  SAM  ', [{ id: 'one', name: 'Sam' }]), 'one');
});

test('only interprets ambiguous written dates using the selected format', () => {
  assert.equal(dateFromCell('03/04/2025'), '');
  assert.equal(dateFromCell('03/04/2025', 'month-day-year'), '2025-03-04');
  assert.equal(dateFromCell('03/04/2025', 'day-month-year'), '2025-04-03');
  assert.equal(dateFromCell('02/30/2025', 'month-day-year'), '');
  const [row] = makeImportRows({
    sheet: { rows: [['Name', 'Amount', 'Date'], ['Sam', 5, '03/04/2025']] },
    headerRow: 1, layout: 'payments', nameColumn: 0, amountColumn: 1, dateColumn: 2,
    dateFormat: 'day-month-year', categoryColumn: '', columns: [], year: '',
    defaultDate: '2026-11-20', defaultCategory: 'Dues', categories: ['Dues'],
    members: [{ id: 'one', name: 'Sam' }], makeId: () => 'id',
  });
  assert.equal(row.date, '2025-04-03');
  assert.equal(row.reportingMonth, '2025-04');
});

test('leaves visibly voided ledger payments out but keeps active rows selected', () => {
  const rows = makeImportRows({
    sheet: { rows: [
      ['Name', 'Amount', 'Voided'],
      ['Sam', 5, 'VOID: corrected'],
      ['Sam', 10, 'false'],
      ['Sam', 15, true],
    ] },
    headerRow: 1, layout: 'payments', nameColumn: 0, amountColumn: 1, dateColumn: '',
    categoryColumn: '', voidedColumn: 2, columns: [], year: '', defaultDate: '2026-11-20',
    defaultCategory: 'Dues', categories: ['Dues'], members: [{ id: 'one', name: 'Sam' }], makeId: () => 'id',
  });
  assert.deepEqual(rows.map((row) => row.selected), [false, true, false]);
  assert.equal(rows[0].excludedReason, 'Marked voided in the file');
  assert.equal(rows[1].excludedReason, '');
});

test('matches repeated names together without combining blank names or replacing existing matches', () => {
  const rows = [
    { id: '1', name: 'Sam Lee', selected: true, membershipId: '' },
    { id: '2', name: ' sam  lee ', selected: true, membershipId: '' },
    { id: '3', name: 'Sam Lee', selected: true, membershipId: 'existing' },
    { id: '4', name: 'Sam Lee', selected: false, membershipId: '' },
    { id: '5', name: '', selected: true, membershipId: '' },
    { id: '6', name: '', selected: true, membershipId: '' },
  ];
  const groups = unmatchedNameGroups(rows);
  assert.deepEqual(groups.map((group) => group.count), [2, 1, 1]);
  const matched = assignMemberToGroup(rows, groups[0].key, 'member');
  assert.deepEqual(matched.map((row) => row.membershipId), ['member', 'member', 'existing', '', '', '']);
  const blankMatched = assignMemberToGroup(matched, groups[1].key, 'another');
  assert.equal(blankMatched[4].membershipId, 'another');
  assert.equal(blankMatched[5].membershipId, '');
});

test('fills only missing selected dates and preserves previously chosen reporting months', () => {
  const rows = [
    { selected: true, date: '', reportingMonth: '2024-01' },
    { selected: true, date: '', reportingMonth: '' },
    { selected: true, date: '2025-03-04', reportingMonth: '2025-03' },
    { selected: false, date: '', reportingMonth: '' },
  ];
  const filled = fillMissingDates(rows, '2026-11-20');
  assert.deepEqual(filled.map((row) => [row.date, row.reportingMonth]), [
    ['2026-11-20', '2024-01'], ['2026-11-20', '2026-11'],
    ['2025-03-04', '2025-03'], ['', ''],
  ]);
  assert.throws(() => fillMissingDates(rows, '2026-02-30'));
  assert.deepEqual(importIssues({
    amount: '5', membershipId: '', date: '', originalDate: '03/04/2025', reportingMonth: '',
    category: '', originalCategory: 'Special', memo: '',
  }, ['Dues']), ['Choose a member', 'Check the date "03/04/2025"', 'Choose a month for the report', 'Choose a category for "Special"']);
});
