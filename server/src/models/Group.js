import crypto from 'crypto';
import mongoose from 'mongoose';

// A group is the unit everything else hangs off (members, money, posts).
// Every other collection stores `group` so data never leaks between tenants.
const groupSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    currency: { type: String, default: 'USD' },
    settings: {
      // false = members see only their own payments + the group total
      membersSeeAll: { type: Boolean, default: false },
      contributionLabel: { type: String, default: 'Contribution' },
      categories: { type: [String], default: ['Dues', 'Event', 'Welfare', 'Other'] },
    },
    // Secret used in the inbound-email webhook URL. Treat like a password.
    inboundToken: {
      type: String,
      unique: true,
      select: false,
      default: () => crypto.randomBytes(18).toString('hex'),
    },
  },
  { timestamps: true }
);

export default mongoose.model('Group', groupSchema);
