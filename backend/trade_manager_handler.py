from broker_handler import BrokerHandler
from typing import Dict, Any, List, Optional

class TradeManager:
    """
    Unified TradeManager handler responsible for fetching active positions,
    historical closed deals, order execution, position closing, and modify actions
    across configured brokers via BrokerHandler.
    """

    @classmethod
    def get_positions(
        cls,
        broker_name: Optional[str] = None,
        account_id: Optional[str] = None,
        symbol: Optional[str] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Fetch active live open positions for a specific broker account.
        """
        return BrokerHandler.get_positions(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            **kwargs
        )

    @classmethod
    def get_history(
        cls,
        broker_name: Optional[str] = None,
        account_id: Optional[str] = None,
        symbol: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Fetch historical closed deals/trades for a broker account.
        """
        return BrokerHandler.get_history(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            date_from=date_from,
            date_to=date_to,
            **kwargs
        )

    @classmethod
    def get_trade_overview(
        cls,
        broker_name: Optional[str] = None,
        account_id: Optional[str] = None,
        symbol: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Fetch both active open positions and closed trade history in a single call.
        """
        positions = cls.get_positions(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            **kwargs
        )
        history = cls.get_history(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            date_from=date_from,
            date_to=date_to,
            **kwargs
        )
        return {
            "positions": positions if isinstance(positions, list) else [],
            "history": history if isinstance(history, list) else []
        }

    @classmethod
    def execute_order(
        cls,
        broker_name: Optional[str] = None,
        account_id: Optional[str] = None,
        symbol: str = "",
        order_type: str = "buy",
        volume: float = 0.01,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute an order via BrokerHandler.
        """
        return BrokerHandler.execute_order(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            order_type=order_type,
            volume=volume,
            stop_loss=stop_loss,
            take_profit=take_profit,
            **kwargs
        )

    @classmethod
    def close_position(
        cls,
        broker_name: Optional[str] = None,
        account_id: Optional[str] = None,
        position_id: Optional[Any] = None,
        symbol: Optional[str] = None,
        volume: Optional[float] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Close an active position via BrokerHandler.
        """
        return BrokerHandler.close_position(
            broker_name=broker_name,
            account_id=account_id,
            position_id=position_id,
            symbol=symbol,
            volume=volume,
            **kwargs
        )

    @classmethod
    def modify_position(
        cls,
        broker_name: Optional[str] = None,
        account_id: Optional[str] = None,
        position_id: Optional[Any] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Modify position SL/TP via BrokerHandler.
        """
        return BrokerHandler.modify_position(
            broker_name=broker_name,
            account_id=account_id,
            position_id=position_id,
            stop_loss=stop_loss,
            take_profit=take_profit,
            **kwargs
        )
