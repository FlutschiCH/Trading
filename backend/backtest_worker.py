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

    # Format trades with properties expected by TVChart and Backtest card (entryPrice, slPrice, tpPrice, entryTimestamp, exitTimestamp, pnl, type)
    raw_trades = res.get('trades', [])
    formatted_trades = []
    for tr in raw_trades:
        formatted_tr = {
            **tr,
            "id": tr.get("id"),
            "type": tr.get("type", "BUY"),
            "entryPrice": tr.get("entry_price"),
            "exitPrice": tr.get("exit_price"),
            "slPrice": tr.get("sl_price"),
            "tpPrice": tr.get("tp_price"),
            "entryTimestamp": tr.get("entry_time") or tr.get("entry_timestamp"),
            "exitTimestamp": tr.get("exit_time") or tr.get("exit_timestamp"),
            "pnl": tr.get("pnl", 0.0),
            "fees": 0.0,
            "exitReason": tr.get("exit_reason", ""),
            "qty": tr.get("qty", 1.0)
        }
        formatted_trades.append(formatted_tr)

    annotated = res.get('annotated_candles', candles)
    # Ensure backtest_signal flags are set on candles where scalper trades entered
    trade_time_map = {t['entryTimestamp']: t['type'] for t in formatted_trades if t.get('entryTimestamp')}
    for c in annotated:
        c_time = c.get('time')
        if c_time in trade_time_map:
            c['backtest_signal'] = trade_time_map[c_time]

    formatted_results = {
        "status": "success",
        "strategy_type": "scalper",
        "symbol": symbol,
        "timeframe": params.get('timeframe', '1m'),
        "summary": summary,
        "trades": formatted_trades,
        "completed_trades_raw": formatted_trades,
        "winRate": summary.get('win_rate', 0.0),
        "netPnl": summary.get('net_profit', 0.0),
        "profitFactor": 1.5 if summary.get('net_profit', 0.0) >= 0 else 0.5,
        "totalTrades": summary.get('total_trades', 0),
        "maxDrawdown": 0.0,
        "maxDailyLoss": 0.0,
        "dailyLossBreached": False,
        "candles": annotated,
        "triggered_candles": triggered,
        "fvgs": [],
        "monthlyBreakdown": {},
        "weeklyBreakdown": {},
        "dateFrom": annotated[0].get('time') if annotated else None,
        "dateTo": annotated[-1].get('time') if annotated else None
    }

    # Auto-save scalper run to MySQL DB
    try:
        backtest_id_str = f"bt_scalp_{symbol.lower()}_1m_atr{atr_mult}_vol{vol_mult}_{int(time.time())}"
        payload_to_save = {
            "symbol": symbol,
            "timeframe": params.get('timeframe', '1m'),
            "strategy_type": "scalp",
            "summary": summary,
            "trades": formatted_trades,
            "triggered_candles": triggered,
            "annotated_candles": annotated,
            "settings": params
        }
        SQLHandler.save_backtest_run(
            backtest_id=backtest_id_str,
            symbol=symbol,
            timeframe=params.get('timeframe', '1m'),
            broker=params.get('broker', 'metatrader'),
            sl_val=2.0,
            sl_type="pips",
            rr=1.5,
            be_trigger_r=1.0,
            net_pnl=summary.get('net_profit', 0.0),
            win_rate=summary.get('win_rate', 0.0),
            trades_cnt=summary.get('total_trades', 0),
            profit_factor=1.0 if summary.get('net_profit', 0.0) >= 0 else 0.0,
            max_drawdown=0.0,
            payload_dict=payload_to_save,
            strategy_type="scalp",
            min_pnl=float(params.get('minSavePnl')) if params.get('minSavePnl') is not None and str(params.get('minSavePnl')).strip() != '' else None
        )
    except Exception as save_err:
        print(f"[BacktestWorker Scalper Warning] DB save failed: {save_err}", flush=True)

    send_local_update(progress=100.0, status='completed', step_info='Finished', results=formatted_results)
    return formatted_results

def run_worker(job_id: str, is_resume: bool = False):
    import socket
    local_machine = ""
    try:
        local_machine = socket.gethostname().strip().lower()
    except Exception:
        pass

    print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Starting worker on host '{local_machine}' for job_id={job_id} (resume={is_resume})", flush=True)
    job = SQLHandler.get_backtest_job(job_id)
    if not job:
        print(f"{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Job {job_id} not found in database.", flush=True)
        sys.exit(1)

    job_host = (job.get('computer_name') or '').strip().lower()
    # If job has an assigned computer_name, verify it matches this local machine before proceeding
    if job_host and local_machine and job_host != local_machine:
        print(f"{Fore.RED}[BacktestWorker Host Mismatch]{Style.RESET_ALL} Job {job_id} was created by '{job_host}', but this worker is running on '{local_machine}'. Aborting execution to prevent cross-machine execution.", flush=True)
        sys.exit(0)

    raw_params = job.get('params', {})
    job_type = job.get('type', 'single')

    # Strict normalization and validation of strategy settings
    params = StrategyHandler.get_strategy_settings(raw_params, strict=True)
    # Re-merge job-level optimization and control parameters into params
    for k, v in raw_params.items():
        if k not in params:
            params[k] = v

    symbols = raw_params.get('symbols') or [params['symbol']]
    timeframes = raw_params.get('timeframes') or [params['timeframe']]
    if not symbols:
        raise ValueError("Backtest job must specify at least one symbol in 'symbols' or 'symbol'.")
    if not timeframes:
        raise ValueError("Backtest job must specify at least one timeframe in 'timeframes' or 'timeframe'.")

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
        # Validate optimization parameters strictly (no fallbacks)
        if params.get('rrStart') is None or params.get('rrEnd') is None or params.get('rrStep') is None:
            raise ValueError("Optimization job requires 'rrStart', 'rrEnd', and 'rrStep' parameters.")
        rr_s = float(params['rrStart'])
        rr_e = float(params['rrEnd'])
        rr_st = float(params['rrStep'])
        if rr_st <= 0 or rr_s > rr_e:
            raise ValueError(f"Invalid RR range: start={rr_s}, end={rr_e}, step={rr_st}")
        rr_cnt = max(1, int(round((rr_e - rr_s) / rr_st)) + 1)

        # Calculate SL steps
        if params.get('slRangeMode'):
            if params.get('slStart') is None or params.get('slEnd') is None or params.get('slStep') is None:
                raise ValueError("Optimization has slRangeMode enabled but 'slStart', 'slEnd', or 'slStep' is missing.")
            sl_s = float(params['slStart'])
            sl_e = float(params['slEnd'])
            sl_st = float(params['slStep'])
            if sl_st <= 0 or sl_s > sl_e:
                raise ValueError(f"Invalid SL range: start={sl_s}, end={sl_e}, step={sl_st}")
            sl_cnt = max(1, int(round((sl_e - sl_s) / sl_st)) + 1)
        else:
            sl_cnt = 1

        # Calculate BE steps
        if params.get('useBreakEven') and params.get('beRangeMode'):
            if params.get('beStart') is None or params.get('beEnd') is None or params.get('beStep') is None:
                raise ValueError("Optimization has beRangeMode enabled but 'beStart', 'beEnd', or 'beStep' is missing.")
            be_s = float(params['beStart'])
            be_e = float(params['beEnd'])
            be_st = float(params['beStep'])
            if be_st <= 0 or be_s > be_e:
                raise ValueError(f"Invalid BE range: start={be_s}, end={be_e}, step={be_st}")
            be_cnt = max(1, int(round((be_e - be_s) / be_st)) + 1)
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

    checkpoint_idx = int(job.get('checkpoint_index') or 0)
    initial_res = []
    if job.get('results'):
        raw_res = job.get('results')
        if isinstance(raw_res, list):
            initial_res = raw_res
        elif isinstance(raw_res, dict) and 'results' in raw_res:
            initial_res = raw_res.get('results', [])

    if checkpoint_idx > 0:
        print(f"{Fore.GREEN}[BacktestWorker Checkpoint]{Style.RESET_ALL} Resuming job {job_id} from checkpoint run #{checkpoint_idx + 1} ({len(initial_res)} completed results restored)", flush=True)

    symbols_str = ", ".join(symbols)
    tf_str = ", ".join(timeframes)
    print(f"{Fore.CYAN}[BacktestWorker Target]{Style.RESET_ALL} Symbols ({len(symbols)}): [{symbols_str}] | Timeframes ({len(timeframes)}): [{tf_str}] | Type: '{job_type}'", flush=True)
    print(f"{Fore.CYAN}[BacktestWorker Plan]{Style.RESET_ALL} Total Combos: {total_jobs} | Estimated Runtime (~10s/job): {est_time_str}", flush=True)
    SQLHandler.update_backtest_job_progress(job_id, status='running', progress=float(job.get('progress') or 5.0), step_info='Resuming optimization matrix...' if checkpoint_idx > 0 else 'Fetching candles from broker...')

    def handle_exit_signal(sig=None, frame=None):
        print(f"\n{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Worker process interrupted for job {job_id}. Preserving checkpoint...", flush=True)
        try:
            SQLHandler.update_backtest_job_progress(job_id, status='interrupted', step_info='Worker process interrupted')
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
                print(f"\n{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Received console signal {ctrl_type} (X closed). Preserving checkpoint for job {job_id}...", flush=True)
                try:
                    SQLHandler.update_backtest_job_progress(job_id, status='interrupted', step_info='Worker window closed by user')
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

    def send_local_update(progress: float = None, status: str = None, step_info: str = None, results: dict = None, est_sec: int = None, checkpoint_index: int = None, checkpoint_data: dict = None):
        nonlocal http_failed
        elapsed_total = time.time() - worker_start_time
        # Always update MySQL database directly first for ultimate reliability
        try:
            SQLHandler.update_backtest_job_progress(
                job_id=str(job_id),
                status=status if status else 'running',
                progress=float(progress) if progress is not None else 0.0,
                step_info=step_info if step_info else '',
                checkpoint_index=checkpoint_index,
                checkpoint_data=checkpoint_data,
                results=results,
                estimated_seconds_remaining=est_sec
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
        params = StrategyHandler.get_strategy_settings(params, strict=False)
        resolved = StrategyHandler.resolve_broker_and_symbol(params)
        symbol = resolved["symbol"]
        broker_symbol = resolved["broker_symbol"]
        candle_source = resolved["broker_name"]
        handler = resolved["handler"]
        account_id = resolved["account_id"]
        params['account_id'] = account_id

        timeframe = params["timeframe"]
        limit = int(params.get('limit', 1000))
        date_from = params.get('date_from') or params.get('dateFrom')
        date_to = params.get('date_to') or params.get('dateTo')

        if not resolved["is_valid"]:
            err_msg = f"Symbol resolution failed: {resolved.get('error_message')}"
            print(f"{Fore.RED}[BacktestWorker Error]{Style.RESET_ALL} {err_msg}", flush=True)
            raise ValueError(err_msg)

        print(f"{Fore.CYAN}[BacktestWorker Data]{Style.RESET_ALL} Fetching candles for '{broker_symbol}' (raw: '{symbol}', {timeframe}) | Source: '{candle_source}' | Account: '{account_id}' | Limit: {limit} | Range: {date_from} -> {date_to}", flush=True)

        candles = handler.fetch_candles(
            symbol=broker_symbol,
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
            err_msg = f"Failed to fetch candles for '{symbol}' from broker '{candle_source}'. Zero candles returned."
            print(f"{Fore.RED}[BacktestWorker Data Error]{Style.RESET_ALL} {err_msg}", flush=True)
            raise RuntimeError(err_msg)

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
            print(f"{Fore.CYAN}[BacktestWorker Data]{Style.RESET_ALL} Fetching 1m candles for intrabar trade follow-through...", flush=True)
            try:
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
                if not candles_1m:
                    raise RuntimeError(f"Zero 1m candles returned for '{symbol}' from '{candle_source}'.")
                print(f"{Fore.GREEN}[BacktestWorker Data]{Style.RESET_ALL} Retrieved {len(candles_1m)} 1m candles for intrabar resolution.", flush=True)
            except Exception as e_1m:
                print(f"{Fore.RED}[BacktestWorker Data Error]{Style.RESET_ALL} Failed to fetch 1m candles: {e_1m}", flush=True)
                raise RuntimeError(f"Failed to fetch 1m candles for intrabar resolution on {symbol}: {e_1m}")

        # If HTF EMA Filter is active, fetch dedicated HTF candles from broker
        htf_candles = None
        htf_ema_enabled = bool(params.get('htfEmaEnabled', params.get('htf_ema_enabled', False)))
        htf_ema_timeframe = str(params.get('htfEmaTimeframe', params.get('htf_ema_timeframe', '4h')))
        htf_ema_period = int(params.get('htfEmaPeriod', params.get('htf_ema_period', 200)))
        htf_ema_range_mode = bool(params.get('htfEmaRangeMode', params.get('htf_ema_range_mode', False)))

        if htf_ema_enabled:
            print(f"{Fore.CYAN}[BacktestWorker Data]{Style.RESET_ALL} Fetching {htf_ema_timeframe} HTF candles for HTF {htf_ema_period} EMA filter...", flush=True)
            try:
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
                if not htf_candles:
                    raise RuntimeError(f"Zero {htf_ema_timeframe} candles returned for '{symbol}' from '{candle_source}'.")
                print(f"{Fore.GREEN}[BacktestWorker Data]{Style.RESET_ALL} Retrieved {len(htf_candles)} {htf_ema_timeframe} candles for HTF EMA filter.", flush=True)
            except Exception as e_htf:
                print(f"{Fore.RED}[BacktestWorker Data Error]{Style.RESET_ALL} Failed to fetch {htf_ema_timeframe} HTF candles: {e_htf}", flush=True)
                raise RuntimeError(f"Failed to fetch {htf_ema_timeframe} HTF candles for HTF {htf_ema_period} EMA filter on {symbol}: {e_htf}")

        # Check if this is a scalper backtest
        is_scalper = params.get('strategy_type') == 'scalper' or 'scalper' in str(params.get('strategy_name', '')).lower() or 'scalper' in str(params.get('name', '')).lower()

        # Track execution duration for reporting
        execution_start_time = time.time()

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
            strat_obj = StrategyHandler.get_strategy_settings(params, strict=False)
            res = StrategyHandler.run_backtest(
                candles=candles,
                symbol=symbol,
                strategy=strat_obj,
                broker=candle_source,
                date_from=date_from,
                date_to=date_to,
                timeframe=timeframe,
                candles_1m=candles_1m,
                htf_candles=htf_candles,
                progress_callback=progress_cb
            )

            total_elapsed = round(time.time() - execution_start_time, 2)
            if isinstance(res, dict):
                res['total_duration_sec'] = total_elapsed
                print(f"{Fore.GREEN}[BacktestWorker Finished]{Style.RESET_ALL} Job {job_id} finished in {total_elapsed}s | Net PnL: ${res.get('netPnl', 0.0):.2f} | Trades: {res.get('totalTrades', 0)} | WinRate: {res.get('winRate', 0.0):.1f}%", flush=True)

            # Update job status via local HTTP callback to Flask in-memory cache and MySQL
            send_local_update(progress=100.0, status='completed', step_info='Finished', results=res if isinstance(res, dict) else {})

        elif job_type == 'optimize':
            print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Preparing strategy batch for job {job_id}...", flush=True)
            batch_strategies = StrategyHandler.prepare_batch_strategies(params)
            print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Starting batch backtest of {len(batch_strategies)} strategies for job {job_id}...", flush=True)

            res = StrategyHandler.run_backtest(
                strategies=batch_strategies,
                date_from=date_from,
                date_to=date_to,
                account_id=account_id,
                candle_source=candle_source,
                limit=limit,
                check_cancelled=check_cancelled,
                start_index=checkpoint_idx,
                initial_results=initial_res,
                checkpoint_callback=lambda curr_idx, partial_results: send_local_update(
                    progress=round((curr_idx / total_jobs) * 100.0, 1) if total_jobs > 0 else 0.0,
                    status='running',
                    step_info=f"Optimization matrix [{curr_idx}/{total_jobs}]",
                    checkpoint_index=curr_idx,
                    checkpoint_data={"total_jobs": total_jobs, "last_index": curr_idx},
                    results={"status": "running", "results": partial_results}
                )
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

