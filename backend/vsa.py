import numpy as np
import pandas as pd

def compute_rolling_percentiles(df: pd.DataFrame, window: int = 100, lookback: int = 20):
    """
    Computes standard rolling percentile ranks over a window of 100 bars for Volume and Spread.
    Maps percentiles directly to shared integer deciles (1 to 10).
    """
    if len(df) < 2:
        df['vol_decile'] = 10
        df['spread_decile'] = 10
        df['sweep_high'] = df['high']
        df['sweep_low'] = df['low']
        return df

    # S_t = H_t - L_t
    spreads = df['high'] - df['low']
    volumes = df['volume']
    
    vol_deciles = []
    spread_deciles = []
    
    for i in range(len(df)):
        start_idx = max(0, i - window + 1)
        window_v = volumes.iloc[start_idx:i+1]
        window_s = spreads.iloc[start_idx:i+1]
        
        v_t = volumes.iloc[i]
        s_t = spreads.iloc[i]
        
        count_v = (window_v <= v_t).sum()
        count_s = (window_s <= s_t).sum()
        
        n = len(window_v)
        vol_pct = (count_v / n) * 100
        spread_pct = (count_s / n) * 100
        
        # Map percentiles directly to shared integer deciles (1 to 10)
        # e.g., 0-10 -> 1, 90-100 -> 10
        v_decile = int(np.clip(np.ceil(vol_pct / 10), 1, 10))
        s_decile = int(np.clip(np.ceil(spread_pct / 10), 1, 10))
        
        vol_deciles.append(v_decile)
        spread_deciles.append(s_decile)
        
    df['vol_decile'] = vol_deciles
    df['spread_decile'] = spread_deciles
    df['spread'] = spreads
    df['sweep_high'] = df['high'].shift(1).rolling(window=lookback, min_periods=1).max()
    df['sweep_low'] = df['low'].shift(1).rolling(window=lookback, min_periods=1).min()
    # Backfill the first element where shift(1) is NaN
    df['sweep_high'] = df['sweep_high'].fillna(df['high'])
    df['sweep_low'] = df['sweep_low'].fillna(df['low'])
    
    df['tr_high'] = df['high'].rolling(window=lookback, min_periods=1).max()
    df['tr_low'] = df['low'].rolling(window=lookback, min_periods=1).min()
    return df

def compute_closing_location_ratio(high: float, low: float, close: float) -> float:
    """
    Tracks bar sentiment with the standardized Closing Location Ratio (R_t) on a scale of [-1.0, 1.0].
    R_t = ((C_t - L_t) - (H_t - C_t)) / S_t
    """
    spread = high - low
    if spread <= 0:
        return 0.0
    return ((close - low) - (high - close)) / spread

def analyze_vsa_patterns(df: pd.DataFrame, lookback: int = 20) -> list:
    """
    Programmatically codifies detection rules for the 5 core Wyckoff VSA patterns:
    No Demand (ND), No Supply (NS), Upthrust (UT), Shakeout/Spring (SO), and Stopping Volume (STV).
    Uses log-return Z-score to confirm stopping volume climax events.
    """
    if len(df) < 3:
        return [[] for _ in range(len(df))]
    
    # Pre-calculate rolling percentiles and deciles
    df = compute_rolling_percentiles(df, lookback=lookback)
    
    # Calculate log returns
    closes = df['close'].values
    log_returns = np.zeros(len(df))
    for idx in range(1, len(df)):
        if closes[idx] > 0 and closes[idx-1] > 0:
            log_returns[idx] = np.log(closes[idx] / closes[idx-1])
            
    # Calculate rolling mean and std of log returns for z-score (window = 100)
    rolling_mean = pd.Series(log_returns).rolling(window=100, min_periods=1).mean().values
    rolling_std = pd.Series(log_returns).rolling(window=100, min_periods=1).std().values
    
    patterns_list = []
    
    for i in range(len(df)):
        patterns = []
        if i < 2:
            patterns_list.append(patterns)
            continue
            
        c_t = df['close'].iloc[i]
        h_t = df['high'].iloc[i]
        l_t = df['low'].iloc[i]
        v_t = df['volume'].iloc[i]
        s_t = df['spread'].iloc[i]
        v_dec = df['vol_decile'].iloc[i]
        s_dec = df['spread_decile'].iloc[i]
        
        c_prev1 = df['close'].iloc[i-1]
        c_prev2 = df['close'].iloc[i-2]
        v_prev1 = df['volume'].iloc[i-1]
        v_prev2 = df['volume'].iloc[i-2]
        
        r_t = compute_closing_location_ratio(h_t, l_t, c_t)
        
        # 1. No Demand (ND)
        # Upbar (close > prev close) on narrow spread and below average volume (decile <= 4)
        is_upbar = c_t > c_prev1
        if is_upbar and s_dec <= 4 and v_dec <= 4:
            patterns.append("No Demand")
            
        # 2. No Supply (NS)
        # Downbar (close < prev close) on narrow spread and below average volume (decile <= 4)
        is_downbar = c_t < c_prev1
        if is_downbar and s_dec <= 4 and v_dec <= 4:
            patterns.append("No Supply")
            
        # 3. Upthrust (UT)
        # Wide spread, high volume (decile >= 7), closing in lower third of bar (R_t <= -0.33) after an uptrend
        if s_dec >= 7 and v_dec >= 7 and r_t <= -0.33 and c_prev1 > c_prev2:
            patterns.append("Upthrust")
            
        # 4. Shakeout / Spring (SO)
        # Downward price movement (often breaking below support), closing in upper third of bar (R_t >= 0.33) on high volume
        if v_dec >= 7 and r_t >= 0.33 and l_t < df['low'].iloc[i-1]:
            patterns.append("Shakeout/Spring")
            
        # 5. Stopping Volume (STV)
        # Downbar, high volume (decile >= 8), narrow spread, closing in upper half of bar (R_t >= 0.0)
        # zmove_t confirms climax event (absolute z-score > 2.0)
        mean_ret = rolling_mean[i]
        std_ret = rolling_std[i] if rolling_std[i] > 0 else 1e-6
        zmove = (log_returns[i] - mean_ret) / std_ret
        
        if is_downbar and v_dec >= 8 and s_dec <= 5 and r_t >= 0.0 and abs(zmove) > 2.0:
            patterns.append("Stopping Volume")
            
        patterns_list.append(patterns)
        
    return patterns_list
