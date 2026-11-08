import { Router } from 'express';
import Contribution, { METHODS } from '../models/Contribution.js';
import Membership, { FINANCE_ROLES } from '../models/Membership.js';
import { requireAuth, loadMembership, requireRole, canSeeAll } from '../middleware/auth.js';
import { totalsByMembership } from '../services/totals.js';
import { ah, httpError } from '../utils/asyncHandler.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadMembership);

router.get('/', ah(async (req, res) => {
  const { membershipId, from, to, includeVoided } = req.query;
  const filter = { group: req.group._id };
  if (!canSeeAll(req)) filter.membership = req.membership._id; // members only see their own
  else if (membershipId) filter.membership = membershipId;
  if (includeVoided !== 'true') filter.voided = false;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const rows = await Contribution.find(filter)
    .sort({ date: -1 })
    .limit(1000)
    .populate({ path: 'membership', select: 'user', populate: { path: 'user', select: 'name' } });
  res.json({
    contributions: rows.map((c) => ({ ...c.toObject(), memberName: c.membership?.user?.name })),
  });
}));

// Group total is visible to everyone; per-member totals only if allowed.
router.get('/summary', ah(async (req, res) => {
  const totals = await totalsByMembership(req.group._id);
  let groupTotalCents = 0;
  let count = 0;
  for (const t of totals.values()) {
    groupTotalCents += t.totalCents;
    count += t.count;
  }
  res.json({
    groupTotalCents,
    count,
    ...(canSeeAll(req) && {
      perMember: [...totals.entries()].map(([id, t]) => ({ membershipId: id, totalCents: t.totalCents })),
    }),
  });
}));

router.post('/', requireRole(...FINANCE_ROLES), ah(async (req, res) => {
  const { membershipId, amountCents, date, method = 'other', category, reference, memo } = req.body;
  const member = await Membership.findOne({ _id: membershipId, group: req.group._id });
  if (!member) throw httpError(400, 'Pick a member from this group');
  const cents = Math.round(Number(amountCents));
  if (!(cents > 0)) throw httpError(400, 'Amount must be more than zero');
  if (!METHODS.includes(method)) throw httpError(400, 'Unknown payment method');

  const c = await Contribution.create({
    group: req.group._id,
    membership: member._id,
    amountCents: cents,
    date: date ? new Date(date) : new Date(),
    method,
    category: category || req.group.settings.categories[0],
    reference,
    memo,
    source: 'manual',
    enteredBy: req.userId,
  });
  res.status(201).json({ contribution: c });
}));

// Never delete money records: void them with a reason.
router.post('/:id/void', requireRole(...FINANCE_ROLES), ah(async (req, res) => {
  const c = await Contribution.findOne({ _id: req.params.id, group: req.group._id });
  if (!c) throw httpError(404, 'Entry not found');
  if (c.voided) throw httpError(400, 'Already voided');
  if (!req.body.reason?.trim()) throw httpError(400, 'Give a reason for voiding');
  Object.assign(c, { voided: true, voidReason: req.body.reason.trim(), voidedBy: req.userId, voidedAt: new Date() });
  await c.save();
  res.json({ contribution: c });
}));

export default router;
