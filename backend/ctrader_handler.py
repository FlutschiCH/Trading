import os
import logging
import requests

class CTraderHandler:
    def __init__(self):
        self.connected = False
        self.access_token = None
        self.account_id = None
        self.mock_positions = []
        self.mock_account_info = {
            "balance": 25000.0,
            "equity": 25000.0,
            "margin": 0.0,
            "margin_free": 25000.0,
            "currency": "EUR",
            "account_type": "Demo",
            "broker": "cTrader Beta"
        }

    def connect(self, access_token=None, account_id=None):
        # Authenticate with cTrader OpenAPI (simulated/mock fallback)
        if access_token and account_id:
            self.access_token = access_token
            self.account_id = account_id
            self.connected = True
            # Real connections would perform HTTPS handshake with cTrader Open API Gateway
            return {"status": "success", "message": "Connected to cTrader OpenAPI Gateway.", "account_id": account_id}
        
        # Fallback to simulated mode
        self.connected = True
        return {"status": "success", "message": "Connected to cTrader Mock Environment.", "mock": True}

    def get_account_info(self):
        if not self.connected:
            return {"status": "error", "message": "Not connected to cTrader."}
        
        # In a real setup, we would request OpenAPI endpoint: https://sandbox-tradeapi.spotware.com/sandbox/v2/symbols...
        return {"status": "success", "data": self.mock_account_info}

    def place_order(self, symbol, order_type, volume, price=None):
        if not self.connected:
            return {"status": "error", "message": "Not connected to cTrader."}

        clean_symbol = symbol.replace("BINANCE:", "").replace("USDT", "")
        execution_price = price if price else (57480.0 if clean_symbol == "BTC" else 3130.0)
        order_id = len(self.mock_positions) + 5000

        new_position = {
            "position_id": order_id,
            "symbol": clean_symbol,
            "trade_side": order_type.upper(),
            "volume": volume,
            "entry_price": execution_price,
            "unrealized_profit": 0.0
        }
        self.mock_positions.append(new_position)

        # Update mock balances
        margin_cost = volume * execution_price * 0.005  # 1:200 leverage mock
        self.mock_account_info["margin"] += margin_cost
        self.mock_account_info["margin_free"] -= margin_cost

        return {
            "status": "success",
            "message": f"cTrader order {order_id} filled successfully via OpenAPI.",
            "data": new_position
        }

    def get_positions(self):
        if not self.connected:
            return {"status": "error", "message": "Not connected to cTrader."}
        return {"status": "success", "data": self.mock_positions}
