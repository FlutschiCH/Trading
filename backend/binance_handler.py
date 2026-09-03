import os
import hmac
import hashlib
import time
import requests
from urllib.parse import urlencode
from base_broker_handler import BaseBrokerHandler

class BinanceFuturesHandler(BaseBrokerHandler):
    BASE_URL = os.environ.get("BINANCE_FUTURES_URL", "https://fapi.binance.com")

    @staticmethod
    def _generate_signature(params: dict, secret_key: str) -> str:
        query_string = urlencode(params)
        return hmac.new(
            secret_key.encode('utf-8'),
            query_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    @classmethod
    def _request(cls, method: str, endpoint: str, params: dict = None, api_key: str = None, secret_key: str = None, signed: bool = False):
        params = params or {}
        api_key = api_key or os.environ.get("BINANCE_API_KEY", "")
        secret_key = secret_key or os.environ.get("BINANCE_SECRET_KEY", "")

        if signed and (not api_key or not secret_key):
            print("[BinanceFuturesHandler] Skipping signed request: missing api_key or secret_key", flush=True)
            return {'error': 'Missing Binance API key or Secret key'}

        headers = {}
        if api_key:
            headers['X-MBX-APIKEY'] = api_key

        if signed:
            params['recvWindow'] = 60000
            params['timestamp'] = int(time.time() * 1000)
            params['signature'] = cls._generate_signature(params, secret_key)

        base_host = "https://api.binance.com" if endpoint.startswith("/sapi") else cls.BASE_URL
        url = f"{base_host}{endpoint}"

        try:
            if method.upper() == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'POST':
                response = requests.post(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'PUT':
                response = requests.put(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, params=params, timeout=10)
            else:
                return {'error': f'Unsupported HTTP method: {method}'}

            try:
                res_json = response.json()
                if isinstance(res_json, dict) and 'code' in res_json and res_json['code'] != 200:
                    print(f"[Binance ERROR] Code: {res_json.get('code')}, Msg: {res_json.get('msg')}", flush=True)
                    if 'error' not in res_json:
                        res_json['error'] = res_json.get('msg', f"Binance error code {res_json.get('code')}")
                return res_json
            except Exception as parse_err:
                print(f"[Binance ERROR] Failed to parse JSON: {parse_err}", flush=True)
                return {'error': f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            print(f"[Binance ERROR] Network/HTTP Exception: {e}", flush=True)
            return {'error': str(e)}

    @classmethod
    def get_account_info(cls, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        info = cls._request('GET', '/fapi/v2/account', api_key=api_key, secret_key=secret_key, signed=True)
        if isinstance(info, dict) and not info.get('error'):
            info['balance'] = float(info.get('totalWalletBalance', 0))
            info['equity'] = float(info.get('totalMarginBalance', 0))
            info['unrealizedPnl'] = float(info.get('totalUnrealizedProfit', 0))
            info['availableBalance'] = float(info.get('availableBalance', 0))
            info['margin'] = float(info.get('totalPositionInitialMargin', 0))
            info['currency'] = 'USDT'
        return info

    @classmethod
    def get_account(cls, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        info = cls.get_account_info(api_key=api_key, secret_key=secret_key, **kwargs)
        if 'error' in info:
            return info
        return {
            'balance': float(info.get('totalWalletBalance', 0)),
            'equity': float(info.get('totalMarginBalance', 0)),
            'unrealizedPnl': float(info.get('totalUnrealizedProfit', 0)),
            'availableBalance': float(info.get('availableBalance', 0)),
            'raw': info
        }

    @classmethod
    def get_positions(cls, api_key: str = None, secret_key: str = None, symbol: str = None, **kwargs) -> list:
        res = cls._request('GET', '/fapi/v2/positionRisk', api_key=api_key, secret_key=secret_key, signed=True)
        if isinstance(res, dict) and 'error' in res:
            return res
        if not isinstance(res, list):
            return []

        positions = []
        for pos in res:
            amt = float(pos.get('positionAmt', 0))
            if amt != 0:
                if symbol and pos.get('symbol') != symbol:
                    continue
                positions.append({
                    'symbol': pos.get('symbol'),
                    'positionAmt': amt,
                    'entryPrice': float(pos.get('entryPrice', 0)),
                    'markPrice': float(pos.get('markPrice', 0)),
                    'unRealizedProfit': float(pos.get('unRealizedProfit', 0)),
                    'liquidationPrice': float(pos.get('liquidationPrice', 0)),
                    'leverage': int(pos.get('leverage', 1)),
                    'marginType': pos.get('marginType'),
                    'side': 'BUY' if amt > 0 else 'SELL',
                    'raw': pos
                })
        return positions

    @classmethod
    def create_order(cls, symbol: str, side: str, volume: float, price: float = None, order_type: str = 'MARKET', stop_loss: float = None, take_profit: float = None, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        params = {
            'symbol': symbol,
            'side': side.upper(),
            'type': order_type.upper(),
            'quantity': volume
        }

        if order_type.upper() == 'LIMIT':
            if price is None:
                return {'error': 'Price is required for LIMIT order'}
            params['price'] = price
            params['timeInForce'] = kwargs.get('timeInForce', 'GTC')

        order_res = cls._request('POST', '/fapi/v1/order', params=params, api_key=api_key, secret_key=secret_key, signed=True)

        if 'error' in order_res:
            return order_res

        results = {'main_order': order_res}

        # Place Stop Loss order if specified
        if stop_loss is not None:
            sl_side = 'SELL' if side.upper() == 'BUY' else 'BUY'
            sl_params = {
                'symbol': symbol,
                'side': sl_side,
                'algoType': 'STOP_MARKET',
                'type': 'STOP_MARKET',
                'stopPrice': stop_loss,
                'quantity': volume,
                'reduceOnly': 'true',
                'workingType': 'CONTRACT_PRICE'
            }
            results['stop_loss_order'] = cls._request('POST', '/fapi/v1/algo/order', params=sl_params, api_key=api_key, secret_key=secret_key, signed=True)

        # Place Take Profit order if specified
        if take_profit is not None:
            tp_side = 'SELL' if side.upper() == 'BUY' else 'BUY'
            tp_params = {
                'symbol': symbol,
                'side': tp_side,
                'algoType': 'TAKE_PROFIT_MARKET',
                'type': 'TAKE_PROFIT_MARKET',
                'stopPrice': take_profit,
                'quantity': volume,
                'reduceOnly': 'true',
                'workingType': 'CONTRACT_PRICE'
            }
            results['take_profit_order'] = cls._request('POST', '/fapi/v1/algo/order', params=tp_params, api_key=api_key, secret_key=secret_key, signed=True)

        return results

    @classmethod
    def close_position(cls, position_id: int = None, symbol: str = None, side: str = None, volume: float = 0.0, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        if not symbol:
            return {'error': 'Symbol is required to close position'}

        if not side:
            positions = cls.get_positions(api_key=api_key, secret_key=secret_key, symbol=symbol)
            if isinstance(positions, dict) and 'error' in positions:
                return positions
            if not positions:
                return {'error': f'No open position found for {symbol}'}
            amt = positions[0]['positionAmt']
            side = 'SELL' if amt > 0 else 'BUY'
            volume = abs(amt)
        else:
            side = 'SELL' if side.upper() == 'BUY' else 'BUY'

        params = {
            'symbol': symbol,
            'side': side,
            'type': 'MARKET',
            'quantity': volume,
            'reduceOnly': 'true'
        }

        return cls._request('POST', '/fapi/v1/order', params=params, api_key=api_key, secret_key=secret_key, signed=True)

    @classmethod
    def modify_position(cls, position_id: int = None, stop_loss: float = None, take_profit: float = None, symbol: str = None, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        if not symbol:
            return {'error': 'Symbol is required to modify position'}

        cls.cancel_all_orders(symbol=symbol, api_key=api_key, secret_key=secret_key)
        positions = cls.get_positions(api_key=api_key, secret_key=secret_key, symbol=symbol)
        if not positions or isinstance(positions, dict):
            return {'error': 'No open position found to modify'}

        pos = positions[0]
        side = pos['side']
        vol = abs(float(pos.get('positionAmt', 0))) or 0.01
        results = {}

        if stop_loss is not None:
            sl_side = 'SELL' if side == 'BUY' else 'BUY'
            sl_params = {
                'symbol': symbol,
                'side': sl_side,
                'algoType': 'STOP_MARKET',
                'type': 'STOP_MARKET',
                'stopPrice': stop_loss,
                'quantity': vol,
                'reduceOnly': 'true',
                'workingType': 'CONTRACT_PRICE'
            }
            results['stop_loss_order'] = cls._request('POST', '/fapi/v1/algo/order', params=sl_params, api_key=api_key, secret_key=secret_key, signed=True)

        if take_profit is not None:
            tp_side = 'SELL' if side == 'BUY' else 'BUY'
            tp_params = {
                'symbol': symbol,
                'side': tp_side,
                'algoType': 'TAKE_PROFIT_MARKET',
                'type': 'TAKE_PROFIT_MARKET',
                'stopPrice': take_profit,
                'quantity': vol,
                'reduceOnly': 'true',
                'workingType': 'CONTRACT_PRICE'
            }
            results['take_profit_order'] = cls._request('POST', '/fapi/v1/algo/order', params=tp_params, api_key=api_key, secret_key=secret_key, signed=True)

        return results

    @classmethod
    def cancel_all_orders(cls, symbol: str, api_key: str = None, secret_key: str = None) -> dict:
        return cls._request('DELETE', '/fapi/v1/allOpenOrders', params={'symbol': symbol}, api_key=api_key, secret_key=secret_key, signed=True)

    @classmethod
    def change_leverage(cls, symbol: str, leverage: int, api_key: str = None, secret_key: str = None) -> dict:
        params = {'symbol': symbol, 'leverage': leverage}
        return cls._request('POST', '/fapi/v1/leverage', params=params, api_key=api_key, secret_key=secret_key, signed=True)

    @classmethod
    def change_margin_type(cls, symbol: str, margin_type: str, api_key: str = None, secret_key: str = None) -> dict:
        params = {'symbol': symbol, 'marginType': margin_type.upper()}
        return cls._request('POST', '/fapi/v1/marginType', params=params, api_key=api_key, secret_key=secret_key, signed=True)

    @classmethod
    def fetch_candles(cls, symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs) -> list:
        tf_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '4h': '4h', '1d': '1d'
        }
        interval = tf_map.get(timeframe, '15m')
        params = {
            'symbol': symbol,
            'interval': interval,
            'limit': limit
        }
        if date_from:
            params['startTime'] = date_from * 1000
        if date_to:
            params['endTime'] = date_to * 1000

        res = cls._request('GET', '/fapi/v1/klines', params=params)
        if isinstance(res, dict) and 'error' in res:
            return res
        if not isinstance(res, list):
            return []

        candles = []
        for k in res:
            candles.append({
                'time': int(k[0] / 1000),
                'open': float(k[1]),
                'high': float(k[2]),
                'low': float(k[3]),
                'close': float(k[4]),
                'volume': float(k[5])
            })
        return candles

    @classmethod
    def get_symbols(cls, **kwargs) -> dict:
        res = cls._request('GET', '/fapi/v1/exchangeInfo')
        if isinstance(res, dict) and 'error' in res:
            return res
        symbols = [s['symbol'] for s in res.get('symbols', []) if s.get('status') == 'TRADING']
        return {'symbols': symbols}

    @classmethod
    def get_history(cls, symbol: str = "BTCUSDT", api_key: str = None, secret_key: str = None, limit: int = 100, **kwargs) -> list:
        params = {
            'symbol': symbol,
            'limit': limit
        }
        res = cls._request('GET', '/fapi/v1/userTrades', params=params, api_key=api_key, secret_key=secret_key, signed=True)
        if isinstance(res, dict) and 'error' in res:
            return res
        if not isinstance(res, list):
            return []

        trades = []
        for t in res:
            trades.append({
                'ticket': t.get('id'),
                'order': t.get('orderId'),
                'symbol': t.get('symbol'),
                'trade_side': 'BUY' if t.get('side') == 'BUY' else 'SELL',
                'volume': float(t.get('qty', 0)),
                'price': float(t.get('price', 0)),
                'profit': float(t.get('realizedPnl', 0)),
                'commission': float(t.get('commission', 0)),
                'timestamp': int(t.get('time', 0) / 1000)
            })
        return trades

if __name__ == '__main__':
    from account_handler import AccountHandler
    import json

    print("Fetching active Binance account using AccountHandler...")
    try:
        acc = AccountHandler.get_active_account(broker_type='binance')
        if not acc:
            print("No Binance accounts found via AccountHandler.")
        else:
            api_key = acc.get('account_id')
            secret_key = acc.get('password')
            acc_name = acc.get('name', 'Binance Account')
            print(f"Active Binance Account: {acc_name} (API Key: {api_key[:8] if api_key else 'N/A'}...)")

            print("\n1. Fetching Account Summary...")
            account_data = BinanceFuturesHandler.get_account(api_key=api_key, secret_key=secret_key)
            raw_assets = account_data.get('raw', {}).get('assets', [])
            usdt_asset = next((a for a in raw_assets if a.get('asset') == 'USDT'), None)

            if usdt_asset:
                usdt_summary = {
                    'asset': 'USDT',
                    'walletBalance': float(usdt_asset.get('walletBalance', 0)),
                    'marginBalance': float(usdt_asset.get('marginBalance', 0)),
                    'unrealizedProfit': float(usdt_asset.get('unrealizedProfit', 0)),
                    'availableBalance': float(usdt_asset.get('availableBalance', 0)),
                    'maxWithdrawAmount': float(usdt_asset.get('maxWithdrawAmount', 0))
                }
                print("USDT Account Summary:")
                print(json.dumps(usdt_summary, indent=2))

            test_symbol = 'BTCUSDT'
            test_side = 'BUY'
            test_volume = 0.002  # Minimal BTC position volume on Binance Futures

            print(f"\n2. Fetching current market price for {test_symbol}...")
            candles = BinanceFuturesHandler.fetch_candles(symbol=test_symbol, timeframe='1m', limit=1)
            if candles:
                current_price = candles[-1]['close']
                print(f"Current {test_symbol} price: {current_price}")

                sl_price = round(current_price * 0.98, 2)  # 2% Stop Loss
                tp_price = round(current_price * 1.04, 2)  # 4% Take Profit

                print(f"\n3. Submitting Market {test_side} Order for {test_volume} {test_symbol} (SL: {sl_price}, TP: {tp_price})...")
                order_result = BinanceFuturesHandler.create_order(
                    symbol=test_symbol,
                    side=test_side,
                    volume=test_volume,
                    order_type='MARKET',
                    stop_loss=sl_price,
                    take_profit=tp_price,
                    api_key=api_key,
                    secret_key=secret_key
                )
                print("Order Placement Result:")
                print(json.dumps(order_result, indent=2))
            else:
                print(f"Failed to fetch market price for {test_symbol}.")
    except Exception as e:
        print(f"Error executing position entry test: {e}")


