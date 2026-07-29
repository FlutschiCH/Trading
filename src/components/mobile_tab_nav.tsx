import React from 'react';

export type MobileTab = 'chart' | 'backtester' | 'trades' | 'live_overview';

interface MobileTabNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

export default function MobileTabNav({ activeTab, onTabChange }: MobileTabNavProps) {
  return (
    <div style={{
      position: 'sticky',
      top: '56px',
      zIndex: 90,
      display: 'flex',
      backgroundColor: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '4px',
      marginBottom: '16px',
      gap: '4px',
      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)'
    }}>
      <button
        onClick={() => onTabChange('chart')}
        style={{
          flex: 1,
          padding: '8px 6px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: activeTab === 'chart' ? '#2563eb' : 'transparent',
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
      >
        📊 Chart
      </button>
      <button
        onClick={() => onTabChange('backtester')}
        style={{
          flex: 1,
          padding: '8px 6px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: activeTab === 'backtester' ? '#2563eb' : 'transparent',
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
      >
        ⚙️ Backtest
      </button>
      <button
        onClick={() => onTabChange('trades')}
        style={{
          flex: 1,
          padding: '8px 6px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: activeTab === 'trades' ? '#2563eb' : 'transparent',
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
      >
        📈 Trades
      </button>
      <button
        onClick={() => onTabChange('live_overview')}
        style={{
          flex: 1,
          padding: '8px 6px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: activeTab === 'live_overview' ? '#2563eb' : 'transparent',
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '11px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
      >
        ⚡ Live
      </button>
    </div>
  );
}
