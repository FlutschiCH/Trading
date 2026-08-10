import React from 'react';
import { X, TrendingUp, TrendingDown, Clock, HelpCircle } from 'lucide-react';

interface TradeDetailsModalProps {
  showModal: boolean;
  selectedTrade: any;
  symbol: string;
  timeframe: string;
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

export const TradeDetailsModal: React.FC<TradeDetailsModalProps> = ({
  showModal,
  selectedTrade,
  symbol,
  timeframe,
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
  if (!showModal || !selectedTrade) return null;

  const pnl = Number(selectedTrade.pnl ?? selectedTrade.profit ?? selectedTrade.unrealized_profit ?? 0);
  const side = (selectedTrade.type || selectedTrade.trade_side || selectedTrade.side || 'BUY').toUpperCase();
  const qtyVal = Number(selectedTrade.qty ?? selectedTrade.volume ?? selectedTrade.size ?? 0);
  const entryVal = selectedTrade.entryPrice ?? selectedTrade.entry_price ?? selectedTrade.price_open;
  const exitVal = selectedTrade.exitPrice ?? selectedTrade.price_current ?? selectedTrade.current_price;
  const slVal = selectedTrade.slPrice ?? selectedTrade.stop_loss ?? selectedTrade.sl;
  const tpVal = selectedTrade.tpPrice ?? selectedTrade.take_profit ?? selectedTrade.tp;
  const outcomeStr = selectedTrade.outcome || (pnl >= 0 ? 'PROFIT' : 'LOSS');

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
          border: `2px solid ${pnl >= 0 ? '#10b981' : '#ef4444'}`,
          boxShadow: `0 0 25px ${pnl >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
          borderRadius: '16px',
          width: '90%',
          maxWidth: '480px',
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
              backgroundColor: side === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: side === 'BUY' ? '#10b981' : '#ef4444',
            }}
          >
            {side}
          </span>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' }}>
            Trade Performance Details
          </h2>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: pnl >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${pnl >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Net Profit/Loss</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Outcome</span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: pnl >= 0 ? '#10b981' : '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {pnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {outcomeStr}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: '13px', marginBottom: '20px' }}>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Entry Price</span>
            <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${formatPrice(entryVal, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Exit / Current Price</span>
            <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${formatPrice(exitVal, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Stop Loss</span>
            <span style={{ color: '#ef4444', fontWeight: '500' }}>${formatPrice(slVal, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Take Profit</span>
            <span style={{ color: '#10b981', fontWeight: '500' }}>${formatPrice(tpVal, symbol)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Quantity Size</span>
            <span style={{ color: '#cbd5e1', fontWeight: '500' }}>{qtyVal.toFixed(4)}</span>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Time Closed / Active</span>
            <span style={{ color: '#cbd5e1', fontWeight: '500' }}>{selectedTrade.time || 'OPEN'}</span>
          </div>
        </div>

        {selectedTrade.triggerReason && (
          <div
            style={{
              borderTop: '1px solid #1e293b',
              paddingTop: '16px',
              marginTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <span
              style={{
                color: '#cbd5e1',
                fontWeight: 'bold',
                display: 'block',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Entry Trigger State (VSA & Structural Sweep)
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '8px',
                backgroundColor: 'rgba(30, 41, 59, 0.3)',
                padding: '10px',
                borderRadius: '8px',
              }}
            >
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Active VSA Patterns</span>
                <span style={{ color: '#f1f5f9', fontWeight: '500' }}>{selectedTrade.triggerReason.vsa_patterns}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '6px' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Swept Structural Level</span>
                  <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
                    {selectedTrade.triggerReason.sweep_level ? `$${formatPrice(selectedTrade.triggerReason.sweep_level, symbol)}` : 'None'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Weis Wave Volume</span>
                  <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
                    {selectedTrade.triggerReason.weis_wave_volume ? selectedTrade.triggerReason.weis_wave_volume.toFixed(1) : '0.0'}
                  </span>
                </div>
              </div>
              {selectedTrade.triggerReason.entry_candle && (
                <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '6px' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px', marginBottom: '2px' }}>Entry Candle OHLC</span>
                  <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                    O:{formatPrice(selectedTrade.triggerReason.entry_candle.open, symbol)} H:{formatPrice(selectedTrade.triggerReason.entry_candle.high, symbol)} L:{formatPrice(selectedTrade.triggerReason.entry_candle.low, symbol)} C:{formatPrice(selectedTrade.triggerReason.entry_candle.close, symbol)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
      </div>
    </div>
  );
};
