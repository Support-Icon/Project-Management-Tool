const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    unique: true
  },
  email: {
    enabled: { type: Boolean, default: false },
    gmailUser: { type: String, trim: true, lowercase: true, default: '' },
    appPasswordEncrypted: { type: String, default: '' },
    fromName: { type: String, trim: true, default: 'ProjectFlow' },
    assignmentEnabled: { type: Boolean, default: true }
  },
  digest: {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: '10:00' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    lastSentDate: { type: String, default: '' },
    lastSentAt: { type: Date, default: null }
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
