// QC — TRIPS T1.7a2 · รายงานทัวร์ตามช่วงเวลา: 4 แท็บ (ยอดขาย · อัตราเต็ม · ระยะจองล่วงหน้า · ช่องทาง) · ตารางรอบแบ่งหน้า · CSV · ความเร็ว
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.7a2.md ร่างรอบ 2 (มติทั้งหมดของ T1.7.md ใช้ต่อ · มติผู้คุม C13–C17 + D1–D6 รวมในเนื้อ · §13 = ข้อที่ความหมายเปลี่ยนเมื่อขึ้นระดับช่วง)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน: คิดมือ §4.5 · ดัชนี · ตัวช่วยเดิม · ฟิกซ์เจอร์คิดซ้ำจากแถวดิบ · ตัวคิด a1 ต่อรอบตรงตาราง · ตัวเรนเดอร์/ตัวเรียก action/ตัวนับคิวรีทำงานกับของเดิม)
//   S ไฟล์/ขอบเขต/กติกาโค้ด/ข้อความ   P ตัวช่วยบริสุทธิ์   RP บริการรายงาน   RC กระทบยอด (ยอดรวม = Σ departureMoneySummary ของ a1 · seed อ่านอย่างเดียว)
//   LK สิทธิ์/การรั่วของต้นทุน   EX CSV ระดับไบต์ + audit + เพดานความถี่   AC server action + ฟอร์ม GET (ทางจริงของจอ)   RS จอที่เรนเดอร์จริง   PF ร้านใหญ่ (~20,000 การจอง)
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ = ภาพ + กดจริง + ปิด JS ในเบราว์เซอร์ (ผู้คุม · scripts/visual-trips.mts t1.7a2)
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t17b-*` (ผู้ใช้ `trips-t17b-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ถังเพดานความถี่ `trips:report:export:t17bqc_*` ลบเช่นกัน · ร้าน seed อ่านอย่างเดียว
// 🔴 นาฬิกา: บริการได้ `now` ที่ฉีดเท่านั้น (ยกเว้น AC ที่เรียก action จริง — เทียบกับบริการที่ใช้นาฬิกาจริงในวินาทีเดียวกัน) · createdAt ของการจองฝังค่าตายตัว
// 🔴 ฟิกซ์เจอร์ที่ระบบวันนี้สร้างเองไม่ได้ (ใบ a1 §13 · N12): TRAVELLED/NO_SHOW · การจองค้างในรอบยกเลิก · การจองเอเจนซี่ (จ่าย 0 เสมอ) · OTA · แถว snapshot เสียโดยเจตนา 1 แถว
// 🔴 นับคิวรี: ฉีด PrismaClient ที่เปิด event `query` ลง globalThis ก่อน import @/lib/core/db (แบบ qc-acc-v2-dashboard)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.7a2.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.7a2: PC เขียว · S-12 S-14 S-16 เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";
import { fromMainMerge, TRIPS_MAIN_MERGE_SHA } from "./trips-main-merge.mjs";

const LABEL = "qc-trips-t1.7a2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;
// ผลรันรอบ 1 (ผู้ร่าง): ตั้ง AsyncLocalStorage ทีหลัง require("next-intl")/app-router-context ⇒ ที่เก็บของ Next เป็นตัวปลอม ⇒ action throw — ต้องตั้งก่อนโหลดโมดูลใดของ next
(globalThis as unknown as Record<string, unknown>).AsyncLocalStorage ??= (await import("node:async_hooks")).AsyncLocalStorage;

// ═══════════════ ตัวนับ SQL จริง (ก่อน import @/lib/core/db) ═══════════════
let sqlLog: string[] = [];
let counting = false;
const qcPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: "event", level: "query" }], transactionOptions: { timeout: 30_000, maxWait: 10_000 } });
(qcPrisma as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => { if (counting) sqlLog.push(ev.query); });
(globalThis as unknown as { prisma?: unknown }).prisma = qcPrisma;
// ผลรันรอบ 1: TripDeparture มี unique (productId, optionId, startsAt) ⇒ รอบเสริมของ PF-6 ต้องเวลาไม่ซ้ำ (บวกนาทีตาม g)
const realSql = () => sqlLog.filter((s) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET|SAVEPOINT|RELEASE)\b/i.test(s));

// ═══════════════ harness (แบบ qc-trips-t1.7) ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
type Rec = Record<string, unknown>;
type AnyFn = (...a: unknown[]) => unknown;
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 280);
const fmt = (v: unknown): string => { try { return (JSON.stringify(v) ?? String(v)).slice(0, 300); } catch { return String(v); } };
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
const groupLine = (g: string) => {
  const mine0 = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine0.filter((c) => c.res === "PASS").length}/${mine0.length}`);
};
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const RID = "t17bqc_";
const rid = (p: string) => `${RID}${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t17b-";
const EMAIL_PREFIX = "trips-t17b-";
const RATE_PREFIX = "trips:report:export:";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BKK = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+07:00`);
const walk = (rel: string): string[] => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const n of readdirSync(abs)) {
    const p = join(rel, n);
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts)$/.test(n)) out.push(p);
  }
  return out;
};
/** ปัดครึ่งออกจากศูนย์ แบบ money-math (คิดซ้ำอิสระด้วย BigInt) */
const Z = BigInt(0), TWO = BigInt(2);
const halfUp = (num: bigint, den: bigint): number => { const neg = (num < Z) !== (den < Z); const a = num < Z ? -num : num; const b = den < Z ? -den : den; const q0 = (TWO * a + b) / (TWO * b); return Number(neg ? -q0 : q0); };
const vatIncl = (x: number) => halfUp(BigInt(x) * BigInt(700), BigInt(10_700));
const bp = (n: number, d: number) => halfUp(BigInt(n) * BigInt(10_000), BigInt(d));
const hasNum = (s: string, ns: number[]) => ns.filter((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(s));
const THAI = /[฀-๿]/;

// ═══════════════ สเปก (ใบสั่ง T1.7a2) ═══════════════
const BASE_SHA = "696ea3c050a974afc36d713554e1a21dcbd272c2"; // session/trips ตอนเขียนใบ (รวม T1.7a1 แล้ว)
const APP = "src/app/app/u/[unitSlug]/trips";
const REPORT_PAGE = `${APP}/reports/page.tsx`;
const MOD = "src/lib/modules/trips/";
const PURE = MOD + "report-core.ts";
const COSTS = MOD + "costs.ts";
const REPORTS = MOD + "reports.ts";
const ACTIONS = MOD + "report-actions.ts";
const OWN_NEW = [REPORTS, ACTIONS, REPORT_PAGE];
const COMP = "src/components/trips";
const DEPSCREEN = `${COMP}/DeparturesScreen.tsx`;
const PERMS = "src/lib/core/permissions.ts";
const FACADE_FNS = ["loadTripReportVM", "exportTripReportCsv", "bookingMoneyInOfRow", "reportQueryOf", "reportRangeOf", "reportGroupOf", "reportUtcBoundsOf", "reportPresetsOf", "periodKeyOf", "periodsOf", "leadDaysOf", "leadBucketOf",
  "medianOf", "bahtPlain", "pctPlain", "reportCsv", "reportFileName"];
const FACADE_CONSTS = ["REPORT_TABS", "REPORT_GROUPS", "REPORT_BASES", "REPORT_QUERY_PARAMS", "REPORT_RANGE_MAX_DAYS", "REPORT_DAY_GROUP_MAX_DAYS", "REPORT_PAGE_SIZE", "REPORT_PAGE_MAX", "REPORT_PRODUCTS_MAX", "REPORT_DEPARTURE_CAP",
  "REPORT_BOOKING_CAP", "TRIPS_REPORT_CSV_CAP", "REPORT_EXPORT_RATE", "LEAD_BUCKETS", "REPORT_CSV_COLUMNS", "REPORT_CSV_COST_COLUMNS"];
const TABS = ["sales", "load", "lead", "channel"];
const GROUPS = ["day", "week", "month"];
const BASES = ["travel", "booked"];
const QPARAMS = ["from", "to", "basis", "product", "channel", "tab", "group", "page"];
const LEAD_KEYS = ["D0", "D1_2", "D3_7", "D8_14", "D15_30", "D31_60", "D61P"];
const CSV_COLS = ["date", "time", "product", "option", "state", "capacity", "sold", "loadFactorPct", "bookings", "cancelledBookings", "pendingRefundBookings", "sales", "passThrough", "vat", "revenueExVat", "collected", "outstanding", "held", "agentCollectBookings"];
const CSV_COST_COLS = ["commission", "cost", "grossProfit", "marginPct"];
const ALL_CHANNELS = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "CHAT_AI", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT"];
const LIVE = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const DEP_STATES = ["UPCOMING", "ENDED", "CANCELLED"];
const WARN_CODES = ["PARK_FEE_WITH_PASS_THROUGH", "SUPPLIER_COSTS_NOT_INCLUDED", "SNAPSHOT_FALLBACK", "FX_BOOKINGS", "VAT_STATUS_UNKNOWN", "OTA_FEES_NOT_INCLUDED"];
const COST_KEY_RE = /^(commission\w*|cost\w*|grossProfit\w*|margin\w*|perSeat\w*|byKind|noCosts|departuresWithoutCosts)$/;
/** ข้อความที่ข้อสอบตรึง (ใบสั่ง §8) */
const PINNED: Record<string, string> = {
  "report.mgmt": "ตัวเลขบริหาร ไม่ใช่รายงานบัญชี",
  "report.accounting": "ระบบยังไม่ลงบัญชีให้ — เอกสารภาษีให้ใช้ที่ร้านออกในระบบบัญชี",
  "report.estimate": "ประมาณการ — ยังไม่ปิดทริป",
  "report.vat": "VAT ในราคาขาย (ประมาณ) — ไม่ใช่ยอดยื่น ภ.พ.30",
  "report.kpi.revenue": "รายได้ก่อน VAT", "report.kpi.revenueNoVat": "รายได้", "report.kpi.commissionWithVat": "(รวม VAT ของคอมมิชชัน)",
  "report.noCosts": "ยังไม่หักต้นทุนของ {n} รอบ (เดินทางแล้ว {ended} · ยังไม่เดินทาง {upcoming})",
  "report.note.basis": "ดูตามวันจอง: ไม่มีความจุ อัตราเต็ม ต้นทุน และกำไร (ต้นทุนผูกกับรอบ ไม่ใช่วันจอง)",
  "report.note.channel": "กรองช่องทาง: ความจุ อัตราเต็ม ต้นทุน และกำไรแยกตามช่องทางไม่ได้",
  "report.charter": "รอบเหมาลำ {n} รอบ — อัตราเต็มไม่สะท้อนการขายรายที่นั่ง",
  "report.lead.notCounted": "ไม่นับการจองที่ยกเลิก รอคืนเงิน หรือนำเข้า (นำเข้า {n} การจอง)",
  "report.lead.negative": "จองหลังวันเดินทาง {n} การจอง — ไม่อยู่ในช่องใด",
  "report.products.truncated": "แสดงสินค้า {shown} จาก {total} รายการ (เรียงตามชื่อ)",
  "report.error.filter": "ตัวกรองบางช่องใช้ไม่ได้ — ใช้ค่าปริยายแทนช่องนั้น",
  "report.export.noJs": "ส่งออกไฟล์ต้องเปิด JavaScript",
  "report.export.unavailable": "ส่งออกได้เมื่อดูตามวันเดินทางและทุกช่องทาง",
  "report.export.partial": "ไฟล์มี {shown} จาก {total} รอบ — เลือกช่วงสั้นลงเพื่อดูส่วนที่เหลือ",
  "report.csv.vat": "VAT ในราคาขาย (ประมาณ)", "report.csv.revenueExVat": "รายได้ก่อน VAT",
  "report.empty": "ไม่มีรอบหรือการจองในช่วงนี้",
  "departures.actions.reports": "รายงาน",
  "errors.RANGE_TOO_LARGE": "เลือกช่วงได้ไม่เกิน 366 วัน",
  "errors.REPORT_TOO_LARGE": "ช่วงนี้มีรอบหรือการจองมากเกินไป — เลือกช่วงสั้นลงหรือเลือกสินค้า",
  "errors.RATE_LIMITED": "ส่งออกบ่อยเกินไป — ลองใหม่ในอีก {min} นาที",
};
const I18N_REQUIRED = [...Object.keys(PINNED), "report.title", "report.back", ...TABS.map((k) => `report.tab.${k}`), ...BASES.map((k) => `report.basis.${k}`), ...GROUPS.map((k) => `report.group.${k}`),
  ...["from", "to", "product", "channel", "allProducts", "allChannels", "apply"].map((k) => `report.filter.${k}`), ...["thisMonth", "lastMonth", "last30", "next30"].map((k) => `report.preset.${k}`),
  ...["sales", "commission", "cost", "profit", "loss", "noCosts", "load"].map((k) => `report.kpi.${k}`), ...LEAD_KEYS.map((k) => `report.lead.${k}`), "report.lead.median",
  ...["DIRECT", "AGENT", "OTHER"].map((k) => `report.chgroup.${k}`), ...ALL_CHANNELS.map((k) => `report.channel.${k}`), "report.page", "report.export.button", "report.export.busy",
  ...[...CSV_COLS, ...CSV_COST_COLS].map((k) => `report.csv.${k}`), ...["date", "product", "state", "load", "sales", "collected", "outstanding", "cost", "profit"].map((k) => `report.dep.${k}`)];
const FORBIDDEN_WORDS = ["งบการเงิน", "งบกำไรขาดทุน", "งบดุล", "รายได้รับรู้", "กำไรสุทธิ", "POS"];
const TH_WORDS = new Intl.Segmenter("th", { granularity: "word" });
const forbiddenHit = (v: string): string | null => FORBIDDEN_WORDS.find((w) => v.includes(w)) ?? ([...TH_WORDS.segment(v)].find((s) => s.segment.includes("งบ"))?.segment ?? null);
const RAW_CODES = new Set([...DEP_STATES, ...LEAD_KEYS, ...ALL_CHANNELS.filter((c) => c.length > 3), "DIRECT", "AGENT", "OTHER", "LIVE", "EXCLUDED", "PENDING_REFUND", ...WARN_CODES, "RANGE_TOO_LARGE", "REPORT_TOO_LARGE", "RATE_LIMITED"]);
const TESTIDS_FIXED = ["trips-dep-reports", "trips-rp", "trips-rp-title", "trips-rp-back", "trips-rp-mgmt", "trips-rp-accounting-note", "trips-rp-estimate", "trips-rp-filters", "trips-rp-from", "trips-rp-to",
  "trips-rp-basis-travel", "trips-rp-basis-booked", "trips-rp-product", "trips-rp-product-truncated", "trips-rp-channel", "trips-rp-apply", "trips-rp-tab-sales", "trips-rp-tab-load", "trips-rp-tab-lead", "trips-rp-tab-channel", "trips-rp-basis-note",
  "trips-rp-channel-note", "trips-rp-charter-note", "trips-rp-error", "trips-rp-kpis", "trips-rp-kpi-sales", "trips-rp-kpi-revenue", "trips-rp-kpi-commission", "trips-rp-kpi-cost", "trips-rp-kpi-profit",
  "trips-rp-kpi-profit-note", "trips-rp-kpi-load", "trips-rp-vat-line", "trips-rp-periods", "trips-rp-load", "trips-rp-lead", "trips-rp-lead-median", "trips-rp-lead-excluded", "trips-rp-lead-negative", "trips-rp-channels", "trips-rp-empty", "trips-rp-deps", "trips-rp-page",
  "trips-rp-page-prev", "trips-rp-page-next", "trips-rp-export", "trips-rp-export-mgmt", "trips-rp-export-partial", "trips-rp-export-nojs", "trips-rp-export-note", "trips-rp-export-error"];
const TESTID_PATTERNS = ["trips-rp-preset-", "trips-rp-group-", "trips-rp-warn-", "trips-rp-period-", "trips-rp-period-note-", "trips-rp-load-", "trips-rp-lead-", "trips-rp-chgroup-", "trips-rp-ch-", "trips-rp-dep-", "trips-rp-dep-link-"];
const VISUAL_SCENES = ["reports-sales", "reports-load", "reports-lead", "reports-channel", "reports-booked", "reports-sales-en", "departure-costs-en", "calendar-reports-link", "reports-filter-error"];
/** ไฟล์เดิมที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
const LIMITED: [string, number, number | null][] = [[PURE, 10, 340], [COSTS, 60, 45], [MOD + "index.ts", 0, null], [MOD + "departure-screens.ts", 1, 4], [DEPSCREEN, 0, 10], [`${COMP}/CostScreen.tsx`, 10, 16],
  [`${COMP}/CostParts.tsx`, 4, 12], [`${COMP}/ProductsScreenParts.tsx`, 0, 6], ["src/messages/th/trips.json", 2, null], ["src/messages/en/trips.json", 2, null], ["scripts/trips-ui-inventory.json", 0, null], ["scripts/parity-trips.sh", 0, 4]];
const LIMITED_SET = new Set(LIMITED.map(([f]) => f));
/** ไฟล์ที่ผู้ร่างแก้ในใบนี้ (ไม่นับเป็นการแตะของ builder): ข้อสอบตัวนี้ + ฉาก t1.7a2 */
const DRAFTER_FILES = ["scripts/qc-trips-t1.7a2.mts", "scripts/visual-trips.mts"];
// seed
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const U0 = FX.SHOP_DIVE.units.trips.id;
const SEED = { tenantId: DIVE_TENANT, actorUserId: "tripsqc-user-dive-owner" };
const AS_OF = new Date(FX.TRIPS_AS_OF);
// ร้านชั่วคราว · นาฬิกาฉีด
const NOW_R = new Date("2027-04-15T05:00:00.000Z"); // 12:00 กรุงเทพ 15 เม.ย. 2570 — หลังรอบ 10–14 เม.ย. จบ · ก่อนรอบ 16 และ 20 เม.ย.
const APR = { from: "2027-04-01", to: "2027-04-30" };
const ADULT = 350_000, CHILD = 245_000, PARK_A = 60_000, PARK_C = 30_000;
const COST_NUMS = [2_770_000, 2_150_000, 7_044_802, 2_585_362, 3_478_131, 1_200_000, 409_500, 199_500, 210_000, 105_000, 94_500]; // ต้นทุน/กำไร/คอมฯ ที่ต้องไม่หลุดถึงผู้ไม่มีสิทธิ์

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const q = async <T extends pg.QueryResultRow = Rec>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const needTable = async (t: string) => { if ((await cols(t)).length === 0) throw new AssertFail(`ยังไม่มีตาราง ${t}`); };
const checkLits = async (table: string, col: string): Promise<string[]> => {
  const rows = await q<{ def: string }>(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND n.nspname = current_schema() AND t.relname = $1`, [table]);
  for (const r of rows) if (r.def.includes(`"${col}"`) || new RegExp(`\\b${col}\\b`).test(r.def)) { const l = [...r.def.matchAll(/'((?:[^']|'')*)'::/g)].map((m) => m[1] ?? ""); if (l.length) return l; }
  return [];
};
async function insertRow(table: string, vals: Rec): Promise<string> {
  await needTable(table);
  const v: Rec = { ...vals };
  const names = new Set((await cols(table)).map((c) => c.column_name));
  for (const k of Object.keys(v)) if (!names.has(k)) delete v[k];
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    if (c.column_name === "id") { v.id = rid("id"); continue; }
    if (c.column_name === "updatedAt" || c.column_name === "createdAt") { v[c.column_name] = new Date(); continue; }
    if (t === "text" || t.startsWith("character")) { const l = await checkLits(table, c.column_name); v[c.column_name] = l[0] ?? `qc${hex(4)}`; continue; }
    if (t === "USER-DEFINED") { v[c.column_name] = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = $1 ORDER BY e.enumsortorder LIMIT 1`, [c.udt_name]))[0]?.l ?? null; continue; }
    v[c.column_name] = ["integer", "bigint", "numeric", "double precision", "smallint"].includes(t) ? 0 : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}"
      : t.startsWith("timestamp") ? "2027-01-01 00:00:00" : t === "date" ? "2027-03-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
  return String(v.id ?? "");
}

// ═══════════════ ร้านชั่วคราว + กวาด ═══════════════
async function tablesWithTenant(): Promise<string[]> {
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  return rows.map((r) => r.t).filter((t) => t !== "Tenant");
}
async function cleanupTenants(tids: string[]) {
  if (!tids.length) return;
  let pending = await tablesWithTenant();
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
async function cleanupRate() { try { await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, [`${RATE_PREFIX}${RID}%`]); } catch (e) { console.log(`  ⚠️ ลบถังความถี่: ${errMsg(e)}`); } }
const tenantIds: string[] = [];
type Ctx = { tenantId: string; actorUserId: string };

// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers(); await cleanupRate();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.7a2 ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const pure = (name: string, ...a: unknown[]): unknown => fn(name)(...a);
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const VM = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  const codeR = (r: Rec, codes: string | string[], what: string) => { const cs = Array.isArray(codes) ? codes : [codes]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  const constOf = (name: string): unknown => { const v = needTrips()[name]; if (v === undefined) throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.7a2 ยังไม่สร้าง)`); return v; };
  const pick = (r: Rec, ks: string[]) => ks.map((k) => r[k]);
  /** สแกนทั้งต้นไม้: คีย์ต้นทุน/คอมฯ/กำไร/สัญญาณต้นทุน ต้องเป็น null (หรือไม่มี) */
  const costLeaks = (v: unknown, path = "vm"): string[] => {
    if (Array.isArray(v)) return v.flatMap((x, i) => costLeaks(x, `${path}[${i}]`));
    const r = asRec(v); if (!r) return [];
    return Object.entries(r).flatMap(([k, x]) => (COST_KEY_RE.test(k) && x !== null && x !== undefined && !(Array.isArray(x) && x.length === 0) && !(k === "costView" && x === false) ? [`${path}.${k}=${fmt(x)}`] : costLeaks(x, `${path}.${k}`)));
  };
  const th = asRec((() => { try { return JSON.parse(read("src/messages/th/trips.json")); } catch { return null; } })()) ?? {};
  const en = asRec((() => { try { return JSON.parse(read("src/messages/en/trips.json")); } catch { return null; } })()) ?? {};
  const flat = (o: Rec, p = ""): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (asRec(v) ? Object.entries(flat(asRec(v) ?? {}, `${p}${k}.`)) : [[`${p}${k}`, String(v)]])));
  const fth = flat(th), fen = flat(en);

  // ═══════════════ PC. ตัวควบคุม (ก่อนตั้งร้าน) ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "คิดมือ §4.5 (อิสระจากโค้ด): VAT รวมราคา dH 228,972 · dI 68,691 · ยอดรวม เม.ย. ยอดขาย 10,940,000 · VAT 715,698 · ก่อน VAT 10,224,302 · กำไร 7,044,802 · 6890 bp · อัตราเต็ม 33/86 = 3837 · ราชา 33/76 = 4342 · ส่วนแบ่งช่องทาง 6897/2783/320 · ค่ากลางระยะจอง 9", () => {
    eq([vatIncl(3_500_000), vatIncl(350_000) + vatIncl(700_000)], [228_972, 68_691], "VAT");
    const sales = 5_040_000 + 1_000_000 + 0 + 350_000 + 3_500_000 + 0 + 1_050_000; const vat = 329_718 + 65_420 + 0 + 22_897 + 228_972 + 0 + 68_691;
    const rev = sales - vat; const gp = rev - 409_500 - 2_770_000;
    eq([sales, vat, rev, gp, bp(gp, rev), bp(33, 86), bp(33, 76)], [10_940_000, 715_698, 10_224_302, 7_044_802, 6890, 3837, 4342], "ยอดรวม");
    eq([bp(7_545_000, sales), bp(3_045_000, sales), bp(350_000, sales)], [6897, 2783, 320], "ส่วนแบ่ง");
    const leads = [40, 9, 5, 1, 80, 0, 1, 22, 12, 44, 6].sort((a, b) => a - b); eq(leads[Math.floor((leads.length - 1) / 2)], 9, "ค่ากลางล่าง");
    eq([5_040_000 + 1_000_000 - (329_718 + 65_420) - 409_500 - 2_650_000, 350_000 + 3_500_000 - (22_897 + 228_972) - 120_000], [2_585_362, 3_478_131], "กำไรรายสัปดาห์");
    eq(4_900_000 - (45_794 * 3 + 22_897 * 4 + 91_589), 4_579_441, "ฐานวันจอง ก่อน VAT");
  });
  await st("PC-2", "ของ a1/ของเดิมที่ใบนี้ใช้ซ้ำมีจริง: facade bookingMoneyOf sumMoney profitOf loadFactorBp channelGroupOf departureReportStateOf charterLikeOf costAccessOf departureMoneySummary loadDeparturePanelVM loadDepartureCalendarVM tripsPageGate csvCell · checkRateLimitDb · localToUtc/utcToLocal · vatShown/pctText ใน CostParts · csvCell กันสูตร (tab ⇒ ตัด · = ⇒ ')", async () => {
    for (const n of ["bookingMoneyOf", "sumMoney", "profitOf", "loadFactorBp", "channelGroupOf", "departureReportStateOf", "charterLikeOf", "costAccessOf", "departureMoneySummary", "loadDeparturePanelVM", "loadDepartureCalendarVM", "tripsPageGate", "csvCell"]) fn(n);
    eq([pure("csvCell", "\t=1+1"), pure("csvCell", "-5"), pure("csvCell", "a\rb"), pure("csvCell", "@x"), pure("csvCell", "ก,ข")], ["'=1+1", "'-5", "a b", "'@x", "\"ก,ข\""], "csvCell");
    const rl = (await tryImport("@/lib/core/rate-limit-db")).mod; ok(typeof rl?.checkRateLimitDb === "function", "checkRateLimitDb");
    const dc = (await tryImport("@/lib/modules/trips/departures-core")).mod; ok(typeof dc?.localToUtc === "function" && typeof dc?.utcToLocal === "function" && typeof dc?.addDaysYmd === "function", "departures-core");
    eq(((dc?.localToUtc as AnyFn)("Asia/Bangkok", "2027-04-01", 0) as Date).toISOString(), "2027-03-31T17:00:00.000Z", "localToUtc");
    ok(/export function vatShown/.test(read(`${COMP}/CostParts.tsx`)) && /export function pctText/.test(read(`${COMP}/CostParts.tsx`)), "CostParts vatShown/pctText");
    ok(/export function csvCell/.test(read(MOD + "manifest-core.ts")) && !/^import\s+(?!type)/m.test(read(MOD + "manifest-core.ts")), "manifest-core บริสุทธิ์ (import type เท่านั้น)");
  });
  await st("PC-3", "ดัชนีตามที่ใบอ้าง (§10): มี TripDeparture(tenantId,unitId,localDate) · TripBooking(departureId,status) · TripCost(departureId) · AuditLog(tenantId,createdAt) · **ไม่มี** TripBooking(tenantId,unitId,createdAt) (ฐานวันจอง → T1.7m)", async () => {
    const idx = async (t: string) => (await q<{ d: string }>(`SELECT indexdef AS d FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1`, [t])).map((r) => r.d.replace(/^.*\((.*)\)$/, "$1"));
    const dep = await idx("TripDeparture"), bk = await idx("TripBooking"), cost = await idx("TripCost"), au = await idx("AuditLog");
    ok(dep.includes(`"tenantId", "unitId", "localDate"`), `TripDeparture: ${fmt(dep)}`); ok(bk.includes(`"departureId", status`) || bk.includes(`"departureId", "status"`), `TripBooking: ${fmt(bk)}`);
    ok(cost.some((d) => d === `"departureId"`), `TripCost: ${fmt(cost)}`); ok(au.includes(`"tenantId", "createdAt"`), `AuditLog: ${fmt(au)}`);
    ok(!bk.some((d) => /^"tenantId", "unitId", "createdAt"/.test(d)), "มีดัชนีวันจองแล้ว — แก้ §10 ของใบ");
  });
  await st("PC-4", "ตัวช่วยขอบเขต trips-main-merge: positive control (ไฟล์บน main ที่ TRIPS ไม่แตะ ⇒ true) · negative control (ไฟล์ของใบนี้ ⇒ false)", () => {
    const pos = ["src/lib/modules/kanban/", "src/lib/modules/crm/", "src/lib/modules/member/", "src/lib/"].flatMap((d) => git(["ls-tree", "-r", "--name-only", TRIPS_MAIN_MERGE_SHA, d]).split("\n").filter(Boolean).slice(0, 40))
      .find((f) => git(["diff", "--name-only", TRIPS_MAIN_MERGE_SHA, "--", f]).trim() === "" && git(["diff", "--name-only", BASE_SHA, "--", f]).trim() === "");
    ok(pos, "หาไฟล์ควบคุมบน main ไม่ได้"); eq(fromMainMerge(ROOT, String(pos)), true, `positive ${pos}`);
    eq([fromMainMerge(ROOT, "ledger/trips-briefs/T1.7a2.md"), fromMainMerge(ROOT, PURE), fromMainMerge(ROOT, REPORTS)], [false, false, false], "negative");
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE ${BASE_SHA} ไม่เจอ`);
  });
  let seedSnap: { s: unknown; n: number } | null = null;
  await st("PC-5", "seed (อ่านอย่างเดียว · ความสมจริงของฟิกซ์เจอร์ความเร็ว): ร้าน andaman-dive มีรอบในเดือน พ.ย. 2569 · การจองทุกใบมี snapshot.totals.payableSatang + tax.vatRegistered · snapshot ใหญ่สุด ≥ 1,000 ไบต์ (โคลนไปใช้ใน PF)", async () => {
    const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" WHERE "tenantId" = $1 AND "unitId" = $2 AND "localDate" BETWEEN '2026-11-01' AND '2026-11-30'`, [DIVE_TENANT, U0]))[0]?.n ?? 0;
    ok(n >= 3, `seed พ.ย. มีรอบ ${n}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = $1 AND (jsonb_typeof("policySnapshot"->'totals'->'payableSatang') IS DISTINCT FROM 'number' OR jsonb_typeof("policySnapshot"->'tax'->'vatRegistered') IS DISTINCT FROM 'boolean')`, [DIVE_TENANT]))[0]?.n, 0, "snapshot ของ seed");
    seedSnap = (await q<{ s: unknown; n: number }>(`SELECT "policySnapshot" AS s, pg_column_size("policySnapshot")::int AS n FROM "TripBooking" WHERE "tenantId" = $1 ORDER BY pg_column_size("policySnapshot") DESC LIMIT 1`, [DIVE_TENANT]))[0] ?? null;
    ok(seedSnap && seedSnap.n >= 1000, `snapshot ใหญ่สุดของ seed ${seedSnap?.n} ไบต์`);
    console.log(`     ℹ️ snapshot ใหญ่สุดของ seed = ${seedSnap?.n} ไบต์ (ใช้ใน PF)`);
  });
  await st("PC-6", "เขตเวลา (Intl อิสระ): 2027-04-09T16:30Z = 9 เม.ย. กรุงเทพ / 10 เม.ย. โตเกียว · 2027-03-31T17:30Z = 1 เม.ย. กรุงเทพ · 2027-03-31T15:30Z = 1 เม.ย. โตเกียว · 2027-04-30T15:00Z = 1 พ.ค. โตเกียว / 30 เม.ย. กรุงเทพ · 2027-04-30T16:59:59Z = 30 เม.ย. กรุงเทพ", () => {
    const ymd = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
    eq([ymd("2027-04-09T16:30:00Z", "Asia/Bangkok"), ymd("2027-04-09T16:30:00Z", "Asia/Tokyo"), ymd("2027-03-31T17:30:00Z", "Asia/Bangkok"), ymd("2027-03-31T15:30:00Z", "Asia/Tokyo"),
      ymd("2027-04-30T15:00:00Z", "Asia/Tokyo"), ymd("2027-04-30T15:00:00Z", "Asia/Bangkok"), ymd("2027-04-30T16:59:59Z", "Asia/Bangkok"), ymd("2027-04-30T17:00:00Z", "Asia/Bangkok")],
      ["2027-04-09", "2027-04-10", "2027-04-01", "2027-04-01", "2027-05-01", "2027-04-30", "2027-04-30", "2027-05-01"], "วัน");
  });
  groupLine("PC");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uN = rid("uN"), uB = rid("uB"), uT = rid("uT"), uP = rid("uP");
  let setupErr = "", settingsErr = "";
  const U: Record<string, { userId: string; tenantId: string }> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; adult: string; child: string; infant: string }> = {};
  let seq = 0, codeSeq = 0;
  const DEP: Record<string, string> = {};
  const BK: Record<string, string> = {};
  type BkIn = { dep: string; prod: string; status: string; channel: string; adults: number; children?: number; infants?: number; paid?: number; refunded?: number; commission?: number; commissionVat?: number;
    created: string; agent?: boolean; collectMode?: string; currency?: string; retained?: { amountSatang: number; vatSatang: number; passThroughSatang: number }[]; snapshot?: "ok" | "corrupt"; refund?: string };
  let mkBkX: ((key: string, b: BkIn) => Promise<string>) | null = null;
  let mkDepX: ((key: string, prod: string, date: string, o?: { cap?: number; sold?: number; held?: number; status?: string }) => Promise<string>) | null = null;
  let mkProdX: ((key: string, tenantId: string, unitId: string, o?: { title?: string; titleEn?: string; optTh?: string; optEn?: string; source?: string }) => Promise<void>) | null = null;
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripDeparture", "TripBooking", "TripBookingItem", "TripMoneyEvent", "TripRefundRequest", "TripCost", "TripPrice", "AuditLog", "ChatRateBucket"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T1.7a2 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag, tz] of [[uA, tA, "a", "Asia/Bangkok"], [uA2, tA, "a2", "Asia/Bangkok"], [uN, tA, "novat", "Asia/Bangkok"], [uT, tA, "tokyo", "Asia/Tokyo"], [uP, tA, "perf", "Asia/Bangkok"], [uB, tB, "b", "Asia/Bangkok"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({ timezone: tz }), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string, role: string, unitAccess: string[], perms: string[]) => {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(Object.fromEntries(perms.map((p) => [p, true]))), acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { userId: id, tenantId };
    };
    const DV = "trips.departure.view", RV = "trips.report.view";
    await mkUser("oa", tA, "OWNER", ["*"], []); await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("mg", tA, "MANAGER", [uA, uN], []); await mkUser("mgx", tA, "MANAGER", [uA2], []);
    await mkUser("rv", tA, "STAFF", [uA, uN], [DV, RV]);
    await mkUser("cv", tA, "STAFF", [uA], [DV, RV, "trips.cost.view"]);
    await mkUser("cvo", tA, "STAFF", [uA], [DV, "trips.cost.view"]);
    await mkUser("bv", tA, "STAFF", [uA], [DV, "trips.booking.view"]);
    await mkUser("dv", tA, "STAFF", [uA], [DV]);
    await mkUser("nodv", tA, "STAFF", [uA], [RV, "trips.cost.view", "trips.cost.edit"]);
    await mkUser("wild", tA, "STAFF", [uA], ["trips.*"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [DV, RV, "trips.cost.view"]);
    await mkUser("rl", tA, "STAFF", [uA, uN], [DV, RV]); // เพดานความถี่ต่อคนต่อหน่วย (D5)
    const mkProd = async (key: string, tenantId: string, unitId: string, o: { title?: string; titleEn?: string; optTh?: string; optEn?: string; source?: string } = {}) => {
      const id = rid(`p${key}`), opt = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t17bqc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: o.source ?? "OWN", status: "ACTIVE",
        title: JSON.stringify({ th: o.title ?? `ทดสอบ ${key}`, en: o.titleEn ?? `Test ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: o.optTh ?? "ร่วมกลุ่ม", en: o.optEn ?? "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt = (code: string, thl: string, counts: boolean, order: number) => insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th: thl, en: code }), countsCapacity: counts, active: true, sortOrder: order, updatedAt: new Date() });
      const adult = await pt("ADULT", "ผู้ใหญ่", true, 0), child = await pt("CHILD", "เด็ก", true, 1), infant = await pt("INFANT", "ทารก", false, 2);
      await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: adult, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: ADULT, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt, unit: unitId, tenant: tenantId, adult, child, infant };
    };
    mkProdX = mkProd;
    await mkProd("PR", tA, uA, { title: "ราชาทดสอบ", titleEn: "Racha test" });
    await mkProd("PX", tA, uA, { title: "=1+1 ทริปทดสอบ", titleEn: "@SUM(A1) test", optTh: "+ห้องพิเศษ", optEn: "\t=cmd" }); // ชื่อแบบสูตร (EX กันสูตร)
    await mkProd("PS", tA, uA, { title: "ทริปผู้ให้บริการ", titleEn: "Supplier trip", source: "SUPPLIER" });
    await mkProd("PA2", tA, uA2, { title: "หน่วยสองทดสอบ", titleEn: "Unit two test" }); await mkProd("PN", tA, uN, { title: "ร้านไม่จดทดสอบ", titleEn: "No VAT test" });
    await mkProd("PT", tA, uT, { title: "โตเกียวทดสอบ", titleEn: "Tokyo test" }); await mkProd("PB", tB, uB, { title: "ร้านบีทดสอบ", titleEn: "Shop B test" });
    const mkDep = async (key: string, prod: string, date: string, o: { cap?: number; sold?: number; held?: number; status?: string } = {}) => {
      const p = PRD[prod]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid(`d${key}`);
      await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
        status: o.status ?? "GUARANTEED", capacity: o.cap ?? 24, sold: o.sold ?? 0, held: o.held ?? 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
      DEP[key] = id; return id;
    };
    mkDepX = mkDep;
    const mkBk = async (key: string, b: BkIn) => {
      const p = PRD[b.prod]; const ch = b.children ?? 0, inf = b.infants ?? 0; const vatReg = p.unit !== uN;
      const sales = b.adults * ADULT + ch * CHILD, pt = b.adults * PARK_A + ch * PARK_C;
      const vat = vatReg ? vatIncl(sales) : 0; const gross = sales + pt, payable = gross;
      const C = b.commission ?? 0, Cv = b.commissionVat ?? 0; const id = rid(`b${key}`);
      const snap = b.snapshot === "corrupt" ? { v: 1 } : { v: 1, productKind: "TRIP", currency: b.currency ?? "THB", tax: { vatRegistered: vatReg, pricesIncludeVat: true, invoiceOnEachPayment: true, cancelFeeVat: false, vatRateBp: 700 },
        totals: { grossSatang: gross, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: pt, vatSatang: vat, payableSatang: payable },
        commission: C > 0 ? { commissionSatang: C, commissionVatSatang: Cv, wht: { whtSatang: 0 }, remitToShopSatang: payable - C - Cv } : null };
      const travelDate = (await q<{ d: string }>(`SELECT "localDate"::text AS d FROM "TripDeparture" WHERE id = $1`, [b.dep]))[0]?.d;
      await insertRow("TripBooking", { id, tenantId: p.tenant, unitId: p.unit, code: `T17B-${STAMP}-${++codeSeq}`, publicTokenHash: `t17b${hex(12)}`, status: b.status, productId: p.id, departureId: b.dep, travelDate,
        channel: b.channel, agentAccountId: b.agent ? `t17b-agent-${STAMP}` : null, collectMode: b.collectMode ?? "SHOP", payMethod: "PAY_LATER", contactRoute: b.agent ? "VIA_AGENT" : "DIRECT", currency: b.currency ?? "THB",
        fxRateMicros: b.currency && b.currency !== "THB" ? 36_000_000 : null, grossSatang: gross, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: pt, vatSatang: vat, commissionSatang: C, commissionVatSatang: Cv,
        whtSatang: 0, netToShopSatang: payable - C - Cv, paidSatang: b.paid ?? 0, refundedSatang: b.refunded ?? 0, accountingState: "NONE", policySnapshot: JSON.stringify(snap), version: 0, marketingEligible: false,
        createdAt: new Date(b.created), updatedAt: new Date(b.created) });
      const item = async (kind: string, qty: number, amount: number, o: { pax?: string; ptf?: boolean } = {}) => {
        if (qty <= 0) return;
        await insertRow("TripBookingItem", { id: rid("it"), tenantId: p.tenant, unitId: p.unit, bookingId: id, departureId: b.dep, kind, paxTypeId: o.pax ?? null, qty, unitPriceMinor: Math.round(amount / qty), amountMinor: amount, amountSatang: amount,
          vatSatang: 0, commissionable: !o.ptf, discountable: !o.ptf, passThrough: !!o.ptf, taxKind: o.ptf ? "NONE" : "VAT7", priceSource: "RETAIL", active: true, updatedAt: new Date() });
      };
      await item("SEAT", b.adults, b.adults * ADULT, { pax: p.adult }); await item("SEAT", ch, ch * CHILD, { pax: p.child }); await item("SEAT", inf, 0, { pax: p.infant }); await item("EXTRA", b.adults + ch, pt, { ptf: true });
      for (const [i, r] of (b.retained ?? []).entries()) await insertRow("TripMoneyEvent", { id: rid("me"), tenantId: p.tenant, unitId: p.unit, bookingId: id, kind: "RETAINED", amountSatang: r.amountSatang, vatSatang: r.vatSatang,
        passThroughSatang: r.passThroughSatang, tender: "CASH", postingStatus: "UNPOSTED", postingAttempts: 0, idempotencyKey: `t17b-ret-${id}-${i}`, createdAt: new Date(b.created), updatedAt: new Date(b.created) });
      if (b.refund) await insertRow("TripRefundRequest", { id: rid("rr"), tenantId: p.tenant, unitId: p.unit, bookingId: id, by: "CUSTOMER", reasonKind: "CUSTOMER", deductions: "[]", status: b.refund, computed: "{}", choice: "MONEY", amountSatang: 0, updatedAt: new Date() });
      BK[key] = id; return id;
    };
    mkBkX = mkBk;
    const mkCost = async (dep: string, prod: string, kind: string, amount: number, note: string | null = null) => {
      const p = PRD[prod]; return insertRow("TripCost", { id: rid("c"), tenantId: p.tenant, unitId: p.unit, departureId: dep, kind, amountSatang: amount, note, createdAt: new Date(Date.parse("2027-03-01T00:00:00Z") + (seq++) * 1000), updatedAt: new Date("2027-03-01T00:00:00Z") });
    };
    // ── dR = แผงรอบภาพ 11 (a1 §3.2 ก) · การจองเอเจนซี่จ่าย 0 (N4) · ถือ/รอ/หมดเวลา ──
    const dR = await mkDep("R", "PR", "2027-04-10", { cap: 24, sold: 15 });
    await mkBk("0142", { dep: dR, prod: "PR", status: "PAID", channel: "LIFF", adults: 2, children: 1, paid: 1_095_000, created: "2027-03-01T03:00:00Z" });
    await mkBk("0151", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "AGENT_PORTAL", adults: 2, agent: true, collectMode: "AGENT", commission: 105_000, commissionVat: 7_350, created: "2027-03-31T17:30:00Z" });
    await mkBk("0148", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "AGENT_LINK", adults: 4, agent: true, commission: 210_000, created: "2027-04-05T03:00:00Z" });
    await mkBk("0155", { dep: dR, prod: "PR", status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-04-09T16:30:00Z" });
    await mkBk("0157", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "AGENT_PORTAL", adults: 2, children: 1, agent: true, collectMode: "AGENT", commission: 94_500, created: "2027-01-20T03:00:00Z" });
    await mkBk("0160", { dep: dR, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-04-10T00:30:00Z" });
    await mkBk("hold", { dep: dR, prod: "PR", status: "HOLD", channel: "WEB", adults: 2, created: "2027-04-02T03:00:00Z" });
    await mkBk("pend", { dep: dR, prod: "PR", status: "PENDING", channel: "WEB", adults: 1, created: "2027-04-03T03:00:00Z" });
    await mkBk("exp", { dep: dR, prod: "PR", status: "EXPIRED", channel: "WEB", adults: 1, created: "2027-04-04T03:00:00Z" });
    for (const [k, a, n] of [["BOAT", 1_200_000, "เรือราชา 1"], ["FUEL", 350_000, null], ["GUIDE", 300_000, "ไกด์ 2 คน"], ["FOOD", 150_000, null], ["TRANSPORT", 150_000, "รถตู้ 2 คัน"]] as const) await mkCost(dR, "PR", k, a, n);
    // ── dN: เดินทางแล้ว · ไม่มาจ่ายบางส่วน · ยกเลิกเก็บไว้ · ต้นทุนเรือ + อุทยาน ──
    const dN = await mkDep("N", "PR", "2027-04-11", { cap: 12, sold: 3 });
    await mkBk("trav", { dep: dN, prod: "PR", status: "TRAVELLED", channel: "COUNTER", adults: 1, infants: 1, paid: 410_000, created: "2027-04-10T03:00:00Z" });
    await mkBk("nosh", { dep: dN, prod: "PR", status: "NO_SHOW", channel: "WEB", adults: 2, paid: 300_000, created: "2027-03-20T03:00:00Z" });
    await mkBk("cxlN", { dep: dN, prod: "PR", status: "CANCELLED", channel: "COUNTER", adults: 2, paid: 820_000, refunded: 470_000, created: "2027-03-25T03:00:00Z", retained: [{ amountSatang: 350_000, vatSatang: 22_897, passThroughSatang: 0 }] });
    await mkCost(dN, "PR", "BOAT", 400_000); await mkCost(dN, "PR", "PARK_FEE", 100_000, "อุทยานของไกด์");
    // ── dX: รอบยกเลิก ──
    const dX = await mkDep("X", "PR", "2027-04-12", { cap: 24, sold: 2, status: "CANCELLED" });
    await mkBk("cxlX", { dep: dX, prod: "PR", status: "CANCELLED", channel: "WEB", adults: 3, created: "2027-03-26T03:00:00Z" });
    await mkBk("pendX", { dep: dX, prod: "PR", status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-03-27T03:00:00Z" });
    await mkCost(dX, "PR", "FUEL", 120_000);
    // ── dQ: คำขอคืนเงินค้าง + ถูกปฏิเสธ · ไม่มีแถวต้นทุน ──
    const dQ = await mkDep("Q", "PR", "2027-04-13", { cap: 10, sold: 2 });
    await mkBk("rq", { dep: dQ, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-01T03:00:00Z", refund: "REQUESTED" });
    await mkBk("rj", { dep: dQ, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-01T04:00:00Z", refund: "REJECTED" });
    // ── dH: เหมาลำ · dP: สินค้า PX ไม่มีการจอง · dI: IMPORT + WEB (ยังไม่เดินทาง) ──
    const dH = await mkDep("H", "PR", "2027-04-14", { cap: 10, sold: 10 });
    await mkBk("charter", { dep: dH, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 10, created: "2027-03-01T03:00:00Z" });
    await mkDep("P", "PX", "2027-04-16", { cap: 10, sold: 0, status: "OPEN" });
    const dI = await mkDep("I", "PR", "2027-04-20", { cap: 20, sold: 3, status: "OPEN" });
    await mkBk("imp", { dep: dI, prod: "PR", status: "PAID", channel: "IMPORT", adults: 1, paid: 410_000, created: "2026-12-01T03:00:00Z" });
    await mkBk("w20", { dep: dI, prod: "PR", status: "CONFIRMED", channel: "WEB", adults: 2, created: "2027-04-14T03:00:00Z" });
    // ── dM: รอบ พ.ค. ที่จองในเดือน เม.ย. (ขอบวันจอง: 16:59:59Z นับ · 17:00:00Z ไม่นับ) ──
    const dM = await mkDep("M", "PR", "2027-05-05", { cap: 10, sold: 2, held: 2, status: "OPEN" }); // ถือ 2 ไม่นับเป็นขาย (D5)
    await mkBk("may1", { dep: dM, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-30T16:59:59Z" });
    await mkBk("may2", { dep: dM, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-04-30T17:00:00Z" });
    // ── พ.ค. (D5 อัตราเต็ม): dO เต็มพอดี (ความจุ 3 ขาย 3 = 100%) · dZ ความจุ 0 ไม่มีการจอง
    //    ผลรันรอบ 2 (ผู้ร่าง): ขายเกินความจุสร้างไม่ได้ — CHECK "sold" + "held" + "reserved" <= "capacity" (prisma/migrations/20270201000100_trips/migration.sql:1048) ⇒ เกิน 100% ตรวจได้ที่ตัวช่วย loadFactorBp เท่านั้น ──
    const dO = await mkDep("O", "PR", "2027-05-06", { cap: 3, sold: 3, status: "OPEN" });
    await mkBk("o3", { dep: dO, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 3, created: "2027-05-02T03:00:00Z" });
    await mkDep("Zc", "PR", "2027-05-07", { cap: 0, sold: 0, status: "OPEN" });
    // ── dS: มิ.ย. สินค้าผู้ให้บริการ + USD + OTA + แถว snapshot เสียโดยเจตนา (คำเตือนรวมของช่วง) ──
    const dS = await mkDep("S", "PS", "2027-06-16", { cap: 10, sold: 3, status: "OPEN" });
    await mkBk("usd", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "COUNTER", adults: 1, currency: "USD", created: "2027-05-20T03:00:00Z" });
    await mkBk("ota", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "OTA", adults: 1, created: "2027-05-20T04:00:00Z" });
    await mkBk("corrupt", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "WEB", adults: 1, created: "2027-05-20T05:00:00Z", snapshot: "corrupt" });
    // ── หน่วยไม่จด VAT ──
    const dV = await mkDep("V", "PN", "2027-04-10", { cap: 12, sold: 3 });
    await mkBk("vAg", { dep: dV, prod: "PN", status: "CONFIRMED", channel: "AGENT_LINK", adults: 2, agent: true, commission: 100_000, commissionVat: 7_000, created: "2027-04-01T03:00:00Z" });
    await mkBk("vDi", { dep: dV, prod: "PN", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-02T03:00:00Z" });
    await mkCost(dV, "PN", "BOAT", 200_000);
    // ── หน่วยโตเกียว ──
    const dT = await mkDep("T", "PT", "2027-04-10", { cap: 10, sold: 3 });
    await mkBk("tk1", { dep: dT, prod: "PT", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-09T16:30:00Z" });
    await mkBk("tk2", { dep: dT, prod: "PT", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-03-31T15:30:00Z" });
    await mkBk("tk4", { dep: dT, prod: "PT", status: "PAID", channel: "COUNTER", adults: 1, paid: 410_000, created: "2027-04-11T03:00:00Z" }); // จองหลังวันเดินทาง 1 วัน (D5 · ระยะติดลบ)
    const dT2 = await mkDep("T2", "PT", "2027-05-10", { cap: 10, sold: 2, status: "OPEN" });
    await mkBk("tk3", { dep: dT2, prod: "PT", status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-04-30T15:00:00Z" });
    // ── หน่วยอื่น/ร้านอื่น (ต้นทุน 999,900) ──
    for (const [k, prod] of [["A2", "PA2"], ["B", "PB"]] as const) {
      const d = await mkDep(k, prod, "2027-04-10", { cap: 30, sold: 2 });
      await mkBk(`m${k}`, { dep: d, prod, status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-04-02T03:00:00Z" });
      await mkCost(d, prod, "BOAT", 999_900);
    }
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  try {
    if (!setupErr) {
      const setS = SETI.mod?.setSettings; if (typeof setS !== "function") throw new Error(`settings.setSettings ไม่มี (${SETI.err.slice(0, 80)})`);
      const owner = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: U.oa.userId };
      const reg = (unit: string, registered: boolean) => ({ key: "trips.tax.vatRegistered", scope: "UNIT", scopeId: unit, value: { registered, thresholdSatang: 180_000_000, warnAtPct: 90 } });
      const r = asRec(await (setS as AnyFn)(owner, { tenantId: tA }, [reg(uA, true), reg(uN, false), reg(uP, true)], { ackLegalWarn: true })) ?? {};
      if (r.ok !== true) throw new Error(`setSettings: ${fmt(r)}`);
    }
  } catch (e) { settingsErr = errMsg(e); console.log(`  ⚠️ ตั้งค่า VAT ของหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needSetup = () => { ok(!setupErr, `ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); ok(!settingsErr, `ตั้งค่า VAT ไม่สำเร็จ: ${settingsErr}`); };
  const ctxOf = (tag: string): Ctx => { const a = U[tag]; if (!a) throw new AssertFail(`ไม่มีผู้ใช้ชั่วคราว ${tag} (${setupErr || "ยังไม่ตั้ง"})`); return { tenantId: a.tenantId, actorUserId: a.userId }; };
  const optsR = { now: NOW_R };
  const summary = (tag: string, dep: string, unit = uA, opts: Rec = optsR) => call("departureMoneySummary", ctxOf(tag), { unitId: unit, departureId: dep }, opts);
  const sumV = async (tag: string, dep: string, unit = uA, opts: Rec = optsR) => V(await summary(tag, dep, unit, opts), `departureMoneySummary ${tag}`);
  const rep = (tag: string, input: Rec = {}, unit = uA, opts: Rec = optsR) => call("loadTripReportVM", ctxOf(tag), { unitId: unit, ...APR, ...input }, opts);
  const repVM = async (tag: string, input: Rec = {}, unit = uA, opts: Rec = optsR) => VM(await rep(tag, input, unit, opts), `loadTripReportVM ${tag} ${fmt(input)}`);
  const exp = (tag: string, input: Rec = {}, unit = uA, opts: Rec = optsR) => call("exportTripReportCsv", ctxOf(tag), { unitId: unit, ...APR, ...input }, opts);
  const T = (vm: Rec) => asRec(vm.totals) ?? {};
  const depRows = (vm: Rec) => asArr(asRec(vm.departures)?.rows);
  const auditN = async (action: string, tenant = tA) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = $1 AND "tenantId" = $2`, [action, tenant]))[0]?.n ?? 0;
  const A_EXP = "trips.report.exported";

  // ═══════════════ PC (ต่อ) — ฟิกซ์เจอร์ + ตัวคิด a1 บนร้านชั่วคราว ═══════════════
  console.log("\n── PC (ต่อ): ฟิกซ์เจอร์ + ของเดิม ──");
  await st("PC-7", "ฟิกซ์เจอร์สอดคล้องกันเองจากแถวดิบ (N4 N12): เอเจนซี่จ่าย 0 · PAID จ่ายครบ / CONFIRMED HOLD PENDING EXPIRED จ่าย 0 · ยกเลิก: จ่าย − คืน = Σ RETAINED · snapshot ครบยกเว้นแถวเสียโดยเจตนา 1 · sold ของทุกรอบ = Σ ที่นั่งกินความจุของการจองสถานะ LIVE", async () => {
    needSetup();
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = $1 AND "agentAccountId" IS NOT NULL AND "paidSatang" > 0`, [tA]))[0]?.n, 0, "เอเจนซี่จ่าย > 0");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" b WHERE b."tenantId" = $1 AND ((b.status = 'PAID' AND b."paidSatang" <> (b."policySnapshot"->'totals'->>'payableSatang')::int) OR (b.status IN ('CONFIRMED','HOLD','PENDING','EXPIRED') AND b."paidSatang" <> 0))`, [tA]))[0]?.n, 0, "สถานะกับยอดจ่าย");
    const cx = await q<{ d: number; r: number }>(`SELECT (b."paidSatang" - b."refundedSatang")::int AS d, COALESCE((SELECT sum(e."amountSatang") FROM "TripMoneyEvent" e WHERE e."bookingId" = b.id AND e.kind = 'RETAINED'), 0)::int AS r FROM "TripBooking" b WHERE b."tenantId" = $1 AND b.status = 'CANCELLED'`, [tA]);
    ok(cx.length >= 2 && cx.every((x) => x.d === x.r), `ยกเลิก: ${fmt(cx)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = ANY($1::text[]) AND (jsonb_typeof("policySnapshot"->'tax'->'vatRegistered') IS DISTINCT FROM 'boolean' OR jsonb_typeof("policySnapshot"->'totals'->'payableSatang') IS DISTINCT FROM 'number')`, [[tA, tB]]))[0]?.n, 1, "แถว snapshot เสีย");
    const so = await q<{ id: string; sold: number; s: number }>(`SELECT d.id, d.sold, COALESCE((SELECT sum(i.qty) FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" JOIN "TripPaxType" pt ON pt.id = i."paxTypeId"
      WHERE i."departureId" = d.id AND i.kind = 'SEAT' AND i.active AND pt."countsCapacity" AND b.status = ANY($2::text[])), 0)::int AS s FROM "TripDeparture" d WHERE d."tenantId" = $1`, [tA, LIVE]);
    ok(so.every((x) => x.sold === x.s), `sold ≠ ที่นั่ง: ${fmt(so.filter((x) => x.sold !== x.s))}`);
  });
  const MK = ["bookings", "cancelledBookings", "pendingRefundBookings", "seats", "sold", "capacity", "salesSatang", "vatSatang", "commissionCostSatang", "costSatang", "collectedSatang", "outstandingSatang", "heldSatang", "noCosts"];
  const TABLE: Record<string, unknown[]> = {
    R: [6, 0, 0, 15, 15, 24, 5_040_000, 329_718, 409_500, 2_150_000, 1_915_000, 410_000, 0, false],
    N: [2, 1, 0, 3, 3, 12, 1_000_000, 65_420, 0, 500_000, 1_060_000, 0, 0, false],
    X: [0, 1, 1, 2, 2, 24, 0, 0, 0, 120_000, 0, 0, 820_000, false],
    Q: [1, 0, 1, 2, 2, 10, 350_000, 22_897, 0, 0, 410_000, 0, 410_000, true],
    H: [1, 0, 0, 10, 10, 10, 3_500_000, 228_972, 0, 0, 0, 4_100_000, 0, true],
    P: [0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, true],
    I: [2, 0, 0, 3, 3, 20, 1_050_000, 68_691, 0, 0, 410_000, 820_000, 0, true],
  };
  await st("PC-8", "ตัวคิด a1 ต่อรอบ (departureMoneySummary · OWNER) ตรงตาราง §4.5 ทั้ง 7 รอบของ เม.ย. — ฐานของการกระทบยอด RC", async () => {
    needSetup(); const bad: string[] = [];
    for (const [k, want] of Object.entries(TABLE)) { const got = pick(await sumV("oa", DEP[k]), MK); if (!isDeepStrictEqual(got, want)) bad.push(`d${k}: ${fmt(got)} ต้อง ${fmt(want)}`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  // ── ตัวเรนเดอร์ / ตัวเรียก action / ตัวนับคิวรี (ใช้ทั้งไฟล์) ──
  const req = createRequire(import.meta.url);
  let renderErr = "";
  const RX = (() => { try { return { intl: req("next-intl") as Rec, ui: req("use-intl") as Rec, arc: req("next/dist/shared/lib/app-router-context.shared-runtime.js") as Rec, react: req("react") as Rec, rds: req("react-dom/server") as Rec }; } catch (e) { renderErr = errMsg(e); return null; } })();
  const unent = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const render = (comp: unknown, props: Rec, locale: "th" | "en" = "th"): string => {
    ok(RX, `เรนเดอร์ไม่ได้ (${renderErr})`); ok(typeof comp === "function", "ไม่มีคอมโพเนนต์");
    const ce = RX?.react.createElement as AnyFn; const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    const el = ce(asRec(RX?.arc.AppRouterContext)?.Provider, { value: router }, ce(RX?.intl.NextIntlClientProvider, { locale, messages: { trips: locale === "th" ? th : en }, timeZone: "Asia/Bangkok" }, ce(comp, props)));
    return String((RX?.rds.renderToStaticMarkup as AnyFn)(el));
  };
  const byTestid = (html: string, id: string): string => {
    const i = html.indexOf(`data-testid="${id}"`); if (i < 0) return "";
    const st0 = html.lastIndexOf("<", i); const tag = /^<(\w+)/.exec(html.slice(st0))?.[1] ?? "div";
    if (/^(input|img|br|hr|meta|link)$/.test(tag)) return html.slice(st0, html.indexOf(">", i) + 1);
    let depth = 0; const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g"); re.lastIndex = st0;
    for (let m = re.exec(html); m; m = re.exec(html)) { if (m[2]) continue; depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(st0, m.index + m[0].length); }
    return html.slice(st0);
  };
  const hrefOf = (html: string, id: string): string | null => { const t = byTestid(html, id); const m = /^<a\b[^>]*\shref="([^"]*)"/.exec(t); return m ? decode(m[1] ?? "") : null; };
  const queryOfHref = (href: string): Record<string, string | string[]> => { const u = new URL(href, "http://qc.local"); const o: Record<string, string | string[]> = {}; for (const k of new Set(u.searchParams.keys())) { const all = u.searchParams.getAll(k); o[k] = all.length > 1 ? all : (all[0] ?? ""); } return o; };
  const PARTS = await tryImport("@/components/trips/CostParts");
  const CSCREEN = await tryImport("@/components/trips/CostScreen");
  const RSCREEN = await tryImport("@/components/trips/ReportScreen");
  const DSCREEN = await tryImport("@/components/trips/DeparturesScreen");
  const screenR = (vm: unknown, locale: "th" | "en" = "th", error: string | null = null) => render(RSCREEN.mod?.default, { vm, error }, locale);
  // server action ในขอบเขตคำขอของ Next (เทคนิค qc-trips-t1.7 AC)
  const nextWork = (await tryImport("next/dist/server/app-render/work-async-storage.external.js")).mod as Rec | null;
  const nextWorkUnit = (await tryImport("next/dist/server/app-render/work-unit-async-storage.external.js")).mod as Rec | null;
  const nextCookies = (await tryImport("next/dist/server/web/spec-extension/cookies.js")).mod as Rec | null;
  const ENV = await tryImport("@/lib/env");
  const HASH = await tryImport("@/lib/core/hash");
  const SESSION_COOKIE = asRec(ENV.mod)?.secureCookies === false ? "shark_session" : "__Host-shark_session";
  const cookieOf: Record<string, string> = {};
  const sessionCookie = async (tag: string): Promise<string> => {
    needSetup();
    ok(asRec(nextWork?.workAsyncStorage) && asRec(nextWorkUnit?.workUnitAsyncStorage) && typeof nextCookies?.RequestCookies === "function", "ตั้งขอบเขตคำขอของ Next ไม่ได้ (โมดูลภายในของ next หาย)");
    if (!cookieOf[tag]) {
      const token = `t17bac${randomBytes(24).toString("hex")}`; const sha = HASH.mod?.sha256 as AnyFn | undefined; ok(typeof sha === "function", "ไม่มี sha256");
      await insertRow("Session", { id: rid("ss"), userId: U[tag]?.userId, tokenHash: String((sha as AnyFn)(token)), idleExpiresAt: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + DAY), createdAt: new Date() });
      cookieOf[tag] = `${SESSION_COOKIE}=${token}; shark_tenant=${U[tag]?.tenantId}`;
    }
    return cookieOf[tag];
  };
  const SLUG_A = `${SLUG}a-${STAMP}`;
  const runAction = async (f: unknown, tag: string, path: string, args: unknown[], locale?: "en" | "th"): Promise<Rec> => {
    const cookie = `${await sessionCookie(tag)}${locale ? `; LOCALE=${locale}` : ""}`;
    ok(typeof f === "function", "ไม่มี action");
    const reqq = new Request(`http://qc.local${path}`, { headers: { cookie, "user-agent": "qc-t17b-ac" } });
    const jar = new (nextCookies?.RequestCookies as new (h: Headers) => unknown)(reqq.headers);
    const workStore = { route: path, page: `${path}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unitStore = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: reqq.headers, draftMode: undefined, rootParams: {}, url: { pathname: path, search: "" } };
    const run = (s: Rec | null, store: unknown, g: () => unknown) => (s?.run as (st: unknown, g: () => unknown) => unknown).call(s, store, g);
    try {
      return asRec(await run(asRec(nextWork?.workAsyncStorage), workStore, () => run(asRec(nextWorkUnit?.workUnitAsyncStorage), unitStore, () => (f as AnyFn)(...args)))) ?? { ok: "NONE" };
    } catch (e) { return { ok: "THROW", e: errMsg(e), digest: String(asRec(e)?.digest ?? "") }; }
  };
  const RACT = await tryImport("@/lib/modules/trips/report-actions");
  const actExport = (tag: string, input: unknown, locale?: "en" | "th", slug = SLUG_A) => {
    ok(typeof RACT.mod?.exportTripReportCsvAction === "function", `ยังไม่มี exportTripReportCsvAction (${RACT.err.slice(0, 100)})`);
    return runAction(RACT.mod?.exportTripReportCsvAction, tag, `/app/u/${slug}/trips/reports`, [slug, input], locale);
  };
  /** นับคิวรีของการเรียกหนึ่งครั้ง (หลัง warm-up) */
  let settingsBase = 0;
  const measure = async (f: () => Promise<unknown>): Promise<{ n: number; ms: number; r: unknown; sql: string[] }> => {
    await f(); sqlLog = []; counting = true; const t0 = Date.now();
    try { const r = await f(); return { n: realSql().length, ms: Date.now() - t0, r, sql: realSql() }; } finally { counting = false; }
  };
  await st("PC-9", "ตัวช่วยของข้อสอบทำงานกับของเดิม (positive control): เรนเดอร์ CostMoneyCard ของ dR ได้ข้อความประมาณการ · เรียก saveDepartureCostsAction ในขอบเขตคำขอได้ FORBIDDEN สำหรับ rv (ถึง action จริง) · ตัวนับคิวรีเห็น departureMoneySummary > 0 คำสั่ง และเท่ากันสองครั้ง", async () => {
    needSetup();
    const pm = VM(await call("loadDeparturePanelVM", ctxOf("oa"), { unitId: uA, departureId: DEP.R }, optsR), "panel dR").money;
    ok(unent(render(PARTS.mod?.CostMoneyCard, { money: pm })).includes(String(fth["departures.money.estimate"] ?? "\u0000")), "เรนเดอร์การ์ดไม่ได้ข้อความประมาณการ");
    const CA = await tryImport("@/lib/modules/trips/cost-actions");
    const r = await runAction(CA.mod?.saveDepartureCostsAction, "rv", `/app/u/${SLUG_A}/trips/departures/x/costs`, [SLUG_A, { departureId: DEP.Q, expectedToken: "x", rows: [] }]);
    eq([r.ok, r.code], [false, "FORBIDDEN"], `action ของ a1 (${String(r.e ?? "").slice(0, 120)})`);
    const a = await measure(() => summary("oa", DEP.R)), b = await measure(() => summary("oa", DEP.R));
    ok(a.n > 0 && a.n === b.n, `ตัวนับ: ${a.n} / ${b.n}`);
    // D3: ฐานของข้อ "อ่านค่าตั้ง VAT ครั้งเดียวต่อการโหลด" = จำนวนคำสั่งที่แตะ "SettingValue" ของการเรียก resolveSettings 1 ครั้ง
    const rs0 = SETI.mod?.resolveSettings; ok(typeof rs0 === "function", "ไม่มี resolveSettings");
    const m0 = await measure(async () => (rs0 as AnyFn)({ tenantId: tA }, ["trips.tax.vatRegistered"], { unitId: uA }, NOW_R));
    settingsBase = m0.sql.filter((x) => /"SettingValue"/.test(x)).length; ok(settingsBase >= 1, `resolveSettings ไม่แตะ SettingValue (${fmt(m0.sql.slice(0, 2))})`);
    console.log(`     ℹ️ departureMoneySummary = ${a.n} คำสั่ง SQL · resolveSettings ครั้งเดียว = ${settingsBase} คำสั่งที่แตะ SettingValue`);
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์/กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const compFiles = walk(COMP).filter((f) => /^Report/.test(basename(f)));
  const ownFiles = [...OWN_NEW, ...compFiles];
  const needOwn = () => { const miss = OWN_NEW.filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มีไฟล์: ${miss.join(", ")}`); ok(compFiles.some((f) => basename(f) === "ReportScreen.tsx"), "ยังไม่มี ReportScreen.tsx"); };
  const mineK = (f: Record<string, string>) => Object.entries(f).filter(([k]) => k.startsWith("report."));
  await st("S-1", "ไฟล์ของใบมีครบ: reports.ts · report-actions.ts · หน้า reports · ReportScreen.tsx (+ Report*.tsx)", () => needOwn());
  await st("S-2", `facade trips ส่งออก ${FACADE_FNS.length} ฟังก์ชัน + ${FACADE_CONSTS.length} ค่าคงที่ (บล็อก T1.7a2 · รายชื่อชัด ไม่มี export *) · บล็อก T1.7a1 เดิมยังอยู่`, () => {
    const miss = [...FACADE_FNS.filter((n) => typeof needTrips()[n] !== "function"), ...FACADE_CONSTS.filter((n) => needTrips()[n] === undefined)];
    ok(miss.length === 0, `ยังไม่มี: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` …(+${miss.length - 8})` : ""}`);
    const idx = read(MOD + "index.ts");
    ok(/T1\.7a2/.test(idx) && /T1\.7a1/.test(idx) && !/export \* from "\.\/(report-core|costs|reports)"/.test(idx), "index.ts ต้องมีบล็อก T1.7a2 แบบรายชื่อชัด");
  });
  await st("S-3", "report-core.ts บริสุทธิ์: import ค่าได้เฉพาะ ./money-math ./booking-view-core ./money-core ./departures-core ./manifest-core · ไม่มี I/O · ไม่อ่านนาฬิกา", () => {
    const s = stripComments(read(PURE)); ok(/export function reportCsv/.test(s), "ยังไม่มีตัวช่วยของ a2 ใน report-core");
    const imps = [...s.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const bad = imps.filter((p) => !["./money-math", "./booking-view-core", "./money-core", "./departures-core", "./manifest-core"].includes(p));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
    ok(!/Date\.now\(|new Date\(\s*\)|\.get(Day|Date|Hours|Month|FullYear)\(/.test(s), "อ่านนาฬิกา/ใช้ getter เวลาเครื่อง");
    ok(!/\bprisma\b|tenantDb|\$queryRaw|node:fs|console\./.test(s), "มี I/O");
  });
  await st("S-4", "report-actions.ts: \"use server\" · ส่งออกเฉพาะ exportTripReportCsvAction (async function) · requireUnit · assertCan(trips.departure.view + trips.report.view) + ForbiddenError · อ่าน body.from/to/productId · unitId จาก slug · ภาษาจากคุกกี้ LOCALE (isLocale/LOCALE_COOKIE) · ไม่รับ/ไม่สร้างเวลา", () => {
    needOwn(); const raw = read(ACTIONS), s = stripComments(raw);
    ok(/^\s*["']use server["']/.test(raw), "ไม่มี \"use server\"");
    const exps = [...s.matchAll(/export\s+(async\s+function|function|const|let|class|type|interface|default)\s+(\w+)?/g)].map((m) => [m[1], m[2]]);
    eq(exps, [["async function", "exportTripReportCsvAction"]], "export");
    ok(/requireUnit\(/.test(s) && /assertCan\(/.test(s) && /ForbiddenError/.test(s) && /["']trips\.departure\.view["']/.test(s) && /["']trips\.report\.view["']/.test(s), "requireUnit/assertCan/ForbiddenError/คีย์");
    ok(/body\.from/.test(s) && /body\.to\b/.test(s) && /body\.productId/.test(s) && /unitId:\s*unit\.id/.test(s), "action ไม่อ่าน/ไม่ส่งต่อ from · to · productId · unitId จาก slug");
    ok(/LOCALE_COOKIE/.test(s) && /isLocale\(/.test(s) && /cookies\(\)/.test(s), "ภาษาไม่ได้มาจากคุกกี้ LOCALE");
    ok(!/\bnow\s*[:=]/.test(s) && !/new Date\(/.test(s) && !/body\.(locale|basis|channel|unitId|now)\b/.test(s), "action รับเวลา/ภาษา/ฐาน/หน่วยจาก input");
    // D3: action ส่งต่อบริการสองอาร์กิวเมนต์ (ไม่มี opts/caps)
    ok(/exportTripReportCsv\(/.test(s) && !/\bcaps\b|\bopts\b|\{\s*now\b/.test(s), "action ส่ง opts/caps/now ให้บริการ (ต้องเรียกสองอาร์กิวเมนต์)");
  });
  await st("S-5", "reports.ts: ไม่มีนาฬิกาฐานข้อมูล · **ไม่มี AT TIME ZONE** (N10 · ขอบ UTC จาก reportUtcBoundsOf) · ไม่มี await ในลูป / .map(async · เขียนได้เฉพาะ AuditLog · ไม่ส่ง outbox · console เฉพาะ error · เพดาน LIMIT/take ผูก REPORT_DEPARTURE_CAP/REPORT_BOOKING_CAP · เพดานความถี่ checkRateLimitDb + REPORT_EXPORT_RATE", () => {
    needOwn(); const r = stripComments(read(REPORTS));
    ok(!/\bnow\(\)|CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP|statement_timestamp|clock_timestamp|transaction_timestamp/i.test(r), "มีนาฬิกาฐานข้อมูล");
    ok(!/AT\s+TIME\s+ZONE/i.test(r) && /reportUtcBoundsOf\(/.test(r), "ต้องใช้ขอบ UTC จาก reportUtcBoundsOf ไม่ใช่ AT TIME ZONE");
    ok(!/\.(map|forEach)\(\s*async/.test(r), ".map(async");
    const loops = [...r.matchAll(/\b(for|while)\s*\([^)]*\)\s*\{([^{}]|\{[^{}]*\})*\}/g)].map((m) => m[0]); ok(!loops.some((l) => /\bawait\b/.test(l)), "await ในลูป");
    const writes = [...r.matchAll(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/gi)].map((m) => m[1]).concat([...r.matchAll(/\b(trip[A-Z]\w*|auditLog)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(/g)].map((m) => m[1]));
    ok(writes.every((w) => /^auditLog$|^AuditLog$/.test(w)), `เขียนตารางต้องห้าม: ${writes.join(",")}`);
    ok(!/outboxEvent|OutboxEvent|emitTx\(|publishEvent\(|enqueue\w*\(/.test(r) && !/console\.(log|info|debug|warn)\(/.test(r), "outbox/console");
    ok(/REPORT_DEPARTURE_CAP/.test(r) && /REPORT_BOOKING_CAP/.test(r) && /checkRateLimitDb\(/.test(r) && /REPORT_EXPORT_RATE/.test(r), "เพดาน/ความถี่ไม่ผูกค่าคงที่");
  });
  await st("S-6", "สูตรเดียว (§4.4): reports.ts ไม่มีตรรกะ payable/VAT/รอคืนเงินของตัวเอง (payableJson inclVatJson vatRegJson openRefund TRIP_REFUND_OPEN_STATUSES) และไม่เรียก bookingMoneyOf เอง — ใช้ตัวอ่านร่วมของ costs.ts · costs.ts ยังเป็นที่เดียวของ SQL การจอง (\"TripBooking\" ปรากฏใน SQL ของ costs.ts ไม่ใช่ใน reports.ts นอก AuditLog)", () => {
    needOwn(); const r = stripComments(read(REPORTS));
    ok(!/payableJson|inclVatJson|vatRegJson|openRefund|TRIP_REFUND_OPEN_STATUSES|pricesIncludeVat/.test(r), "reports.ts มีตรรกะเงินต่อการจองของตัวเอง");
    ok(!/bookingMoneyOf\(/.test(r) && /from\s+["']\.\/costs["']/.test(r), "reports.ts ต้องใช้ตัวอ่านร่วมจาก ./costs (ไม่คิด bookingMoneyOf ซ้ำ)");
    ok(!/FROM\s+"TripBooking"/i.test(r) && !/tripBooking\.(findMany|findFirst|groupBy|aggregate|count)\(/.test(r), "reports.ts อ่านการจองเอง (ต้องผ่านตัวอ่านร่วมของ costs.ts)");
  });
  await st("S-7", "สิทธิ์ต้นทุนแคบ (N9): ไม่มีตัวอักษร \"trips.cost.\" ในไฟล์ใหม่ (reports.ts · report-actions.ts · หน้า · Report*.tsx) · reports.ts ใช้ costAccessOf · ต้นทุนอ่านใต้เงื่อนไขสิทธิ์ (Q16)", () => {
    needOwn(); const COST_KEY_LIT = /trips\.cost\.(?!saved["'`])/;
    const leak = ownFiles.filter((f) => COST_KEY_LIT.test(stripComments(read(f)))); ok(leak.length === 0, `ชื่อคีย์ต้นทุนในไฟล์ใหม่: ${leak.join(", ")}`);
    const r = stripComments(read(REPORTS)); ok(/costAccessOf\(/.test(r), "reports.ts ไม่ใช้ costAccessOf");
    const reads = [...r.matchAll(/tripCost\.(findMany|findFirst|count|aggregate|groupBy)\(|"TripCost"/g)].map((m) => m.index ?? 0);
    ok(reads.length > 0 && reads.every((i) => /costView|\.view\b|canSeeCost/.test(r.slice(Math.max(0, i - 240), i))), "ทางอ่านต้นทุนของ reports.ts ไม่มีเงื่อนไขสิทธิ์ต้นทุน (หรือไม่มีทางอ่าน)");
  });
  await st("S-8", "หน้า reports/page.tsx: requireUnit → tripsPageGate(\"departures\") → reportQueryOf(searchParams) → loadTripReportVM({ unitId: unit.id, … }) → <ReportScreen vm error> · โหลดซ้ำด้วยค่าปริยายเมื่อ INVALID_INPUT/RANGE_TOO_LARGE/REPORT_TOO_LARGE · TripsForbidden · notFound · ไม่ import prisma · ไม่มี 'use client' · ไม่ส่ง now", () => {
    needOwn(); const s = stripComments(read(REPORT_PAGE));
    ok(/requireUnit\(/.test(s) && /tripsPageGate\(/.test(s) && /["']departures["']/.test(s) && /reportQueryOf\(/.test(s) && /loadTripReportVM\(/.test(s) && /unitId:\s*unit\.id/.test(s), "ด่าน/ตัวโหลด");
    ok(/<ReportScreen\b[^>]*\bvm=/.test(s) && /error=/.test(s) && /TripsForbidden/.test(s) && /notFound\(/.test(s), "ReportScreen/TripsForbidden/notFound");
    ok(/RANGE_TOO_LARGE/.test(s) && /\.field\b/.test(s) && /REPORT_TOO_LARGE/.test(s), "ไม่จัดการรหัสผิดของตัวกรอง (ทิ้งช่องตาม field · §5.7)");
    ok(!/@\/lib\/core\/db|@prisma\/client|\bprisma\./.test(s) && !/["']use client["']/.test(s) && !/\bnow\s*:/.test(s) && !/caps/.test(s), "prisma/use client/now/caps");
  });
  await st("S-9", "คอมโพเนนต์ Report*: ไม่ import บริการ/ฐาน (นอกจาก report-actions + import type) · ใช้ formatBaht · ไม่คิดเลขเงิน · บรรทัด VAT ผ่าน vatShown ของ ./CostParts (ไม่เทียบ vatSatang เอง · Q11) · ReportScreen ไม่ใช้ useSearchParams/useRouter/usePathname (ลิงก์จาก VM) · ไม่มีคำ POS", () => {
    needOwn(); const bad: string[] = [];
    for (const f of compFiles) {
      const s = stripComments(read(f));
      if (/from\s+["']@\/lib\/(core\/db|modules\/trips\/(costs|reports|report-core|pricing|booking|money)[^"']*)["']/.test(s.replace(/import\s+type[^;]+;/g, ""))) bad.push(`${f}: import บริการ/ฐาน`);
      if (/\w+Satang\s*[-+*/](?!=)|[-+*/]\s*\w+\.\w+Satang\b|\.reduce\(/.test(s)) bad.push(`${f}: คิดเลขเงิน`);
      if (/vatSatang\s*(>|>=|===|!==|<=|<)\s*0|0\s*(<|===|!==)\s*\w*\.?vatSatang/.test(s)) bad.push(`${f}: ตัดสินบรรทัด VAT เอง`);
      if (/\bPOS\b/.test(s.replace(/data-[\w-]+=/g, ""))) bad.push(`${f}: คำว่า POS`);
    }
    const scr = stripComments(read(`${COMP}/ReportScreen.tsx`));
    if (/useSearchParams|useRouter|usePathname/.test(scr)) bad.push("ReportScreen ใช้ hook ของ router (ต้องทำงานโดยไม่มี JS)");
    const all = compFiles.map((f) => stripComments(read(f))).join("\n");
    ok(/formatBaht\(/.test(all) && /vatShown\(/.test(all) && /import[^;]*\bvatShown\b[^;]*from\s+["']\.\/CostParts["']/.test(all), "ไม่ใช้ formatBaht/vatShown ของ CostParts");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-10", `ข้อความ report.*: ข้อความไทยที่ตรึง ${Object.keys(PINNED).length} คีย์ตรงตัวอักษร · คีย์ขั้นต่ำ ${I18N_REQUIRED.length} ครบสองภาษา · ชุดคีย์ report.* เท่ากัน · ไม่มีคำต้องห้าม/รหัสดิบ/รหัสใบงาน · อังกฤษไม่มีอักษรไทย · revenueNoVat ไม่มีคำ VAT · อังกฤษเอกพจน์/พหูพจน์ (noCosts · charter · lead.notCounted · lead.negative)`, () => {
    const wrong = Object.entries(PINNED).filter(([k, v]) => fth[k] !== v); ok(wrong.length === 0, `ข้อความไม่ตรง ${wrong.length}: ${fmt(wrong.map(([k]) => [k, fth[k]]).slice(0, 3))}`);
    const miss = I18N_REQUIRED.filter((k) => !fth[k] || !fen[k]); ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
    eq(mineK(fth).map(([k]) => k).sort(), mineK(fen).map(([k]) => k).sort(), "ชุดคีย์สองภาษา");
    const bad = [...mineK(fth), ...mineK(fen)].filter(([, v]) => forbiddenHit(v) !== null || /\b[TAWKLSCX]\d\.\d+[a-z]?\d?\b|\bOQ\d+\b/.test(v) || v.split(/[^A-Z_0-9]+/).some((w) => RAW_CODES.has(w)));
    ok(bad.length === 0, `ข้อความต้องห้าม: ${fmt(bad.slice(0, 4))}`);
    ok(!mineK(fen).some(([, v]) => THAI.test(v)) && !THAI.test(fen["departures.actions.reports"] ?? "ก"), "อังกฤษมีอักษรไทย");
    ok(!/VAT/i.test(fth["report.kpi.revenueNoVat"] ?? "VAT") && !/VAT/i.test(fen["report.kpi.revenueNoVat"] ?? "VAT") && !/VAT/i.test(fen["report.csv.revenueNoVat"] ?? "VAT"), "revenueNoVat มีคำ VAT");
    const tr = (RX?.ui.createTranslator as AnyFn)({ locale: "en", messages: { trips: en }, namespace: "trips" }) as AnyFn; const pl: string[] = [];
    for (const [k, w] of [["report.noCosts", "departure"], ["report.charter", "departure"], ["report.lead.notCounted", "booking"], ["report.lead.negative", "booking"]] as const) {
      const one = String(tr(k, { n: 1, ended: 1, upcoming: 0 })), two = String(tr(k, { n: 2, ended: 1, upcoming: 1 }));
      if (!new RegExp(`\\b1 ${w}\\b(?!s)`).test(one) || !new RegExp(`\\b2 ${w}s\\b`).test(two)) pl.push(`${k}: "${one}" / "${two}"`);
    }
    ok(pl.length === 0, pl.join(" · "));
  });
  await st("S-11", `testid ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length} อยู่ในซอร์ส · ทะเบียนปุ่ม wo T1.7a2 ครบ · needs = คีย์จริง (คีย์ต้นทุนไม่ใช่ needs ของปุ่มที่ทุกคนเห็น)`, () => {
    needOwn(); const src = [...compFiles, DEPSCREEN, REPORT_PAGE].map((f) => read(f)).join("\n");
    const miss = [...TESTIDS_FIXED.filter((t) => !src.includes(`"${t}"`) && !src.includes(`'${t}'`)), ...TESTID_PATTERNS.filter((p) => !src.includes(`\`${p}\${`))];
    ok(miss.length === 0, `ไม่พบ: ${miss.slice(0, 8).join(", ")}`);
    const inv = asRec((() => { try { return JSON.parse(read("scripts/trips-ui-inventory.json")); } catch { return null; } })()) ?? {};
    const rows = asArr(inv.rows).filter((r) => r.wo === "T1.7a2"); const ids = new Set(rows.map((r) => String(r.testid)));
    const missInv = [...TESTIDS_FIXED, ...TESTID_PATTERNS.map((p) => `${p}*`)].filter((t) => !ids.has(t)); ok(missInv.length === 0, `ทะเบียนปุ่มขาด: ${missInv.slice(0, 6).join(", ")}`);
    const permKeys = new Set([...read(PERMS).matchAll(/"(trips\.[\w.*]+)":/g)].map((m) => m[1]));
    ok(!rows.some((r) => String(r.needs ?? "").split("+").some((k) => k && !permKeys.has(k))), "needs ไม่ใช่คีย์จริง");
  });
  await st("S-12", `ฉากภาพ TRIPS_VISUAL_SPECS["t1.7a2"] = ${VISUAL_SCENES.join(" · ")} (ผู้ร่างเพิ่ม · ภาษาอังกฤษผ่าน locale "en")`, () => {
    const s = read("scripts/visual-trips.mts"); const at = s.indexOf('"t1.7a2": ['); ok(at >= 0, "ไม่มีกลุ่ม t1.7a2");
    const blk = s.slice(at, s.indexOf("\n  ],", at));
    for (const n of VISUAL_SCENES) ok(new RegExp(`name: "${n}", mockup: "11"`).test(blk), `ไม่มีฉาก ${n}`);
    ok(/name: "reports-sales-en"[^\n]*locale: "en"/.test(blk) && /name: "departure-costs-en"[^\n]*locale: "en"/.test(blk) && /locale\?: "en"/.test(s), "ฉากอังกฤษต้องใช้ locale: \"en\"");
  });
  await st("S-13", `ขอบเขต (เทียบ BASE ${BASE_SHA.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips หรือ commit ฝั่ง main ที่รวมแล้ว) · ไฟล์จำกัดอยู่ในงบ · ไฟล์ใหม่เฉพาะของใบ`, () => {
    needOwn();
    const lit = (p: string) => `:(literal)${p}`;
    const atBase = (dir: string) => git(["ls-tree", "-r", "--name-only", BASE_SHA, `${dir}/`]).split("\n").filter(Boolean);
    const forbidden = ["prisma", "src/lib/core", "src/lib/staff", "src/lib/platform", "src/lib/payment", "src/app/api", "src/lib/outbox-consumers.ts", "src/lib/automation", "src/lib/webhooks", "src/proxy.ts", "next.config.ts",
      ...["pos", "account", "party", "approval", "hotel", "rooms", "booking", "dorm", "queue", "ticket", "agency", "supplier", "hr", "inventory", "chat"].map((m) => `src/lib/modules/${m}`),
      ...atBase("src/lib/modules/trips").filter((f) => !LIMITED_SET.has(f)), ...atBase(COMP).filter((f) => !LIMITED_SET.has(f)), ...atBase(APP),
      ...atBase("scripts").filter((f) => /^scripts\/(qc-trips-[\w.]+\.mts|probe-trips-[\w.-]+\.mts)$/.test(f) && !DRAFTER_FILES.includes(f)), "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts",
      "scripts/trips-fixture.mts", "scripts/iso.sh", "scripts/qc-trips.sh", "scripts/trips-main-merge.mts"];
    const sameAsSession = (f: string) => git(["diff", "--name-only", "session/trips", "--", lit(f)]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", lit(f)]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...forbidden.map(lit)]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...forbidden.filter((p) => !/\.\w+$/.test(p)).map(lit)]).split("\n")].filter(Boolean))];
    const touched = changed.filter((f) => !sameAsSession(f) && !fromMainMerge(ROOT, f));
    ok(touched.length === 0, `แตะไฟล์ต้องห้าม: ${touched.slice(0, 6).join(", ")}`);
    const over: string[] = [];
    for (const [f, maxDel, maxAdd] of LIMITED) {
      const line = git(["diff", "--numstat", BASE_SHA, "--", lit(f)]).trim();
      if (!line || sameAsSession(f) || fromMainMerge(ROOT, f)) continue;
      const [a, d] = line.split("\t").map(Number);
      if (d > maxDel || (maxAdd !== null && a > maxAdd)) over.push(`${f} +${a}/−${d} (ได้ +${maxAdd ?? "∞"}/−${maxDel})`);
    }
    ok(over.length === 0, over.join(" · "));
    const untracked = (p: string) => git(["ls-files", "--others", "--exclude-standard", "--", lit(p)]).split("\n").filter(Boolean);
    const newMod = untracked("src/lib/modules/trips").filter((f) => f !== REPORTS && f !== ACTIONS); ok(newMod.length === 0, `ไฟล์โมดูลใหม่นอกรายการ: ${newMod.join(", ")}`);
    const newComp = untracked(COMP).filter((f) => !/^Report/.test(basename(f))); ok(newComp.length === 0, `คอมโพเนนต์ใหม่ที่ไม่ขึ้นต้น Report: ${newComp.join(", ")}`);
    const newRoutes = untracked(APP).filter((f) => f !== REPORT_PAGE); ok(newRoutes.length === 0, `route ใหม่นอกรายการ: ${newRoutes.join(", ")}`);
  });
  await st("S-14", "ไม่มี migration · ไม่มีคีย์สิทธิ์ใหม่ · ไม่มีคีย์ค่าตั้งใหม่: prisma/** และ src/lib/core/** ตรง BASE (ไม่นับฝั่ง main) · บล็อก trips ของ permissions.ts มีคีย์ trips.report/cost 3 ตัวเดิม", () => {
    const d = git(["diff", "--name-only", BASE_SHA, "--", "prisma", "src/lib/core"]).split("\n").filter(Boolean).filter((f) => !fromMainMerge(ROOT, f));
    const u = git(["ls-files", "--others", "--exclude-standard", "--", "prisma", "src/lib/core"]).trim();
    ok(d.length === 0 && !u, `prisma/core เปลี่ยน: ${[...d, u].join(" ").slice(0, 200)}`);
    const s = read(PERMS); const block = s.slice(s.indexOf('module: "trips"'), s.indexOf('module: "agency"'));
    eq([...block.matchAll(/"(trips\.(?:cost|report)\.[\w.]+)"/g)].map((m) => m[1]).sort(), ["trips.cost.edit", "trips.cost.view", "trips.report.view"], "คีย์");
  });
  await st("S-15", "ไม่มี any · @ts-ignore · @ts-expect-error ในไฟล์ของใบ (ไฟล์ใหม่ + ส่วนที่เพิ่มใน report-core/costs)", () => {
    needOwn(); const bad = ownFiles.filter((f) => /:\s*any\b|<any>|as any\b|@ts-ignore|@ts-expect-error/.test(stripComments(read(f))));
    const added = git(["diff", "-U0", BASE_SHA, "--", PURE, COSTS]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    if (added.some((l) => /:\s*any\b|<any>|as any\b|@ts-ignore|@ts-expect-error/.test(l))) bad.push("report-core/costs (บรรทัดที่เพิ่ม)");
    ok(bad.length === 0, bad.join(", "));
  });
  await st("S-16", "ไม่เพิ่มแท็บ (C2): TRIPS_NAV_KEYS 6 ค่าเดิม · TripsNav.tsx trips-shared.ts ไม่เปลี่ยน", () => {
    ok(/TRIPS_NAV_KEYS = \["products", "departures", "bookings", "agents", "channels", "settings"\] as const/.test(read(`${COMP}/trips-shared.ts`)), "TRIPS_NAV_KEYS เปลี่ยน");
    ok(git(["diff", "--name-only", BASE_SHA, "--", `${COMP}/TripsNav.tsx`, `${COMP}/trips-shared.ts`]).trim() === "", "ไฟล์แถบเปลี่ยน");
  });
  await st("S-17", "ทางเข้า: departure-screens.ts DepFlags มี canReport = can(\"trips.report.view\") · DeparturesScreen แสดง trips-dep-reports เมื่อ cal.flags.canReport · href ไป /trips/reports · ใช้ข้อความ departures.actions.reports", () => {
    const ds = stripComments(read(MOD + "departure-screens.ts")), sc = stripComments(read(DEPSCREEN));
    ok(/canReport:\s*g\.can\(\s*["']trips\.report\.view["']\s*\)/.test(ds) && /canReport:\s*boolean/.test(ds), "flagsOf/DepFlags ไม่มี canReport");
    const at = sc.indexOf('"trips-dep-reports"'); ok(at >= 0, "ไม่มี trips-dep-reports");
    const around = sc.slice(Math.max(0, at - 400), at + 400);
    ok(/cal\.flags\.canReport/.test(around) && /\/trips\/reports/.test(around) && /departures\.actions\.reports/.test(around), "ลิงก์ไม่ผูกธง/ปลายทาง/ข้อความ");
  });
  await st("S-18", "D3 ไม่ดึง snapshot ทั้งก้อน: ใน costs.ts และ reports.ts ทุกที่ที่อ้าง \"policySnapshot\" ตามด้วย -> (JSON path) · ไม่มี policySnapshot: true ใน select ของ prisma", () => {
    needOwn(); const bad: string[] = [];
    for (const f of [COSTS, REPORTS]) { const c = stripComments(read(f));
      if ([...c.matchAll(/"policySnapshot"(?!\s*->)/g)].length) bad.push(`${f}: "policySnapshot" ทั้งก้อน`); if (/policySnapshot\s*:\s*true/.test(c)) bad.push(`${f}: select policySnapshot`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-19", "D4 ตัวแปลงแถวที่เดียว: report-core ส่งออก bookingMoneyInOfRow · costs.ts และ reports.ts เรียกตัวนี้ · costs.ts ไม่เหลือตรรกะ payable/VAT ของ snapshot (Number.isSafeInteger(b.payableJson · inclVatJson === false · typeof b.vatRegJson)", () => {
    needOwn(); const p0 = stripComments(read(PURE)), c = stripComments(read(COSTS)), r = stripComments(read(REPORTS));
    ok(/export function bookingMoneyInOfRow\(/.test(p0), "report-core ไม่มี bookingMoneyInOfRow");
    ok(/bookingMoneyInOfRow\(/.test(c), "costs.ts ไม่เรียก bookingMoneyInOfRow");
    ok(!/isSafeInteger\(\s*b\.payableJson|inclVatJson\s*===\s*false|typeof\s+b\.vatRegJson/.test(c), "costs.ts ยังมีตรรกะแปลงแถวของตัวเอง");
    ok(/bookingMoneyInOfRow|from\s+["']\.\/costs["']/.test(r), "reports.ts ไม่ใช้ตัวอ่าน/ตัวแปลงร่วม");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (report-core) ──");
  await st("P-1", "ค่าคงที่: แท็บ 4 · กลุ่ม 3 · ฐาน 2 · พารามิเตอร์ URL 8 · 366 / 62 วัน · หน้า 50 / 200 · รอบ 4,000 · การจอง 40,000 (D3) · สินค้า 200 · CSV 2,000 · ส่งออก 20/ชม. · ช่องระยะจอง 7 · คอลัมน์ CSV 19 + ต้นทุน 4", () => {
    eq([constOf("REPORT_TABS"), constOf("REPORT_GROUPS"), constOf("REPORT_BASES"), constOf("REPORT_QUERY_PARAMS")], [TABS, GROUPS, BASES, QPARAMS], "ชุดค่า");
    eq([constOf("REPORT_RANGE_MAX_DAYS"), constOf("REPORT_DAY_GROUP_MAX_DAYS"), constOf("REPORT_PAGE_SIZE"), constOf("REPORT_PAGE_MAX"), constOf("REPORT_DEPARTURE_CAP"), constOf("REPORT_BOOKING_CAP"), constOf("TRIPS_REPORT_CSV_CAP")],
      [366, 62, 50, 200, 4000, 40_000, 2000], "เพดาน"); eq(constOf("REPORT_PRODUCTS_MAX"), 200, "สินค้า");
    eq(constOf("REPORT_EXPORT_RATE"), { limit: 20, windowMs: 3_600_000 }, "ความถี่");
    eq(asArr(constOf("LEAD_BUCKETS")).map((b) => [b.key, b.min, b.max]), [["D0", 0, 0], ["D1_2", 1, 2], ["D3_7", 3, 7], ["D8_14", 8, 14], ["D15_30", 15, 30], ["D31_60", 31, 60], ["D61P", 61, null]], "LEAD_BUCKETS");
    eq([constOf("REPORT_CSV_COLUMNS"), constOf("REPORT_CSV_COST_COLUMNS")], [CSV_COLS, CSV_COST_COLS], "คอลัมน์");
  });
  await st("P-2", "reportQueryOf: อ่านเฉพาะ 8 ชื่อ · อาร์เรย์ใช้ตัวแรก · ว่าง ⇒ ไม่ใส่ · product ⇒ productId · page \"3\" ⇒ 3 · page \"x\"/\"1.5\"/\"99999\" ⇒ ไม่ใส่ · ค่าอื่นส่งต่อตามจริง · คีย์แปลกถูกทิ้ง", () => {
    const Q = (sp: Record<string, string | string[] | undefined>) => pure("reportQueryOf", sp);
    eq(Q({ from: "2027-04-01", to: "2027-04-30", basis: "booked", product: "p1", channel: "WEB", tab: "lead", group: "week", page: "3", x: "1", unitId: "u" }),
      { from: "2027-04-01", to: "2027-04-30", basis: "booked", productId: "p1", channel: "WEB", tab: "lead", group: "week", page: 3 }, "ครบ");
    eq(Q({ from: ["2027-04-02", "2027-04-09"], product: "", channel: "", page: "x" }), { from: "2027-04-02" }, "อาร์เรย์/ว่าง/หน้าเสีย");
    eq([Q({ page: "1.5" }), Q({ page: "99999" }), Q({ tab: "zzz" }), Q({})], [{}, {}, { tab: "zzz" }, {}], "ขอบ");
  });
  await st("P-3", "reportRangeOf: ว่าง ⇒ เดือนของวันนี้ · from อย่างเดียว ⇒ สิ้นเดือนของ from · to อย่างเดียว ⇒ ต้นเดือน · กลับด้าน/วันไม่จริง/รูปผิด ⇒ INVALID_INPUT · 366 วันได้ · 367 ⇒ RANGE_TOO_LARGE · 29 ก.พ. 2571", () => {
    const R = (f: string | null, t: string | null, today = "2027-04-15") => { const r = asRec(pure("reportRangeOf", { from: f, to: t }, today)) ?? {}; return r.ok === true ? [r.from, r.to, r.days] : r.code; };
    eq([R(null, null), R("2027-02-10", null), R(null, "2027-05-20"), R("2027-04-02", "2027-04-01"), R("2027-02-30", null), R("2027-01-01", "2028-01-01"), R("2027-01-01", "2028-01-02"), R("2028-02-29", "2028-02-29"), R("2027-4-1", null)],
      [["2027-04-01", "2027-04-30", 30], ["2027-02-10", "2027-02-28", 19], ["2027-05-01", "2027-05-20", 20], "INVALID_INPUT", "INVALID_INPUT", ["2027-01-01", "2028-01-01", 366], "RANGE_TOO_LARGE", ["2028-02-29", "2028-02-29", 1], "INVALID_INPUT"], "ช่วง");
  });
  await st("P-4", "reportGroupOf: 1/31 ⇒ day · 32/92 ⇒ week · 93/366 ⇒ month", () => {
    eq([1, 31, 32, 92, 93, 366].map((d) => pure("reportGroupOf", d)), ["day", "day", "week", "week", "month", "month"], "กลุ่ม");
  });
  await st("P-5", "reportUtcBoundsOf (N10 · ขอบ UTC คิดในโค้ด): กรุงเทพ เม.ย. [03-31T17:00Z, 04-30T17:00Z) · โตเกียว [03-31T15:00Z, 04-30T15:00Z) · ลอนดอนวันเปลี่ยนเวลา 28 มี.ค. 2570 [00:00Z, 23:00Z)", () => {
    const B = (f: string, t: string, tz: string) => { const r = asRec(pure("reportUtcBoundsOf", f, t, tz)) ?? {}; return [(r.gte as Date)?.toISOString?.(), (r.lt as Date)?.toISOString?.()]; };
    eq([B("2027-04-01", "2027-04-30", "Asia/Bangkok"), B("2027-04-01", "2027-04-30", "Asia/Tokyo"), B("2027-03-28", "2027-03-28", "Europe/London")],
      [["2027-03-31T17:00:00.000Z", "2027-04-30T17:00:00.000Z"], ["2027-03-31T15:00:00.000Z", "2027-04-30T15:00:00.000Z"], ["2027-03-28T00:00:00.000Z", "2027-03-28T23:00:00.000Z"]], "ขอบ");
  });
  await st("P-6", "reportPresetsOf: 15 เม.ย. 2570 ⇒ thisMonth 04-01..04-30 · lastMonth 03-01..03-31 · last30 03-17..04-15 · next30 04-15..05-14 · 10 ม.ค. ⇒ lastMonth ธ.ค. ปีก่อน", () => {
    eq(pure("reportPresetsOf", "2027-04-15"), [{ key: "thisMonth", from: "2027-04-01", to: "2027-04-30" }, { key: "lastMonth", from: "2027-03-01", to: "2027-03-31" }, { key: "last30", from: "2027-03-17", to: "2027-04-15" }, { key: "next30", from: "2027-04-15", to: "2027-05-14" }], "15 เม.ย.");
    eq(asArr(pure("reportPresetsOf", "2027-01-10"))[1], { key: "lastMonth", from: "2026-12-01", to: "2026-12-31" }, "10 ม.ค.");
  });
  await st("P-7", "periodKeyOf: day = วันนั้น · week = วันจันทร์ ISO (เสาร์ 10 เม.ย. → 5 · อาทิตย์ 11 → 5 · จันทร์ 12 → 12 · ศุกร์ 1 ม.ค. 2570 → 28 ธ.ค. 2569) · month = YYYY-MM", () => {
    const P = (d: string, g: string) => pure("periodKeyOf", d, g);
    eq([P("2027-04-10", "day"), P("2027-04-10", "week"), P("2027-04-11", "week"), P("2027-04-12", "week"), P("2027-01-01", "week"), P("2027-04-30", "month")], ["2027-04-10", "2027-04-05", "2027-04-05", "2027-04-12", "2026-12-28", "2027-04"], "คีย์");
  });
  await st("P-8", "periodsOf: เม.ย. รายสัปดาห์ = 5 ช่วงตัดหัวท้าย (29 มี.ค.→1–4 · 5–11 · 12–18 · 19–25 · 26–30) · 15 ม.ค.–10 มี.ค. รายเดือน = 3 ช่วง · เม.ย. รายวัน = 30 ช่วงต่อเนื่อง", () => {
    eq(pure("periodsOf", "2027-04-01", "2027-04-30", "week"), [{ key: "2027-03-29", from: "2027-04-01", to: "2027-04-04" }, { key: "2027-04-05", from: "2027-04-05", to: "2027-04-11" }, { key: "2027-04-12", from: "2027-04-12", to: "2027-04-18" },
      { key: "2027-04-19", from: "2027-04-19", to: "2027-04-25" }, { key: "2027-04-26", from: "2027-04-26", to: "2027-04-30" }], "สัปดาห์");
    eq(pure("periodsOf", "2027-01-15", "2027-03-10", "month"), [{ key: "2027-01", from: "2027-01-15", to: "2027-01-31" }, { key: "2027-02", from: "2027-02-01", to: "2027-02-28" }, { key: "2027-03", from: "2027-03-01", to: "2027-03-10" }], "เดือน");
    const d = asArr(pure("periodsOf", "2027-04-01", "2027-04-30", "day")); eq([d.length, d[0]?.key, d[29]?.key, d.every((x) => x.from === x.key && x.to === x.key)], [30, "2027-04-01", "2027-04-30", true], "วัน");
  });
  await st("P-9", "leadDaysOf ตามวันปฏิทินในเขตเวลาหน่วย: 16:30Z 9 เม.ย. → 10 เม.ย. = 1 (กรุงเทพ) / 0 (โตเกียว) · 17:30Z 31 มี.ค. → 10 เม.ย. = 9 · จองหลังวันเดินทาง = ติดลบ · ข้ามปี", () => {
    const L = (iso: string, d: string, tz: string) => pure("leadDaysOf", new Date(iso), d, tz);
    eq([L("2027-04-09T16:30:00Z", "2027-04-10", "Asia/Bangkok"), L("2027-04-09T16:30:00Z", "2027-04-10", "Asia/Tokyo"), L("2027-03-31T17:30:00Z", "2027-04-10", "Asia/Bangkok"), L("2027-04-12T03:00:00Z", "2027-04-10", "Asia/Bangkok"), L("2026-12-31T18:00:00Z", "2027-01-02", "Asia/Bangkok")],
      [1, 0, 9, -2, 1], "lead");
  });
  await st("P-10", "leadBucketOf ขอบช่อง: −1 ⇒ null · 0→D0 · 1,2→D1_2 · 3,7→D3_7 · 8,14→D8_14 · 15,30→D15_30 · 31,60→D31_60 · 61,1000→D61P", () => {
    eq([-1, 0, 1, 2, 3, 7, 8, 14, 15, 30, 31, 60, 61, 1000].map((d) => pure("leadBucketOf", d)), [null, "D0", "D1_2", "D1_2", "D3_7", "D3_7", "D8_14", "D8_14", "D15_30", "D15_30", "D31_60", "D31_60", "D61P", "D61P"], "ช่อง");
  });
  await st("P-11", "medianOf ค่ากลางล่าง: [] ⇒ null · [5] ⇒ 5 · [3,1,2] ⇒ 2 · [4,1,3,2] ⇒ 2 · ไม่แก้อาร์เรย์ที่ส่งมา", () => {
    const xs = [4, 1, 3, 2]; eq([pure("medianOf", []), pure("medianOf", [5]), pure("medianOf", [3, 1, 2]), pure("medianOf", xs)], [null, 5, 2, 2], "ค่ากลาง"); eq(xs, [4, 1, 3, 2], "ไม่แก้อินพุต");
  });
  await st("P-12", "bahtPlain / pctPlain: −120000 ⇒ -1200.00 · 5 ⇒ 0.05 · −5 ⇒ -0.05 · 0 ⇒ 0.00 · 691740000000 ⇒ 6917400000.00 · bp 6250 ⇒ 62.50 · −1 ⇒ -0.01 · 10000 ⇒ 100.00 · null ⇒ \"\"", () => {
    eq([-120_000, 5, -5, 0, 691_740_000_000].map((x) => pure("bahtPlain", x)), ["-1200.00", "0.05", "-0.05", "0.00", "6917400000.00"], "บาท");
    eq([6250, -1, 10_000, 0, null].map((x) => pure("pctPlain", x)), ["62.50", "-0.01", "100.00", "0.00", ""], "%");
  });
  await st("P-13", "reportCsv ข้อมูลล้วน (D2): BOM + หัว + แถวเท่านั้น (ไม่มีบรรทัดข้อความ) · CRLF · สตริงกันสูตร (= + - @ tab CR) · {satang}/{bp} ไม่ผ่านตัวกันสูตร · null ⇒ ว่าง · ปรับแถวให้เท่าหัว · ไม่มีแถว ⇒ หัวอย่างเดียว", () => {
    const s0 = String(pure("reportCsv", ["a", "b", "c", "d"], [["=1+1", { satang: -120_000 }, { bp: 6250 }, null], ["\t-x", { satang: 5 }, { bp: -1 }, 7], ["ก,\"ข\"", { satang: -5 }, { bp: 10_000 }, "@y"], ["a\rb", "+c"]]));
    eq(s0, "\uFEFFa,b,c,d\r\n'=1+1,-1200.00,62.50,\r\n'-x,0.05,-0.01,7\r\n\"ก,\"\"ข\"\"\",-0.05,100.00,'@y\r\na b,'+c,,\r\n", "ไฟล์");
    eq(String(pure("reportCsv", ["h"], [])), "\uFEFFh\r\n", "ว่าง");
  });
  await st("P-14", "reportFileName: trips-report-<from>-<to>.csv · ถูกตัด ⇒ …-partial.csv (D2) · วันไม่จริง ⇒ trips-report.csv / trips-report-partial.csv · ผลตรง /^[A-Za-z0-9.-]{1,60}$/", () => {
    const xs = [pure("reportFileName", "2027-04-01", "2027-04-30"), pure("reportFileName", "2027-04-01", "2027-04-30", true), pure("reportFileName", "2027-02-30", "2027-03-01"), pure("reportFileName", "../x", "y", true)];
    eq(xs, ["trips-report-2027-04-01-2027-04-30.csv", "trips-report-2027-04-01-2027-04-30-partial.csv", "trips-report.csv", "trips-report-partial.csv"], "ชื่อ"); ok(xs.every((x) => /^[A-Za-z0-9.-]{1,60}$/.test(String(x))), "รูปชื่อ");
  });
  await st("P-15", "bookingMoneyInOfRow (ตัวแปลงแถวที่ย้ายจาก costs.ts · D4): payable ใช้ได้ ⇒ ตามนั้น · −1 / \"1095000\" / 3e9 ⇒ fallback gross − ส่วนลด (Q7) · inclVatJson false ⇒ + VAT (Q8) · snapshot ไม่บอก VAT ⇒ ตามหน่วย (true ⇒ true · null ⇒ false · Q10) · รอบยกเลิก + จ่ายแล้ว ⇒ pendingRefund · ยังไม่จ่าย ⇒ ไม่ใช่ (Q12) · คำขอคืนเงินเปิด ⇒ pendingRefund · retN > 0 ⇒ retained 1 ก้อน", () => {
    const row = { status: "CONFIRMED", collectMode: "SHOP", agentAccountId: null, channel: "WEB", currency: "THB", grossSatang: 410_000, discountSatang: 10_000, agentDiscountSatang: 0, passThroughSatang: 60_000, vatSatang: 22_897,
      commissionSatang: 0, commissionVatSatang: 0, paidSatang: 0, refundedSatang: 0, payableJson: 405_000, vatRegJson: true, inclVatJson: true, seats: 1, retAmount: 0, retVat: 0, retPt: 0, retN: 0, openRefund: false };
    const M = (o: Rec, u: Rec = {}) => { const r = asRec(pure("bookingMoneyInOfRow", { ...row, ...o }, { unitVatRegistered: true, departureCancelled: false, ...u })) ?? {}; const i = asRec(r.input) ?? {};
      return [r.hasPayable, i.payableSatang, r.vatRegistered, i.vatRegistered, i.pendingRefund, i.departureCancelled ?? false, asArr(i.retained).length]; };
    eq(M({}), [true, 405_000, true, true, false, false, 0], "ปกติ");
    eq([M({ payableJson: -1 })[1], M({ payableJson: "1095000" })[1], M({ payableJson: 3e9 })[1], M({ payableJson: null, inclVatJson: false })[1]], [400_000, 400_000, 400_000, 422_897], "fallback");
    eq([M({ vatRegJson: null })[2], M({ vatRegJson: null }, { unitVatRegistered: null })[2], M({ vatRegJson: false })[2]], [true, false, false], "VAT");
    eq([M({ status: "PAID", paidSatang: 410_000 }, { departureCancelled: true }).slice(4, 6), M({}, { departureCancelled: true }).slice(4, 6), M({ openRefund: true })[4]], [[true, true], [false, true], true], "รอคืน");
    eq(M({ status: "CANCELLED", retN: 2, retAmount: 350_000, retVat: 22_897, retPt: 0 })[6], 1, "retained");
  });
  groupLine("P");

  // ═══════════════ RP. บริการรายงาน ═══════════════
  console.log("\n── RP: รายงาน ──");
  const TOT_K = ["departures", "cancelledDepartures", "capacity", "sold", "loadFactorBp", "bookings", "cancelledBookings", "pendingRefundBookings", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang",
    "commissionCostSatang", "costSatang", "costRows", "grossProfitSatang", "marginBp", "collectedSatang", "outstandingSatang", "heldSatang", "retainedSatang", "agentCollectBookings", "noShowUnpaid", "pendingBookings", "departuresWithoutCosts", "charterLikeDepartures", "estimate"];
  const APR_TOT = [7, 1, 86, 33, 3837, 12, 2, 2, 35, 10_940_000, 1_740_000, 715_698, 10_224_302, 409_500, 2_770_000, 8, 7_044_802, 6890, 3_795_000, 5_330_000, 1_230_000, 350_000, 3, 1, 2, { ended: 2, upcoming: 2 }, 1, true];
  const W0 = { ended: 0, upcoming: 0 };
  await st("RP-1", "ยอดรวม เม.ย. (OWNER · ฐานวันเดินทาง) = §4.5: 7 รอบ (ยกเลิก 1) · 86/33 = 3837 · 12 การจอง · ยอดขาย 10,940,000 · VAT 715,698 · คอมฯ 409,500 · ต้นทุน 2,770,000 · กำไร 7,044,802 (6890) · รับแล้ว 3,795,000 · ค้าง 5,330,000 · รอคืน 1,230,000 · เก็บไว้ 350,000 · แถวต้นทุน 8 · ยังไม่หักต้นทุน { ended 2 (dQ dH) · upcoming 2 (dP dI) } (D1) · เหมาลำ 1 · estimate · flags.commissionWithVat false", async () => {
    needSetup(); const vm = await repVM("oa"); eq(pick(T(vm), TOT_K), APR_TOT, "totals");
    eq([asRec(vm.filter)?.basis, asRec(vm.filter)?.tab, asRec(vm.filter)?.group, asRec(vm.filter)?.days, asRec(vm.flags)?.costView, asRec(vm.flags)?.exportAvailable], ["travel", "sales", "day", 30, true, true], "filter/flags");
    eq(asRec(vm.flags)?.commissionWithVat, false, "commissionWithVat (หน่วยจด VAT · U3)");
  });
  await st("RP-2", "แท็บยอดขาย รายวัน: 30 ช่วงต่อเนื่อง · 10 เม.ย. ยอดขาย 5,040,000 ต้นทุน 2,150,000 กำไร 2,150,782 · 16 เม.ย. (dP) 1 รอบ ยอด 0 กำไร null ยังไม่หักต้นทุน {0,1} · 2 เม.ย. 0 รอบ · Σ ช่วง = ยอดรวม (ยอดขาย · VAT · คอมฯ · ต้นทุน)", async () => {
    needSetup(); const vm = await repVM("oa"); const ps = asArr(vm.periods); eq(ps.length, 30, "จำนวนช่วง");
    const at = (k: string) => ps.find((p) => p.key === k) ?? {};
    eq(pick(at("2027-04-10"), ["departures", "bookings", "salesSatang", "costSatang", "costRows", "grossProfitSatang", "departuresWithoutCosts"]), [1, 6, 5_040_000, 2_150_000, 5, 2_150_782, W0], "10 เม.ย.");
    eq(pick(at("2027-04-16"), ["departures", "salesSatang", "costSatang", "costRows", "grossProfitSatang", "departuresWithoutCosts"]), [1, 0, 0, 0, null, { ended: 0, upcoming: 1 }], "16 เม.ย.");
    eq(pick(at("2027-04-02"), ["departures", "bookings", "salesSatang"]), [0, 0, 0], "2 เม.ย.");
    const S = (k: string) => ps.reduce((s, p) => s + Number(p[k] ?? 0), 0);
    eq([S("salesSatang"), S("vatSatang"), S("commissionCostSatang"), S("costSatang"), S("departures")], [10_940_000, 715_698, 409_500, 2_770_000, 7], "Σ ช่วง");
  });
  await st("RP-3", "แท็บยอดขาย รายสัปดาห์ (group=week): 5 ช่วง · 5–11 เม.ย. 6,040,000 / ต้นทุน 2,650,000 / กำไร 2,585,362 · 12–18 เม.ย. 3,850,000 / 120,000 / 3,478,131 · 19–25 เม.ย. 1,050,000 กำไร null · หัวท้ายศูนย์ · ยังไม่หักต้นทุนต่อช่วง (D1): 12–18 เม.ย. {ended 2 (dQ dH) · upcoming 1 (dP)} (รอบยกเลิก dX ไม่นับ) · 19–25 {0,1} · อื่น {0,0}", async () => {
    needSetup(); const ps = asArr((await repVM("oa", { group: "week" })).periods);
    eq(ps.map((p) => [p.key, p.from, p.to, p.salesSatang, p.costSatang, p.grossProfitSatang, p.departuresWithoutCosts]), [["2027-03-29", "2027-04-01", "2027-04-04", 0, 0, null, W0], ["2027-04-05", "2027-04-05", "2027-04-11", 6_040_000, 2_650_000, 2_585_362, W0],
      ["2027-04-12", "2027-04-12", "2027-04-18", 3_850_000, 120_000, 3_478_131, { ended: 2, upcoming: 1 }], ["2027-04-19", "2027-04-19", "2027-04-25", 1_050_000, 0, null, { ended: 0, upcoming: 1 }], ["2027-04-26", "2027-04-26", "2027-04-30", 0, 0, null, W0]], "สัปดาห์");
    eq(asArr((await repVM("rv", { group: "week" })).periods).map((p) => p.departuresWithoutCosts), [null, null, null, null, null], "ผู้ไม่เห็นต้นทุน (Q16)");
  });
  await st("RP-4", "กลุ่มช่วง: ปริยาย 30 วัน ⇒ day · 90 วัน (ม.ค.–มี.ค.) ⇒ week · ทั้งปี ⇒ month (12 ช่วง) · group=month ใน เม.ย. ⇒ 1 ช่วง · group=day 62 วันได้ · 63 วัน ⇒ INVALID_INPUT", async () => {
    needSetup();
    eq([asRec((await repVM("oa", { from: "2027-01-01", to: "2027-03-31" })).filter)?.group, asArr((await repVM("oa", { from: "2027-01-01", to: "2027-12-31" })).periods).length, asArr((await repVM("oa", { group: "month" })).periods).length], ["week", 12, 1], "กลุ่ม");
    eq(asArr((await repVM("oa", { from: "2027-04-01", to: "2027-06-01", group: "day" })).periods).length, 62, "62 วัน");
    codeR(await rep("oa", { from: "2027-04-01", to: "2027-06-02", group: "day" }), "INVALID_INPUT", "63 วันรายวัน");
  });
  await st("RP-5", "แท็บอัตราเต็ม: ต่อสินค้าไม่นับรอบยกเลิก · ราชาทดสอบ 5 รอบ 76/33 = 4342 · เหมาลำ 1 · PX 1 รอบ 10/0 = 0 · เรียงมาก→น้อย · แท็บอื่น = null · พ.ค. (D5): ความจุปัจจุบัน · ที่ถือไม่นับ · dO ความจุ 3 ขาย 3 = 10000 · dZ ความจุ 0 ⇒ null · รวม 13/5 = 3846 · เกิน 100% ตรวจที่ตัวช่วย (3/2 ⇒ 15000 · ฐานข้อมูลห้ามขายเกินความจุ)", async () => {
    needSetup(); const vm = await repVM("oa", { tab: "load" }); const rows = asArr(asRec(vm.load)?.rows);
    eq(rows.map((r) => [r.productId, r.departures, r.capacity, r.sold, r.loadFactorBp, r.charterLikeDepartures]), [[PRD.PR.id, 5, 76, 33, 4342, 1], [PRD.PX.id, 1, 10, 0, 0, 0]], "แถว");
    eq([vm.periods, vm.lead, vm.channelsTab], [null, null, null], "แท็บอื่น");
    const may = await repVM("oa", { from: "2027-05-01", to: "2027-05-31", tab: "load" }); const byId = (k: string) => depRows(may).find((r) => r.departureId === DEP[k]) ?? {};
    eq([pick(T(may), ["capacity", "sold", "loadFactorBp"]), pick(byId("M"), ["capacity", "sold", "loadFactorBp"]), pick(byId("O"), ["capacity", "sold", "loadFactorBp"]), pick(byId("Zc"), ["capacity", "sold", "loadFactorBp"])],
      [[13, 5, 3846], [10, 2, 2000], [3, 3, 10_000], [0, 0, null]], "พ.ค.");
    eq(asArr(asRec(may.load)?.rows).map((r) => [r.departures, r.capacity, r.sold, r.loadFactorBp]), [[3, 13, 5, 3846]], "อัตราเต็มต่อสินค้า พ.ค.");
    eq(pure("loadFactorBp", 3, 2), 15_000, "เกิน 100% (ตัวช่วย)");
  });
  await st("RP-6", "แท็บระยะจอง (LIVE · ไม่นับ IMPORT): D0 1 · D1_2 2 · D3_7 2 · D8_14 2 · D15_30 1 · D31_60 2 · D61P 1 · ค่ากลาง 9 วัน · counted 11 · excludedImport 1 · excludedNegative 0 · ที่นั่ง D31_60 = 13", async () => {
    needSetup(); const l = asRec((await repVM("oa", { tab: "lead" })).lead) ?? {};
    eq(asArr(l.buckets).map((b) => [b.key, b.bookings]), LEAD_KEYS.map((k, i) => [k, [1, 2, 2, 2, 1, 2, 1][i]]), "ช่อง");
    eq([l.medianDays, l.counted, l.excludedImport, l.excludedNegative, asArr(l.buckets).find((b) => b.key === "D31_60")?.seats], [9, 11, 1, 0, 13], "ค่ากลาง/นับ");
  });
  await st("RP-7", "แท็บช่องทาง: 3 กลุ่มตามลำดับ · ขายตรง 8 การจอง 7,545,000 (6897) · เอเจนซี่ 3 · 3,045,000 (2783) คอมฯ 409,500 · อื่น 1 · 350,000 (320) · ช่องทาง WEB 4/ยกเลิก 1 · COUNTER 3/ยกเลิก 1 · LIFF · AGENT_PORTAL คอมฯ 199,500 · AGENT_LINK · IMPORT · Σ ยอดขาย = ยอดรวม · ส่วนแบ่งรายช่องทางปัดอิสระ 1874/864/4159/1504/1280/320 = 10001 (ไม่บังคับให้รวม 10000 · D5)", async () => {
    needSetup(); const gs = asArr(asRec((await repVM("oa", { tab: "channel" })).channelsTab)?.groups);
    eq(gs.map((g) => [g.group, g.bookings, g.salesSatang, g.shareBp, g.commissionCostSatang]), [["DIRECT", 8, 7_545_000, 6897, 0], ["AGENT", 3, 3_045_000, 2783, 409_500], ["OTHER", 1, 350_000, 320, 0]], "กลุ่ม");
    eq(gs.flatMap((g) => asArr(g.channels).map((c) => [c.channel, c.bookings, c.cancelledBookings, c.seats, c.salesSatang, c.commissionCostSatang])),
      [["WEB", 4, 1, 7, 2_050_000, 0], ["LIFF", 1, 0, 3, 945_000, 0], ["COUNTER", 3, 1, 12, 4_550_000, 0], ["AGENT_PORTAL", 2, 0, 5, 1_645_000, 199_500], ["AGENT_LINK", 1, 0, 4, 1_400_000, 210_000], ["IMPORT", 1, 0, 1, 350_000, 0]], "ช่องทาง");
    const sh = gs.flatMap((g) => asArr(g.channels).map((c) => Number(c.shareBp))); eq([sh, sh.reduce((a, b) => a + b, 0)], [[1874, 864, 4159, 1504, 1280, 320], 10_001], "ส่วนแบ่งรายช่องทาง");
  });
  await st("RP-8", "ฐานวันจอง เม.ย. (ขอบ UTC ตามเวลาร้าน): LIVE 8 · ยอดขาย 4,900,000 · VAT 320,559 · ก่อน VAT 4,579,441 · คอมฯ 315,000 · รับแล้ว 2,050,000 · ค้าง 1,230,000 · รอคืน 1 (410,000) · ถือ/รอ 2 · ความจุ/ขาย/อัตราเต็ม/ต้นทุน/กำไร/จำนวนรอบ null · ตารางรอบ null · notes.basis · ส่งออกไม่ได้ · ไม่มีช่วงสำเร็จรูป next30 (D5)", async () => {
    needSetup(); const vm = await repVM("oa", { basis: "booked" }); const t = T(vm);
    eq(asArr(vm.presets).map((p) => p.key), ["thisMonth", "lastMonth", "last30"], "presets ฐานวันจอง");
    eq(pick(t, ["bookings", "salesSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang", "collectedSatang", "outstandingSatang", "pendingRefundBookings", "heldSatang", "pendingBookings", "cancelledBookings"]),
      [8, 4_900_000, 320_559, 4_579_441, 315_000, 2_050_000, 1_230_000, 1, 410_000, 2, 0], "ยอด");
    eq(pick(t, ["capacity", "sold", "loadFactorBp", "costSatang", "costRows", "grossProfitSatang", "marginBp", "departures", "departuresWithoutCosts"]), [null, null, null, null, null, null, null, null, null], "null");
    eq([vm.departures, asRec(vm.notes)?.basis, asRec(vm.notes)?.channel, asRec(vm.flags)?.exportAvailable], [null, true, false, false], "ตาราง/ป้าย");
  });
  await st("RP-9", "กรองช่องทาง AGENT_PORTAL (ฐานวันเดินทาง): 2 การจอง · 1,645,000 · คอมฯ 199,500 · ความจุ/ต้นทุน/กำไร null · ตารางรอบ null · notes.channel (ไม่ใช่ notes.basis) · ส่งออกไม่ได้ · ช่องทางนอกชุด ⇒ INVALID_INPUT", async () => {
    needSetup(); const vm = await repVM("oa", { channel: "AGENT_PORTAL" });
    eq(pick(T(vm), ["bookings", "salesSatang", "commissionCostSatang", "capacity", "loadFactorBp", "costSatang", "grossProfitSatang"]), [2, 1_645_000, 199_500, null, null, null, null], "ยอด");
    eq([vm.departures, asRec(vm.notes)?.channel, asRec(vm.notes)?.basis, asRec(vm.flags)?.exportAvailable], [null, true, false, false], "ตาราง/ป้าย");
    codeR(await rep("oa", { channel: "FAX" }), "INVALID_INPUT", "ช่องทางนอกชุด");
  });
  await st("RP-10", "กรองสินค้า: PX ⇒ 1 รอบ ความจุ 10 ขาย 0 อัตราเต็ม 0 ยอด 0 · PR ⇒ 6 รอบ ยอดขาย 10,940,000 · สินค้าของหน่วยอื่น ⇒ NOT_FOUND · สินค้าที่ไม่มีรอบในช่วง (PS ใน เม.ย.) ⇒ ศูนย์ + แถวรอบว่าง", async () => {
    needSetup();
    eq(pick(T(await repVM("oa", { productId: PRD.PX.id })), ["departures", "capacity", "sold", "loadFactorBp", "salesSatang"]), [1, 10, 0, 0, 0], "PX");
    eq(pick(T(await repVM("oa", { productId: PRD.PR.id })), ["departures", "salesSatang", "costSatang"]), [6, 10_940_000, 2_770_000], "PR");
    codeR(await rep("oa", { productId: PRD.PA2.id }), "NOT_FOUND", "สินค้าหน่วยอื่น");
    const ps = await repVM("oa", { productId: PRD.PS.id }); eq([T(ps).departures, T(ps).salesSatang, depRows(ps).length, asRec(ps.departures)?.pageCount], [0, 0, 0, 1], "PS เม.ย.");
  });
  await st("RP-11", "ตารางรอบ: 7 แถวเรียงวัน (dR dN dX dQ dH dP dI) · สถานะ ENDED×4 CANCELLED UPCOMING×2 · estimate ทุกแถว · dX อัตราเต็ม null · dQ ต้นทุน/กำไร null noCosts true · dH charterLike · pageCount 1 · page 2 ⇒ แถวว่าง pageCount 1", async () => {
    needSetup(); const vm = await repVM("oa"); const rows = depRows(vm);
    eq(rows.map((r) => r.departureId), ["R", "N", "X", "Q", "H", "P", "I"].map((k) => DEP[k]), "ลำดับ");
    eq(rows.map((r) => r.state), ["ENDED", "ENDED", "CANCELLED", "ENDED", "ENDED", "UPCOMING", "UPCOMING"], "สถานะ"); ok(rows.every((r) => r.estimate === true), "estimate");
    eq([rows[2]?.loadFactorBp, pick(rows[3] ?? {}, ["costSatang", "grossProfitSatang", "noCosts"]), rows[4]?.charterLike, asRec(vm.departures)?.pageCount, asRec(vm.departures)?.total], [null, [null, null, true], true, 1, 7], "แถว");
    const p2 = await repVM("oa", { page: 2 }); eq([depRows(p2).length, asRec(p2.departures)?.page, asRec(p2.departures)?.pageCount, T(p2).salesSatang], [0, 2, 1, 10_940_000], "หน้า 2");
  });
  await st("RP-12", "นาฬิกาฉีด: now 2027-04-10T00:00Z ⇒ dR dN dQ dH UPCOMING · dX CANCELLED · now 2027-05-01 ⇒ dP dI ENDED", async () => {
    needSetup(); const r1 = depRows(await repVM("oa", {}, uA, { now: new Date("2027-04-10T00:00:00Z") })), r2 = depRows(await repVM("oa", {}, uA, { now: new Date("2027-05-01T00:00:00Z") }));
    eq([r1.map((r) => r.state), r2.map((r) => r.state)], [["UPCOMING", "UPCOMING", "CANCELLED", "UPCOMING", "UPCOMING", "UPCOMING", "UPCOMING"], ["ENDED", "ENDED", "CANCELLED", "ENDED", "ENDED", "ENDED", "ENDED"]], "สถานะ");
  });
  await st("RP-13", "หน่วยโตเกียว: ฐานวันจอง เม.ย. = tk1 + tk2 + tk4 = 1,050,000 (tk3 ไม่นับ — ขอบกรุงเทพจะได้ 1,400,000) · ระยะจองฐานวันเดินทาง tk1 = D0 · tk2 = D8_14 · tk4 จองหลังวันเดินทาง ⇒ excludedNegative 1 counted 2 · คำเตือน VAT_STATUS_UNKNOWN", async () => {
    needSetup(); eq(pick(T(await repVM("oa", { basis: "booked" }, uT)), ["bookings", "salesSatang"]), [3, 1_050_000], "ฐานวันจอง");
    const vm = await repVM("oa", { tab: "lead" }, uT); const l = asRec(vm.lead) ?? {};
    eq(asArr(l.buckets).filter((b) => Number(b.bookings) > 0).map((b) => [b.key, b.bookings]), [["D0", 1], ["D8_14", 1]], "ระยะจอง"); eq([l.counted, l.excludedNegative, l.excludedImport], [2, 1, 0], "ไม่เข้าช่อง");
    ok(asArr(vm.warnings).some((w) => w.code === "VAT_STATUS_UNKNOWN"), `คำเตือน: ${fmt(vm.warnings)}`);
  });
  await st("RP-14", "อินพุตเสีย (ไม่ throw · ผลผิดของตัวกรองมี field · §5.7): 367 วัน ⇒ RANGE_TOO_LARGE · from > to / 30 ก.พ. / รูปผิด / tab basis group นอกชุด / page 0, 201, 1.5, \"2\" / คีย์เกิน / productId มี NUL หรือยาว 129 ⇒ INVALID_INPUT", async () => {
    needSetup(); codeR(await rep("oa", { from: "2027-01-01", to: "2028-01-02" }), "RANGE_TOO_LARGE", "367");
    const bad: string[] = [];
    for (const x of [{ from: "2027-04-30", to: "2027-04-01" }, { from: "2027-02-30" }, { to: "2027/04/30" }, { tab: "cost" }, { basis: "paid" }, { group: "year" }, { page: 0 }, { page: 201 }, { page: 1.5 }, { page: "2" }, { extra: 1 }, { productId: "a\u0000b" }, { productId: "x".repeat(129) }] as Rec[]) {
      const r = await rep("oa", x); if (r.ok !== false || r.code !== "INVALID_INPUT") bad.push(`${fmt(x)} ⇒ ${fmt(r).slice(0, 80)}`);
    }
    // §5.7: ผลผิดของตัวกรองบอกช่องที่ผิด (หน้าใช้ทิ้งช่องนั้นแล้วคงช่องที่ถูก)
    const F = async (x: Rec) => { const r = await rep("oa", x); return `${r.code}:${r.field}`; };
    const fields = { range: await F({ from: "2027-02-30" }), big: await F({ from: "2027-01-01", to: "2028-01-02" }), basis: await F({ basis: "paid" }), tab: await F({ tab: "cost" }), group: await F({ group: "year" }),
      page: await F({ page: 0 }), channel: await F({ channel: "FAX" }), product: await F({ productId: PRD.PA2.id }) };
    eq(fields, { range: "INVALID_INPUT:range", big: "RANGE_TOO_LARGE:range", basis: "INVALID_INPUT:basis", tab: "INVALID_INPUT:tab", group: "INVALID_INPUT:group", page: "INVALID_INPUT:page", channel: "INVALID_INPUT:channel", product: "NOT_FOUND:product" }, "field");
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  });
  await st("RP-15", "ตัวโหลดไม่เขียนฐาน: TripCost/AuditLog/TripBooking/TripDeparture ของร้าน a + ถังความถี่ คงเดิมหลังโหลดทุกแท็บ ทั้งสองฐาน", async () => {
    needSetup(); const cnt = async () => (await q<Rec>(`SELECT (SELECT count(*) FROM "TripCost" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS b,
      (SELECT coalesce(max("updatedAt"), 'epoch') FROM "TripDeparture" WHERE "tenantId" = $1)::text AS d, (SELECT count(*) FROM "ChatRateBucket" WHERE key LIKE $2)::int AS r`, [tA, `${RATE_PREFIX}${tA}%`]))[0];
    const before = await cnt();
    for (const tab of TABS) for (const basis of BASES) await rep("oa", { tab, basis });
    eq(await cnt(), before, "แถวในฐาน");
  });
  await st("RP-16", "คำเตือนรวมของช่วง: เม.ย. OWNER = [PARK_FEE_WITH_PASS_THROUGH] (dN) · report.view เท่านั้น = [] · มิ.ย. = SUPPLIER_COSTS_NOT_INCLUDED · SNAPSHOT_FALLBACK n1 · FX_BOOKINGS n1 · OTA_FEES_NOT_INCLUDED n1 (เรียงตามทะเบียน)", async () => {
    needSetup();
    eq([asArr((await repVM("oa")).warnings).map((w) => w.code), asArr((await repVM("rv")).warnings).map((w) => w.code)], [["PARK_FEE_WITH_PASS_THROUGH"], []], "เม.ย.");
    eq(asArr((await repVM("oa", { from: "2027-06-01", to: "2027-06-30" })).warnings), [{ code: "SUPPLIER_COSTS_NOT_INCLUDED" }, { code: "SNAPSHOT_FALLBACK", n: 1 }, { code: "FX_BOOKINGS", n: 1 }, { code: "OTA_FEES_NOT_INCLUDED", n: 1 }], "มิ.ย.");
  });
  await st("RP-17", "หน่วยไม่จด VAT (MANAGER): ยอดขาย 1,050,000 · VAT 0 · ก่อน VAT 1,050,000 · ต้นทุนคอมฯ 107,000 · ต้นทุน 200,000 · กำไร 743,000", async () => {
    needSetup(); eq(pick(T(await repVM("mg", {}, uN)), ["salesSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang", "costSatang", "grossProfitSatang"]), [1_050_000, 0, 1_050_000, 107_000, 200_000, 743_000], "dV");
  });
  await st("RP-18", "ช่วงว่าง (ส.ค. 2570): ยอดศูนย์ · departures 0 · ตารางว่าง · กำไร null (ไม่มีแถวต้นทุน · costRows 0) · departuresWithoutCosts {0,0} · ระยะจอง counted 0 ค่ากลาง null · อัตราเต็ม rows [] · loadFactor null", async () => {
    needSetup(); const E = { from: "2027-08-01", to: "2027-08-31" };
    const vm = await repVM("oa", E); eq(pick(T(vm), ["departures", "salesSatang", "costRows", "grossProfitSatang", "departuresWithoutCosts", "loadFactorBp"]), [0, 0, 0, null, W0, null], "ยอด"); eq(depRows(vm).length, 0, "ตาราง");
    const l = asRec((await repVM("oa", { ...E, tab: "lead" })).lead) ?? {}; eq([l.counted, l.medianDays], [0, null], "ระยะจอง");
    eq(asArr(asRec((await repVM("oa", { ...E, tab: "load" })).load)?.rows), [], "อัตราเต็ม");
  });
  await st("RP-19", "ค่าปริยาย: ไม่ส่ง from/to ⇒ เดือนของวันนี้ตามเวลาร้าน (now 15 เม.ย. ⇒ 1–30 เม.ย.) · presets = reportPresetsOf(วันนี้) · ตัวเลือกสินค้า = PR PX PS (ของหน่วยนี้เท่านั้น) · ตัวเลือกช่องทาง 12", async () => {
    needSetup(); const vm = VM(await call("loadTripReportVM", ctxOf("oa"), { unitId: uA }, optsR), "ปริยาย");
    eq([asRec(vm.filter)?.from, asRec(vm.filter)?.to, asRec(vm.unit)?.today], ["2027-04-01", "2027-04-30", "2027-04-15"], "ช่วง");
    eq(vm.presets, pure("reportPresetsOf", "2027-04-15"), "presets");
    eq([asArr(vm.products).map((p) => p.id).sort(), [...((vm.channelOptions as string[] | undefined) ?? [])].sort(), vm.productsTotal, vm.productsTruncated], [[PRD.PR.id, PRD.PX.id, PRD.PS.id].sort(), [...ALL_CHANNELS].sort(), 3, false], "ตัวเลือก");
  });
  await st("RP-20", "เพดานผ่าน opts.caps (D3 · ข้อสอบเท่านั้น): เม.ย. อ่านการจอง 18 แถว — caps.bookings 17 ⇒ REPORT_TOO_LARGE · 18 ⇒ ยอดรวมเท่าไม่มีเพดาน · caps.departures 6 ⇒ REPORT_TOO_LARGE · 7 ⇒ ผ่าน · ฐานวันจอง 11 แถว: 10 ⇒ REPORT_TOO_LARGE · ส่งออก caps.bookings 17 ⇒ REPORT_TOO_LARGE ไม่เขียน audit (ไม่ตัดเงียบ)", async () => {
    needSetup(); const full = JSON.stringify(T(await repVM("oa")));
    const C = (caps: Rec, input: Rec = {}) => rep("oa", input, uA, { now: NOW_R, caps });
    codeR(await C({ bookings: 17 }), "REPORT_TOO_LARGE", "17 การจอง"); eq(JSON.stringify(T(VM(await C({ bookings: 18 }), "18"))), full, "18 การจอง = ไม่มีเพดาน");
    codeR(await C({ departures: 6 }), "REPORT_TOO_LARGE", "6 รอบ"); eq((await C({ departures: 7 })).ok, true, "7 รอบ");
    codeR(await C({ bookings: 10 }, { basis: "booked" }), "REPORT_TOO_LARGE", "ฐานวันจอง 10"); eq((await C({ bookings: 11 }, { basis: "booked" })).ok, true, "ฐานวันจอง 11");
    const n0 = await auditN("trips.report.exported"); codeR(await exp("oa", {}, uA, { now: NOW_R, caps: { bookings: 17 } }), "REPORT_TOO_LARGE", "ส่งออก"); eq(await auditN("trips.report.exported") - n0, 0, "audit");
  });
  groupLine("RP");

  // ═══════════════ RC. กระทบยอด ═══════════════
  console.log("\n── RC: กระทบยอด (ยอดรวม = Σ สรุประดับรอบของ a1) ──");
  const ADD = ["bookings", "cancelledBookings", "pendingRefundBookings", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang", "collectedSatang", "outstandingSatang", "heldSatang",
    "retainedSatang", "agentCollectBookings", "noShowUnpaid", "pendingBookings", "costSatang", "costRows"];
  const ROW_K = ["capacity", "sold", "loadFactorBp", "charterLike", "bookings", "cancelledBookings", "pendingRefundBookings", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "collectedSatang", "outstandingSatang",
    "heldSatang", "agentCollectBookings", "commissionCostSatang", "costSatang", "costRows", "grossProfitSatang", "marginBp", "noCosts", "state"];
  /** ทุกแถวของตารางรอบ (ทุกหน้า) */
  const allRows = async (tag: string, input: Rec, unit: string, opts: Rec) => { const first = await repVM(tag, input, unit, opts); const n = Number(asRec(first.departures)?.pageCount ?? 1); const rows = [...depRows(first)];
    for (let p = 2; p <= n; p++) rows.push(...depRows(await repVM(tag, { ...input, page: p }, unit, opts))); return { vm: first, rows }; };
  const reconcile = async (tag: string, input: Rec, unit: string, opts: Rec): Promise<string[]> => {
    const { vm, rows } = await allRows(tag, input, unit, opts); const bad: string[] = []; const sums: Rec[] = [];
    for (const r of rows) { const s = await sumV(tag, String(r.departureId), unit, opts); sums.push(s); const want = pick(s, ROW_K); const got = pick(r, ROW_K); if (!isDeepStrictEqual(got, want)) bad.push(`แถว ${String(r.departureId).slice(-8)}: ${fmt(got)} ≠ สรุป ${fmt(want)}`); }
    const t = T(vm);
    for (const k of ADD) { const s = sums.reduce((a, x) => (x[k] === null || x[k] === undefined ? a : a + Number(x[k])), 0); const exp0 = k === "costSatang" || k === "commissionCostSatang" || k === "costRows" ? (sums.some((x) => x[k] === null) ? null : s) : s; if (t[k] !== exp0) bad.push(`${k}: ${fmt(t[k])} ≠ Σ ${fmt(exp0)}`); }
    const live = sums.filter((x) => x.state !== "CANCELLED");
    if (t.capacity !== live.reduce((a, x) => a + Number(x.capacity), 0) || t.sold !== live.reduce((a, x) => a + Number(x.sold), 0)) bad.push(`ความจุ/ขาย ${fmt(pick(t, ["capacity", "sold"]))}`);
    if (t.departures !== rows.length) bad.push(`departures ${t.departures} ≠ ${rows.length}`);
    if (t.costSatang !== null && sums.some((x) => x.costRows !== null && Number(x.costRows) > 0) && t.grossProfitSatang !== Number(t.revenueExVatSatang) - Number(t.commissionCostSatang) - Number(t.costSatang)) bad.push("กำไร ≠ รายได้ − คอมฯ − ต้นทุน");
    return bad;
  };
  await st("RC-1", "เม.ย. OWNER: ทุกแถวตารางรอบ = departureMoneySummary ของรอบนั้น (21 ช่อง) · ช่องบวกได้ 17 ช่อง = Σ สรุป · ความจุ/ขาย = Σ รอบไม่ยกเลิก · กำไร = รายได้ก่อน VAT − คอมฯ − ต้นทุน", async () => { needSetup(); const b = await reconcile("oa", {}, uA, optsR); ok(b.length === 0, b.slice(0, 4).join(" · ")); });
  await st("RC-2", "เม.ย. report.view (ไม่เห็นต้นทุน): แถว = สรุปของผู้ใช้เดียวกัน (ช่องต้นทุนเป็น null ทั้งคู่) · ยอดบวกได้ = Σ", async () => { needSetup(); const b = await reconcile("rv", {}, uA, optsR); ok(b.length === 0, b.slice(0, 4).join(" · ")); });
  await st("RC-3", "ร้าน seed อ่านอย่างเดียว (OWNER · now TRIPS_AS_OF · พ.ย. 2569): ทุกแถว = departureMoneySummary · ยอดรวม = Σ · ไม่เขียนฐาน seed (TripCost/AuditLog/TripBooking)", async () => {
    const cnt = async () => (await q<Rec>(`SELECT (SELECT count(*) FROM "TripCost" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS b`, [DIVE_TENANT]))[0];
    const before = await cnt(); const r0 = await call("loadTripReportVM", SEED, { unitId: U0, from: "2026-11-01", to: "2026-11-30" }, { now: AS_OF }); ok(r0.ok === true, `seed: ${fmt(r0)}`);
    const tag = "__seed"; U[tag] = { userId: SEED.actorUserId, tenantId: DIVE_TENANT };
    const b = await reconcile(tag, { from: "2026-11-01", to: "2026-11-30" }, U0, { now: AS_OF }); delete U[tag];
    ok(b.length === 0, b.slice(0, 4).join(" · ")); eq(await cnt(), before, "seed ไม่ถูกเขียน");
  });
  await st("RC-4", "Σ ในแท็บ = ยอดรวม: ช่วงรายสัปดาห์ (ยอดขาย · ต้นทุน · คอมฯ) · ช่องทาง (ยอดขาย · การจอง) · ระยะจอง counted + excludedImport = การจอง LIVE · อัตราเต็มต่อสินค้า (ความจุ · ขาย)", async () => {
    needSetup(); const tot = T(await repVM("oa")); const bad: string[] = [];
    const ps = asArr((await repVM("oa", { group: "week" })).periods); for (const k of ["salesSatang", "costSatang", "commissionCostSatang", "bookings"]) if (ps.reduce((a, p) => a + Number(p[k] ?? 0), 0) !== tot[k]) bad.push(`ช่วง ${k}`);
    const gs = asArr(asRec((await repVM("oa", { tab: "channel" })).channelsTab)?.groups); if (gs.reduce((a, g) => a + Number(g.salesSatang), 0) !== tot.salesSatang || gs.reduce((a, g) => a + Number(g.bookings), 0) !== tot.bookings) bad.push("ช่องทาง");
    const l = asRec((await repVM("oa", { tab: "lead" })).lead) ?? {}; if (Number(l.counted) + Number(l.excludedImport) + Number(l.excludedNegative) !== tot.bookings || asArr(l.buckets).reduce((a, b) => a + Number(b.bookings), 0) !== l.counted) bad.push("ระยะจอง");
    const lr = asArr(asRec((await repVM("oa", { tab: "load" })).load)?.rows); if (lr.reduce((a, r) => a + Number(r.capacity), 0) !== tot.capacity || lr.reduce((a, r) => a + Number(r.sold), 0) !== tot.sold) bad.push("อัตราเต็ม");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RC-5", "ฐานวันจองทั้งปี 2570 = ฐานวันเดินทางทั้งปี − การจองที่สร้างก่อนปี (imp · 350,000): ยอดขาย · การจอง · VAT · รอคืนเงิน (สองฐานใช้ตัวคิดต่อการจองตัวเดียวกัน)", async () => {
    needSetup(); const Y = { from: "2027-01-01", to: "2027-12-31" }; const tv = T(await repVM("oa", Y)), bk = T(await repVM("oa", { ...Y, basis: "booked" }));
    eq([bk.salesSatang, bk.bookings, bk.vatSatang, bk.heldSatang], [Number(tv.salesSatang) - 350_000, Number(tv.bookings) - 1, Number(tv.vatSatang) - 22_897, tv.heldSatang], "สองฐาน");
  });
  groupLine("RC");

  // ═══════════════ LK. สิทธิ์และการรั่ว ═══════════════
  console.log("\n── LK: สิทธิ์ / การรั่วของต้นทุน ──");
  await st("LK-1", "ตารางสิทธิ์ (§7): OWNER · MANAGER · cost.view ⇒ ok costView · report.view · trips.* ⇒ ok ไม่เห็นต้นทุน · cost.view อย่างเดียว · booking.view · departure.view · ไม่มีสิทธิ์ · report ไม่มี departure.view ⇒ FORBIDDEN · ผู้ใช้หน่วย a2 · MANAGER หน่วยอื่น · ร้าน B ⇒ NOT_FOUND", async () => {
    needSetup(); const got: Record<string, unknown> = {};
    for (const t of ["oa", "mg", "cv", "rv", "wild", "cvo", "bv", "dv", "none", "nodv", "a2", "mgx", "ob"]) { const r = await rep(t); got[t] = r.ok === true ? `ok:${asRec(asRec(r.vm)?.flags)?.costView}` : r.code; }
    eq(got, { oa: "ok:true", mg: "ok:true", cv: "ok:true", rv: "ok:false", wild: "ok:false", cvo: "FORBIDDEN", bv: "FORBIDDEN", dv: "FORBIDDEN", none: "FORBIDDEN", nodv: "FORBIDDEN", a2: "NOT_FOUND", mgx: "NOT_FOUND", ob: "NOT_FOUND" }, "ผล");
  });
  await st("LK-2", "ผู้ไม่เห็นต้นทุน (report.view · trips.*) ทุกแท็บทั้งสองฐาน: สแกนทั้งต้นไม้คีย์ต้นทุน/คอมฯ/กำไร/noCosts/departuresWithoutCosts = null · ไม่มีตัวเลขต้นทุน/คอมฯ/กำไรในผลทั้งก้อน · ยอดขายยังครบ", async () => {
    needSetup(); const bad: string[] = [];
    for (const t of ["rv", "wild"]) for (const tab of TABS) for (const basis of BASES) {
      const vm = await repVM(t, { tab, basis }); const lk = costLeaks(vm); if (lk.length) bad.push(`${t}/${tab}/${basis}: ${lk.slice(0, 2).join(", ")}`);
      const n = hasNum(JSON.stringify(vm), COST_NUMS); if (n.length) bad.push(`${t}/${tab}/${basis}: ตัวเลข ${n.join(",")}`);
    }
    eq(T(await repVM("rv")).salesSatang, 10_940_000, "ยอดขาย rv"); ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  });
  await st("LK-3", "Q16 + D6 ไม่มีสัญญาณ \"มีต้นทุนแล้ว\": VM ของ report.view ทุกแท็บ และไฟล์ CSV ของ report.view เหมือนกันทุกไบต์ ก่อน/หลังเพิ่มแถวต้นทุนให้ dQ · ของ OWNER เปลี่ยน (ตัวควบคุม: ยังไม่หักต้นทุน {2,2} → {1,2} · ต้นทุน +77,700 · ไฟล์ OWNER ต่าง)", async () => {
    needSetup(); const snap = async (t: string) => JSON.stringify(await Promise.all(TABS.map(async (tab) => { const v = await repVM(t, { tab }); return { ...v, unit: { ...(asRec(v.unit) ?? {}), nowIso: "" } }; })));
    const csvOf = async (t: string) => String(V(await exp(t), `export ${t}`).csv);
    const rv0 = await snap("rv"), oa0 = T(await repVM("oa")), rc0 = await csvOf("rv"), oc0 = await csvOf("oa");
    const cid = await insertRow("TripCost", { id: rid("lk"), tenantId: tA, unitId: uA, departureId: DEP.Q, kind: "FOOD", amountSatang: 77_700, note: null, createdAt: new Date("2027-03-02T00:00:00Z"), updatedAt: new Date("2027-03-02T00:00:00Z") });
    try {
      const rv1 = await snap("rv"), oa1 = T(await repVM("oa")), rc1 = await csvOf("rv"), oc1 = await csvOf("oa");
      eq([oa0.departuresWithoutCosts, oa1.departuresWithoutCosts, Number(oa1.costSatang) - Number(oa0.costSatang), oc0 === oc1], [{ ended: 2, upcoming: 2 }, { ended: 1, upcoming: 2 }, 77_700, false], "ตัวควบคุม OWNER");
      ok(rv0 === rv1, "VM ของ report.view เปลี่ยนเมื่อรอบมีต้นทุน (รั่วว่ามีต้นทุน)"); ok(rc0 === rc1, "ไฟล์ CSV ของ report.view เปลี่ยนเมื่อรอบมีต้นทุน (D6)");
    } finally { await pool.query(`DELETE FROM "TripCost" WHERE id = $1`, [cid]); }
  });
  await st("LK-4", "แยกหน่วย/ร้าน: รายงานหน่วย a ไม่มียอด/ต้นทุน 999,900 ของหน่วย a2/ร้าน B · หน่วย a2 (OWNER) เห็นต้นทุน 999,900 ของตัวเอง · ผลปฏิเสธ (FORBIDDEN/NOT_FOUND) ไม่มีตัวเลข ≥ 4 หลัก", async () => {
    needSetup(); ok(hasNum(JSON.stringify(await repVM("oa")), [999_900]).length === 0, "หน่วย a มีตัวเลขของหน่วยอื่น");
    eq(T(await repVM("oa", {}, uA2)).costSatang, 999_900, "หน่วย a2");
    const bad: string[] = []; for (const t of ["cvo", "bv", "none", "a2", "ob", "mgx"]) { const r = await rep(t); if (r.ok !== false || /\d{4,}/.test(String(r.message ?? "")) || hasNum(JSON.stringify(r), COST_NUMS).length) bad.push(`${t}: ${fmt(r).slice(0, 100)}`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("LK");

  // ═══════════════ EX. CSV ═══════════════
  console.log("\n── EX: ส่งออก CSV ──");
  const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n").slice(0, -1);
  const cells = (line: string): string[] => { const out: string[] = []; let cur = "", inq = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (inq) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inq = false; else cur += c; } else if (c === '"') inq = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
  const head = (dict: Record<string, string>, cs: string[]) => cs.map((c) => dict[`report.csv.${c}`] ?? `<${c}>`);
  let ownerCsv: Rec | null = null;
  const ownerExport = async () => { if (!ownerCsv) ownerCsv = V(await exp("oa"), "export OWNER"); return ownerCsv; };
  await st("EX-1", "OWNER เม.ย.: ชื่อไฟล์ · BOM · CRLF ทุกบรรทัด · หัวไทย = report.csv.* 19 + ต้นทุน 4 คอลัมน์ · 7 แถวตามลำดับตาราง · ข้อมูลล้วน (D2: ไม่มีบรรทัดข้อความใด ๆ — บรรทัดสุดท้ายคือแถว dI) · rows 7 total 7 truncated false withCost true", async () => {
    needSetup(); const v = await ownerExport(); const csv = String(v.csv ?? "");
    eq([v.filename, v.rows, v.total, v.truncated, v.withCost], ["trips-report-2027-04-01-2027-04-30.csv", 7, 7, false, true], "ผล");
    ok(csv.startsWith("﻿") && csv.endsWith("\r\n") && !/[^\r]\n/.test(csv), "BOM/CRLF");
    const ls = lines(csv); eq(cells(ls[0] ?? ""), head(fth, [...CSV_COLS, ...CSV_COST_COLS]), "หัว"); eq(ls.length, 1 + 7, "จำนวนบรรทัด (หัว + 7 แถว)");
    eq(ls.slice(1, 8).map((l) => cells(l)[0]), ["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13", "2027-04-14", "2027-04-16", "2027-04-20"], "ลำดับ");
    ok(ls.slice(1).every((l) => cells(l).length === CSV_COLS.length + CSV_COST_COLS.length && /^\d{4}-\d{2}-\d{2}$/.test(cells(l)[0] ?? "")), "ทุกบรรทัดหลังหัวเป็นแถวข้อมูล");
    ok(!csv.includes(fth["report.mgmt"] ?? "\u0000") && !csv.includes(fth["report.estimate"] ?? "\u0000"), "ไฟล์มีข้อความตัวเลขบริหาร/ประมาณการ (ต้องอยู่บนจอเท่านั้น · D2)");
  });
  await st("EX-2", "ค่าในแถว: dR = 24 · 15 · 62.50 · 6 · 0 · 0 · 50400.00 · 8400.00 · 3297.18 · 47102.82 · 19150.00 · 4100.00 · 0.00 · 3 · 4095.00 · 21500.00 · 21507.82 · 45.66 · สถานะ \"เดินทางแล้ว\" · dX อัตราเต็มว่าง · กำไร -1200.00 (ไม่มี ') · มาร์จินว่าง · dQ ต้นทุน/กำไร/มาร์จิน ว่าง (ยังไม่มีแถวต้นทุน)", async () => {
    needSetup(); const ls = lines(String((await ownerExport()).csv)); const C = (i: number) => cells(ls[i] ?? ""); const col = (n: string) => [...CSV_COLS, ...CSV_COST_COLS].indexOf(n);
    const r = C(1); eq(["state", "capacity", "sold", "loadFactorPct", "bookings", "cancelledBookings", "pendingRefundBookings", "sales", "passThrough", "vat", "revenueExVat", "collected", "outstanding", "held", "agentCollectBookings", "commission", "cost", "grossProfit", "marginPct"].map((n) => r[col(n)]),
      [fth["costs.state.ENDED"], "24", "15", "62.50", "6", "0", "0", "50400.00", "8400.00", "3297.18", "47102.82", "19150.00", "4100.00", "0.00", "3", "4095.00", "21500.00", "21507.82", "45.66"], "dR");
    const x = C(3); eq([x[col("state")], x[col("loadFactorPct")], x[col("held")], x[col("cost")], x[col("grossProfit")], x[col("marginPct")]], [fth["costs.state.CANCELLED"], "", "8200.00", "1200.00", "-1200.00", ""], "dX");
    const qq = C(4); eq([qq[col("cost")], qq[col("grossProfit")], qq[col("marginPct")], qq[col("sales")]], ["", "", "", "3500.00"], "dQ");
  });
  await st("EX-3", "กันสูตร: แถว dP สินค้า \"'=1+1 ทริปทดสอบ\" ตัวเลือก \"'+ห้องพิเศษ\" · ไฟล์อังกฤษ \"'@SUM(A1) test\" · \"'=cmd\" (tab ถูกตัด) · ไม่มีเซลล์ใดขึ้นต้น = + - @ นอกจากตัวเลขเงินติดลบรูป -d.dd", async () => {
    needSetup(); const ls = lines(String((await ownerExport()).csv)); const pi = CSV_COLS.indexOf("product"), oi = CSV_COLS.indexOf("option");
    eq([cells(ls[6] ?? "")[pi], cells(ls[6] ?? "")[oi]], ["'=1+1 ทริปทดสอบ", "'+ห้องพิเศษ"], "th");
    const e = lines(String(V(await exp("oa", { locale: "en" }), "export en").csv)); eq([cells(e[6] ?? "")[pi], cells(e[6] ?? "")[oi]], ["'@SUM(A1) test", "'=cmd"], "en");
    const bad = [...ls, ...e].flatMap((l) => cells(l)).filter((c) => /^[=+\-@\t\r]/.test(c) && !/^-\d+\.\d{2}$/.test(c)); ok(bad.length === 0, `เซลล์อันตราย: ${fmt(bad.slice(0, 3))}`);
  });
  await st("EX-4", "ผู้ไม่เห็นต้นทุน (report.view · trips.*): 19 คอลัมน์ (ไม่มีคอลัมน์ต้นทุน — ไม่ใช่คอลัมน์ว่าง) · ไม่มี 4095.00 / 21500.00 / 21507.82 / 27700.00 · withCost false · ยอดขายยังครบ", async () => {
    needSetup(); const bad: string[] = [];
    for (const t of ["rv", "wild"]) { const v = V(await exp(t), `export ${t}`); const ls = lines(String(v.csv)); if (cells(ls[0] ?? "").length !== 19 || v.withCost !== false) bad.push(`${t}: หัว ${cells(ls[0] ?? "").length}`);
      if (/4095\.00|21500\.00|21507\.82|27700\.00|70448\.02/.test(String(v.csv))) bad.push(`${t}: มีตัวเลขต้นทุน`); if (cells(ls[1] ?? "")[CSV_COLS.indexOf("sales")] !== "50400.00") bad.push(`${t}: ยอดขาย`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("EX-5", "ภาษาอังกฤษ: หัว = report.csv.* อังกฤษ (ไม่มีอักษรไทย) · สถานะ = costs.state.* อังกฤษ · ชื่อสินค้าใช้ titleEn · 8 บรรทัด", async () => {
    needSetup(); const ls = lines(String(V(await exp("oa", { locale: "en" }), "export en").csv));
    eq(cells(ls[0] ?? ""), head(fen, [...CSV_COLS, ...CSV_COST_COLS]), "หัว"); ok(!THAI.test(ls[0] ?? "ก"), "หัวมีอักษรไทย");
    eq([cells(ls[1] ?? "")[CSV_COLS.indexOf("state")], cells(ls[3] ?? "")[CSV_COLS.indexOf("state")], cells(ls[1] ?? "")[CSV_COLS.indexOf("product")], ls.length], [fen["costs.state.ENDED"], fen["costs.state.CANCELLED"], "Racha test", 8], "เซลล์");
    ok(!ls.some((l) => THAI.test(l)), "ไฟล์อังกฤษมีอักษรไทย");
  });
  await st("EX-6", "Σ คอลัมน์ในไฟล์ = ยอดรวมของรายงาน (ยอดขาย 109400.00 · VAT 7156.98 · ต้นทุน 27700.00 · รับแล้ว 37950.00 · รอคืน 12300.00)", async () => {
    needSetup(); const ls = lines(String((await ownerExport()).csv)).slice(1, 8); const all = [...CSV_COLS, ...CSV_COST_COLS];
    const S = (n: string) => ls.reduce((a, l) => a + Math.round(Number(cells(l)[all.indexOf(n)] || "0") * 100), 0);
    eq([S("sales"), S("vat"), S("cost"), S("collected"), S("held")], [10_940_000, 715_698, 2_770_000, 3_795_000, 1_230_000], "Σ");
  });
  await st("EX-7", "audit trips.report.exported ก่อนคืนไฟล์: targetType BusinessUnit · targetId/unitId = หน่วย · actor · before null · after = { from to productId rows total truncated withCost locale } เท่านั้น · ไม่มียอดเงิน/ชื่อสินค้า · เรียกซ้ำ = ไฟล์เดิมทุกไบต์ + audit ใหม่", async () => {
    needSetup(); const n0 = await auditN(A_EXP); const v1 = V(await exp("cv"), "cv 1"), v2 = V(await exp("cv"), "cv 2");
    eq([await auditN(A_EXP) - n0, v1.csv === v2.csv], [2, true], "audit/ไบต์");
    const a = (await q<{ after: Rec; before: unknown; targetType: string; targetId: string; unitId: string; actorId: string }>(`SELECT after, before, "targetType", "targetId", "unitId", "actorId" FROM "AuditLog" WHERE action = $1 AND "tenantId" = $2 AND "actorId" = $3 LIMIT 1`, [A_EXP, tA, U.cv.userId]))[0];
    eq([a?.targetType, a?.targetId, a?.unitId, a?.actorId, a?.before ?? null], ["BusinessUnit", uA, uA, U.cv.userId, null], "แถว");
    eq(Object.keys(asRec(a?.after) ?? {}).sort(), ["from", "locale", "productId", "rows", "to", "total", "truncated", "withCost"], "คีย์ after");
    eq(pick(asRec(a?.after) ?? {}, ["from", "to", "productId", "rows", "total", "truncated", "withCost", "locale"]), ["2027-04-01", "2027-04-30", null, 7, 7, false, true, "th"], "ค่า after");
    ok(hasNum(JSON.stringify(a), [...COST_NUMS, 10_940_000, 5_040_000]).length === 0 && !/ราชา|Racha|Satang/.test(JSON.stringify(a)), `audit มียอด/ชื่อ: ${fmt(a)}`);
  });
  await st("EX-8", "ปฏิเสธ: cost.view อย่างเดียว · booking.view · departure.view · ไม่มีสิทธิ์ · ไม่มี departure.view ⇒ FORBIDDEN ไม่เขียน audit · หน่วย a2/ร้าน B/MANAGER หน่วยอื่น ⇒ NOT_FOUND · ส่ง basis/channel มา ⇒ INVALID_INPUT · 367 วัน ⇒ RANGE_TOO_LARGE", async () => {
    needSetup(); const n0 = await auditN(A_EXP); const got: Record<string, unknown> = {};
    for (const t of ["cvo", "bv", "dv", "none", "nodv", "a2", "ob", "mgx"]) got[t] = (await exp(t)).code ?? "ok";
    eq(got, { cvo: "FORBIDDEN", bv: "FORBIDDEN", dv: "FORBIDDEN", none: "FORBIDDEN", nodv: "FORBIDDEN", a2: "NOT_FOUND", ob: "NOT_FOUND", mgx: "NOT_FOUND" }, "ผล");
    codeR(await exp("oa", { basis: "booked" }), "INVALID_INPUT", "basis"); codeR(await exp("oa", { channel: "WEB" }), "INVALID_INPUT", "channel"); codeR(await exp("oa", { from: "2027-01-01", to: "2028-01-02" }), "RANGE_TOO_LARGE", "367");
    eq(await auditN(A_EXP) - n0, 0, "audit");
  });
  await st("EX-9", "หน่วยไม่จด VAT (D2 คอลัมน์คงที่): หัวเหมือนไฟล์ของหน่วยจด VAT ทุกคอลัมน์ (มี vat · หัวรายได้ = report.csv.revenueExVat) · vat = 0.00 · รายได้ก่อน VAT = ยอดขาย 10500.00 · กำไร 7430.00", async () => {
    needSetup(); const ls = lines(String(V(await exp("mg", {}, uN), "export uN").csv)); const hd = cells(ls[0] ?? ""); const r = cells(ls[1] ?? "");
    eq(hd, head(fth, [...CSV_COLS, ...CSV_COST_COLS]), "หัว");
    eq([r[hd.indexOf(fth["report.csv.vat"] ?? "")], r[hd.indexOf(fth["report.csv.revenueExVat"] ?? "")], r[hd.indexOf(fth["report.csv.grossProfit"] ?? "")], ls.length], ["0.00", "10500.00", "7430.00", 2], "แถว");
  });
  await st("EX-10", "เพดานความถี่ต่อคนต่อหน่วย (D5 · checkRateLimitDb · 20/ชม.): rl ส่งออกหน่วย a 20 ครั้ง ok · ครั้งที่ 21 ⇒ RATE_LIMITED ไม่เขียน audit ข้อความ \"ลองใหม่ในอีก {n} นาที\" (1–60) · rl หน่วยไม่จด VAT ยัง ok (ต่อหน่วย) · rv หน่วย a ยัง ok (ต่อคน) · now + 61 นาที ⇒ ok · key trips:report:export:<ร้าน>:<หน่วย>:<ผู้ใช้>", async () => {
    needSetup(); const rs: string[] = [];
    for (let i = 0; i < 20; i++) rs.push(String((await exp("rl")).ok));
    const n0 = await auditN(A_EXP); const r21 = await exp("rl"); const mm = /ลองใหม่ในอีก (\d{1,2}) นาที/.exec(String(r21.message ?? ""));
    eq([rs.every((x) => x === "true"), r21.code, await auditN(A_EXP) - n0, !!mm && Number(mm[1]) >= 1 && Number(mm[1]) <= 60], [true, "RATE_LIMITED", 0, true], `ครั้งที่ 21 (${String(r21.message ?? "").slice(0, 80)})`);
    eq([(await exp("rl", {}, uN)).ok, (await exp("rv")).ok, (await exp("rl", {}, uA, { now: new Date(NOW_R.getTime() + 61 * 60_000) })).ok], [true, true, true], "ต่อหน่วย/ต่อคน/หน้าต่างใหม่");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [[`${RATE_PREFIX}${tA}:${uA}:${U.rl.userId}`, `${RATE_PREFIX}${tA}:${uN}:${U.rl.userId}`]]))[0]?.n, 2, "key ของถัง (ต่อหน่วย)");
  });
  await st("EX-11", "กรองสินค้า PX ⇒ 1 แถว (dP) · total 1 · audit after.productId = PX · สินค้าหน่วยอื่น ⇒ NOT_FOUND", async () => {
    needSetup(); const v = V(await exp("oa", { productId: PRD.PX.id }), "export PX"); eq([v.rows, v.total, v.truncated, lines(String(v.csv)).length], [1, 1, false, 2], "แถว");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = $1 AND "tenantId" = $2 AND after->>'productId' = $3`, [A_EXP, tA, PRD.PX.id]))[0]?.n, 1, "audit after.productId");
    codeR(await exp("oa", { productId: PRD.PA2.id }), "NOT_FOUND", "สินค้าหน่วยอื่น");
  });
  groupLine("EX");

  // ═══════════════ AC. ทางจริงของจอ ═══════════════
  // ORACLE-EDIT บทเรียน W1.3a (ผู้คุม): เรียกบริการตรงอย่างเดียวพลาดว่า action/ฟอร์มทิ้งช่อง ⇒ ข้อกลุ่มนี้ผ่าน action จริง + ฟอร์ม/ลิงก์ที่เรนเดอร์จริง
  console.log("\n── AC: server action + ฟอร์ม GET ──");
  const formOf = (html: string) => {
    const f = byTestid(html, "trips-rp-filters"); const open = /^<form\b[^>]*>/.exec(f)?.[0] ?? "";
    const attr = (tag: string, n: string) => { const m = new RegExp(`\\s${n}="([^"]*)"`).exec(tag); return m ? decode(m[1] ?? "") : null; };
    const fields: [string, string][] = [];
    for (const m of f.matchAll(/<input\b[^>]*>/g)) { const t = m[0]; const name = attr(t, "name"); if (!name) continue; const type = (attr(t, "type") ?? "text").toLowerCase(); if (type === "submit" || type === "button") continue;
      if ((type === "radio" || type === "checkbox") && !/\schecked(=""|\s|\/|>)/.test(t)) continue; fields.push([name, attr(t, "value") ?? ""]); }
    for (const m of f.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) { const name = attr(`<s ${m[1]}>`, "name"); if (!name) continue; const os = [...(m[2] ?? "").matchAll(/<option\b[^>]*>/g)].map((o) => o[0]);
      const sel = os.find((o) => /\sselected(=""|\s|\/|>)/.test(o)) ?? os[0] ?? ""; fields.push([name, attr(sel, "value") ?? ""]); }
    return { tag: open, method: (attr(open, "method") ?? "").toLowerCase(), action: attr(open, "action") ?? "", fields };
  };
  const toSp = (fields: [string, string][]): Record<string, string | string[]> => { const o: Record<string, string | string[]> = {}; for (const [k, v] of fields) { const cur = o[k]; o[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]; } return o; };
  const FILTER_K = ["from", "to", "basis", "productId", "channel", "tab", "group"];
  await st("AC-1", "โค้ด: ReportExport ส่ง { from: vm.filter.from · to: vm.filter.to · productId: vm.filter.productId } ให้ exportTripReportCsvAction(vm.unit.slug, …) · ไม่ส่ง basis/channel/locale/now · ปุ่ม disabled ระหว่างรอ · ดาวน์โหลดด้วยชื่อไฟล์จากผล · ผล truncated ⇒ แสดง trips-rp-export-partial ด้วย report.export.partial (D2 · ทางนี้เกิดหลังกดเท่านั้น ⇒ ตรวจในโค้ด)", () => {
    needOwn(); const ex = compFiles.map((f) => stripComments(read(f))).find((s) => s.includes("exportTripReportCsvAction(")) ?? "";
    ok(ex, "ไม่มีคอมโพเนนต์ที่เรียก exportTripReportCsvAction"); const at = ex.indexOf("exportTripReportCsvAction("); const call0 = ex.slice(at, at + 300);
    ok(/vm\.unit\.slug|unitSlug/.test(call0) && /from:\s*vm\.filter\.from/.test(call0) && /to:\s*vm\.filter\.to/.test(call0) && /productId:\s*vm\.filter\.productId/.test(call0), `ช่องที่ส่งไม่ครบ: ${call0.slice(0, 160)}`);
    ok(!/basis:|channel:|locale:|now:/.test(call0), "ส่ง basis/channel/locale/now"); ok(/disabled=\{[^}]*(busy|pending)/.test(ex) && /\.filename/.test(ex) && /Blob\(/.test(ex), "ปุ่ม/ดาวน์โหลด");
    ok(/\.truncated\b/.test(ex) && /\.total\b/.test(ex) && /["'`]trips-rp-export-partial["'`]/.test(ex) && /report\.export\.partial/.test(ex), "ไม่แจ้งไฟล์ถูกตัดบนจอ (truncated/total → trips-rp-export-partial)");
  });
  await st("AC-2", "OWNER ผ่าน action (คุกกี้ session จริง): ไฟล์ = exportTripReportCsv ของบริการที่ใช้นาฬิกาจริง (ทุกไบต์) · audit actor = ผู้ใช้ของคุกกี้ · locale th", async () => {
    needSetup(); const ids0 = new Set((await q<{ id: string }>(`SELECT id FROM "AuditLog" WHERE action = $1 AND "tenantId" = $2`, [A_EXP, tA])).map((x) => x.id));
    const r = await actExport("oa", { from: APR.from, to: APR.to, productId: null }); ok(r.ok === true, `action: ${fmt(r)}`);
    const mid = (await q<{ id: string; actorId: string; after: Rec }>(`SELECT id, "actorId", after FROM "AuditLog" WHERE action = $1 AND "tenantId" = $2`, [A_EXP, tA])).filter((x) => !ids0.has(x.id));
    eq(mid.map((x) => [x.actorId, asRec(x.after)?.locale]), [[U.oa.userId, "th"]], "audit ของ action (1 แถว · ผู้ใช้ของคุกกี้)");
    const sv = V(await call("exportTripReportCsv", ctxOf("oa"), { unitId: uA, ...APR }), "บริการนาฬิกาจริง");
    eq(asRec(r.value)?.csv === sv.csv, true, "ไฟล์ตรงกัน");
  });
  await st("AC-3", "ภาษาจากคุกกี้ LOCALE=en: หัวไฟล์อังกฤษ · ส่ง locale:\"th\" ใน input ไม่มีผล · ไม่มีคุกกี้ ⇒ ไทย", async () => {
    needSetup(); const r = await actExport("oa", { from: APR.from, to: APR.to, locale: "th" }, "en"); ok(r.ok === true, `action en: ${fmt(r)}`);
    eq(cells(lines(String(asRec(r.value)?.csv))[0] ?? ""), head(fen, [...CSV_COLS, ...CSV_COST_COLS]), "หัวอังกฤษ");
  });
  await st("AC-4", "action ไม่เชื่อ input: unitId ของหน่วยอื่นใน input ถูกทับด้วยหน่วยของ slug · productId หน่วยอื่น ⇒ NOT_FOUND · basis/channel ใน input ถูกทิ้ง (ไฟล์ฐานวันเดินทางเหมือนเดิม) · caps ใน input ไม่มีผล (D3) · from/to ที่ส่งมาถูกใช้จริง (PX วันเดียว 16 เม.ย. ⇒ 1 แถว)", async () => {
    needSetup(); const r1 = await actExport("oa", { from: APR.from, to: APR.to, unitId: uA2, basis: "booked", channel: "WEB", caps: { bookings: 1, departures: 1 } }); ok(r1.ok === true, `ทับ: ${fmt(r1)}`);
    eq([asRec(r1.value)?.total, /9999\.00/.test(String(asRec(r1.value)?.csv))], [7, false], "หน่วยของ slug");
    codeR(await actExport("oa", { from: APR.from, to: APR.to, productId: PRD.PA2.id }), "NOT_FOUND", "สินค้าหน่วยอื่น");
    const r3 = await actExport("oa", { from: "2027-04-16", to: "2027-04-16", productId: PRD.PX.id }); eq([r3.ok, asRec(r3.value)?.total, asRec(r3.value)?.filename], [true, 1, "trips-report-2027-04-16-2027-04-16.csv"], "from/to/productId");
  });
  await st("AC-5", "ปฏิเสธที่ action: cost.view อย่างเดียว · booking.view · departure.view · ไม่มีสิทธิ์ · ไม่มี departure.view ⇒ FORBIDDEN (ไม่มีตัวเลข) · ผู้ใช้หน่วย a2 / ร้าน B / MANAGER หน่วยอื่น ผ่าน slug หน่วย a ⇒ ไม่ผ่าน · ไม่เขียน audit", async () => {
    needSetup(); const n0 = await auditN(A_EXP); const bad: string[] = [];
    for (const t of ["cvo", "bv", "dv", "none", "nodv"]) { const r = await actExport(t, { from: APR.from, to: APR.to }); if (r.ok !== false || r.code !== "FORBIDDEN" || /\d{4,}/.test(String(r.message ?? ""))) bad.push(`${t}: ${fmt(r).slice(0, 100)}`); }
    for (const t of ["a2", "ob", "mgx"]) { const r = await actExport(t, { from: APR.from, to: APR.to }); if (r.ok === true) bad.push(`${t} ผ่าน`); }
    ok(bad.length === 0, bad.join(" · ")); eq(await auditN(A_EXP) - n0, 0, "audit");
  });
  await st("AC-6", "ฟอร์มตัวกรองที่เรนเดอร์จริง (ไม่มี JS): <form method=get action=/app/u/<slug>/trips/reports> · ชื่อช่อง ⊆ REPORT_QUERY_PARAMS และครอบ from to basis product channel tab · ไม่มี page · ส่งฟอร์มตามค่าปัจจุบัน → reportQueryOf → loadTripReportVM ⇒ filter เดิม (สินค้า PR · แท็บ load · ฐาน travel) และ (ฐาน booked · ช่องทาง WEB · แท็บ lead)", async () => {
    needSetup(); const bad: string[] = [];
    for (const input of [{ productId: PRD.PR.id, tab: "load" }, { basis: "booked", channel: "WEB", tab: "lead" }] as Rec[]) {
      const vm = await repVM("oa", input); const f = formOf(screenR(vm));
      if (f.method !== "get" || f.action !== `/app/u/${asRec(vm.unit)?.slug}/trips/reports`) bad.push(`form ${f.tag.slice(0, 120)}`);
      const names = new Set(f.fields.map(([k]) => k)); const extra = [...names].filter((k) => !QPARAMS.includes(k)); const need = ["from", "to", "basis", "product", "channel", "tab"].filter((k) => !names.has(k));
      if (extra.length || need.length || names.has("page")) bad.push(`ชื่อช่อง เกิน ${extra.join(",")} ขาด ${need.join(",")}${names.has("page") ? " มี page" : ""}`);
      const vm2 = await repVM("oa", { ...(asRec(pure("reportQueryOf", toSp(f.fields))) ?? {}) });
      if (!isDeepStrictEqual(pick(asRec(vm2.filter) ?? {}, FILTER_K), pick(asRec(vm.filter) ?? {}, FILTER_K))) bad.push(`ส่งฟอร์มแล้ว filter เปลี่ยน: ${fmt(pick(asRec(vm2.filter) ?? {}, FILTER_K))} ≠ ${fmt(pick(asRec(vm.filter) ?? {}, FILTER_K))}`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("AC-7", "ลิงก์ที่เรนเดอร์จริงคงตัวกรอง: แท็บ (load lead channel) · ช่วงสำเร็จรูป 4 ปุ่ม (from/to = vm.presets) · กลุ่ม week · ทุกลิงก์ไป /trips/reports และ reportQueryOf ของ href ได้ basis/productId/channel เดิม (หน้ากลับเป็น 1)", async () => {
    needSetup(); const vm = await repVM("oa", { productId: PRD.PR.id, basis: "travel", page: 1 }); const html = screenR(vm); const bad: string[] = []; const base = `/app/u/${asRec(vm.unit)?.slug}/trips/reports`;
    const check = (id: string, want: Rec) => { const h = hrefOf(html, id); if (!h) { bad.push(`ไม่มีลิงก์ ${id}`); return; } if (new URL(h, "http://qc.local").pathname !== base) bad.push(`${id} ไป ${h}`);
      const qq = asRec(pure("reportQueryOf", queryOfHref(h))) ?? {}; for (const [k, v] of Object.entries({ productId: PRD.PR.id, ...want })) if (qq[k] !== v) bad.push(`${id}.${k} = ${fmt(qq[k])} ต้อง ${fmt(v)}`); if ((qq.page ?? 1) !== 1) bad.push(`${id} หน้า ${fmt(qq.page)}`); };
    for (const t of ["load", "lead", "channel"]) check(`trips-rp-tab-${t}`, { tab: t, from: APR.from, to: APR.to });
    for (const p of asArr(vm.presets)) check(`trips-rp-preset-${p.key}`, { from: p.from, to: p.to });
    check("trips-rp-group-week", { group: "week", from: APR.from, to: APR.to });
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  groupLine("AC");

  // ═══════════════ RS. จอที่เรนเดอร์จริง ═══════════════
  console.log("\n── RS: จอที่เรนเดอร์ (NextIntlClientProvider) ──");
  const txtOf = (html: string, id: string) => unent(byTestid(html, id));
  const noCostTh = (n: number, e: number, u: number) => String(PINNED["report.noCosts"]).replace("{n}", String(n)).replace("{ended}", String(e)).replace("{upcoming}", String(u));
  await st("RS-1", "OWNER เม.ย. ไทย: บรรทัดตัวเลขบริหาร + ยังไม่ลงบัญชี + ป้ายประมาณการ · บรรทัด VAT (Σ VAT > 0) · KPI รายได้ \"รายได้ก่อน VAT\" · KPI กำไร 70,448.02 และ**ภายใน element KPI กำไร** trips-rp-kpi-profit-note = \"ยังไม่หักต้นทุนของ 4 รอบ (เดินทางแล้ว 2 · ยังไม่เดินทาง 2)\" (D1) · KPI อัตราเต็ม 33/86 ไม่แสดงที่นั่ง 35 (D5) · KPI คอมฯ ไม่มีป้ายรวม VAT (U3) · เหมาลำ 1 รอบ · ตารางรอบ 7 แถว · ลิงก์ trips-rp-back", async () => {
    needSetup(); const h = screenR(await repVM("oa")); const bad: string[] = [];
    for (const [id, want] of [["trips-rp-mgmt", PINNED["report.mgmt"]], ["trips-rp-accounting-note", PINNED["report.accounting"]], ["trips-rp-estimate", PINNED["report.estimate"]], ["trips-rp-vat-line", PINNED["report.vat"]],
      ["trips-rp-kpi-revenue", "รายได้ก่อน VAT"], ["trips-rp-kpi-profit", "70,448.02"], ["trips-rp-kpi-load", "33/86"], ["trips-rp-charter-note", "รอบเหมาลำ 1 รอบ"]] as const) if (!txtOf(h, id).includes(String(want))) bad.push(`${id}: "${txtOf(h, id).slice(0, 80)}"`);
    const kp = byTestid(h, "trips-rp-kpi-profit"); if (unent(byTestid(kp, "trips-rp-kpi-profit-note")) !== noCostTh(4, 2, 2)) bad.push(`ข้อความในช่องกำไร: "${unent(byTestid(kp, "trips-rp-kpi-profit-note"))}" (ต้องอยู่ภายใน trips-rp-kpi-profit)`);
    if (/\b35\b/.test(txtOf(h, "trips-rp-kpi-load"))) bad.push("KPI อัตราเต็มแสดงที่นั่ง 35");
    if (txtOf(h, "trips-rp-kpi-commission").includes(PINNED["report.kpi.commissionWithVat"] ?? "\u0000")) bad.push("ป้ายคอมฯ รวม VAT ในหน่วยจด VAT");
    if ([0, 1, 2, 3, 4, 5, 6].some((i) => !h.includes(`data-testid="trips-rp-dep-${i}"`)) || h.includes('data-testid="trips-rp-dep-7"')) bad.push("ตารางรอบไม่ใช่ 7 แถว");
    if (!hrefOf(h, "trips-rp-back")) bad.push("ไม่มีลิงก์กลับ"); ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-2", "ทุกแท็บ (sales load lead channel): มีบรรทัดตัวเลขบริหาร · ยังไม่ลงบัญชี · ประมาณการ · เนื้อแท็บของตัวเอง (periods/load/lead/channels) · แท็บปัจจุบัน aria-current=\"page\"", async () => {
    needSetup(); const bad: string[] = []; const body: Record<string, string> = { sales: "trips-rp-periods", load: "trips-rp-load", lead: "trips-rp-lead", channel: "trips-rp-channels" };
    for (const tab of TABS) { const h = screenR(await repVM("oa", { tab })); for (const id of ["trips-rp-mgmt", "trips-rp-accounting-note", "trips-rp-estimate", body[tab] ?? ""]) if (!h.includes(`data-testid="${id}"`)) bad.push(`${tab}: ไม่มี ${id}`);
      if (!/aria-current="page"/.test(byTestid(h, `trips-rp-tab-${tab}`).slice(0, 300))) bad.push(`${tab}: aria-current`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-3", "หน่วยไม่จด VAT (Q11 · U3): ไม่มี trips-rp-vat-line · KPI รายได้ \"รายได้\" · ไม่มีคำว่า \"ก่อน VAT\" บนจอ · KPI คอมฯ มี \"(รวม VAT ของคอมมิชชัน)\" (VAT คอมฯ ถูกนับเป็นต้นทุนจริง) · flags.commissionWithVat true", async () => {
    needSetup(); const vm = await repVM("mg", {}, uN); const h = screenR(vm); const t = unent(h);
    ok(!h.includes('data-testid="trips-rp-vat-line"') && !t.includes("ก่อน VAT") && txtOf(h, "trips-rp-kpi-revenue").startsWith("รายได้"), `จอ: ${txtOf(h, "trips-rp-kpi-revenue")}`);
    ok(asRec(vm.flags)?.commissionWithVat === true && txtOf(h, "trips-rp-kpi-commission").includes(PINNED["report.kpi.commissionWithVat"] ?? "\u0000"), `คอมฯ: ${txtOf(h, "trips-rp-kpi-commission")}`);
  });
  await st("RS-4", "report.view: ไม่มี element KPI คอมฯ/ต้นทุน/กำไร (ไม่ใช่ \"—\") · ไม่มีข้อความรอบยังไม่หักต้นทุน (KPI/แถวช่วง) · ไม่มีตัวเลขต้นทุน/คอมฯ/กำไรใน HTML · ยอดขายยังแสดง 109,400.00", async () => {
    needSetup(); const h = screenR(await repVM("rv")); const bad: string[] = [];
    for (const id of ["trips-rp-kpi-commission", "trips-rp-kpi-cost", "trips-rp-kpi-profit", "trips-rp-kpi-profit-note", "trips-rp-period-note-"]) if (h.includes(`data-testid="${id}`)) bad.push(id);
    if (unent(h).includes("ยังไม่หักต้นทุนของ")) bad.push("ข้อความรอบยังไม่หักต้นทุน");
    for (const s of ["27,700.00", "70,448.02", "4,095.00", "21,500.00", "21,507.82", "1,995.00"]) if (h.includes(s)) bad.push(s);
    if (!txtOf(h, "trips-rp-kpi-sales").includes("109,400.00")) bad.push("ยอดขาย"); ok(bad.length === 0, `รั่ว: ${bad.join(", ")}`);
  });
  await st("RS-5", "ฐานวันจอง: trips-rp-basis-note = report.note.basis · ไม่มี trips-rp-deps · KPI อัตราเต็ม \"—\" · ไม่มีปุ่มส่งออก แต่มี trips-rp-export-note", async () => {
    needSetup(); const h = screenR(await repVM("oa", { basis: "booked" }));
    ok(txtOf(h, "trips-rp-basis-note").includes(PINNED["report.note.basis"] ?? "\u0000") && !h.includes('data-testid="trips-rp-deps"') && txtOf(h, "trips-rp-kpi-load").includes("—") && !/\d+\/\d+/.test(txtOf(h, "trips-rp-kpi-load")), "ฐานวันจอง");
    ok(!h.includes('data-testid="trips-rp-export"') && txtOf(h, "trips-rp-export-note").includes(PINNED["report.export.unavailable"] ?? "\u0000"), "ส่งออก");
  });
  await st("RS-6", "กรองช่องทาง: trips-rp-channel-note = report.note.channel (ไม่ใช่ข้อความฐานวันจอง) · ไม่มี trips-rp-basis-note · ไม่มีตารางรอบ", async () => {
    needSetup(); const h = screenR(await repVM("oa", { channel: "WEB" }));
    ok(txtOf(h, "trips-rp-channel-note").includes(PINNED["report.note.channel"] ?? "\u0000") && !h.includes('data-testid="trips-rp-basis-note"') && !h.includes('data-testid="trips-rp-deps"'), "ป้ายช่องทาง");
  });
  await st("RS-7", "ช่วงว่าง: trips-rp-empty = report.empty · ช่วง 19–25 เม.ย. (มีรอบแต่ทั้งช่วงไม่มีแถวต้นทุน) ⇒ KPI ต้นทุน \"—\" ไม่มีตัวเลข (D1) · KPI กำไร \"—\" ไม่มียอด + ข้อความในช่อง \"ยังไม่หักต้นทุนของ 1 รอบ (เดินทางแล้ว 0 · ยังไม่เดินทาง 1)\"", async () => {
    needSetup(); ok(txtOf(screenR(await repVM("oa", { from: "2027-08-01", to: "2027-08-31" })), "trips-rp-empty").includes(PINNED["report.empty"] ?? "\u0000"), "จอว่าง");
    const h = screenR(await repVM("oa", { from: "2027-04-19", to: "2027-04-25" })); const c = txtOf(h, "trips-rp-kpi-cost"), kp = byTestid(h, "trips-rp-kpi-profit"); const note = unent(byTestid(kp, "trips-rp-kpi-profit-note"));
    const pv = unent(kp).replace(note, "");
    ok(c.includes("—") && !/\d/.test(c), `KPI ต้นทุน: "${c}"`); ok(pv.includes("—") && !/\d/.test(pv) && note === noCostTh(1, 0, 1), `KPI กำไร: "${unent(kp)}"`);
  });
  await st("RS-8", "ภาษาอังกฤษ (รายงาน OWNER เม.ย. ทุกแท็บ): ไม่มีอักษรไทยบนจอ · \"4 departures\" · ไม่มีรหัสดิบ (AGENT_PORTAL · D8_14 · ENDED · CANCELLED …) ทั้งสองภาษา", async () => {
    needSetup(); const bad: string[] = [];
    for (const tab of TABS) for (const loc of ["th", "en"] as const) { const t = unent(screenR(await repVM("oa", { tab }), loc));
      if (loc === "en" && THAI.test(t)) bad.push(`en/${tab}: ${(/[^ ]*[฀-๿][^ ]*/.exec(t) ?? [""])[0]}`);
      const raw = t.split(/[^A-Z_0-9]+/).filter((w) => RAW_CODES.has(w)); if (raw.length) bad.push(`${loc}/${tab}: ${raw.slice(0, 3).join(",")}`); }
    if (!txtOf(screenR(await repVM("oa"), "en"), "trips-rp-kpi-profit-note").includes("4 departures")) bad.push("en noCosts (ภายใน KPI กำไร)");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("RS-9", "หนี้ a1 (§5.6): จอต้นทุน dQ (ไม่มีแถวต้นทุน) — KPI ต้นทุน \"—\" ไม่มีตัวเลข/\"ต่อที่นั่ง 0.00\" · บรรทัดต้นทุนใน breakdown ไม่ใช่ 0.00 · การ์ดแผงรอบ dQ ไม่มี 0.00 ของต้นทุน · จอต้นทุน dR ภาษาอังกฤษไม่มีอักษรไทย", async () => {
    needSetup(); const loadC = async (dep: string) => VM(await call("loadDepartureCostsVM", ctxOf("oa"), { unitId: uA, departureId: dep }, optsR), `จอต้นทุน ${dep}`);
    const sh = render(CSCREEN.mod?.default, { vm: await loadC(DEP.Q) }); const k = txtOf(sh, "trips-cost-kpi-cost"); const bad: string[] = [];
    if (!k.includes("—") || /\d/.test(k)) bad.push(`KPI ต้นทุน: "${k}"`);
    const bd = txtOf(sh, "trips-cost-breakdown"); const lab = fth["costs.breakdown.cost"] ?? "ต้นทุนรอบ"; const at = bd.indexOf(lab); if (at < 0 || /0\.00/.test(bd.slice(at, at + lab.length + 14))) bad.push(`breakdown: "${bd.slice(Math.max(0, at), at + 40)}"`);
    const card = unent(render(PARTS.mod?.CostMoneyCard, { money: VM(await call("loadDeparturePanelVM", ctxOf("oa"), { unitId: uA, departureId: DEP.Q }, optsR), "panel dQ").money })); if (/ต้นทุนรอบ\s*0\.00/.test(card)) bad.push(`การ์ด: ${card.slice(0, 120)}`);
    const enT = unent(render(CSCREEN.mod?.default, { vm: await loadC(DEP.R) }, "en")); if (THAI.test(enT.replace(/เรือราชา 1|ไกด์ 2 คน|รถตู้ 2 คัน/g, ""))) bad.push(`จอต้นทุนอังกฤษ: ${(/[^ ]*[฀-๿][^ ]*/.exec(enT) ?? [""])[0]}`);
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-10", "ทางเข้าบนปฏิทินที่เรนเดอร์จริง: OWNER / report.view เห็น trips-dep-reports → /trips/reports ข้อความ \"รายงาน\" · departure.view อย่างเดียว / cost.view อย่างเดียว ไม่เห็น · flags.canReport ตรงกัน", async () => {
    needSetup(); const bad: string[] = [];
    for (const [t, want] of [["oa", true], ["rv", true], ["dv", false], ["cvo", false]] as const) {
      const cal = VM(await call("loadDepartureCalendarVM", ctxOf(t), { unitId: uA, view: "week", start: "2027-04-05" }, optsR), `ปฏิทิน ${t}`);
      if (asRec(cal.flags)?.canReport !== want) bad.push(`${t} flags ${fmt(asRec(cal.flags)?.canReport)}`);
      const h = render(DSCREEN.mod?.default, { unitSlug: SLUG_A, cal, panel: null, sched: null, openDecide: false }); const href = hrefOf(h, "trips-dep-reports");
      if (want && (href !== `/app/u/${SLUG_A}/trips/reports` || txtOf(h, "trips-dep-reports") !== "รายงาน")) bad.push(`${t}: ${href} "${txtOf(h, "trips-dep-reports")}"`); if (!want && href) bad.push(`${t} เห็นลิงก์`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-11", "ไม่มี JS: ตัวกรองเป็น <form method=\"get\"> ปุ่ม type=submit · แท็บ/ช่วงสำเร็จรูป/กลุ่ม เป็น <a href> · ส่วนส่งออกมี <noscript> trips-rp-export-nojs (report.export.noJs) · ปุ่มส่งออก type=button · บรรทัด trips-rp-export-mgmt = report.mgmt ข้างปุ่ม (D2)", async () => {
    needSetup(); const h = screenR(await repVM("oa")); const bad: string[] = [];
    if (formOf(h).method !== "get" || !/^<button\b[^>]*type="submit"/.test(byTestid(h, "trips-rp-apply"))) bad.push("ฟอร์ม/ปุ่มกรอง");
    for (const id of ["trips-rp-tab-sales", "trips-rp-tab-load", "trips-rp-preset-thisMonth", "trips-rp-preset-last30", "trips-rp-group-week"]) if (!hrefOf(h, id)) bad.push(`${id} ไม่ใช่ลิงก์`);
    if (!/<noscript[\s\S]*trips-rp-export-nojs/.test(h) && !(h.includes("<noscript") && h.includes(PINNED["report.export.noJs"] ?? "\u0000"))) bad.push("ไม่มี noscript");
    if (!/^<button\b[^>]*type="button"/.test(byTestid(h, "trips-rp-export"))) bad.push("ปุ่มส่งออก");
    if (txtOf(h, "trips-rp-export-mgmt") !== PINNED["report.mgmt"]) bad.push(`ข้างปุ่มส่งออก: "${txtOf(h, "trips-rp-export-mgmt")}"`);
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-12", "ข้อผิดพลาดของตัวกรอง: error=RANGE_TOO_LARGE ⇒ trips-rp-error role=\"alert\" ข้อความ errors.RANGE_TOO_LARGE · ไม่มี error ⇒ ไม่มีกล่อง", async () => {
    needSetup(); const vm = await repVM("oa"); const h = screenR(vm, "th", "RANGE_TOO_LARGE"); const e = byTestid(h, "trips-rp-error");
    ok(/role="alert"/.test(e.slice(0, 300)) && unent(e).includes(PINNED["errors.RANGE_TOO_LARGE"] ?? "\u0000"), `กล่อง: ${e.slice(0, 160)}`); ok(!screenR(vm).includes('data-testid="trips-rp-error"'), "มีกล่องเมื่อไม่มี error");
  });
  await st("RS-13", "D6 ทางจริงของหน้าเมื่อตัวกรองผิด (เรนเดอร์ page.tsx ในขอบเขตคำขอ): from 30 ก.พ. + ฐานวันจอง + สินค้า PR + แท็บ lead ⇒ ไม่ notFound · กล่อง trips-rp-error = report.error.filter · ฟอร์มยังเป็น basis booked · product PR · tab lead · ช่วง 367 วัน + แท็บ load ⇒ errors.RANGE_TOO_LARGE คงแท็บ load · สินค้าหน่วยอื่น ⇒ report.error.filter คงฐาน/แท็บ", async () => {
    needSetup(); const PG = await tryImport("@/app/app/u/[unitSlug]/trips/reports/page"); ok(typeof PG.mod?.default === "function", `ยังไม่มีหน้า reports (${PG.err.slice(0, 100)})`);
    const renderPage = async (sp: Record<string, string>): Promise<string> => {
      const cookie = await sessionCookie("oa"); const path = `/app/u/${SLUG_A}/trips/reports`; const reqq = new Request(`http://qc.local${path}`, { headers: { cookie, "user-agent": "qc-t17b-page" } });
      const jar = new (nextCookies?.RequestCookies as new (h: Headers) => unknown)(reqq.headers);
      const workStore = { route: path, page: `${path}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
      const unitStore = { type: "request", phase: "render", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: reqq.headers, draftMode: undefined, rootParams: {}, url: { pathname: path, search: "" } };
      const run = (st0: Rec | null, store: unknown, g: () => unknown) => (st0?.run as (s1: unknown, g: () => unknown) => unknown).call(st0, store, g);
      let el: unknown;
      try { el = await run(asRec(nextWork?.workAsyncStorage), workStore, () => run(asRec(nextWorkUnit?.workUnitAsyncStorage), unitStore, () => (PG.mod?.default as AnyFn)({ params: Promise.resolve({ unitSlug: SLUG_A }), searchParams: Promise.resolve(sp) }))); }
      catch (e) { throw new AssertFail(`หน้า throw (notFound/redirect?): ${errMsg(e)} ${String(asRec(e)?.digest ?? "")}`); }
      const ce = RX?.react.createElement as AnyFn; const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
      return String((RX?.rds.renderToStaticMarkup as AnyFn)(ce(asRec(RX?.arc.AppRouterContext)?.Provider, { value: router }, ce(RX?.intl.NextIntlClientProvider, { locale: "th", messages: { trips: th }, timeZone: "Asia/Bangkok" }, el))));
    };
    const fld = (h: string) => Object.fromEntries(formOf(h).fields.filter(([k]) => ["basis", "product", "tab"].includes(k))); const bad: string[] = [];
    const h1 = await renderPage({ from: "2027-02-30", to: "2027-04-30", basis: "booked", product: PRD.PR.id, tab: "lead" });
    if (!unent(byTestid(h1, "trips-rp-error")).includes(PINNED["report.error.filter"] ?? "\u0000") || !/role="alert"/.test(byTestid(h1, "trips-rp-error").slice(0, 300))) bad.push(`กล่อง 1: ${unent(byTestid(h1, "trips-rp-error")).slice(0, 80)}`);
    if (!isDeepStrictEqual(fld(h1), { basis: "booked", product: PRD.PR.id, tab: "lead" })) bad.push(`ค่าที่คงไว้ 1: ${fmt(fld(h1))}`);
    const h2 = await renderPage({ from: "2027-01-01", to: "2028-01-02", tab: "load" });
    if (!unent(byTestid(h2, "trips-rp-error")).includes(PINNED["errors.RANGE_TOO_LARGE"] ?? "\u0000") || fld(h2).tab !== "load") bad.push(`367 วัน: ${unent(byTestid(h2, "trips-rp-error")).slice(0, 60)} ${fmt(fld(h2))}`);
    const h3 = await renderPage({ basis: "booked", product: PRD.PA2.id, tab: "channel" });
    if (!unent(byTestid(h3, "trips-rp-error")).includes(PINNED["report.error.filter"] ?? "\u0000") || fld(h3).basis !== "booked" || fld(h3).tab !== "channel" || (fld(h3).product ?? "") !== "") bad.push(`สินค้าหน่วยอื่น: ${fmt(fld(h3))}`);
    const h0 = await renderPage({ tab: "sales" }); if (h0.includes('data-testid="trips-rp-error"')) bad.push("มีกล่องเมื่อตัวกรองถูก");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-14", "D5 ระยะจองบนจอ: เม.ย. trips-rp-lead-excluded = \"ไม่นับการจองที่ยกเลิก รอคืนเงิน หรือนำเข้า (นำเข้า 1 การจอง)\" · ไม่มี trips-rp-lead-negative (0) · โตเกียว trips-rp-lead-negative = \"จองหลังวันเดินทาง 1 การจอง — ไม่อยู่ในช่องใด\" · ค่ากลาง 9 วัน", async () => {
    needSetup(); const h = screenR(await repVM("oa", { tab: "lead" })); const ht = screenR(await repVM("oa", { tab: "lead" }, uT)); const bad: string[] = [];
    if (txtOf(h, "trips-rp-lead-excluded") !== String(PINNED["report.lead.notCounted"]).replace("{n}", "1")) bad.push(`ไม่นับ: "${txtOf(h, "trips-rp-lead-excluded")}"`);
    if (h.includes('data-testid="trips-rp-lead-negative"')) bad.push("มีบรรทัดค่าลบเมื่อ 0");
    if (txtOf(ht, "trips-rp-lead-negative") !== String(PINNED["report.lead.negative"]).replace("{n}", "1")) bad.push(`ค่าลบ: "${txtOf(ht, "trips-rp-lead-negative")}"`);
    if (!/\b9\b/.test(txtOf(h, "trips-rp-lead-median"))) bad.push(`ค่ากลาง: ${txtOf(h, "trips-rp-lead-median")}`);
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-15", "D5 ส่วนแบ่งช่องทางบนจอ: แถวช่องทางแสดง 18.74% · 8.64% · 41.59% · 15.04% · 12.80% · 3.20% (ปัดอิสระ · รวม 100.01%) · ไม่มีแถวรวม % (ไม่มี \"100.00%\" / \"100.01%\" ในแท็บช่องทาง)", async () => {
    needSetup(); const h = byTestid(screenR(await repVM("oa", { tab: "channel" })), "trips-rp-channels"); const t = unent(h); const bad: string[] = [];
    for (const [c, pct] of [["WEB", "18.74%"], ["LIFF", "8.64%"], ["COUNTER", "41.59%"], ["AGENT_PORTAL", "15.04%"], ["AGENT_LINK", "12.80%"], ["IMPORT", "3.20%"]] as const) if (!unent(byTestid(h, `trips-rp-ch-${c}`)).includes(pct)) bad.push(`${c} ${pct}`);
    if (t.includes("100.00%") || t.includes("100.01%")) bad.push("มีแถวรวม %"); ok(bad.length === 0, bad.join(" · "));
  });
  await st("RS-16", "D1 แถวช่วงย่อย (รายสัปดาห์): แถว 12–18 เม.ย. มี trips-rp-period-note-2 = \"ยังไม่หักต้นทุนของ 3 รอบ (เดินทางแล้ว 2 · ยังไม่เดินทาง 1)\" · แถว 5–11 เม.ย. ไม่มี · D5 ฐานวันจองไม่มีปุ่ม trips-rp-preset-next30 · ฐานวันเดินทางมี", async () => {
    needSetup(); const h = screenR(await repVM("oa", { group: "week" })); const bad: string[] = [];
    if (txtOf(h, "trips-rp-period-note-2") !== noCostTh(3, 2, 1)) bad.push(`แถว 12–18: "${txtOf(h, "trips-rp-period-note-2")}"`);
    if (h.includes('data-testid="trips-rp-period-note-1"')) bad.push("แถว 5–11 มีข้อความ");
    if (!byTestid(h, "trips-rp-period-2").includes('data-testid="trips-rp-period-note-2"') && !h.includes('data-testid="trips-rp-period-note-2"')) bad.push("ไม่มีข้อความในแถว");
    if (!h.includes('data-testid="trips-rp-preset-next30"')) bad.push("ฐานวันเดินทางไม่มี next30");
    if (screenR(await repVM("oa", { basis: "booked" })).includes('data-testid="trips-rp-preset-next30"')) bad.push("ฐานวันจองมี next30");
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("RS");

  // ═══════════════ PF. ร้านใหญ่ ═══════════════
  console.log("\n── PF: ร้านใหญ่ (3 สินค้า × 2 รอบ/วัน × 366 วัน · ~20,000 การจอง) ──");
  const Y366 = { from: "2027-01-01", to: "2028-01-01" };
  let pfErr = ""; let pfBuilt = false;
  const tplDeps: string[] = [];
  const buildPerf = async () => {
    if (pfBuilt || pfErr) { if (pfErr) throw new AssertFail(`ฟิกซ์เจอร์ PF: ${pfErr}`); return; }
    try {
      needSetup(); ok(seedSnap, "ไม่มี snapshot ของ seed (PC-5)");
      const P = mkProdX as NonNullable<typeof mkProdX>, D = mkDepX as NonNullable<typeof mkDepX>, B = mkBkX as NonNullable<typeof mkBkX>;
      for (const k of ["F1", "F2", "F3"]) { await P(k, tA, uP, { title: `ร้านใหญ่ ${k}`, titleEn: `Big ${k}` }); tplDeps.push(await D(`${k}t`, k, "2026-12-30", { cap: 12, sold: 0, status: "OPEN" })); }
      const tpl = await B("Ftpl", { dep: tplDeps[0] ?? "", prod: "F1", status: "EXPIRED", channel: "WEB", adults: 1, created: "2026-12-01T03:00:00Z" });
      const own = { v: 1, productKind: "TRIP", currency: "THB", tax: { vatRegistered: true, pricesIncludeVat: true, invoiceOnEachPayment: true, cancelFeeVat: false, vatRateBp: 700 },
        totals: { grossSatang: 410_000, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: 60_000, vatSatang: vatIncl(350_000), payableSatang: 410_000 }, commission: null };
      // snapshot ของ seed ทั้งก้อน · ทับเฉพาะช่องใน totals/tax ที่ตัวคิดอ่าน (ขนาดใกล้ของจริง)
      await pool.query(`UPDATE "TripBooking" SET "policySnapshot" = $1::jsonb || jsonb_build_object('totals', COALESCE($1::jsonb->'totals', '{}'::jsonb) || $2::jsonb, 'tax', COALESCE($1::jsonb->'tax', '{}'::jsonb) || $3::jsonb, 'currency', 'THB', 'productKind', 'TRIP') WHERE id = $4`,
        [JSON.stringify(seedSnap?.s ?? {}), JSON.stringify(own.totals), JSON.stringify(own.tax), tpl]);
      const sel = async (table: string, over: Record<string, string>, alias: string) => (await cols(table)).map((c) => over[c.column_name] ?? `${alias}."${c.column_name}"`);
      const ins = async (table: string, over: Record<string, string>, alias: string, from: string, params: unknown[]) => {
        const cs = (await cols(table)).map((c) => `"${c.column_name}"`).join(", "); await pool.query(`INSERT INTO "${table}" (${cs}) SELECT ${(await sel(table, over, alias)).join(", ")} ${from}`, params); };
      await ins("TripDeparture", { id: `t.id || '_' || g || '_' || s`, localDate: `(DATE '2027-01-01' + g)`, startsAt: `((DATE '2027-01-01' + g)::timestamp + make_interval(hours => 1 + s * 5))`, endsAt: `((DATE '2027-01-01' + g)::timestamp + make_interval(hours => 5 + s * 5))`,
        cutoffAt: `((DATE '2027-01-01' + g)::timestamp + make_interval(hours => 1 + s * 5))`, capacity: "12", sold: "9" }, "t", `FROM "TripDeparture" t CROSS JOIN generate_series(0, 365) g CROSS JOIN generate_series(0, 1) s WHERE t.id = ANY($1::text[])`, [tplDeps]);
      const chan = `(ARRAY['WEB','LIFF','AGENT_PORTAL','COUNTER'])[((k - 1) % 4) + 1]`; const isAg = `((k - 1) % 4) = 2`; const paid = `(NOT ${isAg} AND k % 2 = 1)`;
      await ins("TripBooking", { id: `d.id || '_b' || k`, code: `'PF' || md5(d.id || '_' || k)`, publicTokenHash: `md5('pf' || d.id || '_' || k)`, productId: `d."productId"`, departureId: "d.id", travelDate: `d."localDate"`, channel: chan,
        agentAccountId: `CASE WHEN ${isAg} THEN 'pf-agent' ELSE NULL END`, collectMode: `CASE WHEN ${isAg} THEN 'AGENT' ELSE 'SHOP' END`, contactRoute: `CASE WHEN ${isAg} THEN 'VIA_AGENT' ELSE 'DIRECT' END`,
        status: `CASE WHEN ${paid} THEN 'PAID' ELSE 'CONFIRMED' END`, paidSatang: `CASE WHEN ${paid} THEN 410000 ELSE 0 END`, createdAt: `(d."startsAt" - make_interval(days => k * 3))`, updatedAt: `(d."startsAt" - make_interval(days => k * 3))` },
        "t", `FROM "TripDeparture" d CROSS JOIN generate_series(1, 9) k CROSS JOIN "TripBooking" t WHERE t.id = $1 AND d."unitId" = $2 AND d.id <> ALL($3::text[])`, [tpl, uP, tplDeps]);
      await ins("TripBookingItem", { id: `b.id || '_' || lower(ti.kind)`, bookingId: "b.id", departureId: `b."departureId"`, paxTypeId: `CASE WHEN ti."paxTypeId" IS NULL THEN NULL ELSE (SELECT pt.id FROM "TripPaxType" pt WHERE pt."productId" = b."productId" AND pt.code = 'ADULT' LIMIT 1) END` },
        "ti", `FROM "TripBooking" b CROSS JOIN "TripBookingItem" ti WHERE ti."bookingId" = $1 AND b."unitId" = $2 AND b.id <> $1`, [tpl, uP]);
      await pool.query(`INSERT INTO "TripCost" (id, "tenantId", "unitId", "departureId", kind, "amountSatang", note, "createdAt", "updatedAt") SELECT 'pc_' || d.id, d."tenantId", d."unitId", d.id, 'BOAT', 100000, NULL, $3::timestamp, $3::timestamp FROM "TripDeparture" d WHERE d."unitId" = $1 AND d.id <> ALL($2::text[])`, [uP, tplDeps, "2026-12-01 00:00:00"]);
      pfBuilt = true;
    } catch (e) { pfErr = e instanceof AssertFail ? e.message : errMsg(e); throw new AssertFail(`ฟิกซ์เจอร์ PF: ${pfErr}`); }
  };
  type Raw = { deps: number; bk: number; sales: number; pt: number; vat: number; collected: number; outstanding: number; cap: number; sold: number; cost: number; snap: number };
  let raw: Raw | null = null;
  await st("PF-1", "ฟิกซ์เจอร์ร้านใหญ่ (สร้างด้วย SQL ชุดเดียว · ตรวจจากแถวดิบ): 2,196 รอบ · 19,764 การจอง · snapshot ≥ 90% ของ snapshot ใหญ่สุดของ seed · sold ของทุกรอบ = Σ ที่นั่ง LIVE · เอเจนซี่จ่าย 0 · PAID จ่ายครบ", async () => {
    await buildPerf();
    raw = (await q<Raw>(`SELECT (SELECT count(*) FROM "TripDeparture" d WHERE d."unitId" = $1 AND d.id <> ALL($2::text[]))::int AS deps, count(*)::int AS bk,
      sum((b."policySnapshot"->'totals'->>'payableSatang')::bigint - b."passThroughSatang")::float8 AS sales, sum(b."passThroughSatang")::float8 AS pt, sum(b."vatSatang")::float8 AS vat, sum(b."paidSatang")::float8 AS collected,
      sum(CASE WHEN b."agentAccountId" IS NULL AND b.status = 'CONFIRMED' THEN (b."policySnapshot"->'totals'->>'payableSatang')::bigint ELSE 0 END)::float8 AS outstanding,
      (SELECT sum(capacity) FROM "TripDeparture" d WHERE d."unitId" = $1 AND d.id <> ALL($2::text[]))::int AS cap, (SELECT sum(sold) FROM "TripDeparture" d WHERE d."unitId" = $1 AND d.id <> ALL($2::text[]))::int AS sold,
      (SELECT sum("amountSatang") FROM "TripCost" c WHERE c."unitId" = $1)::float8 AS cost, min(pg_column_size(b."policySnapshot"))::int AS snap
      FROM "TripBooking" b WHERE b."unitId" = $1 AND b.status = ANY($3::text[])`, [uP, tplDeps, LIVE]))[0] ?? null;
    ok(raw, "อ่านแถวดิบไม่ได้"); eq([raw?.deps, raw?.bk, raw?.cap, raw?.sold], [2196, 19_764, 26_352, 19_764], "จำนวน");
    ok(Number(raw?.snap) * 10 >= Number(seedSnap?.n ?? 1e9) * 9, `snapshot ${raw?.snap} ไบต์ < 90% ของ seed ${seedSnap?.n}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripDeparture" d WHERE d."unitId" = $1 AND d.sold <> COALESCE((SELECT sum(i.qty) FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" JOIN "TripPaxType" pt ON pt.id = i."paxTypeId" WHERE i."departureId" = d.id AND i.kind = 'SEAT' AND pt."countsCapacity" AND b.status = ANY($2::text[])), 0)`, [uP, LIVE]))[0]?.n, 0, "sold");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "unitId" = $1 AND (("agentAccountId" IS NOT NULL AND "paidSatang" > 0) OR (status = 'PAID' AND "paidSatang" <> 410000))`, [uP]))[0]?.n, 0, "การจ่าย");
    console.log(`     ℹ️ snapshot ต่อการจอง ${raw?.snap} ไบต์ · ${raw?.bk} การจอง`);
  });
  await st("PF-2", "366 วัน (OWNER · ฐานวันเดินทาง): ยอดรวม = แถวดิบ (ยอดขาย · เก็บแทน · VAT · รับแล้ว · ค้างรับ · ต้นทุน · ความจุ · ขาย · อัตราเต็ม 7500) · 2,196 รอบ · pageCount 44 · หน้า 44 = 46 แถว · หน้า 45 = 0 แถว · เวลา > 20 วิ = แดง · > 5 วิ = เตือน (D3)", async () => {
    await buildPerf(); ok(raw, "ต้องรัน PF-1 ก่อน"); const t0 = Date.now(); const vm = await repVM("oa", Y366, uP); const ms = Date.now() - t0;
    console.log(`     ${ms > 5000 ? "⚠️" : "⏱"} 366 วัน ${ms} ms${ms > 5000 ? " (เกิน 5 วิ — คำเตือน)" : ""}`);
    ok(ms <= 20_000, `โหลด 366 วัน ${ms} ms เกิน 20 วิ`);
    eq(pick(T(vm), ["departures", "bookings", "salesSatang", "passThroughSatang", "vatSatang", "collectedSatang", "outstandingSatang", "costSatang", "capacity", "sold", "loadFactorBp"]),
      [raw?.deps, raw?.bk, raw?.sales, raw?.pt, raw?.vat, raw?.collected, raw?.outstanding, raw?.cost, raw?.cap, raw?.sold, 7500], "ยอดรวม");
    eq([asRec(vm.departures)?.pageCount, depRows(vm).length, depRows(await repVM("oa", { ...Y366, page: 44 }, uP)).length, depRows(await repVM("oa", { ...Y366, page: 45 }, uP)).length], [44, 50, 46, 0], "หน้า");
  });
  await st("PF-3", "จำนวนคำสั่ง SQL ต่อการโหลด (นับจาก event query ของ Prisma): ≤ 12 ทุกแท็บ + ฐานวันจอง · 31 วัน = 366 วัน (ไม่ขึ้นกับจำนวนรอบ/การจอง) · ค่าตั้ง VAT อ่านครั้งเดียวต่อการโหลด (คำสั่งที่แตะ SettingValue = ของ resolveSettings 1 ครั้ง · D3) · ผู้ไม่เห็นต้นทุนไม่อ่าน TripCost · ไม่มีคำสั่งที่ดึง policySnapshot ทั้งก้อน", async () => {
    await buildPerf(); const bad: string[] = []; const ns: string[] = [];
    for (const input of [{ tab: "sales" }, { tab: "load" }, { tab: "lead" }, { tab: "channel" }, { basis: "booked" }] as Rec[]) {
      const big = await measure(() => rep("oa", { ...Y366, ...input }, uP)), small = await measure(() => rep("oa", { from: "2027-03-01", to: "2027-03-31", ...input }, uP));
      ns.push(`${fmt(input)} ${big.n}/${small.n} (${big.ms} ms)`); if (big.n > 12 || big.n !== small.n || asRec(big.r)?.ok !== true) bad.push(`${fmt(input)}: 366 วัน ${big.n} · 31 วัน ${small.n} · ok ${asRec(big.r)?.ok}`);
      const sv = big.sql.filter((x) => /"SettingValue"/.test(x)).length; if (sv !== settingsBase) bad.push(`${fmt(input)}: แตะ SettingValue ${sv} คำสั่ง (resolveSettings ครั้งเดียว = ${settingsBase})`);
      if (big.sql.some((x) => /"policySnapshot"(?!\s*->)/.test(x) && /"TripBooking"/.test(x))) bad.push(`${fmt(input)}: ดึง policySnapshot ทั้งก้อน`);
    }
    const rvq = await measure(() => rep("rl", Y366, uA)); if (rvq.sql.some((s) => /"TripCost"/.test(s))) bad.push("ผู้ไม่เห็นต้นทุนอ่าน TripCost");
    console.log(`     ℹ️ คิวรี (366/31 วัน): ${ns.join(" · ")}`); ok(bad.length === 0, bad.join(" · "));
  });
  await st("PF-4", "CSV 366 วัน (D2): 2,000 แถวข้อมูล (TRIPS_REPORT_CSV_CAP) · ไฟล์ = หัว + 2,000 แถวเท่านั้น (บรรทัดสุดท้ายเป็นแถวข้อมูล) · ผล truncated true total 2196 · ชื่อไฟล์ …-partial.csv · audit rows 2000 total 2196 truncated true", async () => {
    await buildPerf(); const v = V(await exp("oa", Y366, uP), "export 366"); const ls = lines(String(v.csv));
    eq([v.rows, v.total, v.truncated, v.filename, ls.length], [2000, 2196, true, "trips-report-2027-01-01-2028-01-01-partial.csv", 1 + 2000], "ผล");
    ok(/^\d{4}-\d{2}-\d{2}$/.test(cells(ls[ls.length - 1] ?? "")[0] ?? "") && cells(ls[ls.length - 1] ?? "").length === CSV_COLS.length + CSV_COST_COLS.length, `บรรทัดสุดท้ายไม่ใช่แถวข้อมูล: ${(ls[ls.length - 1] ?? "").slice(0, 80)}`);
    eq((await q<{ after: Rec }>(`SELECT after FROM "AuditLog" WHERE action = $1 AND "unitId" = $2`, [A_EXP, uP])).map((x) => pick(asRec(x.after) ?? {}, ["rows", "total", "truncated"])), [[2000, 2196, true]], "audit");
  });
  await st("PF-5", "แบ่งหน้าที่เรนเดอร์จริง (หน้า 2 จาก 44): \"หน้า 2 จาก 44\" · ลิงก์ก่อนหน้า/ถัดไป = page 1 / 3 คงช่วงและแท็บ · หน้า 1 ไม่มีลิงก์ก่อนหน้า · หน้า 44 ไม่มีลิงก์ถัดไป · 50 แถวต่อหน้า", async () => {
    await buildPerf(); const bad: string[] = [];
    const h2 = screenR(await repVM("oa", { ...Y366, page: 2 }, uP));
    if (!txtOf(h2, "trips-rp-page").includes("2") || !txtOf(h2, "trips-rp-page").includes("44")) bad.push(`ป้ายหน้า "${txtOf(h2, "trips-rp-page")}"`);
    for (const [id, pg0] of [["trips-rp-page-prev", 1], ["trips-rp-page-next", 3]] as const) { const hh = hrefOf(h2, id); const qq = hh ? asRec(pure("reportQueryOf", queryOfHref(hh))) ?? {} : {}; if ((qq.page ?? 1) !== pg0 || qq.from !== Y366.from || qq.to !== Y366.to) bad.push(`${id}: ${hh}`); }
    if (!h2.includes('data-testid="trips-rp-dep-49"') || h2.includes('data-testid="trips-rp-dep-50"')) bad.push("50 แถว");
    if (hrefOf(screenR(await repVM("oa", Y366, uP)), "trips-rp-page-prev")) bad.push("หน้า 1 มีก่อนหน้า"); if (hrefOf(screenR(await repVM("oa", { ...Y366, page: 44 }, uP)), "trips-rp-page-next")) bad.push("หน้า 44 มีถัดไป");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("PF-6", "เพดานรอบ: เพิ่มรอบไม่มีการจองจนเกิน 4,000 ในช่วง ⇒ loadTripReportVM และ exportTripReportCsv ⇒ REPORT_TOO_LARGE (ไม่ตัดเงียบ · ไม่ throw) · ช่วง 31 วันยังโหลดได้", async () => {
    await buildPerf(); const cs = (await cols("TripDeparture")).map((c) => c.column_name);
    const over: Record<string, string> = { id: `t.id || '_x' || g`, localDate: `(DATE '2027-01-01' + (g % 366))`, startsAt: `((DATE '2027-01-01' + (g % 366))::timestamp + make_interval(hours => 10, mins => g))`, endsAt: `((DATE '2027-01-01' + (g % 366))::timestamp + make_interval(hours => 12, mins => g))`, cutoffAt: `((DATE '2027-01-01' + (g % 366))::timestamp + make_interval(hours => 10, mins => g))`, sold: "0" };
    await pool.query(`INSERT INTO "TripDeparture" (${cs.map((c) => `"${c}"`).join(", ")}) SELECT ${cs.map((c) => over[c] ?? `t."${c}"`).join(", ")} FROM "TripDeparture" t CROSS JOIN generate_series(1, 1805) g WHERE t.id = $1`, [tplDeps[1]]);
    codeR(await rep("oa", Y366, uP), "REPORT_TOO_LARGE", "ตัวโหลด"); codeR(await exp("oa", Y366, uP), "REPORT_TOO_LARGE", "ส่งออก");
    eq((await rep("oa", { from: "2027-03-01", to: "2027-03-31" }, uP)).ok, true, "31 วัน");
  });
  await st("PF-7", "D5 ตัวเลือกสินค้าเกิน 200: หน่วยร้านใหญ่มี 201 สินค้า ⇒ vm.products 200 รายการ (เรียงชื่อ) · productsTotal 201 · productsTruncated true · จอมี trips-rp-product-truncated = \"แสดงสินค้า 200 จาก 201 รายการ (เรียงตามชื่อ)\"", async () => {
    await buildPerf(); const cs = (await cols("TripProduct")).map((c) => c.column_name);
    const over: Record<string, string> = { id: `t.id || '_p' || g`, slug: `t.slug || '-p' || g`, title: `jsonb_build_object('th', 'ร้านใหญ่ ส' || lpad(g::text, 3, '0'), 'en', 'Big S' || lpad(g::text, 3, '0'))` };
    await pool.query(`INSERT INTO "TripProduct" (${cs.map((c) => `"${c}"`).join(", ")}) SELECT ${cs.map((c) => over[c] ?? `t."${c}"`).join(", ")} FROM "TripProduct" t CROSS JOIN generate_series(1, 198) g WHERE t.id = $1`, [PRD.F1?.id]);
    const vm = await repVM("oa", { from: "2027-03-01", to: "2027-03-31" }, uP);
    eq([asArr(vm.products).length, vm.productsTotal, vm.productsTruncated], [200, 201, true], "ตัวเลือก");
    eq(txtOf(screenR(vm), "trips-rp-product-truncated"), String(PINNED["report.products.truncated"]).replace("{shown}", "200").replace("{total}", "201"), "ข้อความบนจอ");
  });
  groupLine("PF");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); await cleanupRate(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { await qcPrisma.$disconnect(); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การกดจริง (ผู้คุม · scripts/visual-trips.mts t1.7a2): 1440 + 390 ไม่ล้น · ตัวกรองใช้ได้เมื่อปิด JavaScript · ส่งออกไฟล์แล้วเปิดใน Excel/Numbers ภาษาไทยไม่เพี้ยน · ไฟล์ถูกตัดมีบรรทัดแจ้งท้าย · จอรายงาน/จอต้นทุนภาษาอังกฤษ · MONEY_UNAVAILABLE บนจอจริง (ร้านชั่วคราวของผู้คุม)`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.7a2 · รายงานทัวร์ตามช่วงเวลา · CSV · ความเร็ว =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
