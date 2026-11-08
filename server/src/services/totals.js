import mongoose from 'mongoose';
import Contribution from '../models/Contribution.js';

// Map of membershipId -> { totalCents, count, lastDate } for one group.
export async function totalsByMembership(groupId) {
  const rows = await Contribution.aggregate([
    { $match: { group: new mongoose.Types.ObjectId(String(groupId)), voided: false } },
    {
      $group: {
        _id: '$membership',
        totalCents: { $sum: '$amountCents' },
        count: { $sum: 1 },
        lastDate: { $max: '$date' },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}
