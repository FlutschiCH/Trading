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
        
        # 1. Calculate sl_distance
        if sl_type == 'pct':
            sl_distance = entry_price * (sl_val / 100.0)
        elif sl_type in ('amount', '$', 'dollar'):
            qty = size if size > 0 else 1.0
            sl_distance = sl_val / (qty * lot_size) if lot_size > 0 else sl_val
        elif sl_type == 'pips':
            sl_distance = sl_val * pip_size
        elif sl_type in ('atr', 'xatr'):
            sl_distance = (sl_val * atr_val) if atr_val > 0 else (sl_val * pip_size if pip_size > 0 else sl_val)
        else: # 'price' / direct price distance
            sl_distance = sl_val

        # 2. Calculate sl_price & tp_price
        if direction == 'BUY':
            sl_price = round(entry_price - sl_distance, precision)
            tp_price = round(entry_price + sl_distance * rr, precision)
        else:
            sl_price = round(entry_price + sl_distance, precision)
            tp_price = round(entry_price - sl_distance * rr, precision)

        # 3. Calculate position size (trade_qty)
        trade_qty = size
        if use_risk_sizing:
            risk_amount = balance * (risk_pct / 100.0)
            trade_qty = (risk_amount / (sl_distance * lot_size)) if (sl_distance > 0 and lot_size > 0) else size

        return {
            "entry_price": entry_price,
            "sl_price": sl_price,
            "tp_price": tp_price,
            "qty": trade_qty,
            "sl_distance": sl_distance
        }
