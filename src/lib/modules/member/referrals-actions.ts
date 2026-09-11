"use server";

// referrals-actions.ts — server action ของหน้า "ระบบสมาชิก › แนะนำเพื่อน" (M3.5 · ภาพ 24)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย)
//    → ตั้งค่าโปรแกรม/ปฏิเสธการแนะนำ ต้องมีคีย์ `member.referral.manage` (§6.1)
//    → ระบบนี้เป็น MEMBER ของร้านนี้จริง (404-not-403 ทำที่ตัวหน้าจอ ที่นี่คือชั้น mutation จึงโยน error)
// 🔴 เรียก `./referrals` เท่านั้น — ห้ามแตะตาราง Referral/ReferralProgram ผ่าน prisma ตรงจากที่นี่
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดอยู่ที่ `referrals-shared.ts` (export type ที่นี่ = หน้า 500)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "./access";
import { prisma } from "./db";
import type { MemberCtx } from "./privacy";
import { reject, setProgram } from "./referrals";
import type { ReferralActionResult, ReferralProgramDto, SetReferralProgramInput } from "./referrals-shared";

const PATH = (systemId: string) => `/app/sys/${systemId}/member/referrals`;

async function gate(systemId: string): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (แบบเดียวกับ journeys-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — ตั้งค่าโปรแกรม/ปฏิเสธ ต้องมีคีย์ `member.referral.manage` (service ตรวจซ้ำอีกชั้น)
  if (!hasMemberPerm(actor, "member.referral.manage")) {
    assertCan(mc, { module: "member", action: "member.referral.manage" });
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** บันทึกการตั้งค่าโปรแกรม (ส่งเฉพาะช่องที่แก้ก็ได้) */
export async function saveReferralProgramAction(
  systemId: string,
  input: SetReferralProgramInput,
): Promise<ReferralActionResult<ReferralProgramDto>> {
  try {
    const { ctx, actor } = await gate(systemId);
    const data = await setProgram(ctx, actor, input);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการตั้งค่าแนะนำเพื่อนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** สวิตช์เปิด/ปิดโปรแกรม (หัวหน้าจอ) */
export async function toggleReferralProgramAction(systemId: string, enabled: boolean): Promise<ReferralActionResult<ReferralProgramDto>> {
  try {
    const { ctx, actor } = await gate(systemId);
    const data = await setProgram(ctx, actor, { enabled: enabled === true });
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปิด/ปิดโปรแกรมแนะนำเพื่อนไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ปฏิเสธการแนะนำที่ยังไม่จ่ายรางวัล (สงสัยโกง) */
export async function rejectReferralAction(systemId: string, referralId: string, reason: string): Promise<ReferralActionResult> {
  try {
    const { ctx, actor } = await gate(systemId);
    await reject(ctx, actor, referralId, { reason });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ปฏิเสธการแนะนำไม่สำเร็จ — รีเฟรชหน้าแล้วลองใหม่") };
  }
}
