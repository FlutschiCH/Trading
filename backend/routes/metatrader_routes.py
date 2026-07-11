from flask import Blueprint, request, jsonify
from metatrader_handler import MetaTraderHandler

metatrader_routes = Blueprint('metatrader', __name__)

@metatrader_routes.route('/metatrader/candles', methods=['POST'])
def get_metatrader_candles():
    """
    POST route to fetch historical candles from MetaTrader 5 using the provided credentials.
    """
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('timeframe') or payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    login = payload.get('login', 2002061314)
    password = payload.get('password', 'Godzilla_12')
    server = payload.get('server', 'JustMarkets-Demo')

    candles = MetaTraderHandler.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        limit=limit,
        login=login,
        password=password,
        server=server
    )

    if not candles:
        return jsonify({"status": "error", "message": "Failed to fetch candles from MetaTrader 5. Make sure the MetaTrader 5 Terminal is installed and running."}), 400

    return jsonify({"status": "success", "data": candles})
