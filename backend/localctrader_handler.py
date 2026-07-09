import os
import socket
import ssl
import time
import threading
from datetime import datetime

import requests

class LocalTraderHandler:
    def __init__(self):
        self.connected = False
        self.ssl_socket = None
        self.seq_num = 1
        self.heartbeat_interval = 30
        self.last_sent_time = 0
        self.last_received_time = 0
        self.bg_thread = None
        
        # FIX API Credentials
        self.host = "live-uk-eqx-01.p.c-trader.com"
        self.port = 5212
        # Read .env file directly to get credentials
        env_vars = {}
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            env_vars[k.strip()] = v.strip()
            except Exception as e:
                print(f"[FIX] Failed to read .env file directly: {str(e)}")

        self.sender_comp_id = env_vars.get("CTRADER_FIX_SENDER_COMP_ID", "live.ftmo.17151091")
        self.target_comp_id = "CSERVER"
        self.sender_sub_id = "TRADE"
        self.password = env_vars.get("CTRADER_FIX_PASSWORD", "")
        
        self.account_info = {
            "balance": 0.0,
            "equity": 0.0,
            "margin": 0.0,
            "margin_free": 0.0,
            "currency": "USD",
            "broker": "FTMO FIX API"
        }
        self.positions = []
        
        # Automatically connect on startup
        self.connect()

    def format_fix_message(self, msg_type, fields):
        # Base headers
        sending_time = datetime.utcnow().strftime("%Y%m%d-%H:%M:%S.%f")[:-3]
        base_fields = [
            ("8", "FIX.4.4"),
            ("35", msg_type),
            ("49", self.sender_comp_id),
            ("50", self.sender_sub_id),
            ("56", self.target_comp_id),
            ("57", "TRADE"),
            ("34", str(self.seq_num)),
            ("52", sending_time)
        ]
        self.seq_num += 1
        
        # Combine
        all_fields = base_fields + fields
        
        # Calculate body length
        body_str = ""
        for tag, val in all_fields[1:]:
            body_str += f"{tag}={val}\x01"
            
        # Add body length tag 9
        all_fields.insert(1, ("9", str(len(body_str))))
        
        # Full message string without checksum
        full_msg_str = ""
        for tag, val in all_fields:
            full_msg_str += f"{tag}={val}\x01"
            
        # Calculate checksum (tag 10)
        checksum_val = sum(ord(c) for c in full_msg_str) % 256
        checksum_str = f"{checksum_val:03}"
        
        full_message = f"{full_msg_str}10={checksum_str}\x01"
        return full_message.encode('ascii')

    def send_message(self, msg_type, fields):
        if not self.ssl_socket:
            return False
        try:
            raw_msg = self.format_fix_message(msg_type, fields)
            self.ssl_socket.sendall(raw_msg)
            self.last_sent_time = time.time()
            print(f"[FIX OUT] Sent MsgType: {msg_type}")
            return True
        except Exception as e:
            print(f"[FIX ERROR] Failed to send: {str(e)}")
            self.connected = False
            return False

    def connect(self, password=None):
        if password:
            self.password = password
            
        print(f"[FIX] Connecting to SSL gateway {self.host}:{self.port}...")
        try:
            raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            raw_socket.settimeout(5.0)
            context = ssl.create_default_context()
            self.ssl_socket = context.wrap_socket(raw_socket, server_hostname=self.host)
            self.ssl_socket.connect((self.host, self.port))
            
            # Extract numeric account ID for the Username (tag 553)
            numeric_username = "".join(filter(str.isdigit, str(self.sender_comp_id)))
            if not numeric_username:
                numeric_username = "17151091"

            logon_fields = [
                ("98", "0"),  # No encryption
                ("108", str(self.heartbeat_interval)),
                ("553", numeric_username),  # Username (must be numeric integer ID)
                ("554", self.password)  # cTrader password tag
            ]
            
            self.seq_num = 1
            if self.send_message("A", logon_fields):
                self.connected = True
                self.last_received_time = time.time()
                
                # Start background thread to maintain heartbeat and read responses
                if not self.bg_thread or not self.bg_thread.is_alive():
                    self.bg_thread = threading.Thread(target=self.receive_loop, daemon=True)
                    self.bg_thread.start()
                
                return {"status": "success", "message": "FIX Session connected and Logon sent."}
            
            raise Exception("Failed to send Logon message.")
        except Exception as e:
            self.connected = False
            print(f"[FIX CONNECTION ERROR] {str(e)}")
            return {"status": "error", "message": str(e)}

    def receive_loop(self):
        self.ssl_socket.settimeout(1.0)
        buffer = ""
        while self.connected:
            try:
                data = self.ssl_socket.recv(4096)
                if not data:
                    print("[FIX] Connection closed by server.")
                    self.connected = False
                    break
                
                buffer += data.decode('ascii', errors='ignore')
                while "\x01" in buffer:
                    parts = buffer.split("\x01")
                    buffer = parts[-1]
                    fields = parts[:-1]
                    
                    current_msg = {}
                    for field in fields:
                        if "=" not in field:
                            continue
                        k, v = field.split("=", 1)
                        if k == "8" and current_msg:
                            self.handle_parsed_message(current_msg)
                            current_msg = {}
                        current_msg[k] = v
                    if current_msg:
                        self.handle_parsed_message(current_msg)
                            
            except socket.timeout:
                if time.time() - self.last_sent_time > self.heartbeat_interval:
                    self.send_message("0", [])
            except Exception as e:
                print(f"[FIX LOOP ERROR] {str(e)}")
                self.connected = False
                break

    def handle_parsed_message(self, msg):
        msg_type = msg.get("35")
        print(f"[FIX IN] MsgType: {msg_type} fields: {msg}")
        
        # TestRequest (MsgType 1)
        if msg_type == "1":
            self.send_message("0", [])
        # Logon ACK (MsgType A)
        elif msg_type == "A":
            print("[FIX] Logon Acknowledged by server. Sending RequestForPositions (AN)...")
            self.send_position_request()
        # Logout (MsgType 5)
        elif msg_type == "5":
            reason = msg.get("58", "No reason code/text returned by cTrader.")
            print(f"\n[FIX LOGOUT] Server rejected connection. Reason: {reason}\n")
        # Reject (MsgType 3)
        elif msg_type == "3":
            ref_tag = msg.get("371", "Unknown Tag")
            reason = msg.get("58", "No reason provided")
            ref_msg_type = msg.get("372", "Unknown MsgType")
            print(f"\n[FIX REJECT] Server rejected MsgType {ref_msg_type} (tag: {ref_tag}). Reason: {reason}\n")
        # CollateralReport (MsgType B)
        elif msg_type == "B":
            balance = float(msg.get("894", 0.0))
            currency = msg.get("15", "USD")
            self.account_info["balance"] = balance
            self.account_info["equity"] = balance
            self.account_info["margin_free"] = balance
            self.account_info["currency"] = currency
            print(f"[FIX] Real balance updated from CollateralReport: {balance} {currency}")
        # PositionReport (MsgType AP)
        elif msg_type == "AP":
            pos_id = msg.get("721", msg.get("710", "1"))
            symbol = msg.get("55", "EURUSD")
            long_qty = float(msg.get("704", 0.0))
            short_qty = float(msg.get("705", 0.0))
            volume = long_qty if long_qty > 0 else short_qty
            side = "BUY" if long_qty > 0 else "SELL"
            price = float(msg.get("730", 0.0))
            
            if volume > 0:
                exists = False
                for p in self.positions:
                    if p["position_id"] == pos_id:
                        p["volume"] = volume
                        p["entry_price"] = price
                        p["trade_side"] = side
                        exists = True
                        break
                if not exists:
                    self.positions.append({
                        "position_id": int(pos_id) if pos_id.isdigit() else pos_id,
                        "symbol": symbol,
                        "trade_side": side,
                        "volume": volume,
                        "entry_price": price,
                        "unrealized_profit": 0.0
                    })
            else:
                self.positions = [p for p in self.positions if str(p["position_id"]) != str(pos_id)]
            print(f"[FIX] Updated active positions list. Total: {len(self.positions)}")

    def send_position_request(self):
        fields = [
            ("710", f"ReqPos-{int(time.time())}")  # PosReqID
        ]
        self.send_message("AN", fields)

    def get_account_info(self):
        # cTrader's FIX API does not support balance queries.
        return {"status": "success", "data": self.account_info}

    def get_positions(self):
        if self.connected:
            self.send_position_request()
        return {"status": "success", "data": self.positions}

    def place_order(self, symbol, order_type, volume, price=None):
        if not self.connected:
            return {"status": "error", "message": "Not logged in to FIX API."}
            
        clean_symbol = symbol.replace("BINANCE:", "").replace("USDT", "")
        # Submit NewOrderSingle (MsgType D)
        cl_ord_id = f"Nexus-{int(time.time())}"
        side = "1" if order_type.lower() == "buy" else "2"
        
        fields = [
            ("11", cl_ord_id),  # ClOrdID
            ("55", clean_symbol),  # Symbol
            ("54", side),  # Side
            ("60", datetime.utcnow().strftime("%Y%m%d-%H:%M:%S")),  # TransactTime
            ("38", str(volume)),  # OrderQty
            ("40", "1" if price is None else "2"),  # OrdType (1=Market, 2=Limit)
        ]
        if price:
            fields.append(("44", str(price)))
            
        self.send_message("D", fields)
        return {"status": "success", "message": f"FIX Order {cl_ord_id} submitted."}

if __name__ == '__main__':
    # Test connection to the cTrader FIX API SSL gateway directly
    print("\n" + "="*60)
    print("  [FIX TEST] Connecting directly to cTrader FIX API...")
    print("="*60)
    
    handler = LocalTraderHandler()
    
    # Wait for background thread to receive and parse the initial logon response and CollateralReport
    time.sleep(3.0)
    
    if handler.connected:
        print("\n" + "="*60)
        print("  SUCCESSFULLY AUTHENTICATED WITH CTRADER FIX API!")
        print(f"  Account ID (SenderCompID): {handler.sender_comp_id}")
        print(f"  Live Balance:              {handler.account_info['balance']} {handler.account_info['currency']}")
        print(f"  Live Equity:               {handler.account_info['equity']} {handler.account_info['currency']}")
        print("="*60 + "\n")
    else:
        print("\n" + "!"*60)
        print("  CTRADER FIX API CONNECTION FAILED OR CLOSED.")
        print("  Please check your credentials in backend/.env")
        print("!"*60 + "\n")
