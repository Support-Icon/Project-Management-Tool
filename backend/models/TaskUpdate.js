const mongoose = require('mongoose');

const taskUpdateSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updateDate: { type: String, required: true },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  progressPercent: { type: Number, min: 0, max: 100, default: 0 },
  blockers: { type: String, trim: true, maxlength: 1000, default: '' },
  nextPlan: { type: String, trim: true, maxlength: 1000, default: '' },
  createdAt: { type: Date, default: Date.now }
});

taskUpdateSchema.index({ task: 1, updateDate: 1 }, { unique: true });
taskUpdateSchema.index({ company: 1, updateDate: 1 });

module.exports = mongoose.model('TaskUpdate', taskUpdateSchema);
