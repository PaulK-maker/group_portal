import { Router } from 'express';
import Group from '../models/Group.js';
import Membership from '../models/Membership.js';
import PendingPayment from '../models/PendingPayment.js';
import { parsePaymentEmail, guessCategory } from '../services/emailParser.js';
import { matchPayer } from '../services/matcher.js';
import { ah } from '../utils/asyncHandler.js';

const router = Router();

// Webhook for forwarded payment emails.
// Point your inbound-email service (Mailgun Routes, Postmark Inbound,
// SendGrid Inbound Parse) at: POST /api/inbound/email/<group inboundToken>
// TODO before production: verify the provider's webhook signature too.
router.post('/email/:token', ah(async (req, res) => {
  const group = await Group.findOne({ inboundToken: req.params.token });
  if (!group) return res.status(404).end();

  const b = req.body || {};
  const email = {
    from: b.from || b.sender || b.From || '',
    subject: b.subject || b.Subject || '',
    text: b.text || b['body-plain'] || b.TextBody || b['stripped-text'] || '',
  };

  const parsed = parsePaymentEmail(email);
  if (!parsed) return res.json({ ignored: true }); // not a payment, still return 200

  if (parsed.reference) {
    const dup = await PendingPayment.findOne({ group: group._id, 'parsed.reference': parsed.reference });
    if (dup) return res.json({ duplicate: true });
  }

  const memberships = await Membership.find({ group: group._id, status: 'active' }).populate('user', 'name email');
  const match = matchPayer(memberships, parsed.payerName);

  const p = await PendingPayment.create({
    group: group._id,
    source: 'email',
    raw: { from: email.from, subject: email.subject, snippet: email.text.slice(0, 500) },
    parsed: { ...parsed, category: guessCategory(parsed.memo, group.settings.categories), date: new Date() },
    suggestedMembership: match?._id,
  });
  res.status(201).json({ id: p._id, matched: Boolean(match) });
}));

export default router;
