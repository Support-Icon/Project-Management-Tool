const express = require('express');
const { DateTime } = require('luxon');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { canSeeAll, isTeamLead, getTeamMemberIds } = require('../utils/roles');
const { IST } = require('../utils/duration');

const router = express.Router();
router.use(auth);

const todayIst = () => DateTime.now().setZone(IST).toISODate();

const hoursBetween = (start, end, breaks = []) => {
  if (!start) return null;
  const stop = end ? new Date(end) : new Date();
  let ms = stop.getTime() - new Date(start).getTime();
  for (const b of breaks || []) {
    if (!b.startAt) continue;
    const bEnd = b.endAt ? new Date(b.endAt) : stop;
    ms -= Math.max(0, bEnd.getTime() - new Date(b.startAt).getTime());
  }
  if (ms <= 0) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
};

const breakHours = (breaks = [], fallbackEnd) => {
  let ms = 0;
  for (const b of breaks || []) {
    if (!b.startAt) continue;
    const bEnd = b.endAt ? new Date(b.endAt) : (fallbackEnd || new Date());
    ms += Math.max(0, bEnd.getTime() - new Date(b.startAt).getTime());
  }
  return Math.round((ms / 3600000) * 100) / 100;
};

const isOnBreak = (row) => (row?.breaks || []).some((b) => b.startAt && !b.endAt);

const closeOpenBreak = (row, at = new Date()) => {
  (row.breaks || []).forEach((b) => {
    if (b.startAt && !b.endAt) b.endAt = at;
  });
};

const getOrCreate = async (companyId, userId, date) => {
  const existing = await Attendance.findOne({ company: companyId, user: userId, date });
  if (existing) return existing;
  return Attendance.create({ company: companyId, user: userId, date, status: 'working' });
};

const leaveForDate = async (companyId, userId, date) => {
  const row = await LeaveRequest.findOne({
    company: companyId,
    user: userId,
    status: { $in: ['approved', 'pending'] },
    startDate: { $lte: date },
    endDate: { $gte: date }
  }).sort({ status: 1 }).lean();
  if (!row) return { status: null, requestId: null };
  return { status: row.status, requestId: row._id };
};

const serialize = (row, leave = { status: null, requestId: null }) => {
  const data = row?.toObject ? row.toObject() : (row || {});
  return {
    date: data.date,
    status: data.status || 'working',
    startAt: data.startAt || null,
    endAt: data.endAt || null,
    breaks: data.breaks || [],
    onBreak: isOnBreak(data),
    hours: hoursBetween(data.startAt, data.endAt, data.breaks),
    breakHours: breakHours(data.breaks, data.endAt),
    leave
  };
};

router.get('/today', async (req, res) => {
  try {
    const date = todayIst();
    const row = await Attendance.findOne({
      company: req.user.company._id,
      user: req.user._id,
      date
    });
    const leave = await leaveForDate(req.user.company._id, req.user._id, date);
    res.json(serialize(row || { date, status: 'working', startAt: null, endAt: null, breaks: [] }, leave));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const date = todayIst();
    const leave = await leaveForDate(req.user.company._id, req.user._id, date);
    if (leave.status === 'approved') {
      return res.status(400).json({ message: 'You are on approved leave today' });
    }
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    if (row.status === 'leave' || row.status === 'off') {
      return res.status(400).json({ message: 'You are on leave / off today' });
    }
    if (row.startAt) {
      return res.json(serialize(row, leave));
    }
    row.status = 'working';
    row.startAt = new Date();
    await row.save();
    res.json(serialize(row, leave));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/end', async (req, res) => {
  try {
    const date = todayIst();
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    if (!row.startAt) return res.status(400).json({ message: 'Start the day first' });
    if (row.endAt) {
      const leave = await leaveForDate(req.user.company._id, req.user._id, date);
      return res.json(serialize(row, leave));
    }
    closeOpenBreak(row);
    row.endAt = new Date();
    await row.save();
    const leave = await leaveForDate(req.user.company._id, req.user._id, date);
    res.json(serialize(row, leave));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/break/start', async (req, res) => {
  try {
    const date = todayIst();
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    if (!row.startAt || row.endAt) {
      return res.status(400).json({ message: 'Start your day first' });
    }
    if (isOnBreak(row)) {
      const leave = await leaveForDate(req.user.company._id, req.user._id, date);
      return res.json(serialize(row, leave));
    }
    row.breaks = row.breaks || [];
    row.breaks.push({ startAt: new Date(), endAt: null });
    await row.save();
    const leave = await leaveForDate(req.user.company._id, req.user._id, date);
    res.json(serialize(row, leave));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/break/end', async (req, res) => {
  try {
    const date = todayIst();
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    if (!isOnBreak(row)) {
      return res.status(400).json({ message: 'You are not on a break' });
    }
    closeOpenBreak(row);
    await row.save();
    const leave = await leaveForDate(req.user.company._id, req.user._id, date);
    res.json(serialize(row, leave));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['working', 'off'].includes(status)) {
      return res.status(400).json({ message: 'Status must be working or off. Request leave from the Leave page.' });
    }
    const date = todayIst();
    const leave = await leaveForDate(req.user.company._id, req.user._id, date);
    if (leave.status === 'approved') {
      return res.status(400).json({ message: 'Approved leave cannot be changed here' });
    }
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    row.status = status;
    if (status !== 'working') {
      closeOpenBreak(row);
      row.startAt = null;
      row.endAt = null;
      row.breaks = [];
    }
    await row.save();
    res.json(serialize(row, leave));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    if (!canSeeAll(req.user) && !isTeamLead(req.user)) {
      return res.status(403).json({ message: 'Attendance view is for admin, manager, or team lead' });
    }
    const date = String(req.query.date || todayIst());
    const companyId = req.user.company._id;
    let people = await User.find({ company: companyId }).select('username role').sort({ username: 1 }).lean();
    if (isTeamLead(req.user) && !canSeeAll(req.user)) {
      const memberIds = await getTeamMemberIds(req.user._id, companyId);
      const allowed = new Set(memberIds.map((id) => id.toString()));
      allowed.add(req.user._id.toString());
      people = people.filter((p) => allowed.has(p._id.toString()));
    }
    const rows = await Attendance.find({
      company: companyId,
      date,
      user: { $in: people.map((p) => p._id) }
    }).lean();
    const leaves = await LeaveRequest.find({
      company: companyId,
      status: { $in: ['approved', 'pending'] },
      startDate: { $lte: date },
      endDate: { $gte: date },
      user: { $in: people.map((p) => p._id) }
    }).lean();
    const leaveByUser = new Map();
    leaves.forEach((l) => {
      const key = l.user.toString();
      const prev = leaveByUser.get(key);
      if (!prev || l.status === 'approved') leaveByUser.set(key, l);
    });
    const byUser = new Map(rows.map((r) => [r.user.toString(), r]));
    res.json({
      date,
      people: people.map((person) => {
        const row = byUser.get(person._id.toString());
        const leave = leaveByUser.get(person._id.toString());
        const status = leave?.status === 'approved' ? 'leave' : (row?.status || 'working');
        return {
          userId: person._id,
          username: person.username,
          role: person.role,
          status,
          startAt: row?.startAt || null,
          endAt: row?.endAt || null,
          onBreak: isOnBreak(row),
          hours: hoursBetween(row?.startAt, row?.endAt, row?.breaks),
          breakHours: breakHours(row?.breaks, row?.endAt),
          leaveStatus: leave?.status || null
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
