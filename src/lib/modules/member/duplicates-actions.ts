"use server";

// duplicates-actions.ts — server action ของหน้า "ตัวซ้ำ/รวมคน" (M1.6 · ภาพ 11 · MembersDuplicates.tsx เรียกตรง)
//
// 🔴 ด่านเดียว `gate(systemId)` แบบเดียวกับ members-actions.ts (ล้มเหลว → `assertCan` เหมือนกัน — ดูหมายเหตุที่นั่น)
//    — สิทธิ์เจาะจง `member.customer.merge` + "รวมได้เฉพาะ MANAGER ขึ้นไป" ตรวจซ้ำใน `profile.mergeMembers`/`dismissDuplicate` เอง

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canReadMember, toMemberActor, type MemberActor } from "./access";
import {
  dismissDuplicate,
  findDuplicates,
  getMember360,
  mergeMembers,
  type DuplicatePairDto,
  type Member360,
  type MemberCtx,
  type MergeInput,
  type MergeResult,
} from "./profile";

export type DuplicatesActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/members/duplicates`;

async function gate(systemId: string): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) {
    assertCan(
      { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
      { module: "member", action: "member.customer.read" },
    );
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** สแกนหาตัวซ้ำใหม่ (ปุ่ม "สแกนหาตัวซ้ำใหม่") — เรียกกลไกเดียวกับที่หน้าโหลดครั้งแรก */
export async function findDuplicatesAction(input: { systemId: string }): Promise<DuplicatesActionResult<DuplicatePairDto[]>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const res = await findDuplicates(ctx, actor, { status: "OPEN" });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ค้นหาตัวซ้ำไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** โปรไฟล์เต็มของคู่ที่จะเปรียบเทียบ (ไม่ปิดบังเบอร์ — ผู้เรียกผ่านสิทธิ์ `member.customer.merge` มาแล้ว) */
export async function compareMembersAction(input: { systemId: string; aId: string; bId: string }): Promise<DuplicatesActionResult<{ a: Member360; b: Member360 }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const [a, b] = await Promise.all([getMember360(ctx, actor, input.aId), getMember360(ctx, actor, input.bId)]);
    return { ok: true, data: { a, b } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "โหลดข้อมูลเปรียบเทียบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** รวมคน — ต้องพิมพ์ "MERGE" ยืนยัน (ทำได้ครั้งเดียว ย้อนไม่ได้) · MANAGER = ยื่นสายอนุมัติ · OWNER = รวมทันที */
export async function mergeMembersAction(input: { systemId: string } & MergeInput): Promise<DuplicatesActionResult<MergeResult>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const { systemId, ...rest } = input;
    const res = await mergeMembers(ctx, actor, rest);
    revalidatePath(PATH(systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "รวมสมาชิกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ไม่ใช่คนเดียวกัน — คู่นี้ไม่ขึ้นในรายการอีก */
export async function dismissDuplicateAction(input: { systemId: string; pairId: string }): Promise<DuplicatesActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const res = await dismissDuplicate(ctx, actor, input.pairId);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ดำเนินการไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
