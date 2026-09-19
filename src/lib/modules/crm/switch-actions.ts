"use server";

// switch-actions.ts — สวิตช์ "หน้าจอ CRM เดิม (1) ↔ CRM ใหม่ (2)" ของระบบ CRM หนึ่งระบบ (ใบ C1.11 · มติ C23 · R-E.14)
// 🔴 ไฟล์นี้มี action เดียว (สวิตช์) — จงใจไม่ผ่านประตู uiVersion (ต้องเปิดได้ตอนเป็น 1 เพื่อเปลี่ยนเป็น 2 · กฎถาวรข้อยกเว้นเดียว)
// 🔴 ด่าน: เจ้าของร้าน (OWNER) เท่านั้น → ไป 2 ต้องเป็นร้านที่เปิดให้เห็นสวิตช์ (`isCrmV2SwitchAllowed` — env · ร้านจริงปิดโดยปริยาย) · กลับ 1 ได้เสมอ
//    (MANAGER ที่มี crm.settings.manage ก็ไม่ได้) → ระบบ resolve ใหม่ในร้านของ session ชนิด CRM (AUDIT-CLASS X1) → ค่า 1|2
//    → `setCrmSettingsKey` (jsonb_set คำสั่งเดียว — คีย์อื่นของ settings.crm อยู่ครบ · AUDIT-CLASS X3) → audit crm.settings.uiVersion
// 🔴 สลับไปมาไม่ลบแถวใด ๆ — ข้อมูลที่สร้างตอนเป็น 2 ยังอยู่ครบ (หน้า v1 อ่านตารางชุดเดียวกัน) · กลับเป็น 2 เมื่อไรทุกอย่างทำงานต่อ

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "./db";
import { writeAudit } from "@/lib/core/audit";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { getCrmSettings, setCrmSettingsKey } from "./settings";
import { isCrmV2SwitchAllowed } from "./ui-version";

/** OWNER เท่านั้น — เปลี่ยนรุ่นหน้าจอ CRM ของระบบนี้ (1 = หน้าเดิม · 2 = CRM ใหม่) · กลับไปกลับมาได้ทุกเมื่อ */
export async function setCrmUiVersionAction(
  systemId: string,
  uiVersion: 1 | 2,
): Promise<{ ok: true; uiVersion: 1 | 2 } | { ok: false; error: string; code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "FAILED" }> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    const forbidden = { ok: false as const, error: "การสลับหน้าจอ CRM ทำได้เฉพาะเจ้าของร้าน — ขอให้เจ้าของร้านเป็นคนเปลี่ยน", code: "FORBIDDEN" as const };
    if (auth.active.role !== "OWNER") return forbidden;
    // รีวิว N-2: เปิด CRM ใหม่ (→2) ต้องเป็นร้านที่เปิดให้เห็นสวิตช์ (env) · กลับหน้าจอเดิม (→1) เจ้าของร้านทำได้เสมอ (ร้านไม่มีวันติดค้างที่ v2)
    if (uiVersion === 2 && !isCrmV2SwitchAllowed(tenantId)) return { ok: false, error: "ร้านนี้ยังไม่เปิดให้สลับไปใช้ CRM ใหม่ — ใช้หน้าจอ CRM เดิมได้ตามปกติ", code: "FORBIDDEN" };
    const actor = toMemberActor(auth.user.id, auth.active);
    assertCanCrm(actor, "crm.settings.manage");
    const id = String(systemId ?? "");
    const sys = id ? await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true } }) : null;
    if (!sys) return { ok: false, error: "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่", code: "NOT_FOUND" };
    if (uiVersion !== 1 && uiVersion !== 2) return { ok: false, error: "เลือกได้เฉพาะหน้าจอเดิม หรือ CRM ใหม่", code: "VALIDATION" };
    const ctx = { tenantId, systemId: sys.id };
    const before = (await getCrmSettings(ctx)).uiVersion;
    const after = (await setCrmSettingsKey(ctx, "uiVersion", uiVersion)).uiVersion;
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "crm.settings.uiVersion",
      targetType: "AppSystem",
      targetId: sys.id,
      before: { uiVersion: before },
      after: { uiVersion: after },
    });
    revalidatePath(`/app/sys/${sys.id}`, "layout");
    return { ok: true, uiVersion: after };
  } catch (e) {
    console.error(`[crm.switch] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
    if (e instanceof Error && e.name === "CrmForbiddenError") return { ok: false, error: "การสลับหน้าจอ CRM ทำได้เฉพาะเจ้าของร้าน — ขอให้เจ้าของร้านเป็นคนเปลี่ยน", code: "FORBIDDEN" };
    return { ok: false, error: "สลับหน้าจอไม่สำเร็จ ค่าเดิมยังอยู่ — ลองใหม่อีกครั้ง", code: "FAILED" };
  }
}
