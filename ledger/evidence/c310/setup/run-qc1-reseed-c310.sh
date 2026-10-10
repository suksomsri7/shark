#!/usr/bin/env bash
# C3.10 (7 Oct): reseed QC1 from the main tree — member → m1.1 → crm ×2 → acc-v2 (+3 oracle generators) → kanban-check by qc:all → DRAIN
# copied from scripts/pending/run-qc1-reseed.sh (share-keys step dropped: no other worktree is touched in C3.10)
set -uo pipefail
cd /root/projects/shark-crm
L=/tmp/c310-logs/reseed.log; : > "$L"; ST=/tmp/c310-logs/status.txt
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" | tee -a "$L"; exit 1;; esac
case "$P$D" in *ep-royal-night*) echo "PROD" | tee -a "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { n=$1; echo "== $n == $(date -u +%T)" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; rc=$?; echo "exit=$rc $(date -u +%T)" | tee -a "$L"; echo "$(date -u +%FT%TZ) step2 $n rc=$rc" >> "$ST"; }
G="bash scripts/with-gate-lock.sh pnpm exec tsx"
r "seed member"     $G scripts/seed-member-qc.mts
r "qc-member-m1.1"  $G scripts/qc-member-m1.1.mts
r "seed crm #1"     $G scripts/seed-crm-qc.mts
cp scripts/crm-expected.json /tmp/c310-logs/crm-expected.after-seed1.json
r "seed crm #2"     $G scripts/seed-crm-qc.mts
cp scripts/crm-expected.json /tmp/c310-logs/crm-expected.after-seed2.json
r "seed acc-v2"     $G scripts/seed-acc-v2-qc.mts
r "oracle dashboard"       $G scripts/acc-v2-expected-dashboard.mts
r "oracle contacts"        $G scripts/acc-v2-expected-contacts.mts
r "oracle contact-profile" $G scripts/acc-v2-expected-contact-profile.mts
r "DRAIN"           $G scripts/qc-cron.mts
r "backup qc1-expected" bash -c 'B=.qc-shots/qc1-expected; mv "$B" /tmp/c310-logs/qc1-expected.old-$(date -u +%H%M) 2>/dev/null; mkdir -p "$B/scripts/fixtures/acc-v2" && cp scripts/crm-expected.json scripts/member-expected.json scripts/acc-v2-expected.json "$B/scripts/" && cp scripts/fixtures/acc-v2/kbank-2026-0*.expected.json "$B/scripts/fixtures/acc-v2/" && find "$B" -type f'
echo ALLDONE | tee -a "$L"
