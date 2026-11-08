import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    startsAt: { type: Date, required: true },
    location: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Event', eventSchema);
