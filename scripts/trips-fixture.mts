// trips-fixture.mts — ฟิกซ์เจอร์ร้านตัวอย่างของ RUN TRIPS (ใบ P0.1) · แหล่งความจริงเดียวของตัวเลขในภาพแบบร่าง
//
// ที่มา: ledger/design-trips/README.md ("ตัวเลขที่ต้องตรงกันข้ามจอ") + ledger/design-trips/NN-*.body.html (ตัวเลขที่ README ไม่แตก)
//   ทุกค่ามีป้าย `// จอ NN` บอกที่มา · ค่าที่หาไม่พบ ⇒ ไม่แต่ง — ลง `TRIPS_FIXTURE_TODO` · จุดที่ README/ภาพไม่ตรงกัน ⇒ `TRIPS_FIXTURE_DISCREPANCIES`
//
// 🔴 ไฟล์นี้เป็นค่าล้วน — ห้าม import prisma / `@/…` (ข้อสอบ/fitness ต้อง import ได้โดยไม่มี env)
// 🔴 เงินเป็นสตางค์ (Int) ทั้งหมด · อัตราเป็น basis point (bp · 1500 = 15%) · วันที่เป็นสตริง "YYYY-MM-DD" ตามปฏิทินไทย (พ.ศ. − 543)
// 🔴 เวลาเป็น ISO มี offset +07:00 · ห้าม getDay() ดิบ — คำนวณวันด้วย `daysBetween()` (เทียบวันที่ปฏิทินผ่าน Date.UTC)
// 🔴 ข้อสอบทุกใบ import จากที่นี่ — แก้ตัวเลขที่นี่ที่เดียว แล้วรัน `assertFixtureArithmetic()`

export const TRIPS_FIXTURE_TAG = "tripsqc";
/** เวลาที่ภาพ "ดูข้อมูล ณ" — จอ 08/11 (ปฏิทินรอบ ณ พฤ. 12 พ.ย. 18:00) */
export const TRIPS_AS_OF = "2026-11-12T18:00:00+07:00";

/** แม่แบบค่าตั้งตามประเภทกิจการ — TRIPS-MASTER-PLAN หลักข้อ 4 · ใบ T0.1 ลงทะเบียนจริง */
export const TRIPS_TEMPLATES = ["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION"] as const;
export type TripsTemplate = (typeof TRIPS_TEMPLATES)[number];

// ═══════════════ ชนิดข้อมูล ═══════════════
export type Bp = number; // basis point
export type Satang = number;
export type MoneyLine = { label: string; qty: number; unitSatang: Satang; totalSatang: Satang };
export type FixtureUnit = { id: string; type: "BOOKING" | "TICKET" | "TRIPS"; slug: string; name: string };
export type FixtureUser = { key: string; userId: string; membershipId: string; email: string; name: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, boolean> };
export type FixtureParty = { id: string; kind: "PERSON" | "COMPANY"; name: string; note: string };

const user = (shop: string, key: string, name: string, role: FixtureUser["role"], unitAccess: string[], perms: string[] = []): FixtureUser => ({
  key: `${shop}-${key}`,
  userId: `tripsqc-user-${shop}-${key}`,
  membershipId: `tripsqc-mb-${shop}-${key}`,
  email: `trips-qc-${shop}-${key}@shark.local`,
  name,
  role,
  unitAccess,
  permissions: Object.fromEntries(perms.map((p) => [p, true])),
});
/** acceptedAt ตายตัว (รันซ้ำไม่ขยับ) */
export const TRIPS_ACCEPTED_AT = "2026-11-01T00:00:00+07:00";

// ═══════════════ ร้าน 1: อันดามันไดฟ์ (ทัวร์ + Liveaboard) ═══════════════
// slug "andaman-dive" = จอ 04ง/06 (shark.in.th/b/andaman-dive) · หน่วย BOOKING = ใกล้ที่สุดที่มีวันนี้ (ชนิดหน่วยทัวร์จริงมาใน T0.1)
const DIVE_UNIT: FixtureUnit = { id: "tripsqc-unit-dive", type: "BOOKING", slug: "andaman-dive", name: "อันดามันไดฟ์" };
// TRIPS T0.2 ▸ หน่วยที่สองของอันดามันไดฟ์ ชนิด TRIPS (ใบสั่ง T0.2 §7 · มติ §11 ข้อ 6) — หน่วย BOOKING เดิมคงไว้ · seed ไม่ลบ ◂
const DIVE_TRIPS_UNIT: FixtureUnit = { id: "tripsqc-unit-dive-trips", type: "TRIPS", slug: "andaman-dive-trips", name: "อันดามันไดฟ์ ทัวร์" };
export const SHOP_DIVE = {
  key: "dive",
  tenant: { id: "tripsqc-tenant-dive", slug: "andaman-dive", name: "อันดามันไดฟ์" },
  legalName: "บจก. อันดามันไดฟ์", // จอ 13ค
  template: "DIVE_SHOP" as TripsTemplate, // จอ 10/14 "แม่แบบ ร้านดำน้ำ"
  sells: ["TOUR", "LIVEABOARD"] as const,
  units: { main: DIVE_UNIT, trips: DIVE_TRIPS_UNIT },
  lineOa: "@andamandive", // จอ 06/13
  embedAllowedDomain: "andamandive.com", // จอ 06
  customDomain: "book.andamandive.com", // จอ 06
  pier: "ท่าเรืออ่าวฉลอง", // จอ 01/12
  users: [
    user("dive", "owner", "เจ้าของ (อันดามันไดฟ์ QC)", "OWNER", ["*"]),
    // ไกด์ในจอ 12 = มิ้นท์ · โจ (สิทธิ์โมดูล trips ยังไม่มี — ใบ T-series เติม)
    user("dive", "guide-mint", "มิ้นท์ (ไกด์)", "STAFF", [DIVE_UNIT.id]),
  ],
} as const;

// ═══════════════ ร้าน 2: อควาเรียมอันดามัน (ตั๋ว) ═══════════════
// slug ไม่มีในภาพ — ตั้งเองสำหรับ QC (ดู TODO)
const AQ_UNIT: FixtureUnit = { id: "tripsqc-unit-aquarium", type: "TICKET", slug: "andaman-aquarium", name: "อควาเรียมอันดามัน" };
export const SHOP_AQUARIUM = {
  key: "aquarium",
  tenant: { id: "tripsqc-tenant-aquarium", slug: "andaman-aquarium", name: "อควาเรียมอันดามัน" },
  template: "ATTRACTION" as TripsTemplate,
  sells: ["TICKET"] as const,
  units: { main: AQ_UNIT },
  users: [
    user("aquarium", "owner", "เจ้าของ (อควาเรียมอันดามัน QC)", "OWNER", ["*"]),
    user("aquarium", "gate", "พนักงานประตู A (QC)", "STAFF", [AQ_UNIT.id], ["ticket.checkin.scan"]), // จอ 02 "ประตู A"
  ],
} as const;

export const TRIPS_SHOPS = [SHOP_DIVE, SHOP_AQUARIUM] as const;
export const TRIPS_TENANT_IDS = [SHOP_DIVE.tenant.id, SHOP_AQUARIUM.tenant.id] as const;
export const TRIPS_EMAILS = [...SHOP_DIVE.users, ...SHOP_AQUARIUM.users].map((u) => u.email);

// ═══════════════ ระดับเอเจนซี่ (จอ 10 · ค่าเริ่มต้นแม่แบบ "ร้านดำน้ำ") ═══════════════
export const AGENCY_TIERS = {
  A: { tourBp: 2000, liveaboardBp: 1800, ticketNetDiscountBp: 2500, payment: "CREDIT", creditDays: 30, promoteAt12mSatang: 300_000_000, agencyCount: 2 },
  B: { tourBp: 1500, liveaboardBp: 1500, ticketNetDiscountBp: 2000, payment: "IMMEDIATE", creditDays: null, promoteAt12mSatang: 100_000_000, agencyCount: 7 },
  C: { tourBp: 1000, liveaboardBp: 1000, ticketNetDiscountBp: 1500, payment: "IMMEDIATE", creditDays: null, promoteAt12mSatang: null, agencyCount: 14 }, // "เอเจนซี่ใหม่"
} as const;
export type AgencyTier = keyof typeof AGENCY_TIERS;

/** ค่าอื่นของจอ 10 ที่ใช้ทุกเอเจนซี่ */
export const AGENCY_DEFAULTS = {
  nonCommissionable: ["ค่าอุทยาน", "ค่าท่าเรือ", "ค่าน้ำมัน"],
  halfCommission: ["เช่าอุปกรณ์", "ไนตร็อกซ์"], // คิด 50%
  whtBpThaiCompany: 300, // หัก ณ ที่จ่าย 3% ของคอมมิชชัน (นิติบุคคลไทย)
  peakNewYear: { from: "2026-12-20", to: "2027-01-05", tourBp: 1000, quota: false },
  earlyLiveaboard: { minDaysAhead: 60, extraBp: 200 },
  groupFreeSeat: { minPax: 10, freeSeats: 1 },
} as const;

// ═══════════════ เอเจนซี่ ═══════════════
export const AGENCY_PTD = {
  partyId: "tripsqc-party-agency-ptd",
  code: "PTD",
  name: "ภูเก็ตทราเวลเดสก์",
  legalName: "บจก. ภูเก็ตทราเวลเดสก์", // จอ 13ง
  tier: "B" as AgencyTier,
  commissionBp: 1500,
  creditLimitSatang: 15_000_000, // ฿150,000
  termDays: 15,
  payment: "CREDIT", // ปรับจากระดับ B (จ่ายทันที) — จอ 10
  overLimit: "WARN_NO_BLOCK", // จอ 10
  statementDays: [1, 16], // จอ 10
  whtBp: 300,
  maxDiscountFromCommissionBp: 500, // จอ 04ง/10
  contract: { from: "2026-11-01", to: "2027-10-31" }, // จอ 10
  userCount: 3, // จอ 10
  sampleRef: "PTD-2291", // จอ 04ค/05/13ข
  sellers: ["แนน", "บอย"], // จอ 05 คอลัมน์ผู้ขาย
} as const;

export const AGENCY_BLUE_PLANET = {
  partyId: "tripsqc-party-agency-blueplanet",
  code: null, // TODO: ไม่มีในภาพ
  name: "Blue Planet Travel", // จอ 08/12 (README: "Blue Planet")
  tier: "C" as AgencyTier,
  commissionBp: 1000,
} as const;

// ═══════════════ สินค้าของอันดามันไดฟ์ ═══════════════
export const PRODUCT_RACHA = {
  name: "เกาะราชาใหญ่ เดย์ทริป",
  time: { start: "08:00", end: "16:30" },
  boat: "เรือราชา 1",
  capacity: 24,
  minPax: 8, // จอ 11
  adultSatang: 350_000,
  childSatang: 245_000, // 70% ของผู้ใหญ่ (จอ 10/14)
  childPriceBp: 7000,
  childAge: { min: 4, max: 11 },
  parkAdultSatang: 60_000, // ไม่คิดคอมมิชชัน
  parkChildSatang: 30_000,
  extras: {
    camera: { name: "เช่ากล้องกันน้ำ", satang: 50_000 },
    introDive: { name: "ทดลองดำน้ำลึก 1 ไดฟ์", satang: 190_000, minAge: 10 },
    outOfZonePickup: { name: "รับส่งนอกโซน (ต่อคัน ไป-กลับ)", satang: 60_000 },
  },
  holdMinutes: 15,
  ptdQuota: { seats: 10, releaseDaysBefore: 2 }, // จอ 10
} as const;

export const PRODUCT_PHIPHI = { name: "เกาะพีพี + เกาะไข่ สปีดโบ๊ต", capacity: 30, minPax: 10, adultSatang: 290_000, ptdQuota: { seats: 6, releaseDaysBefore: 2 } } as const; // จอ 04ข/10/11
export const PRODUCT_DEEP3 = { name: "ดำน้ำลึก 3 ไดฟ์ เกาะราชาน้อย", capacity: 12, minPax: 4, guideRatio: 4, ptdNetSatang: 360_000, ptdMinSellSatang: 430_000 } as const; // จอ 04ข/10/11

/** ราคาเอเจนซี่ PTD ต่อผู้ใหญ่ (จอ 04ข/10) */
export const PTD_RATES = {
  racha: { sellSatang: 350_000, toShopSatang: 297_500, earnSatang: 52_500 },
  phiphi: { sellSatang: 290_000, toShopSatang: 246_500, earnSatang: 43_500 },
  deep3: { netSatang: 360_000, minSellSatang: 430_000, earnMinSatang: 70_000 },
  aquariumBundle: { retailSatang: 35_000, netSatang: 28_000, minSellSatang: 30_000, minQty: 50, validDays: 90 },
} as const;

// ═══════════════ การจองทัวร์ TR-6911-0142 (จอ 01/07/13) ═══════════════
export const BOOKING_TR_0142 = {
  ref: "TR-6911-0142",
  customer: "ภัทรา สายใจ",
  date: "2026-11-14",
  channel: "LINE",
  pickup: "กะตะ บีช รีสอร์ต",
  adults: 2,
  children: 1,
  lines: [
    { label: "ผู้ใหญ่", qty: 2, unitSatang: 350_000, totalSatang: 700_000 },
    { label: "เด็ก", qty: 1, unitSatang: 245_000, totalSatang: 245_000 },
    { label: "ค่าอุทยาน ผู้ใหญ่", qty: 2, unitSatang: 60_000, totalSatang: 120_000 },
    { label: "ค่าอุทยาน เด็ก", qty: 1, unitSatang: 30_000, totalSatang: 30_000 },
    { label: "เช่ากล้องกันน้ำ", qty: 1, unitSatang: 50_000, totalSatang: 50_000 },
  ] satisfies MoneyLine[],
  parkSatang: 150_000,
  totalSatang: 1_145_000,
  slipShort: { slipSatang: 1_140_000, shortSatang: 5_000 }, // จอ 07ค
} as const;

/** ใบเสร็จ/ใบกำกับ RC-6911-0588 (จอ 13ค) — ค่าอุทยานเป็นเงินเก็บแทน นอกฐานภาษี */
export const RECEIPT_RC_0588 = {
  ref: "RC-6911-0588",
  bookingRef: "TR-6911-0142",
  issuedAt: "2026-11-11T20:18:00+07:00",
  serviceInclVatSatang: 995_000,
  vatBp: 700,
  preVatSatang: 929_907,
  vatSatang: 65_093,
  parkPassThroughSatang: 150_000,
  totalSatang: 1_145_000,
} as const;

// ═══════════════ เอเจนซี่จอง 2 ผู้ใหญ่ราชา TR-6911-0151 (จอ 04ค/05/10) ═══════════════
export const AGENCY_CASE_2ADULTS = {
  ref: "TR-6911-0151",
  customer: "Jonas Weber",
  agencyRef: "PTD-2291",
  adults: 2,
  saleSatang: 700_000,
  parkSatang: 120_000,
  collectSatang: 820_000,
  commissionBaseSatang: 700_000,
  commissionBp: 1500,
  commissionSatang: 105_000,
  /** ชุดเดิม (ไม่หัก ณ ที่จ่าย) — README บรรทัด 2 */
  toShopNoWhtSatang: 715_000,
  whtBp: 300,
  whtSatang: 3_150,
  toShopSatang: 718_150,
  credit: {
    limitSatang: 15_000_000,
    usedSatang: 8_630_000, // จอ 04ก/05
    availableSatang: 6_370_000,
    /** README: 63,700 → 56,550 (ชุดไม่หัก ณ ที่จ่าย) */
    availableAfterLegacySatang: 5_655_000,
    /** จอ 04ค: วงเงินเหลือ ฿56,518.50 (ชุดหัก ณ ที่จ่าย) */
    availableAfterWhtSatang: 5_651_850,
  },
} as const;

/** ตารางการจองของ PTD จอ 05 — ส่งร้าน = เก็บลูกค้า − คอมฯ + หัก ณ ที่จ่าย 3% ของคอมฯ (null = ลูกค้าจ่ายร้านตรง) */
export const PTD_BOOKINGS_TABLE = [
  { ref: "TR-6911-0151", product: "racha", date: "2026-11-14", pax: "2 ผู้ใหญ่", customer: "Jonas Weber", seller: "แนน", collectSatang: 820_000, toShopSatang: 718_150, earnSatang: 105_000, status: "ยืนยัน" },
  { ref: "TR-6911-0148", product: "racha", date: "2026-11-14", pax: "4 ผู้ใหญ่", customer: "สมชาย ใจดี", seller: "ลิงก์ขาย", collectSatang: null, toShopSatang: null, earnSatang: 210_000, status: "ยืนยัน · ขาดรายชื่อ" },
  { ref: "TR-6911-0146", product: "phiphi", date: "2026-11-15", pax: "2 ผู้ใหญ่", customer: "Li Wei", seller: "บอย", collectSatang: 580_000, toShopSatang: 495_610, earnSatang: 87_000, status: "ถือที่ถึง 18:00" },
  { ref: "LB-7002-0029", product: "liveaboard", date: "2027-02-14", pax: "เคบิน S3 · 2 คน", customer: "Anna Müller", seller: "แนน", collectSatang: 5_940_000, toShopSatang: 5_128_110, earnSatang: 837_000, status: "มัดจำแล้ว · งวด 2: 16 ธ.ค." },
  { ref: "TK-6911-0290", product: "aquariumBundle", date: "2027-01-31", pax: "ชุดตั๋ว 50 ใบ · ขายแล้ว 22", customer: "ซื้อล่วงหน้า", seller: "บัญชี", collectSatang: null, toShopSatang: 1_400_000, earnSatang: 350_000, status: "จ่ายแล้ว" },
  { ref: "TR-6911-0139", product: "racha", date: "2026-11-13", pax: "3 ผู้ใหญ่", customer: "Kim Min-jun", seller: "บอย", collectSatang: 1_230_000, toShopSatang: 1_077_225, earnSatang: 157_500, status: "ร้านเลื่อนรอบ · เลือกวันใหม่" },
] as const;

/** สรุปพอร์ทัลเอเจนซี่ พ.ย. 2569 (จอ 04ก/05) */
export const PTD_PORTAL_NOV = {
  salesSatang: 41_260_000,
  bookings: 42,
  pax: 118,
  growthVsOctBp: 1800,
  commissionSatang: 5_814_000,
  commissionTravelledSatang: 3_120_000,
  commissionPendingSatang: 2_694_000,
  linkCommission: { travelledSatang: 1_260_000, whtSatang: 37_800, payoutSatang: 1_222_200, payoutDate: "2026-11-30" },
  link30d: { views: 214, bookings: 17, pax: 41, commissionSatang: 2_152_500 }, // จอ 04ง
  quotas: [
    { product: "racha", date: "2026-11-14", used: 6, of: 10, release: "2026-11-12" },
    { product: "phiphi", date: "2026-11-15", used: 2, of: 6, release: "2026-11-13" },
    { product: "liveaboard", date: "2027-02-14", used: 1, of: 2, release: "2026-12-16", unit: "cabin" },
  ],
} as const;

// ═══════════════ ใบแจ้งยอด PTD 1–15 พ.ย. ═══════════════
/** ฉบับหัก ณ ที่จ่าย (ปัจจุบัน) — จอ 13ง · README บรรทัดท้าย */
export const STATEMENT_ST_PTD_1 = {
  ref: "ST-6911-PTD-1",
  period: { from: "2026-11-01", to: "2026-11-15" },
  dueDate: "2026-11-15",
  confirmedBookings: 31,
  salesSatang: 10_170_000,
  parkPassThroughSatang: 1_140_000,
  commissionBp: 1500,
  commissionSatang: 1_525_500,
  whtBp: 300,
  whtSatang: 45_765,
  cancelledBookings: 2,
  cancelledSatang: 718_150,
  paidDuringPeriodSatang: 500_000,
  totalSatang: 8_612_115,
} as const;

/** ⚠️ ชุดเดิม — ตัวอย่างในจอ 04ก/05 เท่านั้น (วาดก่อนผลตรวจกฎหมาย) · ห้ามใช้เป็นค่าคาดของโค้ดใหม่ */
export const STATEMENT_LEGACY_EXAMPLE_ONLY = {
  legacy: true,
  confirmedBookings: 31,
  confirmedSatang: 9_845_000,
  cancelledCount: 2,
  cancelledSatang: 715_000,
  paidDuringPeriodSatang: 500_000,
  totalSatang: 8_630_000,
} as const;

// ═══════════════ Liveaboard: เรือ · ผังเรือ · การจอง D1 ═══════════════
export const VESSEL = { name: "MV อันดามัน เอ็กซ์พลอเรอร์", tankCount: 20 } as const; // จอ 03/08
export const CABIN_TYPES = {
  M: { name: "มาสเตอร์", bed: "เตียงคู่", perPersonSatang: 3_890_000, splitBerth: false },
  D: { name: "ดีลักซ์", bed: "เตียงคู่ · เดี่ยว", perPersonSatang: 3_290_000, splitBerth: false, areaSqm: 12 },
  S: { name: "สแตนดาร์ด", bed: "เตียงสองชั้น", perPersonSatang: 2_790_000, splitBerth: true, sameGender: true },
} as const;
export type CabinTypeKey = keyof typeof CABIN_TYPES;

export const TRIP_SIMILAN = {
  name: "Liveaboard สิมิลัน 4 คืน",
  route: "สิมิลัน · เกาะบอน · ริเชลิว",
  start: "2027-02-14", // 14 ก.พ. 2570
  end: "2027-02-18",
  nights: 4,
  dives: 14,
  embark: { pier: "ท่าทับละมุ", time: "18:00" },
  minPax: 8,
  parkPerPersonSatang: 180_000,
  depositBp: 3000, // ของค่าเคบิน ไม่รวมค่าอุทยาน
  balanceDaysBefore: 60,
  balanceDue: "2026-12-16",
  docsDue: "2027-01-14",
  holdMinutes: 30,
  cancellation: [
    { until: "2026-12-16", rule: "คืนมัดจำ 50%" },
    { from: "2026-12-16", until: "2027-01-14", rule: "คืน 30% ของยอดรวม" },
    { from: "2027-01-14", rule: "ไม่คืน" },
  ],
} as const;

/** การจอง D1 (จอ 03/08 · README) */
export const BOOKING_LB_0031 = {
  ref: "LB-7002-0031",
  cabin: "D1",
  customer: "ภัทรา สายใจ",
  channel: "LINE",
  bookedOn: "2026-11-11",
  depositReceipt: "RC-6911-0611",
  persons: 2,
  cabinPerPersonSatang: 3_290_000,
  cabinSatang: 6_580_000,
  parkSatang: 360_000,
  totalSatang: 6_940_000,
  depositSatang: 1_974_000,
  balanceSatang: 4_966_000,
  balanceDue: "2026-12-16",
} as const;

export type DeckCabinState = "PAID" | "DEPOSIT" | "HELD" | "FREE";
export type DeckCabin = {
  code: string;
  deck: "UPPER" | "MAIN" | "LOWER";
  type: CabinTypeKey;
  berths: number;
  state: DeckCabinState;
  guests: string[];
  bookingRef: string | null;
  soldBerths: number;
  heldBerths: number;
  /** ค่าเคบินที่จอง (ไม่รวมค่าอุทยาน — ยอดหัวจอ 08 คิดแบบนี้ ดู DISCREPANCIES) */
  bookedSatang: Satang;
  paidSatang: Satang;
  note?: string;
};

/** ผังเรือเวอร์ชัน 2 ทริป 14–18 ก.พ. 2570 ณ 12 พ.ย. 2569 — จอ 08 (3 ดาดฟ้า · 10 เคบิน · 20 เตียง) */
export const DECKPLAN_V2: { version: 2; decks: { UPPER: number; MAIN: number; LOWER: number }; cabins: DeckCabin[] } = {
  version: 2,
  decks: { UPPER: 2, MAIN: 2, LOWER: 6 },
  cabins: [
    { code: "M1", deck: "UPPER", type: "M", berths: 2, state: "PAID", guests: ["Tanaka K.", "Tanaka Y."], bookingRef: null, soldBerths: 2, heldBerths: 0, bookedSatang: 7_780_000, paidSatang: 7_780_000 },
    { code: "M2", deck: "UPPER", type: "M", berths: 2, state: "FREE", guests: [], bookingRef: null, soldBerths: 0, heldBerths: 0, bookedSatang: 0, paidSatang: 0 },
    { code: "D1", deck: "MAIN", type: "D", berths: 2, state: "DEPOSIT", guests: ["ภัทรา ส.", "ผู้เดินทางคนที่ 2"], bookingRef: "LB-7002-0031", soldBerths: 2, heldBerths: 0, bookedSatang: 6_580_000, paidSatang: 1_974_000 },
    { code: "D2", deck: "MAIN", type: "D", berths: 2, state: "PAID", guests: ["Dubois M.", "Dubois C."], bookingRef: null, soldBerths: 2, heldBerths: 0, bookedSatang: 6_580_000, paidSatang: 6_580_000 },
    { code: "S1", deck: "LOWER", type: "S", berths: 2, state: "DEPOSIT", guests: ["Sofia R. (หญิง)"], bookingRef: null, soldBerths: 1, heldBerths: 0, bookedSatang: 2_790_000, paidSatang: 837_000, note: "แชร์ · รับเฉพาะผู้หญิง · ว่าง 1 เตียง" },
    { code: "S2", deck: "LOWER", type: "S", berths: 2, state: "FREE", guests: [], bookingRef: null, soldBerths: 0, heldBerths: 0, bookedSatang: 0, paidSatang: 0, note: "โควตา PTD ถึง 16 ธ.ค." },
    { code: "D3", deck: "LOWER", type: "D", berths: 2, state: "FREE", guests: [], bookingRef: null, soldBerths: 0, heldBerths: 0, bookedSatang: 0, paidSatang: 0 },
    { code: "S3", deck: "LOWER", type: "S", berths: 2, state: "DEPOSIT", guests: ["Müller A.", "Müller J."], bookingRef: "LB-7002-0029", soldBerths: 2, heldBerths: 0, bookedSatang: 5_580_000, paidSatang: 1_674_000, note: "เอเจนซี่ PTD" },
    { code: "S4", deck: "LOWER", type: "S", berths: 2, state: "FREE", guests: [], bookingRef: null, soldBerths: 0, heldBerths: 0, bookedSatang: 0, paidSatang: 0 },
    { code: "D4", deck: "LOWER", type: "D", berths: 2, state: "HELD", guests: [], bookingRef: null, soldBerths: 0, heldBerths: 2, bookedSatang: 0, paidSatang: 0, note: "ถือโดย Blue Planet Travel ถึง 13 พ.ย. 18:00 · ต่ออายุได้ 1 ครั้ง" },
  ],
};
export const DECKPLAN_V2_TOTALS = {
  cabins: 10,
  berths: 20,
  soldBerths: 9,
  soldCabins: 5,
  heldBerths: 2,
  freeBerths: 9,
  freeCabins: 4, // + 1 เตียงแชร์ (หญิง)
  bookedSatang: 29_310_000,
  paidSatang: 18_845_000,
  outstandingSatang: 10_465_000,
  fullBoatSatang: 64_200_000,
  guestDocsComplete: 4,
} as const;

/** ผังเรือเวอร์ชัน 3 (จอ 09) — เพิ่ม S5 S6 ที่ดาดฟ้าล่าง แทนห้องเก็บของ · ใช้ตั้งแต่ทริปออก 1 พ.ค. 2570 */
export const DECKPLAN_V3 = {
  version: 3,
  effectiveFrom: "2027-05-01",
  addedCabins: [
    { code: "S5", deck: "LOWER", type: "S" as CabinTypeKey, berths: 2, areaSqm: 8, window: "ช่องกลม", note: "ใกล้ห้องเครื่อง เสียงดังกว่า" },
    { code: "S6", deck: "LOWER", type: "S" as CabinTypeKey, berths: 2 },
  ],
  lowerDeck: { cabins: 8, berths: 16 },
  byType: { M: { cabins: 2, berths: 4 }, D: { cabins: 4, berths: 8 }, S: { cabins: 6, berths: 12 } },
  cabins: 12,
  berths: 24,
  maxGuests: 24,
  fullBoatSatang: 75_360_000,
  impact: { tripsBefore: 14, bookingsBefore: 31, tripsFrom: 9, bookingsFrom: 0 },
} as const;

// ═══════════════ รอบ ส. 14 พ.ย. เกาะราชา (จอ 01/04/05/11/12) ═══════════════
export type DepartureBooking = { ref: string; channel: "LINE" | "WEB" | "WALK_IN" | "AGENCY" | "AGENCY_LINK"; agency: "PTD" | "BLUE_PLANET" | null; customer: string; adults: number; children: number; pickup: string };
export const DEPARTURE_RACHA_1114 = {
  product: "racha",
  date: "2026-11-14",
  capacity: 24,
  sold: 15,
  free: 9,
  adults: 13,
  children: 2,
  bookings: [
    { ref: "TR-6911-0142", channel: "LINE", agency: null, customer: "ภัทรา สายใจ", adults: 2, children: 1, pickup: "กะตะ บีช รีสอร์ต" },
    { ref: "TR-6911-0151", channel: "AGENCY", agency: "PTD", customer: "Jonas Weber", adults: 2, children: 0, pickup: "กะรน ซี แซนด์" },
    { ref: "TR-6911-0148", channel: "AGENCY_LINK", agency: "PTD", customer: "สมชาย ใจดี", adults: 4, children: 0, pickup: "ป่าตอง เมอร์ลิน" },
    { ref: "TR-6911-0155", channel: "WEB", agency: null, customer: "Chen Yu", adults: 2, children: 0, pickup: "มาเอง (ท่าเรืออ่าวฉลอง)" },
    { ref: "TR-6911-0157", channel: "AGENCY", agency: "BLUE_PLANET", customer: "Sarah Lee", adults: 2, children: 1, pickup: "ฉลอง วิลล่า" },
    { ref: "TR-6911-0160", channel: "WALK_IN", agency: null, customer: "วิทยา พรหมมา", adults: 1, children: 0, pickup: "มาเอง (ท่าเรืออ่าวฉลอง)" },
  ] satisfies DepartureBooking[],
  revenueSatang: 5_040_000,
  parkSatang: 840_000,
  commission: { ptdSatang: 315_000, bluePlanetSatang: 94_500, totalSatang: 409_500 },
  costSatang: 2_150_000, // ไม่มีรายการแตก (TODO)
  grossProfitSatang: 2_480_500,
  ptdQuota: { seats: 10, released: 4, used: 6 },
  onboardSalesSatang: 340_000, // จอ 12ค ขายเพิ่มบนเรือ
} as const;

/** ปฏิทินรอบ 11–17 พ.ย. (จอ 11) — sold/cap · cancelled = จำนวนคนในรอบที่ยกเลิก · moved = ย้ายแล้ว */
export type CalendarCell = { date: string; sold: number | null; cap: number; status: string; cancelledPax?: number; moved?: number; waitlist?: number };
export const CALENDAR_WEEK_1111 = {
  asOf: TRIPS_AS_OF,
  rows: {
    racha: [
      { date: "2026-11-11", sold: 22, cap: 24, status: "เดินทางแล้ว" },
      { date: "2026-11-12", sold: 10, cap: 24, status: "ออกเรือแล้ว" },
      { date: "2026-11-13", sold: null, cap: 24, status: "ยกเลิก คลื่นลม", cancelledPax: 24, moved: 9 },
      { date: "2026-11-14", sold: 15, cap: 24, status: "ยืนยันออก" },
      { date: "2026-11-15", sold: 21, cap: 24, status: "เหลือ 3" },
      { date: "2026-11-16", sold: 4, cap: 24, status: "ต่ำกว่าขั้นต่ำ 8" },
      { date: "2026-11-17", sold: 0, cap: 24, status: "เปิดขาย" },
    ],
    phiphi: [
      { date: "2026-11-11", sold: 18, cap: 30, status: "เดินทางแล้ว" },
      { date: "2026-11-12", sold: 12, cap: 30, status: "ออกเรือแล้ว" },
      { date: "2026-11-13", sold: null, cap: 30, status: "ยกเลิก คลื่นลม", cancelledPax: 14, moved: 6 },
      { date: "2026-11-14", sold: 20, cap: 30, status: "ยืนยันออก" },
      { date: "2026-11-15", sold: 27, cap: 30, status: "เหลือ 3" },
      { date: "2026-11-16", sold: 9, cap: 30, status: "ขาดอีก 1 คน" },
      { date: "2026-11-17", sold: 6, cap: 30, status: "เปิดขาย" },
    ],
    deep3: [
      { date: "2026-11-11", sold: 8, cap: 12, status: "เดินทางแล้ว" },
      { date: "2026-11-12", sold: 5, cap: 12, status: "ออกเรือแล้ว" },
      { date: "2026-11-13", sold: null, cap: 12, status: "ยกเลิก คลื่นลม", cancelledPax: 6, moved: 2 },
      { date: "2026-11-14", sold: 12, cap: 12, status: "เต็ม", waitlist: 2 },
      { date: "2026-11-15", sold: 7, cap: 12, status: "ต้องการไกด์ 2" },
      { date: "2026-11-16", sold: 2, cap: 12, status: "ต่ำกว่าขั้นต่ำ 4" },
    ],
  } satisfies Record<string, CalendarCell[]>,
  cancelled13: { departures: 3, pax: 44, moved: 17, undecided: 27, autoRefundOn: "2026-11-15" },
} as const;

// ═══════════════ ตั๋ว: อควาเรียม (จอ 02) ═══════════════
export const AQUARIUM_PRODUCT = {
  eventName: "บัตรเข้าชม + โชว์ให้อาหารฉลาม",
  sessions: ["10:00", "13:00", "15:30", "17:00"],
  /** ที่ว่าง ณ 11 พ.ย. 11:02 (โควตารวมไม่มีในภาพ — TODO) */
  availabilityAt1102: { "13:00": 86, "15:30": 12, "17:00": 140 },
  types: [
    { key: "adult", name: "ผู้ใหญ่", priceSatang: 35_000, sortOrder: 1 },
    { key: "child", name: "เด็ก สูง 90–140 ซม.", priceSatang: 20_000, sortOrder: 2 },
    { key: "senior", name: "ผู้สูงอายุ 60+", priceSatang: 20_000, sortOrder: 3, description: "แสดงบัตรที่ประตู" },
  ],
  addOns: [{ name: "ชุดอาหารปลา", priceSatang: 6_000 }],
  holdMinutes: 15,
  rebookRule: "เปลี่ยนรอบได้ 1 ครั้ง ก่อนเวลาเข้าชม 2 ชม. ไม่คืนเงิน",
} as const;

/** ตั๋วที่ seed ลงฐาน (โมดูล ticket เดิม — 1 อีเวนต์ = รอบ 13:00 ของ 11 พ.ย. ที่ TK-6911-0318 ใช้) */
export const SEED_TICKET_EVENT = {
  name: `${AQUARIUM_PRODUCT.eventName} · รอบ 13:00`,
  startAt: "2026-11-11T13:00:00+07:00",
  quota: 0, // TODO: โควตารวมต่อรอบไม่มีในภาพ — ใบตั๋ว (K-series) ตั้งเอง
} as const;

export const TICKET_ORDER_TK_0318 = {
  ref: "TK-6911-0318",
  date: "2026-11-11",
  session: "13:00",
  entryWindow: { from: "12:45", to: "13:30" },
  gate: "A",
  lines: [
    { label: "ผู้ใหญ่", qty: 2, unitSatang: 35_000, totalSatang: 70_000 },
    { label: "เด็ก", qty: 1, unitSatang: 20_000, totalSatang: 20_000 },
  ] satisfies MoneyLine[],
  admissions: ["TK-6911-0318-1", "TK-6911-0318-2", "TK-6911-0318-3"],
  totalSatang: 90_000,
} as const;

// ═══════════════ คืนเงิน TR-6912-0188 (จอ 15) ═══════════════
export const REFUND_POLICY_TEMPLATE = [
  { minDays: 30, refundBp: 10_000 },
  { minDays: 15, refundBp: 5_000 },
  { minDays: 0, refundBp: 0 },
] as const;

export const REFUND_TR_0188 = {
  ref: "TR-6912-0188",
  customer: "ภัทรา สายใจ",
  receipt: "RC-6911-0612",
  bookedOn: "2026-11-11",
  travelDate: "2026-12-05",
  requestedAt: "2026-11-12T09:14:00+07:00",
  daysBefore: 23,
  refundBp: 5_000,
  lines: [
    { label: "ค่าทริป 2 ผู้ใหญ่ 1 เด็ก", paidSatang: 945_000, refundSatang: 472_500, keptSatang: 472_500, rule: "BP" },
    { label: "เช่ากล้องกันน้ำ", paidSatang: 50_000, refundSatang: 25_000, keptSatang: 25_000, rule: "BP" },
    { label: "ค่าอุทยาน (เก็บแทน)", paidSatang: 150_000, refundSatang: 150_000, keptSatang: 0, rule: "FULL" },
  ],
  paidSatang: 1_145_000,
  refundSatang: 647_500,
  keptSatang: 497_500,
  /** เครดิตร้าน = คืน + 20% ของส่วนที่ร้านเก็บ */
  creditBonusBp: 2_000,
  creditSatang: 747_000,
  managerOverrideOverSatang: 200_000,
} as const;

/** คิวคืนเงินจอ 15 — ยอดรวมเท่านั้น (ไม่มีรายการแตก) */
export const REFUND_QUEUE = {
  pending: [
    { ref: "TR-6912-0188", amountSatang: 647_500, state: "รออนุมัติ" },
    { ref: "TR-6911-0139", amountSatang: null, state: "คืน 100% อัตโนมัติ · ลดยอดเอเจนซี่" },
    { ref: "TK-6911-0301", amountSatang: null, state: "นอกนโยบาย · ต้องตัดสิน" },
    { ref: "LB-7002-0027", amountSatang: 987_000, state: "รอโอนคืน" },
  ],
  doneThisMonth: { count: 11, amountSatang: 4_823_000 },
} as const;

// ═══════════════ Party ที่ seed (ผู้ติดต่อจากภาพ) ═══════════════
export const DIVE_PARTIES: FixtureParty[] = [
  { id: AGENCY_PTD.partyId, kind: "COMPANY", name: AGENCY_PTD.legalName, note: "เอเจนซี่ PTD ระดับ B" },
  { id: AGENCY_BLUE_PLANET.partyId, kind: "COMPANY", name: AGENCY_BLUE_PLANET.name, note: "เอเจนซี่ระดับ C" },
  { id: "tripsqc-party-dive-pattra", kind: "PERSON", name: "ภัทรา สายใจ", note: "TR-6911-0142 · LB-7002-0031 · TR-6912-0188" },
  { id: "tripsqc-party-dive-jonas", kind: "PERSON", name: "Jonas Weber", note: "TR-6911-0151 (PTD)" },
  { id: "tripsqc-party-dive-somchai", kind: "PERSON", name: "สมชาย ใจดี", note: "TR-6911-0148 (ลิงก์ PTD)" },
  { id: "tripsqc-party-dive-sarah", kind: "PERSON", name: "Sarah Lee", note: "TR-6911-0157 (Blue Planet)" },
  { id: "tripsqc-party-dive-chenyu", kind: "PERSON", name: "Chen Yu", note: "TR-6911-0155 (เว็บ)" },
  { id: "tripsqc-party-dive-wittaya", kind: "PERSON", name: "วิทยา พรหมมา", note: "TR-6911-0160 (หน้าร้าน)" },
  { id: "tripsqc-party-dive-anna", kind: "PERSON", name: "Anna Müller", note: "LB-7002-0029 (PTD)" },
];
/** ภัทราซื้อตั๋วอควาเรียมด้วย (เบอร์เดียวกัน 089-xxx-1180 จอ 01/02) — ชื่อซ้ำข้ามร้านโดยตั้งใจ (ข้อสอบแยกร้าน) */
export const AQUARIUM_PARTIES: FixtureParty[] = [{ id: "tripsqc-party-aq-pattra", kind: "PERSON", name: "ภัทรา สายใจ", note: "TK-6911-0318" }];

// ═══════════════ สิ่งที่หาไม่พบ / ภาพไม่ตรงกัน ═══════════════
export const TRIPS_FIXTURE_TODO = [
  "Blue Planet Travel: รหัสเอเจนซี่ · ชื่อนิติบุคคล · วงเงิน/เทอม (ภาพบอกแค่ระดับ C 10%)",
  "รอบ ส. 14 พ.ย.: ต้นทุนรอบ ฿21,500 ไม่มีรายการแตก (เรือ/ไกด์/รถ/อาหาร)",
  "อควาเรียม: โควตารวมต่อรอบ (ภาพมีแค่ที่ว่าง 13:00=86 · 15:30=12 · 17:00=140) ⇒ seed ตั้ง quota 0",
  "อควาเรียม: slug ร้าน/หน่วย และชื่อนิติบุคคล ไม่มีในภาพ (ใช้ andaman-aquarium สำหรับ QC)",
  "อันดามันไดฟ์: ชนิดหน่วยทัวร์ยังไม่มีใน UnitType (seed ใช้ BOOKING ชั่วคราว จนกว่า T0.1)",
  "เบอร์/อีเมลลูกค้าในภาพถูกปิดบางส่วน (089-xxx-1180) ⇒ Party ไม่มีเบอร์/อีเมล",
  "ผังเรือ: ค่าอุทยานของ M1/D2/S1 จ่ายแล้วหรือยัง ไม่ระบุ (ยอดหัวจอ 08 ไม่รวมค่าอุทยาน)",
  "คืนเงิน LB-7002-0027 ฿9,870 · TK-6911-0301 · TR-6911-0139 และ 'เสร็จแล้ว 11 รายการ ฿48,230' ไม่มีรายการแตก",
  "ใบแจ้งยอด ST-6911-PTD-1: 'ยกเลิก/คืน 2 การจอง −7,181.50' ไม่มีรายการแตกต่อการจอง",
] as const;

export const TRIPS_FIXTURE_DISCREPANCIES = [
  "วงเงินหลังจอง 2 ผู้ใหญ่: README 63,700 → 56,550 (ไม่หัก ณ ที่จ่าย) ≠ จอ 04ค ฿56,518.50 (หัก ณ ที่จ่าย 7,181.50)",
  "ผังเรือจอ 08: ยอดจอง/รับแล้ว/ค้างรับ (293,100/188,450/104,650) คิดเฉพาะค่าเคบิน — แต่การ์ด D1 ในจอเดียวกันแสดงค้างรับ 49,660 (รวมค่าอุทยาน 3,600) ⇒ ถ้ารวมค่าอุทยาน ค้างรับของหัวจอต้องเป็นยอดอื่น",
  "ดาดฟ้า: จอ 03 (ลูกค้า) แสดง 2 ดาดฟ้า (บน: M1 M2 D1 D2 · ล่าง: D3 D4 S1–S4) ≠ จอ 08/09 3 ดาดฟ้า (บน M1 M2 · หลัก D1 D2 · ล่าง 6 เคบิน)",
  "ที่ว่าง ส. 14 พ.ย.: จอ 01/07ก/11 'ว่าง 9' ≠ จอ 07ข/07ง 'ยังว่าง 7'",
  "นโยบายยกเลิกทริปราชาที่จอง 11 พ.ย.: TR-6911-0142 (จอ 01/13) 'ฟรีถึง 48 ชม./ถึง 12 พ.ย. 08:00 หลังจากนั้นคืน 50%' ≠ TR-6912-0188 (จอ 15) กติกาที่จดไว้ตอนจอง 11 พ.ย. = 100% ≥30 วัน · 50% 15–29 · 0% <15",
  "ใบแจ้งยอด: จอ 05 ยังเป็นชุดเดิม ฿86,300 (−7,150) ขณะแถว TR-6911-0151 ในจอเดียวกันแสดงส่งร้าน 7,181.50 (README รับรู้แล้ว)",
  "ตั๋วอควาเรียม: README ว่าเป็นร้านแยก แต่จอ 05/10 มี 'อควาเรียม ชุดตั๋ว' อยู่ในสัญญา PTD ของอันดามันไดฟ์ (TK-6911-0290) และจอ 15 (ร้านอันดามันไดฟ์) มีคำขอคืนตั๋ว TK-6911-0301",
  "ยกเลิก/คืน '2 การจอง' ในใบแจ้งยอดทั้งสองชุด = ยอดส่งร้านของการจอง 2 ผู้ใหญ่ 1 รายการพอดี (7,150 / 7,181.50)",
] as const;

// ═══════════════ TRIPS T0.2 ▸ สินค้า 4 ตัวของจอ 16 (seed ผ่าน facade trips) ═══════════════
// ข้อมูลล้วน · ตัวเลขอ้างจาก PRODUCT_RACHA / PRODUCT_PHIPHI / PRODUCT_DEEP3 / TRIP_SIMILAN (ไม่พิมพ์ซ้ำ)
// ราชา: EN ยังไม่แปล 2 ส่วน (กำหนดการ · จุดนัดพบ) · ตัวเลือก "เหมาเรือส่วนตัว" = ขอราคาเท่านั้น ⇒ active=false (มติ §11 ข้อ 7)
// ค่าอุทยาน: priceMinor = ผู้ใหญ่ + paxPrices ผู้ใหญ่/เด็ก (มติ §11 ข้อ 4) · ธงจาก T44 (ไม่ส่ง) · ทุกตัว ACTIVE
export type SeedI18n = { th: string; en?: string };
export type SeedExtra = {
  kind: "PARK_FEE" | "EQUIPMENT" | "COURSE";
  basis: "PER_PAX" | "PER_BOOKING";
  mandatory: boolean;
  priceMinor: Satang;
  paxPrices: Record<string, Satang> | null;
  name: SeedI18n;
  note: SeedI18n | null;
};
export type SeedOption = { name: SeedI18n; durationMin: number | null; nights: number | null; active: boolean };
export type SeedProduct = {
  key: "racha" | "phiphi" | "deep3" | "similan";
  slug: string;
  productType: "TOUR" | "LIVEABOARD";
  currency: "THB";
  deepDive: boolean;
  title: SeedI18n;
  body: { summary: SeedI18n; itinerary: SeedI18n; includes: SeedI18n };
  meeting: SeedI18n;
  disclosure: { accommodationMeals: SeedI18n; guides: SeedI18n };
  options: SeedOption[];
  extras: SeedExtra[];
};
const hhmm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const PARK_NAME: SeedI18n = { th: "ค่าอุทยาน", en: "Marine park fee" };
export const TRIPS_SEED_PRODUCTS: readonly SeedProduct[] = [
  {
    key: "racha",
    slug: "racha-yai-day-trip",
    productType: "TOUR",
    currency: "THB",
    deepDive: false,
    title: { th: PRODUCT_RACHA.name, en: "Racha Yai Island Day Trip" },
    body: {
      summary: { th: "ดำน้ำตื้นชมปะการังเกาะราชาใหญ่ 3 จุด พร้อมอาหารกลางวันบนเกาะ", en: "Snorkel three reef spots around Racha Yai with lunch on the island" },
      itinerary: { th: `${PRODUCT_RACHA.time.start} รับที่โรงแรม · ออกจาก${SHOP_DIVE.pier} · ดำน้ำตื้น 3 จุด · อาหารกลางวัน · ${PRODUCT_RACHA.time.end} กลับถึงท่า` },
      includes: { th: "รถรับส่ง · เรือ · อุปกรณ์ดำน้ำตื้น · อาหารกลางวัน · ประกันอุบัติเหตุ", en: "Transfer · boat · snorkel gear · lunch · accident insurance" },
    },
    meeting: { th: `${SHOP_DIVE.pier} หรือรับที่โรงแรมในโซน · เตรียมชุดว่ายน้ำ ครีมกันแดด ผ้าเช็ดตัว` },
    disclosure: { accommodationMeals: { th: "ไม่ค้างคืน · อาหารกลางวัน 1 มื้อ" }, guides: { th: "ไกด์ 2 คนต่อรอบ" } },
    options: [
      { name: { th: "ร่วมกลุ่ม", en: "Join-in group" }, durationMin: hhmm(PRODUCT_RACHA.time.end) - hhmm(PRODUCT_RACHA.time.start), nights: null, active: true },
      { name: { th: "เหมาเรือส่วนตัว", en: "Private charter" }, durationMin: null, nights: null, active: false },
    ],
    extras: [
      {
        kind: "PARK_FEE",
        basis: "PER_PAX",
        mandatory: true,
        priceMinor: PRODUCT_RACHA.parkAdultSatang,
        paxPrices: { ADULT: PRODUCT_RACHA.parkAdultSatang, CHILD: PRODUCT_RACHA.parkChildSatang },
        name: PARK_NAME,
        note: null,
      },
      { kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: PRODUCT_RACHA.extras.camera.satang, paxPrices: null, name: { th: PRODUCT_RACHA.extras.camera.name, en: "Underwater camera rental" }, note: null },
      {
        kind: "COURSE",
        basis: "PER_PAX",
        mandatory: false,
        priceMinor: PRODUCT_RACHA.extras.introDive.satang,
        paxPrices: null,
        name: { th: PRODUCT_RACHA.extras.introDive.name, en: "Discover scuba diving (1 dive)" },
        note: { th: `อายุ ${PRODUCT_RACHA.extras.introDive.minAge} ปีขึ้นไป · ครูฝึก 1:2` },
      },
    ],
  },
  {
    key: "phiphi",
    slug: "phiphi-khai-speedboat",
    productType: "TOUR",
    currency: "THB",
    deepDive: false,
    title: { th: PRODUCT_PHIPHI.name, en: "Phi Phi + Khai Islands by Speedboat" },
    body: {
      summary: { th: "สปีดโบ๊ตเที่ยวเกาะพีพีและเกาะไข่ ดำน้ำตื้นและแวะชายหาด", en: "Speedboat to Phi Phi and Khai islands with snorkeling and beach stops" },
      itinerary: { th: "ออกจากท่าเรือ · อ่าวมาหยา · ดำน้ำตื้น · อาหารกลางวัน · เกาะไข่ · กลับท่า", en: "Depart pier · Maya Bay · snorkeling · lunch · Khai Island · return" },
      includes: { th: "รถรับส่ง · สปีดโบ๊ต · อุปกรณ์ดำน้ำตื้น · อาหารกลางวัน", en: "Transfer · speedboat · snorkel gear · lunch" },
    },
    meeting: { th: `${SHOP_DIVE.pier} หรือรับที่โรงแรมในโซน`, en: "Chalong Pier or hotel pickup within the zone" },
    disclosure: { accommodationMeals: { th: "ไม่ค้างคืน · อาหารกลางวัน 1 มื้อ", en: "No overnight · 1 lunch" }, guides: { th: "ไกด์ประจำเรือ", en: "Boat guide" } },
    options: [{ name: { th: "ร่วมกลุ่ม", en: "Join-in group" }, durationMin: null, nights: null, active: true }],
    extras: [],
  },
  {
    key: "deep3",
    slug: "racha-noi-3-dives",
    productType: "TOUR",
    currency: "THB",
    deepDive: true,
    title: { th: PRODUCT_DEEP3.name, en: "3 Dives at Racha Noi" },
    body: {
      summary: { th: "ดำน้ำลึก 3 ไดฟ์ที่เกาะราชาน้อย สำหรับนักดำน้ำที่มีบัตร", en: "Three dives at Racha Noi for certified divers" },
      itinerary: { th: "ออกจากท่า · ไดฟ์ 1 · ไดฟ์ 2 · อาหารกลางวัน · ไดฟ์ 3 · กลับท่า", en: "Depart · dive 1 · dive 2 · lunch · dive 3 · return" },
      includes: { th: "ถังและน้ำหนัก · ไกด์ดำน้ำ · อาหารกลางวัน", en: "Tanks and weights · dive guide · lunch" },
    },
    meeting: { th: `${SHOP_DIVE.pier} · นำบัตรนักดำน้ำมาด้วย`, en: "Chalong Pier · bring your dive certification card" },
    disclosure: { accommodationMeals: { th: "ไม่ค้างคืน · อาหารกลางวัน 1 มื้อ", en: "No overnight · 1 lunch" }, guides: { th: `ไกด์ดำน้ำ 1:${PRODUCT_DEEP3.guideRatio}`, en: `Dive guide 1:${PRODUCT_DEEP3.guideRatio}` } },
    options: [{ name: { th: "ร่วมกลุ่ม", en: "Join-in group" }, durationMin: null, nights: null, active: true }],
    extras: [],
  },
  {
    key: "similan",
    slug: "similan-4-nights",
    productType: "LIVEABOARD",
    currency: "THB",
    deepDive: true,
    title: { th: TRIP_SIMILAN.name, en: `Similan Liveaboard ${TRIP_SIMILAN.nights} Nights` },
    body: {
      summary: { th: `ล่องเรือดำน้ำ ${TRIP_SIMILAN.route} ${TRIP_SIMILAN.dives} ไดฟ์`, en: `Liveaboard to Similan · Koh Bon · Richelieu, ${TRIP_SIMILAN.dives} dives` },
      itinerary: { th: `ขึ้นเรือ${TRIP_SIMILAN.embark.pier} ${TRIP_SIMILAN.embark.time} · ดำน้ำวันละ 3–4 ไดฟ์ · กลับเข้าฝั่งวันสุดท้าย`, en: `Board at Thap Lamu ${TRIP_SIMILAN.embark.time} · 3–4 dives a day · return on the last day` },
      includes: { th: "ห้องพักบนเรือ · อาหารทุกมื้อ · ถังและน้ำหนัก · ไกด์ดำน้ำ", en: "Cabin · all meals · tanks and weights · dive guides" },
    },
    meeting: { th: `${TRIP_SIMILAN.embark.pier} เวลา ${TRIP_SIMILAN.embark.time}`, en: `Thap Lamu Pier at ${TRIP_SIMILAN.embark.time}` },
    disclosure: { accommodationMeals: { th: `ค้างบนเรือ ${TRIP_SIMILAN.nights} คืน · อาหารทุกมื้อ`, en: `${TRIP_SIMILAN.nights} nights on board · all meals` }, guides: { th: "ไกด์ดำน้ำประจำเรือ", en: "Onboard dive guides" } },
    options: [{ name: { th: `${TRIP_SIMILAN.nights} คืน`, en: `${TRIP_SIMILAN.nights} nights` }, durationMin: null, nights: TRIP_SIMILAN.nights, active: true }],
    extras: [{ kind: "PARK_FEE", basis: "PER_PAX", mandatory: true, priceMinor: TRIP_SIMILAN.parkPerPersonSatang, paxPrices: null, name: PARK_NAME, note: null }],
  },
];
// ◂ TRIPS T0.2

// ═══════════════ รวม ═══════════════
export const TRIPS_FIXTURE = {
  shops: { dive: SHOP_DIVE, aquarium: SHOP_AQUARIUM },
  tiers: AGENCY_TIERS,
  agencyDefaults: AGENCY_DEFAULTS,
  agencies: { ptd: AGENCY_PTD, bluePlanet: AGENCY_BLUE_PLANET },
  products: { racha: PRODUCT_RACHA, phiphi: PRODUCT_PHIPHI, deep3: PRODUCT_DEEP3, aquarium: AQUARIUM_PRODUCT },
  ptdRates: PTD_RATES,
  booking0142: BOOKING_TR_0142,
  receipt0588: RECEIPT_RC_0588,
  agencyCase: AGENCY_CASE_2ADULTS,
  ptdTable: PTD_BOOKINGS_TABLE,
  ptdPortal: PTD_PORTAL_NOV,
  statement: STATEMENT_ST_PTD_1,
  statementLegacy: STATEMENT_LEGACY_EXAMPLE_ONLY,
  cabinTypes: CABIN_TYPES,
  similan: TRIP_SIMILAN,
  lb0031: BOOKING_LB_0031,
  deckV2: DECKPLAN_V2,
  deckV2Totals: DECKPLAN_V2_TOTALS,
  deckV3: DECKPLAN_V3,
  departure: DEPARTURE_RACHA_1114,
  calendar: CALENDAR_WEEK_1111,
  ticketOrder: TICKET_ORDER_TK_0318,
  refundPolicy: REFUND_POLICY_TEMPLATE,
  refund0188: REFUND_TR_0188,
  refundQueue: REFUND_QUEUE,
} as const;
/** ตัวเลขกว้างเป็น number + ไม่ readonly — ให้ข้อสอบโคลนแล้วแก้ค่าเพื่อทดสอบว่าตัวตรวจจับได้ (สตริง/คีย์คงเดิม) */
export type Widen<T> = T extends number ? number : T extends string | boolean | null ? T : T extends readonly (infer U)[] ? readonly Widen<U>[] : { -readonly [K in keyof T]: Widen<T[K]> };
export type TripsFixture = Widen<typeof TRIPS_FIXTURE>;

// ═══════════════ ตัวช่วยคำนวณ ═══════════════
/** ส่วนของ bp แบบปัดครึ่งขึ้น (สตางค์) */
export const pct = (satang: Satang, bp: Bp): Satang => Math.round((satang * bp) / 10_000);
/** แยก VAT ออกจากราคารวม VAT */
export const preVat = (inclSatang: Satang, vatBp: Bp): Satang => Math.round((inclSatang * 10_000) / (10_000 + vatBp));
/** จำนวนวันระหว่างวันที่ปฏิทิน "YYYY-MM-DD" (ไม่ผูกเขตเวลาของเครื่อง) */
export function daysBetween(from: string, to: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(to) - p(from)) / 86_400_000);
}
/** ส่งร้าน (เอเจนซี่เก็บเงิน) = เก็บลูกค้า − คอมฯ + หัก ณ ที่จ่ายของคอมฯ */
export const agencyToShop = (collect: Satang, commission: Satang, whtBp: Bp): Satang => collect - commission + pct(commission, whtBp);

// ═══════════════ ตัวตรวจเลขคณิต ═══════════════
/**
 * คำนวณทุกยอดรวมจากส่วนประกอบใหม่ — ไม่ตรง ⇒ throw (ข้อความไทย รวมทุกจุดที่ผิด)
 * รับ fixture เป็นพารามิเตอร์เพื่อให้ข้อสอบส่งฉบับที่แก้ค่าแล้วมาตรวจว่าจับได้ (positive control)
 */
export function assertFixtureArithmetic(f: TripsFixture = TRIPS_FIXTURE): { checks: number } {
  const errs: string[] = [];
  let checks = 0;
  const eq = (label: string, got: number | string, want: number | string) => {
    checks++;
    if (got !== want) errs.push(`${label}: คำนวณได้ ${got} แต่ฟิกซ์เจอร์ระบุ ${want}`);
  };
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const lineSum = (ls: readonly MoneyLine[], label: string) => {
    for (const l of ls) eq(`${label} · ${l.label} (จำนวน × ราคา)`, l.qty * l.unitSatang, l.totalSatang);
    return sum(ls.map((l) => l.totalSatang));
  };

  // ระดับ/ราคาเอเจนซี่
  const { racha, phiphi } = f.products;
  eq("ราคาเด็ก = 70% ของผู้ใหญ่", pct(racha.adultSatang, racha.childPriceBp), racha.childSatang);
  eq("ระดับ B = สัญญา PTD", f.tiers[f.agencies.ptd.tier].tourBp, f.agencies.ptd.commissionBp);
  eq("ระดับ C = Blue Planet", f.tiers[f.agencies.bluePlanet.tier].tourBp, f.agencies.bluePlanet.commissionBp);
  for (const [k, r] of [["racha", f.ptdRates.racha], ["phiphi", f.ptdRates.phiphi]] as const) {
    eq(`PTD ${k} ฉันได้ 15%`, pct(r.sellSatang, f.agencies.ptd.commissionBp), r.earnSatang);
    eq(`PTD ${k} ส่งร้าน`, r.sellSatang - r.earnSatang, r.toShopSatang);
  }
  eq("PTD ราชา ราคาขาย = ราคาผู้ใหญ่", f.ptdRates.racha.sellSatang, racha.adultSatang);
  eq("PTD พีพี ราคาขาย = ราคาผู้ใหญ่", f.ptdRates.phiphi.sellSatang, phiphi.adultSatang);
  eq("ดำน้ำลึก ฉันได้ขั้นต่ำ = ขายขั้นต่ำ − เน็ต", f.ptdRates.deep3.minSellSatang - f.ptdRates.deep3.netSatang, f.ptdRates.deep3.earnMinSatang);

  // TR-6911-0142
  const b = f.booking0142;
  eq("TR-6911-0142 รวม", lineSum(b.lines, "TR-6911-0142"), b.totalSatang);
  eq("TR-6911-0142 ค่าอุทยาน", b.adults * racha.parkAdultSatang + b.children * racha.parkChildSatang, b.parkSatang);
  eq("TR-6911-0142 รวมจากราคาสินค้า", b.adults * racha.adultSatang + b.children * racha.childSatang + b.parkSatang + racha.extras.camera.satang, b.totalSatang);
  eq("สลิปขาด (จอ 07ค)", b.totalSatang - b.slipShort.slipSatang, b.slipShort.shortSatang);

  // RC-6911-0588
  const rc = f.receipt0588;
  eq("RC-0588 ค่าบริการรวม VAT", rc.serviceInclVatSatang + rc.parkPassThroughSatang, rc.totalSatang);
  eq("RC-0588 ก่อนภาษี", preVat(rc.serviceInclVatSatang, rc.vatBp), rc.preVatSatang);
  eq("RC-0588 VAT", rc.serviceInclVatSatang - rc.preVatSatang, rc.vatSatang);
  eq("RC-0588 ก่อนภาษี + VAT + อุทยาน", rc.preVatSatang + rc.vatSatang + rc.parkPassThroughSatang, rc.totalSatang);
  eq("RC-0588 ยอด = TR-0142", rc.totalSatang, b.totalSatang);
  eq("RC-0588 อุทยาน = TR-0142", rc.parkPassThroughSatang, b.parkSatang);

  // เอเจนซี่ 2 ผู้ใหญ่
  const a = f.agencyCase;
  eq("เอเจนซี่ ราคาขาย", a.adults * racha.adultSatang, a.saleSatang);
  eq("เอเจนซี่ อุทยาน", a.adults * racha.parkAdultSatang, a.parkSatang);
  eq("เอเจนซี่ เก็บลูกค้า", a.saleSatang + a.parkSatang, a.collectSatang);
  eq("เอเจนซี่ คอมฯ 15% (ไม่รวมอุทยาน)", pct(a.commissionBaseSatang, a.commissionBp), a.commissionSatang);
  eq("เอเจนซี่ ส่งร้าน (ชุดเดิม)", a.collectSatang - a.commissionSatang, a.toShopNoWhtSatang);
  eq("เอเจนซี่ หัก ณ ที่จ่าย 3%", pct(a.commissionSatang, a.whtBp), a.whtSatang);
  eq("เอเจนซี่ ส่งร้าน 7,181.50", agencyToShop(a.collectSatang, a.commissionSatang, a.whtBp), a.toShopSatang);
  eq("วงเงินคงเหลือ", a.credit.limitSatang - a.credit.usedSatang, a.credit.availableSatang);
  eq("วงเงินหลังจอง (ชุดเดิม)", a.credit.availableSatang - a.toShopNoWhtSatang, a.credit.availableAfterLegacySatang);
  eq("วงเงินหลังจอง (หัก ณ ที่จ่าย)", a.credit.availableSatang - a.toShopSatang, a.credit.availableAfterWhtSatang);
  eq("วงเงินที่ใช้ = ใบแจ้งยอดชุดเดิม", a.credit.usedSatang, f.statementLegacy.totalSatang);
  eq("วงเงิน = สัญญา PTD", a.credit.limitSatang, f.agencies.ptd.creditLimitSatang);

  // ตาราง PTD จอ 05
  for (const r of f.ptdTable) {
    if (r.collectSatang !== null && r.toShopSatang !== null) eq(`${r.ref} ส่งร้าน`, agencyToShop(r.collectSatang, r.earnSatang, f.agencies.ptd.whtBp), r.toShopSatang);
  }
  eq("TR-6911-0148 คอมฯ ลิงก์ 4 ผู้ใหญ่", 4 * f.ptdRates.racha.earnSatang, f.ptdTable[1].earnSatang);
  eq("TK-6911-0290 ส่งร้าน 50 × เน็ต", 50 * f.ptdRates.aquariumBundle.netSatang, f.ptdTable[4].toShopSatang ?? -1);
  eq("TK-6911-0290 ได้ 50 × (ปลีก − เน็ต)", 50 * (f.ptdRates.aquariumBundle.retailSatang - f.ptdRates.aquariumBundle.netSatang), f.ptdTable[4].earnSatang);
  eq("LB-7002-0029 คอมฯ 15% ของค่าเคบิน S3", pct(2 * f.cabinTypes.S.perPersonSatang, f.agencies.ptd.commissionBp), f.ptdTable[3].earnSatang);
  eq("LB-7002-0029 เก็บลูกค้า = ค่าเคบิน + อุทยาน", 2 * (f.cabinTypes.S.perPersonSatang + f.similan.parkPerPersonSatang), f.ptdTable[3].collectSatang ?? -1);
  eq("TR-6911-0139 เก็บลูกค้า 3 ผู้ใหญ่ + อุทยาน", 3 * (racha.adultSatang + racha.parkAdultSatang), f.ptdTable[5].collectSatang ?? -1);
  const p = f.ptdPortal;
  eq("พอร์ทัล คอมฯ = เดินทางแล้ว + รอเดินทาง", p.commissionTravelledSatang + p.commissionPendingSatang, p.commissionSatang);
  eq("พอร์ทัล คอมฯ ลิงก์ หัก 3%", pct(p.linkCommission.travelledSatang, f.agencies.ptd.whtBp), p.linkCommission.whtSatang);
  eq("พอร์ทัล คอมฯ ลิงก์ โอน", p.linkCommission.travelledSatang - p.linkCommission.whtSatang, p.linkCommission.payoutSatang);
  eq("โควตา PTD ราชา ส. 14 = รอบ", p.quotas[0].used, f.departure.ptdQuota.used);

  // ใบแจ้งยอด
  const s = f.statement;
  eq("ST-PTD-1 คอมฯ 15%", pct(s.salesSatang, s.commissionBp), s.commissionSatang);
  eq("ST-PTD-1 หัก ณ ที่จ่าย 3%", pct(s.commissionSatang, s.whtBp), s.whtSatang);
  eq("ST-PTD-1 ยอดต้องชำระ", s.salesSatang + s.parkPassThroughSatang - s.commissionSatang + s.whtSatang - s.cancelledSatang - s.paidDuringPeriodSatang, s.totalSatang);
  eq("ST-PTD-1 ยกเลิก = ส่งร้าน 7,181.50", s.cancelledSatang, a.toShopSatang);
  eq("ST-PTD-1 ครบกำหนด = วันสิ้นงวด", s.dueDate, s.period.to);
  const l = f.statementLegacy;
  eq("ใบแจ้งยอดชุดเดิม 86,300", l.confirmedSatang - l.cancelledSatang - l.paidDuringPeriodSatang, l.totalSatang);
  eq("ใบแจ้งยอดชุดเดิม ยกเลิก = 7,150", l.cancelledSatang, a.toShopNoWhtSatang);

  // Liveaboard D1
  const d1 = f.lb0031;
  eq("D1 ค่าเคบิน", d1.persons * d1.cabinPerPersonSatang, d1.cabinSatang);
  eq("D1 ราคา/คน = ดีลักซ์", d1.cabinPerPersonSatang, f.cabinTypes.D.perPersonSatang);
  eq("D1 ค่าอุทยาน", d1.persons * f.similan.parkPerPersonSatang, d1.parkSatang);
  eq("D1 รวม 69,400", d1.cabinSatang + d1.parkSatang, d1.totalSatang);
  eq("D1 มัดจำ 30% ของค่าเคบิน", pct(d1.cabinSatang, f.similan.depositBp), d1.depositSatang);
  eq("D1 ส่วนที่เหลือ", d1.totalSatang - d1.depositSatang, d1.balanceSatang);
  eq("D1 ครบกำหนด 60 วันก่อนออกเรือ", daysBetween(d1.balanceDue, f.similan.start), f.similan.balanceDaysBefore);
  eq("D1 ครบกำหนด = ทริป", d1.balanceDue, f.similan.balanceDue);
  eq("ทริปสิมิลัน 4 คืน", daysBetween(f.similan.start, f.similan.end), f.similan.nights);

  // ผังเรือ v2
  const cabins = f.deckV2.cabins;
  const t = f.deckV2Totals;
  eq("v2 จำนวนเคบิน", cabins.length, t.cabins);
  eq("v2 จำนวนเตียง", sum(cabins.map((c) => c.berths)), t.berths);
  for (const dk of ["UPPER", "MAIN", "LOWER"] as const) eq(`v2 เคบินดาดฟ้า ${dk}`, cabins.filter((c) => c.deck === dk).length, f.deckV2.decks[dk]);
  eq("v2 เตียงขายแล้ว", sum(cabins.map((c) => c.soldBerths)), t.soldBerths);
  eq("v2 เคบินที่มีคนจอง", cabins.filter((c) => c.soldBerths > 0).length, t.soldCabins);
  eq("v2 เตียงถือ", sum(cabins.map((c) => c.heldBerths)), t.heldBerths);
  eq("v2 เตียงว่าง", t.berths - t.soldBerths - t.heldBerths, t.freeBerths);
  eq("v2 เคบินว่างทั้งห้อง", cabins.filter((c) => c.state === "FREE").length, t.freeCabins);
  eq("v2 ยอดจอง", sum(cabins.map((c) => c.bookedSatang)), t.bookedSatang);
  eq("v2 รับแล้ว", sum(cabins.map((c) => c.paidSatang)), t.paidSatang);
  eq("v2 ค้างรับ", t.bookedSatang - t.paidSatang, t.outstandingSatang);
  eq("v2 เต็มลำ", sum(cabins.map((c) => c.berths * f.cabinTypes[c.type].perPersonSatang)), t.fullBoatSatang);
  for (const c of cabins) {
    eq(`v2 ${c.code} ยอดจอง = เตียงขาย × ราคาประเภท`, c.soldBerths * f.cabinTypes[c.type].perPersonSatang, c.bookedSatang);
    if (c.state === "PAID") eq(`v2 ${c.code} จ่ายครบ`, c.paidSatang, c.bookedSatang);
    if (c.state === "DEPOSIT") eq(`v2 ${c.code} มัดจำ 30%`, pct(c.bookedSatang, f.similan.depositBp), c.paidSatang);
    if (c.state === "FREE") eq(`v2 ${c.code} ว่างไม่มียอด`, c.bookedSatang + c.paidSatang + c.soldBerths + c.heldBerths, 0);
  }
  const d1c = cabins.find((c) => c.code === "D1");
  eq("v2 D1 = LB-7002-0031 ค่าเคบิน", d1c?.bookedSatang ?? -1, d1.cabinSatang);
  eq("v2 D1 มัดจำ = LB-7002-0031", d1c?.paidSatang ?? -1, d1.depositSatang);
  const s3 = cabins.find((c) => c.code === "S3");
  eq("v2 S3 มัดจำ 16,740", s3?.paidSatang ?? -1, 1_674_000);

  // ผังเรือ v3
  const v3 = f.deckV3;
  const v3Cabins = [...cabins.map((c) => ({ type: c.type, berths: c.berths, deck: c.deck })), ...v3.addedCabins.map((c) => ({ type: c.type, berths: c.berths, deck: c.deck }))];
  eq("v3 เคบิน", v3Cabins.length, v3.cabins);
  eq("v3 เตียง", sum(v3Cabins.map((c) => c.berths)), v3.berths);
  eq("v3 แขกสูงสุด = เตียง", v3.maxGuests, v3.berths);
  eq("v3 ดาดฟ้าล่าง เคบิน", v3Cabins.filter((c) => c.deck === "LOWER").length, v3.lowerDeck.cabins);
  eq("v3 ดาดฟ้าล่าง เตียง", sum(v3Cabins.filter((c) => c.deck === "LOWER").map((c) => c.berths)), v3.lowerDeck.berths);
  for (const k of ["M", "D", "S"] as const) {
    eq(`v3 ${k} เคบิน`, v3Cabins.filter((c) => c.type === k).length, v3.byType[k].cabins);
    eq(`v3 ${k} เตียง`, sum(v3Cabins.filter((c) => c.type === k).map((c) => c.berths)), v3.byType[k].berths);
  }
  eq("v3 เต็มลำ 753,600", sum(v3Cabins.map((c) => c.berths * f.cabinTypes[c.type].perPersonSatang)), v3.fullBoatSatang);

  // รอบ ส. 14 ราชา
  const dep = f.departure;
  const bk = dep.bookings;
  eq("ส.14 ผู้ใหญ่", sum(bk.map((x) => x.adults)), dep.adults);
  eq("ส.14 เด็ก", sum(bk.map((x) => x.children)), dep.children);
  eq("ส.14 คน", dep.adults + dep.children, dep.sold);
  eq("ส.14 ว่าง", dep.capacity - dep.sold, dep.free);
  eq("ส.14 การจอง 6", bk.length, 6);
  eq("ส.14 ยอดจอง", dep.adults * racha.adultSatang + dep.children * racha.childSatang, dep.revenueSatang);
  eq("ส.14 อุทยาน", dep.adults * racha.parkAdultSatang + dep.children * racha.parkChildSatang, dep.parkSatang);
  const saleOf = (x: DepartureBooking) => x.adults * racha.adultSatang + x.children * racha.childSatang;
  eq("ส.14 คอมฯ PTD", sum(bk.filter((x) => x.agency === "PTD").map((x) => pct(saleOf(x), f.agencies.ptd.commissionBp))), dep.commission.ptdSatang);
  eq("ส.14 คอมฯ Blue Planet ระดับ C", sum(bk.filter((x) => x.agency === "BLUE_PLANET").map((x) => pct(saleOf(x), f.tiers.C.tourBp))), dep.commission.bluePlanetSatang);
  eq("ส.14 คอมฯ รวม", dep.commission.ptdSatang + dep.commission.bluePlanetSatang, dep.commission.totalSatang);
  eq("ส.14 กำไรขั้นต้น", dep.revenueSatang - dep.commission.totalSatang - dep.costSatang, dep.grossProfitSatang);
  eq("ส.14 คน PTD = โควตาที่ใช้", sum(bk.filter((x) => x.agency === "PTD").map((x) => x.adults + x.children)), dep.ptdQuota.used);
  eq("ส.14 โควตา PTD ใช้ + คืน", dep.ptdQuota.used + dep.ptdQuota.released, dep.ptdQuota.seats);
  const cal = f.calendar.rows.racha.find((c) => c.date === dep.date);
  eq("ส.14 ปฏิทิน = รอบ", cal?.sold ?? -1, dep.sold);
  const c13 = [f.calendar.rows.racha, f.calendar.rows.phiphi, f.calendar.rows.deep3].map((r) => r.find((c) => c.date === "2026-11-13"));
  eq("ศ.13 ยกเลิก 44 คน", sum(c13.map((c) => c?.cancelledPax ?? 0)), f.calendar.cancelled13.pax);
  eq("ศ.13 ย้ายแล้ว 17", sum(c13.map((c) => c?.moved ?? 0)), f.calendar.cancelled13.moved);
  eq("ศ.13 ยังไม่เลือก", f.calendar.cancelled13.pax - f.calendar.cancelled13.moved, f.calendar.cancelled13.undecided);

  // ตั๋ว
  const tk = f.ticketOrder;
  eq("TK-6911-0318 รวม", lineSum(tk.lines, "TK-6911-0318"), tk.totalSatang);
  eq("TK-6911-0318 จำนวนใบ", sum(tk.lines.map((x) => x.qty)), tk.admissions.length);
  eq("ตั๋วผู้ใหญ่ = ราคาสินค้า", tk.lines[0].unitSatang, f.products.aquarium.types[0].priceSatang);
  eq("ตั๋วเด็ก = ราคาสินค้า", tk.lines[1].unitSatang, f.products.aquarium.types[1].priceSatang);

  // คืนเงิน
  const r = f.refund0188;
  eq("TR-6912-0188 วันก่อนเดินทาง", daysBetween(r.requestedAt, r.travelDate), r.daysBefore);
  const tier = f.refundPolicy.find((x) => r.daysBefore >= x.minDays);
  eq("TR-6912-0188 อัตราคืนตามกติกา", tier?.refundBp ?? -1, r.refundBp);
  for (const x of r.lines) {
    eq(`${x.label} คืน`, x.rule === "FULL" ? x.paidSatang : pct(x.paidSatang, r.refundBp), x.refundSatang);
    eq(`${x.label} คืน + เก็บ = จ่าย`, x.refundSatang + x.keptSatang, x.paidSatang);
  }
  eq("TR-6912-0188 จ่ายมา", sum(r.lines.map((x) => x.paidSatang)), r.paidSatang);
  eq("TR-6912-0188 คืน 6,475", sum(r.lines.map((x) => x.refundSatang)), r.refundSatang);
  eq("TR-6912-0188 ร้านเก็บ 4,975", sum(r.lines.map((x) => x.keptSatang)), r.keptSatang);
  eq("TR-6912-0188 จ่ายมา = ราคาแบบ TR-0142", r.paidSatang, b.totalSatang);
  eq("TR-6912-0188 เครดิต = คืน + 20% ของส่วนที่ร้านเก็บ", r.refundSatang + pct(r.keptSatang, r.creditBonusBp), r.creditSatang);

  if (errs.length) throw new Error(`ฟิกซ์เจอร์ TRIPS เลขไม่ตรง ${errs.length} จุด:\n- ${errs.join("\n- ")}`);
  return { checks };
}
