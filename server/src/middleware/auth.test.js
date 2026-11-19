import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Group from '../models/Group.js';
import Membership from '../models/Membership.js';
import groupRoutes from '../routes/groups.js';
import { requireAuth, loadUser, loadMembership } from './auth.js';

async function startApp(t) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.auth = () => ({ tokenType: 'session_token', userId: 'user_clerk' });
    next();
  });
  app.use('/groups', groupRoutes);
  app.get('/guarded/:groupId', requireAuth, loadUser, loadMembership, (req, res) => {
    res.json({ userId: req.userId, role: req.membership.role });
  });
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('group creation links the Clerk account to the MongoDB user', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const orgId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', (filter) => {
    assert.deepEqual(filter, { clerkId: 'user_clerk' });
    return { select: async () => ({ _id: userId }) };
  });
  t.mock.method(Organization, 'create', async (data) => {
    assert.equal(data.createdBy, userId);
    return { _id: orgId };
  });
  t.mock.method(Group, 'create', async (data) => {
    assert.equal(data.organization, orgId);
    return { _id: groupId, name: data.name };
  });
  t.mock.method(Membership, 'create', async (data) => {
    assert.equal(data.user, userId);
    assert.equal(data.group, groupId);
    assert.equal(data.role, 'admin');
  });

  const base = await startApp(t);
  const response = await fetch(`${base}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName: 'Example', orgType: 'club', groupName: 'Group' }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).group._id, String(groupId));
});

test('rejects group creation before writing when the local account is missing', async (t) => {
  t.mock.method(User, 'findOne', () => ({ select: async () => null }));
  const create = t.mock.method(Organization, 'create');
  const base = await startApp(t);
  const response = await fetch(`${base}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName: 'Example', groupName: 'Group' }),
  });
  assert.equal(response.status, 403);
  assert.equal(create.mock.callCount(), 0);
});

test('group access checks membership against the MongoDB user ID', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  t.mock.method(Membership, 'findOne', async (filter) => {
    assert.equal(filter.user, userId);
    assert.equal(filter.group, String(groupId));
    assert.equal(filter.status, 'active');
    return { role: 'admin' };
  });
  t.mock.method(Group, 'findById', async () => ({ _id: groupId }));
  const base = await startApp(t);
  const response = await fetch(`${base}/guarded/${groupId}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).userId, String(userId));
});

test('group access rejects users without an active membership', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  t.mock.method(Membership, 'findOne', async () => null);
  const findGroup = t.mock.method(Group, 'findById');
  const base = await startApp(t);
  const response = await fetch(`${base}/guarded/${groupId}`);
  assert.equal(response.status, 403);
  assert.equal(findGroup.mock.callCount(), 0);
});
