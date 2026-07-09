from flask import Blueprint
from routes.candles_routes import candles_blueprint
from routes.ctrader_routes import ctrader_blueprint
from routes.localctrader_routes import localctrader_blueprint

api_blueprint = Blueprint('api', __name__)
api_blueprint.register_blueprint(candles_blueprint, url_prefix='/candles')
api_blueprint.register_blueprint(ctrader_blueprint, url_prefix='/ctrader')
api_blueprint.register_blueprint(localctrader_blueprint, url_prefix='/localctrader')
