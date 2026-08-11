import time
import threading
import traceback
import socket
from live_strategy_handler import LiveStrategyHandler
from sql_handler import SQLHandler
from broker_handler import BrokerHandler
from backtest_helpers import get_pip_size
from discord_handler import send_discord_message
from notification_handler import NotificationHandler

class PositionManager:
    _thread = None
    _stop_event = threading.Event()
    # Cache known open position IDs per target account: { (target_acc_id, position_id): pos_data }
    _known_positions = {}

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

            # Poll position updates every 5 seconds
            cls._stop_event.wait(5)

    @classmethod
    def _manage_strategy_positions(cls, strategy: dict):
        strategy_id = strategy["id"]
        symbol = strategy["symbol"]
        be_trigger_r = float(strategy.get("beTriggerR", 1.0))
        sl_type = strategy.get("slType", "pips")
        sl_val = float(strategy.get("slVal", 10.0))
        use_be = strategy.get("useBreakEven", False)

        targets = strategy.get("targets", [])
        if not targets:
            broker_name = strategy.get("broker", "metatrader")
            targets = [{"broker": broker_name, "account_id": strategy.get("account_id")}]

        magic = abs(hash(strategy_id)) & 0x7FFFFFFF

        for target in targets:
            target_broker = target.get("broker") or "metatrader"
            target_acc_id = target.get("account_id")
            if not target_acc_id or str(target_acc_id).strip().lower() in ("none", "null", ""):
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

            current_pos_keys = set()

            for pos in positions:
                # Check matching magic / symbol
                pos_magic = pos.get("magic")
                pos_symbol = str(pos.get("symbol", "")).upper()
                strat_symbol = str(symbol).upper()

                if pos_symbol != strat_symbol:
                    continue

                if pos_magic is not None and pos_magic != magic and str(pos_magic) != str(magic):
                    continue

                position_id = pos.get("id") or pos.get("position_id") or pos.get("ticket")
                if not position_id:
                    continue

                pos_key = (target_acc_id, str(position_id))
                current_pos_keys.add(pos_key)

                entry_price = float(pos.get("price_open", pos.get("open_price", 0.0)))
                current_price = float(pos.get("price_current", pos.get("current_price", entry_price)))
                current_sl = float(pos.get("sl", pos.get("stop_loss", 0.0)))
                current_tp = float(pos.get("tp", pos.get("take_profit", 0.0)))
                pos_type = str(pos.get("type", "")).upper() # BUY or SELL

                # Save / update position snapshot in memory
                cls._known_positions[pos_key] = {
                    "strategy_id": strategy_id,
                    "target_acc_id": target_acc_id,
                    "target_broker": target_broker,
                    "symbol": symbol,
                    "position_id": position_id,
                    "entry_price": entry_price,
                    "last_price": current_price,
                    "sl": current_sl,
                    "tp": current_tp,
                    "type": pos_type,
                    "volume": pos.get("volume", 0.0)
                }

                if entry_price <= 0 or not use_be:
                    continue

                # Determine Risk Distance R for BE evaluation
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

                # Fetch recent candles to check highest high / lowest low since position was opened (handles rapid price spikes)
                recent_high = current_price
                recent_low = current_price
                try:
                    candles = handler.fetch_candles(symbol=symbol, timeframe=strategy.get("timeframe", "M1"), limit=5)
                    if candles:
                        recent_high = max(float(c.get("high", current_price)) for c in candles)
                        recent_low = min(float(c.get("low", current_price)) for c in candles)
                except Exception:
                    pass

                # Check BUY position Break-Even
                if pos_type in ("BUY", "POSITION_TYPE_BUY", "0"):
                    if max(current_price, recent_high) >= (entry_price + be_trigger_dist):
                        if current_sl < (entry_price - (pip_size * 0.5)):
                            print(f"[Position Manager] Setting BUY position {position_id} to BE on {symbol} (Acc: {target_acc_id}). Entry: {entry_price}, High: {recent_high}, Current: {current_price}, Old SL: {current_sl}", flush=True)
                            mod_res = handler.modify_position(
                                position_id=position_id,
                                stop_loss=entry_price,
                                take_profit=current_tp,
                                symbol=symbol,
                                **target_kwargs
                            )
                            if mod_res and mod_res.get("status") != "error":
                                cls._known_positions[pos_key]["sl"] = entry_price
                                msg = (
                                    f"🛡️ **Break-Even Triggered!**\n"
                                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                    f"🏦 **Target Account:** `{target_acc_id}` ({target_broker})\n"
                                    f"📊 **Symbol:** `{symbol}` | ➡️ **BUY Position ID:** `{position_id}`\n"
                                    f"💵 **Entry Price:** `{entry_price:.5f}` | 💵 **Peak High:** `{recent_high:.5f}`\n"
                                    f"🔒 **New Stop Loss:** `{entry_price:.5f}` (BE Set)"
                                )
                                NotificationHandler.send_notification(msg, sound_type="break_even")
                                send_discord_message(msg)

                # Check SELL position Break-Even
                elif pos_type in ("SELL", "POSITION_TYPE_SELL", "1"):
                    if min(current_price, recent_low) <= (entry_price - be_trigger_dist):
                        if current_sl == 0.0 or current_sl > (entry_price + (pip_size * 0.5)):
                            print(f"[Position Manager] Setting SELL position {position_id} to BE on {symbol} (Acc: {target_acc_id}). Entry: {entry_price}, Low: {recent_low}, Current: {current_price}, Old SL: {current_sl}", flush=True)
                            mod_res = handler.modify_position(
                                position_id=position_id,
                                stop_loss=entry_price,
                                take_profit=current_tp,
                                symbol=symbol,
                                **target_kwargs
                            )
                            if mod_res and mod_res.get("status") != "error":
                                cls._known_positions[pos_key]["sl"] = entry_price
                                msg = (
                                    f"🛡️ **Break-Even Triggered!**\n"
                                    f"🎛️ **Strategy ID:** `{strategy_id}`\n"
                                    f"🏦 **Target Account:** `{target_acc_id}` ({target_broker})\n"
                                    f"📊 **Symbol:** `{symbol}` | ➡️ **SELL Position ID:** `{position_id}`\n"
                                    f"💵 **Entry Price:** `{entry_price:.5f}` | 💵 **Peak Low:** `{recent_low:.5f}`\n"
                                    f"🔒 **New Stop Loss:** `{entry_price:.5f}` (BE Set)"
                                )
                                NotificationHandler.send_notification(msg, sound_type="break_even")
                                send_discord_message(msg)

            # Check for closed positions (previously known but no longer in positions list)
            known_target_keys = [k for k in cls._known_positions.keys() if k[0] == target_acc_id and cls._known_positions[k]["symbol"] == symbol]
            for key in known_target_keys:
                if key not in current_pos_keys:
                    prev = cls._known_positions.pop(key, None)
                    if prev:
                        cls._notify_closed_position(prev, target_kwargs)

    @classmethod
    def _notify_closed_position(cls, pos: dict, target_kwargs: dict):
        position_id = pos["position_id"]
        strategy_id = pos["strategy_id"]
        target_acc_id = pos["target_acc_id"]
        target_broker = pos["target_broker"]
        symbol = pos["symbol"]
        entry_price = pos["entry_price"]
        sl = pos["sl"]
        tp = pos["tp"]
        side = pos["type"]

        pip_size = get_pip_size(symbol, entry_price)
        is_be = abs(sl - entry_price) <= (pip_size * 1.5) if sl > 0 else False

        # Attempt to fetch exact exit details from history
        handler = BrokerHandler.get_handler(target_broker)
        close_reason = "Position Closed"
        exit_price = pos["last_price"]

        try:
            if hasattr(handler, "get_history_trades"):
                history = handler.get_history_trades(**target_kwargs)
                matching = [h for h in history if str(h.get("ticket") or h.get("position_id")) == str(position_id)]
                if matching:
                    last_h = matching[-1]
                    exit_price = float(last_h.get("price", last_h.get("close_price", exit_price)))
        except Exception:
            pass

        if is_be:
            close_reason = "Break-Even Hit 🛡️"
            emoji = "🛡️"
        elif tp > 0 and abs(exit_price - tp) <= (pip_size * 3):
            close_reason = "Take-Profit Hit 🎯"
            emoji = "🎯"
        elif sl > 0 and abs(exit_price - sl) <= (pip_size * 3):
            close_reason = "Stop-Loss Hit 🛑"
            emoji = "🛑"
        else:
            close_reason = "Position Closed 🏁"
            emoji = "🏁"

        NotificationHandler.send_notification(
            f"{emoji} **Trade Closed: {close_reason}**\n"
            f"🎛️ **Strategy ID:** `{strategy_id}`\n"
            f"🏦 **Broker:** `{target_broker}` (Acc: `{target_acc_id}`)\n"
            f"📊 **Symbol:** `{symbol}` | ➡️ **Side:** `{side}` | 🆔 **Ticket:** `{position_id}`\n"
            f"💵 **Entry:** `{entry_price:.5f}` | 💵 **Exit / Last:** `{exit_price:.5f}`\n"
            f"🛑 **SL:** `{sl:.5f}` | 🎯 **TP:** `{tp:.5f}`",
            sound_type="break_even" if is_be else "trade_close"
        )

