const express = require('express');
const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const MeetingSignal = require('../models/MeetingSignal');
const { auth } = require('../middleware/auth');
const { canSeeAll } = require('../utils/roles');
const { summarizeMeeting } = require('../services/meetingSummary');
const { notifyMeetingInvite } = require('../services/notificationService');

const router = express.Router();
router.use(auth);

const LIVE_WINDOW_MS = 20000;

const liveParticipants = (meeting) => {
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  return (meeting.participants || []).filter((p) => {
    if (p.leftAt) return false;
    return new Date(p.lastSeen).getTime() >= cutoff;
  });
};

const publicMeeting = (meeting) => {
  const obj = meeting.toObject ? meeting.toObject() : meeting;
  return {
    ...obj,
    liveParticipants: liveParticipants(obj).map((p) => ({
      user: p.user,
      username: p.username,
      lastSeen: p.lastSeen
    }))
  };
};

const canJoin = (user, meeting) => {
  if (!meeting) return false;
  if (String(meeting.host) === String(user._id) || String(meeting.host?._id) === String(user._id)) return true;
  const invitees = (meeting.invitees || []).map((id) => id.toString());
  if (!invitees.length) return true;
  if (invitees.includes(user._id.toString())) return true;
  return canSeeAll(user);
};

router.get('/', async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const live = await Meeting.find({ company: companyId, status: 'live' })
      .populate('host', 'username role')
      .sort({ startedAt: -1 })
      .limit(30)
      .lean();
    const ended = await Meeting.find({ company: companyId, status: 'ended' })
      .populate('host', 'username role')
      .sort({ endedAt: -1 })
      .limit(20)
      .lean();
    res.json({
      live: live.map(publicMeeting),
      ended: ended.map(publicMeeting)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = String(req.body.title || 'Team meeting').trim().slice(0, 80) || 'Team meeting';
    const invitees = Array.isArray(req.body.invitees)
      ? req.body.invitees.filter((id) => mongoose.Types.ObjectId.isValid(id))
      : [];
    const meeting = await Meeting.create({
      company: req.user.company._id,
      title,
      host: req.user._id,
      invitees,
      participants: [{
        user: req.user._id,
        username: req.user.username,
        joinedAt: new Date(),
        lastSeen: new Date()
      }]
    });
    await notifyMeetingInvite({
      companyId: req.user.company._id,
      meeting,
      host: req.user,
      inviteeIds: invitees
    });
    const populated = await Meeting.findById(meeting._id).populate('host', 'username role');
    res.status(201).json(publicMeeting(populated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id
    }).populate('host', 'username role');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (!canJoin(req.user, meeting)) {
      return res.status(403).json({ message: 'You were not invited to this meeting' });
    }
    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id
    }).populate('host', 'username role');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (meeting.status !== 'live') {
      return res.status(400).json({ message: 'This meeting has ended' });
    }
    if (!canJoin(req.user, meeting)) {
      return res.status(403).json({ message: 'You were not invited to this meeting' });
    }
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.lastSeen = new Date();
      existing.leftAt = null;
      existing.username = req.user.username;
    } else {
      meeting.participants.push({
        user: req.user._id,
        username: req.user.username,
        joinedAt: new Date(),
        lastSeen: new Date()
      });
    }
    await meeting.save();
    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/heartbeat', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id
    });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (meeting.status !== 'live') return res.json(publicMeeting(meeting));
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.lastSeen = new Date();
      existing.leftAt = null;
      await meeting.save();
    }
    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id
    });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    const existing = meeting.participants.find((p) => String(p.user) === String(req.user._id));
    if (existing) {
      existing.leftAt = new Date();
      await meeting.save();
    }
    await MeetingSignal.create({
      meeting: meeting._id,
      from: req.user._id,
      to: req.user._id,
      kind: 'hangup',
      payload: { broadcast: true }
    }).catch(() => {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const text = String(req.body.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: 'Note is empty' });
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id
    });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
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

router.post('/:id/signal', async (req, res) => {
  try {
    const { to, kind, payload } = req.body || {};
    if (!to || !['offer', 'answer', 'ice', 'hangup'].includes(kind)) {
      return res.status(400).json({ message: 'Invalid signal' });
    }
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id,
      status: 'live'
    });
    if (!meeting) return res.status(404).json({ message: 'Live meeting not found' });
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
    const meeting = await Meeting.findOne({
      _id: req.params.id,
      company: req.user.company._id
    }).populate('host', 'username role');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    const isHost = String(meeting.host._id || meeting.host) === String(req.user._id);
    if (!isHost && !canSeeAll(req.user)) {
      return res.status(403).json({ message: 'Only the host can end this meeting' });
    }
    if (meeting.status === 'ended') return res.json(publicMeeting(meeting));

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
    });
    const durationMinutes = Math.max(
      1,
      Math.round((meeting.endedAt - meeting.startedAt) / 60000)
    );
    meeting.summary = await summarizeMeeting({
      companyId: req.user.company._id,
      title: meeting.title,
      participants: meeting.participants,
      notes: meeting.notes,
      durationMinutes
    });
    await meeting.save();
    res.json(publicMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
