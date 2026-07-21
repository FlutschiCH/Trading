import sys
import threading
import os

class NotificationHandler:
    @staticmethod
    def play_sound(sound_type: str):
        if sys.platform != 'win32':
            return
        
        # Define sound file mappings from Windows Media folder
        media_dir = "C:\\Windows\\Media"
        sound_map = {
            "trade_open": os.path.join(media_dir, "tada.wav"),
            "trade_close": os.path.join(media_dir, "notify.wav"),
            "error": os.path.join(media_dir, "chord.wav"),
            "rejected": os.path.join(media_dir, "chord.wav"),
            "alert": os.path.join(media_dir, "ding.wav"),
        }
        
        sound_path = sound_map.get(sound_type, os.path.join(media_dir, "ding.wav"))
        
        if os.path.exists(sound_path):
            def _play():
                try:
                    from playsound import playsound
                    # Convert to absolute path with double backslashes for Windows safety
                    playsound(os.path.abspath(sound_path))
                except Exception as e:
                    print(f"Error playing sound via playsound: {e}", flush=True)
                    # Fallback to winsound MessageBeep
                    try:
                        import winsound
                        winsound.MessageBeep()
                    except Exception:
                        pass
            
            # Run in a background thread so it doesn't block execution
            threading.Thread(target=_play, daemon=True).start()
        else:
            # Fallback to winsound MessageBeep if file not found
            try:
                import winsound
                winsound.MessageBeep()
            except Exception:
                pass

    @staticmethod
    def send_notification(message: str, sound_type: str = None):
        print(f"[NOTIFICATION] {message}", flush=True)
        if sound_type:
            NotificationHandler.play_sound(sound_type)
