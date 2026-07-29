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
    _lock = threading.Semaphore(1)
    _pool = None

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
        pool_size = int(os.getenv("DB_POOL_SIZE", "6"))
        try:
            from mysql.connector.pooling import MySQLConnectionPool
            cls._pool = MySQLConnectionPool(
                pool_name="trading_pool",
                pool_size=pool_size,
                pool_reset_session=True,
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                connect_timeout=5
            )
            duration = time.time() - start_time
            print(f"Successfully initialized MySQL connection pool (size={pool_size}) in {duration:.4f} seconds.", flush=True)
            return True
        except Exception as e:
            duration = time.time() - start_time
            print(f"Failed to initialize MySQL connection pool after {duration:.4f} seconds: {e}.", flush=True)
            return False

    @classmethod
    def get_mysql_connection(cls):
        if not MYSQL_AVAILABLE:
            raise RuntimeError("mysql-connector-python is not installed.")
        if cls._pool is None:
            cls.init_pool()
        if cls._pool is None:
            raise RuntimeError("MySQL connection pool is not initialized.")
        return cls._pool.get_connection()

    @classmethod
    def execute_query(cls, query: str, params: tuple = None) -> list:
        """
        Executes a query with connection cleanup using MySQL.
        """
        if params is None:
            params = ()

        max_retries = 3
        last_err = None
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
                last_err = err
                err_msg = str(err)
                is_conn_err = any(x in err_msg for x in ["pool exhausted", "PoolError", "2055", "Lost connection", "10054", "Connection refused", "is closed", "not connected", "Failed getting connection"])
                if is_conn_err:
                    print(f"[SQLHandler] MySQL connection issue (attempt {attempt + 1}/{max_retries}): {err_msg}", flush=True)
                    cls._pool = None  # Re-initialize pool on retry
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
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass

        if last_err:
            raise last_err
        raise RuntimeError("Failed to execute MySQL query.")
