"use server";

// SVC B.9 — server action สาธารณะของหน้ารับบัตรคิวจากมือถือ (/s/<ร้าน>/<สาขา>/remote · ภาคผนวก ก #42) · ใบสั่ง §3.3
//   ไม่มี session — หน่วย/การเปิดรับ/rate limit ต่อผู้ใช้ ตรวจใน facade platform/booking-remote (ด่านจริงอยู่ที่นั่น)
//   อยู่ใต้ app/(store) ตามแบบ action สาธารณะของ B.6 (`bq/actions.ts`) — fitness F6 สแกน src/lib/actions (ต้องมีด่านสิทธิ์ล็อกอิน)
//   🔴 ไฟล์ "use server": export async function เท่านั้น · ไม่ log เบอร์
import { headers } from "next/headers";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { takeRemoteTicket } from "@/lib/platform/booking-remote";

/**
 * IP ผู้ใช้สำหรับนับโควตา (N9): x-real-ip ที่แพลตฟอร์ม (Vercel/พร็อกซีหน้าร้าน) เขียนทับเอง → x-vercel-forwarded-for → x-forwarded-for ตัวแรก
 * (ตัวสุดท้ายพอเชื่อได้น้อยสุด — ผู้ใช้ส่งมาเองได้ถ้าพร็อกซีไม่เขียนทับ) · ไม่มี = "unknown" (ทุกคนที่ไม่มี IP ใช้ถังเดียวกัน)
 */
function clientIpOf(h: Headers): string {
  const pick = (v: string | null | undefined) => (v ?? "").split(",")[0]?.trim().slice(0, 64) ?? "";
  return pick(h.get("x-real-ip")) || pick(h.get("x-vercel-forwarded-for")) || pick(h.get("x-forwarded-for")) || "unknown";
}

const field = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, 200) : "";
};

export async function takeRemoteTicketAction(tenantSlug: string, unitSlug: string, _prev: unknown, formData: FormData) {
  void _prev;
  const clientKey = clientIpOf(await headers());
  const staff = field(formData, "staffId");
  const r = await takeRemoteTicket(tenantSlug, unitSlug, { serviceId: field(formData, "serviceId"), staffId: staff || null, phone: field(formData, "phone"), clientKey });
  if (r.ok) scheduleDrain();
  return r;
}
