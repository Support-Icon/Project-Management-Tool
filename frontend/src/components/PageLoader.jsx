import React from 'react';

export default function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5 px-6">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-black/10" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand-green border-r-brand-blue animate-spin" />
        <div className="absolute inset-3 rounded-full bg-brand-ink" />
        <div className="absolute inset-[18px] rounded-full bg-brand-yellow animate-pulse" />
      </div>
      <p className="text-sm font-semibold text-brand-ink tracking-wide">{label}</p>
    </div>
  );
}
