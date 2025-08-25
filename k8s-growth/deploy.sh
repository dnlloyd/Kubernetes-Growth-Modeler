#!/usr/bin/env bash
set -euo pipefail

# ----- Config -----
BUCKET="www-daniel-lloyd-net"
PREFIX="k8s-growth"
DIST_DIR="dist"

# Invalidate just the HTML (best if assets are filename-hashed).
# To invalidate EVERYTHING under the prefix, set:
# INVALIDATE_PATHS="/k8s-growth/*"
INVALIDATE_PATHS="/${PREFIX}/index.html"

# ------------------

if ! command -v aws >/dev/null 2>&1; then
    echo "ERROR: aws CLI not found. Install and configure it first."
    exit 1
fi

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <CLOUDFRONT_DISTRIBUTION_ID>"
    exit 1
fi
DIST_ID="$1"

if [[ ! -d "$DIST_DIR" ]]; then
    echo "ERROR: build directory '$DIST_DIR' not found. Run 'npm run build' first."
    exit 1
fi

echo ">>> Uploading static assets (excluding index.html) with long cache..."
aws s3 sync "${DIST_DIR}/" "s3://${BUCKET}/${PREFIX}/" \
    --exclude "index.html" \
    --delete \
    --cache-control "public,max-age=31536000,immutable"

echo ">>> Uploading index.html with no-cache..."
aws s3 cp "${DIST_DIR}/index.html" "s3://${BUCKET}/${PREFIX}/index.html" \
    --cache-control "no-store, no-cache, must-revalidate, max-age=0" \
    --content-type "text/html; charset=utf-8"

echo ">>> Creating CloudFront invalidation for: ${INVALIDATE_PATHS}"
INV_ID=$(aws cloudfront create-invalidation \
    --distribution-id "${DIST_ID}" \
    --paths "${INVALIDATE_PATHS}" \
    --query 'Invalidation.Id' \
    --output text)

echo "Invalidation ID: ${INV_ID}"

# Poll until completed
while true; do
    STATUS=$(aws cloudfront get-invalidation \
        --distribution-id "${DIST_ID}" \
        --id "${INV_ID}" \
        --query 'Invalidation.Status' \
        --output text)

    echo "Invalidation ${INV_ID} status: ${STATUS}"
    [[ "${STATUS}" == "Completed" ]] && break

    sleep 20
done

echo "✅ Deployed and cache invalidation completed."
