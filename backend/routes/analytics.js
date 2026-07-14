const express = require('express');
const { DateTime } = require('luxon');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const CompanySettings = require('../models/CompanySettings');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(auth, adminOnly);

const getContext = async (companyId, daysParam) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  const timezone = settings?.digest?.timezone || 'Asia/Kolkata';
  const days = Math.min(Math.max(Number(daysParam) || 7, 1), 90);
  const today = DateTime.now().setZone(timezone).startOf('day');
  const start = today.minus({ days: days - 1 });
  const dates = Array.from({ length: days }, (_, index) =>
    start.plus({ days: index }).toISODate());
  const projectIds = await Project.find({ company: companyId }).distinct('_id');
  return { timezone, today: today.toISODate(), dates, projectIds };
};

router.get('/overview', async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const { today, dates, projectIds } = await getContext(companyId, req.query.days);
    const users = await User.find({ company: companyId }).select('username email role');

    const openTasks = await Task.find({
      project: { $in: projectIds },
      assignee: { $ne: null },
      column: { $ne: 'done' }
    }).select('assignee');

    const updates = await TaskUpdate.find({
      company: companyId,
      updateDate: { $in: dates }
    }).select('author task updateDate progressPercent blockers');

    const updatesToday = updates.filter((update) => update.updateDate === today);
    const updatedTodaySet = new Set(updatesToday.map((update) => update.task.toString()));
    const missingToday = openTasks.filter((task) => !updatedTodaySet.has(task._id.toString())).length;

    const completedInPeriod = await Task.countDocuments({
      project: { $in: projectIds },
      completedAt: { $gte: DateTime.fromISO(dates[0]).startOf('day').toJSDate() }
    });

    const people = users.map((user) => {
      const userId = user._id.toString();
      const assignedOpenTasks = openTasks.filter((task) => task.assignee?.toString() === userId);
      const userUpdates = updates.filter((update) => update.author.toString() === userId);
      const userTodayTaskIds = new Set(
        userUpdates.filter((update) => update.updateDate === today).map((update) => update.task.toString())
      );
      const missing = assignedOpenTasks.filter((task) => !userTodayTaskIds.has(task._id.toString())).length;
      const daysUpdated = new Set(userUpdates.map((update) => update.updateDate)).size;

      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        assignedOpen: assignedOpenTasks.length,
        updatesToday: userUpdates.filter((update) => update.updateDate === today).length,
        missingToday: missing,
        updatesInPeriod: userUpdates.length,
        compliancePercent: Math.round((daysUpdated / dates.length) * 100),
        blockerCount: userUpdates.filter((update) => update.blockers).length
      };
    });

    res.json({
      timezone: (await CompanySettings.findOne({ company: companyId }))?.digest?.timezone || 'Asia/Kolkata',
      period: { start: dates[0], end: dates[dates.length - 1], days: dates.length },
      summary: {
        openTasks: openTasks.length,
        updatesToday: updatesToday.length,
        missingToday,
        completedInPeriod,
        activePeople: people.filter((person) => person.assignedOpen > 0).length
      },
      people
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/daily-updates', async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const { dates } = await getContext(companyId, req.query.days);
    const updates = await TaskUpdate.find({
      company: companyId,
      updateDate: { $in: dates }
    })
      .populate('author', 'username')
      .populate({
        path: 'task',
        select: 'title project',
        populate: { path: 'project', select: 'title' }
      })
      .sort({ updateDate: -1, createdAt: -1 });

    res.json(updates.filter((update) => update.task && update.author));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
