from base_broker_handler import BaseBrokerHandler
from broker_factory import BrokerFactory
import json

class BrokerHandler(BaseBrokerHandler):
    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, broker: str = None, **kwargs) -> list:
        handler = BrokerFactory.get_handler(broker)
        return handler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit, date_from=date_from, date_to=date_to, **kwargs)

    @staticmethod
    def get_account_info(broker: str = None, **kwargs) -> dict:
        handler = BrokerFactory.get_handler(broker)
        return handler.get_account_info(**kwargs)

    @staticmethod
    def get_account(broker: str = None, **kwargs) -> dict:
        handler = BrokerFactory.get_handler(broker)
        return handler.get_account(**kwargs)

    @staticmethod
    def get_positions(broker: str = None, **kwargs) -> list:
        handler = BrokerFactory.get_handler(broker)
        return handler.get_positions(**kwargs)

    @staticmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, magic: int = None, broker: str = None, **kwargs) -> dict:
        handler = BrokerFactory.get_handler(broker)
        return handler.create_order(symbol=symbol, side=side, volume=volume, price=price, stop_loss=stop_loss, take_profit=take_profit, magic=magic, **kwargs)

    @staticmethod
    def close_position(position_id: int, symbol: str, side: str, volume: float, broker: str = None, **kwargs) -> dict:
        handler = BrokerFactory.get_handler(broker)
        return handler.close_position(position_id=position_id, symbol=symbol, side=side, volume=volume, **kwargs)

    @staticmethod
    def get_symbols(broker: str = None, **kwargs) -> dict:
        handler = BrokerFactory.get_handler(broker)
        return handler.get_symbols(**kwargs)

if __name__ == '__main__':
    # Fetch candles from both sides and save to separate JSON files
    import os
    print("Fetching candles from MetaTrader...")
    try:
        mt_candles = BrokerHandler.fetch_candles("EURUSD", "15m", limit=10, broker="metatrader")
        with open("mt_candles.json", "w") as f:
            json.dump(mt_candles, f, indent=4)
        print("MetaTrader candles saved to mt_candles.json")
    except Exception as e:
        print(f"Error fetching MetaTrader candles: {e}")

    print("Fetching candles from cTrader...")
    try:
        ct_candles = BrokerHandler.fetch_candles("EURUSD", "15m", limit=10, broker="ctrader")
        with open("ct_candles.json", "w") as f:
            json.dump(ct_candles, f, indent=4)
        print("cTrader candles saved to ct_candles.json")
    except Exception as e:
        print(f"Error fetching cTrader candles: {e}")
