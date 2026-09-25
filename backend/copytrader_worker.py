import os
import sys
import json
import time
import argparse
import signal
import socket
import io
from datetime import datetime

# Ensure stdout and stderr handle UTF-8 on Windows without crashing on non-ASCII characters
if sys.platform == "win32":
    try:
        if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from colorama import init, Fore, Style
init(autoreset=True)

def set_console_quick_edit(enabled: bool):
    """
    Enable or disable Windows Console QuickEdit mode.
    Disabling QuickEdit mode prevents accidental mouse clicks in the console window
    from suspending process execution and output streams.
    """
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            h_input = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                if enabled:
                    new_mode = (mode.value | 0x0040 | 0x0010) | 0x0080
                else:
                    new_mode = (mode.value & ~0x0040 & ~0x0010) | 0x0080
                kernel32.SetConsoleMode(h_input, new_mode)
        except Exception:
            pass


def pause_and_exit(exit_code: int = 0, message: str = "Window will close automatically in 60 seconds (or press Enter)...", timeout: int = 60):
    """
    Ensures the console stays open after shutdown or errors so the user can inspect output,
    with a countdown delay matching backtest_worker.py and QuickEdit enabled for easy copying.
    """
    set_console_quick_edit(True)
    prefix_color = Fore.GREEN if exit_code == 0 else Fore.YELLOW
    print(f"\n{prefix_color}[CopytraderWorker]{Style.RESET_ALL} {message}", flush=True)
    try:
        if sys.platform == "win32":
            import msvcrt
            start_wait = time.time()
            while time.time() - start_wait < timeout:
                if msvcrt.kbhit():
                    ch = msvcrt.getch()
                    if ch in (b'\r', b'\n'):
                        break
                time.sleep(0.5)
        else:
            time.sleep(timeout)
    except Exception:
        time.sleep(timeout)
    sys.exit(exit_code)


# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from account_handler import AccountHandler
from symbol_mapping_handler import SymbolMappingHandler
from copytrader_handler import CopytraderHandler


def is_process_running(pid: int) -> bool:
    """
    Checks if a process with the given PID is currently active.
    """
    if not pid or pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            import ctypes
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            SYNCHRONIZE = 0x00100000
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, int(pid))
            if not handle:
                return False
            exit_code = ctypes.c_ulong()
            kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
            kernel32.CloseHandle(handle)
            return exit_code.value == 259  # STILL_ACTIVE
        except Exception:
            return False
    else:
        try:
            os.kill(int(pid), 0)
            return True
        except (OSError, ProcessLookupError):
            return False


class CopytraderWorker:
    def __init__(self, config_id: str, sync_interval: float = 1.0):
        self.config_id = str(config_id)
        self.sync_interval = sync_interval
        self.lock_file = None
        self.running = True
        self.current_host = socket.gethostname().strip().lower()
        self._acquire_instance_lock()

    def _acquire_instance_lock(self):
        """
        Ensures only one CopytraderWorker process runs for this configuration ID at any time.
        If another active instance is running, this process halts and exits.
        If a lock file exists but the holding process is dead or invalid, the stale lock is removed.
        """
        lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
        os.makedirs(lock_dir, exist_ok=True)
        lock_path = os.path.join(lock_dir, f"copytrader_worker_{self.config_id}.lock")

        # 1. Read existing PID if present and check if it's currently running
        if os.path.exists(lock_path):
            existing_pid = None
            try:
                with open(lock_path, "r") as existing_f:
                    raw_pid = existing_f.read().strip()
                    if raw_pid and raw_pid.isdigit():
                        existing_pid = int(raw_pid)
            except Exception:
                pass

            if existing_pid and existing_pid != os.getpid():
                if is_process_running(existing_pid):
                    print(f"{Fore.YELLOW}[CopytraderWorker Duplicate Check]{Style.RESET_ALL} Worker for config '{self.config_id}' is already actively running in PID {existing_pid}.", flush=True)
                    pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
                else:
                    # Previous process terminated without cleaning up lock file
                    try:
                        os.remove(lock_path)
                    except Exception:
                        pass

        # 2. Acquire file-descriptor level lock
        try:
            self.lock_file = open(lock_path, "a+")
            self.lock_file.seek(0)
            if sys.platform == "win32":
                import msvcrt
                try:
                    msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                except (IOError, OSError):
                    # Check if file has active PID before assuming duplicate
                    existing_pid = None
                    try:
                        self.lock_file.seek(0)
                        pid_txt = self.lock_file.read().strip()
                        if pid_txt.isdigit():
                            existing_pid = int(pid_txt)
                    except Exception:
                        pass

                    if existing_pid and is_process_running(existing_pid):
                        print(f"{Fore.YELLOW}[CopytraderWorker Duplicate Check]{Style.RESET_ALL} Worker for config '{self.config_id}' is actively running in PID {existing_pid}.", flush=True)
                        self.lock_file.close()
                        pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
                    elif existing_pid and not is_process_running(existing_pid):
                        # The PID in the lock file is definitely not running; force-recover
                        print(f"{Fore.YELLOW}[CopytraderWorker Lock Notice]{Style.RESET_ALL} Previous PID {existing_pid} is no longer running. Recovering lock for config '{self.config_id}'...", flush=True)
                        self.lock_file.close()
                        try:
                            os.remove(lock_path)
                        except Exception:
                            pass
                        self.lock_file = open(lock_path, "w+")
                        try:
                            msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                        except Exception:
                            pass
                    else:
                        print(f"{Fore.YELLOW}[CopytraderWorker Duplicate Check]{Style.RESET_ALL} Worker for config '{self.config_id}' is locked by another process.", flush=True)
                        self.lock_file.close()
                        pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
            else:
                import fcntl
                try:
                    fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except (IOError, OSError):
                    print(f"{Fore.YELLOW}[CopytraderWorker Duplicate Check]{Style.RESET_ALL} Worker for config '{self.config_id}' is already running in another process.", flush=True)
                    self.lock_file.close()
                    pause_and_exit(0, "Duplicate worker detected. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)

            # Record current PID inside the lock file
            self.lock_file.seek(0)
            self.lock_file.truncate()
            self.lock_file.write(str(os.getpid()))
            self.lock_file.flush()

        except Exception as ex:
            set_console_quick_edit(True)
            print(f"{Fore.RED}[CopytraderWorker Lock Error]{Style.RESET_ALL} Failed to check/acquire lock for config {self.config_id}: {ex}", flush=True)

    def _release_instance_lock(self):
        """
        Releases the single-instance lock upon exit.
        """
        if self.lock_file:
            try:
                if sys.platform == "win32":
                    import msvcrt
                    try:
                        self.lock_file.seek(0)
                        msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                    except Exception:
                        pass
                else:
                    import fcntl
                    try:
                        fcntl.flock(self.lock_file, fcntl.LOCK_UN)
                    except Exception:
                        pass
                self.lock_file.close()
            except Exception:
                pass
            self.lock_file = None

    def _register_system_exit_handlers(self):
        """
        Registers OS-level process signal handlers (SIGINT, SIGTERM, SIGBREAK)
        and Windows console close events to ensure clean worker shutdown and lock release.
        """
        def handle_exit(sig=None, frame=None):
            print(f"\n{Fore.YELLOW}[CopytraderWorker]{Style.RESET_ALL} OS exit signal received. Stopping worker for config {self.config_id}...", flush=True)
            self.running = False
            self._release_instance_lock()
            sys.exit(0)

        # OS Process Signals (Ctrl+C, kill/terminate, break)
        try:
            signal.signal(signal.SIGINT, handle_exit)
            signal.signal(signal.SIGTERM, handle_exit)
            if hasattr(signal, 'SIGBREAK'):
                signal.signal(signal.SIGBREAK, handle_exit)
        except Exception:
            pass

        # Windows Console Close Event Handler (closing terminal window or session)
        if sys.platform == "win32":
            try:
                import ctypes
                from ctypes import wintypes
                PHANDLER_ROUTINE = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

                def win_ctrl_handler(ctrl_type):
                    print(f"\n{Fore.YELLOW}[CopytraderWorker]{Style.RESET_ALL} Received console close signal ({ctrl_type}). Exiting...", flush=True)
                    self.running = False
                    self._release_instance_lock()
                    sys.exit(0)

                global _win_ctrl_handler_ref
                _win_ctrl_handler_ref = PHANDLER_ROUTINE(win_ctrl_handler)
                ctypes.windll.kernel32.SetConsoleCtrlHandler(_win_ctrl_handler_ref, True)
            except Exception as ex:
                print(f"[CopytraderWorker] Console handler note: {ex}", flush=True)

    def print_startup_banner(self, cfg: dict):
        """
        Prints formatted startup banner with configuration details, accounts, and symbol routing.
        """
        cfg_name = cfg.get("name") or f"Config {self.config_id}"
        m_acc = cfg.get("master_account", "Unknown")
        m_brk = str(cfg.get("master_broker", "metatrader")).upper()
        target_comp = cfg.get("target_computer", "All")
        symbols = cfg.get("symbols", "All")
        slaves = [s for s in cfg.get("slaves", []) if s.get("status") != "paused"]

        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.kernel32.SetConsoleTitleW(f"Copytrader: {cfg_name} | Master: {m_acc} [{m_brk}]")
            except Exception:
                pass

        print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*65}", flush=True)
        print(f"{Fore.CYAN}{Style.BRIGHT}  [*] COPYTRADER ENGINE WORKER INITIALIZED", flush=True)
        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*65}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}* Configuration Name      :{Style.RESET_ALL} {Style.BRIGHT}{cfg_name}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}* Configuration ID        :{Style.RESET_ALL} {Style.BRIGHT}{self.config_id}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}* Host Machine            :{Style.RESET_ALL} {self.current_host} (Target: {Fore.MAGENTA}{target_comp}{Style.RESET_ALL})", flush=True)
        print(f"  {Fore.WHITE}* Worker Process PID      :{Style.RESET_ALL} {os.getpid()}", flush=True)
        print(f"  {Fore.WHITE}* Sync Polling Interval   :{Style.RESET_ALL} {self.sync_interval}s", flush=True)
        print(f"  {Fore.WHITE}* QuickEdit Status        :{Style.RESET_ALL} {Fore.GREEN}Disabled (Safe Mode){Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}* Master Account          :{Style.RESET_ALL} {Fore.GREEN}{m_acc}{Style.RESET_ALL} [{m_brk}]", flush=True)
        print(f"  {Fore.WHITE}* Allowed Symbols         :{Style.RESET_ALL} {Fore.YELLOW}{symbols}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}* Slaves Connected ({len(slaves)})   :{Style.RESET_ALL}", flush=True)

        if not slaves:
            print(f"      {Fore.RED}None active{Style.RESET_ALL}", flush=True)
        else:
            for s in slaves:
                s_acc = s.get("account_id", "Unknown")
                s_brk = str(s.get("broker", "metatrader")).upper()
                mode = s.get("mode", "direct")
                mult = s.get("multiplier", 1.0)
                s_syms = s.get("symbols", "All")
                sizing_str = f"{mode} (x{mult})" if mode in ("multiplier", "divider") else mode
                print(f"      |-- -> Slave: {Fore.CYAN}{s_acc}{Style.RESET_ALL} [{s_brk}] | Sizing: {sizing_str} | Symbols: {s_syms}", flush=True)

        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*65}\n{Style.RESET_ALL}", flush=True)

    def run(self):
        self._register_system_exit_handlers()

        # Initialize databases and in-memory caches
        try:
            AccountHandler._ensure_cache_loaded()
            SymbolMappingHandler._ensure_cache_loaded()
            CopytraderHandler._ensure_cache_loaded()
        except Exception as init_err:
            set_console_quick_edit(True)
            print(f"{Fore.RED}[CopytraderWorker Init Error]{Style.RESET_ALL} Failed to load caches: {init_err}", flush=True)

        cfg = CopytraderHandler.get_config(self.config_id)
        if not cfg:
            set_console_quick_edit(True)
            print(f"{Fore.RED}[CopytraderWorker Error]{Style.RESET_ALL} Configuration '{self.config_id}' not found in database.", flush=True)
            self._release_instance_lock()
            pause_and_exit(1, "Configuration not found. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)

        # Pre-connect master and slave broker instances
        master_acc = cfg.get("master_account")
        master_brk = cfg.get("master_broker", "metatrader")
        if master_acc:
            CopytraderHandler._ensure_account_connected(master_acc, master_brk)

        for slave in cfg.get("slaves", []):
            if slave.get("status") != "paused":
                s_acc = slave.get("account_id")
                s_brk = slave.get("broker", "metatrader")
                if s_acc:
                    CopytraderHandler._ensure_account_connected(s_acc, s_brk)

        # Print the startup banner
        self.print_startup_banner(cfg)

        # Continuous Sync Loop
        while self.running:
            try:
                # Reload config from memory cache to pick up dynamic changes or pause status
                current_cfg = CopytraderHandler.get_config(self.config_id)
                if not current_cfg or current_cfg.get("status") != "active":
                    print(f"{Fore.YELLOW}[CopytraderWorker]{Style.RESET_ALL} Config {self.config_id} is no longer active (status='{current_cfg.get('status') if current_cfg else 'deleted'}'). Exiting worker...", flush=True)
                    break

                CopytraderHandler.sync_config(current_cfg)
            except Exception as loop_err:
                set_console_quick_edit(True)
                print(f"{Fore.RED}[CopytraderWorker Loop Exception]{Style.RESET_ALL} {loop_err}", flush=True)

            # Use 4.0s interval if Binance is involved, otherwise standard sync_interval
            interval = self.sync_interval
            has_binance = "binance" in str(current_cfg.get("master_broker", "")).lower() or any(
                "binance" in str(s.get("broker", "")).lower() for s in (current_cfg.get("slaves") or [])
            )
            if has_binance and interval < 4.0:
                interval = 4.0

            time.sleep(interval)

        self._release_instance_lock()




if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Dedicated Copytrader Worker Process")
    parser.add_argument('--config_id', type=str, required=True, help="Copytrader configuration ID to run")
    parser.add_argument('--quickedit', action='store_true', default=False, help="Enable Windows Console QuickEdit mode for debugging")
    parser.add_argument('--interval', type=float, default=1.0, help="Sync interval in seconds (default: 1.0)")
    args = parser.parse_args()

    # Disable QuickEdit immediately unless explicitly forced
    set_console_quick_edit(args.quickedit)

    try:
        worker = CopytraderWorker(config_id=args.config_id, sync_interval=args.interval)
        worker.run()
        pause_and_exit(0, "Worker stopped. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
    except Exception as e:
        # Re-enable QuickEdit upon fatal error so user can inspect and select text
        set_console_quick_edit(True)
        print(f"\n{Fore.RED}{Style.BRIGHT}{'='*70}", flush=True)
        print(f"{Fore.RED}{Style.BRIGHT}  [!] COPYTRADER WORKER FATAL ERROR", flush=True)
        print(f"{Fore.RED}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}", flush=True)
        print(f"\n{Fore.RED}[CopytraderWorker Fatal Error]{Style.RESET_ALL} Unhandled exception in copytrader worker for config {args.config_id}: {e}", flush=True)
        import traceback
        traceback.print_exc()
        pause_and_exit(1, "QuickEdit enabled. Window will close automatically in 60 seconds (or press Enter)...", timeout=60)
