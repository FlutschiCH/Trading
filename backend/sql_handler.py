import os
import threading
import time
from dotenv import load_dotenv

try:
    import mysql.connector
    MYSQL_AVAILABLE = True
except ImportError:
    mysql = None
    MYSQL_AVAILABLE = False
    print("Error: mysql-connector-python is required.", flush=True)

# Load env variables from backend/.env
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "trading_db")

class SQLHandler:
    _lock = threading.RLock()
    _exec_lock = threading.RLock()
    _conn = None

    @classmethod
    def get_mysql_connection(cls):
        """
        Returns an active, single persistent MySQL connection (reconnects if disconnected).
        """
        if not MYSQL_AVAILABLE:
            raise RuntimeError("mysql-connector-python is not installed.")

        with cls._lock:
            # Check if current connection is still alive
            if cls._conn is not None:
                try:
                    if cls._conn.is_connected():
                        cls._conn.ping(reconnect=True, attempts=1, delay=0)
                        return cls._conn
                except Exception:
                    cls._conn = None

            # Establish single persistent connection
            start_time = time.time()
            cls._conn = mysql.connector.connect(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                connect_timeout=5,
                autocommit=True
            )
            duration = time.time() - start_time
            try:
                from logger_handler import logPrint
                logPrint(f"Successfully established persistent MySQL connection to {DB_HOST}:{DB_PORT}/{DB_NAME} in {duration:.4f} seconds.", category="SQLHandler", level="INFO")
            except Exception:
                pass

            return cls._conn

    @classmethod
    def init_log_settings_db(cls):
        """Creates table for log category visibility settings."""
        query = """
        CREATE TABLE IF NOT EXISTS system_log_settings (
            category VARCHAR(128) PRIMARY KEY,
            enabled TINYINT(1) DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        try:
            cls.execute_query(query)
        except Exception as e:
            print(f"[SQLHandler] Error initializing system_log_settings table: {e}", flush=True)

    @classmethod
    def get_log_settings(cls) -> dict:
        try:
            rows = cls.execute_query("SELECT category, enabled FROM system_log_settings")
            if isinstance(rows, list):
                return {r['category']: bool(r['enabled']) for r in rows if 'category' in r}
        except Exception:
            pass
        return {}

    @classmethod
    def save_log_setting(cls, category: str, enabled: bool):
        try:
            query = """
            INSERT INTO system_log_settings (category, enabled)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)
            """
            cls.execute_query(query, (category, 1 if enabled else 0))
        except Exception as e:
            print(f"[SQLHandler] Error saving log setting for {category}: {e}", flush=True)

    @classmethod
    def execute_query(cls, query: str, params: tuple = None) -> list:
        """
        Executes a query with thread lock safety using single persistent connection.
        """
        if params is None:
            params = ()

        with cls._exec_lock:
            max_retries = 3
            last_err = None
            for attempt in range(max_retries):
                cursor = None
                try:
                    q_start = time.time()
                    conn = cls.get_mysql_connection()
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute(query, params)
                    if query.strip().upper().startswith("SELECT"):
                        result = cursor.fetchall()
                    else:
                        result = [{"rowcount": cursor.rowcount, "lastrowid": cursor.lastrowid}]
                    q_dur = time.time() - q_start
                    if q_dur > 0.05 and "system_log_settings" not in query:
                        from logger_handler import logPrint
                        clean_q = " ".join(query.split())[:120]
                        logPrint(f"Executed SQL query in {q_dur:.4f}s: {clean_q}", category="SQLHandler", level="DEBUG")
                    return result
                except Exception as err:
                    last_err = err
                    err_msg = str(err)
                    is_conn_err = any(x in err_msg for x in ["2055", "Lost connection", "10054", "Connection refused", "is closed", "not connected", "MySQL Connection not available"])
                    if is_conn_err:
                        cls._conn = None  # Reset persistent connection on disconnect
                        if attempt < max_retries - 1:
                            time.sleep(0.2)
                            continue
                    else:
                        raise err
                finally:
                    if cursor:
                        try:
                            cursor.close()
                        except Exception:
                            pass

        if last_err:
            raise last_err
        raise RuntimeError("Failed to execute MySQL query.")


if __name__ == '__main__':
    import time
    print(f"==================================================")
    print(f"⏱️  Benchmarking SQLHandler (Single Persistent Connection)")
    print(f"   Host:     {DB_HOST}:{DB_PORT}")
    print(f"   Database: {DB_NAME}")
    print(f"   User:     {DB_USER}")
    print(f"==================================================")

    # 1. Benchmark initial connection establishment
    t0 = time.perf_counter()
    conn = SQLHandler.get_mysql_connection()
    t1 = time.perf_counter()
    init_ms = (t1 - t0) * 1000.0
    print(f"1. Establish Persistent Connection: SUCCESS in {init_ms:.2f} ms ({init_ms/1000.0:.2f} s)")

    # 2. Benchmark ping / reuse existing connection
    t2 = time.perf_counter()
    conn2 = SQLHandler.get_mysql_connection()
    t3 = time.perf_counter()
    reuse_ms = (t3 - t2) * 1000.0
    print(f"2. Reuse Active Connection (Ping): SUCCESS in {reuse_ms:.2f} ms")

    # 3. Benchmark simple SELECT query
    t4 = time.perf_counter()
    try:
        res = SQLHandler.execute_query("SELECT 1 AS test")
        t5 = time.perf_counter()
        q_ms = (t5 - t4) * 1000.0
        print(f"3. Execute 'SELECT 1' Query: SUCCESS ({res}) in {q_ms:.2f} ms ({q_ms/1000.0:.2f} s)")
    except Exception as e:
        print(f"3. Execute Query: FAILED ({e})")

