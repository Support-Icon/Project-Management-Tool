const express = require('express');
const { DateTime } = require('luxon');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const CompanySettings = require('../models/CompanySettings');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

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

const buildPersonStats = ({ user, openTasks, updates, today, dates }) => {
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
};

router.get('/overview', adminOnly, async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const { today, dates, projectIds, timezone } = await getContext(companyId, req.query.days);
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

    const people = users.map((user) =>
      buildPersonStats({ user, openTasks, updates, today, dates })
    );

    res.json({
      timezone,
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

router.get('/personal', async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const { today, dates, projectIds, timezone } = await getContext(companyId, req.query.days);
    const userId = req.user._id;

    const openTasks = await Task.find({
      project: { $in: projectIds },
      assignee: userId,
      column: { $ne: 'done' }
    })
      .populate('project', 'title')
      .select('title assignee column priority dueDate project');

    const allAssigned = await Task.find({
      project: { $in: projectIds },
      assignee: userId
    }).select('_id');

    const updates = await TaskUpdate.find({
      company: companyId,
      author: userId,
      updateDate: { $in: dates }
    })
      .populate({
        path: 'task',
        select: 'title project',
        populate: { path: 'project', select: 'title' }
      })
      .sort({ updateDate: -1, createdAt: -1 });

    const updatedTodaySet = new Set(
      updates.filter((u) => u.updateDate === today).map((u) => u.task?._id?.toString()).filter(Boolean)
    );

    const completedInPeriod = await Task.countDocuments({
      project: { $in: projectIds },
      assignee: userId,
      completedAt: { $gte: DateTime.fromISO(dates[0]).startOf('day').toJSDate() }
    });

    const person = buildPersonStats({
      user: req.user,
      openTasks: openTasks.map((t) => ({ _id: t._id, assignee: t.assignee })),
      updates: updates.map((u) => ({
        author: userId,
        task: u.task?._id,
        updateDate: u.updateDate,
        blockers: u.blockers
      })),
      today,
      dates
    });

    res.json({
      timezone,
      period: { start: dates[0], end: dates[dates.length - 1], days: dates.length },
      summary: {
        openTasks: openTasks.length,
        updatesToday: person.updatesToday,
        missingToday: person.missingToday,
        completedInPeriod,
        assignedTotal: allAssigned.length,
        compliancePercent: person.compliancePercent,
        blockerCount: person.blockerCount
      },
      openTasks: openTasks.map((t) => ({
        _id: t._id,
        title: t.title,
        project: t.project?.title,
        priority: t.priority,
        dueDate: t.dueDate,
        hasTodayUpdate: updatedTodaySet.has(t._id.toString())
      })),
      recentUpdates: updates.filter((u) => u.task).slice(0, 25)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/daily-updates', adminOnly, async (req, res) => {
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
