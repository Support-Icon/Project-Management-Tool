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
  if (isAdmin(user) || isManager(user)) return ['member', 'team_lead', 'manager', 'admin'];
  if (isTeamLead(user)) return ['member'];
  return [];
};

export const roleTone = (role) => ({
  admin: 'bg-brand-ink text-brand-green',
  manager: 'bg-brand-yellow/20 text-brand-ink',
  team_lead: 'bg-brand-blue/15 text-brand-blue',
  member: 'bg-brand-green/15 text-brand-ink',
}[role] || 'bg-slate-100 text-slate-600');
