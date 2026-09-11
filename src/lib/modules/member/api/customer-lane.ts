// customer-lane.ts — "ลูกค้าเข้ามาเอง" ผ่าน REST ของระบบสมาชิก (M2.10 · พิมพ์เขียว §3.10 §6.3)
//
// ทางเข้า `/api/v1/member/me/*` มีผู้ใช้คนละชนิดกับที่เหลือทั้ง API:
//   คีย์ของร้าน (`shark_…`) = แอปคู่ค้าทำงาน "ในนามร้าน" เห็นสมาชิกทุกคนของระบบ
//   session ลูกค้า (`cs_…`)  = คนคนหนึ่งทำงาน "ในนามตัวเอง" เห็นได้เฉพาะของตัวเอง ไม่มี scope ใด ๆ เลย
//
// 🔴 ทำไมไม่ยัดลูกค้าเข้าเป็น "คีย์ที่มี scope แคบ": scope เป็นเรื่องของ *ความสามารถ* ส่วนลูกค้าเป็นเรื่องของ
//    *ตัวตน* — ต่อให้ติ๊ก scope ครบทุกช่อง ลูกค้าก็ยังต้องอ่านได้แค่แถวของตัวเอง ⇒ ด่านจริงคือ
//    `actor.customerId` ที่ service ทุกตัวของเลนนี้ตรวจซ้ำ (`me.ts` `assertSelf` · `wallet.assertVisible`
//    · `transferPoints` · `redeemV2`) ไม่ใช่รายการ scope
// 🔴 op ที่ไม่ใช่เลนลูกค้า + token ลูกค้า = 403 `customer_scope` (ไม่ใช่ 401 เพราะล็อกอินใหม่ก็ไม่ช่วย
//    และไม่ใช่ `scope_missing` เพราะไม่มี scope ไหนเปิดทางให้ลูกค้าอ่านข้อมูลสมาชิกคนอื่นได้เลย)

import type { ApiActor } from "@/lib/api/actor";
import type { ApiOp } from "@/lib/api/op";
import { rateKindOf } from "@/lib/api/op";
import { fail, type ApiErrorCode } from "@/lib/api/respond";
import type { RequireResult } from "@/lib/api/require";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { getCustomerSession, isCustomerToken } from "../customer-session";
import { MEMBER_RATE_LIMITS } from "./rate";

/** ชื่อผู้กระทำที่ลง AuditLog เมื่อคำขอมาจากลูกค้าเอง */
export const CUSTOMER_ACTOR_NAME = "สมาชิก (บัตรในไลน์/ในแอป)";

/**
 * คีย์สิทธิ์ที่ "ตัวลูกค้าเอง" ทำได้ — เท่ากับ `action` ของ op ในเลน `/me` เป๊ะ ๆ ไม่มากกว่านั้น
 * 🔴 รายการนี้ไม่ใช่ scope ของคีย์: ลูกค้าไม่มีคีย์ · มันคือ "ประตูสุดท้าย" กันกรณีที่วันหนึ่งมีคนย้าย op
 *    ของร้านมาไว้ใต้ `/me` โดยไม่ได้ตั้งใจ (ประตูแรกคือด่าน path ด้านล่าง)
 */
const CUSTOMER_ACTIONS: ReadonlySet<string> = new Set([
  "member.customer.read",
  "member.customer.update",
  "member.loyalty.read",
  "member.point.transfer",
]);

/** op นี้อยู่ในเลนของลูกค้าไหม (`/me` และทุกอย่างใต้มัน) */
export function isCustomerLaneOp(op: ApiOp): boolean {
  return op.path === "/me" || op.path.startsWith("/me/");
}

function bearer(req: Request): string {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  return m?.[1]?.trim() ?? "";
}

function deny(status: number, code: ApiErrorCode, th: string, en: string, requestId: string, hint?: string): RequireResult {
  return { ok: false, response: fail(status, code, th, en, requestId, hint ? { hint } : {}) };
}

/** `ApiActor` ที่แทน "ลูกค้าคนหนึ่ง" — ไม่มี scope · ทำได้เฉพาะ action ของเลน `/me` */
export function customerApiActor(input: { tenantId: string; systemId: string; customerId: string }): ApiActor {
  return {
    kind: "user",
    module: "member",
    tenantId: input.tenantId,
    systemId: input.systemId,
    customerId: input.customerId,
    // เจ้าของแถวกันซ้ำ/ถังเพดานอัตราของคำขอนี้ — คำนำหน้า `cs:` บอกชัดว่าไม่ใช่ ApiKey.id
    keyId: `cs:${input.customerId}`,
    userId: null,
    keyName: CUSTOMER_ACTOR_NAME,
    scopes: [],
    membership: { role: "STAFF", unitAccess: [], permissions: {} },
    can: (action) => CUSTOMER_ACTIONS.has(action),
    denyMessageTh: "บัญชีสมาชิกของคุณเปิดดูได้เฉพาะข้อมูลของตัวเอง",
  };
}

/**
 * ด่านหน้าเลนลูกค้า (`ApiModuleConfig.altAuth`)
 * คืน `null` = ไม่ใช่ token ของลูกค้า ⇒ ให้แกนเดินด่านคีย์ API ตามปกติ
 */
export async function memberCustomerAuth(req: Request, op: ApiOp, requestId: string): Promise<RequireResult | null> {
  const raw = bearer(req);
  if (!isCustomerToken(raw)) return null;

  const session = await getCustomerSession(raw);
  if (!session) {
    return deny(
      401,
      "unauthorized",
      "เซสชันสมาชิกหมดอายุหรือถูกยกเลิกแล้ว — เข้าสู่ระบบด้วยบัญชีสมาชิกอีกครั้ง",
      "The customer session is expired, revoked or unknown. Sign in again from the membership card page.",
      requestId,
    );
  }

  if (!isCustomerLaneOp(op)) {
    return deny(
      403,
      "customer_scope",
      "บัญชีสมาชิกของคุณเปิดดูได้เฉพาะข้อมูลของตัวเอง — เส้นทางนี้เป็นของทางร้าน ใช้ /me แทน",
      "A customer session may only use the /me lane. This path belongs to the shop and needs a shop API key.",
      requestId,
      "ใช้ /me, /me/wallet, /me/vouchers, /me/stamps, /me/giftcards แทน",
    );
  }

  // เพดานอัตรา: นับต่อ "ลูกค้า 1 คน" (ไม่ใช่ต่อคีย์) — คนละถังกับของร้าน ⇒ ลูกค้าคนหนึ่งกดรัว
  // ไม่กินโควตาของแอปคู่ค้า และคีย์ของร้านก็ไม่เบียดลูกค้าเช่นกัน
  const kind = rateKindOf(op);
  const spec = MEMBER_RATE_LIMITS[kind];
  const rl = await checkRateLimitDb(`mbr:api:${kind}:cs:${session.customerId}`, spec);
  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? Math.ceil(spec.windowMs / 1000);
    return {
      ok: false,
      response: fail(
        429,
        "rate_limited",
        `เรียกใช้ถี่เกินไป — กรุณารออีก ${retryAfter} วินาทีแล้วลองใหม่`,
        "Too many requests for this customer session. Retry after the number of seconds in Retry-After.",
        requestId,
        { headers: { "Retry-After": String(retryAfter) } },
      ),
    };
  }

  const actor = customerApiActor({
    tenantId: session.tenantId,
    systemId: session.memberSystemId,
    customerId: session.customerId,
  });
  if (!actor.can(op.action)) {
    return deny(
      403,
      "customer_scope",
      "บัญชีสมาชิกของคุณทำรายการนี้ไม่ได้ — ติดต่อพนักงานที่ร้านเพื่อดำเนินการให้",
      "This operation is not available to a customer session.",
      requestId,
    );
  }
  return { ok: true, actor, requestId, rateRemaining: Math.max(0, spec.limit - (rl.count ?? 0)), rateLimit: spec.limit };
}
