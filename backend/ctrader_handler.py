import threading

class CTraderHandler:
    _lock = threading.Lock()
    
    # Mock databases/states in memory
    _account = {
        "balance": 100000.0,
        "equity": 100000.0,
        "margin": 0.0,
        "margin_free": 100000.0,
        "currency": "USD",
        "account_type": "demo",
        "broker": "cTrader Mock Server"
    }
    
    _positions = []
    _next_position_id = 1001

    @classmethod
    def get_account(cls) -> dict:
        with cls._lock:
            # Recalculate equity and free margin based on unrealized PnL
            unrealized = sum(p["unrealized_profit"] for p in cls._positions)
            cls._account["equity"] = cls._account["balance"] + unrealized
            cls._account["margin_free"] = cls._account["equity"] - cls._account["margin"]
            return {"status": "success", "data": cls._account}

    @classmethod
    def get_positions(cls) -> dict:
        with cls._lock:
            return {"status": "success", "data": cls._positions}

    @classmethod
    def create_order(cls, symbol: str, side: str, volume: float, price: float = None) -> dict:
        with cls._lock:
            # Basic validation
            if volume <= 0:
                return {"status": "error", "message": "Volume must be greater than 0"}

            # Simulated entry price if none provided (e.g. market order)
            entry = price if price is not None else 57450.0

            # Deduct mock margin or simulate execution
            # Let's say margin is 1% of the notional value
            notional = volume * entry
            margin_required = notional * 0.01

            if cls._account["margin_free"] < margin_required:
                return {"status": "error", "message": "Insufficient margin"}

            # Create position
            position = {
                "position_id": cls._next_position_id,
                "symbol": symbol,
                "trade_side": side.upper(),
                "volume": volume,
                "entry_price": entry,
                "unrealized_profit": 0.0
            }
            cls._next_position_id += 1
            cls._positions.append(position)

            # Update account
            cls._account["margin"] += margin_required
            cls._account["margin_free"] = cls._account["equity"] - cls._account["margin"]

            return {"status": "success", "message": "Order executed successfully"}
