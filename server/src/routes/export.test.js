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

  async function download(category) {
    const response = await fetch(`${url}?category=${category}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
    return workbook;
  }

  const first = await download('Dues');
  assert.equal(first.getWorksheet('Monthly report').rowCount, 3);
  assert.equal(first.getWorksheet('Monthly report').getCell('E3').value, 0.06);

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
  assert.equal((await fetch(`${url}?category=Unknown`)).status, 400);
});
