"use server";

// journeys-actions.ts — server action ของหน้า "ระบบสมาชิก › Journey อัตโนมัติ" (M3.3 · ภาพ 07 บน · 22)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId, need)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย)
//    → ถ้าเป็นการเขียน (บันทึก/เปิด-ปิด/ทำสำเนา/ลบ/สร้างจากสำเร็จรูป) ต้องมีคีย์ `member.promo.manage` (§6.1)
//    → ระบบนี้เป็น MEMBER ของร้านนี้จริง (404-not-403 ทำที่ตัวหน้าจอ ที่นี่คือชั้น mutation จึงโยน error)
// 🔴 เรียก `./journeys` เท่านั้น — ห้ามแตะตาราง AutomationRule/Run ผ่าน prisma ตรงจากที่นี่
//    (ยกเว้นอ่าน AppSystem เพื่อยืนยันขอบเขตร้าน แบบเดียวกับ segments-actions.ts)
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดผลลัพธ์อยู่ที่ `journeys-shared.ts`
//    (export type/const จากไฟล์นี้ = หน้า 500 ReferenceError ทั้งที่ tsc/build ผ่าน — บทเรียน M2.2)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { canReadMember, toMemberActor, type MemberActor } from "./access";
import { prisma } from "./db";
import type { MemberCtx } from "./profile";
import {
  canManageJourneys,
  createFromPreset,
  createJourney,
  deleteJourney,
  dryRun,
  dryRunDraft,
  duplicateJourney,
  toggleJourney,
  updateJourney,
} from "./journeys";
import type { JourneyActionResult, JourneyDryRun, SaveJourneyInput } from "./journeys-shared";

const PATH = (systemId: string) => `/app/sys/${systemId}/member/journeys`;

async function gate(systemId: string, need: "read" | "manage"): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (แบบเดียวกับ fields-actions.ts / segments-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — สร้าง/แก้/เปิด-ปิด journey ต้องมีคีย์ `member.promo.manage`
  if (need === "manage" && !canManageJourneys(actor)) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการ journey — ขอสิทธิ์ member.promo.manage จากเจ้าของร้านก่อน");
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** บันทึก journey (id ว่าง = เส้นใหม่) */
export async function saveJourneyAction(systemId: string, id: string | null, input: SaveJourneyInput): Promise<JourneyActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await gate(systemId, "manage");
    const data = id ? await updateJourney(ctx, actor, id, input) : await createJourney(ctx, actor, input);
    revalidatePath(PATH(systemId));
    revalidatePath(`${PATH(systemId)}/${data.id}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึก journey ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** สร้างจาก journey สำเร็จรูป 6 แบบ (แบบ voucher = ที่เลือก หรือแบบแรกของร้าน) */
export async function createJourneyFromPresetAction(
  systemId: string,
  key: string,
  templateId: string | null,
): Promise<JourneyActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await gate(systemId, "manage");
    const data = await createFromPreset(ctx, actor, key, { templateId });
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้าง journey จากสำเร็จรูปไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** เปิด/หยุดชั่วคราว — หยุดแล้วขั้นที่รออยู่ถูกยกเลิกทันที */
export async function toggleJourneyAction(systemId: string, id: string, enabled: boolean): Promise<JourneyActionResult<{ enabled: boolean; cancelled: number }>> {
  try {
    const { ctx, actor } = await gate(systemId, "manage");
    const data = await toggleJourney(ctx, actor, id, enabled);
    revalidatePath(PATH(systemId));
    revalidatePath(`${PATH(systemId)}/${id}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปลี่ยนสถานะ journey ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function duplicateJourneyAction(systemId: string, id: string): Promise<JourneyActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await gate(systemId, "manage");
    const data = await duplicateJourney(ctx, actor, id);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ทำสำเนา journey ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function deleteJourneyAction(systemId: string, id: string): Promise<JourneyActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(systemId, "manage");
    const data = await deleteJourney(ctx, actor, id);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบ journey ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/**
 * ทดลองรัน (อ่านอย่างเดียว · ไม่เขียนอะไรเลย) — ส่ง `input` = journey ในตัวสร้างที่ยังไม่ได้บันทึก
 * (ตรวจ input ชุดเดียวกับตอนบันทึก) · ไม่ส่ง = ทดลองตัวที่บันทึกไว้แล้วตาม `id`
 */
export async function dryRunJourneyAction(
  systemId: string,
  id: string | null,
  input: SaveJourneyInput | null,
  days = 30,
): Promise<JourneyActionResult<JourneyDryRun & { skippedByReentry: number; days: number }>> {
  try {
    const { ctx, actor } = await gate(systemId, "read");
    if (input) return { ok: true, data: await dryRunDraft(ctx, actor, input, { days }) };
    if (!id) throw new Error("ยังไม่มี journey ให้ทดลองรัน — ตั้งทริกเกอร์และการกระทำก่อน");
    return { ok: true, data: await dryRun(ctx, actor, id, { days }) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ทดลองรัน journey ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
