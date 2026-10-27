const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  // direct = 1:1 DM; company = everyone in the company
  type: { type: String, enum: ['direct', 'company'], required: true },
  name: { type: String, trim: true, default: '' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Sorted "idA:idB" key so a direct conversation between two people is unique
  directKey: { type: String, default: null },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: Date, default: null },
  lastSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});

conversationSchema.index({ company: 1, type: 1 });
conversationSchema.index({ company: 1, directKey: 1 }, { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.statics.directKeyFor = (a, b) => [String(a), String(b)].sort().join(':');

module.exports = mongoose.model('Conversation', conversationSchema);
