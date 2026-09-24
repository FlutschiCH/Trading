import os
import sys
import json
import time
import argparse
import signal
import socket
from datetime import datetime
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

# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from account_handler import AccountHandler
from symbol_mapping_handler import SymbolMappingHandler
from copytrader_handler import CopytraderHandler


class CopytraderWorker:
    def __init__(self, sync_interval: float = 1.0):
        self.sync_interval = sync_interval
        self.lock_file = None
        self.running = True
        self.current_host = socket.gethostname().strip().lower()
        self._acquire_instance_lock()

    def _acquire_instance_lock(self):
        """
        Ensures only one CopytraderWorker process runs on this machine at any time.
        If another instance is already running, this process exits immediately.
        """
        lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
        os.makedirs(lock_dir, exist_ok=True)
        lock_path = os.path.join(lock_dir, "copytrader_worker.lock")

        try:
            self.lock_file = open(lock_path, "w+")
            if sys.platform == "win32":
                import msvcrt
                try:
                    msvcrt.locking(self.lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                except (IOError, OSError):
                    print(f"{Fore.YELLOW}[CopytraderWorker Duplicate Check]{Style.RESET_ALL} Copytrader worker is already running in another process. Exiting...", flush=True)
                    self.lock_file.close()
                    sys.exit(0)
            else:
                import fcntl
                try:
                    fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except (IOError, OSError):
                    print(f"{Fore.YELLOW}[CopytraderWorker Duplicate Check]{Style.RESET_ALL} Copytrader worker is already running in another process. Exiting...", flush=True)
                    self.lock_file.close()
                    sys.exit(0)

            # Record current PID inside the lock file
            self.lock_file.seek(0)
            self.lock_file.truncate()
            self.lock_file.write(str(os.getpid()))
            self.lock_file.flush()

        except Exception as ex:
            print(f"{Fore.RED}[CopytraderWorker Lock Error]{Style.RESET_ALL} Failed to check/acquire lock: {ex}", flush=True)

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
            print(f"\n{Fore.YELLOW}[CopytraderWorker]{Style.RESET_ALL} OS exit signal received. Stopping Copytrader worker...", flush=True)
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

    def print_startup_banner(self, active_configs: list, all_configs_count: int, total_slaves: int):
        """
        Prints formatted startup banner with active configurations, accounts, and symbol routing.
        """
        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.kernel32.SetConsoleTitleW(f"Copytrader Engine | Host: {self.current_host} | Active: {len(active_configs)}")
            except Exception:
                pass

        print(f"\n{Fore.CYAN}{Style.BRIGHT}{'='*65}", flush=True)
        print(f"{Fore.CYAN}{Style.BRIGHT}  🚀 COPYTRADER ENGINE WORKER INITIALIZED", flush=True)
        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*65}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}• Host Machine            :{Style.RESET_ALL} {Style.BRIGHT}{self.current_host}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}• Worker Process PID      :{Style.RESET_ALL} {Style.BRIGHT}{os.getpid()}{Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}• Sync Polling Interval   :{Style.RESET_ALL} {self.sync_interval}s", flush=True)
        print(f"  {Fore.WHITE}• QuickEdit Status        :{Style.RESET_ALL} {Fore.GREEN}Disabled (Safe Mode){Style.RESET_ALL}", flush=True)
        print(f"  {Fore.WHITE}• DB Setups Total         :{Style.RESET_ALL} {all_configs_count} (Active for this host: {Fore.GREEN}{len(active_configs)}{Style.RESET_ALL})", flush=True)
        print(f"  {Fore.WHITE}• Total Active Slaves     :{Style.RESET_ALL} {Fore.GREEN}{total_slaves}{Style.RESET_ALL}", flush=True)
        print(f"{Fore.CYAN}{Style.BRIGHT}{'-'*65}{Style.RESET_ALL}", flush=True)

        if not active_configs:
            print(f"  {Fore.YELLOW}⚠️ No active copytrader configurations assigned to this host machine.{Style.RESET_ALL}", flush=True)
        else:
            for idx, cfg in enumerate(active_configs, start=1):
                cfg_id = cfg.get("id")
                cfg_name = cfg.get("name", f"Config #{idx}")
                m_acc = cfg.get("master_account", "Unknown")
                m_brk = str(cfg.get("master_broker", "metatrader")).upper()
                target_comp = cfg.get("target_computer", "All")
                symbols = cfg.get("symbols", "All")
                slaves = [s for s in cfg.get("slaves", []) if s.get("status") != "paused"]

                print(f"  [{idx}] {Fore.YELLOW}{Style.BRIGHT}{cfg_name}{Style.RESET_ALL} (ID: `{cfg_id}`)", flush=True)
                print(f"      • Routing    : Host: {Fore.MAGENTA}{target_comp}{Style.RESET_ALL} | Symbols: {Fore.MAGENTA}{symbols}{Style.RESET_ALL}", flush=True)
                print(f"      • Master     : {Fore.GREEN}{m_acc}{Style.RESET_ALL} [{m_brk}]", flush=True)

                if not slaves:
                    print(f"      • Slaves     : {Fore.RED}None active{Style.RESET_ALL}", flush=True)
                else:
                    for s in slaves:
                        s_acc = s.get("account_id", "Unknown")
                        s_brk = str(s.get("broker", "metatrader")).upper()
                        mode = s.get("mode", "direct")
                        mult = s.get("multiplier", 1.0)
                        s_syms = s.get("symbols", "All")
                        sizing_str = f"{mode} (x{mult})" if mode in ("multiplier", "divider") else mode
                        print(f"      └── ➜ Slave: {Fore.CYAN}{s_acc}{Style.RESET_ALL} [{s_brk}] | Sizing: {sizing_str} | Symbols: {s_syms}", flush=True)

        print(f"{Fore.CYAN}{Style.BRIGHT}{'='*65}\n{Style.RESET_ALL}", flush=True)

    def run(self):
        self._register_system_exit_handlers()

        # Initialize databases and in-memory caches
        try:
            AccountHandler._ensure_cache_loaded()
            SymbolMappingHandler._ensure_cache_loaded()
            CopytraderHandler._ensure_cache_loaded()
        except Exception as init_err:
            print(f"{Fore.RED}[CopytraderWorker Init Error]{Style.RESET_ALL} Failed to load caches: {init_err}", flush=True)

        all_configs = CopytraderHandler.get_all_configs()
        active_configs = []
        total_slaves = 0

        for cfg in all_configs:
            if cfg.get("status") != "active":
                continue
            target_comp = str(cfg.get("target_computer", "All")).strip().lower()
            if target_comp != "all" and target_comp != self.current_host:
                continue
            active_configs.append(cfg)
            slaves = cfg.get("slaves", [])
            active_slaves = [s for s in slaves if s.get("status") != "paused"]
            total_slaves += len(active_slaves)

        # Pre-connect active master and slave broker instances
        for cfg in active_configs:
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
        self.print_startup_banner(active_configs, len(all_configs), total_slaves)

        # Continuous Sync Loop
        last_banner_refresh = time.time()
        while self.running:
            try:
                CopytraderHandler.sync_once()
            except Exception as loop_err:
                print(f"{Fore.RED}[CopytraderWorker Loop Exception]{Style.RESET_ALL} {loop_err}", flush=True)

            time.sleep(self.sync_interval)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Copytrader Worker Process")
    parser.add_argument('--quickedit', action='store_true', default=False, help="Enable Windows Console QuickEdit mode for debugging")
    parser.add_argument('--interval', type=float, default=1.0, help="Sync interval in seconds (default: 1.0)")
    args = parser.parse_args()

    # Disable QuickEdit immediately unless explicitly forced
    set_console_quick_edit(args.quickedit)

    try:
        worker = CopytraderWorker(sync_interval=args.interval)
        worker.run()
    except Exception as e:
        # Re-enable QuickEdit upon fatal error so user can inspect and select text
        set_console_quick_edit(True)
        print(f"\n{Fore.RED}{Style.BRIGHT}{'='*70}", flush=True)
        print(f"{Fore.RED}{Style.BRIGHT}  ❌ COPYTRADER WORKER FATAL ERROR", flush=True)
        print(f"{Fore.RED}{Style.BRIGHT}{'='*70}{Style.RESET_ALL}", flush=True)
        print(f"\n{Fore.RED}[CopytraderWorker Fatal Error]{Style.RESET_ALL} Unhandled exception in copytrader worker: {e}", flush=True)
        import traceback
        traceback.print_exc()
        print(f"\n{Fore.YELLOW}[CopytraderWorker]{Style.RESET_ALL} QuickEdit enabled. Press Enter to exit...", flush=True)
        try:
            input()
        except Exception:
            pass
        sys.exit(1)
