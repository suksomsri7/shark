#!/bin/bash
cd /root/projects/shark-trips-l1
run() { name=$1; shift; echo "=== $name" ; "$@" > scratchpad/w1.2/r-$name.log 2>&1; echo "EXIT $name $?"; }
run seed1 bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-trips-qc.mts
run seed2 bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-trips-qc.mts
for s in w1.2 w1.1 t0.6 t0.4 t0.7 t0.1; do run $s bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-$s.mts; done
run fitness bash scripts/iso.sh pnpm fitness
run fitness-nodb bash scripts/iso.sh env -u DATABASE_URL pnpm fitness
rm -rf .next/types tsconfig.tsbuildinfo; NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M run typecheck bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck
echo ALLDONE
