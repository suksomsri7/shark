"use server";

// me-actions.ts — server action ของหน้าลูกค้า `/m/<slug>/*` (M2.9 · ภาพ 09)
//
// 🔴 ทุก action ของ "ลูกค้า" อ่านตัวตนจาก **session ลูกค้า** (`getCustomerSession` ของ cookie `shark_customer`)
//    ไม่ใช่ `requireTenant()` ของพนักงาน — เบราว์เซอร์เดียวกันอาจมี cookie พนักงานติดอยู่ แต่ที่นี่ไม่สนใจมันเลย
// 🔴 ห้าม export type จากไฟล์นี้ (Next นับทุก export ว่าเป็น server action → runtime พัง · บทเรียน M2.2)
//    ชนิดผลลัพธ์อยู่ที่ `me.ts` (`MeResult`)
// 🔴 ข้อความผิดพลาดผ่าน `safeReason` เสมอ — หน้าลูกค้าคือหน้าสาธารณะ ห้ามให้รายละเอียดภายในหลุดออกไป
// ⚠️ `lookupCardTokenAction` เป็น **ทางเข้าของพนักงาน** (จอสแกน QR ที่หน้าขาย/แอปพนักงาน) จึงใช้ด่านพนักงาน
//    เต็มรูปแบบ (requireTenant + assertCan) — อยู่ไฟล์เดียวกับบัตรเพราะมันคือคู่แฝดของ `meCard`

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { canReadMember, toMemberActor } from "./access";
import {
  customerActor,
  customerCookieName,
  getCustomerSession,
  requestOtp,
  revokeCustomerSession,
  verifyOtp,
} from "./customer-session";
import { meUpdate, resolveCardToken, rotateCardToken, type MeResult } from "./me";
import type { MemberCtx } from "./profile";
import { acceptPolicy, requestErase, requestExport, setConsent } from "./privacy";

const SESSION_DAYS = 30;

type Gate = { ctx: MemberCtx; customerId: string };

/** ด่านของลูกค้า: ต้องมี session ลูกค้าจริง และต้องเป็นร้านตาม slug ที่หน้าจอนั้นเปิดอยู่ */
async function gate(slug: string): Promise<Gate> {
  const jar = await cookies();
  const token = jar.get(customerCookieName())?.value ?? "";
  const session = token ? await getCustomerSession(token) : null;
  if (!session) throw new Error("เซสชันหมดอายุแล้ว — เข้าสู่ระบบอีกครั้งเพื่อทำรายการต่อ");
  const tenant = await prisma.tenant.findUnique({ where: { slug: String(slug ?? "").trim() }, select: { id: true } });
  if (!tenant || tenant.id !== session.tenantId) {
    throw new Error("ลิงก์นี้เป็นของอีกร้านหนึ่ง — เปิดหน้าสมาชิกของร้านที่ถูกต้องอีกครั้ง");
  }
  return {
    ctx: { tenantId: session.tenantId, systemId: session.memberSystemId, actorUserId: null },
    customerId: session.customerId,
  };
}

function path(slug: string, page: string): string {
  return `/m/${slug}/${page}`;
}

// ───────────────────────── เข้าสู่ระบบ (OTP) ─────────────────────────

/** ขอรหัส OTP ไปเบอร์/อีเมล — ไม่บอกว่าเป็นสมาชิกหรือไม่ (ตอบเหมือนกันทุกกรณี) */
export async function requestOtpAction(input: {
  slug: string;
  phone?: string;
  email?: string;
}): Promise<MeResult<{ otpId: string; maskedTo: string; expiresAt: string; devOtp?: string }>> {
  try {
    const hdrs = await import("next/headers");
    const h = await hdrs.headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
    const r = await requestOtp(input.slug, { phone: input.phone, email: input.email }, { ip });
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
    return { ok: false, reason: safeReason(e, "ขอรหัสยืนยันไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ยืนยันรหัส → ตั้ง cookie ลูกค้า (httpOnly · sameSite lax) */
export async function verifyOtpAction(input: {
  slug: string;
  otpId: string;
  code: string;
}): Promise<MeResult<{ next: string }>> {
  try {
    const hdrs = await import("next/headers");
    const h = await hdrs.headers();
    const session = await verifyOtp(
      { otpId: input.otpId, code: input.code },
      { userAgent: h.get("user-agent") ?? "m-web", ip: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null },
    );
    const jar = await cookies();
    jar.set(session.cookieName, session.token, {
      httpOnly: true,
      secure: session.cookieName.startsWith("__Host-"),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
    return { ok: true, data: { next: path(input.slug, "card") } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยืนยันรหัสไม่สำเร็จ — ขอรหัสใหม่แล้วลองอีกครั้ง") };
  }
}

/** ออกจากระบบของลูกค้า (ไม่แตะ session พนักงาน) */
export async function logoutCustomerAction(input: { slug: string }): Promise<MeResult<{ next: string }>> {
  try {
    const jar = await cookies();
    const name = customerCookieName();
    const token = jar.get(name)?.value ?? "";
    await revokeCustomerSession(token);
    jar.delete(name);
    return { ok: true, data: { next: path(input.slug, "login") } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ออกจากระบบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── โปรไฟล์ · ความยินยอม · PDPA ─────────────────────────

/** แก้ข้อมูลของตัวเอง (เฉพาะฟิลด์ที่ร้านเปิดให้แก้) */
export async function updateMyFieldsAction(input: {
  slug: string;
  fields: Record<string, string | number | boolean | string[] | null>;
}): Promise<MeResult<{ updated: string[] }>> {
  try {
    const g = await gate(input.slug);
    const r = await meUpdate(g.ctx, customerActor(g.customerId), g.customerId, { fields: input.fields });
    revalidatePath(path(input.slug, "profile"));
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** เปิด/ปิดการรับข่าวสารรายช่องทาง (ที่มา = LIFF เพราะลูกค้ากดเองจากหน้าสมาชิก) */
export async function setMyConsentAction(input: {
  slug: string;
  channel: string;
  granted: boolean;
}): Promise<MeResult<{ channel: string; granted: boolean | null }>> {
  try {
    const g = await gate(input.slug);
    const row = await setConsent(g.ctx, customerActor(g.customerId), g.customerId, {
      channel: input.channel,
      granted: input.granted,
      source: "LIFF",
    });
    revalidatePath(path(input.slug, "profile"));
    return { ok: true, data: { channel: row.channel, granted: row.granted } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกความยินยอมไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ขอสำเนาข้อมูลของฉัน (PDPA) — ได้ก้อนข้อมูลกลับมาเป็น JSON ให้ดาวน์โหลด */
export async function requestMyExportAction(input: {
  slug: string;
}): Promise<MeResult<{ requestId: string; bundleJson: string }>> {
  try {
    const g = await gate(input.slug);
    const r = await requestExport(g.ctx, customerActor(g.customerId), g.customerId, "LIFF");
    return { ok: true, data: { requestId: r.requestId, bundleJson: JSON.stringify(r.bundle, null, 2) } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ขอสำเนาข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ขอให้ร้านลบข้อมูลของฉัน (PDPA) — เป็น "คำขอ" เสมอ ร้านต้องอนุมัติก่อนจึงลบจริง */
export async function requestMyEraseAction(input: {
  slug: string;
  reason?: string;
}): Promise<MeResult<{ requestId: string; status: string }>> {
  try {
    const g = await gate(input.slug);
    const r = await requestErase(g.ctx, customerActor(g.customerId), g.customerId, {
      via: "LIFF",
      reason: input.reason ?? null,
    });
    revalidatePath(path(input.slug, "profile"));
    return { ok: true, data: { requestId: r.requestId, status: r.status } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งคำขอลบข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ยอมรับนโยบายความเป็นส่วนตัวเวอร์ชันปัจจุบัน */
export async function acceptPolicyAction(input: {
  slug: string;
  version: number;
}): Promise<MeResult<{ version: number; acceptedAt: string }>> {
  try {
    const g = await gate(input.slug);
    const r = await acceptPolicy(g.ctx, g.customerId, input.version, "LIFF");
    revalidatePath(path(input.slug, "profile"));
    return { ok: true, data: { version: r.version, acceptedAt: r.acceptedAt.toISOString() } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการยอมรับนโยบายไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ออก QR บัตรใหม่ (ของเดิมใช้ไม่ได้ทันที) */
export async function rotateMyCardAction(input: { slug: string }): Promise<MeResult<{ expiresAt: string }>> {
  try {
    const g = await gate(input.slug);
    const r = await rotateCardToken(g.ctx, customerActor(g.customerId), g.customerId);
    revalidatePath(path(input.slug, "card"));
    return { ok: true, data: { expiresAt: r.expiresAt.toISOString() } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ออก QR ใหม่ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── M3.11 เครื่องรับแจ้งเตือน (หน้า /m/* ในแอปลูกค้า) ─────────────────────────

/**
 * สะพาน push ของหน้า `/m/*` (`MPushBridge`) — แอปส่ง Expo push token เข้า WebView แล้วหน้าเว็บส่งต่อมาที่นี่
 * ผลเท่ากับ REST `POST /api/v1/member/me/push-devices` ทุกประการ (service ตัวเดียวกัน `registerPushDevice`)
 * ต่างกันแค่ตัวตน: ที่นี่อ่านจาก cookie session ลูกค้า (httpOnly — JS ในหน้าอ่าน token ไม่ได้ จึงยิง REST
 * ด้วย Bearer เองไม่ได้) · ไม่มี session / คนละร้าน = ไม่ลงทะเบียน (เงียบ ๆ ไม่ใช่หน้าพัง)
 */
export async function registerMyPushDeviceAction(input: {
  slug: string;
  expoToken: string;
  platform?: string | null;
}): Promise<MeResult<{ id: string; platform: string }>> {
  try {
    const g = await gate(input.slug);
    const { registerPushDevice } = await import("./push-devices");
    const row = await registerPushDevice(g.ctx, customerActor(g.customerId), {
      expoToken: input.expoToken,
      platform: input.platform ?? null,
    });
    return { ok: true, data: { id: row.id, platform: row.platform } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลงทะเบียนเครื่องรับแจ้งเตือนไม่สำเร็จ — ปิดแล้วเปิดแอปใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ทางเข้าของพนักงาน: สแกน QR บัตรสมาชิก ─────────────────────────

/**
 * พนักงานสแกน/พิมพ์ token จาก QR บัตรสมาชิก → การ์ดย่อของสมาชิกคนนั้น (ไม่มีเบอร์เต็ม)
 * ด่าน: พนักงานที่ล็อกอินหลังร้าน + สิทธิ์อ่านสมาชิก (`member.customer.read`)
 */
export async function lookupCardTokenAction(input: {
  token: string;
}): Promise<MeResult<{ id: string; memberCode: string; displayName: string; tierName: string | null; points: number } | null>> {
  try {
    const auth = await requireTenant();
    const actor = toMemberActor(auth.user.id, auth.active);
    if (!canReadMember(actor)) {
      assertCan(
        { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
        { module: "member", action: "member.customer.read" },
      );
    }
    const brief = await resolveCardToken(auth.active.tenantId, input.token);
    if (!brief) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        id: brief.id,
        memberCode: brief.memberCode,
        displayName: brief.displayName,
        tierName: brief.tier?.name ?? null,
        points: brief.points,
      },
    };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านบัตรสมาชิกไม่สำเร็จ — ให้ลูกค้าเปิดหน้าบัตรใหม่แล้วสแกนอีกครั้ง") };
  }
}
