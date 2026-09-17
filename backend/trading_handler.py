class TradingHandler:
    @staticmethod
    def calculate_trade_parameters(
        symbol: str,
        entry_price: float,
        direction: str,  # 'BUY' or 'SELL'
        sl_type: str,    # 'pct', 'price', 'amount', or 'atr'
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
        """
        direction = direction.upper()
        
        # 1. Calculate sl_distance strictly based on sl_type without fallbacks
        sl_type_normalized = (sl_type or '').strip().lower()
        if sl_val is None or float(sl_val) <= 0:
            raise ValueError(f"Invalid stop loss value: {sl_val}")

        sl_val = float(sl_val)

        if sl_type_normalized == 'pct':
            sl_distance = entry_price * (sl_val / 100.0)
        elif sl_type_normalized in ('amount', '$', 'dollar'):
            qty = size if size > 0 else 1.0
            if lot_size <= 0:
                raise ValueError("lot_size must be greater than 0 for amount/dollar stop loss calculation")
            sl_distance = sl_val / (qty * lot_size)
        elif sl_type_normalized == 'pips':
            if pip_size <= 0:
                raise ValueError("pip_size must be greater than 0 for pips stop loss calculation")
            sl_distance = sl_val * pip_size
        elif sl_type_normalized in ('atr', 'xatr'):
            if atr_val is None or float(atr_val) <= 0:
                raise ValueError(f"ATR value is missing or <= 0 ({atr_val}) for ATR stop loss calculation")
            sl_distance = sl_val * float(atr_val)
        elif sl_type_normalized == 'price':
            sl_distance = sl_val
        else:
            raise ValueError(f"Unsupported or missing stop loss type: '{sl_type}'")

        if sl_distance <= 0:
            raise ValueError(f"Calculated stop loss distance must be greater than 0 (got {sl_distance})")

        # 2. Calculate sl_price & tp_price
        if direction == 'BUY':
            sl_price = round(entry_price - sl_distance, precision)
            tp_price = round(entry_price + sl_distance * rr, precision)
        elif direction == 'SELL':
            sl_price = round(entry_price + sl_distance, precision)
            tp_price = round(entry_price - sl_distance * rr, precision)
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

