import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedMonthlyAmounts } from './monthlyPaymentData.js';

test('default amount follows changes while individual amounts remain independent across years', () => {
  const selected = { '2027-01': null, '2026-12': '25', '2027-02': null };
  assert.deepEqual(selectedMonthlyAmounts(selected, '20'), [
    ['2026-12', '25'], ['2027-01', '20'], ['2027-02', '20'],
  ]);
  assert.deepEqual(selectedMonthlyAmounts(selected, '30'), [
    ['2026-12', '25'], ['2027-01', '30'], ['2027-02', '30'],
  ]);
  assert.equal(selectedMonthlyAmounts({ '2027-01': '' }, '20')[0][1], '');
});
