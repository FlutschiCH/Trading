import React, { useState, useEffect } from 'react';
import { Sliders, RefreshCw, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { API_BASE_URL } from '../api';

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

  // Load active risk configurations from Flask API
  const fetchRisk = async () => {
    setLoadingRisk(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/risk`);
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
      const response = await fetch(`${API_BASE_URL}/api/risk`, {
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
      {/* Left panel: Risk HUD */}
      <div style={styles.column}>
        
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
