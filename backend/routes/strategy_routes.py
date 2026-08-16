import os
import sys
import json
import time
import threading
import subprocess
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
    backtest_id = payload.get('backtestId') or payload.get('job_id')
    if backtest_id:
        cancelled_backtests.add(str(backtest_id))
        from sql_handler import SQLHandler
        SQLHandler.update_backtest_job_progress(str(backtest_id), status='cancelled', step_info='Cancelled by user')
    return jsonify({"status": "success", "message": "Backtest cancellation requested"})

@strategy_routes.route('/backtest/status/<job_id>', methods=['GET'])
def get_backtest_status(job_id):
    from sql_handler import SQLHandler
    job = SQLHandler.get_backtest_job(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Job not found"}), 404
    return jsonify({"status": "success", "job": job})

@strategy_routes.route('/backtest/job/<job_id>', methods=['DELETE'])
def delete_backtest_job_endpoint(job_id):
    from sql_handler import SQLHandler
    # Request cancellation if running
    cancelled_backtests.add(str(job_id))
    SQLHandler.update_backtest_job_progress(str(job_id), status='cancelled', step_info='Cancelled and deleted by user')
    success = SQLHandler.delete_backtest_job(str(job_id))
    if success:
        return jsonify({"status": "success", "message": f"Job {job_id} deleted"})
    return jsonify({"status": "error", "message": "Failed to delete job"}), 500

@strategy_routes.route('/backtest/jobs', methods=['DELETE'])
def delete_all_backtest_jobs_endpoint():
    from sql_handler import SQLHandler
    status_filter = request.args.get('status')
    success = SQLHandler.delete_all_backtest_jobs(status=status_filter)
    if success:
        return jsonify({"status": "success", "message": "Backtest jobs deleted"})
    return jsonify({"status": "error", "message": "Failed to delete jobs"}), 500

@strategy_routes.route('/backtest/resume/<job_id>', methods=['POST'])
def resume_backtest_job(job_id):
    import subprocess
    import sys
    from sql_handler import SQLHandler
    job = SQLHandler.get_backtest_job(job_id)
    if not job:
        return jsonify({"status": "error", "message": "Job not found"}), 404

    python_executable = sys.executable
    worker_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backtest_worker.py')
    cmd = [python_executable, worker_script, '--job_id', str(job_id), '--resume']

    SQLHandler.update_backtest_job_progress(str(job_id), status='running', step_info='Resuming worker process...')
    subprocess.Popen(cmd, creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0)

    return jsonify({"status": "accepted", "job_id": str(job_id), "message": "Job resume requested"})

@strategy_routes.route('/backtest', methods=['POST'])
def backtest():
    """
    Exposes Python-based backtesting engine to frontend dashboard asynchronously.
    """
    import uuid
    import subprocess
    import sys
    from sql_handler import SQLHandler

    print(f"[Backend] /api/backtest endpoint hit at {time.strftime('%Y-%m-%d %H:%M:%S')}", flush=True)
    payload = request.get_json(silent=True) or {}
    job_id = payload.get('backtestId') or str(uuid.uuid4())

    # Create job in MySQL DB and set initial state immediately
    SQLHandler.create_backtest_job(job_id=job_id, job_type='single', params=payload)
    SQLHandler.update_backtest_job_progress(job_id, status='running', progress=1.0, step_info='Worker process initializing...')

    # Spawn worker subprocess
    python_executable = sys.executable
    worker_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backtest_worker.py')
    cmd = [python_executable, worker_script, '--job_id', str(job_id)]

    subprocess.Popen(cmd, creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0)

    return jsonify({
        "status": "accepted",
        "job_id": str(job_id),
        "message": "Backtest started in background worker"
    }), 202

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
            data = json.loads(response.read().decode())
            candles = []
            for item in data:
                candles.append({
                    'time': int(item[0]) // 1000,
                    'open': float(item[1]),
                    'high': float(item[2]),
                    'low': float(item[3]),
                    'close': float(item[4]),
                    'volume': float(item[5])
                })
            return jsonify({"status": "success", "data": candles})
    except Exception as e:
        print(f"Failed to fetch {binance_symbol} from Binance API: {e}. Returning empty list.", flush=True)
        return jsonify({"status": "success", "data": []})

@strategy_routes.route('/backtest/optimize', methods=['POST'])
def backtest_optimize():
    """
    Exposes parameter optimization backtests to frontend dashboard asynchronously.
    """
    import uuid
    import subprocess
    import sys
    from sql_handler import SQLHandler

    payload = request.get_json(silent=True) or {}
    job_id = payload.get('backtestId') or str(uuid.uuid4())

    # Create job in MySQL DB and set initial state immediately
    SQLHandler.create_backtest_job(job_id=job_id, job_type='optimize', params=payload)
    SQLHandler.update_backtest_job_progress(job_id, status='running', progress=1.0, step_info='Worker process initializing...')

    # Spawn worker subprocess
    python_executable = sys.executable
    worker_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backtest_worker.py')
    cmd = [python_executable, worker_script, '--job_id', str(job_id)]

    subprocess.Popen(cmd, creationflags=subprocess.CREATE_NEW_CONSOLE if os.name == 'nt' else 0)

    return jsonify({
        "status": "accepted",
        "job_id": str(job_id),
        "message": "Optimization started in background worker"
    }), 202



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


