const express = require('express');
const CompanySettings = require('../models/CompanySettings');
const { auth, adminOnly } = require('../middleware/auth');
const { encrypt } = require('../utils/encryption');
const { isValidTimezone } = require('../utils/companyTime');
const { sendWithCompany } = require('../services/emailService');

const router = express.Router();
router.use(auth, adminOnly);

const normalizeProvider = (value) => {
  if (value === 'gmail' || value === 'resend' || value === 'ses') return value;
  return 'ses';
};

const publicSettings = (settings) => ({
  email: {
    enabled: settings?.email?.enabled || false,
    provider: settings?.email?.provider || 'ses',
    gmailUser: settings?.email?.gmailUser || '',
    fromEmail: settings?.email?.fromEmail || '',
    fromName: settings?.email?.fromName || 'ProjectFlow',
    sesAccessKeyId: settings?.email?.sesAccessKeyId || '',
    sesRegion: settings?.email?.sesRegion || 'ap-south-1',
    assignmentEnabled: settings?.email?.assignmentEnabled ?? true,
    hasAppPassword: Boolean(settings?.email?.appPasswordEncrypted),
    hasResendApiKey: Boolean(settings?.email?.resendApiKeyEncrypted),
    hasSesSecret: Boolean(settings?.email?.sesSecretAccessKeyEncrypted)
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
    const provider = normalizeProvider(email.provider);

    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ message: 'Invalid timezone' });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ message: 'Digest time must use HH:mm format' });
    }

    const existing = await CompanySettings.findOne({ company: req.user.company._id });
    let appPasswordEncrypted = existing?.email?.appPasswordEncrypted || '';
    let resendApiKeyEncrypted = existing?.email?.resendApiKeyEncrypted || '';
    let sesSecretAccessKeyEncrypted = existing?.email?.sesSecretAccessKeyEncrypted || '';

    const encryptSecret = (plain) => {
      if (!process.env.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY is not set on the server. Add it in Render Environment, then redeploy.');
      }
      return encrypt(String(plain).trim());
    };

    if (email.appPassword) {
      try {
        appPasswordEncrypted = encryptSecret(String(email.appPassword).replace(/\s/g, ''));
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }

    if (email.resendApiKey) {
      try {
        resendApiKeyEncrypted = encryptSecret(email.resendApiKey);
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }

    if (email.sesSecretAccessKey) {
      try {
        sesSecretAccessKeyEncrypted = encryptSecret(email.sesSecretAccessKey);
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }

    if (email.enabled || digest.enabled) {
      if (provider === 'ses') {
        if (!email.fromEmail) {
          return res.status(400).json({ message: 'SES From email is required (must be verified in AWS SES)' });
        }
        if (!email.sesAccessKeyId && !existing?.email?.sesAccessKeyId) {
          return res.status(400).json({ message: 'AWS Access Key ID is required' });
        }
        if (!sesSecretAccessKeyEncrypted) {
          return res.status(400).json({ message: 'AWS Secret Access Key is required' });
        }
      } else if (provider === 'resend') {
        if (!resendApiKeyEncrypted) {
          return res.status(400).json({ message: 'Resend API key is required' });
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
          'email.sesAccessKeyId': String(email.sesAccessKeyId || existing?.email?.sesAccessKeyId || '').trim(),
          'email.sesSecretAccessKeyEncrypted': sesSecretAccessKeyEncrypted,
          'email.sesRegion': String(email.sesRegion || 'ap-south-1').trim(),
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
        message: 'Enable email, choose AWS SES, Save Settings, then Send test.'
      });
    }

    const result = await sendWithCompany(req.user.company._id, {
      to: recipient,
      subject: 'ProjectFlow email test',
      html: '<h2>Email configuration works</h2><p>Your ProjectFlow AWS SES / email settings are ready.</p>'
    });
    if (result.skipped) return res.status(400).json({ message: result.reason });
    res.json({
      message: `Test email sent to ${recipient}${result.provider ? ` via ${result.provider}` : ''}`
    });
  } catch (error) {
    const message = error?.message || 'Email failed';
    console.error('Test email failed:', message);
    res.status(400).json({ message });
  }
});

router.delete('/email', async (req, res) => {
  try {
    const settings = await CompanySettings.findOneAndUpdate(
      { company: req.user.company._id },
      {
        $set: {
          'email.enabled': false,
          'email.provider': 'ses',
          'email.gmailUser': '',
          'email.fromEmail': '',
          'email.fromName': 'ProjectFlow',
          'email.assignmentEnabled': true,
          'email.appPasswordEncrypted': '',
          'email.resendApiKeyEncrypted': '',
          'email.sesAccessKeyId': '',
          'email.sesSecretAccessKeyEncrypted': '',
          'email.sesRegion': 'ap-south-1',
          'digest.enabled': false,
          'digest.time': '10:00',
          'digest.timezone': 'Asia/Kolkata',
          'digest.lastSentDate': '',
          'digest.lastSentAt': null,
          updatedAt: new Date()
        }
      },
      { new: true, upsert: true }
    );

    res.json({
      message: 'Email configuration deleted',
      ...publicSettings(settings)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
