from metatrader_handler import MetaTraderHandler
from ctrader_handler import CTraderHandler

class BrokerFactory:
    @staticmethod
    def get_handler(broker_name: str):
        if not broker_name:
            return MetaTraderHandler
        
        name_lower = broker_name.lower()
        if "ctrader" in name_lower or "c-trader" in name_lower:
            return CTraderHandler
        return MetaTraderHandler
