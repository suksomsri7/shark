// Business DNA — สัญญาข้อมูลกลางของ M3 (FREEZE โดย Fable — แก้ต้องผ่านสถาปนิก)
//
// หลักที่ห้ามละเมิด (จากแผน AI Business OS §4.3):
// 1. DnaFacts = "ข้อเท็จจริงของธุรกิจ" ไม่ใช่ตัวเลือกโมดูล
//    — AI/wizard ตอบว่า "มีห้องพัก 12 ห้อง" ไม่ใช่ "เปิดระบบ Hotel"
//    ถ้าตอบเป็นโมดูล = debug ไม่ได้ · ตอบเป็นข้อเท็จจริง = ชี้กฎที่ยิงได้เสมอ
// 2. BlueprintPlan = union ปิด + ผ่าน Zod — AI/wizard คิด step ชนิดใหม่เองไม่ได้
// 3. ทุก step ต้องมี `because` (ข้อเท็จจริงข้อไหนทำให้เกิด step นี้) = story ของ support

import { z } from "zod";
import { createHash } from "node:crypto";

// ─────────────────── DnaFacts ───────────────────

export const ZDnaFacts = z.object({
  /** hint เท่านั้น — ห้ามใช้ switch ตามค่านี้ (กฎ compile ดูข้อเท็จจริงรายข้อ) */
  industryHint: z.enum(["SALON", "RESTAURANT", "HOTEL", "CLINIC", "RETAIL", "SERVICE", "OTHER"]),
  branchCount: z.number().int().min(1).max(20),
  /** ลูกค้านัดหมาย/จองคิวล่วงหน้า */
  appointment: z.boolean(),
  /** มีโต๊ะให้ลูกค้านั่ง (ร้านอาหาร/คาเฟ่) */
  tables: z.boolean(),
  /** มีห้องพักให้เข้าพัก */
  rooms: z.boolean(),
  /** มีคิวหน้าร้านแบบ walk-in (บัตรคิว) */
  walkinQueue: z.boolean(),
  /** ขายสินค้า/คิดเงินหน้าร้าน */
  sellsGoods: z.boolean(),
  /** มีระบบสมาชิก/สะสมแต้ม */
  membership: z.boolean(),
  /** ให้เอาแต้มแลกของรางวัล (ถามต่อเมื่อ membership) */
  rewardRedeem: z.boolean(),
  staffCount: z.number().int().min(0).max(500),
  /** จดทะเบียน VAT */
  vatRegistered: z.boolean(),
  /** ต้องการระบบบัญชี/ออกเอกสาร */
  wantsAccounting: z.boolean(),
  /** ใช้ LINE OA คุยกับลูกค้า */
  usesLineOA: z.boolean(),
});
export type DnaFacts = z.infer<typeof ZDnaFacts>;

// ─────────────────── BlueprintPlan — union ปิด ───────────────────
// อ้างถึงกันด้วย ref = "step:<index>" (applier resolve id จริงตอน apply)
// step ทุกชนิด map ตรงกับ primitive ที่มีอยู่แล้วเท่านั้น (ห้ามเพิ่ม primitive ใหม่ใน M3):
//   CREATE_UNIT        → prisma.businessUnit.create
//   CREATE_SYSTEM      → system/service.createSystem
//   LINK_UNIT          → system/service.linkUnit
//   LINK_ACCOUNT_POS   → prisma.accountSystemLink.create (ท่อ M1 — DNA ต่อสายให้อัตโนมัติ)
//   ACCOUNT_SETTINGS   → account/service.saveSettings + gl.ensureAccounting

const because = z.string().min(1); // บังคับทุก step — ห้ามว่าง

export const ZBlueprintStep = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CREATE_UNIT"),
    unitType: z.enum(["HOTEL", "RESTAURANT", "BOOKING", "QUEUE", "TICKET"]),
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    because,
  }),
  z.object({
    type: z.literal("CREATE_SYSTEM"),
    systemType: z.enum(["MEMBER", "POINT", "POS", "REWARD", "COUPON", "CHAT", "ACCOUNT", "MEETING", "KANBAN", "INVENTORY", "HR"]),
    name: z.string().min(1),
    because,
  }),
  z.object({
    type: z.literal("LINK_UNIT"),
    systemRef: z.string().regex(/^step:\d+$/),
    unitRef: z.string().regex(/^step:\d+$/),
    because,
  }),
  z.object({
    type: z.literal("LINK_ACCOUNT_POS"),
    accountRef: z.string().regex(/^step:\d+$/),
    posRef: z.string().regex(/^step:\d+$/),
    because,
  }),
  z.object({
    type: z.literal("ACCOUNT_SETTINGS"),
    accountRef: z.string().regex(/^step:\d+$/),
    settings: z.object({
      orgName: z.string(),
      vatRegistered: z.boolean(),
    }),
    because,
  }),
]);
export type BlueprintStep = z.infer<typeof ZBlueprintStep>;

export const ZBlueprintPlan = z.object({
  dnaVersion: z.literal(1),
  steps: z.array(ZBlueprintStep).max(100),
});
export type BlueprintPlan = z.infer<typeof ZBlueprintPlan>;

/** hash ของแผน — compile ต้อง pure: facts เดิม → hash เดิมเสมอ (oracle ตรวจ) */
export function planHash(plan: BlueprintPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
}
