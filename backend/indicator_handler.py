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
        typical_price = (df[high_col] + df[low_col] + df[close_col]) / 3.0
        cum_pv = (typical_price * df[vol_col]).cumsum()
        cum_vol = df[vol_col].cumsum()
        return cum_pv / cum_vol.replace(0, np.nan)

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
            "atr": {
                "name": "Average True Range",
                "params": {
                    "period": {"type": "int", "default": 14, "min": 1},
                    "smoothing": {"type": "select", "default": "rma", "options": ["rma", "sma", "ema", "wma"]}
                }
            },
            "sma": {
                "name": "Simple Moving Average",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1},
                    "column": {"type": "string", "default": "close"}
                }
            },
            "ema": {
                "name": "Exponential Moving Average",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1},
                    "column": {"type": "string", "default": "close"}
                }
            },
            "wma": {
                "name": "Weighted Moving Average",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1},
                    "column": {"type": "string", "default": "close"}
                }
            },
            "rma": {
                "name": "Wilder's Smoothing",
                "params": {
                    "period": {"type": "int", "default": 14, "min": 1},
                    "column": {"type": "string", "default": "close"}
                }
            },
            "rsi": {
                "name": "Relative Strength Index",
                "params": {
                    "period": {"type": "int", "default": 14, "min": 1},
                    "column": {"type": "string", "default": "close"},
                    "smoothing": {"type": "select", "default": "rma", "options": ["rma", "sma", "ema", "wma"]}
                }
            },
            "macd": {
                "name": "MACD",
                "params": {
                    "fast_period": {"type": "int", "default": 12, "min": 1},
                    "slow_period": {"type": "int", "default": 26, "min": 1},
                    "signal_period": {"type": "int", "default": 9, "min": 1},
                    "column": {"type": "string", "default": "close"}
                }
            },
            "bollinger_bands": {
                "name": "Bollinger Bands",
                "params": {
                    "period": {"type": "int", "default": 20, "min": 1},
                    "std_dev": {"type": "float", "default": 2.0, "min": 0.1},
                    "column": {"type": "string", "default": "close"}
                }
            },
            "vwap": {
                "name": "Volume Weighted Average Price",
                "params": {
                    "high_col": {"type": "string", "default": "high"},
                    "low_col": {"type": "string", "default": "low"},
                    "close_col": {"type": "string", "default": "close"},
                    "vol_col": {"type": "string", "default": "volume"}
                }
            },
            "fvg": {
                "name": "Fair Value Gaps",
                "params": {}
            },
            "vsa": {
                "name": "Volume Spread Analysis",
                "params": {
                    "lookback": {"type": "int", "default": 20, "min": 1}
                }
            },
            "weis_wave": {
                "name": "Weis Wave Volume",
                "params": {}
            }
        }
