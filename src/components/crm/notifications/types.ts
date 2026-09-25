// types.ts — ชนิดข้อมูลของหน้า "ตั้งค่าการแจ้งเตือน" CRM v2 (ใบ C2.10 · พิมพ์เขียว §7.4 · มติ C22)
//
// 🔴 ด่าน F2.3: `src/components/**` ล้วงโมดูล CRM ไม่ได้ ⇒ ทะเบียนช่องทาง/เทมเพลต/ป้ายไทย ถูกแปลงเป็น props
//    ที่หน้า (`src/app/app/sys/[id]/crm/settings/notifications/page.tsx`) ซึ่งอยู่ใน self-dir ของ CRM
//    ⇒ ไฟล์นี้เป็น "รูปร่างของ props" เท่านั้น ไม่ใช่ทะเบียนที่สอง (ค่าจริงมาจาก `crm/notifications-shared.ts`)

export type CrmNotifyChannelKey = "IN_APP" | "PUSH" | "EMAIL";

export type CrmNotifyChannelFlags = Record<CrmNotifyChannelKey, boolean>;

export type CrmNotifyTemplateRow = {
  key: string;
  label: string;
  title: string;
  body: string;
  digest: boolean;
  recipients: string;
  /** ค่าของร้าน (เปิด/ปิดต่อช่องทาง) */
  channels: CrmNotifyChannelFlags;
  /** ค่าที่ "ฉัน" ตั้งทับ — ไม่มีคีย์ = ใช้ค่าร้าน */
  mine: Partial<CrmNotifyChannelFlags>;
};

export type CrmNotifyQuiet = { enabled: boolean; from: string; to: string };

export type CrmNotifyPageData = {
  systemId: string;
  /** ผู้ดูมีคีย์ `crm.settings.manage` ไหม — ไม่มี = เห็นแต่แท็บ "ของฉัน" */
  canManageShop: boolean;
  templates: CrmNotifyTemplateRow[];
  channels: { key: CrmNotifyChannelKey; label: string }[];
  shopQuiet: CrmNotifyQuiet;
  digestHour: number;
  /** ช่วงห้ามรบกวนของฉัน — null = ใช้ของร้าน */
  myQuiet: CrmNotifyQuiet | null;
};

export type CrmNotifyActionResult = { ok: true } | { ok: false; error: string; code?: string };

export type CrmNotifyActions = {
  setChannel: (systemId: string, key: string, channel: string, on: boolean) => Promise<CrmNotifyActionResult>;
  setShop: (systemId: string, patch: { quietHours?: CrmNotifyQuiet; digestHour?: number }) => Promise<CrmNotifyActionResult>;
  setMyChannel: (systemId: string, key: string, channel: string, on: boolean) => Promise<CrmNotifyActionResult>;
  setMyQuiet: (systemId: string, patch: { quietHours: CrmNotifyQuiet | null }) => Promise<CrmNotifyActionResult>;
};
