from flask import Blueprint, request, jsonify
from backtest_analyzer_handler import BacktestAnalyzerHandler

backtest_analyzer_routes = Blueprint('backtest_analyzer', __name__)

@backtest_analyzer_routes.route('/backtest-analyzer/analyze', methods=['POST'])
def analyze_backtest():
    """
    Endpoint for analyzing a single backtest run.
    Accepts either `backtest_id` (fetched from MySQL DB) or direct `payload` dictionary.
    """
    try:
        data = request.get_json(silent=True) or {}
        backtest_id = data.get('backtest_id')
        payload = data.get('payload')
        max_trades = int(data.get('max_trades_in_log', 150))

        result = BacktestAnalyzerHandler.analyze_backtest(
            backtest_id=backtest_id,
            backtest_payload=payload,
            max_trades_in_log=max_trades
        )
        return jsonify(result)
    except Exception as e:
        print(f"[Backtest Analyzer Route Error] /backtest-analyzer/analyze: {e}", flush=True)
        return jsonify({"status": "error", "message": str(e), "data": {}}), 200
