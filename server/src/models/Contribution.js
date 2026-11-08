import mongoose from 'mongoose';

export const METHODS = ['cashapp', 'zelle', 'pushpay', 'cash', 'check', 'other'];

// The ledger. Money is stored in integer cents to avoid float rounding.
// Entries are never deleted, only voided, so there is always an audit trail.
const contributionSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    membership: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    date: { type: Date, default: Date.now },
    method: { type: String, enum: METHODS, default: 'other' },
    category: { type: String, default: 'Dues' },
    reference: { type: String, trim: true }, // confirmation / transaction id
    memo: { type: String, trim: true },
    source: { type: String, enum: ['manual', 'email', 'import'], default: 'manual' },
    pending: { type: mongoose.Schema.Types.ObjectId, ref: 'PendingPayment' },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voided: { type: Boolean, default: false },
    voidReason: String,
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model('Contribution', contributionSchema);
