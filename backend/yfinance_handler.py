import yfinance as yf
import pandas as pd
import time

class YFinanceHandler:
    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000) -> list:
        # Map timeframe to yfinance intervals
        tf_map = {
            '1m': '1m',
            '3m': '2m',
            '5m': '5m',
            '15m': '15m',
            '30m': '30m',
            '1h': '60m',
            '2h': '90m',
            '4h': '60m',
            '1d': '1d'
        }
        yf_interval = tf_map.get(timeframe, '15m')
        
        # Clean symbol for yfinance
        yf_symbol = symbol.upper()
        if yf_symbol == 'BTCUSD':
            yf_symbol = 'BTC-USD'
        elif yf_symbol == 'ETHUSD':
            yf_symbol = 'ETH-USD'
        elif len(yf_symbol) == 6: # Forex
            yf_symbol = f"{yf_symbol}=X"
            
        period = '1mo'
        if yf_interval == '1d':
            period = '5y' if limit > 1000 else '2y'
        elif yf_interval in ['60m', '90m']:
            period = '730d'
        elif yf_interval in ['15m', '30m']:
            period = '60d'
        elif yf_interval in ['1m', '2m', '5m']:
            period = '7d'
            
        try:
            ticker = yf.Ticker(yf_symbol)
            df = ticker.history(period=period, interval=yf_interval)
            if df.empty:
                return []
                
            if len(df) > limit:
                df = df.tail(limit)
                
            candles = []
            for idx, row in df.iterrows():
                ts = int(idx.timestamp())
                candles.append({
                    "time": ts,
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "volume": float(row['Volume'])
                })
            return candles
        except Exception as e:
            print(f"yfinance fetch error for {yf_symbol}: {e}", flush=True)
            return []

    @staticmethod
    def get_symbols() -> list:
        return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]

    @staticmethod
    def get_timeframes() -> list:
        return ["1m", "5m", "15m", "30m", "1h", "1d"]
