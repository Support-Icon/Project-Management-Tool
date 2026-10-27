const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getScopeUserIds, canViewTeamAnalytics, canManageUsers } = require('../utils/roles');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).populate('company');

    if (!user) return res.status(401).json({ message: 'User not found' });

    // null = unrestricted (admin / manager); array = visible assignee ids
    const scopeUserIds = await getScopeUserIds(user);
    user.scopeUserIds = scopeUserIds;
    req.user = user;
    req.scopeUserIds = scopeUserIds;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

/** Admin, manager or team lead. */
const leadersOnly = (req, res, next) => {
  if (!canViewTeamAnalytics(req.user)) {
    return res.status(403).json({ message: 'Manager or team lead access required' });
  }
  next();
};

/** Admin, manager or team lead — can add people. */
const staffOnly = (req, res, next) => {
  if (!canManageUsers(req.user)) {
    return res.status(403).json({ message: 'Admin, manager or team lead access required' });
  }
  next();
};

module.exports = { auth, adminOnly, leadersOnly, staffOnly };
