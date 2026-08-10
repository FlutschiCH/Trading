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
  tradingSessions?: any[];
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
  tradingSessions,
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

  // Calculate session readiness & condition checklists if activeCandle exists
  let inSession = true;
  let matchedSessionName = 'All Hours';
  let springLowOk = false;
  let springCloseOk = false;
  let buyStageOk = false;
  let accumBarsOk = true;
  let buyReady = false;
  let missingBuy: string[] = [];

  let utHighOk = false;
  let utCloseOk = false;
  let sellStageOk = false;
  let sellReady = false;
  let missingSell: string[] = [];

  if (activeCandle) {
    const activeSessions = (tradingSessions || []).filter((s) => s && s.active !== false);
    if (activeSessions.length > 0 && activeCandle.time) {
      const ts = Number(activeCandle.time);
      const d = new Date(ts * 1000);
      const day = sessionsTimezone === 'UTC' ? d.getUTCDay() : d.getDay();
      const weekdayNum = day === 0 ? 7 : day;
      const hours = sessionsTimezone === 'UTC' ? d.getUTCHours() : d.getHours();
      const minutes = sessionsTimezone === 'UTC' ? d.getUTCMinutes() : d.getMinutes();
      const timeVal = hours * 60 + minutes;

      inSession = false;
      for (const s of activeSessions) {
        const wdays = s.weekdays || [];
        if (wdays.length > 0 && !wdays.includes(weekdayNum)) continue;
        const [sh, sm] = (s.start || '00:00').split(':').map(Number);
        const [eh, em] = (s.end || '23:59').split(':').map(Number);
        const startVal = sh * 60 + sm;
        const endVal = eh * 60 + em;

        if (startVal <= endVal) {
          if (timeVal >= startVal && timeVal <= endVal) {
            inSession = true;
            matchedSessionName = s.name || 'Session';
            break;
          }
        } else {
          if (timeVal >= startVal || timeVal <= endVal) {
            inSession = true;
            matchedSessionName = s.name || 'Session';
            break;
          }
        }
      }
    }

    const sup = activeCandle.support_level;
    const res = activeCandle.resistance_level;

    springLowOk = sup != null ? activeCandle.low < sup : false;
    springCloseOk = sup != null ? activeCandle.close > sup : false;
    buyStageOk = stage !== 'DISTRIBUTION';
    const accumBars = activeCandle.accum_consec_bars ?? 0;
    accumBarsOk = entryStabilityRule === 'duration' || entryStabilityRule === 'both' ? accumBars >= 3 : true;
    buyReady = springLowOk && springCloseOk && buyStageOk && inSession && accumBarsOk;

    utHighOk = res != null ? activeCandle.high > res : false;
    utCloseOk = res != null ? activeCandle.close < res : false;
    sellStageOk = stage !== 'ACCUMULATION';
    sellReady = utHighOk && utCloseOk && sellStageOk && inSession;

    if (!springLowOk) missingBuy.push('Low < Support');
    if (!springCloseOk) missingBuy.push('Close > Support');
    if (!buyStageOk) missingBuy.push('Stage != Distribution');
    if (!inSession) missingBuy.push('Outside Trading Session');
    if (!accumBarsOk) missingBuy.push(`Accumulation Bars (${accumBars}/3)`);

    if (!utHighOk) missingSell.push('High > Resistance');
    if (!utCloseOk) missingSell.push('Close < Resistance');
    if (!sellStageOk) missingSell.push('Stage != Accumulation');
    if (!inSession) missingSell.push('Outside Trading Session');
  }

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
        width: '420px',
        maxHeight: '85vh',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
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
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' }}>
          {selectedTrade ? 'Trade & Candle Details' : 'Candle Details'}
        </h2>
      </div>

      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px', fontFamily: 'monospace' }}>
        Time: {timestampStr}
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
            marginBottom: '14px',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Net Profit/Loss</span>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: pnl! >= 0 ? '#10b981' : '#ef4444' }}>
              {pnl! >= 0 ? '+' : ''}${pnl!.toFixed(2)}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Outcome</span>
            <span
              style={{
                fontSize: '12px',
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
            gap: '8px 16px',
            fontSize: '11px',
            marginBottom: '14px',
            backgroundColor: '#1e293b',
            padding: '10px 12px',
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

      {/* Section 3: Full Wyckoff Readiness Checklists */}
      {activeCandle && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#94a3b8' }}>Session:</span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                backgroundColor: inSession ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: inSession ? '#10b981' : '#ef4444',
              }}
            >
              {inSession ? `✓ ${matchedSessionName}` : '✗ Outside Active Sessions'}
            </span>
          </div>

          {/* Spring Readiness */}
          <div style={{ backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${buyReady ? '#10b981' : '#334155'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <strong style={{ color: '#06b6d4' }}>🐂 Spring / Bullish Readiness:</strong>
              <span style={{ color: buyReady ? '#10b981' : '#f59e0b', fontWeight: 'bold', fontSize: '10px' }}>
                {buyReady ? '✓ ALL MET' : `Missing ${missingBuy.length}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '10px' }}>
              <span style={{ color: springLowOk ? '#10b981' : '#ef4444' }}>Low &lt; Sup: {springLowOk ? '✓' : '✗'}</span>
              <span style={{ color: springCloseOk ? '#10b981' : '#ef4444' }}>Close &gt; Sup: {springCloseOk ? '✓' : '✗'}</span>
              <span style={{ color: buyStageOk ? '#10b981' : '#ef4444' }}>Stage ({stage}): {buyStageOk ? '✓' : '✗'}</span>
              <span style={{ color: inSession ? '#10b981' : '#ef4444' }}>Session: {inSession ? '✓' : '✗'}</span>
              {(entryStabilityRule === 'duration' || entryStabilityRule === 'both') && (
                <span style={{ color: accumBarsOk ? '#10b981' : '#ef4444' }}>Accum. Bars ({activeCandle.accum_consec_bars ?? 0}/3): {accumBarsOk ? '✓' : '✗'}</span>
              )}
            </div>
            {!buyReady && (
              <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '4px' }}>
                ⚠️ Missing: {missingBuy.join(' • ')}
              </div>
            )}
          </div>

          {/* Upthrust Readiness */}
          <div style={{ backgroundColor: '#1e293b', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${sellReady ? '#10b981' : '#334155'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <strong style={{ color: '#f59e0b' }}>🐻 Upthrust / Bearish Readiness:</strong>
              <span style={{ color: sellReady ? '#10b981' : '#f59e0b', fontWeight: 'bold', fontSize: '10px' }}>
                {sellReady ? '✓ ALL MET' : `Missing ${missingSell.length}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '10px' }}>
              <span style={{ color: utHighOk ? '#10b981' : '#ef4444' }}>High &gt; Res: {utHighOk ? '✓' : '✗'}</span>
              <span style={{ color: utCloseOk ? '#10b981' : '#ef4444' }}>Close &lt; Res: {utCloseOk ? '✓' : '✗'}</span>
              <span style={{ color: sellStageOk ? '#10b981' : '#ef4444' }}>Stage ({stage}): {sellStageOk ? '✓' : '✗'}</span>
              <span style={{ color: inSession ? '#10b981' : '#ef4444' }}>Session: {inSession ? '✓' : '✗'}</span>
            </div>
            {!sellReady && (
              <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '4px' }}>
                ⚠️ Missing: {missingSell.join(' • ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 4: Re-Execute Order Actions (If Trade Selected) */}
      {selectedTrade && (
        <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={13} /> Duration
            </span>
            <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
              {selectedTrade.duration} bars / candles
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
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

          <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🚀 Re-Execute Trade
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
                    fontSize: '11px',
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
                    fontSize: '11px',
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
                padding: '8px',
                fontSize: '11px',
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
              {executingModalOrder ? 'Placing Order...' : `⚡ Run ${side} Trade Again`}
            </button>

            {modalOrderResult && (
              <div
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  fontSize: '10px',
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
                marginTop: '6px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px',
                fontSize: '11px',
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
