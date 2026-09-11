// api-shared.ts — ชนิดข้อมูลของหน้า "สมาชิก › ตั้งค่า › API" ส่วน webhook (M3.10 · ภาพ 27 ขวา)
//
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma/env/facade/next — `MemberApiSettings.tsx` ('use client') import ได้
//    และไฟล์ `"use server"` (`api-actions.ts`) ห้าม export type ใหม่ (บทเรียน M2.2 · หน้า 500) ⇒ ชนิดผลลัพธ์อยู่ที่นี่

/** ปลายทาง webhook ของระบบสมาชิก 1 แถว (ตาราง: ที่อยู่ · เหตุการณ์ · สถานะ · ส่งล่าสุด) */
export type MemberWebhookRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  /** ป้ายเวลาไทยของการส่งล่าสุด (ยังไม่เคยส่ง = null) */
  lastLabel: string | null;
  lastStatus: "OK" | "FAILED" | null;
};

/** การส่ง 1 ครั้ง (ตาราง "การส่งล่าสุด") — ไม่มีเนื้อ payload บนจอ (มีแต่รหัสอ้างอิงอยู่แล้ว ไม่จำเป็นต้องโชว์) */
export type MemberWebhookDeliveryRow = {
  id: string;
  endpointId: string;
  eventType: string;
  status: "OK" | "FAILED";
  attempts: number;
  lastError: string | null;
  atLabel: string;
};

export type MemberWebhookCreateResult = { ok: true; id: string; secret: string } | { ok: false; reason: string };
export type MemberWebhookTestResult = { ok: true; delivered: boolean; error: string | null } | { ok: false; reason: string };
export type MemberWebhookActionResult = { ok: true } | { ok: false; reason: string };
