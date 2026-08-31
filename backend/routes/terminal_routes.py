# /backend/routes/terminal_routes.py
from flask import Blueprint, Response
from terminal_handler import TerminalHandler

terminal_routes = Blueprint('terminal_routes', __name__)

@terminal_routes.route('/terminal/stream', methods=['GET'])
def stream_terminal():
    def generate():
        for log in TerminalHandler.listen():
            if log is None:
                # SSE heartbeat ping line to prevent proxy idle timeout
                yield ": ping\n\n"
            else:
                lines = log.split('\n')
                for line in lines:
                    if line.strip():
                        yield f"data: {line}\n\n"
                
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })
