import os
import sys
import json
import time
import argparse
import signal
import socket
from datetime import datetime
from colorama import init, Fore, Style
init(autoreset=True)

def disable_quick_edit():
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            h_input = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                new_mode = (mode.value & ~0x0040) | 0x0080
                kernel32.SetConsoleMode(h_input, new_mode)
        except Exception:
            pass

disable_quick_edit()

# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from live_strategy_handler import LiveStrategyHandler
from broker_handler import BrokerHandler
from strategy_handler import StrategyHandler
from wyckoff_handler import WyckoffHandler
from trading_handler import TradingHandler
from backtest_helpers import get_pip_size, get_lot_size
from symbol_mapping_handler import SymbolMappingHandler
from live_runner_handler import calculate_date_bounds

class LiveWorker:
    def __init__(self, strategy_id: str):
        self.strategy_id = strategy_id
        self.running = True
        self.candles_cache = []
        self.trades_cache = []
        self.last_processed_candle_time = None
        self.cache_config_fingerprint = None
        self.http_failed = False
        self.last_heartbeat_time = 0

    def send_update_or_heartbeat(self, state_info: dict = None, status_msg: str = None):
        """
        Updates strategy state in DB and sends heartbeat update to Flask backend.
        """
        now_ts = time.time()
        # Direct DB state update
        if state_info:
            try:
                LiveStrategyHandler.update_strategy_state(self.strategy_id, state_info)
            except Exception as ex:
                print(f"{Fore.YELLOW}[LiveWorker DB Warning]{Style.RESET_ALL} Failed to update live state: {ex}", flush=True)

        # Notify local Flask server
        try:
            import urllib.request
            port = int(os.environ.get("PORT", 8751))
            url = f"http://127.0.0.1:{port}/api/live-strategy/worker-heartbeat"
            payload = {
                "strategy_id": self.strategy_id,
                "pid": os.getpid(),
                "status_msg": status_msg or "running",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=2):
                pass
        except Exception:
            # Flask may be restarting or quiet, don't crash worker
            pass

    def _evaluate_signals(self, annotated_candles: list, strategy: dict) -> tuple:
        """
        Replicates the entry logic state machine to get the state at the last completed candle.
        """
        entry_stability_rule = strategy.get("entryStabilityRule", "default")
        timezone_str = strategy.get("timezone", "Local")
        sessions = strategy.get("sessions", [])
        daily_mode = strategy.get("dailyFirstSignalsMode", "disabled")
        daily_count = int(strategy.get("dailyFirstSignalsCount", 1))
        daily_risk_mult = float(strategy.get("dailyFirstSignalsRiskMult", 0.5))

        state_dict = {}
        daily_signals_count = {}
        for c in annotated_candles[:-1]:  # Stop at index -2 (the last completed candle)
            should_buy, should_sell, state_dict = StrategyHandler.evaluate_candle_signal(
                c=c,
                state=state_dict,
                entry_stability_rule=entry_stability_rule,
                timezone=timezone_str,
                sessions=sessions,
                daily_first_signals_mode=daily_mode,
                daily_first_signals_count=daily_count,
                daily_first_signals_risk_mult=daily_risk_mult,
                daily_signals_count=daily_signals_count
            )

        accum_consec_bars = state_dict.get('accum_consec_bars', 0)
        dist_consec_bars = state_dict.get('dist_consec_bars', 0)
        pending_buy = state_dict.get('pending_buy', False)
        pending_sell = state_dict.get('pending_sell', False)
        spring_high = state_dict.get('spring_high', None)
        upthrust_low = state_dict.get('upthrust_low', None)
        pending_buy_age = state_dict.get('pending_buy_age', 0)
        pending_sell_age = state_dict.get('pending_sell_age', 0)

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

        allowed, msg = LiveStrategyHandler.is_trading_allowed(self.strategy_id)
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
            "trades": self.trades_cache
        }

        return should_buy, should_sell, state_info

    def execute_trades(self, strategy: dict, should_buy: bool, should_sell: bool, last_candle: dict):
        symbol = strategy["symbol"]
        strategy_id = strategy["id"]
        magic = abs(hash(strategy_id)) & 0x7FFFFFFF
        targets = strategy.get("targets", [])
        if not targets:
            broker_name = strategy.get("broker", "metatrader")
            targets = [{"broker": broker_name, "account_id": strategy.get("account_id")}]

        strat_acc_id = strategy.get("account_id")
        base_symbol = SymbolMappingHandler.map_to_main(symbol, strat_acc_id)

        # Check for daily first signal risk multiplier or skip
        risk_mult = float(last_candle.get('risk_multiplier', 1.0))
        effective_risk_pct = float(strategy["riskPct"]) * risk_mult
        effective_size = float(strategy["size"]) * risk_mult

        for target in targets:
            try:
                target_acc_id = target.get("account_id")
                target_broker = target.get("broker") or "metatrader"

                # Check existing positions
                positions = BrokerHandler.get_positions(target_broker, target_acc_id) or []
                allow_opposite_close = strategy.get("allowOppositeClose", True)
                direction = "BUY" if should_buy else "SELL"
                skip_entry = False

                for p in positions:
                    pos_symbol = SymbolMappingHandler.map_to_main(p.get("symbol"), target_acc_id)
                    broker_symbol = SymbolMappingHandler.map_to_broker(pos_symbol, target_acc_id)
                    if pos_symbol == base_symbol:
                        pos_type = p.get("trade_side", "").upper()
                        is_opposite = (pos_type == "BUY" and should_sell) or (pos_type == "SELL" and should_buy)
                        if is_opposite:
                            if allow_opposite_close:
                                print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Opposite signal on {target_acc_id} ({symbol}). Closing open {pos_type} position...", flush=True)
                                try:
                                    pos_id = p.get("ticket") or p.get("id") or p.get("position_id")
                                    BrokerHandler.close_position(target_broker, target_acc_id, position_id=pos_id, broker_symbol=broker_symbol)
                                    from discord_handler import send_discord_message
                                    send_discord_message(
                                        f"🔄 **Opposite Signal Position Closed**\n"
                                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                        f"📊 **Symbol:** `{symbol}`\n"
                                        f"🚫 **Closed Position:** `{pos_type}`"
                                    )
                                except Exception as close_err:
                                    print(f"{Fore.RED}[LiveWorker Error]{Style.RESET_ALL} Failed to close opposite position: {close_err}", flush=True)
                            else:
                                print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Opposite position open ({pos_type}) on {symbol}, allowOppositeClose=False. Skipping.", flush=True)
                                skip_entry = True
                        elif pos_type == direction:
                            print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Position already open in same direction ({pos_type}) on {symbol}. Skipping.", flush=True)
                            skip_entry = True

                if skip_entry:
                    continue

                acct = BrokerHandler.get_account_info(target_broker, target_acc_id)
                balance = None
                if acct:
                    if "data" in acct and isinstance(acct["data"], dict):
                        balance = acct["data"].get("balance")
                    elif isinstance(acct, dict):
                        balance = acct.get("balance")

                if balance is None or float(balance) <= 0:
                    print(f"{Fore.RED}[LiveWorker Error]{Style.RESET_ALL} Could not retrieve valid account balance for {target_acc_id}. Skipping execution.", flush=True)
                    continue

                balance = float(balance)
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
                    size=effective_size,
                    use_risk_sizing=strategy["useRiskSizing"],
                    risk_pct=effective_risk_pct,
                    balance=balance,
                    lot_size=lot_size,
                    pip_size=pip_size,
                    precision=5
                )

                print(f"{Fore.GREEN}[LiveWorker Trade]{Style.RESET_ALL} Triggering {direction} order on {target_acc_id} ({symbol}). Params: {params}", flush=True)

                order_res = BrokerHandler.create_order(
                    target_broker,
                    target_acc_id,
                    symbol=symbol,
                    side=direction,
                    volume=params["qty"],
                    price=params["entry_price"],
                    stop_loss=params["sl_price"],
                    take_profit=params["tp_price"],
                    magic=magic
                )

                from discord_handler import send_discord_message
                if isinstance(order_res, dict) and order_res.get("status") in ("error", "failed"):
                    err_msg = order_res.get("message", "Unknown error")
                    print(f"{Fore.RED}[LiveWorker Error]{Style.RESET_ALL} Order execution failed: {err_msg}", flush=True)
                    send_discord_message(
                        f"❌ **Broker Order Execution Failed!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"⚠️ **Error:** `{err_msg}`"
                    )
                else:
                    print(f"{Fore.GREEN}[LiveWorker Success]{Style.RESET_ALL} Order successfully executed for target {target_acc_id} on {symbol}.", flush=True)
                    send_discord_message(
                        f"✅ **Real Trade Executed Successfully!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"📦 **Volume:** `{params['qty']}` | 💵 **Entry:** `{params['entry_price']:.5f}`\n"
                        f"🛑 **SL:** `{params['sl_price']:.5f}` | 🎯 **TP:** `{params['tp_price']:.5f}`"
                    )
            except Exception as ex:
                print(f"{Fore.RED}[LiveWorker Error]{Style.RESET_ALL} Error executing trade: {ex}", flush=True)

    def run(self):
        print(f"{Fore.CYAN}[LiveWorker]{Style.RESET_ALL} Starting live strategy worker for Strategy ID: {Style.BRIGHT}{self.strategy_id}{Style.RESET_ALL} (PID: {os.getpid()})", flush=True)

        def handle_exit(sig=None, frame=None):
            print(f"\n{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Exit signal received. Stopping worker for {self.strategy_id}...", flush=True)
            self.running = False
            self.send_update_or_heartbeat(status_msg="stopped")
            sys.exit(0)

        # OS Signal handlers
        try:
            signal.signal(signal.SIGINT, handle_exit)
            signal.signal(signal.SIGTERM, handle_exit)
            if hasattr(signal, 'SIGBREAK'):
                signal.signal(signal.SIGBREAK, handle_exit)
        except Exception:
            pass

        # Windows console close handler
        if sys.platform == "win32":
            try:
                import ctypes
                from ctypes import wintypes
                PHANDLER_ROUTINE = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

                def win_ctrl_handler(ctrl_type):
                    print(f"\n{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Received console close signal ({ctrl_type}). Exiting...", flush=True)
                    self.running = False
                    sys.exit(0)

                global _win_ctrl_handler_ref
                _win_ctrl_handler_ref = PHANDLER_ROUTINE(win_ctrl_handler)
                ctypes.windll.kernel32.SetConsoleCtrlHandler(_win_ctrl_handler_ref, True)
            except Exception as ex:
                print(f"[LiveWorker] Console handler note: {ex}", flush=True)

        first_run = True

        # Main evaluation loop
        while self.running:
            try:
                strategy = LiveStrategyHandler.get_strategy(self.strategy_id)
                if not strategy:
                    print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Strategy {self.strategy_id} not found in database. Exiting...", flush=True)
                    break

                if strategy.get("status") != "active":
                    print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Strategy {self.strategy_id} is no longer active (status='{strategy.get('status')}'). Exiting worker...", flush=True)
                    break

                if first_run:
                    first_run = False
                    strat_name = strategy.get("name") or "Unnamed Strategy"
                    strat_sym = strategy.get("symbol", "UNKNOWN")
                    strat_tf = strategy.get("timeframe", "UNKNOWN")
                    strat_broker = strategy.get("broker", "metatrader")
                    strat_lookback = strategy.get("lookbackWindow", 20)
                    strat_sl_val = strategy.get("slVal", 1.0)
                    strat_sl_type = strategy.get("slType", "price")
                    strat_rr = strategy.get("rr", 2.0)
                    strat_size = strategy.get("size", 1.0)
                    strat_risk_sizing = strategy.get("useRiskSizing", True)
                    strat_risk_pct = strategy.get("riskPct", 1.0)
                    strat_use_be = strategy.get("useBreakEven", False)
                    strat_be_trigger = strategy.get("beTriggerR", 1.0)
                    strat_be_mode = strategy.get("beOffsetMode", "half_r")
                    strat_rule = strategy.get("entryStabilityRule", "default")
                    strat_allow_opp = strategy.get("allowOppositeClose", True)
                    strat_tz = strategy.get("timezone", "Local")
                    strat_use_gc = strategy.get("useGlobalClose", False)
                    strat_gc_time = strategy.get("globalCloseTime", "")
                    strat_sessions = strategy.get("sessions") or []
                    strat_targets = strategy.get("targets") or []
                    strat_daily_mode = strategy.get("dailyFirstSignalsMode", "disabled") or "disabled"
                    strat_daily_count = int(strategy.get("dailyFirstSignalsCount", 1))
                    strat_daily_mult = float(strategy.get("dailyFirstSignalsRiskMult", 0.5))

                    targets_str = ", ".join([f"{t.get('broker', 'metatrader')}:{t.get('account_id', 'default')}" for t in strat_targets]) if strat_targets else f"{strat_broker}:{strategy.get('account_id', 'default')}"
                    sessions_str = ", ".join([f"{s.get('id', 'sess')}({s.get('start')}-{s.get('end')})" for s in strat_sessions]) if strat_sessions else "24/7 (No restrictions)"
                    daily_signals_str = f"{strat_daily_mode.upper()} (Count: {strat_daily_count}, Risk: {int(strat_daily_mult * 100)}%)" if strat_daily_mode != 'disabled' else "Disabled (Take all signals)"

                    print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*60}", flush=True)
                    print(f"{Fore.CYAN}{Style.BRIGHT}  🚀 LIVE STRATEGY WORKER INITIALIZED", flush=True)
                    print(f"{Fore.CYAN}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}", flush=True)
                    print(f"  {Fore.WHITE}• Strategy ID      :{Style.RESET_ALL} {Style.BRIGHT}{self.strategy_id}{Style.RESET_ALL} ({strat_name})", flush=True)
                    print(f"  {Fore.WHITE}• Market & Timeframe:{Style.RESET_ALL} {Fore.YELLOW}{strat_sym}{Style.RESET_ALL} @ {Fore.YELLOW}{strat_tf}{Style.RESET_ALL} (Lookback: {strat_lookback})", flush=True)
                    print(f"  {Fore.WHITE}• Primary Broker    :{Style.RESET_ALL} {strat_broker}", flush=True)
                    print(f"  {Fore.WHITE}• Target Accounts   :{Style.RESET_ALL} {Fore.GREEN}{targets_str}{Style.RESET_ALL}", flush=True)
                    print(f"  {Fore.WHITE}• Risk & Sizing     :{Style.RESET_ALL} RiskSizing={strat_risk_sizing} (Risk: {strat_risk_pct}%, Base Size: {strat_size})", flush=True)
                    print(f"  {Fore.WHITE}• SL & RR Config    :{Style.RESET_ALL} SL={strat_sl_val} ({strat_sl_type}) | RR={strat_rr} | BE={strat_use_be} (Trigger: {strat_be_trigger}R, Mode: {strat_be_mode})", flush=True)
                    print(f"  {Fore.WHITE}• Execution Rules   :{Style.RESET_ALL} Stability='{strat_rule}' | AllowOppositeClose={strat_allow_opp}", flush=True)
                    print(f"  {Fore.WHITE}• Daily First Sig.  :{Style.RESET_ALL} {Fore.MAGENTA}{daily_signals_str}{Style.RESET_ALL}", flush=True)
                    print(f"  {Fore.WHITE}• Sessions & Close  :{Style.RESET_ALL} TZ={strat_tz} | Sessions=[{sessions_str}] | GlobalClose={strat_use_gc} ({strat_gc_time or 'None'})", flush=True)
                    print(f"{Fore.CYAN}{Style.BRIGHT}{'='*60}\n{Style.RESET_ALL}", flush=True)

                symbol = strategy["symbol"]
                timeframe = strategy["timeframe"]
                lookback = strategy["lookbackWindow"]
                broker_name = strategy.get("broker", "metatrader")
                handler = BrokerHandler.get_handler(broker_name)

                opt = strategy.get("dateRangeOption", "last_candles")
                custom_from = strategy.get("customFrom") or ""
                custom_to = strategy.get("customTo") or ""
                limit = strategy.get("candleLimit", 5000)

                strat_acc_id = strategy.get("account_id")
                if not strat_acc_id and strategy.get("targets"):
                    targets = strategy.get("targets")
                    if isinstance(targets, list) and len(targets) > 0:
                        strat_acc_id = targets[0].get("account_id")

                curr_config = (symbol, timeframe, lookback, broker_name, opt, custom_from, custom_to, limit)
                if self.cache_config_fingerprint != curr_config or not self.candles_cache:
                    # Initial / Warm-up Fetch
                    self.cache_config_fingerprint = curr_config
                    date_from, date_to = calculate_date_bounds(opt, custom_from, custom_to)
                    print(f"{Fore.CYAN}[LiveWorker Warmup]{Style.RESET_ALL} Fetching historical candles for {symbol} ({timeframe}) from {broker_name}...", flush=True)
                    candles = handler.fetch_candles(
                        symbol=symbol,
                        timeframe=timeframe,
                        limit=limit,
                        date_from=date_from,
                        date_to=date_to,
                        login=strat_acc_id,
                        account_id=strat_acc_id
                    )

                    if candles:
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
                            broker=broker_name,
                            daily_first_signals_mode=strategy.get("dailyFirstSignalsMode", "disabled"),
                            daily_first_signals_count=int(strategy.get("dailyFirstSignalsCount", 1)),
                            daily_first_signals_risk_mult=float(strategy.get("dailyFirstSignalsRiskMult", 0.5))
                        )
                        self.candles_cache = backtest_res.get("candles", [])
                        self.trades_cache = backtest_res.get("trades", [])
                        print(f"{Fore.GREEN}[LiveWorker Warmup Success]{Style.RESET_ALL} Warm-up completed with {len(self.candles_cache)} candles.", flush=True)
                    else:
                        print(f"{Fore.RED}[LiveWorker Warmup Error]{Style.RESET_ALL} Failed to fetch warm-up candles.", flush=True)
                        self.candles_cache = []
                else:
                    # Incremental candle fetch
                    new_candles = handler.fetch_candles(
                        symbol=symbol,
                        timeframe=timeframe,
                        limit=10,
                        login=strat_acc_id,
                        account_id=strat_acc_id
                    )
                    if new_candles:
                        merge_map = {c["time"]: c for c in self.candles_cache}
                        for c in new_candles:
                            merge_map[c["time"]] = c
                        sorted_times = sorted(merge_map.keys())
                        if len(sorted_times) > 5000:
                            sorted_times = sorted_times[-5000:]
                        full_history = [merge_map[t] for t in sorted_times]
                        self.candles_cache = WyckoffHandler.analyze_wyckoff_structure(full_history, lookback=lookback)

                if not self.candles_cache or len(self.candles_cache) < lookback + 10:
                    self.send_update_or_heartbeat(state_info={
                        "stage": "UNKNOWN",
                        "status_message": "Error: Failed to fetch candles or insufficient candle count.",
                        "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    })
                else:
                    should_buy, should_sell, state_info = self._evaluate_signals(self.candles_cache, strategy)
                    recent_candles = self.candles_cache[-5000:] if len(self.candles_cache) > 5000 else self.candles_cache
                    state_info["candles"] = recent_candles
                    self.send_update_or_heartbeat(state_info=state_info)

                    last_completed_candle = self.candles_cache[-2]
                    candle_time = int(last_completed_candle["time"])

                    if self.last_processed_candle_time != candle_time:
                        self.last_processed_candle_time = candle_time
                        if should_buy or should_sell:
                            direction = "BUY" if should_buy else "SELL"
                            close_price = last_completed_candle.get("close", 0)
                            allow_opp = strategy.get("allowOppositeClose", True)
                            print(f"{Fore.GREEN}[LiveWorker SIGNAL DETECTED]{Style.RESET_ALL} {direction} at {close_price:.5f} (Opposite close: {allow_opp})", flush=True)

                            from discord_handler import send_discord_message
                            send_discord_message(
                                f"🚨 **New Trade Signal Detected!**\n"
                                f"🎛️ **Strategy ID:** `{self.strategy_id}`\n"
                                f"📊 **Symbol:** `{symbol}`\n"
                                f"⏱️ **Timeframe:** `{timeframe}`\n"
                                f"➡️ **Direction:** `{direction}`\n"
                                f"💵 **Price:** `{close_price:.5f}`\n"
                                f"🔄 **Allow Opposite Close:** `{allow_opp}`"
                            )

                            self.execute_trades(strategy, should_buy, should_sell, last_completed_candle)

                            new_trade = {
                                "id": len(self.trades_cache) + 1,
                                "type": direction,
                                "entry_time": last_completed_candle["time"],
                                "entry_price": last_completed_candle.get("close", 0.0),
                                "status": "OPEN",
                                "profit": 0.0
                            }
                            self.trades_cache.append(new_trade)

            except Exception as err:
                print(f"{Fore.RED}[LiveWorker Exception]{Style.RESET_ALL} Loop error in {self.strategy_id}: {err}", flush=True)
                import traceback
                traceback.print_exc()

            time.sleep(15)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Live Strategy Worker Process")
    parser.add_argument('--strategy_id', type=str, required=True, help="Strategy ID to run")
    args = parser.parse_args()

    worker = LiveWorker(strategy_id=args.strategy_id)
    worker.run()
