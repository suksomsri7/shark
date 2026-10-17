// POST /api/pos/sync — หน้าขายส่งบิลที่ขายตอนออฟไลน์มาซิงก์ (POS P3.4 S · R5 · มติ 2) // POS P3.4 ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   route handler ของ session (URL คงที่ข้าม deploy — server action id เปลี่ยนทุก build ส่วนแท็บออฟไลน์อยู่ข้าม deploy ได้)
//   body = { systemId, unitId, deviceId, items[≤50] } · ผล = { ok:true, results[] } | { ok:false, code, message }
// 🔴 ร้าน + ผู้ใช้ มาจาก session เท่านั้น (getAuth) · systemId/unitId/deviceId จากคำขอถูกตรวจซ้ำที่ facade (ระบบ POS ของร้าน · สาขาผูกระบบ ·
//    เข้าสาขาได้ · pos.sale.create · เครื่องลงทะเบียนในสาขานั้น · ธงออฟไลน์เปิด) — route ไม่ตรวจสิทธิ์เอง ไม่แตะฐานข้อมูลตรง
// 🔴 กันข้ามไซต์ (CSRF): รับเฉพาะ application/json และ Origin (ถ้ามี) ต้องเป็นโฮสต์เดียวกับคำขอ · ไม่มี session = 401 JSON (ไม่ redirect)
import { getAuth } from "@/lib/core/context";
import { posMembership } from "@/lib/modules/pos/access";
import { syncOfflineSales } from "@/lib/modules/pos/offline-sync";

const STATUS: Readonly<Record<string, number>> = {
  NOT_FOUND: 404,
  DEVICE_NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  VALIDATION: 422,
  OFFLINE_DISABLED: 409,
  BUSY: 503,
  INTERNAL: 500,
};
const MAX_BODY = 2_000_000;
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
  const deviceId = typeof b.deviceId === "string" ? b.deviceId : "";
  if (!systemId || !unitId || !deviceId) return json(422, { ok: false, code: "VALIDATION", message: "ต้องระบุระบบ สาขา และเครื่อง" });
  const m = posMembership(auth.active);
  const r = await syncOfflineSales(
    { tenantId: auth.active.tenantId, systemId, unitId, deviceId },
    { userId: auth.user.id, role: m.role === "OWNER" || m.role === "MANAGER" ? m.role : "STAFF", unitAccess: m.unitAccess, permissions: m.permissions },
    { deviceId, items: b.items as never },
  );
  if (r.ok) return json(200, r);
  return json(STATUS[r.code] ?? 409, r);
}
