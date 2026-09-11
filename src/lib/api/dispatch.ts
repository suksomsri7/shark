// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST (ยกเป็นของกลางตอน K1.15)
//
// route file ทำแค่ "แปลง params แล้วเรียกที่นี่" — ตรรกะทั้งหมดอยู่ตรงนี้ที่เดียว
// ⇒ เพิ่ม endpoint ใหม่ = เพิ่ม op ในทะเบียน ไม่มีการ copy โครง route ไปวางซ้ำ
//    (ถ้าปล่อยให้แต่ละ route ตรวจเอง วันหนึ่งจะมี route ที่ลืมเขียน audit หรือลืมกันซ้ำ)
//
// ลำดับ: จับคู่ path → ด่านหน้า (คีย์/สมุด/เพดาน/สิทธิ์) → แปลง input → กันซ้ำ → handler → audit → ตอบ

import { withIdempotency, type RunResult } from "./idempotency";
import { API_METHODS, type ApiMethod, type ApiOp } from "./op";
import { csvResponse, fail, failBody, mapError, newRequestId, ok, okBody, unwrapEnvelope, wantsCsv } from "./respond";
import { requireApi, type ApiModuleConfig } from "./require";
import { runOpAsActor, validateOpInput } from "./run";

// ── การจับคู่ path (ทะเบียนไหนก็ใช้ตัวนี้) ─────────────────────────────────
type Template = { segments: string[]; paramCount: number };

const templateCache = new Map<string, Template>();

function templateOf(path: string): Template {
  const cached = templateCache.get(path);
  if (cached) return cached;
  const segments = path.split("/").filter(Boolean);
  const t = { segments, paramCount: segments.filter((s) => s.startsWith("{")).length };
  templateCache.set(path, t);
  return t;
}

/** ตัด segment ว่างทิ้ง ⇒ `/ping/` (trailing slash) จับคู่ `/ping` ได้ */
function normalize(segments: string[]): string[] {
  return segments.filter((s) => s.length > 0);
}

function matchSegments(tpl: string[], segs: string[]): Record<string, string> | null {
  if (tpl.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < tpl.length; i++) {
    const t = tpl[i]!;
    const v = segs[i]!;
    if (t.startsWith("{") && t.endsWith("}")) {
      params[t.slice(1, -1)] = decodeURIComponent(v);
      continue;
    }
    if (t !== v) return null;
  }
  return params;
}

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOpIn(
  ops: readonly ApiOp[],
  method: string,
  segments: string[],
): { op: ApiOp; params: Record<string, string> } | null {
  const segs = normalize(segments);
  let best: { op: ApiOp; params: Record<string, string>; paramCount: number } | null = null;
  for (const op of ops) {
    if (op.method !== method) continue;
    const tpl = templateOf(op.path);
    const params = matchSegments(tpl.segments, segs);
    if (!params) continue;
    if (!best || tpl.paramCount < best.paramCount) best = { op, params, paramCount: tpl.paramCount };
  }
  return best ? { op: best.op, params: best.params } : null;
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethodsIn(ops: readonly ApiOp[], segments: string[]): string[] {
  const segs = normalize(segments);
  const found = new Set<string>();
  for (const op of ops) {
    if (matchSegments(templateOf(op.path).segments, segs)) found.add(op.method);
  }
  return API_METHODS.filter((m) => found.has(m));
}

/** เหตุผลขั้นต่ำของคำสั่งอันตราย — สั้นกว่านี้ไม่มีความหมายตอนย้อนอ่าน audit */
const MIN_REASON = 5;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function dispatch(
  ops: readonly ApiOp[],
  method: ApiMethod,
  req: Request,
  params: { path?: string[] },
  cfg: ApiModuleConfig,
): Promise<Response> {
  const requestId = newRequestId();
  try {
    // ── จับคู่ path ────────────────────────────────────────────────────────
    const segments = params.path ?? [];
    const matched = matchOpIn(ops, method, segments);
    if (!matched) {
      const allow = allowedMethodsIn(ops, segments);
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
      return fail(404, "not_found", cfg.messages.notFoundTh, cfg.messages.notFoundEn, requestId);
    }
    const op: ApiOp = matched.op;

    // ── ด่านหน้า ──────────────────────────────────────────────────────────
    const auth = await requireApi(req, op, cfg, requestId);
    if (!auth.ok) return auth.response;
    const { actor, rateRemaining, rateLimit } = auth;
    // เพดาน + ที่เหลือ มาคู่กันเสมอ: ผู้เรียกจะได้ชะลอเองก่อนชน 429 (เพดานต่างกันตามโมดูล/ชนิดงาน)
    const okHeaders = {
      "X-RateLimit-Limit": String(rateLimit),
      "X-RateLimit-Remaining": String(rateRemaining),
    };

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

    // ตรวจ input ด้วยประตูเดียวกับสกิล AI (run.ts) — schema เดียว กติกาเดียว
    const parsed = validateOpInput(op, payload);
    if (!parsed.ok) {
      return fail(
        422,
        "validation",
        "ข้อมูลที่ส่งมาไม่ถูกต้องตามรูปแบบที่กำหนด",
        "Request payload failed validation.",
        requestId,
        { headers: okHeaders, details: parsed.details },
      );
    }
    const input = parsed.input;

    const ctx = {
      actor,
      params: matched.params,
      input,
      requestId,
      // ส่งต่อให้ handler ใช้เป็นคีย์กันซ้ำของชั้นบริการ (WO C2) — read ไม่มี header นี้อยู่แล้ว
      idempotencyKey: req.headers.get("idempotency-key")?.trim() || null,
    };

    // ── อ่านอย่างเดียว: ไม่กันซ้ำ ไม่เขียน audit (อ่านไม่เปลี่ยนอะไร) ─────────────
    if (op.kind === "read") {
      // handler คืน `paged(...)` ได้ (รายการที่แบ่งหน้า) — แกะเป็น { data, page, ...extra } ที่นี่ที่เดียว
      const env = unwrapEnvelope(await op.handler(ctx));
      // WO B3: op ที่ประกาศ `csv` + ผู้เรียกขอ `Accept: text/csv` → ตอบไฟล์ CSV แทน JSON
      // (เฉพาะ data ที่ handler คืน — ไม่ใช่ทั้งซอง page/extra ซึ่งไม่มีความหมายในไฟล์แบน)
      // M3.10: op ที่ประกาศ `csvAlways` ตอบ CSV เสมอ (path ของมันคือไฟล์ — ลิงก์ดาวน์โหลดตั้งหัว Accept ไม่ได้)
      if (op.csv && (op.csvAlways === true || wantsCsv(req))) {
        const body = await op.csv(ctx, env.data);
        return csvResponse(body, `${op.id}.csv`, requestId);
      }
      return ok(env.data, requestId, { page: env.page, extra: env.extra, headers: okHeaders });
    }

    // ── เขียน/อันตราย: กันซ้ำ → handler → audit ─────────────────────────────
    // (audit อยู่ใน runOpAsActor — เขียนหลังงานสำเร็จเท่านั้น · การตอบซ้ำไม่ผ่านทางนี้ ⇒ ไม่มี audit ซ้ำ)
    const run = async (): Promise<RunResult> => {
      const env = await runOpAsActor(op, actor, {
        input,
        params: matched.params,
        requestId,
        idempotencyKey: ctx.idempotencyKey,
        reason: dangerReason,
        audit: { keyName: actor.keyName },
      });
      return { status: 200, body: okBody(env.data, requestId, { page: env.page, extra: env.extra }) };
    };
    return await withIdempotency(actor, req, op, bodyText, requestId, okHeaders, run);
  } catch (e) {
    const m = mapError(e);
    return new Response(JSON.stringify(failBody(m.code, m.message_th, m.message_en, requestId, { hint: m.hint, details: m.details })), {
      status: m.status,
      headers: { "content-type": "application/json; charset=utf-8", "X-Request-Id": requestId },
    });
  }
}
