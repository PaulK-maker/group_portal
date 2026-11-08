import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Membership from '../models/Membership.js';
import { requireAuth } from '../middleware/auth.js';
import { sendLoginCode, sendLoginSms } from '../services/mailer.js';
import { createCodeLimiter } from '../services/codeLimiter.js';
import { normalizePhone, isCountryAllowed } from '../utils/phone.js';
import { ah } from '../utils/asyncHandler.js';

const router = Router();
const MAX_ATTEMPTS = 5;
const codeLimiter = createCodeLimiter();

const tooMany = (error) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: error.limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: error.message },
});
// Per-IP limits. /me is not limited: it runs on every page load.
const requestCodeIpLimit = tooMany({ limit: 10, message: 'Too many requests, try again later' });
const verifyIpLimit = tooMany({ limit: 30, message: 'Too many attempts, try again later' });

// Sign in with either { email } or { phone }. Returns null when neither is valid.
function identify(body) {
  if (body.phone) {
    const phone = normalizePhone(body.phone);
    return phone ? { kind: 'phone', phone, query: { phone } } : null;
  }
  const email = String(body.email || '').trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? { kind: 'email', email, query: { email } } : null;
}

// Passwordless sign-in: send a 6-digit code by email or SMS, then exchange it for a JWT.
router.post('/request-code', requestCodeIpLimit, ah(async (req, res) => {
  const id = identify(req.body);
  if (!id) return res.status(400).json({ error: req.body.phone ? 'Enter a valid phone number' : 'Enter a valid email' });
  if (id.kind === 'phone' && !isCountryAllowed(id.phone)) {
    return res.status(400).json({ error: 'Text sign-in is not available for that country, use email instead' });
  }

  const key = id.kind === 'phone' ? id.phone : id.email;
  const limit = codeLimiter.attempt(key);
  if (!limit.ok) {
    res.set('Retry-After', String(limit.retryAfterSec));
    return res.status(429).json({ error: limit.message });
  }

  let user = await User.findOne(id.query).select('+loginCodeHash +loginCodeExpires +loginAttempts');
  if (!user) {
    const fallbackName = id.kind === 'email' ? id.email.split('@')[0] : id.phone;
    user = new User({ ...id.query, name: req.body.name?.trim() || fallbackName });
  }

  // A fresh code must not reset the guess counter while the old code is still valid,
  // otherwise unlimited requests would allow unlimited guesses.
  const codeStillValid = Boolean(user.loginCodeHash) && user.loginCodeExpires > new Date();
  if (codeStillValid && user.loginAttempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many wrong tries, wait a few minutes and try again' });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  user.loginCodeHash = await bcrypt.hash(code, 10);
  user.loginCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
  if (!codeStillValid) user.loginAttempts = 0;
  await user.save();
  if (id.kind === 'phone') await sendLoginSms(id.phone, code);
  else await sendLoginCode(id.email, code);
  res.json({ ok: true });
}));

router.post('/verify', verifyIpLimit, ah(async (req, res) => {
  const id = identify(req.body);
  const code = String(req.body.code || '').trim();
  const bad = () => res.status(400).json({ error: 'Code is wrong or expired' });
  if (!id) return bad();
  const user = await User.findOne(id.query).select('+loginCodeHash +loginCodeExpires +loginAttempts');

  if (!user?.loginCodeHash || user.loginCodeExpires < new Date()) return bad();
  if (user.loginAttempts >= MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many wrong tries, wait a few minutes and try again' });

  if (!(await bcrypt.compare(code, user.loginCodeHash))) {
    user.loginAttempts += 1;
    await user.save();
    return bad();
  }
  user.loginCodeHash = undefined;
  user.loginCodeExpires = undefined;
  user.loginAttempts = 0;
  await user.save();

  const token = jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  const memberships = await Membership.find({ user: req.userId, status: 'active' }).populate({
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
