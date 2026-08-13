import logging
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    logging.warning("MetaTrader5 package is not installed or not supported on this platform. Running in mock/simulation mode.")

from base_broker_handler import BaseBrokerHandler

import builtins
if not hasattr(builtins, "_GLOBAL_MT5_CONNECTION_STATES"):
    builtins._GLOBAL_MT5_CONNECTION_STATES = {}
if not hasattr(builtins, "_GLOBAL_MT5_INSTANCES"):
    builtins._GLOBAL_MT5_INSTANCES = {}

class MetaTraderHandler(BaseBrokerHandler):
    DEBUG_LOGGING = False
    _connection_states = builtins._GLOBAL_MT5_CONNECTION_STATES
    _mt5_instances = builtins._GLOBAL_MT5_INSTANCES

    @staticmethod
    def _initialize_mt5(login: int = None, password: str = None, server: str = None, terminal_path: str = None) -> bool:
        if not MT5_AVAILABLE:
            return False

        if login and builtins._GLOBAL_MT5_CONNECTION_STATES.get(str(login)):
            return True

        import os
        import shutil
        import sys
        import importlib.util

        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(backend_dir)
        mt5_dir = os.path.join(project_root, "mt5")
        
        target_dir = os.path.join(mt5_dir, f"mt5_{login}") if login else None
        target_plugin_dir = os.path.join(mt5_dir, f"mt5_plugin_{login}") if login else None
        path = os.path.join(target_dir, "terminal64.exe") if target_dir else None

        # Check if target account terminal folder exists; if not, copy from mt5_base to provision instance
        if target_dir and not os.path.exists(target_dir):
            base_template = os.path.join(mt5_dir, "mt5_base")
            if os.path.exists(base_template):
                try:
                    print(f"[MetaTrader Provisioning] Copying mt5_base to {target_dir}...", flush=True)
                    shutil.copytree(base_template, target_dir)
                except Exception as e:
                    print(f"[MetaTrader Terminal Provisioning Error] Account {login}: {e}", flush=True)

        # Check if target account plugin folder exists; if not, copy from mt5_plugin_base
        if target_plugin_dir and not os.path.exists(target_plugin_dir):
            base_plugin_template = os.path.join(mt5_dir, "mt5_plugin_base")
            if os.path.exists(base_plugin_template):
                try:
                    print(f"[MetaTrader Provisioning] Copying mt5_plugin_base to {target_plugin_dir}...", flush=True)
                    shutil.copytree(base_plugin_template, target_plugin_dir)
                except Exception as e:
                    print(f"[MetaTrader Plugin Provisioning Error] Account {login}: {e}", flush=True)

        # Dynamically import isolated MetaTrader5 module per account from its dedicated plugin folder
        acc_key = str(login) if login else "default"
        mt5_module = None

        if target_plugin_dir and os.path.exists(target_plugin_dir):
            init_file = os.path.join(target_plugin_dir, "__init__.py")
            if os.path.exists(init_file):
                module_name = f"MetaTrader5_acc_{login}"
                try:
                    spec = importlib.util.spec_from_file_location(module_name, init_file)
                    if spec and spec.loader:
                        mod = importlib.util.module_from_spec(spec)
                        mod.__path__ = [target_plugin_dir]
                        sys.modules[module_name] = mod
                        spec.loader.exec_module(mod)
                        mt5_module = mod
                        print(f"[MetaTrader Plugin Loaded] Account {login}: Loaded isolated module '{module_name}' from {target_plugin_dir}", flush=True)
                except Exception as e:
                    print(f"[MetaTrader Plugin Import Warning] Account {login}: {e}", flush=True)

        if mt5_module is None or not hasattr(mt5_module, "initialize"):
            print(f"[MetaTrader Plugin Error] Account {login}: Isolated C-extension module not available in {target_plugin_dir}. Skipping shared fallback.", flush=True)
            return False

        if not login or not password or not server:
            print(f"[MetaTrader Initialization Skipped] Missing required credentials (login={login}, password={'***' if password else None}, server={server})", flush=True)
            return False

        try:
            acc_info = mt5_module.account_info()
            term_info = mt5_module.terminal_info()
            if term_info is not None:
                if acc_info is not None and str(acc_info.login) == str(login):
                    builtins._GLOBAL_MT5_INSTANCES[str(login)] = mt5_module
                    builtins._GLOBAL_MT5_CONNECTION_STATES[str(login)] = True
                    return True
        except Exception as e:
            print(f"[MetaTrader Check Login Exception] {e}", flush=True)

        print(f"[MetaTrader Connecting Instance] Account: {login} | Server: {server} | Path: {path}", flush=True)

        success = False
        try:
            success = mt5_module.initialize(path=path, login=int(login), password=password, server=server, portable=True, timeout=30000)
            if success:
                mt5_module.login(login=int(login), password=password, server=server)
            else:
                err_code, err_desc = mt5_module.last_error() if hasattr(mt5_module, "last_error") else ("unknown", "unknown")
                print(f"[MetaTrader Initialization Failure] Account: {login} | Path: {path} | Error: {err_code} ({err_desc})", flush=True)
        except Exception as e:
            err_code, err_desc = ("exception", str(e))
            if hasattr(mt5_module, "last_error"):
                try:
                    err_code, err_desc = mt5_module.last_error()
                except Exception:
                    pass
            print(f"[MetaTrader Initialization Exception] Account: {login} | Path: {path} | Error: {err_code} ({err_desc})", flush=True)

        if success and login:
            builtins._GLOBAL_MT5_INSTANCES[str(login)] = mt5_module
            builtins._GLOBAL_MT5_CONNECTION_STATES[str(login)] = True
            print(f"[MetaTrader Connected Instance] Account: {login} | Server: {server} | Path: {path}", flush=True)
        return success

    @staticmethod
    def get_mt5_instance(account_id: str = None):
        if not MT5_AVAILABLE or not account_id or str(account_id).strip().lower() in ("none", "null", ""):
            return None

        acc_str = str(account_id) if account_id else None
        instances = getattr(builtins, '_GLOBAL_MT5_INSTANCES', MetaTraderHandler._mt5_instances)
        inst = instances.get(acc_str) if acc_str else None

        if not inst and acc_str:
            print(f"[MetaTrader Fetch Instance] Instance not active for '{acc_str}'. Resolving credentials and initializing...", flush=True)
            login, password, server = MetaTraderHandler._resolve_credentials(account_id=acc_str)
            if login and password and server:
                success = MetaTraderHandler._initialize_mt5(login=login, password=password, server=server)
                if success:
                    inst = instances.get(acc_str)

        if inst:
            acc_info = inst.account_info()
            if acc_info is not None:
                pass
            else:
                err = inst.last_error() if hasattr(inst, 'last_error') else ("unknown", "unknown")
                print(f"[MetaTrader DEBUG] account_info() failed for Account '{acc_str}' | Error: {err}", flush=True)

        return inst

    @staticmethod
    def _resolve_credentials(login=None, password=None, server=None, **kwargs):
        kw_acc = kwargs.get('account_id') or kwargs.get('account') or kwargs.get('login')
        req_login = kw_acc if kw_acc is not None else login
        req_server = kwargs.get('server') or server
        req_password = kwargs.get('password') or password

        if req_login is None:
            raise ValueError("No account_id / login provided for MetaTrader credentials lookup.")

        from account_handler import AccountHandler
        accounts = AccountHandler.get_accounts()
        if isinstance(accounts, list):
            for acc in accounts:
                if str(acc.get('account_id')) == str(req_login):
                    acc_pwd = acc.get('password') or req_password
                    acc_srv = acc.get('server') or req_server
                    if not acc_pwd or not acc_srv:
                        raise ValueError(f"Account {req_login} is missing password or server credentials in DB.")
                    return int(acc['account_id']), acc_pwd, acc_srv

        if req_password and req_server:
            return int(req_login), req_password, req_server

        raise RuntimeError(f"MetaTrader account credentials for '{req_login}' not found in DB.")

    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, login: int = None, password: str = None, server: str = None, **kwargs) -> list:
        """
        Uses existing MT5 terminal connection (or initializes if needed) to fetch historical candles.
        """
        if not MT5_AVAILABLE:
            raise ImportError("MetaTrader 5 library is not available on this platform.")

        acc_login = login or kwargs.get('account_id') or kwargs.get('account') or kwargs.get('login')
        if not acc_login:
            raise ValueError("No account selected")

        mt5_inst = MetaTraderHandler.get_mt5_instance(acc_login)
        if mt5_inst is None:
            raise RuntimeError(f"MetaTrader account {acc_login} is not connected.")

        # Map timeframe string to MT5 timeframe constants
        tf_map = {
            '1m': getattr(mt5_inst, 'TIMEFRAME_M1', 1),
            '3m': getattr(mt5_inst, 'TIMEFRAME_M3', 3),
            '5m': getattr(mt5_inst, 'TIMEFRAME_M5', 5),
            '15m': getattr(mt5_inst, 'TIMEFRAME_M15', 15),
            '30m': getattr(mt5_inst, 'TIMEFRAME_M30', 30),
            '1h': getattr(mt5_inst, 'TIMEFRAME_H1', 16385),
            '2h': getattr(mt5_inst, 'TIMEFRAME_H2', 16386),
            '4h': getattr(mt5_inst, 'TIMEFRAME_H4', 16388),
            '6h': getattr(mt5_inst, 'TIMEFRAME_H6', 16390),
            '8h': getattr(mt5_inst, 'TIMEFRAME_H8', 16392),
            '12h': getattr(mt5_inst, 'TIMEFRAME_H12', 16396),
            '1d': getattr(mt5_inst, 'TIMEFRAME_D1', 16408),
        }
        mt5_tf = tf_map.get(timeframe, getattr(mt5_inst, 'TIMEFRAME_M15', 15))

        # Match symbol: Check MT5 terminal directly first to bypass DB lookup overhead
        matched_symbol = symbol
        acc_id_str = str(acc_login)
        symbols = mt5_inst.symbols_get()
        if symbols:
            symbol_names = [s.name for s in symbols]
            if symbol not in symbol_names:
                for s in symbol_names:
                    if symbol.upper() in s.upper():
                        matched_symbol = s
                        break
                if matched_symbol == symbol:
                    # Fallback to DB mapping if not found in open symbol list
                    from symbol_mapping_handler import SymbolMappingHandler
                    mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, acc_id_str)
                    if mapped_symbol in symbol_names:
                        matched_symbol = mapped_symbol
                    else:
                        for s in symbol_names:
                            if mapped_symbol.upper() in s.upper():
                                matched_symbol = s
                                break

        # Select symbol in Market Watch
        mt5_inst.symbol_select(matched_symbol, True)

        # Calculate server to UTC offset
        offset = 0
        try:
            tick = mt5_inst.symbol_info_tick(matched_symbol)
            if tick:
                import time as pytime
                import datetime
                current_time = int(pytime.time())
                
                # If the last tick is fresh (less than 1 hour old), calculate dynamically
                if current_time - tick.time < 3600:
                    diff = tick.time - current_time
                    offset = int(round(diff / 1800.0) * 1800)
                else:
                    # Market is closed (weekend/stale tick). Fall back to EET/EEST calculation (+3h summer, +2h winter)
                    # which is the standard for 99% of MT5 brokers.
                    tick_dt = datetime.datetime.fromtimestamp(tick.time, datetime.timezone.utc)
                    year = tick_dt.year
                    # EEST begins on last Sunday of March and ends on last Sunday of October
                    dst_start = datetime.datetime(year, 3, 31) - datetime.timedelta(days=(datetime.datetime(year, 3, 31).weekday() + 1) % 7)
                    dst_end = datetime.datetime(year, 10, 31) - datetime.timedelta(days=(datetime.datetime(year, 10, 31).weekday() + 1) % 7)
                    
                    if dst_start.date() <= tick_dt.date() < dst_end.date():
                        offset = 10800  # UTC+3
                    else:
                        offset = 7200   # UTC+2
        except Exception:
            offset = 7200

        # Copy rates
        if date_from is not None:
            import time
            actual_date_to = date_to if date_to is not None else int(time.time() + 86400)
            rates = mt5_inst.copy_rates_range(matched_symbol, mt5_tf, int(date_from) + offset, int(actual_date_to) + offset)
        else:
            rates = mt5_inst.copy_rates_from_pos(matched_symbol, mt5_tf, 0, limit)

        if rates is None or len(rates) == 0:
            print(f"Failed to copy rates for {matched_symbol}", flush=True)
            return []

        # Convert to standard Candle format dicts
        candles = []
        for r in rates:
            candles.append({
                "time": int(r['time']) - offset,
                "open": float(r['open']),
                "high": float(r['high']),
                "low": float(r['low']),
                "close": float(r['close']),
                "volume": float(r['tick_volume'])
            })

        from candle_sanitizer import sanitize_and_fill_candles
        return sanitize_and_fill_candles(candles, timeframe=timeframe)

    @staticmethod
    def get_account_info(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> dict:
        """
        Fetches account data from MetaTrader 5.
        """
        login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        if not MT5_AVAILABLE:
            return {
                "balance": 100000.0,
                "equity": 100000.0,
                "margin": 0.0,
                "margin_free": 100000.0,
                "currency": "USD",
                "account_type": "MT5 Mock Account (Linux fallback)",
                "broker": "Local Mock Broker"
            }

        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return {}
        mt5_inst = MetaTraderHandler.get_mt5_instance(login) or mt5
        info = mt5_inst.account_info()
        if info is None:
            return {}
        return {
            "balance": info.balance,
            "equity": info.equity,
            "margin": info.margin,
            "margin_free": info.margin_free,
            "currency": info.currency,
            "account_type": "MT5 Demo Account",
            "broker": info.company
        }

    @staticmethod
    def get_account(**kwargs) -> dict:
        info = MetaTraderHandler.get_account_info(**kwargs)
        if not info:
            return {"status": "error", "message": "Failed to retrieve MetaTrader 5 account info"}
        return {"status": "success", "data": info}

    @staticmethod
    def get_positions(**kwargs) -> list:
        """
        Fetches open positions from MetaTrader 5 using active initialized instances.
        """
        if not MT5_AVAILABLE:
            return []

        acc_id = kwargs.get('account_id') or kwargs.get('account') or kwargs.get('login')
        if not acc_id or str(acc_id).strip().lower() in ("none", "null", ""):
            return []

        mt5_inst = kwargs.get('mt5_inst') or MetaTraderHandler.get_mt5_instance(acc_id)

        if not mt5_inst:
            print(f"[MetaTrader DEBUG] Could not get MT5 instance for account '{acc_id}'", flush=True)
            return []

        positions = mt5_inst.positions_get()
        if positions is None:
            err = mt5_inst.last_error() if hasattr(mt5_inst, 'last_error') else ("unknown", "unknown")
            print(f"[MetaTrader DEBUG] positions_get() returned None for Account '{acc_id}' | Error: {err}", flush=True)
            return []
        
        # Calculate server to UTC offset
        offset = 0
        try:
            sample_sym = positions[0].symbol if len(positions) > 0 else "EURUSD"
            tick = mt5_inst.symbol_info_tick(sample_sym)
            if tick:
                import time as pytime
                import datetime
                current_time = int(pytime.time())
                if current_time - tick.time < 3600:
                    diff = tick.time - current_time
                    offset = int(round(diff / 1800.0) * 1800)
                else:
                    tick_dt = datetime.datetime.fromtimestamp(tick.time, datetime.timezone.utc)
                    year = tick_dt.year
                    dst_start = datetime.datetime(year, 3, 31) - datetime.timedelta(days=(datetime.datetime(year, 3, 31).weekday() + 1) % 7)
                    dst_end = datetime.datetime(year, 10, 31) - datetime.timedelta(days=(datetime.datetime(year, 10, 31).weekday() + 1) % 7)
                    if dst_start.date() <= tick_dt.date() < dst_end.date():
                        offset = 10800
                    else:
                        offset = 7200
        except Exception:
            offset = 7200

        from symbol_mapping_handler import SymbolMappingHandler
        acc_id_str = str(acc_id)

        res = []
        buy_type = getattr(mt5_inst, 'POSITION_TYPE_BUY', 0)
        for p in positions:
            main_symbol = SymbolMappingHandler.map_to_main(p.symbol, acc_id_str)
            res.append({
                "position_id": p.ticket,
                "symbol": main_symbol,
                "trade_side": "BUY" if p.type == buy_type else "SELL",
                "volume": p.volume,
                "entry_price": p.price_open,
                "unrealized_profit": p.profit,
                "stop_loss": float(p.sl) if p.sl > 0 else 0.0,
                "take_profit": float(p.tp) if p.tp > 0 else 0.0,
                "entry_timestamp": int(p.time) - offset,
                "account_id": acc_id_str,
                "target_acc_id": acc_id_str,
                "broker": "metatrader"
            })
        return res

    @staticmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, magic: int = 234000, **kwargs) -> dict:
        """
        Dispatches buy/sell order to MT5 using an active initialized instance.
        """
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MetaTrader 5 execution is disabled on this platform."}

        acc_id = kwargs.get('account_id') or kwargs.get('account') or kwargs.get('login')
        mt5_inst = kwargs.get('mt5_inst') or MetaTraderHandler.get_mt5_instance(acc_id)
        if not mt5_inst:
            return {"status": "error", "message": f"No active MT5 instance found for account '{acc_id}'"}

        from symbol_mapping_handler import SymbolMappingHandler
        acc_id_str = str(acc_id) if acc_id else ""
        mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, acc_id_str)

        symbols = mt5_inst.symbols_get()
        matched_symbol = mapped_symbol
        if symbols:
            symbol_names = [s.name for s in symbols]
            if mapped_symbol not in symbol_names:
                for s in symbol_names:
                    if mapped_symbol.upper() in s.upper():
                        matched_symbol = s
                        break
                        
        mt5_inst.symbol_select(matched_symbol, True)
        
        is_buy = side.lower() == 'buy'
        action_type = getattr(mt5_inst, 'ORDER_TYPE_BUY', 0) if is_buy else getattr(mt5_inst, 'ORDER_TYPE_SELL', 1)
        
        if price is None:
            tick = mt5_inst.symbol_info_tick(matched_symbol)
            if tick is None:
                return {"status": "error", "message": f"Failed to get current price tick for {matched_symbol}"}
            price = tick.ask if is_buy else tick.bid
        
        symbol_info = mt5_inst.symbol_info(matched_symbol)
        filling_mode = getattr(mt5_inst, 'ORDER_FILLING_IOC', 1)
        if symbol_info is not None and hasattr(symbol_info, "filling_mode"):
          modes = symbol_info.filling_mode
          if modes & 2:
            filling_mode = getattr(mt5_inst, 'ORDER_FILLING_IOC', 1)
          elif modes & 1:
            filling_mode = getattr(mt5_inst, 'ORDER_FILLING_FOK', 0)
          else:
            filling_mode = getattr(mt5_inst, 'ORDER_FILLING_RETURN', 2)

        vol = round(float(volume), 2)
        if symbol_info is not None:
          vol_min = getattr(symbol_info, "volume_min", 0.01)
          vol_max = getattr(symbol_info, "volume_max", 100.0)
          vol_step = getattr(symbol_info, "volume_step", 0.01)
          if vol_step > 0:
            vol = round(round(vol / vol_step) * vol_step, 2)
          vol = max(vol_min, min(vol_max, vol))

        request_dict = {
            "action": getattr(mt5_inst, 'TRADE_ACTION_DEAL', 1),
            "symbol": matched_symbol,
            "volume": float(vol),
            "type": action_type,
            "price": float(price),
            "deviation": 20,
            "magic": int(magic) if magic is not None else 123456,
            "comment": "Wyckoff MT5 Order",
            "type_time": getattr(mt5_inst, 'ORDER_TIME_GTC', 0),
            "type_filling": filling_mode,
        }
        
        if stop_loss is not None:
            request_dict["sl"] = float(stop_loss)
        if take_profit is not None:
            request_dict["tp"] = float(take_profit)
            
        result = mt5_inst.order_send(request_dict)
        
        from notification_handler import NotificationHandler
        if result is None:
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": "MT5 order_send returned None"}
            
        done_ret = getattr(mt5_inst, 'TRADE_RETCODE_DONE', 10009)
        if result.retcode != done_ret:
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": f"MT5 order failed: {result.comment} (retcode: {result.retcode})"}
            
        NotificationHandler.play_sound("trade_open")
        return {"status": "success", "message": f"Order successfully executed on MT5. Ticket: {result.order}"}

    @staticmethod
    def close_position(position_id: int, symbol: str, side: str, volume: float, **kwargs) -> dict:
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MT5 unavailable"}
            
        acc_id = kwargs.get('account_id') or kwargs.get('account') or kwargs.get('login')
        mt5_inst = kwargs.get('mt5_inst') or MetaTraderHandler.get_mt5_instance(acc_id)
        if not mt5_inst:
            return {"status": "error", "message": f"No active MT5 instance found for account '{acc_id}'"}

        is_buy = side.upper() == 'BUY'
        action_type = getattr(mt5_inst, 'ORDER_TYPE_SELL', 1) if is_buy else getattr(mt5_inst, 'ORDER_TYPE_BUY', 0)
        
        tick = mt5_inst.symbol_info_tick(symbol)
        if tick is None:
            return {"status": "error", "message": f"Failed to get price tick for {symbol}"}
        price = tick.bid if is_buy else tick.ask
        
        symbol_info = mt5_inst.symbol_info(symbol)
        filling_mode = getattr(mt5_inst, 'ORDER_FILLING_IOC', 1)
        if symbol_info is not None and hasattr(symbol_info, "filling_mode"):
          modes = symbol_info.filling_mode
          if modes & 2:
            filling_mode = getattr(mt5_inst, 'ORDER_FILLING_IOC', 1)
          elif modes & 1:
            filling_mode = getattr(mt5_inst, 'ORDER_FILLING_FOK', 0)
          else:
            filling_mode = getattr(mt5_inst, 'ORDER_FILLING_RETURN', 2)

        vol = round(float(volume), 2)
        if symbol_info is not None:
          vol_min = getattr(symbol_info, "volume_min", 0.01)
          vol_max = getattr(symbol_info, "volume_max", 100.0)
          vol_step = getattr(symbol_info, "volume_step", 0.01)
          if vol_step > 0:
            vol = round(round(vol / vol_step) * vol_step, 2)
          vol = max(vol_min, min(vol_max, vol))

        request_dict = {
            "action": getattr(mt5_inst, 'TRADE_ACTION_DEAL', 1),
            "symbol": symbol,
            "volume": float(vol),
            "type": action_type,
            "position": int(position_id),
            "price": float(price),
            "deviation": 20,
            "magic": 234000,
            "comment": "Auto-Close Session Position",
            "type_time": getattr(mt5_inst, 'ORDER_TIME_GTC', 0),
            "type_filling": filling_mode,
        }
        result = mt5_inst.order_send(request_dict)
        from notification_handler import NotificationHandler
        done_ret = getattr(mt5_inst, 'TRADE_RETCODE_DONE', 10009)
        if result is None or result.retcode != done_ret:
            comment = result.comment if result else "None"
            retcode = result.retcode if result else -1
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": f"MT5 close failed: {comment} (retcode: {retcode})"}
        NotificationHandler.play_sound("trade_close")
        return {"status": "success", "message": f"Position {position_id} closed."}

    @staticmethod
    def modify_position(position_id: int, stop_loss: float = None, take_profit: float = None, symbol: str = "EURUSD", login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> dict:
        login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MT5 unavailable"}
            
        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return {"status": "error", "message": "Failed to initialize MT5"}
            
        mt5_inst = MetaTraderHandler.get_mt5_instance(login) or mt5

        target_sl = float(stop_loss) if stop_loss is not None else None
        target_tp = float(take_profit) if take_profit is not None else None

        # If either SL or TP is omitted or 0.0, fetch current position to preserve existing setting
        if target_sl is None or target_tp is None or target_sl == 0.0 or target_tp == 0.0:
            try:
                positions = mt5_inst.positions_get(ticket=int(position_id))
                if positions and len(positions) > 0:
                    curr_pos = positions[0]
                    if target_sl is None or (stop_loss is None and target_sl == 0.0):
                        target_sl = float(curr_pos.sl)
                    if target_tp is None or (take_profit is None and target_tp == 0.0):
                        target_tp = float(curr_pos.tp)
            except Exception:
                pass

        final_sl = target_sl if target_sl is not None else 0.0
        final_tp = target_tp if target_tp is not None else 0.0

        request_dict = {
            "action": getattr(mt5_inst, 'TRADE_ACTION_SLTP', 6),
            "position": int(position_id),
            "symbol": symbol,
            "sl": final_sl,
            "tp": final_tp,
        }
        result = mt5_inst.order_send(request_dict)
        from notification_handler import NotificationHandler
        done_ret = getattr(mt5_inst, 'TRADE_RETCODE_DONE', 10009)
        if result is None or result.retcode != done_ret:
            comment = result.comment if result else "None"
            retcode = result.retcode if result else -1
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": f"MT5 modify failed: {comment} (retcode: {retcode})"}
        NotificationHandler.play_sound("alert")
        return {"status": "success", "message": f"Position {position_id} modified successfully."}

    @staticmethod
    def get_symbols(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> list:
        """
        Gets list of symbols from MT5 terminal directly without fallbacks.
        """
        try:
            resolved_login, resolved_pwd, resolved_srv = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
            if MT5_AVAILABLE and MetaTraderHandler._initialize_mt5(resolved_login, resolved_pwd, resolved_srv):
                mt5_inst = MetaTraderHandler.get_mt5_instance(resolved_login) or mt5
                symbols = mt5_inst.symbols_get()
                if symbols:
                    return sorted([s.name for s in symbols])
        except Exception as e:
            print(f"[MetaTrader get_symbols] Error fetching MT5 symbols: {e}", flush=True)

        return []

    @staticmethod
    def get_history(date_from: int = None, date_to: int = None, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> list:
        """
        Fetches historical deals/trades from MetaTrader 5.
        """
        login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        if not MT5_AVAILABLE:
            return []

        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return []

        mt5_inst = MetaTraderHandler.get_mt5_instance(login) or mt5
        import time
        if date_from is None:
            # Default to 30 days ago
            date_from = int(time.time()) - (30 * 24 * 3600)
        if date_to is None:
            date_to = int(time.time()) + 3600

        import datetime
        dt_from = datetime.datetime.fromtimestamp(date_from)
        dt_to = datetime.datetime.fromtimestamp(date_to)

        deals = mt5_inst.history_deals_get(dt_from, dt_to)
        if deals is None:
            return []

        res = []
        deal_entry_out = getattr(mt5_inst, 'DEAL_ENTRY_OUT', 1)
        deal_entry_inout = getattr(mt5_inst, 'DEAL_ENTRY_INOUT', 2)
        for d in deals:
            # We filter out balance operations, etc. and only keep trade deals
            if d.entry in (deal_entry_out, deal_entry_inout) and d.profit != 0:
                res.append({
                    "ticket": d.ticket,
                    "order": d.order,
                    "symbol": d.symbol,
                    "trade_side": "BUY" if d.type == mt5.DEAL_TYPE_BUY else "SELL",
                    "volume": d.volume,
                    "price": d.price,
                    "profit": d.profit,
                    "commission": d.commission,
                    "swap": d.swap,
                    "timestamp": int(d.time)
                })
        return res

    @staticmethod
    def get_timeframes() -> list:
        """
        Standard timeframes.
        """
        return ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"]

if __name__ == '__main__':
    import time
    import sys

    # Allow custom arguments: python metatrader_handler.py [symbol] [timeframe] [limit]
    symbol = sys.argv[1] if len(sys.argv) > 1 else "EURUSD"
    timeframe = sys.argv[2] if len(sys.argv) > 2 else "5m"
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 500

    print(f"==================================================")
    print(f"⏱️  Benchmarking MetaTraderHandler.fetch_candles")
    print(f"   Symbol:    {symbol}")
    print(f"   Timeframe: {timeframe}")
    print(f"   Limit:     {limit}")
    print(f"==================================================")

    start_time = time.perf_counter()
    candles = MetaTraderHandler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit)
    end_time = time.perf_counter()

    elapsed_ms = (end_time - start_time) * 1000.0
    print(f"✅ Fetched {len(candles)} candles in {elapsed_ms:.2f} ms ({elapsed_ms/1000.0:.2f} seconds)")

    if candles:
        print(f"   First candle: {candles[0]}")
        print(f"   Last candle:  {candles[-1]}")
    else:
        print("⚠️ No candles returned!")

