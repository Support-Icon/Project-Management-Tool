const mongoose = require('mongoose');

const ROLES = ['admin', 'manager', 'team_lead', 'member'];

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  password: { type: String, required: true },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  emailNotifications: { type: Boolean, default: true },
  role: {
    type: String,
    enum: ROLES,
    default: 'member'
  },
  // Team lead this user reports to (used for team-scoped reports)
  teamLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  avatar: { type: String, default: '' },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
User.ROLES = ROLES;

module.exports = User;
