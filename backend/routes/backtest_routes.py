from flask import Blueprint, request, jsonify
from sql_handler import SQLHandler

backtest_routes = Blueprint('backtest_routes', __name__)

@backtest_routes.route('/backtest/saved', methods=['GET'])
def get_saved_backtests():
    """
    Returns list of saved backtests with summary metrics ordered by creation date DESC.
    """
    import time
    t0 = time.time()
    symbol = request.args.get('symbol')
    timeframe = request.args.get('timeframe')
    strategy_type = request.args.get('strategy_type') or request.args.get('type')
    try:
        results = SQLHandler.get_saved_backtests(symbol=symbol, timeframe=timeframe, strategy_type=strategy_type)
        elapsed = round(time.time() - t0, 4)
        print(f"\033[96m[SavedRuns API]\033[0m Fetched {len(results)} active saved runs in {elapsed}s (symbol={symbol}, tf={timeframe}, strat={strategy_type})", flush=True)
        return jsonify({"status": "success", "data": results})
    except Exception as e:
        elapsed = round(time.time() - t0, 4)
        print(f"\033[91m[SavedRuns API Error]\033[0m Failed fetching active runs after {elapsed}s: {e}", flush=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/saved/<backtest_id>', methods=['GET'])
def get_saved_backtest_details(backtest_id):
    """
    Fetches full backtest run payload (trades, candles, metrics) by ID.
    """
    import time
    t0 = time.time()
    try:
        payload = SQLHandler.get_saved_backtest_by_id(backtest_id)
        elapsed = round(time.time() - t0, 4)
        if payload:
            print(f"\033[96m[SavedRuns API]\033[0m Loaded full run details for '{backtest_id}' in {elapsed}s", flush=True)
            return jsonify({"status": "success", "data": payload})
        print(f"\033[93m[SavedRuns API]\033[0m Run '{backtest_id}' not found ({elapsed}s)", flush=True)
        return jsonify({"status": "error", "message": "Saved backtest not found"}), 404
    except Exception as e:
        elapsed = round(time.time() - t0, 4)
        print(f"\033[91m[SavedRuns API Error]\033[0m Error fetching run '{backtest_id}' after {elapsed}s: {e}", flush=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/saved/<backtest_id>', methods=['DELETE'])
def delete_saved_backtest(backtest_id):
    """
    Soft-deletes / archives a saved backtest by moving it to archived_saved_backtests table.
    If permanent=true query param is provided, performs hard delete.
    """
    permanent = request.args.get('permanent', 'false').lower() == 'true'
    try:
        if permanent:
            success = SQLHandler.delete_saved_backtest(backtest_id)
        else:
            success = SQLHandler.archive_saved_backtest(backtest_id)

        if success:
            return jsonify({"status": "success", "message": "Backtest archived successfully" if not permanent else "Backtest deleted"})
        return jsonify({"status": "error", "message": "Failed to process backtest"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/saved/archive-all', methods=['POST'])
def archive_all_saved_backtests():
    """
    Soft-deletes / archives all saved backtest runs.
    """
    try:
        success = SQLHandler.archive_all_saved_backtests()
        if success:
            return jsonify({"status": "success", "message": "All backtests archived successfully"})
        return jsonify({"status": "error", "message": "Failed to archive backtests"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/archived', methods=['GET'])
def get_archived_backtests():
    """
    Returns list of archived backtest runs ordered by archive timestamp DESC.
    """
    import time
    t0 = time.time()
    symbol = request.args.get('symbol')
    timeframe = request.args.get('timeframe')
    strategy_type = request.args.get('strategy_type') or request.args.get('type')
    try:
        results = SQLHandler.get_archived_backtests(symbol=symbol, timeframe=timeframe, strategy_type=strategy_type)
        elapsed = round(time.time() - t0, 4)
        print(f"\033[96m[SavedRuns API]\033[0m Fetched {len(results)} archived runs in {elapsed}s", flush=True)
        return jsonify({"status": "success", "data": results})
    except Exception as e:
        elapsed = round(time.time() - t0, 4)
        print(f"\033[91m[SavedRuns API Error]\033[0m Failed fetching archived runs after {elapsed}s: {e}", flush=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/archived/<backtest_id>/restore', methods=['POST'])
def restore_archived_backtest(backtest_id):
    """
    Restores an archived backtest run back to active saved_backtests list.
    """
    try:
        success = SQLHandler.restore_archived_backtest(backtest_id)
        if success:
            return jsonify({"status": "success", "message": "Backtest restored successfully"})
        return jsonify({"status": "error", "message": "Failed to restore backtest"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
