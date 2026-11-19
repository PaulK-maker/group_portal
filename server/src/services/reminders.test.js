import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate } from './reminders.js';

test('fills known placeholders and leaves other braces alone', () => {
  const text = fillTemplate('Hi {name}, you owe {balance} of {pledge}. {oops}', {
    name: 'Ann', balance: '$10.00', pledge: '$50.00',
  });
  assert.equal(text, 'Hi Ann, you owe $10.00 of $50.00. {oops}');
});
