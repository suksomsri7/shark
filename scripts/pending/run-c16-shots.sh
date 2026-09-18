#!/usr/bin/env bash
set -uo pipefail
cd /root/projects/shark-crm
bash scripts/acc-v2-serve.sh start
pnpm exec tsx scripts/visual-crm.mts 1.6 --user owner 2>&1 | grep -E "JSON_SUMMARY|❌" | cut -c1-200
pnpm exec tsx scripts/visual-crm.mts 1.6 --user nok 2>&1 | grep -E "JSON_SUMMARY|❌" | cut -c1-200
bash scripts/acc-v2-serve.sh stop
