from flask import Blueprint
from routes.candles_routes import candles_blueprint
from routes.metatrader_routes import metatrader_blueprint

api_blueprint = Blueprint('api', __name__)
api_blueprint.register_blueprint(candles_blueprint, url_prefix='/candles')
api_blueprint.register_blueprint(metatrader_blueprint, url_prefix='/metatrader')
