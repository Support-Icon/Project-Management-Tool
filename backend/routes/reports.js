const express = require('express');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { auth, adminOnly } = require('../middleware/auth');
const { sendCsv } = require('../utils/csv');
const { getDateRange, taskDateFilter, formatDate, formatDateTime } = require('../utils/dateRange');

const router = express.Router();

router.use(auth, adminOnly);

const parseRange = (req, res) => {
  const { period = 'all', startDate, endDate } = req.query;
  const result = getDateRange(period, startDate, endDate);
  if (result?.error) {
    res.status(400).json({ message: result.error });
    return null;
  }
  return result;
};

const periodLabel = (period, range) => {
  if (!range) return 'all-time';
  if (period === 'weekly') return 'weekly';
  if (period === 'monthly') return 'monthly';
  return `${formatDate(range.start)}_to_${formatDate(range.end)}`;
};

// GET /api/reports/users?period=weekly|monthly|custom|all&startDate=&endDate=
router.get('/users', async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (range === null && res.headersSent) return;

    const companyId = req.user.company._id;
    const users = await User.find({ company: companyId }).select('-password').sort({ createdAt: 1 });
    const dateFilter = taskDateFilter(range);

    const projects = await Project.find({ company: companyId });
    const projectIds = projects.map((p) => p._id);

    const rows = await Promise.all(
      users.map(async (u) => {
        const baseFilter = { project: { $in: projectIds }, assignee: u._id, ...dateFilter };
        const assigned = await Task.countDocuments(baseFilter);
        const completed = await Task.countDocuments({ ...baseFilter, column: 'done' });
        const inProgress = await Task.countDocuments({ ...baseFilter, column: 'inprogress' });
        const created = await Task.countDocuments({
          project: { $in: projectIds },
          createdBy: u._id,
          ...dateFilter,
        });

        return [
          u.username,
          u.role,
          formatDate(u.createdAt),
          assigned,
          completed,
          inProgress,
          created,
        ];
      })
    );

    const label = periodLabel(req.query.period, range);
    sendCsv(
      res,
      `users-report_${label}.csv`,
      ['Username', 'Role', 'Joined', 'Tasks Assigned', 'Tasks Completed', 'In Progress', 'Tasks Created'],
      rows
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/reports/projects?period=...
router.get('/projects', async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (range === null && res.headersSent) return;

    const companyId = req.user.company._id;
    const projects = await Project.find({ company: companyId })
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });

    const dateFilter = taskDateFilter(range);

    const rows = await Promise.all(
      projects.map(async (p) => {
        const baseFilter = { project: p._id, ...dateFilter };
        const total = await Task.countDocuments(baseFilter);
        const todo = await Task.countDocuments({ ...baseFilter, column: 'todo' });
        const inProgress = await Task.countDocuments({ ...baseFilter, column: 'inprogress' });
        const review = await Task.countDocuments({ ...baseFilter, column: 'review' });
        const done = await Task.countDocuments({ ...baseFilter, column: 'done' });

        return [
          p.title,
          p.description || '',
          p.createdBy?.username || '',
          formatDate(p.createdAt),
          total,
          todo,
          inProgress,
          review,
          done,
        ];
      })
    );

    const label = periodLabel(req.query.period, range);
    sendCsv(
      res,
      `projects-report_${label}.csv`,
      [
        'Project',
        'Description',
        'Created By',
        'Created Date',
        'Total Tasks',
        'To Do',
        'In Progress',
        'Review',
        'Done',
      ],
      rows
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/reports/user/:userId?period=...
router.get('/user/:userId', async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (range === null && res.headersSent) return;

    const companyId = req.user.company._id;
    const user = await User.findOne({ _id: req.params.userId, company: companyId }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const projects = await Project.find({ company: companyId });
    const projectIds = projects.map((p) => p._id);
    const projectMap = Object.fromEntries(projects.map((p) => [p._id.toString(), p.title]));

    const dateFilter = taskDateFilter(range);

    const tasks = await Task.find({
      project: { $in: projectIds },
      $or: [{ assignee: user._id }, { createdBy: user._id }],
      ...dateFilter,
    })
      .populate('assignee', 'username')
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });

    const rows = tasks.map((t) => [
      user.username,
      projectMap[t.project.toString()] || '',
      t.title,
      t.description || '',
      t.column,
      t.priority,
      t.assignee?.username || 'Unassigned',
      t.createdBy?.username || '',
      formatDate(t.dueDate),
      (t.tags || []).join('; '),
      formatDateTime(t.createdAt),
    ]);

    const label = periodLabel(req.query.period, range);
    sendCsv(
      res,
      `user-${user.username}_tasks_${label}.csv`,
      [
        'User',
        'Project',
        'Task Title',
        'Description',
        'Column',
        'Priority',
        'Assignee',
        'Created By',
        'Due Date',
        'Tags',
        'Created At',
      ],
      rows
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/reports/project/:projectId?period=...
router.get('/project/:projectId', async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (range === null && res.headersSent) return;

    const companyId = req.user.company._id;
    const project = await Project.findOne({ _id: req.params.projectId, company: companyId });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const dateFilter = taskDateFilter(range);

    const tasks = await Task.find({ project: project._id, ...dateFilter })
      .populate('assignee', 'username')
      .populate('createdBy', 'username')
      .sort({ column: 1, order: 1 });

    const rows = tasks.map((t) => [
      project.title,
      t.title,
      t.description || '',
      t.column,
      t.priority,
      t.assignee?.username || 'Unassigned',
      t.createdBy?.username || '',
      formatDate(t.dueDate),
      (t.tags || []).join('; '),
      formatDateTime(t.createdAt),
    ]);

    const safeName = project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const label = periodLabel(req.query.period, range);
    sendCsv(
      res,
      `project-${safeName}_tasks_${label}.csv`,
      [
        'Project',
        'Task Title',
        'Description',
        'Column',
        'Priority',
        'Assignee',
        'Created By',
        'Due Date',
        'Tags',
        'Created At',
      ],
      rows
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
