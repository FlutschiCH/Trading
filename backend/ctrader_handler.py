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
            if res1.get("payloadType") == 50 or res1.get("payloadType") == 2142: # Error
                print(f"App Auth Error: {res1}")
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
                if res2.get("payloadType") == 50 or res2.get("payloadType") == 2142: # Error
                    print(f"Account Auth Error: {res2}")
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
        try:
            # Map timeframe string to cTrader TrendbarPeriod enum value
            tf_map = {
                "1m": 1,   # M1
                "2m": 2,   # M2
                "3m": 3,   # M3
                "4m": 4,   # M4
                "5m": 5,   # M5
                "10m": 6,  # M10
                "15m": 7,  # M15
                "30m": 8,  # M30
                "1h": 9,   # H1
                "4h": 10,  # H4
                "12h": 11, # H12
                "1d": 12,  # D1
                "1w": 13,  # W1
                "1mn": 14  # MN1
            }
            period = tf_map.get(timeframe.lower(), 7) # Default M15

            # Resolve Symbol ID
            symbol_id = 1
            if "btc" in symbol.lower():
                symbol_id = 2237
            elif "gbp" in symbol.lower():
                symbol_id = 2
            elif "jpy" in symbol.lower():
                symbol_id = 3

            # Default date range if not provided
            now_ms = int(time.time() * 1000)
            # Calculate fromTimestamp based on limit if date_from is missing
            # M15 = 15 mins = 900 seconds. Scale dynamically.
            duration_secs = 900
            if timeframe == "1m": duration_secs = 60
            elif timeframe == "5m": duration_secs = 300
            elif timeframe == "30m": duration_secs = 1800
            elif timeframe == "1h": duration_secs = 3600
            elif timeframe == "4h": duration_secs = 14400
            elif timeframe == "1d": duration_secs = 86400

            from_ms = int(date_from * 1000) if date_from else now_ms - (limit * duration_secs * 1000)
            to_ms = int(date_to * 1000) if date_to else now_ms

            # Call ProtoOAGetTrendbarsReq (2137)
            payload = {
                "symbolId": symbol_id,
                "period": period,
                "fromTimestamp": from_ms,
                "toTimestamp": to_ms
            }
            res = CTraderHandler._send_and_receive(2137, payload)
            if res.get("payloadType") == 2138: # ProtoOAGetTrendbarsRes
                trendbars = res.get("payload", {}).get("trendbar", [])
                candles_list = []
                # To get actual price, convert delta formats: Open = Low + deltaOpen
                for tb in trendbars:
                    low_raw = tb.get("low", 0)
                    # cTrader prices are scaled (usually by 100,000 for standard forex majors, or 100 for indices/crypto)
                    # Scale based on symbol logic
                    scale = 100000.0
                    if symbol_id == 2237: # BTCUSD
                        scale = 100.0
                    
                    low = float(low_raw) / scale
                    open_price = float(low_raw + tb.get("deltaOpen", 0)) / scale
                    high_price = float(low_raw + tb.get("deltaHigh", 0)) / scale
                    close_price = float(low_raw + tb.get("deltaClose", 0)) / scale
                    
                    # cTrader volume is formatted as units
                    vol = float(tb.get("volume", 0)) / 100.0
                    
                    # UTC timestamp is derived from the delta offset
                    # The first bar uses fromTimestamp, subsequent bars offset relative to it
                    tb_time = int(tb.get("utcTimestampInMinutes", 0)) * 60
                    if tb_time == 0:
                        tb_time = int(from_ms // 1000)

                    candles_list.append({
                        "time": tb_time,
                        "open": open_price,
                        "high": high_price,
                        "low": low,
                        "close": close_price,
                        "volume": vol
                    })
                if candles_list:
                    return candles_list

            # Fallback to YFinance if API trendbar request returns empty or error
            from yfinance_handler import YFinanceHandler
            return YFinanceHandler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit, date_from=date_from, date_to=date_to)
        except Exception:
            # Fallback
            try:
                from yfinance_handler import YFinanceHandler
                return YFinanceHandler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit, date_from=date_from, date_to=date_to)
            except Exception:
                return []

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
    def get_history(**kwargs) -> dict:
        try:
            # Fetch deals using payloadType = 2133 (ProtoOADealListReq)
            now_ms = int(time.time() * 1000)
            from_ms = now_ms - (30 * 24 * 60 * 60 * 1000) # Fetch last 30 days
            payload = {
                "fromTimestamp": from_ms,
                "toTimestamp": now_ms
            }
            res = CTraderHandler._send_and_receive(2133, payload)
            deals = []
            if res.get("payloadType") == 2134: # ProtoOADealListRes
                raw_deals = res.get("payload", {}).get("deal", [])
                for d in raw_deals:
                    profit = float(d.get("moneyDigits", 0)) # Net profit
                    deals.append({
                        "ticket": int(d["dealId"]),
                        "symbol": "EURUSD", # Default mapping
                        "trade_side": "BUY" if d.get("tradeSide") == "BUY" else "SELL",
                        "volume": float(d.get("volume", 0)) / 10000000.0,
                        "profit": float(d.get("netProfit", 0)) / 100.0,
                        "commission": float(d.get("commission", 0)) / 100.0,
                        "swap": float(d.get("swap", 0)) / 100.0,
                        "comment": d.get("comment", ""),
                        "timestamp": int(d.get("executionTimestamp", time.time() * 1000)) // 1000
                    })
            return {"status": "success", "data": deals}
        except Exception as e:
            return {"status": "success", "data": []}

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
    
    # Test Candle Fetching
    print("Fetching last 5 candles via cTrader Open API...")
    candles = CTraderHandler.fetch_candles(symbol="EURUSD", timeframe="15m", limit=5)
    print(f"Fetched {len(candles)} candles. Most recent: {candles[-1] if candles else 'None'}")
