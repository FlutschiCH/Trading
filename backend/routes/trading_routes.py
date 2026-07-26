from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler

trading_routes = Blueprint('trading_routes', __name__)

def _get_handler(payload):
    broker_name = payload.get('broker', 'ctrader')
    return BrokerHandler.get_handler(broker_name)

@trading_routes.route('/trade/account', methods=['POST'])
def account():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify(handler.get_account())

@trading_routes.route('/trade/positions', methods=['POST'])
def positions():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify({"status": "success", "data": handler.get_positions()})

@trading_routes.route('/trade/order', methods=['POST'])
def order():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON format"}), 400

    symbol = payload.get('symbol', 'EURUSD')
    side = payload.get('order_type', 'buy')
    volume = float(payload.get('volume', 0.01))
    price = payload.get('price')
    if price is not None:
        price = float(price)

    handler = _get_handler(payload)
    result = handler.create_order(symbol, side, volume, price)
    return jsonify(result)

@trading_routes.route('/trade/close', methods=['POST'])
def close():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    position_id = payload.get('position_id')
    symbol = payload.get('symbol', 'EURUSD')
    side = payload.get('side', 'buy')
    volume = float(payload.get('volume', 0.01))

    handler = _get_handler(payload)
    result = handler.close_position(position_id, symbol, side, volume)
    return jsonify(result)

@trading_routes.route('/trade/candles', methods=['POST'])
def candles():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    broker_name = payload.get('broker', 'ctrader')
    symbol = payload.get('symbol', 'EURUSD')
    timeframe = payload.get('interval', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    if date_from is not None:
        date_from = int(date_from)
    if date_to is not None:
        date_to = int(date_to)

    from broker_handler import BrokerHandler
    handler = BrokerHandler.get_handler(broker_name)
    candles_data = handler.fetch_candles(symbol, timeframe, limit, date_from, date_to)

    lookback = payload.get('lookback')
    simulated_trades = []
    if lookback:
        try:
            from wyckoff_handler import WyckoffHandler
            candles_data = WyckoffHandler.analyze_wyckoff_structure(candles_data, lookback=int(lookback))
            
            try:
                from backtest_settings_handler import BacktestSettingsHandler
                sett_res = BacktestSettingsHandler.load_settings(symbol, timeframe)
                settings = sett_res.get("settings") or {}
                
                sl_val = float(settings.get('backtestSL', 20.0))
                sl_type = settings.get('backtestSLType', 'price')
                rr = float(settings.get('backtestRR', 2.0))
                size = float(settings.get('backtestSize', 1.0))
                initial_balance = float(settings.get('backtestBalance', 10000.0))
                use_risk_sizing = bool(settings.get('useRiskSizing', False))
                risk_pct = float(settings.get('backtestRiskPct', 1.0))
                use_break_even = bool(settings.get('useBreakEven', False))
                be_trigger_r = float(settings.get('backtestBE', 1.0))
                fees_percent = float(settings.get('backtestFees', 0.0))
                daily_retry_limit = int(settings.get('dailyRetryLimit', 0))
                allow_opposite_close = bool(settings.get('allowOppositeClose', True))
                timezone = settings.get('timezone', 'Local')
                sessions = settings.get('sessions', [])
                use_global_close = bool(settings.get('useGlobalClose', False))
                global_close_time = settings.get('globalCloseTime', '')
                entry_stability_rule = settings.get('entryStabilityRule', 'default')

                from backtest_helpers import run_trade_simulation
                sim_res = run_trade_simulation(
                    annotated_data=candles_data,
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
                    fees_percent=fees_percent,
                    daily_retry_limit=daily_retry_limit,
                    allow_opposite_close=allow_opposite_close,
                    timezone=timezone,
                    sessions=sessions,
                    use_global_close=use_global_close,
                    global_close_time=global_close_time,
                    entry_stability_rule=entry_stability_rule
                )
                simulated_trades = sim_res.get("completed_trades_raw", [])
            except Exception as ex:
                print(f"Error running trade simulation on live candles: {ex}", flush=True)
        except Exception as e:
            print(f"Error running Wyckoff analysis on trade candles: {e}", flush=True)

    return jsonify({
        "status": "success",
        "candles": candles_data,
        "trades": simulated_trades
    })

@trading_routes.route('/trade/history', methods=['POST'])
def history():
    payload = request.get_json(force=True) or {}
    handler = _get_handler(payload)
    return jsonify(handler.get_history())
