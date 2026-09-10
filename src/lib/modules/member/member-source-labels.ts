// member-source-labels.ts — ป้ายไทยของ MemberSource (D10 · พิมพ์เขียว §7.2 §11.2)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next) — `profile.ts` ใช้แปลงค่า field ระบบ "source"
//    เป็น display ไทยตอนสร้าง Member360 DTO (display เป็นหน้าที่ของ DTO ไม่ใช่ UI — ตีกลับรอบ 1 ข้อ 5)
//    · หน้ารวมสมาชิกใช้ตัวเดียวกันได้ถ้าต้องโชว์ป้ายที่มา

import type { MemberSource } from "@prisma/client";

export const MEMBER_SOURCE_LABELS: Record<MemberSource, string> = {
  WALK_IN: "หน้าร้าน",
  POS: "หน้าร้าน (POS)",
  BOOKING: "ระบบจอง",
  LINE_OA: "LINE OA",
  LIFF: "LIFF",
  WEB_FORM: "ฟอร์มเว็บไซต์",
  CHAT: "แชท",
  REFERRAL: "แนะนำเพื่อน",
  IMPORT: "นำเข้าข้อมูล",
  CRM: "CRM",
  CAMPAIGN: "แคมเปญ",
  API: "API",
  MARKETPLACE: "มาร์เก็ตเพลส",
  APP: "แอป",
  OTHER: "อื่น ๆ",
};

/** ป้ายไทยของที่มา — ค่าที่ไม่รู้จัก (ข้อมูลเก่า/พิมพ์ผิด) คืนค่าดิบกลับไปแทนที่จะว่างเปล่า */
export function memberSourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return MEMBER_SOURCE_LABELS[source as MemberSource] ?? source;
}
