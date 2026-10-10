// crm-routes.ts — ของใช้ร่วมของ `/api/mobile/crm/*` (แอปพนักงาน ส่วน CRM · ใบ C3.7 · ภาพ 13)
//
// 🔴 route ทุกเส้นเรียก `requireMobile` เอง (ด่านอยู่ในไฟล์ route ให้อ่านเห็นทันที) แล้วส่งต่อให้ `runMobileCrm` ที่นี่:
//    เพดานความถี่ต่อผู้ใช้ → ระบบ CRM ของคำขอ (`?systemId=` หรือระบบ v2 ใบแรก) → actor จาก membership ที่ requireMobile ตรวจสด →
//    งานของ route (บริการ CRM ผ่าน facade เท่านั้น — ไม่มี prisma ใน route) → JSON · error ทุกชนิด → `{ error, message(ไทย) }`
// 🔴 X7: เพดาน **ต่อผู้ใช้** (ไม่ใช่ต่อ IP — พนักงานทั้งร้านใช้ Wi-Fi เดียวกัน) ผ่าน `checkRateLimitDb` ตัวเดียวของระบบ
//    กุญแจถัง = `mobile-crm:<userId>` (ไม่มี token/IP ดิบ) · 120 ครั้ง/นาที ≈ แตะจอทุกครึ่งวินาทีต่อเนื่องหนึ่งนาที — คนจริงไม่ถึง
// 🔴 มองไม่เห็น = 404 (ไม่ใช่ 403) — ตัดสินในบริการ CRM (`crm.mobile.mobileErrorOf`)
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { mobile as crmMobile, wakeOutbox } from "@/lib/modules/crm";
import { toMemberActor, type MemberActor } from "@/lib/modules/member";
import type { MobileAuth, MobileGate } from "./auth";
import { mobileMemberAuthError, readJson } from "./member-routes";

export const MOBILE_CRM_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;
/** ถังที่สองของ POST สแกนนามบัตร (เรียกโมเดล vision · เสียเครดิต) — `mobile-crm-scan:<userId>` 10 ครั้ง/นาที (นับเพิ่มจากถังหลัก) */
export const MOBILE_CRM_SCAN_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

export type MobileCrmScope = {
  ctx: { tenantId: string; systemId: string; actorUserId: string };
  actor: MemberActor;
  url: URL;
  /** body JSON (อ่านหลังผ่านเพดานความถี่เท่านั้น · `readBody` ไม่ขอ = {}) */
  body: Record<string, unknown>;
};

/** requireMobile ไม่ผ่าน → JSON (รหัสเดิม + ข้อความไทย — ชุดเดียวกับจอสมาชิก) */
export function mobileCrmAuthError(g: Extract<MobileGate, { ok: false }>): Response {
  return mobileMemberAuthError(g);
}

export function mobileCrmError(e: unknown): Response {
  const m = crmMobile.mobileErrorOf(e);
  if (m.status >= 500) console.error(`[mobile-crm] คำขอล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return Response.json({ error: m.error, message: m.message }, { status: m.status });
}

/** คำขอผิดรูป (ก่อนถึงบริการ) → 400 ข้อความไทย */
export function mobileCrmBadRequest(message: string): Response {
  return Response.json({ error: "invalid", message }, { status: 400 });
}

const limited = (retryAfterSec: number | undefined, message: string) =>
  Response.json({ error: "rate_limited", message }, { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 60) } });

/**
 * ครอบงานของ route หลังผ่าน requireMobile: เพดานต่อผู้ใช้ (ก่อนอ่าน body เสมอ — คำขอที่ถูกปัดไม่ต้องแยก JSON 8 MB) → body →
 * ระบบ CRM → actor → งาน → JSON · `run` คืน body (ตอบ 200) หรือ Response สำเร็จรูป (เช่น 201/400)
 * `opts.bucket: "scan"` = นับถังสแกนนามบัตรเพิ่มอีกชั้น
 */
export async function runMobileCrm(
  req: Request,
  g: MobileAuth,
  run: (s: MobileCrmScope) => Promise<unknown>,
  opts: { readBody?: boolean; bucket?: "scan" } = {},
): Promise<Response> {
  const verdict = await checkRateLimitDb(`mobile-crm:${g.user.id}`, MOBILE_CRM_RATE_LIMIT);
  if (!verdict.ok) return limited(verdict.retryAfterSec, `ใช้งานถี่เกินไป — รอสัก ${verdict.retryAfterSec ?? 60} วินาทีแล้วลองใหม่`);
  if (opts.bucket === "scan") {
    const v2 = await checkRateLimitDb(`mobile-crm-scan:${g.user.id}`, MOBILE_CRM_SCAN_RATE_LIMIT);
    if (!v2.ok) return limited(v2.retryAfterSec, `สแกนนามบัตรถี่เกินไป — รอสัก ${v2.retryAfterSec ?? 60} วินาทีแล้วถ่ายใบถัดไป`);
  }
  try {
    const body = opts.readBody ? await readJson(req) : {};
    const url = new URL(req.url);
    const systemId = await crmMobile.resolveSystem(g.ctx.tenantId, url.searchParams.get("systemId"));
    const actor = toMemberActor(g.user.id, g.membership);
    const out = await run({ ctx: { tenantId: g.ctx.tenantId, systemId, actorUserId: g.user.id }, actor, url, body });
    // CRM C5.5-fix13 ▸ P-it5-2 sweep: คำขอเขียนที่สำเร็จ (ไม่ใช่ GET · ไม่ใช่ 4xx/5xx) ⇒ ปลุกคิว outbox — กติกาเดียวกับ REST CRM (`api/dispatch.ts`) ◂
    if (req.method !== "GET" && !(out instanceof Response && out.status >= 400)) wakeOutbox();
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    return mobileCrmError(e);
  }
}

