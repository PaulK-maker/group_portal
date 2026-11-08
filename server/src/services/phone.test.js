import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isCountryAllowed } from '../utils/phone.js';

test('US numbers in common formats', () => {
  assert.equal(normalizePhone('(555) 123-4567', '1'), '+15551234567');
  assert.equal(normalizePhone('555.123.4567', '1'), '+15551234567');
  assert.equal(normalizePhone('1-555-123-4567', '1'), '+15551234567');
  assert.equal(normalizePhone('+1 555 123 4567', '1'), '+15551234567');
});

test('international numbers', () => {
  assert.equal(normalizePhone('+254 712 345 678', '1'), '+254712345678');
  assert.equal(normalizePhone('0712345678', '254'), '+254712345678');
  assert.equal(normalizePhone('00254712345678', '1'), '+254712345678');
});

test('rejects junk', () => {
  assert.equal(normalizePhone('', '1'), null);
  assert.equal(normalizePhone('abc', '1'), null);
  assert.equal(normalizePhone('12345', '1'), null);
});

test('country allowlist', () => {
  assert.equal(isCountryAllowed('+15551234567', ''), true);
  assert.equal(isCountryAllowed('+15551234567', '1,254'), true);
  assert.equal(isCountryAllowed('+254712345678', ' 1 , +254 '), true);
  assert.equal(isCountryAllowed('+447911123456', '1,254'), false);
});
