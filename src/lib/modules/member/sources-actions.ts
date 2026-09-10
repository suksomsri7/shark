"use server";

// sources-actions.ts — server action ของหน้า "ระบบสมาชิก › ตั้งค่า › ช่องทางที่มา" (M1.8 · ภาพ 13)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    มีคีย์ `member.settings.manage` จริง (ไม่ใช่แค่เป็น MANAGER — §6.1 คีย์นี้เป็น 1 ใน 4 ตัวยกเว้น
//    ดูหมายเหตุยาวที่หัวไฟล์ `access.ts`) → ระบบเป็น MEMBER ของร้านนี้จริง
// 🔴 เรียก `sources.ts` เท่านั้น — ห้ามแตะตาราง AcquisitionLink ผ่าน prisma ตรงจากที่นี่
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุดออกไป)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canManageSettings, canReadMember, toMemberActor, type MemberActor } from "./access";
import {
  createLink,
  qrDataUrlFor,
  toggleLink,
  updateLink,
  type CreateLinkInput,
  type SourceCtx,
  type SourceLinkDto,
  type UpdateLinkInput,
} from "./sources";

export type SourcesActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/settings/sources`;

async function gate(systemId: string): Promise<{ ctx: SourceCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ fields-actions.ts / privacy-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — งานตั้งค่าช่องทางที่มาต้องมี member.settings.manage เจาะจง (§6.1)
  if (!canManageSettings(actor)) {
    throw new ForbiddenError({ module: "member", action: "member.settings.manage" });
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** สร้างลิงก์/QR ที่มาใหม่ — คืน QR (data URL) กลับไปให้หน้าจอโชว์/ดาวน์โหลดได้ทันที */
export async function createLinkAction(
  input: { systemId: string } & CreateLinkInput,
): Promise<SourcesActionResult<{ link: SourceLinkDto; qrDataUrl: string }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const { systemId: _systemId, ...rest } = input;
    const res = await createLink(ctx, actor, rest);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { link: res.link, qrDataUrl: res.qrDataUrl } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างลิงก์ที่มาไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateLinkAction(
  input: { systemId: string; id: string } & UpdateLinkInput,
): Promise<SourcesActionResult<{ link: SourceLinkDto; qrDataUrl: string }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const { systemId: _systemId, id, ...patch } = input;
    const link = await updateLink(ctx, actor, id, patch);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { link, qrDataUrl: await qrDataUrlFor(link.url) } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกลิงก์ที่มาไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function toggleLinkAction(
  input: { systemId: string; id: string; active: boolean },
): Promise<SourcesActionResult<{ link: SourceLinkDto }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const link = await toggleLink(ctx, actor, input.id, input.active);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { link } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปลี่ยนสถานะลิงก์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
