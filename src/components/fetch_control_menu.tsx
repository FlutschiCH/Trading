import React, { useState, useEffect, useRef } from 'react';
import { Filter, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { getFetchConfig, setFetchAllowed, setAllFetchAllowed, type FetchConfig, type FetchCategory } from '../services/fetchControlStore';

const CATEGORY_LABELS: { key: FetchCategory; label: string }[] = [
  { key: 'account_info', label: 'Account Info' },
  { key: 'positions', label: 'Positions' },
  { key: 'history', label: 'Trade History' },
  { key: 'candles', label: 'Candles' },
  { key: 'accounts_list', label: 'Accounts List' },
  { key: 'live_strategies', label: 'Live Strategies' },
  { key: 'news', label: 'News' },
];

export const FetchControlMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<FetchConfig>(getFetchConfig);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleChanged = () => {
      setConfig(getFetchConfig());
    };
    window.addEventListener('fetch_config_changed', handleChanged);
    return () => window.removeEventListener('fetch_config_changed', handleChanged);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeCount = Object.values(config).filter(Boolean).length;
  const totalCount = CATEGORY_LABELS.length;

  const toggleCategory = (key: FetchCategory) => {
    setFetchAllowed(key, !config[key]);
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Debug Fetch Controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: activeCount === totalCount ? 'rgba(30, 41, 59, 0.6)' : 'rgba(234, 179, 8, 0.15)',
          border: activeCount === totalCount ? '1px solid var(--app-card-border, #1f2937)' : '1px solid rgba(234, 179, 8, 0.4)',
          color: activeCount === totalCount ? 'var(--app-text-muted, #9ca3af)' : '#eab308',
          borderRadius: '6px',
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Filter size={14} />
        <span>Fetch ({activeCount}/{totalCount})</span>
        <ChevronDown size={12} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 99999,
            width: '220px',
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid #1f2937', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Fetch Toggles
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setAllFetchAllowed(true)}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
              >
                All
              </button>
              <button
                onClick={() => setAllFetchAllowed(false)}
                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
              >
                None
              </button>
            </div>
          </div>

          {CATEGORY_LABELS.map(({ key, label }) => {
            const checked = config[key] ?? true;
            return (
              <label
                key={key}
                onClick={(e) => {
                  e.preventDefault();
                  toggleCategory(key);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: checked ? '#f3f4f6' : '#6b7280',
                  backgroundColor: checked ? 'rgba(55, 65, 81, 0.3)' : 'transparent',
                  userSelect: 'none',
                }}
              >
                {checked ? <CheckSquare size={14} color="#3b82f6" /> : <Square size={14} color="#4b5563" />}
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
