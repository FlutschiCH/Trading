try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

class MetaTraderHandler:
    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> list:
        """
        Initializes connection to MT5, fetches historical candles for the given symbol/timeframe, and shuts down.
        """
        if not MT5_AVAILABLE:
            import time
            print("MetaTrader 5 skipped (non-Windows platform). Using local mock candles fallback.", flush=True)
            curr = int(time.time())
            mock_candles = []
            for i in range(limit):
                mock_candles.append({
                    "time": curr - (limit - i) * 900,
                    "open": 50000.0,
                    "high": 50100.0,
                    "low": 49900.0,
                    "close": 50000.0,
                    "volume": 10.0
                })
            return mock_candles

        if not mt5.initialize(login=int(login), password=password, server=server):
            error_code, error_desc = mt5.last_error()
            print(f"MT5 Initialization failed: error code {error_code}, desc: {error_desc}", flush=True)
            return []

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

        # Match symbol (e.g. EURUSD -> EURUSD.m or similar suffix support)
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

        # Select symbol in Market Watch
        mt5.symbol_select(matched_symbol, True)

        # Copy rates
        if date_from is not None and date_to is not None:
            import datetime
            dt_from = datetime.datetime.fromtimestamp(int(date_from))
            dt_to = datetime.datetime.fromtimestamp(int(date_to))
            rates = mt5.copy_rates_range(matched_symbol, mt5_tf, dt_from, dt_to)
        else:
            rates = mt5.copy_rates_from_pos(matched_symbol, mt5_tf, 0, limit)

        if rates is None or len(rates) == 0:
            print(f"Failed to copy rates for {matched_symbol}", flush=True)
            return []

        # Convert to standard Candle format dicts
        candles = []
        for r in rates:
            candles.append({
                "time": int(r['time']),
                "open": float(r['open']),
                "high": float(r['high']),
                "low": float(r['low']),
                "close": float(r['close']),
                "volume": float(r['tick_volume'])
            })

        return candles

    @staticmethod
    def get_account_info(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> dict:
        """
        Fetches account data from MetaTrader 5.
        """
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

        if not mt5.initialize(login=int(login), password=password, server=server):
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
    def get_positions(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> list:
        """
        Fetches open positions from MetaTrader 5.
        """
        if not MT5_AVAILABLE:
            return []

        if not mt5.initialize(login=int(login), password=password, server=server):
            return []
        positions = mt5.positions_get()
        if positions is None:
            return []
        
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
                "stop_loss": p.sl if p.sl > 0 else None,
                "take_profit": p.tp if p.tp > 0 else None,
                "entry_timestamp": int(p.time)
            })
        return res

    @staticmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> dict:
        """
        Dispatches buy/sell order to MT5.
        """
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MetaTrader 5 execution is disabled on this platform (Linux/Railway)."}

        if not mt5.initialize(login=int(login), password=password, server=server):
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
        
        request_dict = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": matched_symbol,
            "volume": float(volume),
            "type": action_type,
            "price": float(price),
            "deviation": 20,
            "magic": 234000,
            "comment": "Wyckoff MT5 Order",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
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
    def close_position(position_id: int, symbol: str, side: str, volume: float, login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> dict:
        if not MT5_AVAILABLE:
            return {"status": "error", "message": "MT5 unavailable"}
            
        if not mt5.initialize(login=int(login), password=password, server=server):
            return {"status": "error", "message": "Failed to initialize MT5"}
            
        is_buy = side.upper() == 'BUY'
        action_type = mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY
        
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"status": "error", "message": f"Failed to get price tick for {symbol}"}
        price = tick.bid if is_buy else tick.ask
        
        request_dict = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(volume),
            "type": action_type,
            "position": int(position_id),
            "price": float(price),
            "deviation": 20,
            "magic": 234000,
            "comment": "Auto-Close Session Position",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
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
    def get_symbols(login: int = 2002061314, password: str = "Godzilla_12", server: str = "JustMarkets-Demo") -> list:
        """
        Gets list of symbols from MT5 terminal.
        """
        if not MT5_AVAILABLE:
            return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]

        if not mt5.initialize(login=int(login), password=password, server=server):
            return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]
        symbols = mt5.symbols_get()
        if symbols:
            return [s.name for s in symbols if s.visible or s.select]
        return ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"]

    @staticmethod
    def get_timeframes() -> list:
        """
        Standard timeframes.
        """
        return ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"]
