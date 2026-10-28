const express = require('express');
const { DateTime } = require('luxon');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { canSeeAll, isTeamLead, getTeamMemberIds } = require('../utils/roles');
const { IST } = require('../utils/duration');

const router = express.Router();
router.use(auth);

const todayIst = () => DateTime.now().setZone(IST).toISODate();

const hoursBetween = (start, end) => {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
};

const getOrCreate = async (companyId, userId, date) => {
  const existing = await Attendance.findOne({ company: companyId, user: userId, date });
  if (existing) return existing;
  return Attendance.create({ company: companyId, user: userId, date, status: 'working' });
};

router.get('/today', async (req, res) => {
  try {
    const date = todayIst();
    const row = await Attendance.findOne({
      company: req.user.company._id,
      user: req.user._id,
      date
    });
    res.json(row || { date, status: 'working', startAt: null, endAt: null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const date = todayIst();
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    if (row.status === 'leave' || row.status === 'off') {
      return res.status(400).json({ message: 'You are on leave / off today' });
    }
    if (row.startAt) return res.json(row);
    row.status = 'working';
    row.startAt = new Date();
    await row.save();
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/end', async (req, res) => {
  try {
    const date = todayIst();
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    if (!row.startAt) return res.status(400).json({ message: 'Start the day first' });
    if (row.endAt) return res.json(row);
    row.endAt = new Date();
    await row.save();
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!Attendance.STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Status must be working, leave, or off' });
    }
    const date = todayIst();
    const row = await getOrCreate(req.user.company._id, req.user._id, date);
    row.status = status;
    if (status !== 'working') {
      row.startAt = null;
      row.endAt = null;
    }
    await row.save();
    res.json(row);
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
    const byUser = new Map(rows.map((r) => [r.user.toString(), r]));
    res.json({
      date,
      people: people.map((person) => {
        const row = byUser.get(person._id.toString());
        return {
          userId: person._id,
          username: person.username,
          role: person.role,
          status: row?.status || 'working',
          startAt: row?.startAt || null,
          endAt: row?.endAt || null,
          hours: hoursBetween(row?.startAt, row?.endAt)
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
