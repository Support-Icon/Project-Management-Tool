import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Send, Sparkles, FolderPlus, ClipboardList, BarChart3, UserRound, X, Maximize2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AiMessageContent from './AiMessageContent';

const welcome = (role) =>
  role === 'admin'
    ? 'Hi! I can create projects, assign tasks, and show team daily-update reports. Use the actions below or type freely.'
    : 'Hi! I can help with your tasks, daily updates, and personal reports. Use the actions below or type freely.';

export default function AiChatPanel({ compact = false, onClose, onExpand }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [flow, setFlow] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: welcome(user?.role) },
  ]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, flow]);

  const loadOpenTasks = async () => {
    try {
      const projectRes = await api.get('/api/projects');
      const projectList = projectRes.data || [];
      setProjects(projectList);
      const taskLists = await Promise.all(
        projectList.slice(0, 12).map((p) =>
          api.get(`/api/tasks/${p._id}`).then((r) => r.data).catch(() => [])
        )
      );
      const flat = taskLists.flat().filter((t) => t.column !== 'done');
      setOpenTasks(flat);
      return flat;
    } catch (_) {
      return [];
    }
  };

  useEffect(() => {
    const load = async () => {
      await loadOpenTasks();
      if (isAdmin) {
        try {
          const userRes = await api.get('/api/users');
          setMembers(userRes.data || []);
        } catch (_) {}
      }
    };
    load();
  }, [isAdmin]);

  const push = (msg) => setMessages((prev) => [...prev, msg]);

  const startCreateProject = () => {
    if (!isAdmin) {
      toast.error('Only admins can create projects');
      return;
    }
    setFlow({ type: 'create_project', step: 'title', data: {} });
    push({
      role: 'assistant',
      content: 'Let’s create a project.\n\n**What should the project be named?**',
      suggestions: ['Website Redesign', 'Mobile App', 'Marketing Campaign', 'Internal Tools'],
    });
  };

  const startCreateTask = () => {
    if (!projects.length) {
      push({
        role: 'assistant',
        content: isAdmin
          ? 'No projects yet. Create a project first, then assign tasks.'
          : 'No projects assigned to you yet.',
      });
      return;
    }
    setFlow({ type: 'create_task', step: 'project', data: {} });
    push({
      role: 'assistant',
      content: 'Let’s create a task.\n\n**Which project should this task belong to?**\nPick one below or type the project name.',
      suggestions: projects.map((p) => p.title),
    });
  };

  const askReport = async () => {
    await sendFreeform(isAdmin ? 'Show the full team daily update report' : 'Show my personal report');
  };

  const finishCreateProject = async (data) => {
    setSending(true);
    try {
      const res = await api.post('/api/projects', {
        title: data.title,
        description: data.description || '',
      });
      setProjects((prev) => [res.data, ...prev]);
      setFlow(null);
      push({
        role: 'assistant',
        content: `Project **${res.data.title}** is ready.\n\nYou can open it from the sidebar, or say “create a task” to assign work.`,
      });
      toast.success('Project created');
    } catch (error) {
      push({ role: 'assistant', content: error.response?.data?.message || 'Failed to create project' });
    } finally {
      setSending(false);
    }
  };

  const finishCreateTask = async (data) => {
    setSending(true);
    try {
      const res = await api.post('/api/tasks', {
        title: data.title,
        description: data.description || '',
        projectId: data.projectId,
        column: 'todo',
        priority: data.priority || 'medium',
        assigneeId: data.assigneeId || undefined,
        dueDate: data.dueDate || undefined,
      });
      setFlow(null);
      await loadOpenTasks();
      const assigneeName = res.data.assignee?.username || 'unassigned';
      const dueLabel = data.dueDate || 'Not set';
      push({
        role: 'assistant',
        content: `Task **${res.data.title}** created in **${data.projectTitle}**, assigned to **${assigneeName}**, due **${dueLabel}**.`,
      });
      toast.success('Task created');
    } catch (error) {
      push({ role: 'assistant', content: error.response?.data?.message || 'Failed to create task' });
    } finally {
      setSending(false);
    }
  };

  const startCompleteTask = async () => {
    const tasks = await loadOpenTasks();
    if (!tasks.length) {
      push({ role: 'assistant', content: 'You have no open tasks to complete.' });
      return;
    }
    setFlow({ type: 'complete_task', step: 'pick', data: {} });
    push({
      role: 'assistant',
      content: 'Which task should I mark as **complete**?\nPick a task below or type its title.',
      suggestions: tasks.slice(0, 12).map((t) => t.title),
    });
  };

  const tomorrowIso = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const nextWeekIso = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };

  const parseDueDate = (answer) => {
    const text = String(answer || '').trim();
    if (/^skip|none|no$/i.test(text)) return null;
    if (/^tomorrow$/i.test(text)) return tomorrowIso();
    if (/^next week$/i.test(text)) return nextWeekIso();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return undefined;
  };

  const handleFlowAnswer = async (raw) => {
    const answer = String(raw || '').trim();
    if (!answer || !flow) return;

    push({ role: 'user', content: answer });
    setInput('');

    if (flow.type === 'create_project') {
      if (flow.step === 'title') {
        const data = { ...flow.data, title: answer };
        setFlow({ type: 'create_project', step: 'description', data });
        push({
          role: 'assistant',
          content: `Got it — **${answer}**.\n\n**Add a short description?** (or tap Skip)`,
          suggestions: ['Skip', 'Client delivery project', 'Internal ops work', 'Marketing launch'],
        });
        return;
      }
      if (flow.step === 'description') {
        const description = /^skip$/i.test(answer) ? '' : answer;
        const data = { ...flow.data, description };
        setFlow({ type: 'create_project', step: 'confirm', data });
        push({
          role: 'assistant',
          content: `Ready to create this project?\n\n- **Name:** ${data.title}\n- **Description:** ${description || 'None'}\n\nConfirm to create.`,
          suggestions: ['Confirm create project', 'Cancel'],
        });
        return;
      }
      if (flow.step === 'confirm') {
        if (/^cancel$/i.test(answer)) {
          setFlow(null);
          push({ role: 'assistant', content: 'Canceled. What else can I help with?' });
          return;
        }
        await finishCreateProject(flow.data);
      }
      return;
    }

    if (flow.type === 'create_task') {
      if (flow.step === 'project') {
        const found = projects.find((p) => p.title.toLowerCase() === answer.toLowerCase())
          || projects.find((p) => p.title.toLowerCase().includes(answer.toLowerCase()));
        if (!found) {
          push({
            role: 'assistant',
            content: `I couldn’t find a project named “${answer}”. Pick one of these:`,
            suggestions: projects.map((p) => p.title),
          });
          return;
        }
        const data = { ...flow.data, projectId: found._id, projectTitle: found.title };
        setFlow({ type: 'create_task', step: 'title', data });
        push({
          role: 'assistant',
          content: `Using project **${found.title}**.\n\n**What is the task title?**`,
          suggestions: ['UI polish', 'API integration', 'Bug fix', 'Write daily report'],
        });
        return;
      }

      if (flow.step === 'title') {
        const data = { ...flow.data, title: answer };
        if (isAdmin && members.length) {
          setFlow({ type: 'create_task', step: 'assignee', data });
          push({
            role: 'assistant',
            content: `Task title: **${answer}**.\n\n**Who should I assign this to?**`,
            suggestions: members.map((m) => m.username),
          });
        } else {
          setFlow({ type: 'create_task', step: 'priority', data });
          push({
            role: 'assistant',
            content: `Task title: **${answer}**.\n\n**What priority?**`,
            suggestions: ['low', 'medium', 'high'],
          });
        }
        return;
      }

      if (flow.step === 'assignee') {
        const found = members.find((m) => m.username.toLowerCase() === answer.toLowerCase())
          || members.find((m) => m.username.toLowerCase().includes(answer.toLowerCase()));
        if (!found) {
          push({
            role: 'assistant',
            content: `No teammate matched “${answer}”. Pick a username:`,
            suggestions: members.map((m) => m.username),
          });
          return;
        }
        const data = { ...flow.data, assigneeId: found._id, assigneeName: found.username };
        setFlow({ type: 'create_task', step: 'priority', data });
        push({
          role: 'assistant',
          content: `Assigning to **${found.username}**.\n\n**What priority?**`,
          suggestions: ['low', 'medium', 'high'],
        });
        return;
      }

      if (flow.step === 'priority') {
        const priority = ['low', 'medium', 'high'].includes(answer.toLowerCase())
          ? answer.toLowerCase()
          : 'medium';
        const data = { ...flow.data, priority };
        setFlow({ type: 'create_task', step: 'dueDate', data });
        push({
          role: 'assistant',
          content: `Priority: **${priority}**.\n\n**What is the due date?** (YYYY-MM-DD, or Skip)`,
          suggestions: [tomorrowIso(), nextWeekIso(), 'Skip'],
        });
        return;
      }

      if (flow.step === 'dueDate') {
        const dueDate = parseDueDate(answer);
        if (dueDate === undefined) {
          push({
            role: 'assistant',
            content: 'Please use **YYYY-MM-DD**, or tap Skip / Tomorrow.',
            suggestions: [tomorrowIso(), nextWeekIso(), 'Skip'],
          });
          return;
        }
        const data = { ...flow.data, dueDate };
        setFlow({ type: 'create_task', step: 'confirm', data });
        push({
          role: 'assistant',
          content: [
            'Confirm this task?',
            '',
            `- **Project:** ${data.projectTitle}`,
            `- **Title:** ${data.title}`,
            `- **Assignee:** ${data.assigneeName || user.username}`,
            `- **Priority:** ${data.priority}`,
            `- **Due date:** ${dueDate || 'Not set'}`,
            '',
            'Confirm to create.',
          ].join('\n'),
          suggestions: ['Confirm create task', 'Cancel'],
        });
        return;
      }

      if (flow.step === 'confirm') {
        if (/^cancel$/i.test(answer)) {
          setFlow(null);
          push({ role: 'assistant', content: 'Canceled. What else can I help with?' });
          return;
        }
        await finishCreateTask(flow.data);
      }
      return;
    }

    if (flow.type === 'complete_task') {
      if (flow.step === 'pick') {
        const found = openTasks.find((t) => t.title.toLowerCase() === answer.toLowerCase())
          || openTasks.find((t) => t.title.toLowerCase().includes(answer.toLowerCase()));
        if (!found) {
          push({
            role: 'assistant',
            content: `No open task matched “${answer}”. Pick one:`,
            suggestions: openTasks.slice(0, 12).map((t) => t.title),
          });
          return;
        }
        setFlow({ type: 'complete_task', step: 'confirm', data: { task: found } });
        push({
          role: 'assistant',
          content: `Mark **${found.title}** as complete (Done)?`,
          suggestions: ['Confirm complete', 'Cancel'],
        });
        return;
      }
      if (flow.step === 'confirm') {
        if (/^cancel$/i.test(answer)) {
          setFlow(null);
          push({ role: 'assistant', content: 'Canceled. What else can I help with?' });
          return;
        }
        setSending(true);
        try {
          await api.put(`/api/tasks/${flow.data.task._id}`, { column: 'done' });
          setFlow(null);
          await loadOpenTasks();
          push({
            role: 'assistant',
            content: `Task **${flow.data.task.title}** is now **complete** (moved to Done).`,
          });
          toast.success('Task completed');
        } catch (error) {
          push({ role: 'assistant', content: error.response?.data?.message || 'Failed to complete task' });
        } finally {
          setSending(false);
        }
      }
    }
  };

  const sendFreeform = async (text) => {
    const message = (text || input).trim();
    if (!message || sending) return;

    if (flow) {
      await handleFlowAnswer(message);
      return;
    }

    const nextHistory = [...messages, { role: 'user', content: message }];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await api.post('/api/ai/chat', {
        message,
        history: nextHistory.slice(-10),
      }, { timeout: 90000 });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.reply,
          toolsUsed: res.data.toolsUsed || [],
        },
      ]);
    } catch (error) {
      const err = error.response?.data?.message || error.message || 'AI request failed';
      toast.error(err);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry — ${err}` }]);
    } finally {
      setSending(false);
    }
  };

  const latestSuggestions = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.suggestions?.length);
    return last?.suggestions || [];
  }, [messages]);

  const actionChips = [
    isAdmin && { label: 'Create project', icon: FolderPlus, onClick: startCreateProject },
    { label: 'Create task', icon: ClipboardList, onClick: startCreateTask },
    { label: 'Complete task', icon: CheckCircle2, onClick: startCompleteTask },
    { label: isAdmin ? 'Team report' : 'My report', icon: isAdmin ? BarChart3 : UserRound, onClick: askReport },
  ].filter(Boolean);

  return (
    <div className={`flex flex-col bg-white ${compact ? 'h-full' : 'h-full min-h-[560px] rounded-2xl border border-slate-200 shadow-sm overflow-hidden'}`}>
      <header className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">ProjectFlow AI</p>
          <p className="text-[11px] text-indigo-100">
            {flow
              ? `Guided: ${flow.type === 'create_project' ? 'Create project' : 'Create task'} · step ${flow.step}`
              : isAdmin ? 'Admin assistant' : 'Personal assistant'}
          </p>
        </div>
        {onExpand && (
          <button type="button" onClick={onExpand} className="p-1.5 rounded-lg hover:bg-white/15" title="Full page">
            <Maximize2 size={15} />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15" title="Close">
            <X size={15} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 ${
              msg.role === 'user'
                ? 'ml-auto bg-indigo-600 text-white text-sm whitespace-pre-wrap'
                : 'bg-white border border-slate-200 shadow-sm'
            }`}
          >
            {msg.role === 'user' ? msg.content : <AiMessageContent content={msg.content} />}
            {msg.toolsUsed?.length > 0 && (
              <p className="mt-2 text-[10px] text-slate-400">Tools: {msg.toolsUsed.join(', ')}</p>
            )}
          </div>
        ))}
        {sending && (
          <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-500 w-fit flex items-center gap-2">
            <Bot size={14} className="animate-pulse" /> Working…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!flow && (
        <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto border-t border-slate-100 bg-white">
          {actionChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClick}
              disabled={sending}
              className="whitespace-nowrap text-[11px] px-2.5 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 flex items-center gap-1.5"
            >
              <chip.icon size={12} />
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {latestSuggestions.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 bg-white">
          <span className="w-full text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Suggestions</span>
          {latestSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => sendFreeform(item)}
              disabled={sending}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200"
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendFreeform();
        }}
        className="p-3 border-t border-slate-100 flex gap-2 bg-white flex-shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            flow
              ? `Answer: ${flow.step}…`
              : 'Ask anything, or use Create project / Create task…'
          }
          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
