# /backend/terminal_handler.py
import sys
import re
import time
import json
import os
from datetime import datetime
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

            # Print to the original stream first (no recursion) with encoding safety
            try:
                self.original_stream.write(data)
            except UnicodeEncodeError:
                encoding = getattr(self.original_stream, 'encoding', 'utf-8') or 'utf-8'
                safe_data = data.encode(encoding, errors='replace').decode(encoding)
                self.original_stream.write(safe_data)
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
            if hasattr(sys.stdout, 'reconfigure'):
                try:
                    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
                    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
                except Exception:
                    pass
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

        # Persist unformatted stdout/stderr lines to logs.json
        cls._append_to_file(text)

    @classmethod
    def _append_to_file(cls, text: str):
        try:
            log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs.json")
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            lines = text.strip('\n').split('\n')
            entries = []
            for line in lines:
                line_str = line.strip()
                if not line_str:
                    continue
                # Skip if already formatted by LoggerHandler.log to avoid duplicates
                if line_str.startswith('[20') and '] [' in line_str:
                    continue
                level = "ERROR" if any(err in line_str for err in ["Exception", "Error", "Traceback", "Failed"]) else "INFO"
                entries.append({
                    "timestamp": timestamp,
                    "level": level,
                    "category": "Terminal",
                    "message": line_str
                })
            if not entries:
                return

            with cls._lock:
                logs = []
                if os.path.exists(log_path):
                    try:
                        with open(log_path, "r", encoding="utf-8") as f:
                            logs = json.load(f)
                    except Exception:
                        logs = []
                logs.extend(entries)
                if len(logs) > 2000:
                    logs = logs[-2000:]
                with open(log_path, "w", encoding="utf-8") as f:
                    json.dump(logs, f, indent=2, ensure_ascii=False)
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


