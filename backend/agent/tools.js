const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const User = require('../models/User');
const CompanySettings = require('../models/CompanySettings');
const { todayInZone } = require('../utils/companyTime');
const { sendAssignmentEmail } = require('../services/emailService');

const getToday = async (companyId) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  return todayInZone(settings?.digest?.timezone || 'Asia/Kolkata');
};

const buildAgentTools = (actor) => {
  const companyId = actor.company._id;
  const isAdmin = actor.role === 'admin';

  const listProjects = tool(
    async () => {
      let filter = { company: companyId };
      if (!isAdmin) {
        const projectIds = await Task.distinct('project', {
          assignee: actor._id,
          column: { $ne: 'done' }
        });
        const more = await Task.distinct('project', { assignee: actor._id });
        filter._id = { $in: [...new Set([...projectIds, ...more].map(String))] };
      }
      const projects = await Project.find(filter).select('title description createdAt').sort({ createdAt: -1 }).limit(30);
      return JSON.stringify(projects.map((p) => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description
      })));
    },
    {
      name: 'list_projects',
      description: 'List projects visible to the current user.',
      schema: z.object({
        reason: z.string().optional().describe('Optional reason for listing projects')
      })
    }
  );

  const listUsers = tool(
    async () => {
      if (!isAdmin) return JSON.stringify({ error: 'Only admins can list team users.' });
      const users = await User.find({ company: companyId }).select('username email role');
      return JSON.stringify(users.map((u) => ({
        id: u._id.toString(),
        username: u.username,
        email: u.email,
        role: u.role
      })));
    },
    {
      name: 'list_users',
      description: 'Admin only. List team members for assigning tasks.',
      schema: z.object({
        reason: z.string().optional().describe('Optional reason for listing users')
      })
    }
  );

  const createProject = tool(
    async ({ title, description }) => {
      if (!isAdmin) return JSON.stringify({ error: 'Only admins can create projects.' });
      const project = await Project.create({
        title: title.trim(),
        description: (description || '').trim(),
        company: companyId,
        createdBy: actor._id
      });
      return JSON.stringify({
        success: true,
        id: project._id.toString(),
        title: project.title,
        message: `Project "${project.title}" created.`
      });
    },
    {
      name: 'create_project',
      description: 'Admin only. Create a new project with default kanban columns.',
      schema: z.object({
        title: z.string().min(1),
        description: z.string().optional().default('')
      })
    }
  );

  const createAndAssignTask = tool(
    async ({ projectId, title, description, assigneeUsername, column, priority }) => {
      const project = await Project.findOne({ _id: projectId, company: companyId });
      if (!project) return JSON.stringify({ error: 'Project not found.' });

      let assigneeId = actor._id;
      if (isAdmin && assigneeUsername) {
        const assignee = await User.findOne({
          company: companyId,
          username: assigneeUsername.trim()
        });
        if (!assignee) return JSON.stringify({ error: `User "${assigneeUsername}" not found.` });
        assigneeId = assignee._id;
      } else if (!isAdmin) {
        assigneeId = actor._id;
      }

      const col = column || 'todo';
      const maxTask = await Task.findOne({ project: projectId, column: col }).sort({ order: -1 });
      const task = await Task.create({
        title: title.trim(),
        description: (description || '').trim(),
        project: projectId,
        column: col,
        order: maxTask ? maxTask.order + 1 : 0,
        priority: priority || 'medium',
        assignee: assigneeId,
        createdBy: actor._id
      });

      const assignee = await User.findById(assigneeId).select('username email emailNotifications');
      if (assignee && isAdmin) {
        sendAssignmentEmail({
          companyId,
          assignee,
          task,
          project,
          assignedBy: actor
        }).catch(() => {});
      }

      return JSON.stringify({
        success: true,
        id: task._id.toString(),
        title: task.title,
        assignee: assignee?.username,
        project: project.title,
        message: `Task "${task.title}" assigned to ${assignee?.username || 'user'}.`
      });
    },
    {
      name: 'create_and_assign_task',
      description:
        'Create a task in a project. Admins can assign to any username. Members auto-assign to themselves.',
      schema: z.object({
        projectId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional().default(''),
        assigneeUsername: z.string().optional(),
        column: z.enum(['todo', 'inprogress', 'review', 'done']).optional().default('todo'),
        priority: z.enum(['low', 'medium', 'high']).optional().default('medium')
      })
    }
  );

  const addDailyUpdate = tool(
    async ({ taskId, content, progressPercent, blockers, nextPlan }) => {
      const task = await Task.findById(taskId).populate({ path: 'project', select: 'company title' });
      if (!task || task.project.company.toString() !== companyId.toString()) {
        return JSON.stringify({ error: 'Task not found.' });
      }
      const assigneeId = task.assignee?.toString();
      if (!assigneeId || assigneeId !== actor._id.toString()) {
        return JSON.stringify({ error: 'Only the assigned person can add a daily update.' });
      }
      if (task.column === 'done') {
        return JSON.stringify({ error: 'Completed tasks do not accept daily updates.' });
      }

      const today = await getToday(companyId);
      const update = await TaskUpdate.findOneAndUpdate(
        { task: task._id, updateDate: today },
        {
          $set: {
            company: companyId,
            author: actor._id,
            content: String(content).trim(),
            progressPercent: Number(progressPercent || 0),
            blockers: String(blockers || '').trim(),
            nextPlan: String(nextPlan || '').trim(),
            createdAt: new Date()
          }
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      await Task.findByIdAndUpdate(task._id, { lastUpdateAt: new Date() });

      return JSON.stringify({
        success: true,
        date: today,
        task: task.title,
        progressPercent: update.progressPercent,
        message: `Daily update saved for "${task.title}" on ${today}.`
      });
    },
    {
      name: 'add_daily_update',
      description: 'Add or replace today’s daily progress update for a task assigned to the current user.',
      schema: z.object({
        taskId: z.string().min(1),
        content: z.string().min(1),
        progressPercent: z.number().min(0).max(100).optional().default(0),
        blockers: z.string().optional().default(''),
        nextPlan: z.string().optional().default('')
      })
    }
  );

  const getPersonalReport = tool(
    async () => {
      const today = await getToday(companyId);
      const projectIds = await Project.find({ company: companyId }).distinct('_id');
      const tasks = await Task.find({
        project: { $in: projectIds },
        assignee: actor._id
      }).populate('project', 'title');

      const openTasks = tasks.filter((t) => t.column !== 'done');
      const updatedIds = await TaskUpdate.distinct('task', {
        company: companyId,
        author: actor._id,
        updateDate: today,
        task: { $in: openTasks.map((t) => t._id) }
      });
      const updatedSet = new Set(updatedIds.map(String));
      const recentUpdates = await TaskUpdate.find({
        company: companyId,
        author: actor._id
      })
        .sort({ updateDate: -1 })
        .limit(10)
        .populate({ path: 'task', select: 'title' });

      return JSON.stringify({
        username: actor.username,
        date: today,
        assignedOpen: openTasks.length,
        dailyUpdatedCorrectly: openTasks.filter((t) => updatedSet.has(t._id.toString())).length,
        missedDailyUpdates: openTasks.filter((t) => !updatedSet.has(t._id.toString())).map((t) => ({
          id: t._id.toString(),
          title: t.title,
          project: t.project?.title
        })),
        recentUpdates: recentUpdates.map((u) => ({
          date: u.updateDate,
          task: u.task?.title,
          progressPercent: u.progressPercent,
          content: u.content
        }))
      });
    },
    {
      name: 'get_personal_report',
      description: 'Get the current user’s personal task and daily-update report.',
      schema: z.object({
        reason: z.string().optional().describe('Optional reason for personal report')
      })
    }
  );

  const getTeamReport = tool(
    async () => {
      if (!isAdmin) return JSON.stringify({ error: 'Only admins can view the full team report.' });
      const today = await getToday(companyId);
      const users = await User.find({ company: companyId }).select('username email role');
      const projectIds = await Project.find({ company: companyId }).distinct('_id');
      const openTasks = await Task.find({
        project: { $in: projectIds },
        assignee: { $ne: null },
        column: { $ne: 'done' }
      }).select('assignee title');
      const todayUpdates = await TaskUpdate.find({
        company: companyId,
        updateDate: today
      }).select('author task');

      const report = users.map((u) => {
        const assigned = openTasks.filter((t) => t.assignee.toString() === u._id.toString());
        const updatedTaskIds = new Set(
          todayUpdates
            .filter((up) => up.author.toString() === u._id.toString())
            .map((up) => up.task.toString())
        );
        const dailyUpdated = assigned.filter((t) => updatedTaskIds.has(t._id.toString())).length;
        const missed = assigned.length - dailyUpdated;
        return {
          username: u.username,
          role: u.role,
          openTasks: assigned.length,
          dailyUpdatedCorrectly: dailyUpdated,
          missedDailyUpdates: missed
        };
      });

      return JSON.stringify({ date: today, team: report });
    },
    {
      name: 'get_team_report',
      description: 'Admin only. Get daily-update report for all workers.',
      schema: z.object({
        reason: z.string().optional().describe('Optional reason for team report')
      })
    }
  );

  const listMyTasks = tool(
    async () => {
      const projectIds = await Project.find({ company: companyId }).distinct('_id');
      const query = isAdmin
        ? { project: { $in: projectIds } }
        : { project: { $in: projectIds }, assignee: actor._id };

      const tasks = await Task.find(query)
        .populate('project', 'title')
        .populate('assignee', 'username')
        .sort({ createdAt: -1 })
        .limit(40);

      return JSON.stringify(tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        column: t.column,
        project: t.project?.title,
        projectId: t.project?._id?.toString(),
        assignee: t.assignee?.username || null
      })));
    },
    {
      name: 'list_tasks',
      description: 'List tasks. Members see only their assigned tasks. Admins see company tasks.',
      schema: z.object({
        reason: z.string().optional().describe('Optional reason for listing tasks')
      })
    }
  );

  const tools = [
    listProjects,
    listMyTasks,
    createAndAssignTask,
    addDailyUpdate,
    getPersonalReport
  ];

  if (isAdmin) {
    tools.push(listUsers, createProject, getTeamReport);
  }

  return tools;
};

module.exports = { buildAgentTools };
