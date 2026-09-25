from flask import Blueprint, request, jsonify
from copytrader_handler import CopytraderHandler

copytrader_routes = Blueprint('copytrader_routes', __name__)

@copytrader_routes.route('/copytrader/configs', methods=['GET'])
def get_configs():
    """
    Retrieve all configured Copytrader setups.
    """
    configs = CopytraderHandler.get_all_configs()
    return jsonify({"status": "success", "configs": configs})

@copytrader_routes.route('/copytrader/config', methods=['POST'])
def save_config():
    """
    Save or update a Copytrader setup.
    """
    payload = request.get_json(silent=True) or {}
    if not payload.get("master_account"):
        return jsonify({"status": "error", "message": "Master account is required"}), 400

    success = CopytraderHandler.save_config(payload)
    if success:
        return jsonify({"status": "success", "message": "Copytrader config saved successfully"})
    return jsonify({"status": "error", "message": "Failed to save Copytrader config"}), 500

@copytrader_routes.route('/copytrader/config/<config_id>', methods=['DELETE'])
def delete_config(config_id):
    """
    Delete a Copytrader setup.
    """
    success = CopytraderHandler.delete_config(config_id)
    if success:
        return jsonify({"status": "success", "message": f"Config {config_id} deleted successfully"})
    return jsonify({"status": "error", "message": "Failed to delete config"}), 500

@copytrader_routes.route('/copytrader/config/<config_id>/status', methods=['POST'])
def set_config_status(config_id):
    """
    Reactivate or pause a Copytrader setup in memory or database.
    """
    payload = request.get_json(silent=True) or {}
    status = payload.get("status", "active")
    persist = bool(payload.get("persist", False))
    success = CopytraderHandler.set_config_status(config_id, status=status, persist=persist)
    if success:
        return jsonify({"status": "success", "message": f"Config {config_id} status set to '{status}'"})
    return jsonify({"status": "error", "message": "Config not found"}), 404

@copytrader_routes.route('/copytrader/config/<config_id>/slave/<slave_account_id>/status', methods=['POST'])
def set_slave_status(config_id, slave_account_id):
    """
    Reactivate or pause an individual slave account in memory or database.
    """
    payload = request.get_json(silent=True) or {}
    status = payload.get("status", "active")
    persist = bool(payload.get("persist", False))
    success = CopytraderHandler.set_slave_status(config_id, slave_account_id, status=status, persist=persist)
    if success:
        return jsonify({"status": "success", "message": f"Slave {slave_account_id} status set to '{status}'"})
    return jsonify({"status": "error", "message": "Slave or Config not found"}), 404

@copytrader_routes.route('/copytrader/history', methods=['POST', 'GET'])
def get_copytrader_history():
    """
    Retrieve past copied trades from SQL, filterable by config_id, slave_account, and status.
    """
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        config_id = payload.get("config_id")
        slave_account = payload.get("slave_account")
        status = payload.get("status")
        limit = payload.get("limit", 500)
    else:
        config_id = request.args.get("config_id")
        slave_account = request.args.get("slave_account")
        status = request.args.get("status")
        limit = request.args.get("limit", 500)

    try:
        limit = int(limit)
    except Exception:
        limit = 500

    mappings = CopytraderHandler.get_mappings(
        config_id=config_id,
        slave_account=slave_account,
        status=status,
        limit=limit
    )
    return jsonify({"status": "success", "history": mappings, "count": len(mappings)})


