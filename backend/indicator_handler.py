import pandas as pd
import numpy as np

class IndicatorHandler:
    """
    Modular, high-performance technical indicator handler using vectorized NumPy & Pandas operations.
    Supports individual callable methods, customizable smoothing algorithms, and dynamic parameter execution.
    """

    # --- Utility Smoothing Helpers ---
    @staticmethod
    def _apply_smoothing(series: pd.Series, period: int, method: str = 'rma') -> pd.Series:
        method_lower = str(method).lower()
        if method_lower == 'sma':
            return series.rolling(window=period, min_periods=1).mean()
        elif method_lower == 'ema':
            return series.ewm(span=period, adjust=False, min_periods=1).mean()
        elif method_lower == 'wma':
            weights = np.arange(1, period + 1)
            return series.rolling(window=period, min_periods=1).apply(
                lambda w: np.dot(w, weights[:len(w)]) / weights[:len(w)].sum(), raw=True
            )
        elif method_lower in ['rma', 'smma', 'wilder']:
            # Wilder's smoothing equivalent to EMA with alpha = 1 / period
            return series.ewm(alpha=1.0 / period, adjust=False, min_periods=1).mean()
        else:
            raise ValueError(f"Unsupported smoothing method '{method}'. Choose from: rma, sma, ema, wma.")

    # --- Core Moving Averages ---
    @staticmethod
    def sma(df: pd.DataFrame, period: int = 20, column: str = 'close') -> pd.Series:
        """Simple Moving Average (SMA)."""
        return df[column].rolling(window=period, min_periods=1).mean()

    @staticmethod
    def ema(df: pd.DataFrame, period: int = 20, column: str = 'close') -> pd.Series:
        """Exponential Moving Average (EMA)."""
        return df[column].ewm(span=period, adjust=False, min_periods=1).mean()

    @staticmethod
    def htf_ema(ltf_df: pd.DataFrame, htf_df: pd.DataFrame, period: int = 200, column: str = 'close') -> pd.Series:
        """
        Higher-Timeframe (HTF) Exponential Moving Average.
        Calculates EMA on the HTF candles and aligns it continuously / progressively
        to the lower-timeframe (LTF) candles based on timestamp.
        """
        if ltf_df.empty:
            return pd.Series(dtype=float)
        if htf_df.empty:
            return pd.Series(np.nan, index=ltf_df.index)

        # Ensure time columns are numeric
        htf = htf_df.copy()
        ltf = ltf_df[['time']].copy() if 'time' in ltf_df.columns else pd.DataFrame({'time': ltf_df.index})
        
        htf['time'] = pd.to_numeric(htf['time'])
        ltf['time'] = pd.to_numeric(ltf['time'])
        htf = htf.sort_values('time').reset_index(drop=True)
        
        # Calculate EMA on HTF
        htf['htf_ema_val'] = IndicatorHandler.ema(htf, period=period, column=column)
        
        # Align progressively to LTF using merge_asof (backward lookup matches latest available HTF candle)
        merged = pd.merge_asof(
            ltf.sort_values('time'),
            htf[['time', 'htf_ema_val']],
            on='time',
            direction='backward'
        )
        
        # Restore original LTF index order
        aligned_series = merged.set_index(ltf_df.index)['htf_ema_val']
        return aligned_series

    @staticmethod
    def wma(df: pd.DataFrame, period: int = 20, column: str = 'close') -> pd.Series:
        """Weighted Moving Average (WMA)."""
        return IndicatorHandler._apply_smoothing(df[column], period=period, method='wma')

    @staticmethod
    def rma(df: pd.DataFrame, period: int = 14, column: str = 'close') -> pd.Series:
        """Wilder's Smoothing (RMA / SMMA)."""
        return IndicatorHandler._apply_smoothing(df[column], period=period, method='rma')

    # --- Technical Indicators ---
    @staticmethod
    def atr(df: pd.DataFrame, period: int = 14, smoothing: str = 'rma',
            high_col: str = 'high', low_col: str = 'low', close_col: str = 'close') -> pd.Series:
        """Average True Range (ATR) with customizable smoothing method ('rma', 'sma', 'ema', 'wma')."""
        high = df[high_col]
        low = df[low_col]
        close = df[close_col]

        tr1 = high - low
        tr2 = (high - close.shift(1)).abs()
        tr3 = (low - close.shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        return IndicatorHandler._apply_smoothing(tr, period=period, method=smoothing)

    @staticmethod
    def rsi(df: pd.DataFrame, period: int = 14, column: str = 'close', smoothing: str = 'rma') -> pd.Series:
        """Relative Strength Index (RSI) with customizable smoothing method."""
        delta = df[column].diff()
        gain = delta.clip(lower=0)
        loss = (-delta).clip(lower=0)

        avg_gain = IndicatorHandler._apply_smoothing(gain, period=period, method=smoothing)
        avg_loss = IndicatorHandler._apply_smoothing(loss, period=period, method=smoothing)

        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))

        # Handle zero-loss boundaries
        rsi = rsi.fillna(100.0)
        rsi.loc[(avg_gain == 0) & (avg_loss == 0)] = 50.0
        return rsi

    @staticmethod
    def macd(df: pd.DataFrame, fast_period: int = 12, slow_period: int = 26, signal_period: int = 9,
             column: str = 'close') -> pd.DataFrame:
        """Moving Average Convergence Divergence (MACD). Returns DataFrame with macd, signal, and histogram."""
        fast_ema = IndicatorHandler.ema(df, period=fast_period, column=column)
        slow_ema = IndicatorHandler.ema(df, period=slow_period, column=column)
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=signal_period, adjust=False, min_periods=1).mean()
        histogram = macd_line - signal_line

        return pd.DataFrame({
            'macd': macd_line,
            'signal': signal_line,
            'histogram': histogram
        }, index=df.index)

    @staticmethod
    def bollinger_bands(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0, column: str = 'close') -> pd.DataFrame:
        """Bollinger Bands. Returns DataFrame with upper, middle, lower, bandwidth, and percent_b."""
        middle = df[column].rolling(window=period, min_periods=1).mean()
        rolling_std = df[column].rolling(window=period, min_periods=1).std(ddof=0)
        upper = middle + (rolling_std * std_dev)
        lower = middle - (rolling_std * std_dev)

        bandwidth = (upper - lower) / middle.replace(0, np.nan)
        percent_b = (df[column] - lower) / (upper - lower).replace(0, np.nan)

        return pd.DataFrame({
            'upper': upper,
            'middle': middle,
            'lower': lower,
            'bandwidth': bandwidth,
            'percent_b': percent_b
        }, index=df.index)

    @staticmethod
    def vwap(df: pd.DataFrame, high_col: str = 'high', low_col: str = 'low',
             close_col: str = 'close', vol_col: str = 'volume') -> pd.Series:
        """Volume Weighted Average Price (VWAP)."""
        high = df[high_col] if high_col in df.columns else df['close']
        low = df[low_col] if low_col in df.columns else df['close']
        close = df[close_col] if close_col in df.columns else df['close']
        vol = df[vol_col] if vol_col in df.columns else pd.Series(1, index=df.index)

        typical_price = (high + low + close) / 3.0
        cum_pv = (typical_price * vol).cumsum()
        cum_vol = vol.cumsum()
        return cum_pv / cum_vol.replace(0, np.nan)

    @staticmethod
    def hma(df: pd.DataFrame, period: int = 20, column: str = 'close') -> pd.Series:
        """Hull Moving Average (HMA). Fast, highly responsive smoothed moving average."""
        half_period = max(1, int(period / 2))
        sqrt_period = max(1, int(np.sqrt(period)))
        
        wma_half = IndicatorHandler.wma(df, period=half_period, column=column)
        wma_full = IndicatorHandler.wma(df, period=period, column=column)
        
        diff = 2.0 * wma_half - wma_full
        diff_df = pd.DataFrame({'diff': diff}, index=df.index)
        return IndicatorHandler.wma(diff_df, period=sqrt_period, column='diff')

    @staticmethod
    def supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0,
                    high_col: str = 'high', low_col: str = 'low', close_col: str = 'close') -> pd.DataFrame:
        """Supertrend calculation returning trend line and direction (1 for Bullish, -1 for Bearish)."""
        high = df[high_col]
        low = df[low_col]
        close = df[close_col]
        atr = IndicatorHandler.atr(df, period=period, high_col=high_col, low_col=low_col, close_col=close_col)

        hl2 = (high + low) / 2.0
        basic_upper = hl2 + (multiplier * atr)
        basic_lower = hl2 - (multiplier * atr)

        n = len(df)
        final_upper = np.zeros(n)
        final_lower = np.zeros(n)
        trend = np.ones(n)
        st_line = np.zeros(n)

        close_arr = close.to_numpy()
        b_upper_arr = basic_upper.to_numpy()
        b_lower_arr = basic_lower.to_numpy()

        for i in range(n):
            if i == 0:
                final_upper[i] = b_upper_arr[i]
                final_lower[i] = b_lower_arr[i]
                st_line[i] = final_lower[i]
                trend[i] = 1
                continue

            # Upper Band logic
            if b_upper_arr[i] < final_upper[i - 1] or close_arr[i - 1] > final_upper[i - 1]:
                final_upper[i] = b_upper_arr[i]
            else:
                final_upper[i] = final_upper[i - 1]

            # Lower Band logic
            if b_lower_arr[i] > final_lower[i - 1] or close_arr[i - 1] < final_lower[i - 1]:
                final_lower[i] = b_lower_arr[i]
            else:
                final_lower[i] = final_lower[i - 1]

            # Trend direction & Supertrend Line
            if trend[i - 1] == 1:
                if close_arr[i] < final_lower[i]:
                    trend[i] = -1
                    st_line[i] = final_upper[i]
                else:
                    trend[i] = 1
                    st_line[i] = final_lower[i]
            else:
                if close_arr[i] > final_upper[i]:
                    trend[i] = 1
                    st_line[i] = final_lower[i]
                else:
                    trend[i] = -1
                    st_line[i] = final_upper[i]

        return pd.DataFrame({
            'supertrend': st_line,
            'trend': trend,
            'upper': final_upper,
            'lower': final_lower
        }, index=df.index)

    @staticmethod
    def donchian_channels(df: pd.DataFrame, period: int = 20, high_col: str = 'high', low_col: str = 'low') -> pd.DataFrame:
        """Donchian Channels (Upper, Lower, Middle)."""
        upper = df[high_col].rolling(window=period, min_periods=1).max()
        lower = df[low_col].rolling(window=period, min_periods=1).min()
        middle = (upper + lower) / 2.0
        return pd.DataFrame({'upper': upper, 'middle': middle, 'lower': lower}, index=df.index)

    @staticmethod
    def keltner_channels(df: pd.DataFrame, ema_period: int = 20, atr_period: int = 10, multiplier: float = 2.0,
                         column: str = 'close') -> pd.DataFrame:
        """Keltner Channels (EMA baseline with ATR-based bands)."""
        middle = IndicatorHandler.ema(df, period=ema_period, column=column)
        atr = IndicatorHandler.atr(df, period=atr_period)
        upper = middle + (multiplier * atr)
        lower = middle - (multiplier * atr)
        return pd.DataFrame({'upper': upper, 'middle': middle, 'lower': lower}, index=df.index)

    @staticmethod
    def envelopes(df: pd.DataFrame, period: int = 20, percent: float = 2.5, column: str = 'close') -> pd.DataFrame:
        """Price Envelopes around a Simple Moving Average."""
        middle = df[column].rolling(window=period, min_periods=1).mean()
        factor = percent / 100.0
        upper = middle * (1.0 + factor)
        lower = middle * (1.0 - factor)
        return pd.DataFrame({'upper': upper, 'middle': middle, 'lower': lower}, index=df.index)

    @staticmethod
    def parabolic_sar(df: pd.DataFrame, step: float = 0.02, max_step: float = 0.2,
                       high_col: str = 'high', low_col: str = 'low') -> pd.Series:
        """Parabolic SAR trailing stop overlay."""
        n = len(df)
        sar = np.zeros(n)
        if n == 0:
            return pd.Series(sar, index=df.index)

        high = df[high_col].to_numpy()
        low = df[low_col].to_numpy()

        is_bull = True
        ep = high[0]
        af = step
        sar[0] = low[0]

        for i in range(1, n):
            prev_sar = sar[i - 1]
            if is_bull:
                curr_sar = prev_sar + af * (ep - prev_sar)
                if i >= 2:
                    curr_sar = min(curr_sar, low[i - 1], low[i - 2])
                else:
                    curr_sar = min(curr_sar, low[i - 1])

                if low[i] < curr_sar:
                    is_bull = False
                    curr_sar = ep
                    ep = low[i]
                    af = step
                else:
                    if high[i] > ep:
                        ep = high[i]
                        af = min(af + step, max_step)
            else:
                curr_sar = prev_sar + af * (ep - prev_sar)
                if i >= 2:
                    curr_sar = max(curr_sar, high[i - 1], high[i - 2])
                else:
                    curr_sar = max(curr_sar, high[i - 1])

                if high[i] > curr_sar:
                    is_bull = True
                    curr_sar = ep
                    ep = high[i]
                    af = step
                else:
                    if low[i] < ep:
                        ep = low[i]
                        af = min(af + step, max_step)

            sar[i] = curr_sar

        return pd.Series(sar, index=df.index)

    @staticmethod
    def stochastic(df: pd.DataFrame, k_period: int = 14, d_period: int = 3, slowing: int = 3,
                   high_col: str = 'high', low_col: str = 'low', close_col: str = 'close') -> pd.DataFrame:
        """Stochastic Oscillator (%K and %D)."""
        lowest_low = df[low_col].rolling(window=k_period, min_periods=1).min()
        highest_high = df[high_col].rolling(window=k_period, min_periods=1).max()

        denom = (highest_high - lowest_low).replace(0, np.nan)
        fast_k = 100.0 * (df[close_col] - lowest_low) / denom
        
        slow_k = fast_k.rolling(window=slowing, min_periods=1).mean()
        d_line = slow_k.rolling(window=d_period, min_periods=1).mean()

        return pd.DataFrame({
            'k': slow_k.fillna(50.0),
            'd': d_line.fillna(50.0)
        }, index=df.index)

    # --- Custom / Specialized Pattern Handlers ---
    @staticmethod
    def compute_vsa(df: pd.DataFrame, lookback: int = 20) -> list:
        """Runs Volume Spread Analysis (VSA) patterns calculation."""
        from vsa import analyze_vsa_patterns
        return analyze_vsa_patterns(df, lookback=lookback)

    @staticmethod
    def compute_weis_wave(df: pd.DataFrame) -> pd.DataFrame:
        """Runs Weis Wave Volume calculations."""
        from weis_wave import compute_weis_wave
        return compute_weis_wave(df)

    @staticmethod
    def compute_fvgs(df: pd.DataFrame) -> list:
        """Fair Value Gaps (FVG) detection."""
        fvgs = []
        n = len(df)
        if n < 3:
            return fvgs

        highs = df['high'].to_numpy()
        lows = df['low'].to_numpy()
        times = df['time'].to_numpy()

        for i in range(2, n):
            c1_high = highs[i - 2]
            c3_low = lows[i]

            if c3_low > c1_high:
                price_min = float(c1_high)
                price_max = float(c3_low)
                time_start = int(times[i - 1])
                time_end = int(times[-1])
                mitigated = False

                for j in range(i + 1, n):
                    if lows[j] <= price_max:
                        time_end = int(times[j])
                        mitigated = True
                        break

                fvgs.append({
                    "type": "bullish",
                    "priceMin": price_min,
                    "priceMax": price_max,
                    "timeStart": time_start,
                    "timeEnd": time_end,
                    "mitigated": mitigated
                })

            c1_low = lows[i - 2]
            c3_high = highs[i]
            if c3_high < c1_low:
                price_min = float(c3_high)
                price_max = float(c1_low)
                time_start = int(times[i - 1])
                time_end = int(times[-1])
                mitigated = False

                for j in range(i + 1, n):
                    if highs[j] >= price_min:
                        time_end = int(times[j])
                        mitigated = True
                        break

                fvgs.append({
                    "type": "bearish",
                    "priceMin": price_min,
                    "priceMax": price_max,
                    "timeStart": time_start,
                    "timeEnd": time_end,
                    "mitigated": mitigated
                })
        return fvgs

    # --- Dynamic Dispatcher & Catalog ---
    @staticmethod
    def compute(df: pd.DataFrame, name: str, **kwargs):
        """Dynamic indicator calculation by method name."""
        method_name = name.lower()
        if hasattr(IndicatorHandler, method_name):
            func = getattr(IndicatorHandler, method_name)
            return func(df, **kwargs)
        raise AttributeError(f"Indicator '{name}' is not supported in IndicatorHandler.")

    @staticmethod
    def get_catalog() -> dict:
        """Returns catalog of supported indicators, parameters, and metadata for UI integration."""
        return {
            "ema": {
                "name": "Exponential Moving Average (EMA)",
                "category": "Trend Overlays",
                "pane": "overlay",
                "description": "Weighted moving average giving higher weight to recent prices.",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1, "max": 5000, "label": "Period"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "sma": {
                "name": "Simple Moving Average (SMA)",
                "category": "Trend Overlays",
                "pane": "overlay",
                "description": "Arithmetic moving average calculated by adding closing prices over a period.",
                "params": {
                    "period": {"type": "int", "default": 50, "min": 1, "max": 5000, "label": "Period"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "wma": {
                "name": "Weighted Moving Average (WMA)",
                "category": "Trend Overlays",
                "pane": "overlay",
                "description": "Linear weighted moving average placing greatest weight on recent bars.",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1, "max": 5000, "label": "Period"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "hma": {
                "name": "Hull Moving Average (HMA)",
                "category": "Trend Overlays",
                "pane": "overlay",
                "description": "Extremely fast and smooth moving average with almost zero lag.",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1, "max": 1000, "label": "Period"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "supertrend": {
                "name": "Supertrend",
                "category": "Trend Overlays",
                "pane": "overlay",
                "description": "ATR-based trend line identifying bullish and bearish trend shifts.",
                "params": {
                    "period": {"type": "int", "default": 10, "min": 1, "max": 200, "label": "ATR Period"},
                    "multiplier": {"type": "float", "default": 3.0, "min": 0.1, "max": 20.0, "label": "Multiplier"}
                }
            },
            "parabolic_sar": {
                "name": "Parabolic SAR",
                "category": "Trend Overlays",
                "pane": "overlay",
                "description": "Trailing stop-and-reverse price points tracking dynamic momentum.",
                "params": {
                    "step": {"type": "float", "default": 0.02, "min": 0.001, "max": 0.5, "label": "Step"},
                    "max_step": {"type": "float", "default": 0.2, "min": 0.01, "max": 1.0, "label": "Max Step"}
                }
            },
            "vwap": {
                "name": "Volume Weighted Average Price (VWAP)",
                "category": "Volume & Flow",
                "pane": "overlay",
                "description": "Benchmark price representing total value traded divided by total volume.",
                "params": {}
            },
            "bollinger_bands": {
                "name": "Bollinger Bands",
                "category": "Volatility & Bands",
                "pane": "overlay",
                "description": "Volatility bands placed above and below a moving average.",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1, "max": 500, "label": "Period"},
                    "std_dev": {"type": "float", "default": 2.0, "min": 0.1, "max": 10.0, "label": "Std Dev Multiplier"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "keltner_channels": {
                "name": "Keltner Channels",
                "category": "Volatility & Bands",
                "pane": "overlay",
                "description": "Volatility-based envelopes using an EMA baseline and ATR bands.",
                "params": {
                    "ema_period": {"type": "int", "default": 20, "min": 1, "max": 500, "label": "EMA Period"},
                    "atr_period": {"type": "int", "default": 10, "min": 1, "max": 200, "label": "ATR Period"},
                    "multiplier": {"type": "float", "default": 2.0, "min": 0.1, "max": 10.0, "label": "ATR Multiplier"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "donchian_channels": {
                "name": "Donchian Channels",
                "category": "Volatility & Bands",
                "pane": "overlay",
                "description": "Highest high and lowest low bands over a lookback window.",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1, "max": 500, "label": "Period"}
                }
            },
            "envelopes": {
                "name": "Price Envelopes",
                "category": "Volatility & Bands",
                "pane": "overlay",
                "description": "Percentage envelope bands placed above and below an SMA.",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1, "max": 500, "label": "Period"},
                    "percent": {"type": "float", "default": 2.5, "min": 0.1, "max": 50.0, "label": "Envelope Percentage (%)"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "rsi": {
                "name": "Relative Strength Index (RSI)",
                "category": "Momentum & Oscillators",
                "pane": "subpane",
                "description": "Momentum oscillator measuring the speed and change of price movements.",
                "params": {
                    "period": {"type": "int", "default": 14, "min": 1, "max": 200, "label": "Period"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"},
                    "smoothing": {"type": "select", "default": "rma", "options": ["rma", "sma", "ema", "wma"], "label": "Smoothing"}
                }
            },
            "stochastic": {
                "name": "Stochastic Oscillator",
                "category": "Momentum & Oscillators",
                "pane": "subpane",
                "description": "Compares closing price to price range over a specific time period.",
                "params": {
                    "k_period": {"type": "int", "default": 14, "min": 1, "max": 200, "label": "%K Period"},
                    "d_period": {"type": "int", "default": 3, "min": 1, "max": 50, "label": "%D Smoothing"},
                    "slowing": {"type": "int", "default": 3, "min": 1, "max": 50, "label": "Slowing"}
                }
            },
            "macd": {
                "name": "MACD (Moving Average Convergence Divergence)",
                "category": "Momentum & Oscillators",
                "pane": "subpane",
                "description": "Trend-following momentum indicator showing the relationship between two EMAs.",
                "params": {
                    "fast_period": {"type": "int", "default": 12, "min": 1, "max": 200, "label": "Fast Period"},
                    "slow_period": {"type": "int", "default": 26, "min": 1, "max": 500, "label": "Slow Period"},
                    "signal_period": {"type": "int", "default": 9, "min": 1, "max": 100, "label": "Signal Smoothing"},
                    "column": {"type": "select", "default": "close", "options": ["close", "open", "high", "low"], "label": "Source"}
                }
            },
            "atr": {
                "name": "Average True Range (ATR)",
                "category": "Volatility & Bands",
                "pane": "subpane",
                "description": "Measures market volatility by decomposing the entire range of an asset.",
                "params": {
                    "period": {"type": "int", "default": 14, "min": 1, "max": 200, "label": "Period"},
                    "smoothing": {"type": "select", "default": "rma", "options": ["rma", "sma", "ema", "wma"], "label": "Smoothing"}
                }
            }
        }

    @staticmethod
    def evaluate_indicator_rules(df: pd.DataFrame, indicator_rules: list) -> tuple:
        """
        Evaluates a list of indicator rules against a DataFrame.
        Returns (indicator_buy_valid: pd.Series[bool], indicator_sell_valid: pd.Series[bool]).
        If indicator_rules is empty, returns all-True series for maximum backward compatibility.
        """
        if not indicator_rules or len(indicator_rules) == 0 or df.empty:
            all_true = pd.Series(True, index=df.index)
            return all_true, all_true

        buy_mask = pd.Series(True, index=df.index)
        sell_mask = pd.Series(True, index=df.index)

        # Cache calculated indicator series to avoid duplicate computation
        computed_cache = {}

        for rule in indicator_rules:
            if not rule.get('enabled', True):
                continue

            ind_name = str(rule.get('indicator', '')).lower()
            params = rule.get('params', {})
            operator = str(rule.get('operator', '<')).lower()
            target = rule.get('target', 0)
            signal_type = str(rule.get('signal_type', 'both')).lower()

            if not ind_name:
                continue

            cache_key = f"{ind_name}_{json.dumps(params, sort_keys=True)}"
            if cache_key in computed_cache:
                ind_val = computed_cache[cache_key]
            else:
                try:
                    res = IndicatorHandler.compute(df, ind_name, **params)
                    if isinstance(res, pd.DataFrame):
                        # For MACD or multi-column indicators, pick primary column or specified output_col
                        output_col = rule.get('output_col', 'macd' if 'macd' in res.columns else res.columns[0])
                        ind_val = res[output_col]
                    else:
                        ind_val = res
                    computed_cache[cache_key] = ind_val
                except Exception as e:
                    print(f"[IndicatorHandler] Warning: failed to compute {ind_name} with params {params}: {e}")
                    continue

            # Determine target series or scalar
            if isinstance(target, str):
                if target.lower() in df.columns:
                    target_series = df[target.lower()]
                elif target.lower() in computed_cache:
                    target_series = computed_cache[target.lower()]
                else:
                    # Attempt numeric parse
                    try:
                        target_series = float(target)
                    except ValueError:
                        target_series = 0.0
            else:
                try:
                    target_series = float(target)
                except (ValueError, TypeError):
                    target_series = 0.0

            # Compute boolean mask for current rule
            if operator == '<':
                rule_mask = (ind_val < target_series)
            elif operator == '>':
                rule_mask = (ind_val > target_series)
            elif operator == '<=':
                rule_mask = (ind_val <= target_series)
            elif operator == '>=':
                rule_mask = (ind_val >= target_series)
            elif operator in ('==', '='):
                rule_mask = (ind_val == target_series)
            elif operator == 'crosses_above':
                t_prev = target_series.shift(1) if isinstance(target_series, pd.Series) else target_series
                rule_mask = (ind_val > target_series) & (ind_val.shift(1) <= t_prev)
            elif operator == 'crosses_below':
                t_prev = target_series.shift(1) if isinstance(target_series, pd.Series) else target_series
                rule_mask = (ind_val < target_series) & (ind_val.shift(1) >= t_prev)
            else:
                rule_mask = pd.Series(True, index=df.index)

            rule_mask = rule_mask.fillna(False)

            if signal_type in ('buy', 'both'):
                buy_mask = buy_mask & rule_mask
            if signal_type in ('sell', 'both'):
                sell_mask = sell_mask & rule_mask

        return buy_mask, sell_mask

