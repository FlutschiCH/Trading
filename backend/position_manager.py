import time
import threading
import traceback
import socket
from live_strategy_handler import LiveStrategyHandler
from sql_handler import SQLHandler
from broker_handler import BrokerHandler
from backtest_helpers import get_pip_size
from discord_handler import send_discord_message

class PositionManager:
    _thread = None
    _stop_event = threading.Event()

    @classmethod
    def start(cls):
        if cls._thread and cls._thread.is_alive():
            print("[Position Manager] Already running.", flush=True)
            return
        cls._stop_event.clear()
        cls._thread = threading.Thread(target=cls._run_loop, daemon=True)
        cls._thread.start()
        print("[Position Manager] Started background position manager thread.", flush=True)

    @classmethod
    def stop(cls):
        cls._stop_event.set()
        if cls._thread:
            cls._thread.join(timeout=5)
            print("[Position Manager] Stopped background position manager thread.", flush=True)

    @classmethod
    def _run_loop(cls):
        try:
            comp_name = socket.gethostname().strip().lower()
        except Exception:
            comp_name = "unknown"

        while not cls._stop_event.is_set():
            try:
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
                        cls._manage_strategy_positions(strategy)
                    except Exception as e:
                        print(f"[Position Manager] Error checking strategy {strategy.get('id')}: {e}", flush=True)

            except Exception as e:
                print(f"[Position Manager] Loop error: {e}", flush=True)

            # Poll position updates every 3 seconds
            cls._stop_event.wait(3)

    @classmethod
    def _manage_strategy_positions(cls, strategy: dict):
        if not strategy.get("useBreakEven", False):
            return

        strategy_id = strategy["id"]
        symbol = strategy["symbol"]
        be_trigger_r = float(strategy.get("beTriggerR", 1.0))
        sl_type = strategy.get("slType", "pips")
        sl_val = float(strategy.get("slVal", 10.0))

        targets = strategy.get("targets", [])
        if not targets:
            broker_name = strategy.get("broker", "metatrader")
            targets = [{"broker": broker_name, "account_id": strategy.get("account_id")}]

        magic = abs(hash(strategy_id)) & 0x7FFFFFFF

        for target in targets:
            target_broker = target.get("broker") or "metatrader"
            target_acc_id = target.get("account_id")
            if not target_acc_id:
                continue

            # Fetch account credentials
            rows = SQLHandler.execute_query("SELECT * FROM accounts WHERE account_id = %s", (target_acc_id,))
            target_kwargs = {}
            if rows:
                acc_row = rows[0]
                if target_broker == "metatrader":
                    target_kwargs = {
                        "login": int(target_acc_id) if str(target_acc_id).isdigit() else target_acc_id,
                        "password": acc_row.get("password"),
                        "server": acc_row.get("server")
                    }
                elif target_broker == "ctrader":
                    target_kwargs = {
                        "account_id": target_acc_id,
                        "password": acc_row.get("password")
                    }

            handler = BrokerHandler.get_handler(target_broker)
            if not handler:
                continue

            try:
                positions = handler.get_positions(**target_kwargs)
            except Exception as e:
                print(f"[Position Manager] Failed to get positions for target {target_acc_id}: {e}", flush=True)
                continue

            for pos in positions:
                # Check matching magic / symbol
                pos_magic = pos.get("magic")
                pos_symbol = pos.get("symbol")

                # Match strategy magic or symbol
                if pos_symbol != symbol and pos_magic != magic:
                    continue

                position_id = pos.get("id") or pos.get("position_id") or pos.get("ticket")
                if not position_id:
                    continue

                entry_price = float(pos.get("price_open", pos.get("open_price", 0.0)))
                current_price = float(pos.get("price_current", pos.get("current_price", entry_price)))
                current_sl = float(pos.get("sl", pos.get("stop_loss", 0.0)))
                pos_type = str(pos.get("type", "")).upper() # BUY or SELL

                if entry_price <= 0:
                    continue

                # Determine Risk Distance R
                pip_size = get_pip_size(symbol, entry_price)
                if sl_type == "pips":
                    risk_dist = sl_val * pip_size
                elif sl_type == "price":
                    risk_dist = abs(entry_price - sl_val)
                else: # percent / default
                    risk_dist = entry_price * (sl_val / 100.0)

                if risk_dist <= 0:
                    continue

                be_trigger_dist = risk_dist * be_trigger_r

                # Check BUY position
                if pos_type in ("BUY", "POSITION_TYPE_BUY", "0"):
                    # Trigger condition: price moved up by BE trigger distance
                    if current_price >= (entry_price + be_trigger_dist):
                        # Check if SL is not already set at or above Break-Even (entry_price)
                        if current_sl < (entry_price - (pip_size * 0.5)):
                            print(f"[Position Manager] Setting BUY position {position_id} to BE on {symbol} (Acc: {target_acc_id}). Entry: {entry_price}, Current: {current_price}, Old SL: {current_sl}", flush=True)
                            mod_res = handler.modify_position(
                                position_id=position_id,
                                stop_loss=entry_price,
                                take_profit=pos.get("tp"),
                                symbol=symbol,
                                **target_kwargs
                            )
                            if mod_res and mod_res.get("status") != "error":
                                send_discord_message(
                                    f"🛡️ **Break-Even Triggered!**\n"
                                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                    f"🏦 **Target Account:** `{target_acc_id}` ({target_broker})\n"
                                    f"📊 **Symbol:** `{symbol}` | ➡️ **BUY Position ID:** `{position_id}`\n"
                                    f"💵 **Entry Price:** `{entry_price:.5f}` | 💵 **Current Price:** `{current_price:.5f}`\n"
                                    f"🔒 **New Stop Loss:** `{entry_price:.5f}` (BE Set)"
                                )

                # Check SELL position
                elif pos_type in ("SELL", "POSITION_TYPE_SELL", "1"):
                    # Trigger condition: price moved down by BE trigger distance
                    if current_price <= (entry_price - be_trigger_dist):
                        # Check if SL is not already set at or below Break-Even (entry_price)
                        if current_sl == 0.0 or current_sl > (entry_price + (pip_size * 0.5)):
                            print(f"[Position Manager] Setting SELL position {position_id} to BE on {symbol} (Acc: {target_acc_id}). Entry: {entry_price}, Current: {current_price}, Old SL: {current_sl}", flush=True)
                            mod_res = handler.modify_position(
                                position_id=position_id,
                                stop_loss=entry_price,
                                take_profit=pos.get("tp"),
                                symbol=symbol,
                                **target_kwargs
                            )
                            if mod_res and mod_res.get("status") != "error":
                                send_discord_message(
                                    f"🛡️ **Break-Even Triggered!**\n"
                                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                    f"🏦 **Target Account:** `{target_acc_id}` ({target_broker})\n"
                                    f"📊 **Symbol:** `{symbol}` | ➡️ **SELL Position ID:** `{position_id}`\n"
                                    f"💵 **Entry Price:** `{entry_price:.5f}` | 💵 **Current Price:** `{current_price:.5f}`\n"
                                    f"🔒 **New Stop Loss:** `{entry_price:.5f}` (BE Set)"
                                )
