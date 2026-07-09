import sys
import os
# Add current directory to path to resolve imports properly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from gevent.pywsgi import WSGIServer
from routes import api_blueprint

app = Flask(__name__)
CORS(app)

app.register_blueprint(api_blueprint, url_prefix='/api')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8751))
    print(f"Starting server on port {port}...")
    http_server = WSGIServer(('0.0.0.0', port), app)
    http_server.serve_forever()
