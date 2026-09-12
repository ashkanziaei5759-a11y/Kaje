#!/usr/bin/env bash
# Chooses the database strategy for a build.
#
#  * DATABASE_URL set  → a real PostgreSQL server; apply the migrations to it.
#  * DATABASE_URL unset → the public demo build; seed an in-process PGlite
#    database and ship it as a snapshot (see scripts/build-demo-db.ts).
set -euo pipefail

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[prepare-db] DATABASE_URL is set — applying migrations."
  prisma migrate deploy
else
  echo "[prepare-db] no DATABASE_URL — building the demo database snapshot."
  npm run db:demo
fi
