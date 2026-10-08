#!/usr/bin/env bash
# C3.10 (7 Oct) part 2: acc-v2 seed failed at real clock (seed time bomb, see shift-clock.cjs) ⇒ re-run ONLY the acc-v2 seed
#   with its JS clock shifted to 2026-09-30 09:00 +07 (the seed's own pinned day), then the 3 oracle generators at the
#   REAL clock (they pin NOW to QC.today themselves), DRAIN, refresh the qc1-expected backup.
set -uo pipefail
cd /root/projects/shark-crm
L=/tmp/c310-logs/reseed-accv2b.log; : > "$L"; ST=/tmp/c310-logs/status.txt
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1" | tee -a "$L"; exit 1;; esac
case "$P$D" in *ep-royal-night*) echo "PROD" | tee -a "$L"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { n=$1; echo "== $n == $(date -u +%T)" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; rc=$?; echo "exit=$rc $(date -u +%T)" | tee -a "$L"; echo "$(date -u +%FT%TZ) step2b $n rc=$rc" >> "$ST"; }
G="bash scripts/with-gate-lock.sh pnpm exec tsx"
r "seed acc-v2 (JS clock 2026-09-30T09:00+07)" env C310_FAKE_NOW=2026-09-30T09:00:00+07:00 \
  NODE_OPTIONS="--max-old-space-size=3584 --require /tmp/c310-logs/shift-clock.cjs" $G scripts/seed-acc-v2-qc.mts
r "oracle dashboard"       $G scripts/acc-v2-expected-dashboard.mts
r "oracle contacts"        $G scripts/acc-v2-expected-contacts.mts
r "oracle contact-profile" $G scripts/acc-v2-expected-contact-profile.mts
r "DRAIN"           $G scripts/qc-cron.mts
r "backup qc1-expected" bash -c 'B=.qc-shots/qc1-expected; rm -rf "$B"; mkdir -p "$B/scripts/fixtures/acc-v2" && cp scripts/crm-expected.json scripts/member-expected.json scripts/acc-v2-expected.json "$B/scripts/" && cp scripts/fixtures/acc-v2/kbank-2026-0*.expected.json "$B/scripts/fixtures/acc-v2/" && find "$B" -type f'
echo ALLDONE | tee -a "$L"
