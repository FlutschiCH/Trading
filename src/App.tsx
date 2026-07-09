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
  const [symbol, setSymbol] = useState('BINANCE:BTCUSDT');
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

  // Fetch candle data and analyze on Flask backend
  const fetchCandles = async () => {
    setLoading(true);
    try {
      let rawCandles: Candle[] = [];
      try {
        const response = await fetch('http://localhost:8080/api/candles/historical', {
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
          rawCandles = result.data.sort((a: Candle, b: Candle) => a.time - b.time);
        }
      } catch (err) {
        console.warn("Using local historical mock generation fallback.");
      }

      if (rawCandles.length > 0) {
        // Send to Flask analyze endpoint for VSA patterns & Weis Wave aggregation
        try {
          const analysisResponse = await fetch('http://localhost:8080/api/analyze', {
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
  }, [symbol]);

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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans">
      
      {/* Upper Navigation Desk Bar */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <Activity size={28} className="text-blue-500 animate-pulse" />
          <span className="font-extrabold text-xl tracking-wider">WYCKOFF<span className="text-blue-500">DESK</span></span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentConnected ? 'bg-green-950/40 text-green-400 border-green-800' : 'bg-red-950/40 text-red-400 border-red-800'}`}>
            cTrader {connectionMode.toUpperCase()} {currentConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* Workspace controls */}
        <div className="flex items-center gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-1 flex gap-1 text-xs font-semibold">
            <button 
              className={`px-3 py-1.5 rounded transition ${connectionMode === 'fix' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setConnectionMode('fix')}
            >
              FIX API
            </button>
            <button 
              className={`px-3 py-1.5 rounded transition ${connectionMode === 'openapi' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setConnectionMode('openapi')}
            >
              OpenAPI
            </button>
          </div>

          <div className="flex flex-col gap-0.5 text-right text-xs">
            <span className="text-gray-400">Trading Pair</span>
            <select 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white font-bold cursor-pointer outline-none"
            >
              <option value="BINANCE:BTCUSDT">BTC / USDT</option>
              <option value="BINANCE:ETHUSDT">ETH / USDT</option>
              <option value="BINANCE:SOLUSDT">SOL / USDT</option>
              <option value="BINANCE:ADAUSDT">ADA / USDT</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 p-6 flex flex-col gap-6">
        
        {/* Top pane: Chart & Trade Entry */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <WyckoffChart 
              symbol={symbol} 
              candles={candles} 
              loading={loading} 
              onRefresh={fetchCandles} 
            />
          </div>

          {/* Trade Execution Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
            <h3 className="text-gray-200 font-bold text-sm border-b border-gray-800 pb-2">Manual Order Entry</h3>
            
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setTradeType('buy')}
                className={`py-2 rounded font-bold text-xs transition ${tradeType === 'buy' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                BUY
              </button>
              <button 
                onClick={() => setTradeType('sell')}
                className={`py-2 rounded font-bold text-xs transition ${tradeType === 'sell' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                SELL
              </button>
            </div>

            {accountInfo && (
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs flex flex-col gap-1">
                <div className="flex justify-between text-gray-400">
                  <span>Balance:</span>
                  <span className="text-white font-bold">{accountInfo.balance} {accountInfo.currency}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Free Margin:</span>
                  <span className="text-white font-bold">{accountInfo.margin_free} {accountInfo.currency}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleExecuteTrade} className="flex flex-col gap-3 text-xs">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-1 flex gap-1 font-semibold">
                <button
                  type="button"
                  onClick={() => setOrderType('market')}
                  className={`flex-1 py-1 rounded text-[10px] transition ${orderType === 'market' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
                >
                  MARKET
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('limit')}
                  className={`flex-1 py-1 rounded text-[10px] transition ${orderType === 'limit' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
                >
                  LIMIT
                </button>
              </div>

              {orderType === 'limit' && (
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400">Limit Price (USDT)</label>
                  <input 
                    type="number" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)}
                    className="bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white"
                    step="0.01"
                    required
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-gray-400">Order Quantity</label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white"
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>

              <button 
                type="submit" 
                className={`w-full mt-2 py-2.5 rounded font-bold text-white shadow-lg transition ${tradeType === 'buy' ? 'bg-green-600 hover:bg-green-700 shadow-green-950/20' : 'bg-red-600 hover:bg-red-700 shadow-red-950/20'}`}
              >
                Submit Order
              </button>
            </form>

            {/* Position Display */}
            {openPositions.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 flex-1 overflow-y-auto max-h-[140px]">
                <span className="text-xs font-bold text-gray-400 flex items-center justify-between">
                  <span>Positions ({openPositions.length})</span>
                </span>
                {openPositions.map((pos) => (
                  <div key={pos.position_id} className="bg-gray-950 border border-gray-800 rounded p-2 text-xs flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className={`font-bold ${pos.trade_side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{pos.trade_side} {pos.volume}</span>
                      <span className="text-[10px] text-gray-500">{pos.symbol}</span>
                    </div>
                    <span className={`font-bold ${pos.unrealized_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${pos.unrealized_profit.toFixed(2)}
                    </span>
                  </div>
                ))}
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
