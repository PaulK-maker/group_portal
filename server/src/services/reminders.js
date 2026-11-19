import Membership from '../models/Membership.js';
import { totalsByMembership } from './totals.js';
import { sendEmail } from './mailer.js';

export const AUDIENCES = ['behind', 'all'];
export const MAX_RECIPIENTS = 200;

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

// Replaces {name}, {balance}, {pledge}, {paid} and {group}. Other braces are left alone.
export function fillTemplate(text, vars) {
  return text.replace(/\{(name|balance|pledge|paid|group)\}/g, (_, key) => vars[key] ?? '');
}

// Active members who want reminders and have an email on file, with their balance.
// "behind" keeps only people who still owe part of their pledge.
export async function recipientsFor(group, audience) {
  const memberships = await Membership.find({ group: group._id, status: 'active', remindersOff: false })
    .populate('user', 'name email');
  const totals = await totalsByMembership(group._id);
  return memberships
    .filter((m) => m.user?.email)
    .map((m) => {
      const paidCents = totals.get(String(m._id))?.totalCents || 0;
      return {
        name: m.user.name,
        email: m.user.email,
        pledgeCents: m.pledgeCents,
        paidCents,
        balanceCents: Math.max(0, m.pledgeCents - paidCents),
      };
    })
    .filter((r) => audience === 'all' || r.balanceCents > 0);
}

// One email per recipient, each with their own numbers. Returns how many worked and how many failed.
export async function sendReminders({ group, recipients, subject, body }) {
  let sent = 0;
  let failed = 0;
  const footer = `\n\n---\nYou get this as a member of ${group.name}. Turn reminders off on your Dashboard in Pamo-Ledger.`;
  for (const r of recipients) {
    const vars = {
      name: r.name,
      group: group.name,
      balance: money(r.balanceCents),
      pledge: money(r.pledgeCents),
      paid: money(r.paidCents),
    };
    try {
      await sendEmail({ to: r.email, subject: fillTemplate(subject, vars), text: fillTemplate(body, vars) + footer });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[reminder failed] ${r.email}:`, err.message);
    }
  }
  return { sent, failed };
}
