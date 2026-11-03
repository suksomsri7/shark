#!/usr/bin/env bash
# sec-baseline.sh — run every existing qc-ai-*.mts (forced) on the secretary QC branch and record summaries (controller-run · S0 baseline)
set -uo pipefail
cd /root/projects/shark-sec
OUT=ledger/qc-baseline/sec-baseline-$(git rev-parse --short HEAD).txt
: > "$OUT"
echo "== migrate status $(date -u +%FT%TZ)" | tee -a "$OUT"
bash scripts/iso.sh bash scripts/qc-sec.sh pnpm exec prisma migrate status 2>&1 | tail -6 | tee -a "$OUT"
for f in scripts/qc-ai-*.mts scripts/qc-mobile-*.mts scripts/qc-approval*.mts scripts/qc-chat-*.mts; do
  [ -f "$f" ] || continue
  n=$(basename "$f" .mts)
  echo "== $n $(date -u +%H:%M:%SZ)" | tee -a "$OUT"
  timeout 900 bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx "$f" > /tmp/sec-baseline-$n.log 2>&1
  rc=$?
  { grep -E "JSON_SUMMARY|FINDINGS:|SKIP|residue" /tmp/sec-baseline-$n.log | tail -3; echo "exit=$rc"; } | tee -a "$OUT"
done
echo "== done $(date -u +%FT%TZ)" | tee -a "$OUT"
