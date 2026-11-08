import mongoose from 'mongoose';

// Top-level tenant: a church, club, chama, association, alumni group, etc.
// One organization can own many groups (men's group, women's group, youth...).
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['church', 'club', 'chama', 'association', 'nonprofit', 'other'],
      default: 'other',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Organization', organizationSchema);
