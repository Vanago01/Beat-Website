#!/usr/bin/env bash
# Resets the LOCAL database, creates test users and runs the security suite.
# Usage: SUPABASE_SECRET_KEY=... ./supabase/tests/run.sh   (local stack only!)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
${SUPABASE_BIN:-npx --yes supabase@2} db reset >/dev/null
sleep 2
mapfile -t IDS < <(./supabase/tests/create_test_users.sh owner sellera sellerb buyerc)
psql "$DB_URL" -v owner="${IDS[0]}" -v sa="${IDS[1]}" -v sb="${IDS[2]}" -v buyer="${IDS[3]}" \
  -f supabase/tests/security_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR|passed" | sed 's/^psql:[^ ]* //'
