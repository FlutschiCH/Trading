import React from 'react';
import { BookOpen, Layers, ShieldAlert, Award, Compass, Eye, ShieldCheck, Flame, RefreshCcw } from 'lucide-react';

export default function HowToPage() {
  // Helper to parse simple markdown bold syntax (**text**) into styled span elements
  const renderTextWithMarkdown = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} style={{ color: '#ffffff', fontWeight: 'bold', textShadow: '0 0 8px rgba(255, 255, 255, 0.1)' }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#030712',
      backgroundImage: 'radial-gradient(ellipse at top, rgba(37, 99, 235, 0.08), transparent 70%)',
      color: '#cbd5e1',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '60px 24px',
    },
    wrapper: {
      maxWidth: '1000px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '32px',
    },
    header: {
      paddingBottom: '24px',
      borderBottom: '1px solid #1e293b',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      margin: 0,
    },
    section: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1e293b',
      borderRadius: '16px',
      padding: '32px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '20px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    },
    sectionTitle: {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#f8fafc',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      borderBottom: '1px solid #1e293b',
      paddingBottom: '12px',
    },
    rowLayout: {
      display: 'flex',
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: '24px',
      alignItems: 'center',
    },
    textContent: {
      flex: '1 1 500px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    visualContent: {
      flex: '1 1 320px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#070a13',
      borderRadius: '12px',
      border: '1px solid #1e293b',
      padding: '16px',
    },
    formula: {
      fontFamily: 'Consolas, monospace',
      backgroundColor: '#020617',
      padding: '14px 18px',
      borderRadius: '8px',
      color: '#38bdf8',
      fontSize: '14px',
      margin: '8px 0',
      borderLeft: '4px solid #3b82f6',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '20px',
    },
    card: {
      backgroundColor: '#070a13',
      border: '1px solid #1e293b',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '10px',
    },
    cardTitle: (color: string) => ({
      fontSize: '15px',
      fontWeight: 'bold',
      color: color,
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }),
    backLink: {
      color: '#38bdf8',
      textDecoration: 'none',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      padding: '8px 16px',
      borderRadius: '8px',
      backgroundColor: 'rgba(56, 189, 248, 0.08)',
      transition: 'all 0.2s',
      border: '1px solid rgba(56, 189, 248, 0.2)',
    },
    stepTimeline: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      borderLeft: '2px dashed #1e293b',
      paddingLeft: '24px',
      marginLeft: '12px',
      marginTop: '10px',
    },
    stepBlock: {
      position: 'relative' as const,
    },
    stepBadge: {
      position: 'absolute' as const,
      left: '-36px',
      top: '0px',
      backgroundColor: '#1e293b',
      color: '#38bdf8',
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: 'bold',
      border: '1px solid #3b82f6',
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <header style={styles.header}>
          <h1 style={styles.title}>
            <BookOpen size={32} style={{ color: '#38bdf8' }} />
            Wyckoff VSA & Weis Wave Trading Strategy Guide
          </h1>
          <a href="/" style={styles.backLink}>
            ← Go to Dashboard
          </a>
        </header>

        {/* Section 1: Overview */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <Layers size={22} style={{ color: '#38bdf8' }} /> Strategy Methodology Overview
          </h2>
          <div style={styles.rowLayout}>
            <div style={styles.textContent}>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("This strategy is a fully codified quantitative implementation of the classic **Richard Wyckoff Method**, specifically leveraging **Volume Spread Analysis (VSA)** and **Weis Wave Volume**. It aims to detect structural accumulation and distribution cycles by monitoring the actions of large professional operators (\"Smart Money\").")}
              </p>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("The core mechanics focus on identifying **liquidity sweeps** (Springs and Upthrusts) below support or above resistance. Once a sweep occurs, the strategy verifies institutional backing through volume characteristics, executing trades with dynamic mathematical risk constraints.")}
              </p>
            </div>
            <div style={styles.visualContent}>
              <svg width="340" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Grid Lines */}
                <line x1="10" y1="40" x2="330" y2="40" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="10" y1="120" x2="330" y2="120" stroke="#1e293b" strokeDasharray="3 3" />
                
                {/* Price path */}
                <path d="M10,60 L50,90 L90,50 L130,110 L170,70 L210,120 L230,145 L250,95 L290,60 L330,30" 
                  stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* Support/Resistance Lines */}
                <line x1="10" y1="50" x2="330" y2="50" stroke="#f43f5e" strokeWidth="1.5" />
                <text x="15" y="45" fill="#f43f5e" fontSize="10" fontFamily="monospace">Trading Range Resistance</text>
                
                <line x1="10" y1="120" x2="330" y2="120" stroke="#10b981" strokeWidth="1.5" />
                <text x="15" y="115" fill="#10b981" fontSize="10" fontFamily="monospace">Trading Range Support</text>
                
                {/* Highlight Spring Sweep */}
                <circle cx="230" cy="145" r="14" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="3 3" />
                <text x="175" y="165" fill="#fbbf24" fontSize="11" fontWeight="bold">Liquidity Sweep (Spring)</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Chronological Steps section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <Compass size={22} style={{ color: '#fbbf24' }} /> The 5-Step Execution Workflow (Chronological)
          </h2>
          <div style={styles.stepTimeline}>
            
            <div style={styles.stepBlock}>
              <div style={styles.stepBadge}>1</div>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={16} style={{ color: '#60a5fa' }} /> Step 1: Monitoring Structure & Waiting for Liquidity Sweeps
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                {renderTextWithMarkdown("The system continuously tracks a rolling **lookback window (default 20 bars)** to establish active support and resistance extremes. The algorithm remains idle, waiting for the first primary condition: a **Spring** (price sweeps below the low support) or an **Upthrust** (price sweeps above the high resistance).")}
              </p>
            </div>

            <div style={styles.stepBlock}>
              <div style={styles.stepBadge}>2</div>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} style={{ color: '#34d399' }} /> Step 2: Confirming Professional Absorption (VSA Validation)
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                {renderTextWithMarkdown("Once a sweep triggers, the system immediately assesses the candlestick metrics at the close of the bar. For a valid signal, we verify institutional buying or selling via **Closing Location Ratio (CLR)** and rolling percentile ranks. A Spring requires a close in the upper third (**CLR ≥ 0.33**) on high volume (**Volume Decile ≥ 7**), confirming supply has been absorbed.")}
              </p>
            </div>

            <div style={styles.stepBlock}>
              <div style={styles.stepBadge}>3</div>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={16} style={{ color: '#a78bfa' }} /> Step 3: Cumulative Wave Volume Verification (Weis Wave Check)
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                {renderTextWithMarkdown("Next, the cumulative **Weis Wave Volume** is checked. If entering a buy trade, we verify that selling force in previous down waves was dry, or that the current entry wave shows a strong influx of effort compared to corrective pullbacks, indicating that momentum has shifted in our favor.")}
              </p>
            </div>

            <div style={styles.stepBlock}>
              <div style={styles.stepBadge}>4</div>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={16} style={{ color: '#fbbf24' }} /> Step 4: Execution & Risk Configuration (Signal 1)
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                {renderTextWithMarkdown("Upon validation of steps 1, 2, and 3, a **Signal 1 (Entry)** is triggered. The system calculates position sizing based on account balance and target risk percentage, setting a protective **Stop Loss (SL)** right outside the sweep extreme, and placing the **Take Profit (TP)** target at the configured Reward ratio.")}
              </p>
            </div>

            <div style={styles.stepBlock}>
              <div style={styles.stepBadge}>5</div>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCcw size={16} style={{ color: '#10b981' }} /> Step 5: Active Management & Trail to Break Even (Signal 2)
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                {renderTextWithMarkdown("As the trade progresses, the system monitors price movements. Once the profit reaches a **1:1 Risk-to-Reward ratio (1R)**, the strategy fires **Signal 2 (Break Even Modification)** to trail the Stop Loss to the exact Entry Price, locking in a risk-free trade while waiting for the final TP target.")}
              </p>
            </div>

          </div>
        </div>

        {/* Section 2: Closing Location Ratio */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <Award size={22} style={{ color: '#fbbf24' }} /> Sentiment Analysis: The Closing Location Ratio
          </h2>
          <div style={styles.rowLayout}>
            <div style={styles.textContent}>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("To determine who is winning a specific candlestick (buyers or sellers), we calculate the standardized **Closing Location Ratio (CLR)**. This formula measures where the price closed relative to its extreme high and low, outputting a value from **-1.0** (extreme bottom) to **1.0** (extreme top).")}
              </p>
              <div style={styles.formula}>
                CLR = [ (Close - Low) - (High - Close) ] / (High - Low)
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                • CLR &gt; 0.33: Indicates buying absorption (closes in the upper third).<br />
                • CLR &lt; -0.33: Indicates selling pressure (closes in the lower third).
              </p>
            </div>
            <div style={styles.visualContent}>
              <svg width="340" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Horizontal Zones */}
                <rect x="80" y="20" width="180" height="40" fill="rgba(16, 185, 129, 0.08)" rx="4" />
                <rect x="80" y="60" width="180" height="40" fill="rgba(255, 255, 255, 0.02)" rx="4" />
                <rect x="80" y="100" width="180" height="40" fill="rgba(239, 68, 68, 0.08)" rx="4" />
                
                {/* Grid Zone Dividers */}
                <line x1="80" y1="60" x2="260" y2="60" stroke="#334155" strokeDasharray="3 3" />
                <line x1="80" y1="100" x2="260" y2="100" stroke="#334155" strokeDasharray="3 3" />
                
                {/* Wick */}
                <line x1="170" y1="15" x2="170" y2="145" stroke="#ffffff" strokeWidth="2" />
                
                {/* Candle Body */}
                <rect x="155" y="40" width="30" height="80" fill="#1e293b" stroke="#ffffff" strokeWidth="1.5" />
                
                {/* Close Marker */}
                <polygon points="195,40 205,45 195,50" fill="#38bdf8" />
                <text x="210" y="48" fill="#38bdf8" fontSize="11" fontFamily="monospace">Close (CLR &gt; 0.33)</text>
                
                {/* Labels */}
                <text x="20" y="30" fill="#94a3b8" fontSize="11">High (1.0)</text>
                <text x="20" y="80" fill="#94a3b8" fontSize="11">Median (0.0)</text>
                <text x="20" y="130" fill="#94a3b8" fontSize="11">Low (-1.0)</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Section 3: VSA Signals */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <ShieldAlert size={20} style={{ color: '#ef4444' }} /> Volume Spread Analysis (VSA) Patterns
          </h2>
          <p style={{ margin: 0 }}>
            The system maps price spread and volume into rolling 100-bar deciles (1 to 10). Five VSA patterns are monitored:
          </p>
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle('#34d399')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="10" y="4" width="4" height="12" fill="#10b981" />
                  <line x1="12" y1="2" x2="12" y2="20" stroke="#10b981" strokeWidth="2" />
                </svg>
                1. No Supply (NS)
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                {renderTextWithMarkdown("Downbar, narrow spread (**Spread Decile ≤ 4**) and below-average volume (**Volume Decile ≤ 4**). Confirms absence of sellers.")}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle('#38bdf8')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="10" y="8" width="4" height="12" fill="#38bdf8" />
                  <line x1="12" y1="2" x2="12" y2="20" stroke="#38bdf8" strokeWidth="2" />
                </svg>
                2. No Demand (ND)
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                {renderTextWithMarkdown("Upbar, narrow spread (**Spread Decile ≤ 4**) and below-average volume (**Volume Decile ≤ 4**). Confirms absence of buyers.")}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle('#f43f5e')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="10" y="10" width="4" height="10" fill="#f43f5e" />
                  <line x1="12" y1="2" x2="12" y2="20" stroke="#f43f5e" strokeWidth="2" />
                </svg>
                3. Upthrust (UT)
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                {renderTextWithMarkdown("Wide spread (**Decile ≥ 7**), high volume (**Decile ≥ 7**), close in lower third (**CLR ≤ -0.33**). Traps late long positions.")}
              </p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle('#60a5fa')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="10" y="4" width="4" height="10" fill="#60a5fa" />
                  <line x1="12" y1="2" x2="12" y2="20" stroke="#60a5fa" strokeWidth="2" />
                </svg>
                4. Shakeout / Spring (SO)
              </h3>
              <p style={{ fontSize: '13px', margin: 0 }}>
                {renderTextWithMarkdown("Low sweeps previous support, but prices close in the upper third (**CLR ≥ 0.33**) on high volume (**Decile ≥ 7**). Clears stops.")}
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: Weis Wave */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <Layers size={22} style={{ color: '#a78bfa' }} /> Cumulative Force: Weis Wave Volume
          </h2>
          <div style={styles.rowLayout}>
            <div style={styles.textContent}>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("Weis Wave Volume groups volume into price swings based on a volatility-adjusted ZigZag trend. The reversal parameter adapts dynamically using a multiplier on the asset's **Average True Range (ATR)**:")}
              </p>
              <div style={styles.formula}>
                Reversal Threshold = 2.5 * ATR(20)
              </div>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("Unlike raw bar-by-bar volume, Weis Wave shows the **cumulative force** backing an entire swing. A trend reversal only triggers when price moves opposite to the current wave direction by more than the threshold, resetting wave volume accumulation.")}
              </p>
            </div>
            <div style={styles.visualContent}>
              <svg width="340" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Zigzag price line */}
                <path d="M10,130 L90,40 L180,110 L270,30" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                
                {/* Reversal indicator */}
                <line x1="180" y1="110" x2="180" y2="70" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 3" />
                <text x="190" y="90" fill="#ef4444" fontSize="9" fontFamily="monospace">Reversal &gt; 2.5*ATR</text>
                
                {/* Cumulative volume columns */}
                {/* Wave 1 UP */}
                <rect x="25" y="140" width="8" height="25" fill="#34d399" opacity="0.6" />
                <rect x="38" y="140" width="8" height="35" fill="#34d399" opacity="0.8" />
                {/* Wave 2 DOWN */}
                <rect x="110" y="140" width="8" height="20" fill="#f43f5e" opacity="0.6" />
                <rect x="123" y="140" width="8" height="30" fill="#f43f5e" opacity="0.8" />
                {/* Wave 3 UP */}
                <rect x="210" y="140" width="8" height="30" fill="#34d399" opacity="0.6" />
                <rect x="223" y="140" width="8" height="40" fill="#34d399" opacity="0.8" />
                
                <text x="25" y="175" fill="#94a3b8" fontSize="9" fontFamily="monospace">Wave Vol 1</text>
                <text x="110" y="175" fill="#94a3b8" fontSize="9" fontFamily="monospace">Wave Vol 2</text>
                <text x="210" y="175" fill="#94a3b8" fontSize="9" fontFamily="monospace">Wave Vol 3</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Section 5: Risk Management */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <Award size={22} style={{ color: '#10b981' }} /> Risk Mitigation & Position Sizing
          </h2>
          <div style={styles.rowLayout}>
            <div style={styles.textContent}>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("Strict preservation of capital is achieved through dynamic lot sizing and protective stop execution:")}
              </p>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("**Risk Sizing Formula:**")}
              </p>
              <div style={styles.formula}>
                Position Size = (Account Balance * Risk %) / Stop Loss Distance (in price)
              </div>
              <p style={{ margin: 0 }}>
                {renderTextWithMarkdown("**1:1 Break Even (BE) Rule:**\nOnce the trade's unrealized profit reaches an amount equal to the initial Stop Loss (1:1 Risk-to-Reward ratio), the Stop Loss triggers a trailing modification to the exact Entry Price, eliminating risk.")}
              </p>
            </div>
            <div style={styles.visualContent}>
              <svg width="340" height="180" viewBox="0 0 340 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Lines */}
                <line x1="20" y1="30" x2="320" y2="30" stroke="#10b981" strokeWidth="1.5" strokeDasharray="3 3" />
                <text x="25" y="25" fill="#10b981" fontSize="10" fontFamily="monospace">Take Profit (e.g. 2R)</text>
                
                <line x1="20" y1="70" x2="320" y2="70" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 3" />
                <text x="25" y="65" fill="#fbbf24" fontSize="10" fontFamily="monospace">1:1 Break-Even Trigger (1R)</text>
                
                <line x1="20" y1="110" x2="320" y2="110" stroke="#38bdf8" strokeWidth="2" />
                <text x="25" y="105" fill="#38bdf8" fontSize="10" fontFamily="monospace">Entry Price</text>
                
                <line x1="20" y1="150" x2="320" y2="150" stroke="#f43f5e" strokeWidth="1.5" />
                <text x="25" y="145" fill="#f43f5e" fontSize="10" fontFamily="monospace">Initial Stop Loss (-1R)</text>
                
                {/* Path from entry to 1:1 and then target */}
                <path d="M120,110 L160,90 L200,70 L240,45 L280,30" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                
                {/* Trail action visual */}
                <path d="M200,150 L200,115" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" markerEnd="url(#arrow)" />
                <circle cx="200" cy="70" r="4" fill="#fbbf24" />
                <text x="205" y="130" fill="#fbbf24" fontSize="9" fontFamily="monospace">SL Trails to Entry</text>
                
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
