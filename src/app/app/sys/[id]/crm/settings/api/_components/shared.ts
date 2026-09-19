// shared.ts — ชนิดข้อมูลของหน้า "CRM › ตั้งค่า › API" (ใบ C1.10)
// 🔴 ไฟล์บริสุทธิ์: ไม่แตะ prisma/env/facade — `CrmApiSettings.tsx` ('use client') import ได้ และ `actions.ts` ("use server")
//    ห้าม export type (บทเรียน M2.2 · หน้า 500) ⇒ ชนิดผลลัพธ์ของ action อยู่ที่นี่

export type CrmApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  bundleLabel: string;
  /** ป้ายตัวกรองของคีย์ ("ทีมภูเก็ต" · "เฉพาะของ …") — null = ไม่กรอง */
  filterLabel: string | null;
  expiresLabel: string;
  lastUsedLabel: string;
};

export type CrmApiToolRow = { name: string; kind: "read" | "write" | "danger"; scope: string; label: string };

export type CrmWebhookRow = { id: string; url: string; events: string[]; active: boolean; lastLabel: string | null; lastStatus: "OK" | "FAILED" | null };

export type CrmWebhookDeliveryRow = { id: string; endpointId: string; eventType: string; status: "OK" | "FAILED"; attempts: number; lastError: string | null; atLabel: string };

export type CrmKeyResult = { ok: true; rawKey: string } | { ok: false; reason: string };
export type CrmActionResult = { ok: true } | { ok: false; reason: string };
export type CrmWebhookCreateResult = { ok: true; id: string; secret: string } | { ok: false; reason: string };

/** ชุดสิทธิ์ที่หน้านี้ออกให้ได้ (id ตรงกับ `API_SCOPE_BUNDLES` ของ scopes.ts) + คำอธิบายไทย */
export const CRM_KEY_BUNDLES: readonly { id: "crm.readonly" | "crm.operate" | "crm.admin"; label: string; help: string }[] = [
  { id: "crm.readonly", label: "อ่านอย่างเดียว", help: "อ่านผู้ติดต่อ บริษัท ดีล กิจกรรม และรายการวัตถุ · เบอร์และอีเมลถูกปิดบังเสมอ · เขียนอะไรไม่ได้" },
  { id: "crm.operate", label: "งานพนักงานขาย", help: "อ่านได้ทั้งหมด + เพิ่ม/แก้ผู้ติดต่อ บริษัท ดีล กิจกรรม รายการสินค้า ใบเสนอราคา · ไม่มีตั้งค่า รวม ลบ หรือส่งออก" },
  { id: "crm.admin", label: "ผู้ดูแล", help: "ทำได้ทุกอย่างของ CRM รวมตั้งค่า ทีมขาย รวม/เก็บถาวร ลบดีล ส่งออก และโอนดีลข้ามทีม" },
];
