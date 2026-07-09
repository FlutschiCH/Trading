import random
from datetime import datetime, timedelta

class CandlesHandler:
    def __init__(self):
        pass

    def get_historical_candles(self, symbol="BTCUSDT", interval="15m", limit=100):
        # Generate mock candles starting from limit intervals ago up to now
        candles = []
        current_time = datetime.utcnow()
        
        # Determine timedelta step based on interval
        if interval == "1m":
            step = timedelta(minutes=1)
        elif interval == "5m":
            step = timedelta(minutes=5)
        elif interval == "15m":
            step = timedelta(minutes=15)
        elif interval == "1h":
            step = timedelta(hours=1)
        else:
            step = timedelta(days=1)
            
        start_time = current_time - (step * limit)
        
        # Base price depending on symbol
        if "ETH" in symbol:
            price = 3120.00
        elif "SOL" in symbol:
            price = 142.50
        elif "ADA" in symbol:
            price = 0.38
        else:
            price = 57400.00
            
        random.seed(42)  # Seed for deterministic mock data
        
        for i in range(limit):
            candle_time = start_time + (step * i)
            change = random.uniform(-0.015, 0.017) * price
            o = price
            c = price + change
            h = max(o, c) + random.uniform(0, 0.005) * price
            l = min(o, c) - random.uniform(0, 0.005) * price
            v = random.uniform(10, 500)
            
            candles.append({
                "time": int(candle_time.timestamp()),
                "open": round(o, 2),
                "high": round(h, 2),
                "low": round(l, 2),
                "close": round(c, 2),
                "volume": round(v, 2)
            })
            price = c
            
        return candles
