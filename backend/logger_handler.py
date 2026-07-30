# /backend/logger_handler.py
import sys
import inspect
import json
from datetime import datetime

class LoggerHandler:
    @staticmethod
    def log(msg: str, category: str = None, level: str = "INFO"):
        """
        Unified structured logging helper.
        Automatically infers caller module name if category is not provided.
        Outputs formatted string: [Timestamp] [LEVEL] [Category] Message
        """
        if category is None:
            # Infer calling module/class automatically
            frame = inspect.currentframe().f_back
            category = frame.f_globals.get('__name__', 'System')
            if category == '__main__':
                category = 'App'
            elif '.' in category:
                category = category.split('.')[-1]

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        formatted = f"[{timestamp}] [{level.upper()}] [{category}] {msg}"
        
        # Standard print to stdout so TerminalHandler streams it to SSE LogPanel
        print(formatted, flush=True)

# Helper shorthand alias function logPrint()
def logPrint(msg: str, category: str = None, level: str = "INFO"):
    LoggerHandler.log(msg, category=category, level=level)
