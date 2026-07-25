import os
import sqlite3
import threading
import time
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
    _pool = None
    _remote_db_offline = False
    _last_db_check = 0.0

    @classmethod
    def init_pool(cls):
        """
        Initializes the MySQL connection pool.
        """
        if not MYSQL_AVAILABLE:
            return False
        if cls._pool is not None:
            return True
        start_time = time.time()
        try:
            from mysql.connector.pooling import MySQLConnectionPool
            cls._pool = MySQLConnectionPool(
                pool_name="trading_pool",
                pool_size=1,
                pool_reset_session=True,
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                connect_timeout=1
            )
            cls._remote_db_offline = False
            duration = time.time() - start_time
            print(f"Successfully initialized remote MySQL connection pool in {duration:.4f} seconds.", flush=True)
            return True
        except Exception as e:
            cls._remote_db_offline = True
            cls._last_db_check = time.time()
            duration = time.time() - start_time
            print(f"Failed to initialize remote MySQL connection pool after {duration:.4f} seconds: {e}. Falling back to SQLite.", flush=True)
            return False

    @classmethod
    def get_mysql_connection(cls):
        if not MYSQL_AVAILABLE:
            raise RuntimeError("mysql-connector-python is not installed and remote MySQL is unavailable.")
        if cls._pool is None:
            cls.init_pool()
        if cls._pool is None:
            raise RuntimeError("MySQL connection pool is not initialized.")
        return cls._pool.get_connection()

    @classmethod
    def get_sqlite_connection(cls):
        return sqlite3.connect(LOCAL_DB_PATH)

    @classmethod
    def _execute_sqlite(cls, query: str, params: tuple) -> list:
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

    @classmethod
    def execute_query(cls, query: str, params: tuple = None) -> list:
        """
        Executes a query with thread-safety and connection failover.
        """
        if params is None:
            params = ()

        cls._lock.acquire()
        try:
            now = time.time()
            # If the remote database recently failed to connect, skip and use SQLite fallback directly
            if cls._remote_db_offline and (now - cls._last_db_check < 60):
                return cls._execute_sqlite(query, params)

            # 1. Try MySQL remote database connection
            try:
                conn = cls.get_mysql_connection()
                cls._remote_db_offline = False
            except Exception as conn_err:
                cls._remote_db_offline = True
                cls._last_db_check = now
                print(f"Remote database connection failed, falling back to local SQLite: {conn_err}", flush=True)
                return cls._execute_sqlite(query, params)

            # 2. Connection succeeded, execute query on MySQL
            try:
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
            except Exception as query_err:
                # Check if connection was lost during execution
                is_conn_lost = False
                try:
                    if not conn.is_connected():
                        is_conn_lost = True
                except Exception:
                    is_conn_lost = True

                if is_conn_lost:
                    print(f"Remote database connection lost during query execution, falling back to local SQLite: {query_err}", flush=True)
                    try:
                        conn.close()
                    except Exception:
                        pass
                    return cls._execute_sqlite(query, params)
                else:
                    # Genuine SQL error (e.g. duplicate column, syntax error), raise it
                    try:
                        conn.close()
                    except Exception:
                        pass
                    raise query_err
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
            conflict_target = "id"
            if "trades" in table_name.lower():
                conflict_target = "signal_id"
            elif "favourite_candles" in table_name.lower():
                conflict_target = "symbol, timeframe, candle_time"
            elif "symbol_mappings" in table_name.lower():
                conflict_target = "main_symbol, broker_key"
            elif "live_strategies" in table_name.lower():
                conflict_target = "id"
            elif "backtest_settings_profiles" in table_name.lower():
                conflict_target = "name, symbol, timeframe"
            elif "backtest_settings" in table_name.lower():
                conflict_target = "symbol, timeframe"
            
            parts = query.split("ON DUPLICATE KEY UPDATE")
            if len(parts) == 2:
                sqlite_query = f"{parts[0]} ON CONFLICT({conflict_target}) DO UPDATE SET {parts[1]}"
                return sqlite_query
        return query
