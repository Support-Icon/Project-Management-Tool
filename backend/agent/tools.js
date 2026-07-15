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
    async ({ projectId, title, description, assigneeUsername, column, priority, dueDate, startDate, dependsOnTaskTitle }) => {
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

      const parseDate = (value, label) => {
        if (!value || !String(value).trim() || /^skip|none|n\/a$/i.test(String(value).trim())) {
          return { ok: true, value: null };
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return { ok: false, error: `Invalid ${label}. Use YYYY-MM-DD.` };
        }
        return { ok: true, value: parsed };
      };

      const due = parseDate(dueDate, 'dueDate');
      if (!due.ok) return JSON.stringify({ error: due.error });
      const start = parseDate(startDate, 'startDate');
      if (!start.ok) return JSON.stringify({ error: start.error });

      let dependsOn = null;
      if (dependsOnTaskTitle && !/^skip|none|n\/a$/i.test(String(dependsOnTaskTitle).trim())) {
        const dep = await Task.findOne({
          project: projectId,
          title: new RegExp(`^${String(dependsOnTaskTitle).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });
        if (!dep) return JSON.stringify({ error: `Dependency task "${dependsOnTaskTitle}" not found.` });
        dependsOn = dep._id;
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
        dueDate: due.value,
        startDate: start.value,
        dependsOn,
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
        startDate: start.value ? start.value.toISOString().slice(0, 10) : null,
        dueDate: due.value ? due.value.toISOString().slice(0, 10) : null,
        dependsOn: dependsOnTaskTitle || null,
        message: `Task "${task.title}" assigned to ${assignee?.username || 'user'}.`
      });
    },
    {
      name: 'create_and_assign_task',
      description:
        'Create a task. Ask for startDate, dueDate (YYYY-MM-DD), and optional dependsOnTaskTitle (start after that task completes).',
      schema: z.object({
        projectId: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional().default(''),
        assigneeUsername: z.string().optional(),
        column: z.enum(['todo', 'inprogress', 'review', 'done']).optional().default('todo'),
        priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
        startDate: z.string().optional().describe('Start date YYYY-MM-DD'),
        dueDate: z.string().optional().describe('Due date YYYY-MM-DD'),
        dependsOnTaskTitle: z.string().optional().describe('Title of task that must complete first')
      })
    }
  );

  const completeTask = tool(
    async ({ taskId, taskTitle }) => {
      let task = null;
      if (taskId) {
        task = await Task.findById(taskId).populate({ path: 'project', select: 'company title' });
      } else if (taskTitle) {
        const projectIds = await Project.find({ company: companyId }).distinct('_id');
        const query = {
          project: { $in: projectIds },
          title: new RegExp(`^${String(taskTitle).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        };
        if (!isAdmin) query.assignee = actor._id;
        task = await Task.findOne(query).populate({ path: 'project', select: 'company title' });
      }
      if (!task || task.project.company.toString() !== companyId.toString()) {
        return JSON.stringify({ error: 'Task not found.' });
      }
      if (!isAdmin && task.assignee?.toString() !== actor._id.toString()) {
        return JSON.stringify({ error: 'You can only complete your own tasks.' });
      }
      if (task.column === 'done') {
        return JSON.stringify({ success: true, message: `Task "${task.title}" is already completed.` });
      }

      const maxDone = await Task.findOne({ project: task.project._id, column: 'done' }).sort({ order: -1 });
      task.column = 'done';
      task.order = maxDone ? maxDone.order + 1 : 0;
      task.completedAt = new Date();
      await task.save();

      const unlocked = await Task.updateMany(
        { dependsOn: task._id, column: { $ne: 'done' } },
        { $set: { startDate: new Date() } }
      );

      return JSON.stringify({
        success: true,
        id: task._id.toString(),
        title: task.title,
        column: 'done',
        unlockedDependents: unlocked.modifiedCount || 0,
        message: `Task "${task.title}" marked complete (moved to Done).`
      });
    },
    {
      name: 'complete_task',
      description:
        'Mark a task as complete (status/column = done). Unlocks tasks that were waiting on this one (dependsOn). Prefer taskId from list_tasks; taskTitle works if unique.',
      schema: z.object({
        taskId: z.string().optional(),
        taskTitle: z.string().optional()
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
      if (task.column !== 'inprogress') {
        return JSON.stringify({
          error: 'Daily updates are only for In Progress tasks. Move the task to In Progress first.'
        });
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
      description: 'Add or replace today’s daily progress update for an In Progress task assigned to the current user (not To Do).',
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

      const openTasks = tasks.filter((t) => t.column === 'inprogress');
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
        inProgressTasks: openTasks.length,
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
        })),
        readable: [
          `Personal Daily-Update Report (${today})`,
          `In Progress tasks: ${openTasks.length}`,
          `Daily updated correctly: ${openTasks.filter((t) => updatedSet.has(t._id.toString())).length}`,
          `Missed daily updates: ${openTasks.filter((t) => !updatedSet.has(t._id.toString())).length}`,
          ...openTasks
            .filter((t) => !updatedSet.has(t._id.toString()))
            .map((t) => `- Missed: ${t.title} (${t.project?.title || 'project'})`)
        ].join('\n')
      });
    },
    {
      name: 'get_personal_report',
      description: 'Get the current user’s personal In Progress daily-update report. Prefer the readable field when answering the user.',
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
        column: 'inprogress'
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
          inProgressTasks: assigned.length,
          dailyUpdatedCorrectly: dailyUpdated,
          missedDailyUpdates: missed
        };
      });

      const readable = [
        `Team Daily-Update Report (${today})`,
        'Daily updates are required only for In Progress tasks.',
        '',
        ...report.map((row) =>
          [
            `• **${row.username}** (${row.role})`,
            `  In Progress tasks: ${row.inProgressTasks}`,
            `  Daily updated correctly: ${row.dailyUpdatedCorrectly}`,
            `  Missed daily updates: ${row.missedDailyUpdates}`
          ].join('\n')
        )
      ].join('\n');

      return JSON.stringify({ date: today, team: report, readable });
    },
    {
      name: 'get_team_report',
      description: 'Admin only. Daily-update report for In Progress tasks only. Prefer the readable field — never use markdown tables.',
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
    completeTask,
    addDailyUpdate,
    getPersonalReport
  ];

  if (isAdmin) {
    tools.push(listUsers, createProject, getTeamReport);
  }

  return tools;
};

module.exports = { buildAgentTools };
