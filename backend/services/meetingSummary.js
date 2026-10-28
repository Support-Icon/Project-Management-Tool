const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { buildChatModel } = require('../agent/llm');

const LANGUAGE_NAMES = {
  en: 'English',
  ta: 'Tamil',
  hi: 'Hindi',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  es: 'Spanish',
  fr: 'French',
  ar: 'Arabic'
};

const cleanSummary = (text) => String(text || '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/__(.*?)__/g, '$1')
  .replace(/\*(.*?)\*/g, '$1')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/`{1,3}/g, '')
  .replace(/^\s*[-*]\s+/gm, '• ')
  .trim();

const fallbackSummary = ({ title, participants, notes, durationMinutes }) => {
  const people = (participants || []).map((p) => p.username || 'Someone').join(', ') || 'No attendees listed';
  const noteLines = (notes || []).map((n) => `• ${n.username || 'Note'}: ${n.text}`).join('\n') || '• No notes were captured.';
  return [
    `${title || 'Team meeting'}`,
    `Duration: ${durationMinutes || 0} min`,
    `Participants: ${people}`,
    '',
    'Notes',
    noteLines
  ].join('\n');
};

const summarizeMeeting = async ({ companyId, title, participants, notes, durationMinutes, language = 'en' }) => {
  const base = { title, participants, notes, durationMinutes };
  const langName = LANGUAGE_NAMES[language] || 'English';
  try {
    const model = await buildChatModel(companyId);
    const noteText = (notes || []).map((n) => `${n.username || 'Someone'}: ${n.text}`).join('\n') || '(no notes)';
    const people = (participants || []).map((p) => p.username).filter(Boolean).join(', ') || 'unknown';
    const result = await model.invoke([
      new SystemMessage(
        `You write concise meeting summaries for a work team in ${langName}. Use short sections labelled Overview, Decisions, Action items, Follow-ups. Write plain text only. Do not use markdown, asterisks, hashes, or bold markers. Do not invent attendees or facts that are not in the notes.`
      ),
      new HumanMessage(
        `Meeting: ${title || 'Team meeting'}\nDuration: ${durationMinutes || 0} minutes\nParticipants: ${people}\nLanguage: ${langName}\n\nNotes / transcript:\n${noteText}`
      )
    ]);
    const content = typeof result?.content === 'string'
      ? result.content
      : Array.isArray(result?.content)
        ? result.content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('\n')
        : '';
    return cleanSummary(content) || fallbackSummary(base);
  } catch (_) {
    return fallbackSummary(base);
  }
};

module.exports = { summarizeMeeting, cleanSummary, LANGUAGE_NAMES };
