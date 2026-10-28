const mongoose = require('mongoose');

const STATUSES = ['working', 'leave', 'off'];

const attendanceSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true },
  status: { type: String, enum: STATUSES, default: 'working' },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null }
});

attendanceSchema.index({ company: 1, user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ company: 1, date: 1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);
Attendance.STATUSES = STATUSES;
module.exports = Attendance;
