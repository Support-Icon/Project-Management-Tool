const { ChatOpenAI } = require('@langchain/openai');
const { ChatAnthropic } = require('@langchain/anthropic');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const CompanySettings = require('../models/CompanySettings');
const { decrypt } = require('../utils/encryption');

const PROVIDER_DEFAULTS = {
  groq: { model: 'llama-3.3-70b-versatile' },
  openai: { model: 'gpt-4o-mini' },
  gemini: { model: 'gemini-2.0-flash' },
  claude: { model: 'claude-3-5-haiku-latest' }
};

const getAiConfig = async (companyId) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  const ai = settings?.ai;
  if (!ai?.enabled) {
    throw new Error('AI assistant is disabled. Admin can enable it in Settings.');
  }
  if (!ai.apiKeyEncrypted) {
    throw new Error('AI API key is missing. Admin must add it in Settings.');
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is missing on the server.');
  }

  let apiKey;
  try {
    apiKey = decrypt(ai.apiKeyEncrypted);
  } catch (_) {
    throw new Error('Could not decrypt AI API key. Re-save the key in Settings.');
  }

  const provider = ai.provider || 'groq';
  const model = ai.model || PROVIDER_DEFAULTS[provider]?.model;
  return { provider, model, apiKey, temperature: ai.temperature ?? 0.2 };
};

const buildChatModel = async (companyId) => {
  const { provider, model, apiKey, temperature } = await getAiConfig(companyId);

  if (provider === 'openai') {
    return new ChatOpenAI({ apiKey, model, temperature });
  }
  if (provider === 'groq') {
    return new ChatOpenAI({
      apiKey,
      model,
      temperature,
      configuration: { baseURL: 'https://api.groq.com/openai/v1' }
    });
  }
  if (provider === 'claude') {
    return new ChatAnthropic({ apiKey, model, temperature });
  }
  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({ apiKey, model, temperature });
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
};

module.exports = { buildChatModel, getAiConfig, PROVIDER_DEFAULTS };
