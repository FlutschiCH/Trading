from flask import Blueprint
from routes.strategy_routes import strategy_routes
from routes.ctrader_routes import ctrader_routes
from routes.sql_routes import sql_routes
from routes.live_strategy_routes import live_strategy_routes
from routes.metatrader_routes import metatrader_routes
from routes.yfinance_routes import yfinance_routes
from routes.favourites_routes import favourites_routes
from routes.indicator_routes import indicator_routes

# Create consolidated api blueprint
api_blueprint = Blueprint('api', __name__)

# Register sub-blueprints
api_blueprint.register_blueprint(strategy_routes)
api_blueprint.register_blueprint(ctrader_routes)
api_blueprint.register_blueprint(sql_routes)
api_blueprint.register_blueprint(live_strategy_routes)
api_blueprint.register_blueprint(metatrader_routes)
api_blueprint.register_blueprint(yfinance_routes)
api_blueprint.register_blueprint(favourites_routes)
api_blueprint.register_blueprint(indicator_routes)
