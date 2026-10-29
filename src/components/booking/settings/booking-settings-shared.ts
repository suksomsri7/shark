// ─────────────────────────────────────────────────────────────
// booking-settings-shared.ts — ตำแหน่งช่องค่าตั้งบนจอตั้งค่าจองคิว + ชนิดโมเดล 4 หน้า (pure) · SVC B.11 ใบสั่ง §3 §4
//
// 🔴 กติกาเหล็ก #16: แถวค่าตั้งทุกแถวมาจาก loadSettingsForm — ไฟล์นี้บอกแค่ "กลุ่มไหนอยู่การ์ดไหน/หน้าไหน"
//    (คีย์ค่าตั้งที่ต้องระบุตรงตัวมีที่นี่ที่เดียว · ไฟล์ .tsx ห้ามมีคีย์ "booking.<กลุ่ม>.<ชื่อ>")
// 🔴 pure ล้วน: ไม่มี directive · import ได้เฉพาะ `import type`
// 🔴 โมเดลเป็น JSON ล้วน (ไม่มี function/Date/zod) — ส่งเป็น prop ของ client component ได้
// ─────────────────────────────────────────────────────────────
import type { SettingsField, SettingsFormModel } from "@/components/settings/settings-shared";

export type BookingCardKey = "booking" | "late" | "deposit" | "queue" | "money" | "notify" | "general" | "course" | "payments";
export type DomainGroup = { domain: string; group?: string };
export type BookingSettingsPage = "policy" | "messages" | "services" | "staff";

export type PolicyCardDef = {
  key: BookingCardKey;
  no: number;
  column: "left" | "right";
  labelTh: string;
  /** group ไม่ระบุ = ทุกกลุ่มของ domain */
  groups: DomainGroup[];
  extraKeys?: string[];
  excludeKeys?: string[];
};

export const BOOKING_SETTINGS_LAYOUT: {
  policyCards: PolicyCardDef[];
  messagesKeys: { messages: DomainGroup[]; msgSettingsKeys: string[]; kioskEditableKeys: string[] };
  servicesShopGroups: DomainGroup[];
  servicesShopExtraKeys: string[];
  staffShopGroups: DomainGroup[];
  staffShopExtraKeys: string[];
  servicePanelExclude: string[];
  /** คีย์ที่หน้า 14 ใช้ทำรายการข้อความ (เปิด/ปิดรายชนิด) */
  msgEnabledKey: string;
  /** prefix ของคีย์ข้อความรายชนิด (`<prefix><kind>`) */
  msgKeyPrefix: string;
  /** แถวค่าตั้งที่ตัวห่อหน้า 14 วาดเป็นการ์ดทีวี/ตู้ (กลุ่ม DEVICE) */
  deviceGroups: { tv: string; kiosk: string };
  privacyGroup: DomainGroup;
} = {
  policyCards: [
    { key: "booking", no: 1, column: "left", labelTh: "เวลาและการจอง", groups: [{ domain: "booking", group: "booking" }] },
    { key: "late", no: 2, column: "left", labelTh: "มาสาย · ไม่มา · ยกเลิก", groups: [{ domain: "booking", group: "late" }] },
    { key: "deposit", no: 3, column: "right", labelTh: "มัดจำ", groups: [{ domain: "booking", group: "deposit" }] },
    {
      key: "queue",
      no: 4,
      column: "left",
      labelTh: "walk-in และลำดับคิว",
      groups: [{ domain: "booking", group: "queue" }],
      excludeKeys: ["booking.queue.walkInPickStaff"],
    },
    { key: "money", no: 5, column: "right", labelTh: "ค่าคอมมิชชัน", groups: [{ domain: "booking", group: "money" }] },
    {
      key: "notify",
      no: 6,
      column: "right",
      labelTh: "แจ้งเตือนและหน้าจอ",
      groups: [{ domain: "booking", group: "notify" }],
      extraKeys: ["messaging.channelOrder"],
    },
    { key: "general", no: 7, column: "left", labelTh: "ทั่วไป", groups: [{ domain: "booking", group: "general" }] },
    { key: "course", no: 8, column: "right", labelTh: "คอร์ส", groups: [{ domain: "booking", group: "course" }] },
    { key: "payments", no: 9, column: "right", labelTh: "รับเงินและตรวจสลิป", groups: [{ domain: "payments" }] },
  ],
  messagesKeys: {
    messages: [{ domain: "booking", group: "msg" }],
    msgSettingsKeys: ["messaging.lineConnectionId", "messaging.quietHours"],
    kioskEditableKeys: ["booking.queue.walkInPickStaff"],
  },
  servicesShopGroups: [{ domain: "booking", group: "service" }],
  servicesShopExtraKeys: ["booking.money.commissionRate", "booking.deposit.amount"],
  staffShopGroups: [{ domain: "booking", group: "staff" }],
  staffShopExtraKeys: ["booking.booking.onlineSharePct"],
  servicePanelExclude: ["booking.service.cleanupMin", "booking.service.onlineBookable"],
  msgEnabledKey: "booking.msg.enabled",
  msgKeyPrefix: "booking.msg.",
  deviceGroups: { tv: "display", kiosk: "kiosk" },
  privacyGroup: { domain: "booking", group: "privacy" },
};

/** คำอธิบายสั้นบนการ์ดแม่แบบ (1–3 บรรทัด) — แม่แบบที่ไม่อยู่ที่นี่ใช้บรรทัดกลาง */
export const BOOKING_TEMPLATE_SUMMARY_TH: Record<string, { tagTh: string; lines: string[] }> = {
  BARBER: { tagTh: "คน + เก้าอี้ประจำ · walk-in เยอะ", lines: ["จองออนไลน์ 60% ของเวลาช่าง", "มัดจำ: บริการ ≥ 90 นาที 20%", "แถวเดียว · walk-in แทรกช่องเล็กได้"] },
  SPA: { tagTh: "หมอนวด + เตียง/ห้อง · คู่รัก · คอร์ส", lines: ["ต้องว่างทั้งคนและห้อง · เก็บห้อง 15 นาที", "มัดจำ: ห้องคู่/โปร ตั้งรายบริการ", "เปิดคอร์สหลายครั้ง"] },
  CLINIC: { tagTh: "หมอ + ห้องตรวจ · ไม่มีเวชระเบียนในระบบนี้", lines: ["ร้านยืนยันนัดก่อน · ไม่เก็บมัดจำ", "ไม่แสดงอาการ/ชื่อบนจอ", "นัดก่อน walk-in เสมอ"] },
};

// ───────────────────────── ตัวช่วยตำแหน่ง ─────────────────────────

const inGroups = (f: Pick<SettingsField, "domain" | "group">, gs: readonly DomainGroup[]): boolean =>
  gs.some((g) => g.domain === f.domain && (g.group === undefined || g.group === f.group));

/** ช่องของการ์ด (ลำดับตามโมเดลฟอร์ม = ลำดับทะเบียน · extraKeys ต่อท้าย) */
export function cardFieldKeys(card: PolicyCardDef, fields: readonly SettingsField[]): string[] {
  const ex = new Set(card.excludeKeys ?? []);
  const base = fields.filter((f) => inGroups(f, card.groups) && !ex.has(f.key)).map((f) => f.key);
  const extra = (card.extraKeys ?? []).filter((k) => fields.some((f) => f.key === k) && !base.includes(k));
  return [...base, ...extra];
}

/** คีย์ชั้น UNIT ที่หน้า 14 แสดง (ข้อความ + ช่องทาง LINE/เวลางดส่ง + walk-in เลือกช่างในการ์ดตู้) */
export function messagesUnitKeys(fields: readonly SettingsField[]): string[] {
  const L = BOOKING_SETTINGS_LAYOUT.messagesKeys;
  const extra = new Set([...L.msgSettingsKeys, ...L.kioskEditableKeys]);
  return fields.filter((f) => inGroups(f, L.messages) || extra.has(f.key)).map((f) => f.key);
}

/** ช่องของกล่องค่าร้านหน้า 11/12 */
export function shopFieldKeys(page: "services" | "staff", fields: readonly SettingsField[]): string[] {
  const L = BOOKING_SETTINGS_LAYOUT;
  const gs = page === "services" ? L.servicesShopGroups : L.staffShopGroups;
  const extra = new Set(page === "services" ? L.servicesShopExtraKeys : L.staffShopExtraKeys);
  return fields.filter((f) => inGroups(f, gs) || extra.has(f.key)).map((f) => f.key);
}

/** ช่องนี้อยู่หน้าไหน (สำหรับรายการ "ดูเฉพาะที่ปรับ") */
export function pageOfKey(f: Pick<SettingsField, "key" | "domain" | "group">, fields: readonly SettingsField[]): BookingSettingsPage {
  const L = BOOKING_SETTINGS_LAYOUT;
  if (L.policyCards.some((c) => cardFieldKeys(c, fields).includes(f.key))) return "policy";
  if (messagesUnitKeys(fields).includes(f.key)) return "messages";
  if (inGroups(f, L.staffShopGroups)) return "staff";
  if (inGroups(f, L.servicesShopGroups)) return "services";
  return "policy";
}

export const fieldsOf = (form: SettingsFormModel | null | undefined): SettingsField[] => (form ? form.groups.flatMap((g) => g.fields) : []);

/** นาทีจากเที่ยงคืน → "13" / "13:30" */
export function hourText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, "0")}`;
}

export const WEEKDAY_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."] as const;

// ───────────────────────── ชนิดโมเดล (§4) ─────────────────────────

type PageBase = {
  unitId: string;
  unitName: string;
  /** `/app/u/<slug>/booking` */
  basePath: string;
  providerLabel: string;
  /** มีช่องแก้ได้อย่างน้อย 1 */
  canEdit: boolean;
};

export type BookingTemplateCard = { key: string; labelTh: string; active: boolean; hidden: boolean; tagTh: string; summaryTh: string[] };

export type PolicyModel = PageBase & {
  page: "policy";
  form: SettingsFormModel;
  template: { key: string; labelTh: string } | null;
  templates: BookingTemplateCard[];
  diffCount: number;
  diffKeys: string[];
  diffLinks: Record<string, BookingSettingsPage>;
  cards: { key: BookingCardKey; no: number; column: "left" | "right"; labelTh: string; fieldKeys: string[] }[];
  canApplyTemplate: boolean;
};

export type DeviceRow =
  | { key: string; labelTh: string; valueTh: string; editable: false; lockedReasonTh: string }
  | SettingsField;

export type RoleColumn = "OWNER" | "LEAD" | "PROVIDER" | "CASHIER" | "ASSISTANT";

export type MessagesModel = PageBase & {
  page: "messages";
  form: SettingsFormModel;
  tenantForm: SettingsFormModel | null;
  msgKinds: { kind: string; labelTh: string; enabled: boolean; key: string; hintTh: string }[];
  selectedKind: string;
  preview: { th: string };
  /** ค่าตัวอย่างของตัวแปร (ตัวอย่าง LINE ตอนกำลังแก้ข้อความฝั่งจอ) */
  previewVars: Record<string, string>;
  devices: { tv: DeviceRow[]; kiosk: DeviceRow[] };
  roles: {
    columns: { role: RoleColumn; labelTh: string }[];
    rows: { id: string; labelTh: string; cells: Partial<Record<RoleColumn, boolean>> }[];
    applyTargets: { membershipId: string; nameTh: string }[] | null;
  };
};

export type ServiceRow = {
  id: string;
  name: string;
  durationMin: number;
  bufferMin: number;
  priceSatang: number;
  depositSatang: number;
  requiresTh: string;
  canCount: number;
  staffTotal: number;
  bookable: boolean;
  walkIn: boolean;
};

export type ServicesModel = PageBase & {
  page: "services";
  shopForm: SettingsFormModel;
  serviceForm: SettingsFormModel | null;
  rows: ServiceRow[];
  selectedId: string | null;
  who: { staffId: string; name: string; can: boolean; priceSatang: number | null; durationMin: number | null }[];
  canEditService: boolean;
  canEditMoney: boolean;
  canEditWho: boolean;
};

export type HoursSource = "HR_SHIFT" | "STAFF_WEEKLY" | "UNIT_HOURS";

export type StaffRow = {
  id: string;
  name: string;
  hoursSource: HoursSource;
  onlinePct: number;
  servicesTh: string;
  commissionBp: number | null;
  linked: boolean;
};

export type StaffModel = PageBase & {
  page: "staff";
  shopForm: SettingsFormModel;
  staffForm: SettingsFormModel | null;
  rows: StaffRow[];
  selectedId: string | null;
  week: { weekday: number; startMin: number | null; endMin: number | null }[];
};

export type BookingSettingsModel = PolicyModel | MessagesModel | ServicesModel | StaffModel;

export const HOURS_SOURCE_TH: Record<HoursSource, string> = {
  HR_SHIFT: "กะจากระบบพนักงาน",
  STAFF_WEEKLY: "ตารางประจำสัปดาห์",
  UNIT_HOURS: "ตามเวลาร้าน",
};
