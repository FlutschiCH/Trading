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

    # Update job status to running
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

    start_time = time.time()
    last_combo_duration = None

    def progress_cb(pct):
        if check_cancelled():
            return
        elapsed = time.time() - start_time
        eta_sec = 0
        if pct > 0:
            # Total estimate based on average rate across the entire duration so far
            total_est = elapsed / (float(pct) / 100.0)
            eta_sec = int(max(0, total_est - elapsed))

        SQLHandler.update_backtest_job_progress(
            job_id,
            status='running',
            progress=float(pct),
            estimated_seconds_remaining=eta_sec,
            step_info=f"Processing backtest ({int(pct)}%)..."
        )

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
            SQLHandler.update_backtest_job_progress(job_id, status='failed', step_info="Failed to fetch candles for backtest.")
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

        if check_cancelled():
            sys.exit(0)

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
                check_cancelled=check_cancelled,
                date_from=date_from,
                date_to=date_to,
                timezone=params.get('timezone', 'Local'),
                sessions=params.get('sessions', []),
                use_global_close=bool(params.get('useGlobalClose', False)),
                global_close_time=params.get('globalCloseTime', ''),
                progress_callback=progress_cb,
                entry_stability_rule=params.get('entryStabilityRule', 'default'),
                broker=candle_source,
                timeframe=timeframe
            )

            if check_cancelled():
                sys.exit(0)

            total_elapsed = round(time.time() - start_time, 2)
            if isinstance(res, dict):
                res['total_duration_sec'] = total_elapsed
                summary = res.get('summary', {})
                print(f"{Fore.GREEN}[BacktestWorker Finished]{Style.RESET_ALL} Job {job_id} finished in {total_elapsed}s | Net PnL: ${summary.get('net_profit', 0.0):.2f} | Trades: {summary.get('total_trades', 0)} | WinRate: {summary.get('win_rate', 0.0):.1f}%", flush=True)

            # Auto-save single backtest run to saved_backtests table
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
            except Exception as save_err:
                print(f"[BacktestWorker] Warning: Failed to auto-save single backtest run: {save_err}", flush=True)

            SQLHandler.update_backtest_job_progress(job_id, status='completed', progress=100.0, estimated_seconds_remaining=0, step_info='Completed', results=res)

        elif job_type == 'optimize':
            sl_ranges = params.get('sl_ranges') or params.get('slRanges') or [0.5, 1.0, 1.5, 2.0]
            rr_ranges = params.get('rr_ranges') or params.get('rrRanges') or [1.5, 2.0, 2.5, 3.0]
            be_ranges = params.get('be_ranges') or params.get('beRanges') or ['none', '0.5', '1.0']

            total_combos = len(sl_ranges) * len(rr_ranges) * len(be_ranges)
            print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Starting optimization for job {job_id}: {total_combos} total combinations for symbol '{symbol}' ({len(candles)} candles).", flush=True)
            print(f"{Fore.CYAN}[BacktestWorker]{Style.RESET_ALL} Ranges -> SL: {sl_ranges} | RR: {rr_ranges} | BE: {be_ranges}", flush=True)

            combo_idx = 0
            results_grid = []
            combo_durations = []

            for sl in sl_ranges:
                for rr in rr_ranges:
                    for be in be_ranges:
                        if check_cancelled():
                            print(f"{Fore.YELLOW}[BacktestWorker]{Style.RESET_ALL} Job {job_id} was cancelled by user. Exiting worker process.", flush=True)
                            sys.exit(0)
                        combo_idx += 1
                        pct = (combo_idx / total_combos) * 100.0

                        # Calculate average duration per combo executed so far to estimate remaining total time
                        if combo_durations:
                            avg_combo_time = sum(combo_durations) / len(combo_durations)
                        else:
                            # Before first combo completes, estimate using total wall time elapsed
                            avg_combo_time = (time.time() - execution_start_time) / max(1, combo_idx)

                        remaining_combos = total_combos - (combo_idx - 1)
                        eta_sec = int(max(0, remaining_combos * avg_combo_time))

                        print(f"\n{Fore.CYAN}[BacktestWorker Debug]{Style.RESET_ALL} Running Combo {combo_idx}/{total_combos} ({pct:.1f}%) -> SL={sl}, RR={rr}, BE={be} | Estimated ETA: {eta_sec}s", flush=True)

                        SQLHandler.update_backtest_job_progress(
                            job_id,
                            status='running',
                            progress=pct,
                            estimated_seconds_remaining=eta_sec,
                            step_info=f"Combo {combo_idx}/{total_combos} (SL:{sl}, RR:{rr}, BE:{be})"
                        )

                        combo_start = time.time()
                        use_be = (be != 'none')
                        be_trig = float(be) if use_be else 1.0

                        sub_res = StrategyHandler.run_backtest(
                            candles=candles,
                            symbol=symbol,
                            sl_val=float(sl),
                            sl_type=params.get('slType', 'pct'),
                            rr=float(rr),
                            size=float(params.get('size', 1.0)),
                            initial_balance=float(params.get('initialBalance', 10000.0)),
                            use_risk_sizing=bool(params.get('useRiskSizing', False)),
                            risk_pct=float(params.get('riskPct', 1.0)),
                            use_break_even=use_be,
                            be_trigger_r=be_trig,
                            be_offset_mode=params.get('beOffsetMode', 'half_r'),
                            lookback_window=int(params.get('lookbackWindow', 20)),
                            fees_percent=float(params.get('feesPercent', 0.0)),
                            daily_retry_limit=int(params.get('dailyRetryLimit', 0)),
                            allow_opposite_close=bool(params.get('allowOppositeClose', True)),
                            check_cancelled=check_cancelled,
                            date_from=date_from,
                            date_to=date_to,
                            timezone=params.get('timezone', 'Local'),
                            sessions=params.get('sessions', []),
                            use_global_close=bool(params.get('useGlobalClose', False)),
                            global_close_time=params.get('globalCloseTime', ''),
                            entry_stability_rule=params.get('entryStabilityRule', 'default'),
                            broker=candle_source,
                            timeframe=timeframe
                        )
                        c_dur = round(time.time() - combo_start, 3)
                        combo_durations.append(c_dur)

                        summary = sub_res.get('summary', {})
                        print(f"{Fore.GREEN}[BacktestWorker Combo {combo_idx} Finished]{Style.RESET_ALL} Time: {c_dur}s | Net PnL: ${summary.get('net_profit', 0.0):.2f} | Trades: {summary.get('total_trades', 0)} | WinRate: {summary.get('win_rate', 0.0):.1f}%", flush=True)

                        summary = sub_res.get('summary', {})
                        results_grid.append({
                            "sl": sl,
                            "rr": rr,
                            "be": be,
                            "net_profit": summary.get('net_profit', 0.0),
                            "win_rate": summary.get('win_rate', 0.0),
                            "total_trades": summary.get('total_trades', 0),
                            "profit_factor": summary.get('profit_factor', 0.0)
                        })

                        # Save individual backtest run to saved_backtests table immediately
                        try:
                            combo_run_id = f"opt_{job_id}_c{combo_idx}"
                            SQLHandler.save_backtest_run(
                                backtest_id=combo_run_id,
                                symbol=symbol,
                                timeframe=timeframe,
                                broker=candle_source,
                                sl_val=float(sl),
                                sl_type=params.get('slType', 'pct'),
                                rr=float(rr),
                                be_trigger_r=be_trig,
                                net_pnl=float(summary.get('net_profit', 0.0)),
                                win_rate=float(summary.get('win_rate', 0.0)),
                                trades_cnt=int(summary.get('total_trades', 0)),
                                profit_factor=float(summary.get('profit_factor', 0.0)),
                                max_drawdown=float(summary.get('max_drawdown', 0.0)),
                                payload_dict=sub_res
                            )
                            print(f"{Fore.GREEN}[BacktestWorker SavedRun]{Style.RESET_ALL} Auto-saved combo {combo_idx} (id: {combo_run_id}) to MySQL saved_backtests table.", flush=True)
                        except Exception as save_err:
                            print(f"{Fore.RED}[BacktestWorker Save Error]{Style.RESET_ALL} Failed to auto-save combo run {combo_idx}: {save_err}", flush=True)

                        # Save checkpoint to job progress
                        SQLHandler.update_backtest_job_progress(
                            job_id,
                            checkpoint_index=combo_idx,
                            checkpoint_data={"completed_combos": combo_idx, "total_combos": total_combos, "results_grid": results_grid}
                        )

            if check_cancelled():
                sys.exit(0)

            total_elapsed = round(time.time() - start_time, 2)
            SQLHandler.update_backtest_job_progress(
                job_id,
                status='completed',
                progress=100.0,
                estimated_seconds_remaining=0,
                step_info='Completed',
                results={"grid": results_grid, "total_duration_sec": total_elapsed, "avg_combo_duration_sec": round(sum(combo_durations)/len(combo_durations), 3) if combo_durations else 0.0}
            )


    except Exception as err:
        print(f"{Fore.RED}[BacktestWorker]{Style.RESET_ALL} Error in worker execution for job {job_id}: {err}", flush=True)
        import traceback
        traceback.print_exc()
        SQLHandler.update_backtest_job_progress(job_id, status='failed', step_info=f"Error: {str(err)}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Backtest Worker Process")
    parser.add_argument('--job_id', type=str, required=True, help="Job ID to execute")
    parser.add_argument('--resume', action='store_true', help="Resume execution from checkpoint")
    args = parser.parse_args()

    run_worker(job_id=args.job_id, is_resume=args.resume)

