// POST/DELETE /api/mobile/secretary/business/logo — โลโก้กิจการจากแอป (ตั้งค่ากิจการ · 14 พ.ย. 2026)
//   POST multipart `file` · OWNER/MANAGER ของกิจการใน x-tenant-id (อื่น ๆ 403) · ต้องมี Content-Length (411)
//   ตรวจด้วย `validateLogoFile` ตัวเดียวกับหน้า "ตราสินค้าและธีม" ของเว็บ (magic bytes · ≤ 2 MB · PNG/JPG/WEBP/SVG ปลอดภัย)
//   → `uploadFile` kind LOGO (ที่เก็บไฟล์กลาง) → TenantBranding.logoUrl ผ่าน `setBranding` (AuditLog + ล้างแคชธีม) · คืน `{logoUrl}`
//   DELETE = ล้างโลโก้ (กลับเป็นตัวย่อบนสีแบรนด์)
import { validateLogoFile } from "@/lib/branding/logo";
import { BIZ_DENY, BIZ_ROLES, setBusinessLogo } from "@/lib/mobile/business-profile";
import { uploadFile } from "@/lib/storage/service";
import { fail, forbidden, gate, ok, withRateLimit, withErrors } from "../../_shared";

const MAX_BYTES = 2 * 1024 * 1024;
const MULTIPART_SLACK = 64 * 1024;

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (!BIZ_ROLES.has(a.c.m.role)) return forbidden(BIZ_DENY);
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "business-logo", 10);
  if (rl) return rl;
  const lenHdr = req.headers.get("content-length");
  if (lenHdr === null || lenHdr.trim() === "" || !Number.isFinite(Number(lenHdr))) return fail(411, "length_required", "ต้องส่งขนาดไฟล์ (Content-Length) มาด้วย");
  if (Number(lenHdr) > MAX_BYTES + MULTIPART_SLACK) return fail(413, "too_large", "ไฟล์ใหญ่เกิน 2 MB — กรุณาย่อขนาดหรือเลือกไฟล์ใหม่");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "ต้องส่งเป็น multipart/form-data พร้อมรูปในช่อง file");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "bad_request", "ไม่พบรูปในช่อง file");
  const data = new Uint8Array(await file.arrayBuffer());
  const checked = validateLogoFile({ name: file.name, type: file.type, bytes: data });
  if (!checked.ok) return fail(415, "unsupported", checked.error);
  const ctype = checked.ext === "svg" ? "image/svg+xml" : checked.ext === "jpg" ? "image/jpeg" : `image/${checked.ext}`;
  const up = await uploadFile({ tenantId: a.c.tenantId }, { kind: "LOGO", filename: file.name || `logo.${checked.ext}`, contentType: ctype, data, maxBytes: MAX_BYTES });
  if (!up.ok) return fail(415, "unsupported", up.error);
  await setBusinessLogo(a.c.tenantId, a.c.userId, up.cdnUrl);
  return ok({ logoUrl: up.cdnUrl });
}

async function DELETE_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  if (!BIZ_ROLES.has(a.c.m.role)) return forbidden(BIZ_DENY);
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "business-logo", 10);
  if (rl) return rl;
  await setBusinessLogo(a.c.tenantId, a.c.userId, null);
  return ok({ logoUrl: null });
}

export const POST = withErrors("secretary/business/logo POST", POST_);
export const DELETE = withErrors("secretary/business/logo DELETE", DELETE_);
