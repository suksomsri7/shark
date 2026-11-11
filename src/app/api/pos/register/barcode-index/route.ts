// GET /api/pos/register/barcode-index — ดัชนีบาร์โค้ดของหน้าขาย (POS P5.3 fix1c · CD-P53-O15 F1 H1) // POS P5.3 fix1c ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   route ของ session (ไม่ใช่ server action — Next ส่ง action ทีละคำขอต่อ client ⇒ ดึงชุดเต็มที่นี่ไม่ขวาง quote/submit/สแกนทางเซิร์ฟเวอร์)
//   query: systemId · unitId · knownVersion (ไม่บังคับ) · หรือ If-None-Match: "<version>" → ไม่เปลี่ยน = 304 (ไม่มี body) · ชุดเต็ม = 200 JSON + ETag "<version>"
//   หัว x-pos-server-now = เวลาเซิร์ฟเวอร์ (ISO) ทุกคำตอบ (304 ไม่มี body — F3) · ผู้ใช้ละไม่เกิน 1 การ "สร้าง" ชุดใหม่ต่อ 10 วิ ต่อสาขา (ชุดที่อยู่ในแคชของโปรเซส/304 ไม่นับ) = 429 + Retry-After
// 🔴 ร้าน + ผู้ใช้ มาจาก session เท่านั้น (getAuth) · ด่านเดียวกับ registerScanAction: เข้าสาขาไม่ได้ = 404 · ไม่มี pos.sale.create = 403 · register.ts ตรวจซ้ำ (regScope)
//    อ่านอย่างเดียว ไม่แตะฐานข้อมูลตรง · no-store · ไม่มี session = 401 JSON (ไม่ redirect)
import { getAuth } from "@/lib/core/context";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { posMembership } from "@/lib/modules/pos/access";
import { registerBarcodeIndex } from "@/lib/modules/pos/register";

const STATUS: Readonly<Record<string, number>> = { NOT_FOUND: 404, PERMISSION_DENIED: 403, VALIDATION: 422, BUSY: 503, INTERNAL: 500, UNKNOWN: 500 };
const BUILD_GAP_MS = 10_000;
const BUILD_LOG_MAX = 5_000;
/** ผู้ใช้|สาขา → เวลาที่ได้สิทธิ์สร้างชุดใหม่ครั้งล่าสุด (ในโปรเซส · จำกัดขนาด) */
const lastBuild = new Map<string, number>();

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "cache-control": "private, no-store", "x-pos-server-now": new Date().toISOString(), ...extra };
}
const json = (status: number, body: unknown, extra: Record<string, string> = {}) => Response.json(body, { status, headers: headers(extra) });
const etagOf = (version: string) => `"${version}"`;
function versionFromIfNoneMatch(h: string | null): string | null {
  if (!h) return null;
  const m = /^\s*(?:W\/)?"([A-Za-z0-9_-]{1,100})"\s*$/.exec(h);
  return m ? m[1]! : null;
}

export async function GET(req: Request): Promise<Response> {
  const auth = await getAuth();
  if (!auth?.active) return json(401, { ok: false, code: "UNAUTHORIZED", message: "เข้าสู่ระบบใหม่อีกครั้ง" });
  const st = auth.active.tenant?.status;
  if (st === "SUSPENDED" || st === "CLOSED") return json(403, { ok: false, code: "FORBIDDEN", message: "ร้านนี้ถูกระงับการใช้งาน" });
  const url = new URL(req.url);
  const systemId = url.searchParams.get("systemId") ?? "";
  const unitId = url.searchParams.get("unitId") ?? "";
  if (!systemId || !unitId || systemId.length > 100 || unitId.length > 100) return json(404, { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" });
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return json(404, { ok: false, code: "NOT_FOUND", message: "ไม่พบสาขานี้" });
  if (!evaluate(m, { module: "pos", action: "pos.sale.create", unitId })) return json(403, { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์" });
  const knownVersion = versionFromIfNoneMatch(req.headers.get("if-none-match")) ?? url.searchParams.get("knownVersion");
  const who = `${auth.user.id}|${unitId}`;
  let throttled = false;
  const allowBuild = (): boolean => {
    const now = Date.now();
    const last = lastBuild.get(who);
    if (last !== undefined && now - last < BUILD_GAP_MS) {
      throttled = true;
      return false;
    }
    lastBuild.delete(who);
    lastBuild.set(who, now);
    while (lastBuild.size > BUILD_LOG_MAX) lastBuild.delete(lastBuild.keys().next().value as string);
    return true;
  };
  const r = await registerBarcodeIndex(
    { tenantId: auth.active.tenantId, systemId, unitId },
    { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    { knownVersion: knownVersion || null },
    undefined,
    { allowBuild },
  );
  if (!r.ok) {
    if (throttled) return json(429, { ok: false, code: "RATE_LIMITED", message: r.message }, { "retry-after": String(BUILD_GAP_MS / 1000) });
    return json(STATUS[r.code] ?? 409, r);
  }
  if (r.unchanged === true) return new Response(null, { status: 304, headers: headers({ etag: etagOf(r.version) }) });
  return json(200, r, { etag: etagOf(r.version) });
}
