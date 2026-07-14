const express = require('express');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const Project = require('../models/Project');
const User = require('../models/User');
const CompanySettings = require('../models/CompanySettings');
const { auth } = require('../middleware/auth');
const { getTaskFilterForUser, userCanAccessTask, userCanAccessProject } = require('../utils/taskAccess');
const { sendAssignmentEmail } = require('../services/emailService');
const { todayInZone } = require('../utils/companyTime');

const router = express.Router();

const verifyProject = async (projectId, companyId, user) => {
  const project = await Project.findOne({ _id: projectId, company: companyId });
  if (!project) return null;
  if (!(await userCanAccessProject(user, project._id))) return null;
  return project;
};

// Get tasks for a project (admin: all; member: only assigned to them)
router.get('/:projectId', auth, async (req, res) => {
  try {
    const project = await verifyProject(req.params.projectId, req.user.company._id, req.user);
    if (!project) {
      return res.status(req.user.role === 'admin' ? 404 : 403).json({
        message: req.user.role === 'admin' ? 'Project not found' : 'You do not have access to this project',
      });
    }

    const tasks = await Task.find({
      project: req.params.projectId,
      ...getTaskFilterForUser(req.user, req.query.mineOnly),
    })
      .populate('assignee', 'username')
      .populate('createdBy', 'username')
      .sort({ order: 1 });

    const settings = await CompanySettings.findOne({ company: req.user.company._id });
    const today = todayInZone(settings?.digest?.timezone || 'Asia/Kolkata');
    const updatedTaskIds = await TaskUpdate.distinct('task', {
      company: req.user.company._id,
      updateDate: today,
      task: { $in: tasks.map((task) => task._id) }
    });
    const updatedSet = new Set(updatedTaskIds.map(String));

    res.json(tasks.map((task) => ({
      ...task.toObject(),
      hasTodayUpdate: updatedSet.has(task._id.toString()),
      updateDate: today
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create task
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, projectId, column, priority, assigneeId, dueDate, tags } = req.body;

    if (!title || !projectId || !column) {
      return res.status(400).json({ message: 'Title, projectId and column are required' });
    }

    const project = await verifyProject(projectId, req.user.company._id, req.user);
    if (!project) {
      return res.status(req.user.role === 'admin' ? 404 : 403).json({
        message: req.user.role === 'admin' ? 'Project not found' : 'You do not have access to this project',
      });
    }

    const isAdmin = req.user.role === 'admin';
    const assignee = isAdmin ? (assigneeId || null) : req.user._id;
    let assigneeUser = null;
    if (assignee) {
      assigneeUser = await User.findOne({ _id: assignee, company: req.user.company._id });
      if (!assigneeUser) {
        return res.status(400).json({ message: 'Assignee must belong to your company' });
      }
    }

    const maxTask = await Task.findOne({ project: projectId, column }).sort({ order: -1 });
    const order = maxTask ? maxTask.order + 1 : 0;

    const task = await Task.create({
      title: title.trim(),
      description: description?.trim() || '',
      project: projectId,
      column,
      order,
      priority: priority || 'medium',
      assignee,
      dueDate: dueDate || null,
      tags: tags || [],
      createdBy: req.user._id,
      completedAt: column === 'done' ? new Date() : null,
    });

    const populated = await Task.findById(task._id)
      .populate('assignee', 'username email emailNotifications')
      .populate('createdBy', 'username');

    res.status(201).json(populated);
    if (assigneeUser) {
      sendAssignmentEmail({
        companyId: req.user.company._id,
        assignee: assigneeUser,
        task,
        project,
        assignedBy: req.user
      }).catch((error) => console.error('Assignment email failed:', error.message));
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update task
router.put('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate({ path: 'project', select: 'company title' });
    if (!task || task.project.company.toString() !== req.user.company._id.toString()) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (!userCanAccessTask(req.user, task)) {
      return res.status(403).json({ message: 'You can only edit your own tasks' });
    }

    const { title, description, column, priority, assigneeId, dueDate, tags, order } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (column !== undefined) updates.column = column;
    if (column === 'done' && task.column !== 'done') updates.completedAt = new Date();
    if (column !== undefined && column !== 'done' && task.column === 'done') updates.completedAt = null;
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate || null;
    if (tags !== undefined) updates.tags = tags;
    if (order !== undefined) updates.order = order;

    if (req.user.role === 'admin' && assigneeId !== undefined) {
      if (assigneeId) {
        const validAssignee = await User.findOne({
          _id: assigneeId,
          company: req.user.company._id
        });
        if (!validAssignee) {
          return res.status(400).json({ message: 'Assignee must belong to your company' });
        }
      }
      updates.assignee = assigneeId || null;
    }

    const updated = await Task.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('assignee', 'username email emailNotifications')
      .populate('createdBy', 'username');

    res.json(updated);
    const oldAssigneeId = task.assignee?.toString() || '';
    const newAssigneeId = updated.assignee?._id?.toString() || '';
    if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
      sendAssignmentEmail({
        companyId: req.user.company._id,
        assignee: updated.assignee,
        task: updated,
        project: task.project,
        assignedBy: req.user
      }).catch((error) => console.error('Assignment email failed:', error.message));
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk reorder tasks after drag-and-drop
router.post('/reorder', auth, async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'updates array required' });
    }

    const taskIds = updates.map((u) => u._id);
    const tasks = await Task.find({ _id: { $in: taskIds } }).populate({
      path: 'project',
      select: 'company',
    });

    if (tasks.length !== taskIds.length) {
      return res.status(404).json({ message: 'One or more tasks not found' });
    }

    const companyId = req.user.company._id.toString();
    for (const task of tasks) {
      if (task.project.company.toString() !== companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (!userCanAccessTask(req.user, task)) {
        return res.status(403).json({ message: 'You can only reorder your own tasks' });
      }
    }

    await Promise.all(
      updates.map(({ _id, column, order }) => Task.findByIdAndUpdate(
        _id,
        {
          column,
          order,
          completedAt: column === 'done' ? new Date() : null
        }
      ))
    );

    res.json({ message: 'Tasks reordered' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate({ path: 'project', select: 'company' });
    if (!task || task.project.company.toString() !== req.user.company._id.toString()) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (!userCanAccessTask(req.user, task)) {
      return res.status(403).json({ message: 'You can only delete your own tasks' });
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
