import os
import sys
import json
import time
import argparse

# Ensure backend root directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sql_handler import SQLHandler
from strategy_handler import StrategyHandler
from broker_handler import BrokerHandler

def run_worker(job_id: str, is_resume: bool = False):
    print(f"[BacktestWorker] Starting worker for job_id={job_id} (resume={is_resume})", flush=True)
    job = SQLHandler.get_backtest_job(job_id)
    if not job:
        print(f"[BacktestWorker] Job {job_id} not found in database.", flush=True)
        sys.exit(1)

    params = job.get('params', {})
    job_type = job.get('type', 'single')

    # Update job status to running
    SQLHandler.update_backtest_job_progress(job_id, status='running', progress=5.0, step_info='Fetching candles from broker...')

    def check_cancelled():
        current_job = SQLHandler.get_backtest_job(job_id)
        if current_job and current_job.get('status') == 'cancelled':
            return True
        return False

    start_time = time.time()

    def progress_cb(pct):
        if check_cancelled():
            return
        elapsed = time.time() - start_time
        eta_sec = 0
        if pct > 0:
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
            SQLHandler.update_backtest_job_progress(job_id, status='failed', step_info="Failed to fetch candles for backtest.")
            sys.exit(1)

        if check_cancelled():
            sys.exit(0)

        if job_type == 'single':
            print(f"[BacktestWorker] Running single backtest for job {job_id}...", flush=True)
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

            SQLHandler.update_backtest_job_progress(job_id, status='completed', progress=100.0, estimated_seconds_remaining=0, step_info='Completed', results=res)

        elif job_type == 'optimize':
            print(f"[BacktestWorker] Running optimization backtest for job {job_id}...", flush=True)
            sl_ranges = params.get('sl_ranges') or params.get('slRanges') or [0.5, 1.0, 1.5, 2.0]
            rr_ranges = params.get('rr_ranges') or params.get('rrRanges') or [1.5, 2.0, 2.5, 3.0]
            be_ranges = params.get('be_ranges') or params.get('beRanges') or ['none', '0.5', '1.0']

            total_combos = len(sl_ranges) * len(rr_ranges) * len(be_ranges)
            combo_idx = 0
            results_grid = []

            for sl in sl_ranges:
                for rr in rr_ranges:
                    for be in be_ranges:
                        if check_cancelled():
                            sys.exit(0)
                        combo_idx += 1
                        pct = (combo_idx / total_combos) * 100.0
                        elapsed = time.time() - start_time
                        eta_sec = int(max(0, (elapsed / (combo_idx / float(total_combos))) - elapsed))

                        SQLHandler.update_backtest_job_progress(
                            job_id,
                            status='running',
                            progress=pct,
                            estimated_seconds_remaining=eta_sec,
                            step_info=f"Combo {combo_idx}/{total_combos} (SL:{sl}, RR:{rr}, BE:{be})"
                        )

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
                        # Save checkpoint
                        SQLHandler.update_backtest_job_progress(
                            job_id,
                            checkpoint_index=combo_idx,
                            checkpoint_data={"completed_combos": combo_idx, "total_combos": total_combos, "results_grid": results_grid}
                        )

            if check_cancelled():
                sys.exit(0)

            SQLHandler.update_backtest_job_progress(job_id, status='completed', progress=100.0, estimated_seconds_remaining=0, step_info='Completed', results={"grid": results_grid})


    except Exception as err:
        print(f"[BacktestWorker] Error in worker execution for job {job_id}: {err}", flush=True)
        import traceback
        traceback.print_exc()
        SQLHandler.update_backtest_job_progress(job_id, status='failed', step_info=f"Error: {str(err)}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Standalone Backtest Worker Process")
    parser.add_argument('--job_id', type=str, required=True, help="Job ID to execute")
    parser.add_argument('--resume', action='store_true', help="Resume execution from checkpoint")
    args = parser.parse_args()

    run_worker(job_id=args.job_id, is_resume=args.resume)

