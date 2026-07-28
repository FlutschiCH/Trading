# /backend/routes/terminal_routes.py
from flask import Blueprint, Response
from terminal_handler import TerminalHandler

terminal_routes = Blueprint('terminal_routes', __name__)

@terminal_routes.route('/terminal/stream', methods=['GET'])
def stream_terminal():
    def generate():
        for log in TerminalHandler.listen():
            lines = log.split('\n')
            for line in lines:
                if line.strip():
                    yield f"data: {line}\n\n"
                
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive'
    })
