import React, { useState, useEffect } from 'react';

export interface TargetOption {
  label: string;
  url: string;
}

export const TARGET_OPTIONS: TargetOption[] = [
  { label: 'Local Host (Debug)', url: 'http://localhost:8751' },
  { label: 'Laptop (Live Proxy)', url: 'https://flugrok-production.up.railway.app' },
  { label: 'Laptop (Direct IP)', url: 'https://89.217.138.51:8751' },
];

export const DEFAULT_TARGET_URL = 'https://flugrok-production.up.railway.app';
export const STORAGE_KEY = 'wyckoff_api_target';

export const getApiBaseUrl = (): string => {
  if (typeof window === 'undefined') return DEFAULT_TARGET_URL;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_TARGET_URL;
};

export const isLocalTarget = (): boolean => {
  const url = getApiBaseUrl();
  return url.includes('localhost') || url.includes('127.0.0.1');
};

export const setApiBaseUrl = (url: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, url);
    window.location.reload();
  }
};

interface TargetSwitcherProps {
  compact?: boolean;
}

export const TargetSwitcher: React.FC<TargetSwitcherProps> = ({ compact = false }) => {
  const [currentUrl, setCurrentUrl] = useState<string>(DEFAULT_TARGET_URL);

  useEffect(() => {
    setCurrentUrl(getApiBaseUrl());
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCurrentUrl(val);
    setApiBaseUrl(val);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '6px',
        padding: compact ? '4px 8px' : '6px 12px',
        justifyContent: 'space-between',
      }}
    >
      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        Target API:
      </span>
      <select
        value={currentUrl}
        onChange={handleChange}
        style={{
          backgroundColor: '#1e293b',
          border: 'none',
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {TARGET_OPTIONS.map((opt) => (
          <option
            key={opt.url + opt.label}
            style={{ backgroundColor: '#1e293b', color: '#ffffff' }}
            value={opt.url}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
