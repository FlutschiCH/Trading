import React from 'react';
import { X } from 'lucide-react';
import type { Candle } from '../types/trading';

interface CandleDetailsCardProps {
  selectedCandle: Candle | null;
  candles?: Candle[];
  symbol: string;
  timeframe: string;
  entryStabilityRule: string;
  sessionsTimezone: 'UTC' | 'Local';
  tradingSessions?: any[];
  onClose: () => void;
  formatPrice: (price: number | undefined | null, symbol: string) => string;
  formatDateTime: (timestamp: number) => string;
}

export const CandleDetailsCard: React.FC<CandleDetailsCardProps> = ({
  selectedCandle,
  candles = [],
  symbol,
  timeframe,
  entryStabilityRule,
  sessionsTimezone,
  tradingSessions,
  onClose,
  formatPrice,
  formatDateTime,
}) => {
  if (!selectedCandle) return null;

  const stage = selectedCandle.wyckoff_stage || 'TRANSITION';
  const sup = selectedCandle.support_level;
  const res = selectedCandle.resistance_level;

  // Calculate session status
  const activeSessions = (tradingSessions || []).filter((s) => s && s.active !== false);
  let inSession = true;
  let matchedSessionName = 'All Hours';

  if (activeSessions.length > 0) {
    const ts = Number(selectedCandle.time);
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

  // Spring / BUY checks
  const springLowOk = sup != null ? selectedCandle.low < sup : false;
  const springCloseOk = sup != null ? selectedCandle.close > sup : false;
  const buyStageOk = stage !== 'DISTRIBUTION';

  // Compute accumBars: use pre-calculated accum_consec_bars or calculate retroactively across historical candles
  let accumBars = selectedCandle.accum_consec_bars;
  if (accumBars === undefined && candles.length > 0) {
    const idx = candles.findIndex((c) => c.time === selectedCandle.time);
    if (idx !== -1) {
      let count = 0;
      for (let i = idx; i >= 0; i--) {
        if (candles[i].wyckoff_stage === 'ACCUMULATION') {
          count++;
        } else {
          break;
        }
      }
      accumBars = count;
    } else {
      accumBars = 0;
    }
  } else if (accumBars === undefined) {
    accumBars = 0;
  }

  const durationOk = accumBars >= 3;

  const springHighTarget = selectedCandle.high;
  const springHighReached = selectedCandle.close > springHighTarget;
  const confirmationOk = springHighReached;

  // Determine readiness based on selected entryStabilityRule
  const reqDuration = entryStabilityRule === 'duration' || entryStabilityRule === 'both' || entryStabilityRule === 'default';
  const reqConfirmation = entryStabilityRule === 'confirmation' || entryStabilityRule === 'both' || entryStabilityRule === 'default';

  const buyReady = springLowOk && springCloseOk && buyStageOk && inSession && (!reqDuration || durationOk) && (!reqConfirmation || confirmationOk);

  // Upthrust / SELL checks
  const utHighOk = res != null ? selectedCandle.high > res : false;
  const utCloseOk = res != null ? selectedCandle.close < res : false;
  const sellStageOk = stage !== 'ACCUMULATION';
  const sellReady = utHighOk && utCloseOk && sellStageOk && inSession;

  const missingBuy: string[] = [];
  if (!springLowOk) missingBuy.push('Low < Support');
  if (!springCloseOk) missingBuy.push('Close > Support');
  if (!buyStageOk) missingBuy.push('Stage != Distribution');
  if (!inSession) missingBuy.push('Outside Trading Session');
  if (reqDuration && !durationOk) missingBuy.push(`Accumulation Bars (${accumBars}/3 required)`);
  if (reqConfirmation && !confirmationOk) missingBuy.push(`Close > Spring High (${formatPrice(springHighTarget, symbol)})`);

  const missingSell: string[] = [];
  if (!utHighOk) missingSell.push('High > Resistance');
  if (!utCloseOk) missingSell.push('Close < Resistance');
  if (!sellStageOk) missingSell.push('Stage != Accumulation');
  if (!inSession) missingSell.push('Outside Trading Session');

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        border: '1.5px solid #eab308',
        boxShadow: '0 0 15px rgba(234, 179, 8, 0.15)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        position: 'relative',
        marginBottom: '16px',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
        }}
      >
        <X size={16} />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
            🔍 Selected Candle Details
          </span>
          {selectedCandle.wyckoff_stage && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                backgroundColor:
                  stage === 'ACCUMULATION'
                    ? 'rgba(59, 130, 246, 0.2)'
                    : stage === 'DISTRIBUTION'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : stage === 'MARKUP'
                    ? 'rgba(16, 185, 129, 0.2)'
                    : stage === 'MARKDOWN'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(148, 163, 184, 0.2)',
                color:
                  stage === 'ACCUMULATION'
                    ? '#3b82f6'
                    : stage === 'DISTRIBUTION'
                    ? '#f59e0b'
                    : stage === 'MARKUP'
                    ? '#10b981'
                    : stage === 'MARKDOWN'
                    ? '#ef4444'
                    : '#94a3b8',
                border: `1px solid ${
                  stage === 'ACCUMULATION'
                    ? '#3b82f6'
                    : stage === 'DISTRIBUTION'
                    ? '#f59e0b'
                    : stage === 'MARKUP'
                    ? '#10b981'
                    : stage === 'MARKDOWN'
                    ? '#ef4444'
                    : '#94a3b8'
                }`,
              }}
            >
              Stage: {stage}
            </span>
          )}
          {selectedCandle.wyckoff_signal && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: selectedCandle.wyckoff_signal.includes('Spring') ? 'rgba(6, 182, 212, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                color: selectedCandle.wyckoff_signal.includes('Spring') ? '#06b6d4' : '#f59e0b',
                border: `1px solid ${selectedCandle.wyckoff_signal.includes('Spring') ? '#06b6d4' : '#f59e0b'}`,
              }}
            >
              ⚡ {selectedCandle.wyckoff_signal}
            </span>
          )}
          {selectedCandle.accum_consec_bars !== undefined && stage === 'ACCUMULATION' && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: selectedCandle.accum_consec_bars >= 3 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: selectedCandle.accum_consec_bars >= 3 ? '#10b981' : '#ef4444',
                border: `1px solid ${selectedCandle.accum_consec_bars >= 3 ? '#10b981' : '#ef4444'}`,
              }}
            >
              Accum. Bars: {selectedCandle.accum_consec_bars} / 3 required
            </span>
          )}
          {selectedCandle.dist_consec_bars !== undefined && stage === 'DISTRIBUTION' && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: selectedCandle.dist_consec_bars >= 3 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: selectedCandle.dist_consec_bars >= 3 ? '#f59e0b' : '#ef4444',
                border: `1px solid ${selectedCandle.dist_consec_bars >= 3 ? '#f59e0b' : '#ef4444'}`,
              }}
            >
              Dist. Bars: {selectedCandle.dist_consec_bars} / 3 required
            </span>
          )}
          <span
            style={{
              fontSize: '9px',
              fontWeight: 'bold',
              backgroundColor: timeframe === '1m' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: timeframe === '1m' ? '#10b981' : '#ef4444',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            {timeframe === '1m' ? '1m Candle Supported' : '1m Only (Read Only)'}
          </span>
        </div>

        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          Time: {formatDateTime(selectedCandle.time)} | Open: {formatPrice(selectedCandle.open, symbol)} | High: {formatPrice(selectedCandle.high, symbol)} | Low: {formatPrice(selectedCandle.low, symbol)} | Close: {formatPrice(selectedCandle.close, symbol)} | Vol: {selectedCandle.volume.toFixed(1)}
        </span>

        {/* Level & Wyckoff Condition Breakdown */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', marginTop: '2px', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '6px' }}>
          {selectedCandle.support_level != null && (
            <span style={{ color: '#60a5fa' }}>
              <strong>Support:</strong> {formatPrice(selectedCandle.support_level, symbol)}
            </span>
          )}
          {selectedCandle.resistance_level != null && (
            <span style={{ color: '#fbbf24' }}>
              <strong>Resistance:</strong> {formatPrice(selectedCandle.resistance_level, symbol)}
            </span>
          )}
          {selectedCandle.sma_20 != null && (
            <span style={{ color: '#34d399' }}>
              <strong>SMA20:</strong> {formatPrice(selectedCandle.sma_20, symbol)}
            </span>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', paddingTop: '6px', borderTop: '1px solid #334155', color: '#cbd5e1' }}>
            {/* Session status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong>Trading Session:</strong>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  backgroundColor: inSession ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: inSession ? '#10b981' : '#ef4444',
                  border: `1px solid ${inSession ? '#10b981' : '#ef4444'}`,
                }}
              >
                {inSession ? `✓ ${matchedSessionName}` : '✗ Outside Active Sessions'}
              </span>
            </div>

            {/* Spring / BUY Breakdown */}
            <div style={{ backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${buyReady ? '#10b981' : '#334155'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: '#06b6d4' }}>🐂 Spring / Bullish Readiness:</strong>
                <span style={{ color: buyReady ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                  {buyReady ? '✓ ALL CONDITIONS MET' : `Missing ${missingBuy.length} Condition(s)`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '10px' }}>
                <span style={{ color: springLowOk ? '#10b981' : '#ef4444' }}>
                  Low &lt; Support ({sup != null ? formatPrice(sup, symbol) : 'N/A'}): {springLowOk ? '✓' : '✗'}
                </span>
                <span style={{ color: springCloseOk ? '#10b981' : '#ef4444' }}>
                  Close &gt; Support: {springCloseOk ? '✓' : '✗'}
                </span>
                <span style={{ color: buyStageOk ? '#10b981' : '#ef4444' }}>
                  Stage ({stage}): {buyStageOk ? '✓' : '✗'}
                </span>
                <span style={{ color: inSession ? '#10b981' : '#ef4444' }}>
                  Session: {inSession ? '✓' : '✗'}
                </span>
                <span style={{ color: durationOk ? '#10b981' : '#ef4444' }}>
                  Consecutive Accum. Bars ({accumBars}/3): {durationOk ? '✓' : '✗'}
                </span>
                {(entryStabilityRule === 'confirmation' || entryStabilityRule === 'both') && (
                  <span style={{ color: confirmationOk ? '#10b981' : '#ef4444' }}>
                    Close &gt; Spring High ({formatPrice(springHighTarget, symbol)}): {confirmationOk ? '✓' : '✗'}
                  </span>
                )}
              </div>
              {!buyReady && (
                <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '3px' }}>
                  ⚠️ Missing: {missingBuy.join(' • ')}
                </div>
              )}
              {selectedCandle.wyckoff_signal && selectedCandle.wyckoff_signal.includes('Spring') && (
                <div style={{ fontSize: '10px', color: '#38bdf8', marginTop: '4px', paddingTop: '3px', borderTop: '1px dashed #1e293b' }}>
                  ⏳ <strong>Spring Trap Signal Active:</strong> Pending Buy set up. Trade entry executes when a subsequent candle closes &gt; Spring High ({formatPrice(selectedCandle.high, symbol)}) with {accumBars}/3 consecutive accumulation bars (rule: <code>{entryStabilityRule}</code>).
                </div>
              )}
            </div>

            {/* Upthrust / SELL Breakdown */}
            <div style={{ backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${sellReady ? '#10b981' : '#334155'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: '#f59e0b' }}>🐻 Upthrust / Bearish Readiness:</strong>
                <span style={{ color: sellReady ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                  {sellReady ? '✓ ALL CONDITIONS MET' : `Missing ${missingSell.length} Condition(s)`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '10px' }}>
                <span style={{ color: utHighOk ? '#10b981' : '#ef4444' }}>
                  High &gt; Resistance ({res != null ? formatPrice(res, symbol) : 'N/A'}): {utHighOk ? '✓' : '✗'}
                </span>
                <span style={{ color: utCloseOk ? '#10b981' : '#ef4444' }}>
                  Close &lt; Resistance: {utCloseOk ? '✓' : '✗'}
                </span>
                <span style={{ color: sellStageOk ? '#10b981' : '#ef4444' }}>
                  Stage ({stage}): {sellStageOk ? '✓' : '✗'}
                </span>
                <span style={{ color: inSession ? '#10b981' : '#ef4444' }}>
                  Session: {inSession ? '✓' : '✗'}
                </span>
              </div>
              {!sellReady && (
                <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '3px' }}>
                  ⚠️ Missing: {missingSell.join(' • ')}
                </div>
              )}
              {selectedCandle.wyckoff_signal && selectedCandle.wyckoff_signal.includes('Upthrust') && (
                <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '4px', paddingTop: '3px', borderTop: '1px dashed #1e293b' }}>
                  ⏳ <strong>Upthrust Trap Signal Active:</strong> Pending Sell set up. Trade entry executes when a subsequent candle closes &lt; Upthrust Low ({formatPrice(selectedCandle.low, symbol)}) under rule: <code>{entryStabilityRule}</code>.
                </div>
              )}
            </div>
          </div>

          {selectedCandle.vsa_patterns && selectedCandle.vsa_patterns.length > 0 && (
            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '500' }}>
              VSA Patterns: {selectedCandle.vsa_patterns.join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
