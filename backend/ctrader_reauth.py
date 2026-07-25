import os
import urllib.request
import urllib.parse
import json
import tkinter as tk
from dotenv import load_dotenv

def main():
    # Load settings from the existing backend/.env file
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(backend_dir, ".env")
    load_dotenv(env_path)

    client_id = os.environ.get("CTRADER_CLIENT_ID")
    client_secret = os.environ.get("CTRADER_CLIENT_SECRET")
    redirect_uri = "http://localhost/"

    if not client_id or not client_secret:
        print("Error: CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET must be set in your .env file.")
        return

    # 1. Generate and Copy Authorization Link
    auth_url = f"https://id.ctrader.com/my/settings/openapi/grantingaccess/?client_id={client_id}&redirect_uri={urllib.parse.quote(redirect_uri)}&scope=trading&product=web"
    
    try:
        # Copy to clipboard using tkinter (standard python library, no external pip installs needed)
        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(auth_url)
        root.update() # Keeps content on clipboard after closing
        root.destroy()
        print("\n[+] Authorization link copied to clipboard successfully!")
    except Exception as e:
        print(f"\n[-] Failed to copy to clipboard: {e}")
    
    print("\nPaste this link in your browser if clipboard fail:")
    print(auth_url)

    # 2. Wait for user to input the callback URL containing the code
    callback_input = input("\n[?] Paste the redirect URL (e.g., http://localhost/?code=...): ").strip()
    
    parsed_url = urllib.parse.urlparse(callback_input)
    query_params = urllib.parse.parse_qs(parsed_url.query)
    code = query_params.get("code", [None])[0]

    if not code:
        # Try to parse raw code if they just pasted the code string
        if "code=" in callback_input:
            code = callback_input.split("code=")[-1].split("&")[0]
        else:
            code = callback_input

    if not code or len(code) < 10:
        print("[-] Invalid code extracted. Exiting.")
        return

    print(f"\n[+] Extracted authorization code: {code[:15]}...")

    # 3. Exchange authorization code for access token
    print("[*] Exchanging code for access token...")
    token_url = "https://connect.spotware.com/oauth/v2/token"
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret
    }).encode("utf-8")

    req = urllib.request.Request(token_url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req) as res:
            token_response = json.loads(res.read().decode("utf-8"))
    except Exception as e:
        error_msg = e.read().decode("utf-8") if hasattr(e, "read") else str(e)
        print(f"[-] Token Exchange Failed: {error_msg}")
        return

    access_token = token_response.get("accessToken")
    if not access_token:
        print(f"[-] Access token not found in response: {token_response}")
        return

    print("[+] Successfully received new Access Token.")

    # 4. Fetch associated trading accounts to display OpenAPI account IDs
    print("[*] Retrieving trading accounts...")
    accounts_url = f"https://api.spotware.com/connect/tradingaccounts?oauth_token={access_token}"
    req_acc = urllib.request.Request(accounts_url, headers={"Accept": "application/json"})
    
    try:
        with urllib.request.urlopen(req_acc) as res_acc:
            accounts_data = json.loads(res_acc.read().decode("utf-8"))
    except Exception as e:
        accounts_data = {}
        print(f"[-] Failed to fetch trading accounts: {e}")

    accounts_list = accounts_data.get("data", [])

    # 5. Output to tempENV.env and Console
    temp_env_path = os.path.join(backend_dir, "tempENV.env")
    
    with open(temp_env_path, "w") as f:
        f.write(f"CTRADER_ACCESS_TOKEN={access_token}\n")
        f.write("# Available Trading Accounts (Copy your desired ID into CTRADER_OPENAPI_ACCOUNT_ID):\n")
        print("\n" + "=" * 60)
        print(f"{'Broker Name':<20} | {'Account Login ID':<18} | {'OpenAPI Account ID':<20}")
        print("-" * 60)
        for acc in accounts_list:
            acc_id = acc.get("accountId")
            acc_num = acc.get("accountNumber")
            broker = acc.get("brokerTitle") or acc.get("brokerName") or "Unknown"
            is_live = "Live" if acc.get("live") else "Demo"
            
            display_str = f"{broker} ({is_live})"
            print(f"{display_str:<20} | {acc_num:<18} | {acc_id:<20}")
            f.write(f"# Account: {display_str:<18} Login: {acc_num:<12} -> CTRADER_OPENAPI_ACCOUNT_ID={acc_id}\n")
        print("=" * 60)

    print(f"\n[+] Access token and accounts list saved to: {temp_env_path}")

if __name__ == "__main__":
    main()
