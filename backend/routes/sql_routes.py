from flask import Blueprint, jsonify
from sql_handler import SQLHandler

sql_routes = Blueprint('sql_routes', __name__)

@sql_routes.route('/db/status', methods=['GET'])
def db_status():
    """
    Checks the status of the database connections (MySQL and local SQLite fallback).
    """
    status = {
        "remote_mysql": "disconnected",
        "local_sqlite": "disconnected",
        "error": None
    }
    
    # Try MySQL
    try:
        conn = SQLHandler.get_mysql_connection()
        conn.close()
        status["remote_mysql"] = "connected"
    except Exception as e:
        status["remote_mysql"] = f"failed ({str(e)})"
        status["error"] = str(e)
        
    # Try SQLite
    try:
        conn = SQLHandler.get_sqlite_connection()
        conn.close()
        status["local_sqlite"] = "connected"
    except Exception as e:
        status["local_sqlite"] = f"failed ({str(e)})"
        if not status["error"]:
            status["error"] = str(e)
            
    return jsonify(status)
