import time
import threading
import traceback
from datetime import datetime, timezone as pytimezone
from live_strategy_handler import LiveStrategyHandler
from indicator_handler import IndicatorHandler
from trading_handler import TradingHandler
from backtest_helpers import get_pip_size, get_lot_size, is_datetime_in_sessions
from logger_handler import logPrint
from wyckoff_handler import WyckoffHandler


def calculate_date_bounds(option: str, custom_from: str = None, custom_to: str = None):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    
    if option == 'last_candles':
        return None, None
        
    if option == 'this_week':
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp()), int(now.timestamp())
        
    if option == 'last_week':
        this_week_start = now - timedelta(days=now.weekday())
        this_week_start = this_week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        start = this_week_start - timedelta(days=7)
        return int(start.timestamp()), int(this_week_start.timestamp())
        
    if option == 'this_month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp()), int(now.timestamp())
        
    if option == 'last_month':
        first_day_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_last_month = first_day_this_month - timedelta(seconds=1)
        start = last_day_last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp()), int(last_day_last_month.timestamp())
        
    if option == 'custom' and custom_from and custom_to:
        try:
            def parse_dt(s):
                s = s.replace('Z', '').split('.')[0]
                for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                    try:
                        dt = datetime.strptime(s, fmt)
                        return dt.replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                raise ValueError(f"Unknown format: {s}")
            start = parse_dt(custom_from)
            end = parse_dt(custom_to)
            return int(start.timestamp()), int(end.timestamp())
        except Exception as e:
            print(f"Error parsing custom dates: {e}", flush=True)
            
    if option == 'from_start_date' and custom_from:
        try:
            def parse_dt(s):
                s = s.replace('Z', '').split('.')[0]
                for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                    try:
                        dt = datetime.strptime(s, fmt)
                        return dt.replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                raise ValueError(f"Unknown format: {s}")
            start = parse_dt(custom_from)
            return int(start.timestamp()), None
        except Exception as e:
            print(f"Error parsing custom from date: {e}", flush=True)
            
    return None, None

class LiveRunner:
    _thread = None
    _stop_event = threading.Event()
    # Cache to store last processed candle timestamp per strategy
    _last_processed = {} 
    # In-memory cache to store full candle history per strategy
    _candles_cache = {}
    # In-memory cache to store simulated trades per strategy
    _trades_cache = {}

    @classmethod
    def start(cls):
        if cls._thread and cls._thread.is_alive():
            print("[Live Runner] Already running.", flush=True)
            return
        cls._stop_event.clear()
        cls._thread = threading.Thread(target=cls._run_loop, daemon=True)
        cls._thread.start()
        logPrint("Started background execution thread.", category="LiveRunner", level="INFO")

    @classmethod
    def stop(cls):
        cls._stop_event.set()
        if cls._thread:
            cls._thread.join(timeout=5)
            logPrint("Stopped background execution thread.", category="LiveRunner", level="INFO")

    @classmethod
    def _run_loop(cls):
        while not cls._stop_event.is_set():
            try:
                # Get active strategies
                import socket
                try:
                    comp_name = socket.gethostname().strip().lower()
                except:
                    comp_name = "unknown"

                strategies = LiveStrategyHandler.get_all_strategies()
                active_strategies = []
                for s in strategies:
                    if s.get("status") == "active":
                        target = s.get("target_computer", "All")
                        if target == "All" or target.strip().lower() == comp_name:
                            active_strategies.append(s)

                for strategy in active_strategies:
                    if cls._stop_event.is_set():
                        break
                    try:
                        cls._evaluate_strategy(strategy)
                    except Exception as e:
                        logPrint(f"Error evaluating strategy {strategy.get('id')}: {e}", category="LiveRunner", level="ERROR")
                        traceback.print_exc()

            except Exception as e:
                logPrint(f"Error in loop: {e}", category="LiveRunner", level="ERROR")

            # Wait 15 seconds before checking again
            cls._stop_event.wait(15)

    @classmethod
    def _evaluate_strategy(cls, strategy: dict):
        strategy_id = strategy["id"]
        symbol = strategy["symbol"]
        timeframe = strategy["timeframe"]
        lookback = strategy["lookbackWindow"]
        broker_name = strategy.get("broker", "metatrader")

        from live_strategy_handler import LiveStrategyHandler
        from broker_handler import BrokerHandler
        handler = BrokerHandler.get_handler(broker_name)
        # print(f"[Live Runner DEBUG] Resolved handler for broker '{broker_name}': {handler.__name__ if handler else 'None'}", flush=True)

        cached_candles = cls._candles_cache.get(strategy_id, [])
        
        opt = strategy.get("dateRangeOption", "last_candles")
        custom_from = strategy.get("customFrom") or ""
        custom_to = strategy.get("customTo") or ""
        limit = strategy.get("candleLimit", 5000)

        # If cache exists, verify configuration hasn't changed.
        if cached_candles:
            # Check if any config parameter changed compared to what is currently cached
            if not hasattr(cls, '_cache_configs'):
                cls._cache_configs = {}
            prev_config = cls._cache_configs.get(strategy_id)
            curr_config = (symbol, timeframe, lookback, broker_name, opt, custom_from, custom_to, limit)
            if prev_config != curr_config:
                print(f"[Live Runner] Strategy {strategy_id} configuration changed from {prev_config} to {curr_config}. Clearing cache.", flush=True)
                cached_candles = []
                cls._candles_cache[strategy_id] = []
                cls._cache_configs[strategy_id] = curr_config
        else:
            if not hasattr(cls, '_cache_configs'):
                cls._cache_configs = {}
            cls._cache_configs[strategy_id] = (symbol, timeframe, lookback, broker_name, opt, custom_from, custom_to, limit)

        strat_acc_id = strategy.get("account_id")
        if not strat_acc_id and strategy.get("targets"):
            targets = strategy.get("targets")
            if isinstance(targets, list) and len(targets) > 0:
                strat_acc_id = targets[0].get("account_id")

        if not cached_candles:
            # First fetch: warm up using backtest settings saved in strategy configuration
            opt = strategy.get("dateRangeOption", "last_candles")
            custom_from = strategy.get("customFrom")
            custom_to = strategy.get("customTo")
            limit = strategy.get("candleLimit", 5000)

            date_from, date_to = calculate_date_bounds(opt, custom_from, custom_to)
            
            strat_name = strategy.get("name") or strategy_id
            raw_targets = strategy.get("targets", [])
            if isinstance(raw_targets, list) and len(raw_targets) > 0:
                targets_formatted = ", ".join([f"{t.get('broker', broker_name)} (Account: {t.get('account_id', 'N/A')})" for t in raw_targets])
            else:
                targets_formatted = f"{broker_name} (Account: {strat_acc_id or 'default'})"

            params_formatted = (
                f"SL={strategy.get('slVal')}{strategy.get('slType')}, RR={strategy.get('rr')}, "
                f"Size={strategy.get('size')}, RiskSizing={strategy.get('useRiskSizing')}({strategy.get('riskPct')}%), "
                f"BreakEven={strategy.get('useBreakEven')}({strategy.get('beTriggerR')}R), Lookback={lookback}, "
                f"Rule={strategy.get('entryStabilityRule', 'default')}"
            )

            print(
                f"\n[Live Runner] 🚀 Starting Strategy Execution:\n"
                f"   • Strategy: '{strat_name}' (ID: {strategy_id})\n"
                f"   • Symbol / Timeframe: {symbol} ({timeframe})\n"
                f"   • Source Broker: {broker_name}\n"
                f"   • Target(s): {targets_formatted}\n"
                f"   • Parameters: {params_formatted}\n",
                flush=True
            )
            
            print(f"[Live Runner] Warm-up: Fetching candles for strategy {strategy_id} ({symbol} {timeframe}) from broker='{broker_name}' (Account ID: '{strat_acc_id}') using backtest settings: opt={opt}, limit={limit}, date_from={date_from}, date_to={date_to}", flush=True)
            candles = handler.fetch_candles(
                symbol=symbol,
                timeframe=timeframe,
                limit=limit,
                date_from=date_from,
                date_to=date_to,
                login=strat_acc_id,
                account_id=strat_acc_id
            )
            print(f"[Live Runner DEBUG] Warm-up: Fetch returned {len(candles) if candles else 0} candles for strategy {strategy_id} (Broker: '{broker_name}', Account ID: '{strat_acc_id}')", flush=True)
            if candles:
                # Run backtest logic to initialize candles and trades cache
                from strategy_handler import StrategyHandler
                backtest_res = StrategyHandler.run_backtest(
                    candles=candles,
                    symbol=symbol,
                    sl_val=strategy["slVal"],
                    sl_type=strategy["slType"],
                    rr=strategy["rr"],
                    size=strategy["size"],
                    initial_balance=strategy.get("initialBalance", 10000.0),
                    use_risk_sizing=strategy["useRiskSizing"],
                    risk_pct=strategy["riskPct"],
                    use_break_even=strategy.get("useBreakEven", False),
                    be_trigger_r=strategy.get("beTriggerR", 1.0),
                    lookback_window=lookback,
                    fees_percent=0.0,
                    daily_retry_limit=0,
                    allow_opposite_close=True,
                    date_from=date_from,
                    date_to=date_to,
                    timezone=strategy.get("timezone", "Local"),
                    sessions=strategy.get("sessions", []),
                    use_global_close=strategy.get("useGlobalClose", False),
                    global_close_time=strategy.get("globalCloseTime", ""),
                    entry_stability_rule=strategy.get("entryStabilityRule", "default"),
                    broker=broker_name
                )
                annotated_candles = backtest_res.get("candles", [])
                cls._candles_cache[strategy_id] = annotated_candles
                cls._trades_cache[strategy_id] = backtest_res.get("trades", [])
            else:
                annotated_candles = []
        else:
            # Incremental fetch: fetch the last 10 candles and append/merge into full historical cache
            # print(f"[Live Runner] Incremental fetch: Fetching candles for strategy {strategy_id} ({symbol} {timeframe}) from broker='{broker_name}' (Account ID: '{strat_acc_id}')", flush=True)
            new_candles = handler.fetch_candles(
                symbol=symbol,
                timeframe=timeframe,
                limit=10,
                login=strat_acc_id,
                account_id=strat_acc_id
            )
            if new_candles:
                # Merge new raw candles with the entire cached history to maintain full 5,000 candle context
                merge_map = {c["time"]: c for c in cached_candles}
                for c in new_candles:
                    merge_map[c["time"]] = c
                
                sorted_times = sorted(merge_map.keys())
                # Cap full history at 5000 candles
                if len(sorted_times) > 5000:
                    sorted_times = sorted_times[-5000:]
                
                full_history = [merge_map[t] for t in sorted_times]
                
                # Analyze the full 5,000 candle history so rolling indicators, SMAs, and Wyckoff states match full backtest exactly
                annotated_candles = WyckoffHandler.analyze_wyckoff_structure(full_history, lookback=lookback)
                cls._candles_cache[strategy_id] = annotated_candles
            else:
                annotated_candles = cached_candles

        if not annotated_candles or len(annotated_candles) < lookback + 10:
            LiveStrategyHandler.update_strategy_state(strategy_id, {
                "stage": "UNKNOWN",
                "status_message": "Error: Failed to fetch candles or insufficient candles.",
                "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            return

        # Run trade evaluation logic to determine signals on the last completed candle
        should_buy, should_sell, state_info = cls._evaluate_signals(annotated_candles, strategy)

        # Keep a history of the last 5000 annotated candles to store in live_state in DB
        recent_candles = annotated_candles[-5000:] if len(annotated_candles) > 5000 else annotated_candles
        state_info["candles"] = recent_candles

        # Persist the latest live state to the database
        LiveStrategyHandler.update_strategy_state(strategy_id, state_info)

        # Last completed candle is at index -2
        last_completed_candle = annotated_candles[-2]
        candle_time = int(last_completed_candle["time"])

        # Check if we have already processed this candle for this strategy
        if cls._last_processed.get(strategy_id) == candle_time:
            return

        # Mark candle as processed immediately to prevent duplicate triggers from rapid thread loops
        cls._last_processed[strategy_id] = candle_time

        if should_buy or should_sell:
            direction = "BUY" if should_buy else "SELL"
            close_price = last_completed_candle.get("close", 0)
            allow_opposite_close = strategy.get("allowOppositeClose", True)

            from discord_handler import send_discord_message
            discord_msg = (
                f"🚨 **New Trade Signal Detected!**\n"
                f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                f"📊 **Symbol:** `{symbol}`\n"
                f"⏱️ **Timeframe:** `{timeframe}`\n"
                f"➡️ **Direction:** `{direction}`\n"
                f"💵 **Price:** `{close_price:.5f}`\n"
                f"🔄 **Allow Opposite Close:** `{allow_opposite_close}`"
            )
            send_discord_message(discord_msg)

            # Log/Save signal to JSON file for analysis (ALWAYS logs all detected signals)
            try:
                import json, os
                signals_file = os.path.join(os.path.dirname(__file__), "live_signals.json")
                signals_data = []
                if os.path.exists(signals_file):
                    try:
                        with open(signals_file, "r", encoding="utf-8") as f:
                            signals_data = json.load(f)
                    except Exception:
                        signals_data = []
                
                signal_entry = {
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "strategy_id": strategy_id,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "direction": direction,
                    "price": close_price,
                    "allow_opposite_close": allow_opposite_close,
                    "candle": last_completed_candle,
                    "state_info": {k: v for k, v in state_info.items() if k != "candles"}
                }
                signals_data.append(signal_entry)
                with open(signals_file, "w", encoding="utf-8") as f:
                    json.dump(signals_data, f, indent=2, ensure_ascii=False)
                print(f"[Live Runner] Signal detected & logged to {signals_file}: {direction} on {symbol}", flush=True)
            except Exception as sig_err:
                print(f"[Live Runner] Failed to save signal to JSON: {sig_err}", flush=True)

            # Pass signal to trade executor (which checks each account position and allowOppositeClose individually)
            cls._execute_trade(strategy, should_buy, should_sell, last_completed_candle)
            
            # Append new simulated trade to cache
            new_trade = {
                "id": len(cls._trades_cache.get(strategy_id, [])) + 1,
                "type": direction,
                "entry_time": last_completed_candle["time"],
                "entry_price": last_completed_candle.get("close", 0.0),
                "status": "OPEN",
                "profit": 0.0
            }
            if strategy_id not in cls._trades_cache:
                cls._trades_cache[strategy_id] = []
            cls._trades_cache[strategy_id].append(new_trade)

    @classmethod
    def _evaluate_signals(cls, annotated_candles: list, strategy: dict) -> tuple:
        """
        Replicates the entry logic state machine of the backtester to get the state at the last completed candle.
        """
        entry_stability_rule = strategy.get("entryStabilityRule", "default")
        timezone = strategy.get("timezone", "Local")
        sessions = strategy.get("sessions", [])

        from strategy_handler import StrategyHandler
        state_dict = {}

        # We evaluate sequentially to build the state
        for i, c in enumerate(annotated_candles[:-1]):  # Stop at index -2 (the last completed candle)
            should_buy, should_sell, state_dict = StrategyHandler.evaluate_candle_signal(
                c=c,
                state=state_dict,
                entry_stability_rule=entry_stability_rule,
                timezone=timezone,
                sessions=sessions
            )

        accum_consec_bars = state_dict.get('accum_consec_bars', 0)
        dist_consec_bars = state_dict.get('dist_consec_bars', 0)
        pending_buy = state_dict.get('pending_buy', False)
        pending_sell = state_dict.get('pending_sell', False)
        spring_high = state_dict.get('spring_high', None)
        upthrust_low = state_dict.get('upthrust_low', None)
        pending_buy_age = state_dict.get('pending_buy_age', 0)
        pending_sell_age = state_dict.get('pending_sell_age', 0)

        # Build detailed status message and state info based on the final completed candle's state
        last_c = annotated_candles[-2] if len(annotated_candles) >= 2 else {}
        final_stage = last_c.get('wyckoff_stage', 'TRANSITION')
        final_consec = accum_consec_bars if final_stage == "ACCUMULATION" else (dist_consec_bars if final_stage == "DISTRIBUTION" else 0)

        status_message = "Waiting for setup..."
        if pending_buy:
            status_message = f"Spring detected. Waiting for confirmation/stability. Close must cross above high {spring_high:.5f} (Age: {pending_buy_age}/15)."
        elif pending_sell:
            status_message = f"Upthrust detected. Waiting for confirmation/stability. Close must cross below low {upthrust_low:.5f} (Age: {pending_sell_age}/15)."
        else:
            status_message = f"Market in {final_stage} stage. Monitoring for Spring/Upthrust."

        # Check session constraint for current time
        from live_strategy_handler import LiveStrategyHandler
        allowed, msg = LiveStrategyHandler.is_trading_allowed(strategy["id"])
        if not allowed:
            status_message = f"Outside trading hours: {msg}"

        state_info = {
            "stage": final_stage,
            "consec_bars": final_consec,
            "pending_buy": pending_buy,
            "pending_sell": pending_sell,
            "spring_high": spring_high,
            "upthrust_low": upthrust_low,
            "pending_buy_age": pending_buy_age,
            "pending_sell_age": pending_sell_age,
            "status_message": status_message,
            "last_candle_time": datetime.fromtimestamp(last_c.get('time')).strftime("%Y-%m-%d %H:%M:%S") if last_c.get('time') else None,
            "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "trades": cls._trades_cache.get(strategy["id"], [])
        }

        return should_buy, should_sell, state_info

    @classmethod
    def _execute_trade(cls, strategy: dict, should_buy: bool, should_sell: bool, last_candle: dict):
        symbol = strategy["symbol"]
        strategy_id = strategy["id"]
        magic = abs(hash(strategy_id)) & 0x7FFFFFFF
        cls.execute_trade_on_targets(strategy, symbol, last_candle, should_buy, should_sell, magic)
        
    @classmethod
    def execute_trade_on_targets(cls, strategy: dict, symbol: str, last_candle: dict, should_buy: bool, should_sell: bool, magic: str, debug=False):
        """
        Dispatches and executes trades across all target accounts assigned to the strategy.
        """
        strategy_id = strategy.get("id")
        targets = strategy.get("targets", [])
        if not targets:
            broker_name = strategy.get("broker", "metatrader")
            targets = [{"broker": broker_name, "account_id": strategy.get("account_id")}]
            
        from symbol_mapping_handler import SymbolMappingHandler
        strat_acc_id = strategy.get("account_id")
        base_symbol = SymbolMappingHandler.map_to_main(symbol, strat_acc_id)

        for target in targets:
            try:
                target_acc_id = target.get("account_id")
                target_broker = target.get("broker") or "metatrader"
                from metatrader_handler import MetaTraderHandler
                mt5_inst = MetaTraderHandler.get_mt5_instance(target_acc_id)
                target_kwargs = {
                    "account_id": target_acc_id,
                    "mt5_inst": mt5_inst
                }
                
                from broker_handler import BrokerHandler
                handler = BrokerHandler.get_handler(target_broker)

                # 1. Check if we already have open positions for this symbol on this target
                positions = handler.get_positions(**target_kwargs) or []
                allow_opposite_close = strategy.get("allowOppositeClose", True)
                direction = "BUY" if should_buy else "SELL"
                skip_entry = False

                if debug == False:
                    for p in positions:
                        pos_symbol = SymbolMappingHandler.map_to_main(p.get("symbol"), target_acc_id)
                        broker_symbol = SymbolMappingHandler.map_to_broker(pos_symbol, target_acc_id)
                        if pos_symbol == base_symbol:
                            pos_type = p.get("trade_side", "").upper()
                            is_opposite = (pos_type == "BUY" and should_sell) or (pos_type == "SELL" and should_buy)
                            if is_opposite:
                                if allow_opposite_close:
                                    print(f"[Live Runner] Opposite signal detected for target {target_acc_id} on {symbol}. Closing open {pos_type} position...", flush=True)
                                    try:
                                        pos_id = p.get("ticket") or p.get("id") or p.get("position_id")
                                        handler.close_position(pos_id, mt5_inst, broker_symbol)
                                        from discord_handler import send_discord_message
                                        send_discord_message(
                                            f"🔄 **Opposite Signal Position Closed**\n"
                                            f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                            f"📊 **Symbol:** `{symbol}`\n"
                                            f"🚫 **Closed Position:** `{pos_type}`"
                                        )
                                    except Exception as close_err:
                                        print(f"[Live Runner] Failed to close opposite position: {close_err}", flush=True)
                                else:
                                    print(f"[Live Runner] Opposite position open ({pos_type}) for target {target_acc_id} on {symbol}, but allowOppositeClose=False. Skipping entry.", flush=True)
                                    skip_entry = True
                            elif pos_type == direction:
                                print(f"[Live Runner] Position already open in same direction ({pos_type}) for target {target_acc_id} on {symbol}. Skipping entry.", flush=True)
                                skip_entry = True

                if skip_entry:
                    continue

                # 2. Get Account Info for sizing
                acct = handler.get_account_info(**target_kwargs)
                balance = None
                if acct:
                    if "data" in acct and isinstance(acct["data"], dict):
                        balance = acct["data"].get("balance")
                    elif isinstance(acct, dict):
                        balance = acct.get("balance")

                if balance is None or float(balance) <= 0:
                    print(f"[Live Runner] Could not retrieve valid account balance for target {target_acc_id}. Skipping execution.", flush=True)
                    from discord_handler import send_discord_message
                    send_discord_message(
                        f"⚠️ **Trade Execution Skipped (No Balance)!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"⚠️ **Error:** Account balance could not be retrieved from broker."
                    )
                    continue

                balance = float(balance)

                # 3. Calculate Trade Parameters
                entry_price = float(last_candle["close"])
                pip_size = get_pip_size(symbol, entry_price)
                lot_size = get_lot_size(symbol)

                params = TradingHandler.calculate_trade_parameters(
                    symbol=symbol,
                    entry_price=entry_price,
                    direction=direction,
                    sl_type=strategy["slType"],
                    sl_val=strategy["slVal"],
                    rr=strategy["rr"],
                    size=strategy["size"],
                    use_risk_sizing=strategy["useRiskSizing"],
                    risk_pct=strategy["riskPct"],
                    balance=balance,
                    lot_size=lot_size,
                    pip_size=pip_size,
                    precision=5
                )

                print(f"[Live Runner] Triggering {direction} order for target {target_acc_id} on {symbol}. Params: {params}", flush=True)

                # 4. Dispatch Order
                order_res = handler.create_order(
                    symbol=symbol,
                    side=direction,
                    volume=params["qty"],
                    price=params["entry_price"],
                    stop_loss=params["sl_price"],
                    take_profit=params["tp_price"],
                    magic=magic,
                    **target_kwargs
                )

                from discord_handler import send_discord_message
                if isinstance(order_res, dict) and order_res.get("status") in ("error", "failed"):
                    err_msg = order_res.get("message", "Unknown error")
                    print(f"[Live Runner] Order execution failed for target {target_acc_id} on {symbol}: {err_msg}", flush=True)
                    send_discord_message(
                        f"❌ **Broker Order Execution Failed!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"⚠️ **Error:** `{err_msg}`"
                    )
                else:
                    print(f"[Live Runner] Order successfully executed for target {target_acc_id} on {symbol}.", flush=True)
                    send_discord_message(
                        f"✅ **Real Trade Executed Successfully!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"📦 **Volume:** `{params['qty']}` | 💵 **Entry:** `{params['entry_price']:.5f}`\n"
                        f"🛑 **SL:** `{params['sl_price']:.5f}` | 🎯 **TP:** `{params['tp_price']:.5f}`"
                    )
            except Exception as target_err:
                print(f"[Live Runner] Error executing trade for target {target.get('account_id')}: {target_err}", flush=True)
                from discord_handler import send_discord_message
                send_discord_message(
                    f"❌ **Broker Order Exception!**\n"
                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                    f"🏦 **Target Account:** `{target.get('account_id')}`\n"
                    f"⚠️ **Exception:** `{str(target_err)}`"
                )


if __name__ == '__main__':
    from live_strategy_handler import LiveStrategyHandler
    from account_handler import AccountHandler

    strategies = LiveStrategyHandler.get_all_strategies()
    active_strategies = [s for s in strategies if s.get("status") == "active"]

    if not active_strategies:
        print("[Test] No active strategies found in database.")
    else:
        strat = active_strategies[0]
        active_acc = AccountHandler.get_active_account()
        if active_acc and not strat.get("account_id"):
            strat["account_id"] = active_acc.get("account_id")
            
        print(f"[Test] Strategy '{strat.get('name')}' (ID: {strat.get('id')}) loaded with targets: {strat.get('targets')}")
        
        # Fake candle for testing trade execution across targets
        fake_candle = {
            "time": int(time.time()),
            "open": 1.0850,
            "high": 1.0860,
            "low": 1.0840,
            "close": 1.0855
        }
        
        print("\n--- Running Fake Trade Execution Test Across Targets ---")
        LiveRunner.execute_trade_on_targets(
            strategy=strat,
            symbol=strat.get("symbol"),
            last_candle=fake_candle,
            should_buy=True,
            should_sell=False,
            magic=f"{int(time.time())}",
        )




