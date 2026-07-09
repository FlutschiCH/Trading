import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import WyckoffChart from './components/WyckoffChart.tsx';
import Dashboard from './components/Dashboard.tsx';
import './App.css';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vsa_patterns?: string[];
  weis_wave_volume?: number;
  tr_high?: number;
  tr_low?: number;
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

export default function App() {
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 
    'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'
  ]);
  const [availableTimeframes, setAvailableTimeframes] = useState<string[]>([
    '1m', '5m', '15m', '30m', '1h', '4h', '1d'
  ]);
  const [symbol, setSymbol] = useState('BTCUSD');
  const [timeframe, setTimeframe] = useState('15m');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('57450.00');
  const [amount, setAmount] = useState('0.1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  // Connection states
  const [connectionMode, setConnectionMode] = useState<'openapi' | 'fix'>('fix');
  const [isConnectedOpenAPI] = useState(true);
  const [isConnectedFIX] = useState(true);

  // Account & Positions
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);

  // Fetch symbols and timeframes metadata on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const symRes = await fetch('http://localhost:8751/api/ctrader/symbols');
        const symData = await symRes.json();
        if (symData.status === 'success' && symData.data) {
          setAvailableSymbols(symData.data);
          if (symData.data.length > 0 && !symData.data.includes(symbol)) {
            setSymbol(symData.data[0]);
          }
        }
      } catch (e) {
        console.error('Failed to load symbols:', e);
      }

      try {
        const tfRes = await fetch('http://localhost:8751/api/ctrader/timeframes');
        const tfData = await tfRes.json();
        if (tfData.status === 'success' && tfData.data) {
          setAvailableTimeframes(tfData.data);
        }
      } catch (e) {
        console.error('Failed to load timeframes:', e);
      }
    };
    loadMetadata();
  }, []);

  // Fetch candle data and analyze on Flask backend
  const fetchCandles = async () => {
    setLoading(true);
    try {
      let rawCandles: Candle[] = [];
      try {
        const response = await fetch('http://localhost:8751/api/candles/historical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: symbol.replace('BINANCE:', ''),
            interval: timeframe,
            limit: 100,
          }),
        });
        const result = await response.json();
        if (result.status === 'success') {
          rawCandles = result.data.sort((a: Candle, b: Candle) => a.time - b.time);
        }
      } catch (err) {
        console.warn("Using local historical mock generation fallback.");
      }

      if (rawCandles.length > 0) {
        // Send to Flask analyze endpoint for VSA patterns & Weis Wave aggregation
        try {
          const analysisResponse = await fetch('http://localhost:8751/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candles: rawCandles }),
          });
          const analysisResult = await analysisResponse.json();
          if (analysisResult.status === 'success') {
            rawCandles = analysisResult.data;
          }
        } catch (analysisErr) {
          console.error("Failed to run Flask analyze endpoint:", analysisErr);
        }
        setCandles(rawCandles);
      }
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
    }
  };

  // cTrader API endpoints
  const fetchAccountData = async () => {
    const isConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;
    if (!isConnected) return;
    try {
      const endpoint = connectionMode === 'openapi' ? 'ctrader/account' : 'localctrader/account';
      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
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

  const fetchPositionData = async () => {
    const isConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;
    if (!isConnected) return;
    try {
      const endpoint = connectionMode === 'openapi' ? 'ctrader/positions' : 'localctrader/positions';
      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
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

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = connectionMode === 'openapi' ? 'ctrader/order' : 'localctrader/order';
      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
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
        fetchAccountData();
        fetchPositionData();
      } else {
        alert('Order execution failed: ' + result.message);
      }
    } catch (error) {
      console.error('Order submission error:', error);
    }
  };

  useEffect(() => {
    fetchCandles();
  }, [symbol, timeframe]);

  useEffect(() => {
    const isConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;
    if (!isConnected) return;
    fetchAccountData();
    fetchPositionData();
    const interval = setInterval(() => {
      fetchAccountData();
      fetchPositionData();
    }, 5000);
    return () => clearInterval(interval);
  }, [connectionMode]);

  const currentConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;

  // Shared Inline Styles
  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column' as const,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
      backgroundColor: '#111827',
      borderBottom: '1px solid #1f2937',
      padding: '16px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap' as const,
    },
    logoSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    logoText: {
      fontWeight: 'bold',
      fontSize: '20px',
      letterSpacing: '1px',
    },
    logoHighlight: {
      color: '#3b82f6',
    },
    statusBadge: {
      fontSize: '10px',
      fontWeight: 'bold',
      padding: '2px 8px',
      borderRadius: '12px',
      border: '1px solid',
      backgroundColor: currentConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      color: currentConnected ? '#10b981' : '#ef4444',
      borderColor: currentConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    },
    linkBtn: {
      fontSize: '11px',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      color: '#3b82f6',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      padding: '4px 10px',
      borderRadius: '12px',
      fontWeight: 'bold' as const,
      textDecoration: 'none',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'all 0.2s',
      marginLeft: '8px',
    },
    controlsSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    modeTabs: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '4px',
    },
    modeBtn: (active: boolean) => ({
      backgroundColor: active ? '#3b82f6' : 'transparent',
      color: active ? '#ffffff' : '#9ca3af',
      padding: '6px 12px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold',
      transition: 'all 0.2s',
    }),
    pairGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
      textAlign: 'right' as const,
      fontSize: '12px',
    },
    pairSelect: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '6px',
      padding: '4px 8px',
      color: '#ffffff',
      fontWeight: 'bold',
      cursor: 'pointer',
      outline: 'none',
    },
    mainLayout: {
      flex: 1,
      padding: '24px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    topPane: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '24px',
    },
    chartCol: {
      gridColumn: 'span 3',
      '@media (max-width: 1024px)': {
        gridColumn: 'span 1',
      }
    },
    orderCard: {
      backgroundColor: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
    },
    cardTitle: {
      color: '#e5e7eb',
      fontWeight: 'bold',
      fontSize: '14px',
      borderBottom: '1px solid #1f2937',
      paddingBottom: '8px',
      margin: 0,
    },
    tradeTypeTabs: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
    },
    tradeTypeBtn: (active: boolean, isBuy: boolean) => ({
      padding: '8px',
      borderRadius: '6px',
      fontWeight: 'bold' as const,
      fontSize: '12px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: active ? (isBuy ? '#10b981' : '#ef4444') : '#1f2937',
      color: active ? '#ffffff' : '#9ca3af',
    }),
    walletContainer: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '10px',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    walletRow: {
      display: 'flex',
      justifyContent: 'space-between',
    },
    tradeForm: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
      fontSize: '12px',
    },
    orderTypeTabs: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '4px',
    },
    orderTypeBtn: (active: boolean) => ({
      flex: 1,
      padding: '4px',
      borderRadius: '6px',
      fontSize: '10px',
      border: 'none',
      cursor: 'pointer',
      backgroundColor: active ? '#1f2937' : 'transparent',
      color: active ? '#ffffff' : '#9ca3af',
      fontWeight: 'bold',
      transition: 'all 0.2s',
    }),
    formGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    input: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '6px',
      padding: '6px 10px',
      color: '#ffffff',
      outline: 'none',
    },
    submitBtn: (isBuy: boolean) => ({
      width: '100%',
      marginTop: '8px',
      padding: '10px',
      borderRadius: '8px',
      fontWeight: 'bold' as const,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: isBuy ? '#10b981' : '#ef4444',
      color: '#ffffff',
      boxShadow: `0 4px 14px ${isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      transition: 'all 0.2s',
    }),
    positionsList: {
      marginTop: '8px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      maxHeight: '140px',
      overflowY: 'auto' as const,
    },
    positionRow: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '6px',
      padding: '8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    posDetails: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
    },
    posSide: (isBuy: boolean) => ({
      fontWeight: 'bold' as const,
      color: isBuy ? '#10b981' : '#ef4444',
    }),
    posPnl: (isProfit: boolean) => ({
      fontWeight: 'bold' as const,
      color: isProfit ? '#10b981' : '#ef4444',
    })
  };

  return (
    <div style={styles.container}>
      
      {/* Upper Navigation Desk Bar */}
      <header style={styles.header}>
        <div style={styles.logoSection}>
          <Activity size={28} style={{ color: '#3b82f6' }} />
          <span style={styles.logoText}>WYCKOFF<span style={styles.logoHighlight}>DESK</span></span>
          <span style={styles.statusBadge}>
            cTrader {connectionMode.toUpperCase()} {currentConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          <a href="https://openapi.ctrader.com/apps" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
            cTrader Apps
          </a>
          <a href="https://gemini.google.com/app/71d33e33a84aa328" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
            Wyckoff Prompt
          </a>
        </div>

        {/* Workspace controls */}
        <div style={styles.controlsSection}>
          <div style={styles.modeTabs}>
            <button 
              style={styles.modeBtn(connectionMode === 'fix')}
              onClick={() => setConnectionMode('fix')}
            >
              FIX API
            </button>
            <button 
              style={styles.modeBtn(connectionMode === 'openapi')}
              onClick={() => setConnectionMode('openapi')}
            >
              OpenAPI
            </button>
          </div>

          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af' }}>Symbol</span>
            <select 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value)}
              style={styles.pairSelect}
            >
              {availableSymbols.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>

          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af' }}>Timeframe</span>
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value)}
              style={styles.pairSelect}
            >
              {availableTimeframes.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main style={styles.mainLayout}>
        
        {/* Top pane: Chart & Trade Entry */}
        <div style={styles.topPane}>
          <div style={{ gridColumn: 'span 3' }}>
            <WyckoffChart 
              symbol={symbol} 
              candles={candles} 
              loading={loading} 
              onRefresh={fetchCandles} 
            />
          </div>

          {/* Trade Execution Panel */}
          <div style={styles.orderCard}>
            <h3 style={styles.cardTitle}>Manual Order Entry</h3>
            
            <div style={styles.tradeTypeTabs}>
              <button 
                onClick={() => setTradeType('buy')}
                style={styles.tradeTypeBtn(tradeType === 'buy', true)}
              >
                BUY
              </button>
              <button 
                onClick={() => setTradeType('sell')}
                style={styles.tradeTypeBtn(tradeType === 'sell', false)}
              >
                SELL
              </button>
            </div>

            {accountInfo && (
              <div style={styles.walletContainer}>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Balance:</span>
                  <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{accountInfo.balance} {accountInfo.currency}</span>
                </div>
                <div style={styles.walletRow}>
                  <span style={{ color: '#9ca3af' }}>Free Margin:</span>
                  <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{accountInfo.margin_free} {accountInfo.currency}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleExecuteTrade} style={styles.tradeForm}>
              <div style={styles.orderTypeTabs}>
                <button
                  type="button"
                  onClick={() => setOrderType('market')}
                  style={styles.orderTypeBtn(orderType === 'market')}
                >
                  MARKET
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('limit')}
                  style={styles.orderTypeBtn(orderType === 'limit')}
                >
                  LIMIT
                </button>
              </div>

              {orderType === 'limit' && (
                <div style={styles.formGroup}>
                  <label style={{ color: '#9ca3af' }}>Limit Price (USDT)</label>
                  <input 
                    type="number" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)}
                    style={styles.input}
                    step="0.01"
                    required
                  />
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af' }}>Order Quantity</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)}
                  style={styles.input}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>

              <button 
                type="submit" 
                style={styles.submitBtn(tradeType === 'buy')}
              >
                Submit Order
              </button>
            </form>

            {/* Position Display */}
            {openPositions.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}>
                  Positions ({openPositions.length})
                </span>
                <div style={styles.positionsList}>
                  {openPositions.map((pos) => (
                    <div key={pos.position_id} style={styles.positionRow}>
                      <div style={styles.posDetails}>
                        <span style={styles.posSide(pos.trade_side === 'BUY')}>{pos.trade_side} {pos.volume}</span>
                        <span style={{ fontSize: '10px', color: '#6b7280' }}>{pos.symbol}</span>
                      </div>
                      <span style={styles.posPnl(pos.unrealized_profit >= 0)}>
                        ${pos.unrealized_profit.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom pane: Security Stream & Webhook Simulation Controls */}
        <Dashboard />

      </main>
    </div>
  );
}
