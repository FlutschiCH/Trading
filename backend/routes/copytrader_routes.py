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
