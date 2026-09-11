"use server";

// segments-actions.ts — server action ของหน้า "ระบบสมาชิก › กลุ่มลูกค้า" (M3.1 · ภาพ 21 ขั้น 1)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId, need)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย)
//    → ถ้าเป็นการเขียน (บันทึก/ลบ) ต้องมีคีย์ `member.promo.manage` ด้วย (§6.1)
//    → ระบบนี้เป็น MEMBER ของร้านนี้จริง (404-not-403 ทำที่ตัวหน้าจอ ที่นี่คือชั้น mutation จึงโยน error)
// 🔴 เรียก `./segments` เท่านั้น — ห้ามแตะตาราง MemberSegment ผ่าน prisma ตรงจากที่นี่
//    (ยกเว้นอ่าน AppSystem เพื่อยืนยันขอบเขตร้าน แบบเดียวกับ tiers-actions.ts)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { canReadMember, toMemberActor, type MemberActor } from "./access";
import { prisma } from "./db";
import type { MemberCtx } from "./privacy";
import {
  canManageSegments,
  countSegment,
  deleteSegment,
  saveSegment,
  sampleSegment,
  type CountSegmentResult,
  type SampleSegmentResult,
  type SegmentDto,
  type SegmentScope,
} from "./segments";

export type SegmentActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/segments`;

async function gate(systemId: string, need: "read" | "manage"): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (แบบเดียวกับ fields-actions.ts / tiers-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — บันทึก/ลบกลุ่มลูกค้า ต้องมีคีย์ `member.promo.manage` (หรือคีย์สร้างแคมเปญ — ดู canManageSegments)
  if (need === "manage" && !canManageSegments(actor)) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์บันทึกกลุ่มลูกค้า — ขอสิทธิ์ member.promo.manage จากเจ้าของร้านก่อน");
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** นับสด ๆ ระหว่างผู้ใช้แก้เงื่อนไข (กล่องฟ้าใต้ตัวสร้างเงื่อนไข — หน้าจอหน่วงเวลาเรียกให้เอง) */
export async function countSegmentAction(systemId: string, definition: unknown): Promise<SegmentActionResult<CountSegmentResult>> {
  try {
    const { ctx, actor } = await gate(systemId, "read");
    return { ok: true, data: await countSegment(ctx, actor, definition) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "นับจำนวนคนในกลุ่มไม่สำเร็จ — ลองแก้เงื่อนไขแล้วลองใหม่") };
  }
}

/** รายชื่อคนในกลุ่มทีละหน้า (ปุ่ม "ดูรายชื่อทั้งหมด") */
export async function sampleSegmentAction(
  systemId: string,
  definition: unknown,
  opts: { take?: number; cursor?: string | null } = {},
): Promise<SegmentActionResult<SampleSegmentResult>> {
  try {
    const { ctx, actor } = await gate(systemId, "read");
    return { ok: true, data: await sampleSegment(ctx, actor, definition, opts) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ขอรายชื่อในกลุ่มไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** บันทึกเป็น Segment (ใหม่/แก้ของเดิม) */
export async function saveSegmentAction(input: {
  systemId: string;
  id?: string | null;
  name: string;
  definition: unknown;
  scope?: SegmentScope;
}): Promise<SegmentActionResult<SegmentDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId, "manage");
    const data = await saveSegment(ctx, actor, { id: input.id ?? null, name: input.name, definition: input.definition, scope: input.scope ?? "TEAM" });
    revalidatePath(PATH(input.systemId));
    revalidatePath(`${PATH(input.systemId)}/${data.id}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกกลุ่มลูกค้าไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ลบกลุ่ม — เจ้าของกลุ่มลบของตัวเองได้ (ด่านที่สองอยู่ใน service) */
export async function deleteSegmentAction(systemId: string, id: string): Promise<SegmentActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(systemId, "read");
    const data = await deleteSegment(ctx, actor, id);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบกลุ่มลูกค้าไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
