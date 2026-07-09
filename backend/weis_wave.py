import pandas as pd
import numpy as np

def compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, window: int = 20) -> pd.Series:
    """
    Computes the standard Average True Range (ATR) over a given window.
    """
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(window=window, min_periods=1).mean()
    return atr

def compute_weis_wave(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregates volume into swings based on a volatility-adjusted ZigZag trend.
    Reversal parameter: R_t = 2.5 * ATR_t(20)
    Accumulates volume within the trend, resetting wave volume on reversals.
    """
    if len(df) == 0:
        return df

    # Ensure required columns exist
    for col in ['high', 'low', 'close', 'volume']:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    # Compute 20-bar ATR
    atr = compute_atr(df['high'], df['low'], df['close'], window=20)
    reversal_threshold = 2.5 * atr
    
    # Zigzag state variables
    # 1 for up swing, -1 for down swing, 0 for initial
    direction = 0
    last_extreme = df['close'].iloc[0]
    
    wave_volume = 0.0
    weis_volumes = []
    directions = []
    
    for i in range(len(df)):
        close_t = df['close'].iloc[i]
        vol_t = df['volume'].iloc[i]
        r_t = reversal_threshold.iloc[i]
        
        # If standard ATR is NaN or 0, fallback to a sensible ratio or min movement
        if pd.isna(r_t) or r_t <= 0:
            r_t = close_t * 0.005 # 0.5% default fallback
            
        if direction == 0:
            # Initialize direction based on first price movement
            if close_t > last_extreme:
                direction = 1
                last_extreme = close_t
                wave_volume = vol_t
            elif close_t < last_extreme:
                direction = -1
                last_extreme = close_t
                wave_volume = vol_t
            else:
                wave_volume = vol_t
        elif direction == 1:
            # Currently in UP trend
            if close_t > last_extreme:
                # Higher high, continue wave
                last_extreme = close_t
                wave_volume += vol_t
            elif close_t <= last_extreme - r_t:
                # Reversal threshold breached, switch to DOWN trend
                direction = -1
                last_extreme = close_t
                wave_volume = vol_t
            else:
                # Normal move, continue wave
                wave_volume += vol_t
        elif direction == -1:
            # Currently in DOWN trend
            if close_t < last_extreme:
                # Lower low, continue wave
                last_extreme = close_t
                wave_volume += vol_t
            elif close_t >= last_extreme + r_t:
                # Reversal threshold breached, switch to UP trend
                direction = 1
                last_extreme = close_t
                wave_volume = vol_t
            else:
                # Normal move, continue wave
                wave_volume += vol_t
                
        weis_volumes.append(wave_volume * direction)
        directions.append(direction)
        
    df['weis_wave_volume'] = weis_volumes
    df['weis_wave_dir'] = directions
    df['reversal_threshold'] = reversal_threshold
    
    return df
