const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, staffOnly } = require('../middleware/auth');
const { ROLES, canAssignOthers, canSeeAll, creatableRoles, isAdmin, isTeamLead } = require('../utils/roles');

const router = express.Router();

const PUBLIC_FIELDS = 'username email role teamLead createdAt';

const normalizeRole = (role) => (ROLES.includes(role) ? role : null);

const resolveTeamLead = async (teamLeadId, companyId, selfId) => {
  if (!teamLeadId) return { ok: true, value: null };
  if (selfId && String(teamLeadId) === String(selfId)) {
    return { ok: false, message: 'A user cannot be their own team lead' };
  }
  const lead = await User.findOne({ _id: teamLeadId, company: companyId }).select('role');
  if (!lead) return { ok: false, message: 'Team lead not found in your company' };
  if (!['team_lead', 'manager', 'admin'].includes(lead.role)) {
    return { ok: false, message: 'Selected user is not a team lead' };
  }
  return { ok: true, value: lead._id };
};

// Lightweight directory of everyone in the company (for messaging)
router.get('/directory', auth, async (req, res) => {
  try {
    const users = await User.find({ company: req.user.company._id })
      .select(PUBLIC_FIELDS)
      .sort({ username: 1 })
      .lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// People the current user may assign tasks to
router.get('/assignable', auth, async (req, res) => {
  try {
    if (!canAssignOthers(req.user)) {
      return res.json([{ _id: req.user._id, username: req.user.username, role: req.user.role }]);
    }
    const filter = { company: req.user.company._id };
    if (!canSeeAll(req.user) && Array.isArray(req.scopeUserIds)) {
      filter._id = { $in: req.scopeUserIds };
    }
    const users = await User.find(filter).select(PUBLIC_FIELDS).sort({ username: 1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users in same company (admin / manager / team lead)
router.get('/', auth, staffOnly, async (req, res) => {
  try {
    const filter = { company: req.user.company._id };
    if (isTeamLead(req.user) && !canSeeAll(req.user)) {
      filter.$or = [{ _id: req.user._id }, { teamLead: req.user._id }];
    }
    const users = await User.find(filter)
      .select('-password')
      .populate('company', 'name')
      .populate('teamLead', 'username role')
      .sort({ createdAt: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create user — admin/manager/team lead; role options depend on who is creating
router.post('/', auth, staffOnly, async (req, res) => {
  try {
    const { username, password, email, role = 'member', teamLead } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ message: 'Username, email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const safeRole = normalizeRole(role);
    if (!safeRole) return res.status(400).json({ message: 'Invalid role' });
    if (!creatableRoles(req.user).includes(safeRole)) {
      return res.status(403).json({ message: `You cannot create a ${safeRole} account` });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) return res.status(400).json({ message: 'Username already taken' });

    let leadId = teamLead;
    if (isTeamLead(req.user) && safeRole === 'member') {
      leadId = req.user._id;
    }
    const leadCheck = await resolveTeamLead(leadId, req.user.company._id, null);
    if (!leadCheck.ok) return res.status(400).json({ message: leadCheck.message });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: safeRole,
      teamLead: leadCheck.value,
      company: req.user.company._id
    });

    const populated = await User.findById(user._id)
      .select('-password')
      .populate('company', 'name')
      .populate('teamLead', 'username role');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user (admin / manager / team lead)
router.put('/:id', auth, staffOnly, async (req, res) => {
  try {
    const { username, password, email, emailNotifications, role, teamLead } = req.body;
    const updates = {};

    if (username) {
      const conflict = await User.findOne({ username: username.trim(), _id: { $ne: req.params.id } });
      if (conflict) return res.status(400).json({ message: 'Username already taken' });
      updates.username = username.trim();
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Password too short' });
      updates.password = await bcrypt.hash(password, 10);
    }
    if (email !== undefined) updates.email = String(email).trim().toLowerCase();
    if (emailNotifications !== undefined) updates.emailNotifications = Boolean(emailNotifications);
    if (role) {
      const safeRole = normalizeRole(role);
      if (!safeRole) return res.status(400).json({ message: 'Invalid role' });
      if (!creatableRoles(req.user).includes(safeRole) && req.params.id !== req.user._id.toString()) {
        return res.status(403).json({ message: `You cannot assign the ${safeRole} role` });
      }
      if (req.params.id === req.user._id.toString() && isAdmin(req.user) && safeRole !== 'admin') {
        return res.status(400).json({ message: 'You cannot remove your own admin role' });
      }
      updates.role = safeRole;
    }
    if (teamLead !== undefined) {
      const leadCheck = await resolveTeamLead(teamLead, req.user.company._id, req.params.id);
      if (!leadCheck.ok) return res.status(400).json({ message: leadCheck.message });
      updates.teamLead = leadCheck.value;
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company._id },
      updates,
      { new: true }
    ).select('-password').populate('company', 'name').populate('teamLead', 'username role');

    if (!user) return res.status(404).json({ message: 'User not found' });

    // A user demoted from team lead no longer leads anyone
    if (updates.role && updates.role === 'member') {
      await User.updateMany({ teamLead: user._id }, { $set: { teamLead: null } });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete user (admin / manager / team lead)
router.delete('/:id', auth, staffOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const existing = await User.findOne({ _id: req.params.id, company: req.user.company._id });
    if (!existing) return res.status(404).json({ message: 'User not found' });
    if (!canSeeAll(req.user) && existing.role === 'admin') {
      return res.status(403).json({ message: 'Only an admin or manager can remove an admin' });
    }
    if (isTeamLead(req.user) && !canSeeAll(req.user) && String(existing.teamLead || '') !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only remove your own team members' });
    }

    const user = await User.findOneAndDelete({
      _id: req.params.id,
      company: req.user.company._id
    });

    if (!user) return res.status(404).json({ message: 'User not found' });
    await User.updateMany({ teamLead: user._id }, { $set: { teamLead: null } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
