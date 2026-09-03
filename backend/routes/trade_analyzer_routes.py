from flask import Blueprint, request, jsonify
from trade_analyzer_handler import TradeAnalyzerHandler

trade_analyzer_routes = Blueprint('trade_analyzer', __name__)

@trade_analyzer_routes.route('/trade-analyzer/analyze', methods=['POST'])
def analyze_trades():
    try:
        data = request.get_json() or {}
        account_id = data.get('account_id')
        date_from = data.get('date_from')
        date_to = data.get('date_to')
        
        result = TradeAnalyzerHandler.analyze_trades(
            account_id=account_id,
            date_from=date_from,
            date_to=date_to
        )
        return jsonify(result)
    except Exception as e:
        print(f"[Trade Analyzer Route Error] /trade-analyzer/analyze: {e}", flush=True)
        return jsonify({"status": "error", "message": str(e), "data": {}}), 200
