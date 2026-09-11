"use server";

// join-actions.ts — server action ของหน้าสมัครสมาชิก `/m/<slug>/join` (M3.11 · ภาพ 29)
//
// 🔴 ตรรกะสมัครทั้งหมดอยู่ที่ `join.ts` (M3.10) — ไฟล์นี้แค่ "ประตู" ของหน้าเว็บ: ด่าน · เพดาน · cookie · ตรวจ LINE
//    (REST เลนสาธารณะ `/api/v1/member/join/{slug}/*` เรียก service ตัวเดียวกัน ⇒ ผลเหมือนกันทุกประการ)
// 🔴 ผู้เรียกคือคนที่ **ยังไม่เป็นสมาชิก** (ไม่มี session ใด ๆ) ⇒ ด่านสิทธิ์ = actor สาธารณะที่ถือสิทธิ์
//    `member.join` ตัวเดียว (ชุดเดียวกับเลนสาธารณะของ REST) + เพดานต่อ IP **ถังเดียวกับ REST**
//    (ยิงสลับสองทางก็ไม่ได้เพดานสองเท่า) · เพดาน OTP ต่อเบอร์/ต่อ IP อยู่ใน customer-session.ts อีกชั้น
// 🔴 `lineUserId` ไม่เคยรับจาก client: ผูก LINE ได้เฉพาะเมื่อ server ตรวจ id_token ของ LIFF กับ LINE เอง
//    แล้วส่ง `verifiedLineUserId` ให้ `completeJoin` (ข้อตัดสิน M3.10 ข้อ 5)
// 🔴 ไม่นับคนเปิดลิงก์ `?src=` ที่นี่ — `startJoin` นับให้แล้ว (ข้อตัดสิน M3.10 ข้อ 7 · นับซ้ำ = 2)
// 🔴 ห้าม export type/const จากไฟล์นี้ (Next นับทุก export เป็น server action) — ชนิดอยู่ที่ `join-shared.ts`
// 🔴 ไม่แตะ prisma ตรง ๆ (ข้อสอบ S3.1) — ทุกอย่างผ่าน join.ts / customer-session.ts / referrals.ts

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { sha256 } from "@/lib/core/hash";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { completeJoin, resolveJoinTarget, startJoin, verifyJoin } from "./join";
import { customerCookieName, loginWithLine } from "./customer-session";
import { JOIN_ACTION, JOIN_RATE_LIMITS } from "./api/public-lane";
import type {
  JoinActionResult,
  JoinCompleteData,
  JoinLineData,
  JoinReferralData,
  JoinStartData,
  JoinVerifyData,
} from "./join-shared";

const SESSION_DAYS = 30;
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

/** actor สาธารณะของหน้าสมัคร — ถือสิทธิ์ `member.join` ตัวเดียว (เหมือน `publicApiActor` ของ REST) */
const PUBLIC_JOIN: MembershipCtx = { role: "STAFF", unitAccess: [], permissions: { [JOIN_ACTION]: true } };

type ReqMeta = { ip: string | null; userAgent: string | null };

async function reqMeta(): Promise<ReqMeta> {
  const h = await headers();
  const xff = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const ip = xff || h.get("x-real-ip")?.trim() || "";
  return { ip: ip || null, userAgent: h.get("user-agent") ?? "liff" };
}

/**
 * ด่านของทุก action ในหน้านี้: สิทธิ์สาธารณะ `member.join` + เพดานเขียนต่อ IP (ถังเดียวกับ REST เลน /join)
 * เกินเพดาน = ข้อความไทยบอกเวลารอ (ไม่โทษลูกค้า — Wi-Fi ร้านเดียวกันอาจสมัครพร้อมกันหลายคน)
 */
async function gate(kind: "read" | "write" = "write"): Promise<ReqMeta> {
  assertCan(PUBLIC_JOIN, { module: "member", action: JOIN_ACTION });
  const meta = await reqMeta();
  const spec = JOIN_RATE_LIMITS[kind];
  const rl = await checkRateLimitDb(`mbr:api:join:${kind}:${meta.ip ? sha256(meta.ip).slice(0, 16) : "anon"}`, spec);
  if (!rl.ok) {
    const wait = rl.retryAfterSec ?? Math.ceil(spec.windowMs / 1000);
    throw new Error(`มีการสมัครจากเครือข่ายนี้ถี่เกินไป — รออีก ${wait} วินาทีแล้วลองใหม่อีกครั้ง`);
  }
  return meta;
}

async function setCustomerCookie(token: string): Promise<void> {
  const jar = await cookies();
  const name = customerCookieName();
  jar.set(name, token, {
    httpOnly: true,
    secure: name.startsWith("__Host-"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

function slugOf(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function pathOf(slug: string, page: string): string {
  return `/m/${encodeURIComponent(slug)}/${page}`;
}

/**
 * ตรวจ id_token ของ LIFF กับ LINE (ลายเซ็น · หมดอายุ · ออกให้ช่องทางของเราจริง) → LINE user id
 * 🔴 ห้ามถอด JWT เองแล้วเชื่อ `sub` — ใครก็ปลอม token ส่งมาได้ (กติกาเดียวกับ `/m/<slug>/auth/line`)
 * ไม่มี `LINE_CHANNEL_ID` / ตรวจไม่ผ่าน = null (ผู้เรียกตัดสินเองว่าจะบอกลูกค้าอย่างไร)
 */
async function verifyLineIdToken(idToken: string): Promise<{ lineUserId: string; displayName: string | null } | null> {
  const clientId = process.env.LINE_CHANNEL_ID ?? "";
  const token = idToken.trim();
  if (!clientId || !token) return null;
  try {
    const res = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: token, client_id: clientId }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sub?: string; name?: string; aud?: string };
    if (!data?.sub || (data.aud && data.aud !== clientId)) return null;
    return { lineUserId: data.sub, displayName: typeof data.name === "string" ? data.name : null };
  } catch {
    return null;
  }
}

// ───────────────────────── ขั้น (ก) สมัครด้วย LINE ─────────────────────────

const lineInput = z.object({ slug: z.string().trim().min(1).max(80), idToken: z.string().trim().min(10).max(4000) });

/**
 * ปุ่ม "สมัครด้วย LINE": ตรวจ id_token กับ LINE ก่อน
 * - LINE นี้ผูกกับสมาชิกของร้านแล้ว → เข้าสู่ระบบให้เลย (cookie) → ไปบัตร
 * - ยังไม่ผูก → ให้กรอกฟอร์มต่อ (ยังต้องยืนยันเบอร์/อีเมลด้วย OTP — ตั๋วสมัครออกจาก OTP เท่านั้น)
 *   ตอนกดสมัคร หน้าจอส่ง id_token ชุดเดิมมาอีกครั้งให้ `completeJoinAction` ตรวจซ้ำก่อนผูก
 */
export async function lineJoinAction(raw: { slug: string; idToken: string }): Promise<JoinActionResult<JoinLineData>> {
  try {
    const meta = await gate();
    const input = lineInput.parse(raw);
    await resolveJoinTarget(input.slug);
    const line = await verifyLineIdToken(input.idToken);
    if (!line) {
      return { ok: false, reason: "ยืนยันตัวตนกับไลน์ไม่สำเร็จ — สมัครด้วยเบอร์โทรแทนได้เลย" };
    }
    const r = await loginWithLine(input.slug, { lineUserId: line.lineUserId, displayName: line.displayName }, meta);
    if ("needsJoin" in r) return { ok: true, data: { existing: false, displayName: line.displayName } };
    await setCustomerCookie(r.token);
    return { ok: true, data: { existing: true, next: pathOf(input.slug, "card") } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สมัครด้วยไลน์ไม่สำเร็จในตอนนี้ — สมัครด้วยเบอร์โทรแทนได้เลย") };
  }
}

// ───────────────────────── ขั้น (ข) ขอรหัส / ยืนยัน ─────────────────────────

const startInput = z.object({
  slug: z.string().trim().min(1).max(80),
  target: z.string().trim().min(1).max(120),
  src: z.string().trim().max(40).nullish(),
  referralCode: z.string().trim().max(24).nullish(),
});

/** ขอรหัส OTP ไปที่เบอร์/อีเมล — ผลเหมือนกันทุกกรณี (ไม่เผยว่าเบอร์นี้เป็นสมาชิกอยู่แล้วหรือยัง) */
export async function startJoinAction(raw: {
  slug: string;
  target: string;
  src?: string | null;
  referralCode?: string | null;
}): Promise<JoinActionResult<JoinStartData>> {
  try {
    const meta = await gate();
    const input = startInput.parse(raw);
    const byEmail = input.target.includes("@");
    const r = await startJoin(
      input.slug,
      {
        ...(byEmail ? { email: input.target } : { phone: input.target }),
        src: input.src ?? null,
        referralCode: input.referralCode ?? null,
      },
      { ip: meta.ip },
    );
    return {
      ok: true,
      data: {
        otpId: r.otpId,
        maskedTo: r.maskedTo,
        expiresAt: r.expiresAt.toISOString(),
        ...(r.devOtp ? { devOtp: r.devOtp } : {}),
      },
    };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ขอรหัสยืนยันไม่สำเร็จ — ตรวจเบอร์โทรแล้วลองใหม่อีกครั้ง") };
  }
}

const verifyInput = z.object({
  slug: z.string().trim().min(1).max(80),
  otpId: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(12),
});

/**
 * ยืนยันรหัส
 * - เป็นสมาชิกอยู่แล้ว → ตั้ง cookie ให้เลย (หน้าจอขึ้น "คุณเป็นสมาชิกอยู่แล้ว" แล้วพาไปบัตร)
 * - ยังไม่เป็น → ตั๋วสมัคร `jt_…` (15 นาที) ให้หน้าจอถือไว้ส่งตอนกดสมัคร
 */
export async function verifyJoinAction(raw: { slug: string; otpId: string; code: string }): Promise<JoinActionResult<JoinVerifyData>> {
  try {
    const meta = await gate();
    const input = verifyInput.parse(raw);
    const r = await verifyJoin(input.slug, { otpId: input.otpId, code: input.code }, meta);
    if (r.existing) {
      await setCustomerCookie(r.token);
      return { ok: true, data: { existing: true, next: pathOf(input.slug, "card") } };
    }
    return { ok: true, data: { existing: false, joinToken: r.joinToken, expiresAt: r.expiresAt.toISOString() } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยืนยันรหัสไม่สำเร็จ — กดขอรหัสใหม่แล้วลองอีกครั้ง") };
  }
}

// ───────────────────────── ผู้แนะนำ ─────────────────────────

const referralInput = z.object({ slug: z.string().trim().min(1).max(80), code: z.string().trim().min(1).max(24) });

/**
 * ตรวจโค้ดผู้แนะนำก่อนสมัคร (ภาพ 29 ข "คุณและเพื่อนจะได้รางวัล") — อ่านอย่างเดียว ไม่บันทึกอะไร
 * 🔴 ไม่คืนชื่อ/ข้อมูลของผู้แนะนำ (หน้าสาธารณะ — เดาโค้ดแล้วรู้ว่าใครเป็นสมาชิก = ข้อมูลรั่ว)
 *    ตรวจจริงอีกชั้นตอน `completeJoin` (โค้ดผิดตอนนั้น = ไม่สร้างสมาชิก + ข้อความไทย)
 */
export async function checkReferralAction(raw: { slug: string; code: string }): Promise<JoinActionResult<JoinReferralData>> {
  try {
    await gate("read");
    const input = referralInput.parse(raw);
    const target = await resolveJoinTarget(input.slug);
    // dynamic import: referrals → voucher/point facade → … → โมดูลนี้ = วงกลมตอนโหลดไฟล์ (แบบเดียวกับ join.ts)
    const { getProgram, resolveReferralLanding } = await import("./referrals");
    const { rewardLabel } = await import("./referrals-shared");
    const program = await getProgram({ tenantId: target.tenantId, systemId: target.systemId, actorUserId: null });
    if (!program.enabled) {
      return { ok: false, reason: "ร้านนี้ปิดโปรแกรมแนะนำเพื่อนอยู่ตอนนี้ — เว้นช่องผู้แนะนำไว้แล้วสมัครต่อได้เลย" };
    }
    const hit = await resolveReferralLanding(input.code);
    if (!hit || hit.slug !== target.slug) {
      return { ok: false, reason: "ไม่พบรหัสผู้แนะนำนี้ในร้าน — ตรวจตัวอักษรอีกครั้ง หรือเว้นว่างไว้ก็สมัครได้" };
    }
    return {
      ok: true,
      data: {
        code: hit.code,
        refereeReward: rewardLabel(program.refereeRewardKind, program.refereeRewardValue),
        convertOn: program.convertOn,
      },
    };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตรวจรหัสผู้แนะนำไม่สำเร็จในตอนนี้ — สมัครต่อได้ ระบบจะตรวจอีกครั้งตอนกดสมัคร") };
  }
}

// ───────────────────────── ขั้น (ค) สมัคร ─────────────────────────

const fieldValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(200)).max(50), z.null()]);

const completeInput = z.object({
  slug: z.string().trim().min(1).max(80),
  joinToken: z.string().trim().min(1).max(200),
  fields: z.record(z.string().max(80), fieldValue),
  consents: z.array(z.object({ channel: z.string().trim().max(20), granted: z.boolean() })).max(10),
  policyVersion: z.number().int().min(0),
  referralCode: z.string().trim().max(24).nullish(),
  src: z.string().trim().max(40).nullish(),
  /** id_token ของ LIFF (ถ้าเริ่มด้วยปุ่ม LINE) — ตรวจกับ LINE ใหม่ที่นี่ก่อนผูกเสมอ */
  lineIdToken: z.string().trim().max(4000).nullish(),
  /** รหัสเครื่องแบบสุ่มของเบราว์เซอร์นี้ (กันแนะนำเพื่อนซ้ำจากเครื่องเดียว — ไม่ใช่ข้อมูลส่วนตัว) */
  deviceId: z.string().trim().max(80).nullish(),
});

/** กดสมัครสมาชิก → สมาชิกใหม่ (source LIFF) + ยินยอม + นโยบาย + ผู้แนะนำ + แต้มต้อนรับ → cookie → หน้าสำเร็จ */
export async function completeJoinAction(raw: {
  slug: string;
  joinToken: string;
  fields: Record<string, string | number | boolean | string[] | null>;
  consents: { channel: string; granted: boolean }[];
  policyVersion: number;
  referralCode?: string | null;
  src?: string | null;
  lineIdToken?: string | null;
  deviceId?: string | null;
}): Promise<JoinActionResult<JoinCompleteData>> {
  try {
    const meta = await gate();
    const input = completeInput.parse(raw);
    // LINE ที่ตรวจไม่ผ่าน (token หมดอายุระหว่างกรอกฟอร์ม) = สมัครต่อได้แต่ไม่ผูก — ลูกค้าผูกทีหลังได้ที่หน้าเข้าสู่ระบบ
    const line = input.lineIdToken ? await verifyLineIdToken(input.lineIdToken) : null;
    const r = await completeJoin(
      input.slug,
      {
        joinToken: input.joinToken,
        fields: input.fields,
        consents: input.consents,
        policyVersion: input.policyVersion,
        referralCode: input.referralCode || null,
        src: input.src || null,
        device: { fingerprint: input.deviceId || null },
      },
      { ip: meta.ip, userAgent: meta.userAgent, verifiedLineUserId: line?.lineUserId ?? null },
    );
    await setCustomerCookie(r.token);
    // เบอร์นี้กลายเป็นสมาชิกจากอีกเครื่องระหว่างกรอกฟอร์ม = ไม่ได้สมัครใหม่ ⇒ พาไปบัตรของคนเดิม
    return { ok: true, data: { next: pathOf(input.slug, r.created ? "join/done" : "card"), created: r.created } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สมัครสมาชิกไม่สำเร็จในตอนนี้ — ข้อมูลที่กรอกยังอยู่ กดสมัครอีกครั้งได้เลย") };
  }
}
