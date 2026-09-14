from metatrader_handler import MetaTraderHandler
from ctrader_handler import CTraderHandler
from binance_handler import BinanceFuturesHandler
import json

class BrokerHandler:
    @staticmethod
    def _resolve_broker_name(broker_name: str = None, account_id: str = None) -> str:
        if broker_name and str(broker_name).strip() and str(broker_name).strip().lower() not in ('none', 'null', 'undefined', ''):
            return str(broker_name).strip()
        
        if account_id and str(account_id).strip().lower() not in ('none', 'null', 'undefined', ''):
            try:
                from account_handler import AccountHandler
                accounts = AccountHandler.get_accounts()
                for acc in accounts:
                    if str(acc.get('account_id')) == str(account_id) or str(acc.get('id')) == str(account_id):
                        return acc.get('broker_type', '')
            except Exception as e:
                print(f"[BrokerHandler] Error looking up account {account_id}: {e}", flush=True)

        return ""

    @staticmethod
    def get_handler(broker_name: str = None, account_id: str = None):
        resolved_name = BrokerHandler._resolve_broker_name(broker_name, account_id)
        if not resolved_name:
            return None
        name_lower = resolved_name.lower()
        if "binance" in name_lower:
            return BinanceFuturesHandler
        if "ctrader" in name_lower or "c-trader" in name_lower:
            return CTraderHandler
        if "metatrader" in name_lower or "mt5" in name_lower:
            return MetaTraderHandler
        return None

    @staticmethod
    def get_instance(broker_name: str = None, account_id: str = None):
        resolved_name = BrokerHandler._resolve_broker_name(broker_name, account_id)
        name_lower = resolved_name.lower()

        if "binance" in name_lower or "ctrader" in name_lower or "c-trader" in name_lower:
            return None
        
        # MetaTrader instance resolution
        if account_id and "metatrader" in name_lower:
            return MetaTraderHandler.get_mt5_instance(account_id)
        return None

    @classmethod
    def _prepare_kwargs(cls, broker_name: str = None, account_id: str = None, kwargs: dict = None) -> dict:
        kwargs = kwargs or {}
        resolved_name = cls._resolve_broker_name(broker_name, account_id).lower()

        try:
            from account_handler import AccountHandler
            accounts = AccountHandler.get_accounts()
            matched = None
            if account_id:
                matched = next((a for a in accounts if str(a.get('account_id')) == str(account_id) or str(a.get('id')) == str(account_id)), None)
            if not matched and resolved_name:
                matched = AccountHandler.get_active_account(broker_type=resolved_name)

            if matched:
                b_type = matched.get('broker_type', '').lower()
                if "binance" in b_type or "binance" in resolved_name:
                    if 'api_key' not in kwargs and matched.get('account_id'):
                        kwargs['api_key'] = matched.get('account_id')
                    if 'secret_key' not in kwargs and matched.get('password'):
                        kwargs['secret_key'] = matched.get('password')
                elif "ctrader" in b_type or "ctrader" in resolved_name or "c-trader" in resolved_name:
                    if 'account_id' not in kwargs and matched.get('account_id'):
                        kwargs['account_id'] = matched.get('account_id')
                    if 'token' not in kwargs and matched.get('password'):
                        kwargs['token'] = matched.get('password')
                elif "metatrader" in b_type or "metatrader" in resolved_name or "mt5" in resolved_name:
                    if 'login' not in kwargs and matched.get('account_id'):
                        kwargs['login'] = matched.get('account_id')
                    if 'password' not in kwargs and matched.get('password'):
                        kwargs['password'] = matched.get('password')
                    if 'server' not in kwargs and matched.get('server'):
                        kwargs['server'] = matched.get('server')
                    if 'terminal_path' not in kwargs and matched.get('terminal_path'):
                        kwargs['terminal_path'] = matched.get('terminal_path')
        except Exception as e:
            print(f"[BrokerHandler] Error resolving account credentials: {e}", flush=True)

        return kwargs

    @classmethod
    def _resolve_symbol(cls, symbol: str, broker_name: str = None, account_id: str = None) -> str:
        if not symbol:
            return None
        from symbol_mapping_handler import SymbolMappingHandler
        if account_id and str(account_id).strip().lower() not in ('none', 'null', 'undefined', ''):
            mapped = SymbolMappingHandler.map_to_broker(symbol, account_id)
            if not mapped:
                resolved_broker = cls._resolve_broker_name(broker_name, account_id)
                print(f"[BrokerHandler] ⚠️ Symbol '{symbol}' has NO mapping for account '{account_id}' ({resolved_broker}). Call will not execute.", flush=True)
                return None
            return mapped
        return symbol

    @classmethod
    def get_positions(cls, broker_name: str = None, account_id: str = None, symbol: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        mapped_symbol = cls._resolve_symbol(symbol, broker_name, account_id) if symbol else None
        if symbol and not mapped_symbol:
            return []
        positions = handler.get_positions(account_id=account_id, broker_inst=broker_inst, symbol=mapped_symbol, **kwargs)
        return positions

    @classmethod
    def create_order(cls, broker_name: str = None, account_id: str = None, symbol: str = None, **kwargs):
        stop_loss = kwargs.get('stop_loss')
        if stop_loss is None or float(stop_loss) <= 0:
            return {'status': 'error', 'message': f"Order rejected: Stop loss is required and must be > 0 (received: {stop_loss})"}
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        mapped_symbol = cls._resolve_symbol(symbol, broker_name, account_id) if symbol else symbol
        if symbol and not mapped_symbol:
            return {'error': f"Symbol '{symbol}' has no mapping configured for account '{account_id}'"}
        return handler.create_order(account_id=account_id, broker_inst=broker_inst, symbol=mapped_symbol, **kwargs)

    @classmethod
    def close_position(cls, broker_name: str = None, account_id: str = None, symbol: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        mapped_symbol = cls._resolve_symbol(symbol, broker_name, account_id) if symbol else None
        if symbol and not mapped_symbol:
            return {'error': f"Symbol '{symbol}' has no mapping configured for account '{account_id}'"}
        return handler.close_position(account_id=account_id, broker_inst=broker_inst, symbol=mapped_symbol, **kwargs)

    @classmethod
    def modify_position(cls, broker_name: str = None, account_id: str = None, symbol: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        mapped_symbol = cls._resolve_symbol(symbol, broker_name, account_id) if symbol else symbol
        if symbol and not mapped_symbol:
            return {'error': f"Symbol '{symbol}' has no mapping configured for account '{account_id}'"}
        return handler.modify_position(account_id=account_id, broker_inst=broker_inst, symbol=mapped_symbol, **kwargs)

    @classmethod
    def fetch_candles(cls, broker_name: str = None, account_id: str = None, symbol: str = None, timeframe: str = None, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        mapped_symbol = cls._resolve_symbol(symbol, broker_name, account_id) if symbol else symbol
        if symbol and not mapped_symbol:
            return []
        return handler.fetch_candles(symbol=mapped_symbol, timeframe=timeframe, limit=limit, date_from=date_from, date_to=date_to, account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_account_info(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.get_account_info(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_account(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        if hasattr(handler, 'get_account'):
            return handler.get_account(account_id=account_id, broker_inst=broker_inst, **kwargs)
        return handler.get_account_info(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_symbols(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.get_symbols(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_timeframes(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        if hasattr(handler, 'get_timeframes'):
            return handler.get_timeframes()
        return ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]

    @classmethod
    def get_history(cls, broker_name: str = None, account_id: str = None, symbol: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        if not handler:
            raise ValueError("pls select account first")
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        mapped_symbol = cls._resolve_symbol(symbol, broker_name, account_id) if symbol else symbol
        return handler.get_history(symbol=mapped_symbol, account_id=account_id, broker_inst=broker_inst, **kwargs)

if __name__ == '__main__':
    import json
    import sys

    # Interactive test parameters (JustMarkets MT5 account)
    TEST_BROKER = "metatrader"
    TEST_ACCOUNT_ID = "1200290776"
    TEST_SYMBOL = "EURUSD"

    print("=" * 60)
    print(f"Testing BrokerHandler with Broker: '{TEST_BROKER}', Account ID: '{TEST_ACCOUNT_ID}'")
    print("=" * 60)

    # 1. Fetch Account Info
    print("\n1. Testing get_account_info()...")
    acc_info = BrokerHandler.get_account_info(broker_name=TEST_BROKER, account_id=TEST_ACCOUNT_ID)
    print(json.dumps(acc_info, indent=2, default=str)[:1000])
    
    # 2. Fetch Open Positions
    print("\n2. Testing get_positions()...")
    positions = BrokerHandler.get_positions(broker_name=TEST_BROKER, account_id=TEST_ACCOUNT_ID, symbol=TEST_SYMBOL)
    print(json.dumps(positions, indent=2, default=str)[:1000])

    # 3. Fetch Candles
    print(f"\n3. Testing fetch_candles() for {TEST_SYMBOL}...")
    candles = BrokerHandler.fetch_candles(broker_name=TEST_BROKER, account_id=TEST_ACCOUNT_ID, symbol=TEST_SYMBOL, timeframe="15m", limit=200)
    print(f"Fetched {len(candles) if isinstance(candles, list) else 0} candles.")

    # 4. Calculate strict trade parameters from latest signal
    from trading_handler import TradingHandler
    from wyckoff_handler import WyckoffHandler

    annotated = WyckoffHandler.analyze_wyckoff_structure(candles) if candles else []
    last_signal_direction = "BUY"
    last_c = annotated[-1] if annotated else (candles[-1] if candles else {})
    if last_c.get("wyckoff_signal") and "upthrust" in str(last_c.get("wyckoff_signal")).lower():
        last_signal_direction = "SELL"

    atr_val = float(last_c.get("atr", 0.0015)) if last_c.get("atr") else 0.0015
    last_close = float(last_c.get("close", 1.0800))
    account_balance = float(acc_info.get("balance", 10000.0) or 10000.0) if isinstance(acc_info, dict) else 10000.0

    trade_params = TradingHandler.calculate_trade_parameters(
        symbol=TEST_SYMBOL,
        entry_price=last_close,
        direction=last_signal_direction,
        sl_type="atr",
        sl_val=1.5,
        rr=2.0,
        size=0.01,
        use_risk_sizing=True,
        risk_pct=1.0,
        balance=account_balance,
        lot_size=100000.0,
        pip_size=0.0001,
        precision=5,
        atr_val=atr_val
    )
    trade_params["qty"] = round(trade_params["qty"], 2)
    print(f"\n4. Calculated Strict Trade Parameters (Signal: {last_signal_direction}):")
    print(json.dumps(trade_params, indent=2))

    # 5. Optional Test Order Dispatch
    # Run with: python broker_handler.py trade
    if len(sys.argv) > 1 and sys.argv[1].lower() in ('trade', 'order'):
        test_side = sys.argv[2].upper() if len(sys.argv) > 2 else last_signal_direction
        test_vol = float(sys.argv[3]) if len(sys.argv) > 3 else trade_params["qty"]
        test_sl = float(sys.argv[4]) if len(sys.argv) > 4 else trade_params["sl_price"]
        test_tp = float(sys.argv[5]) if len(sys.argv) > 5 else trade_params["tp_price"]

        print(f"\n5. Dispatching Test {test_side} Order on {TEST_BROKER} ({TEST_SYMBOL}) | Volume: {test_vol} | SL: {test_sl} | TP: {test_tp}...")
        order_res = BrokerHandler.create_order(
            broker_name=TEST_BROKER,
            account_id=TEST_ACCOUNT_ID,
            symbol=TEST_SYMBOL,
            side=test_side,
            volume=test_vol,
            stop_loss=test_sl,
            take_profit=test_tp
        )
        print(f"Order Result: {json.dumps(order_res, indent=2, default=str)}")
