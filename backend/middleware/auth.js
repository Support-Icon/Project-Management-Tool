const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getScopeUserIds, canViewTeamAnalytics, canManageUsers, canSeeAll } = require('../utils/roles');

const readToken = (req) => req.header('Authorization')?.replace('Bearer ', '') || '';

/** Logged-in staff, or a guest token that is valid only for one meeting. */
const authOrGuest = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.guest) {
      req.user = {
        _id: decoded.guestId,
        username: decoded.name,
        isGuest: true,
        role: 'guest',
        company: { _id: decoded.companyId }
      };
      req.guestMeetingId = decoded.meetingId;
      req.scopeUserIds = [decoded.guestId];
      return next();
    }
    const user = await User.findById(decoded.userId).populate('company');
    if (!user) return res.status(401).json({ message: 'User not found' });
    const scopeUserIds = await getScopeUserIds(user);
    user.scopeUserIds = scopeUserIds;
    req.user = user;
    req.scopeUserIds = scopeUserIds;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const auth = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.guest) {
      return res.status(403).json({ message: 'Guest access is only for that meeting' });
    }
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

/** Admin or manager — same company-wide access. */
const adminOnly = (req, res, next) => {
  if (!canSeeAll(req.user)) {
    return res.status(403).json({ message: 'Admin or manager access required' });
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

module.exports = { auth, authOrGuest, adminOnly, leadersOnly, staffOnly };
