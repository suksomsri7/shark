#!/usr/bin/env bash
# Close the member screenshot ENV reds (M3.3-S9.2/S9.3 · M3.6-S8.3 · M3.7-S6.2) after the C2.10+C2.11 unit · QC1 · reuse .next · launch with ABSOLUTE path
set -uo pipefail
cd /root/projects/shark-crm
L=.qc-shots/crm/member-shots-c2close.log; : > "$L"
P=$(grep -E '^DATABASE_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
D=$(grep -E '^DIRECT_URL=' .env.qc | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
case "$P$D" in *ep-plain-art*ep-plain-art*) ;; *) echo "not QC1"; exit 1;; esac
export DATABASE_URL="$P" DIRECT_URL="$D" QC_ENV_FILE=.env.qc CRM_V2_SWITCH=all
r() { echo "== $1 ==" | tee -a "$L"; shift; "$@" >>"$L" 2>&1; echo "exit=$?" | tee -a "$L"; }
r "serve start (reuse .next)" bash scripts/acc-v2-serve.sh start
r "visual-member 3.3 (owner)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.3
r "visual-member 3.3 (thana)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.3 --user thana
r "visual-member 3.6 (owner)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.6
r "visual-member 3.7 (owner)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.7
r "visual-member 3.7 (thana)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.7 --user thana
r "visual-member 3.10 (owner)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-member.mts 3.10
r "shots 2.10 (manager · spec fixed)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.10 --user manager
r "shots 2.11 (owner · selectors quoted)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-crm.mts 2.11
for s in qc-member-m3.3 qc-member-m3.6 qc-member-m3.7 qc-member-m3.10; do r "$s (shots present)" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/$s.mts; done
r "serve stop" bash scripts/acc-v2-serve.sh stop
r "qc-member-m1.9" bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-member-m1.9.mts
echo ALLDONE | tee -a "$L"
