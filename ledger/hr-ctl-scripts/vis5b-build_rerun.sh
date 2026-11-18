#!/usr/bin/env bash
cd /root/projects/shark-hr
L=/tmp/hr-ctl/vis5b-build/runs2; mkdir -p $L
run() { local name=$1; shift; echo "== $name start $(date -u +%H:%M:%S)" >> $L/_index.txt; bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh "$@" > $L/$name.log 2>&1; echo "== $name exit=$? $(date -u +%H:%M:%S) :: $(grep -aE 'JSON_SUMMARY' $L/$name.log | tail -1 | cut -c1-220)" >> $L/_index.txt; }
F="env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
run vis5b-f4 $F pnpm exec tsx scripts/qc-hr-vis-5b.mts
run vis5b-f5 $F pnpm exec tsx scripts/qc-hr-vis-5b.mts
run vis5b-unforced2 env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5b.mts
run vis5c-f2 $F pnpm exec tsx scripts/qc-hr-vis-5c.mts
for s in h2.10 h2.11 h4.2 h4.3 priv-2 h3.9; do run qc-hr-$s $F pnpm exec tsx scripts/qc-hr-$s.mts; done
for s in qc-hf-hr-privacy qc-pages qc-nav-functions; do run $s $F pnpm exec tsx scripts/$s.mts; done
run fitness-hr-env pnpm exec tsx scripts/fitness-hr.mts
run fitness-env pnpm exec tsx scripts/fitness.mts
echo ALLDONE >> $L/_index.txt
