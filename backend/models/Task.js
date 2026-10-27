const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  column: { type: String, required: true },
  order: { type: Number, default: 0 },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  dueDate: { type: Date, default: null },
  startDate: { type: Date, default: null },
  // Expected completion window, e.g. { value: 2, unit: 'hours' } or { value: 1, unit: 'days' }
  duration: {
    value: { type: Number, default: null },
    unit: { type: String, enum: ['minutes', 'hours', 'days', null], default: null }
  },
  // Exact deadline (computed from assignment time + duration, in company time — IST by default)
  deadlineAt: { type: Date, default: null },
  assignedAt: { type: Date, default: null },
  // Start this task only after the dependency task is completed
  dependsOn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  tags: [{ type: String, trim: true }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: { type: Date, default: null },
  lastUpdateAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', taskSchema);
