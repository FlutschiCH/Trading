import os
import sys
from colorama import Fore, Style

def disable_quick_edit():
    """
    Disables QuickEdit mode on Windows console to prevent clicks from freezing the process.
    """
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            h_input = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                new_mode = (mode.value & ~0x0040) | 0x0080
                kernel32.SetConsoleMode(h_input, new_mode)
        except Exception:
            pass


def cleanup_all_active_workers():
    """
    Terminates all running worker processes (Live Runner & Copytrader) and removes lock files.
    """
    try:
        from live_runner_handler import LiveRunner
        LiveRunner.stop()
    except Exception:
        pass
    try:
        from copytrader_handler import CopytraderHandler
        CopytraderHandler.stop()
    except Exception:
        pass

    # Forcefully kill any active workers referenced by .worker_locks
    try:
        lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
        if os.path.exists(lock_dir):
            curr_pid = os.getpid()
            for fname in os.listdir(lock_dir):
                if fname.endswith(".lock"):
                    fpath = os.path.join(lock_dir, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                            pid_txt = f.read().strip()
                            if pid_txt.isdigit():
                                pid = int(pid_txt)
                                if pid != curr_pid:
                                    if sys.platform == "win32":
                                        os.system(f"taskkill /F /PID {pid} >nul 2>&1")
                                    else:
                                        os.kill(pid, 9)
                        os.remove(fpath)
                    except Exception:
                        pass
    except Exception:
        pass


def register_console_close_handler():
    """
    Registers Windows console close handler (X button, logoff, shutdown) and POSIX signals
    so closing app.py immediately terminates all child workers.
    """
    import atexit
    import signal

    atexit.register(cleanup_all_active_workers)

    def handle_signal(sig=None, frame=None):
        cleanup_all_active_workers()
        sys.exit(0)

    try:
        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, handle_signal)
    except Exception:
        pass

    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            PHANDLER_ROUTINE = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

            def win_console_handler(dwCtrlType):
                cleanup_all_active_workers()
                return False

            global _win_console_handler_ref
            _win_console_handler_ref = PHANDLER_ROUTINE(win_console_handler)
            ctypes.windll.kernel32.SetConsoleCtrlHandler(_win_console_handler_ref, True)
        except Exception:
            pass


def cleanup_stale_worker_locks():
    """
    Cleans up stale lock files in .worker_locks on fresh backend startup.
    If a lock references a dead PID, it is deleted immediately.
    If a process is still active from an old session, it terminates it and removes the lock.
    """
    lock_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".worker_locks")
    if not os.path.exists(lock_dir):
        return

    print(f"{Fore.CYAN}[INIT]{Style.RESET_ALL} Checking and freeing worker lock files in {lock_dir}...", flush=True)
    current_pid = os.getpid()

    def is_pid_alive(pid: int) -> bool:
        if pid <= 0 or pid == current_pid:
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

    cleaned = 0
    target_focus_cfg = "cfg_1786586458955"
    for fname in os.listdir(lock_dir):
        if fname.endswith(".lock"):
            fpath = os.path.join(lock_dir, fname)
            is_target = target_focus_cfg in fname
            try:
                pid = None
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read().strip()
                        if content.isdigit():
                            pid = int(content)
                except Exception:
                    pass

                if is_target:
                    print(f"  {Fore.YELLOW}>>> [DEBUG FOCUS]{Style.RESET_ALL} Found target lock file: {fname} (PID in lock: {pid})", flush=True)

                if pid and is_pid_alive(pid):
                    try:
                        if sys.platform == "win32":
                            os.system(f"taskkill /F /PID {pid} >nul 2>&1")
                        else:
                            os.kill(pid, 9)
                        print(f"  {Fore.YELLOW}•{Style.RESET_ALL} Terminated leftover worker PID {pid} ({fname})", flush=True)
                    except Exception:
                        pass

                try:
                    os.remove(fpath)
                    cleaned += 1
                    if is_target:
                        print(f"  {Fore.GREEN}>>> [DEBUG FOCUS] CLEARED target lock file: {fname} at startup!{Style.RESET_ALL}", flush=True)
                except Exception as rem_err:
                    if is_target:
                        print(f"  {Fore.RED}>>> [DEBUG FOCUS] Failed to remove lock file {fname}: {rem_err}{Style.RESET_ALL}", flush=True)
            except Exception:
                pass

    if cleaned > 0:
        print(f"  {Fore.GREEN}✓{Style.RESET_ALL} Cleaned {cleaned} stale worker lock(s)", flush=True)
