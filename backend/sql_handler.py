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
                pool_name=f"trading_pool_{int(time.time())}",
                pool_size=32,
                pool_reset_session=True,
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                connect_timeout=3
            )
            cls._remote_db_offline = False
            duration = time.time() - start_time
            print(f"Successfully initialized remote MySQL connection pool (size=32) in {duration:.4f} seconds.", flush=True)
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
        Executes a query with thread-safety, connection cleanup, and fallback to SQLite on failure.
        """
        if params is None:
            params = ()

        cls._lock.acquire()
        try:
            # Check if remote DB is marked offline recently
            if cls._remote_db_offline and (time.time() - cls._last_db_check < 30):
                return cls._execute_sqlite(query, params)

            max_retries = 2
            for attempt in range(max_retries):
                conn = None
                cursor = None
                try:
                    conn = cls.get_mysql_connection()
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute(query, params)
                    if query.strip().upper().startswith("SELECT"):
                        result = cursor.fetchall()
                    else:
                        conn.commit()
                        result = [{"rowcount": cursor.rowcount, "lastrowid": cursor.lastrowid}]
                    return result
                except Exception as err:
                    err_msg = str(err)
                    is_conn_err = any(x in err_msg for x in ["pool exhausted", "PoolError", "2055", "Lost connection", "10054", "Connection refused", "is closed", "not connected", "Failed getting connection"])
                    if is_conn_err:
                        print(f"[SQLHandler] MySQL connection issue (attempt {attempt + 1}/{max_retries}): {err_msg}", flush=True)
                        cls._pool = None  # Re-initialize pool on retry
                        if attempt < max_retries - 1:
                            time.sleep(0.2)
                            continue
                    else:
                        # Non-connection error (e.g. syntax error or table missing in MySQL), attempt SQLite fallback
                        print(f"[SQLHandler] MySQL query error: {err_msg}. Attempting SQLite fallback...", flush=True)
                        try:
                            return cls._execute_sqlite(query, params)
                        except Exception:
                            raise err
                finally:
                    if cursor:
                        try:
                            cursor.close()
                        except Exception:
                            pass
                    if conn:
                        try:
                            conn.close()
                        except Exception:
                            pass

            # Fallback to local SQLite if MySQL failed retries
            print("[SQLHandler] MySQL unavailable/exhausted after retries. Falling back to local SQLite.", flush=True)
            cls._remote_db_offline = True
            cls._last_db_check = time.time()
            return cls._execute_sqlite(query, params)
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
                
                # Replace VALUES(col) with excluded.col for SQLite compatibility
                import re
                sqlite_query = re.sub(r'VALUES\((.*?)\)', r'excluded.\1', sqlite_query, flags=re.IGNORECASE)
                return sqlite_query
        return query
