from flask import Blueprint, request, jsonify
from sltp_sync_handler import SltpSyncHandler

sltp_sync_routes = Blueprint('sltp_sync_routes', __name__)

@sltp_sync_routes.route('/trade/sync_sltp', methods=['POST'])
def sync_sltp():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"status": "error", "message": "Invalid JSON payload"}), 400

    symbol = payload.get('symbol', 'EURUSD')
    target_price = payload.get('target_price')
    sync_type = payload.get('type', 'sl')
    selected_account_ids = payload.get('selected_account_ids', [])
    position_id = payload.get('position_id')
    trade_side = payload.get('trade_side', 'BUY')

    if target_price is None:
        return jsonify({"status": "error", "message": "Missing target_price"}), 400

    result = SltpSyncHandler.sync_sltp(
        symbol=symbol,
        target_price=float(target_price),
        type=sync_type,
        selected_account_ids=selected_account_ids,
        position_id=position_id,
        trade_side=trade_side
    )
    return jsonify(result)
