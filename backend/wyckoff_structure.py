import pandas as pd
import numpy as np

class WyckoffStructure:
    @staticmethod
    def calculate_support_resistance(df: pd.DataFrame, lookback: int) -> pd.DataFrame:
        """
        Calculate rolling support and resistance levels.
        Support is the local minimum and Resistance is the local maximum over the lookback window.
        """
        df = df.copy()
        df['rolling_low'] = df['low'].shift(1).rolling(window=lookback, min_periods=5).min()
        df['rolling_high'] = df['high'].shift(1).rolling(window=lookback, min_periods=5).max()
        
        # Fallback for initial values
        df['rolling_low'] = df['rolling_low'].fillna(df['low'])
        df['rolling_high'] = df['rolling_high'].fillna(df['high'])
        return df

    @staticmethod
    def detect_liquidity_sweeps(df: pd.DataFrame) -> pd.DataFrame:
        """
        Detect Springs (bullish sweep) and Upthrusts (bearish sweep).
        - Spring: Low sweeps below Support, Closes above Support, High Volume.
        - Upthrust: High sweeps above Resistance, Closes below Resistance, High Volume.
        """
        df = df.copy()
        df['avg_volume'] = df['volume'].rolling(window=50, min_periods=5).mean().fillna(df['volume'])
        
        springs = []
        upthrusts = []
        signals = []
        
        for i in range(len(df)):
            c_high = df['high'].iloc[i]
            c_low = df['low'].iloc[i]
            c_close = df['close'].iloc[i]
            c_vol = df['volume'].iloc[i]
            avg_vol = df['avg_volume'].iloc[i]
            sup = df['rolling_low'].iloc[i]
            res = df['rolling_high'].iloc[i]
            
            # Spring detection
            is_spring = (c_low < sup) and (c_close > sup) and (c_vol > avg_vol * 1.1)
            # Upthrust detection
            is_upthrust = (c_high > res) and (c_close < res) and (c_vol > avg_vol * 1.1)
            
            springs.append(is_spring)
            upthrusts.append(is_upthrust)
            
            if is_spring:
                signals.append("Spring detected")
            elif is_upthrust:
                signals.append("Upthrust detected")
            else:
                signals.append(None)
                
        df['is_spring'] = springs
        df['is_upthrust'] = upthrusts
        df['wyckoff_signal'] = signals
        return df

    @staticmethod
    def classify_wyckoff_stages(df: pd.DataFrame, progress_callback=None) -> pd.DataFrame:
        """
        Classifies each candle into one of the Wyckoff stages:
        - ACCUMULATION: Sideways consolidation near support, or following a Spring.
        - DISTRIBUTION: Sideways consolidation near resistance, or following an Upthrust.
        - MARKUP: Upward trending breakout.
        - MARKDOWN: Downward trending breakout.
        - TRANSITION: Transition phase/uncertainty.
        """
        df = df.copy()
        n = len(df)
        stages = []
        
        # Calculate trend using a 50-period SMA
        df['sma50'] = df['close'].rolling(window=50, min_periods=5).mean().fillna(df['close'])
        
        current_stage = "TRANSITION"
        last_spring_idx = -100
        last_upthrust_idx = -100
        last_percent = -1
        
        for i in range(n):
            if progress_callback and n > 0:
                percent = int(((i + 1) / n) * 100)
                if percent != last_percent and percent % 5 == 0:
                    last_percent = percent
                    bar_length = 20
                    filled_length = int(bar_length * percent // 100)
                    bar = '█' * filled_length + '-' * (bar_length - filled_length)
                    print(f"\r[Wyckoff Analysis Progress] |{bar}| {percent}% ({i+1}/{n})", end="", flush=True)
                    if percent == 100:
                        print(flush=True)
                    try:
                        progress_callback(percent)
                    except Exception:
                        pass
            c_close = df['close'].iloc[i]
            sup = df['rolling_low'].iloc[i]
            res = df['rolling_high'].iloc[i]
            is_spring = df['is_spring'].iloc[i]
            is_upthrust = df['is_upthrust'].iloc[i]
            
            if is_spring:
                last_spring_idx = i
            if is_upthrust:
                last_upthrust_idx = i
                
            if i >= 20:
                recent_close_change = df['close'].iloc[i] - df['close'].iloc[i-20]
                sma_slope = df['sma50'].iloc[i] - df['sma50'].iloc[i-5]
                
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
                            if last_spring_idx > last_upthrust_idx:
                                current_stage = "ACCUMULATION"
                            elif last_upthrust_idx > last_spring_idx:
                                current_stage = "DISTRIBUTION"
                            else:
                                current_stage = "ACCUMULATION" if recent_close_change <= 0 else "DISTRIBUTION"
                        else:
                            current_stage = "TRANSITION"
                    else:
                        current_stage = "TRANSITION"
            else:
                current_stage = "TRANSITION"
                
            stages.append(current_stage)
            
        df['wyckoff_stage'] = stages
        return df

    @classmethod
    def analyze_structure(cls, candles: list, lookback: int = 20, progress_callback=None) -> list:
        """
        Runs the full pipeline to analyze the Wyckoff structure of the candles.
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
            df['wyckoff_stage'] = 'TRANSITION'
            df['support_level'] = np.nan
            df['resistance_level'] = np.nan
            df['wyckoff_signal'] = None
            return df.to_dict(orient='records')
            
        # 1. Support and Resistance
        df = cls.calculate_support_resistance(df, lookback)
        
        # 2. Springs & Upthrusts
        df = cls.detect_liquidity_sweeps(df)
        
        # 3. Stage Classification
        df = cls.classify_wyckoff_stages(df, progress_callback=progress_callback)
        
        # Print stage changes and the most recent one
        stage_changes = 0
        last_change_time = None
        if len(df) > 0 and 'wyckoff_stage' in df.columns:
            current_stage = df['wyckoff_stage'].iloc[0]
            for i in range(1, len(df)):
                stage = df['wyckoff_stage'].iloc[i]
                if stage != current_stage:
                    stage_changes += 1
                    current_stage = stage
                    if 'time' in df.columns:
                        last_change_time = df['time'].iloc[i]
            
            recent_time_str = "N/A"
            if last_change_time is not None:
                try:
                    ts = float(last_change_time)
                    from datetime import datetime
                    recent_time_str = datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S UTC')
                except Exception:
                    recent_time_str = str(last_change_time)
            
            print(f"[Wyckoff Analysis] Found {stage_changes} wyckoff stage changes. Most recent change was at: {recent_time_str}", flush=True)

        # Format the output fields to match the expected format
        df['support_level'] = df['rolling_low']
        df['resistance_level'] = df['rolling_high']
        
        # Clean up temporary columns
        cols_to_drop = ['rolling_low', 'rolling_high', 'avg_volume', 'sma50', 'is_spring', 'is_upthrust']
        df = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors='ignore')
        
        # Replace NaN values with None/nan for JSON compatibility
        df = df.replace({np.nan: None})
        
        return df.to_dict(orient='records')
