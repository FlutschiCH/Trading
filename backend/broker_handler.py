from metatrader_handler import MetaTraderHandler
from ctrader_handler import CTraderHandler
from binance_handler import BinanceFuturesHandler
import json

class BrokerHandler:
    @staticmethod
    def _resolve_broker_name(broker_name: str = None, account_id: str = None) -> str:
        if broker_name and str(broker_name).strip():
            return str(broker_name).strip()
        
        if account_id:
            try:
                from account_handler import AccountHandler
                accounts = AccountHandler.get_accounts()
                for acc in accounts:
                    if str(acc.get('account_id')) == str(account_id):
                        return acc.get('broker_type', '')
            except Exception as e:
                print(f"[BrokerHandler] Error looking up account {account_id}: {e}", flush=True)

        try:
            from account_handler import AccountHandler
            active = AccountHandler.get_active_account()
            if active and active.get('broker_type'):
                return active.get('broker_type')
        except Exception:
            pass

        return ""

    @staticmethod
    def get_handler(broker_name: str = None, account_id: str = None):
        resolved_name = BrokerHandler._resolve_broker_name(broker_name, account_id)
        name_lower = resolved_name.lower()
        if "binance" in name_lower:
            return BinanceFuturesHandler
        if "ctrader" in name_lower or "c-trader" in name_lower:
            return CTraderHandler
        if "metatrader" in name_lower or "mt5" in name_lower:
            return MetaTraderHandler
        return MetaTraderHandler

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
            if not matched and not resolved_name:
                matched = AccountHandler.get_active_account()

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
    def get_positions(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        positions = handler.get_positions(account_id=account_id, broker_inst=broker_inst, **kwargs)
        return positions

    @classmethod
    def create_order(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.create_order(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def close_position(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.close_position(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def modify_position(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.modify_position(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def fetch_candles(cls, broker_name: str = None, account_id: str = None, symbol: str = None, timeframe: str = None, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit, date_from=date_from, date_to=date_to, account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_account_info(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.get_account_info(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_account(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        if hasattr(handler, 'get_account'):
            return handler.get_account(account_id=account_id, broker_inst=broker_inst, **kwargs)
        return handler.get_account_info(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_symbols(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.get_symbols(account_id=account_id, broker_inst=broker_inst, **kwargs)

    @classmethod
    def get_timeframes(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        if hasattr(handler, 'get_timeframes'):
            return handler.get_timeframes()
        return ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]

    @classmethod
    def get_history(cls, broker_name: str = None, account_id: str = None, **kwargs):
        handler = cls.get_handler(broker_name, account_id)
        broker_inst = cls.get_instance(broker_name, account_id)
        kwargs = cls._prepare_kwargs(broker_name, account_id, kwargs)
        return handler.get_history(account_id=account_id, broker_inst=broker_inst, **kwargs)

if __name__ == '__main__':
    import json
    import sys

    # Interactive test parameters
    TEST_BROKER = "binance"  # Options: "binance", "ctrader", "metatrader"
    TEST_ACCOUNT_ID = "i9ipCOPhbnrU1K4K5tzzIhnpTLtwSBin1iSg0pFXehKcGEOrc5h53k63OxJdsa5Ent"   # Set account_id string or leave None to fetch active account
    TEST_SYMBOL = "BTCUSDT"

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
    candles = BrokerHandler.fetch_candles(broker_name=TEST_BROKER, account_id=TEST_ACCOUNT_ID, symbol=TEST_SYMBOL, timeframe="15m", limit=5)
    print(f"Fetched {len(candles) if isinstance(candles, list) else 0} candles:")
    print(json.dumps(candles, indent=2, default=str)[:1000])

    # 4. Fetch Symbols
    print("\n4. Testing get_symbols()...")
    symbols = BrokerHandler.get_symbols(broker_name=TEST_BROKER, account_id=TEST_ACCOUNT_ID)
    if isinstance(symbols, dict) and 'symbols' in symbols:
        print(f"Total symbols found: {len(symbols['symbols'])}. First 10: {symbols['symbols'][:10]}")
    else:
        print(symbols)




