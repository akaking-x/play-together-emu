#!/bin/bash
# Deploy script for play-psx.tuanbui.click
# Run on VPS: bash deploy.sh

set -e

echo "=== Play Together Emu - Docker Deploy ==="

# Pull latest code
git pull origin main

# Build and start containers
docker compose build --no-cache
docker compose up -d

echo ""
echo "=== Deploy complete ==="
echo "Containers:"
docker compose ps
echo ""
echo "Site: https://play-psx.tuanbui.click"
