import { Router } from 'express';
import User from '../models/User.js';
import Membership from '../models/Membership.js';
import { requireAuth } from '../middleware/auth.js';
import { ah } from '../utils/asyncHandler.js';

const router = Router();

router.get('/me', requireAuth, ah(async (req, res) => {
  const clerkUserId = req.auth.userId;
  let user = await User.findOne({ clerkId: clerkUserId });
  
  if (!user) {
    user = new User({
      clerkId: clerkUserId,
      email: req.auth.sessionClaims?.email || '',
      name: req.auth.sessionClaims?.name || 'User',
      phone: req.auth.sessionClaims?.phone || '',
    });
    await user.save();
  }
  
  const memberships = await Membership.find({ user: user._id, status: 'active' }).populate({
    path: 'group',
    select: 'name currency settings organization',
    populate: { path: 'organization', select: 'name type' },
  });
  res.json({
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone },
    memberships: memberships
      .filter((m) => m.group)
      .map((m) => ({ id: m._id, role: m.role, group: m.group })),
  });
}));

export default router;
