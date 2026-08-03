import logging
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    logging.warning("MetaTrader5 package is not installed or not supported on this platform. Running in mock/simulation mode.")

from base_broker_handler import BaseBrokerHandler

class MetaTraderHandler(BaseBrokerHandler):
    _connection_states = {}
    _mt5_instances = {}

    @staticmethod
    def _initialize_mt5(login: int = None, password: str = None, server: str = None, terminal_path: str = None) -> bool:
        if not MT5_AVAILABLE:
            return False

        import os
        import shutil

        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(backend_dir)
        mt5_dir = os.path.join(project_root, "mt5")
        
        target_dir = os.path.join(mt5_dir, f"mt5_{login}") if login else None
        path = terminal_path or (os.path.join(target_dir, "terminal64.exe") if target_dir else None)

        # Check if target account folder exists; if not, copy from mt5_base to provision instance
        if target_dir and not os.path.exists(target_dir):
            base_template = os.path.join(mt5_dir, "mt5_base")
            if os.path.exists(base_template):
                try:
                    print(f"[MetaTrader Provisioning] Copying mt5_base to {target_dir}...", flush=True)
                    shutil.copytree(base_template, target_dir)
                except Exception as e:
                    print(f"[MetaTrader Provisioning Error] Account {login}: {e}", flush=True)

        success = mt5.initialize(path=path, login=int(login) if login else 0, password=password or "", server=server or "", portable=True)

        if success and login:
            MetaTraderHandler._mt5_instances[str(login)] = mt5
        return success

    @staticmethod
    def get_mt5_instance(account_id: str = None):
        if account_id:
            acc_str = str(account_id)
            if acc_str in MetaTraderHandler._mt5_instances:
                return MetaTraderHandler._mt5_instances[acc_str]
        return mt5 if MT5_AVAILABLE else None

    @staticmethod
    def _resolve_credentials(login=None, password=None, server=None, **kwargs):
        # Check if login looks like the default mock/placeholder value or not provided
        is_default_mock = str(login) == "2002061314" or login is None

        # Load active account from DB
        if is_default_mock:
            from account_handler import AccountHandler
            active_acc = AccountHandler.get_active_account()
            if active_acc and active_acc.get("broker_type") == "metatrader":
                return int(active_acc["account_id"]), active_acc.get("password"), active_acc.get("server")
        
        # Use explicitly passed credentials if valid
        if login is not None and str(login) != "2002061314":
            return int(login), password, server

        # If DB had no account, check currently active MT5 terminal account as final fallback
        if MT5_AVAILABLE:
            try:
                acc_info = mt5.account_info()
                if acc_info is not None:
                    return acc_info.login, password or "", acc_info.server or ""
            except Exception:
                pass

        raise RuntimeError("No active MetaTrader account found in DB and MT5 terminal is not logged in.")

    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, login: int = None, password: str = None, server: str = None, **kwargs) -> list:
        """
        Uses existing MT5 terminal connection (or initializes if needed) to fetch historical candles.
        """
        if not MT5_AVAILABLE:
            raise ImportError("MetaTrader 5 library is not available on this platform.")

        # Check if MT5 is already connected/initialized
        is_connected = False
        try:
            is_connected = mt5.terminal_info() is not None
        except Exception:
            pass

        if not is_connected:
            try:
                login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
                if not MetaTraderHandler._initialize_mt5(login, password, server):
                    raise RuntimeError("Failed to initialize MetaTrader 5 connection.")
            except Exception as e:
                raise RuntimeError(f"MetaTrader 5 is not initialized or connected: {e}")

        # Map timeframe string to MT5 timeframe constants
        tf_map = {
            '1m': mt5.TIMEFRAME_M1,
            '3m': mt5.TIMEFRAME_M3,
            '5m': mt5.TIMEFRAME_M5,
            '15m': mt5.TIMEFRAME_M15,
            '30m': mt5.TIMEFRAME_M30,
            '1h': mt5.TIMEFRAME_H1,
            '2h': mt5.TIMEFRAME_H2,
            '4h': mt5.TIMEFRAME_H4,
            '6h': mt5.TIMEFRAME_H6,
            '8h': mt5.TIMEFRAME_H8,
            '12h': mt5.TIMEFRAME_H12,
            '1d': mt5.TIMEFRAME_D1,
        }
        mt5_tf = tf_map.get(timeframe, mt5.TIMEFRAME_M15)

        # Match symbol: Check MT5 terminal directly first to bypass DB lookup overhead
        matched_symbol = symbol
        broker_key = f"metatrader:{server}"
        symbols = mt5.symbols_get()
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
                    mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, broker_key)
                    if mapped_symbol in symbol_names:
                        matched_symbol = mapped_symbol
                    else:
                        for s in symbol_names:
                            if mapped_symbol.upper() in s.upper():
                                matched_symbol = s
                                break

        # Select symbol in Market Watch
        mt5.symbol_select(matched_symbol, True)

        # Calculate server to UTC offset
        offset = 0
        try:
            tick = mt5.symbol_info_tick(matched_symbol)
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
            rates = mt5.copy_rates_range(matched_symbol, mt5_tf, int(date_from) + offset, int(actual_date_to) + offset)
        else:
            rates = mt5.copy_rates_from_pos(matched_symbol, mt5_tf, 0, limit)

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
        info = mt5.account_info()
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
    def get_positions(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> list:
        """
        Fetches open positions from MetaTrader 5.
        """
        login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        if not MT5_AVAILABLE:
            return []

        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return []
        positions = mt5.positions_get()
        if positions is None:
            return []
        
        # Calculate server to UTC offset
        offset = 0
        try:
            sample_sym = positions[0].symbol if len(positions) > 0 else "EURUSD"
            tick = mt5.symbol_info_tick(sample_sym)
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
        broker_key = f"metatrader:{server}"

        res = []
        for p in positions:
            main_symbol = SymbolMappingHandler.map_to_main(p.symbol, broker_key)
            res.append({
                "position_id": p.ticket,
                "symbol": main_symbol,
                "trade_side": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": p.volume,
                "entry_price": p.price_open,
                "unrealized_profit": p.profit,
                "stop_loss": float(p.sl) if p.sl > 0 else 0.0,
                "take_profit": float(p.tp) if p.tp > 0 else 0.0,
                "entry_timestamp": int(p.time) - offset
            })
        return res

    @staticmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, magic: int = 234000, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> dict:
        """
        Dispatches buy/sell order to MT5.
        """
        login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MetaTrader 5 execution is disabled on this platform (Linux/Railway)."}

        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return {"status": "error", "message": "Failed to initialize MT5"}
        
        from symbol_mapping_handler import SymbolMappingHandler
        broker_key = f"metatrader:{server}"
        mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, broker_key)

        symbols = mt5.symbols_get()
        matched_symbol = mapped_symbol
        if symbols:
            symbol_names = [s.name for s in symbols]
            if mapped_symbol not in symbol_names:
                for s in symbol_names:
                    if mapped_symbol.upper() in s.upper():
                        matched_symbol = s
                        break
                        
        mt5.symbol_select(matched_symbol, True)
        
        is_buy = side.lower() == 'buy'
        action_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
        
        if price is None:
            tick = mt5.symbol_info_tick(matched_symbol)
            if tick is None:
                return {"status": "error", "message": f"Failed to get current price tick for {matched_symbol}"}
            price = tick.ask if is_buy else tick.bid
        
        symbol_info = mt5.symbol_info(matched_symbol)
        filling_mode = mt5.ORDER_FILLING_IOC
        if symbol_info is not None and hasattr(symbol_info, "filling_mode"):
          modes = symbol_info.filling_mode
          # checking bits: 1 = FOK (ORDER_FILLING_FOK), 2 = IOC (ORDER_FILLING_IOC)
          if modes & 2:
            filling_mode = mt5.ORDER_FILLING_IOC
          elif modes & 1:
            filling_mode = mt5.ORDER_FILLING_FOK
          else:
            filling_mode = mt5.ORDER_FILLING_RETURN

        vol = round(float(volume), 2)
        if symbol_info is not None:
          vol_min = getattr(symbol_info, "volume_min", 0.01)
          vol_max = getattr(symbol_info, "volume_max", 100.0)
          vol_step = getattr(symbol_info, "volume_step", 0.01)
          if vol_step > 0:
            vol = round(round(vol / vol_step) * vol_step, 2)
          vol = max(vol_min, min(vol_max, vol))

        request_dict = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": matched_symbol,
            "volume": float(vol),
            "type": action_type,
            "price": float(price),
            "deviation": 20,
            "magic": int(magic) if magic is not None else 123456,
            "comment": "Wyckoff MT5 Order",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode,
        }
        
        if stop_loss is not None:
            request_dict["sl"] = float(stop_loss)
        if take_profit is not None:
            request_dict["tp"] = float(take_profit)
            
        result = mt5.order_send(request_dict)
        
        from notification_handler import NotificationHandler
        if result is None:
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": "MT5 order_send returned None"}
            
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": f"MT5 order failed: {result.comment} (retcode: {result.retcode})"}
            
        NotificationHandler.play_sound("trade_open")
        return {"status": "success", "message": f"Order successfully executed on MT5. Ticket: {result.order}"}

    @staticmethod
    def close_position(position_id: int, symbol: str, side: str, volume: float, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> dict:
        login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MT5 unavailable"}
            
        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return {"status": "error", "message": "Failed to initialize MT5"}
            
        is_buy = side.upper() == 'BUY'
        action_type = mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY
        
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"status": "error", "message": f"Failed to get price tick for {symbol}"}
        price = tick.bid if is_buy else tick.ask
        
        symbol_info = mt5.symbol_info(symbol)
        filling_mode = mt5.ORDER_FILLING_IOC
        if symbol_info is not None and hasattr(symbol_info, "filling_mode"):
          modes = symbol_info.filling_mode
          if modes & 2:
            filling_mode = mt5.ORDER_FILLING_IOC
          elif modes & 1:
            filling_mode = mt5.ORDER_FILLING_FOK
          else:
            filling_mode = mt5.ORDER_FILLING_RETURN

        vol = round(float(volume), 2)
        if symbol_info is not None:
          vol_min = getattr(symbol_info, "volume_min", 0.01)
          vol_max = getattr(symbol_info, "volume_max", 100.0)
          vol_step = getattr(symbol_info, "volume_step", 0.01)
          if vol_step > 0:
            vol = round(round(vol / vol_step) * vol_step, 2)
          vol = max(vol_min, min(vol_max, vol))

        request_dict = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(vol),
            "type": action_type,
            "position": int(position_id),
            "price": float(price),
            "deviation": 20,
            "magic": 234000,
            "comment": "Auto-Close Session Position",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling_mode,
        }
        result = mt5.order_send(request_dict)
        from notification_handler import NotificationHandler
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
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
            
        request_dict = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": int(position_id),
            "symbol": symbol,
            "sl": float(stop_loss) if stop_loss is not None else 0.0,
            "tp": float(take_profit) if take_profit is not None else 0.0,
        }
        result = mt5.order_send(request_dict)
        from notification_handler import NotificationHandler
        if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
            comment = result.comment if result else "None"
            retcode = result.retcode if result else -1
            NotificationHandler.play_sound("error")
            return {"status": "error", "message": f"MT5 modify failed: {comment} (retcode: {retcode})"}
        NotificationHandler.play_sound("alert")
        return {"status": "success", "message": f"Position {position_id} modified successfully."}

    @staticmethod
    def get_symbols(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo", **kwargs) -> list:
        """
        Gets list of symbols from MT5 terminal.
        """
        try:
            login, password, server = MetaTraderHandler._resolve_credentials(login, password, server, **kwargs)
        except Exception:
            if not MT5_AVAILABLE:
                return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]
            raise
        if not MT5_AVAILABLE:
            return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]

        if not MetaTraderHandler._initialize_mt5(login, password, server):
            return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]
        symbols = mt5.symbols_get()
        if symbols:
            return [s.name for s in symbols if s.visible or s.select]
        return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]

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

        import time
        if date_from is None:
            # Default to 30 days ago
            date_from = int(time.time()) - (30 * 24 * 3600)
        if date_to is None:
            date_to = int(time.time()) + 3600

        import datetime
        dt_from = datetime.datetime.fromtimestamp(date_from)
        dt_to = datetime.datetime.fromtimestamp(date_to)

        deals = mt5.history_deals_get(dt_from, dt_to)
        if deals is None:
            return []

        res = []
        for d in deals:
            # We filter out balance operations, etc. and only keep trade deals
            if d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT) and d.profit != 0:
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

