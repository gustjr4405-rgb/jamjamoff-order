#!/usr/bin/env bash
# 로컬 Postgres 에 마이그레이션 + 시드 + RLS 테스트 실행
#   TEST_PG="psql -h /tmp -p 54329 -U postgres" ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="${TEST_PG:-psql -h /tmp -p 54329 -U postgres}"
DB="${TEST_DB:-jj_test}"
$PSQL -q -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/00_local_supabase_stub.sql supabase/migrations/*.sql supabase/seed.sql supabase/tests/rls_test.sql; do
  echo "▶ $f"
  $PSQL -q -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" -f "$f" 2>&1 | sed -n "s/.*NOTICE:  //p; /ERROR/p"; test ${PIPESTATUS[0]} -eq 0
done
