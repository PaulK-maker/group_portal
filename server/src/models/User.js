import mongoose from 'mongoose';

// A person. Account-level, not tied to one group: the same user can belong
// to several groups (or organizations) through Membership.
const userSchema = new mongoose.Schema(
  {
    clerkId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    // Optional so the treasurer can track members who never log in.
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    // E.164 (+15551234567); unique so a phone number can sign in as one account.
    phone: { type: String, trim: true, unique: true, sparse: true },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
