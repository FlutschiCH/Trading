import os
import hmac
import hashlib
import time
import requests
from urllib.parse import urlencode
from base_broker_handler import BaseBrokerHandler

class BinanceFuturesHandler(BaseBrokerHandler):
    BASE_URL = os.environ.get("BINANCE_FUTURES_URL", "https://fapi.binance.com")
    _session = None

    @classmethod
    def get_session(cls):
        if cls._session is None:
            s = requests.Session()
            from requests.adapters import HTTPAdapter
            from urllib3.util.retry import Retry
            adapter = HTTPAdapter(pool_connections=25, pool_maxsize=25, max_retries=Retry(total=2, backoff_factor=0.2))
            s.mount('https://', adapter)
            s.mount('http://', adapter)
            cls._session = s
        return cls._session

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

        session = cls.get_session()
        t0 = time.time()
        try:
            if method.upper() == 'GET':
                response = session.get(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'POST':
                response = session.post(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'PUT':
                response = session.put(url, headers=headers, params=params, timeout=10)
            elif method.upper() == 'DELETE':
                response = session.delete(url, headers=headers, params=params, timeout=10)
            else:
                return {'error': f'Unsupported HTTP method: {method}'}

            elapsed_ms = int((time.time() - t0) * 1000)
            try:
                res_json = response.json()
                if isinstance(res_json, dict) and 'code' in res_json:
                    code_val = res_json.get('code')
                    msg_val = str(res_json.get('msg', '')).lower()
                    if str(code_val) not in ('200', '0') and msg_val != 'success':
                        print(f"[Binance ERROR] Endpoint: {endpoint} | Params: {params} | Code: {code_val}, Msg: {res_json.get('msg')}", flush=True)
                        if 'error' not in res_json:
                            res_json['error'] = res_json.get('msg', f"Binance error code {code_val}")
                return res_json
            except Exception as parse_err:
                print(f"[Binance ERROR] Failed to parse JSON on {endpoint} (HTTP {response.status_code}, {elapsed_ms}ms): {parse_err} | Text: {response.text[:300]}", flush=True)
                return {'error': f"HTTP {response.status_code}: {response.text}"}
        except Exception as e:
            elapsed_ms = int((time.time() - t0) * 1000)
            print(f"[Binance ERROR] Network/HTTP Exception on {endpoint} ({elapsed_ms}ms): {e}", flush=True)
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

        # Fetch open orders and open algo orders to populate SL / TP on open positions
        open_orders = []
        try:
            order_params = {'symbol': symbol} if symbol else {}
            res_orders = cls._request('GET', '/fapi/v1/openOrders', params=order_params, api_key=api_key, secret_key=secret_key, signed=True)
            if isinstance(res_orders, list):
                open_orders.extend(res_orders)
        except Exception:
            pass

        try:
            algo_params = {'symbol': symbol} if symbol else {}
            res_algo = cls._request('GET', '/fapi/v1/openAlgoOrders', params=algo_params, api_key=api_key, secret_key=secret_key, signed=True)
            if isinstance(res_algo, list):
                open_orders.extend(res_algo)
        except Exception:
            pass

        positions = []
        for pos in res:
            amt = float(pos.get('positionAmt', 0))
            if amt != 0:
                p_sym = pos.get('symbol')
                if symbol and p_sym != symbol:
                    continue

                pos_side = 'BUY' if amt > 0 else 'SELL'
                sl_val = 0.0
                tp_val = 0.0

                # Match reduceOnly or conditional algo open orders for this symbol
                for o in open_orders:
                    if o.get('symbol') == p_sym:
                        o_type = str(o.get('type') or o.get('origType') or o.get('orderType') or '').upper()
                        price_val = float(o.get('price') or 0.0)
                        stop_val = float(o.get('stopPrice') or o.get('triggerPrice') or 0.0)
                        target_price = stop_val if stop_val > 0 else price_val

                        if target_price > 0:
                            if 'STOP' in o_type:
                                sl_val = target_price
                            elif 'TAKE_PROFIT' in o_type:
                                tp_val = target_price
                            elif o.get('reduceOnly') or o.get('closePosition'):
                                if pos_side == 'BUY':
                                    if target_price < float(pos.get('entryPrice', 0)):
                                        sl_val = target_price
                                    else:
                                        tp_val = target_price
                                else:  # SELL position
                                    if target_price > float(pos.get('entryPrice', 0)):
                                        sl_val = target_price
                                    else:
                                        tp_val = target_price

                positions.append({
                    'symbol': p_sym,
                    'positionAmt': amt,
                    'entryPrice': float(pos.get('entryPrice', 0)),
                    'markPrice': float(pos.get('markPrice', 0)),
                    'unRealizedProfit': float(pos.get('unRealizedProfit', 0)),
                    'liquidationPrice': float(pos.get('liquidationPrice', 0)),
                    'leverage': int(pos.get('leverage', 1)),
                    'marginType': pos.get('marginType'),
                    'side': pos_side,
                    'stop_loss': sl_val,
                    'sl': sl_val,
                    'take_profit': tp_val,
                    'tp': tp_val,
                    'raw': pos
                })
        return positions

    _symbol_rules_cache = {}
    _valid_symbols_cache_time = 0

    @classmethod
    def _get_symbol_rules(cls, symbol: str) -> dict:
        now = time.time()
        if not cls._symbol_rules_cache or (now - cls._valid_symbols_cache_time >= 3600):
            try:
                res = cls._request('GET', '/fapi/v1/exchangeInfo')
                if isinstance(res, dict) and not res.get('error'):
                    rules = {}
                    for s in res.get('symbols', []):
                        sym_name = s.get('symbol', '').upper()
                        tick_size = 0.01
                        step_size = 0.001
                        for f in s.get('filters', []):
                            if f.get('filterType') == 'PRICE_FILTER':
                                tick_size = float(f.get('tickSize', 0.01))
                            elif f.get('filterType') == 'LOT_SIZE':
                                step_size = float(f.get('stepSize', 0.001))
                        rules[sym_name] = {
                            'status': s.get('status'),
                            'tickSize': tick_size,
                            'stepSize': step_size,
                            'pricePrecision': int(s.get('pricePrecision', 2)),
                            'quantityPrecision': int(s.get('quantityPrecision', 3))
                        }
                    if rules:
                        cls._symbol_rules_cache = rules
                        cls._valid_symbols_cache_time = now
            except Exception:
                pass
        return cls._symbol_rules_cache.get(symbol.upper(), {})

    @classmethod
    def _format_price(cls, symbol: str, price: float) -> float:
        rules = cls._get_symbol_rules(symbol)
        tick = rules.get('tickSize', 0.1)
        if tick > 0:
            decimals = 0
            tick_str = str(tick).rstrip('0')
            if '.' in tick_str:
                decimals = len(tick_str.split('.')[1])
            return round(round(price / tick) * tick, decimals)
        prec = rules.get('pricePrecision', 2)
        return round(float(price), prec)

    @classmethod
    def _format_quantity(cls, symbol: str, qty: float) -> float:
        rules = cls._get_symbol_rules(symbol)
        step = rules.get('stepSize', 0.001)
        if step > 0:
            decimals = 0
            step_str = str(step).rstrip('0')
            if '.' in step_str:
                decimals = len(step_str.split('.')[1])
            return round(round(qty / step) * step, decimals)
        prec = rules.get('quantityPrecision', 3)
        return round(float(qty), prec)

    @classmethod
    def _place_algo_order(cls, symbol: str, side: str, price: float, volume: float, is_stop: bool = False, api_key: str = None, secret_key: str = None) -> dict:
        if not price or float(price) <= 0:
            return {'status': 'skipped', 'message': 'Invalid price'}
        
        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}

        formatted_qty = cls._format_quantity(b_sym, float(volume))
        if formatted_qty <= 0:
            formatted_qty = cls._get_symbol_rules(b_sym).get('stepSize', 0.001)

        formatted_price = cls._format_price(b_sym, price)
        order_type = 'STOP_MARKET' if is_stop else 'TAKE_PROFIT_MARKET'

        params = {
            'symbol': b_sym,
            'algoType': 'CONDITIONAL',
            'type': order_type,
            'side': side.upper(),
            'triggerPrice': formatted_price,
            'quantity': formatted_qty
        }
        res = cls._request('POST', '/fapi/v1/algoOrder', params=params, api_key=api_key, secret_key=secret_key, signed=True)
        return res

    _max_leverage_cache = {}  # {symbol: max_leverage_int}

    @classmethod
    def get_max_leverage(cls, symbol: str, api_key: str = None, secret_key: str = None) -> int:
        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            return 75
        if b_sym in cls._max_leverage_cache:
            return cls._max_leverage_cache[b_sym]
        try:
            res = cls._request('GET', '/fapi/v1/leverageBracket', params={'symbol': b_sym}, api_key=api_key, secret_key=secret_key, signed=True)
            if isinstance(res, list) and len(res) > 0:
                brackets = res[0].get('brackets', [])
                if brackets:
                    max_lev = max(int(b.get('initialLeverage', 1)) for b in brackets)
                    cls._max_leverage_cache[b_sym] = max_lev
                    return max_lev
        except Exception:
            pass
        return 75

    @classmethod
    def ensure_max_leverage(cls, symbol: str, api_key: str = None, secret_key: str = None) -> dict:
        max_lev = cls.get_max_leverage(symbol, api_key=api_key, secret_key=secret_key)
        return cls.change_leverage(symbol=symbol, leverage=max_lev, api_key=api_key, secret_key=secret_key)

    @classmethod
    def create_order(cls, symbol: str, side: str, volume: float, price: float = None, order_type: str = 'MARKET', stop_loss: float = None, take_profit: float = None, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            print(f"[BinanceHandler] Warning: Symbol '{symbol}' has no mapping on Binance. Skipping create_order.", flush=True)
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}

        # First order of business: Automatically ensure max leverage is set
        try:
            cls.ensure_max_leverage(b_sym, api_key=api_key, secret_key=secret_key)
        except Exception as lev_err:
            print(f"[BinanceHandler] Warning: Failed to auto-set max leverage for {b_sym}: {lev_err}", flush=True)

        # 1. Open primary position with pure Market order (no SL/TP params on market call)
        formatted_vol = cls._format_quantity(b_sym, float(volume))
        params = {
            'symbol': b_sym,
            'side': side.upper(),
            'type': order_type.upper(),
            'quantity': formatted_vol
        }

        if order_type.upper() == 'LIMIT':
            if price is None:
                return {'error': 'Price is required for LIMIT order'}
            params['price'] = cls._format_price(b_sym, price)
            params['timeInForce'] = kwargs.get('timeInForce', 'GTC')

        order_res = cls._request('POST', '/fapi/v1/order', params=params, api_key=api_key, secret_key=secret_key, signed=True)

        if 'error' in order_res:
            return order_res

        results = {'main_order': order_res}

        # 2. Place 2nd and 3rd algo orders in opposite direction for SL and TP
        opposite_side = 'SELL' if side.upper() == 'BUY' else 'BUY'
        if stop_loss is not None and float(stop_loss) > 0:
            results['stop_loss_order'] = cls._place_algo_order(
                symbol=b_sym,
                side=opposite_side,
                price=stop_loss,
                volume=formatted_vol,
                is_stop=True,
                api_key=api_key,
                secret_key=secret_key
            )

        if take_profit is not None and float(take_profit) > 0:
            results['take_profit_order'] = cls._place_algo_order(
                symbol=b_sym,
                side=opposite_side,
                price=take_profit,
                volume=formatted_vol,
                is_stop=False,
                api_key=api_key,
                secret_key=secret_key
            )

        return results

    @classmethod
    def close_position(cls, position_id: int = None, symbol: str = None, side: str = None, volume: float = 0.0, api_key: str = None, secret_key: str = None, **kwargs) -> dict:
        if not symbol:
            return {'error': 'Symbol is required to close position'}

        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            print(f"[BinanceHandler] Warning: Symbol '{symbol}' has no mapping on Binance. Skipping close_position.", flush=True)
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}

        # Cancel any pending open SL/TP orders and algo orders
        cls.cancel_all_orders(symbol=b_sym, api_key=api_key, secret_key=secret_key)

        if not side:
            positions = cls.get_positions(api_key=api_key, secret_key=secret_key, symbol=b_sym)
            if isinstance(positions, dict) and 'error' in positions:
                return positions
            if not positions:
                return {'error': f'No open position found for {b_sym}'}
            amt = positions[0]['positionAmt']
            side = 'SELL' if amt > 0 else 'BUY'
            volume = abs(amt)
        else:
            side = 'SELL' if side.upper() == 'BUY' else 'BUY'

        params = {
            'symbol': b_sym,
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

        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}

        positions = cls.get_positions(api_key=api_key, secret_key=secret_key, symbol=b_sym)
        if not positions or isinstance(positions, dict):
            return {'error': 'No open position found to modify'}

        pos = positions[0]
        pos_amt = float(pos.get('positionAmt', 0))
        if pos_amt == 0:
            return {'error': f'No open position amount for {b_sym}'}

        pos_side = 'BUY' if pos_amt > 0 else 'SELL'
        opposite_side = 'SELL' if pos_side == 'BUY' else 'BUY'
        volume = abs(pos_amt)

        # Clear existing open reduceOnly and algo orders before placing updated ones
        cls.cancel_all_orders(symbol=b_sym, api_key=api_key, secret_key=secret_key)

        results = {'status': 'success'}
        if stop_loss is not None and float(stop_loss) > 0:
            results['stop_loss_order'] = cls._place_algo_order(
                symbol=b_sym,
                side=opposite_side,
                price=stop_loss,
                volume=volume,
                is_stop=True,
                api_key=api_key,
                secret_key=secret_key
            )

        if take_profit is not None and float(take_profit) > 0:
            results['take_profit_order'] = cls._place_algo_order(
                symbol=b_sym,
                side=opposite_side,
                price=take_profit,
                volume=volume,
                is_stop=False,
                api_key=api_key,
                secret_key=secret_key
            )

        return results

    _valid_symbols_cache = set()
    _valid_symbols_cache_time = 0

    @classmethod
    def get_valid_symbols(cls) -> set:
        now = time.time()
        if cls._valid_symbols_cache and (now - cls._valid_symbols_cache_time < 3600):
            return cls._valid_symbols_cache
        try:
            res = cls._request('GET', '/fapi/v1/exchangeInfo')
            if isinstance(res, dict) and not res.get('error'):
                symbols = {s['symbol'].upper() for s in res.get('symbols', []) if s.get('status') == 'TRADING'}
                if symbols:
                    cls._valid_symbols_cache = symbols
                    cls._valid_symbols_cache_time = now
                    return symbols
        except Exception:
            pass
        return cls._valid_symbols_cache

    @classmethod
    def validate_and_format_symbol(cls, symbol: str) -> str:
        """
        Validates if symbol is mapped or valid on Binance Futures. Returns formatted Binance symbol or None.
        """
        if not symbol or not str(symbol).strip():
            return None
        s = str(symbol).upper().replace('/', '').replace('-', '').replace('_', '').strip()
        
        valid_set = cls.get_valid_symbols()
        if valid_set:
            if s in valid_set:
                return s
            if s.endswith('USD') and not s.endswith('USDT') and (s[:-3] + 'USDT') in valid_set:
                return s[:-3] + 'USDT'
            if (s + 'USDT') in valid_set:
                return s + 'USDT'
            return None
        
        # Fallback check if exchangeInfo could not be fetched
        if '.' in s or any(f in s for f in ['EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY', 'XAU']) and not s.endswith('USDT'):
            return None
        return s

    @classmethod
    def cancel_all_orders(cls, symbol: str, api_key: str = None, secret_key: str = None) -> dict:
        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            print(f"[BinanceHandler] Warning: Symbol '{symbol}' has no mapping on Binance. Skipping cancel_all_orders.", flush=True)
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}

        # 1. Cancel all standard open orders
        res = cls._request('DELETE', '/fapi/v1/allOpenOrders', params={'symbol': b_sym}, api_key=api_key, secret_key=secret_key, signed=True)

        # 2. Cancel all open algo orders for this symbol
        try:
            open_algos = cls._request('GET', '/fapi/v1/openAlgoOrders', params={'symbol': b_sym}, api_key=api_key, secret_key=secret_key, signed=True)
            if isinstance(open_algos, list):
                for ao in open_algos:
                    a_id = ao.get('algoId')
                    if a_id:
                        cls._request('DELETE', '/fapi/v1/algoOrder', params={'symbol': b_sym, 'algoId': a_id}, api_key=api_key, secret_key=secret_key, signed=True)
        except Exception:
            pass

        return res

    @classmethod
    def change_leverage(cls, symbol: str, leverage: int, api_key: str = None, secret_key: str = None) -> dict:
        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}
        params = {'symbol': b_sym, 'leverage': leverage}
        return cls._request('POST', '/fapi/v1/leverage', params=params, api_key=api_key, secret_key=secret_key, signed=True)

    @classmethod
    def change_margin_type(cls, symbol: str, margin_type: str, api_key: str = None, secret_key: str = None) -> dict:
        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            return {'error': f"Symbol '{symbol}' has no mapping on Binance"}
        params = {'symbol': b_sym, 'marginType': margin_type.upper()}
        return cls._request('POST', '/fapi/v1/marginType', params=params, api_key=api_key, secret_key=secret_key, signed=True)

    @classmethod
    def fetch_candles(cls, symbol: str, timeframe: str, limit: int = 1000, date_from: int = None, date_to: int = None, **kwargs) -> list:
        tf_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '4h': '4h', '1d': '1d'
        }
        interval = tf_map.get(timeframe, '15m')
        target_limit = max(1, int(limit))

        b_sym = cls.validate_and_format_symbol(symbol)
        if not b_sym:
            print(f"[BinanceHandler] Warning: Symbol '{symbol}' has no mapping on Binance. Skipping fetch_candles.", flush=True)
            return []

        if target_limit <= 1500 and not (date_from and date_to):
            params = {
                'symbol': b_sym,
                'interval': interval,
                'limit': target_limit
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

            return [{
                'time': int(k[0] / 1000),
                'open': float(k[1]),
                'high': float(k[2]),
                'low': float(k[3]),
                'close': float(k[4]),
                'volume': float(k[5])
            } for k in res]

        # Multi-batch pagination for limit > 1500
        all_klines = []
        current_end_time = (date_to * 1000) if date_to else None
        remaining = target_limit

        while remaining > 0:
            batch_limit = min(remaining, 1500)
            params = {
                'symbol': b_sym,
                'interval': interval,
                'limit': batch_limit
            }
            if date_from:
                params['startTime'] = date_from * 1000
            if current_end_time:
                params['endTime'] = current_end_time

            res = cls._request('GET', '/fapi/v1/klines', params=params)
            if isinstance(res, dict) and 'error' in res:
                if all_klines:
                    break
                return res
            if not isinstance(res, list) or len(res) == 0:
                break

            all_klines = res + all_klines
            remaining -= len(res)

            earliest_time = res[0][0]
            if current_end_time is not None and earliest_time >= current_end_time:
                break
            current_end_time = earliest_time - 1

            if len(res) < batch_limit:
                break

        seen_times = set()
        candles = []
        for k in all_klines:
            t = int(k[0] / 1000)
            if t not in seen_times:
                seen_times.add(t)
                candles.append({
                    'time': t,
                    'open': float(k[1]),
                    'high': float(k[2]),
                    'low': float(k[3]),
                    'close': float(k[4]),
                    'volume': float(k[5])
                })
        candles.sort(key=lambda c: c['time'])
        return candles[-target_limit:]

    @classmethod
    def get_symbols(cls, **kwargs) -> dict:
        res = cls._request('GET', '/fapi/v1/exchangeInfo')
        if isinstance(res, dict) and 'error' in res:
            return res
        symbols = [s['symbol'] for s in res.get('symbols', []) if s.get('status') == 'TRADING']
        return {'symbols': symbols}

    @classmethod
    def get_history(cls, symbol: str = None, api_key: str = None, secret_key: str = None, limit: int = 100, account_id: str = None, **kwargs) -> list:
        from symbol_mapping_handler import SymbolMappingHandler
        acc_id = str(account_id) if account_id else None

        # Resolve symbol if provided
        target_symbols = []
        if symbol and str(symbol).strip() and str(symbol).strip().upper() not in ('NONE', 'NULL', 'UNDEFINED', 'ALL', ''):
            # Check custom mapping first if account_id is present
            mapped = SymbolMappingHandler.map_to_broker(symbol, acc_id) if acc_id else None
            b_sym = cls.validate_and_format_symbol(mapped or symbol)
            if not b_sym:
                print(f"[BinanceHandler] Warning: Symbol '{symbol}' has no mapping on Binance. Skipping get_history.", flush=True)
                return []
            target_symbols = [b_sym]
        else:
            # If symbol is None or 'ALL', fetch user trades for all mapped symbols or top active Binance symbols
            if acc_id:
                mappings = SymbolMappingHandler.get_mappings(account_id=acc_id)
                for m in mappings:
                    b_mapped = cls.validate_and_format_symbol(m.get('broker_symbol') or m.get('main_symbol'))
                    if b_mapped and b_mapped not in target_symbols:
                        target_symbols.append(b_mapped)

            if not target_symbols:
                # Default popular futures symbols if no specific mappings configured
                target_symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT']

        all_trades = []
        for b_sym in target_symbols:
            params = {
                'symbol': b_sym,
                'limit': limit
            }
            res = cls._request('GET', '/fapi/v1/userTrades', params=params, api_key=api_key, secret_key=secret_key, signed=True)
            if isinstance(res, list):
                for t in res:
                    trade_sym = t.get('symbol', b_sym)
                    main_sym = SymbolMappingHandler.map_to_main(trade_sym, acc_id) if acc_id else trade_sym
                    all_trades.append({
                        'ticket': t.get('id'),
                        'order': t.get('orderId'),
                        'symbol': main_sym or trade_sym,
                        'trade_side': 'BUY' if t.get('side') == 'BUY' else 'SELL',
                        'volume': float(t.get('qty', 0)),
                        'price': float(t.get('price', 0)),
                        'profit': float(t.get('realizedPnl', 0)),
                        'commission': float(t.get('commission', 0)),
                        'timestamp': int(t.get('time', 0) / 1000)
                    })

        all_trades.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        return all_trades[:limit]

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


