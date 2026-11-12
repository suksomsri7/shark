// ─────────────────────────────────────────────────────────────
// defs/trips.ts — ค่าตั้งโดเมน «trips» (ทัวร์ · เดย์ทริป · Liveaboard) (pure) · RUN TRIPS T0.1
// แหล่ง: ledger/TRIPS-DEFAULTS.md §1 (T1–T70) + ภาคผนวก ก (X1–X3 X5–X23 X28 ที่ขึ้นต้น trips.) · ใบสั่ง ledger/trips-briefs/T0.1.md §4 §7
//        สัญญา ledger/TRIPS-CORE-CONTRACT.md §E §N.3 §N.4
//
// ▸ คีย์ `trips.<group>.<name>` (group = ส่วนที่ 2) · ชั้น "SHOP" = UNIT · ลำดับชั้นตามคอลัมน์ "ชั้น" ของ TRIPS-DEFAULTS ตรงตัว
// ▸ แม่แบบ DIVE_SHOP · DAY_TOUR · LIVEABOARD · ATTRACTION (version 1) · "—" ในเอกสาร = ค่าของ DAY_TOUR (TD §0)
//   ATTRACTION = ค่า DAY_TOUR ทุกคีย์ ยกเว้น T1 T57 T58 T65 · `_fallback` = ค่า DIVE_SHOP (CC §E.5 ข้อ 9)
// ▸ ทุกตัวเลขธุรกิจอยู่ในไฟล์นี้เท่านั้น (ค่าเริ่มที่ร้านปรับได้) · เงิน = สตางค์ · % = 0–100 (percentScale 100) · อัตรา = basis point
// ▸ เวลาในวัน = นาทีจากเที่ยงคืน (atMin · ใบสั่ง §7 ข้อ 13) · วันที่ = "YYYY-MM-DD"
// ▸ คำเตือนกฎหมาย = legal/th-tour-2569 (WARN เท่านั้น · ใบสั่ง §4.4) · ค่าเริ่มทุกแม่แบบต้องไม่เตือน (ทะเบียนตรวจตอนลงทะเบียน)
//
// 🔴 pure: import ได้เฉพาะ zod · ../registry · import type
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { GroupIssue, GroupRule, ScopeKind, SettingDef, SettingSensitivity, SettingValueType, TemplateDef } from "../types";

const EDIT = "trips.settings.edit";
const MONEY_EDIT = "trips.settings.money";

// ─────────────────── ทะเบียนข้อความ (สำเนาของ core/sellable.ts — defs pure ห้าม import นอก settings) ───────────────────
const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"] as const;
const EXTRA_KINDS = ["PARK_FEE", "PORT_FEE", "FUEL", "EQUIPMENT", "NITROX", "TRANSFER", "COURSE", "INSURANCE", "OTHER"] as const;
const PAX_FIELDS = [
  "fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "birthPlace",
  "certLevel", "diveCount", "lastDiveAt", "finSize", "allergies", "pickupHotel",
] as const;
type PaxField = (typeof PAX_FIELDS)[number];
const MSG_CUSTOMER = ["confirmation", "reminder1Day", "paymentDue", "docsMissing", "pickupInfo", "departureChanged", "waitlistOffer", "abandonedBooking", "refunded", "reviewRequest"] as const;
type MsgCustomer = (typeof MSG_CUSTOMER)[number];
const MSG_SHOP = ["minNotMet", "insuranceMissing", "licenseExpiring", "pdpaRequestDue"] as const;
const MSG_VARS = ["ร้าน", "สินค้า", "วันเดินทาง", "เวลารับ", "จุดนัด", "ยอดค้าง", "ครบกำหนด", "ลิงก์", "รหัสจอง"] as const;

// ─────────────────── ชนิดค่าที่ใช้ซ้ำ ───────────────────
const unique = <T,>(a: readonly T[]) => new Set(a).size === a.length;
const uniqArr = <T extends z.ZodType>(item: T, min = 0, max = 50) => z.array(item).min(min).max(max).refine((a) => unique(a), { message: "ค่าซ้ำ" });
const isYmd = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.getUTCFullYear() === Number(m[1]) && t.getUTCMonth() === Number(m[2]) - 1 && t.getUTCDate() === Number(m[3]);
};
const YMD = z.string().refine(isYmd, { message: "วันที่ต้องเป็น ปปปป-ดด-วว" });
const INT = (min: number, max: number) => z.number().int().min(min).max(max);
const PCT = INT(0, 100);
const BP = INT(0, 10_000);
const SATANG = INT(0, 100_000_000_000);
const MIN_OF_DAY = INT(0, 1439);
const DAYS_BEFORE = INT(0, 730);
const BOOL = z.boolean();
const TEXT = z.object({ th: z.string().trim().min(1).max(4000), en: z.string().max(4000).optional() }).strict();
const CHANNEL = z.enum(SELL_CHANNELS);

// ─────────────────── ชั้น ───────────────────
const U = ["UNIT"] as const satisfies readonly ScopeKind[];
const U_P = ["UNIT", "PRODUCT"] as const satisfies readonly ScopeKind[];
const U_P_D = ["UNIT", "PRODUCT", "DEPARTURE"] as const satisfies readonly ScopeKind[];
const U_P_AT_A = ["UNIT", "PRODUCT", "AGENT_TIER", "AGENT"] as const satisfies readonly ScopeKind[];
const U_P_D_A = ["UNIT", "PRODUCT", "DEPARTURE", "AGENT"] as const satisfies readonly ScopeKind[];
const U_V = ["UNIT", "VESSEL"] as const satisfies readonly ScopeKind[];
const U_V_D = ["UNIT", "VESSEL", "DEPARTURE"] as const satisfies readonly ScopeKind[];

// ─────────────────── ตัวช่วยสร้าง def ───────────────────
/** ค่าต่อแม่แบบ: [DIVE_SHOP, DAY_TOUR, LIVEABOARD] + ATTRACTION (ไม่ระบุ = ค่า DAY_TOUR) */
type Tpl = { v: readonly [ds: unknown, dt: unknown, la: unknown]; at?: unknown };
const all = (v: unknown): Tpl => ({ v: [v, v, v] });
const per = (ds: unknown, dt: unknown, la: unknown, at?: unknown): Tpl => (at === undefined ? { v: [ds, dt, la] } : { v: [ds, dt, la], at });

const SENSITIVITY: Readonly<Record<string, SettingSensitivity>> = {
  tax: "LEGAL", giftcard: "LEGAL", consumer: "LEGAL",
  pay: "MONEY", price: "MONEY", cash: "MONEY",
  pdpa: "PRIVACY", waiver: "PRIVACY",
};

type RowInput = {
  key: string;
  type: SettingValueType;
  labelTh: string;
  helpTh?: string;
  schema: z.ZodType;
  chain: readonly ScopeKind[];
  d: Tpl;
  extra?: Partial<Pick<SettingDef, "legal" | "legalInput" | "effectiveDated" | "templateVars" | "hiddenUntil" | "enumLabelsTh" | "percentScale" | "reviewHint" | "reviewAuthorityTh">>;
};

function row(x: RowInput): SettingDef {
  const group = x.key.split(".")[1];
  const sensitivity = SENSITIVITY[group];
  const [ds, dt, la] = x.d.v;
  return {
    key: x.key,
    domain: "trips",
    group,
    type: x.type,
    schema: x.schema,
    defaults: { DIVE_SHOP: ds, DAY_TOUR: dt, LIVEABOARD: la, ATTRACTION: x.d.at === undefined ? dt : x.d.at, _fallback: ds },
    chain: x.chain,
    editPermission: sensitivity === "MONEY" ? MONEY_EDIT : EDIT,
    ...(sensitivity ? { sensitivity } : {}),
    ...(sensitivity === "PRIVACY" ? { ownerOnly: true } : {}),
    unitTypes: ["TRIPS"],
    labelTh: x.labelTh,
    ...(x.helpTh ? { helpTh: x.helpTh } : {}),
    ...(x.extra ?? {}),
  };
}

const ACCOUNTANT = { reviewHint: "ACCOUNTANT" } as const;
const authority = (th: string) => ({ reviewHint: "AUTHORITY", reviewAuthorityTh: th }) as const;

// ─────────────────── ค่าเริ่มที่เป็นรูปซับซ้อน ───────────────────
const LADDER = [
  { fromDaysBefore: 30, refundPct: 100 },
  { fromDaysBefore: 15, refundPct: 50 },
  { fromDaysBefore: 0, refundPct: 0 },
];
const paxFields = (required: readonly PaxField[], crossBorder: readonly PaxField[] = []): Record<PaxField, string> =>
  Object.fromEntries(PAX_FIELDS.map((f) => [f, required.includes(f) ? "REQUIRED" : crossBorder.includes(f) ? "REQUIRED_CROSS_BORDER" : "OFF"])) as Record<PaxField, string>;
const LINE_DEFAULTS = {
  PARK_FEE: { passThrough: true, commissionPct: 0, discountable: false },
  PORT_FEE: { passThrough: false, commissionPct: 0, discountable: false },
  FUEL: { passThrough: false, commissionPct: 0, discountable: false },
  EQUIPMENT: { passThrough: false, commissionPct: 50, discountable: true },
  NITROX: { passThrough: false, commissionPct: 50, discountable: true },
  TRANSFER: { passThrough: false, commissionPct: 100, discountable: true },
  COURSE: { passThrough: false, commissionPct: 100, discountable: true },
  INSURANCE: { passThrough: false, commissionPct: 100, discountable: true },
  OTHER: { passThrough: false, commissionPct: 100, discountable: true },
};
/** ค่าบริการอุทยานทางทะเล (ระเบียบกรมอุทยานฯ 2564 · บาท ×100 = สตางค์) — confirmedAt null = ร้านยังไม่ยืนยัน */
const PARK_FEE_TABLE = {
  confirmedAt: null,
  groups: [
    { code: "G1", nameTh: "กลุ่ม 1", thaiChildSatang: 1_000, thaiAdultSatang: 2_000, foreignChildSatang: 5_000, foreignAdultSatang: 10_000 },
    { code: "G2", nameTh: "กลุ่ม 2", thaiChildSatang: 2_000, thaiAdultSatang: 4_000, foreignChildSatang: 10_000, foreignAdultSatang: 20_000 },
    { code: "G3", nameTh: "กลุ่ม 3", thaiChildSatang: 3_000, thaiAdultSatang: 6_000, foreignChildSatang: 15_000, foreignAdultSatang: 30_000 },
    { code: "G4", nameTh: "กลุ่ม 4 (สิมิลัน · สุรินทร์)", thaiChildSatang: 5_000, thaiAdultSatang: 10_000, foreignChildSatang: 25_000, foreignAdultSatang: 50_000 },
  ],
  diveSatangPerPaxDay: 20_000,
  mooring: { upTo20Satang: 100_000, from21Satang: 200_000 },
};
const msgEnabled = (la: boolean) => Object.fromEntries([...MSG_CUSTOMER, ...MSG_SHOP].map((k) => [k, k === "paymentDue" || k === "docsMissing" ? la : true]));
const WAIVER_DIVE = {
  th: "ข้าพเจ้ารับทราบความเสี่ยงของกิจกรรมดำน้ำ ได้รับคำอธิบายขั้นตอนความปลอดภัยแล้ว และขอแถลงว่าข้อมูลสุขภาพที่ให้ไว้เป็นความจริง หากสุขภาพเปลี่ยนแปลงจะแจ้งเจ้าหน้าที่ก่อนลงน้ำ",
  en: "I acknowledge the risks of diving activities, have been briefed on safety procedures, and declare that the health information I provided is true. I will inform the staff of any change in my health before entering the water.",
};
const WAIVER_WATER = {
  th: "ข้าพเจ้ารับทราบความเสี่ยงของกิจกรรมทางน้ำ ได้รับคำอธิบายขั้นตอนความปลอดภัยแล้ว และขอแถลงว่าข้อมูลสุขภาพที่ให้ไว้เป็นความจริง",
  en: "I acknowledge the risks of water activities, have been briefed on safety procedures, and declare that the health information I provided is true.",
};
const MSG_TEXTS: Record<MsgCustomer, { labelTh: string; th: string; en: string }> = {
  confirmation: {
    labelTh: "ข้อความยืนยันการจอง",
    th: "{ร้าน} ยืนยันการจอง {สินค้า} วันที่ {วันเดินทาง} แล้ว รหัสจอง {รหัสจอง} ดูรายละเอียดได้ที่ {ลิงก์}",
    en: "{ร้าน} has confirmed your booking for {สินค้า} on {วันเดินทาง}. Booking code {รหัสจอง}. Details: {ลิงก์}",
  },
  reminder1Day: {
    labelTh: "ข้อความเตือน 1 วันก่อนเดินทาง",
    th: "พรุ่งนี้ {วันเดินทาง} มีทริป {สินค้า} กับ {ร้าน} เวลารับ {เวลารับ} จุดนัด {จุดนัด} รายละเอียด {ลิงก์}",
    en: "Reminder: {สินค้า} with {ร้าน} tomorrow, {วันเดินทาง}. Pick-up {เวลารับ} at {จุดนัด}. Details: {ลิงก์}",
  },
  paymentDue: {
    labelTh: "ข้อความงวดจ่ายใกล้ครบกำหนด",
    th: "การจอง {รหัสจอง} ({สินค้า}) มียอดค้าง {ยอดค้าง} ครบกำหนด {ครบกำหนด} ชำระได้ที่ {ลิงก์}",
    en: "Booking {รหัสจอง} ({สินค้า}) has {ยอดค้าง} due on {ครบกำหนด}. Pay here: {ลิงก์}",
  },
  docsMissing: {
    labelTh: "ข้อความเอกสารผู้เดินทางยังไม่ครบ",
    th: "การจอง {รหัสจอง} ({สินค้า} วันที่ {วันเดินทาง}) ยังรอข้อมูลผู้เดินทางบางส่วน กรอกเพิ่มได้ที่ {ลิงก์}",
    en: "Booking {รหัสจอง} ({สินค้า} on {วันเดินทาง}) still needs some traveller details. Please complete them here: {ลิงก์}",
  },
  pickupInfo: {
    labelTh: "ข้อความเวลารับและจุดนัด",
    th: "ทริป {สินค้า} วันที่ {วันเดินทาง}: เวลารับ {เวลารับ} จุดนัด {จุดนัด} (รหัสจอง {รหัสจอง})",
    en: "{สินค้า} on {วันเดินทาง}: pick-up {เวลารับ} at {จุดนัด} (booking {รหัสจอง})",
  },
  departureChanged: {
    labelTh: "ข้อความรอบเปลี่ยนหรือร้านยกเลิกรอบ",
    th: "{ร้าน} ขอแจ้งการเปลี่ยนแปลงทริป {สินค้า} วันที่ {วันเดินทาง} (รหัสจอง {รหัสจอง}) เลือกทางที่สะดวกได้ที่ {ลิงก์}",
    en: "{ร้าน} has an update about {สินค้า} on {วันเดินทาง} (booking {รหัสจอง}). Please choose an option here: {ลิงก์}",
  },
  waitlistOffer: {
    labelTh: "ข้อความมีที่ว่างจากคิวรอ",
    th: "มีที่ว่างทริป {สินค้า} วันที่ {วันเดินทาง} แล้ว ยืนยันได้ที่ {ลิงก์} ภายใน {ครบกำหนด}",
    en: "A spot has opened on {สินค้า} on {วันเดินทาง}. Confirm here: {ลิงก์} before {ครบกำหนด}",
  },
  abandonedBooking: {
    labelTh: "ข้อความจองค้างยังไม่ชำระ (ครั้งเดียว)",
    th: "การจองทริป {สินค้า} วันที่ {วันเดินทาง} ยังไม่เสร็จ ทำต่อได้ที่ {ลิงก์}",
    en: "Your booking for {สินค้า} on {วันเดินทาง} is not finished yet. Continue here: {ลิงก์}",
  },
  refunded: {
    labelTh: "ข้อความคืนเงินแล้ว",
    th: "{ร้าน} คืนเงินการจอง {รหัสจอง} ({สินค้า}) แล้ว รายละเอียด {ลิงก์}",
    en: "{ร้าน} has refunded booking {รหัสจอง} ({สินค้า}). Details: {ลิงก์}",
  },
  reviewRequest: {
    labelTh: "ข้อความขอรีวิว",
    th: "ขอบคุณที่ร่วมทริป {สินค้า} กับ {ร้าน} ช่วยเล่าประสบการณ์ให้เราฟังได้ที่ {ลิงก์}",
    en: "Thank you for joining {สินค้า} with {ร้าน}. We would love to hear about your trip: {ลิงก์}",
  },
};

// ─────────────────── schema ที่เป็นตาราง ───────────────────
const LADDER_SCHEMA = z.array(z.object({ fromDaysBefore: DAYS_BEFORE, refundPct: PCT }).strict()).min(1).max(20);
const CUTOFF_ONE = z.object({ daysBefore: DAYS_BEFORE, atMin: MIN_OF_DAY }).strict();
const CUTOFF = z
  .object({ daysBefore: DAYS_BEFORE, atMin: MIN_OF_DAY, perChannel: z.partialRecord(CHANNEL, CUTOFF_ONE).optional() })
  .strict();
const MIN_TO_DEPART = z.object({ minPax: INT(1, 1000).nullable(), decideDaysBefore: DAYS_BEFORE, decideAtMin: MIN_OF_DAY }).strict();
const PAX_REQ = z.enum(["OFF", "OPTIONAL", "REQUIRED", "REQUIRED_CROSS_BORDER"]);
const PAX_FIELDS_SCHEMA = z.object(Object.fromEntries(PAX_FIELDS.map((f) => [f, PAX_REQ])) as Record<PaxField, typeof PAX_REQ>).strict();
const LINE_ONE = z
  .object({ passThrough: BOOL, commissionPct: PCT, discountable: BOOL })
  .strict()
  .refine((x) => !x.passThrough || (x.commissionPct === 0 && !x.discountable), { message: "เงินเก็บแทนต้องไม่คิดคอมมิชชันและลดราคาไม่ได้" });
const LINE_SCHEMA = z.object(Object.fromEntries(EXTRA_KINDS.map((k) => [k, LINE_ONE])) as Record<(typeof EXTRA_KINDS)[number], typeof LINE_ONE>).strict();
const PARK_GROUP = z
  .object({
    code: z.enum(["G1", "G2", "G3", "G4"]),
    nameTh: z.string().trim().min(1).max(100),
    thaiChildSatang: SATANG,
    thaiAdultSatang: SATANG,
    foreignChildSatang: SATANG,
    foreignAdultSatang: SATANG,
  })
  .strict();
const PARK_SCHEMA = z
  .object({
    confirmedAt: YMD.nullable(),
    groups: z.array(PARK_GROUP).min(1).max(4).refine((g) => unique(g.map((x) => x.code)), { message: "รหัสกลุ่มซ้ำ" }),
    diveSatangPerPaxDay: SATANG,
    mooring: z.object({ upTo20Satang: SATANG, from21Satang: SATANG }).strict(),
    // มติผู้คุม 12 พ.ย. (OQ6) ▸ อัตราของร้านเอง ข้างกลุ่มทางการ G1–G4 (เช่น ราชา 600/300 · สิมิลัน 1,800) — ไม่มี = ใช้กลุ่มทางการ ◂
    shopRates: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            adultSatang: SATANG,
            childSatang: SATANG,
            diverSatang: SATANG.nullable(),
            effectiveFrom: YMD,
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();
const AGE_BANDS = z
  .object({ freeBelow: INT(0, 120), childFrom: INT(0, 120), childTo: INT(0, 120), adultFrom: INT(0, 120), thaiSeniorFreeFrom: INT(0, 120), childByHeightCm: INT(0, 250) })
  .strict();
const RETENTION = z
  .object({
    passportImageDays: INT(1, 36_500).nullable(),
    medicalFormDays: INT(1, 36_500).nullable(),
    riskAckDays: INT(1, 36_500).nullable(),
    consentAccessLogDays: INT(1, 36_500).nullable(),
    manifestDays: INT(1, 36_500).nullable(),
    taxDocsDays: INT(1, 36_500).nullable(),
  })
  .strict();
const MSG_ENABLED = z.object(Object.fromEntries([...MSG_CUSTOMER, ...MSG_SHOP].map((k) => [k, BOOL])) as Record<string, typeof BOOL>).strict();

// ─────────────────── defs ───────────────────
const DEFS: SettingDef[] = [
  // ── 1.1 ทั่วไปและการขาย ──
  row({
    key: "trips.general.businessType", type: "enum", labelTh: "ประเภทกิจการ", chain: U,
    schema: z.enum(["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION"]),
    d: per("DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION"),
    extra: { enumLabelsTh: { DIVE_SHOP: "ร้านดำน้ำ", DAY_TOUR: "ทัวร์เดย์ทริป", LIVEABOARD: "เรือ Liveaboard", ATTRACTION: "สถานที่ขายตั๋ว" } },
  }),
  row({ key: "trips.general.customerLocales", type: "table", labelTh: "ภาษาหน้าจอง", chain: U, schema: uniqArr(z.enum(["th", "en", "zh"]), 1, 3), d: all(["th", "en"]) }),
  row({ key: "trips.general.currencies", type: "table", labelTh: "สกุลเงินที่ตั้งราคาได้", helpTh: "ราคาตั้งต่อสกุล ไม่แปลงสด · สกุลอื่นนอกจากบาทใช้ได้กับ Liveaboard", chain: U_P, schema: uniqArr(z.enum(["THB", "USD", "EUR"]), 1, 3), d: all(["THB"]) }),
  row({
    key: "trips.fx.rateSource", type: "enum", labelTh: "แหล่งอัตราแลกเปลี่ยนสำหรับใบกำกับ", chain: U,
    schema: z.enum(["BANK_DAILY_BUY", "BOT_REF"]), d: all("BOT_REF"),
    extra: { legal: ["W20"], enumLabelsTh: { BANK_DAILY_BUY: "อัตราซื้อของธนาคารรายวัน", BOT_REF: "อัตราอ้างอิงธนาคารแห่งประเทศไทย" } },
  }),
  row({ key: "trips.sell.holdMinutes", type: "minutes", labelTh: "ถือที่ระหว่างลูกค้าชำระเงิน (นาที)", chain: U_P, schema: INT(1, 1440), d: per(15, 15, 30) }),
  row({ key: "trips.sell.cutoff", type: "table", labelTh: "ปิดรับจองก่อนเดินทาง", chain: U_P_D, schema: CUTOFF, d: per({ daysBefore: 1, atMin: 1080 }, { daysBefore: 1, atMin: 1080 }, { daysBefore: 2, atMin: 1080 }) }),
  row({
    key: "trips.sell.minToDepart", type: "table", labelTh: "จำนวนขั้นต่ำออกเดินทางและเวลาตัดสิน", chain: U_P_D, schema: MIN_TO_DEPART,
    d: per({ minPax: null, decideDaysBefore: 1, decideAtMin: 1080 }, { minPax: 2, decideDaysBefore: 1, decideAtMin: 1080 }, { minPax: null, decideDaysBefore: 30, decideAtMin: 1080 }),
  }),
  row({ key: "trips.sell.departureHorizonDays", type: "days", labelTh: "สร้างรอบล่วงหน้า (วัน)", helpTh: "ไม่ตั้ง = สร้างรอบทีละทริป", chain: U_P, schema: INT(1, 730).nullable(), d: per(90, 90, null) }),
  row({ key: "trips.sell.waitlistHoldMinutes", type: "minutes", labelTh: "ถือที่ให้คิวรอเมื่อมีที่ว่าง (นาที)", chain: U_P, schema: INT(1, 1440), d: all(30) }),
  row({ key: "trips.sell.abandonedReminder", type: "table", labelTh: "เตือนจองค้างที่ยังไม่ชำระ", chain: U, schema: z.object({ enabled: BOOL, afterMinutes: INT(1, 10_080) }).strict(), d: all({ enabled: true, afterMinutes: 60 }) }),
  row({ key: "trips.sell.confirmMode", type: "enum", labelTh: "การยืนยันการจอง", chain: U_P_AT_A, schema: z.enum(["AUTO", "SHOP_CONFIRMS"]), d: all("AUTO"), extra: { enumLabelsTh: { AUTO: "ยืนยันอัตโนมัติ", SHOP_CONFIRMS: "ร้านยืนยันก่อน" } } }),
  row({ key: "trips.sell.shopConfirmHours", type: "int", labelTh: "เวลาที่ร้านต้องตอบคำขอที่รอยืนยัน (ชั่วโมง)", chain: U_P, schema: INT(1, 720), d: per(12, 12, 48) }),
  row({ key: "trips.sell.codePrefix", type: "text", labelTh: "อักษรนำเลขจอง", chain: U, schema: z.string().regex(/^[A-Z]{1,4}$/, { message: "ใช้อักษรภาษาอังกฤษตัวใหญ่ 1–4 ตัว" }), d: per("TR", "TR", "LB") }),
  row({ key: "trips.price.manualOverrideApprovalPct", type: "percent", labelTh: "แก้ราคามือต่ำกว่าราคาระบบเกินกี่ % ต้องอนุมัติ", chain: U, schema: PCT, d: all(10), extra: { percentScale: 100 } }),
  row({ key: "trips.price.costWarnMarginPct", type: "percent", labelTh: "เตือนเมื่อราคาต่อคนต่ำกว่าต้นทุนรอบ + กี่ %", chain: U_P, schema: PCT, d: all(0), extra: { percentScale: 100 } }),
  row({ key: "trips.fx.rates", type: "table", labelTh: "อัตราแลกเปลี่ยนที่ใช้ล็อก ณ วันจอง", chain: U, schema: z.array(z.object({ currency: z.enum(["USD", "EUR"]), rateMicros: INT(1, 2_000_000_000) }).strict()).max(10), d: all([]), extra: { effectiveDated: true, ...ACCOUNTANT } }),
  row({ key: "trips.public.showLeftAtOrBelow", type: "int", labelTh: "แสดง \"เหลือ N ที่\" เมื่อเหลือไม่เกิน", chain: U_P, schema: INT(0, 1000), d: all(5) }),
  row({ key: "trips.public.embedDomains", type: "table", labelTh: "โดเมนที่ฝังหน้าจองได้", chain: U, schema: uniqArr(z.string().regex(/^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, { message: "ชื่อโดเมนไม่ถูกต้อง" }), 0, 20), d: all([]) }),
  row({
    key: "trips.public.rateLimits", type: "table", labelTh: "เพดานถือที่ / ขอรหัสยืนยัน / เดาลิงก์", chain: U,
    schema: z.object({ holdPerHourPerContact: INT(1, 30), otpPer15Min: INT(1, 10), tokenPerHourPerDevice: INT(1, 60) }).strict(),
    d: all({ holdPerHourPerContact: 10, otpPer15Min: 5, tokenPerHourPerDevice: 30 }),
  }),
  row({ key: "trips.public.otpValidMinutes", type: "minutes", labelTh: "ยืนยันรหัสแล้วแก้การจองได้นาน (นาที)", chain: U, schema: INT(1, 1440), d: all(30) }),
  row({ key: "trips.public.holdCapPerContact", type: "int", labelTh: "จำนวนการถือที่พร้อมกันต่อเบอร์/LINE", chain: U, schema: INT(1, 20), d: all(3) }),

  // ── 1.2 เงินและงวดจ่าย ──
  row({ key: "trips.pay.depositPct", type: "percent", labelTh: "มัดจำตอนจอง (% ของค่าทริป)", helpTh: "100 = จ่ายเต็มตอนจอง", chain: U_P_AT_A, schema: PCT, d: per(100, 100, 30), extra: { percentScale: 100 } }),
  row({ key: "trips.pay.depositBase", type: "enum", labelTh: "ฐานคิดมัดจำ", chain: U_P, schema: z.enum(["TRIP_ONLY", "ALL_LINES"]), d: all("TRIP_ONLY"), extra: { enumLabelsTh: { TRIP_ONLY: "เฉพาะค่าทริป (ไม่รวมเงินเก็บแทน)", ALL_LINES: "ทุกบรรทัด" } } }),
  row({ key: "trips.pay.balanceDueDaysBefore", type: "days", labelTh: "ส่วนที่เหลือครบกำหนดก่อนเดินทาง (วัน)", helpTh: "ไม่ตั้ง = ไม่มีงวดที่สอง", chain: U_P_D_A, schema: INT(0, 365).nullable(), d: per(null, null, 60) }),
  row({ key: "trips.pay.reminderDaysBefore", type: "table", labelTh: "เตือนงวดจ่ายล่วงหน้า (วัน)", chain: U_P, schema: uniqArr(INT(0, 365), 0, 10), d: per([], [], [7, 1]) }),
  row({ key: "trips.pay.overdueAction", type: "enum", labelTh: "เมื่องวดเลยกำหนด", chain: U_P, schema: z.enum(["NOTIFY_SHOP", "AUTO_RELEASE"]), d: all("NOTIFY_SHOP"), extra: { enumLabelsTh: { NOTIFY_SHOP: "แจ้งร้านตัดสิน", AUTO_RELEASE: "ปล่อยที่อัตโนมัติ" } } }),
  row({ key: "trips.pay.splitPay", type: "bool", labelTh: "จ่ายแยกคนผ่านลิงก์", chain: U_P, schema: BOOL, d: per(false, false, true) }),
  row({ key: "trips.pay.refundTargetBusinessDays", type: "int", labelTh: "เป้าโอนคืนหลังอนุมัติ (วันทำการ)", chain: U, schema: INT(1, 60), d: all(3) }),
  row({ key: "trips.pay.overdueGraceHours", type: "int", labelTh: "ผ่อนผันหลังเลยกำหนดงวด (ชั่วโมง)", chain: U_P, schema: INT(0, 720), d: all(24) }),

  // ── 1.3 ยกเลิกและคืนเงิน ──
  row({
    key: "trips.cancel.ladder", type: "table", labelTh: "ตารางคืนเงินเมื่อลูกค้ายกเลิก", helpTh: "นับวันถึงวันเดินทาง · เรียงจำนวนวันจากมากไปน้อย", chain: U_P_D_A,
    schema: LADDER_SCHEMA, d: all(LADDER),
    extra: { legal: ["W01", "W03"], legalInput: (v, get) => ({ W01: v, W03: { ladder: v, depositPct: get("trips.pay.depositPct") } }) },
  }),
  row({
    key: "trips.cancel.shopCancelRefund", type: "table", labelTh: "คืนเงินเมื่อยกเลิกด้วยเหตุที่ไม่ใช่ลูกค้า (%)", chain: U_P,
    schema: z.object({ EXTERNAL: PCT, MIN_NOT_MET: PCT, SHOP_FAULT: PCT }).strict(), d: all({ EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 }), extra: { legal: ["W02"] },
  }),
  row({
    key: "trips.cancel.shopCancelOptions", type: "table", labelTh: "ตัวเลือกเมื่อร้านยกเลิกรอบ", chain: U_P,
    schema: z.object({ options: uniqArr(z.enum(["MOVE_DATE", "CREDIT", "REFUND_100"]), 1, 3), autoRefundAfterDays: INT(0, 60) }).strict(),
    d: all({ options: ["MOVE_DATE", "REFUND_100"], autoRefundAfterDays: 2 }),
  }),
  row({ key: "trips.cancel.refundForm", type: "enum", labelTh: "รูปแบบคืนเมื่อลูกค้ายกเลิก", chain: U, schema: z.enum(["MONEY", "CUSTOMER_CHOOSES_MONEY_OR_CREDIT"]), d: all("MONEY"), extra: { enumLabelsTh: { MONEY: "คืนเป็นเงิน", CUSTOMER_CHOOSES_MONEY_OR_CREDIT: "ลูกค้าเลือกเงินหรือเครดิตร้าน" } } }),
  row({
    key: "trips.cancel.deductions", type: "table", labelTh: "ค่าใช้จ่ายจริงที่หักจากเงินคืนได้", chain: U,
    schema: z.object({ categories: uniqArr(z.enum(["VISA", "AIR_DEPOSIT", "OTHER_NECESSARY"]), 0, 3), evidenceRequired: BOOL }).strict(),
    d: all({ categories: ["VISA", "AIR_DEPOSIT", "OTHER_NECESSARY"], evidenceRequired: true }), extra: authority("กรมการท่องเที่ยว"),
  }),
  row({ key: "trips.cancel.nameChangeFree", type: "bool", labelTh: "เปลี่ยนชื่อผู้เดินทางฟรี", chain: U_P, schema: BOOL, d: all(true) }),
  row({ key: "trips.cancel.changeDateFee", type: "money", labelTh: "ค่าเปลี่ยนวันเดินทาง", helpTh: "ไม่ตั้ง = ไม่เก็บ", chain: U_P, schema: SATANG.nullable(), d: all(null), extra: ACCOUNTANT }),
  row({ key: "trips.cancel.autoApproveUpTo", type: "money", labelTh: "อนุมัติคืนเงินอัตโนมัติเมื่อไม่เกิน", helpTh: "0 = ทุกคำขอให้คนอนุมัติ", chain: U, schema: SATANG, d: all(0) }),
  row({ key: "trips.cancel.manualEditApprovalSatang", type: "money", labelTh: "แก้ยอดคืนต่างจากที่ระบบคิดเกินยอดนี้ต้องให้ผู้จัดการอนุมัติ", chain: U, schema: SATANG, d: all(200_000) }),
  row({ key: "trips.cancel.creditBonusPct", type: "percent", labelTh: "โบนัสเครดิตร้านแทนเงินคืน (%)", chain: U_P, schema: PCT, d: all(20), extra: { percentScale: 100, hiddenUntil: "PHASE_2" } }),
  row({ key: "trips.cancel.creditValidityMonths", type: "int", labelTh: "อายุเครดิตร้าน (เดือน)", chain: U, schema: INT(1, 120), d: all(12), extra: { hiddenUntil: "PHASE_2" } }),
  row({ key: "trips.cancel.moveFreeWithinDays", type: "days", labelTh: "เลื่อนวันฟรีถ้าเลือกวันใหม่ภายใน (วัน)", chain: U_P, schema: INT(0, 730), d: all(90) }),

  // ── 1.4 ผู้เดินทาง ──
  row({ key: "trips.pax.childAgeBand", type: "table", labelTh: "ช่วงอายุราคาเด็ก", chain: U_P, schema: z.object({ infantBelow: INT(0, 30), childFrom: INT(0, 30), childTo: INT(0, 30) }).strict(), d: all({ infantBelow: 4, childFrom: 4, childTo: 11 }) }),
  row({ key: "trips.pax.childPricePct", type: "percent", labelTh: "ราคาเด็กตั้งต้น (% ของผู้ใหญ่)", helpTh: "ไม่ตั้ง = ตั้งราคาเองต่อสินค้า", chain: U, schema: PCT.nullable(), d: per(70, 70, null), extra: { percentScale: 100 } }),
  row({
    key: "trips.pax.fields", type: "table", labelTh: "ข้อมูลผู้เดินทางที่ขอ", chain: U_P, schema: PAX_FIELDS_SCHEMA,
    d: per(
      paxFields(["fullName", "finSize", "allergies", "certLevel", "diveCount"]),
      paxFields(["fullName", "pickupHotel", "allergies"]),
      paxFields(["fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "certLevel", "diveCount"], ["birthPlace"]),
    ),
  }),
  row({ key: "trips.pax.passportCutoffDays", type: "table", labelTh: "ปิดรับข้อมูลพาสปอร์ตก่อนออกเรือ (วัน)", chain: U_P, schema: z.object({ domestic: INT(0, 365), crossBorder: INT(0, 365) }).strict(), d: all({ domestic: 3, crossBorder: 21 }) }),
  row({ key: "trips.pax.cabinSharing", type: "enum", labelTh: "แชร์เคบินกับคนแปลกหน้า", chain: U_V_D, schema: z.enum(["SAME_GENDER", "ANY", "SHOP_CONFIRM"]), d: all("SAME_GENDER"), extra: { enumLabelsTh: { SAME_GENDER: "เพศเดียวกันเท่านั้น", ANY: "ไม่จำกัดเพศ", SHOP_CONFIRM: "ร้านยืนยันทีละคน" } } }),
  row({ key: "trips.pax.proofNotice", type: "template", labelTh: "ข้อความให้แสดงหลักฐานสิทธิ์ราคา", chain: U, schema: TEXT, d: all({ th: "โปรดแสดงหลักฐานอายุ/สัญชาติที่จุดบริการ", en: "Please show proof of age/nationality at the service point." }), extra: { templateVars: [] } }),

  // ── 1.5 ภาษีและเอกสารเงิน (LEGAL) ──
  row({
    key: "trips.tax.vatRegistered", type: "table", labelTh: "การจดทะเบียน VAT ของร้าน", helpTh: "ไม่ระบุ = อ่านจากระบบบัญชี · เตือนเมื่อยอดขายสะสมใกล้เกณฑ์", chain: U,
    schema: z.object({ registered: BOOL.nullable(), thresholdSatang: SATANG, warnAtPct: PCT }).strict(), d: all({ registered: null, thresholdSatang: 180_000_000, warnAtPct: 90 }),
  }),
  row({ key: "trips.tax.priceIncludesVat", type: "bool", labelTh: "ราคาที่กรอกรวม VAT แล้ว", chain: U, schema: BOOL, d: all(true) }),
  row({
    key: "trips.tax.vatRate", type: "table", labelTh: "อัตรา VAT ของสินค้า", chain: U_P,
    schema: z.object({ mode: z.enum(["STANDARD", "EXEMPT_81_1_N"]), rateBp: BP }).strict(), d: all({ mode: "STANDARD", rateBp: 700 }),
    extra: { legal: ["W18"], effectiveDated: true, ...ACCOUNTANT },
  }),
  row({ key: "trips.tax.invoiceOnEachPayment", type: "bool", labelTh: "ออกเอกสารรับเงินทุกงวด รวมมัดจำ", chain: U, schema: BOOL, d: all(true), extra: { legal: ["W16"] } }),
  row({
    key: "trips.tax.invoiceForm", type: "table", labelTh: "รูปใบกำกับภาษี", chain: U,
    schema: z.object({ direct: z.enum(["SHORT_UPGRADE_ON_REQUEST", "FULL_ONLY"]), viaAgent: z.enum(["SHORT_UPGRADE_ON_REQUEST", "FULL_ONLY"]) }).strict(),
    d: all({ direct: "SHORT_UPGRADE_ON_REQUEST", viaAgent: "FULL_ONLY" }), extra: { legal: ["W14"], ...ACCOUNTANT },
  }),
  row({
    key: "trips.tax.cancelFeeVat", type: "enum", labelTh: "เงินที่ริบ/ค่าปรับยกเลิก", chain: U, schema: z.enum(["DAMAGES_NO_VAT_NO_WHT", "SERVICE_WITH_VAT"]), d: all("DAMAGES_NO_VAT_NO_WHT"),
    extra: { legal: ["W17"], enumLabelsTh: { DAMAGES_NO_VAT_NO_WHT: "ค่าเสียหาย (ไม่มี VAT ไม่หัก ณ ที่จ่าย)", SERVICE_WITH_VAT: "ค่าบริการมี VAT" } },
  }),
  row({
    key: "trips.tax.forfeitAfterInvoice", type: "enum", labelTh: "ริบมัดจำที่ออกใบกำกับแล้ว", chain: U, schema: z.enum(["NO_AUTO_CREDIT_NOTE", "CREDIT_NOTE_PLUS_DAMAGES_RECEIPT"]), d: all("NO_AUTO_CREDIT_NOTE"),
    extra: { legal: ["W15"], ...ACCOUNTANT, enumLabelsTh: { NO_AUTO_CREDIT_NOTE: "ไม่ออกใบลดหนี้อัตโนมัติ", CREDIT_NOTE_PLUS_DAMAGES_RECEIPT: "ออกใบลดหนี้ + ใบรับเงินค่าเสียหาย" } },
  }),
  row({ key: "trips.tax.refundCreditNote", type: "bool", labelTh: "คืนเงินงวดที่ออกใบกำกับแล้วออกใบลดหนี้", chain: U, schema: BOOL, d: all(true) }),
  row({ key: "trips.tax.corporateCustomerWht", type: "table", labelTh: "ลูกค้านิติบุคคลหัก ณ ที่จ่าย", chain: U_P, schema: z.object({ enabled: BOOL, rateBp: BP }).strict(), d: all({ enabled: true, rateBp: 300 }), extra: ACCOUNTANT }),
  row({
    key: "trips.giftcard.invoiceAt", type: "table", labelTh: "จุดออกใบกำกับของบัตรของขวัญ", chain: U,
    schema: z.object({ SERVICE_SPECIFIC: z.enum(["AT_SALE", "AT_USE"]), MONEY_VALUE: z.enum(["AT_SALE", "AT_USE"]), FREE: z.enum(["DISCOUNT_AT_USE", "AT_USE"]) }).strict(),
    d: all({ SERVICE_SPECIFIC: "AT_SALE", MONEY_VALUE: "AT_USE", FREE: "DISCOUNT_AT_USE" }), extra: { hiddenUntil: "PHASE_2", ...ACCOUNTANT },
  }),
  row({ key: "trips.consumer.withdraw7Days", type: "bool", labelTh: "สิทธิ์เลิกสัญญา 7 วันในเงื่อนไข", chain: U, schema: BOOL, d: all(false), extra: authority("สคบ.") }),

  // ── 1.6 บรรทัดเก็บแทนและค่าอุทยาน ──
  row({ key: "trips.line.defaults", type: "table", labelTh: "ค่าตั้งต้นต่อชนิดรายการเสริม", helpTh: "เงินเก็บแทน (นอกฐาน VAT) · คิดคอมมิชชัน (%) · ลดราคาได้", chain: U_P, schema: LINE_SCHEMA, d: all(LINE_DEFAULTS), extra: ACCOUNTANT }),
  row({ key: "trips.parkFee.table", type: "table", labelTh: "ตารางค่าบริการอุทยานทางทะเล", helpTh: "ใส่วันที่ร้านยืนยันอัตราล่าสุด", chain: U, schema: PARK_SCHEMA, d: all(PARK_FEE_TABLE), extra: { legal: ["W29"], effectiveDated: true, ...authority("กรมอุทยานฯ") } }),
  row({ key: "trips.parkFee.ageBands", type: "table", labelTh: "ช่วงอายุค่าอุทยาน", chain: U, schema: AGE_BANDS, d: all({ freeBelow: 3, childFrom: 3, childTo: 14, adultFrom: 15, thaiSeniorFreeFrom: 60, childByHeightCm: 140 }), extra: { legal: ["W30"], effectiveDated: true } }),
  row({ key: "trips.parkFee.exemptFlags", type: "table", labelTh: "ธงยกเว้น/ลดค่าอุทยานรายคน", chain: U, schema: uniqArr(z.enum(["MONK", "DISABLED", "THAI_STUDENT_CHILD_RATE"]), 0, 3), d: all(["MONK", "DISABLED", "THAI_STUDENT_CHILD_RATE"]) }),
  row({ key: "trips.parkFee.countMode", type: "enum", labelTh: "นับค่าเข้าอุทยาน", chain: U_P, schema: z.enum(["PER_ENTRY", "PER_DAY"]), d: all("PER_ENTRY"), extra: { ...authority("กรมอุทยานฯ"), enumLabelsTh: { PER_ENTRY: "ต่อครั้งที่เข้า", PER_DAY: "ต่อวัน" } } }),

  // ── 1.7 ดำน้ำ · ประกัน · ใบอนุญาต · เรือ ──
  row({ key: "trips.dive.ratio", type: "table", labelTh: "แขกสูงสุดต่อผู้ควบคุม 1 คน", chain: U_P_D, schema: z.object({ scuba: INT(1, 100), trial: INT(1, 100), course: INT(1, 100), snorkel: INT(1, 100) }).strict(), d: all({ scuba: 4, trial: 2, course: 4, snorkel: 20 }), extra: { legal: ["W26"], effectiveDated: true } }),
  row({ key: "trips.dive.cameraRule", type: "table", labelTh: "เกณฑ์ถือกล้องลงดำน้ำลึก", chain: U, schema: z.object({ minCert: z.enum(["OW", "AOW", "RESCUE", "DIVEMASTER", "INSTRUCTOR"]), orMinDives: INT(0, 10_000) }).strict(), d: all({ minCert: "AOW", orMinDives: 40 }) }),
  row({ key: "trips.insurance.minSum", type: "table", labelTh: "วงเงินประกันอุบัติเหตุขั้นต่ำต่อคน", chain: U, schema: z.object({ deathDisabilitySatang: SATANG, injurySatang: SATANG }).strict(), d: all({ deathDisabilitySatang: 100_000_000, injurySatang: 50_000_000 }), extra: { legal: ["W25"], effectiveDated: true } }),
  row({ key: "trips.insurance.requireDeepDiveCover", type: "bool", labelTh: "สินค้าดำน้ำลึกต้องมีกรมธรรม์คุ้มครองดำน้ำลึก", chain: U_P, schema: BOOL, d: per(true, false, true) }),
  row({ key: "trips.insurance.policyMissingWarnDays", type: "days", labelTh: "เตือนเมื่อรอบยังไม่มีเลขกรมธรรม์ก่อนออก (วัน)", chain: U_P, schema: INT(0, 365), d: all(7) }),
  row({ key: "trips.insurance.showOnVoucher", type: "bool", labelTh: "พิมพ์บริษัท/เลขกรมธรรม์บนวอเชอร์", chain: U, schema: BOOL, d: all(true) }),
  row({
    key: "trips.license.fields", type: "table", labelTh: "ใบอนุญาตประกอบธุรกิจนำเที่ยว", helpTh: "ไม่บังคับกรอก · แสดงบนเอกสารเมื่อกรอก", chain: U,
    schema: z.object({ number: z.string().trim().min(1).max(50).nullable(), type: z.enum(["LOCAL", "DOMESTIC", "INBOUND", "GENERAL"]).nullable(), expiresAt: YMD.nullable() }).strict(),
    d: all({ number: null, type: null, expiresAt: null }),
  }),
  row({ key: "trips.license.expiryReminderDays", type: "table", labelTh: "เตือนก่อนใบอนุญาตหมดอายุ (วัน)", chain: U, schema: uniqArr(INT(1, 365), 0, 10), d: all([30]) }),
  row({ key: "trips.license.oneTimeNotice", type: "bool", labelTh: "แจ้งเรื่องใบอนุญาตครั้งเดียวตอนเปิดใช้", chain: U, schema: BOOL, d: per(true, true, true, false) }),
  row({ key: "trips.prospectus.checklist", type: "bool", labelTh: "แถบความครบเอกสารชี้ชวนบนหน้าสินค้า", chain: U_P, schema: BOOL, d: per(true, true, true, false) }),
  row({ key: "trips.marine.tm30Notice", type: "bool", labelTh: "เตือนเรื่อง ตม.30 เมื่อลูกค้าต่างชาติค้างคืนบนเรือ", chain: U_V, schema: BOOL, d: all(false), extra: authority("ตม.") }),
  row({
    key: "trips.marine.manifestColumns", type: "table", labelTh: "คอลัมน์รายชื่อผู้โดยสารที่ส่งออก", chain: U_V, schema: uniqArr(z.enum(PAX_FIELDS), 1, PAX_FIELDS.length),
    d: per(["fullName", "nationality", "phone"], ["fullName", "nationality", "phone"], ["fullName", "sex", "nationality", "dob", "birthPlace", "docType", "docNumber", "docExpiry", "phone"]),
    extra: authority("กรมเจ้าท่า"),
  }),

  // ── 1.8 ข้อมูลส่วนบุคคลและเอกสารลงนาม (PRIVACY) ──
  row({
    key: "trips.pdpa.retention", type: "table", labelTh: "ลบไฟล์อัตโนมัติเมื่อพ้นกำหนด (วัน)", helpTh: "นับจากวันจบทริป · ไม่ตั้ง = ไม่ลบ", chain: U, schema: RETENTION,
    d: all({ passportImageDays: 30, medicalFormDays: 365, riskAckDays: 1095, consentAccessLogDays: 1095, manifestDays: 365, taxDocsDays: 1825 }),
    extra: { legal: ["W33"], ...authority("ทนาย") },
  }),
  row({ key: "trips.pdpa.healthDataProducts", type: "bool", labelTh: "สินค้าที่ต้องใช้ข้อมูลสุขภาพ", chain: U_P, schema: BOOL, d: per(true, false, true) }),
  row({ key: "trips.pdpa.minorConsent", type: "table", labelTh: "ความยินยอมของผู้เยาว์", chain: U, schema: z.object({ parentOnlyAtOrBelow: INT(0, 30), minorBelow: INT(0, 30) }).strict(), d: all({ parentOnlyAtOrBelow: 10, minorBelow: 20 }) }),
  row({ key: "trips.pdpa.requestDeadlines", type: "table", labelTh: "กำหนดทำคำขอเจ้าของข้อมูล (วัน)", chain: U, schema: z.object({ accessDays: INT(1, 365), deletionDays: INT(1, 365) }).strict(), d: all({ accessDays: 30, deletionDays: 90 }) }),
  row({ key: "trips.pdpa.ropaAutoDraft", type: "bool", labelTh: "ร่างบันทึกรายการประมวลผลข้อมูลสุขภาพให้อัตโนมัติ", chain: U, schema: BOOL, d: per(true, false, true, false) }),
  row({ key: "trips.pdpa.viewLogDays", type: "days", labelTh: "เก็บบันทึกการเปิดดูเอกสาร (วัน)", chain: U, schema: INT(1, 36_500), d: all(1095) }),
  row({ key: "trips.pdpa.maskOnScreen", type: "bool", labelTh: "ปิดบังเลขเอกสาร/วันเกิดบนจอ", chain: U, schema: BOOL, d: all(true) }),
  row({ key: "trips.pdpa.abandonedRetentionDays", type: "days", labelTh: "ลบข้อมูลผู้จองที่จองหมดเวลาโดยไม่มีเงินเข้า (วัน)", chain: U, schema: INT(1, 3650), d: all(30) }),
  row({
    key: "trips.waiver.template", type: "template", labelTh: "แม่แบบรับทราบความเสี่ยงและแถลงข้อมูลสุขภาพ", chain: U_P, schema: TEXT,
    d: per(WAIVER_DIVE, WAIVER_WATER, WAIVER_DIVE), extra: { legal: ["W38"], templateVars: [], ...authority("ทนาย") },
  }),
  row({ key: "trips.waiver.requiredFor", type: "enum", labelTh: "สินค้าที่ต้องลงนามก่อนเดินทาง", chain: U_P, schema: z.enum(["ALL", "SCUBA_ONLY", "NONE"]), d: per("SCUBA_ONLY", "NONE", "ALL"), extra: { enumLabelsTh: { ALL: "ทุกสินค้า", SCUBA_ONLY: "เฉพาะดำน้ำลึก", NONE: "ไม่ต้องลงนาม" } } }),
  row({
    key: "trips.waiver.identityProof", type: "enum", labelTh: "วิธียืนยันตัวผู้ลงนาม", chain: U, schema: z.enum(["OTP_PHONE", "LINE_LOGIN", "LINE_IF_AVAILABLE_ELSE_OTP"]), d: all("LINE_IF_AVAILABLE_ELSE_OTP"),
    extra: { enumLabelsTh: { OTP_PHONE: "รหัสทางโทรศัพท์", LINE_LOGIN: "เข้าสู่ระบบ LINE", LINE_IF_AVAILABLE_ELSE_OTP: "LINE ถ้ามาทาง LINE ไม่งั้นรหัสทางโทรศัพท์" } },
  }),

  // ── 1.9 ข้อความแจ้งเตือน ──
  row({ key: "trips.msg.enabled", type: "table", labelTh: "เปิด/ปิดข้อความแต่ละชนิด", chain: U_P, schema: MSG_ENABLED, d: per(msgEnabled(false), msgEnabled(false), msgEnabled(true)) }),
  ...MSG_CUSTOMER.map((k) =>
    row({ key: `trips.msg.${k}`, type: "template", labelTh: MSG_TEXTS[k].labelTh, chain: U_P, schema: TEXT, d: all({ th: MSG_TEXTS[k].th, en: MSG_TEXTS[k].en }), extra: { templateVars: [...MSG_VARS] } }),
  ),

  // ── ภาคผนวก ก: ปฏิบัติการ · ผู้ให้บริการ · เงินสด ──
  row({ key: "trips.ops.autoCloseHoursAfterEnd", type: "int", labelTh: "ปิดทริปอัตโนมัติหลังจบรอบ (ชั่วโมง)", helpTh: "ไม่ตั้ง = ไม่ปิดเอง", chain: U_P, schema: INT(0, 720).nullable(), d: per(12, 12, 24) }),
  row({ key: "trips.ops.offlineCheckin", type: "bool", labelTh: "ไกด์เช็กอินออฟไลน์ได้", chain: U_P, schema: BOOL, d: all(true) }),
  row({ key: "trips.ops.noShowFixHours", type: "int", labelTh: "แก้ \"ไม่มา\" กลับได้ภายใน (ชั่วโมง)", chain: U, schema: INT(0, 720), d: all(48) }),
  row({ key: "trips.supplier.respondHours", type: "int", labelTh: "ผู้ให้บริการต้องตอบภายใน (ชั่วโมง)", chain: U_P, schema: INT(1, 720), d: all(24) }),
  row({ key: "trips.supplier.shopDecisionHours", type: "int", labelTh: "ร้านตัดสินต่อหลังหมดเวลา (ชั่วโมง)", chain: U_P, schema: INT(1, 720), d: all(12) }),
  row({ key: "trips.supplier.autoCancelOnTimeout", type: "bool", labelTh: "หมดเวลาแล้วยกเลิกเอง", chain: U_P, schema: BOOL, d: all(false) }),
  row({ key: "trips.cash.varianceApprovalSatang", type: "money", labelTh: "เงินสดขาด/เกินเกินยอดนี้ต้องอนุมัติก่อนลงบัญชี", chain: U, schema: SATANG, d: all(20_000) }),
];

// ─────────────────── แม่แบบ · snapshot · กฎรูปข้อมูล · ป้ายกลุ่ม ───────────────────
const TEMPLATES: TemplateDef[] = [
  { key: "DIVE_SHOP", version: 1, labelTh: "ร้านดำน้ำ" },
  { key: "DAY_TOUR", version: 1, labelTh: "ทัวร์เดย์ทริป" },
  { key: "LIVEABOARD", version: 1, labelTh: "เรือ Liveaboard" },
  { key: "ATTRACTION", version: 1, labelTh: "สถานที่ท่องเที่ยว/ขายตั๋ว" },
];

/** CC §N.3 — คีย์ที่การจองทัวร์จดลง policySnapshot (ตรงตัว · 35 คีย์) */
const SNAPSHOTS = {
  "trips.booking": [
    "trips.general.currencies", "trips.fx.rateSource", "trips.fx.rates",
    "trips.pay.depositPct", "trips.pay.depositBase", "trips.pay.balanceDueDaysBefore", "trips.pay.overdueAction", "trips.pay.overdueGraceHours",
    "trips.cancel.ladder", "trips.cancel.shopCancelRefund", "trips.cancel.shopCancelOptions", "trips.cancel.refundForm", "trips.cancel.deductions", "trips.cancel.nameChangeFree", "trips.cancel.changeDateFee",
    "trips.cancel.creditBonusPct", "trips.cancel.creditValidityMonths", "trips.cancel.moveFreeWithinDays",
    "trips.pax.childAgeBand", "trips.pax.childPricePct",
    "trips.tax.vatRegistered", "trips.tax.priceIncludesVat", "trips.tax.vatRate", "trips.tax.invoiceOnEachPayment", "trips.tax.invoiceForm", "trips.tax.cancelFeeVat", "trips.tax.forfeitAfterInvoice", "trips.tax.refundCreditNote", "trips.tax.corporateCustomerWht",
    "trips.consumer.withdraw7Days", "trips.line.defaults",
    "trips.parkFee.table", "trips.parkFee.ageBands", "trips.parkFee.exemptFlags", "trips.parkFee.countMode",
  ],
} as const;

/** รูปข้อมูลเท่านั้น (ไม่ใช่คำเตือนกฎหมาย · CC §E.5 ข้อ 6): ขั้นบันไดคืนเงินเรียงจำนวนวันจากมากไปน้อย ไม่ซ้ำ */
const GROUP_RULES: GroupRule[] = [
  {
    group: "cancel",
    check: (values): GroupIssue[] => {
      const v = values["trips.cancel.ladder"];
      if (!Array.isArray(v)) return [];
      const days = v.map((s) => (typeof s === "object" && s !== null && "fromDaysBefore" in s ? Number((s as { fromDaysBefore: unknown }).fromDaysBefore) : Number.NaN));
      const ok = days.every((d, i) => Number.isFinite(d) && (i === 0 || d < days[i - 1]));
      return ok ? [] : [{ key: "trips.cancel.ladder", code: "LADDER_ORDER", messageTh: "ตารางคืนเงินต้องเรียงจำนวนวันก่อนเดินทางจากมากไปน้อย และไม่ซ้ำกัน" }];
    },
  },
];

const GROUP_LABELS_TH: Record<string, string> = {
  general: "ทั่วไป",
  fx: "อัตราแลกเปลี่ยน",
  sell: "การขายและการถือที่",
  price: "ราคา",
  public: "หน้าจองสาธารณะ",
  pay: "เงินและงวดจ่าย",
  cancel: "ยกเลิกและคืนเงิน",
  pax: "ผู้เดินทาง",
  tax: "ภาษีและเอกสารเงิน",
  giftcard: "บัตรของขวัญ",
  consumer: "สิทธิผู้บริโภค",
  line: "รายการเสริมและเงินเก็บแทน",
  parkFee: "ค่าอุทยาน",
  dive: "ดำน้ำ",
  insurance: "ประกันอุบัติเหตุ",
  license: "ใบอนุญาตนำเที่ยว",
  prospectus: "เอกสารชี้ชวน",
  marine: "เรือและผู้โดยสาร",
  pdpa: "ข้อมูลส่วนบุคคล",
  waiver: "เอกสารรับทราบความเสี่ยง",
  msg: "ข้อความแจ้งเตือน",
  ops: "การปฏิบัติงานหน้างาน",
  supplier: "ผู้ให้บริการ",
  cash: "เงินสดหน้าร้าน",
};

defineSettings("trips", DEFS, { templates: TEMPLATES, snapshots: SNAPSHOTS, groupRules: GROUP_RULES, groupLabelsTh: GROUP_LABELS_TH });

/** คีย์ทั้งหมดของโดเมน trips (ลำดับทะเบียน) — ใช้ในข้อสอบ/จอค่าตั้ง */
export const TRIPS_SETTING_KEYS: readonly string[] = DEFS.map((d) => d.key);
