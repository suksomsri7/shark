"use server";

// ตราสินค้าและธีมกิจการ (ledger/BRANDING-RUN.md §สัญญา B2 — เดิมคือ White label v1 WO-0064)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// สิทธิ์: เฉพาะผู้ที่มี `branding.setting.update` (OWNER เสมอ · MANAGER/STAFF ต้องได้รับสิทธิ์)
//
// 🔴 ทุก action ในไฟล์นี้ "ห้าม throw" — คืน { ok:false, errors } เป็นไทยเสมอ
//    (ต่างจากแพตเทิร์นเดิมที่ปล่อยให้ ForbiddenError/Error ทะลุขึ้นไป Next แสดง error boundary)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { parseBrandingForm } from "@/lib/branding/form";
import { validateLogoFile } from "@/lib/branding/logo";
import { setBranding } from "@/lib/branding/service";
import { uploadFile, type UploadResult } from "@/lib/storage/service";

const SETTINGS_PATH = "/app/settings/branding";
const BRANDING_MODULE = "branding";
const BRANDING_WRITE_ACTION = "branding.setting.update";
const NO_PERMISSION_ERROR = "ไม่มีสิทธิ์แก้ไขตราสินค้าและธีม — เฉพาะเจ้าของ/ผู้ดูแลร้านทำได้";

export type SaveBrandingResult = { ok: true } | { ok: false; errors: Record<string, string> };

type Auth = Awaited<ReturnType<typeof requireTenant>>;

function rbacCtx(auth: Auth) {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

function assertBrandingWrite(auth: Auth): void {
  assertCan(rbacCtx(auth), { module: BRANDING_MODULE, action: BRANDING_WRITE_ACTION });
}

// บันทึกธีม — parseBrandingForm ก่อนเสมอ (ผิดรูปแบบ = errors ต่อฟิลด์ ไม่ถึง setBranding เลย)
export async function saveBrandingAction(formData: FormData): Promise<SaveBrandingResult> {
  const auth = await requireTenant();
  try {
    assertBrandingWrite(auth);
  } catch {
    return { ok: false, errors: { _: NO_PERMISSION_ERROR } };
  }

  const parsed = parseBrandingForm(formData);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  try {
    // updatedById มาจาก session เท่านั้น — AuditLog branding.updated ต้องรู้ว่าใครกด
    await setBranding(
      { tenantId: auth.active.tenantId },
      { ...parsed.input, updatedById: auth.user.id },
    );
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: { _: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่" } };
  }
}

// คืนค่าเริ่มต้น — ล้างโลโก้/ชื่อ/สี กลับเป็นค่าปริยายของแพลตฟอร์ม (LIGHT + เปิดใช้ทุกที่)
export async function resetBrandingAction(): Promise<SaveBrandingResult> {
  const auth = await requireTenant();
  try {
    assertBrandingWrite(auth);
  } catch {
    return { ok: false, errors: { _: NO_PERMISSION_ERROR } };
  }

  try {
    await setBranding(
      { tenantId: auth.active.tenantId },
      {
        displayName: "",
        logoUrl: "",
        brandColor: "",
        navTone: "LIGHT",
        applyStorefront: true,
        applyMobile: true,
        updatedById: auth.user.id,
      },
    );
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: { _: e instanceof Error ? e.message : "คืนค่าเริ่มต้นไม่สำเร็จ" } };
  }
}

// อัปโหลดโลโก้กิจการ — validateLogoFile (magic bytes/ขนาด/SVG ปลอดภัย) ก่อนแตะ storage เสมอ
// แยกจาก uploadLogoAction ทั่วไปใน src/lib/storage/actions.ts โดยตั้งใจ: ตัวนั้นใช้ร่วมกับ
// ImageAssetField ของหน้าตั้งค่าเอกสาร (โลโก้/ตราประทับ/ลายเซ็น) ซึ่งยังรับ GIF/HEIC ผ่าน uploadFile
// เดิมอยู่ — ถ้าไปรัดกฎ 2MB/PNG-JPG-WEBP-SVG ที่ตัวกลางนั้น จะทำให้อัปตราประทับ/ลายเซ็นที่เคยผ่านพัง
export async function uploadLogoAction(formData: FormData): Promise<UploadResult> {
  const auth = await requireTenant();
  try {
    assertBrandingWrite(auth);
  } catch {
    return { ok: false, error: NO_PERMISSION_ERROR };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ไม่พบไฟล์ที่จะอัปโหลด — กรุณาเลือกไฟล์ใหม่" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateLogoFile({ name: file.name, type: file.type, bytes });
  if (!checked.ok) return { ok: false, error: checked.error };

  return uploadFile(
    { tenantId: auth.active.tenantId },
    { kind: "LOGO", filename: file.name, contentType: file.type, data: bytes },
  );
}
