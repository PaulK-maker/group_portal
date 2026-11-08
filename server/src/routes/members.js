import { Router } from 'express';
import User from '../models/User.js';
import Membership, { FINANCE_ROLES, ROLES } from '../models/Membership.js';
import Contribution from '../models/Contribution.js';
import { requireAuth, loadMembership, requireRole, isFinance, canSeeAll } from '../middleware/auth.js';
import { totalsByMembership } from '../services/totals.js';
import { norm } from '../services/matcher.js';
import { normalizePhone } from '../utils/phone.js';
import { ah, httpError } from '../utils/asyncHandler.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadMembership);

router.get('/', ah(async (req, res) => {
  const ms = await Membership.find({ group: req.group._id }).populate('user', 'name email phone');
  const showMoney = canSeeAll(req);
  const showPrivate = isFinance(req);
  const totals = showMoney ? await totalsByMembership(req.group._id) : new Map();

  const rows = ms
    .sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || ''))
    .map((m) => ({
      id: m._id,
      name: m.user?.name,
      role: m.role,
      status: m.status,
      ...(showPrivate && { email: m.user?.email, phone: m.user?.phone, paymentIdentities: m.paymentIdentities }),
      ...(showMoney && { pledgeCents: m.pledgeCents, totalCents: totals.get(String(m._id))?.totalCents || 0 }),
    }));
  res.json({ members: rows });
}));

// The signed-in member's own progress
router.get('/me', ah(async (req, res) => {
  const m = req.membership;
  const contributions = await Contribution.find({ membership: m._id, voided: false }).sort({ date: -1 });
  const totalCents = contributions.reduce((s, c) => s + c.amountCents, 0);
  res.json({ membershipId: m._id, role: m.role, pledgeCents: m.pledgeCents, totalCents, contributions });
}));

router.post('/', requireRole(...FINANCE_ROLES), ah(async (req, res) => {
  const { name, email, phone, role = 'member', pledgeCents = 0 } = req.body;
  if (!name?.trim()) throw httpError(400, 'Name is required');
  if (!ROLES.includes(role)) throw httpError(400, 'Unknown role');
  if (role !== 'member' && req.membership.role !== 'admin') throw httpError(403, 'Only an admin can assign roles');

  const cleanEmail = email?.trim().toLowerCase() || undefined;
  const cleanPhone = phone?.trim() ? normalizePhone(phone) : undefined;
  if (phone?.trim() && !cleanPhone) throw httpError(400, 'Enter a valid phone number');
  let user = (cleanEmail && (await User.findOne({ email: cleanEmail }))) || (cleanPhone && (await User.findOne({ phone: cleanPhone }))) || null;
  if (!user) user = await User.create({ name: name.trim(), email: cleanEmail, phone: cleanPhone });

  const exists = await Membership.findOne({ group: req.group._id, user: user._id });
  if (exists) throw httpError(409, 'That person is already in this group');

  const m = await Membership.create({
    group: req.group._id,
    user: user._id,
    role,
    pledgeCents: Math.max(0, Number(pledgeCents) || 0),
    paymentIdentities: [{ type: 'name', value: norm(name) }],
  });
  res.status(201).json({ member: m });
}));

router.patch('/:membershipId', requireRole(...FINANCE_ROLES), ah(async (req, res) => {
  const m = await Membership.findOne({ _id: req.params.membershipId, group: req.group._id }).populate('user');
  if (!m) throw httpError(404, 'Member not found');
  const { role, status, pledgeCents, paymentIdentities, name, phone } = req.body;

  if (role !== undefined) {
    if (req.membership.role !== 'admin') throw httpError(403, 'Only an admin can change roles');
    if (!ROLES.includes(role)) throw httpError(400, 'Unknown role');
    m.role = role;
  }
  if (status !== undefined) m.status = status === 'inactive' ? 'inactive' : 'active';
  if (pledgeCents !== undefined) m.pledgeCents = Math.max(0, Number(pledgeCents) || 0);
  if (Array.isArray(paymentIdentities)) {
    m.paymentIdentities = paymentIdentities
      .filter((i) => i?.value)
      .map((i) => ({ type: i.type || 'name', value: norm(i.value) }));
  }
  if (name || phone !== undefined) {
    if (name) m.user.name = name.trim();
    if (phone !== undefined) {
      const cleanPhone = String(phone || '').trim() ? normalizePhone(phone) : undefined;
      if (String(phone || '').trim() && !cleanPhone) throw httpError(400, 'Enter a valid phone number');
      if (cleanPhone && cleanPhone !== m.user.phone && (await User.exists({ phone: cleanPhone }))) {
        throw httpError(409, 'That phone number belongs to another account');
      }
      m.user.phone = cleanPhone;
    }
    await m.user.save();
  }
  await m.save();
  res.json({ member: m });
}));

export default router;
