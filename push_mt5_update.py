import subprocess
import sys
import os

def push_mt5_updates():
    # Change directory to script location (project root)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir:
        os.chdir(script_dir)

    commit_msg = "feat: update mt5 configuration and settings"
    if len(sys.argv) > 1:
        commit_msg = sys.argv[1]

    print(f"Staging MT5 directory changes...")
    try:
        subprocess.run(["git", "add", "-A", "mt5/"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Failed to stage mt5/ directory: {e}")
        return

    print(f"Creating commit: '{commit_msg}'...")
    try:
        subprocess.run(["git", "commit", "-m", commit_msg], check=True)
    except subprocess.CalledProcessError:
        print("No changes in mt5/ to commit or commit failed.")
        return

    print("Pushing MT5 updates to remote repository (including LFS binaries)...")
    try:
        subprocess.run(["git", "push"], check=True)
        print("\nMT5 update committed and pushed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"Git push failed: {e}")

if __name__ == "__main__":
    push_mt5_updates()
