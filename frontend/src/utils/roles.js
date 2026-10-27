export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  team_lead: 'Team Lead',
  member: 'Member',
};

export const isAdmin = (user) => user?.role === 'admin';
export const isManager = (user) => user?.role === 'manager';
export const isTeamLead = (user) => user?.role === 'team_lead';
export const canSeeAll = (user) => isAdmin(user) || isManager(user);
export const canAssignOthers = (user) => isAdmin(user) || isManager(user) || isTeamLead(user);
export const canViewTeamAnalytics = (user) => canAssignOthers(user);
export const canManageUsers = (user) => isAdmin(user) || isManager(user) || isTeamLead(user);

export const creatableRoles = (user) => {
  if (isAdmin(user)) return ['member', 'team_lead', 'manager', 'admin'];
  if (isManager(user)) return ['member', 'team_lead', 'manager'];
  if (isTeamLead(user)) return ['member'];
  return [];
};

export const roleTone = (role) => ({
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-amber-100 text-amber-800',
  team_lead: 'bg-sky-100 text-sky-700',
  member: 'bg-blue-100 text-blue-700',
}[role] || 'bg-slate-100 text-slate-600');
