import React, { useState, useEffect } from 'react';
import { Copy, Check, BarChart2, RefreshCw, Calendar, TrendingUp, TrendingDown, Award, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../api';
import DebugComponentBadge from './debug_component_badge';

export const TradeAnalyzerCard: React.FC = () => {
  const [dateOption, setDateOption] = useState<string>('last_30_days');
  const [loading, setLoading] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const calculateDateBounds = (option: string) => {
    const now = Math.floor(Date.now() / 1000);
    if (option === 'last_7_days') {
      return { date_from: now - (7 * 86400), date_to: now };
    }
    if (option === 'last_30_days') {
      return { date_from: now - (30 * 86400), date_to: now };
    }
    if (option === 'last_90_days') {
      return { date_from: now - (90 * 86400), date_to: now };
    }
    return {};
  };

  const fetchAnalysis = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const bounds = calculateDateBounds(dateOption);
      const res = await fetch(`${API_BASE_URL}/api/trade-analyzer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bounds)
      });
      const data = await res.json();
      if (data.status === 'error') {
        setErrorMsg(data.message || 'Failed to fetch trade analysis');
      } else {
        setAnalysisData(data);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error fetching trade analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [dateOption]);

  const handleCopyPrompt = () => {
    if (!analysisData || !analysisData.prompt_for_ai) return;
    navigator.clipboard.writeText(analysisData.prompt_for_ai);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = analysisData?.summary;

  return (
    <div style={{
      backgroundColor: 'var(--app-card-bg, #111827)',
      border: '1px solid var(--app-card-border, #1f2937)',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    }}>
      {/* Card Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '14px',
        paddingBottom: '10px',
        borderBottom: '1px solid var(--app-card-border, #1f2937)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <BarChart2 style={{ width: '18px', height: '18px', color: '#3b82f6' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--app-text, #f3f4f6)' }}>
            Trade Analyzer (MT Deals)
          </span>
          <DebugComponentBadge name="TradeAnalyzerCard" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar style={{ width: '14px', height: '14px', color: '#94a3b8' }} />
            <select
              value={dateOption}
              onChange={(e) => setDateOption(e.target.value)}
              style={{
                backgroundColor: 'var(--app-input-bg, #0b0f19)',
                border: '1px solid var(--app-input-border, #1f2937)',
                borderRadius: '6px',
                color: 'var(--app-text, #ffffff)',
                padding: '4px 8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="last_90_days">Last 90 Days</option>
            </select>
          </div>

          <button
            onClick={fetchAnalysis}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <RefreshCw style={{ width: '12px', height: '12px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#f87171',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <AlertTriangle style={{ width: '14px', height: '14px' }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary KPI Badges */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: '8px',
          marginBottom: '14px'
        }}>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Total Trades</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f8fafc' }}>{summary.total_trades}</span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Win Rate</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: summary.win_rate >= 50 ? '#10b981' : '#f87171' }}>
              {summary.win_rate}%
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Net PnL</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: summary.net_pnl >= 0 ? '#10b981' : '#f87171' }}>
              {summary.net_pnl >= 0 ? `+$${summary.net_pnl}` : `-$${Math.abs(summary.net_pnl)}`}
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Profit Factor</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: summary.profit_factor >= 1.5 ? '#10b981' : '#f59e0b' }}>
              {summary.profit_factor}
            </span>
          </div>

          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>Max Drawdown</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef4444' }}>
              ${summary.max_drawdown}
            </span>
          </div>
        </div>
      )}

      {/* LLM JSON Textarea Output with 1-Click Copy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
            Formatted AI Prompt JSON
          </label>
          <button
            onClick={handleCopyPrompt}
            disabled={!analysisData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: copied ? '#059669' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: analysisData ? 'pointer' : 'not-allowed',
              opacity: analysisData ? 1 : 0.6,
              transition: 'background-color 0.2s ease'
            }}
          >
            {copied ? <Check style={{ width: '13px', height: '13px' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
            <span>{copied ? 'Copied Prompt!' : 'Copy Prompt for AI'}</span>
          </button>
        </div>

        <textarea
          readOnly
          value={analysisData?.prompt_for_ai || (loading ? 'Analyzing MetaTrader deals...' : 'No data loaded.')}
          rows={10}
          style={{
            width: '100%',
            backgroundColor: '#090d16',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            color: '#38bdf8',
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: '12px',
            outline: 'none',
            resize: 'vertical'
          }}
        />
      </div>
    </div>
  );
};

export default TradeAnalyzerCard;
