import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw, Shield, Wallet, Activity, Key, Server, User } from 'lucide-react';
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

interface MT5Account {
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  currency: string;
  lever: number;
  server: string;
  login: number;
}

interface MT5Position {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  sl: number | null;
  tp: number | null;
  profit: number;
}

export default function Trading() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'>>(null);
  
  const [symbol, setSymbol] = useState('BINANCE:BTCUSDT');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [price, setPrice] = useState('57450.00');
  const [amount, setAmount] = useState('0.1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  // MetaTrader State
  const [mt5Connected, setMt5Connected] = useState(false);
  const [mt5Connecting, setMt5Connecting] = useState(false);
  const [mt5Login, setMt5Login] = useState('12345678');
  const [mt5Password, setMt5Password] = useState('demo123');
  const [mt5Server, setMt5Server] = useState('Demo-Server');
  const [accountInfo, setAccountInfo] = useState<MT5Account | null>(null);
  const [openPositions, setOpenPositions] = useState<MT5Position[]>([]);
  
  const [recentTrades, setRecentTrades] = useState([
    { id: 1, type: 'buy', amount: '0.045', price: '57,432.10', time: '15:04:12' },
    { id: 2, type: 'sell', amount: '0.120', price: '57,440.00', time: '15:03:55' },
    { id: 3, type: 'buy', amount: '0.015', price: '57,428.50', time: '15:03:20' },
  ]);

  // Fetch candle data from Python backend
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

  // Connect to MetaTrader
  const connectMetaTrader = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMt5Connecting(true);
    try {
      const response = await fetch('http://localhost:8751/api/metatrader/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: mt5Login,
          password: mt5Password,
          server: mt5Server,
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setMt5Connected(true);
        fetchAccountInfo();
        fetchPositions();
      } else {
        alert('MetaTrader connection failed: ' + result.message);
      }
    } catch (error) {
      console.error('Error connecting to MT5:', error);
      alert('Error connecting to MetaTrader backend.');
    } finally {
      setMt5Connecting(false);
    }
  };

  // Fetch MetaTrader Account Information
  const fetchAccountInfo = async () => {
    try {
      const response = await fetch('http://localhost:8751/api/metatrader/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setAccountInfo(result.data);
      }
    } catch (error) {
      console.error('Error fetching account info:', error);
    }
  };

  // Fetch MetaTrader Open Positions
  const fetchPositions = async () => {
    try {
      const response = await fetch('http://localhost:8751/api/metatrader/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setOpenPositions(result.data);
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  useEffect(() => {
    fetchCandles();
  }, [symbol]);

  // Periodic polling for MT5 data if connected
  useEffect(() => {
    if (!mt5Connected) return;
    const interval = setInterval(() => {
      fetchAccountInfo();
      fetchPositions();
    }, 3000);
    return () => clearInterval(interval);
  }, [mt5Connected]);

  // Initialize chart
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

  // Send real/mock order to MT5
  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mt5Connected) {
      alert('Please connect to MetaTrader first.');
      return;
    }

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 57450;
    try {
      const response = await fetch('http://localhost:8751/api/metatrader/order', {
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
          type: tradeType,
          amount: parseFloat(amount).toFixed(3),
          price: orderType === 'market' ? currentPrice.toLocaleString() : parseFloat(price).toLocaleString(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        setRecentTrades([newTrade, ...recentTrades.slice(0, 4)]);
        fetchAccountInfo();
        fetchPositions();
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
            backgroundColor: mt5Connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: mt5Connected ? '#10b981' : '#ef4444',
            borderColor: mt5Connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
          }}>
            {mt5Connected ? 'MT5 CONNECTED' : 'MT5 DISCONNECTED'}
          </span>
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
                <span style={styles.statLabel}>MT5 Balance</span>
                <span style={styles.statValue}>${accountInfo.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Equity</span>
                <span style={styles.statValue}>${accountInfo.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Panel layout */}
      <main style={styles.mainLayout}>
        {/* Left Side: Python backend chart */}
        <section style={styles.chartSection}>
          <div style={styles.chartWrapper}>
            {loading && <div style={styles.loadingOverlay}>Fetching candles from Python backend...</div>}
            <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
          </div>
        </section>

        {/* Right Side: Command / Order Panel */}
        <section style={styles.panelSection}>
          {/* Connection to MT5 Panel */}
          {!mt5Connected ? (
            <div style={styles.orderCard}>
              <div style={styles.cardHeader}>MetaTrader 5 Login</div>
              <form onSubmit={connectMetaTrader} style={{ ...styles.cardContent, gap: '12px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}><User size={12} style={{ display: 'inline', marginRight: 4 }} /> Login ID</label>
                  <input type="text" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}><Key size={12} style={{ display: 'inline', marginRight: 4 }} /> Password</label>
                  <input type="password" value={mt5Password} onChange={(e) => setMt5Password(e.target.value)} style={styles.formInput} required />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}><Server size={12} style={{ display: 'inline', marginRight: 4 }} /> Server</label>
                  <input type="text" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} style={styles.formInput} required />
                </div>
                <button type="submit" disabled={mt5Connecting} style={{ ...styles.actionButton, backgroundColor: '#3b82f6' }}>
                  {mt5Connecting ? 'Connecting...' : 'Connect to MT5'}
                </button>
              </form>
            </div>
          ) : (
            <div style={styles.orderCard}>
              <div style={styles.tradeTypeTabs}>
                <button 
                  onClick={() => setTradeType('buy')} 
                  style={{
                    ...styles.tabButton, 
                    ...(tradeType === 'buy' ? styles.buyTabActive : {})
                  }}
                >
                  BUY
                </button>
                <button 
                  onClick={() => setTradeType('sell')} 
                  style={{
                    ...styles.tabButton, 
                    ...(tradeType === 'sell' ? styles.sellTabActive : {})
                  }}
                >
                  SELL
                </button>
              </div>

              <div style={styles.cardContent}>
                {/* Account info */}
                <div style={styles.walletContainer}>
                  <div style={styles.walletRow}>
                    <div style={styles.walletLabel}>
                      <Wallet size={14} style={{ marginRight: 6 }} /> Margin Free:
                    </div>
                    <div style={styles.walletValue}>${accountInfo?.margin_free?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div style={styles.walletRow}>
                    <div style={styles.walletLabel}>
                      <Wallet size={14} style={{ marginRight: 6 }} /> Used Margin:
                    </div>
                    <div style={styles.walletValue}>${accountInfo?.margin?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                {/* Order type configuration */}
                <div style={styles.orderTypeTabs}>
                  {(['market', 'limit', 'stop'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      style={{
                        ...styles.orderTypeBtn,
                        ...(orderType === type ? styles.orderTypeBtnActive : {})
                      }}
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
                    <label style={styles.formLabel}>Amount (Lots)</label>
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

                  {/* Percentage helpers */}
                  <div style={styles.percentRow}>
                    {['0.1', '0.5', '1.0', '5.0'].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setAmount(pct)}
                        style={styles.percentBtn}
                      >
                        {pct} Lot
                      </button>
                    ))}
                  </div>

                  {/* Main Action Button */}
                  <button 
                    type="submit" 
                    style={{
                      ...styles.actionButton,
                      ...(tradeType === 'buy' ? styles.actionButtonBuy : styles.actionButtonSell)
                    }}
                  >
                    MT5 {tradeType.toUpperCase()} {getCleanCoinName()}
                  </button>
                </form>

                {/* Security info */}
                <div style={styles.securityNote}>
                  <Shield size={12} style={{ marginRight: 6, color: '#10b981' }} />
                  <span>MetaTrader 5 STP Direct Execution.</span>
                </div>
              </div>
            </div>
          )}

          {/* Active MT5 Positions */}
          {mt5Connected && (
            <div style={styles.tradesCard}>
              <div style={styles.tradesHeader}>
                <span>Active Positions ({openPositions.length})</span>
                <RefreshCw size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={fetchPositions} />
              </div>
              <div style={styles.tradesList}>
                {openPositions.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>No active positions.</div>
                ) : (
                  openPositions.map((pos) => (
                    <div key={pos.ticket} style={tradeRowStyle(pos.type)}>
                      <span style={{ 
                        ...styles.tradeTypeBadge, 
                        color: pos.type === 'buy' ? '#10b981' : '#ef4444' 
                      }}>
                        {pos.type.toUpperCase()}
                      </span>
                      <span style={styles.tradeAmount}>{pos.volume} {pos.symbol}</span>
                      <span style={styles.tradePrice}>@ {pos.price_open}</span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: pos.profit >= 0 ? '#10b981' : '#ef4444' 
                      }}>
                        ${pos.profit.toFixed(2)}
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

const tradeRowStyle = (type: string) => ({
  ...styles.tradeRow,
  borderLeft: `3px solid ${type === 'buy' ? '#10b981' : '#ef4444'}`,
  paddingLeft: '8px',
});

// Inline Styles for a Modern Glassmorphism/Dark Theme UI
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
  calcContainer: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    border: '1px dashed rgba(59, 130, 246, 0.2)',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '13px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  calcRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  calcValue: {
    fontWeight: '600',
    color: '#ffffff',
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
  securityNote: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '11px',
    color: '#9ca3af',
    justifyContent: 'center',
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
