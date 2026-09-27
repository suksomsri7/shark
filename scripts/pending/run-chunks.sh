#!/usr/bin/env bash
# C4.2 iteration runner (builder · worktree c23) — usage: run-chunks.sh <label> <extra args…>
# launch: systemd-run --unit=crm-c42-<label> --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm-c23/.qc-shots/c42/run-chunks.sh <label> [args]
set -uo pipefail
LABEL="$1"; shift
cd /root/projects/shark-crm-c23
L=.qc-shots/c42/$LABEL.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' /root/projects/shark-crm/.env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' /root/projects/shark-crm/.env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" | tee -a "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all CRM_EXPECTED_PATH=/root/projects/shark-crm/scripts/crm-expected.json
echo "== serve start $(date -u +%H:%M:%S) ==" >> "$L"
( cd /root/projects/shark-crm && env NODE_OPTIONS=--max-old-space-size=4608 bash scripts/acc-v2-serve.sh start ) >> "$L" 2>&1
if [ -z "${CHUNKS_OVERRIDE:-}" ]; then
  CHUNKS=('re:^/(companies|contacts)' 're:^/(deals|activities|calendar|commissions|pipelines|reports|emails|objects)' 're:^/settings' 're:^/(app|p|b|u)/')
else
  IFS='|' read -r -a CHUNKS <<< "$CHUNKS_OVERRIDE"
fi
i=0
for c in "${CHUNKS[@]}"; do
  i=$((i+1))
  echo "== chunk $i $c $(date -u +%H:%M:%S) ==" >> "$L"
  bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-crm-buttons.mts --page "$c" "$@" >> "$L" 2>&1
  echo "exit=$? $(date -u +%H:%M:%S)" >> "$L"
  [ -f .qc-shots/crm/buttons/summary.json ] && cp .qc-shots/crm/buttons/summary.json ".qc-shots/c42/$LABEL-summary-$i.json"
  for f in .qc-shots/crm/buttons/discover-*.json; do [ -f "$f" ] && cp "$f" ".qc-shots/c42/$LABEL-$(basename "$f" .json)-$i.json"; done
done
echo ALLDONE >> "$L"
