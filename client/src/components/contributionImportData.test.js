import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInCents, makeImportRows, matchMember } from './contributionImportData.js';

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
  assert.equal(rows[1].category, '');
  assert.equal(rows[2].date, '2026-11-20');
  assert.equal(rows[2].category, 'Dues');
  assert.ok(Number.isNaN(amountInCents('1.234')));
  assert.ok(Number.isNaN(amountInCents('-2')));
  assert.equal(matchMember('  SAM  ', [{ id: 'one', name: 'Sam' }]), 'one');
});
