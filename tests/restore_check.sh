#!/usr/bin/env bash
# Restore-check a supplied PostgreSQL custom-format dump in a disposable local database.
# Usage: tests/restore_check.sh path/to/database.dump
set -euo pipefail

DUMP="${1:?Navedi putanju do .dump fajla}"
if [[ ! -f "$DUMP" ]]; then echo "FAIL: dump fajl ne postoji: $DUMP" >&2; exit 1; fi

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
if [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" && "${ALLOW_REMOTE_RESTORE_TEST:-}" != "1" ]]; then
  echo "FAIL: restore-check odbija udaljeni PostgreSQL. Koristi lokalni izolovani server." >&2
  exit 1
fi

DB="restore_test_$$"
psql -d postgres -v ON_ERROR_STOP=1 -q -c "create database $DB"
cleanup() { psql -d postgres -q -c "drop database if exists $DB"; }
trap cleanup EXIT

psql -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';
drop schema if exists public cascade;
create schema public;
do $
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
SQL

# This helper verifies a public-schema dump only; it does not prove auth.users/logins restore.
LIST=$(mktemp)
trap 'rm -f "$LIST"; cleanup' EXIT
pg_restore -l "$DUMP" | grep -v " FK CONSTRAINT " > "$LIST"
pg_restore --no-owner --no-privileges --exit-on-error -L "$LIST" -d "$DB" "$DUMP"
rm -f "$LIST"

for table in seasons teams players matches match_events; do
  present=$(psql -d "$DB" -tA -c "select to_regclass('public.$table') is not null")
  if [[ "$present" != "t" ]]; then
    echo "FAIL: u backupu nedostaje tabela $table" >&2
    exit 1
  fi
  count=$(psql -d "$DB" -tA -c "select count(*) from public.$table")
  echo "OK: tabela $table — $count redova"
done
echo "OK: dump se vraća u izolovanu lokalnu bazu; auth.users i prijave nisu potvrđeni."
