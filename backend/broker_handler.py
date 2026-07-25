from metatrader_handler import MetaTraderHandler
from ctrader_handler import CTraderHandler
import json

class BrokerHandler:
    @staticmethod
    def get_handler(broker_name: str):
        if not broker_name:
            return MetaTraderHandler
        
        name_lower = broker_name.lower()
        if "ctrader" in name_lower or "c-trader" in name_lower:
            return CTraderHandler
        return MetaTraderHandler

if __name__ == '__main__':
    # Fetch candles from both sides and save to separate JSON files
    import os
    from datetime import datetime
    
    # Target: 14 July 2026 08:00:00 Local/UTC (using timezone-naive for now)
    dt_from = datetime(2026, 7, 14, 8, 0, 0)
    date_from = int(dt_from.timestamp())
    print(f"Fetching candles starting from {dt_from} (timestamp: {date_from})...")

    print("Fetching candles from MetaTrader...")
    try:
        mt_handler = BrokerHandler.get_handler("metatrader")
        mt_candles = mt_handler.fetch_candles("EURUSD", "15m", limit=10, date_from=date_from)
        with open("mt_candles.json", "w") as f:
            json.dump(mt_candles, f, indent=4)
        print("MetaTrader candles saved to mt_candles.json")
    except Exception as e:
        print(f"Error fetching MetaTrader candles: {e}")

    print("Fetching candles from cTrader...")
    try:
        ct_handler = BrokerHandler.get_handler("ctrader")
        ct_candles = ct_handler.fetch_candles("EURUSD", "15m", limit=10, date_from=date_from)
        with open("ct_candles.json", "w") as f:
            json.dump(ct_candles, f, indent=4)
        print("cTrader candles saved to ct_candles.json")
    except Exception as e:
        print(f"Error fetching cTrader candles: {e}")
