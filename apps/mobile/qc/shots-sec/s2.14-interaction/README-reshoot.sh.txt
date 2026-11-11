#!/usr/bin/env bash
# S2.14 ถ่ายใหม่ทุก route ทุก spec (--both) + ภาพคู่ — รันจากรากทรี shark-sec-d ภายใน iso.sh
set -u
cd /root/projects/shark-sec-d
FX=apps/mobile/qc/fixtures/secretary
SH=apps/mobile/qc/shots-sec
COMMON="QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4727"
FAIL=0
shoot() { # fixture routes [outdir] [mode]
  local out=${3:-$PWD/$SH}; local mode=${4:---both}
  echo "=== shoot $1 → $out : $2"
  env $COMMON ROUTES="$2" FIXTURE=$FX/$1 QC_OUT=$out node apps/mobile/qc/shoot-sec.mjs $mode > /tmp/claude-0/-root/454e4bb2-8f6f-50ca-82f8-f98dfaa88abe/scratchpad/s214/shoot-$1-$(basename $out).log 2>&1 || { echo "!!! FAIL $1"; FAIL=1; }
  grep -c '"ok": true' /tmp/claude-0/-root/454e4bb2-8f6f-50ca-82f8-f98dfaa88abe/scratchpad/s214/shoot-$1-$(basename $out).log
}
pair() { # set page shotbase pairname [dir]
  local d=${5:-$SH}
  bash scripts/parity-sec.sh $1 $2 $d/$3.png $d/$3-$4-pair.png >/dev/null || { echo "!!! pair $3"; FAIL=1; }
  bash scripts/parity-sec.sh $1 $2 $d/$3-dark.png $d/$3-dark-$4-pair.png --dark >/dev/null || { echo "!!! pair dark $3"; FAIL=1; }
}
if [ "${EXPORT:-0}" = 1 ]; then env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-d QC_PORT=4727 ROUTES=/secretary FIXTURE=$FX/s2.20.json QC_OUT=/tmp/claude-0/-root/454e4bb2-8f6f-50ca-82f8-f98dfaa88abe/scratchpad/s214/exp node apps/mobile/qc/shoot-sec.mjs > /tmp/claude-0/-root/454e4bb2-8f6f-50ca-82f8-f98dfaa88abe/scratchpad/s214/export.log 2>&1 || { echo "!!! export"; exit 1; }; fi
R24=/secretary,/secretary/new,/secretary/room/r1,/secretary/inbox,/secretary/scheduled,/secretary/staff,/secretary/staff/m1,/secretary/staff/invite,/secretary/settings,/secretary/settings/secretary,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers,/secretary/settings/account,/secretary/settings/quota,/secretary/onboarding/name,/secretary/help,/secretary/help/c1,/customers,/customers/x1,/customers/x1/info,/business/new
shoot s2.1.json "$R24"; pair c 4 secretary c3
S12='/signup?name=%E0%B8%AA%E0%B8%B8%E0%B8%82&phone=0812345678&email=suk%40thebean.co'
O12='/otp?phone=0812345678&mode=signup&name=%E0%B8%81&email=a%40b.co'
shoot s2.12.json "/login,$S12,$O12,/phone"; pair c 1 signup c1; pair c 2 otp c2
shoot s2.2.json /secretary,/secretary/new; pair a 2 secretary-new a2
shoot s2.2-empty.json /secretary $PWD/$SH/s2.2-empty; pair c 4 secretary c3 $SH/s2.2-empty
shoot s2.4.json /secretary/room/r1; pair a 4 secretary-room-r1 a4
shoot s2.4-running.json /secretary/room/r1 $PWD/$SH/s2.4-running; pair a 3 secretary-room-r1 a3 $SH/s2.4-running
shoot s2.4-done.json /secretary/room/r1 $PWD/$SH/s2.4-done; pair a 5 secretary-room-r1 a5 $SH/s2.4-done
shoot s2.5.json /secretary/inbox,/secretary/scheduled; pair a 6 secretary-inbox a6; pair a 7 secretary-scheduled a7
shoot s2.7.json /secretary/settings,/secretary/settings/secretary,/secretary/settings/quota,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers
pair b 2 secretary-settings-secretary b2; pair b 3 secretary-settings-access b3; pair b 4 secretary-settings-rules b4; pair b 5 secretary-settings-log b5; pair b 6 secretary-settings-knowledge b6; pair b 7 secretary-settings-customers b7; pair b 8 secretary-settings-quota b8
shoot s2.7-staff.json /secretary/settings,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers $PWD/$SH/s2.7-staff --both
shoot s2.10.json /secretary/staff,/secretary/room/r2,/secretary/onboarding/name; pair d 2 secretary-room-r2 d2; pair c 3 secretary-onboarding-name c1
shoot s2.15.json /secretary/help,/secretary/help/c1; pair h 1 secretary-help h1; pair h 2 secretary-help-c1 h2
shoot s2.17.json /customers,/customers/x1,/customers/x1/info,/secretary/settings/customers; pair k 2 customers-x1 k2; pair k 3 customers-x1-info k3
shoot s2.21.json /business/new,/secretary/staff/invite,/secretary/staff/m1,/secretary/settings/account; pair g 1 business-new g1; pair g 2 secretary-staff-invite g2; pair g 3 secretary-staff-m1 g3; pair g 4 secretary-settings-account g4
shoot s2.21-mgr.json /secretary/staff/invite,/secretary/staff/m1,/secretary/staff/m2,/secretary/settings/account $PWD/$SH/s2.21-mgr
shoot s2.20.json /secretary,/customers,/secretary/staff; pair a 1 secretary a1; pair k 1 customers k1; pair d 1 secretary-staff d1
echo "RESHOOT_DONE FAIL=$FAIL"
# S2.14: ชีต/ส่วนที่ต้องกด-เลื่อน (B1 C4 D3 K4 K5) + เลื่อนสุด/ระยะของลอยล่าง (F1/F4) ทั้ง 2 ธีม
SP=/tmp/claude-0/-root/454e4bb2-8f6f-50ca-82f8-f98dfaa88abe/scratchpad/s214
I=$SH/s2.14-interaction
cp $SH/s2.14-interaction/README-states.mjs.txt $SP/state-shots.mjs; cp $SH/s2.13-interaction/README-padding.mjs.txt $SP/pad-check.mjs; cp $SH/s2.13-interaction/README-serve.mjs.txt $SP/serve.mjs
node $SP/serve.mjs /root/qc-shark-mobile-sec-d/dist 4728 & SRV=$!
sleep 1
node $SP/state-shots.mjs http://127.0.0.1:4728 $PWD/$I $PWD/$FX > $SP/states-i.log 2>&1 || { echo "!!! states"; FAIL=1; }
for p in "b1-switcher b 1" "c4-reject-sheet c 4" "d3-add-member d 3" "k4-channels k 4" "k5-routing k 5" "a1-scope-tenant a 1"; do set -- $p
  bash scripts/parity-sec.sh $2 $3 $I/$1.png $I/$1-pair.png >/dev/null || { echo "!!! pair $1"; FAIL=1; }
  bash scripts/parity-sec.sh $2 $3 $I/$1-dark.png $I/$1-dark-pair.png --dark >/dev/null || { echo "!!! pair dark $1"; FAIL=1; }
done
node $SP/pad-check.mjs http://127.0.0.1:4728 $PWD/$I \
  "/secretary|$FX/s2.20.json|sec-home-new" "/secretary/new|$FX/s2.2.json" "/secretary/inbox|$FX/s2.5.json" "/customers|$FX/s2.20.json" \
  "/customers/x1|$FX/s2.17.json" "/secretary/staff|$FX/s2.20.json|sec-staff-invite" "/secretary/help|$FX/s2.15.json" \
  "/secretary/staff/invite|$FX/s2.21.json|inv-submit" "/secretary/onboarding/name|$FX/s2.10.json|sec-onb-save" "/business/new|$FX/s2.21.json|biz-new-submit" > $SP/pad.log 2>&1 || { echo "!!! padding"; FAIL=1; }
# F4: ภาพคู่ D1/G2 ตอนเลื่อนสุด (แบบ D1/G2 ข้างภาพจริงที่เลื่อนสุด)
bash scripts/parity-sec.sh d 1 $I/secretary-staff-scrolled-end.png $I/secretary-staff-scrolled-end-d1-pair.png >/dev/null || FAIL=1
bash scripts/parity-sec.sh d 1 $I/secretary-staff-dark-scrolled-end.png $I/secretary-staff-dark-scrolled-end-d1-pair.png --dark >/dev/null || FAIL=1
bash scripts/parity-sec.sh g 2 $I/secretary-staff-invite-scrolled-end.png $I/secretary-staff-invite-scrolled-end-g2-pair.png >/dev/null || FAIL=1
bash scripts/parity-sec.sh g 2 $I/secretary-staff-invite-dark-scrolled-end.png $I/secretary-staff-invite-dark-scrolled-end-g2-pair.png --dark >/dev/null || FAIL=1
cp $SH/s2.14-interaction/README-f3.mjs.txt $SP/f3shot.mjs; node $SP/f3shot.mjs > $SP/f3.log 2>&1 || { echo "!!! f3"; FAIL=1; }
bash scripts/parity-sec.sh k 2 $I/k2-image-placeholder.png $I/k2-image-placeholder-pair.png >/dev/null || FAIL=1
bash scripts/parity-sec.sh k 2 $I/k2-image-placeholder-dark.png $I/k2-image-placeholder-dark-pair.png --dark >/dev/null || FAIL=1
kill $SRV
echo "INTERACTION_DONE FAIL=$FAIL"
