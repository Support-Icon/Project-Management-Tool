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
    // ses / resend = HTTPS (works on Render). gmail = SMTP (often blocked on Render)
    provider: { type: String, enum: ['ses', 'resend', 'gmail'], default: 'ses' },
    gmailUser: { type: String, trim: true, lowercase: true, default: '' },
    appPasswordEncrypted: { type: String, default: '' },
    resendApiKeyEncrypted: { type: String, default: '' },
    sesAccessKeyId: { type: String, trim: true, default: '' },
    sesSecretAccessKeyEncrypted: { type: String, default: '' },
    sesRegion: { type: String, trim: true, default: 'ap-south-1' },
    fromEmail: { type: String, trim: true, lowercase: true, default: '' },
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
  ai: {
    enabled: { type: Boolean, default: false },
    provider: {
      type: String,
      enum: ['groq', 'openai', 'gemini', 'claude'],
      default: 'groq'
    },
    model: { type: String, default: 'llama-3.3-70b-versatile' },
    apiKeyEncrypted: { type: String, default: '' },
    temperature: { type: Number, default: 0.2 }
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
