"""Run makecover.py with patient retries: Commons answers 429 for a minute or so from a shared address."""
import subprocess, sys, time
for attempt in range(6):
    r = subprocess.run([sys.executable, "makecover.py", *sys.argv[1:]], capture_output=True, text=True,
                       cwd="/tmp/claude-0/-home-user-Server-Builder/d152a891-7ad7-5dce-892c-5a4e43c79e21/scratchpad")
    if r.returncode == 0:
        print(r.stdout.strip()); sys.exit(0)
    print(f"attempt {attempt + 1}: {r.stderr.strip().splitlines()[-1][:120]}", file=sys.stderr)
    time.sleep(30 * (attempt + 1))
sys.exit(1)
