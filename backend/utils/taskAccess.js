const Task = require('../models/Task');
const Project = require('../models/Project');
const { canSeeAll } = require('./roles');

const isMineOnlyRequest = (mineOnly) => mineOnly === 'true' || mineOnly === '1';

/**
 * Assignee ids visible to this user. `null` means unrestricted.
 * Populated by the auth middleware; falls back to "own tasks only".
 */
const scopeOf = (user) => {
  if (canSeeAll(user)) return null;
  if (Array.isArray(user.scopeUserIds)) return user.scopeUserIds;
  return [user._id];
};

const idString = (value) => (value?._id ? value._id.toString() : value?.toString());

const inScope = (user, assignee) => {
  const scope = scopeOf(user);
  if (scope === null) return true;
  if (!assignee) return false;
  const target = idString(assignee);
  return scope.some((id) => id.toString() === target);
};

/**
 * Members see own tasks; team leads see their team's tasks;
 * admins and managers see all unless mineOnly is set.
 */
const getTaskFilterForUser = (user, mineOnly) => {
  if (isMineOnlyRequest(mineOnly)) return { assignee: user._id };
  const scope = scopeOf(user);
  if (scope === null) return {};
  if (scope.length === 1) return { assignee: scope[0] };
  return { assignee: { $in: scope } };
};

const memberTaskFilter = (user) => getTaskFilterForUser(user, false);

const userCanAccessTask = (user, task) => inScope(user, task.assignee);

/** Whether `user` may assign a task to `assigneeId`. */
const userCanAssignTo = (user, assigneeId) => inScope(user, assigneeId);

/** Project IDs where the user's scope has at least one assigned task. */
const getInvolvedProjectIds = async (user, companyId) => {
  const companyProjectIds = await Project.find({ company: companyId }).distinct('_id');
  if (companyProjectIds.length === 0) return [];

  return Task.distinct('project', {
    project: { $in: companyProjectIds },
    ...getTaskFilterForUser(user, false),
  });
};

const userCanAccessProject = async (user, projectId) => {
  if (canSeeAll(user)) return true;
  const count = await Task.countDocuments({ project: projectId, ...getTaskFilterForUser(user, false) });
  return count > 0;
};

module.exports = {
  memberTaskFilter,
  getTaskFilterForUser,
  isMineOnlyRequest,
  userCanAccessTask,
  userCanAssignTo,
  getInvolvedProjectIds,
  userCanAccessProject,
  scopeOf,
};
