const mongoose = require('mongoose');

const columnSchema = new mongoose.Schema({
  id: String,
  title: String,
  color: String,
  order: Number
}, { _id: false });

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  columns: {
    type: [columnSchema],
    default: [
      { id: 'todo', title: 'To Do', color: '#6366f1', order: 0 },
      { id: 'inprogress', title: 'In Progress', color: '#f59e0b', order: 1 },
      { id: 'review', title: 'Review', color: '#8b5cf6', order: 2 },
      { id: 'done', title: 'Done', color: '#10b981', order: 3 }
    ]
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Project', projectSchema);
