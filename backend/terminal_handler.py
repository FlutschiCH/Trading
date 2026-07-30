# /backend/terminal_handler.py
import sys
import re
import time
from gevent.lock import RLock
from gevent.queue import Queue, Empty

class TerminalHandler:
    _lock = RLock()
    _logs = []  # Keep last 1000 lines
    _max_logs = 1000
    _queues = []
    _initialized = False
    _settings_cache = {}
    _last_cache_time = 0

    # Store references to original streams to prevent recursion
    _orig_stdout = None
    _orig_stderr = None

    @classmethod
    def _is_category_enabled(cls, text: str) -> bool:
        now = time.time()
        if now - cls._last_cache_time > 2.0:
            try:
                from sql_handler import SQLHandler
                cls._settings_cache = SQLHandler.get_log_settings()
                cls._last_cache_time = now
            except Exception:
                pass

        if not cls._settings_cache:
            return True

        category = 'Other'
        if 'GET /' in text or 'POST /' in text or 'PUT /' in text or 'DELETE /' in text or '[API Log]' in text:
            category = 'Flask API'
        else:
            match = re.search(r'\[([A-Za-z0-9_ -]+)\]', text)
            if match and match.group(1):
                category = match.group(1).strip()

        if cls._settings_cache.get(category) is False:
            return False
        return True

    class StreamWrapper:
        def __init__(self, original_stream, is_stderr=False):
            self.original_stream = original_stream
            self.is_stderr = is_stderr

        def write(self, data):
            if data and not self.is_stderr:
                if not TerminalHandler._is_category_enabled(data):
                    return

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
                try:
                    # Wait for new data with 10s timeout for proxy heartbeats
                    data = q.get(timeout=10)
                    yield data
                except Empty:
                    # Yield None as a heartbeat signal to keep SSE connection alive over proxy
                    yield None
        finally:
            with cls._lock:
                if q in cls._queues:
                    cls._queues.remove(q)

