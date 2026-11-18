#!/usr/bin/env bash
# scratch: clean typecheck, started only when MemAvailable >= 12 GB at the moment the gate lock is held (retries up to 12x)
cd /root/projects/shark-hr-l3
for i in $(seq 1 12); do
  rm -rf .next/types tsconfig.tsbuildinfo
  env NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M timeout 5400 bash scripts/iso.sh bash scripts/with-gate-lock.sh bash -c 'm=$(awk "/MemAvailable/{print \$2}" /proc/meminfo); echo "mem_kb=$m"; [ "$m" -ge 12582912 ] || exit 77; pnpm typecheck'
  rc=$?; echo "try=$i rc=$rc"
  [ $rc -ne 77 ] && break
  sleep 120
done
echo "TCDONE rc=$rc"
