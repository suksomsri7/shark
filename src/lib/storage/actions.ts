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

/**
 * ดึงรูปที่เก็บบน CDN ของเราเองกลับมาเป็น data URL ให้เบราว์เซอร์เอาไปแก้ต่อ (ปุ่ม "ลบพื้นหลัง")
 *
 * ทำไมต้องผ่าน server: canvas อ่านพิกเซลของรูปข้ามโดเมนไม่ได้ถ้าปลายทางไม่ส่ง CORS มาให้
 * (เจอตอนทำ 27 ส.ค. — รูปที่เพิ่งอัปขึ้น CDN แล้วกดลบพื้นหลังทันทีจะติดข้อนี้)
 * 🔴 กัน SSRF: ยอมเฉพาะโฮสต์ CDN ของเราที่ตั้งไว้ใน env เท่านั้น — ห้ามให้ยิง URL อะไรก็ได้
 */
export async function fetchImageForEditingAction(
  url: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  await requireTenant();
  const cdn = (process.env.SHARK_BUNNY_CDN ?? "").replace(/\/+$/, "");
  if (!cdn) return { ok: false, error: "ยังไม่ได้เปิดระบบไฟล์ของร้าน" };
  let target: URL;
  let allowed: URL;
  try {
    target = new URL(url);
    allowed = new URL(cdn);
  } catch {
    return { ok: false, error: "ลิงก์รูปไม่ถูกต้อง" };
  }
  if (target.protocol !== "https:" || target.host !== allowed.host) {
    return { ok: false, error: "แก้ได้เฉพาะรูปที่อัปโหลดเข้าระบบแล้ว — กรุณาอัปโหลดไฟล์เข้ามาก่อน" };
  }
  try {
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: "โหลดรูปไม่สำเร็จ กรุณาลองใหม่" };
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return { ok: false, error: "ไฟล์นี้ไม่ใช่รูปภาพ" };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 5 * 1024 * 1024) return { ok: false, error: "รูปใหญ่เกิน 5MB" };
    return { ok: true, dataUrl: `data:${type};base64,${Buffer.from(buf).toString("base64")}` };
  } catch {
    return { ok: false, error: "โหลดรูปไม่สำเร็จ กรุณาลองใหม่" };
  }
}

// เช็คว่าระบบ storage เปิดอยู่ไหม (ใช้ตัดสินใจซ่อน/แสดงปุ่มอัปโหลดใน UI)
export async function storageEnabledAction(): Promise<boolean> {
  await requireTenant();
  return storageEnabled();
}
