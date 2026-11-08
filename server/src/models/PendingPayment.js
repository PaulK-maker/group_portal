import mongoose from 'mongoose';

// A payment detected from an email (or CSV import) that the treasurer
// still has to confirm before it counts toward anyone's progress.
const pendingSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    source: { type: String, enum: ['email', 'import'], default: 'email' },
    raw: {
      from: String,
      subject: String,
      snippet: String,
    },
    parsed: {
      method: String,
      amountCents: Number,
      payerName: String,
      memo: String,
      reference: String,
      category: String,
      date: { type: Date, default: Date.now },
    },
    suggestedMembership: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
    status: { type: String, enum: ['pending', 'confirmed', 'dismissed'], default: 'pending', index: true },
    contribution: { type: mongoose.Schema.Types.ObjectId, ref: 'Contribution' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('PendingPayment', pendingSchema);
