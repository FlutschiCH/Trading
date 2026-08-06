import re
import traceback
from account_handler import AccountHandler
from broker_handler import BrokerHandler

class SltpSyncHandler:
    @staticmethod
    def _normalize_side(side_val):
        if side_val is None:
            return "BUY"
        s = str(side_val).upper().strip()
        if s in ("BUY", "0", "POSITION_TYPE_BUY"):
            return "BUY"
        if s in ("SELL", "1", "POSITION_TYPE_SELL"):
            return "SELL"
        return s

    @staticmethod
    def sync_sltp(symbol: str, target_price: float, type: str, selected_account_ids: list, position_id: str = None, trade_side: str = 'BUY') -> dict:
        """
        Syncs a target price (SL or TP) across all selected account IDs with detailed logging per account.
        """
        all_accounts = AccountHandler.get_accounts() or []
        acc_dict = {}
        for acc in all_accounts:
            if isinstance(acc, dict):
                acc_dict[str(acc.get("account_id"))] = acc

        is_sl = str(type).lower() == 'sl'
        target_symbol_clean = re.sub(r'[^a-zA-Z0-9]', '', str(symbol)).upper()
        target_side = SltpSyncHandler._normalize_side(trade_side)

        results = []
        success_count = 0
        failure_count = 0

        print(f"\n==================================================", flush=True)
        print(f"🔄 [SL/TP SYNC ENGINE] Starting Multi-Account Sync", flush=True)
        print(f"   Target Price : {target_price:.5f}", flush=True)
        print(f"   Sync Type    : {str(type).upper()}", flush=True)
        print(f"   Symbol       : {symbol} (Clean: {target_symbol_clean})", flush=True)
        print(f"   Side         : {target_side}", flush=True)
        print(f"   Target Accs  : {selected_account_ids}", flush=True)
        print(f"==================================================", flush=True)

        for acc_id in selected_account_ids:
            acc_id_str = str(acc_id)
            acc_info = acc_dict.get(acc_id_str, {})
            broker_name = acc_info.get("broker_type", "metatrader")
            acc_name = acc_info.get("name", f"Account #{acc_id_str}")
            password = acc_info.get("password")
            server = acc_info.get("server")

            print(f"\n▶ [Processing Account] Name: '{acc_name}' | ID: {acc_id_str} | Broker: {broker_name} | Server: {server}", flush=True)

            handler = BrokerHandler.get_handler(broker_name)
            if not handler:
                err_msg = f"No broker handler found for '{broker_name}'"
                print(f"   ❌ [Account: {acc_name}] {err_msg}", flush=True)
                failure_count += 1
                results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": err_msg})
                continue

            try:
                fetch_kwargs = {
                    "account_id": acc_id_str,
                    "login": int(acc_id_str) if acc_id_str.isdigit() else acc_id_str
                }
                if password: fetch_kwargs["password"] = password
                if server: fetch_kwargs["server"] = server

                print(f"   🔍 [Account: {acc_name}] Fetching open positions...", flush=True)
                acc_positions = handler.get_positions(**fetch_kwargs) or []
                print(f"   📋 [Account: {acc_name}] Retrieved {len(acc_positions)} total open position(s)", flush=True)

                matching_positions = []
                for p in acc_positions:
                    p_sym_clean = re.sub(r'[^a-zA-Z0-9]', '', str(p.get("symbol", ""))).upper()
                    p_side_norm = SltpSyncHandler._normalize_side(p.get("trade_side") or p.get("type"))
                    
                    is_sym_match = (p_sym_clean in target_symbol_clean or target_symbol_clean in p_sym_clean)
                    is_side_match = (p_side_norm == target_side)

                    print(f"      • Pos #{p.get('position_id')}: Symbol='{p.get('symbol')}' ({p_sym_clean}), Side='{p_side_norm}', SL={p.get('stop_loss')}, TP={p.get('take_profit')} -> SymMatch: {is_sym_match}, SideMatch: {is_side_match}", flush=True)

                    if is_sym_match and is_side_match:
                        matching_positions.append(p)

                if matching_positions:
                    print(f"   🎯 [Account: {acc_name}] Found {len(matching_positions)} matching position(s) to modify", flush=True)
                    for pos in matching_positions:
                        pos_id = pos.get("position_id")
                        existing_sl = pos.get("stop_loss", 0.0)
                        existing_tp = pos.get("take_profit", 0.0)

                        new_sl = target_price if is_sl else existing_sl
                        new_tp = existing_tp if is_sl else target_price

                        mod_kwargs = {
                            "account_id": acc_id_str,
                            "broker": broker_name,
                            "login": int(acc_id_str) if acc_id_str.isdigit() else acc_id_str,
                            "stop_loss": new_sl,
                            "take_profit": new_tp
                        }
                        if password: mod_kwargs["password"] = password
                        if server: mod_kwargs["server"] = server

                        print(f"   ⚡ [Account: {acc_name}] Sending modify request for Pos #{pos_id}: SL={new_sl}, TP={new_tp}...", flush=True)
                        res = handler.modify_position(pos_id, symbol=pos.get("symbol", symbol), **mod_kwargs)

                        if isinstance(res, dict) and res.get("status") != "error" and res.get("success") != False:
                            success_count += 1
                            print(f"   ✅ [Account: {acc_name}] Pos #{pos_id} successfully updated! Result: {res.get('message', 'OK')}", flush=True)
                            results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": pos_id, "status": "success", "message": res.get("message", "Updated")})
                        else:
                            failure_count += 1
                            err_msg = res.get("message", "Broker modify returned error") if isinstance(res, dict) else "Unknown error"
                            print(f"   ❌ [Account: {acc_name}] Pos #{pos_id} FAILED: {err_msg}", flush=True)
                            results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": pos_id, "status": "error", "message": err_msg})
                else:
                    err_msg = f"No open {target_side} position found on {symbol}"
                    print(f"   ⚠️ [Account: {acc_name}] {err_msg}", flush=True)
                    failure_count += 1
                    results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": err_msg})

            except Exception as e:
                failure_count += 1
                tb_str = traceback.format_exc()
                err_msg = f"Exception: {str(e)}"
                print(f"   ❌ [Account: {acc_name}] ERROR: {err_msg}\n{tb_str}", flush=True)
                results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": err_msg})

        print(f"\n==================================================", flush=True)
        print(f"🏁 [SL/TP SYNC COMPLETED] Total Success: {success_count} | Total Failures: {failure_count}", flush=True)
        print(f"==================================================\n", flush=True)

        return {
            "status": "success" if failure_count == 0 else ("partial" if success_count > 0 else "error"),
            "success_count": success_count,
            "failure_count": failure_count,
            "results": results
        }
