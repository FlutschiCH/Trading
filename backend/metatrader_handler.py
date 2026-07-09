import os
import logging

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    logging.warning("MetaTrader5 package is not installed or not supported on this platform. Running in mock/simulation mode.")

class MetaTraderHandler:
    def __init__(self):
        self.connected = False
        self.mock_positions = []
        self.mock_account_info = {
            "balance": 10000.0,
            "equity": 10000.0,
            "margin": 0.0,
            "margin_free": 10000.0,
            "currency": "USD",
            "lever": 100,
            "server": "Demo-Server",
            "login": 12345678
        }

    def connect(self, login=None, password=None, server=None):
        if not MT5_AVAILABLE:
            self.connected = True
            return {"status": "success", "message": "Connected to MetaTrader Mock Server successfully.", "mock": True}

        # Try to initialize MT5
        if not mt5.initialize():
            return {"status": "error", "message": f"initialize() failed, error code: {mt5.last_error()}"}

        # If credentials provided, attempt login
        if login and password and server:
            authorized = mt5.login(login=int(login), password=password, server=server)
            if not authorized:
                return {"status": "error", "message": f"login failed, error code: {mt5.last_error()}"}

        self.connected = True
        return {"status": "success", "message": "Successfully connected to MetaTrader 5 Terminal."}

    def get_account_info(self):
        if not self.connected:
            return {"status": "error", "message": "Not connected to MetaTrader."}

        if not MT5_AVAILABLE:
            return {"status": "success", "data": self.mock_account_info}

        account_info = mt5.account_info()
        if account_info is None:
            return {"status": "error", "message": f"Failed to get account info, error code: {mt5.last_error()}"}

        return {
            "status": "success",
            "data": {
                "balance": account_info.balance,
                "equity": account_info.equity,
                "margin": account_info.margin,
                "margin_free": account_info.margin_free,
                "currency": account_info.currency,
                "lever": account_info.leverage,
                "server": account_info.server,
                "login": account_info.login
            }
        }

    def place_order(self, symbol, order_type, volume, price=None, sl=None, tp=None):
        if not self.connected:
            return {"status": "error", "message": "Not connected to MetaTrader."}

        # Ensure correct symbol formatting (e.g. BTCUSD instead of BINANCE:BTCUSDT)
        clean_symbol = symbol.replace("BINANCE:", "").replace("USDT", "")
        if clean_symbol == "BTC":
            clean_symbol = "BTCUSD"
        elif clean_symbol == "ETH":
            clean_symbol = "ETHUSD"

        if not MT5_AVAILABLE:
            # Handle mock order
            execution_price = price if price else 57450.0
            order_id = len(self.mock_positions) + 1000
            new_position = {
                "ticket": order_id,
                "symbol": clean_symbol,
                "type": order_type,
                "volume": volume,
                "price_open": execution_price,
                "sl": sl,
                "tp": tp,
                "profit": 0.0
            }
            self.mock_positions.append(new_position)
            
            # Adjust mock balance
            cost = volume * execution_price * 0.01  # Mock margin cost
            self.mock_account_info["margin"] += cost
            self.mock_account_info["margin_free"] -= cost
            
            return {
                "status": "success", 
                "message": f"Mock Order {order_id} placed successfully.",
                "data": new_position
            }

        # Real MT5 Order Execution
        # Ensure symbol is select-visible
        mt5.symbol_select(clean_symbol, True)
        
        symbol_info = mt5.symbol_info(clean_symbol)
        if symbol_info is None:
            return {"status": "error", "message": f"{clean_symbol} not found"}

        # Prepare request
        action = mt5.TRADE_ACTION_DEAL
        if order_type.lower() == "buy":
            type_mt5 = mt5.ORDER_TYPE_BUY
            price_mt5 = mt5.symbol_info_tick(clean_symbol).ask if price is None else float(price)
        else:
            type_mt5 = mt5.ORDER_TYPE_SELL
            price_mt5 = mt5.symbol_info_tick(clean_symbol).bid if price is None else float(price)

        request = {
            "action": action,
            "symbol": clean_symbol,
            "volume": float(volume),
            "type": type_mt5,
            "price": price_mt5,
            "deviation": 20,
            "magic": 234000,
            "comment": "Sent from NexusTrade Dashboard",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        if sl:
            request["sl"] = float(sl)
        if tp:
            request["tp"] = float(tp)

        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"status": "error", "message": f"order_send failed: {result.comment} (retcode: {result.retcode})"}

        return {
            "status": "success",
            "message": "Order executed successfully.",
            "data": {
                "ticket": result.order,
                "volume": result.volume,
                "price": result.price
            }
        }

    def get_positions(self):
        if not self.connected:
            return {"status": "error", "message": "Not connected to MetaTrader."}

        if not MT5_AVAILABLE:
            return {"status": "success", "data": self.mock_positions}

        positions = mt5.positions_get()
        if positions is None:
            return {"status": "error", "message": f"Failed to get positions, error code: {mt5.last_error()}"}

        result = []
        for pos in positions:
            result.append({
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "buy" if pos.type == mt5.ORDER_TYPE_BUY else "sell",
                "volume": pos.volume,
                "price_open": pos.price_open,
                "sl": pos.sl,
                "tp": pos.tp,
                "profit": pos.profit
            })
        return {"status": "success", "data": result}
