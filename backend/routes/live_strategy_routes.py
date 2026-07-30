import time
import json
import socket
import threading
from flask import Blueprint, request, jsonify
from live_strategy_handler import LiveStrategyHandler

live_strategy_routes = Blueprint('live_strategy_routes', __name__)

@live_strategy_routes.route('/live/strategies', methods=['GET'])
def get_strategies():
    """
    Retrieve all deployed live strategies.
    """
    strategies = LiveStrategyHandler.get_all_strategies()
    return jsonify({"status": "success", "strategies": strategies})

@live_strategy_routes.route('/live/strategy', methods=['POST'])
def save_strategy():
    """
    Deploy or update an active live strategy.
    """
    payload = request.get_json(silent=True) or {}
    strategy_config = {
        "id": payload.get("id"),
        "name": payload.get("name", ""),
        "status": payload.get("status", "active"),  # 'active' or 'paused'
        "symbol": payload.get("symbol", "BTCUSD"),
        "timeframe": payload.get("timeframe", "15m"),
        "slVal": float(payload.get("slVal", 1.0)),
        "slType": payload.get("slType", "pct"),
        "rr": float(payload.get("rr", 2.0)),
        "size": float(payload.get("size", 1.0)),
        "useRiskSizing": bool(payload.get("useRiskSizing", False)),
        "riskPct": float(payload.get("riskPct", 1.0)),
        "useBreakEven": bool(payload.get("useBreakEven", False)),
        "beTriggerR": float(payload.get("beTriggerR", 1.0)),
        "lookbackWindow": int(payload.get("lookbackWindow", 20)),
        "deployedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": payload.get("timezone", "Local"),
        "sessions": payload.get("sessions", []),
        "useGlobalClose": bool(payload.get("useGlobalClose", False)),
        "globalCloseTime": payload.get("globalCloseTime", ""),
        "entryStabilityRule": payload.get("entryStabilityRule", "default"),
        "broker": payload.get("broker", "metatrader"),
        "target_computer": payload.get("target_computer", "All"),
        "targets": payload.get("targets", []),
        "initialBalance": float(payload.get("initialBalance", 10000.0)),
        "dateRangeOption": payload.get("dateRangeOption") or "last_candles",
        "customFrom": payload.get("customFrom") or "",
        "customTo": payload.get("customTo") or "",
        "candleLimit": int(payload.get("candleLimit") or 1000)
    }
    
    success = LiveStrategyHandler.save_strategy(strategy_config)
    if success:
        return jsonify({
            "status": "success",
            "message": "Strategy saved successfully",
            "strategy": strategy_config
        })
    else:
        return jsonify({
            "status": "error",
            "message": "Failed to save strategy"
        }), 500

@live_strategy_routes.route('/live/strategy/<strategy_id>', methods=['DELETE'])
def delete_strategy(strategy_id):
    """
    Delete a live strategy.
    """
    success = LiveStrategyHandler.delete_strategy(strategy_id)
    if success:
        return jsonify({"status": "success", "message": f"Strategy {strategy_id} deleted successfully"})
    else:
        return jsonify({"status": "error", "message": "Failed to delete strategy"}), 500

# Fallback/compatibility GET endpoint
@live_strategy_routes.route('/live/strategy', methods=['GET'])
def live_strategy_compat():
    strategy = LiveStrategyHandler.get_strategy()
    return jsonify({"status": "success", "strategy": strategy})

@live_strategy_routes.route('/live/strategy/cache/<strategy_id>', methods=['GET'])
def get_strategy_cache(strategy_id):
    """
    Retrieve cached annotated candles for a specific live strategy.
    Non-blocking: offloads warm-up evaluation to background thread if cache is not yet ready.
    """
    from live_runner_handler import LiveRunner
    
    strategy = LiveStrategyHandler.get_strategy(strategy_id)
    if not strategy:
        return jsonify({"status": "not_found", "message": "Strategy not found", "strategy_id": strategy_id, "candles": [], "trades": []}), 200

    try:
        current_comp = socket.gethostname()
    except:
        current_comp = "Unknown"

    target_comp = strategy.get("target_computer", "All")
    is_targeted_here = (target_comp == 'All' or target_comp.lower() == current_comp.lower())

    cache = LiveRunner._candles_cache.get(strategy_id, [])
    trades = LiveRunner._trades_cache.get(strategy_id, [])

    if not cache:
        if is_targeted_here:
            print(f"[Cache Endpoint] Cache miss for strategy {strategy_id}. Spawning background warm-up evaluation...", flush=True)
            threading.Thread(target=LiveRunner._evaluate_strategy, args=(strategy,), daemon=True).start()
            return jsonify({"status": "pending", "message": "Strategy warm-up calculation in progress", "strategy_id": strategy_id, "candles": [], "trades": []}), 200
        else:
            # Read from DB live_state when strategy runs on another machine (e.g. laptop)
            if strategy.get("live_state"):
                live_state = strategy["live_state"]
                if isinstance(live_state, str):
                    try:
                        live_state = json.loads(live_state)
                    except Exception:
                        pass
                if isinstance(live_state, dict):
                    cache = live_state.get("candles", [])
                    trades = live_state.get("trades", [])

    if not cache:
        return jsonify({"status": "pending", "message": "Strategy candles warming up", "strategy_id": strategy_id, "candles": [], "trades": []}), 200

    limit = request.args.get('limit', type=int)
    if limit and cache:
        cache = cache[-limit:]

    return jsonify({"status": "success", "strategy_id": strategy_id, "candles": cache, "trades": trades})
