const mongoose = require('mongoose');

const meetingSignalSchema = new mongoose.Schema({
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['offer', 'answer', 'ice', 'hangup'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

meetingSignalSchema.index({ meeting: 1, to: 1, createdAt: 1 });
meetingSignalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });

module.exports = mongoose.model('MeetingSignal', meetingSignalSchema);
