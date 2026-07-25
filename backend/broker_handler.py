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
    
    # Range covering the weekend gap: Friday 10 July 18:00 UTC to Monday 13 July 04:00 UTC
    dt_from = datetime(2026, 7, 10, 18, 0, 0, tzinfo=timezone.utc)
    dt_to = datetime(2026, 7, 13, 4, 0, 0, tzinfo=timezone.utc)
    
    date_from = int(dt_from.timestamp())
    date_to = int(dt_to.timestamp())
    
    print(f"Analyzing weekend gap from {dt_from} ({date_from}) to {dt_to} ({date_to})...")

    def print_gap_info(broker_name, candles):
        if not candles:
            print(f"[{broker_name}] No candles returned.")
            return
        
        # Find the gap
        gap_index = -1
        for i in range(len(candles) - 1):
            time_diff = candles[i+1]["time"] - candles[i]["time"]
            if time_diff > 36000:  # Gap greater than 10 hours
                gap_index = i
                break
        
        if gap_index != -1:
            last_fri = candles[gap_index]
            first_sun = candles[gap_index + 1]
            last_fri_dt = datetime.fromtimestamp(last_fri["time"], timezone.utc)
            first_sun_dt = datetime.fromtimestamp(first_sun["time"], timezone.utc)
            print(f"[{broker_name}] Friday Last Candle: {last_fri_dt} (timestamp: {last_fri['time']}), Close: {last_fri['close']}")
            print(f"[{broker_name}] Sunday First Candle: {first_sun_dt} (timestamp: {first_sun['time']}), Open: {first_sun['open']}")
        else:
            print(f"[{broker_name}] Could not find weekend gap in {len(candles)} candles.")
            if len(candles) > 0:
                print(f"  First: {datetime.fromtimestamp(candles[0]['time'], timezone.utc)}")
                print(f"  Last: {datetime.fromtimestamp(candles[-1]['time'], timezone.utc)}")

    print("\nFetching MetaTrader...")
    try:
        mt_handler = BrokerHandler.get_handler("metatrader")
        mt_candles = mt_handler.fetch_candles("EURUSD", "15m", limit=1000, date_from=date_from, date_to=date_to)
        print_gap_info("MetaTrader", mt_candles)
    except Exception as e:
        print(f"Error: {e}")

    print("\nFetching cTrader...")
    try:
        ct_handler = BrokerHandler.get_handler("ctrader")
        ct_candles = ct_handler.fetch_candles("EURUSD", "15m", limit=1000, date_from=date_from, date_to=date_to)
        print_gap_info("cTrader", ct_candles)
    except Exception as e:
        print(f"Error: {e}")

