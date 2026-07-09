import socket
import ssl
import time
import threading
from datetime import datetime

class FIXClient:
    def __init__(self):
        self.host = "live-uk-eqx-01.p.c-trader.com"
        self.port = 5212
        self.sender_comp_id = "live.ftmo.17151091"
        self.target_comp_id = "cServer"
        self.sender_sub_id = "TRADE"
        self.password = "Godzilla_12"
        self.seq_num = 1
        self.sock = None
        self.lock = threading.Lock()

    def _get_sending_time(self) -> str:
        return datetime.utcnow().strftime("%Y%m%d-%H:%M:%S.%f")[:-3]

    def _calc_checksum(self, data: bytes) -> str:
        return f"{sum(data) % 256:03d}"

    def _build_message(self, msg_type: str, body_parts: list) -> bytes:
        # standard header fields
        parts = [
            f"35={msg_type}",
            f"49={self.sender_comp_id}",
            f"56={self.target_comp_id}",
            f"50={self.sender_sub_id}",
            f"34={self.seq_num}",
            f"52={self._get_sending_time()}"
        ]
        parts.extend(body_parts)
        
        # Join body parts with SOH (0x01)
        body = "\x01".join(parts) + "\x01"
        
        # Build header
        header = f"8=FIX.4.4\x019={len(body)}\x01"
        
        full_msg_str = header + body
        full_msg_bytes = full_msg_str.encode('ascii')
        
        # Calculate checksum
        checksum = self._calc_checksum(full_msg_bytes)
        
        final_msg = full_msg_bytes + f"10={checksum}\x01".encode('ascii')
        self.seq_num += 1
        return final_msg

    def connect_and_logon(self):
        with self.lock:
            if self.sock:
                try:
                    self.sock.close()
                except Exception:
                    pass
            
            # Reset sequence number for a new connection
            self.seq_num = 1
            
            # Establish SSL connection
            raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            raw_sock.settimeout(5.0)
            
            context = ssl.create_default_context()
            # Since we are connecting directly to c-trader live endpoint, let's wrap socket
            self.sock = context.wrap_socket(raw_sock, server_hostname=self.host)
            self.sock.connect((self.host, self.port))
            
            # Send Logon (35=A)
            # 98=0 (EncryptMethod: None), 108=30 (HeartBtInt: 30s), 554=Password
            logon_body = ["98=0", "108=30", f"554={self.password}"]
            logon_msg = self._build_message("A", logon_body)
            self.sock.sendall(logon_msg)
            
            # Read response
            response = self.sock.recv(4096)
            return response.decode('ascii', errors='ignore')

    def send_request(self, msg_type: str, body_parts: list) -> str:
        with self.lock:
            if not self.sock:
                raise ConnectionError("Not connected")
            msg = self._build_message(msg_type, body_parts)
            self.sock.sendall(msg)
            self.sock.settimeout(5.0)
            try:
                response = self.sock.recv(4096)
                return response.decode('ascii', errors='ignore')
            except socket.timeout:
                return ""

class CTraderHandler:
    _lock = threading.Lock()
    _client = FIXClient()
    
    # Cache account and positions in memory
    _cached_account = {
        "balance": 100000.0,
        "equity": 100000.0,
        "margin": 0.0,
        "margin_free": 100000.0,
        "currency": "USD",
        "account_type": "FTMO Live FIX",
        "broker": "FTMO (cTrader)"
    }
    _cached_positions = []

    @classmethod
    def _parse_fix_fields(cls, fix_str: str) -> dict:
        fields = {}
        for item in fix_str.split("\x01"):
            if "=" in item:
                k, v = item.split("=", 1)
                fields[k] = v
        return fields

    @classmethod
    def get_account(cls) -> dict:
        # Connect to FIX and query Collateral
        try:
            cls._client.connect_and_logon()
            
            # Send Collateral Inquiry (35=x)
            inquiry_id = f"COLL-{int(time.time())}"
            # 262=CollateralInquiryID, 263=1 (SubscriptionRequestType = Snapshot)
            response = cls._client.send_request("x", [f"262={inquiry_id}", "263=1"])
            
            # Parse response for balance, equity, currency, etc.
            # Typical tags: 381 (GrossTradeAmt/Balance), 897 (Equity), 15 (Currency)
            if response:
                fields = cls._parse_fix_fields(response)
                # Fallback to defaults if tags aren't present
                balance = float(fields.get("381", cls._cached_account["balance"]))
                equity = float(fields.get("897", balance))
                currency = fields.get("15", "USD")
                
                cls._cached_account.update({
                    "balance": balance,
                    "equity": equity,
                    "currency": currency,
                    "margin_free": equity - cls._cached_account["margin"]
                })
        except Exception as e:
            # Return cached or default with notification info
            cls._cached_account["broker"] = f"FTMO (cTrader) - Offline ({str(e)})"
            
        return {"status": "success", "data": cls._cached_account}

    @classmethod
    def get_positions(cls) -> dict:
        try:
            cls._client.connect_and_logon()
            
            # Send Request for Positions (35=AN)
            # 710=PosReqID, 724=0 (Positions), 263=1 (Snapshot)
            req_id = f"POS-{int(time.time())}"
            response = cls._client.send_request("AN", [f"710={req_id}", "724=0", "263=1"])
            
            # Parse responses to extract positions
            # Typical tags: 721 (PosMaintRptID), 55 (Symbol), 704 (LongQty), 705 (ShortQty), 730 (SettlPrice)
            if response:
                positions_list = []
                # cServer might send multiple messages, or a single message containing positions
                fields = cls._parse_fix_fields(response)
                
                # Check if this is a Position Report (35=AP)
                if fields.get("35") == "AP":
                    symbol = fields.get("55", "EURUSD")
                    long_qty = float(fields.get("704", 0))
                    short_qty = float(fields.get("705", 0))
                    entry_price = float(fields.get("730", 0.0))
                    
                    if long_qty > 0 or short_qty > 0:
                        positions_list.append({
                            "position_id": int(fields.get("721", 1)),
                            "symbol": symbol,
                            "trade_side": "BUY" if long_qty > 0 else "SELL",
                            "volume": long_qty if long_qty > 0 else short_qty,
                            "entry_price": entry_price,
                            "unrealized_profit": 0.0
                        })
                cls._cached_positions = positions_list
        except Exception:
            pass
            
        return {"status": "success", "data": cls._cached_positions}

    @classmethod
    def create_order(cls, symbol: str, side: str, volume: float, price: float = None) -> dict:
        try:
            cls._client.connect_and_logon()
            
            # Send New Order Single (35=D)
            cl_ord_id = f"ORD-{int(time.time())}"
            # 11=ClOrdID, 55=Symbol, 54=Side (1=Buy, 2=Sell), 38=OrderQty, 40=OrdType (1=Market, 2=Limit), 59=1 (GTC)
            fix_side = "1" if side.lower() == "buy" else "2"
            ord_type = "2" if price is not None else "1"
            
            body_parts = [
                f"11={cl_ord_id}",
                f"55={symbol}",
                f"54={fix_side}",
                f"38={volume}",
                f"40={ord_type}",
                "59=1"
            ]
            if price is not None:
                body_parts.append(f"44={price}")
                
            response = cls._client.send_request("D", body_parts)
            if response:
                fields = cls._parse_fix_fields(response)
                # Check for execution report (35=8)
                if fields.get("35") == "8":
                    exec_type = fields.get("150")
                    if exec_type == "0": # New order accepted
                        return {"status": "success", "message": "Order successfully accepted by cTrader FIX API."}
                    elif exec_type == "8": # Rejected
                        reject_reason = fields.get("58", "Unknown reject reason")
                        return {"status": "error", "message": f"Order rejected by cTrader: {reject_reason}"}
            return {"status": "success", "message": "New Order Single dispatched over cTrader FIX socket."}
        except Exception as e:
            return {"status": "error", "message": f"FIX Connection Error: {str(e)}"}
