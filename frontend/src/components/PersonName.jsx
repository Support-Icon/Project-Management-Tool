import React from 'react';
import UserAvatar from './UserAvatar';

export default function PersonName({
  user, name, avatar, size = 24, className = '', nameClassName = '',
}) {
  const label = name || user?.username || 'Someone';
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 max-w-full ${className}`}>
      <UserAvatar user={user} name={label} avatar={avatar} size={size} className="rounded-full" />
      <span className={`truncate ${nameClassName}`}>{label}</span>
    </span>
  );
}
