const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all users in same company (admin only)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ company: req.user.company._id })
      .select('-password')
      .populate('company', 'name')
      .sort({ createdAt: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create user (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, email, role = 'member' } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ message: 'Username, email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) return res.status(400).json({ message: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role,
      company: req.user.company._id
    });

    const populated = await User.findById(user._id)
      .select('-password')
      .populate('company', 'name');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user (admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, email, emailNotifications, role } = req.body;
    const updates = {};

    if (username) {
      const conflict = await User.findOne({ username: username.trim(), _id: { $ne: req.params.id } });
      if (conflict) return res.status(400).json({ message: 'Username already taken' });
      updates.username = username.trim();
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Password too short' });
      updates.password = await bcrypt.hash(password, 10);
    }
    if (email !== undefined) updates.email = String(email).trim().toLowerCase();
    if (emailNotifications !== undefined) updates.emailNotifications = Boolean(emailNotifications);
    if (role) updates.role = role;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company._id },
      updates,
      { new: true }
    ).select('-password').populate('company', 'name');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const user = await User.findOneAndDelete({
      _id: req.params.id,
      company: req.user.company._id
    });

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
