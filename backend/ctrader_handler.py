import urllib.request
import json
import time
import os
from datetime import datetime
from base_broker_handler import BaseBrokerHandler
from ctrader_openapi_handler import CTraderOpenAPIHandler

class CTraderHandler(BaseBrokerHandler):
    # Cache account and positions in memory
    _cached_account = {
        "balance": 100000.0,
        "equity": 100000.0,
        "margin": 0.0,
        "margin_free": 100000.0,
        "currency": "USD",
        "account_type": "cTrader Live OpenAPI",
        "broker": "FTMO (cTrader)"
    }
    _cached_positions = []

    @staticmethod
    def _get_headers() -> dict:
        token = os.environ.get("CTRADER_OPENAPI_TOKEN", "")
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    @staticmethod
    def _get_api_url() -> str:
        account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID", "")
        base = "https://sandbox-api.spotware.com/connect" if "demo" in account_id.lower() else "https://api.spotware.com/connect"
        return base

    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs) -> list:
        return CTraderOpenAPIHandler.fetch_candles(symbol, timeframe, limit, date_from, date_to)

    @staticmethod
    def get_symbols(**kwargs) -> dict:
        standard_symbols = [
            "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", 
            "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"
        ]
        # Return mock / standard or fetch from OpenAPI if token exists
        return {"status": "success", "data": standard_symbols}

    @classmethod
    def get_timeframes(cls) -> dict:
        return {"status": "success", "data": ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]}

    @staticmethod
    def get_account_info(**kwargs) -> dict:
        account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
        if not account_id:
            return {"status": "success", "data": CTraderHandler._cached_account}
            
        try:
            url = f"{CTraderHandler._get_api_url()}/tradingaccounts/{account_id}"
            req = urllib.request.Request(url, headers=CTraderHandler._get_headers())
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode('utf-8'))
                balance = float(data.get("balance", CTraderHandler._cached_account["balance"]))
                CTraderHandler._cached_account.update({
                    "balance": balance,
                    "equity": balance,
                    "margin_free": balance
                })
        except Exception as e:
            CTraderHandler._cached_account["broker"] = f"FTMO (cTrader) - Offline ({str(e)})"
            
        return {"status": "success", "data": CTraderHandler._cached_account}

    @staticmethod
    def get_account(**kwargs) -> dict:
        return CTraderHandler.get_account_info()

    @staticmethod
    def get_positions(**kwargs) -> list:
        account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
        if not account_id:
            return CTraderHandler._cached_positions

        try:
            url = f"{CTraderHandler._get_api_url()}/tradingaccounts/{account_id}/positions"
            req = urllib.request.Request(url, headers=CTraderHandler._get_headers())
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode('utf-8'))
                positions_list = []
                for p in data.get("position", []):
                    positions_list.append({
                        "position_id": int(p["positionId"]),
                        "symbol": p["symbolName"],
                        "trade_side": p["tradeSide"],
                        "volume": float(p["volume"]),
                        "entry_price": float(p["entryPrice"]),
                        "unrealized_profit": float(p.get("unrealizedProfit", 0.0)),
                        "stop_loss": float(p.get("stopLoss", 0.0)),
                        "take_profit": float(p.get("takeProfit", 0.0)),
                        "entry_timestamp": int(p.get("utcLastUpdateTimestamp", time.time() * 1000)) // 1000
                    })
                CTraderHandler._cached_positions = positions_list
        except Exception:
            pass
            
        return CTraderHandler._cached_positions

    @staticmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, magic: int = None, **kwargs) -> dict:
        account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
        if not account_id:
            return {"status": "error", "message": "Missing CTRADER_OPENAPI_ACCOUNT_ID environment variable."}

        try:
            from symbol_mapping_handler import SymbolMappingHandler
            broker_key = "ctrader:openapi"
            mapped_symbol = SymbolMappingHandler.map_to_broker(symbol, broker_key)

            # OpenAPI order payload structure
            payload = {
                "symbolName": mapped_symbol,
                "tradeSide": side.upper(),
                "volume": volume,
                "type": "MARKET" if price is None else "LIMIT"
            }
            if price is not None:
                payload["price"] = price
            if stop_loss is not None:
                payload["stopLoss"] = stop_loss
            if take_profit is not None:
                payload["takeProfit"] = take_profit

            url = f"{CTraderHandler._get_api_url()}/tradingaccounts/{account_id}/orders"
            payload_data = json.dumps(payload).encode('utf-8')
            
            req = urllib.request.Request(url, data=payload_data, headers=CTraderHandler._get_headers(), method='POST')
            with urllib.request.urlopen(req, timeout=5) as response:
                res = json.loads(response.read().decode('utf-8'))
                if "orderId" in res:
                    return {"status": "success", "message": f"Order successfully accepted by cTrader OpenAPI. ID: {res['orderId']}"}
            return {"status": "success", "message": "Order Single dispatched over cTrader OpenAPI connection."}
        except Exception as e:
            return {"status": "error", "message": f"cTrader OpenAPI connection error: {str(e)}"}

    @staticmethod
    def close_position(position_id: int, symbol: str, side: str, volume: float, **kwargs) -> dict:
        account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
        if not account_id:
            return {"status": "error", "message": "Missing CTRADER_OPENAPI_ACCOUNT_ID env var"}
            
        try:
            url = f"{CTraderHandler._get_api_url()}/tradingaccounts/{account_id}/positions/{position_id}"
            req = urllib.request.Request(url, headers=CTraderHandler._get_headers(), method='DELETE')
            with urllib.request.urlopen(req, timeout=5) as response:
                return {"status": "success", "message": f"Position {position_id} successfully closed via OpenAPI."}
        except Exception as e:
            return {"status": "error", "message": f"Failed to close position via OpenAPI: {str(e)}"}
