import mongoose from 'mongoose';

export const ROLES = ['admin', 'treasurer', 'secretary', 'member'];
export const FINANCE_ROLES = ['admin', 'treasurer'];
export const BOARD_ROLES = ['admin', 'treasurer', 'secretary'];

// How a member shows up in payment emails. Stored normalized (lowercase,
// letters/digits only) so "J. Mwangi" and "j mwangi" match the same alias.
const identitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['cashapp', 'zelle', 'pushpay', 'email', 'phone', 'name'], default: 'name' },
    value: { type: String, required: true },
  },
  { _id: false }
);

const membershipSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, default: 'member' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    pledgeCents: { type: Number, default: 0, min: 0 }, // target for progress bar
    paymentIdentities: { type: [identitySchema], default: [] },
  },
  { timestamps: true }
);

membershipSchema.index({ group: 1, user: 1 }, { unique: true });

export default mongoose.model('Membership', membershipSchema);
