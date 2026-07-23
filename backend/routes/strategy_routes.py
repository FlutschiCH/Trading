import time
import threading
from flask import Blueprint, request, jsonify
from strategy_handler import StrategyHandler

strategy_routes = Blueprint('strategy_routes', __name__)

@strategy_routes.route('/analyze', methods=['POST'])
def analyze():
    """
    Endpoint for analyzing candle lists sent from React frontend.
    """
    payload = request.get_json(silent=True) or {}
    candles = payload.get('candles', [])
    lookback = int(payload.get('lookback', 20))
    result = StrategyHandler.analyze_market_data(candles, lookback=lookback)
    return jsonify(result)

cancelled_backtests = set()

@strategy_routes.route('/backtest/cancel', methods=['POST'])
def cancel_backtest():
    payload = request.get_json(silent=True) or {}
    backtest_id = payload.get('backtestId')
    if backtest_id:
        cancelled_backtests.add(str(backtest_id))
    return jsonify({"status": "success", "message": "Backtest cancellation flag set successfully"})

@strategy_routes.route('/backtest', methods=['POST'])
def backtest():
    """
    Exposes Python-based backtesting engine to frontend dashboard.
    """
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'BTCUSD')
    candle_source = payload.get('candleSource', 'metatrader')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    # Fetch up-to-date candles on the backend
    if candle_source == 'yfinance':
        from yfinance_handler import YFinanceHandler
        candles = YFinanceHandler.fetch_candles(symbol=symbol, timeframe=timeframe, limit=limit)
    else:
        from metatrader_handler import MetaTraderHandler
        candles = MetaTraderHandler.fetch_candles(
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
            date_from=date_from,
            date_to=date_to
        )
    
    if not candles:
        return jsonify({"status": "error", "message": "Failed to fetch up-to-date candles for backtest."}), 400
    sl_val = float(payload.get('slVal', 1.0))
    sl_type = payload.get('slType', 'pct')
    rr = float(payload.get('rr', 2.0))
    size = float(payload.get('size', 1.0))
    initial_balance = float(payload.get('initialBalance', 10000.0))
    use_risk_sizing = bool(payload.get('useRiskSizing', False))
    risk_pct = float(payload.get('riskPct', 1.0))
    use_break_even = bool(payload.get('useBreakEven', False))
    be_trigger_r = float(payload.get('beTriggerR', 1.0))
    lookback_window = int(payload.get('lookbackWindow', 20))
    fees_percent = float(payload.get('feesPercent', 0.0))
    daily_retry_limit = int(payload.get('dailyRetryLimit', 0))
    allow_opposite_close = bool(payload.get('allowOppositeClose', True))
    backtest_id = payload.get('backtestId')
    
    timezone = payload.get('timezone', 'Local')
    sessions = payload.get('sessions', [])
    use_global_close = bool(payload.get('useGlobalClose', False))
    global_close_time = payload.get('globalCloseTime', '')
    entry_stability_rule = payload.get('entryStabilityRule', 'default')

    def check_cancelled():
        if backtest_id and str(backtest_id) in cancelled_backtests:
            return True
        return False

    import queue
    import threading
    from flask import Response

    q = queue.Queue()

    def run_in_thread():
        try:
            def cb(pct):
                q.put({"progress": int(15 + (pct / 100) * 83)})
                
            res = StrategyHandler.run_backtest(
                candles=candles,
                symbol=symbol,
                sl_val=sl_val,
                sl_type=sl_type,
                rr=rr,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=use_break_even,
                be_trigger_r=be_trigger_r,
                lookback_window=lookback_window,
                fees_percent=fees_percent,
                daily_retry_limit=daily_retry_limit,
                allow_opposite_close=allow_opposite_close,
                check_cancelled=check_cancelled,
                date_from=date_from,
                date_to=date_to,
                timezone=timezone,
                sessions=sessions,
                use_global_close=use_global_close,
                global_close_time=global_close_time,
                progress_callback=cb,
                entry_stability_rule=entry_stability_rule
            )
            q.put({"status": "success", "data": res})
        except Exception as e:
            q.put({"status": "error", "message": str(e)})
        finally:
            q.put(None)

    t = threading.Thread(target=run_in_thread, daemon=True)
    t.start()

    def generate():
        import json
        yield json.dumps({"progress": 10}) + "\n"
        while True:
            try:
                item = q.get()
                if item is None:
                    break
                yield json.dumps(item) + "\n"
            except Exception as e:
                yield json.dumps({"status": "error", "message": str(e)}) + "\n"
                break
        
        if backtest_id and str(backtest_id) in cancelled_backtests:
            try:
                cancelled_backtests.remove(str(backtest_id))
            except KeyError:
                pass

    return Response(generate(), mimetype='application/x-ndjson')

@strategy_routes.route('/risk', methods=['GET', 'POST'])
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

@strategy_routes.route('/candles/historical', methods=['POST'])
def historical_candles():
    """
    Fetch historical candles from Binance for crypto, falling back to mock data for forex/indices.
    """
    import urllib.request
    import json
    
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
        print(f"Failed to fetch {binance_symbol} from Binance API: {e}. Returning empty list.", flush=True)
        return jsonify({"status": "success", "data": []})

@strategy_routes.route('/backtest/results', methods=['GET'])
def get_backtest_results():
    """
    Exposes the latest generated backtest_results.json.
    """
    import os
    import json
    results_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backtest_results.json')
    if os.path.exists(results_path):
        try:
            with open(results_path, 'r') as f:
                data = json.load(f)
            return jsonify({"status": "success", "data": data})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    else:
        return jsonify({"status": "error", "message": "No backtest results found"}), 404

