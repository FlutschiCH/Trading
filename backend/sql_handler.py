import os
import sqlite3
import threading
from dotenv import load_dotenv

# Try importing mysql.connector, fallback to SQLite-only mode if not installed
try:
    import mysql.connector
    MYSQL_AVAILABLE = True
except ImportError:
    mysql = None
    MYSQL_AVAILABLE = False
    print("Warning: mysql-connector-python is not installed. SQLHandler will run in local SQLite-only mode.", flush=True)

# Load env variables from backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "trading_db")

LOCAL_DB_PATH = os.path.join(os.path.dirname(__file__), 'trades.db')

class SQLHandler:
    _lock = threading.Semaphore(1)

    @classmethod
    def get_mysql_connection(cls):
        if not MYSQL_AVAILABLE:
            raise RuntimeError("mysql-connector-python is not installed and remote MySQL is unavailable.")
        return mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            connect_timeout=3  # 3 seconds timeout for connection failover
        )

    @classmethod
    def get_sqlite_connection(cls):
        return sqlite3.connect(LOCAL_DB_PATH)

    @classmethod
    def execute_query(cls, query: str, params: tuple = None) -> list:
        """
        Executes a query with thread-safety and connection failover.
        """
        if params is None:
            params = ()

        cls._lock.acquire()
        try:
            # 1. Try MySQL remote database
            try:
                conn = cls.get_mysql_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute(query, params)
                if query.strip().upper().startswith("SELECT"):
                    result = cursor.fetchall()
                else:
                    conn.commit()
                    result = [{"rowcount": cursor.rowcount, "lastrowid": cursor.lastrowid}]
                cursor.close()
                conn.close()
                return result
            except Exception as remote_err:
                print(f"Remote database error, falling back to local SQLite: {remote_err}", flush=True)
                
                # 2. Local SQLite fallback
                conn = cls.get_sqlite_connection()
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                # Convert MySQL dialect ON DUPLICATE KEY UPDATE to SQLite ON CONFLICT
                sqlite_query = cls._translate_to_sqlite(query)
                
                # Replace %s placeholders with ? placeholders for SQLite
                sqlite_query = sqlite_query.replace("%s", "?")
                
                cursor.execute(sqlite_query, params)
                if query.strip().upper().startswith("SELECT"):
                    rows = cursor.fetchall()
                    result = [dict(row) for row in rows]
                else:
                    conn.commit()
                    result = [{"rowcount": cursor.rowcount, "lastrowid": cursor.lastrowid}]
                cursor.close()
                conn.close()
                return result
        finally:
            cls._lock.release()

    @classmethod
    def _translate_to_sqlite(cls, query: str) -> str:
        """
        Translates ON DUPLICATE KEY UPDATE MySQL syntax to SQLite ON CONFLICT syntax.
        """
        q_upper = query.upper()
        if "ON DUPLICATE KEY UPDATE" in q_upper:
            # Identify the table name
            table_name = "live_strategies"
            for token in query.split():
                if token.lower() not in ["insert", "into", "ignore"] and any(c.isalnum() for c in token):
                    table_name = token.strip("`()")
                    break
            
            # Determine conflict target key (primary key or unique key)
            conflict_target = "symbol"
            if "trades" in table_name.lower():
                conflict_target = "signal_id"
            
            parts = query.split("ON DUPLICATE KEY UPDATE")
            if len(parts) == 2:
                sqlite_query = f"{parts[0]} ON CONFLICT({conflict_target}) DO UPDATE SET {parts[1]}"
                return sqlite_query
        return query
