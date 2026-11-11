"use server";
// SVC D.9 ▸ action สาธารณะของหน้าจ่ายผู้เช่า (แนบสลิป) — อยู่ใต้ app/(store) ตามแบบ action สาธารณะ (fitness F6 สแกน src/lib/actions)
//   ด่านจริงอยู่ใน facade platform/dorm-portal (rate ต่อ IP → ลายเซ็น → สัญญา live → บิลของสัญญา → ไฟล์ → ยอดค้างสดฝั่งเซิร์ฟเวอร์)
//   🔴 ไม่รับร้าน/หน่วย/ยอดจากฟอร์ม · ไม่ส่ง deps/นโยบายตรวจสลิปต่อจากคำขอ · ไม่ log ข้อมูลผู้เช่า
//   🔴 ไฟล์ "use server": export async function เท่านั้น
import { headers } from "next/headers";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { portalClientKey, submitPortalSlip } from "@/lib/platform/dorm-portal";

const field = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, 128) : "";
};

export async function submitPortalSlipAction(token: string, _prev: unknown, formData: FormData) {
  void _prev;
  const clientKey = portalClientKey(await headers(), ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]); // ลำดับเดียวกับหน้า (PORTAL_IP_HEADERS)
  const f = formData.get("slip");
  // W11: ไม่อ่านไบต์ที่นี่ — facade ตรวจ rate/ลิงก์/ขนาด (f.size) ก่อนแล้วค่อยเรียก read
  const file = f instanceof File ? { size: f.size, contentType: f.type || "application/octet-stream", read: async () => new Uint8Array(await f.arrayBuffer()) } : { size: 0, contentType: "" };
  const r = await submitPortalSlip(token, { billId: field(formData, "billId"), file, idempotencyKey: field(formData, "idempotencyKey") }, { clientKey });
  if (r.ok) scheduleDrain();
  return r;
}
