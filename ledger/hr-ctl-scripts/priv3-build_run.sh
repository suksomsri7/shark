#!/usr/bin/env bash
# usage: run.sh <tag> <suite.mts> [force=1]
cd /root/projects/shark-hr-l5
tag=$1; suite=$2; force=${3:-1}
if [ "$force" = 1 ]; then F="QC_FORCE=1"; else F="QC_NOFORCE=1"; fi
timeout 3000 bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env $F QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/$suite > /tmp/hr-ctl/priv3-build/logs/$tag.log 2>&1
rc=$?
s=$(grep -E "^=====|JSON_SUMMARY" /tmp/hr-ctl/priv3-build/logs/$tag.log | tail -2 | tr '\n' ' ' | cut -c1-400)
echo "$tag rc=$rc $s" >> /tmp/hr-ctl/priv3-build/summary.txt
