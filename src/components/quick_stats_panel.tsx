import React from 'react';
import DebugComponentBadge from './debug_component_badge';

interface QuickStatsPanelProps {
  symbol?: string;
  timeframe?: string;
  isMobileLayout?: boolean;
}

export const QuickStatsPanel: React.FC<QuickStatsPanelProps> = ({
  symbol = 'EURUSD',
  timeframe = '5m',
  isMobileLayout = false,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      height: '100%',
      width: '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <DebugComponentBadge name="QuickStatsPanel" />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '12px',
      }}>
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Active Symbol</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>{symbol}</span>
        </div>

        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Timeframe</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>{timeframe}</span>
        </div>

        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Execution Status</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#f59e0b' }}>Running</span>
        </div>
      </div>

      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '12px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1' }}>System Status</span>
        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Multi-Account Dispatcher:</span>
            <span style={{ color: '#10b981', fontWeight: 'bold' }}>Ready</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Symbol Translator:</span>
            <span style={{ color: '#10b981', fontWeight: 'bold' }}>Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickStatsPanel;
