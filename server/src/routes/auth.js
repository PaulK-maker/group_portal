import { Router } from 'express';
import { clerkClient, getAuth } from '@clerk/express';
import User from '../models/User.js';
import Membership from '../models/Membership.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, httpError } from '../utils/asyncHandler.js';
import { contributionCategories } from '../services/contributionCategories.js';

const router = Router();

router.get('/me', requireAuth, ah(async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  let user = await User.findOne({ clerkId: clerkUserId });

  if (!user) {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses.find((address) =>
      address.id === clerkUser.primaryEmailAddressId && address.verification?.status === 'verified'
    )?.emailAddress?.trim().toLowerCase();
    const phone = clerkUser.phoneNumbers.find((number) =>
      number.id === clerkUser.primaryPhoneNumberId && number.verification?.status === 'verified'
    )?.phoneNumber;
    if (!email && !phone) throw httpError(403, 'A verified email address or phone number is required.');

    const matches = await User.find({ $or: [
      ...(email ? [{ email }] : []),
      ...(phone ? [{ phone }] : []),
    ] });
    if (matches.length > 1 || matches.some((match) => match.clerkId && match.clerkId !== clerkUserId)) {
      throw httpError(409, 'This contact information is already linked to another account. Contact your group administrator.');
    }
    if (matches.length === 1) {
      user = await User.findOneAndUpdate(
        { _id: matches[0]._id, $or: [{ clerkId: { $exists: false } }, { clerkId: null }, { clerkId: clerkUserId }] },
        { $set: { clerkId: clerkUserId } },
        { new: true }
      );
      if (!user) throw httpError(409, 'This account was linked elsewhere. Contact your group administrator.');
    } else {
      user = await User.create({
        clerkId: clerkUserId,
        ...(email && { email }),
        ...(phone && { phone }),
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || 'User',
      });
    }
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
      .map((m) => {
        const group = m.group.toObject();
        group.settings.categories = contributionCategories(group.settings.categories);
        return { id: m._id, role: m.role, group };
      }),
  });
}));

export default router;
