# /backend/terminal_handler.py
import sys
from gevent.lock import RLock
from gevent.queue import Queue

class TerminalHandler:
    _lock = RLock()
    _logs = []  # Keep last 1000 lines
    _max_logs = 1000
    _queues = []
    _initialized = False

    # Store references to original streams to prevent recursion
    _orig_stdout = None
    _orig_stderr = None

    class StreamWrapper:
        def __init__(self, original_stream, is_stderr=False):
            self.original_stream = original_stream
            self.is_stderr = is_stderr

        def write(self, data):
            # Print to the original stream first (no recursion)
            self.original_stream.write(data)
            self.original_stream.flush()
            if data:
                # Clean carriage return prefixes/updates for SSE compatibility
                clean_data = data.replace('\r\n', '\n').replace('\r', '\n')
                if clean_data.strip('\n'):
                    TerminalHandler.add_log(clean_data)

        def flush(self):
            self.original_stream.flush()

    @classmethod
    def init(cls):
        with cls._lock:
            if cls._initialized:
                return
            cls._orig_stdout = sys.stdout
            cls._orig_stderr = sys.stderr
            sys.stdout = cls.StreamWrapper(sys.stdout, is_stderr=False)
            sys.stderr = cls.StreamWrapper(sys.stderr, is_stderr=True)
            cls._initialized = True
            print("[TerminalHandler] Output redirection initialized successfully.", flush=True)

    @classmethod
    def add_log(cls, text):
        with cls._lock:
            # Append log chunk
            cls._logs.append(text)
            if len(cls._logs) > cls._max_logs:
                cls._logs.pop(0)
            
            # Put in all listener queues
            for q in cls._queues:
                try:
                    q.put_nowait(text)
                except Exception:
                    pass

    @classmethod
    def get_history(cls):
        with cls._lock:
            return "".join(cls._logs)

    @classmethod
    def listen(cls):
        q = Queue()
        with cls._lock:
            cls._queues.append(q)
        
        try:
            # Yield current history first
            history = cls.get_history()
            if history:
                yield history
            
            while True:
                # Wait for new data
                data = q.get()
                yield data
        finally:
            with cls._lock:
                if q in cls._queues:
                    cls._queues.remove(q)
