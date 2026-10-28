const express = require('express');
const { DateTime } = require('luxon');
const LeaveRequest = require('../models/LeaveRequest');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { canSeeAll, isTeamLead, getTeamMemberIds } = require('../utils/roles');
const { IST } = require('../utils/duration');
const { notifyLeaveRequested, notifyLeaveDecision } = require('../services/notificationService');

const router = express.Router();
router.use(auth);

const todayIst = () => DateTime.now().setZone(IST).toISODate();

const datesBetween = (startDate, endDate) => {
  let cursor = DateTime.fromISO(startDate, { zone: IST });
  const last = DateTime.fromISO(endDate, { zone: IST });
  const out = [];
  while (cursor.isValid && last.isValid && cursor <= last) {
    out.push(cursor.toISODate());
    cursor = cursor.plus({ days: 1 });
    if (out.length > 31) break;
  }
  return out;
};

const canReview = async (actor, targetUserId, companyId) => {
  if (canSeeAll(actor)) return true;
  if (isTeamLead(actor)) {
    const ids = await getTeamMemberIds(actor._id, companyId);
    return ids.map((id) => id.toString()).includes(String(targetUserId));
  }
  return false;
};

const reviewerIdsFor = async (requester, companyId) => {
  const leaders = await User.find({
    company: companyId,
    role: { $in: ['admin', 'manager'] }
  }).select('_id').lean();
  const ids = leaders.map((u) => u._id);
  if (requester.teamLead) ids.push(requester.teamLead);
  return [...new Set(ids.map((id) => id.toString()))];
};

const applyApprovedLeave = async (companyId, userId, startDate, endDate) => {
  const dates = datesBetween(startDate, endDate);
  await Promise.all(dates.map(async (date) => {
    await Attendance.findOneAndUpdate(
      { company: companyId, user: userId, date },
      {
        $set: { status: 'leave', startAt: null, endAt: null, breaks: [] },
        $setOnInsert: { company: companyId, user: userId, date }
      },
      { upsert: true }
    );
  }));
};

router.get('/', async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const filter = { company: companyId };
    const mine = String(req.query.mine || '') === 'true';
    if (mine || (!canSeeAll(req.user) && !isTeamLead(req.user))) {
      filter.user = req.user._id;
    } else if (isTeamLead(req.user) && !canSeeAll(req.user)) {
      const memberIds = await getTeamMemberIds(req.user._id, companyId);
      filter.user = { $in: [req.user._id, ...memberIds] };
    }
    if (req.query.status) filter.status = req.query.status;
    const rows = await LeaveRequest.find(filter)
      .populate('user', 'username role teamLead')
      .populate('reviewedBy', 'username role')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const startDate = String(req.body.startDate || '').slice(0, 10);
    const endDate = String(req.body.endDate || startDate).slice(0, 10);
    const reason = String(req.body.reason || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ message: 'End date cannot be before start date' });
    }
    const span = datesBetween(startDate, endDate);
    if (!span.length) return res.status(400).json({ message: 'Invalid date range' });
    if (span.length > 31) return res.status(400).json({ message: 'Leave cannot exceed 31 days' });

    const overlap = await LeaveRequest.findOne({
      company: req.user.company._id,
      user: req.user._id,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    });
    if (overlap) {
      return res.status(400).json({ message: 'You already have leave covering these dates' });
    }

    const row = await LeaveRequest.create({
      company: req.user.company._id,
      user: req.user._id,
      startDate,
      endDate,
      reason
    });

    const reviewers = await reviewerIdsFor(req.user, req.user.company._id);
    await notifyLeaveRequested({
      companyId: req.user.company._id,
      request: row,
      requester: req.user,
      reviewerIds: reviewers.filter((id) => id !== req.user._id.toString())
    });

    const populated = await LeaveRequest.findById(row._id)
      .populate('user', 'username role')
      .lean();
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const row = await LeaveRequest.findOne({
      _id: req.params.id,
      company: req.user.company._id,
      user: req.user._id
    });
    if (!row) return res.status(404).json({ message: 'Leave request not found' });
    if (row.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be cancelled' });
    }
    row.status = 'cancelled';
    await row.save();
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/review', async (req, res) => {
  try {
    const decision = String(req.body.decision || '').toLowerCase();
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be approved or rejected' });
    }
    const row = await LeaveRequest.findOne({
      _id: req.params.id,
      company: req.user.company._id
    }).populate('user', 'username role teamLead');
    if (!row) return res.status(404).json({ message: 'Leave request not found' });
    if (row.status !== 'pending') {
      return res.status(400).json({ message: 'This request was already reviewed' });
    }
    if (row.user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot review your own leave' });
    }
    const allowed = await canReview(req.user, row.user._id, req.user.company._id);
    if (!allowed) return res.status(403).json({ message: 'You cannot review this request' });

    row.status = decision;
    row.reviewedBy = req.user._id;
    row.reviewedAt = new Date();
    row.reviewNote = String(req.body.note || '').trim();
    await row.save();

    if (decision === 'approved') {
      await applyApprovedLeave(req.user.company._id, row.user._id, row.startDate, row.endDate);
    }

    await notifyLeaveDecision({
      companyId: req.user.company._id,
      request: row,
      memberId: row.user._id,
      approved: decision === 'approved',
      reviewer: req.user
    });

    const populated = await LeaveRequest.findById(row._id)
      .populate('user', 'username role')
      .populate('reviewedBy', 'username role')
      .lean();
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/today', async (req, res) => {
  try {
    const date = todayIst();
    const row = await LeaveRequest.findOne({
      company: req.user.company._id,
      user: req.user._id,
      status: { $in: ['approved', 'pending'] },
      startDate: { $lte: date },
      endDate: { $gte: date }
    }).sort({ status: 1 }).lean();
    res.json(row || null);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
