#!/usr/bin/env bash
# Print the Lambda function URL (create a public URL if missing).
# Only the URL is written to stdout so callers can capture it.
set -euo pipefail

FUNCTION_NAME="${1:?usage: ensure_function_url.sh <function-name>}"

existing="$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --query FunctionUrl \
  --output text 2>/dev/null || true)"

if [[ -n "$existing" && "$existing" != "None" ]]; then
  echo "$existing"
  exit 0
fi

echo "Creating public function URL for ${FUNCTION_NAME}" >&2
aws lambda create-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --auth-type NONE >/dev/null

aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE >/dev/null 2>&1 || true

aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --query FunctionUrl \
  --output text
