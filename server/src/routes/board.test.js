import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import Membership from '../models/Membership.js';
import Post from '../models/Post.js';
import Event from '../models/Event.js';
import boardRoutes from './board.js';

test('official posts and events use the authenticated member role', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  let role = 'chairman';
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: userId }) }));
  t.mock.method(Membership, 'findOne', async () => ({ role }));
  t.mock.method(Group, 'findById', async () => ({ _id: groupId }));
  const createPost = t.mock.method(Post, 'create', async (data) => data);
  const createEvent = t.mock.method(Event, 'create', async (data) => data);
  t.mock.method(Post, 'find', () => ({
    sort: () => ({ limit: () => ({ populate: async (field) => {
      assert.equal(field, 'author');
      return [{ title: 'Update', author: { name: 'Alex' }, senderRole: 'chairman' }, { title: 'Old post' }];
    } }) }),
  }));
  t.mock.method(Event, 'find', () => ({
    sort: () => ({ populate: async (field) => {
      assert.equal(field, 'createdBy');
      return [{ title: 'Meeting', createdBy: { name: 'Alex' }, senderRole: 'chairman' }, { title: 'Old event' }];
    } }),
  }));

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.auth = () => ({ tokenType: 'session_token', userId: 'user_clerk' });
    next();
  });
  app.use('/groups/:groupId/board', boardRoutes);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/groups/${groupId}/board`;

  for (const assignedRole of ['chairman', 'treasurer', 'secretary', 'admin']) {
    role = assignedRole;
    for (const [path, key] of [['posts', 'post'], ['events', 'event']]) {
      const response = await fetch(`${base}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Update', startsAt: '2026-12-01T10:00:00Z', senderRole: 'secretary' }),
      });
      assert.equal(response.status, 201);
      const created = (await response.json())[key];
      assert.equal(created.senderRole, assignedRole);
      assert.equal(created[key === 'post' ? 'author' : 'createdBy'], String(userId));
    }
  }

  role = 'member';
  for (const path of ['posts', 'events']) {
    const response = await fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Update', startsAt: '2026-12-01T10:00:00Z', senderRole: 'chairman' }),
    });
    assert.equal(response.status, 403);
  }
  assert.equal(createPost.mock.callCount(), 4);
  assert.equal(createEvent.mock.callCount(), 4);

  const response = await fetch(base);
  assert.equal(response.status, 200);
  const { posts, events } = await response.json();
  assert.deepEqual(posts[0], { title: 'Update', author: { name: 'Alex' }, senderRole: 'chairman' });
  assert.deepEqual(events[0], { title: 'Meeting', createdBy: { name: 'Alex' }, senderRole: 'chairman' });
  assert.equal(posts[1].senderRole, undefined);
  assert.equal(events[1].senderRole, undefined);
});

test('chairman is a valid membership role and sender role', () => {
  const group = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();
  assert.equal(new Membership({ group, user, role: 'chairman' }).validateSync(), undefined);
  assert.equal(new Post({ group, title: 'Update', senderRole: 'chairman' }).validateSync(), undefined);
  assert.equal(new Event({ group, title: 'Meeting', startsAt: new Date(), senderRole: 'chairman' }).validateSync(), undefined);
});
