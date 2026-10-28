const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, default: '' },
  text: { type: String, trim: true, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  username: { type: String, default: '' },
  isGuest: { type: Boolean, default: false },
  handRaised: { type: Boolean, default: false },
  isSharing: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null }
}, { _id: false });

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId },
  username: { type: String, default: '' },
  emoji: { type: String, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, trim: true, default: 'Team meeting' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participants: { type: [participantSchema], default: [] },
  status: { type: String, enum: ['live', 'ended'], default: 'live', index: true },
  notes: { type: [noteSchema], default: [] },
  reactions: { type: [reactionSchema], default: [] },
  language: { type: String, default: 'en' },
  guestToken: { type: String, index: true, unique: true, sparse: true },
  summary: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

meetingSchema.index({ company: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Meeting', meetingSchema);
