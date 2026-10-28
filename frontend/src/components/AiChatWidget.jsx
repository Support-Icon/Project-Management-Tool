import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import AiChatPanel from './AiChatPanel';

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const hide = location.pathname === '/ai-chat' || location.pathname.startsWith('/messages');

  if (hide) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-2xl bg-brand-green hover:bg-brand-greenDark text-brand-ink shadow-xl flex items-center justify-center"
          title="Open AI assistant"
        >
          <Bot size={24} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(100vw-1.5rem,420px)] h-[min(80vh,640px)] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <AiChatPanel
            compact
            onClose={() => setOpen(false)}
            onExpand={() => {
              setOpen(false);
              navigate('/ai-chat');
            }}
          />
        </div>
      )}
    </>
  );
}
