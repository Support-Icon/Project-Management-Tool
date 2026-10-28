import React from 'react';

export default function UserAvatar({ user, name, avatar, size = 32, className = '' }) {
  const src = avatar || user?.avatar || '';
  const label = name || user?.username || '?';
  const dim = typeof size === 'number' ? `${size}px` : size;
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={`rounded-xl object-cover flex-shrink-0 ${className}`}
        style={{ width: dim, height: dim }}
      />
    );
  }
  return (
    <div
      className={`rounded-xl bg-brand-green text-brand-ink flex items-center justify-center font-bold flex-shrink-0 ${className}`}
      style={{ width: dim, height: dim, fontSize: Math.max(11, (Number(size) || 32) * 0.4) }}
    >
      {label[0]?.toUpperCase() || '?'}
    </div>
  );
}
