import React from 'react';
import { formatPrice } from '../App';

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
  backtestFees: string;
  setBacktestFees: (val: string) => void;
  backtestResults: any;
  backtestTab: 'trades' | 'weekly' | 'monthly' | 'favourites';
  setBacktestTab: (val: 'trades' | 'weekly' | 'monthly' | 'favourites') => void;
  selectedTrade: any;
  setSelectedTrade: (trade: any) => void;
  setShowModal: (show: boolean) => void;
  dateRangeOption: string;
  setDateRangeOption: (val: string) => void;
  customFrom: string;
  setCustomFrom: (val: string) => void;
  customTo: string;
  setCustomTo: (val: string) => void;
  candleLimit: number;
  setCandleLimit: (val: number) => void;
  favouriteCandles?: any[];
  onDeleteFavourite?: (id: number) => void;
  onUpdateNotes?: (id: number, notes: string) => void;
  onLocateCandle?: (fav: any) => void;
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
  backtestFees,
  setBacktestFees,
  backtestResults,
  backtestTab,
  setBacktestTab,
  selectedTrade,
  setSelectedTrade,
  setShowModal,
  dateRangeOption,
  setDateRangeOption,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  candleLimit,
  setCandleLimit,
  favouriteCandles = [],
  onDeleteFavourite,
  onUpdateNotes,
  onLocateCandle,
  styles
}: WyckoffBacktesterProps) {
  return (
    <div className="no-drag" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        fontSize: '12px',
      }}>
        {/* Row 1: Account setup (Starting Balance & Fees) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Starting Balance ($)</label>
            <input 
              type="number" 
              value={backtestBalance} 
              onChange={(e) => setBacktestBalance(e.target.value)}
              style={styles.input}
              min="100"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Fees per side (%)</label>
            <input 
              type="number" 
              value={backtestFees} 
              onChange={(e) => setBacktestFees(e.target.value)}
              style={styles.input}
              step="0.001"
              min="0.0"
            />
          </div>
        </div>

        {/* Row 2: Position Size settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
          <div style={{ ...styles.formGroup, justifyContent: 'center', height: '100%' }}>
            <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
              <input 
                type="checkbox" 
                checked={useRiskSizing}
                onChange={(e) => setUseRiskSizing(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Auto Size by Risk
            </label>
          </div>

          {useRiskSizing ? (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Risk %</label>
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
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Qty (Size)</label>
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
        </div>

        {/* Row 3: Stop Loss & Profit Target (RR Ratio) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '12px' }}>
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Stop Loss</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input 
                type="number" 
                value={backtestSL} 
                onChange={(e) => setBacktestSL(e.target.value)}
                style={{ ...styles.input, flexGrow: 1, minWidth: 0 }}
                step={backtestSLType === 'pct' ? '0.1' : '1'}
                min="0.01"
              />
              <select
                value={backtestSLType}
                onChange={(e) => {
                  const newType = e.target.value as 'pct' | 'price';
                  setUseRiskSizing(true); // Preserve risk sizing target
                  setBacktestSLType(newType);
                  const isForex = ['EUR', 'GBP', 'JPY', 'USD', 'CAD', 'AUD', 'CHF'].some(curr => symbol.toUpperCase().includes(curr)) && !['BTC', 'ETH', 'SOL', 'LTC', 'XRP'].some(crypto => symbol.toUpperCase().includes(crypto));
                  setBacktestSL(newType === 'pct' ? '1.0' : (isForex ? '20' : '200'));
                }}
                style={{
                  ...styles.input,
                  width: '65px',
                  backgroundColor: '#1f2937',
                  cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                <option value="pct">%</option>
                <option value="price">Pips</option>
              </select>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>RR Ratio</label>
            <input 
              type="number" 
              value={backtestRR} 
              onChange={(e) => setBacktestRR(e.target.value)}
              style={styles.input}
              step="0.1"
              min="0.5"
            />
          </div>
        </div>

        {/* Row 4: Break Even controls & Lookback Window */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
          <div style={{ ...styles.formGroup, height: '100%', justifyContent: 'center' }}>
            <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
              <input 
                type="checkbox" 
                checked={useBreakEven}
                onChange={(e) => setUseBreakEven(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Enable BE
            </label>
          </div>

          {useBreakEven ? (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>BE Trigger (R)</label>
              <input 
                type="number" 
                value={backtestBE} 
                onChange={(e) => setBacktestBE(e.target.value)}
                style={styles.input}
                step="0.1"
                min="0.1"
              />
            </div>
          ) : (
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Sweep Lookback</label>
              <input 
                type="number" 
                value={lookbackWindow} 
                onChange={(e) => setLookbackWindow(e.target.value)}
                style={styles.input}
                min="5"
                max="200"
              />
            </div>
          )}
        </div>

        {/* Row 5: Conditional Lookback (Only if BE is enabled, otherwise lookback is rendered above) */}
        {useBreakEven && (
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Sweep Lookback (Bars)</label>
            <input 
              type="number" 
              value={lookbackWindow} 
              onChange={(e) => setLookbackWindow(e.target.value)}
              style={styles.input}
              min="5"
              max="200"
            />
          </div>
        )}

        {/* Date Range Selection & Filtering */}
        <div style={{
          borderTop: '1px solid #1e293b',
          paddingTop: '12px',
          marginTop: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: '#cbd5e1' }}>Date Range Settings</span>
            {dateRangeOption !== 'last_candles' && (
              <button 
                onClick={() => {
                  setDateRangeOption('last_candles');
                  setCustomFrom('');
                  setCustomTo('');
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  textDecoration: 'underline'
                }}
              >
                Clear Range
              </button>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Filter Option</label>
              <select 
                value={dateRangeOption}
                onChange={(e) => setDateRangeOption(e.target.value)}
                style={styles.input}
              >
                <option value="last_candles">Last Candles (Limit)</option>
                <option value="this_week">This Week (Sun 20:00)</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            
            {dateRangeOption === 'last_candles' && (
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Candle Limit</label>
                <select 
                  value={candleLimit}
                  onChange={(e) => setCandleLimit(parseInt(e.target.value))}
                  style={styles.input}
                >
                  <option value="1000">1000</option>
                  <option value="2000">2000</option>
                  <option value="5000">5000</option>
                  <option value="10000">10000</option>
                </select>
              </div>
            )}
          </div>

          {dateRangeOption === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>From Date</label>
                <input 
                  type="datetime-local" 
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>To Date</label>
                <input 
                  type="datetime-local" 
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>
          )}
        </div>
      </div>



      {(backtestResults || favouriteCandles.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', flex: 1, overflowY: 'auto' }}>
          {backtestResults && (
            <>
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
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '4px', marginTop: '8px' }}>
            {backtestResults && (
              <>
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
              </>
            )}
            <button 
              onClick={() => setBacktestTab('favourites')}
              style={{
                background: 'none',
                border: 'none',
                color: backtestTab === 'favourites' ? '#eab308' : '#9ca3af',
                fontWeight: 'bold',
                fontSize: '11px',
                cursor: 'pointer',
                borderBottom: backtestTab === 'favourites' ? '2px solid #eab308' : 'none',
                paddingBottom: '2px'
              }}
            >
              ⭐ Favourites ({favouriteCandles.length})
            </button>
          </div>

          <div style={{ ...styles.positionsList, maxHeight: '350px', overflowY: 'auto' }}>
            {backtestTab === 'trades' && backtestResults && backtestResults.trades.map((trade: any) => (
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
                      @{formatPrice(trade.entryPrice, symbol)}
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>
                    Exit: {formatPrice(trade.exitPrice, symbol)} | Fees: ${trade.fees ? trade.fees.toFixed(2) : '0.00'} | {trade.time}
                  </span>
                </div>
                <span style={styles.posPnl(trade.pnl >= 0)}>
                  {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                </span>
              </div>
            ))}

            {backtestTab === 'weekly' && backtestResults && backtestResults.weeklyBreakdown && Object.keys(backtestResults.weeklyBreakdown).sort().reverse().map((week) => {
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

            {backtestTab === 'monthly' && backtestResults && backtestResults.monthlyBreakdown && Object.keys(backtestResults.monthlyBreakdown).sort().reverse().map((month) => {
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

            {backtestTab === 'favourites' && favouriteCandles.map((fav: any) => {
              const formattedTime = new Date(fav.candle_time * 1000).toLocaleString('de-CH', { timeZone: 'UTC' });
              return (
                <div 
                  key={fav.id}
                  style={{
                    ...styles.positionRow,
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '10px',
                    border: '1px solid #334155',
                    padding: '12px',
                    backgroundColor: '#0f172a'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(234, 179, 8, 0.12)',
                        border: '1px solid #eab308',
                        color: '#eab308'
                      }}>
                        {fav.symbol}
                      </span>
                      <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 'bold' }}>
                        {formattedTime}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {onLocateCandle && (
                        <button
                          onClick={() => onLocateCandle(fav)}
                          style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#3b82f6',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          📍 Chart
                        </button>
                      )}
                      {onDeleteFavourite && (
                        <button
                          onClick={() => onDeleteFavourite(fav.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>OHLC: <span style={{ color: '#f8fafc', fontFamily: 'monospace' }}>O:{fav.open_val.toFixed(2)} H:{fav.high_val.toFixed(2)} L:{fav.low_val.toFixed(2)} C:{fav.close_val.toFixed(2)}</span></div>
                    {fav.vsa_patterns && <div>VSA: <span style={{ color: '#fbbf24' }}>{fav.vsa_patterns}</span></div>}
                    {fav.weis_wave_volume !== null && fav.weis_wave_volume !== undefined && (
                      <div>Weis Vol: <span style={{ color: '#10b981' }}>{fav.weis_wave_volume.toFixed(1)}</span></div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="text"
                      defaultValue={fav.notes || ''}
                      placeholder="Add notes..."
                      onBlur={(e) => {
                        if (onUpdateNotes && e.target.value !== (fav.notes || '')) {
                          onUpdateNotes(fav.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && onUpdateNotes) {
                          onUpdateNotes(fav.id, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: '#f8fafc',
                        fontSize: '11px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
