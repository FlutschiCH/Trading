import time
import threading
import traceback
from datetime import datetime, timezone as pytimezone
from live_strategy_handler import LiveStrategyHandler
from metatrader_handler import MetaTraderHandler, MT5_AVAILABLE
from indicator_handler import IndicatorHandler
from trading_handler import TradingHandler
from wyckoff_handler import WyckoffHandler
from backtest_helpers import get_pip_size, get_lot_size, is_datetime_in_sessions

class LiveRunner:
    _thread = None
    _stop_event = threading.Event()
    # Cache to store last processed candle timestamp per strategy
    _last_processed = {} 

    @classmethod
    def start(cls):
        if cls._thread and cls._thread.is_alive():
            print("[Live Runner] Already running.", flush=True)
            return
        cls._stop_event.clear()
        cls._thread = threading.Thread(target=cls._run_loop, daemon=True)
        cls._thread.start()
        print("[Live Runner] Started background execution thread.", flush=True)

    @classmethod
    def stop(cls):
        cls._stop_event.set()
        if cls._thread:
            cls._thread.join(timeout=5)
            print("[Live Runner] Stopped background execution thread.", flush=True)

    @classmethod
    def _run_loop(cls):
        while not cls._stop_event.is_set():
            try:
                # 1. Check MT5 connection
                if not MT5_AVAILABLE:
                    time.sleep(15)
                    continue

                import MetaTrader5 as mt5
                if not mt5.initialize():
                    time.sleep(15)
                    continue

                # 2. Get active strategies
                strategies = LiveStrategyHandler.get_all_strategies()
                active_strategies = [s for s in strategies if s.get("status") == "active"]

                for strategy in active_strategies:
                    if cls._stop_event.is_set():
                        break
                    try:
                        cls._evaluate_strategy(strategy)
                    except Exception as e:
                        print(f"[Live Runner] Error evaluating strategy {strategy.get('id')}: {e}", flush=True)
                        traceback.print_exc()

            except Exception as e:
                print(f"[Live Runner] Error in loop: {e}", flush=True)

            # Wait 15 seconds before checking again
            cls._stop_event.wait(15)

    @classmethod
    def _evaluate_strategy(cls, strategy: dict):
        strategy_id = strategy["id"]
        symbol = strategy["symbol"]
        timeframe = strategy["timeframe"]
        lookback = strategy["lookbackWindow"]

        from live_strategy_handler import LiveStrategyHandler

        # Fetch candles (300 candles is plenty for lookback and indicators)
        candles = MetaTraderHandler.fetch_candles(
            symbol=symbol,
            timeframe=timeframe,
            limit=300
        )
        if not candles or len(candles) < lookback + 10:
            LiveStrategyHandler.update_strategy_state(strategy_id, {
                "stage": "UNKNOWN",
                "status_message": "Error: Failed to fetch candles or insufficient candles.",
                "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
            return

        # Run Wyckoff Analysis on all fetched candles
        annotated_candles = WyckoffHandler.analyze_wyckoff_structure(candles, lookback=lookback)

        # Run trade evaluation logic to determine signals on the last completed candle
        should_buy, should_sell, state_info = cls._evaluate_signals(annotated_candles, strategy)

        # Persist the latest live state to the database
        LiveStrategyHandler.update_strategy_state(strategy_id, state_info)

        # Last completed candle is at index -2
        last_completed_candle = candles[-2]
        candle_time = int(last_completed_candle["time"])

        # Check if we have already processed this candle for this strategy
        if cls._last_processed.get(strategy_id) == candle_time:
            return

        print(f"[Live Runner] New candle detected for strategy {strategy_id} ({symbol} {timeframe}) at {datetime.fromtimestamp(candle_time)}", flush=True)

        if should_buy or should_sell:
            cls._execute_trade(strategy, should_buy, should_sell, last_completed_candle)

        # Mark as processed
        cls._last_processed[strategy_id] = candle_time

    @classmethod
    def _evaluate_signals(cls, annotated_candles: list, strategy: dict) -> tuple:
        """
        Replicates the entry logic state machine of the backtester to get the state at the last completed candle.
        """
        entry_stability_rule = strategy.get("entryStabilityRule", "default")
        timezone = strategy.get("timezone", "Local")
        sessions = strategy.get("sessions", [])

        pending_buy = False
        pending_sell = False
        spring_high = None
        upthrust_low = None
        pending_buy_age = 0
        pending_sell_age = 0
        accum_consec_bars = 0
        dist_consec_bars = 0

        # We evaluate sequentially to build the state
        for i, c in enumerate(annotated_candles[:-1]):  # Stop at index -2 (the last completed candle)
            wyckoff_sig = c.get('wyckoff_signal')
            stage = c.get('wyckoff_stage', 'TRANSITION')

            if stage == "ACCUMULATION":
                accum_consec_bars += 1
            else:
                accum_consec_bars = 0

            if stage == "DISTRIBUTION":
                dist_consec_bars += 1
            else:
                dist_consec_bars = 0

            if pending_buy:
                pending_buy_age += 1
                if pending_buy_age > 15:
                    pending_buy = False

            if pending_sell:
                pending_sell_age += 1
                if pending_sell_age > 15:
                    pending_sell = False

            if wyckoff_sig == "Spring detected":
                pending_buy = True
                spring_high = float(c.get('high', 0))
                pending_buy_age = 0
                pending_sell = False

            if wyckoff_sig == "Upthrust detected":
                pending_sell = True
                upthrust_low = float(c.get('low', 0))
                pending_sell_age = 0
                pending_buy = False

            should_buy = False
            should_sell = False

            if pending_buy:
                duration_ok = True
                if entry_stability_rule in ('duration', 'both'):
                    duration_ok = (accum_consec_bars >= 3)
                confirmation_ok = True
                if entry_stability_rule in ('confirmation', 'both'):
                    confirmation_ok = (float(c.get('close', 0)) > spring_high)

                if duration_ok and confirmation_ok:
                    if stage != "DISTRIBUTION":
                        should_buy = True
                        pending_buy = False
                if wyckoff_sig == "Upthrust detected" or stage == "DISTRIBUTION":
                    pending_buy = False

            if pending_sell:
                duration_ok = True
                if entry_stability_rule in ('duration', 'both'):
                    duration_ok = (dist_consec_bars >= 3)
                confirmation_ok = True
                if entry_stability_rule in ('confirmation', 'both'):
                    confirmation_ok = (float(c.get('close', 0)) < upthrust_low)

                if duration_ok and confirmation_ok:
                    if stage != "ACCUMULATION":
                        should_sell = True
                        pending_sell = False
                if wyckoff_sig == "Spring detected" or stage == "ACCUMULATION":
                    pending_sell = False

            # Check session constraints for the candle time
            c_time = int(c.get('time', 0))
            if timezone == 'UTC':
                dt_curr = datetime.fromtimestamp(c_time, tz=pytimezone.utc).replace(tzinfo=None)
            else:
                dt_curr = datetime.fromtimestamp(c_time)

            in_session, _ = is_datetime_in_sessions(dt_curr, sessions)
            if not in_session:
                should_buy = False
                should_sell = False

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

        # Check if position already open
        magic = abs(hash(strategy["id"])) & 0x7FFFFFFF
        positions = MetaTraderHandler.get_positions()
        pos_open = any(p.get("magic") == magic or (p.get("symbol") == strategy["symbol"] and p.get("magic") == magic) for p in positions)
        if pos_open:
            status_message = "Position already open. Monitoring for close condition."

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
            "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        return should_buy, should_sell, state_info

    @classmethod
    def _execute_trade(cls, strategy: dict, should_buy: bool, should_sell: bool, last_candle: dict):
        symbol = strategy["symbol"]
        strategy_id = strategy["id"]
        magic = abs(hash(strategy_id)) & 0x7FFFFFFF

        # 1. Check if we already have an open position for this strategy magic number
        positions = MetaTraderHandler.get_positions()
        # Find if there is an active position with the same symbol and magic number
        import MetaTrader5 as mt5
        active_pos = None
        if MT5_AVAILABLE:
            mt5_positions = mt5.positions_get(symbol=symbol)
            if mt5_positions:
                for p in mt5_positions:
                    if p.magic == magic:
                        active_pos = p
                        break

        if active_pos:
            print(f"[Live Runner] Position already open for strategy {strategy_id} on {symbol}. Skipping entry.", flush=True)
            return

        # 2. Get Account Info for sizing
        acct = MetaTraderHandler.get_account_info()
        balance = acct.get("balance", 10000.0)

        # 3. Calculate Trade Parameters
        entry_price = float(last_candle["close"])
        direction = "BUY" if should_buy else "SELL"
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

        print(f"[Live Runner] Triggering {direction} order for strategy {strategy_id} on {symbol}. Params: {params}", flush=True)

        # 4. Dispatch Order
        MetaTraderHandler.create_order(
            symbol=symbol,
            side=direction,
            volume=params["qty"],
            price=params["entry_price"],
            stop_loss=params["sl_price"],
            take_profit=params["tp_price"],
            magic=magic
        )
