import os
import sys
import time
import socket
import threading
import subprocess
from datetime import datetime
from live_strategy_handler import LiveStrategyHandler
from logger_handler import logPrint


def calculate_date_bounds(option: str, custom_from: str = None, custom_to: str = None):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    
    if option == 'last_candles':
        return None, None
        
    if option == 'this_week':
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp()), int(now.timestamp())
        
    if option == 'last_week':
        this_week_start = now - timedelta(days=now.weekday())
        this_week_start = this_week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        start = this_week_start - timedelta(days=7)
        return int(start.timestamp()), int(this_week_start.timestamp())
        
    if option == 'this_month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp()), int(now.timestamp())
        
    if option == 'last_month':
        first_day_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_day_last_month = first_day_this_month - timedelta(seconds=1)
        start = last_day_last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return int(start.timestamp()), int(last_day_last_month.timestamp())
        
    if option == 'custom' and custom_from and custom_to:
        try:
            def parse_dt(s):
                s = s.replace('Z', '').split('.')[0]
                for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                    try:
                        dt = datetime.strptime(s, fmt)
                        return dt.replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                raise ValueError(f"Unknown format: {s}")
            start = parse_dt(custom_from)
            end = parse_dt(custom_to)
            return int(start.timestamp()), int(end.timestamp())
        except Exception as e:
            print(f"Error parsing custom dates: {e}", flush=True)
            
    if option == 'from_start_date' and custom_from:
        try:
            def parse_dt(s):
                s = s.replace('Z', '').split('.')[0]
                for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                    try:
                        dt = datetime.strptime(s, fmt)
                        return dt.replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                raise ValueError(f"Unknown format: {s}")
            start = parse_dt(custom_from)
            return int(start.timestamp()), None
        except Exception as e:
            print(f"Error parsing custom from date: {e}", flush=True)
            
    return None, None


class LiveRunner:
    """
    Supervisor & Watchdog for standalone Live Strategy Workers.
    Manages spawning, tracking, and restarting dedicated live_worker.py processes.
    """
    _thread = None
    _stop_event = threading.Event()
    _workers = {}  # {strategy_id: subprocess.Popen}
    _worker_heartbeats = {}  # {strategy_id: timestamp}
    _lock = threading.Lock()

    # In-memory caches kept for UI compatibility
    _candles_cache = {}
    _trades_cache = {}

    @classmethod
    def start(cls):
        if cls._thread and cls._thread.is_alive():
            print("[Live Runner Supervisor] Already running.", flush=True)
            return
        cls._stop_event.clear()
        cls._thread = threading.Thread(target=cls._supervisor_loop, daemon=True)
        cls._thread.start()
        logPrint("Started Live Runner Supervisor thread.", category="LiveRunner", level="INFO")

    @classmethod
    def stop(cls):
        cls._stop_event.set()
        with cls._lock:
            for s_id, proc in list(cls._workers.items()):
                cls._terminate_process(s_id, proc)
            cls._workers.clear()
        if cls._thread:
            cls._thread.join(timeout=5)
        logPrint("Stopped Live Runner Supervisor thread.", category="LiveRunner", level="INFO")

    @classmethod
    def record_heartbeat(cls, strategy_id: str, pid: int = None, status_msg: str = None):
        cls._worker_heartbeats[strategy_id] = time.time()

    @classmethod
    def _terminate_process(cls, strategy_id: str, proc: subprocess.Popen):
        try:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except Exception:
                    proc.kill()
        except Exception as ex:
            print(f"[Live Runner Supervisor] Error terminating worker for {strategy_id}: {ex}", flush=True)

    @classmethod
    def spawn_worker(cls, strategy_id: str):
        with cls._lock:
            existing_proc = cls._workers.get(strategy_id)
            if existing_proc and existing_proc.poll() is None:
                return existing_proc

            python_exe = sys.executable
            worker_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "live_worker.py")
            cmd = [python_exe, worker_script, "--strategy_id", str(strategy_id)]

            try:
                if sys.platform == "win32":
                    CREATE_NEW_CONSOLE = 0x00000010
                    proc = subprocess.Popen(
                        cmd,
                        creationflags=CREATE_NEW_CONSOLE,
                        cwd=os.path.dirname(os.path.abspath(__file__))
                    )
                else:
                    proc = subprocess.Popen(
                        cmd,
                        cwd=os.path.dirname(os.path.abspath(__file__))
                    )
                cls._workers[strategy_id] = proc
                cls._worker_heartbeats[strategy_id] = time.time()
                print(f"[Live Runner Supervisor] Spawned worker for strategy {strategy_id} (PID: {proc.pid})", flush=True)
                return proc
            except Exception as ex:
                print(f"[Live Runner Supervisor] Failed to spawn worker for strategy {strategy_id}: {ex}", flush=True)
                return None

    @classmethod
    def stop_worker(cls, strategy_id: str):
        with cls._lock:
            proc = cls._workers.pop(strategy_id, None)
            if proc:
                cls._terminate_process(strategy_id, proc)
                print(f"[Live Runner Supervisor] Stopped worker for strategy {strategy_id}", flush=True)

    @classmethod
    def _supervisor_loop(cls):
        while not cls._stop_event.is_set():
            try:
                try:
                    comp_name = socket.gethostname().strip().lower()
                except Exception:
                    comp_name = "unknown"

                strategies = LiveStrategyHandler.get_all_strategies()
                active_strategies = []
                for s in strategies:
                    if s.get("status") == "active":
                        target = s.get("target_computer", "All")
                        if target == "All" or target.strip().lower() == comp_name:
                            active_strategies.append(s)

                active_ids = {s["id"] for s in active_strategies}

                # 1. Stop workers for strategies that are no longer active
                with cls._lock:
                    for s_id in list(cls._workers.keys()):
                        if s_id not in active_ids:
                            proc = cls._workers.pop(s_id, None)
                            if proc:
                                cls._terminate_process(s_id, proc)

                # 2. Check health and spawn/recover active workers
                for strategy in active_strategies:
                    if cls._stop_event.is_set():
                        break
                    s_id = strategy["id"]
                    proc = cls._workers.get(s_id)
                    is_dead = proc is None or proc.poll() is not None

                    if is_dead:
                        print(f"[Live Runner Supervisor] Worker for active strategy {s_id} is not running. Spawning...", flush=True)
                        cls.spawn_worker(s_id)

            except Exception as e:
                logPrint(f"Error in Live Runner supervisor loop: {e}", category="LiveRunner", level="ERROR")

            # Check every 10 seconds
            cls._stop_event.wait(10)


if __name__ == '__main__':
    strategies = LiveStrategyHandler.get_all_strategies()
    active_strategies = [s for s in strategies if s.get("status") == "active"]
    print(f"[Supervisor Test] Active strategies count: {len(active_strategies)}")
    LiveRunner.start()
    time.sleep(30)
    LiveRunner.stop()
