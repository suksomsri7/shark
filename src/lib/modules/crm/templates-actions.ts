"use server";

// templates-actions.ts — server action ของตัวเลือก "เทมเพลตกิจการ" บนหน้าแรก CRM v2 (ใบ C1.11 · พิมพ์เขียว §10)
// 🔴 "use server" = export ได้เฉพาะ async function · ชนิดข้อมูลอยู่ที่ `templates.ts`
// 🔴 ลำดับด่าน: session (requireTenant) → คีย์ `crm.settings.manage` (crm/access · AUDIT-CLASS X2) → ctx จากร้านใน session
//    (systemId จากหน้าเป็นแค่ตัวเลือก — บริการ resolve ใหม่ · AUDIT-CLASS X1) → ประตู uiVersion (assertCrmV2) → บริการ
// 🔴 ข้อมูลเทมเพลต 16 ชุด + ตัว apply โหลดแบบ lazy ตอนกดเท่านั้น (รีวิว N-9 — หน้าที่ import ไฟล์นี้ไม่ลากข้อมูลเทมเพลตทั้งก้อน)
// 🔴 ข้อความไทยที่ไม่โทษผู้ใช้ · ไม่ส่งรายละเอียดทางเทคนิคออกไป

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";

type Fail = { ok: false; error: string; code?: string };
const templatesSvc = () => import("./templates");

async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, "crm.settings.manage");
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor };
}

async function failOf(e: unknown): Promise<Fail> {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  const { BusinessTemplateError } = await templatesSvc();
  if (e instanceof BusinessTemplateError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ตั้งค่าระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  const msg = e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : null;
  console.error(`[crm.templates] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: msg ?? "ตั้งค่าเทมเพลตยังไม่ครบ — ส่วนที่บันทึกแล้วยังอยู่ กดเลือกเทมเพลตเดิมอีกครั้งเพื่อเติมส่วนที่เหลือ" };
}

/** ใส่เทมเพลตกิจการให้ระบบ CRM นี้ (ใส่ซ้ำได้ — ไม่มีแถวซ้ำ) · วัตถุกำหนดเองต้องมีคีย์ crm.object.manage (ไม่มี = ข้าม + notice) */
export async function applyBusinessTemplateAction(
  systemId: string,
  key: string,
): Promise<
  | { ok: true; key: string; created: { pipelines: number; lostReasons: number; sections: number; fields: number; objects: number }; keptObjects: string[]; skippedObjects: string[]; notice: string | null }
  | Fail
> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await (await templatesSvc()).applyBusinessTemplate(ctx, String(key ?? ""), { actor });
    revalidatePath(`/app/sys/${ctx.systemId}`);
    return { ok: true, key: r.key, created: r.created, keptObjects: r.keptObjects, skippedObjects: r.skippedObjects, notice: r.notice };
  } catch (e) {
    return failOf(e);
  }
}

/** "ไม่ใช้เทมเพลต" — ซ่อนตัวเลือกบนหน้าแรก (settings.crm.businessTemplate = "none") · ไม่เขียนอะไรอื่น */
export async function skipBusinessTemplateAction(systemId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx } = await session(systemId);
    await (await templatesSvc()).skipBusinessTemplate(ctx);
    revalidatePath(`/app/sys/${ctx.systemId}`);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
