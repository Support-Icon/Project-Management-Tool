const Task = require('../models/Task');
const Project = require('../models/Project');

/** Members only see tasks assigned to them; admins see all company tasks. */
const memberTaskFilter = (user) => {
  if (user.role === 'admin') return {};
  return { assignee: user._id };
};

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
  userCanAccessTask,
  getInvolvedProjectIds,
  userCanAccessProject,
};
