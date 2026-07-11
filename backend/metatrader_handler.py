import MetaTrader5 as mt5

class MetaTraderHandler:
    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> list:
        """
        Initializes connection to MT5, fetches historical candles for the given symbol/timeframe, and shuts down.
        """
        # Initialize MT5
        if not mt5.initialize(login=int(login), password=password, server=server):
            error_code, error_desc = mt5.last_error()
            print(f"MT5 Initialization failed: error code {error_code}, desc: {error_desc}", flush=True)
            return []

        # Map timeframe string to MT5 timeframe constants
        tf_map = {
            '1m': mt5.TIMEFRAME_M1,
            '3m': mt5.TIMEFRAME_M3,
            '5m': mt5.TIMEFRAME_M5,
            '15m': mt5.TIMEFRAME_M15,
            '30m': mt5.TIMEFRAME_M30,
            '1h': mt5.TIMEFRAME_H1,
            '2h': mt5.TIMEFRAME_H2,
            '4h': mt5.TIMEFRAME_H4,
            '6h': mt5.TIMEFRAME_H6,
            '8h': mt5.TIMEFRAME_H8,
            '12h': mt5.TIMEFRAME_H12,
            '1d': mt5.TIMEFRAME_D1,
        }
        mt5_tf = tf_map.get(timeframe, mt5.TIMEFRAME_M15)

        # Match symbol (e.g. EURUSD -> EURUSD.m or similar suffix support)
        symbols = mt5.symbols_get()
        matched_symbol = symbol
        if symbols:
            symbol_names = [s.name for s in symbols]
            if symbol not in symbol_names:
                for s in symbol_names:
                    if symbol.upper() in s.upper():
                        matched_symbol = s
                        break

        # Select symbol in Market Watch
        mt5.symbol_select(matched_symbol, True)

        # Copy rates
        rates = mt5.copy_rates_from_pos(matched_symbol, mt5_tf, 0, limit)
        mt5.shutdown() # Shutdown connection

        if rates is None or len(rates) == 0:
            print(f"Failed to copy rates for {matched_symbol}", flush=True)
            return []

        # Convert to standard Candle format dicts
        candles = []
        for r in rates:
            candles.append({
                "time": int(r['time']),
                "open": float(r['open']),
                "high": float(r['high']),
                "low": float(r['low']),
                "close": float(r['close']),
                "volume": float(r['tick_volume'])
            })

        return candles
