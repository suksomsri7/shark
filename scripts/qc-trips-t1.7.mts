// QC — TRIPS T1.7a1 · เงินระดับรอบ: ต้นทุนรอบ · กำไรขั้นต้น · การ์ดเงินแผงรอบ · จอ/ตัวแก้ต้นทุน · คีย์สิทธิ์ 3 ตัว (ภาพ 11 :56–:57)
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.7.md (T1.7a1 · มติผู้คุม N1–N12 รวมในเนื้อแล้ว) · รายงาน/CSV/ช่วงใหญ่ = T1.7a2 (ร่างข้อสอบ scripts/qc-trips-t1.7a2.draft.txt)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน: ฟิกซ์เจอร์ภาพ 11 คิดซ้ำ · ตาราง · snapshot จริงมีบล็อก tax · W22 ไม่มีตัวเลขต้นทุน · ฟิกซ์เจอร์สอดคล้องกันเองจากแถวดิบ)
//   S ไฟล์/กติกาโค้ด/ข้อความที่ตรึง   P ตัวช่วยบริสุทธิ์ report-core   CT บริการต้นทุน (สิทธิ์ · CAS · ส่งซ้ำ · พร้อมกัน · อินพุตอันตราย · แยกหน่วย/ร้าน · audit)
//   PN การ์ดเงินแผงรอบ + departureMoneySummary (ภาพ 11 · NO_SHOW · รอคืนเงิน · ไม่จด VAT · VAT ไม่ระบุ · เหมาลำ · คำเตือน · seed)   RC กระทบยอด   LK การรั่วของต้นทุน
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ = ด่านภาพ + กดจริงผ่าน Next ของผู้คุม (scripts/visual-trips.mts t1.7)
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t17-*` (ผู้ใช้ `trips-t17-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว (ค่าคาดหวังคิดซ้ำจากแถวดิบ)
// 🔴 นาฬิกา: บริการได้ `now` ที่ฉีดเท่านั้น · ไม่เทียบนาฬิกาฐานข้อมูล · createdAt ฝังค่าตายตัว
// 🔴 ฟิกซ์เจอร์ที่ระบบวันนี้ยังสร้างเองไม่ได้ (ใบสั่ง §13 · N12): TRAVELLED/NO_SHOW (T1.5) · การจองค้างในรอบยกเลิก (T1.6) · การจองเอเจนซี่ (A1.4 · จ่าย 0 เสมอ) · OTA · แถว snapshot เสียโดยเจตนา (1 แถว)
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.7.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.7a1: PC เขียว · S-12/S-18/S-20 เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";
import { fromMainMerge, TRIPS_MAIN_MERGE_SHA } from "./trips-main-merge.mjs";

const LABEL = "qc-trips-t1.7";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t1.4) ═══════════════
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
  const mine = cks.filter((c) => c.id.replace(/-\d+$/, "") === g);
  console.log(`  ── สรุป ${g}: ผ่าน ${mine.filter((c) => c.res === "PASS").length}/${mine.length}`);
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
const rid = (p: string) => `t17qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t17-";
const EMAIL_PREFIX = "trips-t17-";
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
/** ปัดครึ่งออกจากศูนย์ แบบ money-math divHalfUp (คิดซ้ำอิสระด้วย BigInt) */
const Z = BigInt(0), TWO = BigInt(2);
const halfUp = (num: bigint, den: bigint): number => { const neg = (num < Z) !== (den < Z); const a = num < Z ? -num : num; const b = den < Z ? -den : den; const q = (TWO * a + b) / (TWO * b); return Number(neg ? -q : q); };
const vatIncl = (x: number) => halfUp(BigInt(x) * BigInt(700), BigInt(10_700));


// ═══════════════ สเปก (ใบสั่ง T1.7a1) ═══════════════
const BASE_SHA = "dff33c6262a21ad5f3e46eff1847d696eb0c2f05"; // draft commit ของ T1.7 (= session/trips @c3650f79c + ร่างรอบ 0) — ORACLE-EDIT ผู้คุม 19 พ.ย.
const APP = "src/app/app/u/[unitSlug]/trips";
const COST_PAGE = `${APP}/departures/[departureId]/costs/page.tsx`;
const MOD = "src/lib/modules/trips/";
const PURE = MOD + "report-core.ts";
const COSTS = MOD + "costs.ts";
const ACTIONS = MOD + "cost-actions.ts";
const OWN_MOD = [PURE, COSTS, ACTIONS];
const COMP = "src/components/trips";
const PANEL = `${COMP}/DeparturePanel.tsx`;
const PERMS = "src/lib/core/permissions.ts";
const FACADE_FNS = ["loadDepartureCostsVM", "saveDepartureCosts", "departureMoneySummary", "bookingMoneyOf", "sumMoney", "profitOf", "loadFactorBp", "channelGroupOf", "departureReportStateOf",
  "charterLikeOf", "costAccessOf", "parseCostRows", "costRowsFromForm", "costContentKey"];
const FACADE_CONSTS = ["TRIP_COST_KINDS", "TRIP_COST_ROWS_MAX", "TRIP_COST_AMOUNT_MAX", "TRIP_COST_NOTE_MAX", "REPORT_LIVE_STATUSES", "REPORT_PENDING_STATUSES", "MONEY_COUNTED", "CHANNEL_GROUPS",
  "DEPARTURE_REPORT_STATES", "MONEY_WARNING_CODES"];
const COST_KINDS = ["BOAT", "FUEL", "GUIDE", "FOOD", "PARK_FEE", "TRANSPORT", "EQUIPMENT", "OTHER"];
const LIVE = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const OPEN_REFUND = ["REQUESTED", "QUOTED", "APPROVED", "EXECUTING", "FAILED"];
const DEP_STATES = ["UPCOMING", "ENDED", "CANCELLED"];
const WARN_CODES = ["PARK_FEE_WITH_PASS_THROUGH", "SUPPLIER_COSTS_NOT_INCLUDED", "SNAPSHOT_FALLBACK", "FX_BOOKINGS", "VAT_STATUS_UNKNOWN", "OTA_FEES_NOT_INCLUDED"];
const NEW_PERMS = ["trips.report.view", "trips.cost.view", "trips.cost.edit"];
/** ORACLE-EDIT รอบ 3 (มติ U4 · U6 — รูปที่ผู้เขียนข้อสอบเลือก): ผลผิดของ costRowsFromForm = { ok:false, code, row, field: "kind"|"amount"|"note" }
 *  หมายเหตุมีอักขระควบคุม/bidi/มองไม่เห็น ⇒ code "COST_NOTE_INVISIBLE" (errors.COST_NOTE_INVISIBLE th = ข้อความเฉพาะ) · ชนิดผิด ⇒ INVALID_INPUT field "kind" · หมายเหตุยาวเกิน ⇒ INVALID_INPUT field "note" */
const NOTE_CODE = "COST_NOTE_INVISIBLE";
const COST_KEY_RE = /^(commission\w*|cost\w*|grossProfit\w*|margin\w*|perSeat\w*|byKind)$/;
/** ข้อความที่ข้อสอบตรึง (ใบสั่ง §8 · N2 N7 N8 N11) */
const PINNED: Record<string, string> = {
  "departures.money.mgmt": "ตัวเลขบริหาร ไม่ใช่รายงานบัญชี", "costs.mgmt": "ตัวเลขบริหาร ไม่ใช่รายงานบัญชี",
  "costs.accounting": "ระบบยังไม่ลงบัญชีให้ — เอกสารภาษีให้ใช้ที่ร้านออกในระบบบัญชี",
  "departures.money.vat": "VAT ในราคาขาย (ประมาณ) — ไม่ใช่ยอดยื่น ภ.พ.30", "costs.breakdown.vat": "VAT ในราคาขาย (ประมาณ) — ไม่ใช่ยอดยื่น ภ.พ.30",
  "departures.money.estimate": "ประมาณการ — ยังไม่ปิดทริป", "costs.estimate": "ประมาณการ — ยังไม่ปิดทริป",
  "costs.editor.vatNote.registered": "ร้านจด VAT: ใส่ยอดไม่รวม VAT ที่ขอคืนได้ — ตรวจกับนักบัญชีของร้าน",
  "costs.editor.vatNote.notRegistered": "ร้านไม่ได้จด VAT: ใส่ยอดที่จ่ายจริง — ตรวจกับนักบัญชีของร้าน",
  "costs.kpi.revenue": "รายได้ก่อน VAT", "costs.kpi.revenueNoVat": "รายได้",
  // ORACLE-EDIT รอบ 2 (มติ Q14): agentCollect ย้ายไปตรวจใน R-14 (ต้นข้อความเดิม + "ยังไม่นับในรับแล้ว/ค้างรับ") · noShowUnpaid ลงท้าย "การจอง" · split · saving
  "departures.money.pendingRefund": "รอคืนเงิน {n} การจอง {amount}",
  "departures.money.noShowUnpaid": "ลูกค้าไม่มาและยังไม่จ่ายครบ {n} การจอง", "costs.charter": "รอบเหมาลำ — อัตราเต็มไม่สะท้อนการขายรายที่นั่ง",
  "costs.breakdown.split": "เงินที่แยกไว้ (ไม่อยู่ในกำไร)", "costs.editor.saving": "กำลังบันทึก…",
  "errors.COST_AMOUNT_FORMAT": "พิมพ์ยอดเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง",
};
// ORACLE-EDIT S-9 (ผู้คุม 19 พ.ย.): เดิมห้ามสตริงย่อย "งบ" ทุกที่ ⇒ ชนกับข้อความที่ S-10 ตรึงเอง ("ลงบัญชี" มี ง+บ) และคำปกติอย่าง "กำลังบันทึก"
//   เจตนาเดิมคง: ห้ามอ้างงบการเงิน/งบบัญชีทุกรูป — คำบัญชีเป็นสตริงย่อยตรงตัว · "งบ" เป็นคำ: ตัดคำด้วย Intl.Segmenter("th") แล้วห้าม ง+บ ที่อยู่ในคำเดียวกัน
//   (งบ · ของงบ · ดูงบ · งบดุล · งบประมาณ ⇒ ผิด · ลง|บัญชี · กำลัง|บันทึก ⇒ ไม่ผิด เพราะ ง เป็นตัวสะกดของคำก่อน)
const FORBIDDEN_WORDS = ["งบการเงิน", "งบกำไรขาดทุน", "งบดุล", "รายได้รับรู้", "กำไรสุทธิ", "POS"];
const TH_WORDS = new Intl.Segmenter("th", { granularity: "word" });
/** คำต้องห้ามตัวแรกที่พบ (ไม่พบ ⇒ null) */
const forbiddenHit = (v: string): string | null =>
  FORBIDDEN_WORDS.find((w) => v.includes(w)) ?? ([...TH_WORDS.segment(v)].find((s) => s.segment.includes("งบ"))?.segment ?? null);
const TESTIDS_FIXED = ["trips-dep-money", "trips-dep-money-detail", "trips-dep-money-vat", "trips-dep-money-estimate", "trips-dep-money-mgmt", "trips-dep-money-agent", "trips-dep-money-pending-refund",
  "trips-dep-money-noshow", "trips-dep-costs", "trips-cost", "trips-cost-back", "trips-cost-title", "trips-cost-state", "trips-cost-estimate", "trips-cost-mgmt", "trips-cost-accounting-note", "trips-cost-kpis",
  "trips-cost-kpi-sales", "trips-cost-kpi-revenue", "trips-cost-kpi-commission", "trips-cost-kpi-cost", "trips-cost-kpi-profit", "trips-cost-kpi-load", "trips-cost-charter", "trips-cost-breakdown", "trips-cost-vat-line",
  "trips-cost-editor", "trips-cost-rows", "trips-cost-readonly", "trips-cost-add", "trips-cost-save", "trips-cost-conflict", "trips-cost-error", "trips-cost-vat-note", "trips-cost-channels"];
const TESTID_PATTERNS = ["trips-dep-money-warn-", "trips-cost-row-", "trips-cost-remove-", "trips-cost-warn-"];
const I18N_REQUIRED = [...Object.keys(PINNED), "costs.title", "costs.back", ...COST_KINDS.map((k) => `costs.kind.${k}`), ...DEP_STATES.map((k) => `costs.state.${k}`),
  ...["sales", "commission", "cost", "perSeat", "profit", "load"].map((k) => `costs.kpi.${k}`),
  ...["sales", "revenue", "commission", "commissionWithVat", "cost", "profit", "passThrough", "collected", "outstanding", "retained"].map((k) => `costs.breakdown.${k}`),
  ...["kind", "amount", "note", "add", "remove", "save", "saved", "limit", "reload"].map((k) => `costs.editor.${k}`), "costs.conflict", "costs.empty", "costs.readOnly", "costs.channels.title",
  ...WARN_CODES.map((k) => `costs.warn.${k}`), ...["sales", "detail", "noCost", "costs"].map((k) => `departures.money.${k}`), ...["COST_ROWS_LIMIT", "COST_AMOUNT_INVALID", "STATE_CONFLICT"].map((k) => `errors.${k}`)];
const RAW_CODES = new Set([...DEP_STATES, ...COST_KINDS, "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "CHAT_AI", "COUNTER", "LIVE", "EXCLUDED", "PENDING_REFUND", "NOT_REGISTERED", "REGISTERED", ...WARN_CODES]);
const VISUAL_SCENES = ["panel-money", "departure-costs", "departure-costs-forbidden"];
/** ไฟล์เดิมที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
// ORACLE-EDIT รอบ 2 (มติ Q5): src/lib/staff/service.ts ≤ +6/−0
const LIMITED: [string, number, number | null][] = [["src/lib/staff/service.ts", 0, 4] /* ORACLE-EDIT รอบ 3 (U1): ไม่เกิน +4 ที่มีอยู่ */, ["src/lib/staff/levels.ts", 0, 2] /* ORACLE-EDIT รอบ 3 (U1) */, [MOD + "index.ts", 0, null], [MOD + "departure-screens.ts", 3, 30], [PANEL, 8, 50], [`${COMP}/ProductsScreenParts.tsx`, 3, null], [PERMS, 0, 6],
  ["src/messages/th/trips.json", 2, null], ["src/messages/en/trips.json", 2, null], ["scripts/trips-ui-inventory.json", 4, null], ["scripts/visual-trips.mts", 30, null], ["scripts/parity-trips.sh", 4, null]];
const LIMITED_SET = new Set(LIMITED.map(([f]) => f));
/** ORACLE-EDIT รอบ 2 (ผู้คุม): ข้อสอบเดิมที่ผู้คุมแก้ในใบนี้ (b77b3b0a6) — ไม่นับเป็นการแตะของ builder (BASE ต้องคงก่อน commit ของ builder) */
const ORACLE_EDITS = ["scripts/qc-trips-t1.1.mts", "scripts/qc-trips-t1.2.mts"];
// seed / ภาพ 11
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const U0 = FX.SHOP_DIVE.units.trips.id;
const SEED = { tenantId: DIVE_TENANT, actorUserId: "tripsqc-user-dive-owner" };
const AS_OF = new Date(FX.TRIPS_AS_OF);
const R14 = FX.DEPARTURE_RACHA_1114;
// ร้านชั่วคราว · นาฬิกาฉีด
const NOW_R = new Date("2027-04-15T05:00:00.000Z"); // หลังรอบ 10–14 เม.ย. จบ
const ADULT = 350_000, CHILD = 245_000, PARK_A = 60_000, PARK_C = 30_000;
const COST_NUMS = [2_150_000, 2_150_782, 409_500, 143_333, 1_200_000, 50_000_000]; // ตัวเลขต้นทุน/กำไร/คอมฯ ที่ต้องไม่หลุดไปถึงผู้ไม่มีสิทธิ์
const hasNum = (s: string, ns: number[]) => ns.filter((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(s));

// ═══════════════ pg ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 30 });
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
const tenantIds: string[] = [];
type Ctx = { tenantId: string; actorUserId: string };


// ═══════════════ main ═══════════════
let exitCode = 1;
try {
  try {
    const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
    if (stale.length) { console.log(`  🧹 กวาดร้านค้าง ${stale.length}`); await cleanupTenants(stale); }
    await cleanupUsers();
  } catch (e) { console.log(`  ⚠️ กวาดค้าง: ${errMsg(e)}`); }

  const TRI = await tryImport("@/lib/modules/trips");
  const TR = TRI.mod;
  const SETI = await tryImport("@/lib/core/settings");
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.7a1 ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const pure = (name: string, ...a: unknown[]): unknown => fn(name)(...a);
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const VM = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  const codeR = (r: Rec, codes: string | string[], what: string) => { const cs = Array.isArray(codes) ? codes : [codes]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  const constOf = (name: string): unknown => { const v = needTrips()[name]; if (v === undefined) throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.7a1 ยังไม่สร้าง)`); return v; };
  const pick = (r: Rec, ks: string[]) => ks.map((k) => r[k]);
  /** สแกนทั้งต้นไม้: คีย์ต้นทุน/คอมฯ/กำไรต้องเป็น null (หรือไม่มี) */
  const costLeaks = (v: unknown, path = "vm"): string[] => {
    if (Array.isArray(v)) return v.flatMap((x, i) => costLeaks(x, `${path}[${i}]`));
    const r = asRec(v); if (!r) return [];
    return Object.entries(r).flatMap(([k, x]) => (COST_KEY_RE.test(k) && x !== null && x !== undefined && typeof x !== "boolean" && !(Array.isArray(x) && x.length === 0) ? [`${path}.${k}=${fmt(x)}`] : costLeaks(x, `${path}.${k}`)));
  };

  // ═══════════════ PC. ตัวควบคุม (ก่อนตั้งร้าน) ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ภาพ 11: ยอดจอง 50,400 = 13×3,500 + 2×2,450 · อุทยาน 8,400 · คอมฯ 4,095 = 3,150 + 945 · กำไรภาพ (รวม VAT) 24,805 = 50,400 − 21,500 − 4,095", () => {
    eq([R14.adults, R14.children, R14.capacity, R14.sold], [13, 2, 24, 15], "คน/ความจุ");
    eq(13 * ADULT + 2 * CHILD, R14.revenueSatang, "ยอดจอง"); eq(13 * PARK_A + 2 * PARK_C, R14.parkSatang, "อุทยาน");
    eq(R14.commission.ptdSatang + R14.commission.bluePlanetSatang, R14.commission.totalSatang, "คอมฯ");
    eq(R14.revenueSatang - R14.commission.totalSatang - R14.costSatang, R14.grossProfitSatang, "กำไรภาพ");
  });
  await st("PC-2", "คิดซ้ำอิสระ: VAT รวมราคา 7% ต่อการจอง รวม 329,718 · ก่อน VAT 4,710,282 · กำไรก่อน VAT 2,150,782 · ส่วนต่างกับภาพ = VAT พอดี · 4566 bp · 15/24 = 6250 · NO_SHOW รับ 300,000 จาก 700,000 ⇒ VAT 19,626", () => {
    const per = [945_000, 700_000, 1_400_000, 700_000, 945_000, 350_000].map(vatIncl);
    eq(per, [61_822, 45_794, 91_589, 45_794, 61_822, 22_897], "VAT ต่อการจอง");
    const vat = per.reduce((a, b) => a + b, 0); eq(vat, 329_718, "VAT รวม");
    const rev = R14.revenueSatang - vat; const gp = rev - R14.commission.totalSatang - R14.costSatang;
    eq([rev, gp, R14.grossProfitSatang - gp], [4_710_282, 2_150_782, vat], "กำไร");
    eq(halfUp(BigInt(gp) * BigInt(10_000), BigInt(rev)), 4566, "มาร์จิน"); eq(halfUp(BigInt(150_000), BigInt(24)), 6250, "อัตราเต็ม");
    eq(halfUp(BigInt(45_794) * BigInt(300_000), BigInt(700_000)), 19_626, "VAT ส่วน NO_SHOW");
  });
  await st("PC-3", "ตาราง TripCost ตรงที่ใบสั่งอ้าง (ไม่มี migration): 9 คอลัมน์ · CHECK kind 8 ค่า · amountSatang ≥ 0 · ดัชนี departureId · TripPaxType.countsCapacity มีจริง", async () => {
    eq((await cols("TripCost")).map((c) => c.column_name).sort(), ["amountSatang", "createdAt", "departureId", "id", "kind", "note", "tenantId", "unitId", "updatedAt"], "คอลัมน์");
    eq((await checkLits("TripCost", "kind")).sort(), [...COST_KINDS].sort(), "CHECK kind");
    ok((await q<{ i: string }>(`SELECT indexname AS i FROM pg_indexes WHERE tablename = 'TripCost'`)).some((r) => r.i === "TripCost_departureId_idx"), "ดัชนี");
    ok((await cols("TripPaxType")).some((c) => c.column_name === "countsCapacity"), "countsCapacity");
  });
  await st("PC-4", "ของเดิมที่ใบนี้ต่อยอด: pricing.ts รวม Σ TripCost ต่อรอบ (W22) · snapshot.ts ตั้ง tax.vatRegistered = registered !== false · facade มี loadDeparturePanelVM tripsPageGate outstandingOf moneyStateOf parseAmountSatang quoteTrips TRIP_REFUND_OPEN_STATUSES (= 5 สถานะเปิด) · booking-view-core มี amountProblemOf", async () => {
    const s = read(MOD + "pricing.ts");
    ok(/costSatang: costs\.reduce\(\(s, x\) => s \+ x\.amountSatang, 0\)/.test(s), "pricing.ts ไม่รวม amountSatang");
    ok(/vatRegistered: registered !== false/.test(read(MOD + "snapshot.ts")), "snapshot.ts tax.vatRegistered");
    for (const n of ["loadDeparturePanelVM", "tripsPageGate", "outstandingOf", "moneyStateOf", "parseAmountSatang", "quoteTrips"]) fn(n);
    eq([...(needTrips().TRIP_REFUND_OPEN_STATUSES as string[])].sort(), [...OPEN_REFUND].sort(), "สถานะคืนเงินเปิด");
    ok(/export function amountProblemOf/.test(read(MOD + "booking-view-core.ts")), "amountProblemOf");
    const mm = (await tryImport("@/lib/modules/trips/money-math")).mod;
    eq((mm?.mulDivHalfUp as AnyFn)(-1, 10_000, 20_000), -1, "ปัดครึ่งออกจากศูนย์");
  });
  await st("PC-5", "ตัวช่วยขอบเขต trips-main-merge: positive control (ไฟล์บน main ที่ TRIPS ไม่แตะ ⇒ true) · negative control (ไฟล์ของใบนี้ ⇒ false)", () => {
    const pos = ["src/lib/modules/kanban/", "src/lib/modules/crm/", "src/lib/modules/member/", "src/lib/"].flatMap((d) => git(["ls-tree", "-r", "--name-only", TRIPS_MAIN_MERGE_SHA, d]).split("\n").filter(Boolean).slice(0, 40))
      .find((f) => git(["diff", "--name-only", TRIPS_MAIN_MERGE_SHA, "--", f]).trim() === "" && git(["diff", "--name-only", BASE_SHA, "--", f]).trim() === "");
    ok(pos, "หาไฟล์ควบคุมบน main ไม่ได้");
    eq(fromMainMerge(ROOT, String(pos)), true, `positive ${pos}`);
    eq([fromMainMerge(ROOT, "ledger/trips-briefs/T1.7.md"), fromMainMerge(ROOT, PURE)], [false, false], "negative");
  });
  const seedDep = (await q<{ id: string }>(`SELECT d.id FROM "TripDeparture" d JOIN "TripProduct" p ON p.id = d."productId" WHERE d."tenantId" = $1 AND d."unitId" = $2 AND d."localDate" = $3::date AND p.slug = 'racha-yai-day-trip' ORDER BY d."startsAt" LIMIT 1`, [DIVE_TENANT, U0, R14.date]).catch(() => []))[0]?.id ?? "";
  const seedCounts = async () => (await q<Rec>(`SELECT (SELECT count(*) FROM "TripCost" WHERE "tenantId" = $1)::int AS c, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS b`, [DIVE_TENANT]))[0];
  const seedBefore = await seedCounts().catch(() => ({}));
  type RawMoney = { sales: number; pt: number; vat: number; commission: number; live: number };
  let seedRaw: RawMoney | null = null;
  await st("PC-6", "seed (อ่านอย่างเดียว · ความสมจริงของฟิกซ์เจอร์): การจองจริงของ seed ทุกใบมี snapshot.totals.payableSatang + tax.vatRegistered (boolean) · รอบราชา 14 พ.ย. คิดยอดจากแถวดิบได้ · ไม่มี TripCost ของ seed", async () => {
    ok(seedDep, "ไม่พบรอบราชา 14 พ.ย.");
    const bad = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = $1 AND (jsonb_typeof("policySnapshot"->'totals'->'payableSatang') IS DISTINCT FROM 'number' OR jsonb_typeof("policySnapshot"->'tax'->'vatRegistered') IS DISTINCT FROM 'boolean')`, [DIVE_TENANT]);
    eq(bad[0]?.n, 0, "snapshot ของ seed ที่ไม่มี totals/tax");
    seedRaw = (await q<RawMoney>(`SELECT COALESCE(sum((b."policySnapshot"->'totals'->>'payableSatang')::bigint - b."passThroughSatang"), 0)::float8 AS sales, COALESCE(sum(b."passThroughSatang"), 0)::float8 AS pt,
      COALESCE(sum(b."vatSatang"), 0)::float8 AS vat, COALESCE(sum(b."commissionSatang"), 0)::float8 AS commission, count(*)::int AS live FROM "TripBooking" b WHERE b."departureId" = $1 AND b.status = ANY($2::text[])`, [seedDep, LIVE]))[0] ?? null;
    ok(seedRaw && seedRaw.live >= 1 && seedRaw.sales > 0, `seed ไม่มีการจองที่นับ: ${fmt(seedRaw)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripCost" WHERE "departureId" = $1`, [seedDep]))[0]?.n, 0, "TripCost ของ seed");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์/กติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด ──");
  const compFiles = walk(COMP).filter((f) => /^Cost/.test(basename(f)));
  const ownFiles = [...OWN_MOD, COST_PAGE, ...compFiles];
  const needOwn = () => { const miss = [...OWN_MOD, COST_PAGE].filter((f) => !existsSync(join(ROOT, f))); ok(miss.length === 0, `ยังไม่มีไฟล์: ${miss.join(", ")}`); ok(compFiles.length > 0, "ยังไม่มีคอมโพเนนต์ Cost*"); };
  const th = asRec((() => { try { return JSON.parse(read("src/messages/th/trips.json")); } catch { return null; } })()) ?? {};
  const en = asRec((() => { try { return JSON.parse(read("src/messages/en/trips.json")); } catch { return null; } })()) ?? {};
  const flat = (o: Rec, p = ""): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (asRec(v) ? Object.entries(flat(asRec(v) ?? {}, `${p}${k}.`)) : [[`${p}${k}`, String(v)]])));
  const fth = flat(th), fen = flat(en);
  const mine = (f: Record<string, string>) => Object.entries(f).filter(([k]) => k.startsWith("costs.") || k.startsWith("departures.money."));
  await st("S-1", "ไฟล์ของใบมีครบ: report-core · costs · cost-actions · หน้า costs · คอมโพเนนต์ Cost*", () => needOwn());
  await st("S-2", `facade trips ส่งออก ${FACADE_FNS.length} ฟังก์ชัน + ${FACADE_CONSTS.length} ค่าคงที่ (บล็อก T1.7a1 · รายชื่อชัด ไม่มี export *)`, () => {
    const miss = [...FACADE_FNS.filter((n) => typeof needTrips()[n] !== "function"), ...FACADE_CONSTS.filter((n) => needTrips()[n] === undefined)];
    ok(miss.length === 0, `ยังไม่มี: ${miss.slice(0, 8).join(", ")}${miss.length > 8 ? ` …(+${miss.length - 8})` : ""}`);
    const idx = read(MOD + "index.ts");
    ok(/T1\.7/.test(idx) && !/export \* from "\.\/(report-core|costs)"/.test(idx), "index.ts ต้องมีบล็อก T1.7a1 แบบรายชื่อชัด");
  });
  await st("S-3", "report-core.ts บริสุทธิ์: import เฉพาะ ./money-math ./booking-view-core ./money-core (+ import type) · ไม่มี I/O · ไม่อ่านนาฬิกา", () => {
    needOwn(); const s = stripComments(read(PURE));
    const imps = [...s.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const bad = imps.filter((p) => !["./money-math", "./booking-view-core", "./money-core"].includes(p));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
    ok(!/Date\.now\(|new Date\(\s*\)|\.get(Day|Date|Hours|Month|FullYear)\(/.test(s), "อ่านนาฬิกา");
    ok(!/\bprisma\b|tenantDb|\$queryRaw|node:fs/.test(s), "มี I/O");
  });
  await st("S-4", "cost-actions.ts: \"use server\" · ส่งออกเฉพาะ saveDepartureCostsAction (async function) · requireUnit · assertCan + ForbiddenError · แปลงยอดด้วย costRowsFromForm · ไม่รับ/ไม่สร้างเวลา", () => {
    needOwn(); const raw = read(ACTIONS), s = stripComments(raw);
    ok(/^\s*["']use server["']/.test(raw), "ไม่มี \"use server\"");
    const exps = [...s.matchAll(/export\s+(async\s+function|function|const|let|class|type|interface|default)\s+(\w+)?/g)].map((m) => [m[1], m[2]]);
    eq(exps, [["async function", "saveDepartureCostsAction"]], "export");
    ok(/requireUnit\(/.test(s) && /assertCan\(/.test(s) && /ForbiddenError/.test(s), "requireUnit/assertCan/ForbiddenError");
    ok(/costRowsFromForm\(/.test(s), "ไม่ใช้ costRowsFromForm");
    ok(!/\bnow\s*[:=]/.test(s) && !/new Date\(/.test(s), "action รับ/สร้างเวลา");
  });
  await st("S-5", "สิทธิ์ใหม่ 3 คีย์ในบล็อก trips (report.view · cost.view · cost.edit) ป้ายไทยไม่ว่าง · ไม่มีคีย์ trips.cost/report อื่น", () => {
    const s = read(PERMS); const block = s.slice(s.indexOf('module: "trips"'), s.indexOf('module: "agency"'));
    for (const k of NEW_PERMS) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]{4,}"`).test(block), `ไม่มีคีย์ ${k}`);
    const extra = [...block.matchAll(/"(trips\.(?:cost|report)\.[\w.]+)"/g)].map((m) => m[1]).filter((k) => !NEW_PERMS.includes(k));
    ok(extra.length === 0, `คีย์เกิน: ${extra.join(", ")}`);
  });
  await st("S-6", "สิทธิ์ต้นทุนแคบ (N9): costs.ts/departure-screens.ts ตัดสินต้นทุนด้วย costAccessOf ไม่ใช่ can()/evaluate ของคีย์ trips.cost.* (ซึ่ง trips.* จะผ่าน)", () => {
    needOwn(); const s = stripComments(read(COSTS)) + stripComments(read(MOD + "departure-screens.ts"));
    ok(/costAccessOf\(/.test(s), "ไม่ใช้ costAccessOf");
    ok(!/\bcan(Any)?\(\s*\[?\s*["']trips\.cost\./.test(s) && !/action:\s*["']trips\.cost\./.test(s), "ตัดสิน trips.cost.* ด้วย can/evaluate");
    // ORACLE-EDIT S-6 (ผู้คุม 19 พ.ย.): regex เดิมหลบได้ด้วยค่าคงที่ (const K = "trips.cost.view"; g.can(K)) — ทางที่ builder ใช้กับ action ของ audit
    //   ⇒ ชื่อคีย์ trips.cost.view / trips.cost.edit (หรือคำนำ "trips.cost." ใดๆ นอกจาก action audit "trips.cost.saved") ห้ามมีในโค้ด trips ทุกไฟล์
    //   ยกเว้น report-core.ts ภายใน costAccessOf (ตัวตัดสินแคบตัวเดียว) และ cost-actions.ts (ด่านแรก assertCan ตามใบสั่ง §1 — บริการตัดสินซ้ำ)
    const COST_KEY_LIT = /trips\.cost\.(?!saved["'`])/g;
    const hitsOf = (src: string) => [...stripComments(src).matchAll(COST_KEY_LIT)].length;
    eq([hitsOf(`const K = "trips.cost.view"; g.can(K)`), hitsOf(`evaluate(m, { action: "trips.cost." + "edit" })`), hitsOf(`const A = "trips.cost.saved"; // trips.cost.view`)], [1, 1, 0], "ตัวควบคุมตัวจับ");
    const scope = [...walk("src/lib/modules/trips"), ...walk(COMP), ...walk(APP)].filter((f) => f !== PURE && f !== ACTIONS);
    const leak = scope.filter((f) => hitsOf(read(f)) > 0);
    ok(leak.length === 0, `ชื่อคีย์ต้นทุนนอกตัวตัดสินแคบ: ${leak.join(", ")}`);
    const pure0 = stripComments(read(PURE)); const ca = pure0.indexOf("export function costAccessOf"); const caEnd = pure0.indexOf("\n}", ca);
    ok(ca >= 0 && hitsOf(pure0.slice(0, ca)) + hitsOf(pure0.slice(caEnd)) === 0, "report-core อ้างคีย์ต้นทุนนอก costAccessOf");
  });
  await st("S-7", "หน้า costs/page.tsx: requireUnit → tripsPageGate(\"departures\") → loadDepartureCostsVM · ส่งลงคอมโพเนนต์เฉพาะ vm · notFound · TripsForbidden · ไม่ import prisma · ไม่มี 'use client'", () => {
    needOwn(); const s = stripComments(read(COST_PAGE));
    ok(/requireUnit\(/.test(s) && /tripsPageGate\(/.test(s) && /["']departures["']/.test(s) && /loadDepartureCostsVM\(/.test(s), "ด่าน/ตัวโหลด");
    ok(/notFound\(/.test(s) && /TripsForbidden/.test(s), "notFound/TripsForbidden");
    ok(!/@\/lib\/core\/db|@prisma\/client|\bprisma\./.test(s) && !/["']use client["']/.test(s), "prisma/use client");
    ok(!/loadDeparturePanelVM|departureMoneySummary|loadBookingListVM/.test(s), "หน้าโหลดข้อมูลอื่นนอกจาก VM ของจอ");
  });
  await st("S-8", "คอมโพเนนต์ Cost* + DeparturePanel: ไม่ import บริการ/ฐาน · ใช้ formatBaht · ไม่คิดเลขเงิน · เลือกข้อความตาม vatMode (vatNote ทั้ง 2 กรณี · revenue/revenueNoVat) · ไม่มีคำ POS", () => {
    needOwn(); const bad: string[] = [];
    for (const f of [...compFiles, PANEL]) {
      const s = stripComments(read(f));
      if (/from\s+["']@\/lib\/(core\/db|modules\/trips\/(costs|report-core|pricing|booking|money)[^"']*)["']/.test(s.replace(/import\s+type[^;]+;/g, ""))) bad.push(`${f}: import บริการ/ฐาน`);
      if (/\w+Satang\s*[-+*/](?!=)|[-+*/]\s*\w+\.\w+Satang\b|\.reduce\(/.test(s)) bad.push(`${f}: คิดเลขเงิน`);
      if (/\bPOS\b/.test(s.replace(/data-[\w-]+=/g, ""))) bad.push(`${f}: คำว่า POS`);
    }
    const all = compFiles.map((f) => read(f)).join("\n");
    ok(/formatBaht\(/.test(all) && /vatMode/.test(all), "ไม่มี formatBaht/vatMode");
    ok(/vatNote\.registered/.test(all) && /vatNote\.notRegistered/.test(all) && /revenueNoVat/.test(all), "ไม่เลือกข้อความตาม vatMode");
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-9", `ข้อความ costs.* departures.money.*: ไม่มีคำต้องห้าม (${FORBIDDEN_WORDS.join(" · ")} · คำ "งบ") · ไม่มีรหัสดิบ/รหัสใบงาน · อังกฤษไม่มีอักษรไทย · revenueNoVat ไม่มีคำ VAT`, () => {
    // ORACLE-EDIT S-9: ตัวควบคุมของตัวจับคำ (positive: ต้องจับ · negative: ต้องปล่อย — รวมข้อความที่ S-10 ตรึง)
    const mustHit = ["ไม่ใช่งบการเงิน", "ดูงบ", "ของงบ", "งบดุลของร้าน", "เป็นงบประมาณ", "งบ", "กำไรสุทธิ", "ใช้ POS"].filter((s) => forbiddenHit(s) === null);
    const mustPass = [PINNED["costs.accounting"], "กำลังบันทึก…", "บันทึกต้นทุนรอบ", "ส่งบันทึก", "ตรงบัญชี", "ยังไม่ลงบันทึก"].filter((s) => forbiddenHit(s) !== null);
    ok(mustHit.length === 0 && mustPass.length === 0, `ตัวจับคำผิด: ไม่จับ ${fmt(mustHit)} · จับเกิน ${fmt(mustPass)}`);
    const mt = mine(fth), me = mine(fen); ok(mt.length > 0, "ยังไม่มีข้อความของใบ");
    const bad = [...mt, ...me].filter(([, v]) => forbiddenHit(v) !== null || /\b[TAWKLSCX]\d\.\d+[a-z]?\d?\b|\bOQ\d+\b/.test(v) || v.split(/[^A-Z_0-9]+/).some((w) => RAW_CODES.has(w)));
    ok(bad.length === 0, `ข้อความต้องห้าม: ${fmt(bad.slice(0, 4))}`);
    ok(!me.some(([, v]) => /[฀-๿]/.test(v)), "อังกฤษมีอักษรไทย");
    ok(!/VAT/i.test(fth["costs.kpi.revenueNoVat"] ?? "VAT") && !/VAT/i.test(fen["costs.kpi.revenueNoVat"] ?? "VAT"), "revenueNoVat มีคำ VAT");
  });
  await st("S-10", `คีย์ขั้นต่ำ ${I18N_REQUIRED.length} คีย์ครบสองภาษา · ชุดคีย์ costs/departures.money เท่ากัน · ข้อความไทยที่ตรึง ${Object.keys(PINNED).length} คีย์ตรงตัวอักษร (N2 N7 N8 N11)`, () => {
    const miss = I18N_REQUIRED.filter((k) => !fth[k] || !fen[k]); ok(miss.length === 0, `ขาด ${miss.length}: ${miss.slice(0, 8).join(", ")}`);
    eq(mine(fth).map(([k]) => k).sort(), mine(fen).map(([k]) => k).sort(), "ชุดคีย์สองภาษา");
    const wrong = Object.entries(PINNED).filter(([k, v]) => fth[k] !== v); ok(wrong.length === 0, `ข้อความไม่ตรง: ${fmt(wrong.map(([k]) => [k, fth[k]]).slice(0, 3))}`);
  });
  await st("S-11", `testid ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length} อยู่ในซอร์ส · ทะเบียนปุ่ม wo T1.7a1 ครบ · needs = คีย์จริง`, () => {
    needOwn(); const src = [...compFiles, PANEL, COST_PAGE].map((f) => read(f)).join("\n");
    const miss = [...TESTIDS_FIXED.filter((t) => !src.includes(`"${t}"`) && !src.includes(`'${t}'`)), ...TESTID_PATTERNS.filter((p) => !src.includes(`\`${p}\${`))];
    ok(miss.length === 0, `ไม่พบ: ${miss.slice(0, 8).join(", ")}`);
    const inv = asRec((() => { try { return JSON.parse(read("scripts/trips-ui-inventory.json")); } catch { return null; } })()) ?? {};
    const rows = asArr(inv.rows).filter((r) => r.wo === "T1.7a1"); const ids = new Set(rows.map((r) => String(r.testid)));
    const missInv = [...TESTIDS_FIXED, ...TESTID_PATTERNS.map((p) => `${p}*`)].filter((t) => !ids.has(t)); ok(missInv.length === 0, `ทะเบียนปุ่มขาด: ${missInv.slice(0, 6).join(", ")}`);
    const permKeys = new Set([...read(PERMS).matchAll(/"(trips\.[\w.*]+)":/g)].map((m) => m[1]));
    ok(!rows.some((r) => String(r.needs ?? "").split("+").some((k) => k && !permKeys.has(k))), "needs ไม่ใช่คีย์จริง");
  });
  await st("S-12", `ฉากภาพ TRIPS_VISUAL_SPECS["t1.7"] = ${VISUAL_SCENES.join(" · ")} (mockup 11 · ฉากไม่มีสิทธิ์ใช้ผู้ใช้ seed ไกด์) · parity-trips.sh รับ 11`, () => {
    const s = read("scripts/visual-trips.mts"); ok(s.includes('"t1.7": ['), "ไม่มีกลุ่ม t1.7");
    const blk = s.slice(s.indexOf('"t1.7": ['), s.indexOf("],", s.indexOf('"t1.7": [')));
    for (const n of VISUAL_SCENES) ok(new RegExp(`name: "${n}", mockup: "11"`).test(blk), `ไม่มีฉาก ${n}`);
    ok(/name: "departure-costs-forbidden", mockup: "11", as: "dive-guide-mint"/.test(blk), "ฉากไม่มีสิทธิ์ต้องใช้ผู้ใช้ไกด์ของ seed");
    ok(/11-departures-calendar/.test(read("scripts/parity-trips.sh")), "parity-trips.sh ไม่รู้จักภาพ 11");
  });
  await st("S-13", `ขอบเขต (เทียบ BASE ${BASE_SHA.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips หรือ commit ฝั่ง main ที่รวมแล้ว) · ไฟล์จำกัดอยู่ในงบ · ไม่มี reports.ts/หน้า reports (a2)`, () => {
    needOwn();
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE ${BASE_SHA} ไม่เจอ`);
    const lit = (p: string) => `:(literal)${p}`;
    const atBase = (dir: string) => git(["ls-tree", "-r", "--name-only", BASE_SHA, `${dir}/`]).split("\n").filter(Boolean);
    const forbidden = ["prisma", ...atBase("src/lib/core").filter((f) => !LIMITED_SET.has(f)), ...atBase("src/lib/staff").filter((f) => !LIMITED_SET.has(f)) /* ORACLE-EDIT รอบ 2 (Q5) */, "src/lib/platform", "src/lib/payment", "src/app/api", "src/lib/outbox-consumers.ts", "src/lib/automation", "src/lib/webhooks",
      ...["pos", "account", "party", "approval", "hotel", "rooms", "booking", "dorm", "queue", "ticket", "agency", "supplier", "hr", "inventory"].map((m) => `src/lib/modules/${m}`),
      ...atBase("src/lib/modules/trips").filter((f) => !LIMITED_SET.has(f)), ...atBase(COMP).filter((f) => !LIMITED_SET.has(f)), ...atBase(APP),
      ...atBase("scripts").filter((f) => /^scripts\/(qc-trips-[\w.]+\.mts|probe-trips-[\w.-]+\.mts)$/.test(f) && f !== "scripts/qc-trips-t1.7.mts" && !ORACLE_EDITS.includes(f)), "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts",
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
    const newMod = git(["ls-files", "--others", "--exclude-standard", "--", lit("src/lib/modules/trips")]).split("\n").filter(Boolean).filter((f) => !OWN_MOD.includes(f));
    ok(newMod.length === 0, `ไฟล์โมดูลใหม่นอกรายการ: ${newMod.join(", ")}`);
    const newComp = git(["ls-files", "--others", "--exclude-standard", "--", lit(COMP)]).split("\n").filter(Boolean).filter((f) => !/^Cost/.test(basename(f)));
    ok(newComp.length === 0, `คอมโพเนนต์ใหม่ที่ไม่ขึ้นต้น Cost: ${newComp.join(", ")}`);
    const newRoutes = git(["ls-files", "--others", "--exclude-standard", "--", lit(APP)]).split("\n").filter(Boolean).filter((f) => f !== COST_PAGE);
    ok(newRoutes.length === 0, `route ใหม่นอกรายการ (รายงาน = a2): ${newRoutes.join(", ")}`);
  });
  await st("S-14", "วินัยการเขียน: costs.ts เขียนได้เฉพาะ TripCost + AuditLog · report-core ไม่เขียน · ไม่ส่ง outbox/event · ไม่มี console.*", () => {
    needOwn(); const c = stripComments(read(COSTS)), p = stripComments(read(PURE));
    const writesOf = (s: string) => [...s.matchAll(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/gi)].map((m) => m[1]).concat([...s.matchAll(/\b(trip[A-Z]\w*|auditLog)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(/g)].map((m) => m[1][0].toUpperCase() + m[1].slice(1)));
    const bad = [...writesOf(c).filter((t) => t !== "TripCost" && t !== "AuditLog"), ...writesOf(p)];
    ok(bad.length === 0, `เขียนตารางต้องห้าม: ${bad.join(",")}`);
    ok(!/outboxEvent|OutboxEvent|emitTx\(|publishEvent\(|enqueue\w*\(/.test(c), "ส่ง outbox/event");
    // ORACLE-EDIT S-14 รอบ 3 (มติ U2): catch ของสรุปเงินต้อง log ⇒ ยอม console.error ใน costs.ts เท่านั้น (report-core ยังห้ามทุกตัว)
    ok(!/console\.(log|info|debug|warn)\(/.test(c) && !/console\.(log|info|debug|warn|error)\(/.test(p), "มี console.* (ยอมเฉพาะ console.error ใน costs.ts)");
  });
  await st("S-15", "ไม่แตะระบบอื่น: ไฟล์ของใบไม่ import modules/{pos,account,hotel,rooms,dorm,approval,agency,supplier,hr} · @/lib/payment · ./pricing*", () => {
    needOwn(); const bad = ownFiles.filter((f) => /from\s*["']@\/lib\/modules\/(pos|account|hotel|rooms|dorm|approval|agency|supplier|hr)\b|from\s*["']@\/lib\/payment|from\s*["']\.\/pricing/.test(stripComments(read(f))));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
  });
  await st("S-16", "costs.ts: ไม่มี await ในลูป · ไม่มี .map(async · ไม่ใช้นาฬิกาฐานข้อมูล (now() CURRENT_* LOCALTIMESTAMP *_timestamp) · ล็อก pg_advisory_xact_lock(hashtext('trips.cost'), hashtext(…)) · sha256", () => {
    needOwn(); const c = stripComments(read(COSTS));
    ok(!/\.(map|forEach)\(\s*async/.test(c), ".map(async");
    const loops = [...c.matchAll(/\b(for|while)\s*\([^)]*\)\s*\{([^{}]|\{[^{}]*\})*\}/g)].map((m) => m[0]); ok(!loops.some((l) => /\bawait\b/.test(l)), "await ในลูป");
    ok(!/\bnow\(\)|CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP|statement_timestamp|clock_timestamp|transaction_timestamp/i.test(c), "นาฬิกาฐานข้อมูล");
    ok(/pg_advisory_xact_lock\(\s*hashtext\(\s*'trips\.cost'\s*\)\s*,\s*hashtext\(/.test(c) && /sha256/.test(c), "ล็อก/sha256");
  });
  await st("S-17", "ไม่มี any · @ts-ignore · @ts-expect-error ในไฟล์ของใบ", () => {
    needOwn(); const bad = ownFiles.filter((f) => /:\s*any\b|<any>|as any\b|@ts-ignore|@ts-expect-error/.test(stripComments(read(f)))); ok(bad.length === 0, bad.join(", "));
  });
  await st("S-18", "ไม่มี migration: prisma ตรงกับ BASE (ไม่มีไฟล์เปลี่ยน/untracked)", () => {
    ok(!git(["diff", "--name-only", BASE_SHA, "--", "prisma"]).trim() && !git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]).trim(), "prisma เปลี่ยน");
  });
  await st("S-19", "การ์ดเงินในแผงรอบ: DeparturePanel ใช้ trips-dep-money เมื่อ money ไม่ null และคง trips-dep-money-note เมื่อ null · ลิงก์ trips-dep-costs ผูก actions.costs", () => {
    const s = read(PANEL);
    ok(s.includes('"trips-dep-money"') && s.includes('"trips-dep-money-note"') && s.includes('"trips-dep-costs"') && /actions\.costs/.test(s), "แผงรอบยังไม่มีการ์ด/ลิงก์ตามใบสั่ง");
  });
  await st("S-20", "ไม่เพิ่มแท็บ/ไม่ทำรายงานในใบนี้: TRIPS_NAV_KEYS 6 ค่าเดิม · TripsNav.tsx DeparturesScreen.tsx ไม่เปลี่ยน · ไม่มี reports.ts", () => {
    ok(/TRIPS_NAV_KEYS = \["products", "departures", "bookings", "agents", "channels", "settings"\] as const/.test(read(`${COMP}/trips-shared.ts`)), "TRIPS_NAV_KEYS เปลี่ยน");
    ok(git(["diff", "--name-only", BASE_SHA, "--", `${COMP}/TripsNav.tsx`, `${COMP}/DeparturesScreen.tsx`]).trim() === "", "ไฟล์แถบ/ปฏิทินเปลี่ยน");
    ok(!existsSync(join(ROOT, MOD + "reports.ts")), "มี reports.ts (เป็นของ a2)");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (report-core) ──");
  const bm = (o: Rec): Rec => asRec(pure("bookingMoneyOf", { status: "CONFIRMED", collectMode: "SHOP", agentAccountId: null, channel: "WEB", seats: 0, payableSatang: 0, passThroughSatang: 0, vatSatang: 0,
    commissionSatang: 0, commissionVatSatang: 0, vatRegistered: true, paidSatang: 0, refundedSatang: 0, pendingRefund: false, retained: [], ...o })) ?? {};
  const MK = ["counted", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang", "collectedSatang", "outstandingSatang", "heldSatang", "agentCollect", "noShowUnpaid"];
  const B2 = { seats: 2, payableSatang: 820_000, passThroughSatang: 120_000, vatSatang: 45_794 };
  await st("P-1", "ค่าคงที่: ชนิดต้นทุน 8 · เพดาน 30/1e9/200 · LIVE 5 · รอ 2 · counted 4 · กลุ่มช่องทาง 3 (12 ช่องทาง) · สถานะรอบ UPCOMING/ENDED/CANCELLED (N7) · คำเตือน 6", () => {
    eq(constOf("TRIP_COST_KINDS"), COST_KINDS, "kinds"); eq([constOf("TRIP_COST_ROWS_MAX"), constOf("TRIP_COST_AMOUNT_MAX"), constOf("TRIP_COST_NOTE_MAX")], [30, 1_000_000_000, 200], "เพดาน");
    eq([constOf("REPORT_LIVE_STATUSES"), constOf("REPORT_PENDING_STATUSES"), constOf("MONEY_COUNTED")], [LIVE, ["HOLD", "PENDING"], ["LIVE", "CANCELLED", "PENDING_REFUND", "EXCLUDED"]], "สถานะ");
    eq(constOf("CHANNEL_GROUPS"), { DIRECT: ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "CHAT_AI"], AGENT: ["AGENT_PORTAL", "AGENT_LINK", "AGENT_API"], OTHER: ["OTA", "API", "IMPORT"] }, "กลุ่ม");
    eq([constOf("DEPARTURE_REPORT_STATES"), constOf("MONEY_WARNING_CODES")], [DEP_STATES, WARN_CODES], "สถานะรอบ/คำเตือน");
  });
  await st("P-2", "LIVE ร้านเก็บเงิน: PART_PAID 4 ผู้ใหญ่ จ่าย 500,000 ⇒ ยอดขาย 1,400,000 · VAT 91,589 · ก่อน VAT 1,308,411 · รับ 500,000 · ค้าง 1,140,000 (= outstandingOf) · จ่ายครบ ⇒ ค้าง 0", () => {
    eq(pick(bm({ status: "PART_PAID", seats: 4, payableSatang: 1_640_000, passThroughSatang: 240_000, vatSatang: 91_589, paidSatang: 500_000 }), MK),
      ["LIVE", 4, 1_400_000, 240_000, 91_589, 1_308_411, 0, 500_000, 1_140_000, 0, false, false], "PART_PAID");
    eq(bm({ status: "PAID", ...B2, paidSatang: 820_000 }).outstandingSatang, 0, "PAID");
  });
  await st("P-3", "เอเจนซี่เก็บเงิน (N4): agentAccountId ≠ null หรือ collectMode AGENT ⇒ ค้าง 0 · agentCollect true · ยอดขายเต็ม · ร้านเก็บเงิน ⇒ agentCollect false", () => {
    eq(pick(bm({ ...B2, agentAccountId: "ag1", channel: "AGENT_PORTAL", commissionSatang: 105_000 }), MK), ["LIVE", 2, 700_000, 120_000, 45_794, 654_206, 105_000, 0, 0, 0, true, false], "agentAccountId");
    eq(pick(bm({ ...B2, collectMode: "AGENT" }), ["outstandingSatang", "agentCollect"]), [0, true], "collectMode AGENT");
    eq(pick(bm({ ...B2 }), ["outstandingSatang", "agentCollect"]), [820_000, false], "ร้านเก็บ");
  });
  await st("P-4", "ต้นทุนคอมฯ (N3): ร้านจด VAT ⇒ คอมฯ อย่างเดียว (105,000) · ร้านไม่จด VAT ⇒ คอมฯ + VAT คอมฯ (107,000) · หัก ณ ที่จ่ายไม่เกี่ยว", () => {
    eq(bm({ ...B2, agentAccountId: "a", commissionSatang: 105_000, commissionVatSatang: 7_350, vatRegistered: true }).commissionCostSatang, 105_000, "จด VAT");
    eq(bm({ ...B2, vatSatang: 0, agentAccountId: "a", commissionSatang: 100_000, commissionVatSatang: 7_000, vatRegistered: false }).commissionCostSatang, 107_000, "ไม่จด VAT");
  });
  await st("P-5", "NO_SHOW (N6): นับเท่าที่รับ (ลงส่วนไม่ใช่เก็บแทนก่อน · ไม่เกินยอดที่ต้องจ่าย) · รับ 300,000 ⇒ ยอดขาย 300,000 VAT 19,626 · รับ 760,000 ⇒ ยอดขาย 700,000 เก็บแทน 60,000 · รับ 900,000 ⇒ ตัดที่ 820,000 · รับ 0 ⇒ 0 · ค้าง 0 ทุกกรณี (outstandingOf) · noShowUnpaid เมื่อรับ < ยอด", () => {
    const N = (paid: number, refunded = 0) => pick(bm({ status: "NO_SHOW", ...B2, paidSatang: paid, refundedSatang: refunded }), MK);
    eq(N(300_000), ["LIVE", 2, 300_000, 0, 19_626, 280_374, 0, 300_000, 0, 0, false, true], "300,000");
    eq(N(760_000), ["LIVE", 2, 700_000, 60_000, 45_794, 654_206, 0, 760_000, 0, 0, false, true], "760,000");
    eq(N(900_000), ["LIVE", 2, 700_000, 120_000, 45_794, 654_206, 0, 900_000, 0, 0, false, false], "900,000");
    eq(N(0), ["LIVE", 2, 0, 0, 0, 0, 0, 0, 0, 0, false, true], "0"); eq(N(820_000, 100_000).slice(2, 4), [700_000, 20_000], "หักคืนก่อนนับ (รับสุทธิ 720,000)");
  });
  await st("P-6", "CANCELLED = ส่วนที่ร้านเก็บ (RETAINED) · คอมฯ 0 · ค้าง 0 · ที่นั่ง 0 · ยอดขาย + เก็บแทน = รับแล้ว · ยกเลิกยังไม่จ่าย = 0", () => {
    const c = bm({ status: "CANCELLED", ...B2, commissionSatang: 99_000, paidSatang: 820_000, refundedSatang: 470_000, retained: [{ amountSatang: 300_000, vatSatang: 19_626, passThroughSatang: 0 }, { amountSatang: 50_000, vatSatang: 3_271, passThroughSatang: 0 }] });
    eq(pick(c, MK), ["CANCELLED", 0, 350_000, 0, 22_897, 327_103, 0, 350_000, 0, 0, false, false], "ยกเลิก");
    eq(Number(c.salesSatang) + Number(c.passThroughSatang), c.collectedSatang, "กระทบยอด");
    eq(pick(bm({ status: "CANCELLED", ...B2 }), MK), ["CANCELLED", 0, 0, 0, 0, 0, 0, 0, 0, 0, false, false], "ยังไม่จ่าย");
  });
  await st("P-7", "PENDING_REFUND (N5): pendingRefund ชนะสถานะ · ยอดขาย 0 · held = จ่าย − คืน · ที่นั่งยังนับ (กันที่จนคืนเสร็จ) · HOLD/PENDING/EXPIRED = EXCLUDED", () => {
    eq(pick(bm({ status: "PAID", ...B2, paidSatang: 820_000, pendingRefund: true }), MK), ["PENDING_REFUND", 2, 0, 0, 0, 0, 0, 0, 0, 820_000, false, false], "รอคืน");
    for (const s of ["HOLD", "PENDING", "EXPIRED"]) eq(pick(bm({ status: s, ...B2, paidSatang: 5 }), MK), ["EXCLUDED", 0, 0, 0, 0, 0, 0, 0, 0, 0, false, false], s);
  });
  await st("P-8", "sumMoney: บวกทีละช่อง · bookings/cancelled/pendingRefund · retained = รับแล้วของ CANCELLED · agentCollectBookings · noShowUnpaid", () => {
    const xs = [bm({ status: "PAID", ...B2, paidSatang: 820_000 }), bm({ ...B2, agentAccountId: "a", commissionSatang: 105_000 }), bm({ status: "NO_SHOW", ...B2, paidSatang: 300_000 }),
      bm({ status: "CANCELLED", ...B2, paidSatang: 820_000, refundedSatang: 470_000, retained: [{ amountSatang: 350_000, vatSatang: 22_897, passThroughSatang: 0 }] }), bm({ status: "PAID", ...B2, paidSatang: 820_000, pendingRefund: true }), bm({ status: "HOLD", ...B2 })];
    const t = asRec(pure("sumMoney", xs)) ?? {};
    eq(pick(t, ["bookings", "cancelledBookings", "pendingRefundBookings", "seats", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang", "collectedSatang", "outstandingSatang", "heldSatang", "retainedSatang", "agentCollectBookings", "noShowUnpaid"]),
      [3, 1, 1, 8, 2_050_000, 240_000, 134_111, 1_915_889, 105_000, 1_470_000, 0, 820_000, 350_000, 1, 1], "รวม");
  });
  await st("P-9", "profitOf · loadFactorBp: ภาพ 11 2,150,782/4566 · รายได้ 0 ⇒ margin null · ปัดครึ่งออกจากศูนย์ ±0.5 · 15/24 = 6250 · 1/3 = 3333 · 2/3 = 6667 · ความจุ 0 ⇒ null", () => {
    const p = (r: number, c: number, k: number) => { const x = asRec(pure("profitOf", { revenueExVatSatang: r, commissionCostSatang: c, costSatang: k })) ?? {}; return [x.grossProfitSatang, x.marginBp]; };
    eq([p(4_710_282, 409_500, 2_150_000), p(0, 0, 120_000), p(20_000, 0, 19_999), p(20_000, 0, 20_001)], [[2_150_782, 4566], [-120_000, null], [1, 1], [-1, -1]], "profit");
    eq([[15, 24], [1, 3], [2, 3], [0, 10], [0, 0]].map(([s, c]) => pure("loadFactorBp", s, c)), [6250, 3333, 6667, 0, null], "bp");
  });
  await st("P-10", "channelGroupOf ครบ 12 ช่องทาง + ไม่รู้จัก ⇒ OTHER · departureReportStateOf: ยกเลิก ⇒ CANCELLED · now < endsAt ⇒ UPCOMING · now ≥ endsAt ⇒ ENDED (N7 · ไม่มี CLOSED)", () => {
    const all = ["WEB", "LIFF", "EMBED", "COUNTER", "POS", "CHAT_AI", "AGENT_PORTAL", "AGENT_LINK", "AGENT_API", "OTA", "API", "IMPORT", "XX"];
    eq(all.map((c) => pure("channelGroupOf", c)), [...Array(6).fill("DIRECT"), ...Array(3).fill("AGENT"), ...Array(4).fill("OTHER")], "ช่องทาง");
    const end = new Date("2027-04-10T09:30:00Z"); const S = (status: string, now: Date) => pure("departureReportStateOf", { status, endsAt: end }, now);
    eq([S("CANCELLED", NOW_R), S("GUARANTEED", new Date("2027-04-10T09:29:59Z")), S("GUARANTEED", end), S("OPEN", NOW_R)], ["CANCELLED", "UPCOMING", "ENDED", "ENDED"], "สถานะ");
  });
  await st("P-11", "charterLikeOf (ตัวบ่งชี้ชั่วคราว · C9): 1 การจองกินที่ครบความจุ ⇒ true · 2 การจอง / ไม่ครบ / ความจุ 0 ⇒ false", () => {
    const C = (capacity: number, liveBookings: number, liveSeats: number) => pure("charterLikeOf", { capacity, liveBookings, liveSeats });
    eq([C(10, 1, 10), C(10, 1, 12), C(10, 2, 10), C(10, 1, 9), C(0, 1, 0)], [true, true, false, false, false], "charter");
  });
  await st("P-12", "costAccessOf (N9 · แคบ): ไม่มีสมาชิก ⇒ ไม่ได้ · OWNER ได้ · MANAGER หน่วยที่เข้าได้ ได้ / หน่วยอื่น ไม่ได้ · STAFF trips.* ไม่ได้ · STAFF cost.view = ดู · cost.edit = ดู+แก้ · มีคีย์แต่เข้าหน่วยไม่ได้ ⇒ ไม่ได้", () => {
    const A = (role: string, unitAccess: string[], perms: string[]) => { const r = asRec(pure("costAccessOf", { role, unitAccess, permissions: Object.fromEntries(perms.map((k) => [k, true])) }, "u1")) ?? {}; return [r.view, r.edit]; };
    eq(asRec(pure("costAccessOf", null, "u1")), { view: false, edit: false }, "null");
    eq([A("OWNER", [], []), A("MANAGER", ["u1"], []), A("MANAGER", ["u2"], []), A("MANAGER", ["*"], []), A("STAFF", ["u1"], ["trips.*"]), A("STAFF", ["u1"], ["trips.cost.view"]), A("STAFF", ["u1"], ["trips.cost.edit"]), A("STAFF", ["u2"], ["trips.cost.edit"]), A("STAFF", ["*"], ["trips.cost.view"])],
      [[true, true], [true, true], [false, false], [true, true], [false, false], [true, false], [true, true], [false, false], [true, false]], "matrix");
  });
  const PCR = (raw: unknown): Rec => asRec(pure("parseCostRows", raw)) ?? {};
  await st("P-13", "parseCostRows ปกติ: trim หมายเหตุ · ว่าง ⇒ null · ไม่มี id ⇒ null · คงลำดับ · 30 แถวได้ · 200 ตัวได้", () => {
    const r = PCR([{ kind: "BOAT", amountSatang: 1_200_000, note: "  เรือราชา 1  " }, { id: "c1", kind: "FOOD", amountSatang: 150_000, note: "   " }, { kind: "OTHER", amountSatang: 1 }]);
    ok(r.ok === true, fmt(r));
    eq(r.rows, [{ id: null, kind: "BOAT", amountSatang: 1_200_000, note: "เรือราชา 1" }, { id: "c1", kind: "FOOD", amountSatang: 150_000, note: null }, { id: null, kind: "OTHER", amountSatang: 1, note: null }], "แถว");
    eq([PCR(Array.from({ length: 30 }, () => ({ kind: "FUEL", amountSatang: 100 }))).ok, PCR([{ kind: "BOAT", amountSatang: 1, note: "ก".repeat(200) }]).ok], [true, true], "ขอบ");
  });
  await st("P-14", "parseCostRows ปฏิเสธ 19 กรณี: ไม่ใช่อาร์เรย์/kind นอกชุด/คีย์เกิน/ทศนิยม/สตริง/NaN/id ซ้ำ/id ว่าง/note \\n \\t NUL DEL/201 ตัว ⇒ INVALID_INPUT · 0/−1/1e9+1/Σ>int4 ⇒ COST_AMOUNT_INVALID · 31 แถว ⇒ COST_ROWS_LIMIT", () => {
    const row = (o: Rec) => [{ kind: "BOAT", amountSatang: 100, ...o }];
    const cases: [unknown, string][] = [[{}, "INVALID_INPUT"], [null, "INVALID_INPUT"], [row({ kind: "COMMISSION" }), "INVALID_INPUT"], [row({ extra: 1 }), "INVALID_INPUT"], [row({ amountSatang: 1.5 }), "INVALID_INPUT"],
      [row({ amountSatang: "100" }), "INVALID_INPUT"], [row({ amountSatang: Number.NaN }), "INVALID_INPUT"], [[{ id: "x", kind: "BOAT", amountSatang: 1 }, { id: "x", kind: "FUEL", amountSatang: 2 }], "INVALID_INPUT"], [row({ id: "" }), "INVALID_INPUT"],
      [row({ note: "a\nb" }), "INVALID_INPUT"], [row({ note: "a\tb" }), "INVALID_INPUT"], [row({ note: "a\u0000" }), "INVALID_INPUT"], [row({ note: "a\u007f" }), "INVALID_INPUT"], [row({ note: "ก".repeat(201) }), "INVALID_INPUT"],
      [row({ amountSatang: 0 }), "COST_AMOUNT_INVALID"], [row({ amountSatang: -1 }), "COST_AMOUNT_INVALID"], [row({ amountSatang: 1_000_000_001 }), "COST_AMOUNT_INVALID"],
      [Array.from({ length: 3 }, () => ({ kind: "BOAT", amountSatang: 1_000_000_000 })), "COST_AMOUNT_INVALID"], [Array.from({ length: 31 }, () => ({ kind: "FUEL", amountSatang: 100 })), "COST_ROWS_LIMIT"]];
    const bad = cases.map(([raw, code], i) => { const r = PCR(raw); return r.ok === false && r.code === code ? null : `#${i} ⇒ ${fmt(r)}`; }).filter(Boolean);
    ok(bad.length === 0, bad.slice(0, 3).join(" · "));
  });
  await st("P-15", "costRowsFromForm (N11): ข้อความบาท \"1,200.50\" ⇒ 120050 · \" 350 \" ⇒ 35000 · \"12.345\"/\"abc\"/\"\"/\"1,2a\" ⇒ COST_AMOUNT_FORMAT · \"0\"/\"0.00\"/\"100000000\" ⇒ COST_AMOUNT_INVALID · \"10000000.01\" ⇒ COST_AMOUNT_INVALID · amountText ไม่ใช่สตริง/ส่ง amountSatang มาแทน ⇒ INVALID_INPUT", () => {
    const F = (t: unknown) => asRec(pure("costRowsFromForm", [{ kind: "FOOD", amountText: t, note: "x" }])) ?? {};
    const r = F("1,200.50"); ok(r.ok === true, fmt(r)); eq(asArr(r.rows)[0]?.amountSatang, 120_050, "1,200.50"); eq(asArr(F(" 350 ").rows)[0]?.amountSatang, 35_000, "350");
    for (const t of ["12.345", "abc", "", "1,2a"]) eq(F(t).code, "COST_AMOUNT_FORMAT", t);
    for (const t of ["0", "0.00", "100000000", "10000000.01"]) eq(F(t).code, "COST_AMOUNT_INVALID", t);
    eq(F(120_050).code, "INVALID_INPUT", "ตัวเลข"); eq(asRec(pure("costRowsFromForm", [{ kind: "FOOD", amountSatang: 100 }]))?.code, "INVALID_INPUT", "amountSatang แทน");
  });
  await st("P-16", "costContentKey: ไม่ขึ้นกับลำดับ · นับซ้ำ · หมายเหตุ/ชนิด/ยอดต่าง ⇒ ต่าง · null ≡ ไม่มีหมายเหตุ", () => {
    const K = (rows: Rec[]) => String(pure("costContentKey", rows));
    const a = { kind: "BOAT", amountSatang: 100, note: "x" }, b = { kind: "FUEL", amountSatang: 50, note: null };
    eq(K([a, b]), K([b, a]), "ลำดับ"); ok(K([a, a]) !== K([a]), "นับซ้ำ"); ok(K([a]) !== K([{ ...a, note: "y" }]) && K([a]) !== K([{ ...a, kind: "FUEL" }]) && K([a]) !== K([{ ...a, amountSatang: 101 }]), "ต่าง");
    eq(K([{ kind: "FUEL", amountSatang: 50 }]), K([b]), "null");
  });
  groupLine("P");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uN = rid("uN"), uB = rid("uB");
  let setupErr = "", settingsErr = "";
  const U: Record<string, { userId: string; tenantId: string }> = {};
  const PRD: Record<string, { id: string; opt: string; unit: string; tenant: string; adult: string; child: string; infant: string }> = {};
  let seq = 0, codeSeq = 0;
  // ORACLE-EDIT รอบ 2: ตัวสร้างฟิกซ์เจอร์ใช้ต่อในกลุ่ม R (สร้างหลัง PC-7 เพื่อไม่ให้แถว snapshot เสียโดยเจตนาไปปนตัวควบคุมของ PC-7)
  let mkDepR: ((key: string, prod: string, date: string, o?: Rec) => Promise<string>) | null = null;
  let mkBkR: ((key: string, b: Rec) => Promise<string>) | null = null;
  let mkCostR: ((dep: string, prod: string, kind: string, amount: number, note?: string | null) => Promise<string>) | null = null;
  const DEP: Record<string, string> = {};
  const BK: Record<string, string> = {};
  try {
    for (const t of ["TripProduct", "TripOption", "TripPaxType", "TripDeparture", "TripBooking", "TripBookingItem", "TripMoneyEvent", "TripRefundRequest", "TripCost", "TripPrice", "AuditLog"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T1.7 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag] of [[uA, tA, "a"], [uA2, tA, "a2"], [uN, tA, "novat"], [uB, tB, "b"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify({ timezone: "Asia/Bangkok" }), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string, role: string, unitAccess: string[], perms: string[]) => {
      const id = rid(`u${tag}`);
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(Object.fromEntries(perms.map((p) => [p, true]))), acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { userId: id, tenantId };
    };
    const DV = "trips.departure.view";
    await mkUser("oa", tA, "OWNER", ["*"], []); await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("mg", tA, "MANAGER", [uA, uN], []); await mkUser("mgx", tA, "MANAGER", [uA2], []);
    await mkUser("rv", tA, "STAFF", [uA], [DV, "trips.report.view"]);
    await mkUser("cv", tA, "STAFF", [uA], [DV, "trips.report.view", "trips.cost.view"]);
    await mkUser("cvo", tA, "STAFF", [uA], [DV, "trips.cost.view"]);
    await mkUser("ce", tA, "STAFF", [uA], [DV, "trips.cost.edit"]);
    await mkUser("bv", tA, "STAFF", [uA], [DV, "trips.booking.view"]);
    await mkUser("dv", tA, "STAFF", [uA], [DV]);
    await mkUser("nodv", tA, "STAFF", [uA], ["trips.report.view", "trips.cost.view", "trips.cost.edit"]);
    await mkUser("wild", tA, "STAFF", [uA], ["trips.*"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [DV, "trips.report.view", "trips.cost.view", "trips.cost.edit"]);
    // ORACLE-EDIT รอบ 2 (มติ Q5): ผู้ดูแลผู้ใช้งาน (settings.staff.write) แบบ trips.* / แบบถือคีย์ต้นทุนระบุตรง · เป้าหมายพนักงาน 4 คน
    await mkUser("sw", tA, "STAFF", [uA], ["trips.*", "settings.staff.write"]);
    await mkUser("swk", tA, "STAFF", [uA], ["settings.staff.write", "trips.cost.view"]);
    for (const t of ["tg1", "tg2", "tg3", "tg4", "tg5", "tg6", "tg7"]) await mkUser(t, tA, "STAFF", [uA], []); // tg6/tg7 = ORACLE-EDIT รอบ 3 (U1)
    const mkProd = async (key: string, tenantId: string, unitId: string, o: { title?: string; source?: string } = {}) => {
      const id = rid(`p${key}`), opt = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t17qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: o.source ?? "OWN", status: "ACTIVE",
        title: JSON.stringify({ th: o.title ?? `ทดสอบ ${key}`, en: o.title ?? `Test ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: opt, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const pt = (code: string, th: string, counts: boolean, order: number) => insertRow("TripPaxType", { id: rid(`pt${code}`), tenantId, unitId, productId: id, code, label: JSON.stringify({ th, en: code }), countsCapacity: counts, active: true, sortOrder: order, updatedAt: new Date() });
      const adult = await pt("ADULT", "ผู้ใหญ่", true, 0), child = await pt("CHILD", "เด็ก", true, 1), infant = await pt("INFANT", "ทารก", false, 2);
      await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: adult, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: ADULT, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt, unit: unitId, tenant: tenantId, adult, child, infant };
    };
    await mkProd("PR", tA, uA, { title: "ราชาทดสอบ" }); await mkProd("PS", tA, uA, { title: "ทริปผู้ให้บริการ", source: "SUPPLIER" });
    await mkProd("PA2", tA, uA2); await mkProd("PN", tA, uN); await mkProd("PB", tB, uB);
    const mkDep = async (key: string, prod: string, date: string, o: { cap?: number; sold?: number; held?: number; status?: string } = {}) => {
      const p = PRD[prod]; const startsAt = new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid(`d${key}`);
      await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8.5 * HOUR),
        status: o.status ?? "GUARANTEED", capacity: o.cap ?? 24, sold: o.sold ?? 0, held: o.held ?? 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
      DEP[key] = id; return id;
    };
    type BkIn = { dep: string; prod: string; status: string; channel: string; adults: number; children?: number; infants?: number; paid?: number; refunded?: number; commission?: number; commissionVat?: number;
      created: string; agent?: boolean; collectMode?: string; currency?: string; retained?: { amountSatang: number; vatSatang: number; passThroughSatang: number }[]; snapshot?: "ok" | "corrupt" | "noTotals"; refund?: string;
      // ORACLE-EDIT รอบ 2 (มติ Q7–Q11): payableJson = ค่าดิบของ totals.payableSatang · pricesIncludeVat false = ราคาไม่รวม VAT (gross ไม่รวม VAT) · omitVatReg = snapshot ไม่มี tax.vatRegistered · snapVatReg/vat = ทับสถานะ/ยอด VAT ของการจอง
      payableJson?: unknown; pricesIncludeVat?: boolean; omitVatReg?: boolean; snapVatReg?: boolean; vat?: number };
    const mkBk = async (key: string, b: BkIn) => {
      const p = PRD[b.prod]; const ch = b.children ?? 0, inf = b.infants ?? 0; const vatReg = b.snapVatReg ?? p.unit !== uN;
      const sales = b.adults * ADULT + ch * CHILD, pt = b.adults * PARK_A + ch * PARK_C, excl = b.pricesIncludeVat === false;
      const vat = b.vat ?? (vatReg ? (excl ? halfUp(BigInt(sales) * BigInt(700), BigInt(10_000)) : vatIncl(sales)) : 0);
      const gross = sales + pt, payable = gross + (excl ? vat : 0);
      const C = b.commission ?? 0, Cv = b.commissionVat ?? 0; const id = rid(`b${key}`);
      const tax: Rec = { vatRegistered: vatReg, pricesIncludeVat: !excl, invoiceOnEachPayment: true, cancelFeeVat: false, vatRateBp: 700 }; if (b.omitVatReg) delete tax.vatRegistered;
      const snap = b.snapshot === "corrupt" ? { v: 1 } : { v: 1, productKind: "TRIP", currency: b.currency ?? "THB", tax,
        ...(b.snapshot === "noTotals" ? {} : { totals: { grossSatang: gross, discountSatang: 0, agentDiscountSatang: 0, passThroughSatang: pt, vatSatang: vat, payableSatang: "payableJson" in b ? b.payableJson : payable } }),
        commission: C > 0 ? { commissionSatang: C, commissionVatSatang: Cv, wht: { whtSatang: 0 }, remitToShopSatang: payable - C - Cv } : null };
      const travelDate = (await q<{ d: string }>(`SELECT "localDate"::text AS d FROM "TripDeparture" WHERE id = $1`, [b.dep]))[0]?.d;
      await insertRow("TripBooking", { id, tenantId: p.tenant, unitId: p.unit, code: `T17-${STAMP}-${++codeSeq}`, publicTokenHash: `t17${hex(12)}`, status: b.status, productId: p.id, departureId: b.dep, travelDate,
        channel: b.channel, agentAccountId: b.agent ? `t17-agent-${STAMP}` : null, collectMode: b.collectMode ?? "SHOP", payMethod: "PAY_LATER", contactRoute: b.agent ? "VIA_AGENT" : "DIRECT", currency: b.currency ?? "THB",
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
        passThroughSatang: r.passThroughSatang, tender: "CASH", postingStatus: "UNPOSTED", postingAttempts: 0, idempotencyKey: `t17-ret-${id}-${i}`, createdAt: new Date(b.created), updatedAt: new Date(b.created) });
      if (b.refund) await insertRow("TripRefundRequest", { id: rid("rr"), tenantId: p.tenant, unitId: p.unit, bookingId: id, by: "CUSTOMER", reasonKind: "CUSTOMER", deductions: "[]", status: b.refund, computed: "{}", choice: "MONEY", amountSatang: 0, updatedAt: new Date() });
      BK[key] = id; return id;
    };
    const mkCost = async (dep: string, prod: string, kind: string, amount: number, note: string | null = null) => {
      const p = PRD[prod]; return insertRow("TripCost", { id: rid("c"), tenantId: p.tenant, unitId: p.unit, departureId: dep, kind, amountSatang: amount, note, createdAt: new Date(Date.parse("2027-03-01T00:00:00Z") + (seq++) * 1000), updatedAt: new Date("2027-03-01T00:00:00Z") });
    };
    mkDepR = (key, prod, date, o = {}) => mkDep(key, prod, date, o as Parameters<typeof mkDep>[3]); mkBkR = (key, b) => mkBk(key, b as unknown as BkIn); mkCostR = (dep, prod, kind, amount, note = null) => mkCost(dep, prod, kind, amount, note);
    // ── dR = แผงรอบภาพ 11 · การจองเอเจนซี่จ่าย 0 (N4 · ระบบจริงยังสร้างการจองเอเจนซี่ไม่ได้จน A1.4) · ถือ/รอ/หมดเวลาไม่นับเงิน ──
    const dR = await mkDep("R", "PR", "2027-04-10", { cap: 24, sold: 15, held: 2 });
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
    // ── dN: เดินทางแล้ว (+ทารกไม่กินที่) · ไม่มาจ่ายบางส่วน · ยกเลิกเก็บไว้ · ต้นทุนเรือ + อุทยานของไกด์ ──
    const dN = await mkDep("N", "PR", "2027-04-11", { cap: 12, sold: 3 });
    await mkBk("trav", { dep: dN, prod: "PR", status: "TRAVELLED", channel: "COUNTER", adults: 1, infants: 1, paid: 410_000, created: "2027-04-10T03:00:00Z" });
    await mkBk("nosh", { dep: dN, prod: "PR", status: "NO_SHOW", channel: "WEB", adults: 2, paid: 300_000, created: "2027-03-20T03:00:00Z" });
    await mkBk("cxlN", { dep: dN, prod: "PR", status: "CANCELLED", channel: "COUNTER", adults: 2, paid: 820_000, refunded: 470_000, created: "2027-03-25T03:00:00Z", retained: [{ amountSatang: 350_000, vatSatang: 22_897, passThroughSatang: 0 }] });
    await mkCost(dN, "PR", "BOAT", 400_000); await mkCost(dN, "PR", "PARK_FEE", 100_000, "อุทยานของไกด์");
    // ── dX: รอบยกเลิก — การจองยกเลิกยังไม่จ่าย + การจองจ่ายแล้วที่ยังค้างในรอบยกเลิก (สถานะของ T1.6) ⇒ รอคืนเงิน · ต้นทุนน้ำมัน ──
    const dX = await mkDep("X", "PR", "2027-04-12", { cap: 24, sold: 2, status: "CANCELLED" });
    await mkBk("cxlX", { dep: dX, prod: "PR", status: "CANCELLED", channel: "WEB", adults: 3, created: "2027-03-26T03:00:00Z" });
    await mkBk("pendX", { dep: dX, prod: "PR", status: "PAID", channel: "WEB", adults: 2, paid: 820_000, created: "2027-03-27T03:00:00Z" });
    await mkCost(dX, "PR", "FUEL", 120_000);
    // ── dQ: คำขอคืนเงินค้าง (REQUESTED) ⇒ รอคืนเงิน · คำขอถูกปฏิเสธ (REJECTED) ⇒ นับปกติ ──
    const dQ = await mkDep("Q", "PR", "2027-04-13", { cap: 10, sold: 2 });
    await mkBk("rq", { dep: dQ, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-01T03:00:00Z", refund: "REQUESTED" });
    await mkBk("rj", { dep: dQ, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-01T04:00:00Z", refund: "REJECTED" });
    // ── dH: เหมาลำ (1 การจองเต็มความจุ) ──
    const dH = await mkDep("H", "PR", "2027-04-14", { cap: 10, sold: 10 });
    await mkBk("charter", { dep: dH, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 10, created: "2027-03-01T03:00:00Z" });
    // ── dC: รอบสำหรับบริการต้นทุน · dS: สินค้าผู้ให้บริการ + USD + OTA + แถว snapshot เสีย (โดยเจตนา) · dW: W22 ──
    await mkDep("C", "PR", "2027-06-15", { cap: 20, sold: 0, status: "OPEN" });
    const dS = await mkDep("S", "PS", "2027-06-16", { cap: 10, sold: 3, status: "OPEN" });
    await mkBk("usd", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "COUNTER", adults: 1, currency: "USD", created: "2027-05-20T03:00:00Z" });
    await mkBk("ota", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "OTA", adults: 1, created: "2027-05-20T04:00:00Z" });
    await mkBk("corrupt", { dep: dS, prod: "PS", status: "CONFIRMED", channel: "WEB", adults: 1, created: "2027-05-20T05:00:00Z", snapshot: "corrupt" });
    const dW = await mkDep("W", "PR", "2027-05-01", { cap: 10, sold: 0, status: "OPEN" });
    await mkCost(dW, "PR", "BOAT", 50_000_000);
    // ── dAC: รอบของข้อ AC (ทางจริงของจอ: ตัวแก้ → server action → บริการ) · ORACLE-EDIT ผู้คุม 19 พ.ย. (บทเรียน W1.3a) ──
    await mkDep("AC", "PR", "2027-06-20", { cap: 20, sold: 0, status: "OPEN" });
    // ── หน่วยไม่จด VAT (uN): เอเจนซี่คอมฯ 100,000 + VAT คอมฯ 7,000 · ตรงจ่ายครบ · ต้นทุน 200,000 ──
    const dV = await mkDep("V", "PN", "2027-04-10", { cap: 12, sold: 3 });
    await mkBk("vAg", { dep: dV, prod: "PN", status: "CONFIRMED", channel: "AGENT_LINK", adults: 2, agent: true, commission: 100_000, commissionVat: 7_000, created: "2027-04-01T03:00:00Z" });
    await mkBk("vDi", { dep: dV, prod: "PN", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-04-02T03:00:00Z" });
    await mkCost(dV, "PN", "BOAT", 200_000);
    // ── หน่วยอื่น/ร้านอื่น (ต้นทุน 999,900) · หน่วย a2 ไม่ระบุสถานะ VAT ──
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
      const r = asRec(await (setS as AnyFn)(owner, { tenantId: tA }, [reg(uA, true), reg(uN, false)], { ackLegalWarn: true })) ?? {};
      if (r.ok !== true) throw new Error(`setSettings: ${fmt(r)}`);
    }
  } catch (e) { settingsErr = errMsg(e); console.log(`  ⚠️ ตั้งค่า VAT ของหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const needSetup = () => { ok(!setupErr, `ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); ok(!settingsErr, `ตั้งค่า VAT ไม่สำเร็จ: ${settingsErr}`); };
  const ctxOf = (tag: string): Ctx => { const a = U[tag]; if (!a) throw new AssertFail(`ไม่มีผู้ใช้ชั่วคราว ${tag} (${setupErr || "ยังไม่ตั้ง"})`); return { tenantId: a.tenantId, actorUserId: a.userId }; };
  const optsR = { now: NOW_R };
  const costRowsDb = async (dep: string) => q<{ id: string; kind: string; amountSatang: number; note: string | null; updatedAt: Date }>(`SELECT id, kind, "amountSatang", note, "updatedAt" FROM "TripCost" WHERE "departureId" = $1 ORDER BY "createdAt", id`, [dep]);
  const auditCount = async (action: string, target: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = $1 AND "targetId" = $2`, [action, target]))[0]?.n ?? 0;
  /** ORACLE-EDIT รอบ 2 (Q1 · Q17): kinds ของ audit = อาร์เรย์ชนิดที่ไม่ซ้ำ เรียงตามลำดับทะเบียน TRIP_COST_KINDS — ตรึงตรงตัว (รูปอื่น ⇒ ["<รูปผิด>"]) */
  const kindsOf = (k: unknown): unknown[] => (Array.isArray(k) ? k : ["<รูปผิด>"]);
  const content = (rows: { kind: string; amountSatang: number; note?: string | null }[]) => rows.map((r) => `${r.kind}|${r.amountSatang}|${r.note ?? ""}`).sort();
  const loadCosts = (tag: string, dep: string, unit = uA) => call("loadDepartureCostsVM", ctxOf(tag), { unitId: unit, departureId: dep }, optsR);
  const save = (tag: string, dep: string, token: unknown, rows: unknown, unit = uA) => call("saveDepartureCosts", ctxOf(tag), { unitId: unit, departureId: dep, expectedToken: token, rows }, optsR);
  const tokenOf = async (dep: string, tag = "oa") => String(asRec(VM(await loadCosts(tag, dep), "loadDepartureCostsVM").costs)?.token ?? "");
  const summary = (tag: string, dep: string, unit = uA) => call("departureMoneySummary", ctxOf(tag), { unitId: unit, departureId: dep }, optsR);
  const sumV = async (tag: string, dep: string, unit = uA) => V(await summary(tag, dep, unit), `departureMoneySummary ${tag}`);
  const panel = (tag: string, dep = DEP.R) => call("loadDeparturePanelVM", ctxOf(tag), { unitId: uA, departureId: dep }, optsR);

  // ═══════════════ PC (ต่อ) — ฟิกซ์เจอร์ + ของเดิม บนร้านชั่วคราว ═══════════════
  console.log("\n── PC (ต่อ): ฟิกซ์เจอร์ของร้านชั่วคราว ──");
  await st("PC-7", "ฟิกซ์เจอร์สอดคล้องกันเองจากแถวดิบ (N4 N12): การจองเอเจนซี่จ่าย 0 · PAID จ่ายครบ / CONFIRMED จ่าย 0 · ยกเลิก: จ่าย − คืน = Σ RETAINED · snapshot มี tax + totals ทุกแถวยกเว้นแถวเสียโดยเจตนา 1 แถว · sold ของรอบ = Σ ที่นั่งที่กินความจุของการจองสถานะ LIVE", async () => {
    needSetup();
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = $1 AND "agentAccountId" IS NOT NULL AND "paidSatang" > 0`, [tA]))[0]?.n, 0, "เอเจนซี่จ่าย > 0");
    const st2 = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" b WHERE b."tenantId" = $1 AND ((b.status = 'PAID' AND b."paidSatang" <> (b."policySnapshot"->'totals'->>'payableSatang')::int) OR (b.status IN ('CONFIRMED','HOLD','PENDING','EXPIRED') AND b."paidSatang" <> 0))`, [tA]);
    eq(st2[0]?.n, 0, "สถานะกับยอดจ่าย");
    const cx = await q<{ id: string; d: number; r: number }>(`SELECT b.id, (b."paidSatang" - b."refundedSatang")::int AS d, COALESCE((SELECT sum(e."amountSatang") FROM "TripMoneyEvent" e WHERE e."bookingId" = b.id AND e.kind = 'RETAINED'), 0)::int AS r FROM "TripBooking" b WHERE b."tenantId" = $1 AND b.status = 'CANCELLED'`, [tA]);
    ok(cx.length >= 2 && cx.every((x) => x.d === x.r), `ยกเลิก: ${fmt(cx)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = ANY($1::text[]) AND (jsonb_typeof("policySnapshot"->'tax'->'vatRegistered') IS DISTINCT FROM 'boolean' OR jsonb_typeof("policySnapshot"->'totals'->'payableSatang') IS DISTINCT FROM 'number')`, [[tA, tB]]))[0]?.n, 1, "แถว snapshot เสีย");
    const so = await q<{ id: string; sold: number; s: number }>(`SELECT d.id, d.sold, COALESCE((SELECT sum(i.qty) FROM "TripBookingItem" i JOIN "TripBooking" b ON b.id = i."bookingId" JOIN "TripPaxType" pt ON pt.id = i."paxTypeId"
      WHERE i."departureId" = d.id AND i.kind = 'SEAT' AND i.active AND pt."countsCapacity" AND b.status = ANY($2::text[])), 0)::int AS s FROM "TripDeparture" d WHERE d."tenantId" = $1`, [tA, LIVE]);
    ok(so.every((x) => x.sold === x.s), `sold ≠ ที่นั่ง: ${fmt(so.filter((x) => x.sold !== x.s))}`);
  });
  await st("PC-8", "คำเตือน W22 ของตัวคิดราคา (ของเดิม · ไม่แตะ) ขึ้นกับพนักงาน trips.* ได้ แต่ไม่มีตัวเลขต้นทุน (50,000,000 / 500,000.00) ในผลลัพธ์ทั้งก้อน", async () => {
    needSetup(); const p = PRD.PR;
    const sctx = { tenantId: tA, unitId: uA, channel: "COUNTER", actor: { kind: "STAFF", userId: U.wild.userId }, now: NOW_R, locale: "th" };
    const r = await call("quoteTrips", sctx, { lines: [{ productKind: "TRIP", unitId: uA, productId: p.id, slotId: DEP.W, optionId: p.opt, pax: [{ paxTypeId: p.adult, qty: 1 }], extras: [] }] }, {});
    ok(r.ok === true, `quoteTrips: ${fmt(r)}`); const s = JSON.stringify(r);
    ok(s.includes('"W22"'), `ไม่มีคำเตือน W22: ${s.slice(0, 200)}`);
    ok(hasNum(s, [50_000_000]).length === 0 && !/500,000/.test(s), "ผลคิดราคามีตัวเลขต้นทุน");
  });
  groupLine("PC");

  // ═══════════════ CT. บริการต้นทุน ═══════════════
  console.log("\n── CT: บันทึกต้นทุนรอบ ──");
  const DESIGN_ROWS = [{ kind: "BOAT", amountSatang: 1_200_000, note: `เรือ ${STAMP}-NOTE` }, { kind: "FUEL", amountSatang: 350_000 }, { kind: "GUIDE", amountSatang: 300_000, note: "ไกด์ 2 คน" }, { kind: "FOOD", amountSatang: 150_000 }, { kind: "TRANSPORT", amountSatang: 150_000 }];
  let tok0 = "", tok1 = "";
  await st("CT-1", "รอบที่ยังไม่มีต้นทุน (OWNER): rows [] · total 0 · token สตริง 16–128 · byKind [] · perSeat null · ตัวโหลดไม่เขียนฐาน", async () => {
    needSetup(); const n0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tA]))[0]?.n;
    const c = asRec(VM(await loadCosts("oa", DEP.C), "load").costs) ?? {};
    eq([asArr(c.rows).length, c.totalSatang, asArr(c.byKind).length, c.perSeatSatang], [0, 0, 0, null], "ว่าง");
    tok0 = String(c.token ?? ""); ok(tok0.length >= 16 && tok0.length <= 128, `token ${tok0}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = $1`, [tA]))[0]?.n, n0, "audit");
  });
  await st("CT-2", "บันทึก 5 แถว: applied · total 2,150,000 · แถวในฐานตรง · token ใหม่ · audit trips.cost.saved 1 แถว (unit/actor · before/after = { count, kinds } เท่านั้น — ไม่มียอดเงิน · ไม่มีหมายเหตุ · มติ Q1)", async () => {
    needSetup(); const v = V(await save("oa", DEP.C, tok0, DESIGN_ROWS), "save");
    eq([v.applied, v.totalSatang, asArr(v.rows).length], [true, 2_150_000, 5], "ผล");
    eq(content(await costRowsDb(DEP.C)), content(DESIGN_ROWS), "แถวในฐาน");
    tok1 = String(v.token ?? ""); ok(tok1 && tok1 !== tok0, "token ต้องเปลี่ยน");
    const au = await q<{ after: Rec; before: Rec; targetType: string; unitId: string; actorId: string }>(`SELECT after, before, "targetType", "unitId", "actorId" FROM "AuditLog" WHERE action = 'trips.cost.saved' AND "targetId" = $1`, [DEP.C]);
    eq(au.length, 1, "audit"); const a = au[0];
    // ORACLE-EDIT CT-2 รอบ 2 (มติ Q1 · OQ51): REST ประวัติของระบบบัญชีอ่าน audit ทั้งร้านได้ ⇒ before/after ห้ามมียอดเงิน — คีย์ = count, kinds เท่านั้น
    eq([a.targetType, a.unitId, a.actorId], ["TripDeparture", uA, U.oa.userId], "audit");
    eq([Object.keys(asRec(a.before) ?? {}).sort(), Object.keys(asRec(a.after) ?? {}).sort()], [["count", "kinds"], ["count", "kinds"]], "คีย์ before/after");
    eq([asRec(a.before)?.count, kindsOf(asRec(a.before)?.kinds), asRec(a.after)?.count, kindsOf(asRec(a.after)?.kinds)], [0, [], 5, ["BOAT", "FUEL", "GUIDE", "FOOD", "TRANSPORT"]], "count/kinds");
    ok(hasNum(JSON.stringify(au), [1_200_000, 2_150_000, 350_000, 300_000, 150_000]).length === 0 && !/Satang|total/i.test(JSON.stringify([a.before, a.after])), `audit มียอดเงิน: ${fmt([a.before, a.after])}`);
    ok(!JSON.stringify(au).includes(`${STAMP}-NOTE`) && !JSON.stringify(au).includes("ไกด์ 2 คน"), "audit มีหมายเหตุ");
  });
  await st("CT-3", "ส่งซ้ำ (token เก่า เนื้อหาเดิม) ⇒ ok · applied false · token ปัจจุบัน · แถว/updatedAt เดิม · audit ไม่เพิ่ม", async () => {
    needSetup(); const before = await costRowsDb(DEP.C); const v = V(await save("oa", DEP.C, tok0, DESIGN_ROWS), "resend");
    eq([v.applied, v.token, v.totalSatang], [false, tok1, 2_150_000], "ผล");
    eq((await costRowsDb(DEP.C)).map((r) => [r.id, r.updatedAt.toISOString()]), before.map((r) => [r.id, r.updatedAt.toISOString()]), "แถว"); eq(await auditCount("trips.cost.saved", DEP.C), 1, "audit");
  });
  await st("CT-4", "token เก่า เนื้อหาต่าง ⇒ STATE_CONFLICT · ไม่เขียน · ข้อความไม่สะท้อนยอด/หมายเหตุ", async () => {
    needSetup(); const before = content(await costRowsDb(DEP.C)); const r = await save("oa", DEP.C, tok0, [{ kind: "BOAT", amountSatang: 987_654, note: `ลับ${STAMP}` }]);
    codeR(r, "STATE_CONFLICT", "ชนกัน"); ok(!JSON.stringify(r).includes("987654") && !JSON.stringify(r).includes(`ลับ${STAMP}`), "ข้อความสะท้อนอินพุต");
    eq(content(await costRowsDb(DEP.C)), before, "แถว"); eq(await auditCount("trips.cost.saved", DEP.C), 1, "audit");
  });
  await st("CT-5", "แก้ด้วย token ปัจจุบัน: เปลี่ยนยอดเรือ · ลบรถ · เพิ่มอุปกรณ์ ⇒ id ที่คงไว้เดิม · ชุดตรง · audit +1 (count 5 → 5 · kinds มี TRANSPORT → มี EQUIPMENT · ไม่มียอดเงิน · มติ Q1)", async () => {
    needSetup(); const cur = await costRowsDb(DEP.C); const tok = await tokenOf(DEP.C);
    const boat = cur.find((r) => r.kind === "BOAT"), drop = cur.find((r) => r.kind === "TRANSPORT"); ok(boat && drop, `ไม่พบแถว: ${fmt(cur)}`);
    const keep = cur.filter((r) => r.id !== boat?.id && r.id !== drop?.id);
    const want = [{ id: String(boat?.id), kind: "BOAT", amountSatang: 1_300_000, note: boat?.note ?? null }, ...keep.map((r) => ({ id: r.id, kind: r.kind, amountSatang: r.amountSatang, note: r.note })), { kind: "EQUIPMENT", amountSatang: 100_000, note: "ถังอากาศ" }];
    eq(pick(V(await save("oa", DEP.C, tok, want), "edit"), ["applied", "totalSatang"]), [true, 2_200_000], "ผล");
    const after = await costRowsDb(DEP.C);
    ok([boat, ...keep].every((r) => after.some((x) => x.id === r?.id)) && !after.some((x) => x.id === drop?.id), "id ที่คงไว้/ลบ"); eq(content(after), content(want), "ชุด");
    const a = (await q<{ before: Rec; after: Rec }>(`SELECT before, after FROM "AuditLog" WHERE action = 'trips.cost.saved' AND "targetId" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 1`, [DEP.C]))[0];
    // ORACLE-EDIT CT-5 รอบ 2 (มติ Q1): ไม่มียอดเงินใน audit
    eq([await auditCount("trips.cost.saved", DEP.C), asRec(a?.before)?.count, kindsOf(asRec(a?.before)?.kinds), asRec(a?.after)?.count, kindsOf(asRec(a?.after)?.kinds)],
      [2, 5, ["BOAT", "FUEL", "GUIDE", "FOOD", "TRANSPORT"], 5, ["BOAT", "FUEL", "GUIDE", "FOOD", "EQUIPMENT"]], "audit");
    ok(hasNum(JSON.stringify(a), [1_300_000, 2_200_000, 2_150_000]).length === 0 && !/Satang|total/i.test(JSON.stringify(a)), `audit มียอดเงิน: ${fmt(a)}`);
  });
  await st("CT-6", "บันทึกชุดเดิมด้วย token ปัจจุบัน ⇒ applied false · ไม่มี audit · token เดิม", async () => {
    needSetup(); const tok = await tokenOf(DEP.C); const cur = await costRowsDb(DEP.C);
    eq(pick(V(await save("oa", DEP.C, tok, cur.map((r) => ({ id: r.id, kind: r.kind, amountSatang: r.amountSatang, note: r.note }))), "same"), ["applied", "token"]), [false, tok], "ผล");
    eq(await auditCount("trips.cost.saved", DEP.C), 2, "audit");
  });
  await st("CT-7", "พร้อมกัน 10 ทาง token เดียวกัน เนื้อหาต่าง (OWNER + พนักงาน cost.edit) ⇒ สำเร็จ 1 · STATE_CONFLICT 9 · แถว = ของผู้ชนะ · audit +1", async () => {
    needSetup(); const tok = await tokenOf(DEP.C);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => save(i % 2 ? "oa" : "ce", DEP.C, tok, [{ kind: "OTHER", amountSatang: 10_000 + i, note: `ทาง ${i}` }])));
    const wins = rs.map((r, i) => [r, i] as const).filter(([r]) => r.ok === true && asRec(r.value)?.applied === true);
    eq([wins.length, rs.filter((r) => r.ok === false && r.code === "STATE_CONFLICT").length], [1, 9], `ผล ${fmt(rs.map((r) => r.code ?? asRec(r.value)?.applied))}`);
    const w = wins[0]?.[1] ?? -1; eq(content(await costRowsDb(DEP.C)), [`OTHER|${10_000 + w}|ทาง ${w}`], "แถวผู้ชนะ"); eq(await auditCount("trips.cost.saved", DEP.C), 3, "audit");
  });
  await st("CT-8", "พร้อมกัน 10 ทาง เนื้อหาเหมือนกัน ⇒ ok ทั้ง 10 · applied true 1 · ไม่มีแถวซ้ำ · audit +1", async () => {
    needSetup(); const tok = await tokenOf(DEP.C); const same = [{ kind: "FUEL", amountSatang: 55_500, note: "เหมือนกัน" }, { kind: "FOOD", amountSatang: 44_400 }];
    const rs = await Promise.all(Array.from({ length: 10 }, () => save("oa", DEP.C, tok, same)));
    eq([rs.filter((r) => r.ok === true).length, rs.filter((r) => asRec(r.value)?.applied === true).length], [10, 1], `ผล ${fmt(rs.map((r) => r.code ?? asRec(r.value)?.applied))}`);
    eq(content(await costRowsDb(DEP.C)), content(same), "แถว"); eq(await auditCount("trips.cost.saved", DEP.C), 4, "audit");
  });
  await st("CT-9", "ตารางสิทธิ์ (N9): อ่านได้ OWNER · MANAGER · cost.view · cost.edit · อ่าน FORBIDDEN report.view · booking.view · departure.view · ไม่มีสิทธิ์ · ขาด departure.view · **trips.*** · MANAGER หน่วยอื่น ⇒ NOT_FOUND · canEdit เฉพาะ OWNER/MANAGER/cost.edit · บันทึก FORBIDDEN ทุกคนที่เหลือ (ไม่เขียน)", async () => {
    needSetup();
    for (const t of ["oa", "mg", "ce", "cv", "cvo"]) ok(VM(await loadCosts(t, DEP.C), `load ${t}`).costs, `${t} อ่าน`);
    for (const t of ["rv", "bv", "dv", "none", "nodv", "wild"]) codeR(await loadCosts(t, DEP.C), "FORBIDDEN", `load ${t}`);
    codeR(await loadCosts("mgx", DEP.C), "NOT_FOUND", "MANAGER หน่วยอื่น");
    const ce = async (t: string) => asRec(VM(await loadCosts(t, DEP.C), t).flags)?.canEdit;
    eq([await ce("oa"), await ce("mg"), await ce("ce"), await ce("cv"), await ce("cvo")], [true, true, true, false, false], "canEdit");
    const before = content(await costRowsDb(DEP.C)); const tok = await tokenOf(DEP.C);
    for (const t of ["cv", "cvo", "rv", "bv", "dv", "none", "nodv", "wild"]) codeR(await save(t, DEP.C, tok, [{ kind: "BOAT", amountSatang: 5 }]), "FORBIDDEN", `save ${t}`);
    eq(content(await costRowsDb(DEP.C)), before, "ไม่เขียน");
    for (const [t, amt] of [["mg", 1001], ["ce", 1002]] as const) { const tk = await tokenOf(DEP.C); ok(V(await save(t, DEP.C, tk, [{ kind: "OTHER", amountSatang: amt }]), `save ${t}`).applied === true, `${t} บันทึก`); }
  });
  await st("CT-10", "อินพุตอันตรายผ่านบริการ: kind นอกชุด · ทศนิยม · note NUL/LF · 0 · เกินเพดาน · 31 แถว · token ไม่ใช่สตริง/ยาว 129 · คีย์เกิน · departureId มี NUL ⇒ รหัสตามใบสั่ง · ไม่เขียน · token เดิม", async () => {
    needSetup(); const before = content(await costRowsDb(DEP.C)); const tok = await tokenOf(DEP.C);
    for (const [rows, code, w] of [[[{ kind: "COMMISSION", amountSatang: 1 }], "INVALID_INPUT", "kind"], [[{ kind: "BOAT", amountSatang: 1.25 }], "INVALID_INPUT", "ทศนิยม"], [[{ kind: "BOAT", amountSatang: 1, note: "a\u0000" }], "INVALID_INPUT", "NUL"],
      [[{ kind: "BOAT", amountSatang: 1, note: "=1+1\n@x" }], "INVALID_INPUT", "LF"], [[{ kind: "BOAT", amountSatang: 0 }], "COST_AMOUNT_INVALID", "0"], [[{ kind: "BOAT", amountSatang: 1_000_000_001 }], "COST_AMOUNT_INVALID", "เกิน"],
      [Array.from({ length: 31 }, () => ({ kind: "FUEL", amountSatang: 1 })), "COST_ROWS_LIMIT", "31"]] as const) codeR(await save("oa", DEP.C, tok, rows), code, w);
    codeR(await save("oa", DEP.C, 12345, []), "INVALID_INPUT", "token ตัวเลข"); codeR(await save("oa", DEP.C, "x".repeat(129), []), "INVALID_INPUT", "token ยาว");
    codeR(await call("saveDepartureCosts", ctxOf("oa"), { unitId: uA, departureId: DEP.C, expectedToken: tok, rows: [], extra: 1 }, optsR), "INVALID_INPUT", "คีย์เกิน");
    codeR(await save("oa", `${DEP.C}\u0000`, tok, []), ["INVALID_INPUT", "NOT_FOUND"], "NUL id");
    eq(content(await costRowsDb(DEP.C)), before, "ไม่เขียน"); eq(await tokenOf(DEP.C), tok, "token");
  });
  await st("CT-11", "แยกหน่วย/ร้าน: id แถวของรอบอื่น ⇒ NOT_FOUND ไม่เขียน · รอบหน่วย a2 ด้วย unitId a ⇒ NOT_FOUND · ผู้ใช้หน่วย a2 / เจ้าของร้าน B ⇒ NOT_FOUND (อ่าน+บันทึก)", async () => {
    needSetup(); const tok = await tokenOf(DEP.C); const foreign = (await costRowsDb(DEP.R))[0]; const b0 = content(await costRowsDb(DEP.C)), bR = content(await costRowsDb(DEP.R));
    codeR(await save("oa", DEP.C, tok, [{ id: foreign.id, kind: "BOAT", amountSatang: 1 }]), "NOT_FOUND", "id ของรอบอื่น"); eq([content(await costRowsDb(DEP.C)), content(await costRowsDb(DEP.R))], [b0, bR], "ไม่เขียน");
    codeR(await loadCosts("oa", DEP.A2, uA), "NOT_FOUND", "รอบหน่วยอื่น"); codeR(await save("oa", DEP.A2, "x", [], uA), "NOT_FOUND", "บันทึกรอบหน่วยอื่น");
    codeR(await loadCosts("a2", DEP.C), "NOT_FOUND", "a2"); codeR(await save("a2", DEP.C, tok, []), "NOT_FOUND", "a2 บันทึก");
    codeR(await call("loadDepartureCostsVM", ctxOf("ob"), { unitId: uA, departureId: DEP.C }, optsR), "NOT_FOUND", "ร้าน B");
    codeR(await call("saveDepartureCosts", ctxOf("ob"), { unitId: uA, departureId: DEP.C, expectedToken: tok, rows: [] }, optsR), "NOT_FOUND", "ร้าน B บันทึก");
  });
  await st("CT-12", "รอบยกเลิก (dX) แก้ต้นทุนได้: ลบจนว่าง ⇒ applied · คืนชุดเดิม", async () => {
    needSetup(); let tok = await tokenOf(DEP.X); const cur = await costRowsDb(DEP.X);
    ok(V(await save("oa", DEP.X, tok, []), "ลบหมด").applied === true, "ลบหมด"); eq((await costRowsDb(DEP.X)).length, 0, "ว่าง");
    tok = await tokenOf(DEP.X); ok(V(await save("oa", DEP.X, tok, cur.map((r) => ({ kind: r.kind, amountSatang: r.amountSatang, note: r.note }))), "คืน").applied === true, "คืน"); eq(content(await costRowsDb(DEP.X)), content(cur), "ชุดเดิม");
  });
  await st("CT-13", "VM dR (cost.view): rows เรียง createdAt · byKind ตาม TRIP_COST_KINDS · total 2,150,000 · ต่อที่นั่ง 143,333 · money.costSatang = total · state ENDED · estimate true", async () => {
    needSetup(); const vm = VM(await loadCosts("cvo", DEP.R), "dR"); const c = asRec(vm.costs) ?? {};
    const exp = [["BOAT", 1_200_000], ["FUEL", 350_000], ["GUIDE", 300_000], ["FOOD", 150_000], ["TRANSPORT", 150_000]];
    // ORACLE-EDIT CT-13 รอบ 2 (มติ Q12): byKind ไม่บังคับแล้ว (ส่งได้เฉพาะเมื่อจอแสดง — ตรวจใน R-12) · ถ้ายังส่ง ต้องตรงตามลำดับ TRIP_COST_KINDS
    eq(asArr(c.rows).map((r) => [r.kind, r.amountSatang]), exp, "rows"); if (c.byKind !== undefined) eq(asArr(c.byKind).map((r) => [r.kind, r.amountSatang]), exp, "byKind");
    eq([c.totalSatang, c.perSeatSatang, asRec(vm.money)?.costSatang, asRec(vm.departure)?.state, asRec(vm.departure)?.estimate], [2_150_000, 143_333, 2_150_000, "ENDED", true], "ค่า");
  });
  await st("CT-14", "ช่องทางของรอบ dR: WEB 1/2 · LIFF 1/3 · COUNTER 1/1 · AGENT_PORTAL 2/5 คอมฯ 199,500 (ร้านจด VAT ⇒ ไม่รวม VAT คอมฯ 7,350) · AGENT_LINK 1/4 คอมฯ 210,000 · Σ ยอดขาย = money.salesSatang", async () => {
    needSetup(); const vm = VM(await loadCosts("oa", DEP.R), "dR"); const ch = asArr(vm.channels);
    eq(ch.map((c) => [c.channel, c.group, c.bookings, c.seats, c.salesSatang, c.commissionCostSatang]),
      [["WEB", "DIRECT", 1, 2, 700_000, 0], ["LIFF", "DIRECT", 1, 3, 945_000, 0], ["COUNTER", "DIRECT", 1, 1, 350_000, 0], ["AGENT_PORTAL", "AGENT", 2, 5, 1_645_000, 199_500], ["AGENT_LINK", "AGENT", 1, 4, 1_400_000, 210_000]], "ช่องทาง");
    eq(ch.reduce((s, c) => s + Number(c.salesSatang), 0), asRec(vm.money)?.salesSatang, "Σ");
  });
  groupLine("CT");

  // ═══════════════ AC. ทางจริงของจอ: CostEditor → saveDepartureCostsAction → saveDepartureCosts ═══════════════
  // ORACLE-EDIT (ผู้คุม 19 พ.ย. · บทเรียน W1.3a: ข้อสอบเรียกบริการตรงแล้วพลาดว่า action ทิ้งช่องของฟอร์ม ⇒ หน้าจริงส่งไม่ได้)
  //   ตัวแก้ไม่ใช่ <form name=…> — เรียก action ด้วยออบเจ็กต์ที่ประกอบจาก state ⇒ AC-1 ตรวจในโค้ดว่าคีย์ที่ตัวแก้ส่ง = คีย์ที่ action อ่านและส่งต่อ
  //   AC-2…AC-5 เรียก action จริงในขอบเขตคำขอของ Next (เทคนิค qc-crm-c1.11: workAsyncStorage + workUnitAsyncStorage + คุกกี้ session จริงในตาราง Session)
  //   payload ประกอบแบบเดียวกับตัวแก้: แถวเดิมจาก VM ⇒ { id, kind, amountText: formatBaht(amountSatang), note: note ?? "" } · แถวใหม่ไม่มี id
  console.log("\n── AC: ตัวแก้ → server action → บริการ (ในขอบเขตคำขอของ Next) ──");
  (globalThis as Rec).AsyncLocalStorage ??= (await import("node:async_hooks")).AsyncLocalStorage;
  const nextWork = (await tryImport("next/dist/server/app-render/work-async-storage.external.js")).mod as Rec | null;
  const nextWorkUnit = (await tryImport("next/dist/server/app-render/work-unit-async-storage.external.js")).mod as Rec | null;
  const nextCookies = (await tryImport("next/dist/server/web/spec-extension/cookies.js")).mod as Rec | null;
  const ACT = await tryImport("@/lib/modules/trips/cost-actions");
  const SHARED = await tryImport("@/components/trips/trips-shared");
  const ENV = await tryImport("@/lib/env");
  const HASH = await tryImport("@/lib/core/hash");
  const SESSION_COOKIE = asRec(ENV.mod)?.secureCookies === false ? "shark_session" : "__Host-shark_session";
  const cookieOf: Record<string, string> = {};
  const needAct = async (tag: string): Promise<string> => {
    needSetup();
    ok(typeof ACT.mod?.saveDepartureCostsAction === "function", `ยังไม่มี saveDepartureCostsAction (${ACT.err.slice(0, 100)})`);
    ok(asRec(nextWork?.workAsyncStorage) && asRec(nextWorkUnit?.workUnitAsyncStorage) && typeof nextCookies?.RequestCookies === "function", "ตั้งขอบเขตคำขอของ Next ไม่ได้ (โมดูลภายในของ next หาย)");
    if (!cookieOf[tag]) {
      const token = `t17ac${randomBytes(24).toString("hex")}`; const sha = HASH.mod?.sha256 as AnyFn | undefined; ok(typeof sha === "function", "ไม่มี sha256");
      await insertRow("Session", { id: rid("ss"), userId: U[tag]?.userId, tokenHash: String((sha as AnyFn)(token)), idleExpiresAt: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + DAY), createdAt: new Date() });
      cookieOf[tag] = `${SESSION_COOKIE}=${token}; shark_tenant=${U[tag]?.tenantId}`;
    }
    return cookieOf[tag];
  };
  const SLUG_A = `${SLUG}a-${STAMP}`;
  /** เรียก action จริงแบบที่หน้า /trips/departures/<id>/costs เรียก (phase action) — throw (notFound/redirect) ⇒ { ok: "THROW" } */
  const act = async (tag: string, slug: string, input: unknown): Promise<Rec> => {
    const cookie = await needAct(tag);
    const path = `/app/u/${slug}/trips/departures/x/costs`;
    const req = new Request(`http://qc.local${path}`, { headers: { cookie, "user-agent": "qc-t17-ac" } });
    const jar = new (nextCookies?.RequestCookies as new (h: Headers) => unknown)(req.headers);
    const workStore = { route: path, page: `${path}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
    const unitStore = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname: path, search: "" } };
    const run = (s: Rec | null, store: unknown, f: () => unknown) => (s?.run as (st: unknown, f: () => unknown) => unknown).call(s, store, f);
    try {
      return asRec(await run(asRec(nextWork?.workAsyncStorage), workStore, () => run(asRec(nextWorkUnit?.workUnitAsyncStorage), unitStore, () => (ACT.mod?.saveDepartureCostsAction as AnyFn)(slug, input)))) ?? { ok: "NONE" };
    } catch (e) { return { ok: "THROW", e: errMsg(e), digest: String(asRec(e)?.digest ?? "") }; }
  };
  const fmtBaht = (n: number): string => { const f = SHARED.mod?.formatBaht; ok(typeof f === "function", `ไม่มี formatBaht (${SHARED.err.slice(0, 80)})`); return String((f as AnyFn)(n)); };
  /** payload แบบ CostEditor: แถวเดิมจาก VM + แถวใหม่ (ไม่มี id) */
  const editorPayload = (vm: Rec, extra: { kind: string; amountText: string; note: string }[] = [], edit: (r: Rec) => Rec = (r) => r) => ({
    departureId: asRec(vm.departure)?.id, expectedToken: asRec(vm.costs)?.token,
    rows: [...asArr(asRec(vm.costs)?.rows).map((r) => edit({ id: r.id, kind: r.kind, amountText: fmtBaht(Number(r.amountSatang)), note: (r.note as string | null) ?? "" })), ...extra],
  });
  const acState = async () => ({ rows: (await costRowsDb(DEP.AC)).map((r) => [r.kind, r.amountSatang, r.note]), audit: await auditCount("trips.cost.saved", DEP.AC), token: await tokenOf(DEP.AC) });
  await st("AC-1", "โค้ด: ตัวแก้ส่ง { departureId: vm.departure.id · expectedToken: vm.costs.token · rows: { id? · kind · amountText · note } } · action อ่าน body.departureId/expectedToken/rows แล้วส่งต่อบริการพร้อม unitId จาก slug · แปลงยอดด้วย costRowsFromForm(body.rows) · มติ Q3: ตัวแก้ไม่ผูก key กับ token (ข้อความบันทึกแล้วอยู่รอดหลังรีเฟรช) แต่ต้องรับชุดใหม่จาก VM เมื่อ token เปลี่ยน (setRows ผูกกับ vm.costs.token — กันแถวใหม่ไม่มี id ถูกสร้างซ้ำ) · มีตัวบอก “บันทึกแล้ว” ที่เทียบกับ token ของ VM", () => {
    needOwn(); const ed = stripComments(read(`${COMP}/CostEditor.tsx`)), ac = stripComments(read(ACTIONS)), sc = stripComments(read(`${COMP}/CostScreen.tsx`));
    const call0 = ed.slice(ed.indexOf("saveDepartureCostsAction("), ed.indexOf("saveDepartureCostsAction(") + 400);
    ok(ed.includes("saveDepartureCostsAction(") && /departureId:\s*vm\.departure\.id/.test(call0) && /expectedToken:\s*vm\.costs\.token/.test(call0), `ตัวแก้ไม่ส่ง departureId/expectedToken: ${call0.slice(0, 160)}`);
    ok(/\bid:\s*x\.id/.test(call0) && /kind:\s*x\.kind/.test(call0) && /amountText:\s*x\.amountText/.test(call0) && /note:\s*x\.note/.test(call0), "แถวที่ตัวแก้ส่งไม่ครบ id/kind/amountText/note");
    ok(!/amountSatang\s*:/.test(call0), "ตัวแก้ส่ง amountSatang (ต้องเป็นข้อความ)");
    ok(/costRowsFromForm\(\s*body\.rows\s*\)/.test(ac) && /departureId:\s*body\.departureId/.test(ac) && /expectedToken:\s*body\.expectedToken/.test(ac) && /unitId:\s*unit\.id/.test(ac), "action ไม่อ่าน/ไม่ส่งต่อ departureId · expectedToken · rows · unitId จาก slug");
    // ORACLE-EDIT AC-1 รอบ 2 (มติ Q3): เดิมบังคับ key = token ⇒ กลับข้าง
    ok(!/<CostEditor\b[^>]*\bkey=\{[^}]*token[^}]*\}/.test(sc), "CostScreen ยังผูก key ของตัวแก้กับ token (ข้อความบันทึกแล้วจะหายหลังรีเฟรช)");
    const tokIdx = [...ed.matchAll(/vm\.costs\.token/g)].map((m) => m.index ?? 0).filter((i) => i < ed.indexOf("saveDepartureCostsAction(") || i > ed.indexOf("saveDepartureCostsAction(") + 400);
    ok(tokIdx.some((i) => /setRows\(/.test(ed.slice(Math.max(0, i - 400), i + 400))), "ตัวแก้ไม่รับชุดใหม่จาก VM เมื่อ token เปลี่ยน (ไม่มี setRows ใกล้การอ้าง vm.costs.token นอกการเรียก action)");
    ok(tokIdx.some((i) => /[!=]==?\s*vm\.costs\.token|vm\.costs\.token\s*[!=]==?/.test(ed.slice(Math.max(0, i - 60), i + 60))), "ไม่มีตัวบอกบันทึกแล้วที่เทียบกับ vm.costs.token");
  });
  let acTok = "";
  await st("AC-2", "OWNER ผ่าน action: แถวใหม่ 3 แถว \"1,250.50\" / \" 300 \" / \"12,000\" ⇒ applied · ในฐาน (เรียง createdAt) = BOAT 125050 \"เรือ AC\" · FUEL 30000 null · GUIDE 1200000 \"ไกด์\" · audit 1 แถว actor = ผู้ใช้ของคุกกี้ · เปิดตัวแก้ใหม่จาก VM แล้วกดบันทึกโดยไม่แก้ ⇒ applied false · ไม่มี audit เพิ่ม", async () => {
    const vm = VM(await loadCosts("oa", DEP.AC), "load AC");
    const r = await act("oa", SLUG_A, editorPayload(vm, [{ kind: "BOAT", amountText: "1,250.50", note: "เรือ AC" }, { kind: "FUEL", amountText: " 300 ", note: "" }, { kind: "GUIDE", amountText: "12,000", note: "  ไกด์ " }]));
    ok(r.ok === true && asRec(r.value)?.applied === true, `action: ${fmt(r)}`);
    const s = await acState();
    eq(s.rows, [["BOAT", 125_050, "เรือ AC"], ["FUEL", 30_000, null], ["GUIDE", 1_200_000, "ไกด์"]], "แถวในฐาน");
    eq([s.audit, (await q<{ a: string }>(`SELECT "actorId" AS a FROM "AuditLog" WHERE action = 'trips.cost.saved' AND "targetId" = $1`, [DEP.AC]))[0]?.a], [1, U.oa.userId], "audit");
    eq(asRec(r.value)?.token, s.token, "token ที่ action คืน = token ปัจจุบัน");
    const vm2 = VM(await loadCosts("oa", DEP.AC), "reload");
    const p2 = editorPayload(vm2); eq(asArr(p2.rows).map((x) => x.amountText), ["1,250.50", "300.00", "12,000.00"], "ข้อความยอดที่ตัวแก้เติมจาก VM");
    const r2 = await act("oa", SLUG_A, p2); ok(r2.ok === true && asRec(r2.value)?.applied === false, `บันทึกโดยไม่แก้: ${fmt(r2)}`);
    const s2 = await acState(); eq([s2.rows, s2.audit, s2.token], [s.rows, 1, s.token], "ไม่เขียน");
    acTok = s.token;
  });
  await st("AC-3", "ยอดผิดผ่าน action: \"1,2a\" / \"12.345\" / \"abc\" ⇒ COST_AMOUNT_FORMAT + row (มติ Q4) · \"0\" ⇒ COST_AMOUNT_INVALID · หมายเหตุ bidi ⇒ COST_NOTE_INVISIBLE + row + field note (U4 U6) · ไม่เขียน · token/audit เดิม · ข้อความไม่สะท้อนอินพุต", async () => {
    const vm = VM(await loadCosts("oa", DEP.AC), "load"); const before = await acState();
    for (const [txt, code] of [["1,2a", "COST_AMOUNT_FORMAT"], ["12.345", "COST_AMOUNT_FORMAT"], ["abc", "COST_AMOUNT_FORMAT"], ["0", "COST_AMOUNT_INVALID"]] as const) {
      const r = await act("oa", SLUG_A, editorPayload(vm, [{ kind: "OTHER", amountText: txt, note: "" }]));
      codeR(r, code, txt); ok(txt.length < 2 || !String(r.message ?? "").includes(txt), `ข้อความสะท้อนอินพุต ${txt}`);
      if (code === "COST_AMOUNT_FORMAT") eq(r.row, 3, `row ของ ${txt} (มติ Q4 · action ส่งต่อ)`); // ORACLE-EDIT AC-3 รอบ 2
    }
    const r5 = await act("oa", SLUG_A, editorPayload(vm, [], (x) => (x.kind === "FUEL" ? { ...x, amountText: "3OO" } : x))); codeR(r5, "COST_AMOUNT_FORMAT", "แก้แถวเดิมเป็นยอดผิด"); eq(r5.row, 1, "row ของแถว FUEL (มติ Q4)");
    const r6 = await act("oa", SLUG_A, editorPayload(vm, [{ kind: "OTHER", amountText: "10", note: "a\u202Eb" }])); codeR(r6, NOTE_CODE, "หมายเหตุ bidi (มติ U4)"); eq([r6.row, r6.field], [3, "note"], "row/field ของหมายเหตุผิด (มติ Q4 Q13 U4 U6)");
    eq(await acState(), before, "ไม่เขียน");
  });
  await st("AC-4", "พนักงาน trips.cost.edit ผ่าน action แก้ยอด FUEL เป็น \"350.25\" ⇒ applied (35025) · แล้ว OWNER ส่งด้วย token เดิมของ AC-2 เนื้อหาต่าง ⇒ STATE_CONFLICT · ไม่เขียน", async () => {
    const vm = VM(await loadCosts("ce", DEP.AC), "load ce");
    const r = await act("ce", SLUG_A, editorPayload(vm, [], (x) => (x.kind === "FUEL" ? { ...x, amountText: "350.25" } : x)));
    ok(r.ok === true && asRec(r.value)?.applied === true, `ce: ${fmt(r)}`);
    const s = await acState(); eq(s.rows, [["BOAT", 125_050, "เรือ AC"], ["FUEL", 35_025, null], ["GUIDE", 1_200_000, "ไกด์"]], "แถวหลัง ce");
    ok(acTok && acTok !== s.token, "token ต้องเปลี่ยน");
    const stale = { ...editorPayload(vm, [{ kind: "FOOD", amountText: "99", note: "" }]), expectedToken: acTok };
    codeR(await act("oa", SLUG_A, stale), "STATE_CONFLICT", "token เก่า"); eq(await acState(), s, "ไม่เขียน");
  });
  await st("AC-5", "ปฏิเสธที่ action: cost.view · cost.view+report.view · trips.* (STAFF) · report.view · booking.view · departure.view · ไม่มีสิทธิ์ ⇒ FORBIDDEN ไม่มีตัวเลข · MANAGER ⇒ ได้ · รอบหน่วยอื่นผ่าน slug หน่วยนี้ ⇒ NOT_FOUND · slug หน่วยที่ผู้ใช้เข้าไม่ได้ / ร้านอื่น ⇒ ไม่ผ่าน (notFound) · ไม่เขียนทุกกรณีที่ถูกปฏิเสธ", async () => {
    const vm = VM(await loadCosts("oa", DEP.AC), "load"); const before = await acState(); const a2Before = content(await costRowsDb(DEP.A2));
    const p = editorPayload(vm, [{ kind: "OTHER", amountText: "1,000", note: "" }]); const bad: string[] = [];
    for (const t of ["cvo", "cv", "wild", "rv", "bv", "dv", "none"]) {
      const r = await act(t, SLUG_A, p);
      if (r.ok !== false || r.code !== "FORBIDDEN") bad.push(`${t}: ${fmt(r)}`); else if (/\d{4,}/.test(String(r.message ?? "")) || hasNum(JSON.stringify(r), [125_050, 1_200_000, 35_025]).length) bad.push(`${t}: ข้อความมีตัวเลข`);
    }
    ok(bad.length === 0, bad.slice(0, 3).join(" · ")); eq(await acState(), before, "ไม่เขียน (ปฏิเสธ)");
    codeR(await act("oa", SLUG_A, { ...p, departureId: DEP.A2, unitId: uA2 }), "NOT_FOUND", "รอบหน่วย a2 ผ่าน slug a (unitId ใน input ไม่มีผล)");
    for (const [t, slug] of [["a2", SLUG_A], ["ob", SLUG_A], ["mgx", SLUG_A]] as const) { const r = await act(t, slug, p); ok(r.ok !== true, `${t} ต้องไม่ผ่าน: ${fmt(r)}`); }
    eq([await acState(), content(await costRowsDb(DEP.A2))], [before, a2Before], "ไม่เขียน (หน่วย/ร้านอื่น)");
    const rm = await act("mg", SLUG_A, p); ok(rm.ok === true && asRec(rm.value)?.applied === true, `MANAGER: ${fmt(rm)}`);
    eq((await acState()).audit, before.audit + 1, "MANAGER audit +1");
  });
  groupLine("AC");

  // ═══════════════ PN. การ์ดเงิน / departureMoneySummary ═══════════════
  console.log("\n── PN: การ์ดเงินระดับรอบ ──");
  const MK2 = ["bookings", "cancelledBookings", "pendingRefundBookings", "seats", "sold", "capacity", "loadFactorBp", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang",
    "costSatang", "costRows", "grossProfitSatang", "marginBp", "collectedSatang", "outstandingSatang", "heldSatang", "retainedSatang", "agentCollectBookings", "noShowUnpaid", "pendingBookings", "state", "estimate", "vatMode", "charterLike"];
  const DR = [6, 0, 0, 15, 15, 24, 6250, 5_040_000, 840_000, 329_718, 4_710_282, 409_500, 2_150_000, 5, 2_150_782, 4566, 1_915_000, 410_000, 0, 0, 3, 0, 2, "ENDED", true, "REGISTERED", false];
  await st("PN-1", "OWNER แผงรอบ dR money = ภาพ 11 (ยอดจอง 5,040,000 · อุทยาน 840,000 · VAT 329,718 · คอมฯ 409,500 · ต้นทุน 2,150,000 · กำไรก่อน VAT 2,150,782) · รับแล้ว 1,915,000 · ค้าง 410,000 · เอเจนซี่เก็บเงิน 3 · รอ 2 · ENDED · ประมาณการ · actions.costs", async () => {
    needSetup(); const vm = VM(await panel("oa"), "panel");
    eq(pick(asRec(vm.money) ?? {}, MK2), DR, "money"); eq(asRec(vm.actions)?.costs, true, "actions.costs");
  });
  await st("PN-2", "departureMoneySummary = แผงรอบ = จอต้นทุน (ตัวคิดเดียว · dR ทุกช่อง)", async () => {
    needSetup(); const a = pick(await sumV("oa", DEP.R), MK2), b = pick(asRec(VM(await panel("oa"), "panel").money) ?? {}, MK2), c = pick(asRec(VM(await loadCosts("oa", DEP.R), "costs").money) ?? {}, MK2);
    eq([a, b], [DR, DR], "summary/panel"); eq(c, DR, "จอต้นทุน");
  });
  await st("PN-3", "dN (N6): ยอดขาย 1,000,000 (NO_SHOW นับ 300,000 ที่รับ) · เก็บแทน 60,000 · VAT 65,420 · ก่อน VAT 934,580 · ต้นทุน 500,000 · กำไร 434,580 · 4650 bp · รับแล้ว 1,060,000 · ค้าง 0 · ยกเลิก 1 เก็บไว้ 350,000 · ไม่มาและยังไม่จ่ายครบ 1 · ที่นั่ง 3 = sold (ทารกไม่นับ)", async () => {
    needSetup();
    eq(pick(await sumV("oa", DEP.N), MK2), [2, 1, 0, 3, 3, 12, 2500, 1_000_000, 60_000, 65_420, 934_580, 0, 500_000, 2, 434_580, 4650, 1_060_000, 0, 0, 350_000, 0, 1, 0, "ENDED", true, "REGISTERED", false], "dN");
  });
  await st("PN-4", "dX รอบยกเลิก (N5): การจองที่ยังค้างในรอบยกเลิก ⇒ รอคืนเงิน 1 การจอง 820,000 · ไม่นับยอดขาย · ต้นทุน 120,000 ⇒ กำไร −120,000 · อัตราเต็ม null · CANCELLED", async () => {
    needSetup(); eq(pick(await sumV("oa", DEP.X), MK2), [0, 1, 1, 2, 2, 24, null, 0, 0, 0, 0, 0, 120_000, 1, -120_000, null, 0, 0, 820_000, 0, 0, 0, 0, "CANCELLED", true, "REGISTERED", false], "dX");
  });
  await st("PN-5", "dQ (N5): คำขอคืนเงิน REQUESTED ⇒ รอคืนเงิน (410,000) · คำขอ REJECTED ⇒ นับปกติ (ยอดขาย 350,000 · รับ 410,000)", async () => {
    needSetup(); const m = await sumV("oa", DEP.Q);
    eq(pick(m, ["bookings", "pendingRefundBookings", "heldSatang", "salesSatang", "collectedSatang", "seats", "sold"]), [1, 1, 410_000, 350_000, 410_000, 2, 2], "dQ");
  });
  await st("PN-6", "หน่วยไม่จด VAT (N3 N8): vatMode NOT_REGISTERED · VAT 0 · ต้นทุนคอมฯ = 100,000 + 7,000 · กำไร 743,000 · เอเจนซี่เก็บเงิน 1 ค้าง 0 · ไม่มีคำเตือน VAT_STATUS_UNKNOWN", async () => {
    needSetup(); const m = await sumV("oa", DEP.V, uN);
    eq(pick(m, ["vatMode", "salesSatang", "vatSatang", "revenueExVatSatang", "commissionCostSatang", "costSatang", "grossProfitSatang", "marginBp", "agentCollectBookings", "outstandingSatang", "collectedSatang"]),
      ["NOT_REGISTERED", 1_050_000, 0, 1_050_000, 107_000, 200_000, 743_000, 7076, 1, 0, 410_000], "dV");
    ok(!asArr(m.warnings).some((w) => w.code === "VAT_STATUS_UNKNOWN"), "เตือน VAT ไม่ระบุ");
  });
  await st("PN-7", "หน่วยไม่ระบุสถานะ VAT (a2): vatMode UNKNOWN + คำเตือน VAT_STATUS_UNKNOWN · หน่วย a (จด VAT) ไม่มีคำเตือนนี้", async () => {
    needSetup(); const m = await sumV("a2", DEP.A2, uA2);
    eq(m.vatMode, "UNKNOWN", "vatMode"); ok(asArr(m.warnings).some((w) => w.code === "VAT_STATUS_UNKNOWN"), `ไม่มีคำเตือน: ${fmt(m.warnings)}`);
    ok(!asArr((await sumV("oa", DEP.R)).warnings).some((w) => w.code === "VAT_STATUS_UNKNOWN"), "หน่วย a ไม่ควรเตือน");
  });
  await st("PN-8", "คำเตือน (N11): dN ⇒ PARK_FEE_WITH_PASS_THROUGH (ผู้เห็นต้นทุนเท่านั้น · rv ไม่เห็น) · dS ⇒ SUPPLIER_COSTS_NOT_INCLUDED · FX_BOOKINGS n=1 · OTA_FEES_NOT_INCLUDED n=1 · SNAPSHOT_FALLBACK n=1 (แถวเสียโดยเจตนา) · เรียงตาม MONEY_WARNING_CODES", async () => {
    needSetup();
    ok(asArr((await sumV("oa", DEP.N)).warnings).some((w) => w.code === "PARK_FEE_WITH_PASS_THROUGH"), "dN owner");
    ok(!asArr((await sumV("rv", DEP.N)).warnings).some((w) => w.code === "PARK_FEE_WITH_PASS_THROUGH"), "dN rv ไม่ควรเห็น");
    const ws = asArr((await sumV("oa", DEP.S)).warnings).map((w) => [w.code, w.n ?? null]);
    eq(ws, [["SUPPLIER_COSTS_NOT_INCLUDED", null], ["SNAPSHOT_FALLBACK", 1], ["FX_BOOKINGS", 1], ["OTA_FEES_NOT_INCLUDED", 1]], "dS");
  });
  await st("PN-9", "เหมาลำ (ตัวบ่งชี้ชั่วคราว · C9): dH 1 การจอง 10/10 ⇒ charterLike true · อัตราเต็ม 10000 · dR false", async () => {
    needSetup(); eq(pick(await sumV("oa", DEP.H), ["charterLike", "loadFactorBp", "seats", "sold"]), [true, 10_000, 10, 10], "dH");
  });
  await st("PN-10", "สิทธิ์การ์ดเงิน: booking.view / report.view / trips.* ⇒ ยอดขายครบ ต้นทุน คอมฯ กำไร มาร์จิน costRows = null + actions.costs false · cost.view อย่างเดียว ⇒ ครบ · departure.view อย่างเดียว ⇒ money null", async () => {
    needSetup();
    for (const t of ["bv", "rv", "wild"]) {
      const vm = VM(await panel(t), t); const m = asRec(vm.money) ?? {};
      eq(pick(m, ["salesSatang", "passThroughSatang", "vatSatang", "collectedSatang", "commissionCostSatang", "costSatang", "costRows", "grossProfitSatang", "marginBp"]), [5_040_000, 840_000, 329_718, 1_915_000, null, null, null, null, null], `${t} money`);
      eq(asRec(vm.actions)?.costs, false, `${t} actions.costs`);
    }
    eq(pick(asRec(VM(await panel("cvo"), "cvo").money) ?? {}, ["costSatang", "grossProfitSatang"]), [2_150_000, 2_150_782], "cvo");
    const d = VM(await panel("dv"), "dv"); eq([d.money, asRec(d.actions)?.costs], [null, false], "dv");
  });
  await st("PN-11", "departureMoneySummary ด่าน: departure.view อย่างเดียว / ขาด departure.view / ไม่มีสิทธิ์ ⇒ FORBIDDEN · รอบหน่วยอื่น / MANAGER หน่วยอื่น / ร้าน B ⇒ NOT_FOUND · คีย์เกิน ⇒ INVALID_INPUT", async () => {
    needSetup();
    for (const t of ["dv", "nodv", "none"]) codeR(await summary(t, DEP.R), "FORBIDDEN", t);
    codeR(await summary("oa", DEP.A2), "NOT_FOUND", "รอบหน่วยอื่น"); codeR(await summary("mgx", DEP.R), "NOT_FOUND", "mgx");
    codeR(await call("departureMoneySummary", ctxOf("ob"), { unitId: uA, departureId: DEP.R }, optsR), "NOT_FOUND", "ร้าน B");
    codeR(await call("departureMoneySummary", ctxOf("oa"), { unitId: uA, departureId: DEP.R, x: 1 }, optsR), "INVALID_INPUT", "คีย์เกิน");
  });
  await st("PN-12", "ร้าน seed อ่านอย่างเดียว: departureMoneySummary ราชา 14 พ.ย. (OWNER · now TRIPS_AS_OF) ตรงยอดที่คิดซ้ำจากแถวดิบ · ต้นทุน 0 · costRows 0 · ไม่เขียนฐาน seed", async () => {
    ok(seedRaw, "PC-6 ต้องผ่านก่อน"); const raw = seedRaw ?? { sales: 0, pt: 0, vat: 0, commission: 0, live: 0 };
    const m = V(await call("departureMoneySummary", SEED, { unitId: U0, departureId: seedDep }, { now: AS_OF }), "seed");
    eq(pick(m, ["bookings", "salesSatang", "passThroughSatang", "vatSatang", "revenueExVatSatang", "costSatang", "costRows", "estimate"]), [raw.live, raw.sales, raw.pt, raw.vat, raw.sales - raw.vat, 0, 0, true], "seed");
    eq(pick(m, ["grossProfitSatang", "marginBp", "noCosts"]), [null, null, true], "ไม่มีแถวต้นทุน ⇒ ไม่แสดงกำไร (มติ Q2 · ORACLE-EDIT PN-12 รอบ 2)");
    eq(await seedCounts(), seedBefore, "seed ไม่ถูกเขียน");
  });
  // ORACLE-EDIT (ผู้คุม 19 พ.ย.): ข้อตัดสินที่ builder ประกาศ แต่ข้อเดิมพิสูจน์ไม่ครบ
  await st("PN-13", "actions.costs (§4.3) = departure.view ∧ costAccessOf.view: OWNER · MANAGER · cost.view · cost.view+report.view · cost.edit ⇒ true · booking.view · report.view · trips.* · departure.view อย่างเดียว ⇒ false · ทุกคนที่ true ได้ money ที่มีต้นทุน", async () => {
    needSetup(); const got: Record<string, unknown> = {};
    for (const t of ["oa", "mg", "cvo", "cv", "ce", "bv", "rv", "wild", "dv"]) { const vm = VM(await panel(t), t); got[t] = [asRec(vm.actions)?.costs, asRec(vm.money)?.costSatang ?? null]; }
    eq(got, { oa: [true, 2_150_000], mg: [true, 2_150_000], cvo: [true, 2_150_000], cv: [true, 2_150_000], ce: [true, 2_150_000], bv: [false, null], rv: [false, null], wild: [false, null], dv: [false, null] }, "actions.costs");
  });
  await st("PN-14", "ร้านไม่จด VAT (N8) ระดับช่องทาง: จอต้นทุน dV ทุกช่องทาง revenueExVatSatang = salesSatang · money.vatSatang 0 · revenueExVat = sales", async () => {
    needSetup(); const vm = VM(await loadCosts("oa", DEP.V, uN), "dV"); const ch = asArr(vm.channels); const m = asRec(vm.money) ?? {};
    ok(ch.length >= 2 && ch.every((c) => c.revenueExVatSatang === c.salesSatang), `ช่องทาง: ${fmt(ch.map((c) => [c.channel, c.salesSatang, c.revenueExVatSatang]))}`);
    eq([m.vatSatang, m.revenueExVatSatang], [0, m.salesSatang], "money");
  });
  groupLine("PN");

  // ═══════════════ RC. กระทบยอด ═══════════════
  console.log("\n── RC: กระทบยอด ──");
  await st("RC-1", "การจอง LIVE ที่ร้านเก็บเงิน (ไม่มีคืน/จ่ายเกิน): รับแล้ว + ค้างรับ ของ dR = Σ payable จากแถวดิบของการจองที่ร้านเก็บ · การจองเอเจนซี่ไม่อยู่ในค้างรับ", async () => {
    needSetup();
    const raw = (await q<{ p: number }>(`SELECT COALESCE(sum((b."policySnapshot"->'totals'->>'payableSatang')::int), 0)::int AS p FROM "TripBooking" b WHERE b."departureId" = $1 AND b.status = ANY($2::text[]) AND b."agentAccountId" IS NULL AND b."collectMode" = 'SHOP'`, [DEP.R, LIVE]))[0]?.p;
    const m = await sumV("oa", DEP.R); eq([Number(m.collectedSatang) + Number(m.outstandingSatang), raw], [2_325_000, 2_325_000], "รับ+ค้าง = payable");
  });
  await st("RC-2", "การจองยกเลิก: retainedSatang (dN) = Σ(จ่าย − คืน) จากแถวดิบ = Σ RETAINED.amount · ยอดขาย+เก็บแทนส่วนยกเลิก = เงินที่เก็บไว้", async () => {
    needSetup();
    const r = (await q<{ d: number; e: number }>(`SELECT COALESCE(sum(b."paidSatang" - b."refundedSatang"), 0)::int AS d, COALESCE((SELECT sum(e."amountSatang") FROM "TripMoneyEvent" e JOIN "TripBooking" x ON x.id = e."bookingId" WHERE x."departureId" = $1 AND e.kind = 'RETAINED'), 0)::int AS e
      FROM "TripBooking" b WHERE b."departureId" = $1 AND b.status = 'CANCELLED'`, [DEP.N]))[0];
    eq([(await sumV("oa", DEP.N)).retainedSatang, r?.d, r?.e], [350_000, 350_000, 350_000], "retained");
  });
  await st("RC-3", "ที่นั่งกับ sold ฐานเดียวกัน (N11 · countsCapacity): money.seats = money.sold ทุกรอบฟิกซ์เจอร์ (dR dN dX dQ dH dV)", async () => {
    needSetup(); const bad: string[] = [];
    for (const [k, u] of [["R", uA], ["N", uA], ["X", uA], ["Q", uA], ["H", uA], ["V", uN]] as const) { const m = await sumV("oa", DEP[k], u); if (m.seats !== m.sold) bad.push(`${k}: ${m.seats}/${m.sold}`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("RC-4", "ยอดขาย = Σ ช่องทางของจอต้นทุน (dN · มีการจองยกเลิก) · กำไร = รายได้ก่อน VAT − ต้นทุนคอมฯ − ต้นทุน (ทุกรอบที่ OWNER เห็น)", async () => {
    needSetup(); const vm = VM(await loadCosts("oa", DEP.N), "dN");
    eq(asArr(vm.channels).reduce((s, c) => s + Number(c.salesSatang), 0), asRec(vm.money)?.salesSatang, "Σ ช่องทาง");
    for (const [k, u] of [["R", uA], ["N", uA], ["X", uA], ["V", uN]] as const) { const m = await sumV("oa", DEP[k], u); eq(m.grossProfitSatang, Number(m.revenueExVatSatang) - Number(m.commissionCostSatang) - Number(m.costSatang), `กำไร ${k}`); }
  });
  groupLine("RC");

  // ═══════════════ LK. การรั่วของต้นทุน ═══════════════
  console.log("\n── LK: การรั่วของต้นทุน (N9) ──");
  await st("LK-1", "แผงรอบทั้งก้อน (ข้อมูลที่หน้าส่งลงคอมโพเนนต์) ของ booking.view / report.view / trips.* ไม่มีตัวเลขต้นทุน/กำไร/คอมฯ (2,150,000 · 2,150,782 · 409,500 · 143,333 · 1,200,000) และสแกนคีย์ต้นทุนทั้งต้นไม้ = null", async () => {
    needSetup(); const bad: string[] = [];
    for (const t of ["bv", "rv", "wild"]) { const vm = VM(await panel(t), t); const hit = hasNum(JSON.stringify(vm), COST_NUMS); if (hit.length) bad.push(`${t}: ${hit.join(",")}`); bad.push(...costLeaks(vm.money, `${t}.money`)); }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("LK-2", "departureMoneySummary ของ report.view / trips.*: ไม่มีตัวเลขต้นทุนในผลทั้งก้อน · คีย์ต้นทุน null · คำเตือนไม่บอกว่ามีแถวต้นทุน", async () => {
    needSetup(); const bad: string[] = [];
    for (const t of ["rv", "wild"]) for (const d of [DEP.R, DEP.N]) { const r = await summary(t, d); const hit = hasNum(JSON.stringify(r), [...COST_NUMS, 500_000, 400_000, 100_000]); if (hit.length) bad.push(`${t}: ${hit.join(",")}`); bad.push(...costLeaks(r.value, t)); }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("LK-3", "ผลปฏิเสธ (FORBIDDEN) ของจอต้นทุน/บันทึก/สรุปเงิน สำหรับ trips.* · report.view · booking.view: ไม่มีตัวเลข ≥ 4 หลักและไม่มีตัวเลขต้นทุน", async () => {
    needSetup(); const tok = await tokenOf(DEP.R); const bad: string[] = [];
    for (const t of ["wild", "rv", "bv"]) for (const r of [await loadCosts(t, DEP.R), await save(t, DEP.R, tok, [{ kind: "BOAT", amountSatang: 1 }])]) {
      if (r.ok !== false || r.code !== "FORBIDDEN") bad.push(`${t}: ${fmt(r)}`); else if (/\d{4,}/.test(String(r.message ?? "")) || hasNum(JSON.stringify(r), COST_NUMS).length) bad.push(`${t}: ข้อความมีตัวเลข`);
    }
    const d = await summary("dv", DEP.R); if (/\d{4,}/.test(String(d.message ?? ""))) bad.push("dv summary");
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  });
  await st("LK-4", "ร้าน/หน่วยอื่น: VM ของหน่วย a ไม่มีต้นทุน 999,900 ของหน่วย a2/ร้าน B · ผลปฏิเสธข้ามร้านไม่มีตัวเลขของรอบ", async () => {
    needSetup();
    ok(hasNum(JSON.stringify(VM(await loadCosts("oa", DEP.R), "a")), [999_900]).length === 0, "หน่วย a มีตัวเลขหน่วยอื่น");
    const r = await call("loadDepartureCostsVM", ctxOf("ob"), { unitId: uA, departureId: DEP.R }, optsR); ok(hasNum(JSON.stringify(r), COST_NUMS).length === 0, "ผลปฏิเสธมีตัวเลข");
  });
  groupLine("LK");

  // ═══════════════ R. มติผู้คุม รอบ 2 (Q1–Q14) — ORACLE-EDIT ผู้คุม 19 พ.ย. ═══════════════
  // Q1 อยู่ใน CT-2/CT-5 · Q3 (โค้ด) อยู่ใน AC-1 · Q4 (action) อยู่ใน AC-3 · ที่เหลืออยู่ที่นี่ · ฟิกซ์เจอร์ของกลุ่มนี้สร้างหลัง PC-7 (มีแถว snapshot เสียโดยเจตนาหลายแบบ)
  console.log("\n── R: มติผู้คุม รอบ 2 (Q2–Q14) ──");
  const req = createRequire(import.meta.url);
  let renderErr = "";
  const RX = (() => { try { return { intl: req("next-intl") as Rec, ui: req("use-intl") as Rec, arc: req("next/dist/shared/lib/app-router-context.shared-runtime.js") as Rec, react: req("react") as Rec, rds: req("react-dom/server") as Rec }; } catch (e) { renderErr = errMsg(e); return null; } })();
  const PARTS = await tryImport("@/components/trips/CostParts");
  const SCREEN = await tryImport("@/components/trips/CostScreen");
  const STAFF = await tryImport("@/lib/staff/service");
  const unent = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  /** เรนเดอร์คอมโพเนนต์จริงด้วย NextIntlClientProvider + AppRouterContext (คอมโพเนนต์ client ใช้ useTranslations/useRouter) */
  const render = (comp: unknown, props: Rec, locale: "th" | "en" = "th"): string => {
    ok(RX, `เรนเดอร์ไม่ได้ (${renderErr})`); ok(typeof comp === "function", "ไม่มีคอมโพเนนต์");
    const ce = RX?.react.createElement as AnyFn; const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
    const el = ce(asRec(RX?.arc.AppRouterContext)?.Provider, { value: router }, ce(RX?.intl.NextIntlClientProvider, { locale, messages: { trips: locale === "th" ? th : en }, timeZone: "Asia/Bangkok" }, ce(comp, props)));
    return String((RX?.rds.renderToStaticMarkup as AnyFn)(el));
  };
  const card = (money: unknown, locale: "th" | "en" = "th") => render(PARTS.mod?.CostMoneyCard, { money }, locale);
  const screen = (vm: unknown, locale: "th" | "en" = "th") => render(SCREEN.mod?.default, { vm }, locale);
  /** เนื้อของ element ที่มี data-testid (ตัดถึงแท็กปิดชนิดเดียวกันตัวที่สมดุล) */
  const byTestid = (html: string, id: string): string => {
    const i = html.indexOf(`data-testid="${id}"`); if (i < 0) return "";
    const st0 = html.lastIndexOf("<", i); const tag = /^<(\w+)/.exec(html.slice(st0))?.[1] ?? "div";
    let depth = 0; const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g"); re.lastIndex = st0;
    for (let m = re.exec(html); m; m = re.exec(html)) { if (m[2]) continue; depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(st0, m.index + m[0].length); }
    return html.slice(st0);
  };
  const R: Record<string, string> = {};
  let rErr = "";
  const needR = async () => {
    needSetup(); if (rErr) throw new AssertFail(`ฟิกซ์เจอร์ R: ${rErr}`); if (R.F) return;
    try {
      const D = mkDepR as NonNullable<typeof mkDepR>, B = mkBkR as NonNullable<typeof mkBkR>;
      // Q7: payableSatang ใช้ไม่ได้ 5 แบบ (ลบ · ใหญ่เกิน · ทศนิยม · สตริง · เกิน int4) ⇒ fallback (gross − ส่วนลด) + คำเตือน
      R.F = await D("RF", "PR", "2027-07-01", { cap: 10, sold: 5, status: "OPEN" });
      for (const [i, v] of ([-1, 1e21, 1.5, "1095000", 3_000_000_000] as unknown[]).entries()) await B(`f${i}`, { dep: R.F, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-06-01T03:00:00Z", payableJson: v });
      // Q7: สรุปเงินล้ม (ผลรวม RETAINED เกิน int4) ต้องไม่ล้มทั้งแผง
      R.G = await D("RG", "PR", "2027-07-02", { cap: 10, sold: 1, status: "OPEN" });
      await B("gP", { dep: R.G, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-06-01T03:00:00Z" });
      await B("gC", { dep: R.G, prod: "PR", status: "CANCELLED", channel: "WEB", adults: 1, created: "2027-06-01T04:00:00Z", retained: [{ amountSatang: 2_000_000_000, vatSatang: 0, passThroughSatang: 0 }, { amountSatang: 2_000_000_000, vatSatang: 0, passThroughSatang: 0 }] });
      // Q8 + Q9: ราคาไม่รวม VAT ไม่มี totals ⇒ fallback บวก VAT · HOLD/CANCELLED ที่ snapshot เสียไม่นับในคำเตือน
      R.E = await D("RE", "PR", "2027-07-03", { cap: 10, sold: 1, status: "OPEN" });
      await B("eX", { dep: R.E, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-06-01T03:00:00Z", pricesIncludeVat: false, snapshot: "noTotals" });
      await B("eH", { dep: R.E, prod: "PR", status: "HOLD", channel: "WEB", adults: 1, created: "2027-06-01T04:00:00Z", snapshot: "corrupt" });
      await B("eC", { dep: R.E, prod: "PR", status: "CANCELLED", channel: "WEB", adults: 1, created: "2027-06-01T05:00:00Z", snapshot: "corrupt" });
      // Q10: หน่วยไม่จด VAT · snapshot ไม่มี tax.vatRegistered ⇒ ต้นทุนคอมฯ รวม VAT คอมฯ
      R.U = await D("RU", "PN", "2027-07-04", { cap: 10, sold: 2, status: "OPEN" });
      await B("uAg", { dep: R.U, prod: "PN", status: "CONFIRMED", channel: "AGENT_LINK", adults: 2, agent: true, commission: 100_000, commissionVat: 7_000, created: "2027-06-01T03:00:00Z", omitVatReg: true });
      // Q11: หน่วยไม่จด VAT วันนี้ แต่การจองเก่ามี VAT · หน่วยจด VAT แต่การจองทุกใบ VAT 0
      R.K = await D("RK", "PN", "2027-07-05", { cap: 10, sold: 1, status: "OPEN" });
      await B("kV", { dep: R.K, prod: "PN", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-06-01T03:00:00Z", snapVatReg: true });
      R.Z = await D("RZ", "PR", "2027-07-06", { cap: 10, sold: 1, status: "OPEN" });
      await B("zN", { dep: R.Z, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-06-01T03:00:00Z", snapVatReg: false });
      // Q12: รอบยกเลิก — การจองยังค้างที่ไม่มีเงินรับ ไม่ใช่ "รอคืนเงิน" · การจองที่จ่ายแล้วเป็น
      // U3 (ORACLE-EDIT รอบ 3): หน่วย a2 สถานะ VAT ไม่ระบุ · การจองเอเจนซี่ snapshot ไม่จด VAT ⇒ VAT คอมฯ ถูกนับเป็นต้นทุน
      R.W = await D("RW", "PA2", "2027-07-09", { cap: 10, sold: 2, status: "OPEN" });
      await B("wAg", { dep: R.W, prod: "PA2", status: "CONFIRMED", channel: "AGENT_LINK", adults: 2, agent: true, commission: 100_000, commissionVat: 7_000, created: "2027-06-01T03:00:00Z", snapVatReg: false });
      R.Y = await D("RY", "PR", "2027-07-07", { cap: 10, sold: 2, status: "CANCELLED" });
      await B("yU", { dep: R.Y, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-06-01T03:00:00Z" });
      await B("yP", { dep: R.Y, prod: "PR", status: "PAID", channel: "WEB", adults: 1, paid: 410_000, created: "2027-06-01T04:00:00Z" });
    } catch (e) { rErr = errMsg(e); throw new AssertFail(`ฟิกซ์เจอร์ R: ${rErr}`); }
  };
  const panelU = (tag: string, dep: string, unit: string) => call("loadDeparturePanelVM", ctxOf(tag), { unitId: unit, departureId: dep }, optsR);

  // ORACLE-EDIT R-1 รอบ 2 (มติ Q16 แก้ Q2): noCosts บอกความจริงเฉพาะผู้เห็นต้นทุน · ผู้ไม่เห็น ⇒ null และช่องต้นทุนเหมือนกันทุกไบต์ระหว่างรอบที่มี/ไม่มีต้นทุน
  await st("R-1", "Q2+Q16: dQ (0 แถว) ผู้เห็นต้นทุน (OWNER · cost.view) ⇒ กำไร/มาร์จิน null + noCosts true · dR (5 แถว) ⇒ noCosts false + กำไร 2,150,782 · ผู้ไม่เห็นต้นทุน (report.view · booking.view · trips.*) ⇒ noCosts null · ช่องต้นทุนของ dQ / dR / dN เหมือนกันทุกไบต์ (สรุปเงิน + แผงรอบ · ไม่รั่วว่า \"มีต้นทุนแล้ว\")", async () => {
    needSetup(); const CK = ["commissionCostSatang", "costSatang", "costRows", "grossProfitSatang", "marginBp", "noCosts"];
    for (const t of ["oa", "cvo"]) { eq(pick(await sumV(t, DEP.Q), ["grossProfitSatang", "marginBp", "noCosts"]), [null, null, true], `dQ ${t}`); eq(pick(await sumV(t, DEP.R), ["noCosts", "grossProfitSatang"]), [false, 2_150_782], `dR ${t}`); }
    eq(pick(asRec(VM(await panel("oa", DEP.Q), "panel dQ").money) ?? {}, ["grossProfitSatang", "marginBp", "noCosts"]), [null, null, true], "แผง dQ");
    const bad: string[] = [];
    for (const t of ["rv", "bv", "wild"]) {
      const sv = await Promise.all([DEP.Q, DEP.R, DEP.N].map(async (d) => JSON.stringify(pick(await sumV(t, d), CK))));
      const pv = await Promise.all([DEP.Q, DEP.R, DEP.N].map(async (d) => JSON.stringify(pick(asRec(VM(await panel(t, d), `panel ${t}`).money) ?? {}, CK))));
      const want = JSON.stringify(CK.map(() => null));
      if (new Set([...sv, ...pv]).size !== 1 || sv[0] !== want) bad.push(`${t}: สรุป ${sv.join(" | ")} · แผง ${pv.join(" | ")} ต้องเป็น ${want} ทุกรอบ`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("R-2", "Q2 จอ: การ์ดแผงรอบ dQ และจอต้นทุน dQ แสดง \"—\" + \"ยังไม่หักต้นทุนรอบ\" (การ์ดกำไรของจอต้นทุนเป็น \"—\") · dR ไม่มีข้อความนี้", async () => {
    needSetup();
    const c = unent(card(VM(await panel("oa", DEP.Q), "panel dQ").money));
    ok(c.includes("ยังไม่หักต้นทุนรอบ") && c.includes("—"), `การ์ด dQ: ${c.slice(0, 300)}`);
    const sh = screen(VM(await loadCosts("oa", DEP.Q), "จอ dQ")); const prof = unent(byTestid(sh, "trips-cost-kpi-profit"));
    ok(unent(sh).includes("ยังไม่หักต้นทุนรอบ") && prof.includes("—") && !/\d/.test(prof), `จอ dQ การ์ดกำไร: ${prof}`);
    ok(!unent(card(VM(await panel("oa", DEP.R), "panel dR").money)).includes("ยังไม่หักต้นทุนรอบ"), "dR มีข้อความ ยังไม่หักต้นทุนรอบ");
  });
  await st("R-3", "Q3 ข้อความชนกันบอกว่ายอดที่พิมพ์ไว้จะหายเมื่อโหลดใหม่ (costs.conflict)", () => {
    ok(String(fth["costs.conflict"] ?? "").includes("ยอดที่พิมพ์ไว้จะหายเมื่อโหลดใหม่"), `costs.conflict: ${fth["costs.conflict"]}`);
    ok(/lost|discard/i.test(String(fen["costs.conflict"] ?? "")), `en costs.conflict ไม่บอกว่าจะหาย: ${fen["costs.conflict"]}`);
  });
  await st("R-4", "Q4 costRowsFromForm บอกแถวแรกที่ผิด: ยอดผิดรูปแถว 2 ⇒ { COST_AMOUNT_FORMAT, row: 2 } · หมายเหตุผิดแถว 0 ⇒ { COST_NOTE_INVISIBLE, row: 0 } (U4) · ตัวแก้มี aria-invalid + aria-describedby ผูกกับแถวที่ผิด (โค้ด — สถานะหลังกดบันทึกเรนเดอร์แบบนิ่งไม่ได้)", () => {
    const F = (rows: Rec[]) => asRec(pure("costRowsFromForm", rows)) ?? {};
    const okRow = { kind: "FOOD", amountText: "100", note: "" };
    eq(pick(F([okRow, okRow, { ...okRow, amountText: "1,2a" }]), ["ok", "code", "row"]), [false, "COST_AMOUNT_FORMAT", 2], "ยอดผิดรูป");
    eq(pick(F([{ ...okRow, note: "a\u0007b" }, { ...okRow, amountText: "x" }]), ["ok", "code", "row"]), [false, NOTE_CODE, 0], "หมายเหตุผิด (แถวแรกที่ผิดชนะ · รหัสเฉพาะ U4 · ORACLE-EDIT รอบ 3)");
    const ed = stripComments(read(`${COMP}/CostEditor.tsx`));
    ok(/aria-invalid=\{/.test(ed) && /aria-describedby=\{/.test(ed), "ตัวแก้ไม่มี aria-invalid/aria-describedby ที่ผูกค่า");
    ok(/\.row\b/.test(ed), "ตัวแก้ไม่อ่าน row จากผลของ action");
  });
  await st("R-5", "Q5 แจกสิทธิ์ต้นทุนผ่าน updateStaffAccess จริง: STAFF trips.* + settings.staff.write ⇒ ปฏิเสธ trips.cost.view/edit (แต่แจก trips.departure.view ได้ = ตัวควบคุม) · OWNER ⇒ view ได้ · MANAGER ⇒ edit ได้ · ผู้ถือ trips.cost.view ระบุตรง ⇒ view ได้ / edit ไม่ได้ · ป้ายสองคีย์ลงท้าย \"(ต้องติ๊กเอง — ไม่รวมใน 'ทุกอย่างในหัวข้อนี้' ของทัวร์และทริป)\" (U5)", async () => {
    needSetup(); const up = STAFF.mod?.updateStaffAccess; ok(typeof up === "function", `ไม่มี updateStaffAccess (${STAFF.err.slice(0, 80)})`);
    const mid = async (t: string) => String((await q<{ id: string }>(`SELECT id FROM "Membership" WHERE "userId" = $1`, [U[t]?.userId]))[0]?.id ?? "");
    const grant = async (actor: string, target: string, key: string) => asRec(await (up as AnyFn)({ tenantId: tA, actorUserId: U[actor]?.userId, membershipId: await mid(target), permissions: { [key]: true } })) ?? {};
    const permsOf = async (t: string) => asRec((await q<{ p: unknown }>(`SELECT permissions AS p FROM "Membership" WHERE "userId" = $1`, [U[t]?.userId]))[0]?.p) ?? {};
    const res: Record<string, unknown> = {
      swDep: (await grant("sw", "tg5", "trips.departure.view")).ok, swView: (await grant("sw", "tg1", "trips.cost.view")).ok, swEdit: (await grant("sw", "tg1", "trips.cost.edit")).ok,
      oaView: (await grant("oa", "tg1", "trips.cost.view")).ok, mgEdit: (await grant("mg", "tg2", "trips.cost.edit")).ok, swkView: (await grant("swk", "tg3", "trips.cost.view")).ok, swkEdit: (await grant("swk", "tg4", "trips.cost.edit")).ok,
    };
    eq(res, { swDep: true, swView: false, swEdit: false, oaView: true, mgEdit: true, swkView: true, swkEdit: false }, "ผล");
    eq([(await permsOf("tg1"))["trips.cost.view"], (await permsOf("tg1"))["trips.cost.edit"], (await permsOf("tg2"))["trips.cost.edit"], (await permsOf("tg4"))["trips.cost.edit"]], [true, undefined, true, undefined], "สิทธิ์ในฐาน");
    const s = read(PERMS); const NOTE = /\(ต้องติ๊กเอง — ไม่รวมใน ['‘"“]ทุกอย่างในหัวข้อนี้['’"”] ของทัวร์และทริป\)$/; // ORACLE-EDIT รอบ 3 (มติ U5): ลงท้ายด้วยคำบนจอสิทธิ์จริง
    for (const k of ["trips.cost.view", "trips.cost.edit"]) { const lab = new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(s)?.[1] ?? ""; ok(NOTE.test(lab), `ป้าย ${k}: ${lab}`); }
  });
  await st("R-6", "Q6 ลำดับด่านของ action: ผู้ไม่มีสิทธิ์บันทึก (STAFF trips.* · cost.view · report.view) ส่งยอดผิดรูป \"1,2a\" ⇒ FORBIDDEN (ไม่ใช่ COST_AMOUNT_FORMAT) · ไม่เขียน", async () => {
    const vm = VM(await loadCosts("oa", DEP.AC), "load"); const before = await acState();
    for (const t of ["wild", "cvo", "rv"]) codeR(await act(t, SLUG_A, editorPayload(vm, [{ kind: "OTHER", amountText: "1,2a", note: "" }])), "FORBIDDEN", t);
    eq(await acState(), before, "ไม่เขียน");
  });
  await st("R-7", "Q7 snapshot เสีย: payableSatang = −1 · 1e21 · 1.5 · \"1095000\" · 3e9 ⇒ ไม่ throw · fallback (ยอดขาย 1,750,000 = 5 × 3,500) · SNAPSHOT_FALLBACK n=5 · แผงรอบเปิดได้ · สรุปเงินล้ม (RETAINED เกิน int4) ⇒ แผงรอบยังเปิดได้ (money ใช้ได้ หรือ null + คำเตือน) และสรุปเงินไม่ throw", async () => {
    await needR();
    const r = await summary("oa", R.F); ok(r.ok === true, `สรุปเงิน dF: ${fmt(r)}`); const m = asRec(r.value) ?? {};
    eq([m.salesSatang, m.passThroughSatang, asArr(m.warnings).find((w) => w.code === "SNAPSHOT_FALLBACK")?.n], [1_750_000, 300_000, 5], "dF");
    const pf = await panel("oa", R.F); ok(pf.ok === true && asRec(asRec(pf.vm)?.money), `แผง dF: ${fmt(pf)}`);
    const g = await summary("oa", R.G); ok(g.ok !== "THROW", `สรุปเงิน dG throw: ${fmt(g)}`);
    const pg0 = await panel("oa", R.G); ok(pg0.ok === true, `แผง dG ล้ม: ${fmt(pg0)}`);
    const v = asRec(pg0.vm) ?? {}; ok(asRec(v.money) !== null || asArr(v.warnings).some((w) => w.code !== "CAPACITY_OVER_SEATS"), `แผง dG: money null ต้องมีคำเตือน: ${fmt(v.warnings)}`);
  });
  await st("R-8", "Q8 fallback ของการจองราคาไม่รวม VAT (snapshot pricesIncludeVat false · ไม่มี totals): payable = gross 410,000 + VAT 24,500 ⇒ ยอดขาย 374,500 · VAT 24,500 · ก่อน VAT 350,000", async () => {
    await needR(); eq(pick(await sumV("oa", R.E), ["salesSatang", "vatSatang", "revenueExVatSatang", "passThroughSatang"]), [374_500, 24_500, 350_000, 60_000], "dE");
  });
  await st("R-9", "Q9 SNAPSHOT_FALLBACK นับเฉพาะการจองกลุ่ม LIVE: dE (LIVE 1 · HOLD/CANCELLED snapshot เสีย) ⇒ n=1", async () => {
    await needR(); eq(asArr((await sumV("oa", R.E)).warnings).filter((w) => w.code === "SNAPSHOT_FALLBACK").map((w) => w.n), [1], "n");
  });
  await st("R-10", "Q10 snapshot ไม่มี tax.vatRegistered ในหน่วยไม่จด VAT ⇒ ใช้สถานะของหน่วย: ต้นทุนคอมฯ = 100,000 + VAT คอมฯ 7,000 = 107,000", async () => {
    await needR(); eq((await sumV("oa", R.U, uN)).commissionCostSatang, 107_000, "dU");
  });
  await st("R-11", "Q11 ตัวเลขตาม snapshot (C12 ชนะ N8): หน่วยไม่จด VAT วันนี้ + การจองเก่ามี VAT 22,897 ⇒ VAT คงไว้ · ก่อน VAT 327,103 · การ์ด/จอมีบรรทัด VAT + คำว่า ก่อน VAT · หน่วยจด VAT แต่ VAT ของรอบ 0 ⇒ ไม่มีบรรทัด VAT/คำว่า ก่อน VAT · costs.ts ไม่ทับ VAT/รายได้ (ตรรกะอยู่ใน report-core ที่เดียว)", async () => {
    await needR();
    eq(pick(await sumV("oa", R.K, uN), ["salesSatang", "vatSatang", "revenueExVatSatang"]), [350_000, 22_897, 327_103], "dK");
    const pk = VM(await panelU("oa", R.K, uN), "แผง dK"); const ck = card(pk.money); const sk = screen(VM(await loadCosts("oa", R.K, uN), "จอ dK"));
    ok(ck.includes('data-testid="trips-dep-money-vat"') && sk.includes('data-testid="trips-cost-vat-line"') && unent(sk).includes("ก่อน VAT"), "dK ต้องมีบรรทัด VAT + ก่อน VAT");
    eq(pick(await sumV("oa", R.Z), ["vatSatang", "revenueExVatSatang"]), [0, 350_000], "dZ");
    const cz = card(VM(await panel("oa", R.Z), "แผง dZ").money); const sz = screen(VM(await loadCosts("oa", R.Z), "จอ dZ"));
    ok(!cz.includes('data-testid="trips-dep-money-vat"') && !sz.includes('data-testid="trips-cost-vat-line"') && !unent(cz + sz).includes("ก่อน VAT"), "dZ ต้องไม่มีบรรทัด VAT/คำว่า ก่อน VAT");
    const c = stripComments(read(COSTS));
    ok(!/\b(vatSatang|revenueExVatSatang)\s*=(?!=)/.test(c) && !/revenueExVatSatang:\s*[^,}\n]*\?/.test(c), "costs.ts ยังทับ vatSatang/revenueExVatSatang (ต้องอยู่ใน report-core ที่เดียว)");
  });
  await st("R-12", "Q12: ต้นทุนต่อที่นั่งผ่าน money-math (ไม่มี Math.round ใน costs.ts) · อ่านแถวต้นทุนไม่มีเพดานลอย (take ตัวเลข) · ผู้ไม่มีสิทธิ์ต้นทุนไม่อ่าน/ไม่นับ TripCost (ทุกทางอ่านมีเงื่อนไขสิทธิ์ · Q16) · แผงรอบไม่อ่านรอบ/สินค้าซ้ำ · รอบยกเลิก: การจองค้างที่ไม่มีเงินรับไม่ใช่รอคืนเงิน · VM ไม่ส่ง byKind ถ้าจอไม่แสดง (Q17)", async () => {
    await needR(); const c = stripComments(read(COSTS)); const bad: string[] = [];
    if (/Math\.round\(/.test(c) || !/perSeatSatang:[^\n]*\b(mulDivHalfUp|divHalfUp)\(/.test(c)) bad.push("ต่อที่นั่งไม่ผ่าน money-math");
    if (/\btake:\s*\d/.test(c)) bad.push("มี take ตัวเลขลอย");
    const saveAt = c.indexOf("export async function saveDepartureCosts");
    // ORACLE-EDIT R-12 รอบ 2 (มติ Q16): ทางอ่านทุกแบบ (findMany/findFirst/count/aggregate/groupBy/SQL ดิบ "TripCost") ต้องอยู่ใต้เงื่อนไขสิทธิ์ต้นทุน
    const reads = [...c.matchAll(/tripCost\.(findMany|findFirst|count|aggregate|groupBy)\(|"TripCost"/g)].map((m0) => m0.index ?? 0).filter((i) => saveAt < 0 || i < saveAt);
    if (reads.some((i) => !/costView|\.view\b|canSeeCost/.test(c.slice(Math.max(0, i - 200), i)))) bad.push("ทางอ่าน/นับ TripCost ไม่มีเงื่อนไขสิทธิ์ต้นทุน");
    const pAt = c.indexOf("export async function departureMoneyForPanel"); const pBody = pAt < 0 ? "" : c.slice(pAt, c.indexOf("\n}\n", pAt));
    if (/departureOf\(|tripDeparture\.|tripProduct\./.test(pBody)) bad.push("แผงรอบอ่านรอบ/สินค้าซ้ำ");
    const y = await sumV("oa", R.Y); if (y.pendingRefundBookings !== 1 || y.heldSatang !== 410_000) bad.push(`dY รอคืนเงิน ${fmt(pick(y, ["pendingRefundBookings", "heldSatang"]))} ต้องเป็น [1, 410000]`);
    const vm = VM(await loadCosts("oa", DEP.R), "จอ dR"); const src = [...compFiles, PANEL].map((f) => stripComments(read(f))).join("\n");
    // ORACLE-EDIT R-12 รอบ 2 (มติ Q17): "ไม่ส่งฟิลด์ที่ไม่ใช้" = byKind เท่านั้น (ฟิลด์อื่นของ §4.2 คงไว้)
    if (asRec(vm.costs)?.byKind !== undefined && !/\.byKind\b|[{,]\s*byKind\s*[,}:]/.test(src)) bad.push("VM ส่ง costs.byKind แต่จอไม่แสดง");
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("R-13", "Q13 ยอดในฟอร์ม: คอมมาเป็นตัวคั่นหลักพันเท่านั้น — \"1250,50\" \",5\" \"1 000\" \"1,25\" ⇒ COST_AMOUNT_FORMAT · \"1,250.50\" ⇒ 125050 · \"1,234,567\" ⇒ 123456700 · \"12,345,678\" รูปถูก (เกินเพดานต่อแถว ⇒ COST_AMOUNT_INVALID ไม่ใช่ FORMAT) · หมายเหตุมีอักขระควบคุม/มองไม่เห็น/bidi ⇒ COST_NOTE_INVISIBLE + row (U4 · U+200B ตัดทิ้งแทน)", () => {
    const F = (t: string, note = "") => asRec(pure("costRowsFromForm", [{ kind: "FOOD", amountText: "1", note: "" }, { kind: "FOOD", amountText: t, note }])) ?? {};
    const bad = ["1250,50", ",5", "1 000", "1,25"].filter((t) => F(t).code !== "COST_AMOUNT_FORMAT" || F(t).row !== 1);
    ok(bad.length === 0, `ต้อง FORMAT + row 1: ${fmt(bad.map((t) => [t, pick(F(t), ["ok", "code", "row"])]))}`);
    eq([asArr(F("1,250.50").rows)[1]?.amountSatang, asArr(F("1,234,567").rows)[1]?.amountSatang, F("12,345,678").code], [125_050, 123_456_700, "COST_AMOUNT_INVALID"], "รูปถูก");
    // ORACLE-EDIT R-13 รอบ 3 (มติ U4): U+200B ไม่ปฏิเสธแล้ว (ตัดทิ้ง — ตรวจใน R-20) · ที่เหลือ ⇒ รหัสเฉพาะ COST_NOTE_INVISIBLE
    const notes = ["‮abc", "x⁦y", "﻿z", "a b", "a\u0007", "a­b"];
    const nb = notes.filter((n) => { const r = F("10", n); return r.code !== NOTE_CODE || r.row !== 1; });
    ok(nb.length === 0, `หมายเหตุต้อง ${NOTE_CODE} + row 1: ${fmt(nb.map((n) => [escape(n), pick(F("10", n), ["ok", "code", "row"])]))}`);
  });
  await st("R-14", "Q14 ข้อความ: Saving… · อังกฤษเอกพจน์/พหูพจน์ (1 booking / 2 bookings) ของ agentCollect pendingRefund noShowUnpaid · การ์ดขาดทุน \"ขาดทุนขั้นต้น 1,200.00\" / \"Gross loss 1,200.00\" (ไม่มีเครื่องหมายลบ) · ตัวแก้มี \"รวมที่บันทึกแล้ว\" · ปุ่มลบ aria-label \"ลบรายการที่ 1\" · ข้อความยอดเกิน · บรรทัดเอเจนซี่เก็บเงินเติม \"ยังไม่นับในรับแล้ว/ค้างรับ\"", async () => {
    needSetup(); const bad: string[] = [];
    if (fen["costs.editor.saving"] !== "Saving…") bad.push(`en saving: ${fen["costs.editor.saving"]}`);
    const ag = String(fth["departures.money.agentCollect"] ?? ""); if (!ag.startsWith("เอเจนซี่เก็บเงิน {n} การจอง") || !ag.includes(" · ยังไม่นับในรับแล้ว/ค้างรับ")) bad.push(`agentCollect: ${ag}`); // ตัวคั่น " · " (มติ Q17)
    if (!String(fth["errors.COST_AMOUNT_INVALID"] ?? "").includes("ไม่เกิน 10,000,000 บาทต่อรายการ และรวมทั้งรอบไม่เกิน 21 ล้านบาท")) bad.push(`ข้อความยอดเกิน: ${fth["errors.COST_AMOUNT_INVALID"]}`);
    try {
      const tr = (RX?.ui.createTranslator as AnyFn)({ locale: "en", messages: { trips: en }, namespace: "trips" }) as AnyFn;
      for (const k of ["departures.money.agentCollect", "departures.money.pendingRefund", "departures.money.noShowUnpaid"]) {
        const one = String(tr(k, { n: 1, amount: "1.00" })), two = String(tr(k, { n: 2, amount: "1.00" }));
        if (!/\b1 booking\b(?!s)/.test(one) || !/\b2 bookings\b/.test(two)) bad.push(`en ${k}: "${one}" / "${two}"`);
      }
    } catch (e) { bad.push(`แปลอังกฤษไม่ได้: ${errMsg(e).slice(0, 120)}`); }
    try {
      const mx = VM(await panel("oa", DEP.X), "แผง dX").money;
      const lt = unent(card(mx)), le = unent(card(mx, "en"));
      if (!lt.includes("ขาดทุนขั้นต้น 1,200.00") || /-\s?1,200\.00|−\s?1,200\.00/.test(lt)) bad.push(`การ์ดขาดทุน th: ${lt.slice(0, 200)}`);
      if (!le.includes("Gross loss 1,200.00")) bad.push(`การ์ดขาดทุน en: ${le.slice(0, 200)}`);
      const sh = screen(VM(await loadCosts("oa", DEP.R), "จอ dR"));
      if (!unent(byTestid(sh, "trips-cost-editor")).includes("รวมที่บันทึกแล้ว")) bad.push("ตัวแก้ไม่มี รวมที่บันทึกแล้ว");
      if (!/aria-label="ลบรายการที่ 1"/.test(byTestid(sh, "trips-cost-remove-0").slice(0, 400))) bad.push(`ปุ่มลบ: ${byTestid(sh, "trips-cost-remove-0").slice(0, 160)}`);
    } catch (e) { bad.push(e instanceof AssertFail ? e.message : `เรนเดอร์: ${errMsg(e).slice(0, 160)}`); }
    ok(bad.length === 0, `${bad.length} ข้อ: ${bad.join(" · ")}`); // ORACLE-EDIT รอบ 2: แสดงครบทุกข้อที่ไม่ตรง
  });
  // ═══ ORACLE-EDIT รอบ 3 (ผู้คุม 19 พ.ย.): ข้อตัดสินของ builder r2 ที่ยังไม่มีข้อพิสูจน์ ═══
  await st("R-15", "Q7 ทาง MONEY_UNAVAILABLE (บังคับให้ตัวคิดล้มแน่นอน: ผลรวม qty ที่นั่งของการจองเกิน int4) ⇒ แผงรอบยังเปิดได้ · money null · คำเตือน MONEY_UNAVAILABLE 1 ตัว · รอบปกติไม่มีคำเตือนนี้", async () => {
    await needR();
    if (!R.J) {
      R.J = await (mkDepR as NonNullable<typeof mkDepR>)("RJ", "PR", "2027-07-08", { cap: 10, sold: 1, status: "OPEN" });
      const b = await (mkBkR as NonNullable<typeof mkBkR>)("jB", { dep: R.J, prod: "PR", status: "CONFIRMED", channel: "COUNTER", adults: 1, created: "2027-06-01T03:00:00Z" });
      for (let i = 0; i < 2; i++) await insertRow("TripBookingItem", { id: rid("itj"), tenantId: tA, unitId: uA, bookingId: b, departureId: R.J, kind: "SEAT", paxTypeId: PRD.PR.adult, qty: 2_000_000_000, unitPriceMinor: 0, amountMinor: 0, amountSatang: 0,
        vatSatang: 0, commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7", priceSource: "RETAIL", active: true, updatedAt: new Date() });
    }
    const p = await panel("oa", R.J); ok(p.ok === true, `แผงล้ม: ${fmt(p)}`); const v = asRec(p.vm) ?? {};
    eq([v.money, asArr(v.warnings).filter((w) => w.code === "MONEY_UNAVAILABLE").length], [null, 1], "แผง");
    // หมายเหตุ: departureMoneySummary ของรอบนี้ยัง throw (ข้อผิดพลาดจากฐาน) — มติ Q7 พูดถึงแผงรอบเท่านั้น ⇒ ไม่ตรึง (รายงานผู้คุม)
    const pR = VM(await panel("oa", DEP.R), "แผง dR"); ok(!asArr(pR.warnings).some((w) => w.code === "MONEY_UNAVAILABLE"), "รอบปกติมีคำเตือน MONEY_UNAVAILABLE");
  });
  await st("R-16", "Q5 ทางคำเชิญ (staff/invite.ts): STAFF trips.* + settings.staff.write เชิญพร้อม trips.cost.view ⇒ ปฏิเสธ ไม่มีแถวคำเชิญ · ตัวตรวจร่วม checkNoEscalation ที่คำเชิญใช้ ปฏิเสธ trips.* (ไม่มีคำเชิญเกิด) · OWNER/MANAGER/ผู้ถือคีย์ ผ่านตัวตรวจ", async () => {
    needSetup(); const INV = await tryImport("@/lib/staff/invite"); const inv = INV.mod?.inviteStaff; ok(typeof inv === "function", `ไม่มี inviteStaff (${INV.err.slice(0, 80)})`);
    const chkF = STAFF.mod?.checkNoEscalation; ok(typeof chkF === "function", "ไม่มี checkNoEscalation"); const chk0 = chkF as AnyFn;
    const mctx = (role: string, perms: string[], ua: string[] = [uA]) => ({ role, unitAccess: ua, permissions: Object.fromEntries(perms.map((k) => [k, true])) });
    const before = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "StaffInvite" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? 0;
    const r = asRec(await (inv as AnyFn)({ tenantId: tA, actorUserId: U.sw.userId, membership: mctx("STAFF", ["trips.*", "settings.staff.write"]) }, { name: "ทดสอบเชิญ", phone: "0812345671", role: "STAFF", unitIds: [uA], permissions: { "trips.cost.view": true } }, new Date(), { channel: "app" })) ?? {};
    ok(r.ok === false, `คำเชิญของ STAFF trips.* ต้องถูกปฏิเสธ: ${fmt(r)}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "StaffInvite" WHERE "tenantId" = $1`, [tA]))[0]?.n ?? 0, before, "ไม่มีแถวคำเชิญ");
    const res = { wild: chk0(mctx("STAFF", ["trips.*", "settings.staff.write"]), {}, { "trips.cost.view": true }) === null, owner: chk0(mctx("OWNER", [], ["*"]), {}, { "trips.cost.edit": true }) === null,
      manager: chk0(mctx("MANAGER", []), {}, { "trips.cost.edit": true }) === null, holder: chk0(mctx("STAFF", ["trips.cost.view"]), {}, { "trips.cost.view": true }) === null, holderEdit: chk0(mctx("STAFF", ["trips.cost.view"]), {}, { "trips.cost.edit": true }) === null };
    eq(res, { wild: false, owner: true, manager: true, holder: true, holderEdit: false }, "checkNoEscalation");
  });
  await st("R-17", "Q11 กติกาแสดงบรรทัด VAT อยู่ที่เดียว: vatShown ประกาศครั้งเดียวใน CostParts.tsx · การ์ด (CostMoneyCard) และจอต้นทุน (CostScreen) เรียก vatShown( · ไม่มีคอมโพเนนต์อื่นเทียบ vatSatang กับ 0 (vatMode ยังใช้เลือกป้ายวิธีใส่ยอดต้นทุน/ป้ายคอมฯ ได้)", () => {
    needOwn(); const parts0 = stripComments(read(`${COMP}/CostParts.tsx`)), scr = stripComments(read(`${COMP}/CostScreen.tsx`));
    const defs = [...compFiles, PANEL].filter((f) => /function\s+vatShown\b|const\s+vatShown\b/.test(stripComments(read(f))));
    eq(defs, [`${COMP}/CostParts.tsx`], "ที่ประกาศ vatShown");
    const card0 = parts0.slice(parts0.indexOf("export function CostMoneyCard"));
    ok(/vatShown\(/.test(card0) && /vatShown\(/.test(scr) && /import[^;]*\bvatShown\b[^;]*from\s+["']\.\/CostParts["']/.test(scr), "การ์ด/จอต้นทุนไม่ได้ใช้ vatShown");
    const vsAt = parts0.indexOf("function vatShown"); const outside = parts0.slice(0, vsAt) + parts0.slice(parts0.indexOf("\n}", vsAt));
    const bad = [...compFiles.filter((f) => f !== `${COMP}/CostParts.tsx`).map((f) => [f, stripComments(read(f))] as const), [`${COMP}/CostParts.tsx (นอก vatShown)`, outside] as const, [PANEL, stripComments(read(PANEL))] as const]
      .filter(([, s0]) => /vatSatang\s*(>|>=|===|!==|<=|<)\s*0|0\s*(<|===|!==)\s*\w*\.?vatSatang/.test(s0)).map(([f]) => f);
    ok(bad.length === 0, `ตัดสินบรรทัด VAT นอก vatShown: ${bad.join(", ")}`);
  });
  await st("R-18", "Q12 รอบยกเลิก: การจองยังค้างที่ไม่มีเงินรับ = EXCLUDED · การจองจ่ายแล้ว = PENDING_REFUND — dY: bookings 0 · รอคืนเงิน 1 · held 410,000 · ที่นั่ง 1 (เฉพาะที่รอคืน) · ยอดขาย 0 · ยกเลิก 0", async () => {
    await needR(); eq(pick(await sumV("oa", R.Y), ["bookings", "pendingRefundBookings", "heldSatang", "seats", "salesSatang", "cancelledBookings", "outstandingSatang"]), [0, 1, 410_000, 1, 0, 0, 0], "dY");
  });
  await st("R-19", "Q13 ตัวคั่นหลักพัน: \"1,000\" ⇒ 100000 · \"12,345.6\" ⇒ 1234560 · \"0.50\" ⇒ 50 · \"1000000\" ⇒ 100000000 · \"1,00\" \"1,0000\" \",100\" \"1,,000\" ⇒ COST_AMOUNT_FORMAT", () => {
    const F = (t: string) => asRec(pure("costRowsFromForm", [{ kind: "FOOD", amountText: t, note: "" }])) ?? {};
    eq(["1,000", "12,345.6", "0.50", "1000000"].map((t) => asArr(F(t).rows)[0]?.amountSatang ?? fmt(F(t))), [100_000, 1_234_560, 50, 100_000_000], "รับ");
    eq(["1,00", "1,0000", ",100", "1,,000"].map((t) => F(t).code), Array(4).fill("COST_AMOUNT_FORMAT"), "ปฏิเสธ");
  });
  // ═══ ORACLE-EDIT รอบ 3 (ผู้คุม 19 พ.ย. · มติ U1–U6) ═══
  const LEVELS = await tryImport("@/lib/staff/levels");
  const COSTK = ["trips.cost.view", "trips.cost.edit"];
  /** ชุดคีย์ระดับของ trips ณ builder r2 (ถ่ายจาก permissionsForLevel 19 พ.ย.) ลบสองคีย์ต้นทุน — การแก้ U1 ต้องไม่ทำคีย์อื่นหาย */
  const LEVEL_SNAP: Record<string, string[]> = {
    OFF: [],
    VIEW: ["trips.booking.view", "trips.departure.view", "trips.passenger.view", "trips.product.view", "trips.report.view"],
    USE: ["trips.booking.approve", "trips.booking.create", "trips.booking.edit", "trips.booking.view", "trips.departure.edit", "trips.departure.status", "trips.departure.view", "trips.passenger.edit", "trips.passenger.health",
      "trips.passenger.reveal", "trips.passenger.view", "trips.pdpa.manage", "trips.price.edit", "trips.price.override", "trips.product.edit", "trips.product.publish", "trips.product.view", "trips.report.view", "trips.resource.edit", "trips.seat.manage"],
  };
  await st("R-20", "U1 ระดับสำเร็จรูป (levels.ts · ใช้ทั้งตั้งระดับและคำเชิญของแอปเลขา): permissionsForLevel(\"trips\", OFF/VIEW/USE) ไม่มี trips.cost.view/edit · คีย์อื่นครบตามชุดเดิม · isSensitiveKey(สองคีย์) = true (คำเชิญจึงปฏิเสธคีย์ต้นทุนที่ใส่มาตรง) · ระดับที่มี = OFF/VIEW/USE เหมือนเดิม", () => {
    const pfl = LEVELS.mod?.permissionsForLevel as AnyFn | undefined, isS = LEVELS.mod?.isSensitiveKey as AnyFn | undefined, avail = LEVELS.mod?.levelsAvailableFor as AnyFn | undefined;
    ok(typeof pfl === "function" && typeof isS === "function" && typeof avail === "function", `levels.ts (${LEVELS.err.slice(0, 80)})`);
    const got = Object.fromEntries(["OFF", "VIEW", "USE"].map((lv) => [lv, Object.keys(asRec((pfl as AnyFn)("trips", lv, {})) ?? {}).sort()]));
    eq(got, LEVEL_SNAP, "ชุดคีย์ต่อระดับ");
    eq([COSTK.map((k) => (isS as AnyFn)(k)), (avail as AnyFn)("trips")], [[true, true], ["OFF", "VIEW", "USE"]], "คีย์อ่อนไหว/ระดับ");
  });
  await st("R-21", "U1 ปลายทางจริง: OWNER ตั้งพนักงานเป็น ทัวร์:ดู / ทัวร์:ใช้งาน ผ่าน setStaffLevels ⇒ สิทธิ์ในฐานไม่มีคีย์ต้นทุน · costAccessOf = {view:false, edit:false} · สรุปเงิน dR ช่องต้นทุน/กำไร/noCosts = null · จอต้นทุน FORBIDDEN", async () => {
    needSetup(); const ssl = LEVELS.mod?.setStaffLevels as AnyFn | undefined; ok(typeof ssl === "function", "ไม่มี setStaffLevels");
    const mid = async (t: string) => String((await q<{ id: string }>(`SELECT id FROM "Membership" WHERE "userId" = $1`, [U[t]?.userId]))[0]?.id ?? "");
    const octx = { tenantId: tA, actorUserId: U.oa.userId, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } };
    const bad: string[] = [];
    for (const [t, lv] of [["tg6", "VIEW"], ["tg7", "USE"]] as const) {
      const r = asRec(await (ssl as AnyFn)(octx, await mid(t), { levels: { trips: lv } })) ?? {}; if (r.ok !== true) { bad.push(`${t} ตั้งระดับไม่ได้: ${fmt(r)}`); continue; }
      const m = (await q<{ role: string; unitAccess: unknown; permissions: unknown }>(`SELECT role, "unitAccess", permissions FROM "Membership" WHERE "userId" = $1`, [U[t]?.userId]))[0];
      const perms = asRec(m?.permissions) ?? {}; const leak = COSTK.filter((k) => perms[k] === true); if (leak.length) bad.push(`${t}(${lv}) ได้ ${leak.join(",")}`);
      const acc = asRec(pure("costAccessOf", { role: String(m?.role), unitAccess: Array.isArray(m?.unitAccess) ? m?.unitAccess : [], permissions: perms }, uA)); if (!isDeepStrictEqual(acc, { view: false, edit: false })) bad.push(`${t} costAccessOf ${fmt(acc)}`);
      const sm = await summary(t, DEP.R); const v = asRec(sm.value) ?? {};
      if (sm.ok !== true || ["commissionCostSatang", "costSatang", "costRows", "grossProfitSatang", "marginBp", "noCosts"].some((k) => v[k] !== null)) bad.push(`${t} สรุปเงิน ${fmt(sm).slice(0, 200)}`);
      const lc = await loadCosts(t, DEP.R); if (lc.ok !== false || lc.code !== "FORBIDDEN") bad.push(`${t} จอต้นทุน ${fmt(lc).slice(0, 120)}`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("R-22", "U2 แผงรอบที่สรุปเงินล้ม (ฟิกซ์เจอร์ R-15): แผงที่เรนเดอร์แสดงคำเตือน departures.money.unavailable และไม่มีโน้ต \"ยังไม่เปิดใช้\" (trips-dep-money-note / departures.notYet.money) · โค้ด: catch ของ departureMoneyForPanel ผูกตัวแปรความผิดพลาดและ log (ไม่กลืนเงียบ)", async () => {
    await needR(); ok(R.J, "ต้องรัน R-15 ก่อน (ฟิกซ์เจอร์ RJ)");
    const PANELM = await tryImport("@/components/trips/DeparturePanel"); const vm = VM(await panel("oa", R.J), "แผง RJ");
    const html = render(PANELM.mod?.DeparturePanel, { unitSlug: SLUG_A, vm, base: `/app/u/${SLUG_A}/trips/departures`, q: { view: "week", start: null, month: null, filter: "all", dep: R.J }, resources: null, openDecide: false });
    const txt = unent(html);
    ok(txt.includes(String(fth["departures.money.unavailable"] ?? "\u0000")), `ไม่มีคำเตือน unavailable: ${txt.slice(0, 200)}`);
    ok(!html.includes('data-testid="trips-dep-money-note"') && !txt.includes(String(fth["departures.notYet.money"] ?? "\u0000")), "ยังแสดงโน้ต ยังไม่เปิดใช้ คู่กับคำเตือน");
    const c = stripComments(read(COSTS)); const at = c.indexOf("export async function departureMoneyForPanel"); const body = at < 0 ? "" : c.slice(at, c.indexOf("\n}\n", at));
    const m = /catch\s*\(\s*(\w+)\s*\)\s*\{([\s\S]*?)\n\s*\}/.exec(body);
    ok(m && new RegExp(`\\b(console\\.error|log\\w*|report\\w*)\\([^)]*\\b${m[1]}\\b`).test(m[2] ?? ""), `catch ไม่ log ความผิดพลาด: ${(m?.[0] ?? body.slice(body.indexOf("catch"), body.indexOf("catch") + 120)).slice(0, 160)}`);
  });
  await st("R-23", "U3 ป้าย \"(รวม VAT ของคอมมิชชัน)\" ตามที่คิดจริง: หน่วยสถานะ VAT ไม่ระบุ (a2) ที่มีการจองซึ่ง VAT คอมฯ นับเป็นต้นทุน ⇒ มี · หน่วยไม่จด VAT (dV · dU) ⇒ มี · หน่วยจด VAT ที่ไม่มีการจองแบบนั้น (dR) ⇒ ไม่มี", async () => {
    await needR(); const LABEL = "(รวม VAT ของคอมมิชชัน)"; const has = async (dep: string, unit: string) => unent(byTestid(screen(VM(await loadCosts("oa", dep, unit), `จอ ${dep}`)), "trips-cost-breakdown")).includes(LABEL);
    eq({ a2: await has(R.W, uA2), dV: await has(DEP.V, uN), dU: await has(R.U, uN), dR: await has(DEP.R, uA) }, { a2: true, dV: true, dU: true, dR: false }, "ป้าย");
    eq((await sumV("oa", R.W, uA2)).commissionCostSatang, 107_000, "ฟิกซ์เจอร์: VAT คอมฯ ถูกนับ");
  });
  await st("R-24", "U4 หมายเหตุ: U+200B ตัดทิ้ง (\"เรือ\\u200Bใหญ่\" ⇒ \"เรือใหญ่\") · อีโมจิผสม ZWJ (👨‍👩‍👧 · ❤️‍🔥) และ ZWNJ รับไม่เปลี่ยน · ผ่าน action แล้วในฐานเก็บตามนั้น · ข้อความเฉพาะ errors.COST_NOTE_INVISIBLE (th ตรงตัว · en มี ไม่มีอักษรไทย)", async () => {
    const F = (note: string) => asRec(pure("costRowsFromForm", [{ kind: "FOOD", amountText: "10", note }])) ?? {};
    const fam = "👨\u200D👩\u200D👧 ครอบครัว", fire = "❤️\u200D🔥", zwnj = "ab\u200Ccd";
    eq([asArr(F("เรือ\u200Bใหญ่").rows)[0]?.note, asArr(F(fam).rows)[0]?.note, asArr(F(fire).rows)[0]?.note, asArr(F(zwnj).rows)[0]?.note], ["เรือใหญ่", fam, fire, zwnj], "หมายเหตุ");
    eq(fth[`errors.${NOTE_CODE}`], "หมายเหตุมีอักขระที่มองไม่เห็น ลบแล้วพิมพ์ใหม่", "ข้อความ th"); ok(fen[`errors.${NOTE_CODE}`] && !/[฀-๿]/.test(fen[`errors.${NOTE_CODE}`]), `ข้อความ en: ${fen[`errors.${NOTE_CODE}`]}`);
    const vm = VM(await loadCosts("oa", DEP.AC), "load AC");
    const r = await act("oa", SLUG_A, editorPayload(vm, [{ kind: "OTHER", amountText: "11", note: `U4เรือ\u200Bใหญ่${STAMP}` }, { kind: "OTHER", amountText: "12", note: `${fam}${STAMP}` }]));
    ok(r.ok === true && asRec(r.value)?.applied === true, `action: ${fmt(r)}`);
    const notes = (await costRowsDb(DEP.AC)).map((x) => x.note);
    ok(notes.includes(`U4เรือใหญ่${STAMP}`) && notes.includes(`${fam}${STAMP}`) && !notes.some((n) => String(n ?? "").includes("\u200B")), `หมายเหตุในฐาน: ${fmt(notes)}`);
  });
  await st("R-25", "U5 คำเตือนอังกฤษเอกพจน์/พหูพจน์: costs.warn.SNAPSHOT_FALLBACK · FX_BOOKINGS · OTA_FEES_NOT_INCLUDED (n=1 ⇒ \"1 booking\" · n=2 ⇒ \"2 bookings\")", () => {
    const tr = (RX?.ui.createTranslator as AnyFn)({ locale: "en", messages: { trips: en }, namespace: "trips" }) as AnyFn; const bad: string[] = [];
    for (const k of ["SNAPSHOT_FALLBACK", "FX_BOOKINGS", "OTA_FEES_NOT_INCLUDED"]) { const one = String(tr(`costs.warn.${k}`, { n: 1 })), two = String(tr(`costs.warn.${k}`, { n: 2 })); if (!/\b1 booking\b(?!s)/.test(one) || !/\b2 bookings\b/.test(two)) bad.push(`${k}: "${one}" / "${two}"`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("R-26", "U6 ตัวแก้: ทุก <select>/<input> ปิดระหว่างรอผล (disabled ผูก busy) · aria-invalid ของช่องชนิด/ยอด/หมายเหตุ ผูกกับ field ของตัวเอง · costRowsFromForm คืน field: ชนิดผิด ⇒ { INVALID_INPUT, row, field: \"kind\" } · หมายเหตุยาวเกิน ⇒ { INVALID_INPUT, field: \"note\" } · ยอดผิดรูป ⇒ { COST_AMOUNT_FORMAT, field: \"amount\" } · อักขระมองไม่เห็น ⇒ { COST_NOTE_INVISIBLE, field: \"note\" }", () => {
    const F = (rows: Rec[]) => pick(asRec(pure("costRowsFromForm", rows)) ?? {}, ["ok", "code", "row", "field"]); const okRow = { kind: "FOOD", amountText: "100", note: "" };
    eq([F([okRow, { ...okRow, kind: "COMMISSION" }]), F([{ ...okRow, note: "ก".repeat(201) }]), F([okRow, okRow, { ...okRow, amountText: "1,2a" }]), F([{ ...okRow, note: "a\u202Eb" }])],
      [[false, "INVALID_INPUT", 1, "kind"], [false, "INVALID_INPUT", 0, "note"], [false, "COST_AMOUNT_FORMAT", 2, "amount"], [false, NOTE_CODE, 0, "note"]], "field");
    const ed = stripComments(read(`${COMP}/CostEditor.tsx`)); /** แท็ก JSX เต็มตัว (นับวงเล็บปีกกา — ข้าม "=>" ในแอตทริบิวต์) */
    const tagAt = (i: number): string => { let d = 0; for (let j = i; j < ed.length; j++) { const ch = ed[j]; if (ch === "{") d++; else if (ch === "}") d--; else if (ch === ">" && d === 0) return ed.slice(i, j + 1); } return ed.slice(i); };
    const tags = [...ed.matchAll(/<(select|input)\b/g)].map((m) => tagAt(m.index ?? 0)); const bad: string[] = [];
    if (tags.length < 3) bad.push(`พบช่องกรอก ${tags.length}`);
    for (const tg of tags) if (!/disabled=\{[^}]*busy/.test(tg)) bad.push(`ไม่ปิดระหว่างรอ: ${tg.slice(0, 80)}`);
    const sel = tags.find((x) => x.startsWith("<select")) ?? "", note = tags.find((x) => /x\.note|note:/.test(x)) ?? "", amt = tags.find((x) => /amountText/.test(x)) ?? "";
    for (const [nm, tg, f] of [["ชนิด", sel, "kind"], ["หมายเหตุ", note, "note"], ["ยอด", amt, "amount"]] as const) if (!new RegExp(`aria-invalid=\\{[^}]*["'\`]${f}["'\`]`).test(tg)) bad.push(`aria-invalid ของช่อง${nm} ไม่ผูก field "${f}"`);
    ok(bad.length === 0, bad.join(" · "));
  });
  groupLine("R");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การกดจริง (ผู้คุม · scripts/visual-trips.mts t1.7 + parity-trips.sh 11): การ์ดเงินแผงรอบ 2 บรรทัดแบบภาพ :56–:57 · ป้ายประมาณการเส้นประ · บรรทัดตัวเลขบริหาร · กำไรติดลบมีเครื่องหมาย+ไอคอน · ร้านไม่จด VAT ไม่มีบรรทัด VAT · ผู้ไม่มีสิทธิ์เห็นหน้าไม่มีสิทธิ์ · บันทึก 2 แท็บพร้อมกัน · พิมพ์ยอด "1,2a"`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.7a1 · เงินระดับรอบ · ต้นทุน · กำไรขั้นต้น · การ์ดเงิน =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
