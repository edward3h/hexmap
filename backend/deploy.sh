#!/usr/bin/env bash
set -euo pipefail

# Build and stage hexmap for deployment to a shared web host.
#
# Usage: ./deploy.sh [staging_dir]
#   staging_dir  Directory to write output to (default: ./deploy_staging)
#
# The resulting directory layout:
#   staging_dir/
#   ├── config.example.php   (copy to config.php and fill in credentials)
#   ├── src/
#   │   └── db.php
#   └── public_html/
#       ├── .htaccess
#       ├── api.php
#       ├── index.html        (frontend)
#       ├── assets/            (frontend)
#       └── …

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING="${1:-$SCRIPT_DIR/deploy_staging}"

echo "==> Building frontend…"
(cd "$PROJECT_ROOT" && npm run build)

echo "==> Preparing staging directory: $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING/public_html"

# Backend PHP source (not web-accessible)
cp -r "$SCRIPT_DIR/src" "$STAGING/src"

# Backend public files (webroot)
cp "$SCRIPT_DIR/public/.htaccess" "$STAGING/public_html/"
cp "$SCRIPT_DIR/public/api.php" "$STAGING/public_html/"

# Frontend build output (into webroot)
cp -r "$PROJECT_ROOT/dist/"* "$STAGING/public_html/"

# Config template
cp "$SCRIPT_DIR/config.example.php" "$STAGING/config.example.php"

echo ""
echo "==> Staging complete: $STAGING"
echo ""
echo "Next steps:"
echo "  1. Copy config.example.php to config.php and fill in your MySQL credentials."
echo "  2. Upload the contents of $STAGING to your shared host, e.g.:"
echo "       rsync -avz $STAGING/ user@host:~/hexmap.example.com/"
echo "  3. Point your subdomain's document root at the public_html/ directory."
