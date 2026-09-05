// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST บัญชี (WO A3)
//
// route file ทำแค่ "แปลง params แล้วเรียกที่นี่" — ตรรกะทั้งหมดอยู่ตรงนี้ที่เดียว
// ⇒ เพิ่ม endpoint ใหม่ = เพิ่ม op ในทะเบียน ไม่มีการ copy โครง route ไปวางซ้ำ
//    (ถ้าปล่อยให้แต่ละ route ตรวจเอง วันหนึ่งจะมี route ที่ลืมเขียน audit หรือลืมกันซ้ำ)
//
// ลำดับ: จับคู่ path → ด่านหน้า (คีย์/สมุด/เพดาน/สิทธิ์) → แปลง input → กันซ้ำ → handler → audit → ตอบ

import { writeAudit } from "../access";
import { withIdempotency, type RunResult } from "./idempotency";
import type { ApiMethod, ApiOp } from "./op";
import { allowedMethods, matchOp } from "./registry";
import { fail, failBody, mapError, newRequestId, ok, okBody, unwrapEnvelope, type ApiErrorDetail } from "./respond";
import { requireAccountApi } from "./require";

/** เหตุผลขั้นต่ำของคำสั่งอันตราย — สั้นกว่านี้ไม่มีความหมายตอนย้อนอ่าน audit */
const MIN_REASON = 5;

type ZodIssueLike = { path: readonly PropertyKey[]; message: string };

function detailsOf(issues: readonly ZodIssueLike[]): ApiErrorDetail[] {
  return issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function dispatch(
  method: ApiMethod,
  req: Request,
  params: { path?: string[] },
): Promise<Response> {
  const requestId = newRequestId();
  try {
    // ── จับคู่ path ────────────────────────────────────────────────────────
    const segments = params.path ?? [];
    const matched = matchOp(method, segments);
    if (!matched) {
      const allow = allowedMethods(segments);
      if (allow.length > 0) {
        return fail(
          405,
          "method_not_allowed",
          `ปลายทางนี้ไม่รองรับ ${method} — ใช้ได้: ${allow.join(", ")}`,
          `${method} is not supported on this path. Allowed: ${allow.join(", ")}`,
          requestId,
          { headers: { Allow: allow.join(", ") } },
        );
      }
      return fail(
        404,
        "not_found",
        "ไม่พบปลายทางนี้ใน API บัญชี",
        "No API operation matches this path.",
        requestId,
      );
    }
    const op: ApiOp = matched.op;

    // ── ด่านหน้า ──────────────────────────────────────────────────────────
    const auth = await requireAccountApi(req, op, requestId);
    if (!auth.ok) return auth.response;
    const { actor, rateRemaining } = auth;
    const okHeaders = { "X-RateLimit-Remaining": String(rateRemaining) };

    // ── input ────────────────────────────────────────────────────────────
    // GET อ่านจาก query string · method อื่นอ่านจาก body (ต้องอ่านเป็น text ก่อน เพราะ
    // idempotency ต้อง hash เนื้อ body เดิม และ Request อ่านซ้ำไม่ได้)
    let payload: unknown;
    let bodyText = "";
    let dangerReason: string | undefined;
    if (method === "GET") {
      payload = Object.fromEntries(new URL(req.url).searchParams);
    } else {
      bodyText = await req.text();
      if (bodyText.trim() === "") {
        payload = {};
      } else {
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return fail(
            400,
            "invalid_json",
            "เนื้อคำขอไม่ใช่ JSON ที่ถูกต้อง",
            "Request body is not valid JSON.",
            requestId,
            { headers: okHeaders },
          );
        }
      }
    }

    // ── คำสั่งอันตราย: ต้องตั้งใจ (confirm) + บอกเหตุผล ก่อนถึง schema ──────────
    if (op.kind === "danger") {
      const body = isPlainObject(payload) ? payload : {};
      if (body.confirm !== true) {
        return fail(
          409,
          "confirm_required",
          "คำสั่งนี้ย้อนกลับยาก — ต้องส่ง confirm: true (ค่าตรรกะ ไม่ใช่ข้อความ) มาด้วย",
          "This operation is irreversible. Send confirm: true (boolean) to proceed.",
          requestId,
          { headers: okHeaders },
        );
      }
      const reason = body.reason;
      if (typeof reason !== "string" || reason.trim().length < MIN_REASON) {
        return fail(
          422,
          "validation",
          `ต้องระบุเหตุผล (reason) อย่างน้อย ${MIN_REASON} ตัวอักษร`,
          `A reason of at least ${MIN_REASON} characters is required.`,
          requestId,
          {
            headers: okHeaders,
            details: [{ path: "reason", message: `ต้องมีอย่างน้อย ${MIN_REASON} ตัวอักษร` }],
          },
        );
      }
      dangerReason = reason;
      // ถอด confirm ออกก่อนเข้า schema — schema ของ op พูดเรื่องข้อมูลธุรกิจอย่างเดียว
      const { confirm: _confirm, ...rest } = body;
      payload = rest;
    }

    let input: unknown;
    if (op.input) {
      const parsed = op.input.safeParse(payload);
      if (!parsed.success) {
        return fail(
          422,
          "validation",
          "ข้อมูลที่ส่งมาไม่ถูกต้องตามรูปแบบที่กำหนด",
          "Request payload failed validation.",
          requestId,
          { headers: okHeaders, details: detailsOf(parsed.error.issues) },
        );
      }
      input = parsed.data;
    }

    const ctx = { actor, params: matched.params, input, requestId };

    // ── อ่านอย่างเดียว: ไม่กันซ้ำ ไม่เขียน audit (อ่านไม่เปลี่ยนอะไร) ─────────────
    if (op.kind === "read") {
      // handler คืน `paged(...)` ได้ (รายการที่แบ่งหน้า) — แกะเป็น { data, page, ...extra } ที่นี่ที่เดียว
      const env = unwrapEnvelope(await op.handler(ctx));
      return ok(env.data, requestId, { page: env.page, extra: env.extra, headers: okHeaders });
    }

    // ── เขียน/อันตราย: กันซ้ำ → handler → audit ─────────────────────────────
    const run = async (): Promise<RunResult> => {
      const env = unwrapEnvelope(await op.handler(ctx));
      // audit เขียนหลังงานสำเร็จเท่านั้น · การตอบซ้ำไม่ผ่านทางนี้ ⇒ ไม่มี audit ซ้ำ
      await writeAudit({
        tenantId: actor.tenantId,
        actorType: "API_KEY",
        actorId: actor.keyId,
        action: op.action,
        targetType: "ApiOp",
        targetId: op.id,
        after: {
          keyName: actor.keyName,
          opId: op.id,
          requestId,
          ...(dangerReason ? { reason: dangerReason } : {}),
        },
      });
      return { status: 200, body: okBody(env.data, requestId, { page: env.page, extra: env.extra }) };
    };
    return await withIdempotency(actor, req, op, bodyText, requestId, okHeaders, run);
  } catch (e) {
    const m = mapError(e);
    return new Response(JSON.stringify(failBody(m.code, m.message_th, m.message_en, requestId)), {
      status: m.status,
      headers: { "content-type": "application/json; charset=utf-8", "X-Request-Id": requestId },
    });
  }
}
