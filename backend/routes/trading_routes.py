import hmac
import hashlib
import time
import threading
from flask import Blueprint, request, jsonify
from trading_handler import TradingHandler

trading_routes = Blueprint('trading_routes', __name__)

# HMAC configuration
SHARED_SECRET = b"8f9e23c14a5d6b7e8c9d0e1f2a3b4c5d"
REQUIRED_TOKEN = "secure_wyckoff_desks_token_2026"

# Thread-safe in-memory idempotency cache
# Format: {signal_id: timestamp_of_expiry}
idempotency_cache = {}
cache_lock = threading.Lock()

def clean_expired_cache():
    """Removes expired signal IDs from the cache."""
    now = time.time()
    expired = [sid for sid, expiry in idempotency_cache.items() if now > expiry]
    for sid in expired:
        idempotency_cache.pop(sid, None)

@trading_routes.route('/webhook', methods=['POST'])
def webhook():
    # 1. Enforce static token validation in header
    token = request.headers.get('X-Wyckoff-Token')
    if token != REQUIRED_TOKEN:
        return jsonify({"status": "REJECTED", "message": "Unauthorized API token"}), 401
        
    # Get raw request body for HMAC verification
    raw_body = request.get_data()
    
    # 2. Implement HMAC-SHA256 signature verification
    signature = request.headers.get('X-Signature')
    if not signature:
        return jsonify({"status": "REJECTED", "message": "Missing HMAC signature header"}), 400
        
    expected_sig = hmac.new(SHARED_SECRET, raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, signature):
        return jsonify({"status": "REJECTED", "message": "Invalid HMAC signature"}), 401

    try:
        # Request data is parsed from JSON body
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"status": "REJECTED", "message": "Invalid JSON format"}), 400

    signal_id = payload.get('signal_id')
    if not signal_id:
        return jsonify({"status": "REJECTED", "message": "Missing signal_id in payload"}), 400

    # 3. Thread-safe sliding-window idempotency cache check
    with cache_lock:
        clean_expired_cache()
        now = time.time()
        if signal_id in idempotency_cache:
            # Check if still valid
            if now <= idempotency_cache[signal_id]:
                return jsonify({"status": "REJECTED", "message": "Duplicate signal. Blocked by idempotency check."}), 409
        
        # Insert/Update with 60-second sliding expiration
        idempotency_cache[signal_id] = now + 60.0

    # Process signal via handler
    result = TradingHandler.process_webhook_signal(payload)
    
    if result.get('status') == 'REJECTED':
        return jsonify(result), 400
        
    return jsonify(result), 200

@trading_routes.route('/analyze', methods=['POST'])
def analyze():
    """
    Endpoint for analyzing candle lists sent from React frontend.
    """
    payload = request.get_json(silent=True) or {}
    candles = payload.get('candles', [])
    lookback = int(payload.get('lookback', 20))
    result = TradingHandler.analyze_market_data(candles, lookback=lookback)
    return jsonify(result)

@trading_routes.route('/risk', methods=['GET', 'POST'])
def risk():
    """
    Exposes a form to read, display, and update active risk variables via Flask API calls.
    """
    from execution import RISK_LIMITS
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        if 'max_notional' in payload:
            RISK_LIMITS['max_notional'] = float(payload['max_notional'])
        if 'min_stop_loss_pct' in payload:
            RISK_LIMITS['min_stop_loss_pct'] = float(payload['min_stop_loss_pct'])
        if 'max_stop_loss_pct' in payload:
            RISK_LIMITS['max_stop_loss_pct'] = float(payload['max_stop_loss_pct'])
        if 'max_daily_loss_pct' in payload:
            RISK_LIMITS['max_daily_loss_pct'] = float(payload['max_daily_loss_pct'])
        return jsonify({"status": "success", "risk_limits": RISK_LIMITS})
    else:
        return jsonify({"status": "success", "risk_limits": RISK_LIMITS})

@trading_routes.route('/candles/historical', methods=['POST'])
def historical_candles():
    """
    Fetch historical candles from Binance for crypto, falling back to mock data for forex/indices.
    """
    import urllib.request
    import json
    import random
    
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'BTCUSD')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = int(payload.get('limit', 100))
    
    # Map timeframe to Binance interval formats
    interval = timeframe
    if timeframe not in ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']:
        interval = '15m'
        
    # Map symbols to Binance formats (e.g. BTCUSD -> BTCUSDT, EURUSD -> EURUSDT)
    binance_symbol = symbol.upper()
    if binance_symbol.endswith('USD') and not binance_symbol.endswith('USDT'):
        binance_symbol = binance_symbol[:-3] + 'USDT'
    
    url = f"https://api.binance.com/api/v3/klines?symbol={binance_symbol}&interval={interval}&limit={limit}"
    
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            candles = []
            for item in data:
                candles.append({
                    "time": int(item[0]) // 1000,
                    "open": float(item[1]),
                    "high": float(item[2]),
                    "low": float(item[3]),
                    "close": float(item[4]),
                    "volume": float(item[5])
                })
            return jsonify({"status": "success", "data": candles})
    except Exception as e:
        print(f"Failed to fetch {binance_symbol} from Binance API: {e}. Falling back to mock data.", flush=True)
        # Fallback to mock data
        base_time = int(time.time()) - (limit * 15 * 60)
        last_close = 57450.0 if 'BTC' in symbol else 1.1000 if 'EUR' in symbol else 100.0
        candles = []
        for i in range(limit):
            change = (random.random() - 0.49) * (200 if 'BTC' in symbol else 0.0020 if 'EUR' in symbol else 0.5)
            open_p = last_close
            close_p = open_p + change
            high_p = max(open_p, close_p) + (random.random() * (50 if 'BTC' in symbol else 0.0005 if 'EUR' in symbol else 0.1))
            low_p = min(open_p, close_p) - (random.random() * (50 if 'BTC' in symbol else 0.0005 if 'EUR' in symbol else 0.1))
            volume = random.randint(100, 1600)
            candles.append({
                "time": base_time + (i * 15 * 60),
                "open": open_p,
                "high": high_p,
                "low": low_p,
                "close": close_p,
                "volume": volume
            })
            last_close = close_p
        return jsonify({"status": "success", "data": candles})

