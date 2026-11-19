import { Router } from 'express';
import PendingPayment from '../models/PendingPayment.js';
import { requireAuth, loadUser, loadMembership } from '../middleware/auth.js';
import { toCents, guessCategory } from '../services/emailParser.js';
import { ah, httpError } from '../utils/asyncHandler.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadUser, loadMembership);

const MAX_BYTES = 1024 * 1024; // the browser shrinks screenshots well below this
const MAX_PER_DAY = 10;
const SEND_METHODS = ['cashapp', 'venmo', 'zelle', 'pushpay'];
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export function parseImageDataUrl(dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.match(DATA_URL);
  if (!m) throw httpError(400, 'Attach a JPEG, PNG or WebP screenshot');
  const data = Buffer.from(m[2], 'base64');
  if (!data.length || data.length > MAX_BYTES) throw httpError(400, 'Screenshot is too large (max 1 MB)');
  return { contentType: m[1], data };
}

// A member sends a screenshot of a payment they made. It lands in the
// treasurer's Pending queue, like a forwarded email, and counts only once confirmed.
router.post('/', ah(async (req, res) => {
  const { imageDataUrl, amount, method, memo = '', date } = req.body;
  const amountCents = toCents(amount);
  if (!amountCents || amountCents < 1) throw httpError(400, 'Enter the amount you paid');
  if (!SEND_METHODS.includes(method)) throw httpError(400, 'Pick how you paid');
  const paidOn = date ? new Date(date) : new Date();
  if (Number.isNaN(paidOn.getTime())) throw httpError(400, 'Bad date');
  const proof = parseImageDataUrl(imageDataUrl);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await PendingPayment.countDocuments({
    group: req.group._id, submittedBy: req.membership._id, createdAt: { $gte: since },
  });
  if (recent >= MAX_PER_DAY) throw httpError(429, 'Too many uploads today. Try again tomorrow.');

  const p = await PendingPayment.create({
    group: req.group._id,
    source: 'upload',
    parsed: {
      method,
      amountCents,
      memo: String(memo).trim(),
      category: guessCategory(String(memo), req.group.settings.categories),
      date: paidOn,
    },
    suggestedMembership: req.membership._id,
    submittedBy: req.membership._id,
    proofType: proof.contentType,
    proofData: proof.data,
  });
  res.status(201).json({ id: p._id });
}));

export default router;
