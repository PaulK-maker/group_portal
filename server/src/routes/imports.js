import { Router } from 'express';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Contribution from '../models/Contribution.js';
import Membership, { FINANCE_ROLES } from '../models/Membership.js';
import { requireAuth, loadUser, loadMembership, requireRole } from '../middleware/auth.js';
import { ah, httpError } from '../utils/asyncHandler.js';
import { validateWorkbookArchive } from '../services/workbookArchive.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, loadUser, loadMembership, requireRole(...FINANCE_ROLES));

const MAX_FILE_BYTES = 750 * 1024;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 60;
const objectId = /^[a-f0-9]{24}$/;
const monthFormat = /^\d{4}-(0[1-9]|1[0-2])$/;

function cellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[Invalid date]' : value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value.formula || value.sharedFormula) {
    return value.result == null ? '[Formula has no cached value]' : cellValue(value.result);
  }
  if (value.richText) return value.richText.map((part) => part.text).join('');
  if (value.text != null) return String(value.text);
  return '[Unsupported cell value]';
}

router.post('/workbook', ah(async (req, res) => {
  const { data } = req.body;
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) {
    throw httpError(400, 'Choose an Excel .xlsx file no larger than 750 KB');
  }
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw httpError(400, 'Excel file is empty or too large');
  const workbook = new ExcelJS.Workbook();
  try {
    validateWorkbookArchive(buffer);
  } catch (err) {
    throw httpError(400, 'Invalid Excel archive or expanded workbook exceeds the size limit (20 MB total, 8 MB per file).');
  }
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw httpError(400, 'Unable to read this Excel file. Choose a valid .xlsx workbook.');
  }
  if (!workbook.worksheets.length || workbook.worksheets.length > 20) throw httpError(400, 'Workbook must contain 1 to 20 worksheets');
  let totalCells = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS) {
      throw httpError(400, `Sheet "${sheet.name}" exceeds the limit of ${MAX_ROWS} rows or ${MAX_COLUMNS} columns`);
    }
    totalCells += sheet.rowCount * sheet.columnCount;
    if (totalCells > 60000) throw httpError(400, 'Workbook exceeds the limit of 60,000 cells');
    const rows = [];
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const cells = Array.from({ length: sheet.columnCount }, (_, i) => cellValue(row.getCell(i + 1).value));
      if (cells.some((cell) => typeof cell === 'string' && cell.length > 1000)) throw httpError(400, 'A spreadsheet cell exceeds 1,000 characters');
      rows.push(cells);
    }
    return { name: sheet.name, rows };
  });
  res.json({ sheets });
}));

function parseDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'Every payment needs a valid date');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw httpError(400, 'Every payment needs a valid date');
  return parsed;
}

async function validateRows(req) {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) throw httpError(400, `Choose 1 to ${MAX_ROWS} payments`);
  const ids = new Set();
  const memberIds = new Set();
  const cleaned = rows.map((row) => {
    if (!row || typeof row.id !== 'string' || !objectId.test(row.id) || ids.has(row.id)) throw httpError(400, 'Invalid or repeated import row ID');
    ids.add(row.id);
    if (typeof row.membershipId !== 'string' || !objectId.test(row.membershipId)) throw httpError(400, 'Match every selected payment to a member');
    memberIds.add(row.membershipId);
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents < 1) throw httpError(400, 'Every payment needs a positive amount in cents');
    if (typeof row.reportingMonth !== 'string' || !monthFormat.test(row.reportingMonth)) throw httpError(400, 'Every payment needs a reporting month');
    if (!req.group.settings.categories.includes(row.category)) throw httpError(400, 'Choose a valid group category');
    if (row.memo !== undefined && (typeof row.memo !== 'string' || row.memo.length > 200)) throw httpError(400, 'Memo must be at most 200 characters');
    return {
      _id: new mongoose.Types.ObjectId(row.id),
      group: req.group._id,
      membership: new mongoose.Types.ObjectId(row.membershipId),
      amountCents: row.amountCents,
      date: parseDate(row.date),
      reportingMonth: row.reportingMonth,
      category: row.category,
      memo: (row.memo || '').trim(),
      method: 'other',
      source: 'import',
      enteredBy: req.userId,
    };
  });
  const members = await Membership.find({ _id: { $in: [...memberIds] }, group: req.group._id, status: 'active' }).select('_id').lean();
  if (members.length !== memberIds.size) throw httpError(400, 'One or more selected members are not active in this group');
  return cleaned;
}

const duplicateKey = (row) => `${row.membership}|${row.category}|${row.reportingMonth || row.date.toISOString().slice(0, 7)}`;

function sameImportedPayment(existing, candidate) {
  return String(existing.group) === String(candidate.group) &&
    String(existing.enteredBy) === String(candidate.enteredBy) &&
    String(existing.membership) === String(candidate.membership) &&
    existing.source === 'import' && !existing.voided &&
    existing.amountCents === candidate.amountCents &&
    existing.date.getTime() === candidate.date.getTime() &&
    existing.reportingMonth === candidate.reportingMonth &&
    existing.category === candidate.category && (existing.memo || '') === candidate.memo && existing.method === candidate.method;
}

async function inspectRows(req, rows) {
  const ids = rows.map((row) => row._id);
  const [byId, existing] = await Promise.all([
    Contribution.find({ _id: { $in: ids } }).lean(),
    Contribution.find({ group: req.group._id, membership: { $in: rows.map((row) => row.membership) }, voided: false }).lean(),
  ]);
  const saved = new Set();
  const requested = new Map(rows.map((row) => [String(row._id), row]));
  for (const payment of byId) {
    const candidate = requested.get(String(payment._id));
    if (!candidate || !sameImportedPayment(payment, candidate)) throw httpError(409, 'An import row was already used for a different payment. Start a new import.');
    saved.add(String(payment._id));
  }
  const groups = new Map();
  for (const row of [...existing, ...rows]) {
    const key = duplicateKey(row);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(String(row._id));
  }
  const conflicts = {};
  for (const row of rows) {
    const id = String(row._id);
    conflicts[id] = [...groups.get(duplicateKey(row))].filter((other) => other !== id).sort();
  }
  const detailIds = new Set(Object.values(conflicts).flat());
  const details = {};
  for (const row of [...existing, ...rows]) {
    if (detailIds.has(String(row._id))) {
      details[String(row._id)] = {
        amountCents: row.amountCents,
        date: row.date.toISOString().slice(0, 10),
        source: row.source,
      };
    }
  }
  return { conflicts, details, alreadySaved: [...saved] };
}

router.post('/check', ah(async (req, res) => {
  const rows = await validateRows(req);
  res.json(await inspectRows(req, rows));
}));

router.post('/commit', ah(async (req, res) => {
  const rows = await validateRows(req);
  const acknowledged = req.body.acknowledged;
  const confirmed = req.body.confirmedDuplicates;
  if (!acknowledged || typeof acknowledged !== 'object' || Array.isArray(acknowledged)) throw httpError(400, 'Review the payments before importing');
  if (!Array.isArray(confirmed) || confirmed.some((id) => typeof id !== 'string')) throw httpError(400, 'Confirm possible duplicates before importing');
  const state = await inspectRows(req, rows);
  for (const row of rows) {
    const id = String(row._id);
    const approved = acknowledged[id];
    if (!Array.isArray(approved) || approved.some((value) => typeof value !== 'string') ||
        JSON.stringify([...approved].sort()) !== JSON.stringify(state.conflicts[id])) {
      throw httpError(409, 'Possible duplicates have changed. Review the payments again.');
    }
    if (state.conflicts[id].length && !confirmed.includes(id)) throw httpError(409, 'Confirm each possible duplicate before importing');
  }
  let saved = 0;
  for (const row of rows) {
    if (state.alreadySaved.includes(String(row._id))) continue;
    try {
      const current = await Contribution.find({
        group: req.group._id, membership: row.membership, category: row.category, voided: false,
      }).lean();
      const conflictIds = [...new Set([...current, ...rows]
        .filter((other) => duplicateKey(other) === duplicateKey(row) && String(other._id) !== String(row._id))
        .map((other) => String(other._id)))].sort();
      if (JSON.stringify(conflictIds) !== JSON.stringify(state.conflicts[String(row._id)])) {
        return res.status(409).json({ error: `Possible duplicates changed after ${saved} new payments were saved. Review the ledger and check this same preview again.` });
      }
      await Contribution.create(row);
      saved += 1;
    } catch (err) {
      console.error('Excel import stopped:', err);
      return res.status(500).json({ error: `Import stopped after confirming ${saved} new payments saved; another may also have saved. Review the ledger and retry this same preview; previously saved rows will not be added again.` });
    }
  }
  res.status(201).json({ saved, alreadySaved: state.alreadySaved.length });
}));

export default router;
