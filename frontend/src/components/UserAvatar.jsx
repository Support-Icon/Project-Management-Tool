import React from 'react';

export default function UserAvatar({ user, name, avatar, size = 32, className = '', online = false }) {
  const src = avatar || user?.avatar || '';
  const label = name || user?.username || '?';
  const px = Number(size) || 32;
  const dim = typeof size === 'number' ? `${size}px` : size;
  const dot = Math.max(8, Math.round(px * 0.28));
  const inner = src ? (
    <img
      src={src}
      alt={label}
      className={`w-full h-full object-cover rounded-xl ${className}`}
    />
  ) : (
    <div
      className={`w-full h-full rounded-xl bg-brand-green text-brand-ink flex items-center justify-center font-bold ${className}`}
      style={{ fontSize: Math.max(11, px * 0.4) }}
    >
      {label[0]?.toUpperCase() || '?'}
    </div>
  );
  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: dim, height: dim }}>
      {inner}
      {online && (
        <span
          className="absolute rounded-full bg-emerald-500 ring-2 ring-white"
          style={{ width: dot, height: dot, right: -1, bottom: -1 }}
          title="At work"
        />
      )}
    </span>
  );
}
