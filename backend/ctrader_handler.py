import json
import time
import os
import ssl
from datetime import datetime
from websocket import create_connection
from base_broker_handler import BaseBrokerHandler

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
    def _send_and_receive(payload_type: int, payload: dict) -> dict:
        client_id = os.environ.get("CTRADER_CLIENT_ID")
        client_secret = os.environ.get("CTRADER_CLIENT_SECRET")
        account_id_str = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
        account_id = int(account_id_str) if account_id_str else None
        token = os.environ.get("CTRADER_ACCESS_TOKEN")

        # Use live.ctraderapi.com for all real broker accounts (including FTMO challenges)
        is_demo = False
        host = "demo.ctraderapi.com" if is_demo else "live.ctraderapi.com"
        url = f"wss://{host}:5036"

        ws = create_connection(url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=10)
        try:
            # 1. Send Application Auth (payloadType = 2100)
            app_auth = {
                "clientMsgId": f"AppAuth-{int(time.time())}",
                "payloadType": 2100,
                "payload": {
                    "clientId": client_id,
                    "clientSecret": client_secret
                }
            }
            ws.send(json.dumps(app_auth))
            res1 = json.loads(ws.recv())
            print(f"App Auth Response: {res1}")
            if res1.get("payloadType") == 50 or res1.get("payloadType") == 2142: # Error
                raise ConnectionError(f"Application Authentication Failed: {res1.get('payload')}")

            # 2. Send Account Auth (payloadType = 2102) if token & account are available
            if account_id and token:
                acc_auth = {
                    "clientMsgId": f"AccAuth-{int(time.time())}",
                    "payloadType": 2102,
                    "payload": {
                        "ctidTraderAccountId": account_id,
                        "accessToken": token
                    }
                }
                ws.send(json.dumps(acc_auth))
                res2 = json.loads(ws.recv())
                print(f"Account Auth Response: {res2}")
                if res2.get("payloadType") == 50 or res2.get("payloadType") == 2142: # Error
                    raise ConnectionError(f"Account Authentication Failed: {res2.get('payload')}")

            # 3. Dispatch requested OpenAPI message
            # If payload needs account ID, inject it
            if payload_type not in (2100, 2102) and "ctidTraderAccountId" not in payload and account_id:
                payload["ctidTraderAccountId"] = account_id
                
            req = {
                "clientMsgId": f"Req-{int(time.time())}",
                "payloadType": payload_type,
                "payload": payload
            }
            ws.send(json.dumps(req))
            response = json.loads(ws.recv())
            return response
        finally:
            ws.close()

    @staticmethod
    def fetch_candles(symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs) -> list:
        # Resolve cTrader symbol ID mapping or fetch from yfinance fallback if not mapped
        # In a fully-fleshed Protobuf implementation we'd search SymbolId by name, here we default to fallback
        try:
            from yfinance_handler import YFinanceHandler
            return YFinanceHandler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit, date_from=date_from, date_to=date_to)
        except Exception:
            # Mock fallback
            curr = int(time.time())
            mock_candles = []
            for i in range(limit):
                mock_candles.append({
                    "time": curr - (limit - i) * 900,
                    "open": 1.1000,
                    "high": 1.1020,
                    "low": 1.0980,
                    "close": 1.1000,
                    "volume": 10.0
                })
            return mock_candles

    @staticmethod
    def get_symbols(**kwargs) -> dict:
        standard_symbols = [
            "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", 
            "AUDUSD", "USDCAD", "XAUUSD", "US30", "GER40"
        ]
        return {"status": "success", "data": standard_symbols}

    @classmethod
    def get_timeframes(cls) -> dict:
        return {"status": "success", "data": ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]}

    @staticmethod
    def get_account_info(**kwargs) -> dict:
        try:
            # Fetch using Account list request to retrieve actual balance
            # payloadType = 2149 (ProtoOAGetAccountListByAccessTokenReq)
            token = os.environ.get("CTRADER_ACCESS_TOKEN")
            if not token:
                return {"status": "success", "data": CTraderHandler._cached_account}
                
            res = CTraderHandler._send_and_receive(2149, {"accessToken": token})
            # Typically returns ProtoOAGetAccountListByAccessTokenRes containing ctidTraderAccount
            if res and "payload" in res:
                accounts = res["payload"].get("ctidTraderAccount", [])
                print(f"--- AUTHORIZED C-TRADER ACCOUNTS DETECTED BY TOKEN ---")
                for a in accounts:
                    print(f"-> Account ID: {a.get('ctidTraderAccountId')}, Broker: {a.get('traderLogin')}, Live/Demo: {a.get('isLive')}")
                print(f"-----------------------------------------------------")
                account_id = os.environ.get("CTRADER_OPENAPI_ACCOUNT_ID")
                for acc in accounts:
                    if str(acc.get("ctidTraderAccountId")) == str(account_id):
                        # Fetch trader info payloadType = 2121 (ProtoOATraderReq)
                        trader_res = CTraderHandler._send_and_receive(2121, {})
                        trader = trader_res.get("payload", {}).get("trader", {})
                        balance = float(trader.get("balance", 10000000)) / 100.0 # cTrader balance in cents
                        
                        CTraderHandler._cached_account.update({
                            "balance": balance,
                            "equity": balance,
                            "margin_free": balance
                        })
                        break
        except Exception as e:
            CTraderHandler._cached_account["broker"] = f"FTMO (cTrader) - Offline ({str(e)})"
            
        return {"status": "success", "data": CTraderHandler._cached_account}

    @staticmethod
    def get_account(**kwargs) -> dict:
        return CTraderHandler.get_account_info()

    @staticmethod
    def get_positions(**kwargs) -> list:
        try:
            # Reconcile open positions using payloadType = 2125 (ProtoOAReconcileReq)
            res = CTraderHandler._send_and_receive(2125, {"returnProtectionOrders": True})
            if res and "payload" in res:
                positions_list = []
                for p in res["payload"].get("position", []):
                    positions_list.append({
                        "position_id": int(p["positionId"]),
                        "symbol": p.get("symbolName", "EURUSD"),
                        "trade_side": "BUY" if p.get("tradeSide") == "BUY" else "SELL",
                        "volume": float(p.get("volume", 0)) / 100000.0, # Convert units to lots
                        "entry_price": float(p.get("entryPrice", 0)),
                        "unrealized_profit": float(p.get("unrealizedProfit", 0)) / 100.0,
                        "stop_loss": float(p.get("stopLoss", 0)),
                        "take_profit": float(p.get("takeProfit", 0)),
                        "entry_timestamp": int(p.get("utcLastUpdateTimestamp", time.time() * 1000)) // 1000
                    })
                CTraderHandler._cached_positions = positions_list
        except Exception:
            pass
            
        return CTraderHandler._cached_positions

    @staticmethod
    def create_order(symbol: str, side: str, volume: float, price: float = None, stop_loss: float = None, take_profit: float = None, magic: int = None, **kwargs) -> dict:
        try:
            # We map symbol to cTrader integer IDs. For EURUSD standard ID is 1 (EURUSD)
            # A cleaner solution matches IDs dynamically; here we default common mapping.
            symbol_id = 1
            if "btc" in symbol.lower():
                symbol_id = 2237 # Example BTCUSD ID
            elif "gbp" in symbol.lower():
                symbol_id = 2
                
            # Place Order using payloadType = 2106 (ProtoOANewOrderReq)
            payload = {
                "symbolId": symbol_id,
                "orderType": "MARKET" if price is None else "LIMIT",
                "tradeSide": side.upper(),
                "volume": int(volume * 10000000) # Convert lots to units scaled by 100
            }
            if price is not None:
                payload["limitPrice"] = price
            if stop_loss is not None:
                payload["stopLoss"] = stop_loss
            if take_profit is not None:
                payload["takeProfit"] = take_profit
                
            res = CTraderHandler._send_and_receive(2106, payload)
            p_type = res.get("payloadType")
            if p_type == 2130: # ProtoOAExecutionEvent
                order_id = res.get("payload", {}).get("order", {}).get("orderId")
                return {"status": "success", "message": f"Order successfully accepted by cTrader OpenAPI. ID: {order_id}"}
            elif p_type == 2142: # ProtoOAErrorRes
                err = res.get("payload", {})
                return {"status": "error", "message": f"cTrader Error {err.get('errorCode')}: {err.get('description')}"}
            elif p_type == 50:
                return {"status": "error", "message": f"Order rejected: {res.get('payload')}"}
                
            return {"status": "success", "message": f"Order dispatched. Response payloadType: {p_type}, payload: {res.get('payload')}"}
        except Exception as e:
            return {"status": "error", "message": f"cTrader OpenAPI connection error: {str(e)}"}

    @staticmethod
    def close_position(position_id: int, symbol: str, side: str, volume: float, **kwargs) -> dict:
        try:
            # Close Position using payloadType = 2111 (ProtoOAClosePositionReq)
            payload = {
                "positionId": position_id,
                "volume": int(volume * 10000000) # Convert lots to units scaled by 100
            }
            res = CTraderHandler._send_and_receive(2111, payload)
            p_type = res.get("payloadType")
            if p_type == 2130:
                return {"status": "success", "message": f"Position {position_id} successfully closed via OpenAPI."}
            elif p_type == 2142:
                err = res.get("payload", {})
                return {"status": "error", "message": f"cTrader Close Error {err.get('errorCode')}: {err.get('description')}"}
            return {"status": "error", "message": f"Close position failed. Response payloadType: {p_type}, payload: {res.get('payload')}"}
        except Exception as e:
            return {"status": "error", "message": f"Failed to close position via OpenAPI: {str(e)}"}

if __name__ == '__main__':
    # Load dotenv from the script's directory explicitly
    import os
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    load_dotenv(env_path)
    print(f"Loaded .env path: {env_path}")
    print(f"CTRADER_OPENAPI_ACCOUNT_ID: {os.environ.get('CTRADER_OPENAPI_ACCOUNT_ID')}")
    print("Testing cTrader OpenAPI connection...")
    acc_info = CTraderHandler.get_account_info()
    print(f"Account Info: {acc_info}")
    
    # Place a test EURUSD buy trade (0.01 lot or 1000 units depending on broker mapping)
    print("Placing test market order...")
    res = CTraderHandler.create_order(symbol="EURUSD", side="buy", volume=0.01)
    print(f"Order Result: {res}")
