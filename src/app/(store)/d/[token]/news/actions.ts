"use server";
// SVC D.17 ▸ action สาธารณะของหน้าประกาศผู้เช่า (บันทึกว่าอ่านแล้ว — ฝั่งเบราว์เซอร์เท่านั้น · GET ไม่นับ)
//   ด่านจริงอยู่ใน platform/dorm-announce (rate ต่อ IP → ลายเซ็น → สัญญา live → ประกาศที่สัญญานี้เห็น)
//   🔴 ไม่รับร้าน/หน่วย/ผู้เช่าจากคำขอ · clientKey = IP ลำดับเดียวกับ D.9 · ไฟล์ "use server": export async function เท่านั้น
import { headers } from "next/headers";
import { portalClientKey } from "@/lib/platform/dorm-portal";
import { markPortalAnnouncementRead } from "@/lib/platform/dorm-announce";

export async function markAnnouncementReadAction(token: string, announcementId: string) {
  const clientKey = portalClientKey(await headers(), ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]); // ลำดับเดียวกับหน้า (PORTAL_IP_HEADERS)
  return markPortalAnnouncementRead(token, { announcementId: typeof announcementId === "string" ? announcementId.slice(0, 100) : "" }, { clientKey });
}
