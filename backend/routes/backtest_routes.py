from flask import Blueprint, request, jsonify
from sql_handler import SQLHandler

backtest_routes = Blueprint('backtest_routes', __name__)

@backtest_routes.route('/backtest/saved', methods=['GET'])
def get_saved_backtests():
    """
    Returns list of saved backtests with summary metrics ordered by creation date DESC.
    """
    symbol = request.args.get('symbol')
    timeframe = request.args.get('timeframe')
    try:
        results = SQLHandler.get_saved_backtests(symbol=symbol, timeframe=timeframe)
        return jsonify({"status": "success", "data": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/saved/<backtest_id>', methods=['GET'])
def get_saved_backtest_details(backtest_id):
    """
    Fetches full backtest run payload (trades, candles, metrics) by ID.
    """
    try:
        payload = SQLHandler.get_saved_backtest_by_id(backtest_id)
        if payload:
            return jsonify({"status": "success", "data": payload})
        return jsonify({"status": "error", "message": "Saved backtest not found"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@backtest_routes.route('/backtest/saved/<backtest_id>', methods=['DELETE'])
def delete_saved_backtest(backtest_id):
    """
    Deletes a saved backtest by ID.
    """
    try:
        success = SQLHandler.delete_saved_backtest(backtest_id)
        if success:
            return jsonify({"status": "success", "message": "Backtest deleted successfully"})
        return jsonify({"status": "error", "message": "Failed to delete backtest"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
