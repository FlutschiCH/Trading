import re
from account_handler import AccountHandler
from broker_handler import BrokerHandler

class SltpSyncHandler:
    @staticmethod
    def sync_sltp(symbol: str, target_price: float, type: str, selected_account_ids: list, position_id: str = None, trade_side: str = 'BUY') -> dict:
        """
        Syncs a target price (SL or TP) across all selected account IDs without altering active chart rendering.
        """
        all_accounts = AccountHandler.get_accounts() or []
        acc_dict = {}
        for acc in all_accounts:
            if isinstance(acc, dict):
                acc_dict[str(acc.get("account_id"))] = acc

        is_sl = str(type).lower() == 'sl'
        target_symbol_clean = re.sub(r'[^a-zA-Z0-9]', '', str(symbol)).upper()
        target_side = str(trade_side).upper()

        results = []
        success_count = 0
        failure_count = 0

        print(f"\n[SL/TP Sync Started] Target Price: {target_price} | Type: {str(type).upper()} | Symbol: {symbol} | Accounts: {selected_account_ids}", flush=True)

        for acc_id in selected_account_ids:
            acc_id_str = str(acc_id)
            acc_info = acc_dict.get(acc_id_str, {})
            broker_name = acc_info.get("broker_type", "metatrader")
            acc_name = acc_info.get("name", acc_id_str)
            password = acc_info.get("password")
            server = acc_info.get("server")

            handler = BrokerHandler.get_handler(broker_name)
            
            try:
                fetch_kwargs = {
                    "account_id": acc_id_str,
                    "login": int(acc_id_str) if acc_id_str.isdigit() else acc_id_str
                }
                if password: fetch_kwargs["password"] = password
                if server: fetch_kwargs["server"] = server

                acc_positions = handler.get_positions(**fetch_kwargs) or []

                matching_positions = []
                for p in acc_positions:
                    p_symbol = re.sub(r'[^a-zA-Z0-9]', '', str(p.get("symbol", ""))).upper()
                    p_side = str(p.get("trade_side") or p.get("type") or "BUY").upper()
                    if (p_symbol in target_symbol_clean or target_symbol_clean in p_symbol) and p_side == target_side:
                        matching_positions.append(p)

                if matching_positions:
                    for pos in matching_positions:
                        pos_id = pos.get("position_id")
                        existing_sl = pos.get("stop_loss", 0.0)
                        existing_tp = pos.get("take_profit", 0.0)

                        mod_kwargs = {
                            "account_id": acc_id_str,
                            "broker": broker_name,
                            "login": int(acc_id_str) if acc_id_str.isdigit() else acc_id_str,
                            "stop_loss": target_price if is_sl else existing_sl,
                            "take_profit": existing_tp if is_sl else target_price
                        }
                        if password: mod_kwargs["password"] = password
                        if server: mod_kwargs["server"] = server

                        res = handler.modify_position(pos_id, symbol=symbol, **mod_kwargs)
                        if isinstance(res, dict) and res.get("status") != "error" and res.get("success") != False:
                            success_count += 1
                            print(f"  ✅ [Account: {acc_name}] Pos #{pos_id} {str(type).upper()} updated to {target_price}", flush=True)
                            results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": pos_id, "status": "success"})
                        else:
                            failure_count += 1
                            err_msg = res.get("message", "Unknown error") if isinstance(res, dict) else "Error"
                            print(f"  ❌ [Account: {acc_name}] Pos #{pos_id} failed: {err_msg}", flush=True)
                            results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": pos_id, "status": "error", "message": err_msg})
                elif position_id and len(selected_account_ids) == 1:
                    mod_kwargs = {
                        "account_id": acc_id_str,
                        "broker": broker_name,
                        "login": int(acc_id_str) if acc_id_str.isdigit() else acc_id_str,
                        "stop_loss": target_price if is_sl else None,
                        "take_profit": None if is_sl else target_price
                    }
                    if password: mod_kwargs["password"] = password
                    if server: mod_kwargs["server"] = server

                    res = handler.modify_position(position_id, symbol=symbol, **mod_kwargs)
                    if isinstance(res, dict) and res.get("status") != "error" and res.get("success") != False:
                        success_count += 1
                        print(f"  ✅ [Account: {acc_name}] Primary Pos #{position_id} {str(type).upper()} updated to {target_price}", flush=True)
                        results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": position_id, "status": "success"})
                    else:
                        failure_count += 1
                        err_msg = res.get("message", "Unknown error") if isinstance(res, dict) else "Error"
                        print(f"  ❌ [Account: {acc_name}] Primary Pos #{position_id} failed: {err_msg}", flush=True)
                        results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": position_id, "status": "error", "message": err_msg})
                else:
                    print(f"  ⚠️ [Account: {acc_name}] No open {target_side} position for {symbol}", flush=True)
                    results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "skipped", "message": f"No open {target_side} position on {symbol}"})

            except Exception as e:
                failure_count += 1
                print(f"  ❌ [Account: {acc_name}] Exception during sync: {e}", flush=True)
                results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": str(e)})

        return {
            "status": "success" if failure_count == 0 else ("partial" if success_count > 0 else "error"),
            "success_count": success_count,
            "failure_count": failure_count,
            "results": results
        }
