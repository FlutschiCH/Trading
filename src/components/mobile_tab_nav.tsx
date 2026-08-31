import React from 'react';
import { BarChart2, Cpu, Activity, Zap, RefreshCw, PieChart, Database, Terminal, Smartphone } from 'lucide-react';
import DebugComponentBadge from './debug_component_badge';

export type MobileTab = 'chart' | 'backtester' | 'trades' | 'live_overview' | 'copytrader' | 'analyzer' | 'collector' | 'logs';

interface MobileTabNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onToggleLandscape?: () => void;
}

export default function MobileTabNav({ activeTab, onTabChange, onToggleLandscape }: MobileTabNavProps) {
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    { id: 'chart', label: 'Chart', icon: <BarChart2 size={18} /> },
    { id: 'backtester', label: 'Backtest', icon: <Cpu size={18} /> },
    { id: 'trades', label: 'Trades', icon: <Activity size={18} /> },
    { id: 'live_overview', label: 'Live', icon: <Zap size={18} /> },
    { id: 'copytrader', label: 'Copy', icon: <RefreshCw size={18} /> },
    { id: 'analyzer', label: 'Analyzer', icon: <PieChart size={18} /> },
    { id: 'collector', label: 'Collector', icon: <Database size={18} /> },
    { id: 'logs', label: 'Logs', icon: <Terminal size={18} /> },
  ];

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 999,
      display: 'flex',
      alignItems: 'center',
      backgroundColor: 'var(--app-card-bg, #0f172a)',
      borderTop: '1px solid var(--app-card-border, #1e293b)',
      padding: '6px 8px calc(6px + env(safe-area-inset-bottom, 0px)) 8px',
      gap: '4px',
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(12px)',
      background: 'var(--app-card-bg, #0f172a)'
    }}>
      <div style={{ flexShrink: 0, display: 'none' }}>
        <DebugComponentBadge name="MobileTabNav" />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: '4px'
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                flex: 1,
                minWidth: '52px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '6px 4px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: isActive ? '#3b82f6' : 'var(--app-text-muted, #94a3b8)',
                fontWeight: isActive ? '600' : '500',
                fontSize: '10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease-in-out',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{
                color: isActive ? '#3b82f6' : 'var(--app-text-muted, #94a3b8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {tab.icon}
              </div>
              <span>{tab.label}</span>
            </button>
          );
        })}

        {onToggleLandscape && (
          <button
            onClick={onToggleLandscape}
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              padding: '6px 6px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              fontWeight: '600',
              fontSize: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
              whiteSpace: 'nowrap'
            }}
            title="Open Landscape Overview Mode"
          >
            <Smartphone size={18} />
            <span>Sideways</span>
          </button>
        )}
      </div>
    </nav>
  );
}

