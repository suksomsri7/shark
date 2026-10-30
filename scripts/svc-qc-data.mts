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
  // SVC B.5 ▸ ek = ช่าง (เรียก/เริ่ม/เสร็จงานของตัวเอง · booking.job.run = PROVIDER ของ B.11) · cashier = หน้าเคาน์เตอร์ (เช็กอิน · รับ walk-in = แถว counter ของ B.11 · ไม่มีเรียก/เริ่ม/เสร็จ) ◂
  user("ek", "ช่างเอก", "STAFF", [SQC_UNITS.barber.id], ["booking.appointment.setStatus", "booking.job.run"]),
  user("cashier", "แคชเชียร์ (SVC QC)", "STAFF", [SQC_UNITS.barber.id, SQC_UNITS.massage.id], ["pos.sale.create", "booking.checkin", "booking.walkin.create"]),
  // SVC D.6 ▸ fai + dorm.view (ผังหอมีด่านสิทธิ์) · meter = dorm.meter.read อย่างเดียว ("คนจดมิเตอร์เห็นแค่หน้าจด") ◂
  // SVC D.13 ▸ fai = ผู้ดูแลหอตามภาพ 17 (สัญญา · ยืนยันสลิป ⇒ เห็นเงินบนผัง) · ไม่ให้ dorm.bill.run (ภาพ d.7 ของ fai = ไม่มีฟอร์มใส่บิล) ◂
  user("fai", "พี่ฝ้าย (ผู้ดูแลหอ)", "STAFF", [SQC_UNITS.dorm.id], ["hotel.room.setStatus", "dorm.view", "dorm.lease.manage", "dorm.slip.review"]),
  user("meter", "คนจดมิเตอร์ (SVC QC)", "STAFF", [SQC_UNITS.dorm.id], ["dorm.meter.read"]),
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

// ═══════════════ ฉากจอคิววันนี้ (ใบ B.5 · ภาพ จอง 01 · README "ส. 31 ต.ค. 14:20") ═══════════════
/**
 * วันฉาก = วันเสาร์แรกที่ ≥ วันนี้ไทย + 3 (อนาคตเสมอ ⇒ tick รายนาทีของ server ไม่แตะ · เสาร์ = ตรงภาพ · ช่างแจ๊คมีกะ 13–20)
 * pure: รับ "YYYY-MM-DD" คืน "YYYY-MM-DD"
 */
export function sqcLineSceneDate(todayYmd: string): string {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d + 3);
  const wd = new Date(base).getUTCDay(); // วันของ "วันที่ปฏิทิน" (ไม่ใช่นาฬิกาเครื่อง)
  return new Date(base + ((6 - wd + 7) % 7) * 86_400_000).toISOString().slice(0, 10);
}
/** ISO ของเวลาไทย HH:MM ในวันนั้น (ใช้กับ ?at= และ now ที่ฉีด) */
export function sqcLineSceneAt(ymd: string, hhmm: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - 7, mi)).toISOString();
}
export const SQC_LINE_SCENE_DAY = sqcLineSceneDate(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));

export type SqcLineStaffKey = "ek" | "boy" | "nun" | "jack";
export type SqcLineBooking = { key: string; staff: SqcLineStaffKey | null; sku: string; start: string; name: string; phone: string };
export type SqcLineEvent =
  | { at: string; op: "checkIn" | "start" | "done" | "cancel"; key: string }
  | { at: string; op: "walkIn"; key: string; sku: string; staff: SqcLineStaffKey | null }
  | { at: string; op: "tick" };
/**
 * ฉากภาพ 01 ทั้งวัน — ใช้ร่วม: scripts/svc-qc-today-line-scene.mts (ร้าน svcqc) และข้อสอบ qc-svc-b.5 (ร้านทดสอบของข้อสอบเอง)
 * ขั้นตอน: แม่แบบ BARBER (แถวเดียว) → `bookings` ตามลำดับ (bookAppointment ช่อง STAFF · staff null = ใครก็ได้ · ได้ PENDING ⇒ setAppointmentStatus CONFIRMED)
 *          → `events` ตามเวลา (now ฉีด = วันฉาก + at) → runPlanner ณ `now`
 *   checkIn = checkIn({appointmentId},{via:"STAFF"}) · walkIn = createWalkIn(channel STAFF · staffId ตามช่างที่ระบุ/null) · start/done = startJob/completeJob ·
 *   cancel = cancelByShop (ลุกกลับก่อนได้คิว) · tick = runLineTick(now, { tenantIds:[ร้าน] })
 * เลขบัตรเกิดตามลำดับ: P001–P006 (เช็กอิน) · A001–A011 (walk-in) = ตรงภาพ (A007–A011 · P004–P006)
 * ต่างจากภาพโดยตั้งใจ: คุณต่อ = โกน/แต่งหนวด 20 นาที (ภาพไม่บอกบริการ · ตัดผม 45 นาทีจะชน P006 14:45 ในฐาน)
 */
export const SQC_TODAY_LINE_SCENE = {
  now: "14:20",
  staffIds: { ek: "svcqc-staff-barber-ek", boy: "svcqc-staff-barber-boy", nun: "svcqc-staff-barber-nun", jack: "svcqc-staff-barber-jack" } as Record<SqcLineStaffKey, string>,
  /** sku → บริการ (SQC_BARBER_SERVICES) */
  sku: { CUT: "SVCQC-BB-01", CW: "SVCQC-BB-02", KID: "SVCQC-BB-03", SHAVE: "SVCQC-BB-04", COLOR: "SVCQC-BB-05", PERM: "SVCQC-BB-06" },
  bookings: [
    { key: "P001", staff: "ek", sku: "SVCQC-BB-01", start: "10:00", name: "คุณเก่ง", phone: "0810000001" },
    { key: "P002", staff: "boy", sku: "SVCQC-BB-01", start: "11:00", name: "คุณหนึ่ง", phone: "0810000002" },
    { key: "P003", staff: "nun", sku: "SVCQC-BB-01", start: "13:00", name: "คุณสาม", phone: "0810000003" },
    { key: "P004", staff: "ek", sku: "SVCQC-BB-05", start: "13:30", name: "คุณธนา", phone: "0810000004" },
    { key: "P005", staff: "nun", sku: "SVCQC-BB-02", start: "14:00", name: "คุณมายด์", phone: "0810000005" },
    { key: "TOR", staff: "boy", sku: "SVCQC-BB-04", start: "14:05", name: "คุณต่อ", phone: "0810000006" },
    { key: "P006", staff: "boy", sku: "SVCQC-BB-01", start: "14:45", name: "คุณกอล์ฟ", phone: "0810000007" },
    { key: "PRAEW", staff: "nun", sku: "SVCQC-BB-06", start: "15:30", name: "คุณแพรว", phone: "0810000008" },
    { key: "BEAM", staff: null, sku: "SVCQC-BB-01", start: "15:15", name: "คุณบีม", phone: "0810000009" },
    { key: "OAT", staff: "ek", sku: "SVCQC-BB-02", start: "16:30", name: "คุณโอ๊ต", phone: "0810000010" },
    { key: "BEER", staff: "boy", sku: "SVCQC-BB-01", start: "17:00", name: "คุณเบียร์", phone: "0810000011" },
    { key: "NEW", staff: "ek", sku: "SVCQC-BB-01", start: "17:45", name: "คุณนิว", phone: "0810000012" },
    { key: "PALM", staff: "nun", sku: "SVCQC-BB-01", start: "17:45", name: "คุณปาล์ม", phone: "0810000013" },
    { key: "JAY", staff: null, sku: "SVCQC-BB-01", start: "18:00", name: "คุณเจ", phone: "0810000014" },
  ] as SqcLineBooking[],
  events: [
    { at: "09:55", op: "checkIn", key: "P001" }, { at: "10:00", op: "start", key: "P001" },
    { at: "10:05", op: "walkIn", key: "A001", sku: "SVCQC-BB-01", staff: "boy" }, { at: "10:05", op: "start", key: "A001" },
    { at: "10:30", op: "walkIn", key: "A002", sku: "SVCQC-BB-01", staff: "nun" }, { at: "10:30", op: "start", key: "A002" },
    { at: "10:45", op: "done", key: "P001" }, { at: "10:50", op: "done", key: "A001" },
    { at: "10:58", op: "checkIn", key: "P002" }, { at: "11:00", op: "start", key: "P002" },
    { at: "11:15", op: "done", key: "A002" },
    { at: "11:20", op: "walkIn", key: "A003", sku: "SVCQC-BB-01", staff: null }, { at: "11:30", op: "cancel", key: "A003" },
    { at: "11:45", op: "done", key: "P002" },
    { at: "11:50", op: "walkIn", key: "A004", sku: "SVCQC-BB-02", staff: "ek" }, { at: "11:50", op: "start", key: "A004" },
    { at: "12:50", op: "done", key: "A004" },
    { at: "12:55", op: "walkIn", key: "A005", sku: "SVCQC-BB-01", staff: "boy" },
    { at: "12:58", op: "checkIn", key: "P003" }, { at: "13:00", op: "start", key: "P003" }, { at: "13:00", op: "start", key: "A005" },
    { at: "13:10", op: "walkIn", key: "A006", sku: "SVCQC-BB-04", staff: "jack" }, { at: "13:15", op: "start", key: "A006" },
    { at: "13:25", op: "checkIn", key: "P004" }, { at: "13:30", op: "start", key: "P004" },
    { at: "13:35", op: "done", key: "A006" },
    { at: "13:45", op: "done", key: "P003" }, { at: "13:45", op: "done", key: "A005" },
    { at: "13:50", op: "walkIn", key: "A007", sku: "SVCQC-BB-04", staff: "boy" },
    { at: "13:52", op: "walkIn", key: "A008", sku: "SVCQC-BB-03", staff: "jack" },
    { at: "13:55", op: "checkIn", key: "P005" },
    { at: "13:58", op: "walkIn", key: "A009", sku: "SVCQC-BB-01", staff: null },
    { at: "14:00", op: "start", key: "P005" },
    { at: "14:08", op: "walkIn", key: "A010", sku: "SVCQC-BB-04", staff: null },
    { at: "14:10", op: "start", key: "A008" },
    { at: "14:12", op: "checkIn", key: "P006" },
    { at: "14:16", op: "tick" }, { at: "14:16", op: "start", key: "A007" },
    { at: "14:18", op: "walkIn", key: "A011", sku: "SVCQC-BB-02", staff: null },
  ] as SqcLineEvent[],
  /** ผลที่ต้องได้ ณ 14:20 (ข้อสอบ C0/Q · ผู้คุมเทียบภาพ) */
  expect: {
    plan: { A009: { staff: "jack", start: "14:40" }, A010: { staff: "nun", start: "15:00" }, A011: { staff: "jack", start: "15:25" }, P006: { staff: "boy", start: "14:45" } } as Record<string, { staff: SqcLineStaffKey; start: string }>,
    waitingFirst6: ["A009", "P006", "A010", "BEAM", "A011", "PRAEW"],
    whyOf: "A011",
    whyParts: ["ช่างนุ่นว่าง 15:20 แต่มีนัด 15:30", "ช่างเอกว่าง 15:00 แต่มีนัด 15:15", "ช่างบอยว่าง 15:30", "ช่างแจ๊คเร็วสุด 15:25"],
    kpi: { booked: 14, arrived: 6, absent: 1, upcoming: 7, walkIns: 11, walkInsLeft: 1, waiting: 4, longestWaitMin: 22, longestWaitTicket: "A009", done: 8 },
    todo: { LATE: ["TOR"], SOON: ["BEAM"] } as Record<string, string[]>,
  },
  /** ฉากผูกผู้ใช้ ช่างเอก (svcqc-user-ek) → BookingStaff ช่างเอก ผ่าน HR (AppSystem HR + HrEmployee.linkedUserId) — "ของฉัน" ของ ek */
  hrLink: { systemId: "svcqc-scene-hr", employeeId: "svcqc-scene-emp-ek", userKey: "ek" as SqcUserKey, staff: "ek" as SqcLineStaffKey },
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
  // R0.9 ผังห้องร่วม (ภาพ หอ 01 ส่วนผัง · KPI ตรวจใน D.13) — ก่อนถ่ายรัน scripts/svc-qc-roomboard-scene.mts (ฉาก SQC_DORM_BOARD_SCENE)
  "r0.9": [{ name: "dorm-floorplan", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm` }],
  // D.5 ผู้เช่าและสัญญา (ภาพ หอ 02 · แผงห้อง 204) — ก่อนถ่ายรัน scripts/svc-qc-roomboard-scene.mts แล้ว scripts/svc-qc-lease-scene.mts
  "d.5": [{ name: "dorm-tenants", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/tenants?room=204` }],
  // D.6 จดมิเตอร์มือถือ (ภาพ หอ 03) — ก่อนถ่ายรัน scripts/svc-qc-roomboard-scene.mts แล้ว scripts/svc-qc-meter-scene.mts · ถ่ายทั้ง --user owner และ --user meter
  "d.6": [
    { name: "dorm-meter-walk", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/meter` },
    { name: "dorm-meter-flags", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/meter?view=flags` },
  ],
  // D.7 ค่าน้ำไฟ · กฎหมาย · VAT (ภาพ หอ 10) — ก่อนถ่ายรัน scripts/svc-qc-utility-scene.mts (บิล กฟภ. ฿19,824.00 ÷ 4,200 · น้ำ ฿3,840.00 ÷ 240)
  //   ถ่ายทั้ง --user owner (แก้โหมดได้ · มีฟอร์มใส่บิล) และ --user fai (โหมดล็อก "แก้ได้เฉพาะเจ้าของกิจการ" · ไม่มีฟอร์มใส่บิล)
  "d.7": [{ name: "dorm-settings-law", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/settings/utility` }],
  // B.5 จอคิววันนี้แถวเดียว (ภาพ จอง 01) + มือถือช่าง "ของฉัน" + ปฏิทินรายวัน — ก่อนถ่าย: reseed (สิทธิ์ ek/cashier) → รัน scripts/svc-qc-today-line-scene.mts
  //   (ฉาก SQC_TODAY_LINE_SCENE ณ วันฉาก 14:20) · QC server ต้องเปิดด้วย SVC_QC_CLOCK=1 (หน้าอ่าน ?at= เฉพาะเมื่อตั้งตัวนี้) · ถ่าย --user owner · ek · cashier
  //   ⚠️ วันฉากคิดจาก "วันนี้ไทย" ตอนโหลดไฟล์ ⇒ รันฉากแล้วถ่ายภาพในวันเดียวกัน
  "b.5": [
    { name: "booking-today-line", path: `/app/u/${SQC_UNITS.barber.slug}/booking?at=${encodeURIComponent(sqcLineSceneAt(SQC_LINE_SCENE_DAY, "14:20"))}` },
    { name: "booking-mine", path: `/app/u/${SQC_UNITS.barber.slug}/booking/mine?at=${encodeURIComponent(sqcLineSceneAt(SQC_LINE_SCENE_DAY, "14:20"))}` },
    { name: "booking-day", path: `/app/u/${SQC_UNITS.barber.slug}/booking/day?date=${SQC_LINE_SCENE_DAY}&at=${encodeURIComponent(sqcLineSceneAt(SQC_LINE_SCENE_DAY, "14:20"))}` },
  ],
  // D.8 ออกบิลรอบเดือน (ภาพ หอ 04 · ขั้นตรวจบิล · ตัวอย่างบิล 204) — ก่อนถ่ายรันฉาก roomboard → lease → meter → utility → scripts/svc-qc-billing-scene.mts
  //   ถ่ายทั้ง --user owner (มีปุ่มส่ง/ตั้งเวลา) และ --user fai (dorm.view อย่างเดียว · ไม่มีปุ่มส่ง) · ผู้คุมเทียบ PARITY กับ ledger/design-dorm/04-billing-run.png
  "d.8": [{ name: "dorm-billing-run", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/billing?room=204` }],
  // B.11 จอตั้งค่าจองคิว (ภาพ จอง 08 · 11 · 12 ส่วนคน · 14) — ก่อนถ่ายรัน scripts/svc-qc-booking-settings-scene.mts (ฉาก SQC_BOOKING_SETTINGS_SCENE)
  //   08/14 = บาร์เบอร์ (แม่แบบ BARBER · ปรับ 6 ข้อ) · 11/12 = ร้านนวด (SPA · ใครทำได้ 5/6 ของน้ำมันอโรมา · พี่นก) · ผู้คุมเทียบ PARITY กับ ledger/design-booking/*.png
  "b.11": [
    { name: "booking-settings-policy", path: `/app/u/${SQC_UNITS.barber.slug}/booking/settings` },
    { name: "booking-services", path: `/app/u/${SQC_UNITS.massage.slug}/booking/services?service=${encodeURIComponent("น้ำมันอโรมา")}` },
    { name: "booking-staff", path: `/app/u/${SQC_UNITS.massage.slug}/booking/staff?staff=${encodeURIComponent("พี่นก")}` },
    { name: "booking-settings-messages", path: `/app/u/${SQC_UNITS.barber.slug}/booking/settings/messages?msg=nearTurn` },
  ],
};

/**
 * ฉากจอตั้งค่าจองคิว (ใบ B.11 · README จองคิว "ปรับจากแม่แบบ 6 ข้อ" + ภาพ 11/12 ร้านนวด) — ค่าล้วน
 * สคริปต์ `scripts/svc-qc-booking-settings-scene.mts` เขียนผ่านเครื่องยนต์ค่าตั้งในนามเจ้าของ svcqc · ข้อสอบ B.11 ใช้ชุดเดียวกันบนร้านชั่วคราว
 * barber.unitDiffs = 6 คีย์ที่ต่างจากแม่แบบ BARBER (การ์ด 08: ค่าคอมฯ · ขยายเวลา · ข้อความ 3 ชนิดบน 14 · พักขั้นต่ำบน 12)
 * barber.noise = ชั้น UNIT ที่ "เท่าแม่แบบ" (ไม่นับ) · staffOnlinePct = ปรับรายคน 3 คน (ไม่นับ — ป้าย "ปรับรายคน 3")
 */
export const SQC_BOOKING_SETTINGS_SCENE = {
  barber: {
    template: "BARBER",
    unitDiffs: [
      { key: "booking.money.commissionRate", value: { serviceBp: 1000, productBp: 500 } },
      { key: "booking.queue.overrunExtendMin", value: 10 },
      { key: "booking.msg.nearTurn", value: { th: "อีก {อีกกี่คิว} คิวถึงคุณ ({เลขคิว}) — กรุณากลับถึงร้านก่อนถึงคิว · {ลิงก์บัตร}" } },
      { key: "booking.msg.reminder", value: { th: "เตือนนัด: คุณ{ชื่อ} มี{บริการ}กับ{ช่าง} เวลา {เวลา} ที่ {ร้าน} · เลื่อน/ยกเลิก: {ลิงก์นัด}" } },
      { key: "booking.msg.confirmation", value: { th: "จองแล้ว: คุณ{ชื่อ} {บริการ}กับ{ช่าง} เวลา {เวลา} ที่ {ร้าน} · ดู/เลื่อนนัด: {ลิงก์นัด}" } },
      { key: "booking.staff.minBreakMin", value: 5 },
    ],
    noise: [{ key: "booking.booking.slotStepMin", value: 15 }],
    /** ช่างเอก 60 = เท่าค่าร้าน (ไม่มีแถว) */
    staffOnlinePct: { "ช่างบอย": 70, "ช่างนุ่น": 50, "ช่างแจ๊ค": 0 } as Record<string, number>,
  },
  massage: {
    template: "SPA",
    unitValues: [{ key: "booking.money.commissionRate", value: { serviceBp: 1000, productBp: 0 } }],
    /** ภาพ 12: แดง 70 · นก 70 · จันทร์ 60 (เท่าร้าน) · ฝ้าย 40 · เมย์ 70 · ศรี 70 */
    staffOnlinePct: { "พี่แดง": 70, "พี่นก": 70, "น้องฝ้าย": 40, "น้องเมย์": 70, "พี่ศรี": 70 } as Record<string, number>,
    /** ภาพ 12: พี่แดง 12% */
    staffCommissionBp: { "พี่แดง": 1200 } as Record<string, number>,
    serviceValues: [
      { service: "น้ำมันอโรมา", key: "booking.money.commissionRate", value: { serviceBp: 1500, productBp: 0 } },
      { service: "คู่รัก VIP", key: "booking.service.walkIn", value: { enabled: false, closeAtOrAboveMin: null } },
      { service: "หินร้อน", key: "booking.service.walkIn", value: { enabled: false, closeAtOrAboveMin: null } },
    ],
    /** ใครทำได้ (BookingStaffService) — คนที่ไม่อยู่ในรายการ = ทำทุกบริการ · น้ำมันอโรมา ⇒ 5/6 (พี่ศรีไม่รับ) · แดง ฿1,000 (+฿100) · ฝ้าย 100 นาที */
    staffServices: [
      { staff: "พี่แดง", services: [{ name: "นวดไทย" }, { name: "น้ำมันอโรมา", priceSatang: 100000 }, { name: "หินร้อน" }] },
      { staff: "น้องฝ้าย", services: [{ name: "นวดเท้า" }, { name: "น้ำมันอโรมา", durationMin: 100 }, { name: "คู่รัก VIP" }] },
      { staff: "พี่ศรี", services: [{ name: "นวดไทย" }, { name: "นวดไทย+ประคบ" }] },
    ] as { staff: string; services: { name: string; priceSatang?: number; durationMin?: number }[] }[],
  },
} as const;

/**
 * ฉากผังห้องหอ (ใบ R0.9 · README หอ "อาคาร 36 ห้อง ณ 3 พ.ย.") — วันที่สัมพัทธ์กับ "วันนี้ไทย" (offset = จำนวนวัน · end ไม่รวม)
 * สคริปต์ `scripts/svc-qc-roomboard-scene.mts` เขียนเป็น RoomOccupancy refType `SvcQcScene` (refId `scene-<เลขห้อง>`) · `--clear` ลบทั้งฉาก
 * ไม่แตะ hkStatus/ห้อง (seed เป็นเจ้าของ) · ใบหอจริง (D.5/D.13) ที่ต้องใช้ห้องเหล่านี้ ⇒ `--clear` ก่อน
 */
export const SQC_DORM_BOARD_SCENE = {
  refType: "SvcQcScene",
  /** มีผู้เช่า 31 ห้อง = ทุกห้องยกเว้น vacant/booked/repair */
  lease: { startOffset: -150, endOffset: 215 },
  /** ว่าง 3 (ไม่มี occupancy) */
  vacant: ["108", "210", "311"],
  /** 207: ผู้เช่าเดิมออก 31 ต.ค. · ผู้เช่าใหม่ (เบญจา) เข้า 15 พ.ย. = LEASE เริ่มใน 12 วัน */
  booked: { number: "207", startOffset: 12, endOffset: 377 },
  /** 302: ซ่อมรั่ว · ช่างนัด 4 พ.ย. = BLOCK คร่อมวันนี้ */
  repair: { number: "302", startOffset: -2, endOffset: 2 },
} as const;

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

// ═════════════════════════════════════════════════════════════════════════════
// SVC D.13 ▸ บล็อกของใบ D.13 เท่านั้น (ผังห้องหอ + KPI หอ 01 · ตั้งนโยบาย/สิทธิ์ หอ 17) — เลนอื่นห้ามแก้ในบล็อกนี้ / เพิ่มของตัวเองเป็นบล็อกแยก
//   ใบสั่ง ledger/svc-briefs/svc-brief-d.13.md · ข้อสอบ scripts/qc-svc-d.13.mts
// ═════════════════════════════════════════════════════════════════════════════
/** ภาพ หอ 01 + หอ 17 — ก่อนถ่ายรัน: roomboard-scene → lease-scene → dorm-home-scene (D.13) · ถ่ายทั้ง --user owner และ --user fai */
SQC_VISUAL_SPECS["d.13"] = [
  { name: "dorm-home", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm` },
  { name: "dorm-settings-policies", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/settings` },
];

/** README หอ "3 พ.ย." — ยอดบิลรอบ พ.ย. ต่อห้อง (สตางค์) · 31 ห้องที่มีผู้เช่า · Σ = 17,412,640 (฿174,126.40) */
const D13_NOV_BILLS: Record<string, number> = {
  // ห้องใหญ่ (จ่ายแล้ว)
  "101": 612000, "112": 605440, "201": 618320, "212": 609760, "301": 615200, "312": 607040,
  // มาตรฐาน จ่ายแล้ว 18 (204 ณัฐชา ฿5,486.00)
  "102": 541200, "103": 536480, "105": 539840, "107": 544320, "109": 533760, "110": 538400, "111": 542080,
  "202": 537600, "203": 540960, "204": 548600, "205": 535520, "208": 543200, "209": 539280,
  "303": 536000, "304": 541760, "306": 538880, "307": 540320, "308": 545320,
  // สลิปรอตรวจ 3 (= ฿17,785.36)
  "104": 538240, "206": 556232, "309": 684064,
  // ยังไม่จ่าย 4 (= ฿22,428.24)
  "106": 548624, "211": 562400, "305": 541600, "310": 590200,
};
/**
 * ฉากผังห้องหอ + KPI (ใบ D.13 · README หอ "3 พ.ย.") — ค่าล้วน
 *   ข้อสอบ D.13 สร้างฉากนี้แบบวันที่ตายตัว (readme.*) บนร้านชั่วคราว · สคริปต์ฉาก scripts/svc-qc-dorm-home-scene.mts (builder) สร้างบนร้าน svcqc
 *   แบบสัมพัทธ์วันนี้ (ใบสั่ง D.13 §9) ต่อจาก roomboard-scene + lease-scene · แถวที่ฉากเขียนติด createdById/enteredBy = mark
 */
export const SQC_DORM_HOME_SCENE = {
  mark: "SvcQcScene",
  readme: { date: "2026-11-03", period: "2026-11", prevPeriod: "2026-10", sentAt: "2026-10-26", dueDate: "2026-11-05", prevDueDate: "2026-10-05" },
  bills: D13_NOV_BILLS,
  slipPending: ["104", "206", "309"],
  unpaid: ["106", "211", "305", "310"],
  /** ค้าง ต.ค. (ยังไม่จ่าย · ครบกำหนด 5 ต.ค.) = ฿10,200.40 */
  prevUnpaid: { "106": 521400, "305": 498640 } as Record<string, number>,
  repairsOpen: [
    { room: "302", category: "AIRCON", text: "แอร์รั่ว (ช่างนัด 4 พ.ย.)" },
    { room: "204", category: "PLUMBING", text: "ก๊อกน้ำหยด" },
  ],
  /** ประวัติสำหรับฉากวันที่ตายตัวเท่านั้น (ข้อสอบ) — ห้องว่างตั้งแต่ (วันจบ occupancy แบบไม่รวมวันจบ) */
  vacantSince: { "108": "2026-09-30", "210": "2026-10-22", "311": "2026-10-31" } as Record<string, string>,
  /** สัญญาหมดภายใน 30 วัน (DormLease.endDate) */
  expiring: { "103": "2026-11-20", "209": "2026-11-25", "310": "2026-12-02" } as Record<string, string>,
  /** 207: ผู้เช่าเดิมออก 31 ต.ค. (occupancy จบ 1 พ.ย. ไม่รวม) · ผู้เช่าใหม่เบญจา DRAFT เข้า 15 พ.ย. */
  moveIn: { room: "207", start: "2026-11-15", oldOccEnd: "2026-11-01", tenant: "เบญจา คำแก้ว" },
  /** 302 ปิดซ่อม (BLOCK) */
  repairBlock: { room: "302", start: "2026-11-01", end: "2026-11-05" },
  expect: {
    total: 36, floors: 3, occupied: 31, occupiedPct: 86, prevMonthCount: 32, prevMonthPct: 89, vacant: 3, booked: 1, repair: 1,
    longestVacant: { roomNumber: "108", days: 34 },
    billCount: 31, paid: 24, slipPending: 3, unpaid: 4,
    totalSatang: 17412640, collectedSatang: 13391280, outstandingSatang: 4021360,
    overdueSatang: 1020040, overdueRooms: ["106", "305"], overdueMaxDaysLate: 29,
  },
} as const;

/** ฉากหอ 17 (ค่าของหอตัวอย่างในภาพ) — 4 ค่าที่ต่างจากแม่แบบ APARTMENT ⇒ "ปรับจากแม่แบบ 4 ข้อ" */
export const SQC_DORM_POLICY_SCENE = {
  template: "APARTMENT",
  unitDiffs: [
    { key: "rooms.billing.issueDay", value: 26 },
    { key: "rooms.lateFee.graceDays", value: 0 },
    {
      key: "rooms.services.catalog",
      value: [
        { code: "COMMON_NET", labelTh: "ส่วนกลาง + อินเทอร์เน็ต", amountSatang: 30000, required: true, taxKind: "VAT7" },
        { code: "PARKING", labelTh: "ที่จอดรถยนต์", amountSatang: 50000, required: false, taxKind: "VAT7" },
        { code: "CLEANING", labelTh: "ทำความสะอาดห้อง", amountSatang: 20000, required: false, taxKind: "VAT7" },
      ],
    },
    { key: "rooms.services.extraOccupantFee", value: 30000 },
  ],
} as const;
// ◂ SVC D.13

// ═══════════════ ฉากตู้ · ทีวี · หน้าบัตร (ใบ B.6 · ภาพ จอง 04 · 05 · 06ก) — ต่อท้ายโดยผู้คุม ═══════════════
// ใช้ร่วม: scripts/svc-qc-device-scene.mts (ร้าน svcqc) · ข้อสอบ qc-svc-b.6 (ร้านทดสอบของข้อสอบเอง) · visual-svc b.6
// import ไว้ท้ายไฟล์โดยตั้งใจ (ESM ยก import ขึ้นก่อนเสมอ) — node:crypto ล้วน ไม่ลาก prisma/`@/…`
import { createHmac } from "node:crypto";

export type SqcDeviceEvent = SqcLineEvent | { at: string; op: "call"; key: string };
/** วันฉาก B.6 = วันฉาก B.5 + 7 (เสาร์ถัดไป · คนละวันกับฉาก B.5 บนหน่วย barber เดียวกัน ⇒ ไม่ชนกัน) · pure */
export function sqcDeviceSceneDay(todayYmd: string): string {
  const [y, m, d] = sqcLineSceneDate(todayYmd).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
}
export const SQC_DEVICE_SCENE_DAY = sqcDeviceSceneDay(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
/**
 * ฉากภาพ 05 (14:40 ต่อจากจอ 01): ฉาก SQC_TODAY_LINE_SCENE ทั้งวัน (bookings + events) แล้วต่อด้วย extraEvents
 *   → A007 เสร็จ 14:36 (ช่างบอยว่าง เตรียมรับ P006) · tick 14:40 (คุณต่อไม่มา) · A008 เสร็จ 14:40 · เรียก A009 (เก้าอี้ 4 ช่างแจ๊ค)
 * op call = callJob (B.4) · อื่นตาม SqcLineEvent · idempotencyKey ของนัด = `${idemPrefix}<วันฉาก>-<key>`
 * อุปกรณ์ฉาก: เก็บตามใบสั่ง B.6 §3.1 (displayToken = "sha256:" + sha256hex(token) · settings {kind}) · token ตายตัว 43 ตัว base64url (ค่า QC เท่านั้น)
 * ตู้ฉากตั้งชั้น DEVICE ให้ตรงภาพ 04 (ทุกบริการ — ทำสี/ดัด = "จองล่วงหน้า" · มีปุ่มพิมพ์)
 */
export const SQC_DEVICE_SCENE = {
  at: "14:40",
  idemPrefix: "svcqc-dev-",
  extraEvents: [
    { at: "14:36", op: "done", key: "A007" },
    { at: "14:40", op: "tick" },
    { at: "14:40", op: "done", key: "A008" },
    { at: "14:40", op: "call", key: "A009" },
  ] as SqcDeviceEvent[],
  devices: {
    tv: { id: "svcqc-dev-tv", kind: "TV" as const, name: "จอทีวีหน้าร้าน (ฉาก B.6)", token: `svcqc-scene-tv-${"A".repeat(28)}` },
    kiosk: {
      id: "svcqc-dev-kiosk", kind: "KIOSK" as const, name: "ตู้หน้าร้าน (ฉาก B.6)", token: `svcqc-scene-kiosk-${"B".repeat(25)}`,
      overrides: [{ key: "booking.kiosk.services", value: "ALL" }, { key: "booking.kiosk.paperTicket", value: true }],
    },
  },
  /** ผลที่ต้องได้ ณ 14:40 (ข้อสอบ B.6 ตรวจบนร้านทดสอบ + Q บน svcqc · ผู้คุมเทียบภาพ 05) */
  expect: {
    calling: { ticketNumber: "A009", seat: 4, staffName: "ช่างแจ๊ค", serviceName: "ตัดผมชาย" },
    chairs: [
      { seat: 1, staffName: "ช่างเอก", state: "BUSY", ticketNumber: "P004" },
      { seat: 2, staffName: "ช่างบอย", state: "FREE", ticketNumber: null },
      { seat: 3, staffName: "ช่างนุ่น", state: "BUSY", ticketNumber: "P005" },
      { seat: 4, staffName: "ช่างแจ๊ค", state: "CALLING", ticketNumber: "A009" },
    ],
    freeNext: { seat: 2, ticketNumber: "P006" },
    /** [เลข, เวลา, เก้าอี้, นัด] */
    next: [["P006", "14:45", 2, true], ["A010", "15:00", 3, false], ["A011", "15:25", 4, false]] as [string, string, number, boolean][],
    kiosk: { busyCount: 2, seatCount: 4, waitingCount: 4, nextTicketNumber: "A009" },
    /** หน้าบัตร A011 ณ 14:40 (ภาพ 06ก = 14:50 ⇒ จำนวนข้างหน้าต่างจากภาพโดยตั้งใจ) */
    ticketA011: {
      staffName: "ช่างแจ๊ค", seat: 4, plannedStart: "15:25", returnBy: "15:20", aheadCount: 4,
      ahead: [["WAIT", "A009"], ["WAIT", "P006"], ["WAIT", "A010"], ["BOOKED", null], ["ME", "A011"]] as [string, string | null][],
    },
  },
} as const;

/** token หน้าบัตร (ใบสั่ง B.6 §3.4) — HMAC กำหนดแน่นอน · secret = SESSION_SECRET ของ server QC */
export function sqcTicketToken(secret: string, t: { tenantId: string; unitId: string; businessDate: string; number: string }): string {
  const p = Buffer.from(`v1|${t.tenantId}|${t.unitId}|${t.businessDate}|${t.number}`, "utf8").toString("base64url");
  return `${p}.${createHmac("sha256", `booking-ticket:v1:${secret}`).update(p).digest("base64url")}`;
}

// B.6 ตู้ · ทีวี · หน้าบัตร (ภาพ จอง 04 ก · 05 · 06 ก) — หน้าสาธารณะ (ไม่ต้องล็อกอิน · session ที่ mint ไม่มีผล) · ก่อนถ่าย: reseed → scripts/svc-qc-device-scene.mts
//   QC server เปิดด้วย SVC_QC_CLOCK=1 (?at=) · ถ่าย --user owner · path หน้าบัตรคิดตอนอ่าน (getter) จาก SESSION_SECRET ใน env ที่ visual-svc โหลดแล้ว
//   ⚠️ วันฉากคิดจาก "วันนี้ไทย" ตอนโหลดไฟล์ ⇒ รันฉากแล้วถ่ายภาพในวันเดียวกัน
{
  const at = encodeURIComponent(sqcLineSceneAt(SQC_DEVICE_SCENE_DAY, SQC_DEVICE_SCENE.at));
  SQC_VISUAL_SPECS["b.6"] = [
    { name: "kiosk-home", path: `/bq/kiosk/${SQC_DEVICE_SCENE.devices.kiosk.token}?at=${at}` },
    { name: "tv-display", path: `/bq/tv/${SQC_DEVICE_SCENE.devices.tv.token}?at=${at}` },
    {
      name: "ticket-card",
      get path(): string {
        const secret = process.env.SESSION_SECRET ?? "";
        if (secret.length < 32) return `/bq/t/no-session-secret?at=${at}`;
        return `/bq/t/${sqcTicketToken(secret, { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.barber.id, businessDate: SQC_DEVICE_SCENE_DAY, number: "A011" })}?at=${at}`;
      },
    },
  ];
}

// SVC B.9 ▸ หน้ารับบัตรคิวจากมือถือ (#42 · สาธารณะ · ไม่มีภาพแบบ ⇒ ตรวจ HTTP + ไม่ล้น 1440/390 เท่านั้น) —
//   ต้องให้หน่วยบาร์เบอร์ของ svcqc ใช้แม่แบบ BARBER (แถวเดียว + remoteTicket เปิด) ก่อนถ่าย (ฉาก B.5 ทำให้แล้ว) ◂
SQC_VISUAL_SPECS["b.9"] = [
  { name: "booking-remote-ticket", path: `/s/${SQC_TENANT.slug}/${SQC_UNITS.barber.slug}/remote` },
];
// ◂ SVC B.9

// ═════════════════════════════════════════════════════════════════════════════
// SVC B.7 ▸ บล็อกของใบ B.7 เท่านั้น (จองออนไลน์ 3 ขั้น ภาพ จอง 03 + ลิงก์จัดการนัด) — ต่อท้ายโดยผู้เขียนข้อสอบ · เลนอื่นห้ามแก้ในบล็อกนี้
//   ใบสั่ง ledger/svc-briefs/svc-brief-b.7.md · ข้อสอบ scripts/qc-svc-b.7.mts · ฉาก scripts/svc-qc-online-scene.mts (builder)
//   ใช้ createHmac ที่ import ไว้แล้วในบล็อก B.6 (ESM ยก import ขึ้นก่อน — ห้าม import ซ้ำชื่อเดิม)
// ═════════════════════════════════════════════════════════════════════════════
/** วันฉาก B.7 = วันฉาก B.5 + 14 (เสาร์ · คนละวันกับฉาก B.5 (+0) และ B.6 (+7) บนหน่วย barber · ภายใน horizon 30 วันของ BARBER) · pure */
export function sqcOnlineSceneDay(todayYmd: string): string {
  const [y, m, d] = sqcLineSceneDate(todayYmd).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 14)).toISOString().slice(0, 10);
}
export const SQC_ONLINE_SCENE_DAY = sqcOnlineSceneDay(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
/**
 * ฉากภาพ 03 (คุณแพรว จองดัดผม ช่างนุ่น 15:30 · เปิดจาก LINE ร้าน): นัดช่างนุ่นวันฉาก (ช่อง STAFF) ⇒ ขั้น 2 มีเวลาขีดฆ่า และ 15:30 ว่าง
 *   ดัดผม 120 นาที ฿1,500 · มัดจำแม่แบบ BARBER 20% ของงาน ≥ 90 นาที = ฿300 · จ่ายที่ร้าน ฿1,200 · จะเสร็จราว 17:30
 *   Party ตายตัว (ตัวตนจากลิงก์เซ็น booking.identity) · เบอร์ลงท้าย 4417 ตามภาพ
 */
export const SQC_ONLINE_SCENE = {
  idemPrefix: "svcqc-online-",
  party: { id: "svcqc-party-praew", name: "คุณแพรว", phone: "0812344417" },
  pick: { serviceName: "ดัดผม", sku: "SVCQC-BB-06", staffId: "svcqc-staff-barber-nun", time: "15:30" },
  /** นัดของช่างนุ่นในวันฉาก (bookAppointment ช่อง STAFF · ไม่กินโควตาออนไลน์) */
  bookings: [
    { key: "N1", sku: "SVCQC-BB-06", start: "10:00", name: "ลูกค้าฉาก 1", phone: "0899700001" },
    { key: "N2", sku: "SVCQC-BB-01", start: "12:00", name: "ลูกค้าฉาก 2", phone: "0899700002" },
    { key: "N3", sku: "SVCQC-BB-06", start: "13:15", name: "ลูกค้าฉาก 3", phone: "0899700003" },
  ],
  expect: { priceSatang: 150000, depositSatang: 30000, payAtShopSatang: 120000, end: "17:30", phoneMasked: "•••-•••-4417" },
} as const;

/** ลิงก์ตัวตนจาก LINE (ใบสั่ง B.7 §3.3 = signLink purpose "booking.identity" subject partyId) — สูตรเดียวกับ src/lib/core/signed-link.ts · pure */
export function sqcIdentityToken(secret: string, t: { tenantId: string; partyId: string; nowMs: number; ttlMin: number; nonce?: string }): string {
  const e = Math.floor(t.nowMs / 1000) + t.ttlMin * 60;
  const n = t.nonce ?? Buffer.from(`svcqc-b7-${t.partyId}`.slice(0, 16).padEnd(16, "x"), "utf8").toString("base64url");
  const p = Buffer.from(JSON.stringify({ v: 1, t: t.tenantId, u: "booking.identity", s: t.partyId, e, n }), "utf8").toString("base64url");
  return `${p}.${createHmac("sha256", `signed-link:v1:${secret}`).update(p).digest("base64url")}`;
}
/** token ลิงก์จัดการนัด (ใบสั่ง B.7 §3.1) = base64url(HMAC-SHA256("booking-manage:v1:" + secret, appointmentId)) · pure */
export function sqcManageToken(secret: string, appointmentId: string): string {
  return createHmac("sha256", `booking-manage:v1:${secret}`).update(appointmentId).digest("base64url");
}

// B.7 จองออนไลน์ 3 ขั้น (ภาพ จอง 03 ก ข ค · มือถือ 390) — หน้าร้านสาธารณะ (ไม่ต้องล็อกอิน) · ก่อนถ่าย: reseed → scripts/svc-qc-online-scene.mts
//   path ทุกตัวคิดตอนอ่าน (getter): ลิงก์ตัวตนเซ็นด้วย SESSION_SECRET ใน env ที่ visual-svc โหลดแล้ว (อายุ 120 นาที) · svc = ชื่อบริการ (id บน svcqc ไม่คงที่ · ใบสั่ง §3.2)
//   ⚠️ วันฉากคิดจาก "วันนี้ไทย" ตอนโหลดไฟล์ ⇒ รันฉากแล้วถ่ายภาพในวันเดียวกัน
{
  const base = `/s/${SQC_TENANT.slug}/${SQC_UNITS.barber.slug}`;
  const who = (): string => {
    const secret = process.env.SESSION_SECRET ?? "";
    if (secret.length < 32) return "no-session-secret";
    return sqcIdentityToken(secret, { tenantId: SQC_TENANT.id, partyId: SQC_ONLINE_SCENE.party.id, nowMs: Date.now(), ttlMin: 120 });
  };
  const sel = `svc=${encodeURIComponent(SQC_ONLINE_SCENE.pick.serviceName)}&staff=${SQC_ONLINE_SCENE.pick.staffId}&date=${SQC_ONLINE_SCENE_DAY}`;
  SQC_VISUAL_SPECS["b.7"] = [
    { name: "online-step1", get path(): string { return `${base}?who=${encodeURIComponent(who())}`; } },
    { name: "online-step2", get path(): string { return `${base}?${sel}&who=${encodeURIComponent(who())}`; } },
    { name: "online-step3", get path(): string { return `${base}?${sel}&time=${SQC_ONLINE_SCENE.pick.time}&who=${encodeURIComponent(who())}`; } },
  ];
}
// ◂ SVC B.7

// ── SVC D.11 ▸ เตือน · ทวง · ค่าปรับ — จอ "ค้างชำระ" (อ้างอิงภาพ หอ 06 การ์ด "ค้างจาก ต.ค. ฿10,200.40 · 106 · 305 · ส่งเตือนแล้ว 3 ครั้ง") ──
//   ผู้เขียนข้อสอบ D.11 ตั้ง · builder ห้ามแตะ · ฉาก scripts/svc-qc-overdue-scene.mts ต่อจากฉาก D.13 (บิลค้างงวด PP ของ SQC_DORM_HOME_SCENE.prevUnpaid)
//   ใส่ ServiceMessageLog SENT ของขั้นทวง steps ให้ทุกห้องใน rooms (dedupeKey rooms:dunning:<billId>:<ขั้น>) ⇒ delivered = 3 · ถ่าย --user owner
export const SQC_DORM_OVERDUE_SCENE = {
  mark: "SvcQcScene",
  rooms: ["106", "305"],
  steps: [3, 7, 14],
  delivered: 3,
} as const;
SQC_VISUAL_SPECS["d.11"] = [{ name: "dorm-overdue", path: `/app/u/${SQC_UNITS.dorm.slug}/dorm/overdue` }];
// ◂ SVC D.11
