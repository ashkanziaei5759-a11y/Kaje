#!/usr/bin/env bash
# Regenerates prisma/demo-dump.sql.gz — the data the public demo ships with.
#
# Run this against a PostgreSQL database that has just been seeded
# (npm run db:migrate && npm run db:seed). --inserts is required: PGlite's
# exec() cannot consume the COPY ... FROM stdin blocks pg_dump emits by default.
set -euo pipefail

# .env is where the local connection string normally lives.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a; . ./.env; set +a
fi
: "${DATABASE_URL:?set DATABASE_URL, or put it in .env, pointing at the seeded database}"

# Prisma's ?schema= parameter is not valid libpq URI syntax.
PG_URL="${DATABASE_URL%%\?*}"

pg_dump "$PG_URL" \
  --no-owner --no-acl --inserts --quote-all-identifiers \
  | grep -v '^\\' \
  | gzip -9 > prisma/demo-dump.sql.gz

echo "wrote prisma/demo-dump.sql.gz — $(du -h prisma/demo-dump.sql.gz | cut -f1)"
