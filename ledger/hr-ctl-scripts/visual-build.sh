#!/usr/bin/env bash
cd /root/projects/shark-hr || exit 9
O=/tmp/hr-ctl/visual-build.out; : > $O
bash scripts/iso.sh pnpm exec prisma generate > /tmp/hr-ctl/vb-gen.log 2>&1; echo "generate exit=$?" >> $O
bash scripts/iso.sh bash scripts/qc-hr.sh pnpm exec prisma migrate deploy > /tmp/hr-ctl/vb-mig.log 2>&1; echo "migrate exit=$? $(tail -1 /tmp/hr-ctl/vb-mig.log)" >> $O
bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-hr-qc.mts > /tmp/hr-ctl/vb-seed.log 2>&1; echo "seed exit=$? $(grep -a JSON_SUMMARY /tmp/hr-ctl/vb-seed.log | cut -c1-80)" >> $O
ISO_MEM=16000M bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=12288 SHARK_TSC_PREBUILD_OK=1 ACC_V2_PORT=3226 ACC_V2_BUILD_FLAGS=--webpack bash scripts/qc-hr.sh bash scripts/acc-v2-serve.sh build > /tmp/hr-ctl/vb-build.log 2>&1; echo "build exit=$? $(date -u +%H:%MZ)" >> $O
echo VBDONE >> $O
