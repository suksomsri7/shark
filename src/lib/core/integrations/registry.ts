// registry.ts — แค็ตตาล็อกศูนย์เชื่อมต่อ (SVC R0.5 · CC §2.1) — บริสุทธิ์ (ไม่มี I/O) · อ่าน env ตอนเรียก
// 9 ชนิด = LINE_OA · PROMPTPAY (เสมือน) + 7 ชนิดเก็บ · ready เฉพาะ LINE_OA/PROMPTPAY/SLIP_VERIFY (ที่เหลือ "เร็ว ๆ นี้")
// ผู้ให้บริการจริงเจ้าแรก (ตรวจสลิป) มากับใบ C.1 — วันนี้มีแค่ FAKE (เปิดเฉพาะ QC)
import type { CatalogEntry, IntegrationKind, ProviderDef, StoredIntegrationKind, VirtualIntegrationKind } from "./types";
import { STORED_INTEGRATION_KINDS, VIRTUAL_INTEGRATION_KINDS } from "./types";
import { FAKE_PROVIDER, fakeProviderEnabled } from "./providers/fake";

export type IntegrationGroup = "PAYMENT" | "MESSAGING" | "CHANNELS";

type KindMeta = { label: string; desc: string; ready: boolean; group: IntegrationGroup; short: string };

export const INTEGRATION_KIND_META: Record<IntegrationKind, KindMeta> = {
  PROMPTPAY: { label: "QR พร้อมเพย์", desc: "รับเงินโอนด้วย QR ยอดตรง · ไม่ต้องสมัคร", ready: true, group: "PAYMENT", short: "PP" },
  SLIP_VERIFY: { label: "ตรวจสลิปอัตโนมัติ", desc: "เลือกผู้ให้บริการแล้วใส่คีย์ · ไม่เชื่อม = ตรวจด้วยมือ", ready: true, group: "PAYMENT", short: "สลิป" },
  PAYMENT_GATEWAY: { label: "เกตเวย์รับเงิน", desc: "QR/บัตร ยืนยันอัตโนมัติ (เช่น Beam)", ready: false, group: "PAYMENT", short: "เงิน" },
  EDC: { label: "เครื่องรูดบัตร (EDC)", desc: "ผ่านเครื่องคิดเงิน", ready: false, group: "PAYMENT", short: "บัตร" },
  LINE_OA: { label: "LINE OA ของร้าน", desc: "ผูกลูกค้าผ่านแชทของร้าน · ส่งใบนัด/แจ้งเตือน", ready: true, group: "MESSAGING", short: "LINE" },
  SMS: { label: "SMS", desc: "ใส่คีย์ผู้ให้บริการ SMS ที่ร้านสมัคร · ใช้เมื่อลูกค้าไม่มี LINE", ready: false, group: "MESSAGING", short: "SMS" },
  CHANNEL_MANAGER: { label: "ช่องทางขายห้อง (OTA)", desc: "Agoda · Booking.com ผ่าน channel manager", ready: false, group: "CHANNELS", short: "OTA" },
  CALENDAR: { label: "ปฏิทินภายนอก (Google Calendar)", desc: "นัดขึ้นปฏิทินส่วนตัวของช่าง", ready: false, group: "CHANNELS", short: "G" },
  METER: { label: "มิเตอร์อัจฉริยะ", desc: "อ่านค่าน้ำไฟอัตโนมัติ", ready: false, group: "CHANNELS", short: "%" },
};

export const INTEGRATION_GROUPS: { group: IntegrationGroup; label: string; hint: string }[] = [
  { group: "PAYMENT", label: "รับเงิน", hint: "มัดจำ · บิล · ลิงก์จ่าย" },
  { group: "MESSAGING", label: "ส่งข้อความหาลูกค้า", hint: "ใบนัด · เตือน · บัตรคิว" },
  { group: "CHANNELS", label: "ช่องทางขายและอุปกรณ์", hint: "ปฏิทิน · OTA · มิเตอร์" },
];

/** ลำดับแค็ตตาล็อก (9 ชนิด) */
export const CATALOG_ORDER: readonly IntegrationKind[] = [...VIRTUAL_INTEGRATION_KINDS, ...STORED_INTEGRATION_KINDS];

export function isStoredKind(kind: unknown): kind is StoredIntegrationKind {
  return typeof kind === "string" && (STORED_INTEGRATION_KINDS as readonly string[]).includes(kind);
}
export function isVirtualKind(kind: unknown): kind is VirtualIntegrationKind {
  return typeof kind === "string" && (VIRTUAL_INTEGRATION_KINDS as readonly string[]).includes(kind);
}

/** ผู้ให้บริการทั้งหมดที่เปิดอยู่ตอนนี้ (อ่าน env ตอนเรียก) */
function enabledProviders(): ProviderDef[] {
  const out: ProviderDef[] = [];
  if (fakeProviderEnabled()) out.push(FAKE_PROVIDER);
  return out;
}

export function providersFor(kind: StoredIntegrationKind): ProviderDef[] {
  return enabledProviders().filter((p) => p.kinds.includes(kind));
}

/** ผู้ให้บริการของชนิดนี้ — ไม่รู้จัก/ปิดอยู่ = null */
export function providerDef(kind: unknown, code: unknown): ProviderDef | null {
  if (!isStoredKind(kind) || typeof code !== "string") return null;
  return providersFor(kind).find((p) => p.code === code) ?? null;
}

export function integrationCatalog(): CatalogEntry[] {
  return CATALOG_ORDER.map((kind) => {
    const meta = INTEGRATION_KIND_META[kind];
    return {
      kind,
      label: meta.label,
      ready: meta.ready,
      virtual: isVirtualKind(kind),
      providers: isStoredKind(kind) ? providersFor(kind).map((p) => ({ code: p.code, label: p.label, fields: p.fields.map((f) => ({ ...f })) })) : [],
    };
  });
}
