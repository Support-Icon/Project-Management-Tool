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
    gmailUser: settings?.email?.gmailUser || '',
    fromName: settings?.email?.fromName || 'ProjectFlow',
    assignmentEnabled: settings?.email?.assignmentEnabled ?? true,
    hasAppPassword: Boolean(settings?.email?.appPasswordEncrypted)
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

    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ message: 'Invalid timezone' });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ message: 'Digest time must use HH:mm format' });
    }
    if ((email.enabled || digest.enabled) && !email.gmailUser) {
      return res.status(400).json({ message: 'Gmail address is required' });
    }

    const existing = await CompanySettings.findOne({ company: req.user.company._id });
    const appPasswordEncrypted = email.appPassword
      ? encrypt(String(email.appPassword).replace(/\s/g, ''))
      : existing?.email?.appPasswordEncrypted || '';

    if ((email.enabled || digest.enabled) && !appPasswordEncrypted) {
      return res.status(400).json({ message: 'Gmail app password is required' });
    }

    const settings = await CompanySettings.findOneAndUpdate(
      { company: req.user.company._id },
      {
        $set: {
          'email.enabled': Boolean(email.enabled),
          'email.gmailUser': String(email.gmailUser || '').trim().toLowerCase(),
          'email.fromName': String(email.fromName || 'ProjectFlow').trim(),
          'email.assignmentEnabled': email.assignmentEnabled !== false,
          'email.appPasswordEncrypted': appPasswordEncrypted,
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
      return res.status(400).json({ message: 'Add an email to your user or enter a test recipient' });
    }

    const result = await sendWithCompany(req.user.company._id, {
      to: recipient,
      subject: 'ProjectFlow Gmail test',
      html: '<h2>Gmail configuration works</h2><p>Your ProjectFlow email settings are ready.</p>'
    });
    if (result.skipped) return res.status(400).json({ message: result.reason });
    res.json({ message: `Test email sent to ${recipient}` });
  } catch (error) {
    res.status(400).json({ message: `Email failed: ${error.message}` });
  }
});

module.exports = router;
