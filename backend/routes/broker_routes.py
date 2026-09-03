from flask import Blueprint, request, jsonify
from broker_handler import BrokerHandler
import time
from datetime import datetime

broker_routes = Blueprint('broker_routes', __name__)

@broker_routes.route('/broker/account', methods=['POST'])
def account():
    t0 = time.perf_counter()
    payload = request.get_json(force=True) or {}
    broker_name = payload.pop('broker', None)
    account_id = payload.pop('account_id', None)
    t1 = time.perf_counter()

    data = BrokerHandler.get_account_info(broker_name=broker_name, account_id=account_id, **payload)
    t2 = time.perf_counter()

    print(f"⏱️ [/broker/account] Total: {(t2-t0)*1000:.2f}ms (JSON parse: {(t1-t0)*1000:.2f}ms | Broker fetch: {(t2-t1)*1000:.2f}ms)", flush=True)
    if isinstance(data, dict) and 'error' in data:
        return jsonify({"status": "error", "message": data['error']}), 400
    return jsonify({"status": "success", "data": data})

@broker_routes.route('/broker/positions', methods=['POST'])
def positions():
    payload = request.get_json(force=True) or {}
    broker_name = payload.pop('broker', None)
    account_id = payload.pop('account_id', None)
    data = BrokerHandler.get_positions(broker_name=broker_name, account_id=account_id, **payload)
    print(f"\n[POSITIONS ROUTE] Broker: {broker_name} | Account: {account_id} | Response: {data}\n", flush=True)
    return jsonify({"status": "success", "data": data})

@broker_routes.route('/broker/candles', methods=['POST'])
def candles():
    now_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON"}), 400

    broker_name = payload.get('broker', 'ctrader')
    symbol = payload.get('symbol', 'EURUSD')
    print(f"📥 [/broker/candles Arrived] [{now_ts}] broker={broker_name} symbol={symbol}", flush=True)
    timeframe = payload.get('interval') or payload.get('timeframe', '15m')
    limit = int(payload.get('limit', 1000))
    date_from = payload.get('date_from')
    date_to = payload.get('date_to')

    if date_from is not None:
        date_from = int(date_from)
    if date_to is not None:
        date_to = int(date_to)

    t0 = time.perf_counter()
    try:
        account_id = payload.get('account_id')
        p = payload.copy() if isinstance(payload, dict) else {}
        for k in ('symbol', 'interval', 'timeframe', 'limit', 'date_from', 'date_to', 'broker', 'account_id'):
            p.pop(k, None)
        candles_data = BrokerHandler.fetch_candles(
            broker_name=broker_name,
            account_id=account_id,
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
            date_from=date_from,
            date_to=date_to,
            **p
        )
        t_ret = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        cnt = len(candles_data) if isinstance(candles_data, list) else 0
        dur_ms = (time.perf_counter() - t0) * 1000
        print(f"📤 [/broker/candles Return] [{t_ret}] broker={broker_name} symbol={symbol} count={cnt} (took {dur_ms:.2f}ms)", flush=True)
    except (ValueError, RuntimeError) as e:
        return jsonify({"status": "error", "message": str(e)}), 400

    return jsonify({
        "status": "success",
        "candles": candles_data,
        "trades": []
    })
