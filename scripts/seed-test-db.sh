#!/usr/bin/env bash
set -e
DB=postgresql://postgres:postgres@localhost:54322/postgres
for f in supabase/seeds/0*.sql; do
  echo "Applying $f..."
  psql "$DB" -f "$f"
done
echo "All seeds applied."
