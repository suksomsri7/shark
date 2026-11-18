#!/usr/bin/env bash
cd /root/projects/shark-hr
L=/tmp/hr-ctl/vis5b-build/runs3; mkdir -p $L
run() { local name=$1; shift; echo "== $name start $(date -u +%H:%M:%S)" >> $L/_index.txt; bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh "$@" > $L/$name.log 2>&1; echo "== $name exit=$? :: $(grep -aE 'JSON_SUMMARY' $L/$name.log | tail -1 | cut -c1-200)" >> $L/_index.txt; }
F="env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7"
run dump $F pnpm exec tsx /tmp/hr-ctl/vis5b-build/dump.mts
run vis5b-f1 $F pnpm exec tsx scripts/qc-hr-vis-5b.mts
run vis5b-f2 $F pnpm exec tsx scripts/qc-hr-vis-5b.mts
run vis5b-unforced env QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5b.mts
for s in h2.11 h4.2 priv-2; do run qc-hr-$s $F pnpm exec tsx scripts/qc-hr-$s.mts; done
run fitness-hr-env pnpm exec tsx scripts/fitness-hr.mts
run fitness-env pnpm exec tsx scripts/fitness.mts
for s in fitness-hr fitness; do env -u DATABASE_URL -u DIRECT_URL bash scripts/iso.sh pnpm exec tsx scripts/$s.mts > $L/$s-nodb.log 2>&1; echo "== $s-nodb exit=$? :: $(grep -a JSON_SUMMARY $L/$s-nodb.log | cut -c1-120)" >> $L/_index.txt; done
echo ALLDONE >> $L/_index.txt
