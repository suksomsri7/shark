# Reward / แลกของรางวัลด้วยแต้ม (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
ลูกค้าใช้แต้ม (จากระบบแต้มที่ผูก unit เดียวกัน) แลกรางวัล. ผู้ใช้: staff (ตั้งรางวัล/ยืนยันแลก). **Layer 4: Loyalty** (feature no.7) — scope ตาม systemId (ระบบรางวัล).
โค้ด: `src/lib/modules/reward/service.ts` · schema `prisma/schema/reward.prisma`.

## Data model (prisma/schema/reward.prisma)
- **Reward** — `systemId`(scope) `name` `pointsCost` `stock?`(null=ไม่จำกัด) `active` `sortOrder`. index `[tenantId,systemId]`.
- **RewardRedemption** — `rewardId` `customerId` `pointsCost`(snapshot) `code`(โค้ดรับของ) `status`(PENDING/FULFILLED/CANCELLED). index `[tenantId,systemId,customerId]`.

## Service API (src/lib/modules/reward/service.ts)
- `listRewards(tenantId, systemId, activeOnly=false)` — รายการรางวัล.
- `createReward({...})` — สร้างรางวัล (name/pointsCost/stock).
- `removeReward(tenantId, rewardId)` — ลบ/ปิด.
- `redeem({...})` — แลก: **เรียก point.burn** หักแต้ม, ตัด stock, สร้าง RewardRedemption(code) status PENDING.

## การเชื่อมต่อ
- **ออก → Point**: `redeem` เรียก point.burn (หักแต้มลูกค้า) ผ่าน service (ระบบแต้มที่ผูก unit เดียวกัน).
- **Member**: อ้าง Customer.id.
- ไม่มี outbox event.

## Permissions
ไม่มี `assertCan "reward.*"` string ในโมดูล (grep=ว่าง). การจัดการรางวัลผ่าน action `addRewardAction/removeRewardAction` ใน `src/lib/actions/systems.ts` (composition root ของหน้าระบบ) — ตรวจสิทธิ์ที่ requireTenant. — เป็นหนี้เชิงมาตรฐาน.

## UI
- section ในหน้าระบบ REWARD: `/app/sys/[id]` (type=REWARD) — "รายการรางวัล" + ฟอร์มเพิ่ม (name/pointsCost) + ลบ.

## การทดสอบ
- `scripts/qc-systems.mts` — reward ในชุด 7 ระบบ (สร้างรางวัล/แลก ผ่าน service จริง เชื่อม point).

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- ไม่มี assertCan string เฉพาะ.
- redemption มีสถานะ FULFILLED/CANCELLED แต่ flow ยืนยันรับของ/คืนแต้มยังบาง(service ปัจจุบันเน้น redeem).
