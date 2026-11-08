import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    type: { type: String, enum: ['announcement', 'minutes'], default: 'announcement' },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    attachmentUrl: String, // e.g. link to a PDF of the minutes
    pinned: { type: Boolean, default: false },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Post', postSchema);
