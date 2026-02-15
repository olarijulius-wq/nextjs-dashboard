#!/usr/bin/env bash
set -euo pipefail

POSTGRES_URL="$(grep '^POSTGRES_URL=' .env | cut -d= -f2- | tr -d '"')"
exec psql "$POSTGRES_URL" "$@"
