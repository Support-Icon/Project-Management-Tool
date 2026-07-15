const { createReactAgent } = require('@langchain/langgraph/prebuilt');
const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');
const { buildChatModel } = require('./llm');
const { buildAgentTools } = require('./tools');

const systemPromptFor = (user) => {
  const roleLine = user.role === 'admin'
    ? 'You are assisting a company ADMIN. You can create projects, assign tasks to teammates, and show the full team daily-update report.'
    : 'You are assisting a TEAM MEMBER. You can only work with their own assigned tasks, add their own daily updates, and show their personal report.';

  return [
    'You are ProjectFlow AI, a project management assistant powered by a LangGraph tool agent.',
    roleLine,
    'Use tools for real actions. Prefer tools over guessing IDs.',
    'When creating/assigning tasks or projects, ask ONE missing question at a time (project name, task title, assignee username, due date YYYY-MM-DD, priority). Do not dump a long form.',
    'When the user asks to complete/finish/done a task, use complete_task (list_tasks first if needed) so the kanban status becomes done.',
    'When listing choices, put each option on its own bullet line so the UI can show them clearly.',
    'For reports, format as readable cards — NOT markdown tables. Example:\n**Team Daily-Update Report (DATE)**\n\n• **Jaisudharshan** (member)\n  Open tasks: 1\n  Daily updated correctly: 0\n  Missed daily updates: 1\n\nThen a one-line summary.',
    'For daily updates, only the assignee can submit. Suggest clear progress notes.',
    'Admin reports: use get_team_report. Personal reports: use get_personal_report.',
    'Keep answers concise and practical.',
    `Current user: ${user.username} (${user.role}). Company: ${user.company?.name || 'company'}.`
  ].join(' ');
};

const toLangChainMessages = (history = []) => {
  const messages = [];
  for (const item of history.slice(-12)) {
    if (!item?.content) continue;
    if (item.role === 'user') messages.push(new HumanMessage(item.content));
    if (item.role === 'assistant') messages.push(new AIMessage(item.content));
  }
  return messages;
};

const runProjectAgent = async ({ user, message, history = [] }) => {
  const model = await buildChatModel(user.company._id);
  const tools = buildAgentTools(user);
  const agent = createReactAgent({ llm: model, tools });

  const result = await agent.invoke({
    messages: [
      new SystemMessage(systemPromptFor(user)),
      ...toLangChainMessages(history),
      new HumanMessage(message)
    ]
  });

  const msgs = result.messages || [];
  const lastAi = [...msgs].reverse().find((m) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage');
  const reply = typeof lastAi?.content === 'string'
    ? lastAi.content
    : Array.isArray(lastAi?.content)
      ? lastAi.content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('\n')
      : 'Done.';

  const toolNames = msgs
    .filter((m) => m._getType?.() === 'tool' || m.constructor?.name === 'ToolMessage')
    .map((m) => m.name)
    .filter(Boolean);

  return {
    reply: reply || 'Done.',
    toolsUsed: [...new Set(toolNames)]
  };
};

module.exports = { runProjectAgent };
