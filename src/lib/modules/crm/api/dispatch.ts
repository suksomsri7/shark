// dispatch.ts — ประตูเดียวของ REST CRM (ใบ C1.10) — ห่อ dispatch ของแกนกลางด้วยทะเบียน + config ของ CRM
//
// 🔴 ตรรกะทั้งหมดอยู่ที่แกนกลาง `@/lib/api/dispatch` (จับคู่ path · ด่านคีย์/เพดาน/สิทธิ์ · confirm+reason · สคีมา ·
//    Idempotency-Key · handler · audit) — ไฟล์นี้มีแค่ "เพดานขนาด body" ที่ต้องเกิดก่อนแกนอ่าน body ทั้งก้อน (ไม่มี dispatcher ตัวที่สอง)
// 🔴 ประตู uiVersion (R-E.14) อยู่ใน `CRM_API_CONFIG.altAuth` — ทำงานก่อนการอ่าน body เสมอ
import { dispatch as coreDispatch, matchOpIn } from "@/lib/api/dispatch";
import type { ApiMethod, ApiOp } from "@/lib/api/op";
import { fail, newRequestId, type ApiErrorCode } from "@/lib/api/respond";
import { CRM_API_CONFIG } from "./config";
import { CRM_OPS } from "./registry";

// AUDIT-CLASS X6 (มติผู้คุมงาน C1.10 S3): เพดานขนาด body — 1 MB ทั่วไป · 10 MB เฉพาะนำเข้าผู้ติดต่อ
export const CRM_BODY_MAX_BYTES = 1024 * 1024;
export const CRM_IMPORT_BODY_MAX_BYTES = 10 * 1024 * 1024;
const BIG_BODY_OPS = new Set(["contacts.import.start"]);

const tooLarge = (cap: number) =>
  fail(413, "payload_too_large" as ApiErrorCode, `ข้อมูลที่ส่งมาใหญ่เกิน ${Math.round(cap / 1024 / 1024)} MB ต่อคำขอ — แบ่งส่งเป็นหลายครั้ง`, `Request body exceeds ${cap} bytes.`, newRequestId());

/**
 * อ่าน body ไม่เกิน cap+1 ไบต์ (Content-Length บอกเกินมา = ปฏิเสธก่อนอ่าน) · เกิน = 413 · ไม่เกิน = คำขอใหม่ที่ body เดิมทุกไบต์
 * (แกนอ่าน `req.text()` ทั้งก้อน — ถ้าไม่ตัดที่นี่ ผู้เรียกส่ง 1 GB มาได้ก่อนสคีมาจะเห็น)
 */
async function capBody(req: Request, cap: number): Promise<Request | Response> {
  if (req.method === "GET" || req.method === "HEAD") return req;
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > cap) return tooLarge(cap);
  if (!req.body) return req;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      return tooLarge(cap);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    body.set(c, at);
    at += c.byteLength;
  }
  return new Request(req.url, { method: req.method, headers: req.headers, body });
}

async function run(ops: readonly ApiOp[], method: ApiMethod, req: Request, path: string[]): Promise<Response> {
  const hit = matchOpIn(ops, method, path);
  const capped = await capBody(req, hit && BIG_BODY_OPS.has(hit.op.id) ? CRM_IMPORT_BODY_MAX_BYTES : CRM_BODY_MAX_BYTES);
  if (capped instanceof Response) return capped;
  return coreDispatch(ops, method, capped, { path }, CRM_API_CONFIG);
}

/** REST `/api/v1/crm/*` */
export function dispatch(method: ApiMethod, req: Request, params: { path?: string[] }): Promise<Response> {
  return run(CRM_OPS, method, req, params.path ?? []);
}

const TEAM_OPS = CRM_OPS.filter((o) => o.path === "/teams" || o.path.startsWith("/teams/"));

/**
 * REST `/api/v1/teams/*` (RESOLUTIONS R-C.7) — ทะเบียนเดียวกัน: path ของทีมในทะเบียนคือ `/teams…`
 * ⇒ เติม segment `teams` นำหน้าแล้วส่งเข้าประตูเดียวกัน · path อื่นใต้ `/api/v1/teams` ที่ไม่ใช่ op ของทีม = 404
 */
export function dispatchTeams(method: ApiMethod, req: Request, params: { path?: string[] }): Promise<Response> {
  return run(TEAM_OPS, method, req, ["teams", ...(params.path ?? [])]);
}
