import type { Position } from '../types/trading';
import { TrendingUp, TrendingDown, Layers } from 'lucide-react';
import DebugComponentBadge from './debug_component_badge';

interface PositionsPanelProps {
  positions: Position[];
  onClosePosition?: (positionId: number) => void;
  isMobile?: boolean;
}

export const PositionsPanel: React.FC<PositionsPanelProps> = ({
  positions,
  onClosePosition,
  isMobile = false,
}) => {
  if (!positions || positions.length === 0) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        backgroundColor: 'var(--app-card-bg)',
        border: '1px solid var(--app-card-border)',
        borderRadius: '12px',
        color: 'var(--app-text-muted)',
        fontSize: '13px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <DebugComponentBadge name="PositionsPanel" />
        </div>
        <Layers size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <div>No open positions currently active.</div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: 'var(--app-card-bg)',
      border: '1px solid var(--app-card-border)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        backgroundColor: 'var(--app-panel-header-bg)',
        borderBottom: '1px solid var(--app-card-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--app-text)' }}>
          Active Positions ({positions.length})
        </span>
        <DebugComponentBadge name="PositionsPanel" />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--app-card-border)', color: 'var(--app-text-muted)' }}>
              <th style={{ padding: '10px 16px' }}>ID</th>
              <th style={{ padding: '10px 16px' }}>Symbol</th>
              <th style={{ padding: '10px 16px' }}>Side</th>
              <th style={{ padding: '10px 16px' }}>Volume</th>
              <th style={{ padding: '10px 16px' }}>Entry Price</th>
              <th style={{ padding: '10px 16px' }}>Unrealized PnL</th>
              {onClosePosition && <th style={{ padding: '10px 16px', textAlign: 'right' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const isBuy = pos.trade_side.toUpperCase() === 'BUY';
              const profit = pos.unrealized_profit ?? 0;
              return (
                <tr key={pos.position_id} style={{ borderBottom: '1px solid var(--app-card-border)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--app-text-muted)' }}>#{pos.position_id}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 'bold', color: 'var(--app-text)' }}>{pos.symbol}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isBuy ? '#10b981' : '#ef4444',
                    }}>
                      {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {pos.trade_side.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--app-text)' }}>{pos.volume}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--app-text)' }}>{pos.entry_price}</td>
                  <td style={{
                    padding: '10px 16px',
                    fontWeight: 'bold',
                    color: profit >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    {profit >= 0 ? `+${profit.toFixed(2)}` : profit.toFixed(2)}
                  </td>
                  {onClosePosition && (
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => onClosePosition(pos.position_id)}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        Close
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PositionsPanel;
