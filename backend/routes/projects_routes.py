from flask import Blueprint, jsonify

projects_bp = Blueprint('projects', __name__)

@projects_bp.route('/projects', methods=['GET'])
def get_projects():
    return jsonify([])
