class TradingHandler:
    @staticmethod
    def calculate_trade_parameters(
        symbol: str,
        entry_price: float,
        direction: str,  # 'BUY' or 'SELL'
        sl_type: str,    # 'pct', 'price', 'pips', 'amount', 'dollar', or 'atr'
        sl_val: float,   # stop loss value or ATR multiplier
        rr: float,       # risk reward ratio
        size: float,     # default size/volume
        use_risk_sizing: bool,
        risk_pct: float,
        balance: float,
        lot_size: float,
        pip_size: float,
        precision: int = 2,
        atr_val: float = 0.0
    ) -> dict:
        """
        Calculates entry, stop loss, take profit prices and trade quantity (lot size) based on risk parameters.
        Raises ValueError if parameters or resulting prices are invalid (e.g. negative SL).
        """
        direction = str(direction).upper().strip() if direction else 'BUY'
        sl_type_str = str(sl_type).lower().strip() if sl_type else 'price'
        sl_val = float(sl_val) if sl_val is not None else 1.0
        rr = float(rr) if rr is not None else 2.0
        entry_price = float(entry_price) if entry_price is not None else 0.0
        pip_size = float(pip_size) if pip_size is not None and float(pip_size) > 0 else 0.0001
        lot_size = float(lot_size) if lot_size is not None and float(lot_size) > 0 else 1.0
        atr_val = float(atr_val) if atr_val is not None else 0.0
        
        if entry_price <= 0:
            raise ValueError(f"Invalid entry price ({entry_price}) for {symbol}")
        if sl_val <= 0:
            raise ValueError(f"Stop loss value must be positive, got {sl_val}")
        if rr <= 0:
            raise ValueError(f"Risk:Reward ratio must be positive, got {rr}")

        # 1. Calculate sl_distance strictly according to chosen SL type
        if sl_type_str in ('pct', 'percent', 'percentage'):
            sl_distance = entry_price * (sl_val / 100.0)
        elif sl_type_str in ('amount', '$', 'dollar', 'risk'):
            qty = size if size > 0 else 1.0
            if lot_size <= 0:
                raise ValueError(f"Invalid lot size ({lot_size}) for dollar risk sizing on {symbol}")
            sl_distance = sl_val / (qty * lot_size)
        elif sl_type_str in ('pips', 'pip', 'points'):
            if pip_size <= 0:
                raise ValueError(f"Invalid pip size ({pip_size}) for pips SL mode on {symbol}")
            sl_distance = sl_val * pip_size
        elif sl_type_str in ('atr', 'xatr'):
            if atr_val <= 0:
                raise ValueError(f"ATR value unavailable ({atr_val}) for ATR SL mode on {symbol}. Ensure historical candles are loaded.")
            sl_distance = sl_val * atr_val
        elif sl_type_str == 'price':
            sl_distance = sl_val
        else:
            raise ValueError(f"Unsupported or missing stop loss type: '{sl_type}'")

        if sl_distance <= 0:
            raise ValueError(f"Calculated non-positive SL distance ({sl_distance}) on {symbol}")

        # 2. Calculate sl_price & tp_price
        if direction == 'BUY':
            sl_price = round(entry_price - sl_distance, precision)
            tp_price = round(entry_price + sl_distance * rr, precision)
            if sl_price <= 0:
                raise ValueError(
                    f"Negative or zero Stop Loss calculated ({sl_price:.5f}) for BUY on {symbol}! "
                    f"Entry={entry_price:.5f}, SL Distance={sl_distance:.5f} (Mode: '{sl_type_str}', Value: {sl_val}). "
                    f"Please change SL Mode to 'pips' or 'xATR', or enter a valid price delta."
                )
        elif direction == 'SELL':
            sl_price = round(entry_price + sl_distance, precision)
            tp_price = round(entry_price - sl_distance * rr, precision)
            if tp_price <= 0:
                raise ValueError(
                    f"Negative or zero Take Profit calculated ({tp_price:.5f}) for SELL on {symbol}! "
                    f"Entry={entry_price:.5f}, TP Distance={sl_distance * rr:.5f} (Mode: '{sl_type_str}', Value: {sl_val}, RR: {rr})."
                )
        else:
            raise ValueError(f"Invalid direction: '{direction}'")

        # 3. Calculate position size (trade_qty)
        if use_risk_sizing:
            trade_qty = TradingHandler.calculate_lot_size(
                balance=balance,
                risk_pct=risk_pct,
                sl_distance=sl_distance,
                lot_size=lot_size
            )
        else:
            trade_qty = size

        return {
            "entry_price": entry_price,
            "sl_price": sl_price,
            "tp_price": tp_price,
            "qty": trade_qty,
            "sl_distance": sl_distance
        }

    @staticmethod
    def calculate_lot_size(
        balance: float,
        risk_pct: float = None,
        risk_amount: float = None,
        sl_distance: float = 0.0,
        lot_size: float = 1.0,
        min_lot: float = 0.01
    ) -> float:
        """
        Single central function to calculate lot size from risk and SL distance.
        Accepts either risk_pct (% of balance) or direct risk_amount ($ value).
        """
        if sl_distance <= 0:
            raise ValueError(f"sl_distance must be > 0 (got {sl_distance})")
        if lot_size <= 0:
            raise ValueError(f"lot_size must be > 0 (got {lot_size})")

        if risk_amount is None or float(risk_amount) <= 0:
            if risk_pct is None or float(risk_pct) <= 0:
                raise ValueError("Either risk_amount ($) or risk_pct (%) must be provided and > 0")
            risk_amount = float(balance) * (float(risk_pct) / 100.0)
        else:
            risk_amount = float(risk_amount)

        raw_qty = risk_amount / (float(sl_distance) * float(lot_size))
        return max(min_lot, round(raw_qty, 2))

