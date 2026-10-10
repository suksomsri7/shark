#!/usr/bin/env bash
# C3.10 builder lane (resume 2) — run one heavy command on QC1 from the c310 worktree OUTSIDE the session cgroup:
#   iso.sh (systemd-run, own MemoryMax) → env (QC1 URLs) → with-gate-lock.sh → command.
# usage: run-iso.sh <logname> <command…>      e.g. run-iso.sh c3.7-r1 pnpm exec tsx scripts/qc-crm-c3.7.mts
set -uo pipefail
cd /root/projects/shark-crm-c310
N="$1"; shift
L=/tmp/c310-logs/lane/$N.log
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P" in *ep-plain-art*) ;; *) echo "DATABASE_URL not QC1 — stop" | tee "$L"; exit 1;; esac
case "$D" in *ep-plain-art*) ;; *) echo "DIRECT_URL not QC1 — stop" | tee "$L"; exit 1;; esac
echo "== $N start $(date -u +%FT%TZ) · HEAD $(git rev-parse --short HEAD) · iso ISO_MEM=${ISO_MEM:-5G} · cmd: $*" > "$L"
ISO_MEM="${ISO_MEM:-5G}" bash scripts/iso.sh env DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all \
  QC_BASE=http://127.0.0.1:3215 SHARK_AI_MOCK=1 ${EXTRA_ENV:-} \
  bash scripts/with-gate-lock.sh "$@" >> "$L" 2>&1
rc=$?
echo "== $N end $(date -u +%FT%TZ) rc=$rc" >> "$L"
exit $rc
