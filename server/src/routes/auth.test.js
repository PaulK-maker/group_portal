import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { clerkClient } from '@clerk/express';
import User from '../models/User.js';
import Membership from '../models/Membership.js';
import authRoutes from './auth.js';

async function startApp(t) {
  const app = express();
  app.use((req, res, next) => {
    req.auth = () => ({ tokenType: 'session_token', userId: 'clerk_user', sessionClaims: {} });
    next();
  });
  app.use('/auth', authRoutes);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/auth/me`;
}

function mockClerk(t, status = 'verified') {
  return t.mock.method(Object.getPrototypeOf(clerkClient.users), 'getUser', async () => ({
    firstName: 'Alex',
    lastName: 'Example',
    primaryEmailAddressId: 'email_1',
    emailAddresses: [{ id: 'email_1', emailAddress: 'Alex@Example.com', verification: { status } }],
    primaryPhoneNumberId: null,
    phoneNumbers: [],
  }));
}

test('creates an account using the verified Clerk email, without empty phone fields', async (t) => {
  t.mock.method(User, 'findOne', async () => null);
  mockClerk(t);
  t.mock.method(User, 'find', async (query) => {
    assert.deepEqual(query, { $or: [{ email: 'alex@example.com' }] });
    return [];
  });
  t.mock.method(User, 'create', async (data) => {
    assert.deepEqual(data, { clerkId: 'clerk_user', email: 'alex@example.com', name: 'Alex Example' });
    return { _id: 'local_user', ...data };
  });
  t.mock.method(Membership, 'find', () => ({ populate: async () => [] }));
  const response = await fetch(await startApp(t));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.email, 'alex@example.com');
});

test('links a pre-added member by verified email and preserves memberships', async (t) => {
  t.mock.method(User, 'findOne', async () => null);
  mockClerk(t);
  t.mock.method(User, 'find', async () => [{ _id: 'existing_user' }]);
  t.mock.method(User, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter._id, 'existing_user');
    assert.deepEqual(update, { $set: { clerkId: 'clerk_user' } });
    return { _id: 'existing_user', name: 'Existing member', email: 'alex@example.com' };
  });
  t.mock.method(Membership, 'find', (query) => {
    assert.equal(query.user, 'existing_user');
    return { populate: async () => [{ _id: 'membership', role: 'member', group: {
      toObject: () => ({ name: 'Group', settings: { categories: ['Dues', 'Event'] } }),
    } }] };
  });
  const response = await fetch(await startApp(t));
  assert.equal(response.status, 200);
  const { memberships } = await response.json();
  assert.equal(memberships.length, 1);
  assert.deepEqual(memberships[0].group.settings.categories, [
    'Dues', 'Event', 'Monthly contribution', 'One-time special contribution',
  ]);
});

test('does not link unverified or already linked identities', async (t) => {
  t.mock.method(User, 'findOne', async () => null);
  const getUser = mockClerk(t, 'unverified');
  const find = t.mock.method(User, 'find', async () => [{ clerkId: 'another_user' }]);
  const url = await startApp(t);
  let response = await fetch(url);
  assert.equal(response.status, 403);
  assert.equal(find.mock.callCount(), 0);

  getUser.mock.mockImplementation(async () => ({
    primaryEmailAddressId: 'email_1',
    emailAddresses: [{ id: 'email_1', emailAddress: 'alex@example.com', verification: { status: 'verified' } }],
    phoneNumbers: [],
  }));
  response = await fetch(url);
  assert.equal(response.status, 409);
});
