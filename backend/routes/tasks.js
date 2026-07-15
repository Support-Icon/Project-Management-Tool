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
      .populate('dependsOn', 'title column completedAt')
      .sort({ order: 1 });

    const settings = await CompanySettings.findOne({ company: req.user.company._id });
    const today = todayInZone(settings?.digest?.timezone || 'Asia/Kolkata');
    const updatedTaskIds = await TaskUpdate.distinct('task', {
      company: req.user.company._id,
      updateDate: today,
      task: { $in: tasks.map((task) => task._id) }
    });
    const updatedSet = new Set(updatedTaskIds.map(String));

    res.json(tasks.map((task) => {
      const dep = task.dependsOn;
      const waitingOnPredecessor = Boolean(
        dep && dep.column !== 'done' && task.column !== 'done'
      );
      return {
        ...task.toObject(),
        hasTodayUpdate: updatedSet.has(task._id.toString()),
        updateDate: today,
        waitingOnPredecessor,
        canStart: !waitingOnPredecessor
      };
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const validateDependsOn = async (dependsOnId, projectId, selfId) => {
  if (!dependsOnId) return { ok: true, value: null };
  if (selfId && String(dependsOnId) === String(selfId)) {
    return { ok: false, message: 'A task cannot depend on itself' };
  }
  const dep = await Task.findOne({ _id: dependsOnId, project: projectId });
  if (!dep) return { ok: false, message: 'Dependency task not found in this project' };
  return { ok: true, value: dep._id };
};

const unlockDependents = async (completedTaskId) => {
  const dependents = await Task.find({
    dependsOn: completedTaskId,
    column: { $ne: 'done' }
  });
  const now = new Date();
  await Promise.all(dependents.map(async (dependent) => {
    const patch = {};
    if (!dependent.startDate || dependent.startDate > now) {
      patch.startDate = now;
    }
    if (Object.keys(patch).length) {
      await Task.findByIdAndUpdate(dependent._id, patch);
    }
  }));
  return dependents.length;
};

// Create task
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, description, projectId, column, priority, assigneeId,
      dueDate, startDate, dependsOn, tags
    } = req.body;

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

    const depCheck = await validateDependsOn(dependsOn, projectId, null);
    if (!depCheck.ok) return res.status(400).json({ message: depCheck.message });

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
      startDate: startDate || null,
      dependsOn: depCheck.value,
      tags: tags || [],
      createdBy: req.user._id,
      completedAt: column === 'done' ? new Date() : null,
    });

    const populated = await Task.findById(task._id)
      .populate('assignee', 'username email emailNotifications')
      .populate('createdBy', 'username')
      .populate('dependsOn', 'title column completedAt');

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

    const {
      title, description, column, priority, assigneeId,
      dueDate, startDate, dependsOn, tags, order
    } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (column !== undefined) updates.column = column;
    if (column === 'done' && task.column !== 'done') updates.completedAt = new Date();
    if (column !== undefined && column !== 'done' && task.column === 'done') updates.completedAt = null;
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate || null;
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (tags !== undefined) updates.tags = tags;
    if (order !== undefined) updates.order = order;

    if (dependsOn !== undefined) {
      const depCheck = await validateDependsOn(dependsOn, task.project._id, task._id);
      if (!depCheck.ok) return res.status(400).json({ message: depCheck.message });
      updates.dependsOn = depCheck.value;
    }

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

    // Block moving into active work while predecessor is incomplete
    if (column && column !== 'todo' && column !== 'done') {
      const depId = updates.dependsOn !== undefined ? updates.dependsOn : task.dependsOn;
      if (depId) {
        const dep = await Task.findById(depId).select('column title');
        if (dep && dep.column !== 'done') {
          return res.status(400).json({
            message: `Cannot start yet — waiting for "${dep.title}" to be completed first.`
          });
        }
      }
    }

    const updated = await Task.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('assignee', 'username email emailNotifications')
      .populate('createdBy', 'username')
      .populate('dependsOn', 'title column completedAt');

    if (column === 'done' && task.column !== 'done') {
      await unlockDependents(task._id);
    }

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

    const byId = new Map(tasks.map((t) => [t._id.toString(), t]));
    for (const update of updates) {
      const task = byId.get(String(update._id));
      if (!task) continue;
      if (update.column && update.column !== 'todo' && update.column !== 'done' && task.dependsOn) {
        const dep = await Task.findById(task.dependsOn).select('column title');
        if (dep && dep.column !== 'done') {
          return res.status(400).json({
            message: `Cannot start "${task.title}" yet — waiting for "${dep.title}" to complete.`
          });
        }
      }
    }

    const newlyCompleted = [];
    await Promise.all(
      updates.map(async ({ _id, column, order }) => {
        const before = byId.get(String(_id));
        await Task.findByIdAndUpdate(_id, {
          column,
          order,
          completedAt: column === 'done' ? new Date() : null
        });
        if (before && before.column !== 'done' && column === 'done') {
          newlyCompleted.push(_id);
        }
      })
    );

    for (const id of newlyCompleted) {
      await unlockDependents(id);
    }

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
