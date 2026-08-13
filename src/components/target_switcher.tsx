import React, { useState, useEffect } from 'react';

import { HARDCODED_HOSTS, type TargetOption } from '../services/computersStore';

export type { TargetOption };
export const LAPTOP_LIVE_URL = 'https://flugrok-production.up.railway.app';
export const TARGET_OPTIONS: TargetOption[] = HARDCODED_HOSTS;


export const DEFAULT_TARGET_URL = LAPTOP_LIVE_URL;
export const STORAGE_KEY = 'wyckoff_api_target';

export const getApiBaseUrl = (): string => {
  if (import.meta.env.PROD) {
    return LAPTOP_LIVE_URL;
  }
  if (typeof window === 'undefined') return DEFAULT_TARGET_URL;
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_TARGET_URL;
};

export const isLocalTarget = (): boolean => {
  const url = getApiBaseUrl();
  return url.includes('localhost') || url.includes('127.0.0.1');
};

export const setApiBaseUrl = (url: string): void => {
  if (import.meta.env.PROD) return;
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
  const isProd = import.meta.env.PROD;

  useEffect(() => {
    setCurrentUrl(getApiBaseUrl());
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isProd) return;
    const val = e.target.value;
    setCurrentUrl(val);
    setApiBaseUrl(val);
  };

  if (isProd) {
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
        }}
      >
        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>
          Target API:
        </span>
        <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 'bold' }}>
          Laptop (Live Proxy)
        </span>
      </div>
    );
  }

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

