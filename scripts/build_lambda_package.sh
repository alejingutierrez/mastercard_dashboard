#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_SRC="$REPO_ROOT/lambda/aurora_proxy"
BUILD_DIR="$REPO_ROOT/build/lambda_aurora_proxy"
DIST_DIR="$REPO_ROOT/dist"
ZIP_PATH="$DIST_DIR/lambda_aurora_proxy.zip"

echo "Cleaning previous build artifacts..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

echo "Installing dependencies..."
pip install --target "$BUILD_DIR" -r "$LAMBDA_SRC/requirements.txt" >/dev/null

echo "Copying lambda sources..."
cp "$LAMBDA_SRC/lambda_function.py" "$BUILD_DIR/"

if [[ -n "${SSL_CERT_URL:-}" ]]; then
  echo "Downloading SSL certificate from ${SSL_CERT_URL}..."
  curl -sSL "$SSL_CERT_URL" -o "$BUILD_DIR/$(basename "$SSL_CERT_URL")"
fi

echo "Creating deployment package..."
(cd "$BUILD_DIR" && zip -r "$ZIP_PATH" . >/dev/null)

echo "Lambda package created at $ZIP_PATH"
