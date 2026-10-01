// idempotency.ts — กันคำสั่งซ้ำของ REST ทุกโมดูล (ยกเป็นของกลางตอน K1.15)
//
// ปัญหาจริง: ผู้เชื่อมต่อ retry เมื่อเน็ตหลุด/timeout ⇒ "ออกใบกำกับ" ใบเดียวกันถูกยิงสองครั้ง
// ⇒ ลูกค้าได้ใบซ้ำ เลขที่เอกสารเดิน 2 เลข ยอดลูกหนี้บวม — แก้ย้อนหลังแพงมาก
//
// วิธี: ทุก write/danger ต้องส่ง `Idempotency-Key` มา แล้วเรา **จองแถวก่อนลงมือ**
//   INSERT (keyId, idemKey) — ชน unique = มีคนจองไปแล้ว
//   ⇒ การจองจบใน SQL คำสั่งเดียว ไม่มีช่วง read-then-write ให้สองคำขอที่มาพร้อมกันแทรก
//      (บทเรียนเดียวกับ rate-limit-db.ts: แตกเป็นหลายคำสั่ง = นับ/จองพลาดจริงตอนยิงพร้อมกัน)
//   จองได้  → ทำงาน แล้วอัปเดต status + responseJson กลับเข้าแถวเดิม (C5.4: 409/429/503 = ลบการจองทิ้ง · ที่เหลือเก็บ ·
//             C5.5 r2: 409/429/503 ที่ "โยน" มาปล่อยเฉพาะที่ติดธง nothingWritten · การจองค้าง > 6 นาที = "ไม่รู้ผล" ไม่รันซ้ำ ·
//             C5.5-fix1: ฐาน/เครือข่ายสะดุดหลังงานเริ่ม = "ไม่รู้ผล" เก็บเป็น 409 idempotency_outcome_unknown — ไม่รันซ้ำ)
//   จองไม่ได้ → hash ต่าง = 409 conflict · status ยังว่าง = 409 in_progress (C5.5 RV-1: ค้างเกิน 6 นาที = CAS เป็น 409 outcome_unknown · ไม่รันซ้ำ) ·
//               มีผลแล้ว = ตอบซ้ำของเดิม
//
// TTL 24 ชม.: แถวที่หมดอายุถือว่า "ไม่มี" (ลบทิ้งแล้วจองใหม่) — ไม่งั้นตารางโตไม่มีที่สิ้นสุด
// และผู้เชื่อมต่อที่ใช้ค่า key ซ้ำรายวัน (เช่น `invoice-2026-09-05`) จะติดล็อกตลอดกาล

import { createHash } from "node:crypto";
import { tenantDb } from "@/lib/core/db";
import type { ApiActor } from "./actor";
import type { ApiOp } from "./op";
import { ApiError, fail, mapError, failBody, isNothingWritten, isTransientInfraError } from "./respond";

const TTL_MS = 24 * 60 * 60_000;
/**
 * C5.4 (L3-m1): การจองที่ยังไม่มีผล (status NULL) เก่ากว่านี้ = แลมบ์ดาที่จองตายไปแล้ว ⇒ (C5.5 RV-1) บันทึกเป็น "ไม่รู้ผล" ด้วย CAS — ไม่รันซ้ำ
 * 6 นาที = เกินเพดานเวลาที่ฟังก์ชันหนึ่งรันได้จริง (Vercel fluid compute ปริยาย 300 วิ) + เผื่อ — รับช่วงเร็วกว่านี้ =
 * เสี่ยงทำงานซ้ำขณะเจ้าของเดิมยังรันอยู่ ซึ่งคือสิ่งที่ตารางนี้มีไว้กันพอดี
 */
const STALE_CLAIM_MS = 6 * 60_000;

/**
 * C5.4 (L3-m1 · มติผู้คุมงานรอบ 2): ผลที่ "ชั่วคราวแน่นอน" ห้ามเก็บไว้ตอบซ้ำ 24 ชม. — 409 (ชนล็อก/ชนกันชั่วคราว) ·
 * 429 (ถูกจำกัดอัตรา) · 503 (บริการ/ฐานข้อมูลไม่พร้อม) ⇒ ลบการจองทิ้ง ให้ retry ของผู้เรียกรันจริง
 * 500 อื่น ๆ ยัง **เก็บ** เหมือนเดิม: งานอาจ commit ไปแล้วก่อนพัง (เช่นพังตอนสร้างคำตอบ) — ตอบซ้ำของเดิมปลอดภัยกว่ารันซ้ำ
 */
const isTransientStatus = (status: number) => status === 409 || status === 429 || status === 503;

export type RunResult = { status: number; body: unknown };

// CRM C5.5 ▸ H55-1 (มติผู้คุมงาน): error ชั่วคราวของฐาน/เครือข่าย (pool หมดเวลา · หลุดการเชื่อมต่อ …) **ห้ามปล่อยการจอง** เพราะงานเขียน
//   อาจ commit ไปแล้ว (เช่น สร้างดีลสำเร็จ แล้วพังตอนอ่าน DTO กลับ) — เดิม (C5.4-A) ลบการจองแล้วตอบ 503 "ยังไม่ได้บันทึก" ⇒ retry ด้วยคีย์เดิม
//   = ดีล/ผู้ติดต่อ/การชำระซ้ำ · ตอนนี้: เก็บการจองไว้ในสถานะ "ไม่รู้ผล" (status 409 + ซอง idempotency_outcome_unknown · TTL ปกติ 24 ชม.)
//   ⇒ คีย์เดิมได้คำตอบเดิมซ้ำ (Idempotent-Replayed) ไม่รัน handler อีก · ผู้เรียกตรวจว่ามีรายการแล้วหรือยัง แล้วส่งใหม่ด้วยคีย์ใหม่
//   ยกเว้นเดียว: error ที่ **พิสูจน์ได้** ว่าเกิดก่อน handler เริ่ม (โยนจากใน `ctl.beforeHandler(...)` — งานที่ไม่เขียนอะไรเลย เช่นด่านสิทธิ์)
//   ⇒ ปล่อยการจอง + 503 ลองใหม่ด้วยคีย์เดิมได้ (ข้อความจริงตามนั้น) · คำตอบ 409/429/503 ที่ handler "ประกาศเอง" (ApiError/คืนค่า) ปล่อยการจองเหมือน C5.4
/** ตัวช่วยที่ `withIdempotency` ส่งให้งาน (`run`) — ไม่เรียกเลย = ถือว่า error ทุกตัวอาจเกิดหลังงานเริ่มแล้ว (ปลอดภัยไว้ก่อน) */
export type RunControl = {
  /** ห่องานที่ "ยังไม่ใช่ handler" และไม่เขียนอะไร — error ชั่วคราวที่โยนจากในนี้ = ยังไม่ได้เริ่ม ⇒ ปล่อยการจอง */
  beforeHandler<T>(fn: () => T | Promise<T>): Promise<T>;
};

const OUTCOME_UNKNOWN_TH =
  "ระบบสะดุดชั่วคราวระหว่างทำรายการนี้ จึงยืนยันไม่ได้ว่ารายการถูกบันทึกแล้วหรือยัง — ตรวจดูก่อนว่ารายการมีอยู่แล้วหรือไม่ ถ้ายังไม่มี ให้ส่งใหม่ด้วยค่า Idempotency-Key ใหม่ (ค่าเดิมจะตอบข้อความนี้ซ้ำจนหมดอายุ)";
const OUTCOME_UNKNOWN_EN =
  "A temporary database or network failure happened while this request was running, so it is unknown whether it took effect. Check whether the record exists; if it does not, send the request again with a NEW Idempotency-Key (this key keeps returning this answer until it expires).";
const NOT_STARTED_TH = "ระบบไม่ว่างชั่วคราว ยังไม่ได้เริ่มทำรายการนี้ — ลองใหม่อีกครั้งด้วยค่า Idempotency-Key เดิมได้";
const NOT_STARTED_EN = "Temporarily unavailable; the request was not started. Retry with the same Idempotency-Key.";
// ◂ CRM C5.5

/** hash ของ "คำขอนี้" — key เดิมแต่เนื้อคำขอต่าง = ผู้เรียกใช้ค่า key ซ้ำผิด ต้องเตือน ไม่ใช่ตอบของเก่า */
function requestHashOf(method: string, path: string, bodyText: string): string {
  return createHash("sha256").update(`${method} ${path}\n${bodyText}`).digest("hex");
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

type IdemRow = {
  id: string;
  requestHash: string;
  status: number | null;
  responseJson: unknown;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * ตัดค่าลับที่ op ประกาศว่า "คืนครั้งเดียว" ออกจากคำตอบที่ถูก replay (ดู `ApiOp.replaySecrets`)
 * แทนด้วย `null` ไม่ใช่ลบคีย์ทิ้ง — ผู้เรียกที่อ่าน `data.pin` จะได้รู้ว่า "ไม่มีให้แล้ว" ไม่ใช่ "ลืมส่ง"
 */
function scrubReplaySecrets(op: ApiOp, body: unknown): unknown {
  const secrets = op.replaySecrets;
  if (!secrets || secrets.length === 0) return body;
  if (typeof body !== "object" || body === null) return body;
  const envelope = body as { data?: unknown };
  if (typeof envelope.data !== "object" || envelope.data === null || Array.isArray(envelope.data)) return body;
  const data = { ...(envelope.data as Record<string, unknown>) };
  let touched = false;
  for (const k of secrets) {
    if (k in data && data[k] !== null) {
      data[k] = null;
      touched = true;
    }
  }
  return touched ? { ...envelope, data } : body;
}

/** requestId ที่ฝังอยู่ในซองที่เก็บไว้ — ตอบซ้ำต้องใช้ค่าเดิมให้หัวกับ body ตรงกัน */
function storedRequestId(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const v = (body as { requestId?: unknown }).requestId;
    if (typeof v === "string" && v) return v;
  }
  return fallback;
}

/**
 * ห่อการทำงานของ write/danger ด้วยการกันซ้ำ
 * @param bodyText body ดิบที่อ่านมาแล้ว (อ่านซ้ำจาก Request ไม่ได้ — dispatch อ่านให้ครั้งเดียว)
 * @param run      งานจริง (handler + audit) — คืน status/body ที่จะทั้งตอบและเก็บ
 */
export async function withIdempotency(
  actor: ApiActor,
  req: Request,
  op: ApiOp,
  bodyText: string,
  requestId: string,
  extraHeaders: Record<string, string>,
  run: (ctl: RunControl) => Promise<RunResult>,
): Promise<Response> {
  // CRM C5.5 ▸ H55-1: error ที่โยนจากใน beforeHandler (งานก่อน handler — ไม่เขียนอะไร) ◂
  const beforeHandlerErrors = new WeakSet<object>();
  const ctl: RunControl = {
    async beforeHandler(fn) {
      try {
        return await fn();
      } catch (e) {
        if (typeof e === "object" && e !== null) beforeHandlerErrors.add(e);
        throw e;
      }
    },
  };
  const idemKey = req.headers.get("idempotency-key")?.trim();
  // M3.10 — op ที่ประกาศ `idempotency: "optional"` (เลนสาธารณะ) ไม่ส่ง header = ทำงานเลย ไม่จอง/ไม่เก็บผล
  // (ชั้นบริการของ op พวกนี้กันซ้ำเองอยู่แล้ว — ดูเหตุผลที่ `op.ts`) · ส่ง header มา = กันซ้ำตามปกติ
  if (!idemKey && op.idempotency === "optional") {
    let result: RunResult;
    try {
      result = await run(ctl);
    } catch (e) {
      const m = mapError(e);
      result = { status: m.status, body: failBody(m.code, m.message_th, m.message_en, requestId, { hint: m.hint }) };
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json; charset=utf-8", "X-Request-Id": requestId, ...extraHeaders },
    });
  }
  if (!idemKey) {
    return fail(
      400,
      "idempotency_required",
      "คำสั่งที่เปลี่ยนข้อมูลต้องส่งส่วนหัว Idempotency-Key (ค่าที่ไม่ซ้ำต่อ 1 คำสั่ง) เพื่อกันรายการซ้ำ",
      "Write operations require an Idempotency-Key header with a value unique per logical request.",
      requestId,
      { headers: extraHeaders },
    );
  }

  // กันซ้ำผูกกับ "คีย์ API" (unique = keyId + idemKey) ⇒ ทางนี้มีได้เฉพาะคำขอ REST
  // (ผู้ช่วย AI ไม่ผ่านที่นี่ — ข้อเสนอกันทำซ้ำด้วยสถานะ PENDING→EXECUTED ของตัวเอง)
  const keyId = actor.keyId;
  if (!keyId) throw new Error("withIdempotency ใช้ได้เฉพาะคำขอที่มาจากคีย์ API");

  const db = tenantDb({ tenantId: actor.tenantId });
  const path = new URL(req.url).pathname;
  // op ที่ประกาศ `idempotency: "key"` ให้ **คีย์อย่างเดียว** เป็นตัวระบุความพยายาม (ดูเหตุผลที่ `op.ts`)
  // ⇒ ไม่เอาเนื้อคำขอมาผสมใน hash ⇒ ยิงซ้ำด้วยคีย์เดิมได้คำตอบเดิมเสมอ ไม่ใช่ 409
  const hash = requestHashOf(op.method, path, op.idempotency === "key" ? "" : bodyText);
  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "X-Request-Id": storedRequestId(body, requestId),
        ...extraHeaders,
        ...headers,
      },
    });

  // ── จองแถว (INSERT อย่างเดียว — ชน unique = มีเจ้าของแล้ว) ─────────────────
  // C5.4 (L3-m1): จำ (id, createdAt) ของการจองที่เป็นของเรา — ขาเขียนผล/ลบทิ้งด้านล่างแตะได้เฉพาะ "การจองครั้งนี้"
  //   (ถ้าเราช้าจนมีคนรับช่วงไปแล้ว createdAt จะไม่ตรง ⇒ ผลของเราไม่ทับของเขา)
  let owned: { id: string; createdAt: Date } | null = null;
  const claim = async (): Promise<boolean> => {
    try {
      // tenantDb ยัด tenantId ให้เอง · unique คือ (keyId, idemKey) ⇒ ชนคีย์ต่างร้านไม่ได้อยู่แล้ว
      const created = await db.apiIdempotency.create({
        data: {
          tenantId: actor.tenantId,
          keyId,
          idemKey,
          requestHash: hash,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
        select: { id: true, createdAt: true },
      });
      owned = created;
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  };
  /**
   * C5.4 (L3-m1) → CRM C5.5 ▸ RV-1 (มติผู้คุมงาน r2): การจองที่ค้าง (status NULL เก่ากว่า STALE_CLAIM_MS) = เจ้าของตายกลางงาน
   *   (แลมบ์ดาหมดเวลา/ถูกฆ่า หรือเขียนผลไม่สำเร็จ) **หลังจากงานอาจ commit ไปแล้ว** ⇒ ห้ามรัน handler ซ้ำ (เดิม C5.4 รับช่วงแล้วรันใหม่ = รายการซ้ำ)
   *   ⇒ CAS แถวเป็น "ไม่รู้ผล" (409 idempotency_outcome_unknown · TTL ปกติ 24 ชม. นับจากนี้) แล้วตอบแบบนั้น · แพ้ CAS = อ่านใหม่แล้วตอบตามแถว
   *   หน้าต่าง 6 นาที vs งานจริงที่นานที่สุดที่รู้ (ชำระเงินแบบกลุ่ม ≤ ~40 วิ · เพดานฟังก์ชัน Vercel ปริยาย 300 วิ) ⇒ คำขอที่ยังรันอยู่จริงไม่ถูกแทรก
   */
  const markStaleUnknown = async (row: IdemRow): Promise<Response> => {
    const now = new Date();
    const body = failBody("idempotency_outcome_unknown", OUTCOME_UNKNOWN_TH, OUTCOME_UNKNOWN_EN, requestId);
    const res = await db.apiIdempotency.updateMany({
      where: { id: row.id, status: null, createdAt: row.createdAt },
      data: { status: 409, responseJson: body as never, expiresAt: new Date(now.getTime() + TTL_MS) },
    });
    if (res.count === 1) return respond(409, body);
    const fresh = (await db.apiIdempotency.findFirst({ where: { id: row.id }, select: { status: true, responseJson: true } })) as Pick<IdemRow, "status" | "responseJson"> | null;
    if (fresh && fresh.status !== null) return respond(fresh.status, scrubReplaySecrets(op, fresh.responseJson), { "Idempotent-Replayed": "true" });
    return fail(
      409,
      "idempotency_in_progress",
      "คำสั่งเดียวกันนี้กำลังทำงานอยู่ — กรุณารอสักครู่แล้วเรียกซ้ำด้วยค่าเดิม",
      "An identical request is still in progress. Retry with the same key in a moment.",
      requestId,
      { headers: extraHeaders },
    );
  };
  // ◂ CRM C5.5

  let mine = await claim();
  if (!mine) {
    const row = (await db.apiIdempotency.findFirst({
      where: { keyId, idemKey },
      select: { id: true, requestHash: true, status: true, responseJson: true, expiresAt: true, createdAt: true },
    })) as IdemRow | null;

    if (!row) {
      // แถวหายไประหว่างทาง (ถูกกวาดทิ้งพอดี) → จองใหม่ครั้งเดียว
      mine = await claim();
    } else if (row.expiresAt.getTime() <= Date.now()) {
      // หมดอายุ = ถือว่าไม่เคยมี → ลบทิ้งแล้วจองใหม่
      await db.apiIdempotency.deleteMany({ where: { id: row.id } });
      mine = await claim();
    } else if (row.requestHash !== hash) {
      return fail(
        409,
        "idempotency_conflict",
        "ค่า Idempotency-Key นี้เคยใช้กับคำสั่งที่มีเนื้อหาต่างจากครั้งนี้ — กรุณาใช้ค่าใหม่",
        "This Idempotency-Key was already used with a different request body.",
        requestId,
        { headers: extraHeaders },
      );
    } else if (row.status === null && Date.now() - row.createdAt.getTime() > STALE_CLAIM_MS) {
      // เจ้าของการจองตาย (แลมบ์ดาหมดเวลา/ถูกฆ่า) ก่อนเขียนผล — CRM C5.5 ▸ RV-1: ไม่รันซ้ำ · บันทึกเป็น "ไม่รู้ผล" แล้วตอบ ◂
      return markStaleUnknown(row);
    } else if (row.status === null) {
      return fail(
        409,
        "idempotency_in_progress",
        "คำสั่งเดียวกันนี้กำลังทำงานอยู่ — กรุณารอสักครู่แล้วเรียกซ้ำด้วยค่าเดิม",
        "An identical request is still in progress. Retry with the same key in a moment.",
        requestId,
        { headers: extraHeaders },
      );
    } else {
      // ตอบซ้ำของเดิม (status + body · ยกเว้นค่าลับที่คืนครั้งเดียว) — แยกออกด้วยหัว Idempotent-Replayed
      return respond(row.status, scrubReplaySecrets(op, row.responseJson), { "Idempotent-Replayed": "true" });
    }
  }

  if (!mine) {
    // แข่งจองแล้วแพ้รอบสอง — บอกให้ลองใหม่ ดีกว่าทำงานซ้ำ
    return fail(
      409,
      "idempotency_in_progress",
      "คำสั่งเดียวกันนี้กำลังทำงานอยู่ — กรุณารอสักครู่แล้วเรียกซ้ำด้วยค่าเดิม",
      "An identical request is still in progress. Retry with the same key in a moment.",
      requestId,
      { headers: extraHeaders },
    );
  }

  let result: RunResult;
  // CRM C5.5 ▸ H55-1: "ไม่รู้ผล" = error ชั่วคราวของฐาน/เครือข่ายที่ไม่ได้มาจาก beforeHandler และไม่ใช่ ApiError ที่ handler ประกาศเอง ◂
  let outcomeUnknown = false;
  // CRM C5.5 ▸ RV-2: คำตอบชั่วคราว (409/429/503) ปล่อยการจองได้เมื่อ (ก) งาน "คืน" คำตอบนั้นเอง (ผู้เรียก run ประกาศผลเอง — dispatch
  //   คืนแต่ 200) หรือ (ข) error ที่โยนมาถูกติดธง nothingWritten / มาจาก beforeHandler · error ที่โยนมาโดยไม่มีธง = เก็บ + ตอบซ้ำ ◂
  let releasable = true;
  try {
    result = await run(ctl);
  } catch (e) {
    const transient = !(e instanceof ApiError) && isTransientInfraError(e);
    const notStarted = typeof e === "object" && e !== null && beforeHandlerErrors.has(e);
    releasable = notStarted || isNothingWritten(e);
    if (transient && notStarted) {
      result = { status: 503, body: failBody("upstream_unavailable", NOT_STARTED_TH, NOT_STARTED_EN, requestId) };
    } else if (transient) {
      outcomeUnknown = true;
      result = { status: 409, body: failBody("idempotency_outcome_unknown", OUTCOME_UNKNOWN_TH, OUTCOME_UNKNOWN_EN, requestId) };
    } else {
      const m = mapError(e);
      result = { status: m.status, body: failBody(m.code, m.message_th, m.message_en, requestId, { hint: m.hint }) };
    }
  }
  const mineNow = owned as { id: string; createdAt: Date } | null;
  const ownWhere = mineNow ? { id: mineNow.id, status: null, createdAt: mineNow.createdAt } : { keyId, idemKey, status: null };
  // C5.4 (L3-m1): ผลชั่วคราว (409 · 429 · 503) ไม่เก็บ — ลบการจองของเราทิ้ง ⇒ retry ด้วยคีย์เดิมรันจริงอีกครั้ง
  if (isTransientStatus(result.status) && !outcomeUnknown && releasable) {
    await db.apiIdempotency.deleteMany({ where: ownWhere });
    return respond(result.status, result.body);
  }
  // เก็บผลไว้ตอบซ้ำ — เก็บทั้งสำเร็จและล้มเหลว (รวม 500) (retry ของคำสั่งที่ล้มเหลวต้องได้คำตอบเดิม ไม่ใช่ลองใหม่เงียบ ๆ)
  // CRM C3.8 รีวิว S1 ▸ ค่าลับที่คืนครั้งเดียว (`replaySecrets` — PIN บัตรกำนัล · token เชิญพอร์ทัล · ตั๋วสมัคร · คีย์ API ใหม่)
  //   ต้องไม่ถูกเก็บลง `ApiIdempotency.responseJson` เลย (เดิมตัดตอน replay อย่างเดียว ⇒ ค่าดิบค้างในตาราง 24 ชม.)
  //   ⇒ เก็บฉบับที่ตัดแล้ว · คำตอบครั้งแรกยังได้ค่าจริงตามเดิม · replay ได้ null เหมือนเดิม ◂
  await db.apiIdempotency.updateMany({
    where: ownWhere,
    data: { status: result.status, responseJson: scrubReplaySecrets(op, result.body) as never },
  });
  return respond(result.status, result.body);
}
