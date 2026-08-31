import re
import os
import subprocess
import sys
import time
import urllib.request
import json
import socket
import threading
import tkinter as tk
from tkinter import ttk, messagebox

DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1503909857022181376/be9hwL2YjSpBQ13QrdFtWwnQL5zpAq25LAoI4yenCSRcFqYJciUuZU0JH3JdIoDrtm-K"

def send_to_discord(url, folder_name):
    payload = {
        "content": f"🚀 **Dev Tunnel Active for `{folder_name}`!**\n🔗 **URL:** {url}\n📋 Copied to clipboard."
    }
    req = urllib.request.Request(
        DISCORD_WEBHOOK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print("[+] Sent tunnel URL to Discord successfully!")
    except Exception as e:
        print(f"[-] Failed to send to Discord: {e}")

def copy_to_clipboard(text):
    try:
        cmd = f"Set-Clipboard -Value '{text}'"
        subprocess.run(["powershell", "-Command", cmd], check=True)
        print("[+] URL copied to clipboard!")
    except Exception as e:
        print(f"[-] Failed to copy to clipboard: {e}")

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        try:
            s.connect(("127.0.0.1", port))
            return True
        except (socket.timeout, ConnectionRefusedError):
            return False

class TunnelApp:
    def __init__(self, root, folder_name):
        self.root = root
        self.folder_name = folder_name
        self.dev_process = None
        self.tunnel_process = None
        self.tunnel_url = None

        self.root.title(f"Dev Tunnel - {folder_name}")
        self.root.geometry("460x280")
        self.root.resizable(False, False)
        self.root.configure(bg="#1f2937")

        # Header Frame
        header_frame = tk.Frame(root, bg="#111827", padx=12, pady=10)
        header_frame.pack(fill="x")
        
        title_label = tk.Label(
            header_frame, 
            text=f"🚀 Dev Tunnel ({folder_name})", 
            font=("Segoe UI", 12, "bold"), 
            fg="#f9fafb", 
            bg="#111827"
        )
        title_label.pack(anchor="w")

        # Content Frame
        content_frame = tk.Frame(root, bg="#1f2937", padx=15, pady=10)
        content_frame.pack(fill="both", expand=True)

        # Dev Server Status
        self.dev_status_label = tk.Label(
            content_frame, 
            text="[*] Checking dev server (port 8021)...", 
            font=("Segoe UI", 9), 
            fg="#9ca3af", 
            bg="#1f2937"
        )
        self.dev_status_label.pack(anchor="w", pady=(0, 4))

        # Tunnel Status Label
        self.url_label = tk.Label(
            content_frame, 
            text="[*] Connecting to Cloudflare Tunnel...", 
            font=("Segoe UI", 9, "bold"), 
            fg="#e5e7eb", 
            bg="#1f2937"
        )
        self.url_label.pack(anchor="w", pady=(0, 4))

        # URL Text Entry Box
        self.url_var = tk.StringVar(value="Waiting for tunnel URL...")
        self.url_entry = tk.Entry(
            content_frame, 
            textvariable=self.url_var, 
            font=("Consolas", 10), 
            fg="#10b981", 
            bg="#111827", 
            bd=1, 
            relief="solid"
        )
        self.url_entry.pack(fill="x", pady=(0, 12))

        # Always on Top checkbox
        self.always_on_top_var = tk.BooleanVar(value=False)
        self.always_on_top_cb = tk.Checkbutton(
            content_frame,
            text="📌 Always on top",
            variable=self.always_on_top_var,
            command=self.toggle_always_on_top,
            font=("Segoe UI", 9),
            fg="#d1d5db",
            bg="#1f2937",
            activebackground="#1f2937",
            activeforeground="#ffffff",
            selectcolor="#374151"
        )
        self.always_on_top_cb.pack(anchor="w", pady=(0, 8))

        # Button Row
        btn_frame = tk.Frame(content_frame, bg="#1f2937")
        btn_frame.pack(fill="x")

        self.copy_btn = tk.Button(
            btn_frame, 
            text="📋 Copy URL", 
            command=self.on_copy, 
            font=("Segoe UI", 9, "bold"), 
            fg="#ffffff", 
            bg="#2563eb", 
            activebackground="#1d4ed8", 
            bd=0, 
            padx=14, 
            pady=6, 
            cursor="hand2"
        )
        self.copy_btn.pack(side="left")

        self.stop_btn = tk.Button(
            btn_frame, 
            text="🛑 Stop & Close", 
            command=self.on_close, 
            font=("Segoe UI", 9, "bold"), 
            fg="#ffffff", 
            bg="#dc2626", 
            activebackground="#b91c1c", 
            bd=0, 
            padx=14, 
            pady=6, 
            cursor="hand2"
        )
        self.stop_btn.pack(side="right")

        # Window closing handler
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Launch tunnel in background thread
        threading.Thread(target=self.run_tunnel_logic, daemon=True).start()

    def toggle_always_on_top(self):
        self.root.attributes("-topmost", self.always_on_top_var.get())

    def update_dev_status(self, text, fg="#9ca3af"):
        self.root.after(0, lambda: self.dev_status_label.config(text=text, fg=fg))

    def update_url_status(self, text, url=None):
        def _update():
            self.url_label.config(text=text)
            if url:
                self.url_var.set(url)
        self.root.after(0, _update)

    def on_copy(self):
        if self.tunnel_url:
            copy_to_clipboard(self.tunnel_url)
            self.copy_btn.config(text="✓ Copied!", bg="#059669")
            self.root.after(2000, lambda: self.copy_btn.config(text="📋 Copy URL", bg="#2563eb"))

    def on_close(self):
        print("\n[*] Stopping launcher and cleaning up processes...")
        if self.tunnel_process:
            try:
                self.tunnel_process.terminate()
            except Exception:
                pass
        if self.dev_process:
            try:
                self.dev_process.terminate()
            except Exception:
                pass
        self.root.destroy()
        sys.exit(0)

    def run_tunnel_logic(self):
        if not is_port_in_use(8021):
            print("[*] Port 8021 is not active. Starting Vite dev server...")
            self.update_dev_status("[*] Starting Vite dev server (npm run dev)...", "#f59e0b")
            self.dev_process = subprocess.Popen(
                ["npm", "run", "dev"],
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            time.sleep(2)
            for _ in range(5):
                if is_port_in_use(8021):
                    print("[+] Vite dev server started successfully!")
                    self.update_dev_status("[+] Dev Server: Active (Port 8021)", "#10b981")
                    break
                time.sleep(1)
            else:
                self.update_dev_status("[-] Dev Server startup timed out.", "#ef4444")
        else:
            print("[+] Port 8021 is already active.")
            self.update_dev_status("[+] Dev Server: Active (Port 8021)", "#10b981")

        # Use cloudflared tunnel pointing to http://127.0.0.1:8021
        tunnel_cmd = ["npx", "cloudflared", "tunnel", "--url", "http://127.0.0.1:8021"]
        print("[*] Launching Cloudflare tunnel...")

        self.tunnel_process = subprocess.Popen(
            tunnel_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            shell=True
        )

        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

        try:
            for line in iter(self.tunnel_process.stdout.readline, ''):
                print(line, end='')
                match = url_pattern.search(line)
                if match and not self.tunnel_url:
                    self.tunnel_url = match.group(0)
                    print("\n" + "="*50)
                    print(f"[+] CLOUDFLARE TUNNEL URL FOUND: {self.tunnel_url}")
                    print("="*50 + "\n")
                    
                    self.update_url_status("[+] Cloudflare Tunnel Active:", self.tunnel_url)
                    
                    copy_to_clipboard(self.tunnel_url)
                    send_to_discord(self.tunnel_url, self.folder_name)
                    
            self.tunnel_process.wait()
        except Exception as e:
            print(f"[-] Tunnel error: {e}")

def main():
    folder_name = os.path.basename(os.path.dirname(os.path.abspath(__file__)))
    root = tk.Tk()
    app = TunnelApp(root, folder_name)
    root.mainloop()

if __name__ == "__main__":
    main()
