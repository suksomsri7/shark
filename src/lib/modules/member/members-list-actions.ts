"use server";

// members-list-actions.ts — server action ของหน้ารวมสมาชิก (M1.5 · MembersTable/MembersSavedViewsMenu เรียกตรง ๆ)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย · access.ts) →
//    ระบบเป็น MEMBER ของร้านนี้จริง — สิทธิ์เจาะจงของแต่ละ action (แก้แท็ก/ส่งออก/บันทึกมุมมองทีม) ตัดสินที่
//    `list.ts`/`views.ts` เอง (โยน MemberForbiddenError ข้อความไทยกลับมาให้ `safeReason` ห่อ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canReadMember, toMemberActor, type MemberActor } from "./access";
import { bulkSetTags, exportMembers, type ExportMembersResult, type ListMembersOptions } from "./list";
import { createSavedView, deleteSavedView, type SavedViewDto } from "./views";

export type ListActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/members`;

async function gate(systemId: string): Promise<{ tenantId: string; userId: string; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย · แบบเดียวกับ fields-actions.ts ของ M1.3)
  // สิทธิ์เจาะจงของแต่ละ action (แก้แท็ก/ส่งออก/บันทึกมุมมองทีม) ตัดสินอีกชั้นที่ list.ts/views.ts เอง
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" }); // โยน ForbiddenError รูปแบบเดียวกับโมดูลอื่น
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { tenantId, userId: auth.user.id, actor };
}

export async function bulkSetTagsAction(input: {
  systemId: string;
  ids: string[];
  add: string[];
  remove: string[];
}): Promise<ListActionResult<{ updated: number; skipped: number }>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const ctx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const result = await bulkSetTags(ctx, actor, input.ids, { add: input.add, remove: input.remove });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตั้งแท็กไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function exportMembersAction(input: {
  systemId: string;
  filters: ListMembersOptions;
  columns: string[];
}): Promise<ListActionResult<ExportMembersResult>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const ctx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const result = await exportMembers(ctx, actor, { filters: input.filters, columns: input.columns });
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งออกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function saveViewAction(input: {
  systemId: string;
  name: string;
  scope: "PRIVATE" | "TEAM";
  filters: Record<string, unknown>;
  columns: string[];
  sort?: string;
}): Promise<ListActionResult<SavedViewDto>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const ctx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const view = await createSavedView(ctx, actor, {
      name: input.name,
      scope: input.scope,
      filters: input.filters,
      columns: input.columns,
      sort: (input.sort as SavedViewDto["sort"]) ?? undefined,
    });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: view };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกมุมมองไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function deleteViewAction(input: { systemId: string; viewId: string }): Promise<ListActionResult<{ ok: true }>> {
  try {
    const { tenantId, userId, actor } = await gate(input.systemId);
    const ctx = { tenantId, systemId: input.systemId, actorUserId: userId };
    const result = await deleteSavedView(ctx, actor, input.viewId);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบมุมมองไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
