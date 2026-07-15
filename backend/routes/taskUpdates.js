const express = require('express');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const CompanySettings = require('../models/CompanySettings');
const { auth } = require('../middleware/auth');
const { userCanAccessTask } = require('../utils/taskAccess');
const { todayInZone } = require('../utils/companyTime');

const router = express.Router();

const loadCompanyTask = async (taskId, companyId) => {
  const task = await Task.findById(taskId)
    .populate({ path: 'project', select: 'company title' })
    .populate('assignee', 'username email');
  if (!task || task.project.company.toString() !== companyId.toString()) return null;
  return task;
};

const getToday = async (companyId) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  return todayInZone(settings?.digest?.timezone || 'Asia/Kolkata');
};

router.get('/pending/mine', auth, async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const today = await getToday(companyId);
    const tasks = await Task.find({
      assignee: req.user._id,
      column: 'inprogress'
    }).populate({
      path: 'project',
      match: { company: companyId },
      select: 'title company'
    });

    const companyTasks = tasks.filter((task) => task.project);
    const updatedTaskIds = await TaskUpdate.distinct('task', {
      company: companyId,
      author: req.user._id,
      updateDate: today,
      task: { $in: companyTasks.map((task) => task._id) }
    });
    const updatedSet = new Set(updatedTaskIds.map(String));

    res.json({
      date: today,
      tasks: companyTasks
        .filter((task) => !updatedSet.has(task._id.toString()))
        .map((task) => ({
          _id: task._id,
          title: task.title,
          project: task.project,
          priority: task.priority,
          dueDate: task.dueDate,
          column: task.column
        }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:taskId', auth, async (req, res) => {
  try {
    const task = await loadCompanyTask(req.params.taskId, req.user.company._id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!userCanAccessTask(req.user, task)) {
      return res.status(403).json({ message: 'You cannot view updates for this task' });
    }

    const updates = await TaskUpdate.find({
      task: task._id,
      company: req.user.company._id
    }).populate('author', 'username').sort({ updateDate: -1, createdAt: -1 });

    const today = await getToday(req.user.company._id);
    res.json({ taskStatus: task.column, today, updates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:taskId', auth, async (req, res) => {
  try {
    const task = await loadCompanyTask(req.params.taskId, req.user.company._id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const assigneeId = task.assignee?._id?.toString();
    if (!assigneeId || assigneeId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the assigned person can add a daily update' });
    }
    if (task.column !== 'inprogress') {
      return res.status(400).json({
        message: 'Daily updates are only for In Progress tasks. Move the task to In Progress first.'
      });
    }

    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ message: 'Daily update is required' });

    const today = await getToday(req.user.company._id);
    const update = await TaskUpdate.findOneAndUpdate(
      { task: task._id, updateDate: today },
      {
        $set: {
          company: req.user.company._id,
          author: req.user._id,
          content,
          progressPercent: Number(req.body.progressPercent || 0),
          blockers: String(req.body.blockers || '').trim(),
          nextPlan: String(req.body.nextPlan || '').trim(),
          createdAt: new Date()
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).populate('author', 'username');

    await Task.findByIdAndUpdate(task._id, { lastUpdateAt: new Date() });
    res.status(201).json(update);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Today’s update already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
