// SVC H.1 ▸ จอตั้งค่าโรงแรม (/hotel/settings · แบบหอ 17 = การ์ดกริด 3 คอลัมน์ + เมนูซ้าย) — ผังการ์ดและข้อความ (ใบสั่ง h.1 §6)
//   pure ล้วน (ไม่มี directive · ไม่ import) · ทั้งเซิร์ฟเวอร์ (hotel-settings.ts) และ client (HotelSettings.tsx) ใช้ไฟล์นี้
//   คีย์ค่าตั้งของจอนี้พิมพ์ที่นี่ที่เดียว (ไฟล์ .tsx ไม่มีคีย์)

export type HotelSettingsCardKey =
  | "checkin"
  | "booking"
  | "deposit"
  | "tax"
  | "securityDeposit"
  | "guest"
  | "notify"
  | "storefront"
  | "housekeeping"
  | "ota"
  | "planOnly"
  | "general";
/** planLinkTh = การ์ดนี้มีค่าที่ตั้งได้เฉพาะชั้นแผนราคา (เช่น ขั้นบันไดยกเลิก chain RATE_PLAN) ⇒ ชั้นทั้งโรงแรมแสดงลิงก์ไปตั้งต่อแผน */
export type HotelSettingsCard = { key: HotelSettingsCardKey; labelTh: string; fieldKeys: string[]; noteTh: string | null; planLinkTh?: string };

/** การ์ดตามลำดับในจอ (9 ใบแรกตามใบสั่ง §6 · ต่อด้วย OTA · ค่าเฉพาะแผน · ทั่วไป) — การ์ดที่ไม่มีช่องในชั้นที่เปิดอยู่ไม่แสดง */
export const HOTEL_SETTINGS_CARDS: HotelSettingsCard[] = [
  { key: "checkin", labelTh: "เช็กอิน/เอาต์", fieldKeys: ["rooms.hotel.checkInTime", "rooms.hotel.checkOutTime", "rooms.hotel.dailyHousekeeping", "rooms.hotel.inspectionRequired", "rooms.hotel.nightAuditTime", "rooms.hotel.checkout.allowLegacyCash", "rooms.hotel.folio.manualItemMaxSatang"], noteTh: null }, // SVC H.5 ▸ + คีย์เช็กเอาต์/บิลระหว่างพัก 2 ตัว ◂
  {
    key: "booking",
    labelTh: "การจอง",
    fieldKeys: ["rooms.hotel.bookingMode", "rooms.hotel.holdMinutesOnline", "rooms.hotel.holdMinutesCounter", "rooms.hotel.maxAdvanceBookingDays", "rooms.hotel.codePrefix", "rooms.hotel.noShow", "rooms.hotel.defaultRatePlan", "rooms.hotel.weekendDays"],
    noteTh: null,
  },
  { key: "deposit", labelTh: "มัดจำ & ยกเลิก", fieldKeys: ["rooms.hotel.deposit", "rooms.hotel.cancelPolicy"], noteTh: "แผนราคาทับค่านี้ได้ (ตั้งที่แผนราคา หรือเลือก «ตั้งเฉพาะแผนราคา»)", planLinkTh: "ขั้นบันไดยกเลิก: ตั้งต่อแผนราคา" },
  { key: "tax", labelTh: "ภาษี", fieldKeys: ["rooms.hotel.tax.mode", "rooms.hotel.tax.vatBp", "rooms.hotel.tax.serviceChargeBp", "rooms.hotel.tax.invoiceFromPos"], noteTh: "เปลี่ยนโหมดภาษีมีผลกับการจองใหม่ — การจองเดิมใช้ค่าตอนจอง" },
  { key: "securityDeposit", labelTh: "เงินประกันห้อง", fieldKeys: ["rooms.hotel.securityDeposit.enabled", "rooms.hotel.securityDeposit", "rooms.hotel.securityDeposit.appliesTo"], noteTh: null },
  {
    key: "guest",
    labelTh: "ผู้เข้าพัก/PDPA",
    fieldKeys: ["rooms.hotel.guest.retainYears", "rooms.hotel.guest.maskIdForStaff", "rooms.hotel.guest.aiIdReader", "rooms.hotel.rr3OnScreen", "rooms.hotel.tm30ReminderHours"],
    noteTh: null,
  },
  { key: "notify", labelTh: "แจ้งแขก", fieldKeys: ["rooms.hotel.notify.channel"], noteTh: null },
  { key: "storefront", labelTh: "หน้าจอง", fieldKeys: ["rooms.hotel.storefront.customDomain"], noteTh: null },
  { key: "housekeeping", labelTh: "แม่บ้าน", fieldKeys: ["rooms.hotel.housekeepingChecklist", "rooms.hotel.minibar"], noteTh: "แสดงอย่างเดียว — เปิดแก้เมื่อระบบแม่บ้านพร้อม" },
  { key: "ota", labelTh: "ช่องทางขายห้อง (OTA)", fieldKeys: ["rooms.hotel.ota.enabled", "rooms.hotel.ota.roomScope", "rooms.hotel.ota.buffer", "rooms.hotel.ota.markupBp", "rooms.hotel.ota.onConflict"], noteTh: null },
  { key: "planOnly", labelTh: "ราคาเฉพาะแผน/ประเภท", fieldKeys: ["rooms.hotel.minNights", "rooms.hotel.closedToArrival", "rooms.hotel.baseRate", "rooms.hotel.dayOfWeekAdjustBp"], noteTh: null },
  { key: "general", labelTh: "ทั่วไป", fieldKeys: ["rooms.money.rounding", "rooms.locale.docLanguage", "rooms.legal.mode"], noteTh: null },
];

/** กลุ่มของทะเบียนที่จอนี้โหลด (domain rooms) */
export const HOTEL_SETTINGS_GROUPS = ["hotel", "ota", "money", "locale", "legal"];

/** ช่องที่จอนี้แสดงอย่างเดียว + เหตุผล (แก้ที่อื่น/ยังไม่เปิด) */
export const HOTEL_READONLY_KEYS: Record<string, string> = {
  "rooms.legal.mode": "โหมดกฎหมายเปลี่ยนได้ที่หน้าโหมดกฎหมายของกิจการ (เฉพาะเจ้าของ)",
  "rooms.hotel.guest.aiIdReader": "ปิดไว้ — ต้องเชื่อมตัวต่ออ่านบัตรก่อน จึงเปิดใช้ได้",
  "rooms.hotel.housekeepingChecklist": "แสดงอย่างเดียว — เปิดแก้เมื่อระบบแม่บ้านพร้อม",
  "rooms.hotel.minibar": "แสดงอย่างเดียว — เปิดแก้เมื่อระบบแม่บ้านพร้อม",
};

/** ช่องที่มีลิงก์ไปหน้าอื่น */
export const HOTEL_FIELD_LINKS: Record<string, { href: string; labelTh: string }> = {
  "rooms.hotel.storefront.customDomain": { href: "/app/settings/domain", labelTh: "ตั้งโดเมนของร้าน" },
};

/** ชั้นที่จอนี้เปิดได้ */
export type HotelSettingsScope = "UNIT" | "RATE_PLAN" | "ROOM_TYPE";
export const HOTEL_SCOPE_LABEL_TH: Record<HotelSettingsScope, string> = { UNIT: "ทั้งโรงแรม", RATE_PLAN: "ตั้งเฉพาะแผนราคา", ROOM_TYPE: "ตั้งเฉพาะประเภทห้อง" };

/** ทุกคีย์ของจอ */
export const HOTEL_SETTINGS_KEYS: string[] = HOTEL_SETTINGS_CARDS.flatMap((c) => c.fieldKeys);
