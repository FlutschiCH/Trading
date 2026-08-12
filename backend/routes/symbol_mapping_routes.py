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


@symbol_mapping_routes.route('/symbol-mappings/connected-brokers', methods=['GET'])
def get_connected_brokers():
    from account_handler import AccountHandler
    from broker_handler import BrokerHandler
    
    accounts = AccountHandler.get_accounts() or []
    connected = []
    
    for acc in accounts:
        acc_id = str(acc.get("account_id"))
        b_type = acc.get("broker_type", "metatrader")
        b_name = acc.get("name", f"Account #{acc_id}")
        b_key = f"{b_type}:{acc.get('server') or acc_id}"
        
        symbols = []
        try:
            handler = BrokerHandler.get_handler(b_type)
            if b_type == 'metatrader':
                kwargs = {
                    "login": int(acc_id) if acc_id.isdigit() else acc_id,
                    "password": acc.get("password"),
                    "server": acc.get("server")
                }
                raw_syms = handler.get_symbols(**kwargs) or []
                symbols = raw_syms if isinstance(raw_syms, list) else []
            elif b_type == 'ctrader':
                sym_res = handler.get_symbols(account_id=acc_id, password=acc.get("password"), token=acc.get("password"))
                if isinstance(sym_res, dict) and sym_res.get("status") == "success":
                    symbols = sym_res.get("data", [])
        except Exception as e:
            print(f"Error fetching symbols for account {acc_id}: {e}", flush=True)

        connected.append({
            "account_id": acc_id,
            "broker_type": b_type,
            "name": b_name,
            "broker_key": b_key,
            "symbols": symbols
        })
        
    return jsonify({"status": "success", "data": connected})

