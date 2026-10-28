const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { buildChatModel } = require('../agent/llm');

const fallbackSummary = ({ title, participants, notes, durationMinutes }) => {
  const people = (participants || []).map((p) => p.username || 'Someone').join(', ') || 'No attendees listed';
  const noteLines = (notes || []).map((n) => `- ${n.username || 'Note'}: ${n.text}`).join('\n') || '- No notes were captured.';
  return [
    `**${title || 'Team meeting'}**`,
    `Duration: ${durationMinutes || 0} min`,
    `Participants: ${people}`,
    '',
    '**Notes**',
    noteLines,
    '',
    '_Enable the AI assistant in Settings for a richer auto-summary._'
  ].join('\n');
};

const summarizeMeeting = async ({ companyId, title, participants, notes, durationMinutes }) => {
  const base = { title, participants, notes, durationMinutes };
  try {
    const model = await buildChatModel(companyId);
    const noteText = (notes || []).map((n) => `${n.username || 'Someone'}: ${n.text}`).join('\n') || '(no notes)';
    const people = (participants || []).map((p) => p.username).filter(Boolean).join(', ') || 'unknown';
    const result = await model.invoke([
      new SystemMessage(
        'You write concise meeting summaries for a work team. Use short sections: Overview, Decisions, Action items, Follow-ups. Plain text with **bold** headings. Do not invent attendees or facts that are not in the notes.'
      ),
      new HumanMessage(
        `Meeting: ${title || 'Team meeting'}\nDuration: ${durationMinutes || 0} minutes\nParticipants: ${people}\n\nNotes / transcript:\n${noteText}`
      )
    ]);
    const content = typeof result?.content === 'string'
      ? result.content
      : Array.isArray(result?.content)
        ? result.content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('\n')
        : '';
    return content.trim() || fallbackSummary(base);
  } catch (_) {
    return fallbackSummary(base);
  }
};

module.exports = { summarizeMeeting };
