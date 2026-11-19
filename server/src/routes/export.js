import { Router } from 'express';
import ExcelJS from 'exceljs';
import Contribution from '../models/Contribution.js';
import Membership, { FINANCE_ROLES } from '../models/Membership.js';
import { requireAuth, loadUser, loadMembership, requireRole } from '../middleware/auth.js';
import { totalsByMembership } from '../services/totals.js';
import { ah } from '../utils/asyncHandler.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadUser, loadMembership, requireRole(...FINANCE_ROLES));

const dollars = (c) => Math.round(c) / 100;
const methodLabels = {
  cashapp: 'Cash App', venmo: 'Venmo', zelle: 'Zelle', pushpay: 'Pushpay', cash: 'Cash', check: 'Check', other: 'Other',
};

// Full Excel workbook: a Summary sheet (one row per member) + the Ledger.
router.get('/', ah(async (req, res) => {
  const categories = req.group.settings.categories;
  const defaultCategory = categories.includes('Dues') ? 'Dues' : categories[0];
  const category = req.query.category === undefined ? defaultCategory : req.query.category;
  if (typeof category !== 'string' || !categories.includes(category)) {
    return res.status(400).json({ error: 'Choose a valid report category' });
  }
  const [members, ledger, totals] = await Promise.all([
    Membership.find({ group: req.group._id }).populate('user', 'name email phone'),
    Contribution.find({ group: req.group._id }).sort({ date: 1 }).populate({
      path: 'membership', select: 'user', populate: { path: 'user', select: 'name' },
    }),
    totalsByMembership(req.group._id),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pamo-Ledger';
  const money = '"$"#,##0.00';

  const s = wb.addWorksheet('Summary');
  s.columns = [
    { header: 'Member', key: 'name', width: 26 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Pledge', key: 'pledge', width: 12, style: { numFmt: money } },
    { header: 'Paid', key: 'paid', width: 12, style: { numFmt: money } },
    { header: 'Remaining', key: 'remaining', width: 12, style: { numFmt: money } },
    { header: '% of pledge', key: 'pct', width: 12, style: { numFmt: '0%' } },
  ];
  members
    .sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || ''))
    .forEach((m) => {
      const paid = totals.get(String(m._id))?.totalCents || 0;
      s.addRow({
        name: m.user?.name,
        status: m.status,
        pledge: dollars(m.pledgeCents),
        paid: dollars(paid),
        remaining: dollars(Math.max(0, m.pledgeCents - paid)),
        pct: m.pledgeCents ? paid / m.pledgeCents : null,
      });
    });
  const totalRow = s.addRow({ name: 'TOTAL', paid: dollars([...totals.values()].reduce((a, t) => a + t.totalCents, 0)) });
  totalRow.font = { bold: true };
  s.getRow(1).font = { bold: true };

  const l = wb.addWorksheet('Ledger');
  l.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Member', key: 'member', width: 26 },
    { header: 'Amount', key: 'amount', width: 12, style: { numFmt: money } },
    { header: 'Method', key: 'method', width: 10 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Memo', key: 'memo', width: 30 },
    { header: 'Source', key: 'source', width: 9 },
    { header: 'Voided', key: 'voided', width: 22 },
  ];
  ledger.forEach((c) =>
    l.addRow({
      date: c.date,
      member: c.membership?.user?.name,
      amount: dollars(c.amountCents),
      method: methodLabels[c.method] || c.method,
      category: c.category,
      reference: c.reference,
      memo: c.memo,
      source: c.source,
      voided: c.voided ? `VOID: ${c.voidReason || ''}` : '',
    })
  );
  l.getRow(1).font = { bold: true };

  const monthly = wb.addWorksheet('Monthly report');
  monthly.columns = [
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Member', key: 'member', width: 26 },
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Amount', key: 'amount', width: 12, style: { numFmt: money } },
    { header: 'Method', key: 'method', width: 12 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Memo', key: 'memo', width: 30 },
  ];
  const groups = new Map();
  for (const c of ledger) {
    if (c.voided || c.category !== category) continue;
    const month = c.date.toISOString().slice(0, 7);
    const memberId = String(c.membership?._id || c._id);
    const key = `${month}:${memberId}`;
    if (!groups.has(key)) groups.set(key, { month, member: c.membership?.user?.name, payments: [] });
    groups.get(key).payments.push(c);
  }
  for (const { month, member, payments } of groups.values()) {
    let totalCents = 0;
    for (const c of payments) {
      totalCents += c.amountCents;
      monthly.addRow({
        month, member, date: c.date, category: c.category, amount: dollars(c.amountCents),
        method: methodLabels[c.method] || c.method, reference: c.reference, memo: c.memo,
      });
    }
    const subtotal = monthly.addRow({ month, member, category: `${category} total`, amount: dollars(totalCents) });
    subtotal.font = { bold: true };
  }
  monthly.getRow(1).font = { bold: true };

  const safe = req.group.name.replace(/[^a-z0-9]+/gi, '-');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

export default router;
