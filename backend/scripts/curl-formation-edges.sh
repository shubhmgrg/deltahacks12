#!/usr/bin/env bash
set -euo pipefail

pick_base_url() {
  # If caller provided a base URL, use it.
  if [[ "${1:-}" != "" ]]; then
    echo "$1"
    return 0
  fi

  # Otherwise, probe common ports (prefer 3000 since your backend currently logs 3000).
  for port in 3000 3001; do
    if curl -sS "http://localhost:${port}/api/health" >/dev/null 2>&1; then
      echo "http://localhost:${port}"
      return 0
    fi
  done

  # Fall back to the original default.
  echo "http://localhost:3001"
}

BASE_URL="$(pick_base_url "${1:-}")"
LIMIT="${LIMIT:-5}"
SKIP="${SKIP:-0}"

URL="${BASE_URL}/api/formation-edges?limit=${LIMIT}&skip=${SKIP}"

echo "GET ${URL}" 1>&2

set +e
BODY="$(curl -sS --fail-with-body "${URL}")"
STATUS=$?
set -e

if [[ "${STATUS}" -ne 0 ]]; then
  echo "Request failed (curl exit: ${STATUS})" 1>&2
  echo "${BODY}" 1>&2
  exit "${STATUS}"
fi

if command -v python3 >/dev/null 2>&1; then
  printf '%s' "${BODY}" | python3 -m json.tool
else
  printf '%s\n' "${BODY}"
fi

