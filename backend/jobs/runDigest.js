const { DateTime } = require('luxon');
const Company = require('../models/Company');
const CompanySettings = require('../models/CompanySettings');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const { sendDigestEmail } = require('../services/emailService');

const runDueDigests = async () => {
  const settingsList = await CompanySettings.find({
    'email.enabled': true,
    'digest.enabled': true
  });
  const results = [];

  for (const settings of settingsList) {
    const timezone = settings.digest.timezone || 'Asia/Kolkata';
    const now = DateTime.now().setZone(timezone);
    if (!now.isValid) {
      results.push({ company: settings.company, error: 'Invalid timezone' });
      continue;
    }

    const today = now.toISODate();
    const currentMinutes = now.hour * 60 + now.minute;
    const [targetHour, targetMinute] = settings.digest.time.split(':').map(Number);
    const targetMinutes = targetHour * 60 + targetMinute;
    if (currentMinutes < targetMinutes || settings.digest.lastSentDate === today) continue;

    const company = await Company.findById(settings.company);
    if (!company) continue;
    const projectIds = await Project.find({ company: company._id }).distinct('_id');
    const users = await User.find({
      company: company._id,
      email: { $ne: '' },
      emailNotifications: true
    });

    let sent = 0;
    for (const user of users) {
      const tasks = await Task.find({
        project: { $in: projectIds },
        assignee: user._id,
        column: 'inprogress'
      }).populate('project', 'title');
      if (tasks.length === 0) continue;

      const updatedIds = await TaskUpdate.distinct('task', {
        company: company._id,
        author: user._id,
        updateDate: today,
        task: { $in: tasks.map((task) => task._id) }
      });
      const updatedSet = new Set(updatedIds.map(String));
      await sendDigestEmail({
        companyId: company._id,
        recipient: user,
        companyName: company.name,
        localDate: today,
        rows: tasks.map((task) => ({
          task: task.title,
          project: task.project?.title || '',
          status: updatedSet.has(task._id.toString()) ? 'Updated' : 'Update pending'
        }))
      });
      sent += 1;
    }

    settings.digest.lastSentDate = today;
    settings.digest.lastSentAt = new Date();
    await settings.save();
    results.push({ company: company.name, sent });
  }

  return results;
};

module.exports = { runDueDigests };
