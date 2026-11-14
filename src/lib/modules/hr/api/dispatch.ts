// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST ระบบงานบุคคล (ใบ H4.8)
//
// ตรรกะทั้งหมด (จับคู่ path · ด่านคีย์/ระบบ/เพดาน/สิทธิ์ · กันซ้ำ · ซอง · audit) อยู่ที่แกนกลาง `src/lib/api/dispatch.ts` (แช่แข็ง)
// ที่นี่เพิ่มอย่างเดียว (มติ 14 พ.ย. ข้อ 4): บอก actor ว่าคีย์ "ผูกระบบ HR ที่คำขอนี้ทำงานอยู่" ไหม
//   คีย์กลาง (ไม่ผูกระบบ) ที่ส่ง X-Shark-System มา และคีย์ของระบบอื่น ⇒ actor ไม่มีสิทธิ์ใดเลย ⇒ แกนตอบ 403 scope_missing
//   ไบต์เดียวกับคีย์ผูกระบบที่ไม่มี scope ของ HR — คีย์ที่ไม่ได้ออกจากหน้าตั้งค่า HR (เจ้าของร้าน + ยินยอมข้อมูลเงินเดือน) ใช้กับ HR ไม่ได้เลย
// รอบแก้ (มติ ข้อ 6): คำขอเขียนของคีย์ที่ใช้ได้ต้องเป็น Content-Type: application/json และไม่มีช่อง __proto__/constructor/prototype
// 🔴 ตรวจคีย์ที่นี่แค่ "อ่านว่าผูกระบบไหน" — การยืนยันตัวตน/หมดอายุ/เพิกถอนยังเป็นของแกน (คำตอบ 401 มาจากแกนเท่านั้น)
import { dispatch as coreDispatch, matchOpIn } from "@/lib/api/dispatch";
import type { ApiMethod } from "@/lib/api/op";
import type { ApiModuleConfig } from "@/lib/api/require";
import { fail, newRequestId } from "@/lib/api/respond";
import { verifyApiKeyDetailed } from "@/lib/api-keys/service";
import { hrApiKeyActor } from "./actor";
import { HR_API_CONFIG } from "./config";
import { HR_OPS } from "./registry";

/** คีย์ใน Authorization ใช้ได้ไหม + ผูกระบบไหน (null = ไม่ผูก) — ไม่ใช้ได้ = แกนตัดสินเอง (401) */
async function keyOf(req: Request): Promise<{ ok: boolean; systemId: string | null }> {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  const raw = m?.[1]?.trim();
  if (!raw) return { ok: false, systemId: null };
  const v = await verifyApiKeyDetailed(raw);
  return v.status === "ok" ? { ok: true, systemId: v.key.systemId } : { ok: false, systemId: null };
}

/** ชื่อช่องที่ไม่มีวันเป็นช่องของ HR — JSON.parse สร้างเป็น own property ได้ (มติรอบแก้ ข้อ 6) */
const POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function hasPoisonKey(v: unknown, depth = 0): string | null {
  if (depth > 20 || v === null || typeof v !== "object") return null;
  for (const k of Object.getOwnPropertyNames(v)) {
    if (POISON_KEYS.has(k)) return k;
    const inner = hasPoisonKey((v as Record<string, unknown>)[k], depth + 1);
    if (inner) return inner;
  }
  return null;
}

/**
 * ด่านของคำขอเขียน (มติรอบแก้ ข้อ 6) — หลังคีย์ใช้ได้แล้วเท่านั้น (คีย์เสีย = 401 ของแกนมาก่อน):
 *   ต้องส่ง `Content-Type: application/json` (ไม่ใช่ = 415 invalid_json) · ช่อง __proto__/constructor/prototype = 422 validation
 */
async function writeGuard(method: ApiMethod, req: Request, segments: string[]): Promise<Response | null> {
  const hit = matchOpIn(HR_OPS, method, segments);
  if (!hit || hit.op.kind === "read") return null;
  const ct = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (ct !== "application/json") {
    return fail(415, "invalid_json", "ต้องส่งเนื้อคำขอเป็น JSON พร้อมส่วนหัว Content-Type: application/json", "Send the body as JSON with Content-Type: application/json.", newRequestId());
  }
  let body: unknown = null;
  try {
    const t = await req.clone().text();
    body = t.trim() ? JSON.parse(t) : null;
  } catch {
    return null; // JSON เสีย = 400 invalid_json ของแกน
  }
  const bad = hasPoisonKey(body);
  if (bad) {
    return fail(422, "validation", "ข้อมูลที่ส่งมาไม่ถูกต้องตามรูปแบบที่กำหนด", "Request payload failed validation.", newRequestId(), { details: [{ path: bad, message: "ช่องนี้ไม่มีในคำขอนี้" }] });
  }
  return null;
}

export async function dispatch(method: ApiMethod, req: Request, params: { path?: string[] }): Promise<Response> {
  const key = await keyOf(req);
  if (key.ok) {
    const refused = await writeGuard(method, req, params.path ?? []);
    if (refused) return refused;
  }
  const bound = key.systemId;
  const cfg: ApiModuleConfig = { ...HR_API_CONFIG, makeActor: (input) => hrApiKeyActor({ ...input, bound: bound !== null && bound === input.systemId }) };
  return coreDispatch(HR_OPS, method, req, params, cfg);
}
