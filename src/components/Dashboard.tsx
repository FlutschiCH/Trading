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
      const response = await fetch('http://localhost:8751/api/risk');
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
      const response = await fetch('http://localhost:8751/api/risk', {
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
    const secretStr = "8f9e23c14a5d6b7e8c9d0e1f2a3b4c5d";
    
    try {
      addLog('info', `Filing Mock Webhook Signal ${mockSignalId}...`, payload);
      const signatureHex = await calculateHMACSignature(secretStr, bodyText);
      
      const response = await fetch('http://localhost:8751/api/webhook', {
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

  // Shared Inline Styles
  const styles = {
    container: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '24px',
      backgroundColor: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '12px',
      padding: '16px',
    },
    column: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    card: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '16px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px',
    },
    title: {
      color: '#e5e7eb',
      fontWeight: 'bold',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      margin: 0,
    },
    formGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '12px',
      fontSize: '12px',
    },
    formGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    label: {
      color: '#9ca3af',
    },
    input: {
      backgroundColor: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '6px',
      padding: '6px 10px',
      color: '#ffffff',
      outline: 'none',
      fontSize: '12px',
    },
    btn: (color: string) => ({
      width: '100%',
      marginTop: '16px',
      backgroundColor: color,
      color: '#ffffff',
      fontWeight: 'bold' as const,
      padding: '8px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontSize: '12px',
      transition: 'all 0.2s',
    }),
    refreshBtn: {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#9ca3af',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
    },
    streamWrapper: {
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
    },
    streamList: {
      flex: 1,
      overflowY: 'auto' as const,
      maxHeight: '360px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      paddingRight: '4px',
    },
    noLogs: {
      color: '#4b5563',
      fontSize: '12px',
      textAlign: 'center' as const,
      padding: '80px 0',
    },
    logCard: {
      backgroundColor: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '6px',
      padding: '10px',
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-start',
      fontSize: '12px',
    },
    logHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '4px',
    },
    logTime: {
      color: '#6b7280',
      fontFamily: 'monospace',
      fontSize: '10px',
    },
    logBadge: (type: string) => {
      const colors: any = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
      };
      return {
        fontSize: '9px',
        fontWeight: 'bold' as const,
        textTransform: 'uppercase' as const,
        color: colors[type] || '#9ca3af',
      };
    },
    logText: {
      color: '#d1d5db',
      margin: 0,
      lineHeight: '1.4',
    },
    logPre: {
      marginTop: '6px',
      padding: '6px',
      backgroundColor: '#0b0f19',
      borderRadius: '4px',
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#6b7280',
      overflowX: 'auto' as const,
      whiteSpace: 'pre-wrap' as const,
    }
  };

  return (
    <div style={styles.container}>
      {/* Left panel: Simulation Tool & Risk HUD */}
      <div style={styles.column}>
        
        {/* Simulation Tool */}
        <div style={styles.card}>
          <h3 style={styles.title}>
            <ShieldAlert style={{ color: '#3b82f6' }} size={16} /> Signal & Webhook Simulator
          </h3>
          <div style={{ ...styles.formGrid, marginTop: '12px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Signal ID</label>
              <input 
                type="text" 
                value={mockSignalId} 
                onChange={(e) => setMockSignalId(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Token Header</label>
              <input 
                type="text" 
                value={webhookToken} 
                onChange={(e) => setWebhookToken(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Symbol</label>
              <input 
                type="text" 
                value={mockSymbol} 
                onChange={(e) => setMockSymbol(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Action</label>
              <select 
                value={mockAction} 
                onChange={(e) => setMockAction(e.target.value)} 
                style={styles.input}
              >
                <option value="BUY">BUY / SPRING</option>
                <option value="SELL">SELL / UPTHRUST</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Quantity</label>
              <input 
                type="number" 
                value={mockQty} 
                onChange={(e) => setMockQty(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Price (USD)</label>
              <input 
                type="number" 
                value={mockPrice} 
                onChange={(e) => setMockPrice(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Stop Loss</label>
              <input 
                type="number" 
                value={mockStopLoss} 
                onChange={(e) => setMockStopLoss(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Take Profit</label>
              <input 
                type="number" 
                value={mockTakeProfit} 
                onChange={(e) => setMockTakeProfit(e.target.value)} 
                style={styles.input} 
              />
            </div>
          </div>
          <button 
            onClick={fireMockWebhook}
            style={styles.btn('#3b82f6')}
          >
            <Send size={12} /> Fire Signed Webhook Signal
          </button>
        </div>

        {/* Risk Parameters HUD */}
        <div style={styles.card}>
          <div style={styles.header}>
            <h3 style={styles.title}>
              <Sliders style={{ color: '#f59e0b' }} size={16} /> Risk Configuration HUD
            </h3>
            <button 
              onClick={fetchRisk} 
              disabled={loadingRisk}
              style={styles.refreshBtn}
            >
              <RefreshCw size={14} className={loadingRisk ? 'animate-spin' : ''} />
            </button>
          </div>
          <form onSubmit={handleUpdateRisk} style={{ ...styles.formGroup, fontSize: '12px' }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Max Single-Trade Notional Limit ($)</label>
              <input 
                type="number" 
                value={riskLimits.max_notional} 
                onChange={(e) => setRiskLimits({ ...riskLimits, max_notional: parseFloat(e.target.value) })}
                style={styles.input} 
              />
            </div>
            <div style={{ ...styles.formGrid, marginTop: '12px' }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Min Stop Loss Limit (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={riskLimits.min_stop_loss_pct} 
                  onChange={(e) => setRiskLimits({ ...riskLimits, min_stop_loss_pct: parseFloat(e.target.value) })}
                  style={styles.input} 
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Max Stop Loss Limit (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={riskLimits.max_stop_loss_pct} 
                  onChange={(e) => setRiskLimits({ ...riskLimits, max_stop_loss_pct: parseFloat(e.target.value) })}
                  style={styles.input} 
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={loadingRisk}
              style={styles.btn('#d97706')}
            >
              Update Risk Safeguards
            </button>
          </form>
        </div>

      </div>

      {/* Right panel: Live Alert Stream */}
      <div style={styles.card}>
        <div style={styles.streamWrapper}>
          <h3 style={{ ...styles.title, marginBottom: '12px' }}>Live Desk Security & Alert Stream</h3>
          <div style={styles.streamList}>
            {logs.length === 0 ? (
              <div style={styles.noLogs}>
                No webhook triggers or validation alerts received yet.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} style={styles.logCard}>
                  {log.type === 'success' && <CheckCircle2 style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }} size={14} />}
                  {log.type === 'error' && <XCircle style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} size={14} />}
                  {(log.type === 'info' || log.type === 'warning') && <ShieldAlert style={{ color: log.type === 'warning' ? '#f59e0b' : '#3b82f6', flexShrink: 0, marginTop: 2 }} size={14} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.logHeader}>
                      <span style={styles.logTime}>{log.timestamp}</span>
                      <span style={styles.logBadge(log.type)}>{log.type}</span>
                    </div>
                    <p style={styles.logText}>{log.message}</p>
                    {log.payload && (
                      <pre style={styles.logPre}>
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
    </div>
  );
}
