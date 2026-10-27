const { DateTime } = require('luxon');
const Company = require('../models/Company');
const CompanySettings = require('../models/CompanySettings');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const { sendDailyReportEmail } = require('../services/emailService');
const { getTeamMemberIds } = require('../utils/roles');
const { formatIST, IST } = require('../utils/duration');

const COLUMN_LABEL = {
  todo: 'To Do',
  inprogress: 'In Progress',
  review: 'Review',
  done: 'Done'
};

const buildPersonRows = async ({ companyId, people, today, timezone, projectIds }) => {
  if (!people.length) return [];
  const personIds = people.map((p) => p._id);
  const dayStart = DateTime.fromISO(today, { zone: timezone }).startOf('day').toJSDate();
  const dayEnd = DateTime.fromISO(today, { zone: timezone }).endOf('day').toJSDate();

  const [tasks, updates] = await Promise.all([
    Task.find({
      project: { $in: projectIds },
      assignee: { $in: personIds },
      $or: [
        { column: { $ne: 'done' } },
        { completedAt: { $gte: dayStart, $lte: dayEnd } }
      ]
    })
      .populate('project', 'title')
      .select('title column priority assignee deadlineAt dueDate completedAt'),
    TaskUpdate.find({
      company: companyId,
      updateDate: today,
      author: { $in: personIds }
    }).select('author task')
  ]);

  const updatedByAuthor = new Map();
  updates.forEach((update) => {
    const key = update.author.toString();
    if (!updatedByAuthor.has(key)) updatedByAuthor.set(key, new Set());
    updatedByAuthor.get(key).add(update.task.toString());
  });

  return people.map((person) => {
    const id = person._id.toString();
    const theirs = tasks.filter((task) => task.assignee?.toString() === id);
    const updatedSet = updatedByAuthor.get(id) || new Set();
    const open = theirs.filter((t) => t.column !== 'done');
    const doneToday = theirs.filter((t) => t.column === 'done').length;
    const missed = open.filter((t) => t.column === 'inprogress' && !updatedSet.has(t._id.toString())).length;

    return {
      username: person.username,
      role: person.role,
      openCount: open.length,
      doneToday,
      missedUpdates: missed,
      tasks: theirs.map((task) => ({
        title: task.title,
        project: task.project?.title || '',
        column: COLUMN_LABEL[task.column] || task.column,
        priority: task.priority,
        deadline: task.deadlineAt ? formatIST(task.deadlineAt, timezone) : (task.dueDate ? formatIST(task.dueDate, timezone) : ''),
        updateStatus: task.column === 'inprogress'
          ? (updatedSet.has(task._id.toString()) ? 'Updated' : 'Update pending')
          : (task.column === 'done' ? 'Completed today' : '—')
      }))
    };
  });
};

const recipientsForCompany = async (companyId) => {
  const people = await User.find({
    company: companyId,
    email: { $ne: '' },
    emailNotifications: true,
    role: { $in: ['admin', 'manager', 'team_lead'] }
  }).select('username email role emailNotifications');
  return people;
};

const sendCompanyDailyReports = async ({ company, settings, today, timezone, force = false }) => {
  if (!force && settings.report?.lastSentDate === today) {
    return { company: company.name, skipped: true, reason: 'Already sent today' };
  }

  const projectIds = await Project.find({ company: company._id }).distinct('_id');
  const allUsers = await User.find({ company: company._id }).select('username email role teamLead');
  const recipients = await recipientsForCompany(company._id);
  if (!recipients.length) {
    return { company: company.name, sent: 0, reason: 'No managers or team leads with email' };
  }

  let sent = 0;
  for (const recipient of recipients) {
    let people;
    if (recipient.role === 'team_lead') {
      const memberIds = await getTeamMemberIds(recipient._id, company._id);
      people = allUsers.filter((u) => memberIds.some((id) => id.toString() === u._id.toString()));
    } else {
      people = allUsers;
    }

    const rows = await buildPersonRows({
      companyId: company._id,
      people,
      today,
      timezone,
      projectIds
    });

    await sendDailyReportEmail({
      companyId: company._id,
      recipient,
      companyName: company.name,
      localDate: today,
      people: rows,
      roleLabel: recipient.role === 'team_lead' ? 'Team Lead' : (recipient.role === 'admin' ? 'Admin' : 'Manager')
    });
    sent += 1;
  }

  settings.report = settings.report || {};
  settings.report.lastSentDate = today;
  settings.report.lastSentAt = new Date();
  await settings.save();
  return { company: company.name, sent };
};

const runDueDailyReports = async ({ forceCompanyId = null } = {}) => {
  const query = { 'email.enabled': true };
  if (forceCompanyId) query.company = forceCompanyId;
  else query['report.enabled'] = true;

  const settingsList = await CompanySettings.find(query);
  const results = [];

  for (const settings of settingsList) {
    const timezone = settings.digest?.timezone || IST;
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid) {
      results.push({ company: settings.company, error: 'Invalid timezone' });
      continue;
    }

    const today = now.toISODate();
    if (!forceCompanyId) {
      const currentMinutes = now.hour * 60 + now.minute;
      const [targetHour, targetMinute] = String(settings.report?.time || '19:30').split(':').map(Number);
      const targetMinutes = (targetHour || 19) * 60 + (targetMinute || 30);
      if (currentMinutes < targetMinutes || settings.report?.lastSentDate === today) continue;
    }

    const company = await Company.findById(settings.company);
    if (!company) continue;
    results.push(await sendCompanyDailyReports({
      company,
      settings,
      today,
      timezone,
      force: Boolean(forceCompanyId)
    }));
  }

  return results;
};

module.exports = { runDueDailyReports, sendCompanyDailyReports, buildPersonRows };
