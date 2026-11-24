#!/usr/bin/env sh
# Rebuild the embedded MeshPilot workbench into public/meshpilot/ (commit the result).
set -e
cd "$(dirname "$0")/../meshpilot"
npm ci --no-audit --no-fund
npm run build
