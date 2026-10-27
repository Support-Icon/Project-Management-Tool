const Notification = require('../models/Notification');
const { formatDuration, formatIST } = require('../utils/duration');

const createNotification = async ({ user, company, type, title, body = '', link = '', actor = null, meta = {} }) => {
  if (!user || !company) return null;
  try {
    return await Notification.create({ user, company, type, title, body, link, actor, meta });
  } catch (error) {
    console.error('Notification create failed:', error.message);
    return null;
  }
};

const createMany = async (items) => {
  if (!items.length) return [];
  try {
    return await Notification.insertMany(items, { ordered: false });
  } catch (error) {
    console.error('Notification insertMany failed:', error.message);
    return [];
  }
};

/** Notify an assignee that a task was assigned to them (skips self-assignment). */
const notifyTaskAssigned = async ({ companyId, assignee, task, project, assignedBy }) => {
  const assigneeId = assignee?._id || assignee;
  if (!assigneeId) return null;
  if (assignedBy?._id && assigneeId.toString() === assignedBy._id.toString()) return null;

  const parts = [];
  if (task.duration?.value) parts.push(`Complete within ${formatDuration(task.duration)}`);
  if (task.deadlineAt) parts.push(`Deadline: ${formatIST(task.deadlineAt)}`);
  else if (task.dueDate) parts.push(`Due: ${formatIST(task.dueDate)}`);
  parts.push(`Priority: ${task.priority}`);

  return createNotification({
    user: assigneeId,
    company: companyId,
    type: 'task_assigned',
    title: `New task: ${task.title}`,
    body: `${assignedBy?.username || 'Someone'} assigned you a task in ${project?.title || 'a project'}. ${parts.join(' · ')}`,
    link: project?._id ? `/kanban/${project._id}` : '',
    actor: assignedBy?._id || null,
    meta: {
      taskId: task._id,
      projectId: project?._id,
      deadlineAt: task.deadlineAt || null,
      duration: task.duration?.value ? task.duration : null
    }
  });
};

/** Notify recipients about a new chat message. */
const notifyNewMessage = async ({ companyId, recipients, sender, conversation, preview }) => {
  const senderId = sender._id.toString();
  const items = recipients
    .filter((id) => id.toString() !== senderId)
    .map((id) => ({
      user: id,
      company: companyId,
      type: 'message',
      title: conversation.type === 'company'
        ? `${sender.username} in #${conversation.name || 'company'}`
        : `Message from ${sender.username}`,
      body: preview,
      link: `/messages/${conversation._id}`,
      actor: sender._id,
      meta: { conversationId: conversation._id }
    }));
  return createMany(items);
};

module.exports = { createNotification, createMany, notifyTaskAssigned, notifyNewMessage };
