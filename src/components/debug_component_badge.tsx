import React, { useState } from 'react';

interface DebugComponentBadgeProps {
  name: string;
  style?: React.CSSProperties;
}

export const isLocalEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'trading.flutschi.ch';
};

export const DebugComponentBadge: React.FC<DebugComponentBadgeProps> = ({ name, style }) => {
  const [copied, setCopied] = useState(false);

  if (!isLocalEnvironment()) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(name);
      } else {
        const el = document.createElement('textarea');
        el.value = name;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.warn('Failed to copy component name:', err);
    }
  };

  return (
    <div
      onClick={handleClick}
      title="Click to copy component name"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '9px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        padding: '2px 6px',
        borderRadius: '4px',
        backgroundColor: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(59, 130, 246, 0.2)',
        color: copied ? '#34d399' : '#60a5fa',
        border: `1px solid ${copied ? 'rgba(16, 185, 129, 0.6)' : 'rgba(59, 130, 246, 0.4)'}`,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
        ...style,
      }}
    >
      <span>{copied ? '✓' : '🏷️'}</span>
      <span>{copied ? `${name} (Copied!)` : name}</span>
    </div>
  );
};

export default DebugComponentBadge;
