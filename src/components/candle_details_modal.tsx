import React from 'react';
import { X } from 'lucide-react';
import type { Candle } from '../types/trading';

interface CandleDetailsModalProps {
  candle: Candle | null;
  symbol: string;
  entryStabilityRule: string;
  sessionsTimezone: 'UTC' | 'Local';
  onClose: () => void;
  formatPrice: (price: number | undefined | null, symbol: string) => string;
}

export const CandleDetailsModal: React.FC<CandleDetailsModalProps> = ({
  candle,
  symbol,
  entryStabilityRule,
  sessionsTimezone,
  onClose,
  formatPrice,
}) => {
  if (!candle) return null;

  const stage = candle.wyckoff_stage || 'TRANSITION';
  const timestampStr = new Date(Number(candle.time) * 1000).toLocaleString('de-CH', {
    timeZone: sessionsTimezone === 'UTC' ? 'UTC' : undefined,
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 7, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          borderRadius: '16px',
          width: '90%',
          maxWidth: '460px',
          padding: '24px',
          position: 'relative',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
            }}
          >
            {stage}
          </span>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' }}>
            Candle Inspection Details
          </h3>
        </div>

        <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '16px', fontFamily: 'monospace' }}>
          Timestamp: {timestampStr}
        </div>

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
            <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(candle.open, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>High</span>
            <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(candle.high, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Low</span>
            <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(candle.low, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Close</span>
            <span style={{ color: '#f1f5f9', fontWeight: '500' }}>${formatPrice(candle.close, symbol)}</span>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid #334155',
            paddingTop: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>Wyckoff Signal:</span>
            <span style={{ fontWeight: 'bold', color: candle.wyckoff_signal ? '#38bdf8' : '#64748b' }}>
              {candle.wyckoff_signal || 'None'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8' }}>Entry Stability Rule:</span>
            <span style={{ fontWeight: 'bold', color: '#f59e0b', textTransform: 'capitalize' }}>
              {entryStabilityRule}
            </span>
          </div>

          {candle.accum_consec_bars !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8' }}>Accumulation Consecutive Bars:</span>
              <span
                style={{
                  fontWeight: 'bold',
                  color: candle.accum_consec_bars >= 3 ? '#10b981' : '#ef4444',
                }}
              >
                {candle.accum_consec_bars} / 3 required
              </span>
            </div>
          )}

          {candle.backtest_signal && (
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
              <span style={{ fontWeight: 'bold', color: '#10b981' }}>{candle.backtest_signal}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
