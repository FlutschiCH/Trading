import React from 'react';
import { X, TrendingUp, TrendingDown, Clock, HelpCircle } from 'lucide-react';
import type { Candle } from '../types/trading';

interface UnifiedDetailsModalProps {
  candle: Candle | null;
  selectedTrade: any | null;
  symbol: string;
  timeframe: string;
  entryStabilityRule: string;
  sessionsTimezone: 'UTC' | 'Local';
  modalOrderVolume: number;
  setModalOrderVolume: (vol: number) => void;
  modalOrderBroker: string;
  setModalOrderBroker: (broker: string) => void;
  handleExecuteTradeAgain: () => void;
  executingModalOrder: boolean;
  modalOrderResult: { status: 'success' | 'error'; message: string } | null;
  handleLocateCandle: (params: { symbol: string; timeframe: string; candle_time: number }) => void;
  onClose: () => void;
  formatPrice: (price: number | undefined | null, symbol: string) => string;
}

export const UnifiedDetailsModal: React.FC<UnifiedDetailsModalProps> = ({
  candle,
  selectedTrade,
  symbol,
  timeframe,
  entryStabilityRule,
  sessionsTimezone,
  modalOrderVolume,
  setModalOrderVolume,
  modalOrderBroker,
  setModalOrderBroker,
  handleExecuteTradeAgain,
  executingModalOrder,
  modalOrderResult,
  handleLocateCandle,
  onClose,
  formatPrice,
}) => {
  if (!candle && !selectedTrade) return null;

  const activeCandle = candle || (selectedTrade?.triggerReason?.entry_candle ? selectedTrade.triggerReason.entry_candle : null);

  const pnl = selectedTrade ? Number(selectedTrade.pnl ?? selectedTrade.profit ?? selectedTrade.unrealized_profit ?? 0) : null;
  const side = selectedTrade
    ? (selectedTrade.type || selectedTrade.trade_side || selectedTrade.side || 'BUY').toUpperCase()
    : (activeCandle?.backtest_signal || 'INFO');

  const stage = activeCandle?.wyckoff_stage || 'TRANSITION';
  const timestampVal = activeCandle?.time || selectedTrade?.entryTimestamp || selectedTrade?.timestamp;
  const timestampStr = timestampVal
    ? new Date(Number(timestampVal) * 1000).toLocaleString('de-CH', {
        timeZone: sessionsTimezone === 'UTC' ? 'UTC' : undefined,
      })
    : 'N/A';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: '80px',
        right: '24px',
        zIndex: 9999,
        backgroundColor: '#0f172a',
        border: selectedTrade ? `2px solid ${pnl! >= 0 ? '#10b981' : '#ef4444'}` : '1px solid #334155',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 0, 0, 0.3)',
        borderRadius: '16px',
        width: '380px',
        maxHeight: '80vh',
        overflowY: 'auto',
        padding: '20px',
        color: '#f8fafc',
      }}
    >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(148, 163, 184, 0.05)',
          }}
        >
          <X size={18} />
        </button>

        {/* Header Badges & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: side === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : side === 'SELL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: side === 'BUY' ? '#10b981' : side === 'SELL' ? '#ef4444' : '#3b82f6',
            }}
          >
            {side}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(148, 163, 184, 0.15)',
              color: '#cbd5e1',
            }}
          >
            {stage}
          </span>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' }}>
            {selectedTrade ? 'Trade & Candle Details' : 'Candle Inspection Details'}
          </h2>
        </div>

        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '16px', fontFamily: 'monospace' }}>
          Timestamp: {timestampStr}
        </div>

        {/* Section 1: Trade Outcome / PnL Banner (If Trade Selected) */}
        {selectedTrade && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: pnl! >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${pnl! >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Net Profit/Loss</span>
              <span style={{ fontSize: '20px', fontWeight: 'bold', color: pnl! >= 0 ? '#10b981' : '#ef4444' }}>
                {pnl! >= 0 ? '+' : ''}${pnl!.toFixed(2)}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Outcome</span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: pnl! >= 0 ? '#10b981' : '#ef4444',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {pnl! >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {selectedTrade.outcome || (pnl! >= 0 ? 'PROFIT' : 'LOSS')}
              </span>
            </div>
          </div>
        )}

        {/* Section 2: Candle OHLC Data */}
        {activeCandle && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px 20px',
              fontSize: '12px',
              marginBottom: '16px',
              backgroundColor: '#1e293b',
              padding: '12px',
              borderRadius: '8px',
            }}
          >
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Open</span>
              <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(activeCandle.open, symbol)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>High</span>
              <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(activeCandle.high, symbol)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Low</span>
              <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(activeCandle.low, symbol)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Close</span>
              <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(activeCandle.close, symbol)}</span>
            </div>
          </div>
        )}

        {/* Section 3: Trade Order Execution Levels (If Trade Selected) */}
        {selectedTrade && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: '12px', marginBottom: '16px' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Entry Price</span>
              <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${formatPrice(selectedTrade.entryPrice ?? selectedTrade.entry_price, symbol)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Exit / Current Price</span>
              <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${formatPrice(selectedTrade.exitPrice ?? selectedTrade.price_current, symbol)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Stop Loss</span>
              <span style={{ color: '#ef4444', fontWeight: '500' }}>${formatPrice(selectedTrade.slPrice ?? selectedTrade.stop_loss, symbol)}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Take Profit</span>
              <span style={{ color: '#10b981', fontWeight: '500' }}>${formatPrice(selectedTrade.tpPrice ?? selectedTrade.take_profit, symbol)}</span>
            </div>
          </div>
        )}

        {/* Section 4: Wyckoff & Strategy Signal Conditions */}
        <div
          style={{
            borderTop: '1px solid #334155',
            paddingTop: '14px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>Wyckoff Signal:</span>
            <span style={{ fontWeight: 'bold', color: activeCandle?.wyckoff_signal ? '#38bdf8' : '#64748b' }}>
              {activeCandle?.wyckoff_signal || 'None'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>Entry Stability Rule:</span>
            <span style={{ fontWeight: 'bold', color: '#f59e0b', textTransform: 'capitalize' }}>
              {entryStabilityRule}
            </span>
          </div>

          {activeCandle?.accum_consec_bars !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8' }}>Accumulation Consecutive Bars:</span>
              <span
                style={{
                  fontWeight: 'bold',
                  color: activeCandle.accum_consec_bars >= 3 ? '#10b981' : '#ef4444',
                }}
              >
                {activeCandle.accum_consec_bars} / 3 required
              </span>
            </div>
          )}

          {(activeCandle?.backtest_signal || selectedTrade) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                padding: '6px 10px',
                borderRadius: '6px',
                marginTop: '4px',
              }}
            >
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>Strategy Signal Triggered:</span>
              <span style={{ fontWeight: 'bold', color: '#10b981' }}>{activeCandle?.backtest_signal || side}</span>
            </div>
          )}
        </div>

        {/* Section 5: Re-Execute Order Actions (If Trade Selected) */}
        {selectedTrade && (
          <div style={{ borderTop: '1px solid #334155', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> Duration
              </span>
              <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
                {selectedTrade.duration} bars / candles
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={13} /> Exit Reason
              </span>
              <span
                style={{
                  color: selectedTrade.exitReason?.includes('Stop Loss') ? '#ef4444' : selectedTrade.exitReason?.includes('Take Profit') ? '#10b981' : '#f1f5f9',
                  fontWeight: 'bold',
                }}
              >
                {selectedTrade.exitReason || 'Unknown'}
              </span>
            </div>

            <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🚀 Re-Execute Trade (Real / Broker Order)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Volume (Lots)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={modalOrderVolume}
                    onChange={(e) => setModalOrderVolume(parseFloat(e.target.value) || 0.01)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Broker Platform</label>
                  <select
                    value={modalOrderBroker}
                    onChange={(e) => setModalOrderBroker(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="metatrader">MetaTrader 5</option>
                    <option value="ctrader">cTrader</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleExecuteTradeAgain}
                disabled={executingModalOrder}
                style={{
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: executingModalOrder ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
                  opacity: executingModalOrder ? 0.7 : 1,
                }}
              >
                {executingModalOrder ? 'Placing Order...' : `⚡ Run ${side} Trade Again (With SL & TP)`}
              </button>

              {modalOrderResult && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    backgroundColor: modalOrderResult.status === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: modalOrderResult.status === 'success' ? '#34d399' : '#f87171',
                    border: `1px solid ${modalOrderResult.status === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}
                >
                  {modalOrderResult.message}
                </div>
              )}
            </div>

            {selectedTrade.entryTimestamp && (
              <button
                onClick={() => {
                  handleLocateCandle({
                    symbol: symbol,
                    timeframe: timeframe,
                    candle_time: selectedTrade.entryTimestamp,
                  });
                  onClose();
                }}
                style={{
                  marginTop: '8px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                📍 Go to Trade
              </button>
            )}
          </div>
        )}
    </div>
  );
};
