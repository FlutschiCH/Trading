import React from 'react';
import { usePositionsStore } from '../services/positionsStore';
import DebugComponentBadge from './debug_component_badge';

interface Position {
  position_id: number;
  symbol: string;
  trade_side: string;
  volume: number;
  entry_price: number;
  unrealized_profit: number;
  leverage?: number | string;
  marginType?: string;
  markPrice?: number | string;
  liquidationPrice?: number | string;
}

interface HistoryTrade {
  ticket: number;
  symbol: string;
  volume: number;
  profit: number;
}

interface LiveTradesPanelProps {
  dailyPnl: number;
  weeklyPnl: number;
  openPositions?: Position[];
  handleClosePosition: (position: Position) => void;
  isMobileLayout?: boolean;
}

export default function LiveTradesPanel({
  dailyPnl,
  weeklyPnl,
  openPositions: propsPositions,
  handleClosePosition,
  isMobileLayout = false,
}: LiveTradesPanelProps) {
  const { positions: storePositions } = usePositionsStore();
  const openPositions = storePositions.length > 0 ? storePositions : (propsPositions || []);
  if (isMobileLayout) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px 0', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--app-text, #f8fafc)', fontWeight: 'bold' }}>
            📈 Live Trades & P&L
          </h3>
          <DebugComponentBadge name="LiveTradesPanel" />
        </div>
        
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>DAILY P&L</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: (dailyPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(dailyPnl ?? 0) >= 0 ? '+' : ''}${Number(dailyPnl || 0).toFixed(2)}
            </span>
          </div>
          <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WEEKLY P&L</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: (weeklyPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
              {(weeklyPnl ?? 0) >= 0 ? '+' : ''}${Number(weeklyPnl || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Open Positions */}
        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--app-text, #f8fafc)', fontWeight: 'bold' }}>Active Positions</h4>
        {openPositions.length === 0 ? (
          <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '12px', paddingBottom: '20px' }}>No active positions.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {openPositions.map(p => (
              <div key={p.position_id} style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>{p.symbol} ({p.volume})</span>
                    {p.leverage ? (
                      <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308', fontWeight: 'bold' }}>
                        {p.leverage}x{p.marginType ? ` ${p.marginType.toUpperCase()}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: '10px', color: p.trade_side === 'BUY' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {p.trade_side} @ {Number(p.entry_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                  </span>
                  {p.markPrice ? (
                    <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                      Mark: {Number(p.markPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                      {p.liquidationPrice && Number(p.liquidationPrice) > 0 ? ` | Liq: ${Number(p.liquidationPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : ''}
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: (p.unrealized_profit ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>${Number(p.unrealized_profit || 0).toFixed(2)}</span>
                  <button 
                    onClick={() => handleClosePosition(p)}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Desktop panel layout
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <DebugComponentBadge name="LiveTradesPanel" />
      </div>
      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>DAILY P&L</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: (dailyPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
            {(dailyPnl ?? 0) >= 0 ? '+' : ''}${Number(dailyPnl || 0).toFixed(2)}
          </span>
        </div>
        <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WEEKLY P&L</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: (weeklyPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
            {(weeklyPnl ?? 0) >= 0 ? '+' : ''}${Number(weeklyPnl || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Open Positions */}
      <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--app-text, #f8fafc)', fontWeight: 'bold' }}>Positions</h4>
      {openPositions.length === 0 ? (
        <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '11px', paddingBottom: '16px' }}>No active positions.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {openPositions.map(p => (
            <div key={p.position_id} style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>{p.symbol} ({p.volume})</span>
                  {p.leverage ? (
                    <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308', fontWeight: 'bold' }}>
                      {p.leverage}x{p.marginType ? ` ${p.marginType.toUpperCase()}` : ''}
                    </span>
                  ) : null}
                </div>
                <span style={{ fontSize: '9px', color: p.trade_side === 'BUY' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                  {p.trade_side} @ {Number(p.entry_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                </span>
                {p.markPrice ? (
                  <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                    Mark: {Number(p.markPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                    {p.liquidationPrice && Number(p.liquidationPrice) > 0 ? ` | Liq: ${Number(p.liquidationPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : ''}
                  </span>
                ) : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: (p.unrealized_profit ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>${Number(p.unrealized_profit || 0).toFixed(2)}</span>
                <button 
                  onClick={() => handleClosePosition(p)}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '9px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
