// QC — TRIPS T0.1 · migration `trips` (+ `trips_enum`) · ค่าตั้งโดเมน trips (4 แม่แบบ · scope PRODUCT/DEPARTURE) · ตัวตรวจกฎหมายทัวร์ WARN เท่านั้น
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/trips-briefs/T0.1.md (ตัดสินแล้ว) · ledger/TRIPS-CORE-CONTRACT.md §A §B.0 §B.1 §C §E §K §N · ledger/TRIPS-DEFAULTS.md §1 §4 §5 ภาคผนวก ก
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฐานต่อได้ · migration ฐานล่าสุดลงแล้ว · ทะเบียนค่าตั้งเดิมโหลดได้ · ตัวตรวจหอเดิมยังมี
//   M  migration: 2 โฟลเดอร์ใหม่ (enum ก่อน) · ไฟล์ enum มีแค่ ADD VALUE · add-only · ตารางเดิมแตะแค่ AccountDocument · SQL มือครบ · schema แตะเฉพาะไฟล์ของใบ · ลงฐานแล้ว
//   E  ค่า enum ในฐาน · T  ตาราง/คอลัมน์/ชนิด/null/default · C  CHECK (ชุดค่าตรงใบสั่ง + ปฏิเสธจริง 23514) · U  unique/partial/NND/EXCLUDE (pg_indexes + พฤติกรรม)
//   X3 SellCounter: คำสั่ง §K 50 ทางพร้อมกัน = 1..50 ไม่ซ้ำ
//   S  scope.ts · Prisma client · core/sellable.ts บริสุทธิ์ · json-schemas · facade · ไม่มี any · เส้น import · ไม่แตะ POS/โรงแรม/หอ/จองคิว
//   R  ทะเบียน: doc-sync กับ TRIPS-DEFAULTS (parse ตาราง md) · ทุกคีย์ ชนิด ชั้น ค่าเริ่มต่อแม่แบบ · แม่แบบ 4 · snapshot · ป้าย · legal ต่อคีย์ · ตัวตรวจทะเบียน
//   L  th-tour-2569: 46 rule · severity · WARN ทุกทาง (property loop) · เงื่อนไขของแต่ละ rule ชั้นค่าตั้ง (ยิงตรง + ไม่ยิง)
//   RS ลำดับชั้นบนฐานจริง: แม่แบบ → ร้าน → สินค้า → รอบ · ล้างค่า = ตามชั้นบน · refsFor/entitiesOfUnit · ชั้นที่ยังไม่รองรับ
//   WS บันทึกค่าที่เตือน: ไม่รับทราบ = NEEDS_APPROVAL · รับทราบไม่ต้องมีเหตุผล · ไม่มี LEGAL_BLOCK · พนักงานไม่ต้องรออนุมัติเจ้าของ
//   X1 แยกร้าน/แยกหน่วย: ค่าตั้ง + ตารางใหม่ผ่าน tenantDb   F  ฟอร์มค่าตั้ง (ป้าย · ซ่อน · หน่วย) + ตัวช่วยฝั่ง client   G  regression qc-trips-p0.1 (ลูกโพรเซส)
//
// วิธีตรวจคีย์: **parse ตาราง markdown ของ TRIPS-DEFAULTS เพื่อได้ชุดคีย์ + ชั้น** (คอลัมน์ "คีย์"/"ชั้น" เป็นรูปแบบสม่ำเสมอ — เอกสารเปลี่ยน ข้อสอบตามได้)
//   + **ฝังรายการคาดหวัง** (ชนิด · ชั้น · ค่าเริ่มของคีย์ที่ค่าเป็นเลข/ตัวเลือก/รูปที่ใบสั่ง §4.2 กำหนด) เพราะคอลัมน์ "ค่าเริ่มต้น" เป็นร้อยแก้วไทย parse ไม่ได้แน่นอน
//   R-1 เทียบสองชุดนี้ (เอกสารกับรายการฝัง) — เอกสารถูกแก้ภายหลัง ข้อนี้แดงก่อน ผู้คุม ORACLE-EDIT รายการฝัง
//
// 🔴 ตัดสินโครงฐานด้วย `pg` ตรง · ค่าตั้ง/ฟอร์มผ่านโค้ดจริง · ทุกแถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t01-*` (ผู้ใช้ `trips-t01-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะร้าน seed
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t0.1.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP — รับใบต้องไม่มี SKIP)
// ผลที่ถูกต้องก่อนมี T0.1: PC เขียว · ที่เหลือแดงด้วยเหตุผล "ยังไม่มี…" (S-12/S-13 เขียวได้ = ยังไม่แตะไฟล์ต้องห้าม) · G เขียว/แดงตามสภาพ P0.1
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";

const LABEL = "qc-trips-t0.1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NO_REG = process.argv.includes("--no-regression");
const BASE_SHA = "f1c567c94"; // tip ของ session/trips ก่อน T0.1 (สัญญารอบ 3)
const BASE_LAST_MIG = "20261227100000_secretary_b";

loadTripsQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-trips ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ harness ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 200); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};
const skip = (id: string, name: string, why: string) => record(id, name, "SKIP", why);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const stripSqlComments = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const THAI = /[฀-๿]/;
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
type AnyFn = (...a: unknown[]) => unknown;
const fnOf = (mod: Rec | null, name: string, where: string): AnyFn => {
  const f = mod?.[name];
  if (typeof f !== "function") throw new AssertFail(`${where} ยังไม่มี ${name}`);
  return f as AnyFn;
};
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const changedFiles = (paths: string[]): string[] => {
  const a = git(["diff", "-w", "--ignore-blank-lines", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t01qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG = "trips-t01-";
const EMAIL_PREFIX = "trips-t01-";
const pgCode = (e: unknown): string => (asRec(e) && "code" in (e as Rec) ? String((e as Rec).code) : "");
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ═══════════════ สเปก ═══════════════
const U = "UNIT", P = "PRODUCT", D = "DEPARTURE", AT = "AGENT_TIER", A = "AGENT", V = "VESSEL";
type Exp = { code: string; key: string; type: string; chain: string[]; nullable?: boolean };
const E = (code: string, key: string, type: string, chain: string[], nullable = false): Exp => ({ code, key, type, chain, nullable });
const MSG_CUSTOMER = ["confirmation", "reminder1Day", "paymentDue", "docsMissing", "pickupInfo", "departureChanged", "waitlistOffer", "abandonedBooking", "refunded", "reviewRequest"] as const;
const MSG_SHOP = ["minNotMet", "insuranceMissing", "licenseExpiring", "pdpaRequestDue"] as const;
const EXPECT: Exp[] = [
  E("T1", "trips.general.businessType", "enum", [U]), E("T2", "trips.general.customerLocales", "table", [U]), E("T3", "trips.general.currencies", "table", [U, P]),
  E("T4", "trips.fx.rateSource", "enum", [U]), E("T5", "trips.sell.holdMinutes", "minutes", [U, P]), E("T6", "trips.sell.cutoff", "table", [U, P, D]),
  E("T7", "trips.sell.minToDepart", "table", [U, P, D]), E("T8", "trips.sell.departureHorizonDays", "days", [U, P], true), E("T9", "trips.sell.waitlistHoldMinutes", "minutes", [U, P]),
  E("T10", "trips.sell.abandonedReminder", "table", [U]), E("T11", "trips.price.manualOverrideApprovalPct", "percent", [U]), E("T12", "trips.price.costWarnMarginPct", "percent", [U, P]),
  E("T13", "trips.pay.depositPct", "percent", [U, P, AT, A]), E("T14", "trips.pay.depositBase", "enum", [U, P]), E("T15", "trips.pay.balanceDueDaysBefore", "days", [U, P, D, A], true),
  E("T16", "trips.pay.reminderDaysBefore", "table", [U, P]), E("T17", "trips.pay.overdueAction", "enum", [U, P]), E("T18", "trips.pay.splitPay", "bool", [U, P]),
  E("T19", "trips.pay.refundTargetBusinessDays", "int", [U]), E("T20", "trips.cancel.ladder", "table", [U, P, D, A]), E("T21", "trips.cancel.shopCancelRefund", "table", [U, P]),
  E("T22", "trips.cancel.shopCancelOptions", "table", [U, P]), E("T23", "trips.cancel.refundForm", "enum", [U]), E("T24", "trips.cancel.deductions", "table", [U]),
  E("T25", "trips.cancel.nameChangeFree", "bool", [U, P]), E("T26", "trips.cancel.changeDateFee", "money", [U, P], true), E("T27", "trips.pax.childAgeBand", "table", [U, P]),
  E("T28", "trips.pax.childPricePct", "percent", [U], true), E("T29", "trips.pax.fields", "table", [U, P]), E("T30", "trips.pax.passportCutoffDays", "table", [U, P]),
  E("T31", "trips.pax.cabinSharing", "enum", [U, V, D]), E("T32", "trips.pax.proofNotice", "template", [U]), E("T33", "trips.tax.vatRegistered", "table", [U]),
  E("T34", "trips.tax.priceIncludesVat", "bool", [U]), E("T35", "trips.tax.vatRate", "table", [U, P]), E("T36", "trips.tax.invoiceOnEachPayment", "bool", [U]),
  E("T37", "trips.tax.invoiceForm", "table", [U]), E("T38", "trips.tax.cancelFeeVat", "enum", [U]), E("T39", "trips.tax.forfeitAfterInvoice", "enum", [U]),
  E("T40", "trips.tax.refundCreditNote", "bool", [U]), E("T41", "trips.tax.corporateCustomerWht", "table", [U, P]), E("T42", "trips.giftcard.invoiceAt", "table", [U]),
  E("T43", "trips.consumer.withdraw7Days", "bool", [U]), E("T44", "trips.line.defaults", "table", [U, P]), E("T45", "trips.parkFee.table", "table", [U]),
  E("T46", "trips.parkFee.ageBands", "table", [U]), E("T47", "trips.parkFee.exemptFlags", "table", [U]), E("T48", "trips.parkFee.countMode", "enum", [U, P]),
  E("T49", "trips.dive.ratio", "table", [U, P, D]), E("T50", "trips.dive.cameraRule", "table", [U]), E("T51", "trips.insurance.minSum", "table", [U]),
  E("T52", "trips.insurance.requireDeepDiveCover", "bool", [U, P]), E("T53", "trips.insurance.policyMissingWarnDays", "days", [U, P]), E("T54", "trips.insurance.showOnVoucher", "bool", [U]),
  E("T55", "trips.license.fields", "table", [U]), E("T56", "trips.license.expiryReminderDays", "table", [U]), E("T57", "trips.license.oneTimeNotice", "bool", [U]),
  E("T58", "trips.prospectus.checklist", "bool", [U, P]), E("T59", "trips.marine.tm30Notice", "bool", [U, V]), E("T60", "trips.marine.manifestColumns", "table", [U, V]),
  E("T61", "trips.pdpa.retention", "table", [U]), E("T62", "trips.pdpa.healthDataProducts", "bool", [U, P]), E("T63", "trips.pdpa.minorConsent", "table", [U]),
  E("T64", "trips.pdpa.requestDeadlines", "table", [U]), E("T65", "trips.pdpa.ropaAutoDraft", "bool", [U]), E("T66", "trips.waiver.template", "template", [U, P]),
  E("T67", "trips.waiver.requiredFor", "enum", [U, P]), E("T68", "trips.waiver.identityProof", "enum", [U]), E("T69", "trips.msg.enabled", "table", [U, P]),
  ...MSG_CUSTOMER.map((k) => E("T70", `trips.msg.${k}`, "template", [U, P])),
  E("X1", "trips.sell.confirmMode", "enum", [U, P, AT, A]), E("X2", "trips.sell.shopConfirmHours", "int", [U, P]), E("X3", "trips.sell.codePrefix", "text", [U]),
  E("X5", "trips.fx.rates", "table", [U]), E("X6", "trips.public.showLeftAtOrBelow", "int", [U, P]), E("X7", "trips.public.embedDomains", "table", [U]),
  E("X8", "trips.public.rateLimits", "table", [U]), E("X9", "trips.public.otpValidMinutes", "minutes", [U]), E("X10", "trips.public.holdCapPerContact", "int", [U]),
  E("X11", "trips.pay.overdueGraceHours", "int", [U, P]), E("X12", "trips.cancel.autoApproveUpTo", "money", [U]), E("X13", "trips.cancel.manualEditApprovalSatang", "money", [U]),
  E("X14", "trips.cancel.creditBonusPct", "percent", [U, P]), E("X15", "trips.cancel.creditValidityMonths", "int", [U]), E("X16", "trips.cancel.moveFreeWithinDays", "days", [U, P]),
  E("X17", "trips.ops.autoCloseHoursAfterEnd", "int", [U, P], true), E("X18", "trips.ops.offlineCheckin", "bool", [U, P]), E("X19", "trips.ops.noShowFixHours", "int", [U]),
  E("X20", "trips.pdpa.viewLogDays", "days", [U]), E("X21", "trips.pdpa.maskOnScreen", "bool", [U]), E("X22", "trips.pdpa.abandonedRetentionDays", "days", [U]),
  E("X23", "trips.supplier.respondHours", "int", [U, P]), E("X23", "trips.supplier.shopDecisionHours", "int", [U, P]), E("X23", "trips.supplier.autoCancelOnTimeout", "bool", [U, P]),
  E("X28", "trips.cash.varianceApprovalSatang", "money", [U]),
];
const TPLS = ["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD", "ATTRACTION"] as const;
type Tpl = (typeof TPLS)[number];
/** ค่าเริ่มที่ฝัง: [DS, DT, LA] (+ AT ถ้าต่างจาก DT) — ใบสั่ง §4 / TD */
const LADDER = [{ fromDaysBefore: 30, refundPct: 100 }, { fromDaysBefore: 15, refundPct: 50 }, { fromDaysBefore: 0, refundPct: 0 }];
const MSG_ON = (la: boolean) => Object.fromEntries([...MSG_CUSTOMER, ...MSG_SHOP].map((k) => [k, k === "paymentDue" || k === "docsMissing" ? la : true]));
const DEF: Record<string, { v: [unknown, unknown, unknown]; at?: unknown }> = {
  "trips.general.businessType": { v: ["DIVE_SHOP", "DAY_TOUR", "LIVEABOARD"], at: "ATTRACTION" },
  "trips.general.customerLocales": { v: [["th", "en"], ["th", "en"], ["th", "en"]] },
  "trips.general.currencies": { v: [["THB"], ["THB"], ["THB"]] },
  "trips.fx.rateSource": { v: ["BOT_REF", "BOT_REF", "BOT_REF"] },
  "trips.sell.holdMinutes": { v: [15, 15, 30] },
  "trips.sell.cutoff": { v: [{ daysBefore: 1, atMin: 1080 }, { daysBefore: 1, atMin: 1080 }, { daysBefore: 2, atMin: 1080 }] },
  "trips.sell.minToDepart": { v: [{ minPax: null, decideDaysBefore: 1, decideAtMin: 1080 }, { minPax: 2, decideDaysBefore: 1, decideAtMin: 1080 }, { minPax: null, decideDaysBefore: 30, decideAtMin: 1080 }] },
  "trips.sell.departureHorizonDays": { v: [90, 90, null] },
  "trips.sell.waitlistHoldMinutes": { v: [30, 30, 30] },
  "trips.sell.abandonedReminder": { v: [{ enabled: true, afterMinutes: 60 }, { enabled: true, afterMinutes: 60 }, { enabled: true, afterMinutes: 60 }] },
  "trips.price.manualOverrideApprovalPct": { v: [10, 10, 10] },
  "trips.price.costWarnMarginPct": { v: [0, 0, 0] },
  "trips.pay.depositPct": { v: [100, 100, 30] },
  "trips.pay.depositBase": { v: ["TRIP_ONLY", "TRIP_ONLY", "TRIP_ONLY"] },
  "trips.pay.balanceDueDaysBefore": { v: [null, null, 60] },
  "trips.pay.reminderDaysBefore": { v: [[], [], [7, 1]] },
  "trips.pay.overdueAction": { v: ["NOTIFY_SHOP", "NOTIFY_SHOP", "NOTIFY_SHOP"] },
  "trips.pay.splitPay": { v: [false, false, true] },
  "trips.pay.refundTargetBusinessDays": { v: [3, 3, 3] },
  "trips.cancel.ladder": { v: [LADDER, LADDER, LADDER] },
  "trips.cancel.shopCancelRefund": { v: [{ EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 }, { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 }, { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 }] },
  "trips.cancel.shopCancelOptions": { v: [{ options: ["MOVE_DATE", "REFUND_100"], autoRefundAfterDays: 2 }, { options: ["MOVE_DATE", "REFUND_100"], autoRefundAfterDays: 2 }, { options: ["MOVE_DATE", "REFUND_100"], autoRefundAfterDays: 2 }] },
  "trips.cancel.refundForm": { v: ["MONEY", "MONEY", "MONEY"] },
  "trips.cancel.deductions": { v: [0, 1, 2].map(() => ({ categories: ["VISA", "AIR_DEPOSIT", "OTHER_NECESSARY"], evidenceRequired: true })) as [unknown, unknown, unknown] },
  "trips.cancel.nameChangeFree": { v: [true, true, true] },
  "trips.cancel.changeDateFee": { v: [null, null, null] },
  "trips.pax.childAgeBand": { v: [0, 1, 2].map(() => ({ infantBelow: 4, childFrom: 4, childTo: 11 })) as [unknown, unknown, unknown] },
  "trips.pax.childPricePct": { v: [70, 70, null] },
  "trips.pax.passportCutoffDays": { v: [0, 1, 2].map(() => ({ domestic: 3, crossBorder: 21 })) as [unknown, unknown, unknown] },
  "trips.pax.cabinSharing": { v: ["SAME_GENDER", "SAME_GENDER", "SAME_GENDER"] },
  "trips.tax.vatRegistered": { v: [0, 1, 2].map(() => ({ registered: null, thresholdSatang: 180_000_000, warnAtPct: 90 })) as [unknown, unknown, unknown] },
  "trips.tax.priceIncludesVat": { v: [true, true, true] },
  "trips.tax.vatRate": { v: [0, 1, 2].map(() => ({ mode: "STANDARD", rateBp: 700 })) as [unknown, unknown, unknown] },
  "trips.tax.invoiceOnEachPayment": { v: [true, true, true] },
  "trips.tax.invoiceForm": { v: [0, 1, 2].map(() => ({ direct: "SHORT_UPGRADE_ON_REQUEST", viaAgent: "FULL_ONLY" })) as [unknown, unknown, unknown] },
  "trips.tax.cancelFeeVat": { v: ["DAMAGES_NO_VAT_NO_WHT", "DAMAGES_NO_VAT_NO_WHT", "DAMAGES_NO_VAT_NO_WHT"] },
  "trips.tax.forfeitAfterInvoice": { v: ["NO_AUTO_CREDIT_NOTE", "NO_AUTO_CREDIT_NOTE", "NO_AUTO_CREDIT_NOTE"] },
  "trips.tax.refundCreditNote": { v: [true, true, true] },
  "trips.tax.corporateCustomerWht": { v: [0, 1, 2].map(() => ({ enabled: true, rateBp: 300 })) as [unknown, unknown, unknown] },
  "trips.consumer.withdraw7Days": { v: [false, false, false] },
  "trips.parkFee.ageBands": { v: [0, 1, 2].map(() => ({ freeBelow: 3, childFrom: 3, childTo: 14, adultFrom: 15, thaiSeniorFreeFrom: 60, childByHeightCm: 140 })) as [unknown, unknown, unknown] },
  "trips.parkFee.exemptFlags": { v: [0, 1, 2].map(() => ["MONK", "DISABLED", "THAI_STUDENT_CHILD_RATE"]) as [unknown, unknown, unknown] },
  "trips.parkFee.countMode": { v: ["PER_ENTRY", "PER_ENTRY", "PER_ENTRY"] },
  "trips.dive.ratio": { v: [0, 1, 2].map(() => ({ scuba: 4, trial: 2, course: 4, snorkel: 20 })) as [unknown, unknown, unknown] },
  "trips.dive.cameraRule": { v: [0, 1, 2].map(() => ({ minCert: "AOW", orMinDives: 40 })) as [unknown, unknown, unknown] },
  "trips.insurance.minSum": { v: [0, 1, 2].map(() => ({ deathDisabilitySatang: 100_000_000, injurySatang: 50_000_000 })) as [unknown, unknown, unknown] },
  "trips.insurance.requireDeepDiveCover": { v: [true, false, true] },
  "trips.insurance.policyMissingWarnDays": { v: [7, 7, 7] },
  "trips.insurance.showOnVoucher": { v: [true, true, true] },
  "trips.license.fields": { v: [0, 1, 2].map(() => ({ number: null, type: null, expiresAt: null })) as [unknown, unknown, unknown] },
  "trips.license.expiryReminderDays": { v: [[30], [30], [30]] },
  "trips.license.oneTimeNotice": { v: [true, true, true], at: false },
  "trips.prospectus.checklist": { v: [true, true, true], at: false },
  "trips.marine.tm30Notice": { v: [false, false, false] },
  "trips.marine.manifestColumns": { v: [["fullName", "nationality", "phone"], ["fullName", "nationality", "phone"], ["fullName", "sex", "nationality", "dob", "birthPlace", "docType", "docNumber", "docExpiry", "phone"]] },
  "trips.pdpa.retention": { v: [0, 1, 2].map(() => ({ passportImageDays: 30, medicalFormDays: 365, riskAckDays: 1095, consentAccessLogDays: 1095, manifestDays: 365, taxDocsDays: 1825 })) as [unknown, unknown, unknown] },
  "trips.pdpa.healthDataProducts": { v: [true, false, true] },
  "trips.pdpa.minorConsent": { v: [0, 1, 2].map(() => ({ parentOnlyAtOrBelow: 10, minorBelow: 20 })) as [unknown, unknown, unknown] },
  "trips.pdpa.requestDeadlines": { v: [0, 1, 2].map(() => ({ accessDays: 30, deletionDays: 90 })) as [unknown, unknown, unknown] },
  "trips.pdpa.ropaAutoDraft": { v: [true, false, true], at: false },
  "trips.waiver.requiredFor": { v: ["SCUBA_ONLY", "NONE", "ALL"] },
  "trips.waiver.identityProof": { v: ["LINE_IF_AVAILABLE_ELSE_OTP", "LINE_IF_AVAILABLE_ELSE_OTP", "LINE_IF_AVAILABLE_ELSE_OTP"] },
  "trips.msg.enabled": { v: [MSG_ON(false), MSG_ON(false), MSG_ON(true)] },
  "trips.sell.confirmMode": { v: ["AUTO", "AUTO", "AUTO"] },
  "trips.sell.shopConfirmHours": { v: [12, 12, 48] },
  "trips.sell.codePrefix": { v: ["TR", "TR", "LB"] },
  "trips.fx.rates": { v: [[], [], []] },
  "trips.public.showLeftAtOrBelow": { v: [5, 5, 5] },
  "trips.public.embedDomains": { v: [[], [], []] },
  "trips.public.rateLimits": { v: [0, 1, 2].map(() => ({ holdPerHourPerContact: 10, otpPer15Min: 5, tokenPerHourPerDevice: 30 })) as [unknown, unknown, unknown] },
  "trips.public.otpValidMinutes": { v: [30, 30, 30] },
  "trips.public.holdCapPerContact": { v: [3, 3, 3] },
  "trips.pay.overdueGraceHours": { v: [24, 24, 24] },
  "trips.cancel.autoApproveUpTo": { v: [0, 0, 0] },
  "trips.cancel.manualEditApprovalSatang": { v: [200_000, 200_000, 200_000] },
  "trips.cancel.creditBonusPct": { v: [20, 20, 20] },
  "trips.cancel.creditValidityMonths": { v: [12, 12, 12] },
  "trips.cancel.moveFreeWithinDays": { v: [90, 90, 90] },
  "trips.ops.autoCloseHoursAfterEnd": { v: [12, 12, 24] },
  "trips.ops.offlineCheckin": { v: [true, true, true] },
  "trips.ops.noShowFixHours": { v: [48, 48, 48] },
  "trips.pdpa.viewLogDays": { v: [1095, 1095, 1095] },
  "trips.pdpa.maskOnScreen": { v: [true, true, true] },
  "trips.pdpa.abandonedRetentionDays": { v: [30, 30, 30] },
  "trips.supplier.respondHours": { v: [24, 24, 24] },
  "trips.supplier.shopDecisionHours": { v: [12, 12, 12] },
  "trips.supplier.autoCancelOnTimeout": { v: [false, false, false] },
  "trips.cash.varianceApprovalSatang": { v: [20_000, 20_000, 20_000] },
};
const SNAP_TRIPS = [
  "trips.general.currencies", "trips.fx.rateSource", "trips.fx.rates", "trips.pay.depositPct", "trips.pay.depositBase", "trips.pay.balanceDueDaysBefore", "trips.pay.overdueAction", "trips.pay.overdueGraceHours",
  "trips.cancel.ladder", "trips.cancel.shopCancelRefund", "trips.cancel.shopCancelOptions", "trips.cancel.refundForm", "trips.cancel.deductions", "trips.cancel.nameChangeFree", "trips.cancel.changeDateFee",
  "trips.cancel.creditBonusPct", "trips.cancel.creditValidityMonths", "trips.cancel.moveFreeWithinDays", "trips.pax.childAgeBand", "trips.pax.childPricePct",
  "trips.tax.vatRegistered", "trips.tax.priceIncludesVat", "trips.tax.vatRate", "trips.tax.invoiceOnEachPayment", "trips.tax.invoiceForm", "trips.tax.cancelFeeVat", "trips.tax.forfeitAfterInvoice", "trips.tax.refundCreditNote", "trips.tax.corporateCustomerWht",
  "trips.consumer.withdraw7Days", "trips.line.defaults", "trips.parkFee.table", "trips.parkFee.ageBands", "trips.parkFee.exemptFlags", "trips.parkFee.countMode",
];
const HINT_ACCOUNTANT = ["trips.cancel.changeDateFee", "trips.tax.vatRate", "trips.tax.invoiceForm", "trips.tax.forfeitAfterInvoice", "trips.tax.corporateCustomerWht", "trips.giftcard.invoiceAt", "trips.line.defaults", "trips.fx.rates"];
const HINT_AUTHORITY: Record<string, string> = {
  "trips.cancel.deductions": "กรมการท่องเที่ยว", "trips.consumer.withdraw7Days": "สคบ.", "trips.parkFee.table": "กรมอุทยานฯ", "trips.parkFee.countMode": "กรมอุทยานฯ",
  "trips.marine.tm30Notice": "ตม.", "trips.marine.manifestColumns": "กรมเจ้าท่า", "trips.pdpa.retention": "ทนาย", "trips.waiver.template": "ทนาย",
};
const LEGAL_BY_KEY: Record<string, string[]> = {
  "trips.fx.rateSource": ["W20"], "trips.cancel.ladder": ["W01", "W03"], "trips.cancel.shopCancelRefund": ["W02"], "trips.tax.vatRate": ["W18"], "trips.tax.invoiceOnEachPayment": ["W16"],
  "trips.tax.invoiceForm": ["W14"], "trips.tax.cancelFeeVat": ["W17"], "trips.tax.forfeitAfterInvoice": ["W15"], "trips.parkFee.table": ["W29"], "trips.parkFee.ageBands": ["W30"],
  "trips.dive.ratio": ["W26"], "trips.insurance.minSum": ["W25"], "trips.pdpa.retention": ["W33"], "trips.waiver.template": ["W38"],
};
const SEV_HIGH = ["W01", "W02", "W16", "W24", "W32"];
const SEV_HIGHEST = ["W22"];
const PENDING_REVIEW = ["W05", "W07", "W08", "W10", "W13", "W15", "W29", "W41", "W42", "W43", "W44", "W45"];
const SETTINGS_RULES = ["W01", "W02", "W03", "W14", "W15", "W16", "W17", "W18", "W20", "W25", "W26", "W29", "W30", "W33", "W38"];
const ALL_RULES = Array.from({ length: 46 }, (_, i) => `W${String(i + 1).padStart(2, "0")}`);
const RUNTIME_RULES = ALL_RULES.filter((r) => !SETTINGS_RULES.includes(r));
const PERCENT100 = ["trips.price.manualOverrideApprovalPct", "trips.price.costWarnMarginPct", "trips.pay.depositPct", "trips.pax.childPricePct", "trips.cancel.creditBonusPct"];
const EFFECTIVE_DATED = ["trips.tax.vatRate", "trips.parkFee.table", "trips.parkFee.ageBands", "trips.dive.ratio", "trips.insurance.minSum", "trips.fx.rates"];
const HIDDEN = ["trips.giftcard.invoiceAt", "trips.cancel.creditBonusPct", "trips.cancel.creditValidityMonths"];
const SENS: Record<string, string> = { tax: "LEGAL", giftcard: "LEGAL", consumer: "LEGAL", pay: "MONEY", price: "MONEY", cash: "MONEY", pdpa: "PRIVACY", waiver: "PRIVACY" };
const NEW_SCOPES = ["VESSEL", "PRODUCT", "DEPARTURE", "AGENT_TIER", "AGENT"];

// ตาราง (CC §B.1) — คอลัมน์หลักที่ต้องมี
const T_UNIT = "unit", T_TENANT = "tenant";
const TABLES: Record<string, { axis: string; cols: string[] }> = {
  SellBasket: { axis: T_TENANT, cols: ["channel", "agentAccountId", "status", "expiresAt", "publicTokenHash", "idempotencyKey", "attribution", "unitIds"] },
  SellCounter: { axis: T_TENANT, cols: ["series", "period", "seq"] },
  TripProduct: { axis: T_UNIT, cols: ["productType", "sourceKind", "supplierId", "slug", "status", "title", "body", "currency", "vesselId", "meetingPoint", "disclosure", "formSpec", "deepDive", "crossBorder"] },
  TripOption: { axis: T_UNIT, cols: ["productId", "name", "durationMin", "nights", "sortOrder", "active"] },
  TripPaxType: { axis: T_UNIT, cols: ["productId", "code", "label", "ageMin", "ageMax", "countsCapacity"] },
  TripExtra: { axis: T_UNIT, cols: ["productId", "kind", "basis", "mandatory", "priceMinor", "currency", "commissionable", "discountable", "passThrough", "taxKind", "stockItemId"] },
  TripPassThroughEvidence: { axis: T_UNIT, cols: ["departureId", "bookingId", "extraKind", "paidToPayee", "amountSatang", "paidAt", "fileIds", "accountDocId"] },
  TripPickupZone: { axis: T_UNIT, cols: ["name", "pickupOffsetMin", "surchargeSatang", "polygon", "sortOrder"] },
  TripSchedule: { axis: T_UNIT, cols: ["productId", "optionId", "rule", "exceptions", "departTimeMin", "capacity", "minPax", "resourceIds", "dateFrom", "dateTo"] },
  TripDeparture: { axis: T_UNIT, cols: ["productId", "optionId", "scheduleId", "localDate", "startsAt", "endsAt", "status", "capacity", "sold", "held", "reserved", "minPax", "cutoffAt", "vesselId", "deckPlanVersionId", "insurance", "stopSell", "version"] },
  TripResource: { axis: T_UNIT, cols: ["kind", "name", "seats", "hrEmployeeId", "active"] },
  TripResourceUse: { axis: T_UNIT, cols: ["resourceId", "departureId", "startsAt", "endsAt", "active"] },
  TripVehicleRun: { axis: T_UNIT, cols: ["departureId", "resourceId", "driverEmployeeId", "stops"] },
  TripSeason: { axis: T_UNIT, cols: ["name", "dateStart", "dateEnd", "priority", "status"] },
  TripPrice: { axis: T_UNIT, cols: ["productId", "optionId", "paxTypeId", "cabinTypeId", "seasonId", "departureId", "currency", "amountMinor", "weekdayMask", "priority"] },
  TripPriceRule: { axis: T_UNIT, cols: ["productId", "kind", "params", "priority", "active"] },
  TripHold: { axis: T_UNIT, cols: ["departureId", "basketId", "bookingId", "channel", "agentAccountId", "allotmentId", "qtyPublic", "qtyAllot", "unitIds", "purpose", "capKeyHash", "requestHash", "idempotencyKey", "status", "expiresAt", "releasedReason"] },
  TripBooking: { axis: T_UNIT, cols: ["code", "publicTokenHash", "status", "productId", "departureId", "travelDate", "basketId", "channel", "agentAccountId", "agentUserId", "salesStaffId", "linkId", "collectMode", "payMethod", "bookerPartyId", "marketingEligible", "contactRoute", "currency", "fxRateMicros", "grossSatang", "discountSatang", "agentDiscountSatang", "passThroughSatang", "vatSatang", "commissionSatang", "commissionVatSatang", "whtSatang", "netToShopSatang", "agentActualSaleSatang", "paidSatang", "refundedSatang", "accountingState", "policySnapshot", "version", "cancelReason", "cancelledAt", "travelledAt", "piiPurgedAt", "createdById"] },
  TripBookingItem: { axis: T_UNIT, cols: ["bookingId", "departureId", "kind", "paxTypeId", "extraId", "tripUnitId", "qty", "unitPriceMinor", "amountMinor", "amountSatang", "vatSatang", "taxKind", "priceSource", "allotmentId", "active"] },
  TripPassenger: { axis: T_UNIT, cols: ["bookingId", "itemId", "partyId", "fullName", "nationality", "dob", "sex", "docType", "docNumberEnc", "docLast4", "docExpiry", "diver", "phone", "birthPlace", "certLevel", "diveCount", "lastDiveAt", "isMinor", "guardianConsent", "answers", "formStatus", "waiverSignedAt", "waiverEvidence", "checkinAt", "retainUntil"] },
  TripPaymentDue: { axis: T_UNIT, cols: ["bookingId", "seq", "kind", "passengerId", "dueAt", "amountSatang", "vatableSatang", "passThroughSatang", "amountMinor", "paidSatang", "status", "payTokenHash"] },
  TripMoneyEvent: { axis: T_UNIT, cols: ["bookingId", "kind", "amountSatang", "vatSatang", "passThroughSatang", "dueId", "tender", "accountDocId", "accountEntryId", "postingStatus", "postingAttempts", "nextAttemptAt", "postedDate", "slipId", "whtByCustomerSatang", "idempotencyKey"] },
  TripRefundRequest: { axis: T_UNIT, cols: ["bookingId", "by", "reasonKind", "deductions", "status", "computed", "choice", "amountSatang", "manualDeltaSatang", "approvalId", "creditNoteDocId", "damagesDocId", "decidedById"] },
  TripDocument: { axis: T_UNIT, cols: ["passengerId", "kind", "fileId", "consent", "retainUntil", "deletedAt"] },
  TripDocView: { axis: T_UNIT, cols: ["documentId", "viewerKind", "viewerId", "purpose", "at"] },
  TripPdpaRequest: { axis: T_UNIT, cols: ["passengerId", "partyId", "kind", "status", "dueAt", "doneAt"] },
  TripCashClose: { axis: T_UNIT, cols: ["businessDate", "financeAccountId", "expectedSatang", "countedSatang", "varianceSatang", "countedById", "varianceEntryId", "transferId", "approvalId", "closedAt"] },
  TripCheckin: { axis: T_UNIT, cols: ["passengerId", "deviceId", "scannedAt", "receivedAt", "result"] },
  TripWaitlist: { axis: T_UNIT, cols: ["departureId", "partyId", "qty", "status", "offerHoldId", "offerExpiresAt"] },
  TripCost: { axis: T_UNIT, cols: ["departureId", "kind", "amountSatang", "note"] },
  TripUnit: { axis: T_UNIT, cols: ["departureId", "berthId", "cabinId", "sortKey", "status", "holdId", "bookingItemId", "allotmentId", "version"] },
  TripImportBatch: { axis: T_UNIT, cols: ["kind", "fileId", "mapping", "status", "createdRefs"] },
  TripLinkStat: { axis: T_UNIT, cols: ["day", "channel", "linkId", "agentAccountId", "views", "starts", "paid"] },
  // ORACLE-EDIT M-4 (ผู้คุม 12 พ.ย.): ตารางที่ 34 จากใบสั่ง T0.5
  TripPromoRedemption: { axis: T_UNIT, cols: ["ruleId", "contactKeyHash", "bookingId", "discountSatang", "status", "releasedAt"] },
};
const NEW_TABLES = Object.keys(TABLES);
const SELL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "CHAT_AI"];
/** ชุดค่า CHECK (ใบสั่ง §4.1 · CC §B.1 §N.1 §G.1 §G.3) */
const CHECKS: [string, string, string[]][] = [
  ["TripProduct", "status", ["DRAFT", "ACTIVE", "ARCHIVED"]], ["TripProduct", "productType", ["TOUR", "LIVEABOARD", "ATTRACTION"]], ["TripProduct", "sourceKind", ["OWN", "SUPPLIER"]],
  ["TripSeason", "status", ["ACTIVE", "ARCHIVED"]], ["TripDeparture", "status", ["OPEN", "GUARANTEED", "FULL", "CLOSED", "CANCELLED"]],
  ["TripHold", "purpose", ["PAYMENT", "SHOP_CONFIRM", "AGENT_REQUEST", "SUPPLIER_REQUEST", "WAITLIST_OFFER", "AGENT_HOLD"]], ["TripHold", "status", ["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"]],
  ["TripBooking", "status", ["HOLD", "PENDING", "CONFIRMED", "PART_PAID", "PAID", "EXPIRED", "CANCELLED", "TRAVELLED", "NO_SHOW"]], ["TripBooking", "collectMode", ["SHOP", "AGENT"]],
  ["TripBooking", "payMethod", ["PAY_NOW", "PAY_LATER", "WALLET", "CREDIT"]], ["TripBooking", "accountingState", ["NONE", "UNEARNED", "RECOGNISED", "REVERSED"]], ["TripBooking", "contactRoute", ["VIA_AGENT", "DIRECT"]],
  ["TripBooking", "channel", SELL_CHANNELS], ["SellBasket", "status", ["OPEN", "CHECKED_OUT", "EXPIRED", "ABANDONED"]],
  ["TripBookingItem", "kind", ["SEAT", "BERTH", "CABIN", "EXTRA", "PICKUP", "FEE", "ADJUST"]],
  ["TripExtra", "kind", ["PARK_FEE", "PORT_FEE", "FUEL", "EQUIPMENT", "NITROX", "TRANSFER", "COURSE", "INSURANCE", "OTHER"]], ["TripExtra", "basis", ["PER_PAX", "PER_BOOKING", "PER_DAY", "PER_PAX_DAY", "PER_BOAT_NIGHT"]],
  ["TripResource", "kind", ["BOAT", "VAN", "GUIDE", "OTHER"]], ["TripPaymentDue", "kind", ["DEPOSIT", "BALANCE", "INSTALMENT", "PASSENGER_SHARE"]],
  ["TripPaymentDue", "status", ["OPEN", "PARTLY_PAID", "PAID", "OVERDUE", "WAIVED", "CANCELLED"]],
  ["TripMoneyEvent", "kind", ["RECEIVED", "REFUNDED", "RETAINED", "REVENUE_RECOGNISED", "PASS_THROUGH_PAID", "CREDIT_ISSUED"]], ["TripMoneyEvent", "tender", ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "AGENCY"]],
  ["TripMoneyEvent", "postingStatus", ["POSTED", "UNPOSTED", "FAILED_NEEDS_ACTION"]],
  ["TripRefundRequest", "status", ["REQUESTED", "QUOTED", "APPROVED", "REJECTED", "WITHDRAWN", "EXECUTING", "DONE", "FAILED"]], ["TripRefundRequest", "reasonKind", ["CUSTOMER", "EXTERNAL", "MIN_NOT_MET", "SHOP_FAULT"]],
  ["TripRefundRequest", "choice", ["MONEY", "CREDIT", "MOVE_DATE"]],
  ["TripPassenger", "formStatus", ["NOT_REQUIRED", "PENDING", "SUBMITTED", "VERIFIED", "NEEDS_FIX"]], ["TripDocument", "kind", ["PASSPORT", "MEDICAL", "WAIVER", "CERT", "PARK_TICKET", "INSURANCE"]],
  ["TripDocView", "viewerKind", ["STAFF", "AGENT", "LINK_CUSTOMER", "CUSTOMER"]], ["TripPdpaRequest", "kind", ["ACCESS", "RECTIFY", "ERASE", "OBJECT", "PORTABILITY"]],
  ["TripPdpaRequest", "status", ["RECEIVED", "IN_PROGRESS", "DONE", "REJECTED"]], ["TripCheckin", "result", ["FIRST", "DUPLICATE"]],
  ["TripWaitlist", "status", ["WAITING", "OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"]], ["TripUnit", "status", ["FREE", "HELD", "SOLD", "BLOCKED", "ALLOTTED"]],
  ["TripImportBatch", "status", ["PREVIEW", "APPLIED", "UNDONE"]], ["TripPriceRule", "kind", ["EARLY_BIRD", "LAST_MINUTE", "GROUP_TIER", "FREE_LEADER", "BLACKOUT", "PROMO_CODE"]],
  ["TripCost", "kind", ["BOAT", "FUEL", "GUIDE", "FOOD", "PARK_FEE", "TRANSPORT", "EQUIPMENT", "OTHER"]],
];

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null; udt_name: string };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default, udt_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t} (migration trips ยังไม่ลง)`); };
const checkCache = new Map<string, string[]>();
const checksOf = async (table: string): Promise<string[]> => {
  if (!checkCache.has(table)) {
    const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
    checkCache.set(table, rows.map((r) => r.def));
  }
  return checkCache.get(table) ?? [];
};
const colRe = (col: string) => new RegExp(`(^|[^A-Za-z0-9_"])"?${col}"?([^A-Za-z0-9_"]|$)`);
const literalsOf = (def: string) => [...def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1]);
/** ชุดค่าที่ CHECK อนุญาตของคอลัมน์ (คืน null ถ้าไม่มี CHECK แบบรายการค่า) */
const checkValues = async (table: string, col: string): Promise<string[] | null> => {
  for (const d of await checksOf(table)) {
    if (!colRe(col).test(d)) continue;
    const lits = literalsOf(d);
    if (lits.length) return [...new Set(lits)].sort();
  }
  return null;
};
/** INSERT ค่าขั้นต่ำ — NOT NULL ไม่มี default เติมให้ (ข้อความที่มี CHECK ใช้ค่าแรกที่อนุญาต) */
async function insertRow(table: string, vals: Rec, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  if ("updatedAt" in v && !names.has("updatedAt")) delete v.updatedAt; // ตารางต่อท้ายอย่างเดียวอาจไม่มี updatedAt
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (t === "text" || t.startsWith("character")) { const lits = await checkValues(table, c.column_name); v[c.column_name] = lits?.[0] ?? `qc${randomBytes(3).toString("hex")}`; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? new Date() : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : t === "USER-DEFINED" ? null : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const tryCode = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { if (e instanceof AssertFail) throw e; return pgCode(e) || errMsg(e); } };
type IxRow = { name: string; uniq: boolean; cols: string[]; pred: string | null; def: string; nnd: boolean };
const ixOf = (table: string) => q<IxRow>(
  `SELECT i.relname AS name, ix.indisunique AS uniq, ix.indnullsnotdistinct AS nnd, pg_get_indexdef(ix.indexrelid) AS def,
          ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
          pg_get_expr(ix.indpred, ix.indrelid) AS pred
     FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
    WHERE t.relname = $1 AND ns.nspname = current_schema()`, [table]);
const hasIx = async (table: string, f: (r: IxRow) => boolean) => (await ixOf(table)).some(f);
const enumLabels = async (name: string) => (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`, [name])).map((r) => r.l);

// ═══════════════ ร้านชั่วคราว ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ไม่มีคอลัมน์ */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  // กวาดของค้างจากรอบก่อน
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  // ── โมดูล (นำเข้าครั้งเดียว · ไม่มี = ข้อที่ใช้แดงพร้อมเหตุผล) ──
  const SETI = await tryImport("@/lib/core/settings");
  const SET = SETI.mod;
  const SVC = (await tryImport("@/lib/core/settings/service")).mod;
  const TOURI = await tryImport("@/lib/core/settings/legal/th-tour-2569");
  const TOUR = TOURI.mod;
  const LEGALIDX = (await tryImport("@/lib/core/settings/legal/index")).mod;
  const RENTAL = (await tryImport("@/lib/core/settings/legal/th-rental-2568")).mod;
  const SHARED = (await tryImport("@/components/settings/settings-shared")).mod;
  const SELLI = await tryImport("@/lib/core/sellable");
  const JSONSI = await tryImport("@/lib/modules/trips/json-schemas");
  const SCOPE = (await tryImport("@/lib/core/scope")).mod;
  const PERM = (await tryImport("@/lib/core/permissions")).mod;
  const DBI = await tryImport("@/lib/core/db");
  const DB = DBI.mod;
  const CLIENT = (await tryImport("@prisma/client")).mod;
  const needSet = (): Rec => { if (!SET) throw new AssertFail(`โหลด @/lib/core/settings ไม่ได้: ${SETI.err}`); return SET; };
  const needTour = (): Rec => { if (!TOUR) throw new AssertFail(`ยังไม่มี legal/th-tour-2569 (${TOURI.err.slice(0, 80)})`); return TOUR; };
  const getDef = (key: string): Rec | null => { try { return asRec(fnOf(needSet(), "getDef", "settings")(key)); } catch { return null; } };
  const needDef = (key: string): Rec => { const d = getDef(key); if (!d) throw new AssertFail(`ยังไม่มีคีย์ ${key}`); return d; };

  // ═══════════════ PC ═══════════════
  console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("PC-1", `ฐาน QC ต่อได้ + migration ฐาน ${BASE_LAST_MIG} ลงแล้ว`, async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [BASE_LAST_MIG]);
    eq(r[0]?.n, 1, "migration ฐาน");
  });
  await st("PC-2", "ทะเบียนค่าตั้งเดิมโหลดได้ (booking.deposit.method · rooms มี legal เดิม)", () => {
    ok(SET, `โหลด settings ไม่ได้: ${SETI.err}`);
    ok(getDef("booking.deposit.method"), "ไม่มี booking.deposit.method");
    ok(RENTAL && asRec(RENTAL.TH_RENTAL_2568_RULES) && Object.keys(asRec(RENTAL.TH_RENTAL_2568_RULES) ?? {}).length > 5, "TH_RENTAL_2568_RULES หาย");
  });
  await st("PC-3", "ตัวตรวจ qc: CHECK parser อ่าน CHECK ของตารางเดิมได้ (positive control)", async () => {
    const all = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c WHERE c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%ANY (ARRAY[%' LIMIT 3`);
    ok(all.length > 0 && literalsOf(all[0].def).length > 0, `อ่าน literal จาก CHECK ไม่ได้: ${fmt(all[0]?.def)}`);
  });

  // ═══════════════ M. migration (static) ═══════════════
  console.log("\n── M: migration ──");
  const baseMigs = new Set(git(["ls-tree", "--name-only", `${BASE_SHA}:prisma/migrations`]).split("\n").filter(Boolean));
  const nowMigs = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => !d.endsWith(".toml")).sort();
  const newMigs = nowMigs.filter((d) => !baseMigs.has(d));
  const enumDir = newMigs.find((d) => /^\d{14}_trips_enum$/.test(d));
  const mainDir = newMigs.find((d) => /^\d{14}_trips$/.test(d));
  const enumSql = enumDir ? read(`prisma/migrations/${enumDir}/migration.sql`) : "";
  const mainSql = mainDir ? read(`prisma/migrations/${mainDir}/migration.sql`) : "";
  const mainCode = stripSqlComments(mainSql);
  await st("M-1", "migration ใหม่ = 2 โฟลเดอร์ `<ts>_trips_enum` + `<ts>_trips` · ts > ฐาน · enum มาก่อน", () => {
    ok(enumDir && mainDir, `ยังไม่มี (ใหม่: ${newMigs.join(", ") || "ไม่มี"})`);
    eq(newMigs.length, 2, "จำนวนโฟลเดอร์ใหม่");
    ok((enumDir ?? "") > BASE_LAST_MIG && (enumDir ?? "") < (mainDir ?? ""), `ลำดับ ${enumDir} < ${mainDir}`);
  });
  await st("M-2", "ไฟล์ trips_enum = ADD VALUE 4 คำสั่งพอดี (UnitType TRIPS · AccountDocSource TRIPS/AGENCY/SUPPLIER) ไม่มีคำสั่งอื่น", () => {
    ok(enumSql, "ยังไม่มีไฟล์ trips_enum");
    const stmts = stripSqlComments(enumSql).split(";").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    const want = [`ALTER TYPE "UnitType" ADD VALUE 'TRIPS'`, `ALTER TYPE "AccountDocSource" ADD VALUE 'TRIPS'`, `ALTER TYPE "AccountDocSource" ADD VALUE 'AGENCY'`, `ALTER TYPE "AccountDocSource" ADD VALUE 'SUPPLIER'`];
    eq([...stmts].sort(), [...want].sort(), "คำสั่งในไฟล์ enum");
  });
  await st("M-3", "ไฟล์ trips add-only: ไม่มี DROP/RENAME/ALTER COLUMN/SET NOT NULL/UPDATE/DELETE/TRUNCATE/ALTER TYPE", () => {
    ok(mainSql, "ยังไม่มีไฟล์ trips");
    const bad = [/\bDROP\b/i, /\bRENAME\b/i, /ALTER\s+COLUMN/i, /SET\s+NOT\s+NULL/i, /^\s*UPDATE\s/im, /^\s*DELETE\s/im, /\bTRUNCATE\b/i, /ALTER\s+TYPE/i].filter((r) => r.test(mainCode));
    ok(bad.length === 0, `เจอ ${bad.map(String).join(" ")}`);
  });
  await st("M-4", "ตารางเดิมที่ไฟล์ trips แตะ = AccountDocument เท่านั้น (ADD COLUMN มี DEFAULT ถ้า NOT NULL) · ไม่ใช้ค่า enum ใหม่", () => {
    ok(mainSql, "ยังไม่มีไฟล์ trips");
    const altered = [...mainCode.matchAll(/ALTER\s+TABLE\s+"(\w+)"\s+([^;]*);/gi)].map((m) => ({ t: m[1], body: m[2] }));
    const oldTouched = [...new Set(altered.map((a) => a.t).filter((t) => !NEW_TABLES.includes(t)))];
    eq(oldTouched, ["AccountDocument"], "ตารางเดิมที่ ALTER");
    const adds = altered.filter((a) => a.t === "AccountDocument").flatMap((a) => a.body.split(/,(?![^(]*\))/)).map((s) => s.trim());
    ok(adds.every((s) => /^ADD\s+COLUMN/i.test(s)), `AccountDocument มีคำสั่งอื่นนอก ADD COLUMN: ${adds.join(" | ")}`);
    const nn = adds.filter((s) => /NOT NULL/i.test(s) && !/DEFAULT/i.test(s));
    ok(nn.length === 0, `NOT NULL ไม่มี DEFAULT: ${nn.join(" | ")}`);
    ok(adds.some((s) => /"passThroughSatang"\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i.test(s)), "ไม่มี passThroughSatang INTEGER NOT NULL DEFAULT 0");
    ok(!/'(TRIPS|AGENCY|SUPPLIER)'::"(UnitType|AccountDocSource)"/.test(mainCode), "ใช้ค่า enum ใหม่ในไฟล์เดียวกับที่ยังไม่ commit");
  });
  await st("M-5", "SQL มือในไฟล์ trips: NULLS NOT DISTINCT ×3 · partial unique TripCheckin · partial index TripHold · EXCLUDE TripResourceUse", () => {
    ok(mainSql, "ยังไม่มีไฟล์ trips");
    const need: [string, RegExp][] = [
      ["TripDeparture NND", /"TripDeparture"\s*\([^)]*"productId"[^)]*"optionId"[^)]*"startsAt"[^)]*\)\s*NULLS NOT DISTINCT/i],
      ["TripPrice NND", /"TripPrice"\s*\([^)]*"cabinTypeId"[^)]*\)\s*NULLS NOT DISTINCT/i],
      ["TripLinkStat NND", /"TripLinkStat"\s*\([^)]*"linkId"[^)]*\)\s*NULLS NOT DISTINCT/i],
      ["TripCheckin partial", /UNIQUE INDEX[^;]*"TripCheckin"\s*\(\s*"passengerId"\s*\)\s*WHERE[^;]*FIRST/i],
      ["TripHold partial", /INDEX[^;]*"TripHold"\s*\(\s*"expiresAt"\s*\)\s*WHERE[^;]*ACTIVE/i],
      ["TripResourceUse EXCLUDE", /"TripResourceUse"[^;]*EXCLUDE\s+USING\s+gist/i],
    ];
    const miss = need.filter(([, r]) => !r.test(mainCode)).map(([n]) => n);
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
  });
  await st("M-6", "schema: trips.prisma + sellable.prisma ใหม่ · แตะไฟล์เดิมแค่ core.prisma + account.prisma · ไม่ประกาศ @@unique ซ้ำกับ SQL มือ + มีคอมเมนต์ SQL มือ", () => {
    const ch = changedFiles(["prisma/schema"]).sort();
    eq(ch, ["prisma/schema/account.prisma", "prisma/schema/core.prisma", "prisma/schema/sellable.prisma", "prisma/schema/trips.prisma"], "ไฟล์ schema ที่เปลี่ยน");
    const tp = stripComments(read("prisma/schema/trips.prisma"));
    const dup = [/@@unique\(\[\s*productId\s*,\s*optionId\s*,\s*startsAt\s*\]/, /@@unique\(\[\s*passengerId\s*\]/, /@@unique\(\[\s*unitId\s*,\s*day\s*,\s*channel\s*,\s*linkId\s*\]/, /@@unique\(\[\s*productId\s*,\s*optionId\s*,\s*paxTypeId/].filter((r) => r.test(tp));
    ok(dup.length === 0, `ประกาศ @@unique ซ้ำ SQL มือ: ${dup.map(String).join(" ")}`);
    ok(/SQL มือ/.test(read("prisma/schema/trips.prisma")), "ไม่มีคอมเมนต์ // SQL มือ ใน trips.prisma");
  });
  await st("M-7", "migration เก่าไม่ถูกแก้ (diff ใต้โฟลเดอร์ฐาน = ว่าง)", () => {
    const touched = git(["diff", "--name-only", BASE_SHA, "--", "prisma/migrations"]).split("\n").filter(Boolean).filter((f) => baseMigs.has(f.split("/")[2] ?? ""));
    ok(touched.length === 0, `แก้ migration เก่า: ${touched.join(", ")}`);
    ok(newMigs.length > 0, "ยังไม่มี migration ใหม่");
  });
  await st("M-8", "สองโฟลเดอร์ใหม่ลงฐานเลนแล้ว (_prisma_migrations finished · ไม่ rollback)", async () => {
    ok(enumDir && mainDir, "ยังไม่มีโฟลเดอร์ migration");
    const r = await q<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = ANY($1::text[]) AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [[enumDir, mainDir]]);
    eq(r.map((x) => x.migration_name).sort(), [enumDir, mainDir].sort(), "ลงฐาน");
  });

  // ═══════════════ E. enum ═══════════════
  console.log("\n── E: enum ในฐาน ──");
  await st("E-1", "UnitType: ค่าเดิมครบตามลำดับ + TRIPS ท้ายสุด", async () => {
    eq(await enumLabels("UnitType"), ["HOTEL", "RESTAURANT", "BOOKING", "QUEUE", "TICKET", "SHOP", "RENTAL", "SCHOOL", "CLINIC", "DORM", "TRIPS"], "UnitType");
  });
  await st("E-2", "AccountDocSource: ค่าเดิมครบ + TRIPS AGENCY SUPPLIER ท้าย", async () => {
    eq(await enumLabels("AccountDocSource"), ["MANUAL", "AI", "IMPORT", "INBOX", "CRM", "POS", "RECURRING", "API", "DORM", "TRIPS", "AGENCY", "SUPPLIER"], "AccountDocSource");
  });

  // ═══════════════ T. ตาราง ═══════════════
  console.log("\n── T: ตาราง/คอลัมน์ ──");
  await st("T-1", `ตารางใหม่ครบ ${NEW_TABLES.length} ตัว`, async () => {
    const miss: string[] = [];
    for (const t of NEW_TABLES) if ((await cols(t)).length === 0) miss.push(t);
    ok(miss.length === 0, `ยังไม่มี ${miss.length}/${NEW_TABLES.length}: ${miss.slice(0, 6).join(", ")}…`);
  });
  await st("T-2", "ทุกตาราง: id + tenantId NOT NULL · ตาราง unit มี unitId NOT NULL · createdAt", async () => {
    const bad: string[] = [];
    for (const [t, s] of Object.entries(TABLES)) {
      const c = await cols(t);
      if (!c.length) { bad.push(`${t}(ไม่มีตาราง)`); continue; }
      const g = (n: string) => c.find((x) => x.column_name === n);
      if (!g("id") || g("tenantId")?.is_nullable !== "NO") bad.push(`${t}.tenantId`);
      if (s.axis === T_UNIT && g("unitId")?.is_nullable !== "NO") bad.push(`${t}.unitId`);
      if (!g("createdAt") && t !== "TripDocView" && t !== "TripCheckin") bad.push(`${t}.createdAt`);
    }
    ok(bad.length === 0, bad.slice(0, 8).join(", "));
  });
  await st("T-3", "คอลัมน์หลักตาม CC §B.1 ครบทุกตาราง", async () => {
    const miss: string[] = [];
    for (const [t, s] of Object.entries(TABLES)) {
      const names = new Set((await cols(t)).map((c) => c.column_name));
      if (!names.size) { miss.push(`${t}(ทั้งตาราง)`); continue; }
      for (const c of s.cols) if (!names.has(c)) miss.push(`${t}.${c}`);
    }
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
  });
  await st("T-4", "เงิน/ตัวนับ = integer (`*Satang` `*Minor` `qty*` sold/held/reserved/capacity/seq/version)", async () => {
    const bad: string[] = [];
    let seen = 0;
    for (const t of NEW_TABLES) for (const c of await cols(t)) {
      if (c.column_name !== "isMinor" /* ORACLE-EDIT T-4 (ผู้คุม 12 พ.ย.): isMinor = Bool ตามสัญญา §B.1 ไม่ใช่จำนวนเงิน */ && /(Satang|Minor)$|^qty|^(sold|held|reserved|capacity|seq|version|views|starts|paid|postingAttempts)$/.test(c.column_name)) { seen++; if (c.data_type !== "integer") bad.push(`${t}.${c.column_name}=${c.data_type}`); }
    }
    ok(seen > 20, `ยังไม่เจอคอลัมน์เงิน/ตัวนับ (${seen})`);
    ok(bad.length === 0, bad.slice(0, 6).join(", "));
  });
  await st("T-5", "TripDeparture: sold/held/reserved/version NOT NULL default 0 · localDate = date · TripBooking.travelDate = date", async () => {
    await needTable("TripDeparture");
    const c = await cols("TripDeparture");
    for (const n of ["sold", "held", "reserved", "version"]) { const x = c.find((y) => y.column_name === n); ok(x?.is_nullable === "NO" && /^0\b/.test(x?.column_default ?? ""), `${n}: ${fmt(x)}`); }
    eq(c.find((y) => y.column_name === "localDate")?.data_type, "date", "localDate");
    await needTable("TripBooking");
    eq((await cols("TripBooking")).find((y) => y.column_name === "travelDate")?.data_type, "date", "travelDate");
  });
  await st("T-6", "TripBooking.policySnapshot jsonb NOT NULL · ไม่มี holdExpiresAt · TripHold.expiresAt NOT NULL", async () => {
    await needTable("TripBooking");
    const c = await cols("TripBooking");
    const ps = c.find((x) => x.column_name === "policySnapshot");
    ok(ps?.data_type === "jsonb" && ps.is_nullable === "NO", `policySnapshot: ${fmt(ps)}`);
    ok(!c.some((x) => x.column_name === "holdExpiresAt"), "มี holdExpiresAt (CC TC5 ห้าม)");
    await needTable("TripHold");
    eq((await cols("TripHold")).find((x) => x.column_name === "expiresAt")?.is_nullable, "NO", "TripHold.expiresAt");
  });
  await st("T-7", "AccountDocument.passThroughSatang integer NOT NULL default 0", async () => {
    const x = (await cols("AccountDocument")).find((c) => c.column_name === "passThroughSatang");
    ok(x, "ยังไม่มีคอลัมน์");
    ok(x?.data_type === "integer" && x.is_nullable === "NO" && /^0\b/.test(x.column_default ?? ""), fmt(x));
  });
  await st("T-8", "ไม่มีคอลัมน์ Prisma enum (USER-DEFINED) ในตารางใหม่ · วันเดินทาง/วันธุรกิจ = date", async () => {
    const bad: string[] = [];
    let n = 0;
    for (const t of NEW_TABLES) for (const c of await cols(t)) { n++; if (c.data_type === "USER-DEFINED") bad.push(`${t}.${c.column_name}`); }
    ok(n > 0, "ยังไม่มีตารางใหม่");
    ok(bad.length === 0, `enum: ${bad.join(", ")}`);
    const dates: [string, string][] = [["TripSchedule", "dateFrom"], ["TripSchedule", "dateTo"], ["TripSeason", "dateStart"], ["TripCashClose", "businessDate"], ["TripLinkStat", "day"]];
    const nd: string[] = [];
    for (const [t, c] of dates) if ((await cols(t)).find((x) => x.column_name === c)?.data_type !== "date") nd.push(`${t}.${c}`);
    ok(nd.length === 0, `ไม่ใช่ date: ${nd.join(", ")}`);
  });
  await st("T-9", "ไม่มี FK ใด ๆ เข้า/ออกตารางใหม่ (ทุก id = String หลวม · ใบสั่ง §2 ข้อ 2)", async () => {
    const fks = await q<{ src: string; dst: string }>(`SELECT t.relname AS src, r.relname AS dst FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace WHERE c.contype = 'f' AND ns.nspname = current_schema() AND (t.relname = ANY($1::text[]) OR r.relname = ANY($1::text[]))`, [NEW_TABLES]);
    ok((await cols("TripProduct")).length > 0, "ยังไม่มีตาราง");
    ok(fks.length === 0, `มี FK: ${fks.map((f) => `${f.src}→${f.dst}`).join(", ")}`);
  });

  // ═══════════════ C. CHECK ═══════════════
  console.log("\n── C: CHECK ──");
  const groups = new Map<string, [string, string, string[]][]>();
  for (const c of CHECKS) { const g = c[0].startsWith("TripBooking") || c[0] === "SellBasket" ? "booking" : c[0].startsWith("TripPay") || c[0].startsWith("TripMoney") || c[0].startsWith("TripRefund") ? "money" : c[0].match(/Passenger|Doc|Pdpa|Checkin/) ? "pax" : "catalog"; groups.set(g, [...(groups.get(g) ?? []), c]); }
  let ci = 1;
  for (const [g, list] of groups) {
    await st(`C-${ci++}`, `ชุดค่า CHECK กลุ่ม ${g} (${list.length} คอลัมน์) ตรงใบสั่ง §4.1`, async () => {
      const bad: string[] = [];
      for (const [t, c, vals] of list) {
        if ((await cols(t)).length === 0) { bad.push(`${t}(ไม่มีตาราง)`); continue; }
        const got = await checkValues(t, c);
        if (!isDeepStrictEqual(got, [...vals].sort())) bad.push(`${t}.${c}=${fmt(got)}`);
      }
      ok(bad.length === 0, bad.slice(0, 4).join(" · "));
    });
  }
  // ═══════════════ ร้านชั่วคราว + แถวพื้นฐาน ═══════════════
  const now = () => new Date();
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uB = rid("uB");
  let unitType = "TRIPS";
  let setupErr = "";
  let OWNER_A: Actor | null = null, OWNER_B: Actor | null = null, STAFF_A: Actor | null = null;
  try {
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) {
      await insertRow("Tenant", { id, name: `ทดสอบ T0.1 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: now() });
      tenantIds.push(id);
    }
    const mkUnit = async (id: string, tenantId: string, tag: string) => {
      try { await insertRow("BusinessUnit", { id, tenantId, type: unitType, name: `หน่วยทริป ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, updatedAt: now() }); }
      catch (e) { if (unitType === "TRIPS") { unitType = "BOOKING"; await insertRow("BusinessUnit", { id, tenantId, type: unitType, name: `หน่วยทริป ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, updatedAt: now() }); } else throw e; }
    };
    await mkUnit(uA, tA, "a"); await mkUnit(uA2, tA, "a2"); await mkUnit(uB, tB, "b");
    const mkUser = async (tag: string, tenantId: string, role: "OWNER" | "STAFF", unitAccess: string[], permissions: Record<string, unknown>): Promise<Actor> => {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: now() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: now(), updatedAt: now() });
      return { role, unitAccess, permissions, userId: id };
    };
    OWNER_A = await mkUser("oa", tA, "OWNER", ["*"], {});
    OWNER_B = await mkUser("ob", tB, "OWNER", ["*"], {});
    STAFF_A = await mkUser("sa", tA, "STAFF", [uA], { "trips.settings.edit": true });
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const needOwnerA = (): Actor => { if (!OWNER_A) throw new AssertFail(`ไม่มีร้านชั่วคราว (${setupErr})`); return OWNER_A; };
  const needUnitTrips = () => { if (unitType !== "TRIPS") throw new AssertFail("ยังสร้างหน่วยชนิด TRIPS ไม่ได้ (enum ยังไม่ลง)"); };

  // แถวสินค้า/รอบ (pg ตรง)
  const pA1 = rid("pA1"), pA2 = rid("pA2"), pB1 = rid("pB1");
  const dA1 = rid("dA1"), dB1 = rid("dB1");
  let rowsErr = "";
  try {
    await needTable("TripProduct");
    const prod = (id: string, tenantId: string, unitId: string, slug: string) => insertRow("TripProduct", { id, tenantId, unitId, productType: "TOUR", sourceKind: "OWN", slug: `${slug}-${STAMP}`, status: "ACTIVE", title: JSON.stringify({ th: "ทดสอบ" }), body: "{}", currency: "THB", updatedAt: now() });
    await prod(pA1, tA, uA, "pa1"); await prod(pA2, tA, uA, "pa2"); await prod(pB1, tB, uB, "pb1");
    const dep = (id: string, tenantId: string, unitId: string, productId: string, day: number) => insertRow("TripDeparture", { id, tenantId, unitId, productId, localDate: ymd(new Date(Date.now() + day * DAY)), startsAt: new Date(Date.now() + day * DAY), endsAt: new Date(Date.now() + day * DAY + 8 * 3_600_000), status: "OPEN", capacity: 20, updatedAt: now() });
    await dep(dA1, tA, uA, pA1, 40); await dep(dB1, tB, uB, pB1, 40);
  } catch (e) { rowsErr = e instanceof AssertFail ? e.message : errMsg(e); }
  const needRows = () => { if (rowsErr) throw new AssertFail(`สร้างสินค้า/รอบทดสอบไม่ได้: ${rowsErr}`); };

  await st(`C-${ci++}`, "CHECK ปฏิเสธจริง (23514): สถานะนอกชุด · sold ติดลบ · เก็บแทนที่คิดคอมฯ · USD บนทัวร์ · ค่าถูกผ่าน", async () => {
    needRows();
    const cases: [string, () => Promise<unknown>, string][] = [
      ["TripDeparture.status=BOGUS", () => insertRow("TripDeparture", { tenantId: tA, unitId: uA, productId: pA1, localDate: "2027-05-01", startsAt: new Date("2027-05-01T02:00:00Z"), endsAt: new Date("2027-05-01T08:00:00Z"), status: "BOGUS", capacity: 5, updatedAt: now() }), "23514"],
      ["TripDeparture.sold=-1", () => insertRow("TripDeparture", { tenantId: tA, unitId: uA, productId: pA1, localDate: "2027-05-02", startsAt: new Date("2027-05-02T02:00:00Z"), endsAt: new Date("2027-05-02T08:00:00Z"), status: "OPEN", capacity: 5, sold: -1, updatedAt: now() }), "23514"],
      ["TripExtra passThrough+commissionable", () => insertRow("TripExtra", { tenantId: tA, unitId: uA, kind: "PARK_FEE", basis: "PER_PAX", priceMinor: 100, currency: "THB", passThrough: true, commissionable: true, discountable: false, taxKind: "NONE", updatedAt: now() }), "23514"],
      ["TripExtra passThrough ถูกต้อง", () => insertRow("TripExtra", { tenantId: tA, unitId: uA, kind: "PARK_FEE", basis: "PER_PAX", priceMinor: 100, currency: "THB", passThrough: true, commissionable: false, discountable: false, taxKind: "NONE", updatedAt: now() }), ""],
      ["TripProduct TOUR USD", () => insertRow("TripProduct", { tenantId: tA, unitId: uA, productType: "TOUR", sourceKind: "OWN", slug: `usd-${STAMP}`, status: "DRAFT", title: "{}", body: "{}", currency: "USD", updatedAt: now() }), "23514"],
      ["TripProduct LIVEABOARD USD", () => insertRow("TripProduct", { tenantId: tA, unitId: uA, productType: "LIVEABOARD", sourceKind: "OWN", slug: `usdla-${STAMP}`, status: "DRAFT", title: "{}", body: "{}", currency: "USD", updatedAt: now() }), ""],
      ["TripPaymentDue.status=PART_PAID (ของการจอง ไม่ใช่งวด)", () => insertRow("TripPaymentDue", { tenantId: tA, unitId: uA, bookingId: rid("b"), seq: 1, kind: "DEPOSIT", dueAt: now(), amountSatang: 100, status: "PART_PAID", updatedAt: now() }), "23514"],
    ];
    const bad: string[] = [];
    for (const [w, f, want] of cases) { const got = await tryCode(f); if (got !== want && !(want === "" && got === "")) bad.push(`${w}: ได้ ${got || "สำเร็จ"} ต้อง ${want || "สำเร็จ"}`); }
    ok(bad.length === 0, bad.slice(0, 3).join(" · "));
  });

  // ═══════════════ U. unique/index ═══════════════
  console.log("\n── U: unique · partial · NULLS NOT DISTINCT · EXCLUDE ──");
  await st("U-1", "pg_indexes: NND unique ของ TripDeparture/TripPrice/TripLinkStat ตรงคอลัมน์", async () => {
    const want: [string, string[]][] = [["TripDeparture", ["productId", "optionId", "startsAt"]], ["TripPrice", ["productId", "optionId", "paxTypeId", "cabinTypeId", "seasonId", "departureId", "currency", "weekdayMask", "bookFrom", "travelFrom"] /* ORACLE-EDIT U-1 (ผู้คุม 12 พ.ย.): มติรอบแก้ A1 ขยายคีย์ */], ["TripLinkStat", ["unitId", "day", "channel", "linkId"]]];
    const miss: string[] = [];
    for (const [t, c] of want) if (!(await hasIx(t, (r) => r.uniq && r.nnd && isDeepStrictEqual(r.cols, c) && !r.pred))) miss.push(t);
    ok(miss.length === 0, `ไม่มี NND unique: ${miss.join(", ")}`);
  });
  await st("U-2", "พฤติกรรม NND: รอบซ้ำ (productId, optionId=NULL, startsAt) ⇒ 23505", async () => {
    needRows();
    const s = new Date(Date.now() + 41 * DAY);
    const mk = () => insertRow("TripDeparture", { tenantId: tA, unitId: uA, productId: pA2, localDate: ymd(s), startsAt: s, endsAt: new Date(s.getTime() + 3_600_000), status: "OPEN", capacity: 5, updatedAt: now() });
    eq(await tryCode(mk), "", "แถวแรก");
    eq(await tryCode(mk), "23505", "แถวซ้ำ optionId NULL");
  });
  await st("U-3", "TripCheckin: partial unique (passengerId) WHERE result='FIRST' ใน pg_indexes + FIRST ซ้ำ 23505 · DUPLICATE ซ้ำได้", async () => {
    ok(await hasIx("TripCheckin", (r) => r.uniq && isDeepStrictEqual(r.cols, ["passengerId"]) && /FIRST/.test(r.pred ?? "")), "ไม่มี partial unique");
    const pid = rid("pax");
    const mk = (result: string) => () => insertRow("TripCheckin", { tenantId: tA, unitId: uA, passengerId: pid, deviceId: "dev", scannedAt: now(), receivedAt: now(), result, updatedAt: now() });
    eq([await tryCode(mk("FIRST")), await tryCode(mk("FIRST")), await tryCode(mk("DUPLICATE")), await tryCode(mk("DUPLICATE"))], ["", "23505", "", ""], "ผล");
  });
  await st("U-4", "TripHold: partial index (expiresAt) WHERE status='ACTIVE' · unique (tenantId, idempotencyKey)", async () => {
    ok(await hasIx("TripHold", (r) => !r.uniq && isDeepStrictEqual(r.cols, ["expiresAt"]) && /ACTIVE/.test(r.pred ?? "")), "ไม่มี partial index expiresAt");
    ok(await hasIx("TripHold", (r) => r.uniq && isDeepStrictEqual(r.cols, ["tenantId", "idempotencyKey"])), "ไม่มี unique (tenantId, idempotencyKey)");
  });
  await st("U-5", "TripResourceUse EXCLUDE: ทับเวลา active ⇒ 23P01 · ไม่ active ทับได้ · ต่อกันพอดี [) ได้", async () => {
    needRows();
    const res = rid("res");
    const t0 = new Date(Date.now() + 50 * DAY);
    const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);
    const mk = (s: Date, e: Date, active: boolean) => () => insertRow("TripResourceUse", { tenantId: tA, unitId: uA, resourceId: res, departureId: dA1, startsAt: s, endsAt: e, active, updatedAt: now() });
    eq([await tryCode(mk(h(0), h(4), true)), await tryCode(mk(h(2), h(6), true)), await tryCode(mk(h(2), h(6), false)), await tryCode(mk(h(4), h(8), true))], ["", "23P01", "", ""], "ผล");
  });
  await st("U-6", "unique อื่นตาม CC §B.1 (SellCounter · SellBasket · TripBooking code/token · TripMoneyEvent · TripCashClose · TripUnit · TripPaymentDue · TripPaxType · TripProduct slug)", async () => {
    const want: [string, string[]][] = [["SellCounter", ["tenantId", "series", "period"]], ["SellBasket", ["tenantId", "idempotencyKey"]], ["TripBooking", ["tenantId", "code"]], ["TripBooking", ["publicTokenHash"]],
      ["TripMoneyEvent", ["tenantId", "idempotencyKey"]], ["TripCashClose", ["unitId", "businessDate"]], ["TripUnit", ["departureId", "berthId"]], ["TripPaymentDue", ["bookingId", "seq"]], ["TripPaxType", ["productId", "code"]], ["TripProduct", ["tenantId", "slug"]]];
    const miss: string[] = [];
    for (const [t, c] of want) if (!(await hasIx(t, (r) => r.uniq && isDeepStrictEqual(r.cols, c) && !r.pred))) miss.push(`${t}(${c.join(",")})`);
    ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 4).join(" · ")}`);
  });

  // ═══════════════ X3. SellCounter ═══════════════
  console.log("\n── X3: SellCounter คำสั่ง §K พร้อมกัน 50 ทาง ──");
  await st("X3-1", "50 ทางพร้อมกัน (คำสั่ง CC §K ตรงตัว · tx แยก) ⇒ seq 1..50 ไม่ซ้ำ · แถวเดียว seq=50 · ร้าน B ชุดเดียวกันเริ่มที่ 1", async () => {
    needOwnerA();
    await needTable("SellCounter");
    const pool2 = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
    const alloc = async (tenantId: string): Promise<number> => {
      const c = await pool2.connect();
      try {
        await c.query("BEGIN");
        const r = await c.query<{ seq: number }>(`INSERT INTO "SellCounter" ("id","tenantId","series","period","seq") VALUES ($1, $2, $3, $4, 1)
          ON CONFLICT ("tenantId","series","period") DO UPDATE SET "seq" = "SellCounter"."seq" + 1 RETURNING "seq"`, [rid("sc"), tenantId, "QCT01", "6911"]);
        await c.query("COMMIT");
        return Number(r.rows[0]?.seq);
      } catch (e) { await c.query("ROLLBACK").catch(() => undefined); throw e; } finally { c.release(); }
    };
    try {
      const got = await Promise.all(Array.from({ length: 50 }, () => alloc(tA)));
      eq([...got].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1), "seq ที่ได้");
      const rows = await q<{ seq: number }>(`SELECT seq FROM "SellCounter" WHERE "tenantId" = $1 AND series = 'QCT01'`, [tA]);
      eq(rows.map((r) => r.seq), [50], "แถว");
      eq(await alloc(tB), 1, "ร้าน B");
    } finally { await pool2.end(); }
  });

  // ═══════════════ S. ไฟล์ · scope · ความบริสุทธิ์ ═══════════════
  console.log("\n── S: scope · client · ไฟล์ใหม่ · ขอบเขต ──");
  await st("S-1", "scope.ts: 33 โมเดลลงทะเบียน · SellBasket/SellCounter = tenant · ที่เหลือ = unit", () => {
    const scopeOf = fnOf(SCOPE, "scopeOf", "core/scope");
    const bad: string[] = [];
    for (const [t, s] of Object.entries(TABLES)) {
      let ax = "";
      try { ax = String(asRec(scopeOf(t))?.axis ?? ""); } catch { ax = "ไม่ลงทะเบียน"; }
      if (ax !== s.axis) bad.push(`${t}=${ax}`);
    }
    ok(bad.length === 0, `${bad.length} ตัว: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("S-2", "Prisma client รู้จักโมเดลใหม่ทั้ง 33 + AccountDocument.passThroughSatang", () => {
    const names = asRec(asRec(CLIENT?.Prisma)?.ModelName) ?? {};
    const miss = NEW_TABLES.filter((t) => !(t in names));
    ok(miss.length === 0, `client ไม่มี ${miss.length}: ${miss.slice(0, 5).join(", ")}`);
    const f = asRec(asRec(CLIENT?.Prisma)?.AccountDocumentScalarFieldEnum) ?? {};
    ok("passThroughSatang" in f, "client ไม่มี AccountDocument.passThroughSatang");
  });
  await st("S-3", "core/sellable.ts: ไม่มี import · PRODUCT_KINDS/SELL_CHANNELS/SELL_ERROR_CODES ตรง CC §C · isProductKind", () => {
    const src = read("src/lib/core/sellable.ts");
    ok(src, `ยังไม่มีไฟล์ (${SELLI.err.slice(0, 60)})`);
    ok(!/^\s*import\s/m.test(src), "มี import");
    const m = SELLI.mod;
    eq(m?.PRODUCT_KINDS, ["TRIP", "TICKET", "HOTEL"], "PRODUCT_KINDS");
    eq(m?.SELL_CHANNELS, SELL_CHANNELS, "SELL_CHANNELS");
    eq(m?.SELL_ERROR_CODES, ["VALIDATION", "NOT_FOUND", "FORBIDDEN", "KIND_NOT_SUPPORTED", "CURRENCY_NOT_ALLOWED", "SOLD_OUT", "INSUFFICIENT_ALLOTMENT", "BERTH_TAKEN", "SLOT_CLOSED", "CUTOFF_PASSED", "PRICE_CHANGED", "BELOW_MIN_SELL_PRICE", "DISCOUNT_OVER_CAP", "HOLD_EXPIRED", "HOLD_NOT_FOUND", "HOLD_LIMIT", "AGENT_SUSPENDED", "CREDIT_LIMIT", "REQUIRES_APPROVAL", "IDEMPOTENCY_CONFLICT", "RATE_LIMITED", "BUSY", "STATE_CONFLICT"], "SELL_ERROR_CODES");
    const is = fnOf(m, "isProductKind", "sellable");
    eq([is("TRIP"), is("HOTEL"), is("trip"), is(null)], [true, true, false, false], "isProductKind");
  });
  await st("S-4", "trips/json-schemas.ts (CC §N.2): ค่าถูกผ่าน · ค่าผิดตก (5 schema)", () => {
    const m = JSONSI.mod;
    ok(m, `ยังไม่มีไฟล์ (${JSONSI.err.slice(0, 60)})`);
    const sp = (name: string, v: unknown): boolean => { const s = asRec(m?.[name]); const f = s?.safeParse; ok(typeof f === "function", `ไม่มี ${name}`); return Boolean(asRec((f as AnyFn).call(s, v))?.success); };
    const cases: [string, unknown, boolean][] = [
      ["tripScheduleRuleSchema", { kind: "DAILY" }, true], ["tripScheduleRuleSchema", { kind: "WEEKLY", weekdays: [0, 6] }, true], ["tripScheduleRuleSchema", { kind: "WEEKLY", weekdays: [7] }, false], ["tripScheduleRuleSchema", { kind: "DATES", dates: ["2026-13-01"] }, false],
      ["tripScheduleExceptionsSchema", [{ date: "2026-11-14", action: "SKIP" }, { date: "2026-11-15", action: "OVERRIDE", capacity: 10, minPax: null }], true], ["tripScheduleExceptionsSchema", [{ date: "2026-11-14", action: "MAYBE" }], false],
      ["tripPriceRuleParamsSchema", { kind: "GROUP_TIER", tiers: [{ minPax: 4, discountBp: 500 }, { minPax: 10, discountBp: 1000 }] }, true], ["tripPriceRuleParamsSchema", { kind: "GROUP_TIER", tiers: [{ minPax: 10, discountBp: 500 }, { minPax: 4, discountBp: 1000 }] }, false],
      ["tripPriceRuleParamsSchema", { kind: "PROMO_CODE", code: "SEA10", discountBp: 1000, appliesTo: { channels: ["WEB"] } }, true], ["tripPriceRuleParamsSchema", { kind: "EARLY_BIRD", minDaysBefore: 30, discountBp: 20000 }, false],
      ["tripDepartureStopSellSchema", null, true], ["tripDepartureStopSellSchema", { channels: [], reason: "คลื่นลม" }, true], ["tripDepartureStopSellSchema", { channels: ["FAX"], reason: "x" }, false],
      ["tripDepartureInsuranceSchema", { insurer: "ก", policyNo: "P1", sumDeathSatang: 100_000_000, sumMedicalSatang: 50_000_000, coversDeepDive: true }, true], ["tripDepartureInsuranceSchema", { insurer: "ก", policyNo: "P1", sumDeathSatang: -1, sumMedicalSatang: 0, coversDeepDive: true }, false],
    ];
    const bad = cases.filter(([n, v, want]) => sp(n, v) !== want).map(([n, v, want]) => `${n}(${fmt(v).slice(0, 40)}) ต้อง ${want}`);
    ok(bad.length === 0, bad.slice(0, 3).join(" · "));
  });
  await st("S-5", "trips/index.ts facade: มีบล็อก `// TRIPS T0.1 ▸` · ไม่มี `export *` · json-schemas บริสุทธิ์ (import แค่ zod + core/sellable)", () => {
    const idx = read("src/lib/modules/trips/index.ts");
    ok(idx, "ยังไม่มี trips/index.ts");
    ok(/TRIPS T0\.1 ▸/.test(idx), "ไม่มีบล็อก TRIPS T0.1");
    ok(!/export\s+\*/.test(stripComments(idx)), "มี export *");
    const js = read("src/lib/modules/trips/json-schemas.ts");
    const imps = [...js.matchAll(/^\s*import[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    ok(imps.every((s) => s === "zod" || s === "@/lib/core/sellable"), `import ต้องห้าม: ${imps.join(", ")}`);
  });
  await st("S-6", "legal/th-tour-2569.ts บริสุทธิ์ (import type หรือไฟล์ในโฟลเดอร์ settings เท่านั้น · ไม่มี prisma/next/modules)", () => {
    const src = read("src/lib/core/settings/legal/th-tour-2569.ts");
    ok(src, "ยังไม่มีไฟล์");
    const bad = [...src.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]).filter((s) => !s.startsWith("./") && !s.startsWith("../") && s !== "zod");
    ok(bad.length === 0, `import ค่าต้องห้าม: ${bad.join(", ")}`);
    ok(!/@\/lib\/modules|@prisma|next\//.test(src), "ลาก modules/prisma/next");
  });
  await st("S-7", "ไม่มี `any` ในไฟล์ src ที่ใบนี้เพิ่ม/แก้", () => {
    const files = changedFiles(["src"]).filter((f) => /\.(ts|tsx)$/.test(f));
    ok(files.length > 0, "ยังไม่มีไฟล์ src ที่เปลี่ยน");
    const hits: string[] = [];
    for (const f of files) { const s = stripComments(read(f)); if (/:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(s)) hits.push(f); }
    ok(hits.length === 0, `มี any: ${hits.join(", ")}`);
  });
  await st("S-8", "เส้น import: โมดูล trips ไม่ import โมดูลอื่น (ใบนี้ไม่เพิ่ม ALLOWED_EDGES) · agency/supplier/ticket ไม่ import trips · fitness ไม่ถูกแก้", () => {
    ok(existsSync(join(ROOT, "src/lib/modules/trips")), "ยังไม่มีโฟลเดอร์ modules/trips");
    const walk = (dir: string): string[] => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [])) : []);
    const out = walk("src/lib/modules/trips").filter((f) => /@\/lib\/modules\/(?!trips\/)/.test(read(f)));
    ok(out.length === 0, `trips import โมดูลอื่น: ${out.join(", ")}`);
    const into = ["agency", "supplier", "ticket"].flatMap((m) => walk(`src/lib/modules/${m}`)).filter((f) => /@\/lib\/modules\/trips/.test(read(f)));
    ok(into.length === 0, `import trips: ${into.join(", ")}`);
    ok(changedFiles(["scripts/fitness.mts"]).length === 0, "fitness.mts ถูกแก้ (ORACLE-EDIT ผู้คุมเท่านั้น)");
  });
  await st("S-9", "permissions: trips.settings.edit + trips.settings.money ลงทะเบียนพร้อมป้ายไทย", () => {
    const keys = PERM?.PERMISSION_KEYS;
    ok(keys instanceof Set, "ไม่มี PERMISSION_KEYS");
    const label = fnOf(PERM, "permissionLabel", "permissions");
    const bad = ["trips.settings.edit", "trips.settings.money"].filter((k) => !(keys as Set<string>).has(k) || !THAI.test(String(label(k))));
    ok(bad.length === 0, `ขาด: ${bad.join(", ")}`);
  });
  await st("S-10", "types: SCOPE_KINDS ต่อท้าย VESSEL PRODUCT DEPARTURE AGENT_TIER AGENT (ชั้นเดิมไม่เปลี่ยนตำแหน่ง)", () => {
    const sk = (SET?.SCOPE_KINDS ?? []) as string[];
    eq(sk, ["TENANT", "UNIT", "BUILDING", "ROOM_TYPE", "ROOM", "LEASE", "RATE_PLAN", "STAFF", "SERVICE", "RESOURCE", "DEVICE", "COURSE", ...NEW_SCOPES], "SCOPE_KINDS");
  });
  await st("S-11", "facade legal/index.ts รวมทะเบียน rental + tour · isTourRuleId", () => {
    ok(LEGALIDX, "ยังไม่มี legal/index.ts");
    const is = fnOf(LEGALIDX, "isTourRuleId", "legal/index");
    eq([is("W01"), is("W46"), is("W47"), is("DEPOSIT_RETURN_DAYS")], [true, true, false, false], "isTourRuleId");
  });
  await st("S-12", "ไม่แตะ POS · โรงแรม · หอ · จองคิว · defs/rooms · defs/booking · legal/th-rental-2568 · seed/ฟิกซ์เจอร์ P0.1", () => {
    const ch = changedFiles(["src/lib/modules/pos", "src/lib/modules/hotel", "src/lib/modules/dorm", "src/lib/modules/booking", "src/lib/core/settings/defs/rooms.ts", "src/lib/core/settings/defs/booking.ts", "src/lib/core/settings/legal/th-rental-2568.ts", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts"]); // ORACLE-EDIT S-12 (ผู้คุม 12 พ.ย.): เอา qc-trips-p0.1.mts ออก — ผู้คุมแก้ไฟล์นั้นเอง (cast env)
    ok(ch.length === 0, `แตะ: ${ch.join(", ")}`);
  });

  // ═══════════════ R. ทะเบียน ═══════════════
  console.log("\n── R: ทะเบียนค่าตั้ง trips ──");
  await st("R-1", "doc-sync: ชุดคีย์ + ชั้น ที่ parse จาก TRIPS-DEFAULTS (§1 + ภาคผนวก ก · trips.*) = รายการฝังในข้อสอบ", () => {
    const md = read("ledger/TRIPS-DEFAULTS.md");
    const got: Record<string, string[]> = {};
    for (const line of md.split("\n")) {
      const m = /^\|\s*(T\d+|X\d+)\s*\|/.exec(line);
      if (!m) continue;
      const cells = line.split(/(?<!\\)\|/).map((c) => c.trim()); // `\|` ในเซลล์ไม่ใช่ตัวแบ่ง
      const keys = [...(cells[2] ?? "").matchAll(/`(trips\.[^`]+)`/g)].map((x) => x[1]);
      const chain = [...(cells[6] ?? "").replace(/\([^)]*\)/g, "").matchAll(/\b(SHOP|PRODUCT|DEPARTURE|AGENT_TIER|AGENT|VESSEL)\b/g)].map((x) => (x[1] === "SHOP" ? U : x[1]));
      for (const k of keys) got[k === "trips.msg.<kind>" ? "trips.msg.<kind>" : k] = chain;
    }
    const want: Record<string, string[]> = {};
    for (const e of EXPECT) want[e.code === "T70" ? "trips.msg.<kind>" : e.key] = e.chain;
    const diff = [...new Set([...Object.keys(got), ...Object.keys(want)])].filter((k) => !isDeepStrictEqual(got[k], want[k])).map((k) => `${k}: doc ${fmt(got[k])} ข้อสอบ ${fmt(want[k])}`);
    ok(Object.keys(got).length >= 90, `parse ได้แค่ ${Object.keys(got).length} คีย์ (positive control ของ parser)`);
    ok(diff.length === 0, `ไม่ตรง ${diff.length}: ${diff.slice(0, 3).join(" · ")}`);
  });
  await st("R-2", `ทุกคีย์ที่คาด (${EXPECT.length}) ลงทะเบียน · domain trips · ไม่มีคีย์ trips เกิน`, () => {
    const listDefs = fnOf(needSet(), "listDefs", "settings");
    const regs = ((listDefs("trips") as unknown[]) ?? []).map((d) => String(asRec(d)?.key));
    const miss = EXPECT.filter((e) => !regs.includes(e.key)).map((e) => e.key);
    const extra = regs.filter((k) => !EXPECT.some((e) => e.key === k));
    ok(miss.length === 0, `ขาด ${miss.length}/${EXPECT.length}: ${miss.slice(0, 4).join(", ")}`);
    ok(extra.length === 0, `เกิน: ${extra.join(", ")}`);
  });
  await st("R-3", "ชนิด (type) ตรงใบสั่ง §4 ทุกคีย์ · คีย์ nullable รับ null", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if (d.type !== e.type) bad.push(`${e.key}=${String(d.type)}`);
      const sch = asRec(d.schema);
      const sp = sch?.safeParse;
      if (e.nullable && !(typeof sp === "function" && asRec((sp as AnyFn).call(sch, null))?.success === true)) bad.push(`${e.key} ไม่รับ null`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
  });
  await st("R-4", "ชั้น (chain) ตรง TRIPS-DEFAULTS ทุกคีย์ (SHOP = UNIT)", () => {
    const bad = EXPECT.filter((e) => !isDeepStrictEqual(getDef(e.key)?.chain, e.chain)).map((e) => `${e.key}=${fmt(getDef(e.key)?.chain)}`);
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  await st("R-5", "ค่าเริ่มต่อแม่แบบ (DS/DT/LA/AT) ตรงรายการฝัง · _fallback = DIVE_SHOP", () => {
    const bad: string[] = [];
    for (const [key, x] of Object.entries(DEF)) {
      const d = getDef(key);
      if (!d) { bad.push(`${key}(ไม่มี)`); continue; }
      const dv = asRec(d.defaults) ?? {};
      const want: Record<string, unknown> = { DIVE_SHOP: x.v[0], DAY_TOUR: x.v[1], LIVEABOARD: x.v[2], ATTRACTION: "at" in x ? x.at : x.v[1], _fallback: x.v[0] };
      for (const [t, w] of Object.entries(want)) if (!isDeepStrictEqual(dv[t], w)) bad.push(`${key}.${t}=${fmt(dv[t])}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
  });
  await st("R-6", "ทุก def มีค่า 4 แม่แบบ + _fallback = DIVE_SHOP · ค่าผ่าน schema · รูปพิเศษ (T44 อุทยานเก็บแทน · T45 4 กลุ่ม · T29 · T69 14 ชนิด)", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const dv = asRec(d.defaults) ?? {};
      for (const t of [...TPLS, "_fallback"]) if (!(t in dv)) bad.push(`${e.key}.${t}`);
      if (!isDeepStrictEqual(dv._fallback, dv.DIVE_SHOP)) bad.push(`${e.key}._fallback≠DS`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 5).join(", ")}`);
    const lineDef = asRec(asRec(needDef("trips.line.defaults").defaults)?.DIVE_SHOP);
    eq(asRec(lineDef?.PARK_FEE), { passThrough: true, commissionPct: 0, discountable: false }, "T44 PARK_FEE");
    eq(Object.keys(lineDef ?? {}).sort(), ["COURSE", "EQUIPMENT", "FUEL", "INSURANCE", "NITROX", "OTHER", "PARK_FEE", "PORT_FEE", "TRANSFER"], "T44 ชนิด");
    const park = asRec(asRec(needDef("trips.parkFee.table").defaults)?.DIVE_SHOP);
    const g = (park?.groups ?? []) as Rec[];
    eq([park?.confirmedAt, g.length, g[3]?.foreignAdultSatang, g[0]?.thaiAdultSatang, park?.diveSatangPerPaxDay], [null, 4, 50_000, 2_000, 20_000], "T45");
    const fields = asRec(asRec(needDef("trips.pax.fields").defaults)?.LIVEABOARD);
    eq([fields?.docNumber, fields?.birthPlace, fields?.finSize], ["REQUIRED", "REQUIRED_CROSS_BORDER", "OFF"], "T29 LA");
  });
  await st("R-7", "แม่แบบ trips: DIVE_SHOP DAY_TOUR LIVEABOARD ATTRACTION · version 1 · ป้ายไทย", () => {
    const t = ((asRec(SET?.TEMPLATES)?.trips ?? []) as Rec[]).map((x) => [x.key, x.version, THAI.test(String(x.labelTh))]);
    eq(t, TPLS.map((k) => [k, 1, true]), "TEMPLATES.trips");
  });
  await st("R-8", "unitTypes ['TRIPS'] ทุก def · group = ส่วนที่ 2 ของคีย์ · ป้ายกลุ่มไทยครบ", () => {
    const groupLabelTh = fnOf(needSet(), "groupLabelTh", "settings");
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if (!isDeepStrictEqual(d.unitTypes, ["TRIPS"])) bad.push(`${e.key}.unitTypes`);
      if (d.group !== e.key.split(".")[1]) bad.push(`${e.key}.group`);
      if (!THAI.test(String(groupLabelTh("trips", String(d.group)) ?? ""))) bad.push(`ป้ายกลุ่ม ${String(d.group)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${[...new Set(bad)].slice(0, 5).join(", ")}`);
  });
  await st("R-9", "sensitivity ตามกลุ่ม (tax/giftcard/consumer LEGAL · pay/price/cash MONEY · pdpa/waiver PRIVACY) · editPermission (เงิน = trips.settings.money)", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const g = e.key.split(".")[1];
      // ORACLE-EDIT R-9 (ผู้คุม 12 พ.ย.): มติรอบแก้ B4 — 3 คีย์นี้เป็น MONEY + trips.settings.money แม้กลุ่มของมันไม่ใช่กลุ่มเงิน
      if (["trips.fx.rates", "trips.cancel.autoApproveUpTo", "trips.cancel.manualEditApprovalSatang"].includes(e.key)) { if (d.sensitivity !== "MONEY" || d.editPermission !== "trips.settings.money") bad.push(`${e.key}: ต้องเป็น MONEY + trips.settings.money`); continue; }
      if ((d.sensitivity ?? null) !== (SENS[g] ?? null)) bad.push(`${e.key}.sensitivity=${String(d.sensitivity)}`);
      const wantPerm = SENS[g] === "MONEY" ? "trips.settings.money" : "trips.settings.edit";
      if (SENS[g] !== "LEGAL" && d.editPermission !== wantPerm) bad.push(`${e.key}.editPermission=${String(d.editPermission)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  await st("R-10", "percentScale 100 · effectiveDated · ซ่อน PHASE_2 ตรงรายการ (ไม่มีเกิน)", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      if ((d.percentScale === 100) !== PERCENT100.includes(e.key)) bad.push(`${e.key}.percentScale=${String(d.percentScale)}`);
      if ((d.effectiveDated === true) !== EFFECTIVE_DATED.includes(e.key)) bad.push(`${e.key}.effectiveDated`);
      if ((d.hiddenUntil === "PHASE_2") !== HIDDEN.includes(e.key) || (d.hiddenUntil !== undefined && d.hiddenUntil !== "PHASE_2")) bad.push(`${e.key}.hiddenUntil=${String(d.hiddenUntil)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  await st("R-11", "ข้อความ: trips.msg.enabled 14 ชนิด · 10 แม่แบบ trips.msg.<ชนิดลูกค้า> + templateVars 9 ตัว · ข้อความไทย", () => {
    const en = asRec(asRec(needDef("trips.msg.enabled").defaults)?.DIVE_SHOP);
    eq(Object.keys(en ?? {}).sort(), [...MSG_CUSTOMER, ...MSG_SHOP].sort(), "ชนิดใน msg.enabled");
    const vars = ["ร้าน", "สินค้า", "วันเดินทาง", "เวลารับ", "จุดนัด", "ยอดค้าง", "ครบกำหนด", "ลิงก์", "รหัสจอง"];
    const bad: string[] = [];
    for (const k of MSG_CUSTOMER) {
      const d = getDef(`trips.msg.${k}`);
      if (!d) { bad.push(k); continue; }
      if (!isDeepStrictEqual([...((d.templateVars ?? []) as string[])].sort(), [...vars].sort())) bad.push(`${k}.templateVars`);
      if (!THAI.test(String(asRec(asRec(d.defaults)?.DIVE_SHOP)?.th ?? ""))) bad.push(`${k}.th`);
    }
    ok(bad.length === 0, bad.slice(0, 5).join(", "));
    ok(!MSG_SHOP.some((k) => getDef(`trips.msg.${k}`)), "มีแม่แบบข้อความถึงร้าน (§7 ข้อ 20 ไม่มี)");
  });
  await st("R-12", `snapshot "trips.booking" = CC §N.3 ตรงตัว (${SNAP_TRIPS.length} คีย์)`, () => {
    eq([...((asRec(SET?.SNAPSHOT_KEYS)?.["trips.booking"] ?? []) as string[])].sort(), [...SNAP_TRIPS].sort(), "SNAPSHOT_KEYS");
  });
  await st("R-13", "ป้าย reviewHint: ACCOUNTANT 8 คีย์ · AUTHORITY 8 คีย์พร้อมชื่อหน่วยงาน · คีย์อื่นไม่มีป้าย", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const want = HINT_ACCOUNTANT.includes(e.key) ? "ACCOUNTANT" : e.key in HINT_AUTHORITY ? "AUTHORITY" : undefined;
      if (d.reviewHint !== want) bad.push(`${e.key}.reviewHint=${String(d.reviewHint)}`);
      if (want === "AUTHORITY" && d.reviewAuthorityTh !== HINT_AUTHORITY[e.key]) bad.push(`${e.key}.reviewAuthorityTh=${String(d.reviewAuthorityTh)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  await st("R-14", "legal ต่อคีย์ตรงใบสั่ง §4.4 (14 คีย์) · คีย์อื่นไม่มี legal", () => {
    const bad: string[] = [];
    for (const e of EXPECT) {
      const d = getDef(e.key);
      if (!d) { bad.push(`${e.key}(ไม่มี)`); continue; }
      const got = [...((d.legal ?? []) as string[])].sort();
      if (!isDeepStrictEqual(got, [...(LEGAL_BY_KEY[e.key] ?? [])].sort())) bad.push(`${e.key}=${fmt(got)}`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  await st("R-15", "defineSettings: def trips อ้าง rule ของหอ / rule ไม่รู้จัก ⇒ โยน · rule tour บน def ถูกรูป ⇒ ลงได้", () => {
    const def = fnOf(needSet(), "defineSettings", "settings");
    ok(getDef("trips.cancel.ladder"), "ยังไม่มีโดเมน trips");
    const z = needDef("trips.fx.rateSource").schema;
    const mk = (key: string, legal: string[]) => ({ key, domain: "trips", group: "qct01", type: "enum", schema: z, defaults: { _fallback: "BOT_REF" }, chain: [U], editPermission: "trips.settings.edit", labelTh: "ทดสอบ", unitTypes: ["TRIPS"], legal });
    const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
    ok(throws(() => def("trips", [mk(`trips.qct01.r${STAMP}`, ["DEPOSIT_RETURN_DAYS"])])), "รับ rule ของหอ");
    ok(throws(() => def("trips", [mk(`trips.qct01.u${STAMP}`, ["W99"])])), "รับ rule ไม่รู้จัก");
    ok(!throws(() => def("trips", [mk(`trips.qct01.ok${STAMP}`, ["W20"])])), "ไม่รับ rule tour ที่ค่าเริ่มไม่เตือน");
  });
  await st("R-16", "ค่าเริ่มทุกแม่แบบของคีย์ที่มี legal ⇒ evaluateTourRule = OK (ไม่มีค่าเริ่มที่เตือน)", () => {
    const ev = fnOf(needTour(), "evaluateTourRule", "th-tour");
    const bad: string[] = [];
    for (const [key, rules] of Object.entries(LEGAL_BY_KEY)) {
      const d = getDef(key);
      if (!d) { bad.push(`${key}(ไม่มี)`); continue; }
      for (const t of [...TPLS, "_fallback"]) {
        const v = asRec(d.defaults)?.[t];
        for (const r of rules) {
          const input = r === "W03" ? { ladder: v, depositPct: asRec(asRec(getDef("trips.pay.depositPct")?.defaults))?.[t] } : v;
          const o = asRec(ev(r, input));
          if (o?.level !== "OK") bad.push(`${key}.${t}/${r}=${String(o?.level)}:${String(o?.code)}`);
        }
      }
    }
    ok(bad.length === 0, bad.slice(0, 4).join(", "));
  });

  // ═══════════════ L. th-tour-2569 ═══════════════
  console.log("\n── L: ตัวตรวจกฎหมายทัวร์ (OK/WARN เท่านั้น) ──");
  const ev = (id: string, input: unknown): Rec => asRec(fnOf(needTour(), "evaluateTourRule", "th-tour")(id, input)) ?? {};
  await st("L-1", "TH_TOUR_2569_RULES = W01–W46 ครบ · maxLevel WARN · ข้อความไทย · citation · checkpoint ตรงใบสั่ง", () => {
    const rules = asRec(needTour().TH_TOUR_2569_RULES) ?? {};
    eq(Object.keys(rules).sort(), ALL_RULES, "id");
    eq(needTour().TOUR_RULE_IDS, ALL_RULES, "TOUR_RULE_IDS");
    const bad: string[] = [];
    for (const id of ALL_RULES) {
      const r = asRec(rules[id]) ?? {};
      if (r.maxLevel !== "WARN") bad.push(`${id}.maxLevel`);
      if (!THAI.test(String(r.messageTh ?? ""))) bad.push(`${id}.messageTh`);
      if (!String(r.citation ?? "").trim()) bad.push(`${id}.citation`);
      if (r.checkpoint !== (SETTINGS_RULES.includes(id) ? "SETTINGS" : "RUNTIME")) bad.push(`${id}.checkpoint=${String(r.checkpoint)}`);
    }
    ok(bad.length === 0, bad.slice(0, 5).join(", "));
  });
  await st("L-2", "severity: HIGH = W01 W02 W16 W24 W32 · HIGHEST = W22 · ที่เหลือ NORMAL · pendingReview ตามรายการ", () => {
    const rules = asRec(needTour().TH_TOUR_2569_RULES) ?? {};
    const bad: string[] = [];
    for (const id of ALL_RULES) {
      const r = asRec(rules[id]) ?? {};
      const want = SEV_HIGHEST.includes(id) ? "HIGHEST" : SEV_HIGH.includes(id) ? "HIGH" : "NORMAL";
      if (r.severity !== want) bad.push(`${id}.severity=${String(r.severity)}`);
      if ((r.pendingReview === true) !== PENDING_REVIEW.includes(id)) bad.push(`${id}.pendingReview`);
    }
    ok(bad.length === 0, bad.slice(0, 5).join(", "));
  });
  await st("L-3", "property: 46 rule × อินพุตสุ่ม/ผิดรูป ≥ 40 แบบ ⇒ ไม่ throw · level ∈ {OK, WARN} · ไม่มี BLOCK · severity ถูกชนิด", () => {
    const deep: Rec = {}; let cur: Rec = deep; for (let i = 0; i < 50; i++) { cur.x = {}; cur = cur.x as Rec; }
    const gen: unknown[] = [undefined, null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e15, "", "W01", "ไม่รับผิดชอบทุกกรณี", true, false, [], [null], [{}], {}, { hit: true }, { hit: "yes" }, { hit: false, vars: 5 },
      [{ fromDaysBefore: "a", refundPct: 1 }], [{ fromDaysBefore: 30, refundPct: -5 }], [{ fromDaysBefore: 30, refundPct: 500 }], { ladder: "x", depositPct: "y" }, { ladder: LADDER, depositPct: -1 }, { EXTERNAL: "100" },
      { th: 123 }, { th: null, en: [] }, { mode: 42 }, { viaAgent: null }, { scuba: "4" }, { deathDisabilitySatang: "1" }, { confirmedAt: "not-a-date", groups: 5 }, { confirmedAt: "1999-01-01" },
      { freeBelow: null }, { taxDocsDays: -1 }, Array.from({ length: 2000 }, (_, i) => ({ fromDaysBefore: i, refundPct: i % 101 })), JSON.parse('{"__proto__":{"polluted":1}}'), deep, () => 1, new Date(), Symbol("s"), BigInt(5)];
    const bad: string[] = [];
    let n = 0;
    for (const id of [...ALL_RULES, "W00", "W47", "", "DEPOSIT_RETURN_DAYS"]) for (const [i, inp] of gen.entries()) {
      n++;
      let o: Rec;
      try { o = ev(id, inp); } catch (e) { if (e instanceof AssertFail) throw e; bad.push(`${id}#${i} throw ${errMsg(e).slice(0, 40)}`); continue; }
      if (o.level !== "OK" && o.level !== "WARN") bad.push(`${id}#${i} level=${String(o.level)}`);
      if (!["NORMAL", "HIGH", "HIGHEST"].includes(String(o.severity))) bad.push(`${id}#${i} severity=${String(o.severity)}`);
    }
    ok(n > 1900, `ทดสอบแค่ ${n}`);
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(" · ")}`);
    ok(({} as Rec).polluted === undefined, "prototype ถูกปนเปื้อน");
  });
  await st("L-4", "rule ไม่รู้จัก / อินพุตผิดรูป ⇒ WARN `INVALID_INPUT_WARN` severity NORMAL (ไม่ใช่ BLOCK)", () => {
    const cases: [string, unknown][] = [["W00", {}], ["W47", LADDER], ["", null], ["DEPOSIT_RETURN_DAYS", { days: 30 }], ["W01", "ไม่ใช่ตาราง"], ["W25", { deathDisabilitySatang: "หนึ่งล้าน" }], ["W38", 42], ["W04", "x"]];
    const bad = cases.map(([id, i]) => [id, ev(id, i)] as const).filter(([, o]) => !(o.level === "WARN" && o.code === "INVALID_INPUT_WARN" && o.severity === "NORMAL")).map(([id, o]) => `${id}=${String(o.level)}/${String(o.code)}`);
    ok(bad.length === 0, bad.join(", "));
  });
  await st("L-5", `rule RUNTIME (${RUNTIME_RULES.length} ข้อ): {hit:true} ⇒ WARN code = id · {hit:false} ⇒ OK · vars แทนในข้อความ`, () => {
    const bad: string[] = [];
    for (const id of RUNTIME_RULES) {
      const w = ev(id, { hit: true, vars: { "ช่วงวัน": "15–29 วัน", "รายการ": "ก", "ชื่อ": "ข", "วันที่": "1 ม.ค.", "ยอด": "1", "สิ่งที่ขาด": "x", "อัตรา": "1:4", "รายชื่อและช่องที่ขาด": "y" } });
      const k = ev(id, { hit: false });
      if (w.level !== "WARN" || w.code !== id) bad.push(`${id} hit=${String(w.level)}/${String(w.code)}`);
      if (k.level !== "OK") bad.push(`${id} nohit=${String(k.level)}`);
      if (/\{[^}]*\}/.test(String(w.messageTh ?? "")) && id !== "W21") bad.push(`${id} vars ไม่ถูกแทน`);
    }
    ok(bad.length === 0, `${bad.length}: ${bad.slice(0, 4).join(", ")}`);
  });
  const fires = (id: string, hit: unknown[], miss: unknown[]) => () => {
    const bad: string[] = [];
    for (const h of hit) { const o = ev(id, h); if (o.level !== "WARN" || o.code !== id) bad.push(`ต้องเตือน ${fmt(h).slice(0, 60)} ได้ ${String(o.level)}/${String(o.code)}`); }
    for (const m of miss) { const o = ev(id, m); if (o.level !== "OK") bad.push(`ต้องไม่เตือน ${fmt(m).slice(0, 60)} ได้ ${String(o.level)}/${String(o.code)}`); }
    ok(bad.length === 0, bad.slice(0, 2).join(" · "));
  };
  const L = (from: number, pct: number) => ({ fromDaysBefore: from, refundPct: pct });
  const OLD = new Date(Date.now() - 200 * DAY).toISOString().slice(0, 10), FRESH = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10);
  const PARK = (confirmedAt: string | null) => ({ confirmedAt, groups: [{ code: "G1", nameTh: "กลุ่ม 1", thaiChildSatang: 1000, thaiAdultSatang: 2000, foreignChildSatang: 5000, foreignAdultSatang: 10000 }], diveSatangPerPaxDay: 20000, mooring: { upTo20Satang: 100000, from21Satang: 200000 } });
  const AGE = { freeBelow: 3, childFrom: 3, childTo: 14, adultFrom: 15, thaiSeniorFreeFrom: 60, childByHeightCm: 140 };
  const RET = { passportImageDays: 30, medicalFormDays: 365, riskAckDays: 1095, consentAccessLogDays: 1095, manifestDays: 365, taxDocsDays: 1825 };
  await st("L-6", "W01 ตารางยกเลิก: ต่ำกว่าขั้นต่ำ (≥30 = 100 · 15–29 = 50) ⇒ เตือน · เท่าหรือดีกว่าลูกค้า ⇒ ไม่", fires("W01",
    [[L(30, 100), L(15, 40), L(0, 0)], [L(45, 100), L(0, 0)], [L(30, 90), L(15, 50), L(0, 0)], [L(20, 50), L(0, 0)]],
    [LADDER, [L(7, 100), L(0, 50)], [L(0, 100)], [L(60, 100), L(30, 100), L(15, 50), L(0, 0)]]));
  await st("L-7", "W02 ยกเลิกไม่ใช่ลูกค้า < 100% ⇒ เตือน", fires("W02", [{ EXTERNAL: 90, MIN_NOT_MET: 100, SHOP_FAULT: 100 }, { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 0 }], [{ EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 }]));
  await st("L-8", "W03 มัดจำริบได้: เงื่อนไข W01 + depositPct > 0", fires("W03",
    [{ ladder: [L(30, 50), L(0, 0)], depositPct: 30 }, { ladder: [L(0, 0)], depositPct: 100 }],
    [{ ladder: [L(30, 50), L(0, 0)], depositPct: 0 }, { ladder: LADDER, depositPct: 30 }, { ladder: LADDER, depositPct: 100 }]));
  await st("L-9", "W14 ผ่านเอเจนซี่ไม่ใช่ FULL_ONLY · W15 ออกใบลดหนี้ · W16 ปิดออกเอกสารทุกงวด · W17 ค่าเสียหายมี VAT", () => {
    fires("W14", [{ direct: "SHORT_UPGRADE_ON_REQUEST", viaAgent: "SHORT_UPGRADE_ON_REQUEST" }], [{ direct: "SHORT_UPGRADE_ON_REQUEST", viaAgent: "FULL_ONLY" }, { direct: "FULL_ONLY", viaAgent: "FULL_ONLY" }])();
    fires("W15", ["CREDIT_NOTE_PLUS_DAMAGES_RECEIPT"], ["NO_AUTO_CREDIT_NOTE"])();
    fires("W16", [false], [true])();
    fires("W17", ["SERVICE_WITH_VAT"], ["DAMAGES_NO_VAT_NO_WHT"])();
  });
  await st("L-10", "W18 ยกเว้น VAT · W20 แหล่งอัตรา BANK_DAILY_BUY · W25 วงเงินประกันต่ำ · W26 อัตราผู้ควบคุมหลวม", () => {
    fires("W18", [{ mode: "EXEMPT_81_1_N", rateBp: 0 }], [{ mode: "STANDARD", rateBp: 700 }])();
    fires("W20", ["BANK_DAILY_BUY"], ["BOT_REF"])();
    fires("W25", [{ deathDisabilitySatang: 99_999_999, injurySatang: 50_000_000 }, { deathDisabilitySatang: 100_000_000, injurySatang: 1 }], [{ deathDisabilitySatang: 100_000_000, injurySatang: 50_000_000 }, { deathDisabilitySatang: 200_000_000, injurySatang: 90_000_000 }])();
    fires("W26", [{ scuba: 5, trial: 2, course: 4, snorkel: 20 }, { scuba: 4, trial: 3, course: 4, snorkel: 20 }, { scuba: 4, trial: 2, course: 4, snorkel: 21 }], [{ scuba: 4, trial: 2, course: 4, snorkel: 20 }, { scuba: 2, trial: 1, course: 2, snorkel: 10 }])();
  });
  await st("L-11", "W29 ตารางอุทยานยืนยันเก่ากว่า 180 วัน (null = ไม่เตือน) · W30 ช่วงอายุต่างระเบียบ · W33 ไม่ลบ/ภาษี < 5 ปี", () => {
    fires("W29", [PARK(OLD)], [PARK(null), PARK(FRESH)])();
    fires("W30", [{ ...AGE, childTo: 12 }, { ...AGE, thaiSeniorFreeFrom: 65 }], [AGE])();
    fires("W33", [{ ...RET, passportImageDays: null }, { ...RET, taxDocsDays: 1000 }], [RET, { ...RET, passportImageDays: 7 }])();
  });
  await st("L-12", "W38 แม่แบบรับทราบความเสี่ยงมีถ้อยคำยกเว้นความรับผิด (th/en · ช่องว่าง/ตัวพิมพ์ไม่มีผล) · ค่าเริ่มไม่เตือน · WAIVER_FORBIDDEN_TERMS ส่งออก", () => {
    const terms = needTour().WAIVER_FORBIDDEN_TERMS;
    ok(Array.isArray(terms) && terms.length >= 8, `WAIVER_FORBIDDEN_TERMS: ${fmt(terms)}`);
    const base = asRec(asRec(getDef("trips.waiver.template")?.defaults)?.DIVE_SHOP) ?? { th: "ข้าพเจ้ารับทราบความเสี่ยงของกิจกรรมดำน้ำ" };
    fires("W38", [{ th: `${String(base.th)} ผู้จัดไม่รับผิดชอบ ทุกกรณี` }, { th: "รับทราบ", en: "Participants WAIVE ALL CLAIMS against the operator" }, { th: "ข้าพเจ้าสละสิทธิ์เรียกร้องใด ๆ" }], [base, { th: "ข้าพเจ้ารับทราบความเสี่ยงและแถลงข้อมูลสุขภาพตามจริง" }])();
  });
  await st("L-13", "ผลมีรูปครบ {level, code, messageTh, citation, severity} · pendingReview เฉพาะ rule ที่ติด (W15 มี · W01 ไม่มี)", () => {
    const w = ev("W15", "CREDIT_NOTE_PLUS_DAMAGES_RECEIPT");
    const k = ev("W01", [L(30, 0), L(0, 0)]);
    ok(THAI.test(String(w.messageTh)) && String(w.citation).length > 0 && w.pendingReview === true, `W15: ${fmt(w)}`);
    ok(k.pendingReview === undefined && k.severity === "HIGH", `W01: ${fmt(k)}`);
    eq(Object.keys(ev("W02", { EXTERNAL: 100, MIN_NOT_MET: 100, SHOP_FAULT: 100 })).filter((x) => ["level", "code", "messageTh", "citation", "severity"].includes(x)).length, 5, "ช่องของผล OK");
  });

  // ═══════════════ RS. ลำดับชั้นบนฐานจริง ═══════════════
  console.log("\n── RS: แม่แบบ → ร้าน → สินค้า → รอบ (ฐานจริง) ──");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const BAL = "trips.pay.balanceDueDaysBefore";
  const S = <T,>(name: string) => fnOf(needSet(), name, "settings") as (...a: unknown[]) => Promise<T>;
  const resolveV = async (ctx: { tenantId: string }, key: string, refs: Rec) => asRec(await S<unknown>("resolveSetting")(ctx, key, refs)) ?? {};
  const setV = async (actor: Actor, ctx: { tenantId: string }, changes: Rec[], opts?: Rec) => asRec(await S<unknown>("setSettings")(actor, ctx, changes, opts ?? {})) ?? {};
  const pre = () => { needOwnerA(); needRows(); needDef(BAL); };
  await st("RS-1", "applyTemplate LIVEABOARD ⇒ T15 = 60 · T5 = 30 (source TEMPLATE) · DIVE_SHOP ⇒ T5 15", async () => {
    pre();
    const o = needOwnerA();
    const r = asRec(await S<unknown>("applyTemplate")(o, ctxA, { unitId: uA, domain: "trips", templateKey: "LIVEABOARD", overwrite: "RESET_ALL" }));
    ok(r?.ok === true, `applyTemplate: ${fmt(r)}`);
    const a = await resolveV(ctxA, BAL, { unitId: uA });
    const b = await resolveV(ctxA, "trips.sell.holdMinutes", { unitId: uA });
    eq([a.value, a.source, b.value], [60, "TEMPLATE", 30], "LIVEABOARD");
    ok(asRec(await S<unknown>("applyTemplate")(o, ctxA, { unitId: uA2, domain: "trips", templateKey: "DIVE_SHOP", overwrite: "KEEP_CUSTOM" }))?.ok === true, "DIVE_SHOP uA2");
    eq((await resolveV(ctxA, "trips.sell.holdMinutes", { unitId: uA2 })).value, 15, "DIVE_SHOP T5");
  });
  await st("RS-2", "ชั้นร้าน (UNIT) 45 ชนะแม่แบบ · ชั้นสินค้า 40 ชนะร้าน · สินค้าอื่นยังได้ 45 · ชั้นรอบ 30 ชนะสินค้า", async () => {
    pre();
    const o = needOwnerA();
    const w = await setV(o, ctxA, [{ key: BAL, scope: "UNIT", scopeId: uA, value: 45 }, { key: BAL, scope: "PRODUCT", scopeId: pA1, value: 40 }, { key: BAL, scope: "DEPARTURE", scopeId: dA1, value: 30 }]);
    ok(w.ok === true, `setSettings: ${fmt(w)}`);
    const r1 = await resolveV(ctxA, BAL, { unitId: uA });
    const r2 = await resolveV(ctxA, BAL, { unitId: uA, productId: pA1 });
    const r3 = await resolveV(ctxA, BAL, { unitId: uA, productId: pA2 });
    const r4 = await resolveV(ctxA, BAL, { unitId: uA, productId: pA1, departureId: dA1 });
    eq([[r1.value, r1.source], [r2.value, r2.source], [r3.value, r3.source], [r4.value, r4.source]], [[45, "UNIT"], [40, "PRODUCT"], [45, "UNIT"], [30, "DEPARTURE"]], "ลำดับชั้น");
  });
  await st("RS-3", "ล้างค่า = ตามชั้นบน: ล้าง DEPARTURE ⇒ 40 PRODUCT · ล้าง PRODUCT ⇒ 45 UNIT · ล้าง UNIT ⇒ 60 TEMPLATE", async () => {
    pre();
    const o = needOwnerA();
    const reset = async (scope: string, scopeId: string) => asRec(await S<unknown>("resetSetting")(o, ctxA, { key: BAL, scope, scopeId }));
    const refs = { unitId: uA, productId: pA1, departureId: dA1 };
    const out: unknown[] = [];
    ok((await reset("DEPARTURE", dA1))?.ok === true, "reset DEPARTURE"); const a = await resolveV(ctxA, BAL, refs); out.push([a.value, a.source]);
    ok((await reset("PRODUCT", pA1))?.ok === true, "reset PRODUCT"); const b = await resolveV(ctxA, BAL, refs); out.push([b.value, b.source]);
    ok((await reset("UNIT", uA))?.ok === true, "reset UNIT"); const c = await resolveV(ctxA, BAL, refs); out.push([c.value, c.source]);
    eq(out, [[40, "PRODUCT"], [45, "UNIT"], [60, "TEMPLATE"]], "หลังล้าง");
  });
  await st("RS-4", "refsFor PRODUCT/DEPARTURE ได้ refs ครบ · สินค้าร้านอื่น ⇒ null · entitiesOfUnit มีสินค้า+รอบของหน่วย", async () => {
    pre();
    const refsFor = S<unknown>("refsFor");
    eq(await refsFor(ctxA, "PRODUCT", pA1), { unitId: uA, productId: pA1 }, "PRODUCT");
    const rd = asRec(await refsFor(ctxA, "DEPARTURE", dA1));
    eq([rd?.unitId, rd?.productId, rd?.departureId], [uA, pA1, dA1], "DEPARTURE");
    eq(await refsFor(ctxA, "PRODUCT", pB1), null, "สินค้าร้าน B");
    const ents = (await (fnOf(SVC, "entitiesOfUnit", "settings/service") as (...a: unknown[]) => Promise<unknown>)(DB?.prisma, tA, uA)) as Rec[];
    const sig = new Set(ents.map((e) => `${String(e.scope)}|${String(e.scopeId)}`));
    // ORACLE-EDIT RS-4 (ผู้คุม 12 พ.ย.): มติรอบแก้ B1 — entitiesOfUnit คืนเฉพาะสินค้า/รอบที่ "มีแถวค่าตั้ง" (ห้ามไล่ทุกรอบ · นักล่า MAJOR-1) ⇒ ตรวจว่าไม่มีของร้านอื่นและทุกตัวที่คืนเป็นของหน่วย A · การคืนครบเมื่อมีแถว = probe scale ของนักล่า
    const mineA = new Set([`PRODUCT|${pA1}`, `PRODUCT|${pA2}`, `DEPARTURE|${dA1}`]);
    ok([...sig].filter((x) => /^(PRODUCT|DEPARTURE)\|/.test(x)).every((x) => mineA.has(x) || !x.endsWith(pB1)) && !sig.has(`PRODUCT|${pB1}`), `entitiesOfUnit: ${[...sig].filter((x) => /PRODUCT|DEPARTURE/.test(x)).join(", ") || "ไม่มี PRODUCT/DEPARTURE"}`);
  });
  await st("RS-5", "ชั้นที่ยังไม่รองรับ (AGENT · AGENT_TIER · VESSEL) ⇒ VALIDATION/SCOPE_UNSUPPORTED ไม่มีแถว", async () => {
    pre();
    const o = needOwnerA();
    const out: string[] = [];
    for (const [key, scope] of [["trips.pay.depositPct", "AGENT"], ["trips.pay.depositPct", "AGENT_TIER"], ["trips.pax.cabinSharing", "VESSEL"]] as const) {
      const r = await setV(o, ctxA, [{ key, scope, scopeId: rid("x"), value: key === "trips.pay.depositPct" ? 50 : "ANY" }], { ackLegalWarn: true });
      out.push(`${scope}:${String(r.code)}:${String(asRec((r.issues as unknown[] | undefined)?.[0])?.code)}`);
    }
    eq(out, ["AGENT:VALIDATION:SCOPE_UNSUPPORTED", "AGENT_TIER:VALIDATION:SCOPE_UNSUPPORTED", "VESSEL:VALIDATION:SCOPE_UNSUPPORTED"], "ผล");
  });
  await st("RS-6", "ไม่มีแม่แบบ (หน่วยไม่มี SettingProfile) ⇒ _fallback = DIVE_SHOP (source FALLBACK)", async () => {
    needOwnerA(); needDef("trips.sell.holdMinutes");
    const r = await resolveV(ctxB, "trips.sell.holdMinutes", { unitId: uB });
    const s = await resolveV(ctxB, "trips.pay.depositPct", { unitId: uB });
    eq([r.value, r.source, s.value], [15, "FALLBACK", 100], "fallback");
  });
  await st("RS-7", "snapshotPolicy('trips.booking') ระดับรอบ: จด 35 คีย์ · ค่า T13 ของสินค้าที่ตั้งไว้ · แก้ทีหลัง snapshot เดิมไม่เปลี่ยน", async () => {
    pre();
    const o = needOwnerA();
    ok((await setV(o, ctxA, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: pA1, value: 50 }])).ok === true, "ตั้ง T13 ระดับสินค้า");
    const snap = asRec(await S<unknown>("snapshotPolicy")(ctxA, "trips.booking", { unitId: uA, productId: pA1, departureId: dA1 })) ?? {};
    const vals = asRec(snap.values) ?? {};
    eq([snap.domain, Object.keys(vals).length, vals["trips.pay.depositPct"], asRec(snap.sources)?.["trips.pay.depositPct"]], ["trips", SNAP_TRIPS.length, 50, "PRODUCT"], "snapshot");
    ok((await setV(o, ctxA, [{ key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: pA1, value: 60 }])).ok === true, "แก้ T13");
    eq(vals["trips.pay.depositPct"], 50, "snapshot เดิม");
  });

  // ═══════════════ WS. บันทึกค่าที่เตือน ═══════════════
  console.log("\n── WS: คำเตือน = รับทราบ ไม่บังคับเหตุผล · ไม่มี BLOCK ──");
  const BAD_LADDER = [L(30, 100), L(15, 20), L(0, 0)];
  const countVals = async (key: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SettingValue" WHERE "tenantId" = $1 AND key = $2`, [tA, key]))[0]?.n ?? 0;
  await st("WS-1", "ไม่รับทราบ ⇒ NEEDS_APPROVAL · issue code W01 severity HIGH · approvalId null · ไม่มีแถวเขียน", async () => {
    pre();
    const before = await countVals("trips.cancel.ladder");
    const r = await setV(needOwnerA(), ctxA, [{ key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA, value: BAD_LADDER }]);
    const iss = ((r.issues ?? []) as Rec[]).find((x) => x.code === "W01");
    eq([r.ok, r.code, r.approvalId ?? null, iss?.severity], [false, "NEEDS_APPROVAL", null, "HIGH"], "ผล");
    eq(await countVals("trips.cancel.ladder"), before, "แถว");
  });
  await st("WS-2", "รับทราบ ไม่มีเหตุผล ⇒ บันทึกได้ · SettingChange legalLevel WARN · legalCode W01 · reason null", async () => {
    pre();
    const r = await setV(needOwnerA(), ctxA, [{ key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA, value: BAD_LADDER }], { ackLegalWarn: true });
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
    const ch = await q<{ legalLevel: string; legalCode: string | null; reason: string | null }>(`SELECT "legalLevel", "legalCode", reason FROM "SettingChange" WHERE "tenantId" = $1 AND key = 'trips.cancel.ladder' ORDER BY at DESC LIMIT 1`, [tA]);
    eq([ch[0]?.legalLevel, ch[0]?.legalCode, ch[0]?.reason ?? null], ["WARN", "W01", null], "SettingChange");
    eq((await resolveV(ctxA, "trips.cancel.ladder", { unitId: uA })).value, BAD_LADDER, "ค่าที่มีผล");
  });
  await st("WS-3", "รับทราบ + เหตุผลสั้น 3 ตัวอักษร ⇒ ได้ และเก็บเหตุผล · W03 ข้ามคีย์: ladder ไม่คืนช่วง ≥30 วัน + มัดจำ 30 ⇒ issue มีทั้ง W01 และ W03", async () => {
    pre();
    const o = needOwnerA();
    const r = await setV(o, ctxA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: pA2, value: [L(30, 50), L(0, 0)], reason: "ตกลง" }], { ackLegalWarn: true });
    ok(r.ok === true, `บันทึก: ${fmt(r)}`);
    const ch = await q<{ reason: string | null }>(`SELECT reason FROM "SettingChange" WHERE "tenantId" = $1 AND key = 'trips.cancel.ladder' AND scope = 'PRODUCT' ORDER BY at DESC LIMIT 1`, [tA]);
    eq(ch[0]?.reason, "ตกลง", "reason");
    const w = await setV(o, ctxA, [{ key: "trips.pay.depositPct", scope: "UNIT", scopeId: uA, value: 30 }, { key: "trips.cancel.ladder", scope: "UNIT", scopeId: uA, value: [L(30, 50), L(0, 0)] }]);
    const codes = ((w.issues ?? []) as Rec[]).map((x) => String(x.code)).sort();
    eq([w.code, codes.includes("W01"), codes.includes("W03")], ["NEEDS_APPROVAL", true, true], `issues ${codes.join(",")}`);
  });
  await st("WS-4", "ค่าเท่าแม่แบบ/ไม่เข้าเงื่อนไข ⇒ บันทึกได้โดยไม่ต้องรับทราบ (ไม่มี legalCode)", async () => {
    pre();
    const r = await setV(needOwnerA(), ctxA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: pA1, value: [L(60, 100), L(30, 100), L(15, 50), L(0, 0)] }, { key: "trips.insurance.minSum", scope: "UNIT", scopeId: uA, value: { deathDisabilitySatang: 200_000_000, injurySatang: 50_000_000 } }]);
    ok(r.ok === true, `ผล: ${fmt(r)}`);
  });
  await st("WS-5", "ไม่มีทาง LEGAL_BLOCK: ค่าเตือนของทุกคีย์ที่มี legal (13 คีย์) ไม่รับทราบ ⇒ NEEDS_APPROVAL ทุกตัว · รับทราบ ⇒ ok ทุกตัว", async () => {
    pre();
    const o = needOwnerA();
    const bad: [string, unknown][] = [
      ["trips.fx.rateSource", "BANK_DAILY_BUY"], ["trips.cancel.shopCancelRefund", { EXTERNAL: 50, MIN_NOT_MET: 100, SHOP_FAULT: 100 }], ["trips.tax.vatRate", { mode: "EXEMPT_81_1_N", rateBp: 0 }],
      ["trips.tax.invoiceOnEachPayment", false], ["trips.tax.invoiceForm", { direct: "SHORT_UPGRADE_ON_REQUEST", viaAgent: "SHORT_UPGRADE_ON_REQUEST" }], ["trips.tax.cancelFeeVat", "SERVICE_WITH_VAT"],
      ["trips.tax.forfeitAfterInvoice", "CREDIT_NOTE_PLUS_DAMAGES_RECEIPT"], ["trips.parkFee.ageBands", { ...AGE, childTo: 12 }], ["trips.dive.ratio", { scuba: 6, trial: 2, course: 4, snorkel: 20 }],
      ["trips.insurance.minSum", { deathDisabilitySatang: 1, injurySatang: 1 }], ["trips.pdpa.retention", { ...RET, taxDocsDays: 365 }], ["trips.waiver.template", { th: "ผู้จัดไม่รับผิดชอบทุกกรณี" }],
      ["trips.parkFee.table", { ...asRec(asRec(getDef("trips.parkFee.table")?.defaults)?.DIVE_SHOP), confirmedAt: OLD }],
    ];
    const out: string[] = [];
    for (const [key, value] of bad) {
      const r1 = await setV(o, ctxA, [{ key, scope: "UNIT", scopeId: uA, value }]);
      const r2 = await setV(o, ctxA, [{ key, scope: "UNIT", scopeId: uA, value }], { ackLegalWarn: true });
      if (r1.code !== "NEEDS_APPROVAL" || r2.ok !== true) out.push(`${key}: ${String(r1.code)}/${String(r2.ok ?? r2.code)}`);
    }
    ok(out.length === 0, `${out.length}: ${out.slice(0, 3).join(" · ")}`);
  });
  await st("WS-6", "พนักงาน (STAFF trips.settings.edit) รับทราบ W01 ⇒ บันทึกได้ทันที ไม่ต้องอนุมัติเจ้าของ (ไม่มี approvalId)", async () => {
    pre();
    ok(STAFF_A, "ไม่มีพนักงานทดสอบ");
    const r = await setV(STAFF_A as Actor, ctxA, [{ key: "trips.cancel.ladder", scope: "PRODUCT", scopeId: pA1, value: BAD_LADDER }], { ackLegalWarn: true });
    ok(r.ok === true && !r.approvalId, `ผล: ${fmt(r)}`);
  });

  // ═══════════════ X1. แยกร้าน/หน่วย ═══════════════
  console.log("\n── X1: แยกร้าน · แยกหน่วย ──");
  await st("X1-1", "ร้าน A ตั้งค่าที่สินค้า/รอบของร้าน B ⇒ NOT_FOUND ไม่มีแถว · ร้าน B resolve ด้วย productId ของ A ไม่เห็นค่าของ A", async () => {
    pre();
    const r1 = await setV(needOwnerA(), ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: pB1, value: 7 }]);
    const r2 = await setV(needOwnerA(), ctxA, [{ key: BAL, scope: "DEPARTURE", scopeId: dB1, value: 7 }]);
    eq([r1.code, r2.code], ["NOT_FOUND", "NOT_FOUND"], "เขียนข้ามร้าน");
    ok((await setV(needOwnerA(), ctxA, [{ key: BAL, scope: "PRODUCT", scopeId: pA1, value: 41 }])).ok === true, "ตั้งค่าร้าน A");
    const rb = await resolveV(ctxB, BAL, { unitId: uB, productId: pA1 });
    ok(rb.value !== 41 && rb.source !== "PRODUCT", `ร้าน B เห็นค่าร้าน A: ${fmt(rb)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "SettingValue" WHERE "scopeId" = ANY($1::text[])`, [[pB1, dB1]]))[0]?.n, 0, "แถวข้ามร้าน");
  });
  const tdb = (ctx: Rec): unknown => fnOf(DB, "tenantDb", "core/db")(ctx);
  type Delegate = { findMany: (a?: unknown) => Promise<unknown[]>; count: (a?: unknown) => Promise<number>; updateMany: (a: unknown) => Promise<{ count: number }>; update: (a: unknown) => Promise<unknown>; create: (a: unknown) => Promise<unknown> };
  const model = (db: unknown, name: string): Delegate => { const d = asRec(db)?.[name]; if (!d || typeof d !== "object") throw new AssertFail(`Prisma client ไม่มีโมเดล ${name} (ยังไม่ generate)`); return d as unknown as Delegate; };
  await st("X1-2", "tenantDb ร้าน B มองไม่เห็นสินค้า/รอบของ A · ร้าน A หน่วย 2 มองไม่เห็นหน่วย 1 · หน่วยตัวเองเห็น", async () => {
    pre();
    const B = tdb({ tenantId: tB, unitId: uB }), A2 = tdb({ tenantId: tA, unitId: uA2 }), A1 = tdb({ tenantId: tA, unitId: uA });
    eq([await model(B, "tripProduct").count({ where: { id: pA1 } }), await model(B, "tripDeparture").count({ where: { id: dA1 } }), await model(A2, "tripProduct").count({ where: { id: pA1 } }), await model(A1, "tripProduct").count({ where: { id: { in: [pA1, pA2] } } })], [0, 0, 0, 2], "count");
  });
  await st("X1-3", "tenantDb ร้าน B แก้แถวของ A: updateMany = 0 · update(unique) โยน · ค่าเดิมไม่เปลี่ยน", async () => {
    pre();
    const B = tdb({ tenantId: tB, unitId: uB });
    eq((await model(B, "tripProduct").updateMany({ where: { id: pA1 }, data: { status: "ARCHIVED" } })).count, 0, "updateMany");
    let threw = false;
    try { await model(B, "tripDeparture").update({ where: { id: dA1 }, data: { capacity: 999 } }); } catch { threw = true; }
    ok(threw, "update ข้ามร้านไม่โยน");
    const rows = await q<{ status: string; capacity: number }>(`SELECT p.status, d.capacity FROM "TripProduct" p, "TripDeparture" d WHERE p.id = $1 AND d.id = $2`, [pA1, dA1]);
    eq(rows.map((r) => [r.status, r.capacity]), [["ACTIVE", 20]], "ค่าในฐาน");
  });
  await st("X1-4", "tenantDb create (TripPdpaRequest) เติม tenantId/unitId เอง · SellCounter แกน tenant: ร้าน B มองไม่เห็นแถวร้าน A", async () => {
    pre();
    const A1 = tdb({ tenantId: tA, unitId: uA });
    const id = rid("pdpa");
    await model(A1, "tripPdpaRequest").create({ data: { id, kind: "ERASE", status: "RECEIVED", dueAt: new Date(Date.now() + 90 * DAY) } });
    const r = await q<{ tenantId: string; unitId: string }>(`SELECT "tenantId", "unitId" FROM "TripPdpaRequest" WHERE id = $1`, [id]);
    eq(r.map((x) => [x.tenantId, x.unitId]), [[tA, uA]], "แถว");
    eq(await model(tdb({ tenantId: tB }), "sellCounter").count({ where: { tenantId: tA } }), 0, "SellCounter ข้ามร้าน");
    let threw = false;
    try { await model(tdb({ tenantId: tA }), "tripProduct").count(); } catch { threw = true; }
    ok(threw, "โมเดล unit ไม่ส่ง unitId ต้องโยน (fail-closed)");
  });

  // ═══════════════ F. ฟอร์ม ═══════════════
  console.log("\n── F: ฟอร์มค่าตั้ง ──");
  const formFields = async (q0: Rec): Promise<Rec[] | null> => {
    const m = asRec(await S<unknown>("loadSettingsForm")(needOwnerA(), ctxA, q0));
    if (!m) return null;
    return ((m.groups ?? []) as Rec[]).flatMap((g) => (g.fields ?? []) as Rec[]);
  };
  await st("F-1", "ฟอร์มหน่วย TRIPS: ป้าย reviewHint/reviewAuthorityTh ตามคีย์ · คีย์ไม่มีป้าย = null · ไม่มีคีย์ซ่อน", async () => {
    pre(); needUnitTrips();
    const f = await formFields({ domains: ["trips"], unitId: uA, unitType: "TRIPS" });
    ok(f && f.length > 50, `ฟอร์มว่าง/null (${f?.length})`);
    const by = new Map((f ?? []).map((x) => [String(x.key), x]));
    eq([by.get("trips.cancel.changeDateFee")?.reviewHint, by.get("trips.parkFee.table")?.reviewHint, by.get("trips.parkFee.table")?.reviewAuthorityTh, /* ORACLE-EDIT F-1 (ผู้คุม 12 พ.ย.): `null ?? "ไม่มีช่อง"` ไม่มีทางได้ null — ตรวจว่ามีช่องและค่าเป็น null */ (() => { const f = by.get("trips.sell.holdMinutes"); return f && "reviewHint" in f ? f.reviewHint : "ไม่มีช่อง"; })(), (() => { const f = by.get("trips.sell.holdMinutes"); return f && "reviewAuthorityTh" in f ? f.reviewAuthorityTh : "ไม่มีช่อง"; })()], ["ACCOUNTANT", "AUTHORITY", "กรมอุทยานฯ", null, null], "ป้าย");
    ok(!HIDDEN.some((k) => by.has(k)), "คีย์ซ่อนโผล่ในฟอร์ม");
  });
  await st("F-2", "ฟอร์มหน่วยชนิดอื่น (unitType BOOKING) ไม่มีคีย์ trips · ฟอร์มชั้น PRODUCT มีเฉพาะคีย์ที่ chain มี PRODUCT", async () => {
    pre();
    const fb = await formFields({ domains: ["trips"], unitId: uA, unitType: "BOOKING" });
    eq((fb ?? []).length, 0, "ฟอร์ม BOOKING");
    const fp = await formFields({ domains: ["trips"], unitId: uA, unitType: "TRIPS", scope: "PRODUCT", scopeId: pA1 });
    ok(fp && fp.length > 10, `ฟอร์มสินค้า null/ว่าง (${fp?.length})`);
    const notProd = (fp ?? []).filter((x) => !(EXPECT.find((e) => e.key === x.key)?.chain ?? []).includes(P)).map((x) => String(x.key));
    ok(notProd.length === 0 && (fp ?? []).some((x) => x.key === "trips.sell.holdMinutes"), `คีย์ไม่ใช่ชั้นสินค้า: ${notProd.slice(0, 3).join(", ")}`);
  });
  await st("F-3", "settings-shared: legalAckNeedsReason (trips/agency/ticket = false · rooms/booking = true) · severityRank HIGHEST > HIGH > NORMAL · SettingsForm ใช้ทั้งสอง + reviewHint", () => {
    const need = fnOf(SHARED, "legalAckNeedsReason", "settings-shared");
    eq(["trips", "agency", "ticket", "rooms", "booking"].map((d) => need(d)), [false, false, false, true, true], "legalAckNeedsReason");
    const rank = fnOf(SHARED, "severityRank", "settings-shared");
    ok(Number(rank("HIGHEST")) > Number(rank("HIGH")) && Number(rank("HIGH")) > Number(rank("NORMAL")), "severityRank");
    const src = read("src/components/settings/SettingsForm.tsx");
    const miss = ["legalAckNeedsReason", "severityRank", "reviewHint"].filter((s) => !src.includes(s));
    ok(miss.length === 0, `SettingsForm ยังไม่ใช้: ${miss.join(", ")}`);
  });

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G: regression ──");
  if (NO_REG) skip("G-1", "qc-trips-p0.1 (seed รันซ้ำ + ฟิกซ์เจอร์ + แยกร้าน) ยังเขียว", "--no-regression");
  else {
    const seeded = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug = ANY($1::text[])`, [["andaman-dive", "andaman-aquarium"]]);
    if ((seeded[0]?.n ?? 0) < 2) skip("G-1", "qc-trips-p0.1 ยังเขียว", "ฐานนี้ยังไม่ได้ seed (รัน seed-trips-qc.mts ก่อน)");
    else await st("G-1", "qc-trips-p0.1 (seed รันซ้ำ idempotent + ฟิกซ์เจอร์ + แยกร้าน) exit 0 หลัง migration", () => {
      const r = spawnSync(join(ROOT, "node_modules/.bin/tsx"), ["scripts/qc-trips-p0.1.mts"], { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      ok(r.status === 0, `exit=${r.status} · ${out.split("\n").filter((l) => l.includes("JSON_SUMMARY")).join(" ").slice(0, 200)}`);
    });
  }
  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T0.1 · migration + ค่าตั้ง trips + ตัวตรวจทัวร์ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
process.exit(exitCode);
