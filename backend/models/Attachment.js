const mongoose = require('mongoose');

/**
 * Files shared in chat are stored in MongoDB (Render's disk is ephemeral).
 * Kept under the 16 MB document limit by the upload size cap in routes/messages.js.
 */
const attachmentSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null
  },
  filename: { type: String, required: true, trim: true },
  mimeType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  data: { type: Buffer, required: true, select: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Attachment', attachmentSchema);
