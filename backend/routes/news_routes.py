from flask import Blueprint, request, jsonify
from news_handler import NewsHandler

news_bp = Blueprint('news', __name__)

@news_bp.route('/', methods=['GET'])
@news_bp.route('', methods=['GET'])
def get_news_list():
    """Retrieve news items with optional filters."""
    currency = request.args.get('currency', 'ALL')
    impact = request.args.get('impact', 'ALL')
    search = request.args.get('search', '')
    limit = request.args.get('limit', 100)

    try:
        limit = int(limit)
    except (ValueError, TypeError):
        limit = 100

    news = NewsHandler.get_news(currency=currency, impact=impact, search=search, limit=limit)
    return jsonify({
        "status": "success",
        "count": len(news),
        "data": news
    }), 200

@news_bp.route('/refresh', methods=['POST'])
def refresh_news():
    """Trigger background refresh and return count of updated items."""
    try:
        count = NewsHandler.fetch_and_store_news()
        return jsonify({
            "status": "success",
            "message": f"Successfully updated news feeds.",
            "items_synced": count
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
