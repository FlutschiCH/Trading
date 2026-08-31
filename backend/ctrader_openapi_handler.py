import urllib.request
import json
import time
from datetime import datetime

class CTraderOpenAPIHandler:
    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None) -> list:
        # Load the active account from DB
        from account_handler import AccountHandler
        active_acc = AccountHandler.get_active_account()
        if not active_acc or active_acc.get("broker_type") != "ctrader":
            import os
            token = os.environ.get("CTRADER_OPENAPI_TOKEN")
            account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
        else:
            token = active_acc.get("password")  # The password field stores the token/auth key
            account_id = active_acc.get("account_id")
        
        if not token or not account_id:
            raise RuntimeError("No active cTrader account configured. Please connect an account first.")

        # Sandbox or Live URL based on account ID prefix or configuration
        base_url = "https://sandbox-api.spotware.com/connect" if "demo" in str(account_id).lower() else "https://api.spotware.com/connect"
        
        # cTrader timeframe representation: e.g. M1, M5, M15, H1, D1
        tf_map = {
            '1m': 'M1', '3m': 'M3', '5m': 'M5', '15m': 'M15', '30m': 'M30',
            '1h': 'H1', '2h': 'H2', '4h': 'H4', '1d': 'D1'
        }
        ct_tf = tf_map.get(timeframe, 'M15')
        
        # Map timeframe to cTrader API parameter & fetch historical trendbars
        url = f"{base_url}/tradingaccounts/{account_id}/symbols/{symbol}/trendbars/{ct_tf}?oauth_token={token}&limit={limit}"
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            candles = []
            for tb in data.get("trendbar", []):
                candles.append({
                    "time": int(tb["timestamp"]) // 1000,
                    "open": float(tb["open"]) / 100000.0,
                    "high": float(tb["high"]) / 100000.0,
                    "low": float(tb["low"]) / 100000.0,
                    "close": float(tb["close"]) / 100000.0,
                    "volume": float(tb["volume"])
                })
            from candle_sanitizer import sanitize_and_fill_candles
            return sanitize_and_fill_candles(candles, timeframe=timeframe)
