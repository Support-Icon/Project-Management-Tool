import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Sparkles, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const SUGGESTIONS_ADMIN = [
  'Create a project called Website Launch',
  'List team members',
  'Show the full team daily update report',
  'Assign a task for UI polish to a teammate',
];

const SUGGESTIONS_MEMBER = [
  'Show my personal report',
  'List my assigned tasks',
  'Help me add today’s daily update',
  'What am I missing for today’s updates?',
];

export default function AiChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: user?.role === 'admin'
        ? 'Hi! I can help create projects, assign tasks, and show worker reports.'
        : 'Hi! I can help with your tasks, daily updates, and personal reports.',
    },
  ]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const suggestions = user?.role === 'admin' ? SUGGESTIONS_ADMIN : SUGGESTIONS_MEMBER;

  const send = async (text) => {
    const message = (text || input).trim();
    if (!message || sending) return;

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
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry — ${err}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center"
          title="Open AI assistant"
        >
          <Bot size={24} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(100vw-1.5rem,380px)] h-[min(75vh,560px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <header className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center gap-2">
            <Sparkles size={18} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">ProjectFlow AI</p>
              <p className="text-[11px] text-indigo-100 truncate">
                {user?.role === 'admin' ? 'Admin tools enabled' : 'Personal assistant'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/15 rounded-lg">
              <Minimize2 size={16} />
            </button>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/15 rounded-lg">
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'ml-auto bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-800'
                }`}
              >
                {msg.content}
                {msg.toolsUsed?.length > 0 && (
                  <p className="mt-2 text-[10px] text-slate-400">
                    Tools: {msg.toolsUsed.join(', ')}
                  </p>
                )}
              </div>
            ))}
            {sending && (
              <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-500 w-fit">
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto scrollbar-thin">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => send(item)}
                className="whitespace-nowrap text-[11px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100"
              >
                {item}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-3 border-t border-slate-100 flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask to assign tasks, report, create projects…"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
