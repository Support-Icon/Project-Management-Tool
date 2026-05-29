/** Append ?mineOnly=true when admin toggled "my tasks only" view. */
export const withMineOnly = (isAdmin, adminMineOnly) =>
  isAdmin && adminMineOnly ? '?mineOnly=true' : '';
