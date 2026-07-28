# /backend/routes/terminal_routes.py
from flask import Blueprint, Response
from terminal_handler import TerminalHandler

terminal_routes = Blueprint('terminal_routes', __name__)

@terminal_routes.route('/terminal/stream', methods=['GET'])
def stream_terminal():
    def generate():
        # Yield SSE format data stream
        for log in TerminalHandler.listen():
            # Escape or format if necessary, but EventSource expects "data: <msg>\n\n"
            # Since log can contain newlines, we should split it or encode it.
            # To be safe and preserve format, we can send it line by line or simply replace newlines with a delimiter,
            # or send it directly. If we send it directly, standard SSE splits multiline data by prepending "data: " to each line.
            # Let's split by newline and send each line.
            lines = log.split('\n')
            for i, line in enumerate(lines):
                # If it's the last element and it was empty (due to trailing newline), we still send it as a newline
                if i == len(lines) - 1 and not line:
                    continue
                yield f"data: {line}\n\n"
                
    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive'
    })
