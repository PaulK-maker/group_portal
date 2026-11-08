import { Router } from 'express';
import PendingPayment from '../models/PendingPayment.js';
import Contribution from '../models/Contribution.js';
import Membership, { FINANCE_ROLES } from '../models/Membership.js';
import { requireAuth, loadMembership, requireRole } from '../middleware/auth.js';
import { norm } from '../services/matcher.js';
import { ah, httpError } from '../utils/asyncHandler.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadMembership, requireRole(...FINANCE_ROLES));

router.get('/', ah(async (req, res) => {
  const status = ['pending', 'confirmed', 'dismissed'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = await PendingPayment.find({ group: req.group._id, status })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate({ path: 'suggestedMembership', select: 'user', populate: { path: 'user', select: 'name' } });
  res.json({ pending: rows });
}));

// Treasurer confirms: becomes a real ledger entry.
router.post('/:id/confirm', ah(async (req, res) => {
  const p = await PendingPayment.findOne({ _id: req.params.id, group: req.group._id });
  if (!p) throw httpError(404, 'Not found');
  if (p.status !== 'pending') throw httpError(400, 'Already handled');

  const member = await Membership.findOne({ _id: req.body.membershipId, group: req.group._id });
  if (!member) throw httpError(400, 'Pick which member paid');

  const c = await Contribution.create({
    group: req.group._id,
    membership: member._id,
    amountCents: p.parsed.amountCents,
    date: p.parsed.date || p.createdAt,
    method: ['cashapp', 'zelle', 'pushpay'].includes(p.parsed.method) ? p.parsed.method : 'other',
    category: req.body.category || p.parsed.category || req.group.settings.categories[0],
    reference: p.parsed.reference,
    memo: p.parsed.memo,
    source: p.source,
    pending: p._id,
    enteredBy: req.userId,
  });

  // "Remember this payer" so next time it matches automatically (e.g. a spouse's account)
  if (req.body.rememberPayer && p.parsed.payerName) {
    const value = norm(p.parsed.payerName);
    if (!member.paymentIdentities.some((i) => i.value === value)) {
      const type = ['cashapp', 'zelle', 'pushpay'].includes(p.parsed.method) ? p.parsed.method : 'name';
      member.paymentIdentities.push({ type, value });
      await member.save();
    }
  }

  Object.assign(p, { status: 'confirmed', contribution: c._id, resolvedBy: req.userId });
  await p.save();
  res.json({ contribution: c });
}));

router.post('/:id/dismiss', ah(async (req, res) => {
  const p = await PendingPayment.findOneAndUpdate(
    { _id: req.params.id, group: req.group._id, status: 'pending' },
    { status: 'dismissed', resolvedBy: req.userId },
    { new: true }
  );
  if (!p) throw httpError(404, 'Not found or already handled');
  res.json({ pending: p });
}));

export default router;
