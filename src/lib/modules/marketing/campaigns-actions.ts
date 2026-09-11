"use server";

// campaigns-actions.ts — server action ของหน้า "ระบบสมาชิก › แคมเปญ" (M3.2 · ภาพ 21 · 07 ล่าง)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(memberSystemId, need)`: requireTenant → เข้าโมดูลสมาชิกได้
//    (read-โดยนัย) → ถ้าเป็นการเขียน (บันทึก/ส่ง/ยกเลิก) ต้องมีคีย์ `member.promo.manage`
//    (หรือ `marketing.campaign.create` — กติกาเดียวกับกลุ่มลูกค้าของ M3.1)
// 🔴 เรียก `./campaigns` เท่านั้น — ห้ามแตะตาราง MktCampaign ผ่าน prisma ตรงจากที่นี่
//    (ยกเว้นอ่าน AppSystem เพื่อยืนยันขอบเขตร้าน แบบเดียวกับ segments-actions.ts)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่โยนรายละเอียดภายในออกจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { canReadMember, toMemberActor, type MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import {
  campaignStats,
  canManageCampaigns,
  cancelCampaign,
  createCampaignV2,
  previewCampaign,
  resolveCampaignCtx,
  sendCampaignV2,
  updateCampaignV2,
  type CampaignCtx,
} from "./campaigns";
import type { CampaignPreview, CampaignStatsView, SaveCampaignInput } from "./campaigns-shared";

export type CampaignActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (memberSystemId: string) => `/app/sys/${memberSystemId}/member/campaigns`;

async function gate(memberSystemId: string, need: "read" | "manage"): Promise<{ ctx: CampaignCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (แบบเดียวกับ segments-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — สร้าง/ส่ง/ยกเลิกแคมเปญ ต้องมีคีย์ `member.promo.manage`
  if (need === "manage" && !canManageCampaigns(actor)) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการแคมเปญ — ขอสิทธิ์ member.promo.manage จากเจ้าของร้านก่อน");
  }

  const system = await prisma.appSystem.findFirst({ where: { id: memberSystemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  const ctx = await resolveCampaignCtx(tenantId, memberSystemId, auth.user.id, { create: need === "manage" });
  return { ctx, actor };
}

/** บันทึกร่าง / บันทึกการแก้ไข (id ว่าง = ใบใหม่) */
export async function saveCampaignAction(
  memberSystemId: string,
  id: string | null,
  input: SaveCampaignInput,
): Promise<CampaignActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await gate(memberSystemId, "manage");
    const data = id ? await updateCampaignV2(ctx, actor, id, input) : await createCampaignV2(ctx, actor, input);
    revalidatePath(PATH(memberSystemId));
    revalidatePath(`${PATH(memberSystemId)}/${data.id}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกแคมเปญไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ประมาณการก่อนส่ง (แผงขวาของภาพ 21) — อ่านอย่างเดียว */
export async function previewCampaignAction(memberSystemId: string, id: string): Promise<CampaignActionResult<CampaignPreview>> {
  try {
    const { ctx, actor } = await gate(memberSystemId, "read");
    return { ok: true, data: await previewCampaign(ctx, actor, id) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ประมาณการแคมเปญไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** บันทึกแล้วส่งทันที (ปุ่ม "ส่งแคมเปญ") · ตั้งเวลาไว้ข้างหน้า = คาไว้ให้ cron ส่งเมื่อถึงเวลา */
export async function saveAndSendCampaignAction(
  memberSystemId: string,
  id: string | null,
  input: SaveCampaignInput,
): Promise<CampaignActionResult<{ id: string; sent: number; holdout: number; skipped: number; status: string }>> {
  try {
    const { ctx, actor } = await gate(memberSystemId, "manage");
    const saved = id ? await updateCampaignV2(ctx, actor, id, input) : await createCampaignV2(ctx, actor, input);
    const res = await sendCampaignV2(ctx, actor, saved.id, {});
    revalidatePath(PATH(memberSystemId));
    revalidatePath(`${PATH(memberSystemId)}/${saved.id}`);
    return { ok: true, data: { id: saved.id, sent: res.sent, holdout: res.holdout, skipped: res.skipped, status: res.status } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งแคมเปญไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ยกเลิกแคมเปญ (หยุดคิวที่ยังไม่ถึง · ที่ส่งไปแล้วถอนไม่ได้) */
export async function cancelCampaignAction(memberSystemId: string, id: string): Promise<CampaignActionResult<{ status: string; stopped: number }>> {
  try {
    const { ctx, actor } = await gate(memberSystemId, "manage");
    const data = await cancelCampaign(ctx, actor, id);
    revalidatePath(PATH(memberSystemId));
    revalidatePath(`${PATH(memberSystemId)}/${id}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกแคมเปญไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** สถิติล่าสุดของแคมเปญ (หน้ารายละเอียดกดรีเฟรชได้) */
export async function campaignStatsAction(memberSystemId: string, id: string): Promise<CampaignActionResult<CampaignStatsView>> {
  try {
    const { ctx, actor } = await gate(memberSystemId, "read");
    return { ok: true, data: await campaignStats(ctx, actor, id) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านสถิติแคมเปญไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/**
 * "ทดสอบส่งหาตัวเอง" — ส่งข้อความตัวอย่างเข้าอีเมลของคนที่กดปุ่ม
 * 🔴 ไม่แตะกลุ่มเป้าหมายและไม่สร้างผู้รับ: เป็นการดูหน้าตาข้อความ ไม่ใช่การส่งแคมเปญ
 *    (ตัวแปรถูกแทนด้วยค่าตัวอย่างเพื่อให้เห็นว่าลูกค้าจะอ่านเจออะไร)
 */
export async function testSendCampaignAction(
  memberSystemId: string,
  input: { subject?: string; body: string },
): Promise<CampaignActionResult<{ to: string }>> {
  try {
    const auth = await requireTenant();
    const actor = toMemberActor(auth.user.id, auth.active);
    if (!canManageCampaigns(actor)) {
      assertCan(
        { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
        { module: "member", action: "member.promo.manage" },
      );
    }
    const to = auth.user.email;
    if (!to) throw new Error("บัญชีของคุณยังไม่มีอีเมล — เพิ่มอีเมลในโปรไฟล์ก่อนจึงจะทดสอบส่งได้");
    const { sendEmail } = await import("@/lib/core/email");
    await sendEmail(to, input.subject?.trim() || "ทดสอบข้อความแคมเปญ", input.body);
    return { ok: true, data: { to } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ทดสอบส่งไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
