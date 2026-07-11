from flask import Blueprint
from routes.trading_routes import trading_routes
from routes.ctrader_routes import ctrader_routes
from routes.sql_routes import sql_routes
from routes.live_strategy_routes import live_strategy_routes
from routes.metatrader_routes import metatrader_routes
from routes.yfinance_routes import yfinance_routes

# Create consolidated api blueprint
api_blueprint = Blueprint('api', __name__)

# Register sub-blueprints
api_blueprint.register_blueprint(trading_routes)
api_blueprint.register_blueprint(ctrader_routes)
api_blueprint.register_blueprint(sql_routes)
api_blueprint.register_blueprint(live_strategy_routes)
api_blueprint.register_blueprint(metatrader_routes)
api_blueprint.register_blueprint(yfinance_routes)
