#!/usr/bin/env bash
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

docker compose up -d --build
docker compose ps
