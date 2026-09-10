"use server";

// voucher-actions.ts — server action ของหน้า "โปรโมชัน › Voucher" (M2.5 · ภาพ 19)
//
// 🔴 ไฟล์ `"use server"` **ห้าม export type/ค่าคงที่** — Next นับทุก export ว่าเป็น server action
//    (บทเรียน M2.2: หน้าพังด้วย ReferenceError ตอน runtime ทั้งที่ tsc เขียว)
// 🔴 ทุก action ผ่านด่านเดียว `gate()`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    ระบบเป็น MEMBER ของร้านนี้จริง → แล้วแต่ละ action ตรวจคีย์ของตัวเองอีกชั้น
//    (`member.promo.issue` = ออกใบ/คืนใบ · `member.promo.manage` = เทมเพลต/ยกเลิกใบ — §6.1)
// 🔴 เรียก `service.ts` เท่านั้น — ห้ามแตะตาราง Voucher ผ่าน prisma ตรงจากที่นี่
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุด)

import { revalidatePath } from "next/cache";
import type { VoucherKind, VoucherOrigin } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { cancel, createTemplate, issue, toggleTemplate, updateTemplate, type VoucherConfig, type VoucherCtx } from "./service";

const PATH = (systemId: string) => `/app/sys/${systemId}/member/promotions/vouchers`;

async function gate(systemId: string): Promise<{ ctx: VoucherCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ fields-actions.ts / giftcard-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  const system = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "MEMBER" },
    select: { id: true },
  });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** ชั้นที่ 2 — คีย์เจาะจงของงานนั้น (แยกจาก gate เพื่อให้อ่านออกว่า action ไหนต้องใช้คีย์อะไร) */
function requireKey(actor: MemberActor, key: "member.promo.issue" | "member.promo.manage"): void {
  if (!hasMemberPerm(actor, key)) throw new ForbiddenError({ module: "member", action: key });
}

// ───────────────────────── ออก voucher ─────────────────────────

export async function issueVoucherAction(input: {
  systemId: string;
  customerIds: string[];
  templateId?: string | null;
  adhoc?: { kind: VoucherKind; value: number; config: VoucherConfig; validDays: number } | null;
  origin: VoucherOrigin;
  reason?: string | null;
  notify?: boolean;
}): Promise<
  | { ok: true; data: { pending: boolean; issued: number; skipped: number; approvalRequestId: string | null } }
  | { ok: false; reason: string }
> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.promo.issue");
    const res = await issue(ctx, actor, {
      customerIds: input.customerIds ?? [],
      templateId: input.templateId ?? null,
      adhoc: input.adhoc ?? null,
      origin: input.origin,
      // 🔴 ไม่ใส่ originRef จากหน้าจอ: กุญแจกันซ้ำคิดจาก originRef — ถ้าใส่ค่าคงที่ (เช่น userId)
      //    พนักงานคนเดิมจะออกใบที่สองให้ลูกค้าคนเดิมไม่ได้เลย ("ออกแล้ว" เงียบ ๆ)
      //    งานกดเองคือครั้งเดียวจบ ⇒ ปล่อยให้ service สุ่มกุญแจใหม่ทุกครั้ง
      originRef: null,
      reason: input.reason ?? null,
      notify: input.notify === true,
    });
    revalidatePath(PATH(input.systemId));
    if (res.pending === true) {
      return { ok: true, data: { pending: true, issued: 0, skipped: 0, approvalRequestId: res.approvalRequestId } };
    }
    return { ok: true, data: { pending: false, issued: res.issued, skipped: res.skipped, approvalRequestId: null } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ออก voucher ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── เทมเพลต ─────────────────────────

export async function createVoucherTemplateAction(input: {
  systemId: string;
  name: string;
  kind: VoucherKind;
  value: number;
  config: VoucherConfig;
  validDays: number;
  origin: VoucherOrigin;
}): Promise<{ ok: true; data: { id: string } } | { ok: false; reason: string }> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.promo.manage");
    const tpl = await createTemplate(ctx, actor, {
      name: input.name,
      kind: input.kind,
      value: input.value,
      config: input.config,
      validDays: input.validDays,
      origin: input.origin,
    });
    revalidatePath(`${PATH(input.systemId)}/templates`);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { id: tpl.id } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกแบบ voucher ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateVoucherTemplateAction(input: {
  systemId: string;
  templateId: string;
  name?: string;
  value?: number;
  validDays?: number;
}): Promise<{ ok: true; data: { id: string } } | { ok: false; reason: string }> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.promo.manage");
    const tpl = await updateTemplate(ctx, actor, input.templateId, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.value === undefined ? {} : { value: input.value }),
      ...(input.validDays === undefined ? {} : { validDays: input.validDays }),
    });
    revalidatePath(`${PATH(input.systemId)}/templates`);
    return { ok: true, data: { id: tpl.id } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "แก้ไขแบบ voucher ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function toggleVoucherTemplateAction(input: {
  systemId: string;
  templateId: string;
  active: boolean;
}): Promise<{ ok: true; data: { active: boolean } } | { ok: false; reason: string }> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.promo.manage");
    const res = await toggleTemplate(ctx, actor, input.templateId, input.active);
    revalidatePath(`${PATH(input.systemId)}/templates`);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { active: res.active } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปลี่ยนสถานะแบบ voucher ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ยกเลิกใบ ─────────────────────────

export async function cancelVoucherAction(input: {
  systemId: string;
  voucherId: string;
  reason: string;
}): Promise<{ ok: true; data: { changed: boolean } } | { ok: false; reason: string }> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    requireKey(actor, "member.promo.manage");
    const res = await cancel(ctx, actor, { voucherId: input.voucherId, reason: input.reason });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: { changed: res.changed } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิก voucher ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
