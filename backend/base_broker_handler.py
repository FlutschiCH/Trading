from abc import ABC, abstractmethod

class BaseBrokerHandler(ABC):
    @staticmethod
    @abstractmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs) -> list:
        pass

    @staticmethod
    @abstractmethod
    def get_account_info(**kwargs) -> dict:
        pass

    @staticmethod
    @abstractmethod
    def get_positions(**kwargs) -> list:
        pass

    @staticmethod
    @abstractmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, magic: int = None, **kwargs) -> dict:
        pass

    @staticmethod
    @abstractmethod
    def close_position(position_id: int, symbol: str, side: str, volume: float, **kwargs) -> dict:
        pass

    @staticmethod
    @abstractmethod
    def get_symbols(**kwargs) -> dict:
        pass
