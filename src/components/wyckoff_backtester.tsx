import React from 'react';

interface WyckoffBacktesterProps {
  symbol: string;
  timeframe: string;
  liveStrategy: any;
  isDeploying: boolean;
  deployLiveStrategy: () => void;
  backtestBalance: string;
  setBacktestBalance: (val: string) => void;
  useRiskSizing: boolean;
  setUseRiskSizing: (val: boolean) => void;
  backtestRiskPct: string;
  setBacktestRiskPct: (val: string) => void;
  backtestSize: string;
  setBacktestSize: (val: string) => void;
  backtestSL: string;
  setBacktestSL: (val: string) => void;
  backtestSLType: 'pct' | 'price';
  setBacktestSLType: (val: 'pct' | 'price') => void;
  backtestRR: string;
  setBacktestRR: (val: string) => void;
  useBreakEven: boolean;
  setUseBreakEven: (val: boolean) => void;
  backtestBE: string;
  setBacktestBE: (val: string) => void;
  lookbackWindow: string;
  setLookbackWindow: (val: string) => void;
  backtestResults: any;
  backtestTab: 'trades' | 'weekly' | 'monthly';
  setBacktestTab: (val: 'trades' | 'weekly' | 'monthly') => void;
  selectedTrade: any;
  setSelectedTrade: (trade: any) => void;
  setShowModal: (show: boolean) => void;
  styles: any;
}

export default function WyckoffBacktester({
  symbol,
  timeframe,
  liveStrategy,
  isDeploying,
  deployLiveStrategy,
  backtestBalance,
  setBacktestBalance,
  useRiskSizing,
  setUseRiskSizing,
  backtestRiskPct,
  setBacktestRiskPct,
  backtestSize,
  setBacktestSize,
  backtestSL,
  setBacktestSL,
  backtestSLType,
  setBacktestSLType,
  backtestRR,
  setBacktestRR,
  useBreakEven,
  setUseBreakEven,
  backtestBE,
  setBacktestBE,
  lookbackWindow,
  setLookbackWindow,
  backtestResults,
  backtestTab,
  setBacktestTab,
  selectedTrade,
  setSelectedTrade,
  setShowModal,
  styles
}: WyckoffBacktesterProps) {
  return (
    <div className="no-drag" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={styles.tradeForm}>
        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '12px' }}>Starting Balance ($)</label>
          <input 
            type="number" 
            value={backtestBalance} 
            onChange={(e) => setBacktestBalance(e.target.value)}
            style={styles.input}
            min="100"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={useRiskSizing}
              onChange={(e) => setUseRiskSizing(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Auto Calculate Size by Risk
          </label>
        </div>

        {useRiskSizing ? (
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '12px' }}>Risk % per Trade</label>
            <input 
              type="number" 
              value={backtestRiskPct} 
              onChange={(e) => setBacktestRiskPct(e.target.value)}
              style={styles.input}
              step="0.1"
              min="0.1"
              max="10.0"
            />
          </div>
        ) : (
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '12px' }}>Quantity (Size)</label>
            <input 
              type="number" 
              value={backtestSize} 
              onChange={(e) => setBacktestSize(e.target.value)}
              style={styles.input}
              step="0.1"
              min="0.1"
            />
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '12px' }}>Stop Loss</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="number" 
              value={backtestSL} 
              onChange={(e) => setBacktestSL(e.target.value)}
              style={{ ...styles.input, flexGrow: 1 }}
              step={backtestSLType === 'pct' ? '0.1' : '1'}
              min="0.01"
            />
            <select
              value={backtestSLType}
              onChange={(e) => {
                const newType = e.target.value as 'pct' | 'price';
                setUseRiskSizing(true); // Preserve risk sizing target
                setBacktestSLType(newType);
                setBacktestSL(newType === 'pct' ? '1.0' : '200');
              }}
              style={{
                ...styles.input,
                width: '70px',
                backgroundColor: '#1f2937',
                cursor: 'pointer',
                padding: '0 8px',
              }}
            >
              <option value="pct">%</option>
              <option value="price">$</option>
            </select>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '12px' }}>Risk to Reward (RR Ratio)</label>
          <input 
            type="number" 
            value={backtestRR} 
            onChange={(e) => setBacktestRR(e.target.value)}
            style={styles.input}
            step="0.1"
            min="0.5"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={useBreakEven}
              onChange={(e) => setUseBreakEven(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Enable Break Even (BE)
          </label>
        </div>

        {useBreakEven && (
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '12px' }}>BE Trigger (R-Ratio)</label>
            <input 
              type="number" 
              value={backtestBE} 
              onChange={(e) => setBacktestBE(e.target.value)}
              style={styles.input}
              step="0.1"
              min="0.1"
            />
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={{ color: '#9ca3af', fontSize: '12px' }}>Sweep Lookback (Bars)</label>
          <input 
            type="number" 
            value={lookbackWindow} 
            onChange={(e) => setLookbackWindow(e.target.value)}
            style={styles.input}
            min="5"
            max="200"
          />
        </div>
      </div>



      {backtestResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', flex: 1, overflowY: 'auto' }}>
          <div style={styles.walletContainer}>
            <div style={styles.walletRow}>
              <span style={{ color: '#9ca3af' }}>Total Trades:</span>
              <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{backtestResults.totalTrades}</span>
            </div>
            <div style={styles.walletRow}>
              <span style={{ color: '#9ca3af' }}>Win Rate:</span>
              <span style={{ color: backtestResults.winRate >= 50 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                {backtestResults.winRate.toFixed(1)}%
              </span>
            </div>
            <div style={styles.walletRow}>
              <span style={{ color: '#9ca3af' }}>Net Profit:</span>
              <span style={{ color: backtestResults.netPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                ${backtestResults.netPnl.toFixed(2)}
              </span>
            </div>
            <div style={styles.walletRow}>
              <span style={{ color: '#9ca3af' }}>Profit Factor:</span>
              <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{backtestResults.profitFactor.toFixed(2)}</span>
            </div>
            <div style={styles.walletRow}>
              <span style={{ color: '#9ca3af' }}>Max Drawdown:</span>
              <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{(backtestResults.maxDrawdown ?? 0).toFixed(2)}%</span>
            </div>
            <div style={styles.walletRow}>
              <span style={{ color: '#9ca3af' }}>Max Daily Loss:</span>
              <span style={{ color: (backtestResults.maxDailyLoss ?? 0) >= 5.0 ? '#ef4444' : '#ffffff', fontWeight: 'bold' }}>
                {(backtestResults.maxDailyLoss ?? 0).toFixed(2)}%
              </span>
            </div>
          </div>

          {backtestResults.dailyLossBreached && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '8px',
              color: '#ef4444',
              fontSize: '11px',
              fontWeight: 'bold',
              textAlign: 'center',
              marginTop: '4px'
            }}>
              ⚠️ FTMO 5% Daily Loss Rule Breached!
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '4px', marginTop: '8px' }}>
            <button 
              onClick={() => setBacktestTab('trades')}
              style={{
                background: 'none',
                border: 'none',
                color: backtestTab === 'trades' ? '#3b82f6' : '#9ca3af',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: 'pointer',
                borderBottom: backtestTab === 'trades' ? '2px solid #3b82f6' : 'none',
                paddingBottom: '2px'
              }}
            >
              Trades ({backtestResults.trades.length})
            </button>
            <button 
              onClick={() => setBacktestTab('weekly')}
              style={{
                background: 'none',
                border: 'none',
                color: backtestTab === 'weekly' ? '#3b82f6' : '#9ca3af',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: 'pointer',
                borderBottom: backtestTab === 'weekly' ? '2px solid #3b82f6' : 'none',
                paddingBottom: '2px'
              }}
            >
              Weekly
            </button>
            <button 
              onClick={() => setBacktestTab('monthly')}
              style={{
                background: 'none',
                border: 'none',
                color: backtestTab === 'monthly' ? '#3b82f6' : '#9ca3af',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: 'pointer',
                borderBottom: backtestTab === 'monthly' ? '2px solid #3b82f6' : 'none',
                paddingBottom: '2px'
              }}
            >
              Monthly
            </button>
          </div>

          <div style={styles.positionsList}>
            {backtestTab === 'trades' && backtestResults.trades.map((trade: any) => (
              <div 
                key={trade.id} 
                onClick={() => {
                  setSelectedTrade(trade);
                  setShowModal(true);
                }}
                style={{
                  ...styles.positionRow,
                  cursor: 'pointer',
                  border: selectedTrade?.id === trade.id ? '1.5px solid #3b82f6' : '1px solid #1f2937',
                  transform: selectedTrade?.id === trade.id ? 'scale(1.02)' : 'scale(1)',
                  transition: 'all 0.15s'
                }}
              >
                <div style={styles.posDetails}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: `1.5px solid ${trade.type === 'BUY' ? '#10b981' : '#ef4444'}`,
                      backgroundColor: trade.type === 'BUY' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: trade.type === 'BUY' ? '#10b981' : '#ef4444',
                      display: 'inline-block',
                      lineHeight: '1',
                    }}>
                      {trade.type}
                    </span>
                    <span style={{ color: '#ffffff', fontWeight: 'bold' }}>
                      @{trade.entryPrice.toFixed(2)}
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>
                    Exit: {trade.exitPrice.toFixed(2)} | {trade.time}
                  </span>
                </div>
                <span style={styles.posPnl(trade.pnl >= 0)}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
              </div>
            ))}

            {backtestTab === 'weekly' && backtestResults.weeklyBreakdown && Object.keys(backtestResults.weeklyBreakdown).sort().reverse().map((week) => {
              const pnl = backtestResults.weeklyBreakdown![week];
              return (
                <div key={week} style={styles.positionRow}>
                  <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{week}</span>
                  <span style={styles.posPnl(pnl >= 0)}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}

            {backtestTab === 'monthly' && backtestResults.monthlyBreakdown && Object.keys(backtestResults.monthlyBreakdown).sort().reverse().map((month) => {
              const pnl = backtestResults.monthlyBreakdown![month];
              return (
                <div key={month} style={styles.positionRow}>
                  <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{month}</span>
                  <span style={styles.posPnl(pnl >= 0)}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
