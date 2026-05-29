const Task = require('../models/Task');
const Project = require('../models/Project');

const isMineOnlyRequest = (mineOnly) => mineOnly === 'true' || mineOnly === '1';

/** Members always see own tasks; admins see all unless mineOnly is set. */
const getTaskFilterForUser = (user, mineOnly) => {
  if (user.role !== 'admin') return { assignee: user._id };
  if (isMineOnlyRequest(mineOnly)) return { assignee: user._id };
  return {};
};

const memberTaskFilter = (user) => getTaskFilterForUser(user, false);

const userCanAccessTask = (user, task) => {
  if (user.role === 'admin') return true;
  if (!task.assignee) return false;
  const assigneeId = task.assignee._id ? task.assignee._id.toString() : task.assignee.toString();
  return assigneeId === user._id.toString();
};

/** Project IDs where the member has at least one assigned task. */
const getInvolvedProjectIds = async (user, companyId) => {
  const companyProjectIds = await Project.find({ company: companyId }).distinct('_id');
  if (companyProjectIds.length === 0) return [];

  return Task.distinct('project', {
    project: { $in: companyProjectIds },
    assignee: user._id,
  });
};

const userCanAccessProject = async (user, projectId) => {
  if (user.role === 'admin') return true;
  const count = await Task.countDocuments({ project: projectId, assignee: user._id });
  return count > 0;
};

module.exports = {
  memberTaskFilter,
  getTaskFilterForUser,
  isMineOnlyRequest,
  userCanAccessTask,
  getInvolvedProjectIds,
  userCanAccessProject,
};
