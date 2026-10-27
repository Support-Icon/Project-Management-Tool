#!/usr/bin/env bash
set -euo pipefail

REPO="${1:?usage: cleanup_ecr_images.sh <repo> [keep]}"
KEEP="${2:-1}"

mapfile -t digests < <(aws ecr describe-images \
  --repository-name "$REPO" \
  --query 'reverse(sort_by(imageDetails,&imagePushedAt))[].imageDigest' \
  --output text | tr '\t' '\n' | sed '/^$/d')

if (( ${#digests[@]} <= KEEP )); then
  echo "ECR ${REPO}: ${#digests[@]} image(s), keeping all"
  exit 0
fi

to_delete=("${digests[@]:KEEP}")
echo "ECR ${REPO}: keeping ${KEEP}, deleting ${#to_delete[@]} older image(s)"

ids=()
for digest in "${to_delete[@]}"; do
  ids+=("imageDigest=${digest}")
done

aws ecr batch-delete-image \
  --repository-name "$REPO" \
  --image-ids "${ids[@]}"
