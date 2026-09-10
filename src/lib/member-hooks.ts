// member-hooks.ts — composition root ของ "ของแจกย้อนกลับ" ในระบบสมาชิก v2 (M2.5)
//
// ปัญหาที่ไฟล์นี้แก้: โมดูลสมาชิกเป็นคนรู้ว่า "ลูกค้าขึ้นระดับแล้ว" แต่คนที่ออก voucher ต้อนรับคือ
// โมดูล voucher — ถ้าให้ `member/tiers.ts` เรียก voucher ตรง ๆ จะเกิดวงจร member↔voucher ที่ผูก
// กันตั้งแต่ตอนโหลดโมดูล (และ fitness F2 ตั้งใจให้ทิศเดียว voucher→member)
// ⇒ ทางออกแบบเดียวกับ `approval-effects.ts` / `pos/account-bridge.ts`: ต่อสายที่ **นอก** modules
//
// 🔴 `registerMemberHooks()` ต้อง **idempotent** — ถูกเรียกจากหลายทางเข้า (คิว outbox · cron · action)
//    ลงทะเบียนซ้ำ = ออก voucher ต้อนรับ 2 ใบต่อการเลื่อนระดับ 1 ครั้ง
// 🔴 hook ล้ม **ห้าม** พาการเลื่อนระดับที่บันทึกไปแล้วล้มตาม (ฝั่ง tiers.ts จับ error ให้อยู่แล้ว
//    แต่ที่นี่ก็ไม่โยนออกไปเช่นกัน — ของแถมพลาดดีกว่าประวัติระดับเพี้ยน)
//
// ทางเข้าอื่นที่ "ต่อกันเอง" ไม่ต้องผ่านไฟล์นี้ (เพราะไม่เกิดวงจร):
//   · รวมสมาชิกซ้ำ → `member/profile.ts` เรียก `mergeVouchers` ผ่าน dynamic import (แบบ mergeGiftCards)
//   · สแตมป์ครบใบ (rewardKind VOUCHER) → `stamp/service.ts` เรียก facade voucher (เส้น stamp→voucher)

import { benefitsFor, onTierChanged } from "@/lib/modules/member";
import { VOUCHER_SYSTEM_ACTOR, issue } from "@/lib/modules/voucher";

let registered = false;

export function registerMemberHooks(): void {
  if (registered) return;
  registered = true;

  // M1.9 → M2.5: ระดับใหม่ที่มีสิทธิประโยชน์ "WELCOME_VOUCHER" → ออกใบต้อนรับให้ทันที
  //   idempotent ต่อ (ลูกค้า, ระดับ): originRef = { tierDefId } ⇒ เลื่อนขึ้น-ลง-ขึ้นซ้ำ ได้ใบเดียว
  //   (กติกา §11.6 "ของต้อนรับให้ครั้งเดียวต่อระดับ" — ไม่ใช่ทุกครั้งที่แตะระดับนั้น)
  onTierChanged(async (evt) => {
    const ctx = { tenantId: evt.tenantId, systemId: evt.systemId, actorUserId: null };
    const benefits = await benefitsFor(ctx, evt.customerId);
    const templateId = benefits.welcomeVoucherTemplateId;
    if (!templateId) return;
    await issue(
      { tenantId: evt.tenantId, systemId: evt.systemId, actorUserId: null },
      VOUCHER_SYSTEM_ACTOR,
      {
        customerIds: [evt.customerId],
        templateId,
        origin: "TIER",
        originRef: { tierDefId: evt.toTierDefId },
        reason: "ของต้อนรับเมื่อขึ้นระดับ",
      },
    );
  });
}
