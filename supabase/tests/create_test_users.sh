#!/usr/bin/env bash
# Creates test users through the local Auth admin API and prints their ids.
set -euo pipefail
API="${SUPABASE_URL:-http://127.0.0.1:54321}"
KEY="${SUPABASE_SECRET_KEY:?set SUPABASE_SECRET_KEY}"
for u in "$@"; do
  curl -sS -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$u@test.local\",\"password\":\"Password123!\",\"email_confirm\":true,\"user_metadata\":{\"username\":\"$u\"}}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id') or d)"
done
