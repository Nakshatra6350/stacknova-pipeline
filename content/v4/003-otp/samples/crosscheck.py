"""Our Go TOTP against an independent library: pyotp 2.9.0, on 1,000 random secrets at a fixed time.

    python crosscheck.py path/to/otp-demo

The Go program is the same one the video runs (samples/go, built with go build).
"""

import base64
import secrets
import subprocess
import sys
import tempfile
from pathlib import Path

import pyotp

AT = 1793457612  # the moment in the video and the guide: 31 Oct 2026, 14:40:12 UTC

keys = [secrets.token_bytes(20) for _ in range(1000)]
with tempfile.TemporaryDirectory() as folder:
    file = Path(folder) / "secrets"
    file.write_text("\n".join(k.hex() for k in keys), encoding="ascii")
    out = subprocess.run([sys.argv[1], f"-phone={file}", f"-at={AT}"], capture_output=True, text=True, check=True)
ours = out.stdout.split()
theirs = [pyotp.TOTP(base64.b32encode(k).decode()).at(AT) for k in keys]
same = sum(a == b for a, b in zip(ours, theirs))
print(f"crosscheck: {same} of {len(keys)} codes match pyotp")
