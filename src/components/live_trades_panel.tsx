import React from 'react';

interface Position {
  position_id: number;
  symbol: string;
  trade_side: string;
  volume: number;
  entry_price: number;
  unrealized_profit: number;
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
  openPositions: Position[];
  historyTrades: HistoryTrade[];
  loadingHistory: boolean;
  historyError: string | null;
  handleClosePosition: (position: Position) => void;
  isMobileLayout?: boolean;
}

export default function LiveTradesPanel({
  dailyPnl,
  weeklyPnl,
  openPositions,
  historyTrades,
  loadingHistory,
  historyError,
  handleClosePosition,
  isMobileLayout = false,
}: LiveTradesPanelProps) {
  if (isMobileLayout) {
    return (
      <div style={{ padding: '16px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f8fafc', fontWeight: 'bold' }}>
          📈 Live Trades & P&L
        </h3>
        
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>DAILY P&L</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: dailyPnl >= 0 ? '#10b981' : '#ef4444' }}>
              {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
            </span>
          </div>
          <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>WEEKLY P&L</span>
            <span style={{ fontSize: '16px', fontWeight: 'bold', color: weeklyPnl >= 0 ? '#10b981' : '#ef4444' }}>
              {weeklyPnl >= 0 ? '+' : ''}${weeklyPnl.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Open Positions */}
        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#f8fafc', fontWeight: 'bold' }}>Active Positions</h4>
        {openPositions.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '12px', paddingBottom: '20px' }}>No active positions.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {openPositions.map(p => (
              <div key={p.position_id} style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f8fafc' }}>{p.symbol} ({p.volume})</span>
                  <span style={{ fontSize: '10px', color: p.trade_side === 'BUY' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{p.trade_side} @ {p.entry_price.toFixed(5)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: p.unrealized_profit >= 0 ? '#10b981' : '#ef4444' }}>${p.unrealized_profit.toFixed(2)}</span>
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

        {/* Closed Deals */}
        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#f8fafc', fontWeight: 'bold' }}>History</h4>
        {loadingHistory ? (
          <div style={{ color: '#64748b', fontSize: '12px' }}>Loading history...</div>
        ) : historyError ? (
          <div style={{ color: '#ef4444', fontSize: '12px' }}>{historyError}</div>
        ) : historyTrades.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '12px' }}>No history found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
            {historyTrades.slice(0, 15).map(h => (
              <div key={h.ticket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #1f2937', paddingBottom: '6px' }}>
                <span style={{ color: '#94a3b8' }}>{h.symbol} ({h.volume})</span>
                <span style={{ fontWeight: 'bold', color: h.profit >= 0 ? '#10b981' : '#ef4444' }}>{h.profit >= 0 ? '+' : ''}${h.profit.toFixed(2)}</span>
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
      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px', padding: '10px' }}>
          <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>DAILY P&L</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: dailyPnl >= 0 ? '#10b981' : '#ef4444' }}>
            {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
          </span>
        </div>
        <div style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '8px', padding: '10px' }}>
          <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>WEEKLY P&L</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: weeklyPnl >= 0 ? '#10b981' : '#ef4444' }}>
            {weeklyPnl >= 0 ? '+' : ''}${weeklyPnl.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Open Positions */}
      <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#f8fafc', fontWeight: 'bold' }}>Positions</h4>
      {openPositions.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '11px', paddingBottom: '16px' }}>No active positions.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {openPositions.map(p => (
            <div key={p.position_id} style={{ backgroundColor: '#0b0f19', border: '1px solid #1f2937', borderRadius: '6px', padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#f8fafc' }}>{p.symbol} ({p.volume})</span>
                <span style={{ fontSize: '9px', color: p.trade_side === 'BUY' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{p.trade_side} @ {p.entry_price.toFixed(5)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: p.unrealized_profit >= 0 ? '#10b981' : '#ef4444' }}>${p.unrealized_profit.toFixed(2)}</span>
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

      {/* Closed Deals */}
      <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#f8fafc', fontWeight: 'bold' }}>History</h4>
      {loadingHistory ? (
        <div style={{ color: '#64748b', fontSize: '11px' }}>Loading...</div>
      ) : historyError ? (
        <div style={{ color: '#ef4444', fontSize: '11px' }}>{historyError}</div>
      ) : historyTrades.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '11px' }}>No history.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
          {historyTrades.slice(0, 10).map(h => (
            <div key={h.ticket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', borderBottom: '1px solid #1f2937', paddingBottom: '4px' }}>
              <span style={{ color: '#94a3b8' }}>{h.symbol} ({h.volume})</span>
              <span style={{ fontWeight: 'bold', color: h.profit >= 0 ? '#10b981' : '#ef4444' }}>{h.profit >= 0 ? '+' : ''}${h.profit.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
