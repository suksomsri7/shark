// run.ts — "รัน op หนึ่งตัวในนามของ actor" (WO E1)
//
// ทำไมต้องแยกออกมาจาก `dispatch.ts`: ตั้งแต่ WO E1 มีผู้เรียก 2 ทางที่ต้องเดินด่านเดียวกันเป๊ะ
//   1) REST  `/api/v1/account/*`      → dispatch.ts (HTTP: header/สถานะ/ซอง/กันซ้ำ)
//   2) สกิล AI `account_*`             → src/lib/ai/tools-account.ts (อ่านทันที) + proposals.ts (เขียนหลังคนยืนยัน)
// ถ้าปล่อยให้ฝั่ง AI เรียก `op.handler` เอง วันหนึ่งจะมีทางที่ "ลืมตรวจสิทธิ์" หรือ "ลืมเขียน audit"
// ⇒ ตรวจ input (zod ของ op) · ตรวจสิทธิ์ (actorCan) · เรียก handler · เขียน audit = อยู่ที่นี่ที่เดียว
//
// สิ่งที่ **ไม่** อยู่ที่นี่ (เพราะเป็นเรื่องของ HTTP ล้วน ๆ): เพดานอัตรา · Idempotency-Key · confirm/reason
// ของคำสั่งอันตราย · การแปลงเป็น Response — ฝั่ง AI มีด่านของตัวเอง (proposal + ยืนยัน 2 ชั้น)

import type { ZodType } from "zod";
import { writeAudit } from "../access";
import { actorAuditId, actorAuditType, actorCan, type ApiActor } from "./actor";
import type { ApiOp } from "./op";
import { ApiError, unwrapEnvelope, type ApiErrorDetail, type PagedInfo } from "./respond";

type ZodIssueLike = { path: readonly PropertyKey[]; message: string };

/** issue ของ zod → รูปแบบ `error.details` ของ API (path เป็นจุด เช่น `lines.0.qty`) */
export function detailsOfIssues(issues: readonly ZodIssueLike[]): ApiErrorDetail[] {
  return issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
}

export type OpInputResult =
  | { ok: true; input: unknown }
  | { ok: false; details: ApiErrorDetail[] };

/** ตรวจ payload กับ schema ของ op (ประตูเดียวกับ REST — op ที่ไม่มี schema = ไม่รับ input) */
export function validateOpInput(op: ApiOp, payload: unknown): OpInputResult {
  return validateWith(op.input, payload);
}

/** ตรวจกับ schema ใด ๆ (ฝั่ง AI ใช้กับสคีมาที่ย่อให้ผู้ช่วยกรอกง่ายก่อนแปลงเป็น input ของ op) */
export function validateWith(schema: ZodType | undefined, payload: unknown): OpInputResult {
  if (!schema) return { ok: true, input: undefined };
  const parsed = schema.safeParse(payload);
  if (parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, details: detailsOfIssues(parsed.error.issues) };
}

/** ข้อความไทยสั้น ๆ ของ details (ผู้ช่วย AI ต้องเอาไปบอกผู้ใช้ ไม่ใช่ซองอังกฤษของ REST) */
export function detailsMessageTh(details: ApiErrorDetail[]): string {
  const head = details.slice(0, 3).map((d) => (d.path ? `${d.path}: ${d.message}` : d.message));
  return `ข้อมูลที่ส่งมาไม่ครบหรือผิดรูปแบบ — ${head.join(" · ")}`;
}

export type RunOpArgs = {
  input: unknown;
  /** ค่าที่จับได้จาก path template ของ op เช่น `{ id }` */
  params?: Record<string, string>;
  requestId: string;
  idempotencyKey?: string | null;
  /** เหตุผลของคำสั่งอันตราย — เขียนลง audit (REST อ่านจาก body · AI อ่านจาก payload ของข้อเสนอ) */
  reason?: string;
  /** ฟิลด์เสริมใน `AuditLog.after` (REST ใส่ keyName · AI ใส่ proposalId) */
  audit?: Record<string, unknown>;
};

export type RunOpResult = { data: unknown; page?: PagedInfo; extra?: Record<string, unknown> };

/**
 * รัน op ในนามของ actor — ตรวจสิทธิ์ → handler → audit (เฉพาะ write/danger)
 * โยน `ApiError` เมื่อสิทธิ์ไม่พอ · error ของ service ปล่อยผ่านขึ้นไปให้ผู้เรียกแปลเอง (`mapError`)
 */
export async function runOpAsActor(op: ApiOp, actor: ApiActor, args: RunOpArgs): Promise<RunOpResult> {
  if (!actorCan(actor, op.action)) {
    throw new ApiError(
      403,
      "scope_missing",
      "ไม่มีสิทธิ์ทำรายการนี้ในระบบบัญชี",
      "The actor does not have the permission required for this operation.",
      `ต้องการสิทธิ์ ${op.action}`,
    );
  }
  const env = unwrapEnvelope(
    await op.handler({
      actor,
      params: args.params ?? {},
      input: args.input,
      requestId: args.requestId,
      idempotencyKey: args.idempotencyKey ?? null,
    }),
  );
  // audit เขียนหลังงานสำเร็จเท่านั้น · อ่านอย่างเดียวไม่เขียน (อ่านไม่เปลี่ยนอะไร)
  if (op.kind !== "read") {
    await writeAudit({
      tenantId: actor.tenantId,
      actorType: actorAuditType(actor),
      actorId: actorAuditId(actor),
      action: op.action,
      targetType: "ApiOp",
      targetId: op.id,
      after: {
        ...(args.audit ?? {}),
        opId: op.id,
        requestId: args.requestId,
        ...(args.reason ? { reason: args.reason } : {}),
      },
    });
  }
  return env;
}
