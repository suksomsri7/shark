// require.ts — ด่านหน้าของทุกคำขอ REST บัญชี (WO A3)
//
// ลำดับด่าน (สลับไม่ได้ — แต่ละขั้นให้ข้อมูลที่ขั้นถัดไปต้องใช้):
//   1. Bearer → ตัวตนของคีย์          401 unauthorized / 401 key_expired
//   2. สมุดบัญชีที่จะทำงานด้วย         400 system_required / 403 system_mismatch
//   3. เพดานอัตราต่อคีย์ (บน DB)      429 rate_limited + Retry-After
//   4. ขอบเขตสิทธิ์ (scope)           403 scope_missing + hint บอก scope ที่ขาด
//
// ทำไม rate limit มาก่อน scope: คนที่ยิงรัวด้วยคีย์ที่สิทธิ์ไม่พอ ก็ต้องถูกเบรกเหมือนกัน
// (ไม่งั้นการเดา scope วนซ้ำจะฟรี) — และ 429 ไม่บอกอะไรเกี่ยวกับสิทธิ์ของคีย์

import { verifyApiKeyDetailed } from "@/lib/api-keys/service";
import { tenantDb } from "@/lib/core/db";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { actorCan, membershipFromScopes, type ApiActor } from "./actor";
import { rateKindOf, type ApiOp, type ApiRateKind } from "./op";
import { fail, newRequestId } from "./respond";

/**
 * เพดานอัตราต่อคีย์ต่อนาที — คิดจากผู้เชื่อมต่อจริง ไม่ได้ยกมาจากที่อื่น
 * (บทเรียน §12 SiamDive S2: ย้ายตัวนับไป DB แล้วยกตัวเลขเดิมมาดื้อ ๆ = เพดานจริงเข้มขึ้นหลายเท่า)
 *   read 300 — หน้าจอ/แดชบอร์ดของแอปคู่ค้าที่ดึงหลายรายการต่อหน้ายังไม่ถึงครึ่ง
 *   write 60 — ออกเอกสารเร็วสุดที่คนกดจริงคือหลักสิบต่อนาที · สคริปต์นำเข้าให้ทยอยส่ง
 *   report 30 — รายงานหนึ่งใบอ่านทั้งงวด ยิงถี่กว่านี้คือคิวรีวนซ้ำ ไม่ใช่การใช้งานจริง
 */
export const API_RATE_LIMITS: Record<ApiRateKind, { limit: number; windowMs: number }> = {
  read: { limit: 300, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  report: { limit: 30, windowMs: 60_000 },
};

export type RequireOk = {
  ok: true;
  actor: ApiActor;
  requestId: string;
  /** โควตาที่เหลือในหน้าต่างนี้ → หัว `X-RateLimit-Remaining` ของคำตอบที่สำเร็จ */
  rateRemaining: number;
};
export type RequireResult = RequireOk | { ok: false; response: Response };

const HEADER_SYSTEM = "x-shark-system";

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  return m?.[1]?.trim() || null;
}

export async function requireAccountApi(
  req: Request,
  op: ApiOp,
  requestId: string = newRequestId(),
): Promise<RequireResult> {
  // ── 1. ตัวตน ──────────────────────────────────────────────────────────────
  const raw = bearer(req);
  const verdict = raw ? await verifyApiKeyDetailed(raw) : ({ status: "invalid" } as const);
  if (verdict.status === "expired") {
    return {
      ok: false,
      response: fail(
        401,
        "key_expired",
        "คีย์ API หมดอายุแล้ว — กรุณาหมุนคีย์ใหม่ที่หน้าตั้งค่าบัญชี › การเชื่อมต่อ",
        "This API key has expired. Rotate it from the accounting settings page.",
        requestId,
      ),
    };
  }
  if (verdict.status !== "ok") {
    return {
      ok: false,
      response: fail(
        401,
        "unauthorized",
        "ต้องส่งส่วนหัว Authorization: Bearer <API key> ที่ถูกต้อง",
        "Missing or invalid Authorization: Bearer <API key> header.",
        requestId,
      ),
    };
  }
  const key = verdict.key;

  // ── 2. สมุดบัญชี ───────────────────────────────────────────────────────────
  // คีย์ที่ผูกสมุดไว้แล้ว = ผูกตายตัว · ส่งหัวมาต่างจากที่ผูก = ปฏิเสธ (ไม่ใช่ "ยึดของคีย์เงียบ ๆ"
  // เพราะผู้เรียกที่เข้าใจผิดว่ากำลังเขียนเข้าเล่ม B จะเขียนลงเล่ม A โดยไม่รู้ตัว)
  const headerSystem = req.headers.get(HEADER_SYSTEM)?.trim() || null;
  const mismatch = () => ({
    ok: false as const,
    response: fail(
      403,
      "system_mismatch",
      "สมุดบัญชีที่ระบุใช้กับคีย์นี้ไม่ได้",
      "The requested accounting book is not available to this API key.",
      requestId,
    ),
  });
  let systemId: string;
  if (key.systemId) {
    if (headerSystem && headerSystem !== key.systemId) return mismatch();
    systemId = key.systemId;
  } else {
    if (!headerSystem) {
      return {
        ok: false,
        response: fail(
          400,
          "system_required",
          "คีย์นี้ไม่ได้ผูกสมุดบัญชี — ต้องส่งส่วนหัว X-Shark-System บอกว่าจะทำงานกับสมุดเล่มไหน",
          "This key is not bound to a book. Send the X-Shark-System header with the AppSystem id.",
          requestId,
        ),
      };
    }
    systemId = headerSystem;
  }
  // ต้องเป็นระบบของ **ร้านนี้** และเป็นชนิด ACCOUNT (tenantDb กรอง tenantId ให้เอง — ข้ามร้านไม่เจอ)
  const system = await tenantDb({ tenantId: key.tenantId }).appSystem.findFirst({
    where: { id: systemId, type: "ACCOUNT" },
    select: { id: true },
  });
  if (!system) return mismatch();

  // ── 3. เพดานอัตรา (ต่อคีย์ · แยกถังตามชนิดงาน) ─────────────────────────────
  const kind = rateKindOf(op);
  const spec = API_RATE_LIMITS[kind];
  const rl = await checkRateLimitDb(`acct:api:${kind}:${key.keyId}`, spec);
  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? Math.ceil(spec.windowMs / 1000);
    return {
      ok: false,
      response: fail(
        429,
        "rate_limited",
        `เรียกใช้ถี่เกินไป — กรุณารออีก ${retryAfter} วินาทีแล้วลองใหม่`,
        "Too many requests for this API key. Retry after the number of seconds in Retry-After.",
        requestId,
        { headers: { "Retry-After": String(retryAfter) } },
      ),
    };
  }
  const rateRemaining = Math.max(0, spec.limit - (rl.count ?? 0));

  // ── 4. ขอบเขตสิทธิ์ ────────────────────────────────────────────────────────
  const actor: ApiActor = {
    kind: "apikey",
    tenantId: key.tenantId,
    systemId: system.id,
    keyId: key.keyId,
    keyName: key.name,
    scopes: key.scopes,
    membership: membershipFromScopes(key.scopes),
  };
  if (!actorCan(actor, op.action)) {
    return {
      ok: false,
      response: fail(
        403,
        "scope_missing",
        "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้",
        "This API key does not have the scope required for this operation.",
        requestId,
        { hint: `ต้องการสิทธิ์ ${op.action}` },
      ),
    };
  }

  return { ok: true, actor, requestId, rateRemaining };
}
