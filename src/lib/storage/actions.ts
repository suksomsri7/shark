"use server";

import { requireTenant } from "@/lib/core/context";
import { storageEnabled, uploadFile, type UploadResult } from "./service";

// อัปโหลดโลโก้ร้าน — รับ File จาก <input type="file"> ผ่าน FormData
// ตรวจสิทธิ์ (ต้องอยู่ในร้าน) + จำกัดชนิด/ขนาดที่ฝั่ง server (service เป็นด่านตัดสิน)
export async function uploadLogoAction(formData: FormData): Promise<UploadResult> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "ไม่พบไฟล์ที่จะอัปโหลด — กรุณาเลือกไฟล์ใหม่" };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  return uploadFile(
    { tenantId },
    {
      kind: "LOGO",
      filename: file.name,
      contentType: file.type,
      data,
    },
  );
}

// เช็คว่าระบบ storage เปิดอยู่ไหม (ใช้ตัดสินใจซ่อน/แสดงปุ่มอัปโหลดใน UI)
export async function storageEnabledAction(): Promise<boolean> {
  await requireTenant();
  return storageEnabled();
}
