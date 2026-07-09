import os
import socket
import ssl
import time
import threading
from datetime import datetime

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
        for tag, val in all_fields[2:]:
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
            
            # Send Logon message
            logon_fields = [
                ("98", "0"),  # No encryption
                ("108", str(self.heartbeat_interval)),
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
                    # Basic parser
                    parts = buffer.split("\x01")
                    # Reconstruct buffer if incomplete
                    buffer = parts[-1]
                    messages = parts[:-1]
                    
                    # Log message received
                    self.last_received_time = time.time()
                    print(f"[FIX IN] Message fragments: {messages[:5]}")
                    
                    # Handle Heartbeat Request TestRequest (MsgType 1)
                    for item in messages:
                        if "35=1" in item:
                            # Send Heartbeat MsgType 0
                            self.send_message("0", [])
                            
            except socket.timeout:
                # Send Heartbeat if quiet
                if time.time() - self.last_sent_time > self.heartbeat_interval:
                    self.send_message("0", [])
            except Exception as e:
                print(f"[FIX LOOP ERROR] {str(e)}")
                self.connected = False
                break

    def get_account_info(self):
        # Retrieve account details. In FIX we can check CollateralInquiry/Report (MsgType BB)
        # We also maintain local fallback sync
        return {"status": "success", "data": self.account_info}

    def get_positions(self):
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
    # Test connection to the local cTrader windows app C# bridge
    import requests
    local_bridge = "http://localhost:8752"
    print(f"\n[cTrader Test] Attempting to read balance from cTrader Windows App via local bridge ({local_bridge})...")
    try:
        r = requests.get(f"{local_bridge}/account", timeout=2.0)
        if r.status_code == 200:
            data = r.json()
            print("\n" + "="*50)
            print("  SUCCESSFULLY CONNECTED TO CTRADER WINDOWS APP!")
            print(f"  Broker:   {data.get('broker')}")
            print(f"  Balance:  {data.get('balance')} {data.get('currency')}")
            print(f"  Equity:   {data.get('equity')} {data.get('currency')}")
            print(f"  Free Margin: {data.get('margin_free')} {data.get('currency')}")
            print("="*50 + "\n")
        else:
            print(f"[Error] Local bridge returned status code: {r.status_code}")
    except Exception as e:
        print("\n" + "!"*50)
        print("  COULD NOT CONNECT TO CTRADER WINDOWS APP BRIDGE!")
        print("  Please make sure you have:")
        print("  1. Opened cTrader desktop/windows app.")
        print("  2. Added the C# robot from 'LocalTraderBridge.cs' in the Automate tab.")
        print("  3. Started the LocalTraderBridge bot to open http://localhost:8752.")
        print("  Connection error details:", str(e))
        print("!"*50 + "\n")
