#!/usr/bin/env bash
# pos-vps-autorun.sh — ตัวรันอัตโนมัติบน VPS (cron ทุก 5 นาที) ให้ผู้คุมงาน (cloud) สั่งรอบทดสอบได้เองโดยไม่ต้องรอเจ้าของ
#
# กลไก: ผู้คุมงาน push ไฟล์ `ledger/runs/REQUEST-p1.3` บน branch session/pos ที่มี 1 บรรทัด:
#   <request-id> <head-sha-ที่คาด> [ONLY_VISUAL]
# ตัวนี้ fetch session/pos ทุกรอบ cron → ถ้า request-id ใหม่ (ไม่เคยรัน) → รัน scripts/pos-vps-run-p1.3.sh ครั้งเดียว
#   (สคริปต์นั้นมี flock กันรันซ้อน · ผลขึ้น branch wip/pos-runs-p1.3-<เวลา> เหมือนรันมือ)
#
# ติดตั้งครั้งเดียว (เจ้าของ):
#   (crontab -l 2>/dev/null; echo '*/5 * * * * bash -lc "bash /root/projects/shark-pos/scripts/pos-vps-autorun.sh" >> /root/pos-autorun.log 2>&1') | crontab -
# ปิด: crontab -e แล้วลบบรรทัด pos-vps-autorun · หรือ touch /root/pos-autorun.disabled
#
# 🔴 ขอบเขต: รันได้เฉพาะ scripts/pos-vps-run-p1.3.sh บน tree POS + QC4 (ด่านในสคริปต์นั้น) · ไม่แตะ main/prod/CRM
set -uo pipefail

CTRL="${CTRL:-/root/projects/shark-pos}"        # tree ของผู้คุมงาน (branch session/pos)
STATE="/root/pos-runs/autorun-done.txt"         # request-id ที่รันไปแล้ว
REQ="ledger/runs/REQUEST-p1.3"

[ -f /root/pos-autorun.disabled ] && exit 0
mkdir -p /root/pos-runs && touch "$STATE"

# ไม่รันซ้อนกับตัวเอง (cron รอบถัดไปมาระหว่างที่รอบก่อนยังเดิน)
exec 8>/tmp/pos-vps-autorun.lock
flock -n 8 || exit 0

cd "$CTRL" || { echo "[$(date -u +%FT%TZ)] no $CTRL"; exit 2; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "session/pos" ] || { echo "[$(date -u +%FT%TZ)] $CTRL not on session/pos — skip"; exit 2; }
git fetch -q origin session/pos || exit 0
git merge -q --ff-only origin/session/pos || { echo "[$(date -u +%FT%TZ)] cannot ff session/pos — skip"; exit 2; }

# generic suite requests: ledger/runs/REQUEST-suites-<id> (see scripts/pos-vps-run-suites.sh) — one per cron tick, sorted
for SREQ in ledger/runs/REQUEST-suites-*; do
  [ -f "$SREQ" ] || continue
  read -r SID _ < "$SREQ" || true
  case "$SID" in ""|*[!A-Za-z0-9._-]*) continue ;; esac
  grep -qx "suites:$SID" "$STATE" && continue
  echo "suites:$SID" >> "$STATE"
  echo "[$(date -u +%FT%TZ)] ▶ suites $SID"
  bash scripts/pos-vps-run-suites.sh "$SREQ" > "/root/pos-run-$SID.log" 2>&1
  echo "[$(date -u +%FT%TZ)] ◀ suites $SID exit $? (log /root/pos-run-$SID.log)"
  exit 0
done

[ -f "$REQ" ] || exit 0
read -r RID HEADSHA MODE < "$REQ" || true
case "$RID" in ""|\#*) exit 0 ;; esac
case "$RID" in *[!A-Za-z0-9._-]*) echo "[$(date -u +%FT%TZ)] bad request id"; exit 2 ;; esac
case "$HEADSHA" in *[!0-9a-f]*|"") echo "[$(date -u +%FT%TZ)] bad head sha"; exit 2 ;; esac
grep -qx "$RID" "$STATE" && exit 0

echo "$RID" >> "$STATE"   # บันทึกก่อนรัน: ล้มกลางทาง = ไม่วนรันซ้ำทุก 5 นาที (ผู้คุมงานออก request-id ใหม่เอง)
echo "[$(date -u +%FT%TZ)] ▶ request $RID head $HEADSHA mode ${MODE:-full}"
if [ "${MODE:-}" = "ONLY_VISUAL" ]; then
  EXPECT_HEAD="$HEADSHA" ONLY_VISUAL=1 bash scripts/pos-vps-run-p1.3.sh > "/root/pos-run-$RID.log" 2>&1
else
  EXPECT_HEAD="$HEADSHA" bash scripts/pos-vps-run-p1.3.sh > "/root/pos-run-$RID.log" 2>&1
fi
echo "[$(date -u +%FT%TZ)] ◀ request $RID exit $? (log /root/pos-run-$RID.log)"
