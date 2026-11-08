import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeLimiter } from './codeLimiter.js';

const limits = [
  { windowMs: 60_000, max: 1, message: 'cooldown' },
  { windowMs: 600_000, max: 3, message: 'ten minutes' },
  { windowMs: 86_400_000, max: 5, message: 'daily' },
];

test('enforces the 60 second cooldown', () => {
  const l = createCodeLimiter(limits);
  assert.equal(l.attempt('a', 0).ok, true);
  const r = l.attempt('a', 30_000);
  assert.equal(r.ok, false);
  assert.equal(r.message, 'cooldown');
  assert.equal(r.retryAfterSec, 30);
  assert.equal(l.attempt('a', 61_000).ok, true);
});

test('allows 3 per 10 minutes', () => {
  const l = createCodeLimiter(limits);
  assert.equal(l.attempt('a', 0).ok, true);
  assert.equal(l.attempt('a', 61_000).ok, true);
  assert.equal(l.attempt('a', 122_000).ok, true);
  const r = l.attempt('a', 183_000);
  assert.equal(r.ok, false);
  assert.equal(r.message, 'ten minutes');
  assert.equal(l.attempt('a', 601_000).ok, true);
});

test('enforces the daily cap', () => {
  const l = createCodeLimiter(limits);
  let t = 0;
  for (let i = 0; i < 5; i++) { assert.equal(l.attempt('a', t).ok, true); t += 700_000; }
  const r = l.attempt('a', t);
  assert.equal(r.ok, false);
  assert.equal(r.message, 'daily');
});

test('keys are independent and blocked attempts are not recorded', () => {
  const l = createCodeLimiter(limits);
  assert.equal(l.attempt('a', 0).ok, true);
  assert.equal(l.attempt('b', 1).ok, true);
  for (let i = 0; i < 10; i++) l.attempt('a', 10_000 + i);
  assert.equal(l.attempt('a', 61_000).ok, true);
});
