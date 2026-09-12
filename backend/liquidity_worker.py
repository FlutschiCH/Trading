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

def set_console_quick_edit(enabled: bool):
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            h_input = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                if enabled:
                    new_mode = (mode.value | 0x0040) | 0x0080
                else:
                    new_mode = (mode.value & ~0x0040) | 0x0080
                kernel32.SetConsoleMode(h_input, new_mode)
        except Exception:
            pass

# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from live_strategy_handler import LiveStrategyHandler
from broker_handler import BrokerHandler
from scalper_handler import ScalperHandler, ExhaustionDetector, SignalEngine, RiskManager
from backtest_helpers import get_pip_size, get_lot_size
from symbol_mapping_handler import SymbolMappingHandler
from live_runner_handler import calculate_date_bounds


class LiquidityWorker:
    """
    Dedicated worker process for M1/M5 Liquidity Void & Reversal Scalper strategies.
    Monitors live candle streams, evaluates extreme candle exhaustions, arms confirmation breakouts,
    and executes orders with dynamic lot sizing and spread protection.
    """

    def __init__(self, strategy_id: str):
        self.strategy_id = str(strategy_id)
        self.lock_file = None
        self._acquire_instance_lock()
        self.running = True
        self.candles_cache = []
        self.trades_cache = []
        self.last_processed_candle_time = None
        self.scalper_state = {}
        self.cache_config_fingerprint = None
        self.last_heartbeat_time = 0

    def _acquire_instance_lock(self):
        lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
        os.makedirs(lock_dir, exist_ok=True)
        lock_path = os.path.join(lock_dir, f"liquidity_worker_{self.strategy_id}.lock")

        try:
            self.lock_file = open(lock_path, "w+")
            if sys.platform == "win32":
                import msvcrt
                try:
                    msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                except (IOError, OSError):
                    print(f"{Fore.YELLOW}[LiquidityWorker Lock]{Style.RESET_ALL} Worker for Strategy {self.strategy_id} is already running in another process. Exiting...", flush=True)
                    self.lock_file.close()
                    sys.exit(0)
            else:
                import fcntl
                try:
                    fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except (IOError, OSError):
                    print(f"{Fore.YELLOW}[LiquidityWorker Lock]{Style.RESET_ALL} Worker for Strategy {self.strategy_id} is already running in another process. Exiting...", flush=True)
                    self.lock_file.close()
                    sys.exit(0)

            self.lock_file.seek(0)
            self.lock_file.truncate()
            self.lock_file.write(str(os.getpid()))
            self.lock_file.flush()
        except Exception as ex:
            print(f"{Fore.RED}[LiquidityWorker Lock Error]{Style.RESET_ALL} Failed to acquire lock: {ex}", flush=True)

    def _release_instance_lock(self):
        if self.lock_file:
            try:
                if sys.platform == "win32":
                    import msvcrt
                    try:
                        self.lock_file.seek(0)
                        msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                    except Exception:
                        pass
                else:
                    import fcntl
                    try:
                        fcntl.flock(self.lock_file, fcntl.LOCK_UN)
                    except Exception:
                        pass
                self.lock_file.close()
            except Exception:
                pass
            self.lock_file = None

    def send_update_or_heartbeat(self, state_info: dict = None, status_msg: str = None):
        if state_info:
            try:
                LiveStrategyHandler.update_strategy_state(self.strategy_id, state_info)
            except Exception as ex:
                print(f"{Fore.YELLOW}[LiquidityWorker DB Warning]{Style.RESET_ALL} Failed to update state: {ex}", flush=True)

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
            pass

    def execute_trades(self, strategy: dict, direction: str, trade_params: dict):
        symbol = strategy["symbol"]
        strategy_id = strategy["id"]
        magic = abs(hash(strategy_id)) & 0x7FFFFFFF
        targets = strategy.get("targets", [])
        if not targets:
            broker_name = strategy.get("broker", "metatrader")
            targets = [{"broker": broker_name, "account_id": strategy.get("account_id")}]

        strat_acc_id = strategy.get("account_id")
        base_symbol = SymbolMappingHandler.map_to_main(symbol, strat_acc_id)

        for target in targets:
            try:
                target_acc_id = target.get("account_id")
                target_broker = target.get("broker") or "metatrader"

                # Check existing positions to avoid duplicates
                positions = BrokerHandler.get_positions(target_broker, target_acc_id) or []
                skip_entry = False
                for p in positions:
                    pos_symbol = SymbolMappingHandler.map_to_main(p.get("symbol"), target_acc_id)
                    if pos_symbol == base_symbol:
                        pos_type = str(p.get("trade_side") or p.get("type", "")).upper()
                        if pos_type in (direction, f"POSITION_TYPE_{direction}"):
                            print(f"{Fore.YELLOW}[LiquidityWorker]{Style.RESET_ALL} Position already open ({pos_type}) on {symbol}. Skipping duplicate entry.", flush=True)
                            skip_entry = True

                if skip_entry:
                    continue

                target_broker_symbol = SymbolMappingHandler.map_to_broker(base_symbol, target_acc_id)
                if not target_broker_symbol:
                    print(f"{Fore.YELLOW}[LiquidityWorker Warning]{Style.RESET_ALL} No symbol mapping for {base_symbol} on {target_acc_id}", flush=True)
                    continue

                lot_size = trade_params.get("lot_size", 0.01)
                sl_price = trade_params.get("sl_price")
                entry_price = trade_params.get("entry_price")

                print(f"{Fore.GREEN}[LiquidityWorker Trade]{Style.RESET_ALL} Triggering {direction} order on {target_acc_id} ({target_broker_symbol}) | Lots: {lot_size} | SL: {sl_price}", flush=True)

                order_res = BrokerHandler.create_order(
                    target_broker,
                    target_acc_id,
                    symbol=target_broker_symbol,
                    side=direction,
                    volume=lot_size,
                    price=None,
                    stop_loss=sl_price,
                    take_profit=None,
                    magic=magic
                )

                from discord_handler import send_discord_message
                if isinstance(order_res, dict) and order_res.get("status") in ("error", "failed"):
                    err_msg = order_res.get("message", "Unknown error")
                    print(f"{Fore.RED}[LiquidityWorker Error]{Style.RESET_ALL} Execution failed: {err_msg}", flush=True)
                    send_discord_message(
                        f"❌ **Scalper Order Execution Failed!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"⚠️ **Error:** `{err_msg}`"
                    )
                else:
                    print(f"{Fore.GREEN}[LiquidityWorker Success]{Style.RESET_ALL} Scalper trade placed on {target_acc_id}.", flush=True)
                    send_discord_message(
                        f"⚡ **Scalper Trade Executed!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"📦 **Lots:** `{lot_size}` | 💵 **Entry:** `{entry_price:.5f}`\n"
                        f"🛑 **SL:** `{sl_price:.5f}` ({trade_params.get('sl_pips')} pips)\n"
                        f"🎯 **50% Impulse Retracement:** `{trade_params.get('retracement_50', 0):.5f}`"
                    )
            except Exception as ex:
                print(f"{Fore.RED}[LiquidityWorker Error]{Style.RESET_ALL} Trade error: {ex}", flush=True)

    def run(self):
        def sig_handler(signum, frame):
            print(f"\n{Fore.YELLOW}[LiquidityWorker]{Style.RESET_ALL} Received stop signal. Exiting gracefully...", flush=True)
            self.running = False

        signal.signal(signal.SIGINT, sig_handler)
        signal.signal(signal.SIGTERM, sig_handler)

        banner_printed = False

        while self.running:
            try:
                strategy = LiveStrategyHandler.get_strategy(self.strategy_id)
                if not strategy or strategy.get("status") != "active":
                    print(f"{Fore.YELLOW}[LiquidityWorker]{Style.RESET_ALL} Strategy {self.strategy_id} is no longer active. Shutting down worker process.", flush=True)
                    break

                symbol = strategy["symbol"]
                timeframe = strategy.get("timeframe", "M1")
                broker_name = strategy.get("broker", "metatrader")
                handler = BrokerHandler.get_handler(broker_name)

                if not banner_printed:
                    banner_printed = True
                    strat_name = strategy.get("name") or "M1 Liquidity Scalper"
                    print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*60}", flush=True)
                    print(f"{Fore.CYAN}{Style.BRIGHT}  ⚡ LIQUIDITY VOID & REVERSAL SCALPER WORKER ACTIVE", flush=True)
                    print(f"{Fore.CYAN}{Style.BRIGHT}{'='*60}{Style.RESET_ALL}", flush=True)
                    print(f"  {Fore.WHITE}• Strategy ID      :{Style.RESET_ALL} {Style.BRIGHT}{self.strategy_id}{Style.RESET_ALL} ({strat_name})", flush=True)
                    print(f"  {Fore.WHITE}• Symbol & TF      :{Style.RESET_ALL} {Fore.YELLOW}{symbol}{Style.RESET_ALL} @ {Fore.YELLOW}{timeframe}{Style.RESET_ALL}", flush=True)
                    print(f"  {Fore.WHITE}• Host Machine     :{Style.RESET_ALL} {strategy.get('target_computer', 'All')}", flush=True)
                    print(f"{Fore.CYAN}{Style.BRIGHT}{'='*60}\n{Style.RESET_ALL}", flush=True)

                strat_acc_id = strategy.get("account_id")
                if not strat_acc_id and strategy.get("targets"):
                    targets = strategy.get("targets")
                    if isinstance(targets, list) and len(targets) > 0:
                        strat_acc_id = targets[0].get("account_id")

                strat_broker_symbol = SymbolMappingHandler.map_to_broker(symbol, strat_acc_id)

                # Fetch M1 candles
                candles = handler.fetch_candles(
                    symbol=strat_broker_symbol,
                    timeframe=timeframe,
                    limit=100,
                    login=strat_acc_id,
                    account_id=strat_acc_id
                )

                if candles and len(candles) >= 25:
                    self.candles_cache = candles

                    # Get balance & spread
                    acct = BrokerHandler.get_account_info(broker_name, strat_acc_id)
                    balance = 1000.0
                    if acct:
                        if "data" in acct and isinstance(acct["data"], dict):
                            balance = float(acct["data"].get("balance", 1000.0))
                        elif isinstance(acct, dict):
                            balance = float(acct.get("balance", 1000.0))

                    current_spread_pips = 0.8
                    try:
                        quote = handler.get_symbol_quote(symbol=strat_broker_symbol, account_id=strat_acc_id)
                        if quote and "ask" in quote and "bid" in quote:
                            pip_size = get_pip_size(strat_broker_symbol, float(quote["bid"]))
                            current_spread_pips = abs(float(quote["ask"]) - float(quote["bid"])) / pip_size
                    except Exception:
                        pass

                    # Evaluate Market via ScalperHandler
                    eval_res = ScalperHandler.evaluate_market(
                        candles=self.candles_cache,
                        state=self.scalper_state,
                        symbol=symbol,
                        current_spread_pips=current_spread_pips,
                        account_balance=balance,
                        risk_percent=float(strategy.get("riskPct", 1.0)),
                        atr_multiplier=float(strategy.get("atr_multiplier", 2.5)),
                        vol_multiplier=float(strategy.get("vol_multiplier", 3.0)),
                        min_wick_ratio=float(strategy.get("min_wick_ratio", 0.40))
                    )

                    self.scalper_state = eval_res.get("state", {})
                    action = eval_res.get("action", "HOLD")

                    state_info = {
                        "strategy_type": "scalper",
                        "status": self.scalper_state.get("status", "IDLE"),
                        "direction": self.scalper_state.get("direction"),
                        "spread_pips": round(current_spread_pips, 2),
                        "balance": balance,
                        "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "eval_result": eval_res
                    }
                    self.send_update_or_heartbeat(state_info=state_info)

                    last_candle = self.candles_cache[-1]
                    candle_time = int(last_candle.get("time", 0))

                    if action in ("BUY", "SELL") and eval_res.get("trade_params"):
                        if self.last_processed_candle_time != candle_time:
                            self.last_processed_candle_time = candle_time
                            print(f"{Fore.GREEN}[LiquidityWorker TRIGGER]{Style.RESET_ALL} Confirmed {action} signal for {symbol}!", flush=True)
                            self.execute_trades(strategy, action, eval_res["trade_params"])

            except Exception as err:
                print(f"{Fore.RED}[LiquidityWorker Exception]{Style.RESET_ALL} Loop error: {err}", flush=True)
                import traceback
                traceback.print_exc()

            time.sleep(3)

        self._release_instance_lock()
        print(f"{Fore.YELLOW}[LiquidityWorker]{Style.RESET_ALL} Worker process for strategy {self.strategy_id} exited cleanly.", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Liquidity Void & Reversal Scalper Worker Process")
    parser.add_argument('--strategy_id', type=str, required=True, help="Strategy ID to run")
    parser.add_argument('--quickedit', action='store_true', default=False, help="Enable QuickEdit mode")
    args = parser.parse_args()

    set_console_quick_edit(args.quickedit)
    worker = LiquidityWorker(strategy_id=args.strategy_id)
    worker.run()
