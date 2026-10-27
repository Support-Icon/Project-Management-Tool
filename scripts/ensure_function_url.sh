#!/usr/bin/env bash
# Print the Lambda function URL (create a public URL if missing).
# Always attach the resource policy AWS requires for AuthType NONE.
# Only the URL is written to stdout so callers can capture it.
set -euo pipefail

FUNCTION_NAME="${1:?usage: ensure_function_url.sh <function-name>}"

existing="$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --query FunctionUrl \
  --output text 2>/dev/null || true)"

if [[ -z "$existing" || "$existing" == "None" ]]; then
  echo "Creating public function URL for ${FUNCTION_NAME}" >&2
  aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE >/dev/null
fi

put_permission() {
  local statement_id="$1"
  shift
  aws lambda remove-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "$statement_id" >/dev/null 2>&1 || true
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "$statement_id" \
    "$@" >/dev/null
}

echo "Allowing public Function URL invoke for ${FUNCTION_NAME}" >&2
put_permission FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE

put_permission FunctionURLAllowInvokeFunction \
  --action lambda:InvokeFunction \
  --principal "*"

echo "Enabling Function URL CORS for browser clients" >&2
aws lambda update-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --auth-type NONE \
  --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["authorization","content-type","x-cron-secret","accept","origin"],"ExposeHeaders":["*"],"MaxAge":86400}' \
  >/dev/null

aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --query FunctionUrl \
  --output text
