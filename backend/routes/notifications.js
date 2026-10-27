const express = require('express');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const countUnreadMessages = async (user) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const conversations = await Conversation.find({
    company: user.company._id,
    $or: [{ type: 'company' }, { participants: user._id }]
  }).select('_id').lean();
  if (!conversations.length) return 0;
  return Message.countDocuments({
    conversation: { $in: conversations.map((c) => c._id) },
    sender: { $ne: user._id },
    readBy: { $ne: user._id },
    createdAt: { $gte: since }
  });
};

// GET /api/notifications?since=<ISO date>&limit=30
// Returns recent notifications, unread count and unread message count (polled by the bell).
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const filter = { user: req.user._id };
    const since = req.query.since ? new Date(req.query.since) : null;
    if (since && !Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };

    const [items, unreadCount, unreadMessages] = await Promise.all([
      Notification.find(filter).populate('actor', 'username').sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({ user: req.user._id, read: false }),
      countUnreadMessages(req.user)
    ]);

    res.json({ items, unreadCount, unreadMessages, serverTime: new Date() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Notification not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'Notification removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
