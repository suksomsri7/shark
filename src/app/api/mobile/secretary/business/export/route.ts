// /api/mobile/secretary/business/export — ส่งออกข้อมูลร้าน (PDPA data portability) จากแอป (ตั้งค่ากิจการ ส่วน "อันตราย" · 14 พ.ย. 2026)
//   POST (Bearer + x-tenant-id · OWNER เท่านั้น แบบ exportMyDataAction ของเว็บ · เพดาน 3 ครั้ง/นาที)
//     → `{url, expiresAt}` ลิงก์ดาวน์โหลดอายุ 5 นาที (signed-link purpose tenant.export · ผูกร้าน+ผู้ใช้) ให้แอปเปิดในเบราว์เซอร์ของเครื่อง
//     (แอปไม่มีโมดูลไฟล์/แชร์ native — ไม่ต้อง build ใหม่)
//   GET ?token= (ไม่มี Bearer — เปิดจากเบราว์เซอร์) → ไฟล์ JSON แบบ attachment (exportTenantData ตัวเดียวกับเว็บ)
//     ตรวจสิทธิ์สดอีกรอบ (ยังเป็น OWNER · ร้านไม่ถูกระงับ) · ลิงก์ละ ≤ 3 ครั้ง · เพดาน 10 ครั้ง/นาที/IP · ล้มทุกกรณี = 404 เดียวกัน
//   ตรรกะ: src/lib/mobile/business-danger.ts · AuditLog tenant.data.exported
import { OWNER_ONLY, consumeExportToken, issueExportToken } from "@/lib/mobile/business-danger";
import { clientIp, fail, forbidden, gate, ok, withRateLimit, withErrors } from "../../_shared";

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (a.c.m.role !== "OWNER") return forbidden(OWNER_ONLY);
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "business-export", 3);
  if (rl) return rl;
  const { token, expiresAt } = issueExportToken(a.c.tenantId, a.c.userId);
  const url = new URL("/api/mobile/secretary/business/export", req.url);
  url.searchParams.set("token", token);
  return ok({ url: url.toString(), expiresAt });
}

async function GET_(req: Request) {
  const rl = await withRateLimit(clientIp(req), "business-export-get", 10);
  if (rl) return rl;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const file = token ? await consumeExportToken(token) : null;
  if (!file) return fail(404, "not_found", "ลิงก์ดาวน์โหลดหมดอายุหรือใช้ไม่ได้แล้ว — กด \"ส่งออกข้อมูลร้าน\" ในแอปอีกครั้ง");
  return new Response(file.json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const POST = withErrors("secretary/business/export POST", POST_);
export const GET = withErrors("secretary/business/export GET", GET_);
