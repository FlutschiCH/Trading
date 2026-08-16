import os
import queue
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
    _db_queue = queue.Queue()
    _worker_thread = None

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

    _db_queue = queue.Queue()
    _worker_thread = None

    @classmethod
    def _start_async_worker(cls):
        if cls._worker_thread is None or not cls._worker_thread.is_alive():
            def _worker():
                while True:
                    try:
                        item = cls._db_queue.get()
                        if item is None:
                            break
                        query, params = item
                        cls.execute_query(query, params)

                    except Exception as err:
                        print(f"[SQLHandler Async Worker] Error: {err}", flush=True)

            cls._worker_thread = threading.Thread(target=_worker, daemon=True)
            cls._worker_thread.start()

    @classmethod
    def init_saved_backtests_db(cls):
        """Creates table for persisting complete backtest runs."""
        query = """
        CREATE TABLE IF NOT EXISTS saved_backtests (
            id VARCHAR(64) PRIMARY KEY,
            symbol VARCHAR(32) NOT NULL,
            timeframe VARCHAR(16) NOT NULL,
            broker VARCHAR(32) DEFAULT 'metatrader',
            sl_val FLOAT,
            sl_type VARCHAR(16),
            rr FLOAT,
            be_trigger_r FLOAT,
            net_pnl FLOAT,
            win_rate FLOAT,
            trades_cnt INT,
            profit_factor FLOAT,
            max_drawdown FLOAT,
            payload LONGBLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_symbol (symbol),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        try:
            cls.execute_query(query)
        except Exception as e:
            print(f"[SQLHandler] Error initializing saved_backtests table: {e}", flush=True)

    @classmethod
    def save_backtest_run(cls, backtest_id: str, symbol: str, timeframe: str, broker: str,
                          sl_val: float, sl_type: str, rr: float, be_trigger_r: float,
                          net_pnl: float, win_rate: float, trades_cnt: int,
                          profit_factor: float, max_drawdown: float, payload_dict: dict):
        """Asynchronously queues backtest run persistence to keep backtesting thread unblocked."""
        import json
        cls.init_saved_backtests_db()
        payload_bytes = json.dumps(payload_dict).encode('utf-8')
        query = """
        INSERT INTO saved_backtests (
            id, symbol, timeframe, broker, sl_val, sl_type, rr, be_trigger_r,
            net_pnl, win_rate, trades_cnt, profit_factor, max_drawdown, payload, created_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON DUPLICATE KEY UPDATE
            symbol = VALUES(symbol),
            timeframe = VALUES(timeframe),
            broker = VALUES(broker),
            sl_val = VALUES(sl_val),
            sl_type = VALUES(sl_type),
            rr = VALUES(rr),
            be_trigger_r = VALUES(be_trigger_r),
            net_pnl = VALUES(net_pnl),
            win_rate = VALUES(win_rate),
            trades_cnt = VALUES(trades_cnt),
            profit_factor = VALUES(profit_factor),
            max_drawdown = VALUES(max_drawdown),
            payload = VALUES(payload),
            created_at = NOW()
        """
        params = (
            backtest_id, symbol, timeframe, broker, sl_val, sl_type, rr,
            be_trigger_r, net_pnl, win_rate, trades_cnt, profit_factor,
            max_drawdown, payload_bytes
        )
        cls._start_async_worker()
        cls._db_queue.put((query, params))


    @classmethod
    def get_saved_backtests(cls, symbol: str = None, timeframe: str = None) -> list:
        """Returns list of saved backtest summary metadata ordered by created_at DESC."""
        cls.init_saved_backtests_db()
        query = """
        SELECT id, symbol, timeframe, broker, sl_val, sl_type, rr, be_trigger_r,
               net_pnl, win_rate, trades_cnt, profit_factor, max_drawdown, created_at
        FROM saved_backtests
        """
        conditions = []
        params = []
        if symbol:
            conditions.append("symbol = %s")
            params.append(symbol)
        if timeframe:
            conditions.append("timeframe = %s")
            params.append(timeframe)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY created_at DESC LIMIT 500"
        try:
            rows = cls.execute_query(query, tuple(params))
            if isinstance(rows, list):
                for row in rows:
                    if 'created_at' in row and row['created_at']:
                        row['created_at'] = str(row['created_at'])
                return rows
        except Exception as e:
            print(f"[SQLHandler] Error fetching saved backtests: {e}", flush=True)
        return []

    @classmethod
    def get_saved_backtest_by_id(cls, backtest_id: str) -> dict:
        """Fetches full saved backtest run payload by ID."""
        import json
        cls.init_saved_backtests_db()
        query = "SELECT payload FROM saved_backtests WHERE id = %s"
        try:
            rows = cls.execute_query(query, (backtest_id,))
            if rows and isinstance(rows, list) and len(rows) > 0:
                raw_payload = rows[0].get('payload')
                if isinstance(raw_payload, (bytes, bytearray)):
                    return json.loads(raw_payload.decode('utf-8'))
                elif isinstance(raw_payload, str):
                    return json.loads(raw_payload)
        except Exception as e:
            print(f"[SQLHandler] Error fetching backtest payload for {backtest_id}: {e}", flush=True)
        return None

    @classmethod
    def delete_saved_backtest(cls, backtest_id: str) -> bool:
        """Deletes a saved backtest by ID."""
        cls.init_saved_backtests_db()
        query = "DELETE FROM saved_backtests WHERE id = %s"
        try:
            cls.execute_query(query, (backtest_id,))
            return True
        except Exception as e:
            print(f"[SQLHandler] Error deleting saved backtest {backtest_id}: {e}", flush=True)
            return False

    @classmethod
    def init_backtest_jobs_table(cls):
        """Creates table for async backtest jobs and progress tracking."""
        query = """
        CREATE TABLE IF NOT EXISTS backtest_jobs (
            job_id VARCHAR(128) PRIMARY KEY,
            type VARCHAR(32) NOT NULL DEFAULT 'single',
            status VARCHAR(32) NOT NULL DEFAULT 'queued',
            progress FLOAT DEFAULT 0.0,
            step_info VARCHAR(255) DEFAULT '',
            checkpoint_index INT DEFAULT 0,
            checkpoint_data LONGTEXT,
            params LONGTEXT,
            results LONGTEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
        try:
            cls.execute_query(query)
        except Exception as e:
            print(f"[SQLHandler] Error initializing backtest_jobs table: {e}", flush=True)

    @classmethod
    def create_backtest_job(cls, job_id: str, job_type: str, params: dict) -> bool:
        cls.init_backtest_jobs_table()
        query = """
        INSERT INTO backtest_jobs (job_id, type, status, progress, params)
        VALUES (%s, %s, 'queued', 0.0, %s)
        ON DUPLICATE KEY UPDATE type=VALUES(type), status='queued', progress=0.0, params=VALUES(params)
        """
        try:
            cls.execute_query(query, (job_id, job_type, json.dumps(params)))
            return True
        except Exception as e:
            print(f"[SQLHandler] Error creating backtest job {job_id}: {e}", flush=True)
            return False

    @classmethod
    def update_backtest_job_progress(cls, job_id: str, status: str = None, progress: float = None, step_info: str = None, checkpoint_index: int = None, checkpoint_data: dict = None, results: dict = None) -> bool:
        cls.init_backtest_jobs_table()
        updates = []
        params = []
        if status is not None:
            updates.append("status = %s")
            params.append(status)
        if progress is not None:
            updates.append("progress = %s")
            params.append(progress)
        if step_info is not None:
            updates.append("step_info = %s")
            params.append(step_info)
        if checkpoint_index is not None:
            updates.append("checkpoint_index = %s")
            params.append(checkpoint_index)
        if checkpoint_data is not None:
            updates.append("checkpoint_data = %s")
            params.append(json.dumps(checkpoint_data))
        if results is not None:
            updates.append("results = %s")
            params.append(json.dumps(results))

        if not updates:
            return True

        query = f"UPDATE backtest_jobs SET {', '.join(updates)} WHERE job_id = %s"
        params.append(job_id)
        try:
            cls.execute_query(query, tuple(params))
            return True
        except Exception as e:
            print(f"[SQLHandler] Error updating backtest job {job_id}: {e}", flush=True)
            return False

    @classmethod
    def get_backtest_job(cls, job_id: str) -> dict:
        cls.init_backtest_jobs_table()
        query = "SELECT * FROM backtest_jobs WHERE job_id = %s"
        try:
            rows = cls.execute_query(query, (job_id,))
            if rows and isinstance(rows, list):
                row = rows[0]
                if row.get('params') and isinstance(row['params'], str):
                    try:
                        row['params'] = json.loads(row['params'])
                    except Exception:
                        pass
                if row.get('checkpoint_data') and isinstance(row['checkpoint_data'], str):
                    try:
                        row['checkpoint_data'] = json.loads(row['checkpoint_data'])
                    except Exception:
                        pass
                if row.get('results') and isinstance(row['results'], str):
                    try:
                        row['results'] = json.loads(row['results'])
                    except Exception:
                        pass
                return row
        except Exception as e:
            print(f"[SQLHandler] Error fetching backtest job {job_id}: {e}", flush=True)
        return None

    @classmethod
    def get_unfinished_backtest_jobs(cls) -> list:
        cls.init_backtest_jobs_table()
        query = "SELECT * FROM backtest_jobs WHERE status IN ('queued', 'running', 'interrupted')"
        try:
            rows = cls.execute_query(query)
            if isinstance(rows, list):
                for row in rows:
                    if row.get('params') and isinstance(row['params'], str):
                        try:
                            row['params'] = json.loads(row['params'])
                        except Exception:
                            pass
                return rows
        except Exception as e:
            print(f"[SQLHandler] Error fetching unfinished backtest jobs: {e}", flush=True)
        return []



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

