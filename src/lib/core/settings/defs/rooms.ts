// ─────────────────────────────────────────────────────────────
// defs/rooms.ts — ค่าตั้งหอพัก/อพาร์ตเมนต์/โรงแรม (pure) · SVC D.1 · ใบสั่ง ledger/svc-briefs/svc-brief-d.1.md §4 §7
// แหล่ง: ledger/DESIGN-DORM-HOTEL.md ภาคผนวก ก #1–83 · สัญญากลาง CC §1.3 §1.6 §1.7
//
// ▸ คีย์ `rooms.<group>.<name>` (group = ส่วนที่ 2 ของคีย์) · เงินเป็นสตางค์ · อัตราเป็น basis point (bp)
// ▸ ชั้น (chain) ตามภาคผนวก ก: ก=TENANT ห=UNIT อ=BUILDING ท=ROOM_TYPE ร=ROOM ส=LEASE ผ=RATE_PLAN
//   ⚠️ LEASE ยังไม่มีตาราง ⇒ service ปฏิเสธการตั้งค่าที่ชั้นนี้ (SUPPORTED_SCOPES) จนใบ D.0 (DormLease) ลงทะเบียน scope
//      และใบ D.5 (สัญญา) ใช้จริง · RATE_PLAN เปิดเมื่อ H.0 (HotelRatePlan) · ระหว่างนี้ค่าในชั้นนั้นได้จากชั้นบน/แม่แบบ
// ▸ ค่าโรงแรม/ช่องทาง OTA ทั้งหมดอยู่ใต้ `rooms.hotel.*` + hiddenUntil "PHASE_H" (มติเจ้าของรอบ 2 ข้อ 5: โรงแรมรอ V2)
// ▸ ค่าที่รอที่ปรึกษากฎหมาย = อยู่ใน PENDING_LEGAL_REVIEW_KEYS + helpTh ขึ้นต้น "⚠️ รอที่ปรึกษากฎหมายตรวจ"
//   — เป็นป้ายบน UI เท่านั้น ห้ามใช้ตัดสินในตรรกะ (ตัวเลขกฎหมายจริงอยู่ที่ TH_RENTAL_2568_PARAMS)
// ▸ ภาคผนวก ก ที่ไม่ได้นิยามที่นี่ (ดู SKIPPED_ANNEX_ROWS): #30 #39 #53–#57 #63 #83 — เป็นของชิ้นกลางอื่น
//
// 🔴 pure: import ได้เฉพาะ zod · ../registry · ../legal/th-rental-2568 · import type
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { isValidOutOfScopeReason, TH_RENTAL_2568_PARAMS, type LeaseKind } from "../legal/th-rental-2568";
import { defineSettings } from "../registry";
import type { GroupRule, LegalInputFn, LegalRuleId, ScopeKind, SettingDef, TemplateDef } from "../types";

/** SVC D.13 ▸ คีย์แก้ค่าตั้งหอ (CC §8 · ลงทะเบียนใน core/permissions.ts แล้ว) ◂ */
const EDIT = "dorm.settings.edit";

// ─────────────────── ชนิดค่าที่ใช้ซ้ำ ───────────────────
const MONEY = z.number().int().min(0).max(1_000_000_000); // ≤ ฿10,000,000
const MONEY_OR_NULL = MONEY.nullable();
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DAY_OF_MONTH = z.number().int().min(1).max(28); // ≤ 28 ⇒ มีทุกเดือน
const TAX_KIND = z.enum(["EXEMPT", "VAT7", "NONE"]);
const UTIL_METHOD = z.enum(["ACTUAL_COST", "TARIFF", "FIXED_RATE", "FLAT"]);
const METERING = z.enum(["ROOM_METER", "SHARED_METER", "NONE"]);
const FLAT = z.object({ per: z.enum(["ROOM", "PERSON"]), satang: MONEY }).strict().nullable();
const TEXT_TPL = z.union([
  z.string().min(1).max(8000),
  z.object({ th: z.string().min(1).max(8000), en: z.string().max(8000).optional() }).strict(),
]);

// ─────────────────── ชั้น ───────────────────
const U = ["UNIT"] as const satisfies readonly ScopeKind[];
const T = ["TENANT"] as const satisfies readonly ScopeKind[];
const U_B = ["UNIT", "BUILDING"] as const satisfies readonly ScopeKind[];
const U_B_R = ["UNIT", "BUILDING", "ROOM"] as const satisfies readonly ScopeKind[];
const U_RT = ["UNIT", "ROOM_TYPE"] as const satisfies readonly ScopeKind[];
const U_RT_L = ["UNIT", "ROOM_TYPE", "LEASE"] as const satisfies readonly ScopeKind[]; // LEASE: D.0/D.5
const U_L = ["UNIT", "LEASE"] as const satisfies readonly ScopeKind[]; // LEASE: D.0/D.5
const U_RT_R_L = ["UNIT", "ROOM_TYPE", "ROOM", "LEASE"] as const satisfies readonly ScopeKind[]; // LEASE: D.0/D.5
const RT = ["ROOM_TYPE"] as const satisfies readonly ScopeKind[];
const RT_R = ["ROOM_TYPE", "ROOM"] as const satisfies readonly ScopeKind[];
const RT_R_L = ["ROOM_TYPE", "ROOM", "LEASE"] as const satisfies readonly ScopeKind[]; // LEASE: D.0/D.5
const R_L = ["ROOM", "LEASE"] as const satisfies readonly ScopeKind[]; // LEASE: D.0/D.5
const U_RP = ["UNIT", "RATE_PLAN"] as const satisfies readonly ScopeKind[]; // RATE_PLAN: H.0
const RT_RP = ["ROOM_TYPE", "RATE_PLAN"] as const satisfies readonly ScopeKind[]; // RATE_PLAN: H.0
const RP = ["RATE_PLAN"] as const satisfies readonly ScopeKind[]; // RATE_PLAN: H.0

// ─────────────────── ตัวช่วยสร้าง def ───────────────────
type RoomDefInput = Omit<SettingDef, "domain" | "group" | "editPermission"> & { group?: string };
const def = (x: RoomDefInput): SettingDef => ({ domain: "rooms", group: x.group ?? x.key.split(".")[1], editPermission: EDIT, ...x });
/** ค่าโรงแรม/OTA — ซ่อนจนเฟส H */
const hotel = (x: RoomDefInput): SettingDef => def({ group: "hotel", ...x, hiddenUntil: "PHASE_H" });

const PENDING = "⚠️ รอที่ปรึกษากฎหมายตรวจ — ";

/** ตรวจตอนบันทึกค่าตั้งไม่ได้ (ต้องใช้บิลจริง/ข้อมูลรายสัญญา) ⇒ ข้าม · ตรวจซ้ำที่จุดต้นทุน (CC §1.7) */
const atCostPoint =
  (...rules: LegalRuleId[]): LegalInputFn =>
  () => {
    const out: Partial<Record<LegalRuleId, null>> = {};
    for (const r of rules) out[r] = null;
    return out;
  };

const SHORT_MAX = TH_RENTAL_2568_PARAMS.shortLeaseMaxMonths.value;
const leaseKindOf = (months: unknown): LeaseKind => (typeof months === "number" && months > SHORT_MAX ? "LONG" : "SHORT");
const asInt = (v: unknown): unknown => (v === null || v === undefined ? 0 : v);

/** ประกัน + ล่วงหน้า (เดือน) — คีย์ใดคีย์หนึ่งเปลี่ยน ⇒ ตรวจคู่กันด้วยค่าปัจจุบันของอีกคีย์ */
const depositAdvanceInput =
  (self: "deposit" | "advance"): LegalInputFn =>
  (value, get) => ({
    DEPOSIT_ADVANCE_MONTHS_LIMIT: {
      leaseKind: leaseKindOf(get("rooms.lease.defaultMonths")),
      depositMonths: self === "deposit" ? value : asInt(get("rooms.deposit.months")),
      advanceMonths: self === "advance" ? value : asInt(get("rooms.lease.advanceMonths")),
    },
  });

// ─────────────────── ตัวแปรแม่แบบข้อความ ───────────────────
const BILL_VARS = ["tenantName", "roomNo", "unitName", "period", "amount", "dueDate", "payLink"] as const;
const tpl = (key: string, labelTh: string, vars: readonly string[], th: string, en: string): SettingDef =>
  def({
    key,
    group: "msg",
    type: "template",
    labelTh,
    helpTh: "ห้ามข้อความข่มขู่ (ตัดน้ำไฟ/ล็อกห้อง/ยึดของ) — ตัวตรวจ TEMPLATE_NO_THREAT บล็อกทุกโหมด",
    schema: TEXT_TPL,
    defaults: { _fallback: { th, en } },
    chain: U,
    legal: ["TEMPLATE_NO_THREAT"],
    templateVars: vars,
  });

// ═════════════════════ นิยาม (ภาคผนวก ก) ═════════════════════
const DEFS: SettingDef[] = [
  // ── ทั่วไป · กฎหมาย (#1–5) ──
  def({
    key: "rooms.general.businessType", type: "enum", labelTh: "ประเภทกิจการ",
    helpTh: "ตัดสินขอบเขตประกาศ สคบ. 2568 (≥ 3 ห้อง · ไม่ใช่หอพักนักศึกษา/โรงแรม) และชุดค่าเริ่ม", // #1
    schema: z.enum(["APARTMENT", "STUDENT_DORM", "SMALL_HOTEL", "SERVICED_APT"]),
    defaults: { _fallback: "APARTMENT", APARTMENT: "APARTMENT", STUDENT_DORM: "STUDENT_DORM", SMALL_HOTEL: "SMALL_HOTEL", SERVICED_APT: "SERVICED_APT" },
    chain: U, sensitivity: "LEGAL",
  }),
  def({
    key: "rooms.legal.mode", type: "enum", labelTh: "โหมดตามกฎหมาย",
    helpTh: "เข้มงวด = บล็อก · เตือน = ต้องยืนยัน+เหตุผล (เก็บประวัติ) · นอกขอบเขต = ต้องมีเหตุผลและหลักฐาน — เปลี่ยนได้เฉพาะเจ้าของกิจการ", // #2
    schema: z.enum(["STRICT", "WARN", "OUT_OF_SCOPE"]),
    defaults: { _fallback: "STRICT" },
    chain: U, ownerOnly: true, sensitivity: "LEGAL", writeVia: "หน้า ค่าน้ำไฟ · กฎหมาย · VAT (เปลี่ยนโหมดตามกฎหมาย)",
  }),
  def({
    key: "rooms.legal.outOfScopeReason", type: "text", labelTh: "เหตุผลที่อยู่นอกขอบเขตประกาศ", // #3
    helpTh: "บังคับเมื่อเลือกโหมดนอกขอบเขต (อย่างน้อย 10 ตัวอักษร)",
    schema: z.string().max(2000).nullable(),
    defaults: { _fallback: null },
    chain: U, ownerOnly: true, sensitivity: "LEGAL", writeVia: "หน้า ค่าน้ำไฟ · กฎหมาย · VAT (เปลี่ยนโหมดตามกฎหมาย)",
  }),
  def({
    key: "rooms.legal.outOfScopeEvidence", type: "table", labelTh: "หลักฐานประกอบ (ไฟล์) กรณีนอกขอบเขต", // #3
    helpTh: "รหัสไฟล์ส่วนตัวที่แนบ — D.7 บังคับเมื่อ legalScope บอกว่าอยู่ในขอบเขตแต่เลือกนอกขอบเขต",
    schema: z.array(z.string().min(1).max(64)).max(20),
    defaults: { _fallback: [] },
    chain: U, ownerOnly: true, sensitivity: "LEGAL", writeVia: "หน้า ค่าน้ำไฟ · กฎหมาย · VAT (เปลี่ยนโหมดตามกฎหมาย)",
  }),
  def({
    key: "rooms.money.rounding", type: "enum", labelTh: "การปัดเศษเงิน", // #4
    helpTh: "SATANG = ทศนิยม 2 ตำแหน่ง (ปัดครึ่งขึ้นต่อบรรทัด)",
    schema: z.enum(["SATANG", "BAHT_HALF_UP", "BAHT_DOWN"]),
    defaults: { _fallback: "SATANG" },
    chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.locale.docLanguage", type: "enum", labelTh: "ภาษาเอกสาร/ข้อความ", // #5
    helpTh: "ค่าเริ่มไทย · ตั้งอังกฤษรายสัญญาได้ (ชั้นสัญญาเปิดเมื่อใบ D.5)",
    schema: z.enum(["th", "en"]),
    defaults: { _fallback: "th" },
    chain: U_L,
  }),

  // ── ห้อง · ค่าเช่า (#6–8) ──
  def({
    key: "rooms.rent.monthly", type: "money", labelTh: "ค่าห้องต่อเดือน", // #6
    helpTh: "กรอกต่อประเภทห้อง · ล็อกในสัญญา ขึ้นได้ตอนต่อสัญญาเท่านั้น (ตรวจที่ D.5/D.12 ด้วย RENT_LOCKED_IN_LEASE)",
    schema: MONEY_OR_NULL,
    defaults: { _fallback: null },
    chain: RT_R_L, sensitivity: "MONEY",
    legal: ["RENT_LOCKED_IN_LEASE"], legalInput: atCostPoint("RENT_LOCKED_IN_LEASE"),
  }),
  def({
    key: "rooms.rent.mode", type: "enum", labelTh: "ห้องปล่อยแบบไหน", // #7
    schema: z.enum(["MONTHLY", "NIGHTLY", "BOTH"]),
    defaults: { _fallback: "MONTHLY", SMALL_HOTEL: "NIGHTLY", SERVICED_APT: "BOTH" },
    chain: RT_R,
  }),
  def({
    key: "rooms.rent.nightly", type: "money", labelTh: "ราคาต่อคืน (ห้องรายวันของหอ)", // #8
    schema: MONEY_OR_NULL,
    defaults: { _fallback: null },
    chain: RT, sensitivity: "MONEY",
  }),

  // ── น้ำ · ไฟ · มิเตอร์ (#9–18) ──
  def({
    key: "rooms.utility.elec.metering", type: "enum", labelTh: "วิธีวัดไฟ", // #9
    schema: METERING, defaults: { _fallback: "ROOM_METER" }, chain: U_B_R,
  }),
  def({
    key: "rooms.utility.water.metering", type: "enum", labelTh: "วิธีวัดน้ำ", // #9
    schema: METERING, defaults: { _fallback: "ROOM_METER" }, chain: U_B_R,
  }),
  def({
    key: "rooms.utility.elec.method", type: "enum", labelTh: "วิธีคิดค่าไฟ", // #10
    helpTh: `${PENDING}วิธีคิด "อัตราที่การไฟฟ้าเรียกเก็บ" · ยอดที่เก็บรวมทุกห้องต้องไม่เกินบิลการไฟฟ้า (ตรวจทุกรอบบิล D.8)`,
    schema: UTIL_METHOD, defaults: { _fallback: "ACTUAL_COST" }, chain: U_B, sensitivity: "MONEY",
    legal: ["UTIL_TOTAL_LE_BILL"], legalInput: atCostPoint("UTIL_TOTAL_LE_BILL"),
  }),
  def({
    key: "rooms.utility.water.method", type: "enum", labelTh: "วิธีคิดค่าน้ำ", // #10
    helpTh: `${PENDING}วิธีคิด "อัตราที่การประปาเรียกเก็บ" · ยอดที่เก็บรวมทุกห้องต้องไม่เกินบิลการประปา (ตรวจทุกรอบบิล D.8)`,
    schema: UTIL_METHOD, defaults: { _fallback: "ACTUAL_COST" }, chain: U_B, sensitivity: "MONEY",
    legal: ["UTIL_TOTAL_LE_BILL"], legalInput: atCostPoint("UTIL_TOTAL_LE_BILL"),
  }),
  def({
    key: "rooms.utility.elec.fixedRate", type: "money", labelTh: "ค่าไฟอัตราคงที่ (สตางค์/หน่วย)", // #11
    helpTh: "ต้องไม่เกินต้นทุนจริงเดือนนั้น — ตรวจซ้ำทุกเดือนเมื่อกรอกบิลการไฟฟ้า",
    schema: MONEY_OR_NULL, defaults: { _fallback: null }, chain: U_B, sensitivity: "MONEY",
    legal: ["UTIL_FIXED_RATE_LE_COST"], legalInput: atCostPoint("UTIL_FIXED_RATE_LE_COST"),
  }),
  def({
    key: "rooms.utility.water.fixedRate", type: "money", labelTh: "ค่าน้ำอัตราคงที่ (สตางค์/หน่วย)", // #11
    helpTh: "ต้องไม่เกินต้นทุนจริงเดือนนั้น — ตรวจซ้ำทุกเดือนเมื่อกรอกบิลการประปา",
    schema: MONEY_OR_NULL, defaults: { _fallback: null }, chain: U_B, sensitivity: "MONEY",
    legal: ["UTIL_FIXED_RATE_LE_COST"], legalInput: atCostPoint("UTIL_FIXED_RATE_LE_COST"),
  }),
  def({
    key: "rooms.utility.elec.flat", type: "table", labelTh: "ค่าไฟเหมาจ่าย (ต่อห้อง/ต่อคน)", // #12
    helpTh: "เฉลี่ยแล้วต้องไม่เกินต้นทุน — ตรวจทุกรอบบิล",
    schema: FLAT, defaults: { _fallback: null }, chain: U_RT, sensitivity: "MONEY",
    legal: ["UTIL_FLAT_LE_COST"], legalInput: atCostPoint("UTIL_FLAT_LE_COST"),
  }),
  def({
    key: "rooms.utility.water.flat", type: "table", labelTh: "ค่าน้ำเหมาจ่าย (ต่อห้อง/ต่อคน)", // #12
    helpTh: "เฉลี่ยแล้วต้องไม่เกินต้นทุน — ตรวจทุกรอบบิล",
    schema: FLAT, defaults: { _fallback: null }, chain: U_RT, sensitivity: "MONEY",
    legal: ["UTIL_FLAT_LE_COST"], legalInput: atCostPoint("UTIL_FLAT_LE_COST"),
  }),
  // SVC D.7 ▸ ตารางอัตราของรัฐที่ใช้กับวิธีคิด "ตามตารางอัตรา" (อ่าน DormAuthorityTariff ตามวันที่มีผล) ◂
  def({
    key: "rooms.utility.elec.tariffRef", type: "text", labelTh: "ประเภทอัตราของการไฟฟ้า",
    helpTh: "รูปแบบ ผู้ให้บริการ:รหัสประเภท เช่น PEA:1.1.2 — ใช้กับวิธีคิด 'ตามตารางอัตรา' (ตารางระบบ DormAuthorityTariff มีวันที่มีผล)",
    schema: z.string().regex(/^(PEA|MEA|PWA|MWA):[0-9A-Za-z._-]{1,20}$/).nullable(), defaults: { _fallback: null }, chain: U_B, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.utility.water.tariffRef", type: "text", labelTh: "ประเภทอัตราของการประปา",
    helpTh: "รูปแบบ ผู้ให้บริการ:รหัสประเภท เช่น PEA:1.1.2 — ใช้กับวิธีคิด 'ตามตารางอัตรา' (ตารางระบบ DormAuthorityTariff มีวันที่มีผล)",
    schema: z.string().regex(/^(PEA|MEA|PWA|MWA):[0-9A-Za-z._-]{1,20}$/).nullable(), defaults: { _fallback: null }, chain: U_B, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.utility.minimum", type: "money", labelTh: "ค่าน้ำ/ไฟขั้นต่ำ", // #13
    helpTh: "ว่าง = ปิด · ประกาศห้ามเก็บขั้นต่ำ ต้องเก็บตามจริง",
    schema: MONEY_OR_NULL, defaults: { _fallback: null }, chain: U, sensitivity: "MONEY",
    legal: ["UTIL_NO_MINIMUM"],
    legalInput: (v) => ({ UTIL_NO_MINIMUM: { enabled: v !== null && v !== undefined, minSatang: typeof v === "number" ? v : null } }),
  }),
  def({
    key: "rooms.utility.sharedBasis", type: "enum", labelTh: "เฉลี่ยมิเตอร์รวมตาม", // #14
    helpTh: "ใช้เมื่อวิธีวัด = มิเตอร์รวม",
    schema: z.enum(["PERSON", "ROOM", "AREA"]), defaults: { _fallback: "PERSON" }, chain: U_B,
  }),
  def({
    key: "rooms.utility.tariffTable", type: "table", labelTh: "ตารางอัตราการไฟฟ้า/ประปา", // #15
    helpTh: "ว่าง = ใช้ตารางระบบ (DormAuthorityTariff ใบ D.0) · ต้องอัปเดตตามงวด Ft",
    schema: z
      .array(z.object({ kind: z.enum(["ELEC", "WATER"]), uptoUnits: z.number().int().min(1).nullable(), rateE4: z.number().int().min(0), ftE4: z.number().int().optional() }).strict())
      .max(50)
      .nullable(),
    defaults: { _fallback: null }, chain: T, effectiveDated: true, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.meter.readDay", type: "int", labelTh: "วันจดมิเตอร์ (วันที่ของเดือน)", // #16
    schema: DAY_OF_MONTH, defaults: { _fallback: 25 }, chain: U_B,
  }),
  def({
    key: "rooms.meter.anomaly", type: "table", labelTh: "เกณฑ์ค่ามิเตอร์ผิดปกติ (พักบิล)", // #17
    schema: z.object({ pctFromAvg3: z.number().int().min(1).max(1000), vacantMaxUnits: z.number().int().min(0).max(10_000), flagBackwards: z.boolean() }).strict(),
    defaults: { _fallback: { pctFromAvg3: 50, vacantMaxUnits: 5, flagBackwards: true } }, chain: U,
  }),
  def({
    key: "rooms.meter.aiRead", type: "bool", labelTh: "ให้ AI อ่านเลขมิเตอร์จากรูป", // #18
    schema: z.boolean(), defaults: { _fallback: true }, chain: U,
  }),
  def({
    key: "rooms.meter.requirePhoto", type: "enum", labelTh: "บังคับถ่ายรูปมิเตอร์", // #18
    schema: z.enum(["NONE", "ELEC", "BOTH"]), defaults: { _fallback: "ELEC" }, chain: U,
  }),

  // ── ภาษี (#19–22) ──
  def({
    key: "rooms.vat.registered", type: "bool", labelTh: "จดทะเบียน VAT", // #19
    helpTh: "ดึงจากตั้งค่าบัญชีของหน่วย (ใบ D.2 ผูก)",
    schema: z.boolean(), defaults: { _fallback: false }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.vat.pricesIncludeVat", type: "bool", labelTh: "ราคาที่กรอกรวม VAT แล้ว", // #20
    schema: z.boolean(), defaults: { _fallback: true }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.vat.taxKinds", type: "table", labelTh: "ชนิดภาษีต่อรายการ", // #21
    helpTh: "ค่าห้องที่อยู่อาศัยยกเว้น VAT ตาม ม.81(1)(ต) เสมอ · แยกบรรทัดเสมอ",
    schema: z
      .object({ RENT: z.literal("EXEMPT"), COMMON: TAX_KIND, ELEC: TAX_KIND, WATER: TAX_KIND, SERVICE: TAX_KIND, LATE_FEE: TAX_KIND })
      .strict(),
    defaults: { _fallback: { RENT: "EXEMPT", COMMON: "VAT7", ELEC: "VAT7", WATER: "VAT7", SERVICE: "VAT7", LATE_FEE: "NONE" } },
    chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.tax.withholdingCorporateBp", type: "percent", labelTh: "หัก ณ ที่จ่าย ผู้เช่านิติบุคคล (bp)", // #22
    helpTh: `${PENDING}ยังไม่ได้ตรวจแหล่ง · 500 = 5% ของค่าเช่า`,
    // SVC D.3 ▸ แถวแผน "แหล่งยังไม่ยืนยัน = ปิดค่าเริ่ม" — ค่าเริ่ม 0 (เดิม 500) · สัญญาเก่าที่ snapshot 500 ไว้ = ตามสัญญา ◂
    schema: z.number().int().min(0).max(10_000), defaults: { _fallback: 0 }, chain: U_L, sensitivity: "MONEY",
  }),
  // SVC D.3 ▸ วันที่ใบกำกับภาษีฉบับใหม่เมื่อออกแทนฉบับเดิม (คำสั่ง ป.86/2542) ◂
  def({
    key: "rooms.vat.reissueDate", type: "enum", labelTh: "วันที่ใบกำกับภาษีฉบับใหม่ (เมื่อออกแทนฉบับเดิม)",
    helpTh: `${PENDING}ORIGINAL = ลงวันที่เดียวกับฉบับเดิม · REISSUE_DAY = ลงวันที่ออกฉบับใหม่`,
    schema: z.enum(["ORIGINAL", "REISSUE_DAY"]), defaults: { _fallback: "ORIGINAL" }, chain: U, sensitivity: "MONEY",
  }),

  // ── รอบบิล (#23–29) ──
  def({ key: "rooms.billing.issueDay", type: "int", labelTh: "วันออกบิล (วันที่ของเดือน)", schema: DAY_OF_MONTH, defaults: { _fallback: 25 }, chain: U_B }), // #23
  def({ key: "rooms.billing.dueDay", type: "int", labelTh: "วันครบกำหนดชำระ (วันที่ของเดือน)", schema: DAY_OF_MONTH, defaults: { _fallback: 5 }, chain: U_L }), // #24
  def({
    key: "rooms.billing.rentTiming", type: "enum", labelTh: "เก็บค่าห้องล่วงหน้า/ย้อนหลัง", // #25
    schema: z.enum(["ADVANCE", "ARREARS"]), defaults: { _fallback: "ADVANCE" }, chain: U,
  }),
  def({
    key: "rooms.billing.utilityTiming", type: "enum", labelTh: "เก็บค่าน้ำไฟ", // #26
    helpTh: "ARREARS = ย้อนหลัง 1 เดือน (ตามเลขที่จด)",
    schema: z.enum(["ARREARS", "SAME_MONTH"]), defaults: { _fallback: "ARREARS" }, chain: U,
  }),
  def({
    key: "rooms.billing.prorate", type: "enum", labelTh: "เศษวันเข้า/ออกกลางเดือน", // #27
    schema: z.enum(["ACTUAL_DAYS", "DIV_30", "FULL_MONTH"]), defaults: { _fallback: "ACTUAL_DAYS" }, chain: U_L, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.billing.autoSend", type: "bool", labelTh: "ส่งบิลอัตโนมัติ", // #28
    helpTh: "ปิด = ตรวจก่อนส่ง", schema: z.boolean(), defaults: { _fallback: false }, chain: U,
  }),
  def({
    key: "rooms.billing.sendChannels", type: "table", labelTh: "ช่องทางส่งบิล (ตามลำดับ)", // #29
    schema: z.array(z.enum(["LINE", "SMS", "PRINT"])).min(1).refine((a) => new Set(a).size === a.length, { message: "ช่องทางซ้ำ" }),
    defaults: { _fallback: ["LINE", "SMS", "PRINT"] }, chain: U_L,
  }),

  // ── ค่าปรับ · เตือน · ทวง (#31–38) ──
  def({
    key: "rooms.lateFee.kind", type: "enum", labelTh: "แบบค่าปรับชำระล่าช้า", // #31
    helpTh: `${PENDING}ไม่พบเพดานในตัวบท ต้องสมเหตุสมผล`,
    schema: z.enum(["NONE", "PER_DAY", "ONCE", "PERCENT"]), defaults: { _fallback: "PER_DAY" }, chain: U_L, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.lateFee.amount", type: "money", labelTh: "อัตราค่าปรับ (บาท/วัน หรือ/ครั้ง)", // #32
    helpTh: `${PENDING}ล็อกในสัญญา`,
    schema: MONEY, defaults: { _fallback: 5000 }, chain: U_L, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.lateFee.percentBp", type: "percent", labelTh: "ค่าปรับเป็น % ของยอดค้าง (bp)", // #31 แบบ PERCENT
    schema: z.number().int().min(0).max(10_000).nullable(), defaults: { _fallback: null }, chain: U_L, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.lateFee.capPerBill", type: "money", labelTh: "เพดานค่าปรับต่อบิล", // #33
    helpTh: `${PENDING}เพดานตามกฎหมาย (ถ้ามี) อยู่ที่พารามิเตอร์แพลตฟอร์ม lateFeeCapSatang · ว่าง = ไม่จำกัด`,
    schema: MONEY_OR_NULL, defaults: { _fallback: 50_000 }, chain: U_L, sensitivity: "MONEY",
    legal: ["LATE_FEE_CAP"],
    // ว่าง (ไม่จำกัด) ⇒ ตรวจที่ค่าปรับจริงต่อบิล (D.11)
    legalInput: (v) => ({ LATE_FEE_CAP: typeof v === "number" ? { feeSatang: v } : null }),
  }),
  def({ key: "rooms.lateFee.graceDays", type: "days", labelTh: "วันผ่อนผันก่อนเริ่มปรับ", schema: z.number().int().min(0).max(60), defaults: { _fallback: 3 }, chain: U_L }), // #34
  def({
    key: "rooms.lateFee.waiverApproval", type: "enum", labelTh: "ยกเว้นค่าปรับรายคน", // #35
    helpTh: "เก็บประวัติ + เหตุผลทุกครั้ง",
    schema: z.enum(["OWNER_APPROVAL", "MANAGER_DIRECT", "OWNER_ONLY"]), defaults: { _fallback: "OWNER_APPROVAL" }, chain: U, ownerOnly: true,
  }),
  def({
    key: "rooms.notify.reminderBeforeDays", type: "table", labelTh: "เตือนก่อนครบกำหนด (วันก่อน · 0 = วันครบ)", // #36
    schema: z.array(z.number().int().min(0).max(30)).max(10), defaults: { _fallback: [2, 0] }, chain: U,
  }),
  def({
    key: "rooms.notify.dunningAfterDays", type: "table", labelTh: "ทวงหลังเลยกำหนด (วันหลัง)", // #37
    schema: z.array(z.number().int().min(1).max(120)).max(10), defaults: { _fallback: [3, 7, 14] }, chain: U,
  }),
  // #38 แม่แบบข้อความ 7 ชนิด (ข้อความเงียบ #39 ใช้ messaging.quietHours)
  tpl("rooms.msg.bill", "ข้อความส่งบิล", BILL_VARS,
    "เรียนคุณ{tenantName} บิลห้อง {roomNo} งวด {period} ยอด {amount} ครบกำหนดชำระ {dueDate} ชำระได้ที่ {payLink} ขอบคุณค่ะ — {unitName}",
    "Dear {tenantName}, the bill for room {roomNo} ({period}) is {amount}, due {dueDate}. Pay at {payLink}. Thank you — {unitName}"),
  tpl("rooms.msg.reminder", "ข้อความเตือนก่อนครบกำหนด", BILL_VARS,
    "แจ้งเตือน: บิลห้อง {roomNo} งวด {period} ยอด {amount} ครบกำหนด {dueDate} ชำระได้ที่ {payLink} — {unitName}",
    "Reminder: room {roomNo} bill ({period}) of {amount} is due {dueDate}. Pay at {payLink} — {unitName}"),
  tpl("rooms.msg.dunning", "ข้อความติดตามยอดค้าง", [...BILL_VARS, "daysLate"],
    "บิลห้อง {roomNo} งวด {period} ยอด {amount} เลยกำหนดชำระมา {daysLate} วัน รบกวนชำระที่ {payLink} หากชำระแล้วขออภัยมา ณ ที่นี้ — {unitName}",
    "Room {roomNo} bill ({period}) of {amount} is {daysLate} days past due. Please pay at {payLink}. If already paid, please disregard — {unitName}"),
  tpl("rooms.msg.receipt", "ข้อความใบเสร็จ", ["tenantName", "roomNo", "unitName", "amount", "paidDate", "receiptLink"],
    "ได้รับชำระห้อง {roomNo} ยอด {amount} วันที่ {paidDate} แล้ว ดูใบเสร็จ {receiptLink} ขอบคุณค่ะ — {unitName}",
    "Payment received for room {roomNo}: {amount} on {paidDate}. Receipt: {receiptLink}. Thank you — {unitName}"),
  tpl("rooms.msg.announcement", "ข้อความประกาศ", ["unitName", "title", "body"],
    "ประกาศจาก {unitName}: {title}\n{body}",
    "Notice from {unitName}: {title}\n{body}"),
  tpl("rooms.msg.roomLink", "ข้อความผูกห้องกับ LINE", ["tenantName", "roomNo", "unitName", "linkCode"],
    "ผูกห้อง {roomNo} กับ LINE เพื่อรับบิลและแจ้งซ่อม: พิมพ์รหัส {linkCode} — {unitName}",
    "Link room {roomNo} to LINE for bills and repairs: send code {linkCode} — {unitName}"),
  tpl("rooms.msg.repairDone", "ข้อความแจ้งซ่อมเสร็จ", ["tenantName", "roomNo", "unitName", "ticketNo"],
    "งานซ่อมเลขที่ {ticketNo} ห้อง {roomNo} เสร็จแล้ว หากยังมีปัญหาแจ้งกลับได้เลย — {unitName}",
    "Repair {ticketNo} for room {roomNo} is complete. Let us know if anything is still wrong — {unitName}"),
  // SVC D.11 ▸ ค่าปรับอัตโนมัติ · เพดานกันพิมพ์ผิด · นัดจ่าย · หนังสือบอกเลิกสัญญา (ใบสั่ง ledger/svc-briefs/svc-brief-d.11.md §2.2) ◂
  def({
    key: "rooms.lateFee.autoCharge", type: "bool", labelTh: "คิดค่าปรับจ่ายช้าลงบิลถัดไปอัตโนมัติ",
    helpTh: "ปิด = ไม่มีค่าปรับอัตโนมัติ (ยังใส่ค่าปรับเองในบิลได้) · คิดตามข้อตกลงค่าปรับในสัญญาแต่ละฉบับ",
    schema: z.boolean(), defaults: { _fallback: true }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.lateFee.guardRentBp", type: "percent", labelTh: "เพดานกันพิมพ์ผิดของค่าปรับ (% ของค่าเช่า · bp)",
    helpTh: `${PENDING}ใช้เมื่อสัญญาไม่มีเพดานต่อบิลและยังไม่มีเพดานตามกฎหมาย · 10,000 = ค่าเช่า 1 เดือน · ว่าง = ไม่จำกัด`,
    schema: z.number().int().min(0).max(100_000).nullable(), defaults: { _fallback: 10_000 }, chain: U, ownerOnly: true, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.notify.promiseMaxDays", type: "days", labelTh: "นัดจ่ายได้ไกลสุด (วันจากวันนี้)",
    schema: z.number().int().min(1).max(90), defaults: { _fallback: 30 }, chain: U,
  }),
  // SVC D.9 ▸ ผู้เช่าผ่าน LINE + หน้าจ่าย/พอร์ทัล (ใบสั่ง ledger/svc-briefs/svc-brief-d.9.md §2) — กลุ่มเดิม notify/payment ⇒ การ์ดหน้า 17 แสดงเอง ◂
  def({
    key: "rooms.notify.portalLinkDays", type: "days", labelTh: "อายุลิงก์หน้าจ่าย/พอร์ทัลผู้เช่า (วัน)",
    helpTh: "ลิงก์ในข้อความบิล/เตือน/เมนู \"บิลของฉัน\" · สัญญาจบแล้วลิงก์ใช้ไม่ได้ทันทีไม่ว่าอายุเหลือเท่าไร",
    schema: z.number().int().min(1).max(90), defaults: { _fallback: 35 }, chain: U,
  }),
  def({
    key: "rooms.notify.linkCodeDays", type: "days", labelTh: "อายุรหัสผูกห้องกับ LINE (วัน)",
    helpTh: "รหัส/QR ที่พนักงานออกให้ผู้เช่าพิมพ์ในแชท LINE ของหอ · ใช้ได้ครั้งเดียว",
    schema: z.number().int().min(1).max(30), defaults: { _fallback: 30 }, chain: U,
  }),
  def({
    key: "rooms.notify.richMenu", type: "bool", labelTh: "ตั้งเมนูล่าง LINE ของหอ (บิลของฉัน · แจ้งซ่อม · ประกาศ · สัญญา · พัสดุ · ติดต่อหอ)",
    helpTh: "LINE OA ที่ใช้ร่วมกับสาขาอื่นจะไม่ถูกตั้งเมนู (กันทับเมนูของสาขาอื่น)",
    schema: z.boolean(), defaults: { _fallback: true }, chain: U,
  }),
  def({
    key: "rooms.payment.slipAutoAttach", type: "bool", labelTh: "แนบรูปสลิปที่ผู้เช่าส่งในแชทเข้าบิลค้างอัตโนมัติ",
    helpTh: "แนบเฉพาะเมื่อผู้เช่ามีบิลค้างใบเดียว · ค้างหลายใบ/หลายห้อง = ตอบลิงก์ให้แนบในบิลที่ถูกเอง · สลิปทุกใบรอพนักงาน/ระบบตรวจ",
    schema: z.boolean(), defaults: { _fallback: true }, chain: U, sensitivity: "MONEY",
  }),
  // ◂ SVC D.9
  // SVC D.17 ▸ ประกาศถึงผู้เช่า (ใบสั่ง ledger/svc-briefs/svc-brief-d.17.md §2) — กลุ่มเดิม notify ⇒ การ์ดหน้า 17 แสดงเอง ◂
  def({
    key: "rooms.notify.announceLine", type: "bool", labelTh: "ส่งประกาศทาง LINE ของหอ (ปิด = แสดงในหน้าผู้เช่าอย่างเดียว)",
    helpTh: "ส่งตามเวลาเงียบของหน่วย · ส่งถึงผู้เช่าที่สัญญายังมีผล ณ ตอนส่ง · คนละ 1 ข้อความแม้เช่าหลายห้อง",
    schema: z.boolean(), defaults: { _fallback: true }, chain: U,
  }),
  def({
    key: "rooms.notify.announcePortalDays", type: "days", labelTh: "แสดงประกาศในหน้าผู้เช่าย้อนหลัง (วัน)",
    helpTh: "ผู้เช่าเห็นเฉพาะประกาศที่เผยแพร่ตั้งแต่วันเข้าอยู่ของสัญญาตัวเอง",
    schema: z.number().int().min(1).max(365), defaults: { _fallback: 30 }, chain: U,
  }),
  // ◂ SVC D.17
  def({
    key: "rooms.lease.terminationNoticeDays", type: "days", labelTh: "หนังสือบอกเลิกสัญญามีผลหลังวันออก (วัน)",
    helpTh: `${PENDING}ป.พ.พ. ม.560 บอกกล่าวล่วงหน้าไม่น้อยกว่า 15 วัน`,
    schema: z.number().int().min(15).max(180), defaults: { _fallback: 30 }, chain: U,
  }),
  tpl("rooms.msg.terminationNotice", "หนังสือบอกเลิกสัญญาเช่า (พิมพ์)",
    ["tenantName", "roomNo", "unitName", "landlordName", "overdueAmount", "overduePeriods", "noticeDate", "effectiveDate"],
    "หนังสือบอกเลิกสัญญาเช่า\n\nวันที่ {noticeDate}\n\nเรียน คุณ{tenantName} ผู้เช่าห้อง {roomNo} {unitName}\n\nตามที่ท่านมีค่าเช่าและค่าใช้จ่ายค้างชำระงวด {overduePeriods} รวมเป็นเงิน {overdueAmount} ซึ่งเลยกำหนดชำระแล้ว และผู้ให้เช่าได้แจ้งติดตามแล้ว ผู้ให้เช่าขอแจ้งบอกเลิกสัญญาเช่าห้อง {roomNo} โดยให้มีผลในวันที่ {effectiveDate}\n\nหากท่านชำระยอดค้างครบถ้วนก่อนวันดังกล่าว หรือประสงค์ตกลงแนวทางชำระ โปรดติดต่อผู้ให้เช่าที่สำนักงานหอพัก\n\nขอแสดงความนับถือ\n{landlordName}",
    "Notice of lease termination\n\nDate: {noticeDate}\n\nDear {tenantName}, tenant of room {roomNo}, {unitName}\n\nRent and charges for {overduePeriods} totalling {overdueAmount} remain unpaid after the due date despite our follow-up. The landlord hereby gives notice that the lease of room {roomNo} will end on {effectiveDate}.\n\nIf the balance is paid in full before that date, or you wish to agree a payment plan, please contact the dormitory office.\n\nSincerely,\n{landlordName}"),
  // ◂ SVC D.11

  // ── ค่าบริการอื่น (#40–41) ──
  def({
    key: "rooms.services.catalog", type: "table", labelTh: "รายการค่าบริการอื่น", // #40
    helpTh: "ล็อกในสัญญา · เพิ่มระหว่างสัญญาต้องผู้เช่ายินยอม",
    schema: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z0-9_]{1,24}$/),
            labelTh: z.string().min(1).max(80),
            amountSatang: MONEY,
            required: z.boolean(),
            taxKind: TAX_KIND,
          })
          .strict(),
      )
      .max(50)
      .refine((a) => new Set(a.map((x) => x.code)).size === a.length, { message: "รหัสค่าบริการซ้ำ" }),
    defaults: { _fallback: [] }, chain: U_RT_R_L, sensitivity: "MONEY",
  }),
  def({ key: "rooms.services.extraOccupantFee", type: "money", labelTh: "ค่าคนพักเพิ่ม (ต่อคน/เดือน)", schema: MONEY_OR_NULL, defaults: { _fallback: null }, chain: U_RT, sensitivity: "MONEY" }), // #41

  // ── สัญญา · เงินประกัน · ย้ายออก (#42–52) ──
  def({
    key: "rooms.lease.defaultMonths", type: "int", labelTh: "ระยะสัญญาเริ่มต้น (เดือน)", // #42
    helpTh: "สัญญาสั้น ≤ 3 ปี · ยาว ≤ 30 ปี",
    schema: z.number().int().min(1).max(TH_RENTAL_2568_PARAMS.longLeaseMaxMonths.value), defaults: { _fallback: 12 }, chain: U,
  }),
  def({
    key: "rooms.deposit.months", type: "int", labelTh: "เงินประกัน (เดือน)", // #43
    helpTh: "ประกัน + ล่วงหน้า ≤ 3 เดือน (สัญญาสั้น) · ≤ 1 ปี (สัญญายาว)",
    schema: z.number().int().min(0).max(12), defaults: { _fallback: 2, SERVICED_APT: 1 }, chain: U_RT_L, sensitivity: "MONEY",
    legal: ["DEPOSIT_ADVANCE_MONTHS_LIMIT"], legalInput: depositAdvanceInput("deposit"),
  }),
  def({
    key: "rooms.lease.advanceMonths", type: "int", labelTh: "ค่าเช่าล่วงหน้า (เดือน)", // #44
    helpTh: "นับรวมในเพดานเงินประกัน",
    schema: z.number().int().min(0).max(12), defaults: { _fallback: 0, SERVICED_APT: 1 }, chain: U_L, sensitivity: "MONEY",
    legal: ["DEPOSIT_ADVANCE_MONTHS_LIMIT"], legalInput: depositAdvanceInput("advance"),
  }),
  def({
    key: "rooms.lease.reservationMonths", type: "int", labelTh: "เงินจองก่อนเข้า (เดือนของค่าห้อง)", // #45
    schema: z.number().int().min(0).max(3), defaults: { _fallback: 1 }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.lease.reservationAppliesTo", type: "enum", labelTh: "เงินจองหักเข้า", // #45
    schema: z.enum(["DEPOSIT", "FIRST_RENT"]), defaults: { _fallback: "DEPOSIT" }, chain: U,
  }),
  def({ key: "rooms.moveout.noticeDays", type: "days", labelTh: "แจ้งย้ายออกล่วงหน้า (วัน)", schema: z.number().int().min(0).max(180), defaults: { _fallback: 30 }, chain: U_L }), // #46
  def({
    key: "rooms.deposit.returnDays", type: "days", labelTh: "คืนเงินประกันภายใน (วัน)", // #47
    helpTh: `${PENDING}วันปฏิทินหรือวันทำการ · บางแหล่งว่า 14 วันถ้ามีหัก`,
    schema: z.number().int().min(0).max(90), defaults: { _fallback: 7 }, chain: U,
    legal: ["DEPOSIT_RETURN_DAYS"],
  }),
  def({
    key: "rooms.deposit.approvalThreshold", type: "money", labelTh: "วงเงินหักประกันที่ต้องอนุมัติ", // #48
    schema: MONEY, defaults: { _fallback: 200_000 }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.deposit.damageCatalog", type: "table", labelTh: "รายการค่าเสียหายมาตรฐาน", // #49
    helpTh: "หักได้ต้องแนบหลักฐาน · ห้ามหักค่าเสื่อมปกติ (ตรวจต่อรายการที่ D.12 ด้วย DEDUCTION_EVIDENCE)",
    schema: z.array(z.object({ code: z.string().regex(/^[A-Z0-9_]{1,24}$/), labelTh: z.string().min(1).max(80), amountSatang: MONEY }).strict()).max(100),
    defaults: { _fallback: [] }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.lease.contractTemplate", group: "lease", type: "template", labelTh: "แม่แบบสัญญาเช่า", // #50
    helpTh: "ข้อบังคับตามประกาศ 2568 ระบบแทรกเองที่ {mandatoryClauses} ลบ/แก้ไม่ได้ · ข้อห้ามเพิ่มไม่ได้",
    schema: TEXT_TPL,
    defaults: {
      _fallback: {
        th: "สัญญาเช่าห้องพักเลขที่ {leaseNo}\nทำที่ {unitName} วันที่ {signDate}\nผู้ให้เช่า {landlordName} ผู้เช่า {tenantName} ห้อง {roomNo}\nระยะเวลา {startDate} ถึง {endDate} ค่าเช่าเดือนละ {rent}\n\n{mandatoryClauses}\n\n{extraClauses}",
        en: "Room lease no. {leaseNo}\nMade at {unitName} on {signDate}\nLandlord {landlordName} Tenant {tenantName} Room {roomNo}\nTerm {startDate} to {endDate}, rent {rent} per month\n\n{mandatoryClauses}\n\n{extraClauses}",
      },
    },
    chain: U,
    legal: ["TEMPLATE_NO_THREAT", "CONTRACT_MANDATORY_CLAUSES"],
    // ข้อบังคับครบ/ตรงตัวตรวจตอนออกสัญญา (D.5) — ที่นี่ตรวจคำต้องห้ามอย่างเดียว
    legalInput: atCostPoint("CONTRACT_MANDATORY_CLAUSES"),
    templateVars: ["leaseNo", "unitName", "signDate", "landlordName", "tenantName", "roomNo", "startDate", "endDate", "rent", "mandatoryClauses", "extraClauses"],
  }),
  def({
    key: "rooms.lease.extraClauses", type: "table", labelTh: "ข้อสัญญาเพิ่มเติมของหอ", // #50
    helpTh: "ข้อห้ามตามประกาศ (ข่มขู่/ตัดน้ำไฟ/ล็อกห้อง/ยึดของ) เพิ่มไม่ได้",
    schema: z.array(z.object({ id: z.string().min(1).max(40), textTh: z.string().min(1).max(4000), textEn: z.string().max(4000).optional() }).strict()).max(50),
    defaults: { _fallback: [] }, chain: U,
    legal: ["TEMPLATE_NO_THREAT"],
    legalInput: (v) => ({
      TEMPLATE_NO_THREAT: {
        text: Array.isArray(v) ? v.map((c) => (c && typeof c === "object" ? [(c as { textTh?: unknown }).textTh, (c as { textEn?: unknown }).textEn].filter((s) => typeof s === "string").join("\n") : "")).join("\n") : "",
      },
    }),
  }),
  def({ key: "rooms.lease.signMethod", type: "enum", labelTh: "วิธีลงชื่อสัญญา", schema: z.enum(["ON_SCREEN", "PAPER"]), defaults: { _fallback: "ON_SCREEN" }, chain: U }), // #51
  def({
    key: "rooms.lease.moveInPhotosMin", type: "int", labelTh: "รูปห้องวันเข้าอย่างน้อย (รูป)", // #52
    helpTh: "หลักฐานตอนย้ายออก", schema: z.number().int().min(0).max(50), defaults: { _fallback: 6 }, chain: U,
  }),

  // ── รับเงิน (#58 · #53–57 อยู่ defs/payments.ts) ──
  def({
    key: "rooms.payment.partial", type: "enum", labelTh: "รับชำระบางส่วน", // #58
    schema: z.enum(["ALLOW_CARRY_FORWARD", "DENY"]), defaults: { _fallback: "ALLOW_CARRY_FORWARD" }, chain: U, sensitivity: "MONEY",
  }),
  // SVC D.10 ▸ ตรวจสลิป/รับเงินหอ (ใบสั่ง ledger/svc-briefs/svc-brief-d.10.md §2) ◂
  def({
    key: "rooms.payment.afterPaidSlip", type: "enum", labelTh: "สลิปที่อนุมัติหลังบิลจ่ายครบแล้ว",
    helpTh: "พักให้พนักงานตัดสิน = ยังไม่ลงบัญชีจนกว่าจะเลือกเก็บเป็นเงินรับล่วงหน้าหรือคืนเงิน · เก็บเป็นเงินรับล่วงหน้า = ลงบัญชีทันที ไม่ใช่รายได้",
    schema: z.enum(["REVIEW", "CREDIT"]), defaults: { _fallback: "REVIEW" }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.payment.notifyReceipt", type: "bool", labelTh: "ส่งใบเสร็จให้ผู้เช่าทาง LINE อัตโนมัติเมื่อรับเงิน",
    schema: z.boolean(), defaults: { _fallback: true }, chain: U,
  }),
  def({
    key: "rooms.payment.chatSlipKeepDays", type: "days", labelTh: "เก็บรูปสลิปจากแชทที่ยังไม่แนบบิล (วัน)",
    helpTh: "เก็บเฉพาะรูปจากผู้เช่าที่มีบิลค้างหลายใบ ให้พนักงานเลือกบิลเอง · เกินกำหนดระบบลบรูปให้",
    schema: z.number().int().min(1).max(90), defaults: { _fallback: 30 }, chain: U,
  }),
  tpl("rooms.msg.slipRejected", "ข้อความแจ้งสลิปไม่ผ่าน", ["tenantName", "roomNo", "unitName", "amount", "reason", "payLink"],
    "เรียนคุณ{tenantName} สลิปห้อง {roomNo} ยอด {amount} ยังไม่ผ่านการตรวจ เนื่องจาก {reason} รบกวนชำระหรือแนบสลิปใหม่ที่ {payLink} ขอบคุณค่ะ — {unitName}",
    "Dear {tenantName}, the slip for room {roomNo} ({amount}) could not be accepted: {reason}. Please pay or attach a new slip at {payLink}. Thank you — {unitName}"),
  tpl("rooms.msg.payMore", "ข้อความขอให้โอนเพิ่ม", ["tenantName", "roomNo", "unitName", "amount", "payLink"],
    "เรียนคุณ{tenantName} ได้รับเงินห้อง {roomNo} แล้ว ยังขาดอีก {amount} รบกวนโอนเพิ่มที่ {payLink} ขอบคุณค่ะ — {unitName}",
    "Dear {tenantName}, we received your payment for room {roomNo}. {amount} is still due. Please pay the balance at {payLink}. Thank you — {unitName}"),

  // ── ซ่อม · ประกาศ · พัสดุ (#59–62) ──
  def({
    key: "rooms.repair.categories", type: "table", labelTh: "หมวดแจ้งซ่อม → บอร์ดงาน", // #59
    schema: z
      .array(z.object({ code: z.string().regex(/^[A-Z0-9_]{1,24}$/), labelTh: z.string().min(1).max(60), board: z.string().min(1).max(80), assigneeId: z.string().max(64).nullable().optional() }).strict())
      .min(1)
      .max(30),
    defaults: {
      _fallback: [
        { code: "ELECTRIC", labelTh: "ไฟฟ้า", board: "ซ่อมหอ" },
        { code: "PLUMBING", labelTh: "ประปา", board: "ซ่อมหอ" },
        { code: "AIRCON", labelTh: "แอร์", board: "ซ่อมหอ" },
        { code: "FURNITURE", labelTh: "เฟอร์นิเจอร์", board: "ซ่อมหอ" },
        { code: "DOOR_LOCK", labelTh: "ประตู/กุญแจ", board: "ซ่อมหอ" },
        { code: "OTHER", labelTh: "อื่น ๆ", board: "ซ่อมหอ" },
      ],
    },
    chain: U,
  }),
  def({
    key: "rooms.repair.payer", type: "table", labelTh: "ใครจ่ายค่าซ่อม (ต่อหมวด)", // #60
    helpTh: "เรียกเก็บผู้เช่าต้องมีหลักฐานความเสียหาย · หมวดที่ไม่ระบุ = ใช้ค่า _default",
    schema: z.record(z.string().regex(/^(_default|[A-Z0-9_]{1,24})$/), z.enum(["DORM", "TENANT"])),
    defaults: { _fallback: { _default: "DORM" } }, chain: U, sensitivity: "MONEY",
  }),
  def({
    key: "rooms.access.roomEntry", type: "enum", labelTh: "เข้าห้องตอนผู้เช่าไม่อยู่", // #61
    helpTh: "ห้ามเข้าโดยไม่ได้รับอนุญาต ยกเว้นฉุกเฉิน (บันทึกเหตุผล)",
    schema: z.enum(["PERMISSION_EACH_TIME", "STANDING_PERMISSION"]), defaults: { _fallback: "PERMISSION_EACH_TIME" }, chain: R_L,
  }),
  def({ key: "rooms.parcel.enabled", type: "bool", labelTh: "เปิดระบบพัสดุ", schema: z.boolean(), defaults: { _fallback: false }, chain: U }), // #62
  def({ key: "rooms.parcel.holdDays", type: "days", labelTh: "เก็บพัสดุได้กี่วัน", schema: z.number().int().min(1).max(90), defaults: { _fallback: 14 }, chain: U }), // #62

  // ── สิทธิ์ (#64 · #63 = core/permissions) ──
  def({
    key: "rooms.access.managerScope", type: "enum", labelTh: "ผู้ดูแลเห็นข้อมูล", // #64
    schema: z.enum(["UNIT", "BUILDING"]), defaults: { _fallback: "UNIT" }, chain: U_B, ownerOnly: true,
  }),
  def({
    key: "rooms.access.buildingAssignments", type: "table", labelTh: "อาคารที่ผู้ดูแลแต่ละคนเห็น", // #64 · SVC D.13
    helpTh: "ใช้เมื่อ \"ผู้ดูแลเห็นข้อมูล\" = เฉพาะอาคารที่ดูแล · ไม่มีรายชื่อ = ไม่เห็นห้องใด (เจ้าของเห็นทั้งหอเสมอ)",
    schema: z.record(z.string().min(1).max(64), z.array(z.string().min(1).max(64)).max(50)).refine((v) => Object.keys(v).length <= 500),
    defaults: { _fallback: {} }, chain: U, ownerOnly: true,
  }),

  // ══ โรงแรม (#65–78) — ซ่อนจนเฟส H ══
  hotel({ key: "rooms.hotel.checkInTime", type: "time", labelTh: "เวลาเช็กอิน", schema: HHMM, defaults: { _fallback: "14:00" }, chain: U_RT }), // #65
  hotel({ key: "rooms.hotel.checkOutTime", type: "time", labelTh: "เวลาเช็กเอาต์", schema: HHMM, defaults: { _fallback: "12:00" }, chain: U_RT }), // #65
  hotel({ key: "rooms.hotel.holdMinutesOnline", type: "minutes", labelTh: "ถือห้องรอมัดจำ (จองออนไลน์)", schema: z.number().int().min(1).max(10_080), defaults: { _fallback: 15 }, chain: U }), // #66
  hotel({ key: "rooms.hotel.holdMinutesCounter", type: "minutes", labelTh: "ถือห้องรอมัดจำ (หน้าเคาน์เตอร์)", schema: z.number().int().min(1).max(10_080), defaults: { _fallback: 1440 }, chain: U }), // #66
  hotel({
    key: "rooms.hotel.deposit", type: "table", labelTh: "มัดจำการจอง", // #67
    schema: z.object({ kind: z.enum(["NONE", "FIRST_NIGHT", "FULL", "PERCENT"]), percentBp: z.number().int().min(0).max(10_000).optional() }).strict(),
    defaults: { _fallback: { kind: "FIRST_NIGHT" } }, chain: U_RP, sensitivity: "MONEY",
  }),
  hotel({
    key: "rooms.hotel.cancelPolicy", type: "table", labelTh: "นโยบายยกเลิก (ขั้นบันได)", // #68
    schema: z.array(z.object({ daysBefore: z.number().int().min(0).max(365), refundBp: z.number().int().min(0).max(10_000) }).strict()).min(1).max(10),
    defaults: { _fallback: [{ daysBefore: 3, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }] }, chain: RP, sensitivity: "MONEY",
  }),
  hotel({
    key: "rooms.hotel.noShow", type: "enum", labelTh: "ไม่มาเข้าพัก", // #69
    schema: z.enum(["FORFEIT_RELEASE_AFTER_AUDIT", "FORFEIT_HOLD_STAY", "REFUND_RELEASE"]), defaults: { _fallback: "FORFEIT_RELEASE_AFTER_AUDIT" }, chain: U,
  }),
  hotel({
    key: "rooms.hotel.securityDeposit", type: "money", labelTh: "เงินประกันห้อง (โรงแรม)", // #70
    helpTh: "เป็นเงินรับฝาก ไม่ใช่รายได้", schema: MONEY, defaults: { _fallback: 100_000 }, chain: U_RT, sensitivity: "MONEY",
  }),
  hotel({ key: "rooms.hotel.baseRate", type: "money", labelTh: "ราคาฐานต่อคืน", schema: MONEY_OR_NULL, defaults: { _fallback: null }, chain: RT_RP, sensitivity: "MONEY" }), // #71
  hotel({
    key: "rooms.hotel.dayOfWeekAdjustBp", type: "table", labelTh: "ปรับราคาตามวันในสัปดาห์ (bp · 0=อาทิตย์)", // #71 (ฤดู/วันหยุด/แก้มือรายวัน = ตาราง H.0)
    schema: z.array(z.number().int().min(-10_000).max(100_000)).length(7),
    defaults: { _fallback: [0, 0, 0, 0, 0, 0, 0] }, chain: RT_RP, sensitivity: "MONEY",
  }),
  hotel({
    key: "rooms.hotel.defaultRatePlan", type: "text", labelTh: "แผนราคาเริ่มต้น", // #72
    helpTh: "แผน + สูตรอยู่ตาราง HotelRatePlan (H.0)", schema: z.string().min(1).max(40), defaults: { _fallback: "STANDARD" }, chain: U,
  }),
  hotel({ key: "rooms.hotel.minNights", type: "int", labelTh: "ขั้นต่ำคืน", schema: z.number().int().min(1).max(365).nullable(), defaults: { _fallback: null }, chain: RP }), // #73
  hotel({ key: "rooms.hotel.closedToArrival", type: "bool", labelTh: "ปิดขายวันเข้า", schema: z.boolean(), defaults: { _fallback: false }, chain: RP }), // #73
  hotel({
    key: "rooms.hotel.housekeepingChecklist", type: "table", labelTh: "เช็กลิสต์แม่บ้าน", // #74
    schema: z.array(z.string().min(1).max(120)).max(60),
    defaults: { _fallback: ["เปลี่ยนผ้าปูที่นอนและปลอกหมอน", "เปลี่ยนผ้าเช็ดตัว", "ทำความสะอาดห้องน้ำ", "เติมของใช้ในห้องน้ำ", "ดูดฝุ่น/ถูพื้น", "ตรวจมินิบาร์", "ตรวจอุปกรณ์ไฟฟ้า/แอร์", "เก็บขยะ"] },
    chain: RT,
  }),
  hotel({
    key: "rooms.hotel.minibar", type: "table", labelTh: "รายการมินิบาร์ (สินค้า POS)", // #75
    schema: z.array(z.object({ productId: z.string().min(1).max(64), priceSatang: MONEY.optional() }).strict()).max(100),
    defaults: { _fallback: [] }, chain: U, sensitivity: "MONEY",
  }),
  hotel({ key: "rooms.hotel.nightAuditTime", type: "time", labelTh: "เวลา night audit", schema: HHMM, defaults: { _fallback: "03:00" }, chain: U }), // #76
  hotel({
    key: "rooms.hotel.tm30ReminderHours", type: "int", labelTh: "เตือนแจ้ง ตม.30 ก่อนครบ 24 ชม. (ชม.)", // #77
    helpTh: "พ.ร.บ.คนเข้าเมือง ม.38", schema: z.number().int().min(1).max(23), defaults: { _fallback: 6 }, chain: U,
  }),
  hotel({ key: "rooms.hotel.rr3OnScreen", type: "bool", labelTh: "ร.ร.3 ลงชื่อบนจอ", helpTh: "พ.ร.บ.โรงแรม 2547", schema: z.boolean(), defaults: { _fallback: true }, chain: U }), // #78

  // ══ ช่องทาง OTA (#79–82) — ซ่อนจนเฟส H ══
  hotel({ key: "rooms.hotel.ota.enabled", group: "ota", type: "bool", labelTh: "เปิดตัวต่อช่องทาง OTA", schema: z.boolean(), defaults: { _fallback: false }, chain: U_RT, requires: { integration: "OTA" } }), // #79
  hotel({
    key: "rooms.hotel.ota.roomScope", group: "ota", type: "enum", labelTh: "ห้องที่ส่งขายช่องทาง", // #79
    schema: z.enum(["ALL_NIGHTLY", "SELECTED"]), defaults: { _fallback: "ALL_NIGHTLY" }, chain: U_RT,
  }),
  hotel({ key: "rooms.hotel.ota.buffer", group: "ota", type: "int", labelTh: "กันห้องไม่ส่งช่องทาง (ห้อง)", schema: z.number().int().min(0).max(1000), defaults: { _fallback: 0 }, chain: RT }), // #80
  hotel({
    key: "rooms.hotel.ota.markupBp", group: "ota", type: "percent", labelTh: "ราคาส่ง OTA เพิ่มจากมาตรฐาน (bp)", // #81
    schema: z.number().int().min(-10_000).max(100_000), defaults: { _fallback: 1500 }, chain: RP, sensitivity: "MONEY",
  }),
  hotel({
    key: "rooms.hotel.ota.onConflict", group: "ota", type: "enum", labelTh: "เมื่อการจองจากช่องทางชนห้อง", // #82
    schema: z.enum(["QUEUE_REASSIGN_NOTIFY"]), defaults: { _fallback: "QUEUE_REASSIGN_NOTIFY" }, chain: U,
  }),
];

// ─────────────────── แม่แบบ 4 ประเภทกิจการ ───────────────────
const ROOM_TEMPLATES: readonly TemplateDef[] = [
  { key: "APARTMENT", version: 1, labelTh: "อพาร์ตเมนต์/ห้องเช่า" },
  { key: "STUDENT_DORM", version: 1, labelTh: "หอพักนักศึกษา" },
  { key: "SMALL_HOTEL", version: 1, labelTh: "โรงแรมขนาดเล็ก" },
  { key: "SERVICED_APT", version: 1, labelTh: "เซอร์วิสอพาร์ตเมนต์" },
];

// ─────────────────── คีย์ที่เอกสารจด (CC §1.6) ───────────────────
const SNAPSHOTS: Record<string, readonly string[]> = {
  /** สัญญา (D.5) — ค่าที่ "ล็อกในสัญญา" */
  lease: [
    "rooms.legal.mode",
    "rooms.rent.monthly",
    "rooms.services.catalog",
    "rooms.services.extraOccupantFee",
    "rooms.lateFee.kind",
    "rooms.lateFee.amount",
    "rooms.lateFee.percentBp",
    "rooms.lateFee.capPerBill",
    "rooms.lateFee.graceDays",
    "rooms.deposit.months",
    "rooms.lease.advanceMonths",
    "rooms.lease.defaultMonths",
    "rooms.billing.dueDay",
    "rooms.billing.prorate",
    "rooms.moveout.noticeDays",
    "rooms.deposit.returnDays",
    "rooms.tax.withholdingCorporateBp",
    "rooms.locale.docLanguage",
    // SVC D.5 ▸ แม่แบบ/ข้อเพิ่มที่ใช้ render สัญญา · รูปห้องวันเข้าขั้นต่ำ (moveIn อ่านจาก snapshot) · เงินจองหักเข้าอะไร ◂
    "rooms.lease.contractTemplate",
    "rooms.lease.extraClauses",
    "rooms.lease.moveInPhotosMin",
    "rooms.lease.reservationAppliesTo",
    // SVC D.5 (ชุดแก้ K7) ▸ วิธีลงชื่อที่ล็อกในสัญญา (signLease ไม่ส่ง method = ค่านี้ของ snapshot) ◂
    "rooms.lease.signMethod",
  ],
  /** บิลรายเดือน (D.8) — วิธีคิดน้ำไฟ + ภาษี ณ ตอนออก */
  bill: [
    "rooms.legal.mode",
    "rooms.money.rounding",
    "rooms.utility.elec.method",
    "rooms.utility.water.method",
    "rooms.utility.elec.fixedRate",
    "rooms.utility.water.fixedRate",
    "rooms.utility.elec.flat",
    "rooms.utility.water.flat",
    "rooms.utility.minimum",
    "rooms.utility.sharedBasis",
    "rooms.vat.registered",
    "rooms.vat.pricesIncludeVat",
    "rooms.vat.taxKinds",
    "rooms.billing.rentTiming",
    "rooms.billing.utilityTiming",
    "rooms.billing.prorate",
    "rooms.utility.elec.tariffRef", // SVC D.7
    "rooms.utility.water.tariffRef", // SVC D.7
  ],
};

// ─────────────────── ตรวจข้ามค่าในกลุ่ม ───────────────────
const GROUP_RULES: readonly GroupRule[] = [
  {
    group: "legal",
    check: (v) =>
      v["rooms.legal.mode"] === "OUT_OF_SCOPE" && !isValidOutOfScopeReason(v["rooms.legal.outOfScopeReason"] as string | null | undefined)
        ? [{ key: "rooms.legal.outOfScopeReason", code: "OUT_OF_SCOPE_REASON_REQUIRED", messageTh: "เลือกนอกขอบเขตประกาศต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร" }]
        : [],
  },
  {
    group: "lateFee",
    check: (v) => {
      const kind = v["rooms.lateFee.kind"];
      if (kind === "PERCENT" && typeof v["rooms.lateFee.percentBp"] !== "number")
        return [{ key: "rooms.lateFee.percentBp", code: "LATE_FEE_PERCENT_REQUIRED", messageTh: "ค่าปรับแบบเปอร์เซ็นต์ต้องกรอกอัตรา" }];
      return [];
    },
  },
];

/** ค่าที่รอที่ปรึกษากฎหมายตรวจ — ป้ายบน UI เท่านั้น (ห้ามใช้ในตรรกะ) */
export const PENDING_LEGAL_REVIEW_KEYS: readonly string[] = [
  "rooms.utility.elec.method",
  "rooms.utility.water.method",
  "rooms.tax.withholdingCorporateBp",
  "rooms.vat.reissueDate", // SVC D.3
  "rooms.lateFee.kind",
  "rooms.lateFee.amount",
  "rooms.lateFee.capPerBill",
  "rooms.deposit.returnDays",
  "rooms.lateFee.guardRentBp", // SVC D.11
  "rooms.lease.terminationNoticeDays", // SVC D.11
];

/** แถวภาคผนวก ก ที่ไม่นิยามใน rooms (เจ้าของคือชิ้นอื่น) */
export const SKIPPED_ANNEX_ROWS: Readonly<Record<string, string>> = {
  "#30": "เลขที่เอกสาร = ตั้งค่าเลขที่ของบัญชี V2 (account) — ไม่ซ้ำที่นี่",
  "#39": "เวลาเงียบ = messaging.quietHours (defs/messaging.ts · ค่าเริ่ม 21:00–08:00 เท่ากัน)",
  "#53": "payments.receiver (defs/payments.ts)",
  "#54": "payments.slip.autoApprove (defs/payments.ts)",
  "#55": "payments.slip.toleranceSatang (defs/payments.ts)",
  "#56": "payments.slip.payerNameMatch (defs/payments.ts)",
  "#57": "payments.slip.onVerifierDown (defs/payments.ts)",
  "#63": "บทบาท × สิทธิ์ = core/permissions + หน้าสิทธิ์พนักงาน (D.13) ไม่ใช่ค่าตั้ง",
  "#83": "ศูนย์เชื่อมต่อ = TenantIntegration (R0.5) คีย์เข้ารหัส ไม่ใช่ค่าตั้ง",
};


// ─────────────────── ป้ายไทย (R0.4 · หน้าตั้งค่าไม่แสดงค่าดิบ) ───────────────────
/** ป้ายกลุ่ม (group = ส่วนที่ 2 ของคีย์) — ต้องมีอักษรไทยและไม่ซ้ำกันใน domain */
const GROUP_LABELS_TH: Record<string, string> = {
  general: "ประเภทกิจการ",
  legal: "โหมดตามกฎหมาย",
  money: "การปัดเศษเงิน",
  locale: "ภาษา",
  rent: "ค่าเช่าห้อง",
  utility: "ค่าน้ำ ค่าไฟ",
  meter: "การจดมิเตอร์",
  vat: "ภาษีมูลค่าเพิ่ม",
  tax: "หัก ณ ที่จ่าย",
  billing: "การออกบิล",
  lateFee: "ค่าปรับชำระล่าช้า",
  notify: "เตือนและทวงค่าเช่า",
  msg: "แม่แบบข้อความ",
  services: "ค่าบริการอื่น",
  lease: "สัญญาเช่า",
  deposit: "เงินประกันและเงินจอง",
  moveout: "การย้ายออก",
  payment: "การรับชำระเงิน",
  repair: "แจ้งซ่อม",
  access: "การเข้าห้องและสิทธิ์ดูข้อมูล",
  parcel: "พัสดุ",
  hotel: "โรงแรม",
  ota: "ช่องทางขายห้อง (OTA)",
};

/** ป้ายตัวเลือกของ def ชนิด enum ที่แสดงในหน้า (ค่าโรงแรมซ่อนอยู่ ไม่ต้องมี) */
const ENUM_LABELS_TH: Record<string, Record<string, string>> = {
  "rooms.vat.reissueDate": { ORIGINAL: "ลงวันที่เดียวกับฉบับเดิม", REISSUE_DAY: "ลงวันที่ออกฉบับใหม่" }, // SVC D.3 (ปิดหนี้ r0.4 R-3)
  "rooms.general.businessType": { APARTMENT: "อพาร์ตเมนต์/หอพักทั่วไป", STUDENT_DORM: "หอพักนักศึกษา", SMALL_HOTEL: "โรงแรมขนาดเล็ก", SERVICED_APT: "เซอร์วิสอพาร์ตเมนต์" },
  "rooms.legal.mode": { STRICT: "เข้มงวด (บล็อกค่าที่ผิดกฎหมาย)", WARN: "เตือน (ยืนยันพร้อมเหตุผลแล้วบันทึกได้)", OUT_OF_SCOPE: "นอกขอบเขตประกาศ (ต้องมีเหตุผลและหลักฐาน)" },
  "rooms.money.rounding": { SATANG: "ไม่ปัด (เก็บสตางค์)", BAHT_HALF_UP: "ปัดเป็นบาท (ครึ่งขึ้น)", BAHT_DOWN: "ปัดเศษทิ้งเป็นบาท" },
  "rooms.locale.docLanguage": { th: "ภาษาไทย", en: "ภาษาอังกฤษ" },
  "rooms.rent.mode": { MONTHLY: "รายเดือน", NIGHTLY: "รายคืน", BOTH: "ทั้งรายเดือนและรายคืน" },
  "rooms.utility.elec.metering": { ROOM_METER: "มิเตอร์ประจำห้อง", SHARED_METER: "มิเตอร์รวม", NONE: "ไม่คิดตามมิเตอร์" },
  "rooms.utility.water.metering": { ROOM_METER: "มิเตอร์ประจำห้อง", SHARED_METER: "มิเตอร์รวม", NONE: "ไม่คิดตามมิเตอร์" },
  "rooms.utility.elec.method": { ACTUAL_COST: "ตามต้นทุนจริง", TARIFF: "ตามอัตราการไฟฟ้า", FIXED_RATE: "อัตราคงที่ต่อหน่วย", FLAT: "เหมาจ่าย" },
  "rooms.utility.water.method": { ACTUAL_COST: "ตามต้นทุนจริง", TARIFF: "ตามอัตราการประปา", FIXED_RATE: "อัตราคงที่ต่อหน่วย", FLAT: "เหมาจ่าย" },
  "rooms.utility.sharedBasis": { PERSON: "ตามจำนวนคน", ROOM: "ตามจำนวนห้อง", AREA: "ตามพื้นที่ห้อง" },
  "rooms.meter.requirePhoto": { NONE: "ไม่บังคับ", ELEC: "บังคับเฉพาะมิเตอร์ไฟ", BOTH: "บังคับทั้งไฟและน้ำ" },
  "rooms.billing.rentTiming": { ADVANCE: "เก็บล่วงหน้า", ARREARS: "เก็บย้อนหลัง" },
  "rooms.billing.utilityTiming": { ARREARS: "เก็บย้อนหลัง (เดือนถัดไป)", SAME_MONTH: "เก็บพร้อมค่าห้องเดือนเดียวกัน" },
  "rooms.billing.prorate": { ACTUAL_DAYS: "ตามจำนวนวันจริงของเดือน", DIV_30: "หาร 30 วัน", FULL_MONTH: "คิดเต็มเดือน" },
  "rooms.lateFee.kind": { NONE: "ไม่คิดค่าปรับ", PER_DAY: "คิดเป็นรายวัน", ONCE: "คิดครั้งเดียว", PERCENT: "คิดเป็นเปอร์เซ็นต์" },
  "rooms.lateFee.waiverApproval": { OWNER_APPROVAL: "ผู้จัดการขอ เจ้าของอนุมัติ", MANAGER_DIRECT: "ผู้จัดการยกเว้นได้เลย", OWNER_ONLY: "เจ้าของยกเว้นได้คนเดียว" },
  "rooms.lease.reservationAppliesTo": { DEPOSIT: "หักเข้าเงินประกัน", FIRST_RENT: "หักเข้าค่าเช่างวดแรก" },
  "rooms.lease.signMethod": { ON_SCREEN: "เซ็นบนหน้าจอ", PAPER: "เซ็นบนกระดาษ" },
  "rooms.payment.partial": { ALLOW_CARRY_FORWARD: "รับได้ ยอดค้างยกไปงวดถัดไป", DENY: "ไม่รับ ต้องจ่ายเต็มจำนวน" },
  "rooms.payment.afterPaidSlip": { REVIEW: "พักให้พนักงานตัดสิน", CREDIT: "เก็บเป็นเงินรับล่วงหน้า" }, // SVC D.10 ◂
  "rooms.access.roomEntry": { PERMISSION_EACH_TIME: "ขออนุญาตทุกครั้ง", STANDING_PERMISSION: "ขออนุญาตไว้ล่วงหน้าในสัญญา" },
  "rooms.access.managerScope": { UNIT: "ทั้งหอ", BUILDING: "เฉพาะอาคารที่ดูแล" },
};

// SVC D.4 ▸ เพดานนำเข้า Excel/CSV (X6) + หน้าต่างย้อนกลับ — ledger/svc-briefs/svc-brief-d.4.md §2.3 (อ่านสดทุกคำขอ · ชั้นหน่วย)
//   group "lease" (การ์ด 5 "เงินประกัน · สัญญา" ของหน้า 17) — ไม่เปิดกลุ่มใหม่ เพื่อให้หน้า 17 ครอบทุกช่อง UNIT ตามสัญญา D.13 (R-7)
DEFS.push(
  def({
    key: "rooms.import.maxRows", group: "lease", type: "int", labelTh: "นำเข้าจากไฟล์: จำนวนแถวสูงสุดต่อไฟล์",
    helpTh: "ไม่นับแถวหัวคอลัมน์ · เกินนี้ระบบไม่รับไฟล์ (แบ่งเป็นหลายไฟล์)",
    schema: z.number().int().min(10).max(5000), defaults: { _fallback: 1000 }, chain: U,
  }),
  def({
    key: "rooms.import.maxFileBytes", group: "lease", type: "int", labelTh: "นำเข้าจากไฟล์: ขนาดไฟล์สูงสุด (ไบต์)",
    helpTh: "ไฟล์ใหญ่กว่านี้ระบบไม่รับ · ไฟล์ Excel ที่คลายแล้วใหญ่ผิดปกติถูกปฏิเสธด้วย",
    schema: z.number().int().min(10_000).max(10_000_000), defaults: { _fallback: 2_000_000 }, chain: U,
  }),
  def({
    key: "rooms.import.undoDays", group: "lease", type: "days", labelTh: "นำเข้าจากไฟล์: ย้อนกลับทั้งชุดได้ภายใน (วัน)",
    helpTh: "0 = ภายในวันที่นำเข้า (ถึง 23:59 น.) · ย้อนกลับได้เฉพาะเมื่อยังไม่ออกบิลของสัญญาที่นำเข้า",
    schema: z.number().int().min(0).max(7), defaults: { _fallback: 0 }, chain: U, ownerOnly: true, sensitivity: "MONEY",
  }),
);
// ◂ SVC D.4

// SVC D.18 ▸ แม่แบบข้อความพัสดุ (ใบสั่ง ledger/svc-briefs/svc-brief-d.18.md §2.1) — กลุ่ม msg (การ์ด 4 ของหน้า 17 แสดงเอง · ตัวตรวจ TEMPLATE_NO_THREAT ใช้อยู่แล้ว)
const PARCEL_VARS = ["roomNo", "unitName", "carrier", "receivedDate", "pickupLink"] as const;
DEFS.push(
  tpl("rooms.msg.parcelReceived", "ข้อความแจ้งพัสดุมาถึง", PARCEL_VARS,
    "มีพัสดุถึงห้อง {roomNo} ({carrier}) รับได้ที่ {unitName} — เปิดลิงก์นี้แล้วแสดง QR ให้พนักงานตอนรับ {pickupLink}",
    "A parcel for room {roomNo} ({carrier}) is waiting at {unitName}. Open this link and show the QR code to staff when you pick it up: {pickupLink}"),
  tpl("rooms.msg.parcelReminder", "ข้อความเตือนพัสดุค้างรับ", [...PARCEL_VARS, "daysWaiting"],
    "พัสดุของห้อง {roomNo} รอรับมา {daysWaiting} วันแล้ว รับได้ที่ {unitName} — แสดง QR ในลิงก์นี้ให้พนักงาน {pickupLink}",
    "The parcel for room {roomNo} has been waiting {daysWaiting} days at {unitName}. Show the QR code in this link to staff: {pickupLink}"),
);
// ◂ SVC D.18

const withLabels = (defs: SettingDef[]): SettingDef[] => defs.map((d) => (ENUM_LABELS_TH[d.key] ? { ...d, enumLabelsTh: ENUM_LABELS_TH[d.key] } : d));

defineSettings("rooms", withLabels(DEFS), { templates: ROOM_TEMPLATES, snapshots: SNAPSHOTS, groupRules: GROUP_RULES, groupLabelsTh: GROUP_LABELS_TH });
