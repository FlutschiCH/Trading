import React, { useState, useMemo } from 'react';
import { usePositionsStore } from '../services/positionsStore';
import DebugComponentBadge from './debug_component_badge';
import { RefreshCw, TrendingUp, TrendingDown, Clock, Layers, Calendar, DollarSign, Percent } from 'lucide-react';

export interface Position {
  position_id: number | string;
  symbol: string;
  trade_side: string;
  volume: number;
  entry_price: number;
  unrealized_profit: number;
  leverage?: number | string;
  marginType?: string;
  markPrice?: number | string;
  liquidationPrice?: number | string;
  stop_loss?: number | string;
  take_profit?: number | string;
  time?: number | string;
}

export interface HistoryTrade {
  ticket?: number | string;
  id?: number | string;
  deal_id?: number | string;
  symbol: string;
  volume?: number;
  lots?: number;
  qty?: number;
  profit?: number;
  net_profit?: number;
  unrealized_profit?: number;
  type?: string;
  side?: string;
  trade_side?: string;
  open_price?: number;
  entry_price?: number;
  price?: number;
  close_price?: number;
  open_time?: number | string;
  close_time?: number | string;
  time?: number | string;
  commission?: number;
  swap?: number;
  fee?: number;
}

export interface TradeManagerProps {
  dailyPnl: number;
  weeklyPnl: number;
  openPositions?: Position[];
  historyTrades?: HistoryTrade[];
  loadingHistory?: boolean;
  onRefreshHistory?: () => void;
  handleClosePosition: (position: Position) => void;
  isMobileLayout?: boolean;
}

export default function TradeManager({
  dailyPnl,
  weeklyPnl,
  openPositions: propsPositions,
  historyTrades = [],
  loadingHistory = false,
  onRefreshHistory,
  handleClosePosition,
  isMobileLayout = false,
}: TradeManagerProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterSide, setHistoryFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  const { positions: storePositions } = usePositionsStore();
  const openPositions = storePositions.length > 0 ? storePositions : (propsPositions || []);

  // Filtered History Trades
  const filteredHistory = useMemo(() => {
    return historyTrades.filter(t => {
      const sym = (t.symbol || '').toUpperCase();
      const matchSearch = !historySearch || sym.includes(historySearch.trim().toUpperCase());
      const side = ((t.side || t.type || t.trade_side || '').toUpperCase());
      const matchSide = historyFilterSide === 'ALL' || side.includes(historyFilterSide);
      return matchSearch && matchSide;
    });
  }, [historyTrades, historySearch, historyFilterSide]);

  // History Stats
  const historyStats = useMemo(() => {
    let totalPnl = 0;
    let wins = 0;
    let losses = 0;

    historyTrades.forEach(t => {
      const p = Number(t.profit ?? t.net_profit ?? 0);
      totalPnl += p;
      if (p > 0) wins++;
      else if (p < 0) losses++;
    });

    const totalTrades = historyTrades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    return { totalPnl, wins, losses, totalTrades, winRate };
  }, [historyTrades]);

  const formatDate = (val: number | string | undefined) => {
    if (!val) return '-';
    try {
      const d = typeof val === 'number' ? new Date(val > 1e11 ? val : val * 1000) : new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(val);
    }
  };

  const getTradeProfit = (t: HistoryTrade) => Number(t.profit ?? t.net_profit ?? 0);
  const getTradeVolume = (t: HistoryTrade) => Number(t.volume ?? t.lots ?? t.qty ?? 0);
  const getTradeSide = (t: HistoryTrade) => {
    const raw = (t.side ?? t.type ?? t.trade_side ?? 'BUY').toString().toUpperCase();
    if (raw.includes('BUY') || raw === '0') return 'BUY';
    if (raw.includes('SELL') || raw === '1') return 'SELL';
    return raw;
  };

  // -------------------------------------------------------------
  // Mobile Layout
  // -------------------------------------------------------------
  if (isMobileLayout) {
    return (
      <div style={{ padding: '16px' }}>
        {/* Header & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => setActiveTab('live')}
              style={{
                backgroundColor: activeTab === 'live' ? 'var(--app-accent, #3b82f6)' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'live' ? '#ffffff' : 'var(--app-text-muted, #94a3b8)',
                border: '1px solid ' + (activeTab === 'live' ? 'var(--app-accent, #3b82f6)' : 'var(--app-card-border, #1f2937)'),
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <TrendingUp size={13} />
              Live Positions ({openPositions.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                backgroundColor: activeTab === 'history' ? 'var(--app-accent, #3b82f6)' : 'rgba(255,255,255,0.05)',
                color: activeTab === 'history' ? '#ffffff' : 'var(--app-text-muted, #94a3b8)',
                border: '1px solid ' + (activeTab === 'history' ? 'var(--app-accent, #3b82f6)' : 'var(--app-card-border, #1f2937)'),
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Clock size={13} />
              History ({historyTrades.length})
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {activeTab === 'history' && onRefreshHistory && (
              <button
                onClick={onRefreshHistory}
                disabled={loadingHistory}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  color: 'var(--app-text-muted, #94a3b8)',
                  cursor: loadingHistory ? 'not-allowed' : 'pointer'
                }}
                title="Refresh History"
              >
                <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} />
              </button>
            )}
            <DebugComponentBadge name="TradeManager" />
          </div>
        </div>

        {/* TAB 1: Live Positions */}
        {activeTab === 'live' && (
          <div>
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

            {/* Open Positions List */}
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
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: (p.unrealized_profit ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {(p.unrealized_profit ?? 0) >= 0 ? '+' : ''}${Number(p.unrealized_profit || 0).toFixed(2)}
                      </span>
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
        )}

        {/* TAB 2: History */}
        {activeTab === 'history' && (
          <div>
            {/* History Summary Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px' }}>
                <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>TOTAL NET PROFIT</span>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: historyStats.totalPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {historyStats.totalPnl >= 0 ? '+' : ''}${historyStats.totalPnl.toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px' }}>
                <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WIN RATE (W / L)</span>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>
                  {historyStats.winRate.toFixed(1)}% <span style={{ fontSize: '11px', color: 'var(--app-text-muted, #94a3b8)' }}>({historyStats.wins}/{historyStats.losses})</span>
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Filter Symbol..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--app-bg, #0b0f19)',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: 'var(--app-text, #f8fafc)'
                }}
              />
              <select
                value={historyFilterSide}
                onChange={e => setHistoryFilterSide(e.target.value as any)}
                style={{
                  backgroundColor: 'var(--app-bg, #0b0f19)',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: 'var(--app-text, #f8fafc)'
                }}
              >
                <option value="ALL">All Sides</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            {/* History Deals List */}
            {filteredHistory.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '12px', padding: '12px 0' }}>
                {loadingHistory ? 'Loading history deals...' : 'No trade history found.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {filteredHistory.map((t, idx) => {
                  const profit = getTradeProfit(t);
                  const side = getTradeSide(t);
                  const vol = getTradeVolume(t);
                  return (
                    <div
                      key={t.ticket || t.id || t.deal_id || idx}
                      style={{
                        backgroundColor: 'var(--app-bg, #0b0f19)',
                        border: '1px solid var(--app-card-border, #1f2937)',
                        borderRadius: '8px',
                        padding: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>
                            {t.symbol} ({vol})
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 'bold',
                              backgroundColor: side === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: side === 'BUY' ? '#10b981' : '#ef4444'
                            }}
                          >
                            {side}
                          </span>
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                          {formatDate(t.close_time || t.time || t.open_time)}
                          {t.ticket ? ` • #${t.ticket}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                        </span>
                        {(t.commission !== undefined && t.commission !== 0) && (
                          <div style={{ fontSize: '9px', color: 'var(--app-text-muted, #64748b)' }}>
                            Comm: ${Number(t.commission).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // Desktop Layout
  // -------------------------------------------------------------
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '6px', border: '1px solid var(--app-card-border, #1f2937)' }}>
          <button
            onClick={() => setActiveTab('live')}
            style={{
              backgroundColor: activeTab === 'live' ? 'var(--app-accent, #3b82f6)' : 'transparent',
              color: activeTab === 'live' ? '#ffffff' : 'var(--app-text-muted, #94a3b8)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <TrendingUp size={12} />
            Live ({openPositions.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              backgroundColor: activeTab === 'history' ? 'var(--app-accent, #3b82f6)' : 'transparent',
              color: activeTab === 'history' ? '#ffffff' : 'var(--app-text-muted, #94a3b8)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Clock size={12} />
            History ({historyTrades.length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeTab === 'history' && onRefreshHistory && (
            <button
              onClick={onRefreshHistory}
              disabled={loadingHistory}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--app-card-border, #1f2937)',
                borderRadius: '4px',
                padding: '3px 6px',
                color: 'var(--app-text-muted, #94a3b8)',
                cursor: loadingHistory ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px'
              }}
              title="Refresh History"
            >
              <RefreshCw size={10} className={loadingHistory ? 'animate-spin' : ''} />
              Sync
            </button>
          )}
          <DebugComponentBadge name="TradeManager" />
        </div>
      </div>

      {/* Content Container */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* TAB 1: Live Positions */}
        {activeTab === 'live' && (
          <div>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>DAILY P&L</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: (dailyPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {(dailyPnl ?? 0) >= 0 ? '+' : ''}${Number(dailyPnl || 0).toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WEEKLY P&L</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: (weeklyPnl ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {(weeklyPnl ?? 0) >= 0 ? '+' : ''}${Number(weeklyPnl || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Positions List */}
            <h4 style={{ margin: '0 0 6px 0', fontSize: '11px', color: 'var(--app-text, #f8fafc)', fontWeight: 'bold' }}>Active Positions</h4>
            {openPositions.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '11px', paddingBottom: '16px' }}>No active positions.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
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
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: (p.unrealized_profit ?? 0) >= 0 ? '#10b981' : '#ef4444' }}>
                        {(p.unrealized_profit ?? 0) >= 0 ? '+' : ''}${Number(p.unrealized_profit || 0).toFixed(2)}
                      </span>
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
        )}

        {/* TAB 2: History Deals */}
        {activeTab === 'history' && (
          <div>
            {/* History Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>TOTAL NET PROFIT</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: historyStats.totalPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {historyStats.totalPnl >= 0 ? '+' : ''}${historyStats.totalPnl.toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WIN RATE</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>
                  {historyStats.winRate.toFixed(1)}% <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)' }}>({historyStats.wins}W / {historyStats.losses}L)</span>
                </span>
              </div>
            </div>

            {/* Quick Filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="Filter Symbol..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--app-bg, #0b0f19)',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '10px',
                  color: 'var(--app-text, #f8fafc)'
                }}
              />
              <select
                value={historyFilterSide}
                onChange={e => setHistoryFilterSide(e.target.value as any)}
                style={{
                  backgroundColor: 'var(--app-bg, #0b0f19)',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '10px',
                  color: 'var(--app-text, #f8fafc)'
                }}
              >
                <option value="ALL">All</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            {/* History Table / Cards */}
            {filteredHistory.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '11px', padding: '8px 0' }}>
                {loadingHistory ? 'Loading history...' : 'No closed trades in history.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {filteredHistory.map((t, idx) => {
                  const profit = getTradeProfit(t);
                  const side = getTradeSide(t);
                  const vol = getTradeVolume(t);
                  return (
                    <div
                      key={t.ticket || t.id || t.deal_id || idx}
                      style={{
                        backgroundColor: 'var(--app-bg, #0b0f19)',
                        border: '1px solid var(--app-card-border, #1f2937)',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>
                            {t.symbol} ({vol})
                          </span>
                          <span
                            style={{
                              fontSize: '8px',
                              padding: '1px 4px',
                              borderRadius: '2px',
                              fontWeight: 'bold',
                              backgroundColor: side === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: side === 'BUY' ? '#10b981' : '#ef4444'
                            }}
                          >
                            {side}
                          </span>
                        </div>
                        <div style={{ fontSize: '8px', color: 'var(--app-text-muted, #94a3b8)' }}>
                          {formatDate(t.close_time || t.time || t.open_time)}
                          {t.ticket ? ` • #${t.ticket}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
