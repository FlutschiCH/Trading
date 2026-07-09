from flask import Blueprint
from routes.trading_routes import trading_routes
from routes.ctrader_routes import ctrader_routes

# Create consolidated api blueprint
api_blueprint = Blueprint('api', __name__)

# Register sub-blueprints
api_blueprint.register_blueprint(trading_routes)
api_blueprint.register_blueprint(ctrader_routes)
