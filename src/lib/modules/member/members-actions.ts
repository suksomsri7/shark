"use server";

// members-actions.ts — server action ของหน้า "สมัครสมาชิกใหม่" (M1.6 · ภาพ 10 · MemberRegisterForm.tsx เรียกตรง)
//
// 🔴 ด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย · ล้มเหลว → `assertCan`
//    แบบเดียวกับ `fields-actions.ts`/`privacy-actions.ts` — F6 fitness ตามรอย `assertCan` จริงเท่านั้น
//    ไม่นับ `if (!canReadMember(...)) throw new Error(...)` เฉย ๆ ว่าเป็นด่านสิทธิ์) → ระบบเป็น MEMBER ของร้านนี้จริง
//    สิทธิ์เจาะจง (`member.customer.create` / `member.customer.import`) ตรวจซ้ำอีกชั้นใน `profile.createMember`/
//    `import.checkDuplicate` เอง (แบบเดียวกับใบอื่นของโมดูลนี้ — ห้ามพึ่งแค่ชั้นเดียว)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canReadMember, toMemberActor, type MemberActor } from "./access";
import { createMember, briefFor, type CreateMemberInput, type CreateMemberResult, type MemberBrief, type MemberCtx } from "./profile";
import { checkDuplicate, joinLinkFor, type JoinLink } from "./import";

export type MembersActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/members`;

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

/** สมัครสมาชิกใหม่จากโมดัล/หน้าสมัคร — `MemberRegisterForm.tsx` เรียกตรง (ไม่ใช่ `<form action>`) */
export async function createMemberAction(input: { systemId: string } & CreateMemberInput): Promise<MembersActionResult<CreateMemberResult>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const { systemId, ...rest } = input;
    const res = await createMember(ctx, actor, rest);
    revalidatePath(PATH(systemId));
    if (res.created) revalidatePath(`${PATH(systemId)}/${res.customerId}`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สมัครสมาชิกไม่สำเร็จ — ตรวจข้อมูลแล้วลองใหม่อีกครั้ง") };
  }
}

/** ตรวจซ้ำสดตอนพิมพ์เบอร์/อีเมลในฟอร์มสมัคร — เบอร์เต็มไม่มีวันหลุดออกจาก action นี้ (คืนแค่ MemberBrief ปิดบัง) */
export async function checkDuplicateAction(input: { systemId: string; phone?: string; email?: string }): Promise<MembersActionResult<MemberBrief | null>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const res = await checkDuplicate(ctx, actor, { phone: input.phone, email: input.email });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตรวจสอบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ลิงก์/QR สมัครเอง (ปุ่ม "QR LIFF" / "ส่งลิงก์ LINE" มุมบนของโมดัลสมัคร) */
export async function joinLinkForAction(input: { systemId: string; src?: string }): Promise<MembersActionResult<JoinLink>> {
  try {
    const { ctx } = await gate(input.systemId);
    const res = await joinLinkFor(ctx, { src: input.src });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างลิงก์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** การ์ดย่อของสมาชิกหลายคน (ใช้แสดง "ผู้แนะนำ" ที่ค้นเจอ — stub M3.5) */
export async function briefForAction(input: { systemId: string; customerIds: string[] }): Promise<MembersActionResult<MemberBrief[]>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    const res = await briefFor(ctx, actor, input.customerIds);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ค้นหาไม่สำเร็จ") };
  }
}
