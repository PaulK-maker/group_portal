import { Router } from 'express';
import Organization from '../models/Organization.js';
import Group from '../models/Group.js';
import Membership from '../models/Membership.js';
import { requireAuth, loadMembership, requireRole, isFinance } from '../middleware/auth.js';
import { ah } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth);

// Create an organization + its first group; the creator becomes admin.
// Later: "add a group to an existing organization" for multi-group churches.
router.post('/', ah(async (req, res) => {
  const { orgName, orgType, groupName } = req.body;
  if (!orgName || !groupName) return res.status(400).json({ error: 'Organization and group name are required' });
  const org = await Organization.create({ name: orgName, type: orgType, createdBy: req.userId });
  const group = await Group.create({ organization: org._id, name: groupName });
  await Membership.create({ group: group._id, user: req.userId, role: 'admin' });
  res.status(201).json({ group });
}));

router.get('/:groupId', loadMembership, ah(async (req, res) => {
  const query = Group.findById(req.group._id).populate('organization', 'name type');
  if (isFinance(req)) query.select('+inboundToken');
  const group = await query;
  res.json({ group, myRole: req.membership.role, myMembershipId: req.membership._id });
}));

router.patch('/:groupId/settings', loadMembership, requireRole('admin'), ah(async (req, res) => {
  const { name, membersSeeAll, contributionLabel, categories } = req.body;
  const g = req.group;
  if (name) g.name = name;
  if (typeof membersSeeAll === 'boolean') g.settings.membersSeeAll = membersSeeAll;
  if (contributionLabel) g.settings.contributionLabel = contributionLabel;
  if (Array.isArray(categories) && categories.length) g.settings.categories = categories.map(String);
  await g.save();
  res.json({ group: g });
}));

export default router;
