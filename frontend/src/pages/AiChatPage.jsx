import React from 'react';
import AiChatPanel from '../components/AiChatPanel';

export default function AiChatPage() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto h-[calc(100vh-3.5rem)] animate-fade-in">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-slate-800">AI Chat</h2>
        <p className="text-sm text-slate-500 mt-1">
          Guided create flows ask one question at a time. Free chat can also assign tasks and fetch reports.
        </p>
      </div>
      <div className="h-[calc(100%-4.5rem)]">
        <AiChatPanel />
      </div>
    </div>
  );
}
