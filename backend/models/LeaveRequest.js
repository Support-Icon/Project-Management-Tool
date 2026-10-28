const mongoose = require('mongoose');

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const leaveRequestSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  reason: { type: String, trim: true, default: '' },
  status: { type: String, enum: STATUSES, default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, default: '' },
  createdAt: { type: Date, default: Date.now }
});

leaveRequestSchema.index({ company: 1, status: 1, createdAt: -1 });
leaveRequestSchema.index({ company: 1, user: 1, createdAt: -1 });

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
LeaveRequest.STATUSES = STATUSES;
module.exports = LeaveRequest;
