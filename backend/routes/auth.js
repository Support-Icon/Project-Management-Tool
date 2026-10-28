const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Public signup is disabled — only this company uses the app.
// Existing people are added from Team Members by admin / manager / team lead.
router.post('/register', async (_req, res) => {
  return res.status(403).json({
    message: 'Public signup is closed. Ask your admin to create your account.'
  });
});

/* Register — kept for reference; not used while this app is single-company.
router.post('/register-disabled', async (req, res) => {
  try {
    const { username, email, password, companyName, role } = req.body;

    if (!username || !email || !password || !companyName) {
      return res.status(400).json({ message: 'Username, email, password and company name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ username: username.trim() });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const founderRoles = ['admin', 'manager', 'team_lead'];
    const founderRole = founderRoles.includes(role) ? role : 'admin';

    let company = await Company.findOne({ name: companyName.trim() });

    if (!company) {
      company = await Company.create({ name: companyName.trim() });
    } else {
      const count = await User.countDocuments({ company: company._id });
      if (count > 0) {
        return res.status(403).json({
          message: 'This company already has an account. Ask your admin to create your account.'
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: founderRole,
      company: company._id
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        teamLead: user.teamLead || null,
        company: { _id: company._id, name: company.name }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
*/

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    const user = await User.findOne({ username: username.trim() }).populate('company');
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        teamLead: user.teamLead || null,
        company: { _id: user.company._id, name: user.company.name }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Verify current token / get current user
router.get('/me', auth, (req, res) => {
  const u = req.user;
  res.json({
    _id: u._id,
    username: u.username,
    email: u.email,
    role: u.role,
    avatar: u.avatar || '',
    teamLead: u.teamLead || null,
    company: { _id: u.company._id, name: u.company.name }
  });
});

module.exports = router;
