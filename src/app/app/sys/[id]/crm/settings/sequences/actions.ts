"use server";

// actions.ts — server actions ของหน้า "ลำดับการติดตาม" `/app/sys/{id}/crm/settings/sequences` (+ ปุ่มบนผู้ติดต่อ · ใบ C2.2 · ภาพ 07 ล่าง)
// 🔴 "use server" = export ได้เฉพาะ async function · tenantId มาจาก session · systemId ถูก resolve ใหม่ในบริการ (sequences.ts)
// 🔴 ลำดับด่าน: ระบบ CRM ของร้านนี้ (NOT_FOUND) → uiVersion 2 (assertCrmV2 · FORBIDDEN ไทย) → คีย์ `crm.sequence.manage/enroll`
//    ทั้งที่นี่ (ด่านหน้า) และในบริการอีกชั้น — ไม่มีทางลัดที่ข้ามด่านใดด่านหนึ่ง
// 🔴 AUDIT-CLASS X9: ลงทะเบียนเป็นกลุ่ม/เก็บลำดับ = การกระทำอันตราย — ยืนยัน + เหตุผล ตรวจในบริการ (หน้าแค่ส่งค่าที่ผู้ใช้กรอก)
// 🔴 ข้อความผิดพลาดเป็นภาษาไทยที่ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดไปหน้าจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import {
  addHoliday,
  archiveSequence,
  assertSequenceAccess,
  bulkEnroll,
  createSequence,
  enroll,
  importThaiHolidays,
  pause,
  removeHoliday,
  resume,
  SequenceError,
  setBusinessDays,
  stop,
  updateSequence,
} from "@/lib/modules/crm/sequences";
import type { SeqSequenceInput, SeqSequencePatch } from "@/lib/modules/crm/sequences-shared";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string, mode: "manage" | "enroll" | "read") {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertSequenceAccess(ctx, actor, mode); // ระบบ → uiVersion 2 → คีย์ (ข้อความไทยทุกด่าน)
  await assertCrmV2(ctx); // รูปมาตรฐานของ session() ในหน้า v2 (ผ่านแล้วในบรรทัดบน — อ่านซ้ำราคาถูก)
  return { ctx, actor };
}

function failOf(e: unknown): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof SequenceError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.sequences] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touchList = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/sequences`);
const touchOne = (systemId: string, id: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/sequences/${id}`);

/** สร้างลำดับการติดตามใหม่ (ต้องมีอย่างน้อย 1 ขั้น) */
export async function createSequenceAction(systemId: string, input: SeqSequenceInput): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await createSequence(ctx, actor, input);
    touchList(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

/** แก้ลำดับ — ส่ง `steps` มาด้วยขณะมีผู้ลงทะเบียน = ขึ้นเวอร์ชันใหม่ (คนเดิมเดินจนจบบนเวอร์ชันของตัวเอง) */
export async function updateSequenceAction(systemId: string, sequenceId: string, patch: SeqSequencePatch): Promise<{ ok: true; version: number; versionBumped: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await updateSequence(ctx, actor, String(sequenceId ?? ""), patch);
    touchOne(systemId, String(sequenceId ?? ""));
    touchList(systemId);
    return { ok: true, version: r.version, versionBumped: r.versionBumped };
  } catch (e) {
    return failOf(e);
  }
}

/** เก็บลำดับ (อันตราย — ยืนยัน + เหตุผล · ผู้ที่กำลังเดินอยู่ถูกหยุด) */
export async function archiveSequenceAction(systemId: string, sequenceId: string, opts: { confirm?: boolean; reason?: string }): Promise<{ ok: true; stopped: number; remaining: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await archiveSequence(ctx, actor, String(sequenceId ?? ""), { confirm: opts?.confirm === true, reason: String(opts?.reason ?? "") });
    touchList(systemId);
    touchOne(systemId, String(sequenceId ?? ""));
    return { ok: true, stopped: r.stopped, remaining: r.remaining };
  } catch (e) {
    return failOf(e);
  }
}

/** ใส่ผู้ติดต่อ 1 คนเข้าลำดับ (ปุ่มบนหน้าผู้ติดต่อ 360) */
export async function enrollContactAction(
  systemId: string,
  input: { sequenceId: string; contactId: string; dealId?: string | null; replace?: boolean },
): Promise<{ ok: true; status: string; skipped: boolean; note: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "enroll");
    const r = await enroll(ctx, actor, {
      sequenceId: String(input?.sequenceId ?? ""),
      contactId: String(input?.contactId ?? ""),
      dealId: input?.dealId ? String(input.dealId) : null,
      replace: input?.replace === true,
    });
    revalidatePath(`/app/sys/${systemId}/crm/contacts/${String(input?.contactId ?? "")}`);
    touchList(systemId);
    if ("skipped" in r) return { ok: true, status: "SKIPPED", skipped: true, note: r.reason };
    return { ok: true, status: r.status, skipped: false, note: r.status === "REPLACED" ? "เริ่มลำดับใหม่ให้แล้ว (ของเดิมถูกหยุด)" : "ใส่เข้าลำดับการติดตามแล้ว" };
  } catch (e) {
    return failOf(e);
  }
}

/** AUDIT-CLASS X9: ใส่เป็นกลุ่ม = อันตราย (ยืนยัน + เหตุผล ≥ 5 ตัวอักษร · ครั้งละไม่เกิน 500 คน — บริการเป็นผู้ตัดสิน) */
export async function bulkEnrollContactsAction(
  systemId: string,
  input: { sequenceId: string; contactIds: string[]; confirm?: boolean; reason?: string; replace?: boolean },
): Promise<{ ok: true; enrolled: number; skipped: number; conflicts: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "enroll");
    const r = await bulkEnroll(ctx, actor, {
      sequenceId: String(input?.sequenceId ?? ""),
      contactIds: Array.isArray(input?.contactIds) ? input.contactIds.map((x) => String(x)) : [],
      confirm: input?.confirm === true,
      reason: String(input?.reason ?? ""),
      replace: input?.replace === true,
    });
    revalidatePath(`/app/sys/${systemId}/crm/contacts`);
    touchList(systemId);
    return { ok: true, enrolled: r.enrolled, skipped: r.skipped.length, conflicts: r.conflicts };
  } catch (e) {
    return failOf(e);
  }
}

/** หยุดการลงทะเบียนเอง (เหตุ MANUAL) */
export async function stopEnrollmentAction(systemId: string, enrollmentId: string, reason: string, sequenceId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "enroll");
    await stop(ctx, actor, String(enrollmentId ?? ""), { reason: String(reason ?? "") });
    touchOne(systemId, String(sequenceId ?? ""));
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** พักการลงทะเบียนไว้ก่อน (ตัวทำขั้นข้ามแถวที่พัก) */
export async function pauseEnrollmentAction(systemId: string, enrollmentId: string, sequenceId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "enroll");
    await pause(ctx, actor, String(enrollmentId ?? ""));
    touchOne(systemId, String(sequenceId ?? ""));
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ให้เดินต่อ */
export async function resumeEnrollmentAction(systemId: string, enrollmentId: string, sequenceId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "enroll");
    await resume(ctx, actor, String(enrollmentId ?? ""));
    touchOne(systemId, String(sequenceId ?? ""));
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

const touchCalendar = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/holidays`);

/** วันทำการของร้าน (settings.crm.businessDays) */
export async function setBusinessDaysAction(systemId: string, days: number[]): Promise<{ ok: true; businessDays: number[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await setBusinessDays(ctx, actor, Array.isArray(days) ? days.map((d) => Number(d)) : []);
    touchCalendar(systemId);
    return { ok: true, businessDays: r.businessDays };
  } catch (e) {
    return failOf(e);
  }
}

/** เพิ่มวันหยุด 1 วัน */
export async function addHolidayAction(systemId: string, date: string, name: string): Promise<{ ok: true; total: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await addHoliday(ctx, actor, { date: String(date ?? ""), name: String(name ?? "") });
    touchCalendar(systemId);
    return { ok: true, total: r.holidays.length };
  } catch (e) {
    return failOf(e);
  }
}

/** ลบวันหยุด 1 วัน */
export async function removeHolidayAction(systemId: string, date: string): Promise<{ ok: true; total: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await removeHoliday(ctx, actor, String(date ?? ""));
    touchCalendar(systemId);
    return { ok: true, total: r.holidays.length };
  } catch (e) {
    return failOf(e);
  }
}

/** นำเข้าวันหยุดราชการไทยของปีที่เลือก (รายการตายตัวในโค้ด · แก้ไขได้ทีหลัง — R-E.9) */
export async function importThaiHolidaysAction(systemId: string, year: number): Promise<{ ok: true; added: number; total: number; year: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "manage");
    const r = await importThaiHolidays(ctx, actor, Number(year));
    touchCalendar(systemId);
    return { ok: true, added: r.added, total: r.total, year: r.year };
  } catch (e) {
    return failOf(e);
  }
}
