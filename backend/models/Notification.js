const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['task_assigned', 'task_completed', 'message', 'report', 'system', 'leave', 'meeting'],
    default: 'system'
  },
  title: { type: String, required: true, trim: true },
  body: { type: String, trim: true, default: '' },
  // Frontend route to open when clicked, e.g. /kanban/<projectId> or /messages/<conversationId>
  link: { type: String, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
// Keep notifications for 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('Notification', notificationSchema);
