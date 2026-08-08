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
    print(f"[Backend] /api/backtest endpoint hit at {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'BTCUSD')
    candle_source = payload.get('candleSource', 'metatrader')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    account_id = payload.get('account_id') or payload.get('account') or payload.get('login')
    if not account_id and candle_source == 'metatrader':
        try:
            from account_handler import AccountHandler
            active_acc = AccountHandler.get_active_account()
            if active_acc:
                account_id = active_acc.get('account_id')
        except Exception:
            pass

    # Fetch up-to-date candles on the backend
    from broker_handler import BrokerHandler
    handler = BrokerHandler.get_handler(candle_source)
    candles = handler.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
        login=account_id,
        account_id=account_id
    )
    
    # If running against recent candles (no fixed end date specified), trim off the current in-progress live candle
    if len(candles) > 1 and not date_to:
        candles = candles[:-1]
    
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
    be_offset_mode = payload.get('beOffsetMode', 'half_r')
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
                be_offset_mode=be_offset_mode,
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
                entry_stability_rule=entry_stability_rule,
                broker=candle_source
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
            from candle_sanitizer import sanitize_and_fill_candles
            sanitized_candles = sanitize_and_fill_candles(candles, timeframe=timeframe)
            return jsonify({"status": "success", "data": sanitized_candles})
    except Exception as e:
        print(f"Failed to fetch {binance_symbol} from Binance API: {e}. Returning empty list.", flush=True)
        return jsonify({"status": "success", "data": []})

@strategy_routes.route('/backtest/optimize', methods=['POST'])
def backtest_optimize():
    """
    Exposes parameter optimization backtests to frontend dashboard.
    """
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'BTCUSD')
    candle_source = payload.get('candleSource', 'metatrader')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    sl_val = float(payload.get('slVal', 1.0))
    sl_type = payload.get('slType', 'pct')
    size = float(payload.get('size', 1.0))
    initial_balance = float(payload.get('initialBalance', 10000.0))
    use_risk_sizing = bool(payload.get('useRiskSizing', False))
    risk_pct = float(payload.get('riskPct', 1.0))
    use_break_even = bool(payload.get('useBreakEven', False))
    be_trigger_r = float(payload.get('beTriggerR', 1.0))
    be_offset_mode = payload.get('beOffsetMode', 'half_r')
    lookback_window = int(payload.get('lookbackWindow', 20))
    fees_percent = float(payload.get('feesPercent', 0.0))
    daily_retry_limit = int(payload.get('dailyRetryLimit', 0))
    allow_opposite_close = bool(payload.get('allowOppositeClose', True))
    backtest_id = payload.get('backtestId')
    
    rr_start = float(payload.get('rrStart', 1.0))
    rr_end = float(payload.get('rrEnd', 5.0))
    rr_step = float(payload.get('rrStep', 0.5))
    
    timezone = payload.get('timezone', 'Local')
    sessions = payload.get('sessions', [])
    use_global_close = bool(payload.get('useGlobalClose', False))
    global_close_time = payload.get('globalCloseTime', '')
    entry_stability_rule = payload.get('entryStabilityRule', 'default')

    # Grid parameters
    symbols = payload.get('symbols', [])
    timeframes = payload.get('timeframes', [])
    sl_range_mode = bool(payload.get('slRangeMode', False))
    sl_start = float(payload.get('slStart')) if payload.get('slStart') is not None else None
    sl_end = float(payload.get('slEnd')) if payload.get('slEnd') is not None else None
    sl_step = float(payload.get('slStep')) if payload.get('slStep') is not None else None
    be_range_mode = bool(payload.get('beRangeMode', False))
    be_start = float(payload.get('beStart')) if payload.get('beStart') is not None else None
    be_end = float(payload.get('beEnd')) if payload.get('beEnd') is not None else None
    be_step = float(payload.get('beStep')) if payload.get('beStep') is not None else None

    def check_cancelled():
        if backtest_id and str(backtest_id) in cancelled_backtests:
            return True
        return False

    import queue
    import threading
    from flask import Response
    import json

    q = queue.Queue()

    def run_optimization_in_thread():
        try:
            def cb(pct, current_run=None, total_runs=None):
                payload = {"progress": int(pct)}
                if current_run is not None and total_runs is not None:
                    payload["currentRun"] = current_run
                    payload["totalRuns"] = total_runs
                q.put(payload)

            res = StrategyHandler.run_optimization(
                symbol=symbol,
                sl_val=sl_val,
                sl_type=sl_type,
                size=size,
                initial_balance=initial_balance,
                use_risk_sizing=use_risk_sizing,
                risk_pct=risk_pct,
                use_break_even=use_break_even,
                be_trigger_r=be_trigger_r,
                be_offset_mode=be_offset_mode,
                lookback_window=lookback_window,
                rr_start=rr_start,
                rr_end=rr_end,
                rr_step=rr_step,
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
                entry_stability_rule=entry_stability_rule,
                candle_source=candle_source,
                limit=limit,
                symbols=symbols,
                timeframes=timeframes,
                sl_range_mode=sl_range_mode,
                sl_start=sl_start,
                sl_end=sl_end,
                sl_step=sl_step,
                be_range_mode=be_range_mode,
                be_start=be_start,
                be_end=be_end,
                be_step=be_step
            )
            q.put({"status": "success", "data": res})
        except Exception as e:
            q.put({"status": "error", "message": str(e)})
        finally:
            q.put(None)

    t = threading.Thread(target=run_optimization_in_thread, daemon=True)
    t.start()

    def generate():
        yield json.dumps({"progress": 5}) + "\n"
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


@strategy_routes.route('/backtest/results', methods=['GET'])
def get_backtest_results():
    """
    Exposes the latest generated backtest_results.json.
    Supports loading specific setting combination results if exact parameters are provided.
    """
    import os
    import json
    broker = request.args.get('broker')
    symbol = request.args.get('symbol')
    timeframe = request.args.get('timeframe')
    sl = request.args.get('sl')
    rr = request.args.get('rr')
    be = request.args.get('be')
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    results_path = os.path.join(base_dir, 'backtest_results.json')
    
    if broker and symbol:
        be_str = str(be).lower() if be is not None else "off"
        rr_str = str(rr)
        try:
            rr_fmt = f"{float(rr):.1f}"
        except Exception:
            rr_fmt = rr_str

        possible_filenames = [
            f"backtest_results_{broker.lower()}_{symbol.lower()}_{timeframe}_sl{sl}_rr{rr_str}_be{be_str}.json",
            f"backtest_results_{broker.lower()}_{symbol.lower()}_{timeframe}_sl{sl}_rr{rr_fmt}_be{be_str}.json",
            f"backtest_results_{broker.lower()}_{symbol.lower()}_{timeframe}_sl{sl}_rr{rr_str}_be{be}.json",
            f"backtest_results_{broker.lower()}_{symbol.upper()}.json",
        ]
        for fname in possible_filenames:
            path = os.path.join(base_dir, fname)
            if os.path.exists(path):
                results_path = path
                break

            
    if os.path.exists(results_path):
        try:
            with open(results_path, 'r') as f:
                data = json.load(f)
            return jsonify({"status": "success", "data": data})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    else:
        return jsonify({"status": "error", "message": "No backtest results found"}), 404


