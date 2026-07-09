import os
import socket
import ssl
import logging
import json
import requests

class CTraderHandler:
    def __init__(self):
        self.connected = True
        self.local_bridge_url = "http://localhost:8752"
        self.mock_positions = []
        self.mock_account_info = {
            "balance": 10000.0,
            "equity": 10000.0,
            "margin": 0.0,
            "margin_free": 10000.0,
            "currency": "USD",
            "account_type": "Demo",
            "broker": "Local Simulator"
        }
        print(f"[cTrader] Local bridge connector initialized targeting {self.local_bridge_url}")

    def connect(self, access_token=None, account_id=None):
        # We check if local cTrader C# bridge is active
        try:
            response = requests.get(f"{self.local_bridge_url}/account", timeout=1.0)
            if response.status_code == 200:
                print("[cTrader] Local cTrader C# Automate Bridge detected! Syncing with local terminal.")
                return {"status": "success", "message": "Connected to local cTrader terminal via C# Bridge."}
        except Exception:
            pass
        
        print("[cTrader] Local C# Bridge not running. Using local dashboard simulator.")
        return {"status": "success", "message": "Running on local simulation fallback."}

    def get_account_info(self):
        try:
            response = requests.get(f"{self.local_bridge_url}/account", timeout=1.0)
            if response.status_code == 200:
                data = response.json()
                return {"status": "success", "data": {
                    "balance": data.get("balance", 10000.0),
                    "equity": data.get("equity", 10000.0),
                    "margin": data.get("margin", 0.0),
                    "margin_free": data.get("margin_free", 10000.0),
                    "currency": data.get("currency", "USD"),
                    "broker": f"Local {data.get('broker', 'cTrader')}"
                }}
        except Exception:
            pass
        return {"status": "success", "data": self.mock_account_info}

    def place_order(self, symbol, order_type, volume, price=None):
        clean_symbol = symbol.replace("BINANCE:", "").replace("USDT", "")
        
        # Try routing trade to local C# cBot bridge
        try:
            payload = {
                "symbol": clean_symbol,
                "order_type": order_type.upper(),
                "volume": float(volume),
                "price": float(price) if price else None
            }
            response = requests.post(f"{self.local_bridge_url}/order", json=payload, timeout=2.0)
            if response.status_code == 200:
                print(f"[cTrader] Order placed on local terminal via C# Bridge.")
                return {"status": "success", "message": "Order executed on local cTrader terminal."}
        except Exception as e:
            print(f"[cTrader] Local bridge order execution failed: {str(e)}")

        # Fallback to local simulator
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
        margin_cost = volume * execution_price * 0.005
        self.mock_account_info["margin"] += margin_cost
        self.mock_account_info["margin_free"] -= margin_cost
        return {"status": "success", "message": "Order simulated locally.", "data": new_position}

    def get_positions(self):
        try:
            response = requests.get(f"{self.local_bridge_url}/positions", timeout=1.0)
            if response.status_code == 200:
                return {"status": "success", "data": response.json()}
        except Exception:
            pass
        return {"status": "success", "data": self.mock_positions}
