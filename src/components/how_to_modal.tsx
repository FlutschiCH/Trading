import React from 'react';
import { X, BookOpen, Layers, ShieldAlert, Award } from 'lucide-react';

interface HowToModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HowToModal({ isOpen, onClose }: HowToModalProps) {
  if (!isOpen) return null;

  const styles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 8, 16, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '24px',
    },
    modal: {
      width: '100%',
      maxWidth: '900px',
      maxHeight: '85vh',
      backgroundColor: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '16px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.1)',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    },
    header: {
      padding: '20px 24px',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
    },
    title: {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      margin: 0,
    },
    closeBtn: {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#94a3b8',
      cursor: 'pointer',
      padding: '4px',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      transition: 'all 0.2s',
      hover: {
        backgroundColor: '#1e293b',
        color: '#ffffff'
      }
    },
    content: {
      padding: '24px',
      overflowY: 'auto' as const,
      color: '#cbd5e1',
      fontSize: '14px',
      lineHeight: '1.6',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    section: {
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    sectionTitle: {
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#f8fafc',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      borderBottom: '1px solid #334155',
      paddingBottom: '8px',
    },
    formula: {
      fontFamily: 'Consolas, monospace',
      backgroundColor: '#020617',
      padding: '12px 16px',
      borderRadius: '8px',
      color: '#38bdf8',
      fontSize: '13px',
      margin: '8px 0',
      borderLeft: '4px solid #0284c7',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '16px',
    },
    card: {
      backgroundColor: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '6px',
    },
    cardTitle: (color: string) => ({
      fontSize: '14px',
      fontWeight: 'bold',
      color: color,
      margin: 0,
    })
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={styles.header}>
          <h2 style={styles.title}>
            <BookOpen size={22} style={{ color: '#38bdf8' }} />
            Wyckoff VSA & Weis Wave Trading Strategy Guide
          </h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div style={styles.content}>
          
          {/* Section 1: Overview */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <Layers size={18} style={{ color: '#38bdf8' }} /> Strategy Methodology Overview
            </h3>
            <p style={{ margin: 0 }}>
              This strategy is a fully codified quantitative implementation of the classic **Richard Wyckoff Method**, specifically leveraging **Volume Spread Analysis (VSA)** and **Weis Wave Volume**. It aims to detect structural accumulation and distribution cycles by monitoring the actions of large professional operators ("Smart Money"). The core principle relies on finding liquidity sweeps (Springs and Upthrusts) and verifying demand/supply exhaustion before committing to trades.
            </p>
          </div>

          {/* Section 2: Closing Location Ratio */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <Award size={18} style={{ color: '#fbbf24' }} /> Sentiment Analysis: The Closing Location Ratio
            </h3>
            <p style={{ margin: 0 }}>
              To determine who is winning a specific candlestick (buyers or sellers), we calculate the standardized **Closing Location Ratio (CLR)**. This formula measures where the price closed relative to its extreme high and low, outputting a value from **-1.0** (extreme bottom) to **1.0** (extreme top).
            </p>
            <div style={styles.formula}>
              CLR = [ (Close - Low) - (High - Close) ] / (High - Low)
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
              • Values &gt; 0.33 indicate a strong close in the upper third of the candlestick (Bullish sentiment).<br />
              • Values &lt; -0.33 indicate a weak close in the lower third of the candlestick (Bearish sentiment).
            </p>
          </div>

          {/* Section 3: VSA Signals */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <ShieldAlert size={18} style={{ color: '#ef4444' }} /> Volume Spread Analysis (VSA) Patterns
            </h3>
            <p style={{ margin: 0 }}>
              The system uses rolling 100-bar percentile rankings to map volume and price spreads into deciles (1 to 10). Five distinct VSA patterns are programmatically detected:
            </p>
            <div style={styles.grid}>
              <div style={styles.card}>
                <h4 style={styles.cardTitle('#34d399')}>1. No Supply (NS)</h4>
                <p style={{ fontSize: '12px', margin: 0 }}>
                  A bearish downbar (Close &lt; Previous Close) with a very narrow spread (Spread Decile ≤ 4) and below-average volume (Volume Decile ≤ 4). Indicates supply has dried up and sellers are exhausted.
                </p>
              </div>
              <div style={styles.card}>
                <h4 style={styles.cardTitle('#38bdf8')}>2. No Demand (ND)</h4>
                <p style={{ fontSize: '12px', margin: 0 }}>
                  A bullish upbar (Close &gt; Previous Close) with a very narrow spread (Spread Decile ≤ 4) and below-average volume (Volume Decile ≤ 4). Indicates lack of professional buying interest.
                </p>
              </div>
              <div style={styles.card}>
                <h4 style={styles.cardTitle('#f43f5e')}>3. Upthrust (UT)</h4>
                <p style={{ fontSize: '12px', margin: 0 }}>
                  A wide-spread bar (Spread Decile ≥ 7) on high volume (Volume Decile ≥ 7) that closes in its lower third (CLR ≤ -0.33) after an upbar. Traps buyers and represents institutional distribution.
                </p>
              </div>
              <div style={styles.card}>
                <h4 style={styles.cardTitle('#60a5fa')}>4. Shakeout / Spring (SO)</h4>
                <p style={{ fontSize: '12px', margin: 0 }}>
                  A sudden downswing where the low sweeps below the previous bar's low, but buyers step in causing the price to close in its upper third (CLR ≥ 0.33) on high volume (Volume Decile ≥ 7). Clears out retail stop losses.
                </p>
              </div>
              <div style={styles.card}>
                <h4 style={styles.cardTitle('#a78bfa')}>5. Stopping Volume (STV)</h4>
                <p style={{ fontSize: '12px', margin: 0 }}>
                  A downbar with exceptionally high volume (Volume Decile ≥ 8) on a narrow spread (Spread Decile ≤ 5) closing in the upper half of the bar (CLR ≥ 0.0), confirmed by a extreme log-return z-score climax (&gt; 2.0). Represents institutional buying absorbing all selling.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Weis Wave */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <Layers size={18} style={{ color: '#a78bfa' }} /> Cumulative Force: Weis Wave Volume
            </h3>
            <p style={{ margin: 0 }}>
              David Weis's adaptation uses a volatility-adjusted ZigZag trend to aggregate and accumulate volume into cohesive "waves". This helps identify the true volume push behind price swings.
            </p>
            <p style={{ margin: 0 }}>
              **Reversal Parameter Calculation:**
            </p>
            <div style={styles.formula}>
              Reversal Threshold = 2.5 * ATR(20)
            </div>
            <p style={{ margin: 0 }}>
              **Reversal Logic:**
              <br />• If in an **UP Trend**, the wave reverses to a **DOWN Trend** when the price falls below the highest point reached during the wave by more than the Reversal Threshold.
              <br />• If in a **DOWN Trend**, the wave reverses to an **UP Trend** when the price rises above the lowest point reached during the wave by more than the Reversal Threshold.
              <br />• During a trend, volume is continuously added to the wave. On reversal, the wave volume resets to start accumulating in the new direction.
            </p>
          </div>

          {/* Section 5: Risk Management */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <Award size={18} style={{ color: '#10b981' }} /> Risk Mitigation & Position Sizing
            </h3>
            <p style={{ margin: 0 }}>
              To ensure long-term profitability and pass proprietary evaluation challenges (like FTMO), the strategy integrates strict risk controls:
            </p>
            <p style={{ margin: 0 }}>
              **Risk-Based Position Sizing:**
              <br />When enabled, the position size is calculated dynamically so that hitting the Stop Loss will lose exactly the specified Risk % of your account balance.
            </p>
            <div style={styles.formula}>
              Position Size = (Account Balance * Risk %) / Stop Loss Distance (in Price Points)
            </div>
            <p style={{ margin: 0 }}>
              **1:1 Break Even (BE) Rule:**
              <br />Once the trade goes in profit by an amount equal to the Stop Loss distance (1:1 Risk-to-Reward ratio), the Stop Loss is automatically trailed to the entry price, securing a "risk-free" trade.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
