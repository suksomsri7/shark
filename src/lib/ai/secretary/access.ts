// access.ts — สิทธิ์ต่อระบบ 3 ระดับของเลขา (S1.3 · ตาราง AiSystemAccess แกน tenant · 1 แถว/โมดูล)
//
// ทางเข้าเดียวของเรื่องนี้: ส่วนฐานข้อมูล (`getAccess` · `setAccess`) อยู่ที่นี่ · กติกา pure อยู่ที่ ./access-rules.ts ·
// การแปลงชื่อเครื่องมือ → โมดูล/เขียน อยู่ที่ ../tool-access.ts (ตารางสิทธิ์ชุดเดียวกับด่าน membership)
// ไม่มีแถว = ค่าเริ่มต้น (ทุกโมดูล DRAFT · แชท READ) ⇒ ร้านที่ไม่เคยตั้ง = พฤติกรรมเดิมทุกประการ
// 🔴 ค่าในตารางนี้เปลี่ยนได้ทางเดียว = `setAccess` โดย OWNER — ผลของโมเดล/ความจำ/ข้อความลูกค้าไม่มีทางมาถึงที่นี่ (COMMON §C.3)

import { prisma, tenantDb } from "@/lib/core/db";
import { ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { accessFromRows, isAccessLevel, isAiModule, type AccessMap } from "./access-rules";

export {
  ACCESS_LEVELS,
  AI_MODULES,
  ALWAYS_ON,
  DEFAULT_LEVEL,
  DEFAULT_OVERRIDES,
  MODULE_LABEL_TH,
  accessFromRows,
  accessSummaryForPrompt,
  defaultLevelOf,
  isAccessLevel,
  isAiModule,
  levelVerdict,
  moduleLabel,
  type AccessLevel,
  type AccessMap,
  type AiModule,
} from "./access-rules";
export { accessVerdict, kindAllowedByAccess, toolIsWrite, toolModuleOf, type ToolVerdict } from "../tool-access";

/** ระดับของทุกโมดูลของร้าน (1 query · เติมค่าเริ่มต้นครบทุก AI_MODULES) */
export async function getAccess(tenantId: string): Promise<AccessMap> {
  const rows = await tenantDb({ tenantId }).aiSystemAccess.findMany({ select: { module: true, level: true } });
  return accessFromRows(rows);
}

/**
 * ตั้งระดับของโมดูลหนึ่ง — OWNER เท่านั้น (อื่น = ForbiddenError) · ตรวจครบก่อนเขียน (ผิด = ไม่เขียน) · คืน map ใหม่ทั้งร้าน
 * AUTO = ปฏิเสธ (รุ่นแรกไม่มี · มติเจ้าของ 5) · upsert `@@unique([tenantId, module])` + ผู้ตั้งล่าสุด
 * `by.membership` ต้องเป็นของร้าน `tenantId` (ผู้เรียก — route/action — โหลดจาก session ของร้านนั้น)
 */
export async function setAccess(
  tenantId: string,
  by: { userId: string; membership: MembershipCtx },
  module: string,
  level: string,
): Promise<AccessMap> {
  if (by.membership.role !== "OWNER") throw new ForbiddenError({ module: "ai", action: "ai.secretary.access.set" });
  if (!isAiModule(module)) throw new Error(`ไม่รู้จักระบบ "${module}" — ตั้งระดับได้เฉพาะระบบในรายการสิทธิ์ของเลขา`);
  if (level === "AUTO") throw new Error("รุ่นแรกยังไม่เปิดให้เลขาทำเองโดยไม่ขออนุมัติ — เลือกได้ ปิด · ดูอย่างเดียว · ร่างให้อนุมัติ");
  if (!isAccessLevel(level)) throw new Error("ระดับสิทธิ์ต้องเป็น ปิด · ดูอย่างเดียว · ร่างให้อนุมัติ อย่างใดอย่างหนึ่ง");
  // prisma ตรง: guard ของ tenantDb ห่อ where ของ upsert ด้วย AND ซึ่งใช้กับคีย์ unique ผสมไม่ได้ —
  //   tenantId อยู่ในคีย์ unique เองแล้ว (แบบเดียวกับ aiUsage.upsert ใน service.ts)
  await prisma.aiSystemAccess.upsert({
    where: { tenantId_module: { tenantId, module } },
    create: { tenantId, module, level, setById: by.userId },
    update: { level, setById: by.userId },
  });
  return getAccess(tenantId);
}
