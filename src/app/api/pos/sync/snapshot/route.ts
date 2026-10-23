// POST /api/pos/sync/snapshot — เครื่องขายดึงราคา/สินค้าที่พกไปขายออฟไลน์ (POS P3.4U · มติผู้คุม 8 · CD-P34U-2) // POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   route ของ session ข้าง /api/pos/sync (URL คงที่ข้าม deploy — server action id เปลี่ยนทุก build) · ด่านเดียวกับ route ซิงก์
//   body = { systemId, unitId, deviceId } · ผล = { ok:true, snapshot } | { ok:false, code, message }
//   จอเรียกตอนโหลด · ทุกขอบ priceValidUntil · ทุก 15 นาทีขณะออนไลน์ · RATE_LIMITED (1 ใบ/เครื่อง/60 วิ) = 429 → จอถอยเวลา
// 🔴 ร้าน + ผู้ใช้ มาจาก session เท่านั้น (getAuth) · systemId/unitId/deviceId ตรวจซ้ำที่ facade (ระบบ POS ของร้าน · สาขา · เข้าสาขาได้ ·
//    pos.sale.create · เครื่องลงทะเบียนในสาขา ACTIVE · ธงออฟไลน์เปิด) — route ไม่ตรวจสิทธิ์เอง ไม่แตะฐานข้อมูลตรง
// 🔴 กันข้ามไซต์ (CSRF): รับเฉพาะ application/json และ Origin (ถ้ามี) ต้องเป็นโฮสต์เดียวกับคำขอ · ไม่มี session = 401 JSON (ไม่ redirect) · no-store
import { getAuth } from "@/lib/core/context";
import { posMembership } from "@/lib/modules/pos/access";
import { issueOfflineSnapshot } from "@/lib/modules/pos/offline-sync";
import { cookies } from "next/headers"; // POS P5.2 ▸ R2-1 (CD-P52-R2-1) ◂
import { deviceBinding } from "@/lib/modules/pos/device"; // POS P5.2 ▸ R2-1 (CD-P52-R2-1) ◂
import { POS_DEVICE_COOKIE } from "@/lib/modules/pos/device-cookie"; // POS P5.2 ▸ R2-1 (CD-P52-R2-1) ◂

const STATUS: Readonly<Record<string, number>> = {
  NOT_FOUND: 404,
  DEVICE_NOT_FOUND: 404,
  DEVICE_REVOKED: 403,
  DEVICE_NOT_PAIRED: 409, // POS P5.2 ▸ R2-1 ◂
  PERMISSION_DENIED: 403,
  VALIDATION: 422,
  OFFLINE_DISABLED: 409,
  RATE_LIMITED: 429,
  BUSY: 503,
  INTERNAL: 500,
};
const MAX_BODY = 4_000;
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json(403, { ok: false, code: "FORBIDDEN", message: "คำขอไม่ได้มาจากหน้าขายของร้าน" });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json(415, { ok: false, code: "VALIDATION", message: "ต้องส่งเป็น JSON" });
  const auth = await getAuth();
  if (!auth?.active) return json(401, { ok: false, code: "UNAUTHORIZED", message: "เข้าสู่ระบบใหม่อีกครั้ง" });
  const st = auth.active.tenant?.status;
  if (st === "SUSPENDED" || st === "CLOSED") return json(403, { ok: false, code: "FORBIDDEN", message: "ร้านนี้ถูกระงับการใช้งาน" });
  const text = await req.text();
  if (text.length > MAX_BODY) return json(413, { ok: false, code: "VALIDATION", message: "ข้อมูลใหญ่เกินไป" });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(422, { ok: false, code: "VALIDATION", message: "ข้อมูลไม่ใช่ JSON ที่ถูกต้อง" });
  }
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const systemId = typeof b.systemId === "string" ? b.systemId : "";
  const unitId = typeof b.unitId === "string" ? b.unitId : "";
  const claimed = typeof b.deviceId === "string" ? b.deviceId : "";
  if (!systemId || !unitId) return json(422, { ok: false, code: "VALIDATION", message: "ต้องระบุระบบ สาขา และเครื่อง" });
  // POS P5.2 ▸ R2-1 (CD-P52-R2-1 · หนี้ R1 รอบ 2 D+E+device · ปิดก่อน deploy): เครื่องของ snapshot = คุกกี้เครื่องลงนาม เหมือน /api/pos/sync (CD-P52-O4b) —
  //   ไม่มีคุกกี้ + สาขามีเครื่องลงทะเบียน = 409 DEVICE_NOT_PAIRED (เดิมอ้างเครื่อง Z จาก body ได้ ⇒ กินสล็อต 1 ใบ/60 วิ ของ Z) ·
  //   สาขาที่ไม่มีเครื่องลงทะเบียนเลย = รหัสใน body (ไม่มีเครื่องให้สวมรอย) ◂
  let cookieValue: string | undefined;
  try {
    cookieValue = (await cookies()).get(POS_DEVICE_COOKIE)?.value;
  } catch {
    cookieValue = undefined;
  }
  const bound = await deviceBinding({ tenantId: auth.active.tenantId, unitId }, cookieValue);
  if (bound.kind === "none" && bound.unitHasDevices) return json(409, { ok: false, code: "DEVICE_NOT_PAIRED", message: "เครื่องนี้ยังไม่ได้จับคู่กับสาขา — ให้ผู้จัดการจับคู่ที่ ตั้งค่า › เครื่องขาย ก่อน" });
  const deviceId = bound.kind === "none" ? claimed : bound.deviceCode;
  if (!deviceId) return json(422, { ok: false, code: "VALIDATION", message: "ต้องระบุระบบ สาขา และเครื่อง" });
  const m = posMembership(auth.active);
  const r = await issueOfflineSnapshot(
    { tenantId: auth.active.tenantId, systemId, unitId, deviceId },
    { userId: auth.user.id, role: m.role === "OWNER" || m.role === "MANAGER" ? m.role : "STAFF", unitAccess: m.unitAccess, permissions: m.permissions },
  );
  if (r.ok) return json(200, r);
  return json(STATUS[r.code] ?? 409, r);
}
