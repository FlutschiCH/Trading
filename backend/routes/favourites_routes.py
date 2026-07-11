from flask import Blueprint, request, jsonify
from favourites_handler import FavouritesHandler

favourites_routes = Blueprint('favourites_routes', __name__)

@favourites_routes.route('/favourites/save', methods=['POST'])
def save_favourite():
    payload = request.get_json(silent=True) or {}
    symbol = payload.get('symbol')
    timeframe = payload.get('timeframe')
    candle_time = payload.get('time')
    open_val = payload.get('open')
    high_val = payload.get('high')
    low_val = payload.get('low')
    close_val = payload.get('close')
    volume_val = payload.get('volume', 0.0)
    vsa_patterns = payload.get('vsa_patterns', None)
    weis_wave_volume = payload.get('weis_wave_volume', None)
    notes = payload.get('notes', "")

    if not symbol or not timeframe or not candle_time:
        return jsonify({"status": "error", "message": "Missing required fields (symbol, timeframe, time)."}), 400

    if isinstance(vsa_patterns, list):
        vsa_patterns = ",".join(vsa_patterns)

    res = FavouritesHandler.save_favourite(
        symbol=symbol,
        timeframe=timeframe,
        candle_time=candle_time,
        open_val=open_val,
        high_val=high_val,
        low_val=low_val,
        close_val=close_val,
        volume_val=volume_val,
        vsa_patterns=vsa_patterns,
        weis_wave_volume=weis_wave_volume,
        notes=notes
    )
    return jsonify(res)

@favourites_routes.route('/favourites/delete', methods=['POST'])
def delete_favourite():
    payload = request.get_json(silent=True) or {}
    fav_id = payload.get('id')
    if not fav_id:
        return jsonify({"status": "error", "message": "Missing favourite ID."}), 400
    res = FavouritesHandler.delete_favourite(fav_id)
    return jsonify(res)

@favourites_routes.route('/favourites/list', methods=['GET'])
def list_favourites():
    data = FavouritesHandler.list_favourites()
    return jsonify({"status": "success", "data": data})

@favourites_routes.route('/favourites/update-notes', methods=['POST'])
def update_notes():
    payload = request.get_json(silent=True) or {}
    fav_id = payload.get('id')
    notes = payload.get('notes', '')
    if not fav_id:
        return jsonify({"status": "error", "message": "Missing favourite ID."}), 400
    res = FavouritesHandler.update_notes(fav_id, notes)
    return jsonify(res)
