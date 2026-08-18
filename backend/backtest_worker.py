import os
import sys
import json
import time
import argparse
import signal
import atexit
from colorama import init, Fore, Style
init(autoreset=True)

def disable_quick_edit():
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

disable_quick_edit()

# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from strategy_handler import StrategyHandler
from broker_handler import BrokerHandler

def run_worker(job_id: str, is_resume: bool = False):
    print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Starting worker for job_id={job_id} (resume={is_resume})", flush=True)
    job = SQLHandler.get_backtest_job(job_id)
    if not job:
        print(f"{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Job {job_id} not found in database.", flush=True)
        sys.exit(1)

    params = job.get('params', {})
    job_type = job.get('type', 'single')

    symbols = params.get('symbols') or [params.get('symbol', 'BTCUSD')]
    timeframes = params.get('timeframes') or [params.get('timeframe') or params.get('interval', '15m')]

    if job_type == 'single':
        total_jobs = 1
    else:
        # Calculate RR steps
        rr_s = float(params.get('rrStart', 1.0))
        rr_e = float(params.get('rrEnd', 5.0))
        rr_st = float(params.get('rrStep', 0.5))
        rr_cnt = max(1, int(round((rr_e - rr_s) / rr_st)) + 1)

        # Calculate SL steps
        if params.get('slRangeMode') and params.get('slStart') is not None and params.get('slEnd') is not None and params.get('slStep'):
            sl_cnt = max(1, int(round((float(params['slEnd']) - float(params['slStart'])) / float(params['slStep']))) + 1)
        else:
            sl_cnt = 1

        # Calculate BE steps
        if params.get('useBreakEven') and params.get('beRangeMode') and params.get('beStart') is not None and params.get('beEnd') is not None and params.get('beStep'):
            be_cnt = max(1, int(round((float(params['beEnd']) - float(params['beStart'])) / float(params['beStep']))) + 1)
        else:
            be_cnt = 1

        total_jobs = len(symbols) * len(timeframes) * sl_cnt * rr_cnt * be_cnt

    est_sec = total_jobs * 10
    if est_sec < 60:
        est_time_str = f"{est_sec} seconds"
    elif est_sec < 3600:
        est_time_str = f"{est_sec // 60}m {est_sec % 60}s"
    else:
        est_time_str = f"{est_sec // 3600}h {(est_sec % 3600) // 60}m {est_sec % 60}s"

    symbols_str = ", ".join(symbols)
    tf_str = ", ".join(timeframes)
    print(f"{Fore.CYAN}[BacktestWorker Target]{Style.RESET_ALL} Symbols ({len(symbols)}): [{symbols_str}] | Timeframes ({len(timeframes)}): [{tf_str}] | Type: '{job_type}'", flush=True)
    print(f"{Fore.CYAN}[BacktestWorker Plan]{Style.RESET_ALL} Total Combos: {total_jobs} | Estimated Runtime (~10s/job): {est_time_str}", flush=True)
    SQLHandler.update_backtest_job_progress(job_id, status='running', progress=5.0, step_info='Fetching candles from broker...')

    def handle_exit_signal(sig=None, frame=None):
        print(f"\n{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Worker window closed/terminated for job {job_id}. Updating status to cancelled...", flush=True)
        try:
            SQLHandler.update_backtest_job_progress(job_id, status='cancelled', step_info='Worker window closed by user (X clicked)')
        except Exception:
            pass
        sys.exit(0)

    # Register OS signal handlers (SIGINT, SIGTERM, SIGBREAK)
    try:
        signal.signal(signal.SIGINT, handle_exit_signal)
        signal.signal(signal.SIGTERM, handle_exit_signal)
        if hasattr(signal, 'SIGBREAK'):
            signal.signal(signal.SIGBREAK, handle_exit_signal)
    except Exception:
        pass

    # Windows specific console close handler (X button)
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            PHANDLER_ROUTINE = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

            def win_ctrl_handler(ctrl_type):
                # 0: CTRL_C_EVENT, 1: CTRL_BREAK_EVENT, 2: CTRL_CLOSE_EVENT, 5: CTRL_LOGOFF_EVENT, 6: CTRL_SHUTDOWN_EVENT
                print(f"\n{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Received console signal {ctrl_type} (X closed). Cancelling & deleting job {job_id}...", flush=True)
                try:
                    SQLHandler.update_backtest_job_progress(job_id, status='cancelled', step_info='Worker window closed by user (X clicked)')
                    SQLHandler.delete_backtest_job(job_id)
                except Exception as ex:
                    print(f"Error handling console close: {ex}", flush=True)
                return True

            global _win_ctrl_handler_ref
            _win_ctrl_handler_ref = PHANDLER_ROUTINE(win_ctrl_handler)
            ctypes.windll.kernel32.SetConsoleCtrlHandler(_win_ctrl_handler_ref, True)
        except Exception as err:
            print(f"[BacktestWorker] Console handler setup notice: {err}", flush=True)

    def check_cancelled():
        current_job = SQLHandler.get_backtest_job(job_id)
        if current_job and current_job.get('status') == 'cancelled':
            return True
        return False

    import urllib.request

    def send_local_update(progress: float = None, status: str = None, step_info: str = None, results: dict = None, est_sec: int = None):
        try:
            port = int(os.environ.get("PORT", 8080))
            url = f"http://127.0.0.1:{port}/api/backtest/internal-update"
            payload = {"job_id": str(job_id)}
            if progress is not None:
                payload["progress"] = float(progress)
            if status is not None:
                payload["status"] = status
            if step_info is not None:
                payload["step_info"] = step_info
            if results is not None:
                payload["results"] = results
            if est_sec is not None:
                payload["estimated_seconds_remaining"] = est_sec

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=1):
                pass
        except Exception:
            pass

    last_progress_update = 0.0

    def progress_cb(pct):
        nonlocal last_progress_update
        try:
            val = float(pct)
            if val - last_progress_update >= 2.0 or val >= 100.0:
                last_progress_update = val
                send_local_update(progress=val, status='running', step_info=f"Running strategy analysis ({int(val)}%)...")
        except Exception:
            pass

    try:
        symbol = params.get('symbol', 'BTCUSD')
        candle_source = params.get('candleSource') or params.get('broker', 'metatrader')
        timeframe = params.get('timeframe') or params.get('interval', '15m')
        limit = int(params.get('limit', 1000))
        date_from = params.get('date_from') or params.get('dateFrom')
        date_to = params.get('date_to') or params.get('dateTo')

        account_id = params.get('account_id') or params.get('account') or params.get('login')
        if not account_id and candle_source == 'metatrader':
            try:
                from account_handler import AccountHandler
                active_acc = AccountHandler.get_active_account()
                if active_acc:
                    account_id = active_acc.get('account_id')
            except Exception:
                pass

        print(f"{Fore.CYAN}[BacktestWorker Data]{Style.RESET_ALL} Fetching candles for '{symbol}' ({timeframe}) | Source: '{candle_source}' | Account: '{account_id}' | Limit: {limit} | Range: {date_from} -> {date_to}", flush=True)

        handler = BrokerHandler.get_handler(candle_source)
        candles = handler.fetch_candles(
            symbol=symbol,
            timeframe=timeframe,
            limit=limit,
            date_from=date_from,
            date_to=date_to,
            login=account_id,
            account_id=account_id
        )

        if len(candles) > 1 and not date_to:
            candles = candles[:-1]

        if not candles:
            print(f"{Fore.RED}[BacktestWorker Data Error]{Style.RESET_ALL} Failed to fetch candles for '{symbol}' from broker '{candle_source}'. Zero candles returned.", flush=True)
            sys.exit(1)

        first_c = candles[0]
        last_c = candles[-1]
        try:
            from datetime import datetime
            t_first = datetime.utcfromtimestamp(int(first_c.get('time', 0))).strftime('%Y-%m-%d %H:%M:%S UTC')
            t_last = datetime.utcfromtimestamp(int(last_c.get('time', 0))).strftime('%Y-%m-%d %H:%M:%S UTC')
        except Exception:
            t_first = str(first_c.get('time'))
            t_last = str(last_c.get('time'))

        print(f"{Fore.GREEN}[BacktestWorker Data Success]{Style.RESET_ALL} Retrieved {len(candles)} candles for '{symbol}'. Start: {t_first} | End: {t_last} | First Close: {first_c.get('close')} | Last Close: {last_c.get('close')}", flush=True)

        # Record start of actual strategy computations (after fetching data overhead)
        execution_start_time = time.time()

        if job_type == 'single':
            print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Running single backtest for job {job_id}...", flush=True)
            res = StrategyHandler.run_backtest(
                candles=candles,
                symbol=symbol,
                sl_val=float(params.get('slVal', 1.0)),
                sl_type=params.get('slType', 'pct'),
                rr=float(params.get('rr', 2.0)),
                size=float(params.get('size', 1.0)),
                initial_balance=float(params.get('initialBalance', 10000.0)),
                use_risk_sizing=bool(params.get('useRiskSizing', False)),
                risk_pct=float(params.get('riskPct', 1.0)),
                use_break_even=bool(params.get('useBreakEven', False)),
                be_trigger_r=float(params.get('beTriggerR', 1.0)),
                be_offset_mode=params.get('beOffsetMode', 'half_r'),
                lookback_window=int(params.get('lookbackWindow', 20)),
                fees_percent=float(params.get('feesPercent', 0.0)),
                daily_retry_limit=int(params.get('dailyRetryLimit', 0)),
                allow_opposite_close=bool(params.get('allowOppositeClose', True)),
                date_from=date_from,
                date_to=date_to,
                timezone=params.get('timezone', 'Local'),
                sessions=params.get('sessions', []),
                use_global_close=bool(params.get('useGlobalClose', False)),
                global_close_time=params.get('globalCloseTime', ''),
                progress_callback=progress_cb,
                entry_stability_rule=params.get('entryStabilityRule', 'default'),
                broker=candle_source,
                timeframe=timeframe,
                indicator_rules=params.get('indicatorRules', params.get('indicator_rules', []))
            )

            total_elapsed = round(time.time() - execution_start_time, 2)
            if isinstance(res, dict):
                res['total_duration_sec'] = total_elapsed
                summary = res.get('summary', {})
                print(f"{Fore.GREEN}[BacktestWorker Finished]{Style.RESET_ALL} Job {job_id} finished in {total_elapsed}s | Net PnL: ${summary.get('net_profit', 0.0):.2f} | Trades: {summary.get('total_trades', 0)} | WinRate: {summary.get('win_rate', 0.0):.1f}%", flush=True)

            # Auto-save single backtest run to saved_backtests table ONCE at completion
            try:
                summary = res.get('summary', {}) if isinstance(res, dict) else {}
                SQLHandler.save_backtest_run(
                    backtest_id=f"single_{job_id}",
                    symbol=symbol,
                    timeframe=timeframe,
                    broker=candle_source,
                    sl_val=float(params.get('slVal', 1.0)),
                    sl_type=params.get('slType', 'pct'),
                    rr=float(params.get('rr', 2.0)),
                    be_trigger_r=float(params.get('beTriggerR', 1.0)) if params.get('useBreakEven') else 0.0,
                    net_pnl=float(summary.get('net_profit', 0.0)),
                    win_rate=float(summary.get('win_rate', 0.0)),
                    trades_cnt=int(summary.get('total_trades', 0)),
                    profit_factor=float(summary.get('profit_factor', 0.0)),
                    max_drawdown=float(summary.get('max_drawdown', 0.0)),
                    payload_dict=res if isinstance(res, dict) else {}
                )
                print(f"{Fore.GREEN}[BacktestWorker SavedRun]{Style.RESET_ALL} Saved completed single backtest run 'single_{job_id}' to MySQL saved_backtests table.", flush=True)
            except Exception as save_err:
                print(f"[BacktestWorker] Warning: Failed to save single backtest run: {save_err}", flush=True)

            # Update job status via local HTTP callback to Flask in-memory cache and MySQL
            send_local_update(progress=100.0, status='completed', step_info='Finished', results=res if isinstance(res, dict) else {})

        elif job_type == 'optimize':
            symbols = params.get('symbols') or [symbol]
            timeframes = params.get('timeframes') or [timeframe]
            print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Starting multi-parameter optimization matrix for job {job_id}...", flush=True)

            res = StrategyHandler.run_optimization(
                symbol=symbol,
                sl_val=float(params.get('slVal', 1.0)),
                sl_type=params.get('slType', 'pct'),
                size=float(params.get('size', 1.0)),
                initial_balance=float(params.get('initialBalance', 10000.0)),
                use_risk_sizing=bool(params.get('useRiskSizing', False)),
                risk_pct=float(params.get('riskPct', 1.0)),
                use_break_even=bool(params.get('useBreakEven', False)),
                be_trigger_r=float(params.get('beTriggerR', 1.0)),
                be_offset_mode=params.get('beOffsetMode', 'half_r'),
                lookback_window=int(params.get('lookbackWindow', 20)),
                rr_start=float(params.get('rrStart', 1.0)),
                rr_end=float(params.get('rrEnd', 5.0)),
                rr_step=float(params.get('rrStep', 0.5)),
                fees_percent=float(params.get('feesPercent', 0.0)),
                daily_retry_limit=int(params.get('dailyRetryLimit', 0)),
                allow_opposite_close=bool(params.get('allowOppositeClose', True)),
                date_from=date_from,
                date_to=date_to,
                timezone=params.get('timezone', 'Local'),
                sessions=params.get('sessions', []),
                use_global_close=bool(params.get('useGlobalClose', False)),
                global_close_time=params.get('globalCloseTime', ''),
                entry_stability_rule=params.get('entryStabilityRule', 'default'),
                candle_source=candle_source,
                account_id=account_id,
                limit=limit,
                symbols=symbols,
                timeframes=timeframes,
                sl_range_mode=bool(params.get('slRangeMode', False)),
                sl_start=float(params.get('slStart')) if params.get('slStart') is not None else None,
                sl_end=float(params.get('slEnd')) if params.get('slEnd') is not None else None,
                sl_step=float(params.get('slStep')) if params.get('slStep') is not None else None,
                be_range_mode=bool(params.get('beRangeMode', False)),
                be_start=float(params.get('beStart')) if params.get('beStart') is not None else None,
                be_end=float(params.get('beEnd')) if params.get('beEnd') is not None else None,
                be_step=float(params.get('beStep')) if params.get('beStep') is not None else None,
                be_offset_range_mode=bool(params.get('beOffsetRangeMode', False)),
                be_offset_start=float(params.get('beOffsetStart')) if params.get('beOffsetStart') is not None else None,
                be_offset_end=float(params.get('beOffsetEnd')) if params.get('beOffsetEnd') is not None else None,
                be_offset_step=float(params.get('beOffsetStep')) if params.get('beOffsetStep') is not None else None
            )

            total_elapsed = round(time.time() - execution_start_time, 2)
            results_grid = res.get('results', []) if isinstance(res, dict) else []
            try:
                SQLHandler.save_backtest_run(
                    backtest_id=f"opt_{job_id}",
                    symbol=", ".join(symbols),
                    timeframe=", ".join(timeframes),
                    broker=candle_source,
                    sl_val=0.0,
                    sl_type='optimization',
                    rr=0.0,
                    be_trigger_r=0.0,
                    net_pnl=0.0,
                    win_rate=0.0,
                    trades_cnt=len(results_grid),
                    profit_factor=0.0,
                    max_drawdown=0.0,
                    payload_dict={"grid": results_grid, "total_duration_sec": total_elapsed}
                )
                print(f"{Fore.GREEN}[BacktestWorker SavedRun]{Style.RESET_ALL} Saved completed optimization run 'opt_{job_id}' ({len(results_grid)} combos) to MySQL saved_backtests table.", flush=True)
            except Exception as save_err:
                print(f"[BacktestWorker] Warning: Failed to save optimization run: {save_err}", flush=True)

            # Update job status via local HTTP callback to Flask in-memory cache and MySQL
            send_local_update(progress=100.0, status='completed', step_info='Finished', results=res if isinstance(res, dict) else {})

    except Exception as err:
        print(f"{Fore.RED}[BacktestWorker]{Style.RESET_ALL} Error in worker execution for job {job_id}: {err}", flush=True)
        import traceback
    print(f"\n{Fore.GREEN}[BacktestWorker]{Style.RESET_ALL} Worker execution finished. Window will close automatically in 60 seconds (or press Enter)...", flush=True)
    try:
        if sys.platform == "win32":
            import msvcrt
            start_wait = time.time()
            while time.time() - start_wait < 60:
                if msvcrt.kbhit():
                    ch = msvcrt.getch()
                    if ch in (b'\r', b'\n'):
                        break
                time.sleep(0.5)
        else:
            time.sleep(60)
    except Exception:
        time.sleep(60)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Backtest Worker Process")
    parser.add_argument('--job_id', type=str, required=True, help="Job ID to execute")
    parser.add_argument('--resume', action='store_true', help="Resume execution from checkpoint")
    args = parser.parse_args()

    run_worker(job_id=args.job_id, is_resume=args.resume)

