import pandas as pd
import numpy as np
from datetime import datetime

class WyckoffHandler:
    @staticmethod
    def analyze_wyckoff_structure(candles: list, lookback: int = 20) -> list:
        """
        Analyzes OHLCV candles to detect Wyckoff cycles (Accumulation, Markup, Distribution, Markdown),
        key support/resistance levels, and trap sweeps (Springs and Upthrusts).
        Returns the candles annotated with Wyckoff metrics.
        """
        if not candles:
            return []

        df = pd.DataFrame(candles)
        
        # Ensure correct data types
        for col in ['open', 'high', 'low', 'close', 'volume']:
            if col in df.columns:
                df[col] = df[col].astype(float)
        
        n = len(df)
        if n < 5:
            # Not enough candles to compute meaningful structure
            df['wyckoff_stage'] = 'TRANSITION'
            df['support_level'] = np.nan
            df['resistance_level'] = np.nan
            df['wyckoff_signal'] = None
            return df.to_dict(orient='records')

        # 1. Swing points & Support/Resistance lines
        # Support is local min, Resistance is local max over the lookback window
        df['rolling_low'] = df['low'].shift(1).rolling(window=lookback, min_periods=5).min()
        df['rolling_high'] = df['high'].shift(1).rolling(window=lookback, min_periods=5).max()
        
        # Fallback for initial values
        df['rolling_low'] = df['rolling_low'].fillna(df['low'])
        df['rolling_high'] = df['rolling_high'].fillna(df['high'])

        # Calculate average volume for relative volume check
        df['avg_volume'] = df['volume'].rolling(window=50, min_periods=5).mean().fillna(df['volume'])

        stages = []
        support_levels = []
        resistance_levels = []
        signals = []

        # Track structural state variables
        current_stage = "TRANSITION"
        last_logged_stage = "TRANSITION"
        last_spring_idx = -100
        last_upthrust_idx = -100

        # Calculate trend using a longer window (e.g. 50-period simple moving average slope)
        df['sma50'] = df['close'].rolling(window=50, min_periods=5).mean().fillna(df['close'])
        
        for i in range(n):
            c_high = df['high'].iloc[i]
            c_low = df['low'].iloc[i]
            c_close = df['close'].iloc[i]
            c_open = df['open'].iloc[i]
            c_vol = df['volume'].iloc[i]
            avg_vol = df['avg_volume'].iloc[i]
            
            # Support/Resistance levels
            sup = df['rolling_low'].iloc[i]
            res = df['rolling_high'].iloc[i]
            
            support_levels.append(float(sup))
            resistance_levels.append(float(res))
            
            signal = None
            
            # 2. Trap Detection (Liquidity Sweeps)
            # Spring: Low sweeps below Support, Closes above Support, High Volume
            is_spring = (c_low < sup) and (c_close > sup) and (c_vol > avg_vol * 1.1)
            # Upthrust: High sweeps above Resistance, Closes below Resistance, High Volume
            is_upthrust = (c_high > res) and (c_close < res) and (c_vol > avg_vol * 1.1)
            
            if is_spring:
                signal = "Spring detected"
                last_spring_idx = i
            elif is_upthrust:
                signal = "Upthrust detected"
                last_upthrust_idx = i
                
            signals.append(signal)

            # Determine market trend and momentum
            # Check last 20 bars for HH/HL vs LL/LH
            if i >= 20:
                recent_close_change = df['close'].iloc[i] - df['close'].iloc[i-20]
                recent_highs = df['high'].iloc[i-20:i+1]
                recent_lows = df['low'].iloc[i-20:i+1]
                
                # Check for markup / markdown based on breakout and SMA direction
                sma_slope = df['sma50'].iloc[i] - df['sma50'].iloc[i-5]
                
                # Wyckoff Stage Classification Logic
                if is_spring or (i - last_spring_idx < 30 and recent_close_change > 0):
                    current_stage = "ACCUMULATION"
                elif is_upthrust or (i - last_upthrust_idx < 30 and recent_close_change < 0):
                    current_stage = "DISTRIBUTION"
                elif c_close > res and sma_slope > 0:
                    current_stage = "MARKUP"
                elif c_close < sup and sma_slope < 0:
                    current_stage = "MARKDOWN"
                else:
                    # Check if sideways inside support/resistance bounds
                    range_size = res - sup
                    if range_size > 0:
                        price_position = (c_close - sup) / range_size
                        if 0.1 <= price_position <= 0.9 and abs(sma_slope) < (range_size * 0.05):
                            # Side-ways consolidation
                            # If we recently came from Markdown or hit a Spring, it's Accumulation
                            if last_spring_idx > last_upthrust_idx:
                                current_stage = "ACCUMULATION"
                            # If we came from Markup or hit an Upthrust, it's Distribution
                            elif last_upthrust_idx > last_spring_idx:
                                current_stage = "DISTRIBUTION"
                            else:
                                current_stage = "ACCUMULATION" if recent_close_change <= 0 else "DISTRIBUTION"
                        else:
                            current_stage = "TRANSITION"
            else:
                current_stage = "TRANSITION"

            stages.append(current_stage)

        df['wyckoff_stage'] = stages
        df['support_level'] = support_levels
        df['resistance_level'] = resistance_levels
        df['wyckoff_signal'] = signals

        # Clean up temporary columns
        cols_to_drop = ['rolling_low', 'rolling_high', 'avg_volume', 'sma50']
        df = df.drop(columns=[col for col in cols_to_drop if col in df.columns])

        return df.to_dict(orient='records')
