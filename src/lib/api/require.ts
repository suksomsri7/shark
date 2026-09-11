// require.ts — ด่านหน้าของทุกคำขอ REST (ยกเป็นของกลางตอน K1.15 · โมดูลส่ง `ApiModuleConfig` เข้ามา)
//
// ลำดับด่าน (สลับไม่ได้ — แต่ละขั้นให้ข้อมูลที่ขั้นถัดไปต้องใช้):
//   1. Bearer → ตัวตนของคีย์          401 unauthorized / 401 key_expired
//   2. ระบบ (AppSystem) ที่จะทำงานด้วย  400 system_required / 403 system_mismatch
//   3. เพดานอัตราต่อคีย์ (บน DB)      429 rate_limited + Retry-After
//   4. ขอบเขตสิทธิ์ (scope)           403 scope_missing + hint บอก scope ที่ขาด
//
// ทำไม rate limit มาก่อน scope: คนที่ยิงรัวด้วยคีย์ที่สิทธิ์ไม่พอ ก็ต้องถูกเบรกเหมือนกัน
// (ไม่งั้นการเดา scope วนซ้ำจะฟรี) — และ 429 ไม่บอกอะไรเกี่ยวกับสิทธิ์ของคีย์

import type { SystemType } from "@prisma/client";
import { verifyApiKeyDetailed } from "@/lib/api-keys/service";
import { tenantDb } from "@/lib/core/db";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { actorCan, type ApiActor } from "./actor";
import { rateKindOf, type ApiOp, type ApiRateKind } from "./op";
import { fail, newRequestId } from "./respond";

/**
 * "โมดูลนี้ต่อ REST อย่างไร" — ทุกอย่างที่แกนกลางไม่ควรรู้เอง
 * (ชนิดของระบบที่คีย์ผูกได้ · ถังเพดานอัตรา · วิธีแปลง scope เป็น actor · ข้อความไทยของโมดูล)
 * 🔴 ข้อความอยู่ในนี้ ไม่ใช่ในแกน: บัญชีพูดว่า "สมุดบัญชี" บอร์ดงานพูดว่า "ระบบบอร์ดงาน"
 *    ถ้าแกนเขียนข้อความเอง ผู้เชื่อมต่อจะได้คำที่ไม่ตรงกับหน้าจอที่เขาเห็น
 */
export type ApiModuleMessages = {
  keyExpiredTh: string;
  keyExpiredEn: string;
  systemMismatchTh: string;
  systemMismatchEn: string;
  systemRequiredTh: string;
  systemRequiredEn: string;
  scopeMissingTh: string;
  scopeMissingEn: string;
  notFoundTh: string;
  notFoundEn: string;
};

export type ApiModuleConfig = {
  /** ชื่อโมดูล (`account` / `kanban`) — ติดไปกับ actor และใช้ตั้งชื่อถังเพดานอัตรา */
  module: string;
  /** ชนิดของ AppSystem ที่คีย์ทำงานด้วยได้ */
  systemType: SystemType;
  /** คำนำหน้าคีย์สิทธิ์ของโมดูล (`account.` / `kanban.`) — คู่มือ/สกิลอ้างค่านี้ */
  scopePrefix: string;
  /** namespace ของถังเพดานอัตรา (`acct` / `kb`) — แยกถังต่อโมดูล ไม่งั้นคีย์เดียวถูกโมดูลอื่นกินโควตา */
  rateNs: string;
  /** เพดานอัตราต่อคีย์ต่อนาที (ไม่ระบุ = ค่ากลาง) */
  rateLimits?: Record<ApiRateKind, { limit: number; windowMs: number }>;
  /** scope ของคีย์ → actor ของโมดูล (ผูก `can()` ของโมดูลนั้นมาด้วย) */
  makeActor: (input: {
    tenantId: string;
    systemId: string;
    keyId: string;
    keyName: string;
    scopes: string[];
    /** User.id ของคนที่สร้างคีย์ (โมดูลที่ต้องมี "คน" อยู่เบื้องหลังคีย์ใช้ค่านี้ — ดู K1.15/D18) */
    createdById?: string | null;
  }) => ApiActor;
  /**
   * ทางเข้าอื่นที่ **ไม่ใช่คีย์ API** ของโมดูลนี้ (M2.10 — session ลูกค้าของระบบสมาชิก)
   * คืน `null` = คำขอนี้ไม่ใช่ทางนั้น ⇒ เดินด่านคีย์ตามปกติ
   *
   * 🔴 ทำไมต้องเป็นของโมดูล ไม่ใช่ของแกน: "ลูกค้า" มีอยู่เฉพาะในระบบสมาชิก — แกนกลางไม่รู้จัก
   *    token `cs_…` ไม่รู้ว่า op ไหนเป็นเลนของลูกค้า และไม่รู้ข้อความไทยที่ต้องตอบ
   *    (โมดูลบัญชี/บอร์ดงานไม่ประกาศฟิลด์นี้ ⇒ ทางเดินเดิมไม่เปลี่ยนแม้แต่บรรทัดเดียว)
   */
  altAuth?: (req: Request, op: ApiOp, requestId: string) => Promise<RequireResult | null>;
  messages: ApiModuleMessages;
};

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
  /**
   * เพดานของถังที่ op นี้ใช้ → หัว `X-RateLimit-Limit` (M1.11)
   * มีคู่กับ `Remaining` เสมอ: ผู้เรียกที่เห็นแต่ "เหลือ 57" ไม่รู้ว่าควรชะลอแค่ไหน
   * ถ้าไม่รู้ว่าเพดานคือ 60 หรือ 600 — และเพดานต่างกันตามชนิดงาน (read/write/report) ต่อโมดูล
   */
  rateLimit: number;
};
export type RequireResult = RequireOk | { ok: false; response: Response };

const HEADER_SYSTEM = "x-shark-system";

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  return m?.[1]?.trim() || null;
}

export async function requireApi(
  req: Request,
  op: ApiOp,
  cfg: ApiModuleConfig,
  requestId: string = newRequestId(),
): Promise<RequireResult> {
  const M = cfg.messages;
  // ── 0. เลนอื่นของโมดูล (session ลูกค้า) — ตอบ null = ไม่ใช่ทางนี้ เดินด่านคีย์ต่อ ──────────
  if (cfg.altAuth) {
    const alt = await cfg.altAuth(req, op, requestId);
    if (alt) return alt;
  }
  // ── 1. ตัวตน ──────────────────────────────────────────────────────────────
  const raw = bearer(req);
  const verdict = raw ? await verifyApiKeyDetailed(raw) : ({ status: "invalid" } as const);
  if (verdict.status === "expired") {
    return {
      ok: false,
      response: fail(
        401,
        "key_expired",
        M.keyExpiredTh,
        M.keyExpiredEn,
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

  // ── 2. ระบบที่จะทำงานด้วย ──────────────────────────────────────────────────
  // คีย์ที่ผูกระบบไว้แล้ว = ผูกตายตัว · ส่งหัวมาต่างจากที่ผูก = ปฏิเสธ (ไม่ใช่ "ยึดของคีย์เงียบ ๆ"
  // เพราะผู้เรียกที่เข้าใจผิดว่ากำลังเขียนเข้าเล่ม B จะเขียนลงเล่ม A โดยไม่รู้ตัว)
  const headerSystem = req.headers.get(HEADER_SYSTEM)?.trim() || null;
  const mismatch = () => ({
    ok: false as const,
    response: fail(
      403,
      "system_mismatch",
      M.systemMismatchTh,
      M.systemMismatchEn,
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
          M.systemRequiredTh,
          M.systemRequiredEn,
          requestId,
        ),
      };
    }
    systemId = headerSystem;
  }
  // ต้องเป็นระบบของ **ร้านนี้** และเป็นชนิดที่โมดูลกำหนด (tenantDb กรอง tenantId ให้เอง — ข้ามร้านไม่เจอ)
  const system = await tenantDb({ tenantId: key.tenantId }).appSystem.findFirst({
    where: { id: systemId, type: cfg.systemType },
    select: { id: true },
  });
  if (!system) return mismatch();

  // ── 3. เพดานอัตรา (ต่อคีย์ · แยกถังตามชนิดงาน) ─────────────────────────────
  const kind = rateKindOf(op);
  const spec = (cfg.rateLimits ?? API_RATE_LIMITS)[kind];
  const rl = await checkRateLimitDb(`${cfg.rateNs}:api:${kind}:${key.keyId}`, spec);
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
  const actor: ApiActor = cfg.makeActor({
    tenantId: key.tenantId,
    systemId: system.id,
    keyId: key.keyId,
    keyName: key.name,
    scopes: key.scopes,
    createdById: key.createdById ?? null,
  });
  if (!actorCan(actor, op.action)) {
    return {
      ok: false,
      response: fail(
        403,
        "scope_missing",
        M.scopeMissingTh,
        M.scopeMissingEn,
        requestId,
        { hint: `ต้องการสิทธิ์ ${op.action}` },
      ),
    };
  }

  return { ok: true, actor, requestId, rateRemaining, rateLimit: spec.limit };
}
