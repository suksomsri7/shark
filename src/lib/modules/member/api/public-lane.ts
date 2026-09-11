// public-lane.ts — เลนสาธารณะของ REST ระบบสมาชิก: สมัครสมาชิกจากลิงก์ของร้าน (M3.10 · `/join/{tenantSlug}/*`)
//
// ผู้เรียกคือ **เบราว์เซอร์/แอปของคนที่ยังไม่เป็นสมาชิก** — ไม่มีคีย์ของร้าน ไม่มี session ลูกค้า
// ⇒ ด่านของเลนนี้ไม่ใช่ "ใครเป็นคนเรียก" แต่คือ:
//   1) ร้าน (จาก `tenantSlug` ใน path) ต้องมีจริงและเปิดระบบสมาชิกอยู่ — ไม่มี = 404
//   2) เพดานอัตราต่อ IP (ถังแยกจากคีย์/ลูกค้า) + เพดาน OTP ต่อเบอร์/ต่อ IP ของ `customer-session.ts`
//   3) ทุกขั้นของบริการ (`member/join.ts`) ใช้ได้ครั้งเดียว: OTP · ตั๋วสมัคร · เบอร์ซ้ำ = คนเดิม
//
// 🔴 actor ของเลนนี้ทำได้ **เฉพาะ op ของเลนนี้** (`can` ตอบจริงแค่ `JOIN_ACTION`) — ต่อให้วันหนึ่งมีคนประกาศ
//    op ของร้านไว้ใต้ `/join/` โดยไม่ตั้งใจ ด่านสิทธิ์ของแกนก็ยังปฏิเสธ
// 🔴 IP ดิบไม่ลงบันทึก: `keyId` (เจ้าของแถวกันซ้ำ + actorId ใน audit) = hash ของ IP · ตัวดิบส่งให้ handler
//    ผ่าน WeakMap เพื่อใช้กับเพดาน OTP เท่านั้น

import { sha256 } from "@/lib/core/hash";
import type { ApiActor } from "@/lib/api/actor";
import type { ApiOp } from "@/lib/api/op";
import { rateKindOf } from "@/lib/api/op";
import { fail } from "@/lib/api/respond";
import type { RequireResult } from "@/lib/api/require";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveJoinTarget } from "../join";
import { memberAuthOf } from "./op";

/** คีย์สิทธิ์เทียมของเลนสาธารณะ — ไม่มีในทะเบียนสิทธิ์ของคน/คีย์ ⇒ มีแต่ actor ของเลนนี้ที่ถือ */
export const JOIN_ACTION = "member.join";

/** ชื่อผู้กระทำที่ลง AuditLog ของเลนนี้ */
export const PUBLIC_ACTOR_NAME = "สมัครสมาชิกผ่านลิงก์ของร้าน";

/**
 * เพดานต่อ IP ต่อนาที — หน้าสมัครหนึ่งหน้าเรียกฟอร์ม 1 ครั้ง + ขอรหัส/ยืนยัน/สมัคร ไม่กี่ครั้ง
 * งานอีเวนต์ที่คนสมัครพร้อมกันผ่าน Wi-Fi ร้านเดียว (IP เดียว) ยังไม่ชน 30 เขียน/นาที
 * (เพดานที่กันเดา OTP จริงอยู่ที่ `customer-session.ts`: ต่อเบอร์ 3 ครั้ง/10 นาที · ต่อ IP 10 ครั้ง/10 นาที)
 */
export const JOIN_RATE_LIMITS = {
  read: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  report: { limit: 30, windowMs: 60_000 },
} as const;

const PUBLIC_IP = new WeakMap<ApiActor, string>();

/** IP ของผู้เรียกที่เลนสาธารณะเห็น (ใช้กับเพดาน OTP) — actor อื่น = "" */
export function publicIpOf(actor: ApiActor): string {
  return PUBLIC_IP.get(actor) ?? "";
}

/** IP ต้นทางจากหัวของ proxy (ตัวแรกของ X-Forwarded-For) — ไม่มี = "" */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim() ?? "";
  return first || req.headers.get("x-real-ip")?.trim() || "";
}

/** `tenantSlug` จาก URL จริง (`/api/v1/member/join/<slug>/...`) — แกนยังไม่ส่ง params มาให้ด่านหน้า */
function slugOf(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("join");
  return i >= 0 ? decodeURIComponent(parts[i + 1] ?? "") : "";
}

export function publicApiActor(input: { tenantId: string; systemId: string; ip: string }): ApiActor {
  const actor: ApiActor = {
    kind: "user",
    module: "member",
    tenantId: input.tenantId,
    systemId: input.systemId,
    // เจ้าของแถวกันซ้ำ/actorId ของ audit — hash ของ IP (ไม่เก็บ IP ดิบ) · ไม่มี IP = ถังรวม "anon"
    keyId: `pub:${input.ip ? sha256(input.ip).slice(0, 16) : "anon"}`,
    userId: null,
    customerId: null,
    keyName: PUBLIC_ACTOR_NAME,
    scopes: [],
    membership: { role: "STAFF", unitAccess: [], permissions: {} },
    can: (action) => action === JOIN_ACTION,
    denyMessageTh: "เส้นทางสาธารณะใช้ได้เฉพาะการสมัครสมาชิก",
  };
  PUBLIC_IP.set(actor, input.ip);
  return actor;
}

/**
 * ด่านหน้าเลนสาธารณะ (ส่วนหนึ่งของ `ApiModuleConfig.altAuth`)
 * คืน `null` = op นี้ไม่ใช่เลนสาธารณะ ⇒ ให้เลนลูกค้า/คีย์ API ตัดสินต่อ
 */
export async function memberPublicAuth(req: Request, op: ApiOp, requestId: string): Promise<RequireResult | null> {
  if (memberAuthOf(op) !== "public") return null;

  let target: { tenantId: string; systemId: string };
  try {
    target = await resolveJoinTarget(slugOf(req));
  } catch (e) {
    return {
      ok: false,
      response: fail(
        404,
        "not_found",
        e instanceof Error && e.message ? e.message : "ไม่พบร้านนี้ — ตรวจลิงก์ที่ร้านส่งให้อีกครั้ง",
        "No shop with an open member system matches this tenant slug.",
        requestId,
      ),
    };
  }

  const ip = clientIp(req);
  const kind = rateKindOf(op);
  const spec = JOIN_RATE_LIMITS[kind];
  const rl = await checkRateLimitDb(`mbr:api:join:${kind}:${ip ? sha256(ip).slice(0, 16) : "anon"}`, spec);
  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? Math.ceil(spec.windowMs / 1000);
    return {
      ok: false,
      response: fail(
        429,
        "rate_limited",
        `มีการสมัครจากเครือข่ายนี้ถี่เกินไป — กรุณารออีก ${retryAfter} วินาทีแล้วลองใหม่`,
        "Too many signup requests from this network. Retry after the number of seconds in Retry-After.",
        requestId,
        { headers: { "Retry-After": String(retryAfter) } },
      ),
    };
  }

  const actor = publicApiActor({ tenantId: target.tenantId, systemId: target.systemId, ip });
  return { ok: true, actor, requestId, rateRemaining: Math.max(0, spec.limit - (rl.count ?? 0)), rateLimit: spec.limit };
}
