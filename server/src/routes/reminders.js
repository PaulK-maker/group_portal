import { Router } from 'express';
import Reminder from '../models/Reminder.js';
import { FINANCE_ROLES } from '../models/Membership.js';
import { requireAuth, loadUser, loadMembership, requireRole } from '../middleware/auth.js';
import { AUDIENCES, MAX_RECIPIENTS, recipientsFor, sendReminders } from '../services/reminders.js';
import { emailConfigured } from '../services/mailer.js';
import { ah, httpError } from '../utils/asyncHandler.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadUser, loadMembership);

const finance = requireRole(...FINANCE_ROLES);

// A member turns their own reminders on or off.
router.patch('/me', ah(async (req, res) => {
  req.membership.remindersOff = Boolean(req.body.remindersOff);
  await req.membership.save();
  res.json({ remindersOff: req.membership.remindersOff });
}));

// How many people a blast would reach right now.
router.get('/preview', finance, ah(async (req, res) => {
  if (!AUDIENCES.includes(req.query.audience)) throw httpError(400, 'Pick who should get it');
  const recipients = await recipientsFor(req.group, req.query.audience);
  res.json({ count: recipients.length });
}));

router.get('/', finance, ah(async (req, res) => {
  const reminders = await Reminder.find({ group: req.group._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('sentBy', 'name');
  res.json({ reminders, emailConfigured: emailConfigured() });
}));

router.post('/', finance, ah(async (req, res) => {
  const audience = req.body.audience;
  const subject = String(req.body.subject || '').trim();
  const body = String(req.body.body || '').trim();
  if (!AUDIENCES.includes(audience)) throw httpError(400, 'Pick who should get it');
  if (!subject || !body) throw httpError(400, 'Add a subject and a message');
  if (body.length > 2000) throw httpError(400, 'Keep the message under 2,000 characters');

  const recipients = await recipientsFor(req.group, audience);
  if (!recipients.length) throw httpError(400, 'No members match that audience');
  if (recipients.length > MAX_RECIPIENTS) throw httpError(400, `One send reaches at most ${MAX_RECIPIENTS} members`);

  const { sent, failed } = await sendReminders({ group: req.group, recipients, subject, body });
  const reminder = await Reminder.create({
    group: req.group._id,
    sentBy: req.userId,
    audience,
    subject,
    body,
    recipients: recipients.length,
    sent,
    failed,
  });
  res.status(201).json({ reminder, dryRun: !emailConfigured() });
}));

export default router;
