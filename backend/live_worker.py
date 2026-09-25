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

def pause_and_exit(exit_code: int = 0, message: str = "Window will close automatically in 60 seconds (or press Enter)...", timeout: int = 60):
    """
    Ensures the console stays open after shutdown or errors so the user can inspect output,
    with a countdown delay matching backtest_worker.py and QuickEdit enabled for easy copying.
    """
    set_console_quick_edit(True)
    prefix_color = Fore.GREEN if exit_code == 0 else Fore.YELLOW
    print(f"\n{prefix_color}[LiveWorker]{Style.RESET_ALL} {message}", flush=True)
    try:
        if sys.platform == "win32":
            import msvcrt
            start_wait = time.time()
            while time.time() - start_wait < timeout:
                if msvcrt.kbhit():
                    ch = msvcrt.getch()
                    if ch in (b'\r', b'\n'):
                        break
                time.sleep(0.5)
        else:
            time.sleep(timeout)
    except Exception:
        time.sleep(timeout)
    sys.exit(exit_code)


def is_process_running(pid: int) -> bool:
    """
    Checks if a process with the given PID is currently active.
    """
    if not pid or pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            import ctypes
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            SYNCHRONIZE = 0x00100000
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, int(pid))
            if not handle:
                return False
            exit_code = ctypes.c_ulong()
            kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
            kernel32.CloseHandle(handle)
            return exit_code.value == 259  # STILL_ACTIVE
        except Exception:
            return False
    else:
        try:
            os.kill(int(pid), 0)
            return True
        except (OSError, ProcessLookupError):
            return False


# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from broker_handler import BrokerHandler
from strategy_handler import StrategyHandler
from wyckoff_handler import WyckoffHandler
from trading_handler import TradingHandler
from backtest_helpers import get_pip_size, get_lot_size
from symbol_mapping_handler import SymbolMappingHandler
from live_runner_handler import calculate_date_bounds

class LiveWorker:
    def __init__(self, strategy_id: str):
        self.strategy_id = str(strategy_id)
        self.lock_file = None
        self._acquire_instance_lock()
        self.running = True
        self.candles_cache = []
        self.trades_cache = []
        self.last_processed_candle_time = None
        self.cache_config_fingerprint = None
        self.http_failed = False
        self.last_heartbeat_time = 0
        self.be_triggered_positions = set()

    def _acquire_instance_lock(self):
        """
        Ensures only one LiveWorker process runs for a given strategy_id at any time.
        If another active instance is running, this process displays info and waits 60s before exiting.
        If a lock file exists but the holding process is dead or invalid, the stale lock is recovered.
        """
        lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
        os.makedirs(lock_dir, exist_ok=True)
        self.lock_path = os.path.join(lock_dir, f"live_worker_{self.strategy_id}.lock")

        # 1. Read existing PID if present and verify if it's an active process
        if os.path.exists(self.lock_path):
            existing_pid = None
            try:
                with open(self.lock_path, "r", encoding="utf-8", errors="ignore") as existing_f:
                    raw_pid = existing_f.read().strip()
                    if raw_pid and raw_pid.isdigit():
                        existing_pid = int(raw_pid)
            except Exception:
                pass

            if existing_pid and existing_pid != os.getpid():
                if is_process_running(existing_pid):
                    print(f"{Fore.YELLOW}[LiveWorker Duplicate Check]{Style.RESET_ALL} Worker for Strategy {self.strategy_id} is already actively running in PID {existing_pid} (current PID: {os.getpid()}).", flush=True)
                    pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
                else:
                    try:
                        os.remove(self.lock_path)
                    except Exception:
                        pass

        # 2. Acquire lock and persist current PID
        try:
            if not os.path.exists(self.lock_path):
                self.lock_file = open(self.lock_path, "w+", encoding="utf-8")
            else:
                self.lock_file = open(self.lock_path, "r+", encoding="utf-8")

            if sys.platform == "win32":
                import msvcrt
                try:
                    self.lock_file.seek(0)
                    msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                except (IOError, OSError):
                    existing_pid = None
                    try:
                        self.lock_file.seek(0)
                        pid_txt = self.lock_file.read().strip()
                        if pid_txt.isdigit():
                            existing_pid = int(pid_txt)
                    except Exception:
                        pass

                    if existing_pid and is_process_running(existing_pid):
                        print(f"{Fore.YELLOW}[LiveWorker Duplicate Check]{Style.RESET_ALL} Worker for Strategy {self.strategy_id} is actively running in PID {existing_pid} (current PID: {os.getpid()}).", flush=True)
                        self.lock_file.close()
                        pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
                    elif existing_pid and not is_process_running(existing_pid):
                        print(f"{Fore.YELLOW}[LiveWorker Lock Notice]{Style.RESET_ALL} Previous PID {existing_pid} is dead. Recovering lock for Strategy {self.strategy_id}...", flush=True)
                        self.lock_file.close()
                        try:
                            os.remove(self.lock_path)
                        except Exception:
                            pass
                        self.lock_file = open(self.lock_path, "w+", encoding="utf-8")
                        try:
                            self.lock_file.seek(0)
                            msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                        except Exception:
                            pass
                    else:
                        print(f"{Fore.YELLOW}[LiveWorker Duplicate Check]{Style.RESET_ALL} Worker for Strategy {self.strategy_id} is locked by another process (current PID: {os.getpid()}).", flush=True)
                        self.lock_file.close()
                        pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
            else:
                import fcntl
                try:
                    fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except (IOError, OSError):
                    print(f"{Fore.YELLOW}[LiveWorker Duplicate Check]{Style.RESET_ALL} Worker for Strategy {self.strategy_id} is already running in another process.", flush=True)
                    self.lock_file.close()
                    pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)

            # Record current PID inside the lock file
            self.lock_file.seek(0)
            self.lock_file.truncate()
            self.lock_file.write(f"{os.getpid()}\n")
            self.lock_file.flush()

        except Exception as ex:
            set_console_quick_edit(True)
            print(f"{Fore.RED}[LiveWorker Lock Error]{Style.RESET_ALL} Failed to check/acquire lock for strategy {self.strategy_id}: {ex}", flush=True)

    def _release_instance_lock(self):
        """
        Releases the single-instance lock upon exit and removes the lock file.
        """
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

        if hasattr(self, 'lock_path') and self.lock_path and os.path.exists(self.lock_path):
            try:
                os.remove(self.lock_path)
            except Exception:
                pass

    def send_update_or_heartbeat(self, state_info: dict = None, status_msg: str = None):
        """
        Updates strategy state in DB and sends heartbeat update to Flask backend.
        """
        now_ts = time.time()
        # Direct DB state update
        if state_info:
            try:
                StrategyHandler.update_strategy_state(self.strategy_id, state_info)
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

                target_broker_symbol = SymbolMappingHandler.map_to_broker(base_symbol, target_acc_id)
                if not target_broker_symbol:
                    print(f"{Fore.YELLOW}[LiveWorker Signal Warning]{Style.RESET_ALL} ⚠️ Broker '{target_broker}' (Account: '{target_acc_id}') has NO mapping for signal symbol '{base_symbol}'. Skipping execution.", flush=True)
                    continue

                balance = float(balance)
                entry_price = float(last_candle["close"])
                pip_size = get_pip_size(target_broker_symbol, entry_price)
                lot_size = get_lot_size(target_broker_symbol)
                atr_val = float(last_candle.get("atr") or 0.0)

                params = TradingHandler.calculate_trade_parameters(
                    symbol=target_broker_symbol,
                    entry_price=entry_price,
                    direction=direction,
                    sl_type=strategy.get("slType", "price"),
                    sl_val=strategy.get("slVal", 1.0),
                    rr=strategy.get("rr", 2.0),
                    size=effective_size,
                    use_risk_sizing=strategy.get("useRiskSizing", False),
                    risk_pct=effective_risk_pct,
                    balance=balance,
                    lot_size=lot_size,
                    pip_size=pip_size,
                    precision=5,
                    atr_val=atr_val
                )

                print(f"{Fore.GREEN}[LiveWorker Trade]{Style.RESET_ALL} Triggering {direction} order on {target_acc_id} ({target_broker_symbol}). Params: {params}", flush=True)

                order_res = BrokerHandler.create_order(
                    target_broker,
                    target_acc_id,
                    symbol=target_broker_symbol,
                    side=direction,
                    volume=params["qty"],
                    price=None,
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
                    sl_str = f"{params['sl_price']:.5f}" if params.get('sl_price') is not None else "None"
                    tp_str = f"{params['tp_price']:.5f}" if params.get('tp_price') is not None else "None"
                    send_discord_message(
                        f"✅ **Real Trade Executed Successfully!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"📦 **Volume:** `{params['qty']}` | 💵 **Entry:** `{params['entry_price']:.5f}`\n"
                        f"🛑 **SL:** `{sl_str}` | 🎯 **TP:** `{tp_str}`"
                    )
            except Exception as ex:
                err_text = str(ex)
                print(f"{Fore.RED}[LiveWorker Error]{Style.RESET_ALL} Error executing trade: {err_text}", flush=True)
                try:
                    from discord_handler import send_discord_message
                    send_discord_message(
                        f"❌ **Trade Execution / SL Error!**\n"
                        f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                        f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
                        f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{direction}`\n"
                        f"⚠️ **Error:** {err_text}"
                    )
                except Exception:
                    pass

    def check_break_even(self, strategy: dict):
        """
        Continuously checks active positions for this strategy across target broker accounts
        and triggers Break-Even SL adjustments when favorable R-multiple price targets are reached.
        """
        if not strategy.get("useBreakEven", False):
            return

        symbol = strategy["symbol"]
        strategy_id = strategy["id"]
        be_trigger_r = float(strategy.get("beTriggerR", 1.0))
        be_offset_mode = strategy.get("beOffsetMode", "half_r")
        sl_type = strategy.get("slType", "price")
        sl_val = float(strategy.get("slVal", 1.0))

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
                if not target_acc_id or str(target_acc_id).strip().lower() in ("none", "null", ""):
                    continue

                positions = BrokerHandler.get_positions(target_broker, target_acc_id) or []
                for p in positions:
                    pos_symbol = SymbolMappingHandler.map_to_main(p.get("symbol"), target_acc_id)
                    broker_symbol = SymbolMappingHandler.map_to_broker(pos_symbol, target_acc_id)
                    if pos_symbol != base_symbol:
                        continue

                    pos_id = p.get("position_id") or p.get("ticket") or p.get("id")
                    if not pos_id:
                        continue

                    pos_key = f"{target_broker}_{target_acc_id}_{pos_id}"
                    if pos_key in self.be_triggered_positions:
                        continue

                    entry_price = float(p.get("entry_price") or p.get("price_open") or p.get("open_price", 0.0))
                    current_price = float(p.get("price_current") or p.get("current_price", entry_price))
                    current_sl = float(p.get("stop_loss") or p.get("sl", 0.0))
                    current_tp = float(p.get("take_profit") or p.get("tp", 0.0))
                    trade_side = str(p.get("trade_side") or p.get("type", "")).upper()

                    if entry_price <= 0:
                        continue

                    pip_size = get_pip_size(broker_symbol or symbol, entry_price)
                    lot_size = get_lot_size(broker_symbol or symbol)
                    sl_type_lower = str(sl_type).lower().strip() if sl_type else "price"

                    if sl_type_lower in ("pips", "pip", "points"):
                        sl_distance = sl_val * pip_size
                    elif sl_type_lower in ("atr", "xatr"):
                        atr_val = 0.0
                        if self.candles_cache and len(self.candles_cache) > 0:
                            atr_val = float(self.candles_cache[-1].get("atr", 0.0))
                        sl_distance = (sl_val * atr_val) if atr_val > 0 else (sl_val * pip_size * 10.0 if pip_size > 0 else sl_val)
                    elif sl_type_lower in ("amount", "$", "dollar", "risk"):
                        qty = float(p.get("volume", 1.0))
                        sl_distance = sl_val / (qty * lot_size) if (lot_size > 0 and qty > 0) else sl_val
                    elif sl_type_lower in ("pct", "percent", "percentage"):
                        sl_distance = entry_price * (sl_val / 100.0)
                    else: # price / delta
                        if pip_size > 0 and (sl_val >= entry_price or (pip_size <= 0.001 and sl_val >= 1.0)):
                            sl_distance = sl_val * pip_size
                        else:
                            sl_distance = sl_val

                    if sl_distance <= 0:
                        continue

                    be_trigger_dist = sl_distance * be_trigger_r

                    # Calculate offset
                    if be_offset_mode == 'zero_be':
                        be_offset = 0.0
                    elif be_offset_mode == 'half_r':
                        be_offset = 0.5 * be_trigger_r * sl_distance
                    else:
                        try:
                            be_offset = float(be_offset_mode) * sl_distance
                        except (ValueError, TypeError):
                            be_offset = 0.5 * be_trigger_r * sl_distance

                    # Evaluate peak high/low
                    recent_high = current_price
                    recent_low = current_price
                    if self.candles_cache and len(self.candles_cache) >= 2:
                        recent_high = max([float(c.get("high", current_price)) for c in self.candles_cache[-5:]] + [current_price])
                        recent_low = min([float(c.get("low", current_price)) for c in self.candles_cache[-5:]] + [current_price])

                    if trade_side in ("BUY", "POSITION_TYPE_BUY", "0"):
                        new_sl = round(entry_price + be_offset, 5)
                        # Check if position already has SL at or above BE
                        if current_sl >= (new_sl - (pip_size * 0.1)):
                            self.be_triggered_positions.add(pos_key)
                            continue

                        if max(current_price, recent_high) >= (entry_price + be_trigger_dist):
                            print(f"{Fore.GREEN}[LiveWorker BE]{Style.RESET_ALL} Modifying BUY position {pos_id} to BE ({new_sl:.5f}) on {target_acc_id} ({symbol}). Entry: {entry_price:.5f}, High: {recent_high:.5f}", flush=True)
                            mod_res = BrokerHandler.modify_position(
                                target_broker,
                                target_acc_id,
                                position_id=pos_id,
                                stop_loss=new_sl,
                                take_profit=current_tp,
                                symbol=broker_symbol
                            )
                            # Always mark as triggered to prevent hammering the broker and spamming notifications
                            self.be_triggered_positions.add(pos_key)
                            if mod_res and (mod_res.get("status") != "error" or mod_res.get("status") == "success"):
                                msg = (
                                    f"🛡️ **Break-Even Triggered!**\n"
                                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                    f"🏦 **Account:** `{target_acc_id}` ({target_broker})\n"
                                    f"📊 **Symbol:** `{symbol}` | ➡️ **BUY Ticket:** `{pos_id}`\n"
                                    f"💵 **Entry:** `{entry_price:.5f}` | 📈 **High:** `{recent_high:.5f}`\n"
                                    f"🔒 **New SL:** `{new_sl:.5f}` (BE Set)"
                                )
                                from discord_handler import send_discord_message
                                from notification_handler import NotificationHandler
                                NotificationHandler.send_notification(msg, sound_type="break_even")
                                send_discord_message(msg)

                    elif trade_side in ("SELL", "POSITION_TYPE_SELL", "1"):
                        new_sl = round(entry_price - be_offset, 5)
                        # Check if position already has SL set at or below BE
                        if current_sl > 0.0 and current_sl <= (new_sl + (pip_size * 0.1)):
                            self.be_triggered_positions.add(pos_key)
                            continue

                        if min(current_price, recent_low) <= (entry_price - be_trigger_dist):
                            print(f"{Fore.GREEN}[LiveWorker BE]{Style.RESET_ALL} Modifying SELL position {pos_id} to BE ({new_sl:.5f}) on {target_acc_id} ({symbol}). Entry: {entry_price:.5f}, Low: {recent_low:.5f}", flush=True)
                            mod_res = BrokerHandler.modify_position(
                                target_broker,
                                target_acc_id,
                                position_id=pos_id,
                                stop_loss=new_sl,
                                take_profit=current_tp,
                                symbol=broker_symbol
                            )
                            # Always mark as triggered to prevent hammering the broker and spamming notifications
                            self.be_triggered_positions.add(pos_key)
                            if mod_res and (mod_res.get("status") != "error" or mod_res.get("status") == "success"):
                                msg = (
                                    f"🛡️ **Break-Even Triggered!**\n"
                                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                    f"🏦 **Account:** `{target_acc_id}` ({target_broker})\n"
                                    f"📊 **Symbol:** `{symbol}` | ➡️ **SELL Ticket:** `{pos_id}`\n"
                                    f"💵 **Entry:** `{entry_price:.5f}` | 📉 **Low:** `{recent_low:.5f}`\n"
                                    f"🔒 **New SL:** `{new_sl:.5f}` (BE Set)"
                                )
                                from discord_handler import send_discord_message
                                from notification_handler import NotificationHandler
                                NotificationHandler.send_notification(msg, sound_type="break_even")
                                send_discord_message(msg)

            except Exception as be_err:
                print(f"{Fore.RED}[LiveWorker BE Error]{Style.RESET_ALL} Error checking Break-Even on target {target}: {be_err}", flush=True)

    def _register_system_exit_handlers(self):
        """
        Registers OS-level process signal handlers (SIGINT, SIGTERM, SIGBREAK)
        and Windows console close events (external termination signals, not trading signals)
        to ensure clean worker shutdown and lock release.
        """
        def handle_exit(sig=None, frame=None):
            print(f"\n{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} OS exit signal received. Stopping worker for {self.strategy_id}...", flush=True)
            self.running = False
            self.send_update_or_heartbeat(status_msg="stopped")
            self._release_instance_lock()
            sys.exit(0)

        # OS Process Signals (Ctrl+C, kill/terminate, break)
        try:
            signal.signal(signal.SIGINT, handle_exit)
            signal.signal(signal.SIGTERM, handle_exit)
            if hasattr(signal, 'SIGBREAK'):
                signal.signal(signal.SIGBREAK, handle_exit)
        except Exception:
            pass

        # Windows Console Close Event Handler (closing terminal window or session)
        if sys.platform == "win32":
            try:
                import ctypes
                from ctypes import wintypes
                PHANDLER_ROUTINE = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

                def win_ctrl_handler(ctrl_type):
                    print(f"\n{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Received console close signal ({ctrl_type}). Exiting...", flush=True)
                    self.running = False
                    self._release_instance_lock()
                    sys.exit(0)

                global _win_ctrl_handler_ref
                _win_ctrl_handler_ref = PHANDLER_ROUTINE(win_ctrl_handler)
                ctypes.windll.kernel32.SetConsoleCtrlHandler(_win_ctrl_handler_ref, True)
            except Exception as ex:
                print(f"[LiveWorker] Console handler note: {ex}", flush=True)

    def _initialize_startup_session(self, strategy: dict):
        """Prints startup banner and configures console window title for the active strategy session."""
        strat_name = strategy.get("name") or f"Strategy {self.strategy_id}"
        strat_sym = strategy["symbol"]
        strat_tf = strategy["timeframe"]

        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.kernel32.SetConsoleTitleW(f"Live Strategy: {strat_name} | {strat_sym} [{strat_tf}]")
            except Exception:
                pass

        strat_broker = strategy["broker"]
        strat_lookback = strategy["lookbackWindow"]
        strat_sl_val = strategy["slVal"]
        strat_sl_type = strategy["slType"]
        strat_rr = strategy["rr"]
        strat_risk_sizing = strategy["useRiskSizing"]
        strat_size = strategy.get("size")
        strat_risk_pct = strategy.get("riskPct")
        
        strat_use_be = strategy.get("useBreakEven")
        strat_be_trigger = strategy.get("beTriggerR")
        strat_be_mode = strategy.get("beOffsetMode")
        strat_rule = strategy.get("entryStabilityRule")
        strat_allow_opp = strategy.get("allowOppositeClose")
        
        strat_tz = strategy.get("timezone")
        strat_use_gc = strategy.get("useGlobalClose")
        strat_gc_time = strategy.get("globalCloseTime")
        strat_use_cutoff = strategy.get("useEntryCutoff")
        strat_cutoff_time = strategy.get("entryCutoffTime")
        strat_sessions = strategy.get("sessions") or []
        strat_targets = strategy.get("targets") or []
        
        strat_daily_mode = strategy.get("dailyFirstSignalsMode")
        strat_daily_count = strategy.get("dailyFirstSignalsCount")
        strat_daily_mult = strategy.get("dailyFirstSignalsRiskMult")

        targets_str = ", ".join([f"{t.get('broker')}:{t.get('account_id')}" for t in strat_targets]) if strat_targets else f"{strat_broker}:{strategy.get('account_id')}"
        sessions_str = ", ".join([f"{s.get('id')}({s.get('start')}-{s.get('end')})" for s in strat_sessions]) if strat_sessions else "24/7 (No restrictions)"
        daily_signals_str = f"{str(strat_daily_mode).upper()} (Count: {strat_daily_count}, Risk: {strat_daily_mult})" if strat_daily_mode and strat_daily_mode != 'disabled' else "Disabled (Take all signals)"

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
        print(f"  {Fore.WHITE}• Sessions & Close  :{Style.RESET_ALL} TZ={strat_tz} | Sessions=[{sessions_str}] | GlobalClose={strat_use_gc} ({strat_gc_time}) | EntryCutoff={strat_use_cutoff} ({strat_cutoff_time})", flush=True)
        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*60}\n{Style.RESET_ALL}", flush=True)

    def sync_candles(self, strategy: dict, resolved: dict) -> list:
        """
        Synchronizes candlestick data via warm-up fetching or incremental polling updates.
        Returns the updated candles list from self.candles_cache.
        """
        symbol = resolved["symbol"]
        strat_broker_symbol = resolved["broker_symbol"]
        broker_name = resolved["broker_name"]
        handler = resolved["handler"]
        strat_acc_id = resolved["account_id"]
        timeframe = strategy["timeframe"]
        lookback = strategy["lookbackWindow"]

        opt = strategy.get("dateRangeOption", "last_candles")
        custom_from = strategy.get("customFrom", "")
        custom_to = strategy.get("customTo", "")
        limit = strategy.get("candleLimit", 5000)

        curr_config = (symbol, strat_broker_symbol, timeframe, lookback, broker_name, opt, custom_from, custom_to, limit)
        if self.cache_config_fingerprint != curr_config or not self.candles_cache:
            self.cache_config_fingerprint = curr_config
            date_from, date_to = calculate_date_bounds(opt, custom_from, custom_to)
            print(f"{Fore.CYAN}[LiveWorker Warmup]{Style.RESET_ALL} Fetching historical candles for {strat_broker_symbol} ({timeframe}) from {broker_name}...", flush=True)
            candles = handler.fetch_candles(
                symbol=strat_broker_symbol,
                timeframe=timeframe,
                limit=limit,
                date_from=date_from,
                date_to=date_to,
                login=strat_acc_id,
                account_id=strat_acc_id
            )

            if candles:
                self.candles_cache = candles
                print(f"{Fore.GREEN}[LiveWorker Warmup Success]{Style.RESET_ALL} Warm-up completed with {len(self.candles_cache)} candles.", flush=True)
            else:
                print(f"{Fore.RED}[LiveWorker Warmup Error]{Style.RESET_ALL} Failed to fetch warm-up candles.", flush=True)
                self.candles_cache = []
        else:
            # Incremental fetch: retrieve only the latest 10 candles and merge with local history
            new_candles = handler.fetch_candles(
                symbol=strat_broker_symbol,
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
                self.candles_cache = [merge_map[t] for t in sorted_times]

        return self.candles_cache

    def run(self):
        print(f"{Fore.CYAN}[LiveWorker]{Style.RESET_ALL} Starting live strategy worker for Strategy ID: {Style.BRIGHT}{self.strategy_id}{Style.RESET_ALL} (PID: {os.getpid()})", flush=True)
        self._register_system_exit_handlers()

        first_run = True

        # Main evaluation loop
        while self.running:
            try:
                strategy = StrategyHandler.get_strategy(self.strategy_id)
                if not strategy:
                    print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Strategy {self.strategy_id} not found in database. Exiting...", flush=True)
                    break

                if strategy.get("status") != "active":
                    print(f"{Fore.YELLOW}[LiveWorker]{Style.RESET_ALL} Strategy {self.strategy_id} is no longer active (status='{strategy.get('status')}'). Exiting worker...", flush=True)
                    break

                # Strict configuration validation & normalization via StrategyHandler
                try:
                    strategy = StrategyHandler.get_strategy_settings(strategy, strict=True)
                except ValueError as val_err:
                    set_console_quick_edit(True)
                    err_msg = f"CRITICAL: Strategy {self.strategy_id} configuration integrity error: {val_err}. Aborting live execution."
                    print(f"\n{Fore.RED}{Style.BRIGHT}{'='*70}", flush=True)
                    print(f"{Fore.RED}{Style.BRIGHT}  ❌ LIVE STRATEGY INTEGRITY ERROR: ABORTING", flush=True)
                    print(f"{Fore.RED}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}", flush=True)
                    print(f"  {Fore.YELLOW}{err_msg}{Style.RESET_ALL}\n", flush=True)
                    
                    try:
                        from discord_handler import send_discord_message
                        send_discord_message(f"🚨 **Live Worker Aborted!**\n`{err_msg}`")
                    except Exception:
                        pass
                    
                    self.send_update_or_heartbeat(
                        state_info={
                            "stage": "ABORTED",
                            "status_message": err_msg,
                            "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        },
                        status_msg="error"
                    )
                    self._release_instance_lock()
                    pause_and_exit(1, "Strategy integrity error. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)

                # =========================================================================
                # ONE-TIME STARTUP INITIALIZATION (first_run lifecycle)
                # =========================================================================
                if first_run:
                    first_run = False
                    self._initialize_startup_session(strategy)

                # =========================================================================
                # 1. MARKET ADAPTER & SYMBOL RESOLUTION
                # =========================================================================
                resolved = StrategyHandler.resolve_broker_and_symbol(strategy)
                symbol = resolved["symbol"]
                strat_broker_symbol = resolved["broker_symbol"]
                broker_name = resolved["broker_name"]
                handler = resolved["handler"]
                strat_acc_id = resolved["account_id"]
                timeframe = strategy["timeframe"]
                lookback = strategy["lookbackWindow"]

                if not resolved["is_valid"]:
                    print(f"{Fore.YELLOW}[LiveWorker Warning]{Style.RESET_ALL} {resolved['error_message']}", flush=True)
                    self.send_update_or_heartbeat(state_info={
                        "stage": "UNKNOWN",
                        "status_message": resolved["error_message"],
                        "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    })
                    time.sleep(5)
                    continue

                # =========================================================================
                # 2. CANDLE DATA SYNC (WARM-UP vs INCREMENTAL UPDATE)
                # =========================================================================
                candles = self.sync_candles(strategy, resolved)

                # =========================================================================
                # 3. SIGNAL EVALUATION & EXECUTION PIPELINE
                # =========================================================================
                if not self.candles_cache or len(self.candles_cache) < lookback + 10:
                    self.send_update_or_heartbeat(state_info={
                        "stage": "UNKNOWN",
                        "status_message": "Error: Failed to fetch candles or insufficient candle count.",
                        "last_checked": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    })
                else:
                    buy, sell, state_info, wyckoff_candles = StrategyHandler.evaluate_signal(
                        candles=self.candles_cache,
                        strategy_or_params=strategy,
                        is_live=True
                    )
                    recent_candles = wyckoff_candles[-5000:] if len(wyckoff_candles) > 5000 else wyckoff_candles
                    state_info["candles"] = recent_candles
                    self.send_update_or_heartbeat(state_info=state_info)

                    # Inspect the last fully closed candle (index -2; index -1 is currently forming)
                    last_completed_candle = wyckoff_candles[-2] if len(wyckoff_candles) >= 2 else {}
                    candle_time = int(last_completed_candle.get("time", 0))

                    # Ensure trade trigger executes only once per closed bar timestamp
                    if self.last_processed_candle_time != candle_time and candle_time > 0:
                        self.last_processed_candle_time = candle_time
                        if buy or sell:
                            direction = "BUY" if buy else "SELL"
                            close_price = last_completed_candle.get("close", 0)
                            allow_opp = strategy.get("allowOppositeClose", True)
                            print(f"{Fore.GREEN}[LiveWorker SIGNAL DETECTED]{Style.RESET_ALL} {direction} at {close_price:.5f} (Opposite close: {allow_opp})", flush=True)

                            from discord_handler import send_discord_message
                            
                            # Estimate baseline SL / TP for signal alert
                            sl_info_str = ""
                            try:
                                atr_val = float(last_completed_candle.get("atr") or 0.0)
                                sig_pip_size = get_pip_size(symbol, float(close_price))
                                sig_lot_size = get_lot_size(symbol)
                                sig_params = TradingHandler.calculate_trade_parameters(
                                    symbol=symbol,
                                    entry_price=float(close_price),
                                    direction=direction,
                                    sl_type=strategy.get("slType", "price"),
                                    sl_val=strategy.get("slVal", 1.0),
                                    rr=strategy.get("rr", 2.0),
                                    size=float(strategy.get("size") or 1.0),
                                    use_risk_sizing=False,
                                    risk_pct=1.0,
                                    balance=10000.0,
                                    lot_size=sig_lot_size,
                                    pip_size=sig_pip_size,
                                    precision=5,
                                    atr_val=atr_val
                                )
                                sl_price_val = sig_params.get("sl_price")
                                tp_price_val = sig_params.get("tp_price")
                                if sl_price_val is not None and tp_price_val is not None:
                                    sl_info_str = f"🛑 **SL:** `{sl_price_val:.5f}` | 🎯 **TP:** `{tp_price_val:.5f}`\n"
                            except Exception:
                                pass

                            send_discord_message(
                                f"🚨 **New Trade Signal Detected!**\n"
                                f"🎛️ **Strategy ID:** `{self.strategy_id}`\n"
                                f"📊 **Symbol:** `{symbol}`\n"
                                f"⏱️ **Timeframe:** `{timeframe}`\n"
                                f"➡️ **Direction:** `{direction}`\n"
                                f"💵 **Price:** `{close_price:.5f}`\n"
                                f"{sl_info_str}"
                                f"🔄 **Allow Opposite Close:** `{allow_opp}`"
                            )

                            try:
                                from notification_handler import NotificationHandler
                                strat_name = strategy.get("name") or strategy.get("strategy_name") or f"Strategy {self.strategy_id}"
                                stage_label = state_info.get("stage", "N/A") if isinstance(state_info, dict) else "N/A"
                                push_title = f"🚨 {direction} Signal: {symbol} ({timeframe})"
                                push_body = (
                                    f"Strategy: {strat_name} (ID: {self.strategy_id})\n"
                                    f"Signal: {direction} @ {close_price:.5f}\n"
                                    f"Stage: {stage_label} | Opp Close: {allow_opp}"
                                )
                                NotificationHandler.send_web_push(
                                    title=push_title,
                                    body=push_body,
                                    url="/dashboard"
                                )
                            except Exception as push_err:
                                print(f"[LiveWorker Error] Failed to send web push: {push_err}", flush=True)

                            # Dispatch live order creation to broker accounts
                            self.execute_trades(strategy, buy, sell, last_completed_candle)

                            new_trade = {
                                "id": len(self.trades_cache) + 1,
                                "type": direction,
                                "entry_time": last_completed_candle["time"],
                                "entry_price": last_completed_candle.get("close", 0.0),
                                "status": "OPEN",
                                "profit": 0.0
                            }
                            self.trades_cache.append(new_trade)

                # Continuous Break-Even evaluation on every cycle
                self.check_break_even(strategy)

            except Exception as err:
                print(f"{Fore.RED}[LiveWorker Exception]{Style.RESET_ALL} Loop error in {self.strategy_id}: {err}", flush=True)
                import traceback
                traceback.print_exc()

            time.sleep(5)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Live Strategy Worker Process")
    parser.add_argument('--strategy_id', type=str, required=True, help="Strategy ID to run")
    parser.add_argument('--quickedit', action='store_true', default=False, help="Enable Windows Console QuickEdit mode for debugging")
    args = parser.parse_args()

    set_console_quick_edit(args.quickedit)
    try:
        worker = LiveWorker(strategy_id=args.strategy_id)
        worker.run()
        pause_and_exit(0, "Worker execution finished. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
    except Exception as e:
        set_console_quick_edit(True)
        print(f"\n{Fore.RED}[LiveWorker Fatal Error]{Style.RESET_ALL} Unhandled exception in live worker: {e}", flush=True)
        import traceback
        traceback.print_exc()
        pause_and_exit(1, "QuickEdit enabled. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
