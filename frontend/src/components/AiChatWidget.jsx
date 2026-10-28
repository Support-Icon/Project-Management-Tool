import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AiChatPanel from './AiChatPanel';

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const hide = location.pathname === '/ai-chat'
    || location.pathname.startsWith('/messages')
    || location.pathname.startsWith('/meet');

  if (hide) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ask-ai-btn fixed bottom-20 right-4 md:bottom-5 md:right-5 z-40"
          title="Ask AI"
        >
          Ask AI
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 right-3 md:bottom-5 md:right-5 z-40 w-[min(100vw-1.5rem,420px)] h-[min(70vh,640px)] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
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
