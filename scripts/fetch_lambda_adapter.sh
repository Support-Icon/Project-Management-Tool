#!/usr/bin/env bash
# Download the AWS Lambda Web Adapter binary without pulling public.ecr.aws
# (anonymous 429) or calling ecr-public:GetAuthorizationToken.
set -euo pipefail

OUT_DIR="${1:-.docker-cache}"
ADAPTER="${OUT_DIR}/lambda-adapter"
REGION="${AWS_REGION:-us-east-1}"
LAYER_OWNER="753240598075"
LAYER_NAME="LambdaAdapterLayerX86"
GITHUB_FALLBACK="https://github.com/awslabs/aws-lambda-web-adapter/releases/download/v0.9.1/lambda-adapter-x86_64"

mkdir -p "$OUT_DIR"
if [[ -x "$ADAPTER" ]]; then
  echo "Using cached Lambda Web Adapter at ${ADAPTER}" >&2
  exit 0
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

unpack_layer_zip() {
  local zip_path="$1"
  unzip -q "$zip_path" -d "$TMP/layer"
  if [[ -f "$TMP/layer/extensions/lambda-adapter" ]]; then
    cp "$TMP/layer/extensions/lambda-adapter" "$ADAPTER"
  elif [[ -f "$TMP/layer/lambda-adapter" ]]; then
    cp "$TMP/layer/lambda-adapter" "$ADAPTER"
  else
    echo "Layer zip did not contain lambda-adapter" >&2
    find "$TMP/layer" -type f >&2 || true
    return 1
  fi
}

fetch_from_layer() {
  local version url
  for version in 25 24 23 22 21; do
    local arn="arn:aws:lambda:${REGION}:${LAYER_OWNER}:layer:${LAYER_NAME}:${version}"
    echo "Trying Lambda layer ${arn}" >&2
    url="$(aws lambda get-layer-version-by-arn --arn "$arn" --query 'Content.Location' --output text 2>/dev/null || true)"
    if [[ -n "$url" && "$url" != "None" ]]; then
      curl -fsSL "$url" -o "$TMP/layer.zip"
      unpack_layer_zip "$TMP/layer.zip"
      return 0
    fi
  done
  return 1
}

if ! fetch_from_layer; then
  echo "Layer download failed; falling back to GitHub release" >&2
  curl -fsSL "$GITHUB_FALLBACK" -o "$ADAPTER"
fi

chmod 755 "$ADAPTER"
echo "Lambda Web Adapter ready at ${ADAPTER}" >&2
