import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw, Shield, Wallet, Activity, Key, Globe } from 'lucide-react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { ISeriesApi } from 'lightweight-charts';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  currency: string;
  account_type?: string;
  broker?: string;
}

interface Position {
  position_id: number;
  symbol: string;
  trade_side: string;
  volume: number;
  entry_price: number;
  unrealized_profit: number;
}

export default function Trading() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'>>(null);
  
  const [symbol, setSymbol] = useState('BINANCE:BTCUSDT');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('57450.00');
  const [amount, setAmount] = useState('0.1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  // cTrader Connection State
  const [isConnected, setIsConnected] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [ctToken, setCtToken] = useState('17151091');
  const [ctAccountId, setCtAccountId] = useState('flutschich@gmail.com');

  // Account & Positions data
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  
  const [recentTrades, setRecentTrades] = useState([
    { id: 1, type: 'BUY', amount: '0.045', price: '57,432.10', time: '15:04:12' },
    { id: 2, type: 'SELL', amount: '0.120', price: '57,440.00', time: '15:03:55' },
    { id: 3, type: 'BUY', amount: '0.015', price: '57,428.50', time: '15:03:20' },
  ]);

  // Fetch candle data
  const fetchCandles = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8751/api/candles/historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.replace('BINANCE:', ''),
          interval: '15m',
          limit: 100,
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        const sortedData = result.data.sort((a: Candle, b: Candle) => a.time - b.time);
        setCandles(sortedData);
        if (candlestickSeriesRef.current) {
          candlestickSeriesRef.current.setData(sortedData);
        }
      }
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
    }
  };

  // Connect to cTrader
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const response = await fetch('http://localhost:8751/api/ctrader/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: ctToken,
          account_id: ctAccountId,
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setIsConnected(true);
        fetchAccountData();
        fetchPositionData();
      } else {
        alert('cTrader connection failed: ' + result.message);
      }
    } catch (error) {
      console.error('Connection error:', error);
      alert('Error contacting backend server.');
    } finally {
      setConnecting(false);
    }
  };

  // Fetch cTrader account stats
  const fetchAccountData = async () => {
    try {
      const response = await fetch('http://localhost:8751/api/ctrader/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setAccountInfo(result.data);
      }
    } catch (error) {
      console.error('Account data error:', error);
    }
  };

  // Fetch cTrader active positions
  const fetchPositionData = async () => {
    try {
      const response = await fetch('http://localhost:8751/api/ctrader/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setOpenPositions(result.data);
      }
    } catch (error) {
      console.error('Positions data error:', error);
    }
  };

  useEffect(() => {
    fetchCandles();
  }, [symbol]);

  // Regular updates when connected
  useEffect(() => {
    if (!isConnected) return;
    fetchAccountData();
    fetchPositionData();
    const interval = setInterval(() => {
      fetchAccountData();
      fetchPositionData();
    }, 3000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Chart setup
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 500,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    if (candles.length > 0) {
      candlestickSeries.setData(candles);
    }

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      alert('Please connect to cTrader first.');
      return;
    }

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 57450;
    try {
      const response = await fetch('http://localhost:8751/api/ctrader/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol,
          order_type: tradeType,
          volume: parseFloat(amount),
          price: orderType === 'market' ? null : parseFloat(price),
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        const newTrade = {
          id: Date.now(),
          type: tradeType.toUpperCase(),
          amount: parseFloat(amount).toFixed(3),
          price: orderType === 'market' ? currentPrice.toLocaleString() : parseFloat(price).toLocaleString(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        setRecentTrades([newTrade, ...recentTrades.slice(0, 4)]);
        fetchAccountData();
        fetchPositionData();
      } else {
        alert('Order execution failed: ' + result.message);
      }
    } catch (error) {
      console.error('Order submission error:', error);
    }
  };

  const getCleanCoinName = () => {
    return symbol.split(':')[1]?.replace('USDT', '') || 'BTC';
  };

  return (
    <div style={styles.container}>
      {/* Top Header/Bar */}
      <header style={styles.header}>
        <div style={styles.logoArea}>
          <Activity size={24} color="#3b82f6" style={styles.logoIcon} />
          <span style={styles.logoText}>NEXUS<span style={styles.logoHighlight}>TRADE</span></span>
          <span style={{
            ...styles.badge,
            backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: isConnected ? '#10b981' : '#ef4444',
            borderColor: isConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
          }}>
            cTrader OpenAPI {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
          <a
            href="https://trader.ftmo.com/accounts-overview"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...styles.badge,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6',
              borderColor: 'rgba(59, 130, 246, 0.2)',
              textDecoration: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center'
            }}
          >
            FTMO Accounts Overview
          </a>
          <a
            href="https://openapi.ctrader.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...styles.badge,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6',
              borderColor: 'rgba(59, 130, 246, 0.2)',
              textDecoration: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center'
            }}
          >
            cTrader OpenAPI Apps
          </a>
        </div>

        <div style={styles.statsBar}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Pair</span>
            <select 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value)}
              style={styles.selectInput}
            >
              <option value="BINANCE:BTCUSDT">BTC / USDT</option>
              <option value="BINANCE:ETHUSDT">ETH / USDT</option>
              <option value="BINANCE:SOLUSDT">SOL / USDT</option>
              <option value="BINANCE:ADAUSDT">ADA / USDT</option>
            </select>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Last Price</span>
            <span style={styles.statValueUp}>
              ${candles.length > 0 ? candles[candles.length - 1].close.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '57,450.00'} 
              <ArrowUpRight size={14} style={{ display: 'inline' }} />
            </span>
          </div>
          {accountInfo && (
            <>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Balance</span>
                <span style={styles.statValue}>{activeBalance(accountInfo)}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Equity</span>
                <span style={styles.statValue}>{activeEquity(accountInfo)}</span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Panel layout */}
      <main style={styles.mainLayout}>
        <section style={styles.chartSection}>
          <div style={styles.chartWrapper}>
            {loading && <div style={styles.loadingOverlay}>Fetching candles from Python backend...</div>}
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>
        </section>

        {/* Right Side: Control Panels */}
        <section style={styles.panelSection}>
          {!isConnected ? (
            <div style={styles.orderCard}>
              <div style={styles.cardHeader}>cTrader OpenAPI Credentials</div>
              <form onSubmit={handleConnect} style={{ ...styles.cardContent, gap: '12px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}><Key size={12} style={{ display: 'inline', marginRight: 4 }} /> OpenAPI Bearer Token</label>
                  <input type="text" value={ctToken} onChange={(e) => setCtToken(e.target.value)} style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}><Globe size={12} style={{ display: 'inline', marginRight: 4 }} /> Account ID</label>
                  <input type="text" value={ctAccountId} onChange={(e) => setCtAccountId(e.target.value)} style={styles.formInput} required />
                </div>
                <button type="submit" disabled={connecting} style={{ ...styles.actionButton, backgroundColor: '#3b82f6' }}>
                  {connecting ? 'Connecting...' : 'Connect to cTrader'}
                </button>
              </form>
            </div>
          ) : (
            <div style={styles.orderCard}>
              <div style={styles.tradeTypeTabs}>
                <button 
                  onClick={() => setTradeType('buy')} 
                  style={{ ...styles.tabButton, ...(tradeType === 'buy' ? styles.buyTabActive : {}) }}
                >
                  BUY
                </button>
                <button 
                  onClick={() => setTradeType('sell')} 
                  style={{ ...styles.tabButton, ...(tradeType === 'sell' ? styles.sellTabActive : {}) }}
                >
                  SELL
                </button>
              </div>

              <div style={styles.cardContent}>
                <div style={styles.walletContainer}>
                  <div style={styles.walletRow}>
                    <div style={styles.walletLabel}>Free Margin:</div>
                    <div style={styles.walletValue}>{activeMarginFree(accountInfo)}</div>
                  </div>
                  <div style={styles.walletRow}>
                    <div style={styles.walletLabel}>Used Margin:</div>
                    <div style={styles.walletValue}>{activeMargin(accountInfo)}</div>
                  </div>
                </div>

                <div style={styles.orderTypeTabs}>
                  {(['market', 'limit'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      style={{ ...styles.orderTypeBtn, ...(orderType === type ? styles.orderTypeBtnActive : {}) }}
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleExecuteTrade} style={styles.tradeForm}>
                  {orderType !== 'market' && (
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}>Limit Price (USDT)</label>
                      <input 
                        type="number" 
                        value={price} 
                        onChange={(e) => setPrice(e.target.value)}
                        style={styles.formInput}
                        step="0.01"
                        required
                      />
                    </div>
                  )}

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Amount (Units)</label>
                    <input 
                      type="number" 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)}
                      style={styles.formInput}
                      step="0.01"
                      min="0.01"
                      required
                    />
                  </div>

                  <button 
                    type="submit" 
                    style={{
                      ...styles.actionButton,
                      ...(tradeType === 'buy' ? styles.actionButtonBuy : styles.actionButtonSell)
                    }}
                  >
                    Execute cTrader Order
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Positions panel */}
          {isConnected && (
            <div style={styles.tradesCard}>
              <div style={styles.tradesHeader}>
                <span>cTrader Active Positions ({openPositions.length})</span>
                <RefreshCw size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={fetchPositionData} />
              </div>
              <div style={styles.tradesList}>
                {openPositions.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>No active positions.</div>
                ) : (
                  openPositions.map((pos) => (
                    <div key={pos.position_id} style={tradeRowStyle(pos.trade_side)}>
                      <span style={{ 
                        ...styles.tradeTypeBadge, 
                        color: pos.trade_side.toUpperCase() === 'BUY' ? '#10b981' : '#ef4444' 
                      }}>
                        {pos.trade_side.toUpperCase()}
                      </span>
                      <span style={styles.tradeAmount}>{pos.volume} {pos.symbol}</span>
                      <span style={styles.tradePrice}>@ {pos.entry_price}</span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: pos.unrealized_profit >= 0 ? '#10b981' : '#ef4444' 
                      }}>
                        ${pos.unrealized_profit.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const activeBalance = (acct: AccountInfo | null) => acct ? `${acct.balance.toLocaleString()} ${acct.currency}` : '-';
const activeEquity = (acct: AccountInfo | null) => acct ? `${acct.equity.toLocaleString()} ${acct.currency}` : '-';
const activeMarginFree = (acct: AccountInfo | null) => acct ? `${acct.margin_free.toLocaleString()} ${acct.currency}` : '-';
const activeMargin = (acct: AccountInfo | null) => acct ? `${acct.margin.toLocaleString()} ${acct.currency}` : '-';

const tradeRowStyle = (side: string) => ({
  ...styles.tradeRow,
  borderLeft: `3px solid ${side.toUpperCase() === 'BUY' ? '#10b981' : '#ef4444'}`,
  paddingLeft: '8px',
});

// Styles
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    width: '100vw',
    backgroundColor: '#0b0f19',
    color: '#f3f4f6',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    backgroundColor: '#111827',
    borderBottom: '1px solid #1f2937',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))',
  },
  logoText: {
    fontWeight: 'bold',
    fontSize: '20px',
    letterSpacing: '1px',
    color: '#ffffff',
  },
  logoHighlight: {
    color: '#3b82f6',
  },
  badge: {
    fontSize: '11px',
    border: '1px solid',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: 'bold',
    marginLeft: '8px',
  },
  statsBar: {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  statLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    marginBottom: '2px',
  },
  statValue: {
    fontSize: '14px',
    fontWeight: '600',
  },
  statValueUp: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#10b981',
  },
  selectInput: {
    backgroundColor: '#1f2937',
    color: '#ffffff',
    border: '1px solid #374151',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  },
  mainLayout: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  chartSection: {
    flex: 3,
    height: '100%',
    borderRight: '1px solid #1f2937',
    padding: '16px',
    backgroundColor: '#0b0f19',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  chartWrapper: {
    position: 'relative' as const,
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #1f2937',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#3b82f6',
    zIndex: 10,
    fontSize: '16px',
    fontWeight: 'bold',
  },
  panelSection: {
    flex: 1,
    minWidth: '350px',
    maxWidth: '420px',
    height: '100%',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    backgroundColor: '#0b0f19',
    overflowY: 'auto' as const,
  },
  orderCard: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '14px 20px',
    borderBottom: '1px solid #1f2937',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#3b82f6',
  },
  tradeTypeTabs: {
    display: 'flex',
    borderBottom: '1px solid #1f2937',
  },
  tabButton: {
    flex: 1,
    padding: '14px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buyTabActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981',
    borderBottom: '3px solid #10b981',
  },
  sellTabActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    borderBottom: '3px solid #ef4444',
  },
  cardContent: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  walletContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    backgroundColor: '#1f2937',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '13px',
    border: '1px solid #374151',
  },
  walletRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLabel: {
    display: 'flex',
    alignItems: 'center',
    color: '#9ca3af',
  },
  walletValue: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
  orderTypeTabs: {
    display: 'flex',
    backgroundColor: '#1f2937',
    borderRadius: '6px',
    padding: '2px',
  },
  orderTypeBtn: {
    flex: 1,
    padding: '8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#9ca3af',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  orderTypeBtnActive: {
    backgroundColor: '#374151',
    color: '#ffffff',
  },
  tradeForm: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  formLabel: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  formInput: {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
    padding: '10px 12px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  percentRow: {
    display: 'flex',
    gap: '8px',
  },
  percentBtn: {
    flex: 1,
    padding: '6px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '4px',
    color: '#9ca3af',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  actionButton: {
    padding: '14px',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    fontSize: '16px',
    cursor: 'pointer',
    color: '#ffffff',
    transition: 'transform 0.1s, opacity 0.2s',
  },
  actionButtonBuy: {
    backgroundColor: '#10b981',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
  },
  actionButtonSell: {
    backgroundColor: '#ef4444',
    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)',
  },
  tradesCard: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    padding: '16px',
    flex: 1,
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  tradesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontWeight: 'bold',
    fontSize: '14px',
    borderBottom: '1px solid #1f2937',
    paddingBottom: '8px',
  },
  tradesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  tradeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    alignItems: 'center',
  },
  tradeTypeBadge: {
    fontWeight: 'bold',
    width: '40px',
  },
  tradeAmount: {
    color: '#ffffff',
  },
  tradePrice: {
    color: '#9ca3af',
  },
  tradeTime: {
    color: '#6b7280',
  },
};
