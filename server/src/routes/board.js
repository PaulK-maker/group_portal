import { Router } from 'express';
import Post from '../models/Post.js';
import Event from '../models/Event.js';
import { BOARD_ROLES } from '../models/Membership.js';
import { requireAuth, loadMembership, requireRole } from '../middleware/auth.js';
import { ah, httpError } from '../utils/asyncHandler.js';

// Announcements, meeting minutes and upcoming events.
const router = Router({ mergeParams: true });
router.use(requireAuth, loadMembership);

router.get('/', ah(async (req, res) => {
  const [posts, events] = await Promise.all([
    Post.find({ group: req.group._id }).sort({ pinned: -1, createdAt: -1 }).limit(100).populate('author', 'name'),
    Event.find({ group: req.group._id, startsAt: { $gte: new Date(Date.now() - 864e5) } }).sort({ startsAt: 1 }),
  ]);
  res.json({ posts, events });
}));

router.post('/posts', requireRole(...BOARD_ROLES), ah(async (req, res) => {
  const { type, title, body, attachmentUrl, pinned } = req.body;
  if (!title?.trim()) throw httpError(400, 'Title is required');
  const post = await Post.create({
    group: req.group._id,
    type: type === 'minutes' ? 'minutes' : 'announcement',
    title, body, attachmentUrl, pinned: Boolean(pinned),
    author: req.userId,
  });
  res.status(201).json({ post });
}));

router.delete('/posts/:id', requireRole(...BOARD_ROLES), ah(async (req, res) => {
  await Post.deleteOne({ _id: req.params.id, group: req.group._id });
  res.json({ ok: true });
}));

router.post('/events', requireRole(...BOARD_ROLES), ah(async (req, res) => {
  const { title, description, startsAt, location } = req.body;
  if (!title?.trim() || !startsAt) throw httpError(400, 'Title and date are required');
  const event = await Event.create({
    group: req.group._id, title, description, location, startsAt: new Date(startsAt), createdBy: req.userId,
  });
  res.status(201).json({ event });
}));

router.delete('/events/:id', requireRole(...BOARD_ROLES), ah(async (req, res) => {
  await Event.deleteOne({ _id: req.params.id, group: req.group._id });
  res.json({ ok: true });
}));

export default router;
