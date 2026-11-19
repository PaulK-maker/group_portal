import { clerkMiddleware, getAuth } from '@clerk/express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Membership, { FINANCE_ROLES } from '../models/Membership.js';
import Group from '../models/Group.js';
import { ah } from '../utils/asyncHandler.js';

export const clerkAuth = clerkMiddleware();

export const requireAuth = (req, res, next) => {
  const auth = getAuth(req);
  if (auth.userId) return next();
  if (req.headers.authorization) {
    console.warn('Clerk rejected the session token:', auth.debug().reason);
  }
  return res.status(401).json({ error: 'Not signed in' });
};

export const loadUser = ah(async (req, res, next) => {
  if (req.userId) return next();
  const user = await User.findOne({ clerkId: getAuth(req).userId }).select('_id');
  if (!user) return res.status(403).json({ error: 'Account not found. Reload and sign in again.' });
  req.userId = user._id;
  next();
});

// Tenant guard: the signed-in user must be an active member of :groupId.
// Attaches req.group and req.membership for the route handlers.
export const loadMembership = ah(async (req, res, next) => {
  const { groupId } = req.params;
  if (!mongoose.isValidObjectId(groupId)) return res.status(400).json({ error: 'Bad group id' });
  const membership = await Membership.findOne({ group: groupId, user: req.userId, status: 'active' });
  if (!membership) return res.status(403).json({ error: 'You are not a member of this group' });
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  req.membership = membership;
  req.group = group;
  next();
});

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.membership?.role) ? next() : res.status(403).json({ error: 'Not allowed for your role' });

export const isFinance = (req) => FINANCE_ROLES.includes(req.membership?.role);

// Can this user see other members' money?
export const canSeeAll = (req) => isFinance(req) || Boolean(req.group?.settings?.membersSeeAll);
