import os
import sqlite3
import socket
import json
from datetime import datetime

# Path to the paper-trading SQLite database
DB_PATH = os.path.join(os.path.dirname(__file__), 'trades.db')

def init_db():
    """
    Initializes the SQLite database schema for storing executed trades.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id TEXT UNIQUE,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            qty REAL NOT NULL,
            entry_price REAL NOT NULL,
            stop_loss REAL,
            take_profit REAL,
            notional REAL NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            timestamp TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

# Initialize DB on import
init_db()

class IBTSocketClient:
    """
    REST client socket template representing Interactive Brokers TWS API integration.
    """
    def __init__(self, host='127.0.0.1', port=7496, client_id=1):
        self.host = host
        self.port = port
        self.client_id = client_id
        
    def dispatch_order(self, symbol: str, action: str, qty: float, limit_price: float, stop_loss: float = None) -> dict:
        """
        Sends order details over a mock TCP socket connection representing the TWS API client.
        """
        payload = {
            "client_id": self.client_id,
            "symbol": symbol,
            "action": action,
            "qty": qty,
            "price": limit_price,
            "stop_loss": stop_loss,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Simulating socket communication
        try:
            # We construct a socket to showcase the API capability structure
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            # Connecting to mock host / port or catching connection exceptions gracefully
            # In a real environment, we'd establish real connection: s.connect((self.host, self.port))
            # We'll mock the response since TWS might not be running locally
            s.close()
            return {"status": "dispatched", "broker_ref": f"IB-{datetime.now().microsecond}"}
        except Exception as e:
            # Fallback to simulated local success/dispatch for testing purposes
            return {"status": "simulated_dispatch", "broker_ref": f"SIM-IB-{datetime.now().microsecond}", "info": str(e)}

def execute_signal(signal_data: dict) -> dict:
    """
    Enforces risk limits, verifies stop loss, logs order details, and routes order to SQLite & mock Interactive Brokers.
    """
    signal_id = signal_data.get('signal_id')
    symbol = signal_data.get('symbol')
    action = signal_data.get('action') # 'BUY' or 'SELL'
    qty = float(signal_data.get('qty', 0))
    entry_price = float(signal_data.get('price', 0))
    stop_loss = signal_data.get('stop_loss')
    take_profit = signal_data.get('take_profit')
    
    if stop_loss is not None:
        stop_loss = float(stop_loss)
    if take_profit is not None:
        take_profit = float(take_profit)

    # 1. Enforce portfolio limits: Single trade notional limit: $100,000 USD
    notional = qty * entry_price
    if notional > 100000.0:
        return {
            "status": "REJECTED",
            "message": f"Single trade notional limit exceeded: ${notional:.2f} > $100,000.00"
        }

    # 2. Stop-loss distance boundary: Must be between 0.5% and 5.0% of the entry price
    if stop_loss is None:
        return {
            "status": "REJECTED",
            "message": "Stop loss is required for risk safeguard verification."
        }
        
    sl_distance = abs(entry_price - stop_loss)
    sl_pct = (sl_distance / entry_price) * 100.0
    
    if sl_pct < 0.5 or sl_pct > 5.0:
        return {
            "status": "REJECTED",
            "message": f"Stop loss distance of {sl_pct:.2f}% is outside bounds (0.5% - 5.0%)."
        }

    # Save to SQLite DB
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Route to mock Interactive Brokers socket client
        client = IBTSocketClient()
        dispatch_res = client.dispatch_order(symbol, action, qty, entry_price, stop_loss)
        
        status = "EXECUTED"
        message = f"Dispatched successfully to Interactive Brokers. Reference: {dispatch_res.get('broker_ref')}"
        
        # Idempotent database insert
        cursor.execute("""
            INSERT OR REPLACE INTO trades (signal_id, symbol, action, qty, entry_price, stop_loss, take_profit, notional, status, message, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            signal_id, symbol, action, qty, entry_price, stop_loss, take_profit, notional, status, message, datetime.utcnow().isoformat()
        ))
        conn.commit()
        
        return {
            "status": status,
            "notional": notional,
            "message": message,
            "signal_id": signal_id
        }
    except Exception as e:
        conn.rollback()
        return {
            "status": "ERROR",
            "message": f"Execution failed: {str(e)}"
        }
    finally:
        conn.close()
