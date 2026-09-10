"use server";

// points-actions.ts — server action ของหมวด "แต้ม" ในระบบสมาชิก v2 (M2.2)
//   ตั้งค่าแต้ม (ก–จ · ภาพ 16) · กฎเพิ่ม (CRUD) · ปรับแต้มมือ (หน้า /member/points/adjust)
//
// 🔴 ด่านสิทธิ์ 2 ชั้นแบบเดียวกับ `member/fields-actions.ts` / `giftcard/giftcard-actions.ts`:
//    ชั้น 1 = เข้าโมดูลสมาชิกได้ (read-โดยนัย) · ชั้น 2 = คีย์เจาะจงของงานนั้น
//    (`member.settings.manage` สำหรับตั้งค่า/กฎ — เป็น 1 ใน 4 คีย์ที่ MANAGER **ไม่ได้โดยปริยาย** §6.1)
//    ส่วน "ปรับแต้มมือ" ไม่บังคับคีย์เจาะจง (ดูเหตุผลในหัว `point/adjust.ts`) — เพดาน+สายอนุมัติคือรั้วจริง
// 🔴 เรียก `service.ts`/`rules.ts`/`adjust.ts` เท่านั้น — ห้ามแตะตาราง Point* ผ่าน prisma ตรงจากที่นี่

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "@/lib/core/db";
import { canReadMember, canManageSettings, toMemberActor, type MemberActor } from "@/lib/modules/member/access";
import { adjustWithApproval, type AdjustWithApprovalResult } from "./adjust";
import {
  resolvePointSystemIds,
  setPointExtras,
  setPointSettings,
  type PointExtras,
  type SetPointSettingsInput,
} from "./service";
import { deleteRule, toggleRule, upsertRule, type PointRuleDto, type UpsertRuleInput } from "./rules";
import type { PointCtx } from "./internal";

// 🔴 ห้าม `export type` / re-export type ใด ๆ จากไฟล์ "use server" — Next.js (`ensureServerEntryExports`)
//    ถือทุกชื่อที่ไฟล์ use server export ว่าเป็น server action แม้จะเป็น type ล้วน ๆ ก็ตาม → runtime พัง
//    ทันทีด้วย `ReferenceError: <TypeName> is not defined` (เจอจริงตอน Fable build QC server รอบตีกลับ)
//    ⇒ ชนิดทุกตัวในไฟล์นี้ **ไม่ export** — ผู้เรียกภายนอก (component) import type จาก facade
//    `@/lib/modules/point` แทน (ดู `PointExtras`/`AdjustWithApprovalResult` ที่ไม่ export จากที่นี่)
type PointsActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/points/settings`;

type Gate = { tenantId: string; userId: string; actor: MemberActor; pointCtx: PointCtx };

/** ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม + resolve ระบบแต้มที่ผูกกับระบบสมาชิก `systemId` (URL) */
async function gate(systemId: string): Promise<Gate> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  const pointSystemIds = await resolvePointSystemIds(tenantId, systemId);
  const pointSystemId = pointSystemIds[0];
  if (!pointSystemId) throw new Error("ยังไม่ได้เชื่อมระบบแต้มกับสาขาของระบบสมาชิกนี้ — ตั้งค่าที่ทะเบียนระบบก่อน");

  return { tenantId, userId: auth.user.id, actor, pointCtx: { tenantId, systemId: pointSystemId, memberSystemId: systemId, actorUserId: auth.user.id } };
}

/** ชั้นที่ 2 — ตั้งค่า/กฎแต้มต้องมี `member.settings.manage` เจาะจง (§6.1) */
function requireSettingsManage(actor: MemberActor): void {
  if (!canManageSettings(actor)) {
    throw new ForbiddenError({ module: "member", action: "member.settings.manage" });
  }
}

// ───────────────────────── (ก–จ) ตั้งค่าแต้ม ─────────────────────────

export async function saveSettingsAction(
  input: { systemId: string } & SetPointSettingsInput,
): Promise<PointsActionResult<{ ok: true }>> {
  try {
    const { tenantId, actor, pointCtx } = await gate(input.systemId);
    requireSettingsManage(actor);
    const { systemId: _s, ...patch } = input;
    await setPointSettings({ tenantId }, patch);
    revalidatePath(PATH(pointCtx.memberSystemId ?? input.systemId));
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการตั้งค่าแต้มไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function saveExtrasAction(
  input: { systemId: string } & Partial<PointExtras>,
): Promise<PointsActionResult<PointExtras>> {
  try {
    const { tenantId, actor } = await gate(input.systemId);
    requireSettingsManage(actor);
    const { systemId, ...patch } = input;
    const data = await setPointExtras({ tenantId, systemId }, patch);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการตั้งค่าไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── กฎเพิ่ม (ตัวคูณระดับ/สินค้า-หมวด/ช่วงเวลา/เหตุการณ์/เพดานวัน) ─────────────────────────

export async function upsertPointRuleAction(
  input: { systemId: string } & UpsertRuleInput,
): Promise<PointsActionResult<PointRuleDto>> {
  try {
    const { actor, pointCtx } = await gate(input.systemId);
    const { systemId: _s, ...rest } = input;
    const rule = await upsertRule(pointCtx, actor, rest);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: rule };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกกฎแต้มไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function togglePointRuleAction(
  input: { systemId: string; id: string; active: boolean },
): Promise<PointsActionResult<PointRuleDto>> {
  try {
    const { actor, pointCtx } = await gate(input.systemId);
    const rule = await toggleRule(pointCtx, actor, input.id, input.active);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: rule };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปิด/ปิดกฎไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function deletePointRuleAction(
  input: { systemId: string; id: string },
): Promise<PointsActionResult<{ deleted: boolean }>> {
  try {
    const { actor, pointCtx } = await gate(input.systemId);
    const r = await deleteRule(pointCtx, actor, input.id);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบกฎไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ปรับแต้มมือ ─────────────────────────
// entityType ของสายอนุมัติเมื่อเกินเพดาน = "member.point.adjust" (ดู `point/adjust.ts` + `approval/labels.ts`)

export async function adjustPointsAction(
  input: { systemId: string; customerId: string; delta: number; reason: string; expiresAt?: string | null },
): Promise<PointsActionResult<AdjustWithApprovalResult>> {
  try {
    const { actor, pointCtx } = await gate(input.systemId);
    const result = await adjustWithApproval(pointCtx, actor, {
      customerId: input.customerId,
      delta: input.delta,
      reason: input.reason,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });
    revalidatePath(`/app/sys/${input.systemId}/member/points/adjust`);
    revalidatePath(`/app/sys/${input.systemId}/member/points`);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ปรับแต้มไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
