#!/usr/bin/env bash
# Inspect and optionally clean PostgreSQL idle connections for local Docker deployments.
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
IDLE_DATABASES="${IDLE_DATABASES:-EACY,eacy_db}"
IDLE_SESSION_TIMEOUT="${IDLE_SESSION_TIMEOUT:-10min}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/pg-connection-guard.sh status
  scripts/pg-connection-guard.sh terminate-idle
  scripts/pg-connection-guard.sh set-idle-timeout

Environment overrides:
  POSTGRES_CONTAINER=postgres
  POSTGRES_USER=postgres
  POSTGRES_DB=postgres
  IDLE_DATABASES=EACY,eacy_db
  IDLE_SESSION_TIMEOUT=10min
USAGE
}

psql_exec() {
  docker exec "${POSTGRES_CONTAINER}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

status() {
  psql_exec -c "
select datname, state, count(*)
from pg_stat_activity
group by datname, state
order by count(*) desc;

select count(*) as total_connections from pg_stat_activity;
show max_connections;
show idle_session_timeout;
"
}

terminate_idle() {
  local databases_sql
  databases_sql="$(printf "'%s'," ${IDLE_DATABASES//,/ })"
  databases_sql="${databases_sql%,}"

  psql_exec -v ON_ERROR_STOP=1 -c "
select pg_terminate_backend(pid) as terminated, datname, count(*)
from pg_stat_activity
where pid <> pg_backend_pid()
  and state = 'idle'
  and datname in (${databases_sql})
group by datname, pg_terminate_backend(pid);
"
}

set_idle_timeout() {
  psql_exec -v ON_ERROR_STOP=1 -c "alter system set idle_session_timeout = '${IDLE_SESSION_TIMEOUT}';"
  psql_exec -v ON_ERROR_STOP=1 -c "select pg_reload_conf(); show idle_session_timeout;"
}

case "${1:-}" in
  status)
    status
    ;;
  terminate-idle)
    terminate_idle
    ;;
  set-idle-timeout)
    set_idle_timeout
    ;;
  *)
    usage
    exit 2
    ;;
esac
