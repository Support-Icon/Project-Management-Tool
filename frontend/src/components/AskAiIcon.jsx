import React from 'react';
import { Sparkles } from 'lucide-react';

export default function AskAiIcon({ size = 18, className = 'w-9 h-9 rounded-xl bg-white/15 text-white' }) {
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      <Sparkles size={size} />
    </span>
  );
}
