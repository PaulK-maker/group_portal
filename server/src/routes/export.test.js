import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Membership from '../models/Membership.js';
import Contribution from '../models/Contribution.js';
import exportRoutes from './export.js';

test('exports fresh monthly category details alongside the complete ledger', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const membershipId = new mongoose.Types.ObjectId();
  const member = { _id: membershipId, user: { name: 'Member' }, pledgeCents: 0, status: 'active' };
  const payment = (amountCents, category, method, memo, voided = false) => ({
    _id: new mongoose.Types.ObjectId(), membership: member, amountCents, category, method, memo, voided,
    date: new Date('2026-11-13T00:00:00Z'), source: 'manual',
  });
  const payments = [
    payment(6, 'Dues', 'zelle', ''),
    payment(50, 'Event', 'cash', 'Event payment'),
    payment(9, 'Dues', 'cash', 'Voided payment', true),
  ];

  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  t.mock.method(Group, 'findById', async () => ({
    _id: groupId, name: 'Test Group', settings: { categories: ['Dues', 'Event'] },
  }));
  t.mock.method(Membership, 'findOne', async () => ({ role: 'admin' }));
  t.mock.method(Membership, 'find', () => ({ populate: async () => [member] }));
  t.mock.method(Contribution, 'find', () => ({ sort: () => ({ populate: async () => [...payments] }) }));
  t.mock.method(Contribution, 'aggregate', async () => [{
    _id: membershipId, totalCents: payments.filter((p) => !p.voided).reduce((sum, p) => sum + p.amountCents, 0),
  }]);

  const app = express();
  app.use((req, res, next) => {
    req.auth = () => ({ tokenType: 'session_token', userId: 'user_clerk' });
    next();
  });
  app.use('/groups/:groupId/export', exportRoutes);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/groups/${groupId}/export`;

  async function download(category, year = '2026') {
    const response = await fetch(`${url}?category=${category}&year=${year}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
    return workbook;
  }

  const first = await download('Dues');
  assert.equal(first.getWorksheet('Monthly report').rowCount, 3);
  assert.equal(first.getWorksheet('Monthly report').getCell('E3').value, 0.06);
  const overview = first.getWorksheet('Yearly overview');
  assert.match(overview.getCell('A1').value, /SELECTED CATEGORY: Dues.*2026/);
  assert.deepEqual(overview.getRow(2).values.slice(2, 14), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  assert.equal(overview.getCell('L3').value, 0.06);
  assert.equal(overview.getCell('N3').value, 0.06);
  const eventHeading = overview.getColumn(1).values.findIndex((value) => typeof value === 'string' && value.includes('OTHER CATEGORY: Event'));
  assert.ok(eventHeading > 0);
  assert.equal(overview.getRow(eventHeading + 2).getCell(12).value, 0.5);
  const summary = first.getWorksheet('Summary');
  const categoryTitle = summary.getColumn(1).values.findIndex((value) => typeof value === 'string' && value.startsWith('Category totals for 2026'));
  assert.equal(summary.getRow(categoryTitle + 2).getCell(1).value, 'Dues');
  assert.equal(summary.getRow(categoryTitle + 2).getCell(2).value, 'Selected');
  assert.equal(summary.getRow(categoryTitle + 2).getCell(3).value, 0.06);
  assert.equal(summary.getRow(categoryTitle + 3).getCell(3).value, 0.5);

  payments.push(payment(12, 'Dues', 'cashapp', 'Monthly dues'));
  const updated = await download('Dues');
  const report = updated.getWorksheet('Monthly report');
  assert.equal(report.rowCount, 4);
  assert.equal(report.getCell('A3').value, '2026-11');
  assert.equal(report.getCell('E3').value, 0.12);
  assert.equal(report.getCell('F3').value, 'Cash App');
  assert.equal(report.getCell('H3').value, 'Monthly dues');
  assert.equal(report.getCell('E4').value, 0.18);
  assert.equal(updated.getWorksheet('Ledger').rowCount, 5);
  assert.equal(updated.getWorksheet('Summary').getCell('D2').value, 0.68);

  const events = await download('Event');
  assert.equal(events.getWorksheet('Monthly report').getCell('H2').value, 'Event payment');
  assert.equal(events.getWorksheet('Monthly report').getCell('E3').value, 0.5);
  payments.push(payment(2000, 'One-time special contribution', 'cash', 'Special'));
  const special = await download(encodeURIComponent('One-time special contribution'));
  assert.equal(special.getWorksheet('Monthly report').getCell('E3').value, 20);
  assert.equal((await fetch(`${url}?category=Unknown`)).status, 400);
  assert.equal((await fetch(`${url}?category=Dues&year=20`)).status, 400);

  payments.push({ ...payment(2500, 'Dues', 'other', 'Imported'), reportingMonth: '2025-01', source: 'import' });
  const historical = (await download('Dues')).getWorksheet('Monthly report');
  const imported = historical.getRows(2, historical.rowCount - 1).find((row) => row.getCell(8).value === 'Imported');
  assert.equal(imported.getCell(1).value, '2025-01');
  assert.equal(imported.getCell(3).value.toISOString().slice(0, 10), '2026-11-13');
  const historicalOverview = (await download('Dues', '2025')).getWorksheet('Yearly overview');
  assert.equal(historicalOverview.getCell('B3').value, 25);
  assert.equal(historicalOverview.getCell('L3').value, 0);
  const ledger = (await download('Dues')).getWorksheet('Ledger');
  const importedLedgerRow = ledger.getRows(2, ledger.rowCount - 1).find((row) => row.getCell(7).value === 'Imported');
  assert.equal(ledger.getCell('J1').value, 'Reporting month');
  assert.equal(importedLedgerRow.getCell(10).value, '2025-01');

  payments.push({ ...payment(2000, 'Dues', 'cash', 'Advance'), reportingMonth: '2027-01' });
  const future = (await download('Dues')).getWorksheet('Monthly report');
  const advance = future.getRows(2, future.rowCount - 1).find((row) => row.getCell(8).value === 'Advance');
  assert.equal(advance.getCell(1).value, '2027-01');
  assert.equal(advance.getCell(3).value.toISOString().slice(0, 10), '2026-11-13');
  assert.equal(advance.getCell(5).value, 20);
  const futureOverview = (await download('Dues', '2027')).getWorksheet('Yearly overview');
  assert.equal(futureOverview.getCell('B3').value, 20);
});
