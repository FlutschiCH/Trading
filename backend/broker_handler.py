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
    import json
    from sql_handler import SQLHandler
    from strategy_handler import StrategyHandler

    # Load backtest settings from DB
    print("Loading settings from Database...")
    symbol = "EURUSD"
    timeframe = "15m"
    db_settings = {}

    try:
        # Load from backtest_settings table
        rows = SQLHandler.execute_query("SELECT * FROM backtest_settings LIMIT 1")
        if rows:
            db_settings = json.loads(rows[0]['settings_json'])
            symbol = rows[0].get('symbol', symbol)
            timeframe = rows[0].get('timeframe', timeframe)
            print(f"Loaded DB settings for {symbol} ({timeframe}): {json.dumps(db_settings, indent=2)}")
        else:
            print("No settings found in backtest_settings table.")
    except Exception as e:
        print(f"Error reading settings from DB: {e}")

    # Map settings keys
    sl_val = float(db_settings.get('slVal', 1.0))
    sl_type = db_settings.get('slType', 'pct')
    rr = float(db_settings.get('rr', 2.0))
    size = float(db_settings.get('size', 1.0))
    initial_balance = float(db_settings.get('initialBalance', 10000.0))
    use_risk_sizing = bool(db_settings.get('useRiskSizing', False))
    risk_pct = float(db_settings.get('riskPct', 1.0))
    use_break_even = bool(db_settings.get('useBreakEven', False))
    be_trigger_r = float(db_settings.get('beTriggerR', 1.0))
    lookback_window = int(db_settings.get('lookbackWindow', 20))
    fees_percent = float(db_settings.get('feesPercent', 0.0))
    daily_retry_limit = int(db_settings.get('dailyRetryLimit', 0))
    allow_opposite_close = bool(db_settings.get('allowOppositeClose', True))
    timezone_val = db_settings.get('timezone', 'Local')
    sessions = db_settings.get('sessions', [])
    use_global_close = bool(db_settings.get('useGlobalClose', False))
    global_close_time = db_settings.get('globalCloseTime', '')
    entry_stability_rule = db_settings.get('entryStabilityRule', 'default')

    # Target start time: 14 July 2026 09:00:00 UTC
    dt_from = datetime(2026, 7, 14, 9, 0, 0, tzinfo=timezone.utc)
    date_from = int(dt_from.timestamp())
    print(f"\nFetching historical candles starting from {dt_from} (timestamp: {date_from})...")

    # 1. MetaTrader Backtest
    print("\n[MetaTrader] Fetching candles...")
    try:
        mt_handler = BrokerHandler.get_handler("metatrader")
        mt_candles = mt_handler.fetch_candles(symbol, timeframe, limit=1000, date_from=date_from)
        if mt_candles:
            print(f"[MetaTrader] Running backtest with {len(mt_candles)} candles...")
            mt_result = StrategyHandler.run_backtest(
                candles=mt_candles,
                symbol=symbol,
                sl_val=sl_val,
                sl_type=sl_type,
                rr=rr,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=use_break_even,
                be_trigger_r=be_trigger_r,
                lookback_window=lookback_window,
                fees_percent=fees_percent,
                daily_retry_limit=daily_retry_limit,
                allow_opposite_close=allow_opposite_close,
                date_from=date_from,
                timezone=timezone_val,
                sessions=sessions,
                use_global_close=use_global_close,
                global_close_time=global_close_time,
                entry_stability_rule=entry_stability_rule,
                broker="metatrader"
            )
            summary = mt_result.get("data", {}).get("summary", {})
            print(f"[MetaTrader Backtest Result] Final Balance: {summary.get('final_balance')}, Total Trades: {summary.get('total_trades')}")
        else:
            print("[MetaTrader] No candles fetched.")
    except Exception as e:
        print(f"MetaTrader Backtest Error: {e}")

    # 2. cTrader Backtest
    print("\n[cTrader] Fetching candles...")
    try:
        ct_handler = BrokerHandler.get_handler("ctrader")
        ct_candles = ct_handler.fetch_candles(symbol, timeframe, limit=1000, date_from=date_from)
        if ct_candles:
            print(f"[cTrader] Running backtest with {len(ct_candles)} candles...")
            ct_result = StrategyHandler.run_backtest(
                candles=ct_candles,
                symbol=symbol,
                sl_val=sl_val,
                sl_type=sl_type,
                rr=rr,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=use_break_even,
                be_trigger_r=be_trigger_r,
                lookback_window=lookback_window,
                fees_percent=fees_percent,
                daily_retry_limit=daily_retry_limit,
                allow_opposite_close=allow_opposite_close,
                date_from=date_from,
                timezone=timezone_val,
                sessions=sessions,
                use_global_close=use_global_close,
                global_close_time=global_close_time,
                entry_stability_rule=entry_stability_rule,
                broker="ctrader"
            )
            summary = ct_result.get("data", {}).get("summary", {})
            print(f"[cTrader Backtest Result] Final Balance: {summary.get('final_balance')}, Total Trades: {summary.get('total_trades')}")
        else:
            print("[cTrader] No candles fetched.")
    except Exception as e:
        print(f"cTrader Backtest Error: {e}")



