// svc-qc-data.mts — สัญญาข้อมูล QC ของ RUN SVC (ใบ R0.2) · `SQC`
//
// แหล่งเดียวของ id · slug · อีเมล · ตัวเลขร้านตัวอย่าง — seed / smoke / visual อ่านจากที่นี่ที่เดียว
// ที่มา: ledger/svc-briefs/svc-brief-r0.2.md §3 · ledger/design-booking/README.md (+ ภาพ 11/12) · ledger/design-dorm/README.md
//
// 🔴 ไฟล์นี้เป็นค่าล้วน — ห้าม import prisma / `@/…` (fitness/ข้อสอบ static ต้อง import ได้โดยไม่มี env)
// 🔴 เงินเป็นสตางค์ · เวลาเป็นนาทีนับจากเที่ยงคืน · weekday 0 = อาทิตย์ … 6 = เสาร์ (ตาม BookingHours)
// 🔴 ค่าที่ "ยังไม่มีคอลัมน์" (เตียง/ห้องนวด · ค่าส่วนกลาง · ราคา ศ.–ส. · % จองออนไลน์ ฯลฯ) เก็บไว้ใน `pending` —
//    ใบที่สร้างตาราง/ค่าตั้งนั้น (B.0 · B.13 · R0.3 · D.x) ย้ายไปลงฐานเอง · seed ใบนี้ไม่เขียน

export const SQC_TAG = "svcqc";

// ═══════════════ ร้าน A (ร้านตัวอย่างหลัก) ═══════════════
export const SQC_TENANT = { id: "svcqc-tenant", slug: "svc-qc", name: "SVC QC" } as const;

export type SqcUnitKey = "barber" | "massage" | "dorm" | "hotel";
export type SqcUnit = { id: string; type: "BOOKING" | "DORM" | "HOTEL"; slug: string; name: string };
export const SQC_UNITS: Record<SqcUnitKey, SqcUnit> = {
  barber: { id: "svcqc-unit-barber", type: "BOOKING", slug: "barber-ari", name: "บาร์เบอร์ลุงหนวด สาขาอารีย์" },
  massage: { id: "svcqc-unit-massage", type: "BOOKING", slug: "massage-baitoey", name: "บ้านนวดใบเตย สุขุมวิท 49" },
  dorm: { id: "svcqc-unit-dorm", type: "DORM", slug: "bansuan-apartment", name: "บ้านสวนอพาร์ตเมนต์" },
  hotel: { id: "svcqc-unit-hotel", type: "HOTEL", slug: "bansuan-hotel", name: "บ้านสวน โฮเทล" },
};

/** ระบบที่ผูก barber + massage (บริการต้นฉบับอยู่ INVENTORY · POS = ขายหน้าร้าน) */
export const SQC_SYSTEMS = {
  INVENTORY: { id: "svcqc-sys-inv", type: "INVENTORY", name: "สินค้า/บริการ (SVC QC)" },
  POS: { id: "svcqc-sys-pos", type: "POS", name: "ขายหน้าร้าน (SVC QC)" },
} as const;
export const SQC_SYSTEM_UNITS: SqcUnitKey[] = ["barber", "massage"];

// ═══════════════ บาร์เบอร์ ═══════════════
/** เวลาทำการร้าน: จ. (1) ปิด · วันอื่น 10:00–20:00 */
export const SQC_BARBER_HOURS: { weekday: number; openMin: number; closeMin: number; closed: boolean }[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
  weekday === 1 ? { weekday, openMin: 600, closeMin: 1200, closed: true } : { weekday, openMin: 600, closeMin: 1200, closed: false },
);

export type SqcStaff = { id: string; name: string; sortOrder: number; hours?: { startMin: number; endMin: number; weekdays: number[] } };
const TUE_SUN = [0, 2, 3, 4, 5, 6];
/** ช่าง 4 คน · sortOrder = เลขเก้าอี้ · employeeId null (ผูก HR ภายหลัง) */
export const SQC_BARBER_STAFF: SqcStaff[] = [
  { id: "svcqc-staff-barber-ek", name: "ช่างเอก", sortOrder: 1, hours: { startMin: 600, endMin: 1200, weekdays: TUE_SUN } },
  { id: "svcqc-staff-barber-boy", name: "ช่างบอย", sortOrder: 2, hours: { startMin: 600, endMin: 1200, weekdays: TUE_SUN } },
  { id: "svcqc-staff-barber-nun", name: "ช่างนุ่น", sortOrder: 3, hours: { startMin: 600, endMin: 1200, weekdays: TUE_SUN } },
  { id: "svcqc-staff-barber-jack", name: "ช่างแจ๊ค", sortOrder: 4, hours: { startMin: 780, endMin: 1200, weekdays: TUE_SUN } }, // พาร์ทไทม์ 13–20
];

export type SqcService = { sku: string; name: string; durationMin: number; priceSatang: number; depositSatang: number; bufferMin: number };
/** บริการ (ชื่อตามภาพ) — ต้นฉบับ = InvItem kind SERVICE ใน svcqc-sys-inv · BookingService = projection */
export const SQC_BARBER_SERVICES: SqcService[] = [
  { sku: "SVCQC-BB-01", name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, depositSatang: 0, bufferMin: 0 },
  { sku: "SVCQC-BB-02", name: "ตัด + สระ", durationMin: 60, priceSatang: 35000, depositSatang: 0, bufferMin: 0 },
  { sku: "SVCQC-BB-03", name: "ตัดเด็ก", durationMin: 30, priceSatang: 18000, depositSatang: 0, bufferMin: 0 },
  { sku: "SVCQC-BB-04", name: "โกน/แต่งหนวด", durationMin: 20, priceSatang: 12000, depositSatang: 0, bufferMin: 0 },
  { sku: "SVCQC-BB-05", name: "ทำสีผม", durationMin: 90, priceSatang: 90000, depositSatang: 20000, bufferMin: 0 },
  { sku: "SVCQC-BB-06", name: "ดัดผม", durationMin: 120, priceSatang: 150000, depositSatang: 30000, bufferMin: 0 },
];

// ═══════════════ ร้านนวด ═══════════════
/** หมอนวด 6 คน (พี่ศรีลาพักร้อน = B.1/HR · ไม่ seed การลา) */
export const SQC_MASSAGE_STAFF: SqcStaff[] = [
  { id: "svcqc-staff-massage-daeng", name: "พี่แดง", sortOrder: 1 },
  { id: "svcqc-staff-massage-nok", name: "พี่นก", sortOrder: 2 },
  { id: "svcqc-staff-massage-jan", name: "พี่จันทร์", sortOrder: 3 },
  { id: "svcqc-staff-massage-fai", name: "น้องฝ้าย", sortOrder: 4 },
  { id: "svcqc-staff-massage-may", name: "น้องเมย์", sortOrder: 5 },
  { id: "svcqc-staff-massage-sri", name: "พี่ศรี", sortOrder: 6 },
];
/** bufferMin = เวลาเก็บห้อง (ภาพ 11) */
export const SQC_MASSAGE_SERVICES: SqcService[] = [
  { sku: "SVCQC-MS-01", name: "นวดไทย", durationMin: 60, priceSatang: 35000, depositSatang: 0, bufferMin: 5 },
  { sku: "SVCQC-MS-02", name: "นวดไทย+ประคบ", durationMin: 120, priceSatang: 80000, depositSatang: 0, bufferMin: 10 },
  { sku: "SVCQC-MS-03", name: "นวดเท้า", durationMin: 60, priceSatang: 35000, depositSatang: 0, bufferMin: 0 },
  { sku: "SVCQC-MS-04", name: "น้ำมันอโรมา", durationMin: 90, priceSatang: 90000, depositSatang: 0, bufferMin: 15 },
  { sku: "SVCQC-MS-05", name: "คู่รัก VIP", durationMin: 90, priceSatang: 200000, depositSatang: 50000, bufferMin: 20 },
  { sku: "SVCQC-MS-06", name: "หินร้อน", durationMin: 90, priceSatang: 120000, depositSatang: 30000, bufferMin: 15 },
];

// ═══════════════ หอ (บ้านสวนอพาร์ตเมนต์ · อาคาร A) ═══════════════
export type SqcRoomType = {
  id: string;
  name: string;
  rentMode: "NIGHTLY" | "MONTHLY";
  baseRateSatang: number;
  monthlyRateSatang: number | null;
  areaSqm: number | null;
};
export const SQC_DORM_BUILDING = { id: "svcqc-bld-a", name: "อาคาร A", floors: 3, sortOrder: 1 } as const;
export const SQC_DORM_TYPES = {
  std: { id: "svcqc-rt-dorm-std", name: "ห้องมาตรฐาน", rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: 450000, areaSqm: 24 },
  // README ไม่ระบุพื้นที่ห้องใหญ่ ⇒ null (ไม่แต่งตัวเลข)
  large: { id: "svcqc-rt-dorm-large", name: "ห้องใหญ่ (หัวมุม)", rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: 520000, areaSqm: null },
} as const satisfies Record<string, SqcRoomType>;

export type SqcRoom = { number: string; floorNo: number; typeId: string; rentMode: "MONTHLY" | "NIGHTLY" | null };
/** 101–112 · 201–212 · 301–312 — x01/x12 = ห้องใหญ่ (6) · ที่เหลือมาตรฐาน (30) */
export const SQC_DORM_ROOMS: SqcRoom[] = [1, 2, 3].flatMap((floorNo) =>
  Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return {
      number: `${floorNo}${String(n).padStart(2, "0")}`,
      floorNo,
      typeId: n === 1 || n === 12 ? SQC_DORM_TYPES.large.id : SQC_DORM_TYPES.std.id,
      rentMode: null,
    };
  }),
);

// ═══════════════ โรงแรม (บ้านสวน โฮเทล · อาคาร B) ═══════════════
export const SQC_HOTEL_BUILDING = { id: "svcqc-bld-b", name: "อาคาร B", floors: 2, sortOrder: 1 } as const;
export const SQC_HOTEL_TYPES = {
  superior: { id: "svcqc-rt-hotel-superior", name: "ซูพีเรีย", rentMode: "NIGHTLY", baseRateSatang: 99000, monthlyRateSatang: null, areaSqm: null },
  deluxe: { id: "svcqc-rt-hotel-deluxe", name: "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 129000, monthlyRateSatang: null, areaSqm: null },
  family: { id: "svcqc-rt-hotel-family", name: "แฟมิลี", rentMode: "NIGHTLY", baseRateSatang: 189000, monthlyRateSatang: null, areaSqm: null },
} as const satisfies Record<string, SqcRoomType>;
const hotelRoom = (number: string, typeId: string, rentMode: "MONTHLY" | null = null): SqcRoom => ({ number, floorNo: Number(number[1]), typeId, rentMode });
/** 14 ห้อง · B205 = เช่ารายเดือนผ่านหอ (HotelRoom.rentMode MONTHLY) · ห้องอื่น null = ตามประเภท */
export const SQC_HOTEL_ROOMS: SqcRoom[] = [
  ...["B101", "B102", "B103", "B104"].map((n) => hotelRoom(n, SQC_HOTEL_TYPES.superior.id)),
  ...["B105", "B106", "B107", "B201", "B202", "B203", "B204"].map((n) => hotelRoom(n, SQC_HOTEL_TYPES.deluxe.id)),
  hotelRoom("B205", SQC_HOTEL_TYPES.deluxe.id, "MONTHLY"),
  ...["B206", "B207"].map((n) => hotelRoom(n, SQC_HOTEL_TYPES.family.id)),
];

// ═══════════════ ผู้ใช้ร้าน A ═══════════════
export type SqcUserKey = "owner" | "manager" | "ek" | "cashier" | "fai" | "meter" | "accountant" | "frontdesk";
export type SqcUser = {
  key: SqcUserKey;
  userId: string;
  membershipId: string;
  email: string;
  name: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  unitAccess: string[];
  permissions: Record<string, boolean>;
};
const ALL4 = [SQC_UNITS.barber.id, SQC_UNITS.massage.id, SQC_UNITS.dorm.id, SQC_UNITS.hotel.id];
const user = (key: SqcUserKey, name: string, role: SqcUser["role"], unitAccess: string[], perms: string[] = []): SqcUser => ({
  key,
  userId: `svcqc-user-${key}`,
  membershipId: `svcqc-mb-${key}`,
  email: `svc-qc-${key}@shark.local`,
  name,
  role,
  unitAccess,
  permissions: Object.fromEntries(perms.map((p) => [p, true])),
});
/** สิทธิ์ = ขั้นต่ำตามใบสั่ง §3.2 (ใบหลังเติมเอง เช่น dorm.meter.read ใน D.6) */
export const SQC_USERS: SqcUser[] = [
  user("owner", "เจ้าของ (SVC QC)", "OWNER", ["*"]),
  user("manager", "ผู้จัดการร้าน (SVC QC)", "MANAGER", [SQC_UNITS.barber.id, SQC_UNITS.massage.id]),
  user("ek", "ช่างเอก", "STAFF", [SQC_UNITS.barber.id], ["booking.appointment.setStatus"]),
  user("cashier", "แคชเชียร์ (SVC QC)", "STAFF", [SQC_UNITS.barber.id, SQC_UNITS.massage.id], ["pos.sale.create"]),
  user("fai", "พี่ฝ้าย (ผู้ดูแลหอ)", "STAFF", [SQC_UNITS.dorm.id], ["hotel.room.setStatus"]),
  user("meter", "คนจดมิเตอร์ (SVC QC)", "STAFF", [SQC_UNITS.dorm.id]),
  user("accountant", "ฝ่ายบัญชี (SVC QC)", "STAFF", ALL4, ["account.report.view"]),
  user("frontdesk", "ต้อม (หน้าเคาน์เตอร์)", "STAFF", [SQC_UNITS.hotel.id], ["hotel.reservation.checkIn"]),
];
/** acceptedAt ตายตัว (รันซ้ำไม่ขยับ) */
export const SQC_ACCEPTED_AT = "2026-10-01T00:00:00+07:00";

// ═══════════════ ร้าน B (เจ้าของคนอื่น — ตรวจข้ามร้าน · slug หน่วยซ้ำร้าน A โดยตั้งใจ) ═══════════════
export const SQC_OTHER = {
  tenant: { id: "svcqc-other-tenant", slug: "svc-qc-other", name: "SVC QC (ร้านอื่น)" },
  units: {
    barber: { id: "svcqc-other-unit-barber", type: "BOOKING", slug: "barber-ari", name: "บาร์เบอร์ร้านอื่น (SVC QC)" },
    hotel: { id: "svcqc-other-unit-hotel", type: "HOTEL", slug: "bansuan-hotel", name: "โรงแรมร้านอื่น (SVC QC)" },
  },
  staff: { id: "svcqc-other-staff-ek", name: "ช่างเอก", sortOrder: 1 },
  /** legacy (itemId null) — ร้าน B ไม่มีระบบสินค้า/บริการ */
  service: { id: "svcqc-other-svc-haircut", name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, depositSatang: 0, bufferMin: 0 },
  roomType: { id: "svcqc-other-rt-deluxe", name: "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 129000, monthlyRateSatang: null, areaSqm: null } as SqcRoomType,
  room: { number: "B205", floorNo: 2, typeId: "svcqc-other-rt-deluxe", rentMode: null } as SqcRoom,
  owner: {
    key: "other-owner",
    userId: "svcqc-other-user-owner",
    membershipId: "svcqc-other-mb-owner",
    email: "svc-qc-other-owner@shark.local",
    name: "เจ้าของร้านอื่น (SVC QC)",
    role: "OWNER",
    unitAccess: ["*"],
    permissions: {} as Record<string, boolean>,
  },
} as const;

export const SQC_TENANT_IDS = [SQC_TENANT.id, SQC_OTHER.tenant.id] as const;
export const SQC_EMAILS = [...SQC_USERS.map((u) => u.email), SQC_OTHER.owner.email] as const;

// ═══════════════ ค่าที่ยังไม่มีคอลัมน์ (เก็บรอใบหลัง — seed ไม่เขียน) ═══════════════
export const SQC_PENDING = {
  barber: {
    /** % จองออนไลน์ต่อช่าง (README จอ 01/08) — B.0 ทำเป็นค่าตั้ง */
    onlinePct: { "ช่างเอก": 60, "ช่างบอย": 70, "ช่างนุ่น": 50, "ช่างแจ๊ค": 0 } as Record<string, number>,
    /** เวลาเปิด อ.–อา. 10:00–20:00 เป็นค่าตั้ง (ตอนนี้อยู่ใน BookingHours) — B.0 · CC §6.1 */
    openDays: "อ.–อา. 10:00–20:00",
  },
  massage: {
    /** ทรัพยากร (SvcResource ใบ B.0/B.13) — README: เตียงไทย 5 (ปิดซ่อม 1) · โซฟานวดเท้า 3 · ห้องน้ำมัน A/B · ห้องคู่ VIP 1 · ชุดหินร้อน */
    resources: { thaiBeds: 5, thaiBedsUnderRepair: 1, footSofas: 3, oilRooms: ["A", "B"], vipRooms: 1, hotStoneSets: 1 },
    /** นวดเท้า 30 นาที ฿200 = หลายระยะเวลา (B.0) */
    footMassage30: { durationMin: 30, priceSatang: 20000 },
    /** คอร์สน้ำมันอโรมา 10 ครั้ง ฿7,900 (รับรู้ ฿790/ครั้ง) */
    aromaCourse: { sessions: 10, priceSatang: 790000 },
    /** ค่าร้าน: เก็บห้อง 10 นาที · ค่าคอมฯ 10% · จองออนไลน์ 60% */
    shop: { cleanupMin: 10, commissionPct: 10, onlinePct: 60 },
  },
  dorm: {
    /** ส่วนกลาง+เน็ต ฿300 · ประกัน 2 เดือน · ครบกำหนดวันที่ 5 (ค่าตั้ง R0.3/D.x) */
    commonFeeSatang: 30000,
    depositMonths: 2,
    dueDay: 5,
  },
  hotel: {
    /** ราคา ศ.–ส. (rate plan ใบหลัง) */
    weekendRateSatang: { "ดีลักซ์": 149000, "แฟมิลี": 219000 } as Record<string, number>,
  },
} as const;

// ═══════════════ visual ═══════════════
export const SQC_VISUAL = {
  userAgent: "qc-visual-svc",
  shotsDir: ".qc-shots/svc",
  /** พอร์ตของ server CRM — ห้ามใช้เป็น base ของ SVC */
  forbiddenPorts: ["3215"],
} as const;
export const SQC_VISUAL_USERS = [...SQC_USERS.map((u) => u.key), "other-owner"] as const;
/** หน้าที่ถ่ายต่อใบ — ใบหลังเติมคีย์ของตัวเอง */
export const SQC_VISUAL_SPECS: Record<string, { name: string; path: string }[]> = {
  "r0.2": [
    { name: "booking-today", path: `/app/u/${SQC_UNITS.barber.slug}/booking` },
    { name: "booking-services", path: `/app/u/${SQC_UNITS.barber.slug}/booking/services` },
    { name: "hotel-today", path: `/app/u/${SQC_UNITS.hotel.slug}/hotel` },
  ],
  "r0.5": [{ name: "integrations", path: "/app/settings/integrations" }],
  "r0.4": [
    { name: "booking-settings", path: `/app/u/${SQC_UNITS.barber.slug}/booking/settings` },
    { name: "dorm-settings", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/settings` },
  ],
};

export const SQC = {
  tag: SQC_TAG,
  tenant: SQC_TENANT,
  units: SQC_UNITS,
  systems: SQC_SYSTEMS,
  systemUnits: SQC_SYSTEM_UNITS,
  barber: { hours: SQC_BARBER_HOURS, staff: SQC_BARBER_STAFF, services: SQC_BARBER_SERVICES },
  massage: { staff: SQC_MASSAGE_STAFF, services: SQC_MASSAGE_SERVICES },
  dorm: { building: SQC_DORM_BUILDING, types: SQC_DORM_TYPES, rooms: SQC_DORM_ROOMS },
  hotel: { building: SQC_HOTEL_BUILDING, types: SQC_HOTEL_TYPES, rooms: SQC_HOTEL_ROOMS },
  users: SQC_USERS,
  acceptedAt: SQC_ACCEPTED_AT,
  other: SQC_OTHER,
  tenantIds: SQC_TENANT_IDS,
  emails: SQC_EMAILS,
  pending: SQC_PENDING,
  visual: SQC_VISUAL,
} as const;
