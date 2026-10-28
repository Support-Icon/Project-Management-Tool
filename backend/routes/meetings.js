const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const MeetingSignal = require('../models/MeetingSignal');
const { authOrGuest } = require('../middleware/auth');
const { canSeeAll } = require('../utils/roles');
const { summarizeMeeting, cleanSummary, LANGUAGE_NAMES } = require('../services/meetingSummary');
const { notifyMeetingInvite } = require('../services/notificationService');

const router = express.Router();
const LIVE_WINDOW_MS = 20000;

const liveParticipants = (meeting) => {
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  return (meeting.participants || []).filter((p) => {
    if (p.leftAt) return false;
    return new Date(p.lastSeen).getTime() >= cutoff;
  });
};

const recentReactions = (meeting) => {
  const cutoff = Date.now() - 8000;
  return (meeting.reactions || []).filter((r) => new Date(r.at).getTime() >= cutoff).slice(-12);
};

const publicMeeting = (meeting, { includeGuestToken = false } = {}) => {
  const obj = meeting.toObject ? meeting.toObject() : { ...meeting };
  const out = {
    ...obj,
    summary: cleanSummary(obj.summary || ''),
    liveParticipants: liveParticipants(obj).map((p) => ({
      user: p.user,
      username: p.username,
      isGuest: Boolean(p.isGuest),
      handRaised: Boolean(p.handRaised),
      isSharing: Boolean(p.isSharing),
      lastSeen: p.lastSeen
    })),
    reactions: recentReactions(obj),
    notesCount: (obj.notes || []).length
  };
  if (!includeGuestToken) delete out.guestToken;
  return out;
};

const companyIdOf = (user) => user?.company?._id || user?.company;

const canJoin = (user, meeting) => {
  if (!meeting || !user) return false;
  if (user.isGuest) return String(meeting._id) === String(user.guestMeetingId || '');
  const uid = String(user._id || user.id || '');
  const hostId = String(meeting.host?._id || meeting.host || '');
  if (uid && hostId && uid === hostId) return true;
  const invitees = (meeting.invitees || []).map((id) => (id ? String(id) : '')).filter(Boolean);
  if (!invitees.length) return true;
  if (uid && invitees.includes(uid)) return true;
  return canSeeAll(user);
};

const assertMeetingAccess = (req, meeting) => {
  if (req.user?.isGuest) {
    return String(req.guestMeetingId) === String(meeting._id);
  }
  return String(meeting.company?._id || meeting.company) === String(companyIdOf(req.user));
};

const staffOnly = (req, res, next) => {
  if (req.user?.isGuest) {
    return res.status(403).json({ message: 'Guest access is only for this meeting' });
  }
  next();
};

const makeGuestToken = () => crypto.randomBytes(16).toString('hex');

router.get('/guest/:token', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ guestToken: req.params.token }).populate('host', 'username');
    if (!meeting) return res.status(404).json({ message: 'Meeting link is invalid' });
    res.json({
      title: meeting.title,
      status: meeting.status,
      host: meeting.host?.username || '',
      language: meeting.language || 'en',
      summary: meeting.status === 'ended' ? cleanSummary(meeting.summary) : '',
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/guest/:token/session', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ message: 'Enter your name to join' });
    const meeting = await Meeting.findOne({ guestToken: req.params.token }).populate('host', 'username role');
    if (!meeting) return res.status(404).json({ message: 'Meeting link is invalid' });
    if (meeting.status !== 'live') {
      return res.status(400).json({ message: 'This meeting has ended' });
    }
    const guestId = new mongoose.Types.ObjectId();
    meeting.participants.push({
      user: guestId,
      username: name,
      isGuest: true,
      joinedAt: new Date(),
      lastSeen: new Date()
    });
    await meeting.save();
    const token = jwt.sign(
      {
        guest: true,
        guestId: guestId.toString(),
        meetingId: meeting._id.toString(),
        companyId: meeting.company.toString(),
        name
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      guestId: guestId.toString(),
      meetingId: meeting._id,
      meeting: publicMeeting(meeting)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.use(authOrGuest);

router.get('/', staffOnly, async (req, res) => {
  try {
    const companyId = companyIdOf(req.user);
    const live = await Meeting.find({ company: companyId, status: 'live' })
      .populate('host', 'username role')
      .sort({ startedAt: -1 })
      .limit(30);
    await Promise.all(live.map(async (m) => {
      if (!m.guestToken) {
        m.guestToken = makeGuestToken();
        await m.save();
      }
    }));
    const ended = await Meeting.find({ company: companyId, status: 'ended' })
      .populate('host', 'username role')
      .sort({ endedAt: -1 })
      .limit(20);
    res.json({
      live: live.map((m) => publicMeeting(m, { includeGuestToken: true })),
      ended: ended.map((m) => publicMeeting(m, { includeGuestToken: true }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', staffOnly, async (req, res) => {
  try {
    const title = String(req.body.title || 'Team meeting').trim().slice(0, 80) || 'Team meeting';
    const invitees = Array.isArray(req.body.invitees)
      ? req.body.invitees.filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];
    const language = LANGUAGE_NAMES[req.body.language] ? req.body.language : 'en';
    const meeting = await Meeting.create({
      company: companyIdOf(req.user),
      title,
      host: req.user._id,
      invitees,
      language,
      guestToken: makeGuestToken(),
      participants: [{
        user: req.user._id,
        username: req.user.username,
        joinedAt: new Date(),
        lastSeen: new Date()
      }]
    });
    try {
      await notifyMeetingInvite({
        companyId: companyIdOf(req.user),
        meeting,
        host: req.user,
        inviteeIds: invitees
      });
    } catch (notifyErr) {
      console.error('Meeting invite notify failed:', notifyErr.message);
    }
    const populated = await Meeting.findById(meeting._id).populate('host', 'username role');
    res.status(201).json(publicMeeting(populated, { includeGuestToken: true }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const loadMeeting = async (req, res) => {
  const filter = req.user.isGuest
    ? { _id: req.params.id }
    : { _id: req.params.id, company: companyIdOf(req.user) };
  const meeting = await Meeting.findOne(filter).populate('host', 'username role');
  if (!meeting) {
    res.status(404).json({ message: 'Meeting not found' });
    return null;
  }
  if (!assertMeetingAccess(req, meeting)) {
    res.status(403).json({ message: 'You cannot access this meeting' });
    return null;
  }
  return meeting;
};

router.get('/:id', async (req, res) => {
  try {
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    if (!req.user.isGuest && !canJoin({ ...req.user, guestMeetingId: req.guestMeetingId }, meeting)
      && meeting.status === 'live') {
      return res.status(403).json({ message: 'You were not invited to this meeting' });
    }
    res.json(publicMeeting(meeting, { includeGuestToken: !req.user.isGuest }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    if (meeting.status !== 'live') {
      return res.status(400).json({ message: 'This meeting has ended' });
    }
    if (!canJoin({ ...req.user, guestMeetingId: req.guestMeetingId }, meeting)) {
      return res.status(403).json({ message: 'You were not invited to this meeting' });
    }
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.lastSeen = new Date();
      existing.leftAt = null;
      existing.username = req.user.username;
      existing.isGuest = Boolean(req.user.isGuest);
    } else {
      meeting.participants.push({
        user: req.user._id,
        username: req.user.username,
        isGuest: Boolean(req.user.isGuest),
        joinedAt: new Date(),
        lastSeen: new Date()
      });
    }
    await meeting.save();
    res.json(publicMeeting(meeting, { includeGuestToken: !req.user.isGuest }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/heartbeat', async (req, res) => {
  try {
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    if (meeting.status !== 'live') return res.json(publicMeeting(meeting));
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.lastSeen = new Date();
      existing.leftAt = null;
      if (typeof req.body.sharing === 'boolean') existing.isSharing = req.body.sharing;
      await meeting.save();
    }
    res.json(publicMeeting(meeting, { includeGuestToken: !req.user.isGuest }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.leftAt = new Date();
      existing.handRaised = false;
      existing.isSharing = false;
      await meeting.save();
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const text = String(req.body.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: 'Note is empty' });
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    meeting.notes.push({
      user: req.user._id,
      username: req.user.username,
      text,
      at: new Date()
    });
    await meeting.save();
    res.json(meeting.notes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/hand', async (req, res) => {
  try {
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.handRaised = Boolean(req.body.raised);
      existing.lastSeen = new Date();
      await meeting.save();
    }
    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/react', async (req, res) => {
  try {
    const emoji = String(req.body.emoji || '').trim().slice(0, 8);
    if (!emoji) return res.status(400).json({ message: 'Pick an emoji' });
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    meeting.reactions = (meeting.reactions || []).slice(-30);
    meeting.reactions.push({
      user: req.user._id,
      username: req.user.username,
      emoji,
      at: new Date()
    });
    await meeting.save();
    res.json(recentReactions(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/language', async (req, res) => {
  try {
    const language = String(req.body.language || 'en');
    if (!LANGUAGE_NAMES[language]) {
      return res.status(400).json({ message: 'Unsupported language' });
    }
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    meeting.language = language;
    await meeting.save();
    res.json(publicMeeting(meeting, { includeGuestToken: !req.user.isGuest }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/signal', async (req, res) => {
  try {
    const { to, kind, payload } = req.body || {};
    if (!to || !['offer', 'answer', 'ice', 'hangup'].includes(kind)) {
      return res.status(400).json({ message: 'Invalid signal' });
    }
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    if (meeting.status !== 'live') return res.status(404).json({ message: 'Live meeting not found' });
    const row = await MeetingSignal.create({
      meeting: meeting._id,
      from: req.user._id,
      to,
      kind,
      payload: payload || {}
    });
    res.json({ id: row._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/signals', async (req, res) => {
  try {
    const after = req.query.after;
    const filter = {
      meeting: req.params.id,
      to: req.user._id
    };
    if (after && mongoose.Types.ObjectId.isValid(after)) {
      filter._id = { $gt: after };
    } else {
      filter.createdAt = { $gte: new Date(Date.now() - 15000) };
    }
    const rows = await MeetingSignal.find(filter).sort({ _id: 1 }).limit(50).lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/end', async (req, res) => {
  try {
    if (req.user.isGuest) {
      return res.status(403).json({ message: 'Guests cannot end the meeting' });
    }
    const meeting = await loadMeeting(req, res);
    if (!meeting) return;
    const isHost = String(meeting.host._id || meeting.host) === String(req.user._id);
    if (!isHost && !canSeeAll(req.user)) {
      return res.status(403).json({ message: 'Only the host can end this meeting' });
    }
    if (meeting.status === 'ended') {
      return res.json(publicMeeting(meeting, { includeGuestToken: true }));
    }

    const extraNote = String(req.body.notes || '').trim();
    if (extraNote) {
      meeting.notes.push({
        user: req.user._id,
        username: req.user.username,
        text: extraNote,
        at: new Date()
      });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();
    meeting.participants.forEach((p) => {
      if (!p.leftAt) p.leftAt = meeting.endedAt;
      p.handRaised = false;
      p.isSharing = false;
    });
    const durationMinutes = Math.max(
      1,
      Math.round((meeting.endedAt - meeting.startedAt) / 60000)
    );
    meeting.summary = await summarizeMeeting({
      companyId: companyIdOf(req.user),
      title: meeting.title,
      participants: meeting.participants,
      notes: meeting.notes,
      durationMinutes,
      language: meeting.language || 'en'
    });
    await meeting.save();
    res.json(publicMeeting(meeting, { includeGuestToken: true }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
