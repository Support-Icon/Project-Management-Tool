const User = require('../models/User');

const ROLES = ['admin', 'manager', 'team_lead', 'member'];

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  team_lead: 'Team Lead',
  member: 'Member'
};

const isAdmin = (user) => user?.role === 'admin';
const isManager = (user) => user?.role === 'manager';
const isTeamLead = (user) => user?.role === 'team_lead';

/** Admins and managers see every task / project in the company. */
const canSeeAll = (user) => isAdmin(user) || isManager(user);

/** Roles that may assign tasks to other people. */
const canAssignOthers = (user) => isAdmin(user) || isManager(user) || isTeamLead(user);

/** Roles that may view team-level analytics (scoped for team leads). */
const canViewTeamAnalytics = (user) => isAdmin(user) || isManager(user) || isTeamLead(user);

/** IDs of the members reporting to a team lead. */
const getTeamMemberIds = async (teamLeadId, companyId) =>
  User.find({ company: companyId, teamLead: teamLeadId }).distinct('_id');

/**
 * Users whose tasks this user may see / manage.
 * Returns null when there is no restriction (admin / manager).
 */
const getScopeUserIds = async (user) => {
  if (canSeeAll(user)) return null;
  if (isTeamLead(user)) {
    const companyId = user.company?._id || user.company;
    const members = await getTeamMemberIds(user._id, companyId);
    return [user._id, ...members];
  }
  return [user._id];
};

module.exports = {
  ROLES,
  ROLE_LABELS,
  isAdmin,
  isManager,
  isTeamLead,
  canSeeAll,
  canAssignOthers,
  canViewTeamAnalytics,
  getTeamMemberIds,
  getScopeUserIds
};
