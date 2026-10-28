#!/usr/bin/env python3
"""Merge GitHub-provided env vars into an existing Lambda configuration."""
import json
import os
import subprocess
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: update_backend_lambda_env.py <function-name>", file=sys.stderr)
        return 2

    function_name = sys.argv[1]
    raw = os.environ.get("CURRENT_ENV") or "{}"
    current = json.loads(raw)
    if not isinstance(current, dict):
        current = {}

    keys = (
        "NODE_ENV",
        "PYTHONUNBUFFERED",
        "PORT",
        "AWS_LWA_PORT",
        "AWS_LWA_READINESS_CHECK_PATH",
        "MONGODB_URI",
        "JWT_SECRET",
        "ENCRYPTION_KEY",
        "CRON_SECRET",
        "FRONTEND_URL",
        "ALLOWED_ORIGINS",
    )
    for key in keys:
        value = os.environ.get(key)
        if value:
            current[key] = value

    cmd = [
        "aws",
        "lambda",
        "update-function-configuration",
        "--function-name",
        function_name,
        "--timeout",
        os.environ.get("LAMBDA_TIMEOUT", "120"),
        "--memory-size",
        os.environ.get("LAMBDA_MEMORY", "1024"),
        "--environment",
        json.dumps({"Variables": current}),
    ]
    kms = os.environ.get("LAMBDA_KMS_KEY")
    if kms:
        cmd.extend(["--kms-key-arn", kms])

    subprocess.check_call(cmd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
