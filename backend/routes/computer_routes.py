from flask import Blueprint, jsonify
from computer_handler import ComputerHandler

computer_routes = Blueprint('computer_routes', __name__)

@computer_routes.route('/computers', methods=['GET'])
def get_computers():
    computers = ComputerHandler.get_computers()
    return jsonify({"status": "success", "computers": computers})
