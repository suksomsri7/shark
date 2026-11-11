// access.ts — สิทธิ์ต่อระบบ 3 ระดับของเลขา (S1.3 · ตาราง AiSystemAccess แกน tenant · 1 แถว/โมดูล)
//
// ทางเข้าเดียวของเรื่องนี้: ส่วนฐานข้อมูล (`getAccess` · `setAccess`) อยู่ที่นี่ · กติกา pure อยู่ที่ ./access-rules.ts ·
// การแปลงชื่อเครื่องมือ → โมดูล/เขียน อยู่ที่ ../tool-access.ts (ตารางสิทธิ์ชุดเดียวกับด่าน membership)
// ไม่มีแถว = ค่าเริ่มต้น (ทุกโมดูล DRAFT · แชท READ) ⇒ ร้านที่ไม่เคยตั้ง = พฤติกรรมเดิมทุกประการ
// 🔴 ค่าในตารางนี้เปลี่ยนได้ทางเดียว = `setAccess` โดย OWNER — ผลของโมเดล/ความจำ/ข้อความลูกค้าไม่มีทางมาถึงที่นี่ (COMMON §C.3)

import { prisma, tenantDb } from "@/lib/core/db";
import { ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { accessFromRows, isAccessLevel, isAiModule, type AccessLevel, type AccessMap } from "./access-rules";

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
  moduleOff,
  skippedSectionNote,
  TOOL_EXTRA_MODULES,
  type AccessLevel,
  type AccessMap,
  type AiModule,
} from "./access-rules";
export { accessVerdict, HAND_TOOL_CORE, kindAllowedByAccess, toolIsWrite, toolModuleOf, type ToolVerdict } from "../tool-access";

/** ระดับของทุกโมดูลของร้าน (1 query · เติมค่าเริ่มต้นครบทุก AI_MODULES) */
export async function getAccess(tenantId: string): Promise<AccessMap> {
  const rows = await tenantDb({ tenantId }).aiSystemAccess.findMany({ select: { module: true, level: true } });
  return accessFromRows(rows);
}

/** ตรวจโมดูล + ระดับก่อนเขียน (ผิด = throw ไทย · ไม่เขียน) — ใช้ร่วม setAccess / setAccessAsPlatform */
function assertModuleLevel(module: string, level: string): asserts level is AccessLevel {
  if (!isAiModule(module)) throw new Error(`ไม่รู้จักระบบ "${module}" — ตั้งระดับได้เฉพาะระบบในรายการสิทธิ์ของเลขา`);
  if (level === "AUTO") throw new Error("รุ่นแรกยังไม่เปิดให้เลขาทำเองโดยไม่ขออนุมัติ — เลือกได้ ปิด · ดูอย่างเดียว · ร่างให้อนุมัติ");
  if (!isAccessLevel(level)) throw new Error("ระดับสิทธิ์ต้องเป็น ปิด · ดูอย่างเดียว · ร่างให้อนุมัติ อย่างใดอย่างหนึ่ง");
}

// prisma ตรง: guard ของ tenantDb ห่อ where ของ upsert ด้วย AND ซึ่งใช้กับคีย์ unique ผสมไม่ได้ —
//   tenantId อยู่ในคีย์ unique เองแล้ว (แบบเดียวกับ aiUsage.upsert ใน service.ts)
async function writeLevel(tenantId: string, module: string, level: AccessLevel, setById: string): Promise<AccessMap> {
  await prisma.aiSystemAccess.upsert({
    where: { tenantId_module: { tenantId, module } },
    create: { tenantId, module, level, setById },
    update: { level, setById },
  });
  return getAccess(tenantId);
}

/**
 * ตั้งระดับของโมดูลหนึ่ง — OWNER เท่านั้น (อื่น = ForbiddenError) · ตรวจครบก่อนเขียน (ผิด = ไม่เขียน) · คืน map ใหม่ทั้งร้าน
 * AUTO = ปฏิเสธ (รุ่นแรกไม่มี · มติเจ้าของ 5) · upsert `@@unique([tenantId, module])` + ผู้ตั้งล่าสุด
 * S1.3b ▸ (รีวิว C5) **โหลด** `Membership(userId, tenantId)` ที่ยอมรับคำเชิญแล้วจากฐานเสมอ — `by.membership` เป็นแค่ hint ไม่เชื่อ
 *   (ผู้เรียกส่ง membership ของร้านอื่น/ที่แต่งขึ้นมาก็ไม่มีผล) · ไม่มีแถว / ยังไม่ยอมรับ / ไม่ใช่ OWNER = ForbiddenError ◂
 */
export async function setAccess(
  tenantId: string,
  by: { userId: string; membership?: MembershipCtx },
  module: string,
  level: string,
): Promise<AccessMap> {
  const row = by.userId
    ? await prisma.membership.findUnique({
        where: { userId_tenantId: { userId: by.userId, tenantId } },
        select: { role: true, acceptedAt: true },
      })
    : null;
  if (!row || row.acceptedAt === null || row.role !== "OWNER") {
    throw new ForbiddenError({ module: "ai", action: "ai.secretary.access.set" });
  }
  assertModuleLevel(module, level);
  return writeLevel(tenantId, module, level, by.userId);
}

/**
 * S1.3b ▸ ทางของทีมงานแพลตฟอร์ม (H4 · R-K12) — ผู้เรียกต้องตรวจสิทธิ์แพลตฟอร์มก่อนแล้ว (ฟังก์ชันนี้ไม่ตรวจ)
 *   บันทึก setById = `platform:<id>` ให้แยกจากเจ้าของร้านได้ · กติกาโมดูล/ระดับเดียวกับ setAccess (AUTO = ปฏิเสธ) ◂
 */
export async function setAccessAsPlatform(tenantId: string, module: string, level: string, platformUserId: string): Promise<AccessMap> {
  if (!platformUserId) throw new Error("ต้องระบุทีมงานแพลตฟอร์มผู้ตั้งค่า");
  assertModuleLevel(module, level);
  return writeLevel(tenantId, module, level, `platform:${platformUserId}`);
}
