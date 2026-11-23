import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Membership from '../models/Membership.js';
import Contribution from '../models/Contribution.js';
import importRoutes from './imports.js';
import contributionRoutes from './contributions.js';

async function serve(t, path, routes) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    req.auth = () => ({ tokenType: 'session_token', userId: 'user_clerk' });
    next();
  });
  app.use(path, routes);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('workbook upload, duplicate confirmation, tenant guard and safe retry after partial failure', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const memberId = new mongoose.Types.ObjectId();
  let role = 'treasurer';
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  t.mock.method(Group, 'findById', async () => ({ _id: groupId, settings: { categories: ['Dues', 'Other'] } }));
  t.mock.method(Membership, 'findOne', async () => ({ role }));
  t.mock.method(Membership, 'find', (query) => ({ select: () => ({ lean: async () =>
    query._id.$in.filter((id) => String(id) === String(memberId)).map((_id) => ({ _id })),
  }) }));
  const existing = {
    _id: new mongoose.Types.ObjectId(), group: groupId, membership: memberId, amountCents: 5000,
    category: 'Dues', date: new Date('2025-01-03T00:00:00.000Z'), source: 'manual', method: 'cash', voided: false,
  };
  const payments = [existing];
  t.mock.method(Contribution, 'find', (query) => ({ lean: async () => payments.filter((payment) => {
    if (query._id) return query._id.$in.some((id) => String(id) === String(payment._id));
    if (String(query.group) !== String(payment.group) || payment.voided) return false;
    const ids = query.membership.$in || [query.membership];
    return ids.some((id) => String(id) === String(payment.membership)) && (!query.category || query.category === payment.category);
  }) }));
  let calls = 0;
  let injectAfterCreate = false;
  let manualFailure = false;
  t.mock.method(Contribution, 'create', async (data) => {
    calls += 1;
    if (calls === 2) throw new Error('simulated interrupted write');
    if (manualFailure && data.source === 'manual' && data.reportingMonth === '2027-02') {
      manualFailure = false;
      throw new Error('simulated interrupted monthly write');
    }
    payments.push({ ...data, voided: false });
    if (injectAfterCreate) {
      payments.push({ ...existing, _id: new mongoose.Types.ObjectId(), date: new Date('2024-02-10T00:00:00.000Z') });
      injectAfterCreate = false;
    }
    return data;
  });
  t.mock.method(console, 'error', () => {});

  const base = `${await serve(t, '/groups/:groupId/imports', importRoutes)}/groups/${groupId}/imports`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contributions');
  sheet.addRow(['Member', 'JAN', 'TOTAL']);
  sheet.addRow(['Alex', { formula: '20+30', result: 50 }, 50]);
  const encoded = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
  const uploaded = await post('/workbook', { data: encoded });
  assert.equal(uploaded.status, 200);
  assert.deepEqual((await uploaded.json()).sheets[0].rows[1], ['Alex', 50, 50]);

  const matrix = new ExcelJS.Workbook();
  const monthly = matrix.addWorksheet('Monthly');
  monthly.mergeCells('D1:L1');
  monthly.getCell('D1').value = '2026 monthly contributions';
  monthly.getCell('C2').value = 'Example Member';
  for (let column = 4; column <= 15; column += 1) monthly.getRow(2).getCell(column).value = 50;
  monthly.getCell('P2').value = 150;
  monthly.getCell('Q2').value = 750;
  const matrixResponse = await post('/workbook', { data: Buffer.from(await matrix.xlsx.writeBuffer()).toString('base64') });
  assert.equal(matrixResponse.status, 200);
  const matrixRow = (await matrixResponse.json()).sheets[0].rows[1];
  assert.deepEqual([matrixRow[2], matrixRow[3], matrixRow[14], matrixRow[15], matrixRow[16]], ['Example Member', 50, 50, 150, 750]);
  assert.deepEqual(matrixRow.slice(3, 15), Array(12).fill(50));

  const example = new ExcelJS.Workbook();
  const exampleSheet = example.addWorksheet('Sheet1');
  exampleSheet.getCell('C2').value = 77;
  exampleSheet.getCell('D2').value = 'FEB';
  exampleSheet.getCell('B3').value = 'Example Member';
  for (let column = 3; column <= 14; column += 1) exampleSheet.getRow(3).getCell(column).value = 50;
  exampleSheet.getCell('O3').value = 150;
  exampleSheet.getCell('P3').value = { formula: 'SUM(C3:O3)', result: 750 };
  const exampleResponse = await post('/workbook', { data: Buffer.from(await example.xlsx.writeBuffer()).toString('base64') });
  assert.equal(exampleResponse.status, 200);
  const exampleRow = (await exampleResponse.json()).sheets[0].rows[2];
  assert.deepEqual([exampleRow[1], ...exampleRow.slice(2, 14), exampleRow[14], exampleRow[15]],
    ['Example Member', ...Array(12).fill(50), 150, 750]);
  assert.equal((await post('/workbook', { data: Buffer.from('not xlsx').toString('base64') })).status, 400);
  role = 'member';
  assert.equal((await post('/workbook', { data: encoded })).status, 403);
  role = 'treasurer';

  const makeRow = (amountCents) => ({
    id: String(new mongoose.Types.ObjectId()), membershipId: String(memberId), amountCents,
    date: '2026-11-20', reportingMonth: '2025-01', category: 'Dues',
  });
  const rows = [makeRow(5000), makeRow(1500)];
  assert.equal((await post('/check', { rows: [{ ...rows[0], membershipId: String(new mongoose.Types.ObjectId()) }] })).status, 400);
  assert.equal((await post('/check', { rows: [{ ...rows[0], date: '2026-02-30' }] })).status, 400);
  const response = await post('/check', { rows });
  assert.equal(response.status, 200);
  const review = await response.json();
  assert.deepEqual(review.conflicts[rows[0].id], [String(existing._id), rows[1].id].sort());
  assert.deepEqual(review.conflicts[rows[1].id], [String(existing._id), rows[0].id].sort());
  assert.equal(review.details[String(existing._id)].amountCents, 5000);
  assert.equal((await post('/commit', { rows, acknowledged: review.conflicts, confirmedDuplicates: [] })).status, 409);

  const body = { rows, acknowledged: review.conflicts, confirmedDuplicates: rows.map((row) => row.id) };
  const interrupted = await post('/commit', body);
  assert.equal(interrupted.status, 500);
  assert.match((await interrupted.json()).error, /after confirming 1 new payments saved/);
  assert.equal(payments.length, 2);
  const retry = await post('/commit', body);
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), { saved: 1, alreadySaved: 1 });
  assert.equal(payments.length, 3);
  assert.equal((await post('/commit', body)).status, 201);
  assert.equal(payments.length, 3);

  payments.push({ ...existing, _id: new mongoose.Types.ObjectId() });
  assert.equal((await post('/commit', body)).status, 409);

  const laterRows = [{ ...makeRow(2000), reportingMonth: '2024-01' }, { ...makeRow(3000), reportingMonth: '2024-02' }];
  const laterReview = await (await post('/check', { rows: laterRows })).json();
  injectAfterCreate = true;
  const changed = await post('/commit', { rows: laterRows, acknowledged: laterReview.conflicts, confirmedDuplicates: [] });
  assert.equal(changed.status, 409);
  assert.match((await changed.json()).error, /after 1 new payments were saved/);
  const refreshed = await (await post('/check', { rows: laterRows })).json();
  assert.equal(refreshed.conflicts[laterRows[1].id].length, 1);

  const manualRows = ['2027-01', '2027-02', '2027-03'].map((month, i) => ({
    ...makeRow(i === 1 ? 2500 : 2000), reportingMonth: month, method: 'cash', reference: 'receipt 1',
  }));
  role = 'member';
  assert.equal((await post('/monthly/check', { rows: manualRows })).status, 403);
  role = 'treasurer';
  assert.equal((await post('/monthly/check', { rows: [{ ...manualRows[0], method: 'invalid' }] })).status, 400);
  assert.equal((await post('/monthly/check', { rows: [{ ...manualRows[0], membershipId: String(new mongoose.Types.ObjectId()) }] })).status, 400);
  const monthlyReview = await (await post('/monthly/check', { rows: manualRows })).json();
  const monthlyBody = { rows: manualRows, acknowledged: monthlyReview.conflicts, confirmedDuplicates: [] };
  manualFailure = true;
  assert.equal((await post('/monthly/commit', monthlyBody)).status, 500);
  const partial = payments.find((payment) => String(payment._id) === manualRows[0].id);
  assert.equal(partial.source, 'manual');
  assert.equal(partial.method, 'cash');
  assert.equal(partial.reference, 'receipt 1');
  assert.equal(partial.reportingMonth, '2027-01');
  assert.equal(partial.date.toISOString().slice(0, 10), '2026-11-20');
  assert.equal((await post('/monthly/check', { rows: [{ ...manualRows[0], reference: 'different' }] })).status, 409);
  const monthlyRetry = await post('/monthly/commit', monthlyBody);
  assert.equal(monthlyRetry.status, 201);
  assert.deepEqual(await monthlyRetry.json(), { saved: 2, alreadySaved: 1 });
  assert.deepEqual(manualRows.map((row) => payments.find((payment) => String(payment._id) === row.id).amountCents), [2000, 2500, 2000]);
  const extra = [{ ...makeRow(500), method: 'cash', reference: '', reportingMonth: '2027-01' }];
  const duplicateReview = await (await post('/monthly/check', { rows: extra })).json();
  assert.deepEqual(duplicateReview.conflicts[extra[0].id], [manualRows[0].id]);
  assert.equal((await post('/monthly/commit', { rows: extra, acknowledged: duplicateReview.conflicts, confirmedDuplicates: [] })).status, 409);
  assert.equal((await post('/monthly/commit', { rows: extra, acknowledged: duplicateReview.conflicts, confirmedDuplicates: [extra[0].id] })).status, 201);
});

test('only finance can edit imported dates, preserving the reporting month and an audit record', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const paymentId = new mongoose.Types.ObjectId();
  let role = 'treasurer';
  const payment = {
    _id: paymentId, group: groupId, source: 'import', voided: false,
    date: new Date('2026-11-20T00:00:00.000Z'), reportingMonth: '2025-01',
  };
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  t.mock.method(Group, 'findById', async () => ({ _id: groupId }));
  t.mock.method(Membership, 'findOne', async () => ({ role }));
  t.mock.method(Contribution, 'findOne', async () => payment);
  let update;
  t.mock.method(Contribution, 'findOneAndUpdate', async (filter, changes) => {
    update = { filter, changes };
    return { ...payment, date: changes.$set.date };
  });
  const base = `${await serve(t, '/groups/:groupId/contributions', contributionRoutes)}/groups/${groupId}/contributions/${paymentId}/date`;
  const patch = (date) => fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
  assert.equal((await patch('2025-02-30')).status, 400);
  role = 'member';
  assert.equal((await patch('2025-01-15')).status, 403);
  role = 'treasurer';
  const response = await patch('2025-01-15');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).contribution.reportingMonth, '2025-01');
  assert.equal(update.changes.$push.dateChanges.previousDate.toISOString().slice(0, 10), '2026-11-20');
  assert.equal(String(update.changes.$push.dateChanges.changedBy), String(userId));
  payment.source = 'manual';
  assert.equal((await patch('2025-01-16')).status, 400);
});
