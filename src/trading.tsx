import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCw, Shield, Wallet, Activity, Key, Server, User, Globe } from 'lucide-react';
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
  lever?: number;
  server?: string;
  login?: number;
  account_type?: string;
  broker?: string;
}

interface Position {
  ticket?: number;
  position_id?: number;
  symbol: string;
  type?: string;
  trade_side?: string;
  volume: number;
  price_open?: number;
  entry_price?: number;
  sl?: number | null;
  tp?: number | null;
  profit?: number;
  unrealized_profit?: number;
}

export default function Trading() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'>>(null);
  
  const [symbol, setSymbol] = useState('BINANCE:BTCUSDT');
  const [platform, setPlatform] = useState<'mt5' | 'ctrader'>('mt5');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [price, setPrice] = useState('57450.00');
  const [amount, setAmount] = useState('0.1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  // Platform Connection State
  const [connectedPlatforms, setConnectedPlatforms] = useState({ mt5: false, ctrader: false });
  const [connecting, setConnecting] = useState(false);
  
  // MT5 Credentials
  const [mt5Login, setMt5Login] = useState('12345678');
  const [mt5Password, setMt5Password] = useState('demo123');
  const [mt5Server, setMt5Server] = useState('Demo-Server');
  
  // cTrader Credentials
  const [ctToken, setCtToken] = useState('ct-token-xyz123');
  const [ctAccountId, setCtAccountId] = useState('9876543');

  // Account & Positions
  const [accounts, setAccounts] = useState<{ mt5: AccountInfo | null; ctrader: AccountInfo | null }>({ mt5: null, ctrader: null });
  const [positions, setPositions] = useState<{ mt5: Position[]; ctrader: Position[] }>({ mt5: [], ctrader: [] });
  
  const [recentTrades, setRecentTrades] = useState([
    { id: 1, type: 'buy', amount: '0.045', price: '57,432.10', time: '15:04:12' },
    { id: 2, type: 'sell', amount: '0.120', price: '57,440.00', time: '15:03:55' },
    { id: 3, type: 'buy', amount: '0.015', price: '57,428.50', time: '15:03:20' },
  ]);

  // Fetch candles
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

  // Connect to active platform
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const endpoint = platform === 'mt5' ? 'metatrader/connect' : 'ctrader/connect';
      const body = platform === 'mt5' 
        ? { login: mt5Login, password: mt5Password, server: mt5Server }
        : { access_token: ctToken, account_id: ctAccountId };

      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setConnectedPlatforms(prev => ({ ...prev, [platform]: true }));
        fetchAccountData();
        fetchPositionData();
      } else {
        alert(`${platform.toUpperCase()} connection failed: ` + result.message);
      }
    } catch (error) {
      console.error('Connection error:', error);
      alert('Error contacting backend server.');
    } finally {
      setConnecting(false);
    }
  };

  // Fetch account data
  const fetchAccountData = async () => {
    if (!connectedPlatforms[platform]) return;
    try {
      const response = await fetch(`http://localhost:8751/api/${platform === 'mt5' ? 'metatrader' : 'ctrader'}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setAccounts(prev => ({ ...prev, [platform]: result.data }));
      }
    } catch (error) {
      console.error('Account data error:', error);
    }
  };

  // Fetch position data
  const fetchPositionData = async () => {
    if (!connectedPlatforms[platform]) return;
    try {
      const response = await fetch(`http://localhost:8751/api/${platform === 'mt5' ? 'metatrader' : 'ctrader'}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setPositions(prev => ({ ...prev, [platform]: result.data }));
      }
    } catch (error) {
      console.error('Positions data error:', error);
    }
  };

  useEffect(() => {
    fetchCandles();
  }, [symbol]);

  // Periodic polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAccountData();
      fetchPositionData();
    }, 4000);
    return () => clearInterval(interval);
  }, [connectedPlatforms, platform]);

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
    if (!connectedPlatforms[platform]) {
      alert(`Please connect to ${platform.toUpperCase()} first.`);
      return;
    }

    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 57450;
    try {
      const response = await fetch(`http://localhost:8751/api/${platform === 'mt5' ? 'metatrader' : 'ctrader'}/order', {
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
        fetchAccountData();
        fetchPositionData();
      } else {
        alert('Order execution failed: ' + result.message);
      }
    } catch (error) {
      console.error('Order submission error:', error);
    }
  };

  const activeAccount = accounts[platform];
  const activePositions = positions[platform];
  const isConnected = connectedPlatforms[platform];

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
            {platform.toUpperCase()} {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        {/* Platform Selection */}
        <div style={styles.platformTabs}>
          <button 
            style={{ ...styles.platformBtn, ...(platform === 'mt5' ? styles.platformBtnActive : {}) }}
            onClick={() => setPlatform('mt5')}
          >
            MetaTrader 5
          </button>
          <button 
            style={{ ...styles.platformBtn, ...(platform === 'ctrader' ? styles.platformBtnActive : {}) }}
            onClick={() => setPlatform('ctrader')}
          >
            cTrader OpenAPI
          </button>
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
          {activeAccount && (
            <>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Balance</span>
                <span style={styles.statValue}>${activeAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Equity</span>
                <span style={styles.statValue}>${activeAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
              <div style={styles.cardHeader}>{platform === 'mt5' ? 'MetaTrader 5 Credentials' : 'cTrader OpenAPI Access'}</div>
              <form onSubmit={handleConnect} style={{ ...styles.cardContent, gap: '12px' }}>
                {platform === 'mt5' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}><Key size={12} style={{ display: 'inline', marginRight: 4 }} /> OpenAPI Bearer Token</label>
                      <input type="text" value={ctToken} onChange={(e) => setCtToken(e.target.value)} style={styles.formInput} required />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.formLabel}><Globe size={12} style={{ display: 'inline', marginRight: 4 }} /> cTrader Account ID</label>
                      <input type="text" value={ctAccountId} onChange={(e) => setCtAccountId(e.target.value)} style={styles.formInput} required />
                    </div>
                  </>
                )}
                <button type="submit" disabled={connecting} style={{ ...styles.actionButton, backgroundColor: '#3b82f6' }}>
                  {connecting ? 'Connecting...' : `Connect to ${platform.toUpperCase()}`}
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
                    <div style={styles.walletLabel}>Available Margin:</div>
                    <div style={styles.walletValue}>${activeAccount?.margin_free?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div style={styles.walletRow}>
                    <div style={styles.walletLabel}>Active Margin:</div>
                    <div style={styles.walletValue}>${activeAccount?.margin?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
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
                    <label style={styles.formLabel}>{platform === 'mt5' ? 'Volume (Lots)' : 'Amount (Units)'}</label>
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
                    Execute {platform.toUpperCase()} Order
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Positions panel */}
          {isConnected && (
            <div style={styles.tradesCard}>
              <div style={styles.tradesHeader}>
                <span>Active Positions ({activePositions.length})</span>
                <RefreshCw size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={fetchPositionData} />
              </div>
              <div style={styles.tradesList}>
                {activePositions.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center', marginTop: '16px' }}>No active positions.</div>
                ) : (
                  activePositions.map((pos, idx) => (
                    <div key={pos.ticket || pos.position_id || idx} style={tradeRowStyle(pos.type || pos.trade_side || 'buy')}>
                      <span style={{ 
                        ...styles.tradeTypeBadge, 
                        color: (pos.type || pos.trade_side)?.toLowerCase() === 'buy' ? '#10b981' : '#ef4444' 
                      }}>
                        {(pos.type || pos.trade_side)?.toUpperCase()}
                      </span>
                      <span style={styles.tradeAmount}>{pos.volume} {pos.symbol}</span>
                      <span style={styles.tradePrice}>@ {pos.price_open || pos.entry_price}</span>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: (pos.profit ?? pos.unrealized_profit ?? 0) >= 0 ? '#10b981' : '#ef4444' 
                      }}>
                        ${(pos.profit ?? pos.unrealized_profit ?? 0).toFixed(2)}
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
  borderLeft: `3px solid ${type.toLowerCase() === 'buy' ? '#10b981' : '#ef4444'}`,
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
  platformTabs: {
    display: 'flex',
    gap: '4px',
    backgroundColor: '#1f2937',
    padding: '3px',
    borderRadius: '6px',
  },
  platformBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#9ca3af',
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  platformBtnActive: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
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
