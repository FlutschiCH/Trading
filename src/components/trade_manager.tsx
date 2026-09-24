import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePositionsStore } from '../services/positionsStore';
import DebugComponentBadge from './debug_component_badge';
import { SymbolTimeframeSelector } from './symbol_timeframe_selector';
import { API_BASE_URL } from '../api';
import { RefreshCw, TrendingUp, TrendingDown, Clock, Layers, Calendar, DollarSign, Percent, Shield, ExternalLink, ChevronDown, ChevronRight, Filter, X, Tag, Hash, ArrowUpRight, ArrowDownRight } from 'lucide-react';

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
  sl?: number | string;
  tp?: number | string;
  time?: number | string;
  commission?: number;
  swap?: number;
  comment?: string;
  magic?: number;
}

export interface HistoryTrade {
  ticket?: number | string;
  id?: number | string;
  deal_id?: number | string;
  order?: number | string;
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
  timestamp?: number | string;
  commission?: number;
  swap?: number;
  fee?: number;
  comment?: string;
  magic?: number;
}

export interface AccountItem {
  id?: string | number;
  account_id?: string | number;
  name?: string;
  broker?: string;
  broker_type?: string;
  server?: string;
  is_active?: boolean;
}

export interface TradeManagerProps {
  dailyPnl?: number;
  weeklyPnl?: number;
  openPositions?: Position[];
  historyTrades?: HistoryTrade[];
  loadingHistory?: boolean;
  onRefreshHistory?: () => void;
  handleClosePosition?: (position: Position) => void;
  isMobileLayout?: boolean;
  accounts?: AccountItem[];
  activeAccount?: AccountItem | null;
  availableSymbols?: string[];
  isLight?: boolean;
}

export default function TradeManager({
  dailyPnl: propsDailyPnl,
  weeklyPnl: propsWeeklyPnl,
  openPositions: propsPositions,
  historyTrades: propsHistoryTrades,
  loadingHistory: propsLoadingHistory,
  onRefreshHistory,
  handleClosePosition: propsHandleClosePosition,
  isMobileLayout = false,
  accounts: propsAccounts,
  activeAccount: propsActiveAccount,
  availableSymbols = [],
  isLight = false,
}: TradeManagerProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');
  const [historyFilterSide, setHistoryFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [expandedTradeId, setExpandedTradeId] = useState<string | number | null>(null);

  // Accounts state & selection
  const [accounts, setAccounts] = useState<AccountItem[]>(() => {
    if (propsAccounts && propsAccounts.length > 0) return propsAccounts;
    try {
      const saved = localStorage.getItem('wyckoff_accounts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Selected Broker/Account for TradeManager ('active' or specific account_id or specific broker like 'binance')
  const [selectedBrokerAcc, setSelectedBrokerAcc] = useState<string>(() => {
    return localStorage.getItem('wyckoff_trade_manager_broker_acc') || 'active';
  });

  // Self-managed state for when TradeManager is querying specific brokers (like Binance / custom account)
  const [customPositions, setCustomPositions] = useState<Position[] | null>(null);
  const [customHistory, setCustomHistory] = useState<HistoryTrade[] | null>(null);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [tradeActionLoading, setTradeActionLoading] = useState<string | number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sync props accounts
  useEffect(() => {
    if (propsAccounts && propsAccounts.length > 0) {
      setAccounts(propsAccounts);
    } else {
      fetch(`${API_BASE_URL}/api/accounts`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success' && Array.isArray(data.data)) {
            setAccounts(data.data);
          }
        })
        .catch(() => {});
    }
  }, [propsAccounts]);

  // Global store positions
  const { positions: storePositions, refreshPositions: storeRefreshPositions } = usePositionsStore();

  // Determine current effective broker and account_id
  const currentTarget = useMemo(() => {
    if (selectedBrokerAcc === 'active') {
      const acc = propsActiveAccount || accounts.find(a => a.is_active) || accounts[0] || null;
      const bType = (acc?.broker_type || acc?.broker || 'metatrader').toLowerCase();
      const aId = acc ? String(acc.account_id || acc.id || '') : '';
      return { isCustom: false, broker: bType, accountId: aId, label: acc ? `${acc.name || aId} (${bType.toUpperCase()})` : 'Active Account' };
    }

    if (selectedBrokerAcc === 'binance_futures' || selectedBrokerAcc === 'binance') {
      const binanceAcc = accounts.find(a => (a.broker_type || a.broker || '').toLowerCase().includes('binance'));
      const aId = binanceAcc ? String(binanceAcc.account_id || binanceAcc.id || '') : 'binance';
      return { isCustom: true, broker: 'binance', accountId: aId, label: 'Binance Futures' };
    }

    // Specific Account ID
    const acc = accounts.find(a => String(a.account_id || a.id) === String(selectedBrokerAcc));
    if (acc) {
      const bType = (acc.broker_type || acc.broker || 'metatrader').toLowerCase();
      const aId = String(acc.account_id || acc.id || '');
      return { isCustom: true, broker: bType, accountId: aId, label: `${acc.name || aId} (${bType.toUpperCase()})` };
    }

    return { isCustom: false, broker: 'metatrader', accountId: '', label: 'Default' };
  }, [selectedBrokerAcc, propsActiveAccount, accounts]);

  // Fetch custom trades/positions when custom broker/account is selected
  const fetchCustomTrades = useCallback(async () => {
    if (!currentTarget.isCustom) {
      setCustomPositions(null);
      setCustomHistory(null);
      return;
    }

    setLoadingCustom(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/trade_manager/overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: currentTarget.broker,
          account_id: currentTarget.accountId
        })
      });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setCustomPositions(json.data.positions || []);
        setCustomHistory(json.data.history || []);
      } else {
        setActionError(json.message || 'Failed to fetch trade overview.');
      }
    } catch (e: any) {
      setActionError(e.message || 'Error connecting to trade manager API');
    } finally {
      setLoadingCustom(false);
    }
  }, [currentTarget]);

  useEffect(() => {
    localStorage.setItem('wyckoff_trade_manager_broker_acc', selectedBrokerAcc);
    if (currentTarget.isCustom) {
      fetchCustomTrades();
    } else {
      setCustomPositions(null);
      setCustomHistory(null);
    }
  }, [selectedBrokerAcc, currentTarget.isCustom, fetchCustomTrades]);

  // Active positions resolution
  const rawOpenPositions: Position[] = useMemo(() => {
    if (currentTarget.isCustom && customPositions !== null) {
      return customPositions;
    }
    return storePositions.length > 0 ? storePositions : (propsPositions || []);
  }, [currentTarget.isCustom, customPositions, storePositions, propsPositions]);

  // Filtered positions based on selectedSymbol
  const openPositions: Position[] = useMemo(() => {
    if (!selectedSymbol || selectedSymbol === 'ALL') {
      return rawOpenPositions;
    }
    const cleanSym = selectedSymbol.trim().toUpperCase();
    return rawOpenPositions.filter(p => {
      const sym = (p.symbol || '').toUpperCase();
      return sym === cleanSym || sym.includes(cleanSym) || cleanSym.includes(sym);
    });
  }, [rawOpenPositions, selectedSymbol]);

  // History trades resolution
  const rawHistoryTrades: HistoryTrade[] = useMemo(() => {
    if (currentTarget.isCustom && customHistory !== null) {
      return customHistory;
    }
    return propsHistoryTrades || [];
  }, [currentTarget.isCustom, customHistory, propsHistoryTrades]);

  // Filtered History Trades based on selectedSymbol & side
  const filteredHistory: HistoryTrade[] = useMemo(() => {
    return rawHistoryTrades.filter(t => {
      const sym = (t.symbol || '').toUpperCase();
      const matchSymbol = !selectedSymbol || selectedSymbol === 'ALL' || sym === selectedSymbol.toUpperCase() || sym.includes(selectedSymbol.toUpperCase()) || selectedSymbol.toUpperCase().includes(sym);
      const side = ((t.side || t.type || t.trade_side || '').toUpperCase());
      const matchSide = historyFilterSide === 'ALL' || side.includes(historyFilterSide);
      return matchSymbol && matchSide;
    });
  }, [rawHistoryTrades, selectedSymbol, historyFilterSide]);

  const isLoadingHistory = currentTarget.isCustom ? loadingCustom : (propsLoadingHistory || false);

  // Handle Refresh
  const handleRefresh = () => {
    if (currentTarget.isCustom) {
      fetchCustomTrades();
    } else {
      if (onRefreshHistory) onRefreshHistory();
      if (storeRefreshPositions) storeRefreshPositions();
    }
  };

  // Handle Close Position
  const handleClose = async (position: Position) => {
    if (currentTarget.isCustom) {
      const posId = position.position_id;
      setTradeActionLoading(posId);
      setActionError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/trade_manager/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            broker: currentTarget.broker,
            account_id: currentTarget.accountId,
            position_id: posId,
            symbol: position.symbol,
            volume: position.volume
          })
        });
        const json = await res.json();
        if (json.status === 'success') {
          fetchCustomTrades();
        } else {
          setActionError(json.message || 'Failed to close position.');
        }
      } catch (e: any) {
        setActionError(e.message || 'Error closing position.');
      } finally {
        setTradeActionLoading(null);
      }
    } else {
      if (propsHandleClosePosition) {
        propsHandleClosePosition(position);
      }
    }
  };

  // History Stats
  const historyStats = useMemo(() => {
    let totalPnl = 0;
    let totalCommission = 0;
    let totalSwap = 0;
    let totalVolume = 0;
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    filteredHistory.forEach(t => {
      const p = Number(t.profit ?? t.net_profit ?? 0);
      const comm = Number(t.commission ?? t.fee ?? 0);
      const swp = Number(t.swap ?? 0);
      const vol = Number(t.volume ?? t.lots ?? t.qty ?? 0);

      totalPnl += p;
      totalCommission += comm;
      totalSwap += swp;
      totalVolume += vol;

      if (p > 0) {
        wins++;
        grossProfit += p;
      } else if (p < 0) {
        losses++;
        grossLoss += Math.abs(p);
      }
    });

    const totalTrades = filteredHistory.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 99.9 : 0);
    const avgTrade = totalTrades > 0 ? (totalPnl / totalTrades) : 0;

    return { totalPnl, totalCommission, totalSwap, totalVolume, wins, losses, totalTrades, winRate, profitFactor, avgTrade };
  }, [filteredHistory]);

  // Dynamic PnL calculation
  const activeDailyPnl = useMemo(() => {
    if (selectedSymbol && selectedSymbol !== 'ALL') {
      return openPositions.reduce((acc, p) => acc + Number(p.unrealized_profit || 0), 0);
    }
    if (currentTarget.isCustom) {
      return openPositions.reduce((acc, p) => acc + Number(p.unrealized_profit || 0), 0);
    }
    return propsDailyPnl ?? 0;
  }, [selectedSymbol, currentTarget.isCustom, openPositions, propsDailyPnl]);

  const activeWeeklyPnl = useMemo(() => {
    if (selectedSymbol && selectedSymbol !== 'ALL') {
      return historyStats.totalPnl;
    }
    if (currentTarget.isCustom) {
      return historyStats.totalPnl;
    }
    return propsWeeklyPnl ?? 0;
  }, [selectedSymbol, currentTarget.isCustom, historyStats.totalPnl, propsWeeklyPnl]);

  const formatDate = (val: number | string | undefined) => {
    if (!val) return '-';
    try {
      const d = typeof val === 'number' ? new Date(val > 1e11 ? val : val * 1000) : new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return String(val);
    }
  };

  const getTradeProfit = (t: HistoryTrade) => Number(t.profit ?? t.net_profit ?? 0);
  const getTradeVolume = (t: HistoryTrade) => Number(t.volume ?? t.lots ?? t.qty ?? 0);
  const getTradePrice = (t: HistoryTrade) => Number(t.price ?? t.close_price ?? t.open_price ?? t.entry_price ?? 0);
  const getTradeSide = (t: HistoryTrade) => {
    const raw = (t.side ?? t.type ?? t.trade_side ?? 'BUY').toString().toUpperCase();
    if (raw.includes('BUY') || raw === '0') return 'BUY';
    if (raw.includes('SELL') || raw === '1') return 'SELL';
    return raw;
  };

  const toggleExpandTrade = (id: string | number) => {
    setExpandedTradeId(prev => prev === id ? null : id);
  };

  // Top Controls Bar (Broker Selector + SymbolTimeframeSelector + Refresh)
  const renderHeaderControls = (isMobileView: boolean) => {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* Symbol Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <SymbolTimeframeSelector
            multiSelect={false}
            showTimeframe={false}
            showLabel={false}
            symbol={selectedSymbol === 'ALL' ? '' : selectedSymbol}
            onSymbolChange={(sym) => setSelectedSymbol(sym || 'ALL')}
            placeholder="All Symbols"
            availableSymbols={availableSymbols}
            isLight={isLight}
            accountId={currentTarget.accountId}
          />
          {selectedSymbol && selectedSymbol !== 'ALL' && (
            <button
              onClick={() => setSelectedSymbol('ALL')}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '4px',
                padding: '4px 6px',
                color: '#ef4444',
                fontSize: '10px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px'
              }}
              title="Clear symbol filter"
            >
              <X size={11} />
              All
            </button>
          )}
        </div>

        {/* Broker Selector */}
        <select
          value={selectedBrokerAcc}
          onChange={e => setSelectedBrokerAcc(e.target.value)}
          style={{
            backgroundColor: 'var(--app-bg, #0b0f19)',
            border: '1px solid var(--app-card-border, #1f2937)',
            borderRadius: '6px',
            padding: isMobileView ? '5px 8px' : '4px 8px',
            fontSize: isMobileView ? '11px' : '10px',
            color: 'var(--app-text, #f8fafc)',
            fontWeight: '600',
            cursor: 'pointer',
            maxWidth: isMobileView ? '135px' : '150px'
          }}
          title="Filter trades by Broker Account"
        >
          <option value="active">⚡ Active Account</option>
          <option value="binance">🟡 Binance Futures</option>
          {accounts.map(acc => {
            const id = String(acc.account_id || acc.id);
            const broker = (acc.broker_type || acc.broker || '').toUpperCase();
            return (
              <option key={id} value={id}>
                {acc.name ? `${acc.name} (${broker})` : `${broker} #${id}`}
              </option>
            );
          })}
        </select>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={isLoadingHistory || loadingCustom}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--app-card-border, #1f2937)',
            borderRadius: '6px',
            padding: isMobileView ? '5px 8px' : '4px 7px',
            color: 'var(--app-text-muted, #94a3b8)',
            cursor: isLoadingHistory || loadingCustom ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: isMobileView ? '11px' : '10px'
          }}
          title="Refresh Data"
        >
          <RefreshCw size={isMobileView ? 12 : 11} className={isLoadingHistory || loadingCustom ? 'animate-spin' : ''} />
          {!isMobileView && 'Refresh'}
        </button>
      </div>
    );
  };

  // -------------------------------------------------------------
  // Mobile Layout
  // -------------------------------------------------------------
  if (isMobileLayout) {
    return (
      <div style={{ padding: '16px' }}>
        {/* Top Controls: Selector & Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          {renderHeaderControls(true)}
          <DebugComponentBadge name="TradeManager" />
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('live')}
            style={{
              flex: 1,
              backgroundColor: activeTab === 'live' ? 'var(--app-accent, #3b82f6)' : 'rgba(255,255,255,0.05)',
              color: activeTab === 'live' ? '#ffffff' : 'var(--app-text-muted, #94a3b8)',
              border: '1px solid ' + (activeTab === 'live' ? 'var(--app-accent, #3b82f6)' : 'var(--app-card-border, #1f2937)'),
              borderRadius: '6px',
              padding: '7px 10px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <TrendingUp size={13} />
            Live ({openPositions.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              flex: 1,
              backgroundColor: activeTab === 'history' ? 'var(--app-accent, #3b82f6)' : 'rgba(255,255,255,0.05)',
              color: activeTab === 'history' ? '#ffffff' : 'var(--app-text-muted, #94a3b8)',
              border: '1px solid ' + (activeTab === 'history' ? 'var(--app-accent, #3b82f6)' : 'var(--app-card-border, #1f2937)'),
              borderRadius: '6px',
              padding: '7px 10px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Clock size={13} />
            History ({filteredHistory.length})
          </button>
        </div>

        {actionError && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '8px 12px', fontSize: '11px', color: '#ef4444', marginBottom: '12px' }}>
            {actionError}
          </div>
        )}

        {/* TAB 1: Live Positions */}
        {activeTab === 'live' && (
          <div>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '12px' }}>
                <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>UNREALIZED P&L</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: activeDailyPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {activeDailyPnl >= 0 ? '+' : ''}${Number(activeDailyPnl || 0).toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '12px' }}>
                <span style={{ fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>TOTAL CLOSED P&L</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: activeWeeklyPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {activeWeeklyPnl >= 0 ? '+' : ''}${Number(activeWeeklyPnl || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Open Positions List */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--app-text, #f8fafc)', fontWeight: 'bold' }}>
                Active Positions {selectedSymbol && selectedSymbol !== 'ALL' ? `(${selectedSymbol})` : ''} {currentTarget.isCustom && `[${currentTarget.broker.toUpperCase()}]`}
              </h4>
            </div>
            {openPositions.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '12px', paddingBottom: '20px' }}>
                {loadingCustom ? 'Loading active positions...' : 'No active positions found.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {openPositions.map(p => {
                  const sl = p.stop_loss ?? p.sl;
                  const tp = p.take_profit ?? p.tp;
                  return (
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
                        {(sl || tp) && (
                          <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                            {sl ? `SL: ${sl} ` : ''}{tp ? `TP: ${tp}` : ''}
                          </span>
                        )}
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
                          onClick={() => handleClose(p)}
                          disabled={tradeActionLoading === p.position_id}
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            cursor: tradeActionLoading === p.position_id ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {tradeActionLoading === p.position_id ? 'Closing...' : 'Close'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: History */}
        {activeTab === 'history' && (
          <div>
            {/* Rich History Summary Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>TOTAL NET PROFIT</span>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: historyStats.totalPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {historyStats.totalPnl >= 0 ? '+' : ''}${historyStats.totalPnl.toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '10px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WIN RATE (W / L)</span>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>
                  {historyStats.winRate.toFixed(1)}% <span style={{ fontSize: '11px', color: 'var(--app-text-muted, #94a3b8)' }}>({historyStats.wins}/{historyStats.losses})</span>
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '8px 10px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>PROFIT FACTOR</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: historyStats.profitFactor >= 1.5 ? '#10b981' : historyStats.profitFactor >= 1.0 ? '#eab308' : '#ef4444' }}>
                  {historyStats.profitFactor.toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '8px', padding: '8px 10px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>FEES / COMMISSIONS</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--app-text-muted, #94a3b8)' }}>
                  ${(Math.abs(historyStats.totalCommission) + Math.abs(historyStats.totalSwap)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <select
                value={historyFilterSide}
                onChange={e => setHistoryFilterSide(e.target.value as any)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--app-bg, #0b0f19)',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: 'var(--app-text, #f8fafc)'
                }}
              >
                <option value="ALL">All Sides (BUY & SELL)</option>
                <option value="BUY">BUY Deals Only</option>
                <option value="SELL">SELL Deals Only</option>
              </select>
            </div>

            {/* History Deals List */}
            {filteredHistory.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '12px', padding: '12px 0' }}>
                {isLoadingHistory ? 'Loading history deals...' : 'No trade history found.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {filteredHistory.map((t, idx) => {
                  const profit = getTradeProfit(t);
                  const side = getTradeSide(t);
                  const vol = getTradeVolume(t);
                  const price = getTradePrice(t);
                  const tradeId = t.ticket || t.id || t.deal_id || idx;
                  const isExpanded = expandedTradeId === tradeId;

                  return (
                    <div
                      key={tradeId}
                      onClick={() => toggleExpandTrade(tradeId)}
                      style={{
                        backgroundColor: 'var(--app-bg, #0b0f19)',
                        border: '1px solid var(--app-card-border, #1f2937)',
                        borderRadius: '8px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                            {formatDate(t.close_time || t.time || t.timestamp || t.open_time)}
                            {t.ticket ? ` • #${t.ticket}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                            {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                          </span>
                          {price > 0 && (
                            <div style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                              @{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded Trade Details */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px dashed var(--app-card-border, #1f2937)', paddingTop: '6px', marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '10px', color: 'var(--app-text-muted, #94a3b8)' }}>
                          <div><span style={{ color: '#64748b' }}>Order ID:</span> {t.order || t.ticket || '-'}</div>
                          <div><span style={{ color: '#64748b' }}>Exec Price:</span> {price > 0 ? price : '-'}</div>
                          <div><span style={{ color: '#64748b' }}>Commission:</span> ${Number(t.commission ?? t.fee ?? 0).toFixed(2)}</div>
                          <div><span style={{ color: '#64748b' }}>Swap/Interest:</span> ${Number(t.swap ?? 0).toFixed(2)}</div>
                          {t.comment && <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b' }}>Comment:</span> {t.comment}</div>}
                        </div>
                      )}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
        {/* Tab Buttons */}
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
            History ({filteredHistory.length})
          </button>
        </div>

        {/* Right Header Controls: SymbolTimeframeSelector + Broker Selector + Refresh & Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {renderHeaderControls(false)}
          <DebugComponentBadge name="TradeManager" />
        </div>
      </div>

      {actionError && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '4px', padding: '6px 8px', fontSize: '10px', color: '#ef4444', marginBottom: '8px' }}>
          {actionError}
        </div>
      )}

      {/* Content Container */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* TAB 1: Live Positions */}
        {activeTab === 'live' && (
          <div>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>UNREALIZED P&L</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: activeDailyPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {activeDailyPnl >= 0 ? '+' : ''}${Number(activeDailyPnl || 0).toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>TOTAL CLOSED P&L</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: activeWeeklyPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {activeWeeklyPnl >= 0 ? '+' : ''}${Number(activeWeeklyPnl || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Positions List */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h4 style={{ margin: 0, fontSize: '11px', color: 'var(--app-text, #f8fafc)', fontWeight: 'bold' }}>
                Active Positions {selectedSymbol && selectedSymbol !== 'ALL' ? `(${selectedSymbol})` : ''} {currentTarget.isCustom && `[${currentTarget.broker.toUpperCase()}]`}
              </h4>
            </div>
            {openPositions.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '11px', paddingBottom: '16px' }}>
                {loadingCustom ? 'Loading active positions...' : 'No active positions found.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {openPositions.map(p => {
                  const sl = p.stop_loss ?? p.sl;
                  const tp = p.take_profit ?? p.tp;
                  return (
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
                        {(sl || tp) && (
                          <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                            {sl ? `SL: ${sl} ` : ''}{tp ? `TP: ${tp}` : ''}
                          </span>
                        )}
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
                          onClick={() => handleClose(p)}
                          disabled={tradeActionLoading === p.position_id}
                          style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '9px',
                            cursor: tradeActionLoading === p.position_id ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {tradeActionLoading === p.position_id ? 'Closing...' : 'Close'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: History Deals */}
        {activeTab === 'history' && (
          <div>
            {/* Rich History Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '6px 8px' }}>
                <span style={{ fontSize: '8px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>NET PROFIT</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: historyStats.totalPnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {historyStats.totalPnl >= 0 ? '+' : ''}${historyStats.totalPnl.toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '6px 8px' }}>
                <span style={{ fontSize: '8px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>WIN RATE</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--app-text, #f8fafc)' }}>
                  {historyStats.winRate.toFixed(1)}% <span style={{ fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>({historyStats.wins}W/{historyStats.losses}L)</span>
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '6px 8px' }}>
                <span style={{ fontSize: '8px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>PROFIT FACTOR</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: historyStats.profitFactor >= 1.5 ? '#10b981' : historyStats.profitFactor >= 1.0 ? '#eab308' : '#ef4444' }}>
                  {historyStats.profitFactor.toFixed(2)}
                </span>
              </div>
              <div style={{ backgroundColor: 'var(--app-bg, #0b0f19)', border: '1px solid var(--app-card-border, #1f2937)', borderRadius: '6px', padding: '6px 8px' }}>
                <span style={{ fontSize: '8px', color: 'var(--app-text-muted, #94a3b8)', display: 'block' }}>FEES / COMM</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--app-text-muted, #94a3b8)' }}>
                  ${(Math.abs(historyStats.totalCommission) + Math.abs(historyStats.totalSwap)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Quick Side Filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <select
                value={historyFilterSide}
                onChange={e => setHistoryFilterSide(e.target.value as any)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--app-bg, #0b0f19)',
                  border: '1px solid var(--app-card-border, #1f2937)',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '10px',
                  color: 'var(--app-text, #f8fafc)'
                }}
              >
                <option value="ALL">All Sides (BUY & SELL)</option>
                <option value="BUY">BUY Deals Only</option>
                <option value="SELL">SELL Deals Only</option>
              </select>
            </div>

            {/* History Table / Cards */}
            {filteredHistory.length === 0 ? (
              <div style={{ color: 'var(--app-text-muted, #64748b)', fontSize: '11px', padding: '8px 0' }}>
                {isLoadingHistory ? 'Loading history...' : 'No closed trades in history.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                {filteredHistory.map((t, idx) => {
                  const profit = getTradeProfit(t);
                  const side = getTradeSide(t);
                  const vol = getTradeVolume(t);
                  const price = getTradePrice(t);
                  const tradeId = t.ticket || t.id || t.deal_id || idx;
                  const isExpanded = expandedTradeId === tradeId;

                  return (
                    <div
                      key={tradeId}
                      onClick={() => toggleExpandTrade(tradeId)}
                      style={{
                        backgroundColor: 'var(--app-bg, #0b0f19)',
                        border: '1px solid var(--app-card-border, #1f2937)',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                            {formatDate(t.close_time || t.time || t.timestamp || t.open_time)}
                            {t.ticket ? ` • #${t.ticket}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                            {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                          </span>
                          {price > 0 && (
                            <div style={{ fontSize: '8px', color: 'var(--app-text-muted, #94a3b8)' }}>
                              @{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded Trade Details */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px dashed var(--app-card-border, #1f2937)', paddingTop: '4px', marginTop: '2px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '9px', color: 'var(--app-text-muted, #94a3b8)' }}>
                          <div><span style={{ color: '#64748b' }}>Order ID:</span> {t.order || t.ticket || '-'}</div>
                          <div><span style={{ color: '#64748b' }}>Exec Price:</span> {price > 0 ? price : '-'}</div>
                          <div><span style={{ color: '#64748b' }}>Commission:</span> ${Number(t.commission ?? t.fee ?? 0).toFixed(2)}</div>
                          <div><span style={{ color: '#64748b' }}>Swap:</span> ${Number(t.swap ?? 0).toFixed(2)}</div>
                          {t.comment && <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b' }}>Comment:</span> {t.comment}</div>}
                        </div>
                      )}
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
