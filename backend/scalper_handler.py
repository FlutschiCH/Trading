import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, Optional, List
from backtest_helpers import get_pip_size, get_lot_size
from logger_handler import logPrint


class ExhaustionDetector:
    """
    Monitors M1 candles and detects liquidity void / extreme exhaustion impulse candles.
    Rules:
    - Candle Range >= 2.5 * ATR(14)
    - Tick Volume >= 3.0 * SMA(Volume, 20)
    - Rejection wick >= 40% of total candle range
    """

    @staticmethod
    def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
        high = df['high']
        low = df['low']
        close_prev = df['close'].shift(1)
        tr1 = high - low
        tr2 = (high - close_prev).abs()
        tr3 = (low - close_prev).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.rolling(window=period).mean()

    @staticmethod
    def calculate_volume_sma(df: pd.DataFrame, period: int = 20) -> pd.Series:
        vol = df['volume'] if 'volume' in df.columns else df.get('tick_volume', pd.Series(0, index=df.index))
        return vol.rolling(window=period).mean()

    @classmethod
    def evaluate_candle(
        cls,
        candle: Dict[str, Any],
        atr_14: float,
        vol_sma_20: float,
        atr_multiplier: float = 2.5,
        vol_multiplier: float = 3.0,
        min_wick_ratio: float = 0.40
    ) -> Dict[str, Any]:
        """
        Evaluates a single closed candle for exhaustion spike characteristics.
        """
        high = float(candle.get('high', 0))
        low = float(candle.get('low', 0))
        open_price = float(candle.get('open', 0))
        close = float(candle.get('close', 0))
        volume = float(candle.get('volume', candle.get('tick_volume', 0)))

        candle_range = high - low
        if candle_range <= 0 or atr_14 <= 0 or vol_sma_20 <= 0:
            return {"is_exhaustion": False}

        # 1. Range & Volume criteria
        range_ok = candle_range >= (atr_multiplier * atr_14)
        volume_ok = volume >= (vol_multiplier * vol_sma_20)

        if not (range_ok and volume_ok):
            return {"is_exhaustion": False}

        # 2. Wick calculations
        body_top = max(open_price, close)
        body_bottom = min(open_price, close)
        upper_wick = high - body_top
        lower_wick = body_bottom - low

        upper_wick_ratio = upper_wick / candle_range
        lower_wick_ratio = lower_wick / candle_range

        # Bullish exhaustion (spike down with large lower rejection wick) -> Signal Buy
        is_bullish_rejection = lower_wick_ratio >= min_wick_ratio and (close > open_price or lower_wick > upper_wick)
        # Bearish exhaustion (spike up with large upper rejection wick) -> Signal Sell
        is_bearish_rejection = upper_wick_ratio >= min_wick_ratio and (close < open_price or upper_wick > lower_wick)

        if not (is_bullish_rejection or is_bearish_rejection):
            return {"is_exhaustion": False}

        direction = "BUY" if is_bullish_rejection else "SELL"
        retracement_50 = low + (candle_range * 0.5)

        return {
            "is_exhaustion": True,
            "direction": direction,
            "candle_range": candle_range,
            "atr_14": atr_14,
            "vol_sma_20": vol_sma_20,
            "spike_high": high,
            "spike_low": low,
            "upper_wick_ratio": upper_wick_ratio,
            "lower_wick_ratio": lower_wick_ratio,
            "retracement_50": retracement_50,
            "spike_time": candle.get('time')
        }


class SignalEngine:
    """
    Manages state machine and prevents catching falling knives.
    Arms on spike close; triggers on subsequent confirmation breakout.
    """

    @staticmethod
    def process_step(
        current_candle: Dict[str, Any],
        state: Dict[str, Any],
        exhaustion_info: Optional[Dict[str, Any]] = None,
        max_confirmation_bars: int = 3
    ) -> Tuple[bool, bool, Dict[str, Any]]:
        """
        Evaluates state transitions.
        Returns: (should_buy, should_sell, updated_state)
        """
        state = dict(state or {})
        status = state.get("status", "IDLE")
        should_buy = False
        should_sell = False

        high = float(current_candle.get('high', 0))
        low = float(current_candle.get('low', 0))

        # 1. Arm new setup if exhaustion detected
        if exhaustion_info and exhaustion_info.get("is_exhaustion"):
            state = {
                "status": "ARMED",
                "direction": exhaustion_info["direction"],
                "spike_high": exhaustion_info["spike_high"],
                "spike_low": exhaustion_info["spike_low"],
                "retracement_50": exhaustion_info["retracement_50"],
                "spike_time": exhaustion_info.get("spike_time"),
                "bars_since_spike": 0,
                "confirmation_high": high,
                "confirmation_low": low
            }
            return False, False, state

        # 2. If ARMED, check confirmation breakout
        if status == "ARMED":
            bars_since_spike = state.get("bars_since_spike", 0) + 1
            state["bars_since_spike"] = bars_since_spike

            direction = state.get("direction")
            conf_high = state.get("confirmation_high", high)
            conf_low = state.get("confirmation_low", low)

            if direction == "BUY":
                if high > conf_high:
                    should_buy = True
                    state["status"] = "TRIGGERED"
            elif direction == "SELL":
                if low < conf_low:
                    should_sell = True
                    state["status"] = "TRIGGERED"

            state["confirmation_high"] = max(conf_high, high)
            state["confirmation_low"] = min(conf_low, low)

            if bars_since_spike >= max_confirmation_bars and not (should_buy or should_sell):
                state["status"] = "EXPIRED"

        return should_buy, should_sell, state


class RiskManager:
    """
    Computes dynamic lot sizing, enforces spread filters, and places SL beyond spike wick.
    """

    @staticmethod
    def evaluate_risk(
        symbol: str,
        direction: str,
        entry_price: float,
        spike_high: float,
        spike_low: float,
        account_balance: float,
        current_spread_pips: float,
        risk_percent: float = 1.0,
        max_spread_pips: float = 1.2,
        buffer_pips: float = 2.0,
        leverage: float = 100.0,
        min_lot: float = 0.01,
        max_lot: float = 100.0,
        lot_step: float = 0.01
    ) -> Dict[str, Any]:
        """
        Validates trade conditions and calculates SL, TP, and Lot size.
        """
        pip_size = get_pip_size(symbol, entry_price)

        if current_spread_pips > max_spread_pips:
            return {
                "valid": False,
                "reason": f"Spread {current_spread_pips:.2f} pips exceeds maximum {max_spread_pips:.2f} pips"
            }

        buffer_price = buffer_pips * pip_size
        if direction.upper() == "BUY":
            sl_price = spike_low - buffer_price
            sl_pips = abs(entry_price - sl_price) / pip_size
        else:
            sl_price = spike_high + buffer_price
            sl_pips = abs(sl_price - entry_price) / pip_size

        if sl_pips <= 0:
            return {"valid": False, "reason": "Invalid Stop Loss distance"}

        # 3. Dynamic Lot Sizing
        risk_amount = account_balance * (risk_percent / 100.0)
        contract_size = get_lot_size(symbol)
        sl_distance = abs(entry_price - sl_price)

        if sl_distance > 0 and contract_size > 0:
            raw_lot = risk_amount / (sl_distance * contract_size)
        else:
            raw_lot = min_lot

        # Step and bounds rounding
        steps = round((raw_lot - min_lot) / lot_step)
        lot = min_lot + (steps * lot_step)
        lot = max(min_lot, min(max_lot, lot))

        # 4. Margin requirement check
        required_margin = (lot * contract_size * entry_price) / max(leverage, 1.0)
        if required_margin > account_balance * 0.9:
            allowed_margin = account_balance * 0.9
            raw_lot = (allowed_margin * leverage) / (contract_size * entry_price)
            steps = round((raw_lot - min_lot) / lot_step)
            lot = min_lot + (steps * lot_step)
            lot = max(min_lot, min(max_lot, lot))

        return {
            "valid": True,
            "symbol": symbol,
            "direction": direction.upper(),
            "entry_price": entry_price,
            "sl_price": round(sl_price, 5),
            "sl_pips": round(sl_pips, 2),
            "lot_size": round(lot, 2),
            "risk_amount": round(risk_amount, 2),
            "spread_pips": current_spread_pips
        }


class ScalperHandler:
    """
    Coordinator handler for evaluating M1/M5 Liquidity Void & Reversal Scalper signals.
    """

    @classmethod
    def evaluate_market(
        cls,
        candles: List[Dict[str, Any]],
        state: Dict[str, Any],
        symbol: str = "EURUSD",
        current_spread_pips: float = 0.8,
        account_balance: float = 1000.0,
        risk_percent: float = 1.0,
        atr_period: int = 14,
        vol_period: int = 20,
        atr_multiplier: float = 2.5,
        vol_multiplier: float = 3.0,
        min_wick_ratio: float = 0.40
    ) -> Dict[str, Any]:
        """
        Evaluates the latest candle stream for a strategy instance.
        """
        if not candles or len(candles) < max(atr_period, vol_period) + 1:
            return {"action": "HOLD", "state": state, "reason": "Insufficient candles"}

        df = pd.DataFrame(candles)
        df['high'] = df['high'].astype(float)
        df['low'] = df['low'].astype(float)
        df['open'] = df['open'].astype(float)
        df['close'] = df['close'].astype(float)
        if 'volume' not in df.columns and 'tick_volume' in df.columns:
            df['volume'] = df['tick_volume'].astype(float)
        else:
            df['volume'] = df.get('volume', pd.Series(0, index=df.index)).astype(float)

        atr_series = ExhaustionDetector.calculate_atr(df, period=atr_period)
        vol_series = ExhaustionDetector.calculate_volume_sma(df, period=vol_period)

        last_closed_candle = candles[-2]
        atr_val = float(atr_series.iloc[-2]) if not np.isnan(atr_series.iloc[-2]) else 0.0
        vol_val = float(vol_series.iloc[-2]) if not np.isnan(vol_series.iloc[-2]) else 0.0

        exhaustion_info = ExhaustionDetector.evaluate_candle(
            candle=last_closed_candle,
            atr_14=atr_val,
            vol_sma_20=vol_val,
            atr_multiplier=atr_multiplier,
            vol_multiplier=vol_multiplier,
            min_wick_ratio=min_wick_ratio
        )

        # Compute diagnostics on the last completed candle
        candle_high = float(last_closed_candle.get('high', 0))
        candle_low = float(last_closed_candle.get('low', 0))
        candle_open = float(last_closed_candle.get('open', 0))
        candle_close = float(last_closed_candle.get('close', 0))
        candle_vol = float(last_closed_candle.get('volume', last_closed_candle.get('tick_volume', 0)))

        c_range = candle_high - candle_low
        c_body_top = max(candle_open, candle_close)
        c_body_bottom = min(candle_open, candle_close)
        c_upper_wick = candle_high - c_body_top
        c_lower_wick = c_body_bottom - candle_low
        c_upper_wick_pct = (c_upper_wick / c_range * 100) if c_range > 0 else 0
        c_lower_wick_pct = (c_lower_wick / c_range * 100) if c_range > 0 else 0
        range_atr_ratio = (c_range / atr_val) if atr_val > 0 else 0
        vol_ratio = (candle_vol / vol_val) if vol_val > 0 else 0

        pip_size = get_pip_size(symbol, candle_close)
        range_pips = c_range / pip_size if pip_size > 0 else 0
        atr_pips = atr_val / pip_size if pip_size > 0 else 0

        diagnostics = {
            "symbol": symbol,
            "candle_time": last_closed_candle.get("time"),
            "candle_close": candle_close,
            "range_pips": round(range_pips, 2),
            "atr_14_pips": round(atr_pips, 2),
            "range_atr_ratio": round(range_atr_ratio, 2),
            "target_atr_ratio": atr_multiplier,
            "candle_volume": round(candle_vol, 1),
            "volume_sma_20": round(vol_val, 1),
            "vol_ratio": round(vol_ratio, 2),
            "target_vol_ratio": vol_multiplier,
            "upper_wick_pct": round(c_upper_wick_pct, 1),
            "lower_wick_pct": round(c_lower_wick_pct, 1),
            "target_wick_pct": round(min_wick_ratio * 100, 1),
            "spread_pips": round(current_spread_pips, 2),
            "candles_analyzed": len(candles)
        }

        # Terminal & SSE streaming log
        log_msg = f"[{symbol}] Checked last candle (Close: {candle_close:.5f}) | Range: {range_pips:.1f}p ({range_atr_ratio:.1f}x ATR) | Vol: {candle_vol:.0f} ({vol_ratio:.1f}x SMA) | UpperWick: {c_upper_wick_pct:.0f}%, LowerWick: {c_lower_wick_pct:.0f}% | Spread: {current_spread_pips:.2f}p | Exhaustion: {exhaustion_info.get('is_exhaustion', False)}"
        logPrint(log_msg, category="Scalper", level="INFO")

        # Check if an exhaustion candle was just discovered
        if exhaustion_info and exhaustion_info.get("is_exhaustion"):
            spike_time = exhaustion_info.get("spike_time")
            last_notified_spike = state.get("last_notified_spike")

            if spike_time and spike_time != last_notified_spike:
                state["last_notified_spike"] = spike_time
                dir_emoji = "🟢 📈 BULLISH" if exhaustion_info.get("direction") == "BUY" else "🔴 📉 BEARISH"
                wick_pct = (exhaustion_info.get('lower_wick_ratio', 0) if exhaustion_info.get('direction') == 'BUY' else exhaustion_info.get('upper_wick_ratio', 0)) * 100

                discord_msg = (
                    f"⚡ **M1 Liquidity Void / Exhaustion Spike Detected!**\n"
                    f"📊 **Symbol:** `{symbol}`\n"
                    f"🧭 **Impulse Direction:** {dir_emoji}\n"
                    f"📏 **Range:** `{range_pips:.1f} pips` (`{range_atr_ratio:.1f}x ATR`)\n"
                    f"📦 **Volume:** `{candle_vol:.0f}` (`{vol_ratio:.1f}x SMA`)\n"
                    f"🕯️ **Rejection Wick:** `{wick_pct:.1f}%`\n"
                    f"🎯 **50% Retracement Target:** `{exhaustion_info.get('retracement_50', 0):.5f}`\n"
                    f"🛡️ **Spread:** `{current_spread_pips:.2f} pips`\n"
                    f"⏳ **Status:** `ARMED` (Awaiting confirmation breakout)"
                )

                try:
                    from notification_handler import NotificationHandler
                    NotificationHandler.send_notification(discord_msg, sound_type="alert")
                    NotificationHandler.send_web_push(
                        title=f"⚡ {exhaustion_info.get('direction')} Exhaustion: {symbol}",
                        body=f"Range: {range_pips:.1f}p ({range_atr_ratio:.1f}x ATR) | Wick: {wick_pct:.0f}% | Awaiting breakout",
                        url="/dashboard"
                    )
                    logPrint(f"🔔 Sent Discord & Mobile Push notification for {symbol} exhaustion spike at {candle_close:.5f}", category="Scalper", level="INFO")
                except Exception as notif_err:
                    logPrint(f"Failed to dispatch scalper notification: {notif_err}", category="Scalper", level="WARNING")

        current_candle = candles[-1]
        should_buy, should_sell, updated_state = SignalEngine.process_step(
            current_candle=current_candle,
            state=state,
            exhaustion_info=exhaustion_info
        )

        if should_buy or should_sell:
            direction = "BUY" if should_buy else "SELL"
            entry_price = float(current_candle.get('close', 0))
            spike_high = float(updated_state.get('spike_high', entry_price))
            spike_low = float(updated_state.get('spike_low', entry_price))

            risk_eval = RiskManager.evaluate_risk(
                symbol=symbol,
                direction=direction,
                entry_price=entry_price,
                spike_high=spike_high,
                spike_low=spike_low,
                account_balance=account_balance,
                current_spread_pips=current_spread_pips,
                risk_percent=risk_percent
            )

            if risk_eval.get("valid"):
                return {
                    "action": direction,
                    "state": updated_state,
                    "diagnostics": diagnostics,
                    "trade_params": {
                        **risk_eval,
                        "retracement_50": updated_state.get("retracement_50"),
                        "max_hold_seconds": 480
                    }
                }
            else:
                return {
                    "action": "HOLD",
                    "state": updated_state,
                    "diagnostics": diagnostics,
                    "reason": risk_eval.get("reason", "Risk check failed")
                }

        return {
            "action": "HOLD",
            "state": updated_state,
            "diagnostics": diagnostics,
            "exhaustion_info": exhaustion_info if exhaustion_info.get("is_exhaustion") else None
        }

    @classmethod
    def run_scalper_backtest(
        cls,
        candles: list,
        symbol: str = "EURUSD",
        initial_balance: float = 1000.0,
        risk_percent: float = 1.0,
        atr_multiplier: float = 2.5,
        vol_multiplier: float = 3.0,
        min_wick_ratio: float = 0.40,
        max_spread_pips: float = 1.2,
        hard_stop_minutes: int = 8,
        progress_callback = None
    ) -> dict:
        """
        Simulates the M1/M5 Liquidity Void & Reversal Scalper across historical candles.
        Tracks all triggered signals, BE transitions, 50% impulse partial closes, and 8-min hard time stops.
        """
        if not candles or len(candles) < 35:
            return {"status": "error", "message": "Insufficient candles for backtesting", "trades": [], "summary": {}}

        df = pd.DataFrame(candles)
        df['high'] = df['high'].astype(float)
        df['low'] = df['low'].astype(float)
        df['open'] = df['open'].astype(float)
        df['close'] = df['close'].astype(float)
        if 'volume' not in df.columns and 'tick_volume' in df.columns:
            df['volume'] = df['tick_volume'].astype(float)
        else:
            df['volume'] = df.get('volume', pd.Series(0, index=df.index)).astype(float)

        atr_series = ExhaustionDetector.calculate_atr(df, period=14)
        vol_series = ExhaustionDetector.calculate_volume_sma(df, period=20)

        # Annotate candles
        for idx, c in enumerate(candles):
            c['atr'] = float(atr_series.iloc[idx]) if not np.isnan(atr_series.iloc[idx]) else 0.0
            c['vol_sma'] = float(vol_series.iloc[idx]) if not np.isnan(vol_series.iloc[idx]) else 0.0

        state = {}
        active_trades = []
        completed_trades = []
        triggered_candles = []
        current_balance = initial_balance
        pip_size = get_pip_size(symbol, float(candles[0].get('close', 1.0)))
        lot_mult = get_lot_size(symbol)

        total_candles = len(candles)
        for i in range(25, total_candles):
            if progress_callback and i % 500 == 0:
                progress_callback(int((i / total_candles) * 100))

            closed_candle = candles[i - 1]
            curr_candle = candles[i]
            c_time = int(curr_candle.get('time', 0))
            c_high = float(curr_candle.get('high', 0))
            c_low = float(curr_candle.get('low', 0))
            c_close = float(curr_candle.get('close', 0))

            # 1. Manage active trades on current bar
            remaining_trades = []
            for tr in active_trades:
                entry_p = tr['entry_price']
                sl_p = tr['sl_price']
                tp_p = tr['tp_price']
                direction = tr['type']
                qty = tr['qty']
                hold_sec = c_time - int(tr['entry_timestamp'])
                is_be = tr.get('is_be', False)
                partial_closed = tr.get('partial_closed', False)

                # Check BE trigger (+3 pips profit)
                if not is_be:
                    if direction == 'BUY' and (c_high - entry_p) >= (3.0 * pip_size):
                        tr['sl_price'] = entry_p
                        tr['is_be'] = True
                        is_be = True
                        sl_p = entry_p
                    elif direction == 'SELL' and (entry_p - c_low) >= (3.0 * pip_size):
                        tr['sl_price'] = entry_p
                        tr['is_be'] = True
                        is_be = True
                        sl_p = entry_p

                # Check 50% impulse partial TP
                if not partial_closed and tp_p is not None:
                    should_partial = False
                    if direction == 'BUY' and c_high >= tp_p:
                        should_partial = True
                    elif direction == 'SELL' and c_low <= tp_p:
                        should_partial = True

                    if should_partial:
                        partial_qty = round(qty * 0.5, 2)
                        pnl_partial = (tp_p - entry_p) * (partial_qty * lot_mult) if direction == 'BUY' else (entry_p - tp_p) * (partial_qty * lot_mult)
                        current_balance += pnl_partial
                        tr['realized_pnl'] = tr.get('realized_pnl', 0.0) + pnl_partial
                        tr['qty'] = round(qty - partial_qty, 2)
                        tr['partial_closed'] = True

                # Check Stop Loss
                sl_hit = False
                exit_price = 0.0
                if direction == 'BUY' and c_low <= sl_p:
                    sl_hit = True
                    exit_price = sl_p
                elif direction == 'SELL' and c_high >= sl_p:
                    sl_hit = True
                    exit_price = sl_p

                if sl_hit:
                    rem_qty = tr['qty']
                    pnl_rem = (exit_price - entry_p) * (rem_qty * lot_mult) if direction == 'BUY' else (entry_p - exit_price) * (rem_qty * lot_mult)
                    total_pnl = tr.get('realized_pnl', 0.0) + pnl_rem
                    current_balance += pnl_rem
                    tr.update({
                        'exit_time': c_time,
                        'exit_price': exit_price,
                        'exit_reason': 'Break-Even Hit' if is_be else 'Stop-Loss Hit',
                        'pnl': round(total_pnl, 2),
                        'return_pct': round((total_pnl / initial_balance) * 100, 2),
                        'is_winner': total_pnl > 0
                    })
                    completed_trades.append(tr)
                    continue

                # Check Hard Time Stop (e.g. 8 minutes)
                if hold_sec >= (hard_stop_minutes * 60):
                    rem_qty = tr['qty']
                    exit_price = c_close
                    pnl_rem = (exit_price - entry_p) * (rem_qty * lot_mult) if direction == 'BUY' else (entry_p - exit_price) * (rem_qty * lot_mult)
                    total_pnl = tr.get('realized_pnl', 0.0) + pnl_rem
                    current_balance += pnl_rem
                    tr.update({
                        'exit_time': c_time,
                        'exit_price': exit_price,
                        'exit_reason': f'Hard Time Stop ({hard_stop_minutes}m)',
                        'pnl': round(total_pnl, 2),
                        'return_pct': round((total_pnl / initial_balance) * 100, 2),
                        'is_winner': total_pnl > 0
                    })
                    completed_trades.append(tr)
                    continue

                remaining_trades.append(tr)

            active_trades = remaining_trades

            # 2. Evaluate for new exhaustion trigger
            atr_v = float(atr_series.iloc[i - 1]) if not np.isnan(atr_series.iloc[i - 1]) else 0.0
            vol_v = float(vol_series.iloc[i - 1]) if not np.isnan(vol_series.iloc[i - 1]) else 0.0

            exhaustion_info = ExhaustionDetector.evaluate_candle(
                candle=closed_candle,
                atr_14=atr_v,
                vol_sma_20=vol_v,
                atr_multiplier=atr_multiplier,
                vol_multiplier=vol_multiplier,
                min_wick_ratio=min_wick_ratio
            )

            if exhaustion_info.get("is_exhaustion"):
                closed_candle['is_spike'] = True
                closed_candle['spike_direction'] = exhaustion_info.get("direction")
                closed_candle['retracement_50'] = exhaustion_info.get("retracement_50")
                triggered_candles.append(dict(closed_candle))

            should_buy, should_sell, state = SignalEngine.process_step(
                current_candle=curr_candle,
                state=state,
                exhaustion_info=exhaustion_info
            )

            if should_buy or should_sell:
                direction = "BUY" if should_buy else "SELL"
                entry_price = c_close
                spike_h = float(state.get('spike_high', entry_price))
                spike_l = float(state.get('spike_low', entry_price))

                risk_res = RiskManager.evaluate_risk(
                    symbol=symbol,
                    direction=direction,
                    entry_price=entry_price,
                    spike_high=spike_h,
                    spike_low=spike_l,
                    account_balance=current_balance,
                    current_spread_pips=0.8,
                    risk_percent=risk_percent,
                    max_spread_pips=max_spread_pips
                )

                if risk_res.get("valid"):
                    curr_candle['is_entry'] = True
                    curr_candle['entry_direction'] = direction

                    trade_obj = {
                        'id': len(completed_trades) + len(active_trades) + 1,
                        'symbol': symbol,
                        'type': direction,
                        'entry_time': c_time,
                        'entry_timestamp': c_time,
                        'entry_price': entry_price,
                        'sl_price': risk_res['sl_price'],
                        'original_sl': risk_res['sl_price'],
                        'tp_price': state.get('retracement_50'),
                        'qty': risk_res['lot_size'],
                        'risk_usd': risk_res['risk_amount'],
                        'is_be': False,
                        'partial_closed': False,
                        'realized_pnl': 0.0
                    }
                    active_trades.append(trade_obj)

        # Close any remaining open trades at final close price
        if active_trades and len(candles) > 0:
            final_c = candles[-1]
            final_time = int(final_c.get('time', 0))
            final_close = float(final_c.get('close', 0))
            for tr in active_trades:
                entry_p = tr['entry_price']
                direction = tr['type']
                rem_qty = tr['qty']
                pnl_rem = (final_close - entry_p) * (rem_qty * lot_mult) if direction == 'BUY' else (entry_p - final_close) * (rem_qty * lot_mult)
                total_pnl = tr.get('realized_pnl', 0.0) + pnl_rem
                current_balance += pnl_rem
                tr.update({
                    'exit_time': final_time,
                    'exit_price': final_close,
                    'exit_reason': 'Backtest Ended',
                    'pnl': round(total_pnl, 2),
                    'return_pct': round((total_pnl / initial_balance) * 100, 2),
                    'is_winner': total_pnl > 0
                })
                completed_trades.append(tr)

        # Summary statistics
        total_trades = len(completed_trades)
        wins = [t for t in completed_trades if t.get('is_winner')]
        losses = [t for t in completed_trades if not t.get('is_winner')]
        win_rate = (len(wins) / total_trades * 100) if total_trades > 0 else 0.0
        net_profit = current_balance - initial_balance
        pnl_pct = (net_profit / initial_balance * 100) if initial_balance > 0 else 0.0

        summary = {
            "total_trades": total_trades,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(win_rate, 2),
            "initial_balance": initial_balance,
            "final_balance": round(current_balance, 2),
            "net_profit": round(net_profit, 2),
            "pnl_pct": round(pnl_pct, 2),
            "triggered_spikes_count": len(triggered_candles)
        }

        return {
            "status": "success",
            "summary": summary,
            "trades": completed_trades,
            "triggered_candles": triggered_candles[-50:],  # Save last 50 triggered spike candles for chart inspection
            "annotated_candles": candles[-5000:] if len(candles) > 5000 else candles
        }

