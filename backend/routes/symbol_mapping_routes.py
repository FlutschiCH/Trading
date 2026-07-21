from flask import Blueprint, request, jsonify
from symbol_mapping_handler import SymbolMappingHandler

symbol_mapping_routes = Blueprint('symbol_mapping', __name__)

@symbol_mapping_routes.route('/symbol-mappings', methods=['GET'])
def get_mappings():
    mappings = SymbolMappingHandler.get_all_mappings()
    return jsonify({"status": "success", "data": mappings})

@symbol_mapping_routes.route('/symbol-mappings', methods=['POST'])
def add_mapping():
    payload = request.get_json(silent=True) or {}
    main_symbol = payload.get('main_symbol')
    broker_key = payload.get('broker_key')
    broker_symbol = payload.get('broker_symbol')

    if not main_symbol or not broker_key or not broker_symbol:
        return jsonify({"status": "error", "message": "Missing main_symbol, broker_key or broker_symbol"}), 400

    success = SymbolMappingHandler.add_mapping(main_symbol, broker_key, broker_symbol)
    if success:
        return jsonify({"status": "success", "message": "Symbol mapping updated successfully"})
    return jsonify({"status": "error", "message": "Failed to update symbol mapping"}), 500

@symbol_mapping_routes.route('/symbol-mappings', methods=['DELETE'])
def delete_mapping():
    payload = request.get_json(silent=True) or {}
    mapping_id = payload.get('id')

    if mapping_id is None:
        return jsonify({"status": "error", "message": "Missing mapping id"}), 400

    success = SymbolMappingHandler.delete_mapping(mapping_id)
    if success:
        return jsonify({"status": "success", "message": "Symbol mapping deleted successfully"})
    return jsonify({"status": "error", "message": "Failed to delete symbol mapping"}), 500
