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
        Syncs SL or TP across selected account IDs by delegating position lookup and modification per account_id.
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
        print(f"🔄 [SL/TP SYNC] Starting Sync for {len(selected_account_ids)} Account(s)", flush=True)
        print(f"   Target Price : {target_price:.5f} | Type: {str(type).upper()} | Symbol: {symbol} | Side: {target_side}", flush=True)
        print(f"   Selected Accs: {selected_account_ids}", flush=True)
        print(f"==================================================", flush=True)

        for acc_id in selected_account_ids:
            acc_id_str = str(acc_id)
            acc_info = acc_dict.get(acc_id_str, {})
            broker_name = acc_info.get("broker_type", "metatrader")
            acc_name = acc_info.get("name", f"Account #{acc_id_str}")

            print(f"\n▶ [Account: '{acc_name}' ({acc_id_str})] Determining broker handler for '{broker_name}'...", flush=True)
            handler = BrokerHandler.get_handler(broker_name)

            if not handler:
                err_msg = f"No broker handler found for '{broker_name}'"
                print(f"   ❌ [Account: {acc_name}] {err_msg}", flush=True)
                failure_count += 1
                results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": err_msg})
                continue

            try:
                # Retrieve open positions for this specific account_id
                acc_positions = handler.get_positions(account_id=acc_id_str, login=acc_id_str) or []

                balance_info = "N/A"
                if broker_name == "metatrader":
                    from metatrader_handler import MetaTraderHandler
                    inst = MetaTraderHandler.get_mt5_instance(acc_id_str)
                    if inst and hasattr(inst, 'account_info'):
                        info = inst.account_info()
                        if info is not None:
                            balance_info = f"${info.balance:.2f} (Equity: ${info.equity:.2f}, Login: {info.login})"

                print(f"   🔍 Querying positions for account_id={acc_id_str} | Account Balance: {balance_info}...", flush=True)
                print(f"   📋 Found {len(acc_positions)} position(s) on account '{acc_name}'", flush=True)

                matching_positions = []
                for p in acc_positions:
                    p_sym_clean = re.sub(r'[^a-zA-Z0-9]', '', str(p.get("symbol", ""))).upper()
                    p_side_norm = SltpSyncHandler._normalize_side(p.get("trade_side") or p.get("type"))
                    is_sym_match = (p_sym_clean in target_symbol_clean or target_symbol_clean in p_sym_clean)
                    is_side_match = (p_side_norm == target_side)

                    if is_sym_match and is_side_match:
                        matching_positions.append(p)

                if matching_positions:
                    for pos in matching_positions:
                        pos_id = pos.get("position_id")
                        existing_sl = pos.get("stop_loss", 0.0)
                        existing_tp = pos.get("take_profit", 0.0)

                        new_sl = target_price if is_sl else existing_sl
                        new_tp = existing_tp if is_sl else target_price

                        print(f"   ⚡ Modifying Pos #{pos_id} on account '{acc_name}' (SL={new_sl}, TP={new_tp})...", flush=True)
                        res = handler.modify_position(
                            pos_id,
                            stop_loss=new_sl,
                            take_profit=new_tp,
                            symbol=pos.get("symbol", symbol),
                            account_id=acc_id_str,
                            login=acc_id_str,
                            broker=broker_name
                        )

                        if isinstance(res, dict) and res.get("status") != "error" and res.get("success") != False:
                            success_count += 1
                            print(f"   ✅ Position #{pos_id} on '{acc_name}' updated successfully!", flush=True)
                            results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": pos_id, "status": "success", "message": res.get("message", "Updated")})
                        else:
                            failure_count += 1
                            err_msg = res.get("message", "Broker modify returned error") if isinstance(res, dict) else "Error"
                            print(f"   ❌ Position #{pos_id} on '{acc_name}' FAILED: {err_msg}", flush=True)
                            results.append({"account_id": acc_id_str, "account_name": acc_name, "position_id": pos_id, "status": "error", "message": err_msg})
                else:
                    err_msg = f"No open {target_side} position found on {symbol}"
                    print(f"   ⚠️ [Account: '{acc_name}'] {err_msg}", flush=True)
                    failure_count += 1
                    results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": err_msg})

            except Exception as e:
                failure_count += 1
                tb_str = traceback.format_exc()
                err_msg = f"Exception: {str(e)}"
                print(f"   ❌ [Account: '{acc_name}'] ERROR: {err_msg}\n{tb_str}", flush=True)
                results.append({"account_id": acc_id_str, "account_name": acc_name, "status": "error", "message": err_msg})

        print(f"\n==================================================", flush=True)
        print(f"🏁 [SL/TP SYNC FINISHED] Successes: {success_count} | Failures: {failure_count}", flush=True)
        print(f"==================================================\n", flush=True)

        return {
            "status": "success" if failure_count == 0 else ("partial" if success_count > 0 else "error"),
            "success_count": success_count,
            "failure_count": failure_count,
            "results": results
        }
