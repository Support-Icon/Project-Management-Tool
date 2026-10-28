const express = require('express');
const multer = require('multer');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Attachment = require('../models/Attachment');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const Notification = require('../models/Notification');
const { notifyNewMessage } = require('../services/notificationService');
const { canAssignOthers, getTeamMemberIds } = require('../utils/roles');

const router = express.Router();

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES }
});

// Allow ?token= so attachments can be opened directly in a new tab
const tokenFromQuery = (req, _res, next) => {
  if (!req.header('Authorization') && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
};

const COMPANY_CHANNEL_NAME = 'general';

/** Every company has exactly one "everyone" channel; create it lazily. */
const getCompanyChannel = async (companyId, userId) => {
  let channel = await Conversation.findOne({ company: companyId, type: 'company' });
  if (!channel) {
    try {
      channel = await Conversation.create({
        company: companyId,
        type: 'company',
        name: COMPANY_CHANNEL_NAME,
        participants: [],
        createdBy: userId
      });
    } catch (_) {
      channel = await Conversation.findOne({ company: companyId, type: 'company' });
    }
  }
  return channel;
};

const loadConversationForUser = async (conversationId, user) => {
  const conversation = await Conversation.findOne({ _id: conversationId, company: user.company._id });
  if (!conversation) return null;
  if (conversation.type === 'company') return conversation;
  const isParticipant = conversation.participants.some((id) => id.toString() === user._id.toString());
  return isParticipant ? conversation : null;
};

const teamKeyFor = (ids) => ['team', ...[...ids].map(String).sort()].join(':');

const unreadFor = (conversationIds, userId) => Message.aggregate([
  {
    $match: {
      conversation: { $in: conversationIds },
      sender: { $ne: userId },
      readBy: { $ne: userId },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  },
  { $group: { _id: '$conversation', count: { $sum: 1 } } }
]);

const shapeConversation = (conversation, user, unreadMap, peopleMap) => {
  const base = {
    _id: conversation._id,
    type: conversation.type,
    name: conversation.name,
    lastMessageText: conversation.lastMessageText,
    lastMessageAt: conversation.lastMessageAt,
    lastSender: conversation.lastSender ? peopleMap.get(conversation.lastSender.toString()) || null : null,
    unread: unreadMap.get(conversation._id.toString()) || 0
  };
  if (conversation.type === 'direct') {
    const otherId = conversation.participants.find((id) => id.toString() !== user._id.toString());
    base.other = otherId ? peopleMap.get(otherId.toString()) || { _id: otherId, username: 'Unknown' } : null;
    base.name = base.other?.username || 'Direct message';
  }
  if (conversation.type === 'team') {
    base.memberCount = conversation.participants.length;
    base.name = conversation.name || 'Team chat';
  }
  return base;
};

// GET /api/messages/conversations — company channel + my DMs with unread counts
router.get('/conversations', auth, async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const channel = await getCompanyChannel(companyId, req.user._id);
    const directs = await Conversation.find({
      company: companyId,
      type: { $in: ['direct', 'team'] },
      participants: req.user._id
    }).sort({ lastMessageAt: -1, createdAt: -1 });

    const all = [channel, ...directs];
    const unread = await unreadFor(all.map((c) => c._id), req.user._id);
    const unreadMap = new Map(unread.map((row) => [row._id.toString(), row.count]));

    const peopleIds = new Set();
    all.forEach((c) => {
      c.participants.forEach((id) => peopleIds.add(id.toString()));
      if (c.lastSender) peopleIds.add(c.lastSender.toString());
    });
    const people = await User.find({ _id: { $in: [...peopleIds] } }).select('username role');
    const peopleMap = new Map(people.map((p) => [p._id.toString(), { _id: p._id, username: p.username, role: p.role }]));

    res.json(all.map((c) => shapeConversation(c, req.user, unreadMap, peopleMap)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/messages/conversations/direct { userId } — find or create a DM
router.post('/conversations/direct', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    if (String(userId) === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot message yourself' });
    }
    const other = await User.findOne({ _id: userId, company: req.user.company._id }).select('username role');
    if (!other) return res.status(404).json({ message: 'User not found in your company' });

    const directKey = Conversation.directKeyFor(req.user._id, other._id);
    let conversation = await Conversation.findOne({ company: req.user.company._id, directKey });
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          company: req.user.company._id,
          type: 'direct',
          participants: [req.user._id, other._id],
          directKey,
          createdBy: req.user._id
        });
      } catch (_) {
        conversation = await Conversation.findOne({ company: req.user.company._id, directKey });
      }
    }

    const peopleMap = new Map([
      [other._id.toString(), { _id: other._id, username: other.username, role: other.role }],
      [req.user._id.toString(), { _id: req.user._id, username: req.user.username, role: req.user.role }]
    ]);
    res.status(201).json(shapeConversation(conversation, req.user, new Map(), peopleMap));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/messages/conversations/team — admin / manager / team lead create a team chat
router.post('/conversations/team', auth, async (req, res) => {
  try {
    if (!canAssignOthers(req.user)) {
      return res.status(403).json({ message: 'Only admin, manager or team lead can create a team chat' });
    }
    const companyId = req.user.company._id;
    let participantIds = Array.isArray(req.body.participantIds)
      ? req.body.participantIds.map(String)
      : [];
    const name = String(req.body.name || '').trim();

    if (req.user.role === 'team_lead' && participantIds.length === 0) {
      const members = await getTeamMemberIds(req.user._id, companyId);
      participantIds = members.map(String);
    }

    const unique = [...new Set([req.user._id.toString(), ...participantIds])];
    if (unique.length < 2) {
      return res.status(400).json({ message: 'Add at least one teammate to the chat' });
    }

    const people = await User.find({ _id: { $in: unique }, company: companyId }).select('username role');
    if (people.length !== unique.length) {
      return res.status(400).json({ message: 'One or more people are not in your company' });
    }
    if (req.user.role === 'team_lead') {
      const allowed = new Set([req.user._id.toString(), ...(await getTeamMemberIds(req.user._id, companyId)).map(String)]);
      if (unique.some((id) => !allowed.has(id))) {
        return res.status(403).json({ message: 'Team leads can only chat with their own members' });
      }
    }

    const directKey = teamKeyFor(unique);
    let conversation = await Conversation.findOne({ company: companyId, type: 'team', directKey });
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          company: companyId,
          type: 'team',
          name: name || (req.user.role === 'team_lead' ? `${req.user.username}'s team` : 'Team chat'),
          participants: unique,
          directKey,
          createdBy: req.user._id
        });
      } catch (_) {
        conversation = await Conversation.findOne({ company: companyId, type: 'team', directKey });
      }
    } else if (name) {
      conversation.name = name;
      await conversation.save();
    }

    const peopleMap = new Map(people.map((p) => [p._id.toString(), { _id: p._id, username: p.username, role: p.role }]));
    res.status(201).json(shapeConversation(conversation, req.user, new Map(), peopleMap));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/messages/conversations/:id/messages?before=<ISO>&after=<ISO>&limit=50
router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const conversation = await loadConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const filter = { conversation: conversation._id };
    const before = req.query.before ? new Date(req.query.before) : null;
    const after = req.query.after ? new Date(req.query.after) : null;
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lt: before };
    if (after && !Number.isNaN(after.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $gt: after };

    const messages = await Message.find(filter)
      .populate('sender', 'username role')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        name: conversation.name,
        participants: conversation.participants
      },
      messages: messages.reverse(),
      hasMore: messages.length === limit
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/messages/conversations/:id/messages — multipart: text + files[]
router.post('/conversations/:id/messages', auth, (req, res) => {
  upload.array('files', MAX_FILES)(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? `Each file must be ${MAX_FILE_BYTES / (1024 * 1024)} MB or smaller`
        : uploadError.code === 'LIMIT_FILE_COUNT'
          ? `You can attach up to ${MAX_FILES} files per message`
          : uploadError.message;
      return res.status(400).json({ message });
    }

    try {
      const conversation = await loadConversationForUser(req.params.id, req.user);
      if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

      const text = String(req.body.text || '').trim();
      const files = req.files || [];
      if (!text && files.length === 0) {
        return res.status(400).json({ message: 'Type a message or attach a file' });
      }

      const companyId = req.user.company._id;
      const attachments = [];
      for (const file of files) {
        const stored = await Attachment.create({
          company: companyId,
          uploadedBy: req.user._id,
          conversation: conversation._id,
          filename: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          data: file.buffer
        });
        attachments.push({
          attachment: stored._id,
          filename: stored.filename,
          mimeType: stored.mimeType,
          size: stored.size
        });
      }

      const message = await Message.create({
        conversation: conversation._id,
        company: companyId,
        sender: req.user._id,
        text,
        attachments,
        readBy: [req.user._id]
      });

      const preview = text
        ? text.slice(0, 140)
        : `Sent ${attachments.length} file${attachments.length === 1 ? '' : 's'}: ${attachments[0].filename}`;

      conversation.lastMessageText = preview;
      conversation.lastMessageAt = message.createdAt;
      conversation.lastSender = req.user._id;
      await conversation.save();

      const populated = await Message.findById(message._id).populate('sender', 'username role');
      res.status(201).json(populated);

      // Notify everyone else in the conversation (fire-and-forget)
      const recipients = conversation.type === 'company'
        ? await User.find({ company: companyId }).distinct('_id')
        : conversation.participants;
      notifyNewMessage({
        companyId,
        recipients,
        sender: req.user,
        conversation,
        preview
      }).catch((error) => console.error('Message notification failed:', error.message));
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
});

// POST /api/messages/conversations/:id/read — mark everything in the conversation as read
router.post('/conversations/:id/read', auth, async (req, res) => {
  try {
    const conversation = await loadConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    const result = await Message.updateMany(
      { conversation: conversation._id, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    const conversationId = conversation._id.toString();
    await Notification.deleteMany({
      user: req.user._id,
      type: 'message',
      $or: [
        { 'meta.conversationId': conversation._id },
        { 'meta.conversationId': conversationId },
        { link: `/messages/${conversationId}` }
      ]
    });
    res.json({ updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/messages/attachments/:id?inline=1 — download / preview a shared file
router.get('/attachments/:id', tokenFromQuery, auth, async (req, res) => {
  try {
    const attachment = await Attachment.findOne({
      _id: req.params.id,
      company: req.user.company._id
    }).select('+data');
    if (!attachment) return res.status(404).json({ message: 'File not found' });

    if (attachment.conversation) {
      const conversation = await loadConversationForUser(attachment.conversation, req.user);
      if (!conversation) return res.status(403).json({ message: 'You cannot access this file' });
    }

    const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
    const safeName = encodeURIComponent(attachment.filename).replace(/['()]/g, escape);
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', attachment.data.length);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(attachment.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
