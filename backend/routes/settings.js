const express = require('express');
const CompanySettings = require('../models/CompanySettings');
const { auth, adminOnly } = require('../middleware/auth');
const { encrypt } = require('../utils/encryption');
const { isValidTimezone } = require('../utils/companyTime');
const { sendWithCompany } = require('../services/emailService');

const router = express.Router();
router.use(auth, adminOnly);

const publicSettings = (settings) => ({
  email: {
    enabled: settings?.email?.enabled || false,
    provider: settings?.email?.provider || 'resend',
    gmailUser: settings?.email?.gmailUser || '',
    fromEmail: settings?.email?.fromEmail || '',
    fromName: settings?.email?.fromName || 'ProjectFlow',
    assignmentEnabled: settings?.email?.assignmentEnabled ?? true,
    hasAppPassword: Boolean(settings?.email?.appPasswordEncrypted),
    hasResendApiKey: Boolean(settings?.email?.resendApiKeyEncrypted)
  },
  digest: {
    enabled: settings?.digest?.enabled || false,
    time: settings?.digest?.time || '10:00',
    timezone: settings?.digest?.timezone || 'Asia/Kolkata',
    lastSentAt: settings?.digest?.lastSentAt || null
  }
});

router.get('/', async (req, res) => {
  try {
    const settings = await CompanySettings.findOne({ company: req.user.company._id });
    res.json(publicSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { email = {}, digest = {} } = req.body;
    const timezone = digest.timezone || 'Asia/Kolkata';
    const time = digest.time || '10:00';
    const provider = email.provider === 'gmail' ? 'gmail' : 'resend';

    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ message: 'Invalid timezone' });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ message: 'Digest time must use HH:mm format' });
    }

    const existing = await CompanySettings.findOne({ company: req.user.company._id });
    let appPasswordEncrypted = existing?.email?.appPasswordEncrypted || '';
    let resendApiKeyEncrypted = existing?.email?.resendApiKeyEncrypted || '';

    const encryptSecret = (plain, label) => {
      if (!process.env.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY is not set on the server. Add it in Render Environment, then redeploy.');
      }
      return encrypt(String(plain).replace(/\s/g, ''));
    };

    if (email.appPassword) {
      try {
        appPasswordEncrypted = encryptSecret(email.appPassword, 'App Password');
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }

    if (email.resendApiKey) {
      try {
        resendApiKeyEncrypted = encryptSecret(email.resendApiKey, 'Resend API key');
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }

    if (email.enabled || digest.enabled) {
      if (provider === 'resend') {
        if (!resendApiKeyEncrypted) {
          return res.status(400).json({ message: 'Resend API key is required for Render email delivery' });
        }
      } else if (!email.gmailUser || !appPasswordEncrypted) {
        return res.status(400).json({ message: 'Gmail address and App Password are required' });
      }
    }

    const settings = await CompanySettings.findOneAndUpdate(
      { company: req.user.company._id },
      {
        $set: {
          'email.enabled': Boolean(email.enabled),
          'email.provider': provider,
          'email.gmailUser': String(email.gmailUser || '').trim().toLowerCase(),
          'email.fromEmail': String(email.fromEmail || '').trim().toLowerCase(),
          'email.fromName': String(email.fromName || 'ProjectFlow').trim(),
          'email.assignmentEnabled': email.assignmentEnabled !== false,
          'email.appPasswordEncrypted': appPasswordEncrypted,
          'email.resendApiKeyEncrypted': resendApiKeyEncrypted,
          'digest.enabled': Boolean(digest.enabled),
          'digest.time': time,
          'digest.timezone': timezone,
          updatedAt: new Date()
        }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json(publicSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/test-email', async (req, res) => {
  try {
    const recipient = String(req.body.recipient || req.user.email || '').trim();
    if (!recipient) {
      return res.status(400).json({ message: 'Enter a test recipient email address first.' });
    }

    const settings = await CompanySettings.findOne({ company: req.user.company._id });
    if (!settings?.email?.enabled) {
      return res.status(400).json({
        message: 'Enable email, choose Resend (recommended on Render), Save Settings, then Send test.'
      });
    }

    const result = await sendWithCompany(req.user.company._id, {
      to: recipient,
      subject: 'ProjectFlow email test',
      html: '<h2>Email configuration works</h2><p>Your ProjectFlow email settings are ready.</p>'
    });
    if (result.skipped) return res.status(400).json({ message: result.reason });
    res.json({
      message: `Test email sent to ${recipient}${result.provider ? ` via ${result.provider}` : ''}`
    });
  } catch (error) {
    console.error('Test email failed:', error);
    res.status(400).json({ message: error.message || 'Email failed' });
  }
});

module.exports = router;
