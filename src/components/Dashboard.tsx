import React, { useState, useEffect } from 'react';
import { Send, ShieldAlert, Sliders, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface AlertLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  payload?: any;
}

interface RiskLimits {
  max_notional: number;
  min_stop_loss_pct: number;
  max_stop_loss_pct: number;
}

export default function Dashboard() {
  const [riskLimits, setRiskLimits] = useState<RiskLimits>({
    max_notional: 100000.0,
    min_stop_loss_pct: 0.5,
    max_stop_loss_pct: 5.0,
  });

  const [loadingRisk, setLoadingRisk] = useState(false);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  
  // Mock Webhook inputs
  const [mockSignalId, setMockSignalId] = useState('sig_' + Math.floor(Math.random() * 1000000));
  const [mockSymbol, setMockSymbol] = useState('BTCUSDT');
  const [mockAction, setMockAction] = useState('BUY');
  const [mockQty, setMockQty] = useState('1.5');
  const [mockPrice, setMockPrice] = useState('57000');
  const [mockStopLoss, setMockStopLoss] = useState('56000');
  const [mockTakeProfit, setMockTakeProfit] = useState('60000');
  const [webhookToken, setWebhookToken] = useState('secure_wyckoff_desks_token_2026');

  // Load active risk configurations from Flask API
  const fetchRisk = async () => {
    setLoadingRisk(true);
    try {
      const response = await fetch('http://localhost:8080/api/risk');
      const result = await response.json();
      if (result.status === 'success') {
        setRiskLimits(result.risk_limits);
        addLog('success', 'Loaded risk parameters from Flask backend.', result.risk_limits);
      }
    } catch (err) {
      console.error(err);
      addLog('error', 'Failed to retrieve risk variables from backend.');
    } finally {
      setLoadingRisk(false);
    }
  };

  const handleUpdateRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingRisk(true);
    try {
      const response = await fetch('http://localhost:8080/api/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(riskLimits),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setRiskLimits(result.risk_limits);
        addLog('success', 'Successfully updated risk limits on backend!', result.risk_limits);
      }
    } catch (err) {
      console.error(err);
      addLog('error', 'Failed to save updated risk variables.');
    } finally {
      setLoadingRisk(false);
    }
  };

  const addLog = (type: AlertLog['type'], message: string, payload?: any) => {
    setLogs(prev => [
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        payload
      },
      ...prev.slice(0, 49)
    ]);
  };

  const calculateHMACSignature = async (secret: string, bodyText: string): Promise<string> => {
    const encoder = new TextEncoder();
    const secretData = encoder.encode(secret);
    const key = await window.crypto.subtle.importKey(
      "raw",
      secretData,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false,
      ["sign"]
    );
    const signatureBuffer = await window.crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(bodyText)
    );
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Dispatch webhook payload with signature
  const fireMockWebhook = async () => {
    const payload = {
      signal_id: mockSignalId,
      symbol: mockSymbol,
      action: mockAction,
      qty: parseFloat(mockQty),
      price: parseFloat(mockPrice),
      stop_loss: parseFloat(mockStopLoss),
      take_profit: parseFloat(mockTakeProfit),
    };

    const bodyText = JSON.stringify(payload);
    
    // Default shared secret: 8f9e23c14a5d6b7e8c9d0e1f2a3b4c5d
    const secretStr = "8f9e23c14a5d6b7e8c9d0e1f2a3b4c5d";
    
    try {
      addLog('info', `Filing Mock Webhook Signal ${mockSignalId}...`, payload);
      
      // Calculate HMAC signature
      const signatureHex = await calculateHMACSignature(secretStr, bodyText);
      
      const response = await fetch('http://localhost:8080/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wyckoff-Token': webhookToken,
          'X-Signature': signatureHex
        },
        body: bodyText,
      });

      const result = await response.json();
      if (response.ok) {
        addLog('success', `Webhook Accepted & Executed! Ref: ${result.message || 'SQLite Recorded'}`, result);
        // Generate new signal ID for next test
        setMockSignalId('sig_' + Math.floor(Math.random() * 1000000));
      } else {
        addLog('warning', `Webhook Rejected: ${result.message || 'Validation failed'}`, result);
      }
    } catch (err: any) {
      addLog('error', `Connection error trying to dispatch webhook: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchRisk();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
      {/* Left panel: Simulation Tool & Risk HUD */}
      <div className="flex flex-col gap-6">
        
        {/* Simulation Tool */}
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
          <h3 className="text-gray-200 font-bold text-sm mb-3 flex items-center gap-2">
            <ShieldAlert className="text-blue-500" size={16} /> Signal & Webhook Simulator
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Signal ID</label>
              <input 
                type="text" 
                value={mockSignalId} 
                onChange={(e) => setMockSignalId(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Token Header</label>
              <input 
                type="text" 
                value={webhookToken} 
                onChange={(e) => setWebhookToken(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Symbol</label>
              <input 
                type="text" 
                value={mockSymbol} 
                onChange={(e) => setMockSymbol(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Action</label>
              <select 
                value={mockAction} 
                onChange={(e) => setMockAction(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white"
              >
                <option value="BUY">BUY / SPRING</option>
                <option value="SELL">SELL / UPTHRUST</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Quantity</label>
              <input 
                type="number" 
                value={mockQty} 
                onChange={(e) => setMockQty(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Price (USD)</label>
              <input 
                type="number" 
                value={mockPrice} 
                onChange={(e) => setMockPrice(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Stop Loss</label>
              <input 
                type="number" 
                value={mockStopLoss} 
                onChange={(e) => setMockStopLoss(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Take Profit</label>
              <input 
                type="number" 
                value={mockTakeProfit} 
                onChange={(e) => setMockTakeProfit(e.target.value)} 
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
          </div>
          <button 
            onClick={fireMockWebhook}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded flex items-center justify-center gap-2 text-xs transition"
          >
            <Send size={12} /> Fire Signed Webhook Signal
          </button>
        </div>

        {/* Risk Parameters HUD */}
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-gray-200 font-bold text-sm flex items-center gap-2">
              <Sliders className="text-yellow-500" size={16} /> Risk Configuration HUD
            </h3>
            <button 
              onClick={fetchRisk} 
              disabled={loadingRisk}
              className="text-gray-400 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingRisk ? 'animate-spin' : ''} />
            </button>
          </div>
          <form onSubmit={handleUpdateRisk} className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-gray-400">Max Single-Trade Notional Limit ($)</label>
              <input 
                type="number" 
                value={riskLimits.max_notional} 
                onChange={(e) => setRiskLimits({ ...riskLimits, max_notional: parseFloat(e.target.value) })}
                className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-gray-400">Min Stop Loss Limit (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={riskLimits.min_stop_loss_pct} 
                  onChange={(e) => setRiskLimits({ ...riskLimits, min_stop_loss_pct: parseFloat(e.target.value) })}
                  className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-gray-400">Max Stop Loss Limit (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={riskLimits.max_stop_loss_pct} 
                  onChange={(e) => setRiskLimits({ ...riskLimits, max_stop_loss_pct: parseFloat(e.target.value) })}
                  className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-white" 
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={loadingRisk}
              className="w-full mt-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 rounded text-xs transition disabled:opacity-50"
            >
              Update Risk Safeguards
            </button>
          </form>
        </div>

      </div>

      {/* Right panel: Live Alert Stream */}
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 flex flex-col h-full">
        <h3 className="text-gray-200 font-bold text-sm mb-3">Live Desk Security & Alert Stream</h3>
        <div className="flex-1 overflow-y-auto max-h-[360px] flex flex-col gap-2 pr-1">
          {logs.length === 0 ? (
            <div className="text-gray-600 text-xs text-center py-20">
              No webhook triggers or validation alerts received yet.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-gray-900 border border-gray-800 rounded p-2.5 flex items-start gap-2.5 text-xs">
                {log.type === 'success' && <CheckCircle2 className="text-green-500 flex-shrink-0 mt-0.5" size={14} />}
                {log.type === 'error' && <XCircle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />}
                {(log.type === 'info' || log.type === 'warning') && <ShieldAlert className={`${log.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'} flex-shrink-0 mt-0.5`} size={14} />}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2 mb-0.5">
                    <span className="text-gray-500 font-mono text-[10px]">{log.timestamp}</span>
                    <span className={`text-[9px] uppercase font-bold tracking-wider ${log.type === 'success' ? 'text-green-500' : log.type === 'error' ? 'text-red-500' : log.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`}>{log.type}</span>
                  </div>
                  <p className="text-gray-300 font-medium break-words leading-relaxed">{log.message}</p>
                  {log.payload && (
                    <pre className="mt-1.5 p-1.5 bg-gray-950 rounded text-[10px] font-mono text-gray-500 overflow-x-auto max-w-full">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
