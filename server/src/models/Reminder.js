import mongoose from 'mongoose';

// One row per blast the treasurer sends. Kept so the group can see who sent
// what, when, and how many emails actually went out.
const reminderSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    audience: { type: String, enum: ['behind', 'all'], required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    recipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Reminder', reminderSchema);
