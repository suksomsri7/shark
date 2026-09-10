"use server";

// fields-actions.ts — server action ของหน้า "ระบบสมาชิก › ตั้งค่า › ฟิลด์" (M1.3 · FieldDesigner.tsx เรียกตรง ๆ)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    มีคีย์ `member.settings.manage` จริง (ไม่ใช่แค่ MANAGER เฉย ๆ — ดูหมายเหตุใน `gate()` ด้านล่าง) →
//    ระบบเป็น MEMBER ของร้านนี้จริง — เรียก `fields.ts` เท่านั้น **ห้ามแตะตาราง MemberSection/MemberField ผ่าน prisma ตรง**
//    (แบบเดียวกับ `kanban/actions.ts` ที่ส่ง input เป็น object ธรรมดา ไม่ใช่ FormData — เพราะเรียกตรงจาก
//    client component ที่มีสถานะซับซ้อน เช่น รายการ id ตอนลากเรียง ไม่ใช่ฟอร์ม `<form action>`)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canManageSettings, canReadMember, toMemberActor, type MemberActor } from "./access";
import {
  applyTemplate,
  archiveField,
  createField,
  createSection,
  deleteSection,
  reorderFields,
  reorderSections,
  restoreField,
  updateField,
  updateSection,
  type ApplyTemplateOptions,
  type CreateFieldInput,
  type CreateSectionInput,
  type FieldCtx,
  type FieldDef,
  type SectionDef,
  type UpdateFieldInput,
  type UpdateSectionInput,
} from "./fields";

export type FieldsActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/settings/fields`;

/**
 * ด่านของทุก action ที่นี่
 *
 * ⚠️ ทำไมชั้นที่ 2 ไม่ยิง `assertCan(mc, { module: "member", action: "member.settings.manage" })` ตรง ๆ:
 * `evaluate()` ของ `core/rbac.ts` ให้ MANAGER ผ่าน **ทุก action** ในหน่วยที่คุมเสมอ (ไม่มีข้อยกเว้นรายคีย์)
 * แต่พิมพ์เขียว §6.1 กำหนดว่า `member.settings.manage` เป็นหนึ่งใน 4 คีย์ที่ MANAGER **ไม่ได้โดยปริยาย**
 * (settings/privacy/api/giftcard.manage) ต้องได้รับมอบสิทธิ์เจาะจง ⇒ ใช้ `canManageSettings()` ของ `access.ts`
 * เป็นตัวตัดสินจริงแทน (มติของ builder M1.3 — บันทึกพร้อมหลักฐานใน `ledger/wo-notes/member-M1.3.md`)
 */
async function gate(systemId: string): Promise<{ tenantId: string; userId: string; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  // actor ของหน้าตั้งค่าคือ "พนักงานที่ล็อกอิน" เสมอ (มี Membership) — บทบาท CUSTOMER ของ MemberActor
  // มีไว้ให้ฝั่งลูกค้า `/m/*` เท่านั้น จึงแคบชนิดกลับเป็น Role ของ RBAC ตรงนี้ได้
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ canReadKanban ของบอร์ดงาน)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" }); // โยน ForbiddenError รูปแบบเดียวกับโมดูลอื่น
  }

  // ชั้นที่ 2 — ตั้งค่าฟิลด์ต้องมี member.settings.manage เจาะจง (§6.1)
  if (!canManageSettings(actor)) {
    throw new ForbiddenError({ module: "member", action: "member.settings.manage" });
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  return { tenantId, userId: auth.user.id, actor };
}

function audit(tenantId: string, actorId: string, targetType: string, targetId: string | undefined, after: unknown) {
  return writeAudit({ tenantId, actorId, action: "member.settings.manage", targetType, targetId, after });
}

// ───────────────────────── ส่วน (MemberSection) ─────────────────────────

export async function createSectionAction(input: { systemId: string } & CreateSectionInput): Promise<FieldsActionResult<SectionDef>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const { systemId: _systemId, ...rest } = input;
    const section = await createSection(ctx, rest);
    await audit(tenantId, userId, "MemberSection", section.id, { created: section.key, label: section.label });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: section };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มส่วนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateSectionAction(input: { systemId: string; id: string; patch: UpdateSectionInput }): Promise<FieldsActionResult<SectionDef>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const section = await updateSection(ctx, input.id, input.patch);
    await audit(tenantId, userId, "MemberSection", section.id, { updated: input.patch });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: section };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "แก้ไขส่วนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function reorderSectionsAction(input: { systemId: string; ids: string[] }): Promise<FieldsActionResult<{ ok: true }>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const result = await reorderSections(ctx, input.ids);
    await audit(tenantId, userId, "MemberSection", undefined, { reordered: input.ids });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "จัดลำดับส่วนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function deleteSectionAction(input: { systemId: string; id: string }): Promise<FieldsActionResult<{ ok: true }>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const result = await deleteSection(ctx, input.id);
    await audit(tenantId, userId, "MemberSection", input.id, { deleted: true });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบส่วนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ฟิลด์ (MemberField) ─────────────────────────

export async function createFieldAction(input: { systemId: string } & CreateFieldInput): Promise<FieldsActionResult<FieldDef>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const { systemId: _systemId, ...rest } = input;
    const field = await createField(ctx, rest);
    await audit(tenantId, userId, "MemberField", field.id, { created: field.key, type: field.type });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: field };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มฟิลด์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateFieldAction(input: { systemId: string; id: string; patch: UpdateFieldInput }): Promise<FieldsActionResult<FieldDef>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const field = await updateField(ctx, input.id, input.patch);
    await audit(tenantId, userId, "MemberField", field.id, { updated: input.patch });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: field };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "แก้ไขฟิลด์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function reorderFieldsAction(input: { systemId: string; sectionId: string; ids: string[] }): Promise<FieldsActionResult<{ ok: true }>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const result = await reorderFields(ctx, input.sectionId, input.ids);
    await audit(tenantId, userId, "MemberField", input.sectionId, { reordered: input.ids });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "จัดลำดับฟิลด์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function archiveFieldAction(input: { systemId: string; id: string }): Promise<FieldsActionResult<FieldDef>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const field = await archiveField(ctx, input.id);
    await audit(tenantId, userId, "MemberField", field.id, { archived: true });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: field };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เก็บฟิลด์เข้าคลังไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function restoreFieldAction(input: { systemId: string; id: string }): Promise<FieldsActionResult<FieldDef>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const field = await restoreField(ctx, input.id);
    await audit(tenantId, userId, "MemberField", field.id, { restored: true });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: field };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "กู้ฟิลด์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── เทมเพลตกิจการ ─────────────────────────

export async function applyTemplateAction(
  input: { systemId: string; templateKey: string } & ApplyTemplateOptions,
): Promise<FieldsActionResult<{ added: { sections: number; fields: number } }>> {
  try {
    const { tenantId, userId } = await gate(input.systemId);
    const ctx: FieldCtx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const { systemId: _systemId, templateKey, ...opts } = input;
    const result = await applyTemplate(ctx, templateKey, opts);
    await audit(tenantId, userId, "MemberSection", undefined, { appliedTemplate: templateKey, added: result.added });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ใช้เทมเพลตไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
