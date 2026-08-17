import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api';

export interface SavedRunSummary {
  id: string;
  symbol: string;
  timeframe: string;
  broker?: string;
  sl_val: number;
  sl_type?: string;
  rr: number;
  be_trigger_r: number;
  net_pnl: number;
  win_rate: number;
  trades_cnt: number;
  profit_factor: number;
  max_drawdown?: number;
  created_at: string;
}

interface SavedRunsProps {
  onClose: () => void;
  onLoadSavedBacktest: (id: string) => void;
}

export default function SavedRuns({ onClose, onLoadSavedBacktest }: SavedRunsProps) {
  const [savedBacktestsList, setSavedBacktestsList] = useState<SavedRunSummary[]>([]);
  const [loadingSavedBacktests, setLoadingSavedBacktests] = useState(false);
  const [sbSortField, setSbSortField] = useState<string>('created_at');
  const [sbSortDir, setSbSortDir] = useState<'asc' | 'desc'>('desc');
  const [sbFilterSymbol, setSbFilterSymbol] = useState<string>('all');

  // Parameters info popup state
  const [infoModalRun, setInfoModalRun] = useState<{ id: string; settings: any } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const fetchSavedBacktests = async () => {
    setLoadingSavedBacktests(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/saved`);
      const json = await res.json();
      if (json.status === 'success') {
        setSavedBacktestsList(json.data || []);
      }
    } catch (e) {
      console.error("Error fetching saved backtests:", e);
    } finally {
      setLoadingSavedBacktests(false);
    }
  };

  useEffect(() => {
    fetchSavedBacktests();
  }, []);

  const handleDeleteSavedBacktest = async (id: string) => {
    if (!confirm("Are you sure you want to delete this saved backtest?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/saved/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.status === 'success') {
        fetchSavedBacktests();
      } else {
        alert("Failed to delete backtest: " + (json.message || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error deleting saved backtest: " + err.message);
    }
  };

  const handleShowMoreInfos = async (id: string) => {
    setLoadingInfo(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/saved/${id}`);
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setInfoModalRun({ id, settings: json.data.settings || {} });
      } else {
        alert("Failed to fetch parameters info: " + (json.message || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error fetching parameters info: " + err.message);
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleDeleteActiveBacktests = async () => {
    if (!confirm("Are you sure you want to stop and delete all active/running backtest jobs?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/jobs?active_only=true`, { method: 'DELETE' });
      const json = await res.json();
      if (json.status === 'success') {
        fetchSavedBacktests();
      } else {
        alert("Failed to delete active jobs: " + (json.message || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error deleting active backtests: " + err.message);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--app-card-bg, #0f172a)',
        border: '1px solid var(--app-card-border, #334155)',
        color: 'var(--app-text, #f8fafc)',
        borderRadius: '12px',
        width: '1050px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        position: 'relative'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--app-card-border, #1e293b)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>📁</span>
            <h3 style={{ margin: 0, color: 'var(--app-text, #f8fafc)', fontSize: '16px', fontWeight: 600 }}>Saved Backtest Runs (MySQL Database)</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleDeleteActiveBacktests}
              style={{
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🧹 Clear Active/Stuck Runs
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--app-text-muted, #94a3b8)',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div style={{
          padding: '12px 20px',
          backgroundColor: 'var(--app-panel-header-bg, #1e293b)',
          borderBottom: '1px solid var(--app-card-border, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ color: 'var(--app-text, #cbd5e1)', fontSize: '12px', fontWeight: 500 }}>Filter Symbol:</label>
            <select
              value={sbFilterSymbol}
              onChange={(e) => setSbFilterSymbol(e.target.value)}
              style={{
                backgroundColor: 'var(--app-input-bg, #0f172a)',
                color: 'var(--app-input-text, #f8fafc)',
                border: '1px solid var(--app-input-border, #475569)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              <option value="all">All Symbols</option>
              {Array.from(new Set(savedBacktestsList.map(item => item.symbol))).map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
            <span style={{ color: 'var(--app-text-muted, #94a3b8)', fontSize: '12px' }}>
              ({savedBacktestsList.filter(item => sbFilterSymbol === 'all' || item.symbol === sbFilterSymbol).length} saved runs)
            </span>
          </div>
          <button
            onClick={fetchSavedBacktests}
            style={{
              backgroundColor: 'var(--app-card-border, #334155)',
              color: 'var(--app-text, #f8fafc)',
              border: '1px solid var(--app-input-border, #475569)',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh List
          </button>
        </div>

        {/* Table Container */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {loadingSavedBacktests ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--app-text-muted, #94a3b8)' }}>Loading saved backtests from database...</div>
          ) : savedBacktestsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--app-text-muted, #94a3b8)' }}>No saved backtests found in MySQL database. Run backtests to auto-save results!</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--app-panel-header-bg, #1e293b)', color: 'var(--app-text, #cbd5e1)', borderBottom: '1px solid var(--app-card-border, #334155)' }}>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('created_at'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>Date {sbSortField === 'created_at' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('symbol'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>Symbol {sbSortField === 'symbol' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px' }}>TF</th>
                  <th style={{ padding: '10px' }}>SL / RR / BE</th>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('trades_cnt'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>Trades {sbSortField === 'trades_cnt' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('win_rate'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>Win Rate {sbSortField === 'win_rate' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('net_pnl'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>Net PnL {sbSortField === 'net_pnl' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('profit_factor'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>PF {sbSortField === 'profit_factor' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px', cursor: 'pointer' }} onClick={() => { setSbSortField('max_drawdown'); setSbSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); }}>DD {sbSortField === 'max_drawdown' ? (sbSortDir === 'desc' ? '▼' : '▲') : ''}</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {savedBacktestsList
                  .filter(item => sbFilterSymbol === 'all' || item.symbol === sbFilterSymbol)
                  .sort((a, b) => {
                    let valA = (a as any)[sbSortField];
                    let valB = (b as any)[sbSortField];
                    if (valA === undefined) valA = 0;
                    if (valB === undefined) valB = 0;
                    if (typeof valA === 'string') {
                      return sbSortDir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
                    }
                    return sbSortDir === 'desc' ? valB - valA : valA - valB;
                  })
                  .map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--app-card-border, #1e293b)', color: 'var(--app-text, #f8fafc)' }}>
                      <td style={{ padding: '10px', color: 'var(--app-text-muted, #94a3b8)' }}>{row.created_at || 'N/A'}</td>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#38bdf8' }}>{row.symbol}</td>
                      <td style={{ padding: '10px' }}>{row.timeframe}</td>
                      <td style={{ padding: '10px', color: 'var(--app-text-muted, #cbd5e1)' }}>SL: {row.sl_val} | RR: 1:{row.rr} | BE: {row.be_trigger_r}R</td>
                      <td style={{ padding: '10px' }}>{row.trades_cnt}</td>
                      <td style={{ padding: '10px', color: row.win_rate >= 50 ? '#4ade80' : '#f87171' }}>{row.win_rate ? row.win_rate.toFixed(1) : 0}%</td>
                      <td style={{ padding: '10px', fontWeight: 600, color: row.net_pnl >= 0 ? '#4ade80' : '#f87171' }}>
                        {row.net_pnl >= 0 ? `+$${row.net_pnl.toFixed(2)}` : `-$${Math.abs(row.net_pnl).toFixed(2)}`}
                      </td>
                      <td style={{ padding: '10px' }}>{row.profit_factor ? row.profit_factor.toFixed(2) : '0.00'}</td>
                      <td style={{ padding: '10px', color: '#f87171' }}>{row.max_drawdown !== undefined && row.max_drawdown !== null ? `${Number(row.max_drawdown).toFixed(2)}%` : '0.00%'}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            onClick={() => handleShowMoreInfos(row.id)}
                            style={{
                              backgroundColor: '#0284c7',
                              color: '#ffffff',
                              border: 'none',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            ℹ️ More Infos
                          </button>
                          <button
                            onClick={() => onLoadSavedBacktest(row.id)}
                            style={{
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteSavedBacktest(row.id)}
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              border: '1px solid #ef4444',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Parameters Info Modal (Simple Text Overview) */}
        {infoModalRun && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--app-card-bg, #0f172a)',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10000,
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--app-card-border, #334155)', paddingBottom: '12px' }}>
              <h4 style={{ margin: 0, color: 'var(--app-text, #f8fafc)', fontSize: '16px', fontWeight: 600 }}>
                📋 Parameters Overview (Run ID: {infoModalRun.id})
              </h4>
              <button
                onClick={() => setInfoModalRun(null)}
                style={{
                  backgroundColor: 'var(--app-panel-header-bg, #334155)',
                  color: 'var(--app-text, #cbd5e1)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Close Overview
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', color: 'var(--app-text, #e2e8f0)', fontSize: '13px' }}>
              {Object.keys(infoModalRun.settings || {}).length === 0 ? (
                <div style={{ color: 'var(--app-text-muted, #94a3b8)' }}>No parameter settings stored for this run.</div>
              ) : (
                Object.entries(infoModalRun.settings).map(([key, val]) => (
                  <div key={key} style={{ backgroundColor: 'var(--app-panel-header-bg, #1e293b)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--app-card-border, #334155)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--app-text-muted, #94a3b8)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '2px' }}>
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div style={{ color: '#38bdf8', fontWeight: 500, wordBreak: 'break-all' }}>
                      {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
