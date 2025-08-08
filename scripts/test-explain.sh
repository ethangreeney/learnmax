#!/usr/bin/env bash
set -euo pipefail
url="${1:-http://localhost:3000/api/explain-db}"
title="${2:-Trees}"
sub="${3:-Introduction}"
curl -sS -X POST "$url" -H 'Content-Type: application/json' \
  --data "{\"lectureTitle\":\"$title\",\"subtopic\":\"$sub\"}" | jq .
