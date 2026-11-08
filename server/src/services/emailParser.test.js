import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentEmail, guessCategory } from './emailParser.js';
import { matchPayer } from './matcher.js';

test('Cash App: name, amount and memo from subject', () => {
  const p = parsePaymentEmail({
    from: 'Cash App <cash@square.com>',
    subject: 'John Mwangi sent you $50 for November dues',
    text: 'Transaction ID #D-8KX2PQ41',
  });
  assert.equal(p.method, 'cashapp');
  assert.equal(p.amountCents, 5000);
  assert.equal(p.payerName, 'John Mwangi');
  assert.equal(p.memo, 'November dues');
  assert.equal(p.reference, 'D-8KX2PQ41');
});

test('Zelle via bank alert: name from body, memo line, confirmation number', () => {
  const p = parsePaymentEmail({
    from: 'alerts@mybank.com',
    subject: 'You received money with Zelle®',
    text: "Joseph Kamau sent you $25.00.\nMemo: Men's group event\nConfirmation number: ABC123XYZ",
  });
  assert.equal(p.method, 'zelle');
  assert.equal(p.amountCents, 2500);
  assert.equal(p.payerName, 'Joseph Kamau');
  assert.equal(p.memo, "Men's group event");
  assert.equal(p.reference, 'ABC123XYZ');
});

test('Zelle "received from" wording', () => {
  const p = parsePaymentEmail({
    subject: 'Zelle payment received',
    text: 'You received $1,100.00 from Peter Otieno on 11/01/2026.',
  });
  assert.equal(p.amountCents, 110000);
  assert.equal(p.payerName, 'Peter Otieno');
});

test('ignores outgoing payments and non-payment emails', () => {
  assert.equal(parsePaymentEmail({ from: 'cash@square.com', subject: 'You sent $20 to Mary' }), null);
  assert.equal(parsePaymentEmail({ from: 'cash@square.com', subject: 'Your monthly statement is ready' }), null);
  assert.equal(parsePaymentEmail({ subject: 'Church picnic $10', text: 'no payment app here' }), null);
});

test('category guessed from memo', () => {
  assert.equal(guessCategory('Event fee for retreat', ['Dues', 'Event']), 'Event');
  assert.equal(guessCategory('thanks', ['Dues', 'Event']), 'Dues');
});

test('matcher: exact, alias, initial+last, and ambiguous', () => {
  const ms = [
    { _id: 1, user: { name: 'John Mwangi' }, paymentIdentities: [] },
    { _id: 2, user: { name: 'Joseph Kamau' }, paymentIdentities: [{ type: 'zelle', value: 'gracekamau' }] },
    { _id: 3, user: { name: 'James Kamau' }, paymentIdentities: [] },
  ];
  assert.equal(matchPayer(ms, 'John Mwangi')._id, 1);
  assert.equal(matchPayer(ms, 'J Mwangi')._id, 1);
  assert.equal(matchPayer(ms, 'Grace Kamau')._id, 2); // spouse paying, saved alias
  assert.equal(matchPayer(ms, 'J Kamau'), null); // two J. Kamaus: treasurer decides
  assert.equal(matchPayer(ms, 'Stranger Danger'), null);
});
