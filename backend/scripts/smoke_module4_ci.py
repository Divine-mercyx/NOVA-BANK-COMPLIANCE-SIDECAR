"""Non-interactive Module 4 smoke test (requires SMOKE_OTP env var)."""

from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    if not os.environ.get("SMOKE_OTP"):
        print("Set SMOKE_OTP=<code from backend console> then re-run")
        return 1
    result = subprocess.run(
        [sys.executable, "scripts/smoke_module4.py"],
        cwd=os.path.dirname(os.path.dirname(__file__)),
        env={**os.environ, "PYTHONPATH": "."},
    )
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
