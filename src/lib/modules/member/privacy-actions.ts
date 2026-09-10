"use server";

// privacy-actions.ts — server action ของหน้า "ระบบสมาชิก › ตั้งค่า › ความเป็นส่วนตัว" (M1.7 · ภาพ 14)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    มีคีย์ `member.privacy.manage` จริง (ไม่ใช่แค่เป็น MANAGER — §6.1 คีย์นี้เป็น 1 ใน 4 ตัวยกเว้น
//    ดูหมายเหตุยาวที่หัวไฟล์ `access.ts`) → ระบบเป็น MEMBER ของร้านนี้จริง
// 🔴 เรียก `privacy.ts` เท่านั้น — ห้ามแตะตาราง MemberPrivacyPolicy/MemberSensitivePolicy/MemberConsent
//    ผ่าน prisma ตรงจากที่นี่ (ยกเว้นการ "ค้นหาสมาชิกจากรหัส/เบอร์" ซึ่งเป็นการอ่านล้วนของหน้าจอ)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุดออกไป)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canManagePrivacy, canReadMember, toMemberActor, type MemberActor } from "./access";
import {
  createPolicyVersion,
  deleteSensitivePolicy,
  publishPolicyVersion,
  requestErase,
  requestExport,
  setAutoEraseYears,
  setSensitivePolicy,
  type MemberCtx,
  type PolicyVersionDto,
  type SensitivePolicyDto,
  type SetSensitivePolicyInput,
} from "./privacy";

export type PrivacyActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/settings/privacy`;

async function gate(systemId: string): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ fields-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — งานความเป็นส่วนตัว/PDPA ต้องมี member.privacy.manage เจาะจง (§6.1)
  if (!canManagePrivacy(actor)) {
    throw new ForbiddenError({ module: "member", action: "member.privacy.manage" });
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

// ───────────────────────── นโยบายความเป็นส่วนตัว ─────────────────────────

export async function createPolicyVersionAction(input: {
  systemId: string;
  bodyHtml: string;
  effectiveAt?: string | null;
  /** true = ออกเวอร์ชันใหม่แล้วบังคับใช้เลย (ไม่เก็บเป็นร่าง) */
  publishNow?: boolean;
}): Promise<PrivacyActionResult<PolicyVersionDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const created = await createPolicyVersion(ctx, actor, {
      bodyHtml: input.bodyHtml,
      effectiveAt: input.publishNow ? new Date() : input.effectiveAt ?? null,
    });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: created };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกนโยบายไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function publishPolicyVersionAction(input: {
  systemId: string;
  version: number;
  effectiveAt?: string | null;
}): Promise<PrivacyActionResult<PolicyVersionDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const row = await publishPolicyVersion(ctx, actor, input.version, { effectiveAt: input.effectiveAt ?? null });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เผยแพร่นโยบายไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ใครดูข้อมูลอ่อนไหวได้ ─────────────────────────

export async function setSensitivePolicyAction(
  input: { systemId: string } & SetSensitivePolicyInput,
): Promise<PrivacyActionResult<SensitivePolicyDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const { systemId: _systemId, ...rest } = input;
    const row = await setSensitivePolicy(ctx, actor, rest);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกสิทธิ์การดูข้อมูลอ่อนไหวไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function deleteSensitivePolicyAction(input: { systemId: string; id: string }): Promise<PrivacyActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const row = await deleteSensitivePolicy(ctx, actor, input.id);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: row };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "คืนค่าปริยายไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── คำขอตาม PDPA ─────────────────────────

/** ค้นสมาชิกจากรหัสสมาชิก/เบอร์/อีเมล (ช่องกรอกบนการ์ด "คำขอตาม PDPA") */
async function resolveMember(ctx: MemberCtx, keyword: string): Promise<string> {
  const q = keyword.trim();
  if (!q) throw new Error("กรอกรหัสสมาชิก เบอร์โทร หรืออีเมลของสมาชิกก่อน");
  const row = await prisma.customer.findFirst({
    where: {
      tenantId: ctx.tenantId,
      memberSystemId: ctx.systemId,
      OR: [{ memberCode: q }, { phone: q }, { email: q.toLowerCase() }],
    },
    select: { id: true },
  });
  if (!row) throw new Error(`ไม่พบสมาชิกที่ตรงกับ "${q}" — ตรวจรหัสสมาชิก/เบอร์อีกครั้ง`);
  return row.id;
}

export async function requestExportAction(input: { systemId: string; keyword: string }): Promise<PrivacyActionResult<{ requestId: string }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const customerId = await resolveMember(ctx, input.keyword);
    const res = await requestExport(ctx, actor, customerId, "STAFF");
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { requestId: res.requestId } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งออกข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function requestEraseAction(
  input: { systemId: string; keyword: string },
): Promise<PrivacyActionResult<{ requestId: string; status: string }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const customerId = await resolveMember(ctx, input.keyword);
    // สิทธิ์ "ลบข้อมูลถาวร" เป็นคนละคีย์กับ privacy.manage — privacy.requestErase ตรวจให้เอง
    const res = await requestErase(ctx, actor, customerId, "STAFF");
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { requestId: res.requestId, status: res.status } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งคำขอลบข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ลบอัตโนมัติเมื่อไม่เคลื่อนไหว ─────────────────────────

export async function setAutoEraseYearsAction(input: { systemId: string; years: number }): Promise<PrivacyActionResult<{ years: number }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const res = await setAutoEraseYears(ctx, actor, input.years);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการลบอัตโนมัติไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
