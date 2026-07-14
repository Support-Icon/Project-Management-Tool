const express = require('express');
const { auth, adminOnly } = require('../middleware/auth');
const CompanySettings = require('../models/CompanySettings');
const { encrypt } = require('../utils/encryption');
const { runProjectAgent } = require('../agent/graph');
const { PROVIDER_DEFAULTS } = require('../agent/llm');

const router = express.Router();

const publicAiSettings = (settings) => ({
  enabled: settings?.ai?.enabled || false,
  provider: settings?.ai?.provider || 'groq',
  model: settings?.ai?.model || PROVIDER_DEFAULTS[settings?.ai?.provider || 'groq']?.model || '',
  temperature: settings?.ai?.temperature ?? 0.2,
  hasApiKey: Boolean(settings?.ai?.apiKeyEncrypted),
  providers: [
    { id: 'groq', label: 'Groq', defaultModel: PROVIDER_DEFAULTS.groq.model },
    { id: 'openai', label: 'OpenAI', defaultModel: PROVIDER_DEFAULTS.openai.model },
    { id: 'gemini', label: 'Gemini', defaultModel: PROVIDER_DEFAULTS.gemini.model },
    { id: 'claude', label: 'Claude', defaultModel: PROVIDER_DEFAULTS.claude.model }
  ]
});

router.get('/settings', auth, adminOnly, async (req, res) => {
  try {
    const settings = await CompanySettings.findOne({ company: req.user.company._id });
    res.json(publicAiSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/settings', auth, adminOnly, async (req, res) => {
  try {
    const { enabled, provider = 'groq', model, temperature = 0.2, apiKey } = req.body;
    const allowed = ['groq', 'openai', 'gemini', 'claude'];
    if (!allowed.includes(provider)) {
      return res.status(400).json({ message: 'Invalid AI provider' });
    }

    const existing = await CompanySettings.findOne({ company: req.user.company._id });
    let apiKeyEncrypted = existing?.ai?.apiKeyEncrypted || '';

    if (apiKey) {
      if (!process.env.ENCRYPTION_KEY) {
        return res.status(500).json({ message: 'ENCRYPTION_KEY is not set on the server.' });
      }
      apiKeyEncrypted = encrypt(String(apiKey).trim());
    }

    if (enabled && !apiKeyEncrypted) {
      return res.status(400).json({ message: 'AI API key is required when enabling the assistant.' });
    }

    const settings = await CompanySettings.findOneAndUpdate(
      { company: req.user.company._id },
      {
        $set: {
          'ai.enabled': Boolean(enabled),
          'ai.provider': provider,
          'ai.model': model || PROVIDER_DEFAULTS[provider].model,
          'ai.temperature': Number(temperature) || 0.2,
          'ai.apiKeyEncrypted': apiKeyEncrypted,
          updatedAt: new Date()
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(publicAiSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/settings', auth, adminOnly, async (req, res) => {
  try {
    const settings = await CompanySettings.findOneAndUpdate(
      { company: req.user.company._id },
      {
        $set: {
          'ai.enabled': false,
          'ai.provider': 'groq',
          'ai.model': PROVIDER_DEFAULTS.groq.model,
          'ai.temperature': 0.2,
          'ai.apiKeyEncrypted': '',
          updatedAt: new Date()
        }
      },
      { new: true, upsert: true }
    );
    res.json({ message: 'AI configuration cleared', ...publicAiSettings(settings) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/chat', auth, async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Message is required' });
    if (message.length > 4000) {
      return res.status(400).json({ message: 'Message is too long' });
    }

    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const result = await runProjectAgent({
      user: req.user,
      message,
      history
    });

    res.json(result);
  } catch (error) {
    console.error('AI chat failed:', error.message);
    res.status(400).json({ message: error.message || 'AI chat failed' });
  }
});

module.exports = router;
