// idempotency.ts — กันคำสั่งซ้ำของ REST บัญชี (WO A3)
//
// ปัญหาจริง: ผู้เชื่อมต่อ retry เมื่อเน็ตหลุด/timeout ⇒ "ออกใบกำกับ" ใบเดียวกันถูกยิงสองครั้ง
// ⇒ ลูกค้าได้ใบซ้ำ เลขที่เอกสารเดิน 2 เลข ยอดลูกหนี้บวม — แก้ย้อนหลังแพงมาก
//
// วิธี: ทุก write/danger ต้องส่ง `Idempotency-Key` มา แล้วเรา **จองแถวก่อนลงมือ**
//   INSERT (keyId, idemKey) — ชน unique = มีคนจองไปแล้ว
//   ⇒ การจองจบใน SQL คำสั่งเดียว ไม่มีช่วง read-then-write ให้สองคำขอที่มาพร้อมกันแทรก
//      (บทเรียนเดียวกับ rate-limit-db.ts: แตกเป็นหลายคำสั่ง = นับ/จองพลาดจริงตอนยิงพร้อมกัน)
//   จองได้  → ทำงาน แล้วอัปเดต status + responseJson กลับเข้าแถวเดิม (เก็บทั้งกรณีสำเร็จและล้มเหลว)
//   จองไม่ได้ → hash ต่าง = 409 conflict · status ยังว่าง = 409 in_progress · มีผลแล้ว = ตอบซ้ำของเดิม
//
// TTL 24 ชม.: แถวที่หมดอายุถือว่า "ไม่มี" (ลบทิ้งแล้วจองใหม่) — ไม่งั้นตารางโตไม่มีที่สิ้นสุด
// และผู้เชื่อมต่อที่ใช้ค่า key ซ้ำรายวัน (เช่น `invoice-2026-09-05`) จะติดล็อกตลอดกาล

import { createHash } from "node:crypto";
import { tenantDb } from "@/lib/core/db";
import type { ApiActor } from "./actor";
import type { ApiOp } from "./op";
import { fail, mapError, failBody } from "./respond";

const TTL_MS = 24 * 60 * 60_000;

export type RunResult = { status: number; body: unknown };

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
};

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
  run: () => Promise<RunResult>,
): Promise<Response> {
  const idemKey = req.headers.get("idempotency-key")?.trim();
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
  const hash = requestHashOf(op.method, path, bodyText);
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
  const claim = async (): Promise<boolean> => {
    try {
      // tenantDb ยัด tenantId ให้เอง · unique คือ (keyId, idemKey) ⇒ ชนคีย์ต่างร้านไม่ได้อยู่แล้ว
      await db.apiIdempotency.create({
        data: {
          tenantId: actor.tenantId,
          keyId,
          idemKey,
          requestHash: hash,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  };

  let mine = await claim();
  if (!mine) {
    const row = (await db.apiIdempotency.findFirst({
      where: { keyId, idemKey },
      select: { id: true, requestHash: true, status: true, responseJson: true, expiresAt: true },
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
      // ตอบซ้ำของเดิมทั้งดุ้น (status + body) — ผู้เรียกแยกออกด้วยหัว Idempotent-Replayed
      return respond(row.status, row.responseJson, { "Idempotent-Replayed": "true" });
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
  try {
    result = await run();
  } catch (e) {
    const m = mapError(e);
    result = { status: m.status, body: failBody(m.code, m.message_th, m.message_en, requestId, { hint: m.hint }) };
  }
  // เก็บผลไว้ตอบซ้ำ — เก็บทั้งสำเร็จและล้มเหลว (retry ของคำสั่งที่ล้มเหลวต้องได้คำตอบเดิม ไม่ใช่ลองใหม่เงียบ ๆ)
  await db.apiIdempotency.updateMany({
    where: { keyId, idemKey },
    data: { status: result.status, responseJson: result.body as never },
  });
  return respond(result.status, result.body);
}
