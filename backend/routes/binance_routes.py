from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler

binance_routes = Blueprint('binance', __name__)

@binance_routes.route('/account', methods=['GET', 'POST'])
def get_account():
    data = request.get_json(silent=True) or {}
    account_id = data.get('account_id')
    res = BrokerHandler.get_account(broker_name='binance', account_id=account_id, **data)
    return jsonify(res)

@binance_routes.route('/positions', methods=['GET', 'POST'])
def get_positions():
    data = request.get_json(silent=True) or {}
    account_id = data.get('account_id')
    symbol = data.get('symbol')
    res = BrokerHandler.get_positions(broker_name='binance', account_id=account_id, symbol=symbol, **data)
    return jsonify(res)

@binance_routes.route('/order', methods=['POST'])
def create_order():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    side = data.get('side')
    volume = data.get('volume')
    price = data.get('price')
    order_type = data.get('order_type', 'MARKET')
    stop_loss = data.get('stop_loss')
    take_profit = data.get('take_profit')
    account_id = data.get('account_id')

    if not symbol or not side or not volume:
        return jsonify({'error': 'symbol, side, and volume are required'}), 400

    res = BrokerHandler.create_order(
        broker_name='binance',
        account_id=account_id,
        symbol=symbol,
        side=side,
        volume=float(volume),
        price=float(price) if price else None,
        order_type=order_type,
        stop_loss=float(stop_loss) if stop_loss else None,
        take_profit=float(take_profit) if take_profit else None,
        **{k: v for k, v in data.items() if k not in ('symbol', 'side', 'volume', 'price', 'order_type', 'stop_loss', 'take_profit', 'account_id')}
    )
    return jsonify(res)

@binance_routes.route('/position/close', methods=['POST'])
def close_position():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    side = data.get('side')
    volume = data.get('volume', 0.0)
    account_id = data.get('account_id')

    if not symbol:
        return jsonify({'error': 'symbol is required'}), 400

    res = BrokerHandler.close_position(
        broker_name='binance',
        account_id=account_id,
        symbol=symbol,
        side=side,
        volume=float(volume) if volume else 0.0,
        **{k: v for k, v in data.items() if k not in ('symbol', 'side', 'volume', 'account_id')}
    )
    return jsonify(res)

@binance_routes.route('/leverage', methods=['POST'])
def change_leverage():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    leverage = data.get('leverage')
    account_id = data.get('account_id')

    if not symbol or leverage is None:
        return jsonify({'error': 'symbol and leverage are required'}), 400

    handler = BrokerHandler.get_handler('binance', account_id)
    kwargs = BrokerHandler._prepare_kwargs('binance', account_id, data)
    res = handler.change_leverage(symbol=symbol, leverage=int(leverage), **kwargs)
    return jsonify(res)

@binance_routes.route('/margin-type', methods=['POST'])
def change_margin_type():
    data = request.get_json() or {}
    symbol = data.get('symbol')
    margin_type = data.get('margin_type')
    account_id = data.get('account_id')

    if not symbol or not margin_type:
        return jsonify({'error': 'symbol and margin_type are required'}), 400

    handler = BrokerHandler.get_handler('binance', account_id)
    kwargs = BrokerHandler._prepare_kwargs('binance', account_id, data)
    res = handler.change_margin_type(symbol=symbol, margin_type=margin_type, **kwargs)
    return jsonify(res)

@binance_routes.route('/candles', methods=['GET', 'POST'])
def get_candles():
    data = request.get_json(silent=True) or {}
    symbol = data.get('symbol', 'BTCUSDT')
    timeframe = data.get('timeframe', '15m')
    limit = data.get('limit', 1000)
    date_from = data.get('date_from')
    date_to = data.get('date_to')
    account_id = data.get('account_id')

    res = BrokerHandler.fetch_candles(
        broker_name='binance',
        account_id=account_id,
        symbol=symbol,
        timeframe=timeframe,
        limit=int(limit),
        date_from=int(date_from) if date_from else None,
        date_to=int(date_to) if date_to else None
    )
    return jsonify(res)

@binance_routes.route('/symbols', methods=['GET', 'POST'])
def get_symbols():
    data = request.get_json(silent=True) or {}
    account_id = data.get('account_id')
    res = BrokerHandler.get_symbols(broker_name='binance', account_id=account_id)
    return jsonify(res)
