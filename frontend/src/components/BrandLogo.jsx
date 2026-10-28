import React from 'react';

export default function BrandLogo({ className = 'h-8', alt = 'Supporticon' }) {
  const src = `${import.meta.env.BASE_URL}supporticon-logo.png`;
  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain object-left select-none ${className}`}
      draggable={false}
    />
  );
}
