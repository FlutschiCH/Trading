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
    from datetime import datetime, timezone
    
    # Thursday July 9 00:00 UTC to Tuesday July 14 00:00 UTC
    dt_from = datetime(2026, 7, 9, 0, 0, 0, tzinfo=timezone.utc)
    dt_to = datetime(2026, 7, 14, 0, 0, 0, tzinfo=timezone.utc)
    
    date_from = int(dt_from.timestamp())
    date_to = int(dt_to.timestamp())
    
    print(f"Calibrating offset using range: {dt_from} to {dt_to}")

    # Fetch raw MT5 candles by bypassing the offset.
    # Since we cannot easily bypass the offset in metatrader_handler without editing it,
    # let's fetch MetaTrader candles using fetch_candles, and we will also print its internal calculated offset.
    print("\nFetching MetaTrader...")
    try:
        mt_handler = BrokerHandler.get_handler("metatrader")
        # To get the raw MT5 rates, let's look at what the handler returns
        mt_candles = mt_handler.fetch_candles("EURUSD", "15m", limit=2000, date_from=date_from, date_to=date_to)
        
        # Let's print the first few and last few candles to see what we got
        if mt_candles:
            print(f"MetaTrader returned {len(mt_candles)} candles.")
            print(f"First candle: {datetime.fromtimestamp(mt_candles[0]['time'], timezone.utc)}")
            print(f"Last candle: {datetime.fromtimestamp(mt_candles[-1]['time'], timezone.utc)}")
            
            # Find the gap
            for i in range(len(mt_candles) - 1):
                diff = mt_candles[i+1]['time'] - mt_candles[i]['time']
                if diff > 36000:
                    print(f"MetaTrader Weekend Gap found:")
                    print(f"  Before Gap: {datetime.fromtimestamp(mt_candles[i]['time'], timezone.utc)} (timestamp: {mt_candles[i]['time']})")
                    print(f"  After Gap:  {datetime.fromtimestamp(mt_candles[i+1]['time'], timezone.utc)} (timestamp: {mt_candles[i+1]['time']})")
        else:
            print("MetaTrader returned no candles.")
    except Exception as e:
        print(f"Error: {e}")

    print("\nFetching cTrader...")
    try:
        ct_handler = BrokerHandler.get_handler("ctrader")
        ct_candles = ct_handler.fetch_candles("EURUSD", "15m", limit=2000, date_from=date_from, date_to=date_to)
        if ct_candles:
            print(f"cTrader returned {len(ct_candles)} candles.")
            print(f"First candle: {datetime.fromtimestamp(ct_candles[0]['time'], timezone.utc)}")
            print(f"Last candle: {datetime.fromtimestamp(ct_candles[-1]['time'], timezone.utc)}")
            
            for i in range(len(ct_candles) - 1):
                diff = ct_candles[i+1]['time'] - ct_candles[i]['time']
                if diff > 36000:
                    print(f"cTrader Weekend Gap found:")
                    print(f"  Before Gap: {datetime.fromtimestamp(ct_candles[i]['time'], timezone.utc)} (timestamp: {ct_candles[i]['time']})")
                    print(f"  After Gap:  {datetime.fromtimestamp(ct_candles[i+1]['time'], timezone.utc)} (timestamp: {ct_candles[i+1]['time']})")
    except Exception as e:
        print(f"Error: {e}")

