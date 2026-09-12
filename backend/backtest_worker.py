import os
import sys
import json
import time
import argparse
import signal
import atexit
from colorama import init, Fore, Style
init(autoreset=True)

def set_console_quick_edit(enabled: bool):
    if sys.platform == "win32":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            h_input = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            if kernel32.GetConsoleMode(h_input, ctypes.byref(mode)):
                if enabled:
                    new_mode = (mode.value | 0x0040) | 0x0080
                else:
                    new_mode = (mode.value & ~0x0040) | 0x0080
                kernel32.SetConsoleMode(h_input, new_mode)
        except Exception:
            pass

# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from strategy_handler import StrategyHandler
from broker_handler import BrokerHandler
from scalper_handler import ScalperHandler

def run_scalper_backtest_job(job_id: str, params: dict, candles: list, symbol: str, send_local_update):
    """
    Dedicated backtest executor for M1/M5 Liquidity Void & Reversal Scalper.
    Identifies all historical spike exhaustion triggers, confirms breakouts, and records triggered candles.
    """
    print(f"\n{Fore.CYAN}[BacktestWorker Scalper]{Style.RESET_ALL} Executing Liquidity Void Scalper backtest for '{symbol}' ({len(candles)} candles)...", flush=True)
    initial_balance = float(params.get('initialBalance', params.get('balance', 1000.0)))
    risk_pct = float(params.get('riskPct', params.get('risk_percent', 1.0)))
    atr_mult = float(params.get('atr_multiplier', params.get('atrMultiplier', 2.5)))
    vol_mult = float(params.get('vol_multiplier', params.get('volMultiplier', 3.0)))
    min_wick = float(params.get('min_wick_ratio', params.get('minWickRatio', 0.40)))
    max_spread = float(params.get('max_spread_pips', params.get('maxSpreadPips', 1.2)))
    hard_stop_m = int(params.get('hard_stop_minutes', 8))

    res = ScalperHandler.run_scalper_backtest(
        candles=candles,
        symbol=symbol,
        initial_balance=initial_balance,
        risk_percent=risk_pct,
        atr_multiplier=atr_mult,
        vol_multiplier=vol_mult,
        min_wick_ratio=min_wick,
        max_spread_pips=max_spread,
        hard_stop_minutes=hard_stop_m,
        progress_callback=lambda p: send_local_update(progress=float(p), step_info=f"Simulating M1 Scalper ({p}%)")
    )

    summary = res.get('summary', {})
    triggered = res.get('triggered_candles', [])
    print(f"{Fore.GREEN}[BacktestWorker Scalper Finished]{Style.RESET_ALL} Completed! Net Profit: ${summary.get('net_profit', 0.0)} | WinRate: {summary.get('win_rate', 0)}% ({summary.get('wins', 0)}W / {summary.get('losses', 0)}L) | Spikes Detected: {summary.get('triggered_spikes_count', 0)}", flush=True)
    if triggered:
        print(f"{Fore.YELLOW}[BacktestWorker Triggered Candles]{Style.RESET_ALL} Saved {len(triggered)} spike candles for chart display.", flush=True)

    send_local_update(progress=100.0, status='completed', step_info='Finished', results=res)
    return res

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

    # Set console window title to "Backtest - <symbol>"
    try:
        title_sym = ", ".join(symbols) if symbols else "Unknown"
        window_title = f"Backtest - {title_sym}"
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.kernel32.SetConsoleTitleW(window_title)
        else:
            sys.stdout.write(f"\x1b]2;{window_title}\x07")
            sys.stdout.flush()
    except Exception:
        pass

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

    http_failed = False

    worker_start_time = time.time()

    def send_local_update(progress: float = None, status: str = None, step_info: str = None, results: dict = None, est_sec: int = None):
        nonlocal http_failed
        elapsed_total = time.time() - worker_start_time
        print(f"\n{Fore.CYAN}[BacktestWorker Update]{Style.RESET_ALL} [T+{elapsed_total:.2f}s] Job {job_id}: status={status}, progress={progress}%", flush=True)
        # Always update MySQL database directly first for ultimate reliability
        try:
            SQLHandler.update_backtest_job_progress(
                job_id=str(job_id),
                status=status if status else 'running',
                progress=float(progress) if progress is not None else 0.0,
                step_info=step_info if step_info else '',
                results=results
            )
        except Exception as db_err:
            print(f"[BacktestWorker Update Warning] Direct DB update failed: {db_err}", flush=True)

        if http_failed:
            return

        try:
            port = int(os.environ.get("PORT", 8751))
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
            with urllib.request.urlopen(req, timeout=2):
                pass
        except Exception as http_err:
            http_failed = True
            print(f"[BacktestWorker Update Warning] HTTP notification to main backend failed: {http_err}. Disabling further HTTP retries.", flush=True)

    last_progress_update = 0.0

    def progress_cb(pct):
        # Match batch optimization handling: do not run blocking DB/HTTP I/O inside the candle analysis loop
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
                active_acc = AccountHandler.get_active_account(candle_source)
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

        # If timeframe is not 1m, fetch 1m candles for accurate intrabar trade resolution
        candles_1m = None
        if timeframe.lower() not in ('1m', '1min'):
            try:
                print(f"{Fore.CYAN}[BacktestWorker Data]{Style.RESET_ALL} Fetching 1m candles for intrabar trade follow-through...", flush=True)
                candles_1m = handler.fetch_candles(
                    symbol=symbol,
                    timeframe='1m',
                    limit=limit * 15,
                    date_from=date_from,
                    date_to=date_to,
                    login=account_id,
                    account_id=account_id
                )
                if len(candles_1m) > 1 and not date_to:
                    candles_1m = candles_1m[:-1]
                print(f"{Fore.GREEN}[BacktestWorker Data]{Style.RESET_ALL} Retrieved {len(candles_1m)} 1m candles for intrabar resolution.", flush=True)
            except Exception as e_1m:
                print(f"{Fore.YELLOW}[BacktestWorker Data]{Style.RESET_ALL} Warning: Could not fetch 1m candles ({e_1m}). Falling back to {timeframe} resolution.", flush=True)
                candles_1m = None

        # If HTF EMA Filter is active, fetch dedicated HTF candles from broker
        htf_candles = None
        htf_ema_enabled = bool(params.get('htfEmaEnabled', params.get('htf_ema_enabled', False)))
        htf_ema_timeframe = str(params.get('htfEmaTimeframe', params.get('htf_ema_timeframe', '4h')))
        htf_ema_period = int(params.get('htfEmaPeriod', params.get('htf_ema_period', 200)))
        htf_ema_range_mode = bool(params.get('htfEmaRangeMode', params.get('htf_ema_range_mode', False)))

        if htf_ema_enabled:
            try:
                print(f"{Fore.CYAN}[BacktestWorker Data]{Style.RESET_ALL} Fetching {htf_ema_timeframe} HTF candles for HTF {htf_ema_period} EMA filter...", flush=True)
                htf_candles = handler.fetch_candles(
                    symbol=symbol,
                    timeframe=htf_ema_timeframe,
                    limit=limit,
                    date_from=date_from,
                    date_to=date_to,
                    login=account_id,
                    account_id=account_id
                )
                if len(htf_candles) > 1 and not date_to:
                    htf_candles = htf_candles[:-1]
                print(f"{Fore.GREEN}[BacktestWorker Data]{Style.RESET_ALL} Retrieved {len(htf_candles)} {htf_ema_timeframe} candles for HTF EMA filter.", flush=True)
            except Exception as e_htf:
                print(f"{Fore.YELLOW}[BacktestWorker Data]{Style.RESET_ALL} Warning: Could not fetch {htf_ema_timeframe} HTF candles ({e_htf}).", flush=True)
                htf_candles = None

        # Check if this is a scalper backtest
        is_scalper = params.get('strategy_type') == 'scalper' or 'scalper' in str(params.get('strategy_name', '')).lower() or 'scalper' in str(params.get('name', '')).lower()

        if is_scalper:
            res = run_scalper_backtest_job(
                job_id=job_id,
                params=params,
                candles=candles,
                symbol=symbol,
                send_local_update=send_local_update
            )
        elif job_type == 'single':
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
                indicator_rules=params.get('indicatorRules', params.get('indicator_rules', [])),
                daily_first_signals_mode=params.get('dailyFirstSignalsMode', 'disabled'),
                daily_first_signals_count=int(params.get('dailyFirstSignalsCount', 0)),
                daily_first_signals_risk_mult=float(params.get('dailyFirstSignalsRiskMult', 0.5)),
                candles_1m=candles_1m,
                htf_candles=htf_candles,
                htf_ema_enabled=htf_ema_enabled,
                htf_ema_period=htf_ema_period,
                htf_ema_timeframe=htf_ema_timeframe
            )

            total_elapsed = round(time.time() - execution_start_time, 2)
            if isinstance(res, dict):
                res['total_duration_sec'] = total_elapsed
                print(f"{Fore.GREEN}[BacktestWorker Finished]{Style.RESET_ALL} Job {job_id} finished in {total_elapsed}s | Net PnL: ${res.get('netPnl', 0.0):.2f} | Trades: {res.get('totalTrades', 0)} | WinRate: {res.get('winRate', 0.0):.1f}%", flush=True)

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
                be_offset_step=float(params.get('beOffsetStep')) if params.get('beOffsetStep') is not None else None,
                daily_first_signals_mode=params.get('dailyFirstSignalsMode', 'disabled'),
                daily_first_signals_count=int(params.get('dailyFirstSignalsCount', 0)),
                daily_first_signals_risk_mult=float(params.get('dailyFirstSignalsRiskMult', 0.5)),
                htf_ema_enabled=htf_ema_enabled,
                htf_ema_period=htf_ema_period,
                htf_ema_timeframe=htf_ema_timeframe,
                htf_ema_range_mode=htf_ema_range_mode
            )

            total_elapsed = round(time.time() - execution_start_time, 2)
            results_grid = res.get('results', []) if isinstance(res, dict) else []

            # Update job status via local HTTP callback to Flask in-memory cache and MySQL
            send_local_update(progress=100.0, status='completed', step_info='Finished', results=res if isinstance(res, dict) else {})

    except Exception as err:
        print(f"{Fore.RED}[BacktestWorker]{Style.RESET_ALL} Error in worker execution for job {job_id}: {err}", flush=True)
        import traceback
        traceback.print_exc()
        try:
            send_local_update(progress=100.0, status='failed', step_info=f"Worker error: {str(err)}")
        except Exception:
            pass
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
    parser.add_argument('--quickedit', action='store_true', default=False, help="Enable Windows Console QuickEdit mode for debugging")
    args = parser.parse_args()

    set_console_quick_edit(args.quickedit)
    run_worker(job_id=args.job_id, is_resume=args.resume)

