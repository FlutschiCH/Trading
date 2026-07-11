import sys
import os

# Ensure the backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from gevent.pywsgi import WSGIServer
from routes import api_blueprint  # Aggregated blueprint

app = Flask(__name__)
CORS(app)

# Register consolidated routes
app.register_blueprint(api_blueprint, url_prefix='/api')

if __name__ == '__main__':
    # Initialize high-performance WSGI Server
    port = int(os.environ.get("PORT", 8751))
    print(f"Starting gevent WSGI Server on port {port}...", flush=True)
    http_server = WSGIServer(('0.0.0.0', port), app)
    http_server.serve_forever()
