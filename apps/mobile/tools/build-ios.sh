#!/bin/bash
# บิว iOS + ส่งขึ้น TestFlight (build #16) — รันได้ทันทีที่โควต้า EAS รีเซ็ต (1 ส.ค.)
#
# ใช้: EXPO_TOKEN=<token ใน memory reference_expo_token.md> bash tools/build-ios.sh [--submit]
#   ไม่ใส่ --submit = บิวอย่างเดียว (เอา buildId ไป submit ทีหลัง)
#
# ของที่ติดมาใน build นี้ (โค้ดพร้อมใน main แล้ว):
#   · icon ส่ง paper-plane · ‹ กลับ sessions · push notification จริง · OTA (expo-updates)
#   · first-tap welcome + orb เต้น · icon แอปพื้นขาว
#   · P4 QuotaBar (แถบโควตาผู้ช่วย AI) · กันยิงซ้ำตอน focus + cache โควตา 30 วิ
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${EXPO_TOKEN:-}" ]; then
  echo "❌ ต้องตั้ง EXPO_TOKEN ก่อน (อยู่ใน memory: reference_expo_token.md)"; exit 1
fi

echo "▶ ด่านก่อนบิว (ห้ามข้าม — บิวเสียโควต้า 1 ก้อนต่อครั้ง)"
npx --yes expo-doctor@latest
NODE_OPTIONS=--max-old-space-size=1024 pnpm typecheck
( cd ../.. && NODE_OPTIONS=--max-old-space-size=1024 pnpm tsx scripts/qc-mobile-app.mts )

echo "▶ สั่งบิว production (autoIncrement จะเลื่อนเลข build ให้เอง)"
npx --yes eas-cli@latest build -p ios --profile production --non-interactive --no-wait

echo
echo "✅ สั่งบิวแล้ว — ดูสถานะ: npx eas-cli build:list --limit 1"
echo "   เสร็จแล้วส่งขึ้น TestFlight: npx eas-cli submit -p ios --id <buildId> --non-interactive"
echo "   (กลุ่มเทส 'ทีมเทส SHARK' hasAccessToAllBuilds → เข้าอัตโนมัติ ไม่ต้องเพิ่ม tester ใหม่)"

if [ "${1:-}" = "--submit" ]; then
  echo "▶ รอบิวเสร็จแล้ว submit ต่อ (ใช้เวลา ~20-40 นาที)"
  npx --yes eas-cli@latest build:list --limit 1 --non-interactive --json |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s)[0];console.log(b.id)})" > /tmp/shark-build-id
  npx --yes eas-cli@latest submit -p ios --id "$(cat /tmp/shark-build-id)" --non-interactive
fi
