"use server";

// reviews-actions.ts — server action ของ "รีวิวลูกค้า" (M3.4 · ภาพ 23 · หน้า LIFF `/m/<slug>/review/<token>`)
//
// 🔴 ฝั่งร้าน ผ่านด่านเดียว `gate(systemId, need)`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย)
//    → ตอบ/ซ่อน/ร่างคำตอบ ต้องมีคีย์ `member.review.reply` · ตั้งค่าต้องมี `member.settings.manage` (§6.1)
//    → ระบบนี้เป็น MEMBER ของร้านนี้จริง · เรียก `./reviews` เท่านั้น (ห้ามแตะตาราง MemberReview ตรงจากที่นี่)
// 🔴 ฝั่งลูกค้า (`submitReviewAction`) ไม่มี session — token ในลิงก์คือสิทธิ์ (ใช้ครั้งเดียว) · ตรวจ token
//    ก่อนรับไฟล์รูปเสมอ (ไม่ให้ใครอัปไฟล์เข้าร้านได้ด้วยลิงก์มั่ว) + จำกัดความถี่ต่อลิงก์
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดผลลัพธ์อยู่ที่ `reviews-shared.ts` (บทเรียน M2.2)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ
// 🔴 ตัวส่ง LINE ของคำตอบร้าน = `reviewSenders` จาก composition root (`src/lib/member-journey-senders.ts`)
//    โหลดแบบ dynamic — ตัวนั้นลากแชท/บอร์ดงานมาด้วย ⇒ โหลดเฉพาะตอนกดส่งคำตอบจริง

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { sha256 } from "@/lib/core/hash";
import { canManageSettings, canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "./access";
import { prisma } from "./db";
import type { MemberCtx } from "./profile";
import { draftReply, hide, reply, reviewTokenTenant, setReviewSettings, submitReview, summarize, unhide } from "./reviews";
import { REVIEW_MAX_PHOTOS, type ReviewActionResult, type ReviewSettings, type ReviewSubmitResult, type ReviewSummary } from "./reviews-shared";

const PATH = (systemId: string) => `/app/sys/${systemId}/member/reviews`;

async function gate(systemId: string, need: "read" | "reply" | "settings"): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ journeys-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.review.read" });
  }
  // ชั้นที่ 2 — ตอบ/ซ่อน/ร่างคำตอบรีวิว = `member.review.reply` · ตั้งค่า = `member.settings.manage` (MANAGER ไม่ได้โดยปริยาย)
  if (need === "reply" && !hasMemberPerm(actor, "member.review.reply")) {
    assertCan(mc, { module: "member", action: "member.review.reply" });
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์ตอบรีวิว — ขอสิทธิ์ member.review.reply จากเจ้าของร้านก่อน");
  }
  if (need === "settings" && !canManageSettings(actor)) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งค่าระบบสมาชิก — ขอสิทธิ์ member.settings.manage จากเจ้าของร้านก่อน");
  }

  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** ส่งคำตอบรีวิว (+ ส่งให้ลูกค้าทาง LINE ถ้าผูกไลน์และยินยอม) */
export async function replyReviewAction(systemId: string, reviewId: string, body: string): Promise<ReviewActionResult<{ changed: boolean; sent: boolean }>> {
  try {
    const { ctx, actor } = await gate(systemId, "reply");
    const { reviewSenders } = await import("@/lib/member-journey-senders");
    const r = await reply(ctx, actor, reviewId, { body }, { deps: reviewSenders });
    revalidatePath(PATH(systemId));
    return { ok: true, data: { changed: r.changed, sent: r.sent } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งคำตอบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ให้ AI ร่างคำตอบ (ยังไม่ส่ง — ใส่ลงกล่องให้แก้ก่อน) */
export async function draftReplyAction(systemId: string, reviewId: string): Promise<ReviewActionResult<{ text: string; ai: boolean }>> {
  try {
    const { ctx, actor } = await gate(systemId, "reply");
    return { ok: true, data: await draftReply(ctx, actor, reviewId) };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ร่างคำตอบไม่สำเร็จ — พิมพ์ตอบเองได้เลย") };
  }
}

/** ซ่อนรีวิว (ไม่ลบ) */
export async function hideReviewAction(systemId: string, reviewId: string, reason: string): Promise<ReviewActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(systemId, "reply");
    const r = await hide(ctx, actor, reviewId, { reason });
    revalidatePath(PATH(systemId));
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ซ่อนรีวิวไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function unhideReviewAction(systemId: string, reviewId: string): Promise<ReviewActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(systemId, "reply");
    await unhide(ctx, actor, reviewId);
    revalidatePath(PATH(systemId));
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เลิกซ่อนรีวิวไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** บันทึกตั้งค่ารีวิว (ภาพ 23 ขวาล่าง) */
export async function saveReviewSettingsAction(systemId: string, patch: Partial<ReviewSettings>): Promise<ReviewActionResult<ReviewSettings>> {
  try {
    const { ctx, actor } = await gate(systemId, "settings");
    const next = await setReviewSettings(ctx, actor, patch);
    revalidatePath(PATH(systemId));
    return { ok: true, data: next };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกตั้งค่ารีวิวไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** สรุปรีวิวเดือนนี้ใหม่ด้วย AI (ข้ามแคชของวันนี้) */
export async function refreshReviewSummaryAction(systemId: string): Promise<ReviewActionResult<ReviewSummary>> {
  try {
    const { ctx, actor } = await gate(systemId, "reply");
    const s = await summarize(ctx, actor, {}, { force: true });
    revalidatePath(PATH(systemId));
    return { ok: true, data: s };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สรุปรีวิวใหม่ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ฝั่งลูกค้า (LIFF · ไม่มี session) ─────────────────────────

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * ลูกค้าส่งรีวิว: `formData` = rating · body · photos (≤ 3 ไฟล์รูป)
 * ตรวจ token ก่อนรับไฟล์ · อัปรูปไม่สำเร็จ = ไม่ส่งรีวิว (บอกให้ลองใหม่/ส่งแบบไม่มีรูป)
 */
export async function submitReviewAction(slug: string, token: string, formData: FormData): Promise<ReviewActionResult<ReviewSubmitResult>> {
  try {
    const t = String(token ?? "").trim();
    const rl = checkRateLimit(`member-review-submit:${sha256(t).slice(0, 24)}`, { limit: 8, windowMs: 10 * 60_000 });
    if (!rl.ok) return { ok: false, reason: `ส่งถี่เกินไป — รอประมาณ ${rl.retryAfterSec ?? 60} วินาทีแล้วลองใหม่` };
    const shop = await reviewTokenTenant(slug, t);
    if (!shop) return { ok: false, reason: "ลิงก์รีวิวนี้ใช้ไม่ได้แล้ว หรือรีวิวเรียบร้อยแล้ว — ขอบคุณค่ะ" };

    const rating = Number(formData.get("rating") ?? 0);
    const body = String(formData.get("body") ?? "");
    const files = formData.getAll("photos").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
    if (files.length > REVIEW_MAX_PHOTOS) return { ok: false, reason: `แนบรูปได้สูงสุด ${REVIEW_MAX_PHOTOS} รูปต่อรีวิว — เลือกรูปใหม่อีกครั้ง` };
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, reason: "แตะดาวเพื่อให้คะแนน 1–5 ดาวก่อนกดส่ง" };

    const photoFileIds: string[] = [];
    if (files.length > 0) {
      const { uploadFile } = await import("@/lib/storage/service");
      for (const f of files) {
        if (!String(f.type ?? "").startsWith("image/")) return { ok: false, reason: "แนบได้เฉพาะไฟล์รูปภาพ — เลือกรูปใหม่อีกครั้ง" };
        const up = await uploadFile({ tenantId: shop.tenantId }, { kind: "ATTACHMENT", filename: f.name || "review.jpg", contentType: f.type, data: new Uint8Array(await f.arrayBuffer()), maxBytes: PHOTO_MAX_BYTES });
        if (!up.ok) return { ok: false, reason: `${up.error} — ส่งรีวิวแบบไม่มีรูปได้` };
        photoFileIds.push(up.assetId);
      }
    }
    const r = await submitReview({ token: t, rating, body, photoFileIds });
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งรีวิวไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
