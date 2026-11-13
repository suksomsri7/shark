// QC — TRIPS T1.4a · ใบรายชื่อรายวันของรอบ (ภาพ 12 ส่วนจอใหญ่): ตัวโหลด · สถานะเอกสาร/ลงนาม/สุขภาพ · อ่าน TripVehicleRun · พิมพ์ · ส่งออก CSV · เปิดดูข้อมูลสุขภาพแบบมีบันทึก
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ORACLE-EDIT เฉพาะผู้คุม)
// ใบสั่ง: ledger/trips-briefs/T1.4.md (T1.4 แยก a/b — ไฟล์นี้ = T1.4a) · สัญญา ledger/TRIPS-CORE-CONTRACT.md :71 :151 · T0.8 (ผู้เดินทาง) · ภาพ ledger/design-trips/12-daily-manifest.*
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน)   S ไฟล์/กติกาโค้ด (static)   P ตัวช่วยบริสุทธิ์ (manifest-core)
//   LV ใบรายชื่อบนร้าน seed (now = TRIPS_AS_OF · อ่านอย่างเดียว)
//   FX ตัวควบคุมฟิกซ์เจอร์ (เขียวก่อนมีงาน)   BT ร้านชั่วคราว: สิทธิ์ · แยกหน่วย/ร้าน · จัดกลุ่มตามรถ · สถานะเอกสาร · ผู้เดินทางถูกลบ/ไฟล์รอลบ · PII ใน VM · เพดาน · เขตเวลา · ไม่เขียนฐาน
//   EX ส่งออก CSV: สิทธิ์ · เนื้อหา · กันสูตร · เพดาน · audit   HV เปิดดูข้อมูลสุขภาพ: สิทธิ์แคบ · เนื้อหา · audit รายคน · กุญแจหาย · พร้อมกัน
//   PR บันทึกการพิมพ์   AU สแกนข้อมูลส่วนบุคคลใน audit/outbox/ops/ข้อความผิดพลาด
//
// 🔴 ที่ตรวจไม่ได้ที่นี่ (ไม่มี server/เบราว์เซอร์) = ด่านภาพ + กดจริงผ่าน Next ของผู้คุม: ผังตาราง 1440 · การ์ด 390 · ผังพิมพ์ (emulateMedia print) · ดาวน์โหลดไฟล์ · กล่องสุขภาพไม่ค้างใน storage
// 🔴 แถวทดสอบอยู่ใต้ร้านชั่วคราว slug `trips-t14-*` (ผู้ใช้ `trips-t14-*@shark.local`) ลบใน finally + กวาดค้างตอนเริ่ม · ร้าน seed อ่านอย่างเดียว (ไม่เรียกส่งออก/พิมพ์/สุขภาพกับ seed)
// 🔴 ยังไม่มีโมดูล/ฟังก์ชัน = ข้อแดงพร้อมเหตุผล ไม่ใช่ exception · ห้ามรันพร้อมข้อสอบ TRIPS อื่นบนฐานเดียวกัน
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-trips-t1.4.mts   (ห้าม timeout ครอบ · ห้าม kill กลางคัน)
// ผลที่ถูกต้องก่อนมีงาน T1.4a: PC + FX เขียว · ที่เหลือแดง "ยังไม่มี…"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadTripsQcEnv } from "./trips-qc-env.mjs";
import * as FX from "./trips-fixture.mjs";

const LABEL = "qc-trips-t1.4";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

loadTripsQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
pg.defaults.parseInputDatesAsUTC = true;

// ═══════════════ harness (แบบ qc-trips-t1.3) ═══════════════
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
const noTypeImports = (s: string) => s.replace(/import\s+type[^;]+;/g, "");
const asRec = (v: unknown): Rec | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const asArr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map((x) => asRec(x) ?? {}) : []);
const num = (v: unknown): number => Number(v);
const tryImport = async (spec: string): Promise<{ mod: Rec | null; err: string }> => {
  try { return { mod: asRec(await import(spec)), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const git = (args: string[]) => { try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); } catch { return ""; } };
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `t14qc_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const hex = (n = 6) => randomBytes(n).toString("hex");
const SLUG = "trips-t14-";
const EMAIL_PREFIX = "trips-t14-";
const HOUR = 3_600_000;
const T0 = new Date();
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
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out);
  else { const r = asRec(v); if (r) for (const [k, x] of Object.entries(r)) { out.add(k); keysDeep(x, out); } }
  return out;
};

// ── ตัวอ่าน CSV อ้างอิงของข้อสอบ (RFC 4180 · ไม่พึ่งโค้ดของใบ) ──
function parseCsv(text: string): string[][] {
  const s = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; continue; }
    if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && s[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const FORMULA_START = /^[=+\-@\t\r]/;
const unq = (c: string) => (c.startsWith("'") ? c.slice(1) : c);

// ── ตัวบ่งชี้ที่ปลูก (ต้องไม่โผล่ใน VM/CSV/audit/outbox/ops/ข้อความผิดพลาด ตามที่แต่ละข้อกำหนด) ──
const UP = STAMP.toUpperCase().replace(/[^A-Z0-9]/g, "");
const MK = {
  name: `Zqxname${STAMP}`, doc: `ZQ${UP}7731`, allergy: `zqxalg${STAMP}`, allergy2: `zqxalb${STAMP}`, cond: `zqxcnd${STAMP}`, hold: `Zqxhold${STAMP}`, cxl: `Zqxcxl${STAMP}`, gone: `Zqxgone${STAMP}`,
  other: `Zqxother${STAMP}`, hotel: `Zqxhotel${STAMP}`, phone: `+6689${String(1_000_000 + (Number.parseInt(hex(3), 16) % 8_999_999))}`,
};
const SENSITIVE_MARKERS = () => [MK.doc, MK.allergy, MK.allergy2, MK.cond, MK.phone, MK.phone.slice(3)];
const PERSON_MARKERS = () => [MK.name, MK.hold, MK.cxl, MK.gone, MK.other, MK.hotel, ...SENSITIVE_MARKERS()];
const hits = (text: string, ms: string[]) => ms.filter((m) => text.includes(m)).map((m) => m.slice(0, 12));

// ═══════════════ สเปก (ใบสั่ง T1.4 · ส่วน a) ═══════════════
const BASE_SHA = "002d21e43211abdcf89716d8dc352a51a881aed9"; // wip/trips-t1.4 = session/trips ตอนเขียนใบสั่ง (T0.8 + T1.3a merge แล้ว)
const APP = "src/app/app/u/[unitSlug]/trips";
const PAGE = `${APP}/departures/[departureId]/manifest/page.tsx`;
const MOD = "src/lib/modules/trips/";
const PURE = MOD + "manifest-core.ts";
const SVC = MOD + "manifest.ts";
const ACTIONS = MOD + "manifest-actions.ts";
const OWN_MOD = [PURE, SVC, ACTIONS];
const COMP = "src/components/trips";
const PANEL = `${COMP}/DeparturePanel.tsx`;
const FACADE_T14 = ["loadManifestVM", "exportManifestCsv", "revealManifestHealth", "recordManifestPrint", "TRIPS_MANIFEST_BOOKING_CAP", "TRIPS_MANIFEST_PAX_CAP", "RUN_STOPS_MAX", "MANIFEST_VIEWS",
  "MANIFEST_BOOKING_STATUSES", "MANIFEST_DOC_STATES", "MANIFEST_HEALTH_PURPOSES", "MANIFEST_CSV_COLUMNS", "parseRunStops", "manifestDocState", "csvCell", "manifestCsv", "manifestFileName"];
const VIEWS = ["pickup", "booking"];
const M_STATUSES = ["CONFIRMED", "PART_PAID", "PAID", "TRAVELLED", "NO_SHOW"];
const DOC_STATES = ["PURGED", "MISSING_NAMES", "INCOMPLETE", "COMPLETE"];
const PURPOSES = ["MANIFEST", "SAFETY", "CHECKIN"];
const CSV_COLS = ["group", "pickupTime", "pickupPlace", "bookingCode", "booker", "channel", "paxNo", "traveller", "paxType", "nationality", "docType", "docMasked", "formStatus", "waiver", "health", "finSize"];
const HEALTH_VIEWS = ["NOT_COLLECTED", "MISSING", "PROVIDED", "DECLINED", "WITHDRAWN", "GUARDIAN_REQUIRED", "PURGED"];
const FORM_ST = ["NOT_REQUIRED", "PENDING", "SUBMITTED", "VERIFIED", "NEEDS_FIX"];
const WAIVER_ST = ["NOT_REQUIRED", "MISSING", "SIGNED", "NEEDS_RESIGN"];
const RAW_CODES = new Set([...HEALTH_VIEWS, ...FORM_ST, ...WAIVER_ST, ...DOC_STATES, "PASSPORT", "ID_CARD", "OTHER", "COUNTER", "WEB", "ADULT", "CHILD", "INFANT", "UNASSIGNED", "RUN", "ALL", "DIRECT", "VIA_AGENT"]);
const VM_KEYS = ["unit", "flags", "view", "departure", "totals", "prep", "groups", "bookingsTotal", "bookingsShown", "bookingCap", "truncated", "paxTotal", "paxShown", "paxCap", "paxTruncated"];
const ROW_KEYS = ["bookingId", "code", "status", "bookerName", "bookerPurged", "channel", "agentAccountId", "agentRef", "contactRoute", "pax", "extras", "seats", "pickup", "doc", "outstandingSatang", "phoneMasked", "travellers"];
const PAX_KEYS_VM = ["passengerId", "no", "fullName", "purged", "paxTypeCode", "paxTypeTh", "paxTypeEn", "nationality", "docType", "docMasked", "isMinor", "formStatus", "missing", "waiver", "health", "finSize", "docs"];
const FORBIDDEN_VM_KEYS = /^(docNumber|docNumberEnc|docLast4|box|allergies|conditions|dob|email|phone|publicTokenHash|token|fileId|url|path|guardian|guardianConsent|waiverEvidence|answers|signature)$/i;
const TESTIDS_FIXED = ["trips-mf", "trips-mf-back", "trips-mf-title", "trips-mf-status", "trips-mf-resources", "trips-mf-view-pickup", "trips-mf-view-booking", "trips-mf-view-agency", "trips-mf-actions", "trips-mf-print",
  "trips-mf-export", "trips-mf-health", "trips-mf-send", "trips-mf-runs-edit", "trips-mf-kpis", "trips-mf-kpi-people", "trips-mf-kpi-pickup", "trips-mf-kpi-names", "trips-mf-kpi-waiver", "trips-mf-kpi-money", "trips-mf-kpi-prep",
  "trips-mf-pending-note", "trips-mf-truncated", "trips-mf-stale-note", "trips-mf-table", "trips-mf-cards", "trips-mf-empty", "trips-mf-export-truncated", "trips-mf-export-error", "trips-mf-print-error", "trips-mf-print-footer",
  "trips-health-dialog", "trips-health-warning", "trips-health-purpose", "trips-health-confirm", "trips-health-list", "trips-health-empty"];
const TESTID_PATTERNS = ["trips-mf-group-", "trips-mf-row-", "trips-mf-card-", "trips-mf-pax-toggle-", "trips-mf-pax-"];
const I18N_REQUIRED = [
  "manifest.title", "manifest.back", ...["pickup", "booking", "agency"].map((k) => `manifest.view.${k}`),
  ...["people", "pickup", "names", "waiver", "money", "prep", "bookings", "assigned", "vehicles", "unassigned", "missing", "noWaiver", "agentCollect", "meals", "fins", "finMissing", "healthProvided", "healthMissing"].map((k) => `manifest.kpi.${k}`),
  ...["time", "place", "booker", "people", "docs", "notes", "contact"].map((k) => `manifest.col.${k}`),
  ...["unassigned", "all", "seats", "vehicleRemoved", "route"].map((k) => `manifest.group.${k}`),
  ...DOC_STATES.map((k) => `manifest.docState.${k}`), ...FORM_ST.map((k) => `manifest.formStatus.${k}`), ...WAIVER_ST.map((k) => `manifest.waiver.${k}`), ...HEALTH_VIEWS.map((k) => `manifest.health.${k}`),
  ...["PASSPORT", "ID_CARD", "OTHER"].map((k) => `manifest.docType.${k}`),
  ...["noName", "purged", "files", "pendingDeletion", "minor", "signed", "needsFix", "fromForm"].map((k) => `manifest.pax.${k}`),
  "manifest.contact.viaAgent", "manifest.bookerPurged", ...["send", "runs", "agency"].map((k) => `manifest.notYet.${k}`), ...["pending", "truncated", "stale"].map((k) => `manifest.note.${k}`), "manifest.empty",
  ...["print", "export", "health", "send", "runs", "expand"].map((k) => `manifest.actions.${k}`), ...["truncated", "error"].map((k) => `manifest.export.${k}`), ...["printedAt", "footer", "error"].map((k) => `manifest.print.${k}`),
  ...["title", "warning", "purpose", "confirm", "empty", "allergies", "conditions", "close"].map((k) => `manifest.healthDialog.${k}`),
  ...PURPOSES.map((k) => `manifest.purpose.${k}`), ...CSV_COLS.map((k) => `manifest.csv.${k}`),
];
const VISUAL_SCENES = ["manifest-pickup", "manifest-booking", "manifest-print", "manifest-panel-link"];
/** ไฟล์เดิมที่แก้ได้แบบจำกัด: [ไฟล์, ลบได้สูงสุด, เพิ่มได้สูงสุด (null = ไม่จำกัด)] */
const LIMITED: [string, number, number | null][] = [[MOD + "index.ts", 0, null], [MOD + "departure-screens.ts", 2, 4], [PANEL, 14, 30], [`${COMP}/ProductsScreenParts.tsx`, 3, null],
  ["src/messages/th/trips.json", 2, null], ["src/messages/en/trips.json", 2, null], ["scripts/trips-ui-inventory.json", 14, null], ["scripts/visual-trips.mts", 12, null], ["scripts/parity-trips.sh", 8, null]];
const LIMITED_SET = new Set(LIMITED.map(([f]) => f));
// seed / ภาพ 12
const AS_OF = new Date(FX.TRIPS_AS_OF);
const DIVE_TENANT = FX.SHOP_DIVE.tenant.id;
const U0 = FX.SHOP_DIVE.units.trips.id;
const SEED = { tenantId: DIVE_TENANT, actorUserId: "tripsqc-user-dive-owner" };
const R = FX.PRODUCT_RACHA;
const D14 = FX.DEPARTURE_RACHA_1114.date;
const SEED_PARTY = { pattra: "tripsqc-party-dive-pattra", chen: "tripsqc-party-dive-chenyu", wittaya: "tripsqc-party-dive-wittaya" } as const;
const SEED_PAYABLE = FX.BOOKING_TR_0142.totalSatang + 2 * R.adultSatang + 2 * R.parkAdultSatang + R.adultSatang + R.parkAdultSatang; // 23,750.00
// ร้านชั่วคราว
const NOW0 = "2027-03-01T03:00:00.000Z";
const TRAVEL = "2027-04-10";

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
/** โคลนแถวต้นแบบ n แถว (g = 1..n) — over = นิพจน์ SQL ต่อคอลัมน์ (ใช้ g ได้) */
async function cloneRows(table: string, tplId: string, n: number, over: Record<string, string>): Promise<void> {
  const cs = (await cols(table)).map((c) => c.column_name);
  await pool.query(`INSERT INTO "${table}" (${cs.map((c) => `"${c}"`).join(", ")}) SELECT ${cs.map((c) => over[c] ?? `t."${c}"`).join(", ")} FROM "${table}" t, generate_series(1, ${Math.trunc(n)}) AS g WHERE t.id = $1`, [tplId]);
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
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
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
  const SET = SETI.mod;
  const BOX = (await tryImport("@/lib/core/integrations/secret-box")).mod;
  const PCORE = (await tryImport("@/lib/modules/trips/passengers-core")).mod;
  const needTrips = (): Rec => { if (!TR) throw new AssertFail(`ยังไม่มีโมดูล trips (${TRI.err.slice(0, 120)})`); return TR; };
  const fn = (name: string): AnyFn => { const f = needTrips()[name]; if (typeof f !== "function") throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.4a ยังไม่สร้าง)`); return f as AnyFn; };
  const call = async (name: string, ...a: unknown[]): Promise<Rec> => {
    const f = fn(name);
    try { return asRec(await f(...a)) ?? { ok: "NONE" }; } catch (e) { return { ok: "THROW", e: errMsg(e) }; }
  };
  const S = (name: string): AnyFn => { const f = SET?.[name]; if (typeof f !== "function") throw new AssertFail(`settings ยังไม่มี ${name} (${SETI.err.slice(0, 80)})`); return f as AnyFn; };
  const V = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.value) ?? {}; };
  const VM = (r: Rec, what: string): Rec => { ok(r.ok === true, `${what}: ${fmt(r)}`); return asRec(r.vm) ?? {}; };
  const codeR = (r: Rec, codes: string | string[], what: string) => { const cs = Array.isArray(codes) ? codes : [codes]; ok(r.ok === false && cs.includes(String(r.code)), `${what}: ต้อง ${cs.join("|")} ได้ ${fmt(r)}`); };
  const constOf = (name: string): unknown => { const v = needTrips()[name]; if (v === undefined) throw new AssertFail(`facade trips ยังไม่มี ${name} (T1.4a ยังไม่สร้าง)`); return v; };
  const groupsOf = (vm: Rec) => asArr(vm.groups);
  const rowsOf = (vm: Rec) => groupsOf(vm).flatMap((g) => asArr(g.rows));
  const rowOf = (vm: Rec, id: string) => rowsOf(vm).find((r) => r.bookingId === id) ?? null;
  const seal = (obj: Rec, aad: string): string => { const f = BOX?.sealIntegrationSecret; if (typeof f !== "function") throw new AssertFail("ไม่มี sealIntegrationSecret"); return String((f as AnyFn)(obj, aad)); };

  // seed: การจองตรง 3 ใบของราชา ส. 14 พ.ย.
  const seedBk = await q<{ id: string; code: string; bookerPartyId: string; departureId: string }>(
    `SELECT id, code, "bookerPartyId", "departureId" FROM "TripBooking" WHERE "tenantId" = $1 AND "unitId" = $2 AND "travelDate" = $3::date AND "bookerPartyId" = ANY($4::text[]) ORDER BY code`,
    [DIVE_TENANT, U0, D14, Object.values(SEED_PARTY)]).catch(() => []);
  const seedDep = seedBk[0]?.departureId ?? "";
  const sb = (k: keyof typeof SEED_PARTY) => { const r = seedBk.find((x) => x.bookerPartyId === SEED_PARTY[k]); if (!r) throw new AssertFail(`ไม่มีการจอง seed ของ ${k}`); return r; };
  const seedCounts = async () => (await q<Rec>(
    `SELECT (SELECT count(*) FROM "TripBooking" WHERE "tenantId" = $1)::int AS a, (SELECT count(*) FROM "TripPassenger" WHERE "tenantId" = $1)::int AS b, (SELECT count(*) FROM "AuditLog" WHERE "tenantId" = $1)::int AS c,
            (SELECT count(*) FROM "OutboxEvent" WHERE "tenantId" = $1)::int AS d, (SELECT count(*) FROM "TripVehicleRun" WHERE "tenantId" = $1)::int AS e, (SELECT count(*) FROM "TripDocView" WHERE "tenantId" = $1)::int AS f`, [DIVE_TENANT]))[0];

  // ═══════════════ PC. ตัวควบคุม ═══════════════
  console.log("\n── PC: ตัวควบคุม ──");
  await st("PC-1", "ฐาน qc-trips ต่อได้ · ร้าน seed andaman-dive + หน่วย TRIPS อยู่", async () => {
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BusinessUnit" WHERE id = $1 AND "tenantId" = $2 AND type::text = 'TRIPS'`, [U0, DIVE_TENANT]);
    eq(r[0]?.n, 1, "หน่วย TRIPS ของ seed");
  });
  let seedNamed = -1;
  await st("PC-2", "seed ราชา ส. 14 พ.ย.: การจองตรง 3 ใบ CONFIRMED รอบเดียวกัน · ที่นั่ง 6 (ผู้ใหญ่ 5 · เด็ก 1) · ยังไม่มี TripVehicleRun ของรอบ (ใบนี้ไม่เพิ่ม seed)", async () => {
    eq(seedBk.length, 3, "จำนวนการจอง seed");
    eq(new Set(seedBk.map((b) => b.departureId)).size, 1, "รอบเดียวกัน");
    const s = await q<{ code: string; n: number }>(`SELECT pt.code, sum(i.qty)::int AS n FROM "TripBookingItem" i JOIN "TripPaxType" pt ON pt.id = i."paxTypeId" WHERE i."bookingId" = ANY($1::text[]) AND i.kind = 'SEAT' AND i.active GROUP BY pt.code ORDER BY pt.code`, [seedBk.map((b) => b.id)]);
    eq(s.map((x) => [x.code, x.n]), [["ADULT", 5], ["CHILD", 1]], "ที่นั่งต่อประเภทคน");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripVehicleRun" WHERE "departureId" = $1`, [seedDep]))[0]?.n, 0, "TripVehicleRun ของรอบ seed");
    seedNamed = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripPassenger" WHERE "bookingId" = ANY($1::text[]) AND "fullName" <> ''`, [seedBk.map((b) => b.id)]))[0]?.n ?? -1;
    ok(seedNamed >= 0, "นับผู้เดินทาง seed ไม่ได้");
  });
  await st("PC-3", "ฟิกซ์เจอร์ภาพ 12: รอบราชา 14 พ.ย. 6 การจอง 15 คน (13 ผู้ใหญ่ 2 เด็ก) · การจองตรง 3 ใบ = 6 คน · TRIPS_AS_OF = 12 พ.ย. 2569 18:00", () => {
    const d = FX.DEPARTURE_RACHA_1114;
    eq([d.bookings.length, d.adults, d.children, d.sold], [6, 13, 2, 15], "ภาพ 12");
    const direct = d.bookings.filter((b) => b.agency === null);
    eq([direct.length, direct.reduce((n, b) => n + b.adults + b.children, 0)], [3, 6], "การจองตรง");
    eq(AS_OF.toISOString(), "2026-11-12T11:00:00.000Z", "as-of");
  });
  await st("PC-4", "ของที่ใบนี้ต่อยอดมีจริง: facade (getTripPassengers · revealPassengerData · loadDeparturePanelVM · tripsPageGate · outstandingOf · maskPhone · canSeeSensitive · maskDoc · HEALTH_CONSENT_V1 · bookTripsNow · quoteTrips) · passengers.ts ส่งออก loadCfg/openHealth/PENDING_OBJ_SQL · passengers-core มี parseAnswers/healthViewOf/waiverStatusOf/isPurgedAll", () => {
    for (const n of ["getTripPassengers", "revealPassengerData", "loadDeparturePanelVM", "tripsPageGate", "outstandingOf", "maskPhone", "canSeeSensitive", "maskDoc", "bookTripsNow", "quoteTrips"]) fn(n);
    ok(typeof asRec(needTrips().HEALTH_CONSENT_V1)?.hash === "string", "HEALTH_CONSENT_V1");
    const ps = read(MOD + "passengers.ts");
    for (const n of ["loadCfg", "openHealth"]) ok(new RegExp(`export (async )?function ${n}\\b`).test(ps), `passengers.ts ไม่ส่งออก ${n}`);
    ok(/export const PENDING_OBJ_SQL\b/.test(ps), "PENDING_OBJ_SQL");
    for (const n of ["parseAnswers", "healthViewOf", "waiverStatusOf", "isPurgedAll", "missingFields"]) ok(typeof PCORE?.[n] === "function", `passengers-core ไม่มี ${n}`);
  });
  await st("PC-5", "ตาราง TripVehicleRun ตรงสัญญา (id tenantId unitId departureId resourceId driverEmployeeId stops createdAt updatedAt) + ดัชนี departureId · ดัชนีที่ตัวโหลดใช้: TripBooking (departureId,status) · TripPassenger bookingId · TripDocument passengerId · TripBookingItem bookingId", async () => {
    eq((await cols("TripVehicleRun")).map((c) => c.column_name).sort(), ["createdAt", "departureId", "driverEmployeeId", "id", "resourceId", "stops", "tenantId", "unitId", "updatedAt"], "คอลัมน์");
    const idx = (await q<{ i: string }>(`SELECT indexname AS i FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('TripVehicleRun','TripBooking','TripPassenger','TripDocument','TripBookingItem')`)).map((r) => r.i);
    const miss = ["TripVehicleRun_departureId_idx", "TripBooking_departureId_status_idx", "TripPassenger_bookingId_idx", "TripDocument_passengerId_idx", "TripBookingItem_bookingId_idx"].filter((n) => !idx.includes(n));
    ok(miss.length === 0, `ไม่มีดัชนี: ${miss.join(", ")}`);
  });
  await st("PC-6", "สิทธิ์ที่ใบนี้ใช้อยู่ในทะเบียน (trips.departure.view · passenger.view · passenger.health · passenger.reveal · booking.view) และไม่มีคีย์ trips.manifest.* (ใบนี้ไม่เพิ่มสิทธิ์)", () => {
    const perms = read("src/lib/core/permissions.ts");
    for (const k of ["trips.departure.view", "trips.passenger.view", "trips.passenger.health", "trips.passenger.reveal", "trips.booking.view"]) ok(perms.includes(`"${k}"`), `ไม่มีสิทธิ์ ${k}`);
    ok(!/trips\.manifest\./.test(perms), "มีคีย์ trips.manifest.* (ใบสั่งห้ามเพิ่มสิทธิ์)");
  });
  await st("PC-7", "ตัวอ่าน CSV อ้างอิง + ตัวจับสูตรของข้อสอบทำงาน: อ่าน BOM/เครื่องหมายคำพูด/CRLF ถูก · จับเซลล์ขึ้นต้น = + - @ tab ได้ · ตัวสแกนตัวบ่งชี้จับได้", () => {
    eq(parseCsv(`\uFEFFa,"b ""q"", x",c\r\n1,,"=2"\r\n`), [["a", 'b "q", x', "c"], ["1", "", "=2"]], "parseCsv");
    eq(["=1", "+1", "-1", "@a", "\t=1", "'=1", "a=1", ""].map((c) => FORMULA_START.test(c)), [true, true, true, true, true, false, false, false], "FORMULA_START");
    eq([hits(`x ${MK.allergy} y`, PERSON_MARKERS()).length > 0, hits("สะอาด", PERSON_MARKERS()).length], [true, 0], "ตัวสแกน");
  });
  await st("PC-8", "กล่องปิดผนึกใช้ได้ในสภาพแวดล้อมนี้ (ปิด→เปิดด้วย AAD เดิมได้ · AAD ผิดเปิดไม่ได้) — ไม่งั้นข้อ HV ปลูกข้อมูลสุขภาพไม่ได้", () => {
    const box = seal({ v: 1, allergies: "x" }, "trips.pax.health.v1:t:p");
    const open = BOX?.openIntegrationSecret as AnyFn;
    eq(asRec(open(box, "trips.pax.health.v1:t:p"))?.allergies, "x", "เปิด");
    eq(open(box, "trips.pax.health.v1:t:other"), null, "AAD ผิด");
  });
  groupLine("PC");

  // ═══════════════ S. ไฟล์และกติกาโค้ด ═══════════════
  console.log("\n── S: ไฟล์และกติกาโค้ด (static) ──");
  const compFiles = walk(COMP);
  const appFiles = walk(APP);
  const uiFiles = [...compFiles, ...appFiles];
  const allSrc = uiFiles.map((f) => read(f)).join("\n");
  const mfComp = compFiles.filter((f) => /^Manifest/.test(basename(f)));
  const mfCompSrc = mfComp.map((f) => stripComments(read(f))).join("\n");
  const mfFiles = [...OWN_MOD, ...mfComp, PAGE].filter((f) => existsSync(join(ROOT, f)));
  const needOwn = () => { ok(OWN_MOD.every((f) => existsSync(join(ROOT, f))) && mfComp.some((f) => f.endsWith(".tsx")) && existsSync(join(ROOT, PAGE)), "ไฟล์ของใบยังไม่ครบ (manifest-core · manifest · manifest-actions · Manifest*.tsx · หน้า manifest)"); };
  const flat = (o: unknown, p = ""): [string, unknown][] => { const r = asRec(o); return r ? Object.entries(r).flatMap(([k, v]) => (asRec(v) ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v] as [string, unknown]])) : []; };
  await st("S-1", "ไฟล์เจ้าของครบ: manifest-core.ts · manifest.ts · manifest-actions.ts · คอมโพเนนต์ src/components/trips/Manifest*.tsx · หน้า departures/[departureId]/manifest", () => {
    const miss = [...OWN_MOD, PAGE].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
    ok(mfComp.some((f) => f.endsWith(".tsx")), "ยังไม่มีคอมโพเนนต์ src/components/trips/Manifest*.tsx");
  });
  await st("S-2", `facade trips: บล็อก "// TRIPS T1.4 ▸" ส่งออก ${FACADE_T14.length} ชื่อ · ไม่มี export *`, () => {
    const src = read(MOD + "index.ts");
    ok(/\/\/ TRIPS T1\.4 ▸/.test(src), "ไม่มีบล็อก // TRIPS T1.4 ▸");
    ok(!/export\s+\*/.test(stripComments(src)), "มี export *");
    const miss = FACADE_T14.filter((n) => needTrips()[n] === undefined);
    ok(miss.length === 0, `ยังไม่ส่งออก: ${miss.join(", ")}`);
  });
  await st("S-3", "หน้า manifest: params เป็น Promise แล้ว await · requireUnit + tripsPageGate(page \"departures\") + loadManifestVM · ไม่ส่ง now · notFound() · TripsForbidden · ไม่มี layout/loading/error ใหม่ใต้ segment นี้", () => {
    const s = stripComments(read(PAGE));
    ok(s, "ยังไม่มีหน้า manifest");
    ok(/params\s*:\s*Promise</.test(s) && /await\s+params/.test(s), "params ต้องเป็น Promise แล้ว await (Next 16)");
    ok(/requireUnit\(/.test(s) && /tripsPageGate\(/.test(s) && /["']departures["']/.test(s) && /loadManifestVM\(/.test(s), "หน้าไม่ผ่านด่าน/ไม่เรียกตัวโหลด");
    ok(!/\bnow\s*:/.test(s), "หน้าส่ง now (ต้องใช้นาฬิกาจริง)");
    ok(/notFound\(/.test(s) && /TripsForbidden/.test(s), "ต้องมี notFound() และ TripsForbidden");
    const extra = walk(`${APP}/departures/[departureId]`).filter((f) => /(layout|loading|error|template)\.tsx$/.test(f));
    ok(extra.length === 0, `ไฟล์โครงใหม่: ${extra.join(", ")}`);
  });
  await st("S-4", "ไม่มี prisma ในหน้า/คอมโพเนนต์ · ไฟล์โมดูลของใบไม่ import prisma ตรง", () => {
    needOwn();
    const badUi = uiFiles.filter((f) => /@\/lib\/core\/db|@prisma\/client["']|\bprisma\./.test(noTypeImports(stripComments(read(f)))));
    const badMod = OWN_MOD.filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(noTypeImports(stripComments(read(f)))));
    ok(badUi.length === 0 && badMod.length === 0, `prisma: ${[...badUi, ...badMod].join(", ")}`);
  });
  await st("S-5", "ไม่มี any ในไฟล์ของใบ", () => {
    needOwn();
    const bad = mfFiles.filter((f) => /:\s*any\b|\bas\s+any\b|<any>|\bany\[\]/.test(stripComments(read(f))));
    ok(bad.length === 0, `มี any: ${bad.join(", ")}`);
  });
  await st("S-6", "'use client' ของ Manifest* ไม่ import ของที่ลากถึง prisma (facade trips · core/settings · core/db · manifest.ts) — เรียกเซิร์ฟเวอร์ผ่าน manifest-actions (\"use server\") เท่านั้น", () => {
    const clients = mfComp.filter((f) => /^\s*["']use client["']/.test(read(f)));
    ok(clients.length > 0, "ยังไม่มีไฟล์ 'use client' ของ T1.4");
    const bad: string[] = [];
    for (const f of clients) {
      for (const m of stripComments(read(f)).matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s*["']([^"']+)["']/gm)) {
        if (m[1]) continue;
        const spec = m[2] ?? "";
        if (/^@\/lib\/core\/db|^@prisma\/client$|^@\/lib\/core\/settings$|^@\/lib\/modules\/trips$|^@\/lib\/modules\/trips\/index|^@\/lib\/modules\/party/.test(spec)) { bad.push(`${f} → ${spec}`); continue; }
        const mm = /^@\/lib\/modules\/trips\/([\w-]+)$/.exec(spec);
        if (mm) {
          const dep = read(`${MOD}${mm[1]}.ts`);
          if (!/^\s*["']use server["']/.test(dep) && /@\/lib\/core\/db|tenantDb|@prisma\/client["']|from\s*["']\.\/(passengers|pickup|manifest)["']/.test(noTypeImports(stripComments(dep)))) bad.push(`${f} → ${spec} (ลาก db)`);
        }
      }
    }
    ok(bad.length === 0, bad.slice(0, 5).join(" · "));
  });
  await st("S-7", `data-testid ครบในซอร์ส: ตายตัว ${TESTIDS_FIXED.length} + แพตเทิร์น ${TESTID_PATTERNS.length}`, () => {
    needOwn();
    const miss = TESTIDS_FIXED.filter((t) => !new RegExp(`data-testid=\\{?["'\`]${t}["'\`]`).test(allSrc));
    const missP = TESTID_PATTERNS.filter((p) => !allSrc.includes(`\`${p}\${`) && !allSrc.includes(`"${p}" +`) && !allSrc.includes(`'${p}' +`));
    ok(miss.length === 0 && missP.length === 0, `ขาด: ${[...miss, ...missP.map((p) => p + "*")].slice(0, 12).join(", ")}${miss.length + missP.length > 12 ? " …" : ""}`);
  });
  await st("S-8", "ทะเบียนปุ่ม: แถว wo T1.4 ครอบ testid ของใบ · page …/departures/[departureId]/manifest · roles ถูก · needs = คีย์สิทธิ์จริง · ไม่มีแถวผีทั้งไฟล์", () => {
    const raw = read("scripts/trips-ui-inventory.json");
    ok(raw, "ไม่มี scripts/trips-ui-inventory.json");
    const rows = asArr(asRec(JSON.parse(raw))?.rows);
    const mine = rows.filter((r) => r.wo === "T1.4");
    ok(mine.length > 0, "ยังไม่มีแถว wo T1.4");
    const kinds = ["button", "link", "menu", "tab", "toggle", "drag", "form", "filter", "input", "textarea", "select", "notice"];
    const perms = read("src/lib/core/permissions.ts");
    const bad = mine.filter((r) => typeof r.page !== "string" || !String(r.page).startsWith("/app/u/[unitSlug]/trips/departures/[departureId]/manifest") || typeof r.testid !== "string" || !kinds.includes(String(r.kind))
      || !Array.isArray(r.roles) || (r.roles as unknown[]).length === 0 || !(r.roles as unknown[]).every((x) => ["owner", "editor", "viewer"].includes(String(x))) || r.system !== "TRIPS" || !asRec(r.expect)?.type
      || (typeof r.needs === "string" && !/trips\.[a-z]+\./.test(String(r.needs))) || (typeof r.needs === "string" && !(String(r.needs).match(/trips\.[a-z]+\.[a-z_]+/g) ?? []).every((k) => perms.includes(`"${k}"`))));
    ok(bad.length === 0, `แถวพิการ ${bad.length}: ${fmt(bad[0])}`);
    const ids = mine.map((r) => String(r.testid));
    const miss = [...TESTIDS_FIXED.filter((t) => !ids.includes(t)), ...TESTID_PATTERNS.filter((p) => !ids.includes(`${p}*`)).map((p) => `${p}*`)];
    ok(miss.length === 0, `ไม่มีแถว: ${miss.slice(0, 10).join(", ")}`);
    const ghost = rows.map((r) => String(r.testid)).filter((t) => (t.endsWith("*") ? !allSrc.includes(t.slice(0, -1)) : !allSrc.includes(t)));
    ok(ghost.length === 0, `แถวผี: ${ghost.slice(0, 8).join(", ")}`);
    const health = mine.find((r) => r.testid === "trips-mf-health");
    ok(String(health?.needs ?? "").includes("trips.passenger.health"), "trips-mf-health ต้อง needs trips.passenger.health");
  });
  await st("S-9", `i18n: th/en คีย์ตรงกัน · คีย์ขั้นต่ำของใบครบ ${I18N_REQUIRED.length} · ค่าอังกฤษใต้ manifest ไม่มีอักษรไทย · ไม่มีรหัสใบงาน/POS ในค่าใต้ manifest`, () => {
    const th = read("src/messages/th/trips.json"), en = read("src/messages/en/trips.json");
    ok(th && en, "ไม่มี trips.json");
    const ft = flat(JSON.parse(th)), fe = flat(JSON.parse(en));
    const kt = ft.map(([k]) => k).sort();
    eq(kt, fe.map(([k]) => k).sort(), "คีย์ th = en");
    const miss = I18N_REQUIRED.filter((k) => !kt.includes(k));
    ok(miss.length === 0, `คีย์ขาด ${miss.length}: ${miss.slice(0, 10).join(", ")}`);
    const thaiEn = fe.filter(([k, v]) => k.startsWith("manifest.") && typeof v === "string" && /[฀-๿]/.test(v)).map(([k]) => k);
    ok(thaiEn.length === 0, `en มีอักษรไทย: ${thaiEn.slice(0, 5).join(", ")}`);
    const badVal = [...ft, ...fe].filter(([k, v]) => k.startsWith("manifest.") && typeof v === "string" && (/\b[TAWKLSX]\d\.\d{1,2}[a-c]?\b|\bOQ\d+\b|\bPOS\b|เครื่องขาย/.test(v) || v.trim() === "")).map(([k]) => k);
    ok(badVal.length === 0, `ค่ามีรหัสใบงาน/POS/ว่าง: ${badVal.slice(0, 5).join(", ")}`);
    const same = I18N_REQUIRED.filter((k) => !k.startsWith("manifest.csv.") && ft.find(([x]) => x === k)?.[1] === fe.find(([x]) => x === k)?.[1]);
    ok(same.length <= 2, `ค่าไทย = อังกฤษ (ยังไม่แปล) ${same.length}: ${same.slice(0, 5).join(", ")}`);
  });
  await st("S-10", "ไม่แสดงรหัสดิบบนจอ: คอมโพเนนต์ Manifest* ไม่มี {x.status|state|kind|channel|health|waiver|formStatus|docType|contactRoute|paxTypeCode|purpose} เป็นข้อความ JSX (แอตทริบิวต์ได้)", () => {
    needOwn();
    const bad = mfComp.filter((f) => /[^=\s$]\s*\{\s*[\w.?]+\.(status|state|kind|channel|health|waiver|formStatus|docType|contactRoute|paxTypeCode|purpose)\s*\}/.test(stripComments(read(f))));
    ok(bad.length === 0, `แสดงรหัสดิบ: ${bad.join(", ")}`);
  });
  await st("S-11", "วันเวลา/ความบริสุทธิ์: ไฟล์ของใบไม่ใช้ getDay/getDate/getHours/… หรือ toLocaleDate/TimeString · คอมโพเนนต์ไม่อ่านนาฬิกา · manifest-core import ได้เฉพาะ `import type` ไม่มี Date.now/new Date()/process/await", () => {
    needOwn();
    const bad = mfFiles.filter((f) => /\.(getDay|getDate|getHours|getMinutes|getMonth|getFullYear)\(|toLocale(Date|Time)String\(/.test(stripComments(read(f))));
    const clock = mfComp.filter((f) => /new Date\(\s*\)|Date\.now\(/.test(stripComments(read(f))));
    ok(bad.length === 0 && clock.length === 0, `ใช้เวลาเครื่อง: ${[...bad, ...clock].join(", ")}`);
    const p = stripComments(read(PURE));
    ok(!/^\s*import\s+(?!type\b)/m.test(p), "manifest-core มี import ที่ไม่ใช่ type");
    ok(!/Date\.now\(|new Date\(\s*\)|process\.|\bawait\b|\bfetch\(|tenantDb|console\./.test(p), "manifest-core ไม่บริสุทธิ์ (นาฬิกา/I/O)");
  });
  await st("S-12", "manifest-actions.ts: \"use server\" · ส่งออกเฉพาะ async function 3 ตัว (export/reveal/print) · ทุกตัว requireUnit · ไม่รับ/ไม่ส่ง now · unitId มาจากหน่วยของ slug", () => {
    const raw = read(ACTIONS); const s = stripComments(raw);
    ok(raw, "ยังไม่มี manifest-actions.ts");
    ok(/^\s*["']use server["']/.test(raw), "ไม่ใช่ \"use server\"");
    const exps = [...s.matchAll(/^export\s+(async\s+function|function|const|let|class|type|interface|\{|\*)\s*(\w*)/gm)].map((m) => [m[1], m[2]]);
    ok(exps.every(([k]) => k === "async function"), `ส่งออกอย่างอื่นนอกจาก async function: ${fmt(exps.filter(([k]) => k !== "async function"))}`);
    eq(exps.map(([, n]) => n).sort(), ["exportManifestCsvAction", "recordManifestPrintAction", "revealManifestHealthAction"], "ชื่อ action");
    ok((s.match(/requireUnit\(/g) ?? []).length >= 3 || /async function enter\b[\s\S]*requireUnit\(/.test(s), "ทุก action ต้อง requireUnit");
    ok(!/\bnow\b/.test(s), "action รับ/ส่งเวลา (ห้ามมี now)");
    ok(/unit\.id\b/.test(s) && !/unitId:\s*(input|i|raw|data|body)\??\.unitId/.test(s), "unitId ต้องมาจากหน่วยของ slug (unit.id) ไม่ใช่จาก input");
  });
  await st("S-13", `ขอบเขต (เทียบ BASE ${BASE_SHA.slice(0, 9)} · ไม่นับไฟล์ที่ตรงกับ session/trips): ไม่แตะ prisma/core/platform/payment/api/โมดูลอื่น/ไฟล์บริการ trips เดิม/คอมโพเนนต์ trips เดิม/โครง route เดิม/ข้อสอบเดิม/seed · ไฟล์ที่แก้ได้จำกัดจำนวนบรรทัด`, () => {
    needOwn();
    ok(git(["cat-file", "-t", BASE_SHA]).trim() === "commit", `หา BASE ${BASE_SHA} ไม่เจอ`);
    const lit = (p: string) => `:(literal)${p}`;
    const atBase = (dir: string) => git(["ls-tree", "-r", "--name-only", BASE_SHA, `${dir}/`]).split("\n").filter(Boolean);
    const forbidden = ["prisma", "src/lib/core", "src/lib/platform", "src/lib/payment", "src/app/api", "src/lib/outbox-consumers.ts",
      ...["pos", "account", "party", "approval", "hotel", "rooms", "booking", "dorm", "queue", "ticket", "agency", "supplier", "hr"].map((m) => `src/lib/modules/${m}`),
      ...atBase("src/lib/modules/trips").filter((f) => !LIMITED_SET.has(f)), ...atBase(COMP).filter((f) => !LIMITED_SET.has(f)), ...atBase(APP),
      ...atBase("scripts").filter((f) => /^scripts\/(qc-trips-[\w.]+\.mts|probe-trips-[\w.-]+\.mts)$/.test(f) && f !== "scripts/qc-trips-t1.4.mts"), "scripts/fitness.mts", "scripts/with-gate-lock.sh", "scripts/seed-trips-qc.mts", "scripts/trips-fixture.mts", "scripts/iso.sh", "scripts/qc-trips.sh"];
    const sameAsSession = (f: string) => git(["diff", "--name-only", "session/trips", "--", lit(f)]).trim() === "" && git(["ls-files", "--others", "--exclude-standard", "--", lit(f)]).trim() === "";
    const changed = [...new Set([...git(["diff", "--name-only", BASE_SHA, "--", ...forbidden.map(lit)]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard", "--", ...forbidden.filter((p) => !p.includes(".")).map(lit)]).split("\n")].filter(Boolean))];
    const touched = changed.filter((f) => !sameAsSession(f));
    ok(touched.length === 0, `แตะไฟล์ต้องห้าม: ${touched.slice(0, 6).join(", ")}`);
    const over: string[] = [];
    for (const [f, maxDel, maxAdd] of LIMITED) {
      const line = git(["diff", "--numstat", BASE_SHA, "--", lit(f)]).trim();
      if (!line || sameAsSession(f)) continue;
      const [a, d] = line.split("\t").map(Number);
      if (d > maxDel || (maxAdd !== null && a > maxAdd)) over.push(`${f} +${a}/−${d} (ได้ +${maxAdd ?? "∞"}/−${maxDel})`);
    }
    ok(over.length === 0, over.join(" · "));
    const newMod = git(["ls-files", "--others", "--exclude-standard", "--", lit("src/lib/modules/trips")]).split("\n").filter(Boolean).filter((f) => !OWN_MOD.includes(f));
    ok(newMod.length === 0, `ไฟล์โมดูลใหม่นอกรายการ: ${newMod.join(", ")}`);
    const newComp = git(["ls-files", "--others", "--exclude-standard", "--", lit(COMP)]).split("\n").filter(Boolean).filter((f) => !/^Manifest/.test(basename(f)));
    ok(newComp.length === 0, `คอมโพเนนต์ใหม่ที่ไม่ขึ้นต้น Manifest: ${newComp.join(", ")}`);
  });
  await st("S-14", "วินัยการเขียน: manifest-core/manifest ไม่เขียน/ลบตาราง Trip* (ไม่มี update/delete/upsert · ไม่มี INSERT/UPDATE/DELETE ตารางอื่นนอกจาก AuditLog · ไม่มี tripX.create) · ไม่ส่ง outbox/event · ไม่มี console.*", () => {
    needOwn();
    const s = stripComments(read(SVC)) + "\n" + stripComments(read(PURE));
    ok(!/\.(delete|deleteMany|update|updateMany|upsert)\(/.test(s), "มี update/delete/upsert");
    ok(!/\bUPDATE\s+"|\bDELETE\s+FROM\b/i.test(s), "มี SQL UPDATE/DELETE");
    const ins = [...s.matchAll(/INSERT\s+INTO\s+"(\w+)"/gi)].map((m) => m[1]).filter((t) => t !== "AuditLog");
    ok(ins.length === 0, `INSERT ตาราง ${ins.join(", ")}`);
    ok(!/\btrip[A-Z]\w*\.(create|createMany)\(/.test(s), "สร้างแถว Trip* ผ่าน prisma");
    ok(!/outboxEvent|OutboxEvent|emitTx\(|publishEvent\(|enqueue\w*\(/.test(s), "ส่ง outbox/event (ใบนี้ไม่มี event)");
    ok(!/console\.(log|info|debug|warn|error)\(/.test(s), "มี console.* ในบริการ (เสี่ยงข้อมูลบุคคลลง log)");
  });
  await st("S-15", "ไม่แตะระบบอื่น/ทางลัดต้องห้าม: ไฟล์ของใบไม่ import modules/{pos,account,hotel,rooms,dorm,approval,agency,hr} หรือ modules/party/<ไฟล์ใน> · manifest.ts ไม่เรียก getTripPassengers/revealPassengerData/passengerDocumentUrl/privateFileUrl/signLink/getProfile/searchByName", () => {
    needOwn();
    const bad = mfFiles.filter((f) => /from\s*["']@\/lib\/modules\/(pos|account|hotel|rooms|dorm|approval|agency|hr)\b|from\s*["']@\/lib\/modules\/party\/|from\s*["']@\/lib\/payment/.test(stripComments(read(f))));
    ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
    const s = stripComments(read(SVC));
    const calls = ["getTripPassengers", "revealPassengerData", "passengerDocumentUrl", "privateFileUrl", "signLink", "getProfile", "searchByName", "exportPassengerData", "openDocNumber"].filter((n) => new RegExp(`\\b${n}\\(`).test(s));
    ok(calls.length === 0, `เรียก: ${calls.join(", ")}`);
  });
  await st("S-16", "ตัวโหลดมีเพดาน + ไม่ N+1: มี take/LIMIT ผูกค่าคงที่เพดาน · ไม่มี await ในลูป · ไม่มี .map(async · listBriefsByIds ≤ 1 ที่ · loadCfg ≤ 3 ที่ (ครั้งเดียวต่อฟังก์ชัน) · openHealth เฉพาะในบริการสุขภาพ (≤ 1 ที่)", () => {
    const s = stripComments(read(SVC));
    ok(s, "ยังไม่มี manifest.ts");
    ok(/TRIPS_MANIFEST_BOOKING_CAP/.test(s) && /TRIPS_MANIFEST_PAX_CAP/.test(s) && /\btake\s*:|\bLIMIT\b/.test(s), "ไม่มีเพดาน (take/LIMIT + ค่าคงที่)");
    ok(!/for\s*(await\s*)?\([^)]*\)\s*\{[^{}]*\bawait\b/.test(s) && !/\.map\(\s*async\b/.test(s) && !/\.forEach\(\s*async\b/.test(s), "มี await ในลูป / .map(async (N+1)");
    eq([(s.match(/listBriefsByIds\(/g) ?? []).length <= 1, (s.match(/\bloadCfg\(/g) ?? []).length <= 3, (s.match(/\bopenHealth\(/g) ?? []).length <= 1], [true, true, true], "จำนวนจุดเรียก [listBriefsByIds ≤1, loadCfg ≤3, openHealth ≤1]");
    ok(/tripsUnitGate\(/.test(s) && /canSeeSensitive\(/.test(s), "ต้องใช้ tripsUnitGate + canSeeSensitive");
  });
  await st("S-17", "คอมโพเนนต์ไม่คิดเงิน/ไม่จัดรูปเงินเอง: Manifest* ใช้ formatBaht ของ trips-shared · ไม่มี toFixed/toLocaleString/Intl.NumberFormat/parseFloat// 100 · ไม่ใช้ localStorage/sessionStorage/document.cookie (ข้อมูลสุขภาพห้ามค้าง)", () => {
    needOwn();
    ok(!/\.toFixed\(|\.toLocaleString\(|Intl\.NumberFormat|parseFloat\(|\/\s*100\b/.test(mfCompSrc), "จัดรูป/คิดเงินเอง");
    ok(/formatBaht\(/.test(mfCompSrc), "ไม่ใช้ formatBaht");
    ok(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(mfCompSrc), "ใช้ storage ของเบราว์เซอร์");
    ok(!/searchParams[^\n]*(allerg|condition|health)/i.test(mfCompSrc), "ใส่ข้อมูลสุขภาพใน URL");
  });
  await st("S-18", "พิมพ์/ส่งออก/ผัง: มี data-print-root=\"trips-manifest\" + กฎ @media print (หรือคลาส print:) + print:hidden · window.print ถูกเรียกหลัง recordManifestPrintAction · ส่งออกผ่าน exportManifestCsvAction + Blob (ไม่มี href ไป /api) · ไฟล์ที่มี <table ไม่มี sr-only · มีทางแสดงผลแบบการ์ดสำหรับจอแคบ (md:/hidden)", () => {
    needOwn();
    ok(/data-print-root=["']trips-manifest["']/.test(mfCompSrc), "ไม่มี data-print-root=\"trips-manifest\"");
    ok(/@media\s+print/.test(mfCompSrc) && /print:hidden/.test(mfCompSrc), "ไม่มีกฎ @media print / print:hidden");
    const iPrint = mfCompSrc.indexOf("window.print("), iRec = mfCompSrc.indexOf("recordManifestPrintAction(");
    ok(iRec >= 0 && iPrint > iRec, "window.print ต้องตามหลัง recordManifestPrintAction");
    ok(/exportManifestCsvAction\(/.test(mfCompSrc) && /new Blob\(/.test(mfCompSrc) && /revealManifestHealthAction\(/.test(mfCompSrc), "ไม่เรียก action ส่งออก/สุขภาพ หรือไม่ใช้ Blob");
    ok(!/["'`]\/api\//.test(mfCompSrc), "ลิงก์ไป /api");
    const sr = mfComp.filter((f) => /<table\b/.test(read(f)) && /sr-only/.test(read(f)));
    ok(sr.length === 0, `sr-only ในไฟล์ตาราง: ${sr.join(", ")}`);
    ok(/\bmd:(hidden|block|table|grid|flex)\b/.test(mfCompSrc) && /\bhidden\b/.test(mfCompSrc), "ไม่มีการสลับตาราง/การ์ดตามความกว้าง");
    ok(/role=["']alert["']/.test(mfCompSrc), "ข้อผิดพลาดต้องมี role=\"alert\"");
  });
  await st("S-19", "ภาพคู่: visual-trips มีสเปก \"t1.4\" 4 ฉาก (manifest-pickup · manifest-booking · manifest-print · manifest-panel-link) mockup \"12\" · parity-trips.sh รับ 12 ⇒ 12-daily-manifest", () => {
    const v = read("scripts/visual-trips.mts"), p = read("scripts/parity-trips.sh");
    ok(/["']t1\.4["']\s*:/.test(v), "visual-trips ไม่มีสเปก t1.4");
    const miss = VISUAL_SCENES.filter((n) => !new RegExp(`name:\\s*["']${n}["']`).test(v));
    ok(miss.length === 0, `ฉากขาด: ${miss.join(", ")}`);
    ok(/mockup:\s*["']12["']/.test(v) && /print/.test(v.slice(v.indexOf("manifest-print"), v.indexOf("manifest-print") + 400)), "mockup 12 / ฉากพิมพ์ไม่ใช้สื่อ print");
    ok(/12\)\s*NAME="12-daily-manifest"/.test(p), "parity-trips.sh ไม่รับ 12");
  });
  await st("S-20", "แผงรอบ (หนี้ T1.2): departure-screens ไม่ตรึง `manifest: false` แล้ว · DeparturePanel ปุ่ม trips-dep-manifest เป็นลิงก์ไป …/manifest ตาม actions.manifest (ไม่ disabled ตายตัว)", () => {
    const ds = stripComments(read(MOD + "departure-screens.ts"));
    const lines = ds.split("\n").filter((l) => /^\s*manifest:\s*/.test(l));
    ok(lines.some((l) => !/manifest:\s*false\s*,?\s*$/.test(l)), "departure-screens ยัง manifest: false ทุกที่");
    ok(lines.some((l) => /trips\.passenger\.view|canManifest|canPax/.test(l)) || /trips\.passenger\.view/.test(ds), "actions.manifest ต้องผูกสิทธิ์ trips.passenger.view");
    const pn = stripComments(read(PANEL));
    const i = pn.indexOf("trips-dep-manifest");
    ok(i >= 0, "ไม่มี trips-dep-manifest");
    const seg = pn.slice(Math.max(0, i - 600), i + 600);
    ok(/\/manifest/.test(seg) && /actions\.manifest|\.manifest\b/.test(seg), "ปุ่มไม่ลิงก์ไป /manifest ตาม actions.manifest");
    ok(/<Link\b|<a\b|href=/.test(seg), "ต้องเป็นลิงก์จริง");
  });
  groupLine("S");

  // ═══════════════ P. ตัวช่วยบริสุทธิ์ ═══════════════
  console.log("\n── P: ตัวช่วยบริสุทธิ์ (manifest-core) ──");
  await st("P-1", "ค่าคงที่: MANIFEST_VIEWS · MANIFEST_BOOKING_STATUSES (= ชุดที่นับ sold) · MANIFEST_DOC_STATES · MANIFEST_HEALTH_PURPOSES (ไม่มี OTHER) · MANIFEST_CSV_COLUMNS 16 · RUN_STOPS_MAX 60 · เพดาน 100–300 / 300–1000", () => {
    eq(constOf("MANIFEST_VIEWS"), VIEWS, "VIEWS"); eq(constOf("MANIFEST_BOOKING_STATUSES"), M_STATUSES, "STATUSES"); eq(constOf("MANIFEST_DOC_STATES"), DOC_STATES, "DOC_STATES");
    eq(constOf("MANIFEST_HEALTH_PURPOSES"), PURPOSES, "PURPOSES"); eq(constOf("MANIFEST_CSV_COLUMNS"), CSV_COLS, "CSV_COLUMNS"); eq(constOf("RUN_STOPS_MAX"), 60, "RUN_STOPS_MAX");
    const c = num(constOf("TRIPS_MANIFEST_BOOKING_CAP")), p = num(constOf("TRIPS_MANIFEST_PAX_CAP"));
    ok(Number.isInteger(c) && c >= 100 && c <= 300 && Number.isInteger(p) && p >= 300 && p <= 1000, `เพดาน ${c}/${p}`);
  });
  await st("P-2", "parseRunStops: รูปถูกผ่าน (note ว่าง ⇒ null · ตัดคีย์แปลก) · ไม่ใช่อาร์เรย์ ⇒ [] · ไม่ throw", () => {
    const f = fn("parseRunStops");
    eq(f([{ bookingId: "b1", place: " ป่าตอง เมอร์ลิน ", note: "ล็อบบี้", time: "06:45", x: 1 }, { bookingId: "b2", place: "กะรน", time: "07:10" }, { bookingId: "b3", place: "กะตะ", note: "", time: "23:59" }]),
      [{ bookingId: "b1", place: "ป่าตอง เมอร์ลิน", note: "ล็อบบี้", time: "06:45" }, { bookingId: "b2", place: "กะรน", note: null, time: "07:10" }, { bookingId: "b3", place: "กะตะ", note: null, time: "23:59" }], "รูปถูก");
    for (const bad of [null, undefined, "x", 5, {}, { stops: [] }]) eq(f(bad), [], `ไม่ใช่อาร์เรย์ ${fmt(bad)}`);
  });
  await st("P-3", "parseRunStops: ทิ้งรายการผิดรูป (ไม่มี bookingId · เวลา 24:00/7:5/ว่าง · place ว่าง/ยาว 121/มีอักขระควบคุม · ไม่ใช่วัตถุ) · bookingId ซ้ำเก็บตัวแรก · เกิน 60 เก็บ 60 ตัวแรก", () => {
    const f = fn("parseRunStops");
    const good = { bookingId: "ok", place: "ที่ดี", time: "08:00" };
    const out = f([{ place: "x", time: "08:00" }, { bookingId: "a", place: "x", time: "24:00" }, { bookingId: "b", place: "x", time: "7:5" }, { bookingId: "c", place: "x" }, { bookingId: "d", place: "   ", time: "08:00" },
      { bookingId: "e", place: "ก".repeat(121), time: "08:00" }, { bookingId: "f", place: "a\u0000b", time: "08:00" }, { bookingId: "g", place: "a\nb", time: "08:00" }, "str", null, 7, { bookingId: 5, place: "x", time: "08:00" }, { bookingId: "", place: "x", time: "08:00" },
      { bookingId: "z".repeat(129), place: "x", time: "08:00" }, good, { ...good, place: "ซ้ำ", time: "09:00" }]);
    eq(out, [{ bookingId: "ok", place: "ที่ดี", note: null, time: "08:00" }], "กรอง");
    eq(asArr(f([{ bookingId: "k", place: "ก".repeat(120), time: "00:00" }])).length, 1, "place 120 ตัวผ่าน");
    const many = asArr(f(Array.from({ length: 75 }, (_, i) => ({ bookingId: `b${i}`, place: "p", time: "08:00" }))));
    eq([many.length, many[0]?.bookingId, many[59]?.bookingId], [60, "b0", "b59"], "เพดาน 60");
  });
  await st("P-4", "manifestDocState: ตารางตัดสิน (PURGED → MISSING_NAMES → INCOMPLETE → COMPLETE)", () => {
    const f = fn("manifestDocState");
    const t: [Rec, string][] = [[{ seats: 2, slots: 2, purged: 2, named: 0, formComplete: 0 }, "PURGED"], [{ seats: 4, slots: 4, purged: 0, named: 0, formComplete: 0 }, "MISSING_NAMES"], [{ seats: 4, slots: 0, purged: 0, named: 0, formComplete: 0 }, "MISSING_NAMES"],
      [{ seats: 3, slots: 3, purged: 1, named: 2, formComplete: 2 }, "MISSING_NAMES"], [{ seats: 3, slots: 3, purged: 0, named: 3, formComplete: 2 }, "INCOMPLETE"], [{ seats: 3, slots: 3, purged: 0, named: 3, formComplete: 3 }, "COMPLETE"],
      [{ seats: 0, slots: 0, purged: 0, named: 0, formComplete: 0 }, "COMPLETE"], [{ seats: 2, slots: 3, purged: 0, named: 3, formComplete: 3 }, "COMPLETE"]];
    for (const [i, exp] of t) eq(f(i), exp, fmt(i));
  });
  await st("P-5", "csvCell กันสูตร: ค่าที่ขึ้นต้น = + - @ ได้ ' นำหน้า · tab/CR/LF/NUL นำหน้าถูกแทนด้วยช่องว่างแล้ว trim ก่อนตัดสิน (\"\\t=1\" ⇒ '=1) · ค่าปกติไม่ถูกแตะ", () => {
    const f = fn("csvCell");
    eq(["=1+1", "+66812345678", "-2+3", "@SUM(A1)", "\t=1+1", "\r\n=cmd", " =x", "\u0000@y", "a=b", "สมชาย ใจดี", "'=1"].map((x) => f(x)), ["'=1+1", "'+66812345678", "'-2+3", "'@SUM(A1)", "'=1+1", "'=cmd", "'=x", "'@y", "a=b", "สมชาย ใจดี", "'=1"], "กันสูตร");
  });
  await st("P-6", "csvCell: null/undefined ⇒ \"\" · จำนวนเต็ม ⇒ ตัวเลข · NaN/Infinity/ทศนิยม ⇒ \"\" · อักขระควบคุมกลางข้อความ ⇒ ช่องว่าง · มี \" หรือ , ⇒ ครอบและซ้ำ \" · ผลไม่มี CR/LF/tab เลย", () => {
    const f = fn("csvCell");
    eq([f(null), f(undefined), f(0), f(15), f(Number.NaN), f(Number.POSITIVE_INFINITY), f(1.5)], ["", "", "0", "15", "", "", ""], "ค่าพื้นฐาน");
    eq([f("a\nb"), f("a\tb\r\nc"), f('say "hi"'), f("a,b"), f('=1,"x"')], ["a b", "a b  c", '"say ""hi"""', '"a,b"', `"'=1,""x"""`], "ครอบ/แทน");
    for (const x of ["a\nb", "\r\n", "x\ty", "\u007f=1", "\u001f"]) ok(!/[\r\n\t\u0000-\u001f\u007f]/.test(String(f(x))), `เหลืออักขระควบคุม: ${fmt(f(x))}`);
  });
  await st("P-7", "manifestCsv: ขึ้นต้น BOM · จบทุกบรรทัดด้วย CRLF · หัว+แถวผ่าน csvCell · แถวสั้น/ยาวถูกปรับเท่าหัว · อ่านกลับด้วยตัวอ่านอ้างอิงได้ค่าเดิม", () => {
    const f = fn("manifestCsv");
    const csv = String(f(["ชื่อ", "จำนวน", "=หัว"], [["สมชาย, ใจดี", 4, null], ['Jonas "JW"', 2, "@x"], ["สั้น"], ["ยาว", 1, "a", "เกิน"]]));
    ok(csv.startsWith("\uFEFF"), "ไม่มี BOM");
    ok(csv.endsWith("\r\n") && !/[^\r]\n/.test(csv), "จบบรรทัดไม่ใช่ CRLF");
    eq(parseCsv(csv), [["ชื่อ", "จำนวน", "'=หัว"], ["สมชาย, ใจดี", "4", ""], ['Jonas "JW"', "2", "'@x"], ["สั้น", "", ""], ["ยาว", "1", "a"]], "อ่านกลับ");
  });
  await st("P-8", "manifestCsv ทนข้อมูลร้าย (สุ่ม 300 เซลล์จากอักขระ = + - @ \" , tab CR LF ' ไทย): จำนวนแถว/คอลัมน์คงเดิม · ไม่มีเซลล์ใดขึ้นต้นด้วย = + - @ tab", () => {
    const f = fn("manifestCsv");
    const alpha = ["=", "+", "-", "@", '"', ",", "\t", "\r", "\n", "'", "ก", "a", " ", "1", "|", "\u0000"];
    let seed = 20261113; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const rows = Array.from({ length: 100 }, () => Array.from({ length: 3 }, () => Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => alpha[Math.floor(rnd() * alpha.length)]).join("")));
    const back = parseCsv(String(f(["a", "b", "c"], rows)));
    eq([back.length, back.every((r) => r.length === 3)], [101, true], "รูปตาราง");
    const bad = back.slice(1).flat().filter((c) => FORMULA_START.test(c));
    ok(bad.length === 0, `เซลล์อันตราย ${bad.length}: ${fmt(bad.slice(0, 3))}`);
  });
  await st("P-9", "manifestFileName: manifest-<วันที่>-<6 ตัวท้าย [A-Za-z0-9] ของ id>.csv · วันที่ไม่จริง ⇒ manifest.csv · ผลตรง /^[A-Za-z0-9.-]{1,60}$/ เสมอ (ไม่มีข้อความผู้ใช้/เส้นทาง)", () => {
    const f = fn("manifestFileName");
    eq(f("2026-11-14", "cmabc123xyz789"), "manifest-2026-11-14-xyz789.csv", "ปกติ");
    eq(f("2026-11-14", "ab_c-d/e..f"), "manifest-2026-11-14-abcdef.csv", "ตัดอักขระ");
    eq([f("2026-02-31", "abcdef"), f("../../etc", "abcdef"), f("", "")], ["manifest.csv", "manifest.csv", "manifest.csv"], "วันที่ไม่จริง");
    for (const [d, i] of [["2026-11-14", "../../x"], ["2026-11-14", "ไทย\"<>"], ["2026-11-14\r\n", "a"], ["2026-11-14", "a".repeat(500)]]) ok(/^[A-Za-z0-9.-]{1,60}$/.test(String(f(d, i))), `ชื่อไฟล์ไม่ปลอดภัย: ${fmt(f(d, i))}`);
  });
  groupLine("P");

  // ═══════════════ LV. ใบรายชื่อบนร้าน seed (อ่านอย่างเดียว) ═══════════════
  console.log("\n── LV: ใบรายชื่อบนร้าน seed (now = TRIPS_AS_OF) ──");
  const seedLoad = async (input: Rec = {}) => call("loadManifestVM", SEED, { unitId: U0, departureId: seedDep, ...input }, { now: AS_OF });
  await st("LV-1", "รอบราชา ส. 14 พ.ย.: หัวใบรายชื่อ (ชื่อสินค้าไทย/อังกฤษ · วันที่ 2026-11-14 · 08:00–16:30) · รูป VM ครบคีย์ · view ปริยาย pickup · unit.today = 2026-11-12 · ธงเจ้าของร้าน", async () => {
    ok(seedDep, "ไม่มีรอบ seed"); const vm = VM(await seedLoad(), "loadManifestVM");
    eq(Object.keys(vm).sort(), [...VM_KEYS].sort(), "คีย์ VM");
    const d = asRec(vm.departure) ?? {};
    eq([d.id, d.titleTh, d.localDate, d.timeText, vm.view, asRec(vm.unit)?.today, asRec(vm.unit)?.tz], [seedDep, R.name, D14, `${R.time.start}–${R.time.end}`, "pickup", "2026-11-12", "Asia/Bangkok"], "หัว");
    ok(typeof d.titleEn === "string" && !/[฀-๿]/.test(String(d.titleEn)), "titleEn");
    eq(vm.flags, { canSeeMoney: true, canSeeHealth: true, canExport: true, canPrint: true, canEditRuns: false, canSend: false }, "flags");
    ok(asArr(d.boats).every((x) => typeof x.name === "string") && asArr(d.guides).every((x) => typeof x.name === "string"), "boats/guides");
  });
  await st("LV-2", "แถว 3 การจอง (ภาพ :26 :34 :35): ภัทรา \"2 ผู้ใหญ่ 1 เด็ก\" + เช่ากล้อง · Chen Yu 2 ผู้ใหญ่ · วิทยา 1 ผู้ใหญ่ · รูปแถวครบคีย์ · เรียงตามเลขจอง", async () => {
    const vm = VM(await seedLoad({ view: "booking" }), "load");
    const rows = rowsOf(vm);
    eq(rows.map((r) => r.code), seedBk.map((b) => b.code), "ลำดับเลขจอง");
    for (const r of rows) eq(Object.keys(r).sort(), [...ROW_KEYS].sort(), "คีย์แถว");
    const paxText = (r: Rec | null) => asArr(r?.pax).map((p) => `${p.qty} ${p.labelTh}`).join(" ");
    const p = rowOf(vm, sb("pattra").id), c = rowOf(vm, sb("chen").id), w = rowOf(vm, sb("wittaya").id);
    eq([p?.bookerName, paxText(p), asArr(p?.extras).map((x) => [x.nameTh, x.qty]), p?.seats], ["ภัทรา สายใจ", "2 ผู้ใหญ่ 1 เด็ก", [[R.extras.camera.name, 1]], 3], "ภัทรา");
    eq([c?.bookerName, paxText(c), c?.seats, w?.bookerName, paxText(w), w?.seats], ["Chen Yu", "2 ผู้ใหญ่", 2, "วิทยา พรหมมา", "1 ผู้ใหญ่", 1], "Chen Yu / วิทยา");
    eq(groupsOf(vm).map((g) => [g.kind, g.key, g.run, g.people]), [["ALL", "all", null, 6]], "กลุ่มมุมมองตามการจอง");
  });
  await st("LV-3", "การ์ดสรุป (ภาพ :13–:18 เท่าที่ seed มี): 3 การจอง · 6 คน (ผู้ใหญ่ 5 · เด็ก 1) · ค้างชำระ ฿23,750.00 · ต้องเตรียม กล้อง 1 · อาหาร 6 · ยังไม่จัดรถ 6 คน รถ 0 คัน", async () => {
    const vm = VM(await seedLoad(), "load"); const t = asRec(vm.totals) ?? {}; const pr = asRec(vm.prep) ?? {};
    eq([t.bookings, t.people, asArr(t.pax).map((x) => [x.code, x.qty]), t.outstandingSatang, t.agentCollectBookings], [3, 6, [["ADULT", 5], ["CHILD", 1]], SEED_PAYABLE, 0], "totals");
    eq(t.pickup, { assignedPeople: 0, vehicles: 0, unassignedPeople: 6, staleStops: 0 }, "pickup");
    eq([asArr(pr.extras).map((x) => [x.nameTh, x.qty]), asRec(pr.meals)?.travellers], [[[R.extras.camera.name, 1]], 6], "prep");
    eq([vm.bookingsTotal, vm.bookingsShown, vm.truncated, vm.paxTruncated, vm.bookingCap, vm.paxCap], [3, 3, false, false, constOf("TRIPS_MANIFEST_BOOKING_CAP"), constOf("TRIPS_MANIFEST_PAX_CAP")], "เพดาน");
  });
  await st("LV-4", "มุมมองตามรถบน seed (ไม่มีการจัดรถ): กลุ่มเดียว UNASSIGNED 6 คน 3 แถว · รายชื่อครบ = ตามฐานจริง · แถวที่ยังไม่มีชื่อ = MISSING_NAMES พร้อมจำนวนที่ขาด (ภาพ :24 \"ขาดรายชื่อ n\")", async () => {
    ok(seedNamed >= 0, "PC-2 ไม่ผ่าน"); const vm = VM(await seedLoad({ view: "pickup" }), "load");
    eq(groupsOf(vm).map((g) => [g.kind, g.key, g.run, g.people, asArr(g.rows).length]), [["UNASSIGNED", "unassigned", null, 6, 3]], "กลุ่ม");
    eq(asRec(vm.totals)?.named, seedNamed, "named = ฐาน");
    for (const r of rowsOf(vm)) {
      const d = asRec(r.doc) ?? {}; const named = asArr(r.travellers).filter((x) => typeof x.fullName === "string" && x.fullName !== "").length;
      eq([d.named, d.missingNames, d.state === "MISSING_NAMES"], [named, Math.max(0, num(r.seats) - named), named < num(r.seats)], `doc ของ ${r.code}`);
      eq(asRec(r.pickup)?.time, null, "ไม่มีเวลารับ");
    }
  });
  await st("LV-5", "ตัวโหลดไม่เขียนฐาน seed: นับ TripBooking/TripPassenger/AuditLog/OutboxEvent/TripVehicleRun/TripDocView ก่อน-หลังเรียก 2 มุมมอง × 2 รอบ เท่าเดิม", async () => {
    fn("loadManifestVM"); const before = await seedCounts();
    for (const view of ["pickup", "booking", "pickup", "booking"]) VM(await seedLoad({ view }), view);
    eq(await seedCounts(), before, "จำนวนแถว seed");
  });
  await st("LV-6", "อินพุตเสีย: view นอกชุด/คีย์เกิน/ไม่มี departureId ⇒ INVALID_INPUT · รอบที่ไม่มี ⇒ NOT_FOUND · ผู้ใช้ที่ไม่ใช่สมาชิกร้าน ⇒ NOT_FOUND|FORBIDDEN · ไม่ throw", async () => {
    codeR(await seedLoad({ view: "agency" }), "INVALID_INPUT", "view agency"); codeR(await seedLoad({ extra: 1 }), "INVALID_INPUT", "คีย์เกิน");
    codeR(await call("loadManifestVM", SEED, { unitId: U0 }, { now: AS_OF }), "INVALID_INPUT", "ไม่มี departureId");
    codeR(await call("loadManifestVM", SEED, { unitId: U0, departureId: "ไม่มีจริง" }, { now: AS_OF }), "NOT_FOUND", "รอบไม่มี");
    codeR(await call("loadManifestVM", SEED, { unitId: U0, departureId: `x\u0000y` }, { now: AS_OF }), ["INVALID_INPUT", "NOT_FOUND"], "NUL");
    codeR(await call("loadManifestVM", { tenantId: DIVE_TENANT, actorUserId: "ไม่มีผู้ใช้นี้" }, { unitId: U0, departureId: seedDep }, { now: AS_OF }), ["NOT_FOUND", "FORBIDDEN"], "ไม่ใช่สมาชิก");
  });
  groupLine("LV");

  // ═══════════════ ตั้งร้านชั่วคราว ═══════════════
  const tA = rid("tA"), tB = rid("tB");
  const uA = rid("uA"), uA2 = rid("uA2"), uT = rid("uT"), uB = rid("uB");
  let setupErr = "", settingsErr = "", plantErr = "";
  const U: Record<string, Actor> = {};
  type Prod = { id: string; opt: string; unit: string; tenant: string; adult: string; cam: string };
  const PRD: Record<string, Prod> = {};
  let seq = 0;
  const BASE_P = ["trips.departure.view", "trips.passenger.view"];
  const PAX_FIELD_KEYS = ["fullName", "nationality", "dob", "sex", "docType", "docNumber", "docExpiry", "phone", "birthPlace", "certLevel", "diveCount", "lastDiveAt", "finSize", "allergies", "pickupHotel"];
  const FIELDS = (req: string[], opt: string[] = []) => Object.fromEntries(PAX_FIELD_KEYS.map((k) => [k, req.includes(k) ? "REQUIRED" : opt.includes(k) ? "OPTIONAL" : "OFF"]));
  try {
    for (const t of ["TripProduct", "TripPaxType", "TripExtra", "TripDeparture", "TripPrice", "TripBooking", "TripBookingItem", "TripPassenger", "TripVehicleRun", "TripResource", "TripDocument"]) await needTable(t);
    for (const [id, tag] of [[tA, "a"], [tB, "b"]] as const) { await insertRow("Tenant", { id, name: `ทดสอบ T1.4 ${tag}`, slug: `${SLUG}${STAMP}-${tag}`, updatedAt: new Date() }); tenantIds.push(id); }
    for (const [id, t, tag, s] of [[uA, tA, "a", { timezone: "Asia/Bangkok" }], [uA2, tA, "a2", { timezone: "Asia/Bangkok" }], [uT, tA, "tokyo", { timezone: "Asia/Tokyo" }], [uB, tB, "b", { timezone: "Asia/Bangkok" }]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "TRIPS", name: `หน่วย ${tag}`, slug: `${SLUG}${tag}-${STAMP}`, settings: JSON.stringify(s), updatedAt: new Date() });
    const mkUser = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], perms: string[]): Promise<void> => {
      const id = rid(`u${tag}`);
      const permissions = Object.fromEntries(perms.map((p) => [p, true]));
      await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `ผู้ทดสอบ ${tag}`, updatedAt: new Date() });
      await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role, unitAccess: JSON.stringify(unitAccess), permissions: JSON.stringify(permissions), acceptedAt: new Date(), updatedAt: new Date() });
      U[tag] = { role, unitAccess, permissions, userId: id };
    };
    await mkUser("oa", tA, "OWNER", ["*"], []);
    await mkUser("ob", tB, "OWNER", ["*"], []);
    await mkUser("mg", tA, "MANAGER", ["*"], []);
    await mkUser("v", tA, "STAFF", [uA, uT], BASE_P);
    await mkUser("vb", tA, "STAFF", [uA], [...BASE_P, "trips.booking.view"]);
    await mkUser("vh", tA, "STAFF", [uA], [...BASE_P, "trips.passenger.health"]);
    await mkUser("vw", tA, "STAFF", [uA], [...BASE_P, "trips.*", "trips.passenger.reveal", "trips.passenger.edit"]);
    await mkUser("dv", tA, "STAFF", [uA], ["trips.departure.view", "trips.booking.view"]);
    await mkUser("pv", tA, "STAFF", [uA], ["trips.passenger.view", "trips.passenger.health"]);
    await mkUser("none", tA, "STAFF", [uA], []);
    await mkUser("a2", tA, "STAFF", [uA2], [...BASE_P, "trips.booking.view", "trips.passenger.health"]);
    const mkProd = async (key: string, tenantId: string, unitId: string) => {
      const id = rid(`p${key}`), o = rid(`o${key}`);
      await insertRow("TripProduct", { id, tenantId, unitId, slug: `t14qc-${key}-${STAMP}`.toLowerCase().replace(/[^a-z0-9-]/g, ""), productType: "TOUR", sourceKind: "OWN", status: "ACTIVE", title: JSON.stringify({ th: `ทดสอบ ${key}`, en: `Test ${key}` }), body: "{}", currency: "THB", deepDive: false, crossBorder: false, updatedAt: new Date() });
      await insertRow("TripOption", { id: o, tenantId, unitId, productId: id, name: JSON.stringify({ th: "ร่วมกลุ่ม", en: "Join-in" }), durationMin: 480, sortOrder: 1, active: true, updatedAt: new Date() });
      const adult = await insertRow("TripPaxType", { id: rid("pt"), tenantId, unitId, productId: id, code: "ADULT", label: JSON.stringify({ th: "ผู้ใหญ่", en: "Adult" }), countsCapacity: true, active: true, sortOrder: 0, updatedAt: new Date() });
      const cam = await insertRow("TripExtra", { id: rid("xcam"), tenantId, unitId, productId: id, kind: "EQUIPMENT", basis: "PER_BOOKING", mandatory: false, priceMinor: 50_000, currency: "THB", commissionable: true, discountable: true, passThrough: false, taxKind: "VAT7",
        name: JSON.stringify({ th: "เช่ากล้องกันน้ำ", en: "Waterproof camera" }), active: true, updatedAt: new Date() });
      await insertRow("TripPrice", { id: rid("pr"), tenantId, unitId, productId: id, optionId: null, paxTypeId: adult, cabinTypeId: null, seasonId: null, departureId: null, currency: "THB", amountMinor: 350_000, weekdayMask: null, priority: 0, updatedAt: new Date() });
      PRD[key] = { id, opt: o, unit: unitId, tenant: tenantId, adult, cam };
    };
    await mkProd("PH", tA, uA); await mkProd("PW", tA, uA); await mkProd("PC", tA, uA2); await mkProd("PT", tA, uT); await mkProd("PB", tB, uB);
  } catch (e) { setupErr = errMsg(e); console.log(`  ⚠️ ตั้งร้านชั่วคราวไม่สำเร็จ: ${setupErr}`); }
  const setV = async (tenantId: string, changes: Rec[], who: string) => {
    const r = asRec(await S("setSettings")(U[who], { tenantId }, changes, { ackLegalWarn: true })) ?? {};
    ok(r.ok === true, `setSettings: ${fmt(r)}`);
  };
  try {
    if (!setupErr) {
      const VATREG = { registered: true, thresholdSatang: 180_000_000, warnAtPct: 90 };
      const us = (unit: string, key: string, value: unknown): Rec => ({ key, scope: "UNIT", scopeId: unit, value });
      const ps = (k: string, key: string, value: unknown): Rec => ({ key, scope: "PRODUCT", scopeId: PRD[k].id, value });
      const optAll = FIELDS(["fullName"], ["nationality", "docType", "docNumber", "phone", "finSize", "allergies", "pickupHotel"]);
      await setV(tA, [us(uA, "trips.tax.vatRegistered", VATREG), us(uA2, "trips.tax.vatRegistered", VATREG), us(uT, "trips.tax.vatRegistered", VATREG), us(uA, "trips.pdpa.maskOnScreen", false),
        ps("PH", "trips.pax.fields", optAll), ps("PH", "trips.pdpa.healthDataProducts", true), ps("PH", "trips.waiver.requiredFor", "NONE"),
        ps("PW", "trips.pax.fields", FIELDS(["fullName"])), ps("PW", "trips.pdpa.healthDataProducts", false), ps("PW", "trips.waiver.requiredFor", "ALL"),
        ps("PC", "trips.pax.fields", optAll), ps("PC", "trips.pdpa.healthDataProducts", true), ps("PC", "trips.waiver.requiredFor", "NONE")], "oa");
      await setV(tB, [us(uB, "trips.tax.vatRegistered", VATREG), { key: "trips.pax.fields", scope: "PRODUCT", scopeId: PRD.PB.id, value: optAll }, { key: "trips.waiver.requiredFor", scope: "PRODUCT", scopeId: PRD.PB.id, value: "NONE" }], "ob");
    }
  } catch (e) { settingsErr = e instanceof Error ? e.message.slice(0, 300) : String(e); console.log(`  ⚠️ ตั้งค่าตั้งหน่วยไม่สำเร็จ: ${settingsErr}`); }
  const tenantOfUnit = (u: string) => (u === uB ? tB : tA);
  const ctxOf = (tag: string): Ctx => { const a = U[tag]; if (!a) throw new AssertFail(`ไม่มีผู้ใช้ชั่วคราว ${tag} (${setupErr || "ยังไม่ตั้ง"})`); return { tenantId: tag === "ob" ? tB : tA, actorUserId: a.userId }; };
  const staff = (unit: string): Rec => ({ tenantId: tenantOfUnit(unit), unitId: unit, channel: "COUNTER", actor: { kind: "STAFF", userId: String(U[unit === uB ? "ob" : "oa"]?.userId ?? "x") }, now: new Date(NOW0), locale: "th" });
  const mkDep = async (key: string, o: { date?: string; startsAt?: Date } = {}): Promise<string> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const date = o.date ?? TRAVEL;
    const startsAt = o.startsAt ?? new Date(BKK(date, "08:00").getTime() + (seq++ % 600) * 60_000); const id = rid("d");
    await insertRow("TripDeparture", { id, tenantId: p.tenant, unitId: p.unit, productId: p.id, optionId: p.opt, scheduleId: null, localDate: date, startsAt, endsAt: new Date(startsAt.getTime() + 8 * HOUR),
      status: "OPEN", capacity: 60, sold: 0, held: 0, reserved: 0, minPax: null, cutoffAt: startsAt, version: 0, updatedAt: new Date() });
    return id;
  };
  type Bk = { id: string; code: string; dep: string; unit: string; pax: string[]; payable: number };
  const mkBooking = async (key: string, dep: string, names: string[], o: { camera?: boolean } = {}): Promise<Bk> => {
    const p = PRD[key]; if (!p) throw new AssertFail(`ไม่มีสินค้า ${key}`);
    const ctx = staff(p.unit);
    const lines = [{ productKind: "TRIP", unitId: p.unit, productId: p.id, slotId: dep, optionId: p.opt, pax: [{ paxTypeId: p.adult, qty: names.length }], extras: o.camera ? [{ extraId: p.cam, qty: 1 }] : [] }];
    const quote = V(await call("quoteTrips", ctx, { lines }, {}), "quoteTrips (T0.5)");
    const r = await call("bookTripsNow", ctx, { quote: { lines }, quoteId: quote.quoteId, quoteExpiresAt: quote.expiresAt, idempotencyKey: `n${hex(6)}`, booker: { name: `ผู้จอง${STAMP} ${hex(2)}`, phone: `08${String(10_000_000 + (Number.parseInt(hex(3), 16) % 89_999_999)).slice(-8)}` },
      pay: { method: "PAY_LATER" }, passengers: names.map((n) => ({ name: n, paxTypeId: p.adult })) }, {});
    ok(r.ok === true, `bookTripsNow (T0.6): ${fmt(r)}`);
    const ref = asArr(r.value)[0] ?? {}; const id = String(ref.bookingId);
    const rows = await q<{ id: string; fullName: string }>(`SELECT id, "fullName" FROM "TripPassenger" WHERE "bookingId" = $1 ORDER BY "createdAt", id`, [id]);
    const pax = [...rows].sort((a, b) => names.indexOf(a.fullName) - names.indexOf(b.fullName)).map((x) => x.id);
    eq(pax.length, names.length, "T0.6 ต้องสร้างแถวผู้เดินทางตามชื่อที่ส่ง");
    // ตรึงลำดับ (createdAt, id) ให้ตรงลำดับชื่อ — T0.6 ใช้ createMany (createdAt เท่ากัน)
    for (const [i, pid] of pax.entries()) await pool.query(`UPDATE "TripPassenger" SET "createdAt" = $2 WHERE id = $1`, [pid, new Date(Date.parse("2027-02-01T00:00:00Z") + (seq++) * 1000 + i)]);
    const pay = (await q<{ p: number }>(`SELECT ("grossSatang" - "discountSatang" - "agentDiscountSatang")::int AS p FROM "TripBooking" WHERE id = $1`, [id]))[0]?.p ?? 0;
    return { id, code: String(ref.code), dep, unit: p.unit, pax, payable: pay };
  };
  const consentOf = () => ({ version: "trips.health-consent.v1", textHash: String(asRec(needTrips().HEALTH_CONSENT_V1)?.hash ?? ""), locale: "th", at: NOW0, via: "STAFF_RECORDED", signerRole: "SELF" });
  type Plant = { fullName?: string; nationality?: string | null; docType?: string | null; doc?: string | null; phone?: string | null; formStatus?: string; finSize?: string; pickupHotel?: string;
    health?: { allergies: string | null; conditions: string | null } | "DECLINED" | "WITHDRAWN"; purged?: boolean };
  const plantPax = async (tenantId: string, pid: string, o: Plant) => {
    if (o.purged) {
      await pool.query(`UPDATE "TripPassenger" SET "fullName" = '', nationality = NULL, dob = NULL, sex = NULL, "docType" = NULL, "docNumberEnc" = NULL, "docLast4" = NULL, phone = NULL, "guardianConsent" = NULL, "waiverEvidence" = NULL, answers = $2::jsonb WHERE id = $1`,
        [pid, JSON.stringify({ v: 1, rev: 2, fields: {}, purged: { at: "2027-03-20T00:00:00.000Z", stages: ["ALL"] } })]);
      return;
    }
    const answers: Rec = { v: 1, rev: 1, fields: { ...(o.finSize ? { finSize: o.finSize } : {}), ...(o.pickupHotel ? { pickupHotel: o.pickupHotel } : {}) } };
    if (o.health === "DECLINED" || o.health === "WITHDRAWN") answers.health = { status: o.health, at: NOW0 };
    else if (o.health) answers.health = { status: "PROVIDED", box: seal({ v: 1, allergies: o.health.allergies, conditions: o.health.conditions }, `trips.pax.health.v1:${tenantId}:${pid}`), consent: consentOf() };
    await pool.query(`UPDATE "TripPassenger" SET "fullName" = COALESCE($2, "fullName"), nationality = $3, "docType" = $4, "docLast4" = $5, "docNumberEnc" = $6, phone = $7, "formStatus" = $8, answers = $9::jsonb WHERE id = $1`,
      [pid, o.fullName ?? null, o.nationality ?? null, o.docType ?? null, o.doc ? o.doc.slice(-4) : null, o.doc ? seal({ v: 1, n: o.doc }, `trips.pax.doc.v1:${tenantId}:${pid}`) : null, o.phone ?? null, o.formStatus ?? "PENDING", JSON.stringify(answers)]);
  };
  const setStatus = (id: string, status: string) => pool.query(`UPDATE "TripBooking" SET status = $2 WHERE id = $1`, [id, status]);

  // ── ฟิกซ์เจอร์หลัก: รอบ depH (สินค้า PH · หน่วย uA) ──
  const NASTY = { eq: `=HYPERLINK("http://evil.example/${STAMP}","x")`, at: `@SUM(1+1)${STAMP}`, plus: `+1+1${STAMP}`, minus: `-2+3${STAMP}`, multi: `\t=9+9 "อัญ",${STAMP}\nบรรทัดสอง`, place: `=cmd|' /C calc'!A0 ${STAMP}` };
  let depH = "", depW = "", depC = "", depT = "", depB = "", depE = "";
  const B: Record<string, Bk> = {};
  let van1 = "", van2 = "", run1 = "", run2 = "", boat1 = "", guide1 = "";
  let outboxBase = -1;
  try {
    if (!setupErr && !settingsErr && TR) {
      depH = await mkDep("PH"); depW = await mkDep("PW"); depC = await mkDep("PC"); depB = await mkDep("PB"); depE = await mkDep("PH", { date: "2027-04-12" });
      depT = await mkDep("PT", { date: "2027-04-10", startsAt: new Date("2027-04-09T23:30:00.000Z") });
      B.b1 = await mkBooking("PH", depH, [`${MK.name} หนึ่ง`, "ชื่อสอง ชั่วคราว", "ชื่อสาม ชั่วคราว"], { camera: true });
      B.b2 = await mkBooking("PH", depH, ["ชื่อสี่ ชั่วคราว", `${MK.gone} ถูกลบ`]);
      B.b3 = await mkBooking("PH", depH, ["ชื่อห้า ชั่วคราว"], { camera: true });
      B.b4 = await mkBooking("PH", depH, ["ชื่อหก ชั่วคราว", "ชื่อเจ็ด ชั่วคราว"]);
      B.hold = await mkBooking("PH", depH, [`${MK.hold} ถือที่`]);
      B.cxl = await mkBooking("PH", depH, [`${MK.cxl} ยกเลิก`]);
      B.gone = await mkBooking("PH", depH, [`${MK.gone} ผู้จองถูกลบ`]);
      B.w1 = await mkBooking("PW", depW, ["ลงนาม หนึ่ง", "ลงนาม สอง"]);
      B.c1 = await mkBooking("PC", depC, [`${MK.other} หน่วยอื่น`]);
      B.bb = await mkBooking("PB", depB, [`${MK.other} ร้านอื่น`]);
      await plantPax(tA, B.b1.pax[0], { nationality: "TH", docType: "PASSPORT", doc: MK.doc, phone: MK.phone, formStatus: "SUBMITTED", finSize: "42", pickupHotel: MK.hotel, health: { allergies: MK.allergy, conditions: MK.cond } });
      await plantPax(tA, B.b1.pax[1], { fullName: NASTY.eq, formStatus: "VERIFIED", finSize: "42", health: "DECLINED" });
      await pool.query(`UPDATE "TripPassenger" SET "fullName" = '', "formStatus" = 'PENDING', answers = '{}'::jsonb WHERE id = $1`, [B.b1.pax[2]]);
      await plantPax(tA, B.b2.pax[0], { fullName: NASTY.at, formStatus: "NEEDS_FIX", finSize: "38", health: { allergies: MK.allergy2, conditions: null } });
      await plantPax(tA, B.b2.pax[1], { purged: true });
      await plantPax(tA, B.b3.pax[0], { fullName: NASTY.plus, formStatus: "SUBMITTED", health: "WITHDRAWN" });
      await plantPax(tA, B.b4.pax[0], { fullName: NASTY.minus, formStatus: "SUBMITTED" });
      await plantPax(tA, B.b4.pax[1], { fullName: NASTY.multi, formStatus: "SUBMITTED" });
      await plantPax(tA, B.hold.pax[0], { formStatus: "SUBMITTED", health: { allergies: `${MK.allergy}-hold`, conditions: null } });
      await plantPax(tA, B.cxl.pax[0], { formStatus: "SUBMITTED", health: { allergies: `${MK.allergy}-cxl`, conditions: null } });
      await plantPax(tA, B.gone.pax[0], { purged: true });
      await plantPax(tA, B.c1.pax[0], { formStatus: "SUBMITTED", health: { allergies: `${MK.allergy}-u2`, conditions: null } });
      await plantPax(tB, B.bb.pax[0], { formStatus: "SUBMITTED", health: { allergies: `${MK.allergy}-tb`, conditions: null } });
      await setStatus(B.hold.id, "HOLD"); await setStatus(B.cxl.id, "CANCELLED"); await setStatus(B.b3.id, "PAID"); await setStatus(B.b4.id, "TRAVELLED");
      await pool.query(`UPDATE "TripBooking" SET "piiPurgedAt" = now(), "bookerPartyId" = NULL WHERE id = $1`, [B.gone.id]);
      // ทรัพยากร + การจัดรถ (ปลูกตรง — ตัวแก้การจัดรถเป็นของ T1.4b)
      van1 = await insertRow("TripResource", { id: rid("van"), tenantId: tA, unitId: uA, kind: "VAN", name: `รถตู้ ก ${STAMP}`, seats: 10, active: true, updatedAt: new Date() });
      van2 = await insertRow("TripResource", { id: rid("van"), tenantId: tA, unitId: uA, kind: "VAN", name: `รถตู้ ข ${STAMP}`, seats: null, active: true, updatedAt: new Date() });
      boat1 = await insertRow("TripResource", { id: rid("boat"), tenantId: tA, unitId: uA, kind: "BOAT", name: `เรือ ${STAMP}`, seats: 30, active: true, updatedAt: new Date() });
      guide1 = await insertRow("TripResource", { id: rid("gd"), tenantId: tA, unitId: uA, kind: "GUIDE", name: `ไกด์ ${STAMP}`, seats: null, active: true, updatedAt: new Date() });
      const depRow = (await q<{ startsAt: Date; endsAt: Date }>(`SELECT "startsAt", "endsAt" FROM "TripDeparture" WHERE id = $1`, [depH]))[0];
      for (const [res, active] of [[boat1, true], [guide1, true], [van2, false]] as const) await insertRow("TripResourceUse", { id: rid("use"), tenantId: tA, unitId: uA, resourceId: res, departureId: depH, startsAt: depRow?.startsAt, endsAt: depRow?.endsAt, active, updatedAt: new Date() });
      const otherVan = await insertRow("TripResource", { id: rid("van"), tenantId: tA, unitId: uA2, kind: "VAN", name: `รถหน่วยอื่น ${MK.other}`, seats: 4, active: true, updatedAt: new Date() });
      run1 = await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tA, unitId: uA, departureId: depH, resourceId: van1, driverEmployeeId: "emp-ไม่มีจริง", createdAt: new Date("2027-03-01T00:00:02Z"), updatedAt: new Date(),
        stops: JSON.stringify([{ bookingId: B.b1.id, place: NASTY.place, note: "ล็อบบี้", time: "06:45" }, { bookingId: B.b2.id, place: "กะรน ซี แซนด์", time: "07:10" }, { bookingId: B.cxl.id, place: "จุดของการจองที่ยกเลิก", time: "07:20" },
          { bookingId: B.b4.id, place: "", time: "07:25" }, { bookingId: B.c1.id, place: "จุดของหน่วยอื่น", time: "07:26" }, "ขยะ"]) });
      run2 = await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tA, unitId: uA, departureId: depH, resourceId: van2, createdAt: new Date("2027-03-01T00:00:01Z"), updatedAt: new Date(),
        stops: JSON.stringify([{ bookingId: B.b3.id, place: "ฉลอง วิลล่า", note: "บ้านเลขที่ 12/4", time: "07:35" }, { bookingId: B.b1.id, place: "ซ้ำกับรถแรก", time: "07:40" }]) });
      // ต้องไม่ถูกอ่าน: รถของหน่วยอื่น/ร้านอื่นที่ชี้ departureId เดียวกัน · รถที่ไม่มีจุดรับ
      await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tA, unitId: uA2, departureId: depH, resourceId: otherVan, updatedAt: new Date(), stops: JSON.stringify([{ bookingId: B.b4.id, place: `แทรกข้ามหน่วย ${MK.other}`, time: "05:00" }]) });
      await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tB, unitId: uB, departureId: depH, resourceId: van1, updatedAt: new Date(), stops: JSON.stringify([{ bookingId: B.b4.id, place: `แทรกข้ามร้าน ${MK.other}`, time: "05:01" }]) });
      await insertRow("TripVehicleRun", { id: rid("run"), tenantId: tA, unitId: uA, departureId: depH, resourceId: "ไม่มีทรัพยากรนี้", updatedAt: new Date(), stops: "[]" });
      // ไฟล์ของผู้เดินทางคนแรก: 1 ไฟล์ปกติ · 1 ลบแล้วยืนยันวัตถุหาย · 1 ลบแล้วรอลบวัตถุ
      const d0 = new Date("2027-03-05T00:00:00Z");
      await insertRow("TripDocument", { id: rid("doc"), tenantId: tA, unitId: uA, passengerId: B.b1.pax[0], kind: "PASSPORT", fileId: `zqxfile${STAMP}live`, consent: null, retainUntil: new Date("2028-01-01T00:00:00Z"), deletedAt: null, updatedAt: new Date() });
      await insertRow("TripDocument", { id: rid("doc"), tenantId: tA, unitId: uA, passengerId: B.b1.pax[0], kind: "CERT", fileId: `zqxfile${STAMP}gone`, consent: JSON.stringify({ purgeStage: "RETENTION", objDel: true }), retainUntil: d0, deletedAt: d0, updatedAt: new Date() });
      await insertRow("TripDocument", { id: rid("doc"), tenantId: tA, unitId: uA, passengerId: B.b1.pax[0], kind: "MEDICAL", fileId: `zqxfile${STAMP}pend`, consent: JSON.stringify({ purgeStage: "ERASE", objDel: false }), retainUntil: d0, deletedAt: d0, updatedAt: new Date() });
      outboxBase = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [[tA, tB]]))[0]?.n ?? -1;
    }
  } catch (e) { plantErr = errMsg(e); console.log(`  ⚠️ ปลูกฟิกซ์เจอร์ไม่สำเร็จ: ${plantErr}`); }
  const needDb = () => { needTrips(); ok(!setupErr && PRD.PH, `ไม่มีร้าน/สินค้าทดสอบ (${setupErr || "ยังไม่ตั้ง"})`); ok(!settingsErr, `ตั้งค่าตั้งไม่ได้: ${settingsErr}`); ok(!plantErr && depH && run2, `ปลูกฟิกซ์เจอร์ไม่ได้: ${plantErr || "ยังไม่ปลูก"}`); };
  const lm = (tag: string, input: Rec = {}, o: { unit?: string; dep?: string } = {}) => call("loadManifestVM", ctxOf(tag), { unitId: o.unit ?? uA, departureId: o.dep ?? depH, ...input }, { now: new Date(NOW0) });
  const ex = (tag: string, input: Rec = {}, o: { unit?: string; dep?: string } = {}) => call("exportManifestCsv", ctxOf(tag), { unitId: o.unit ?? uA, departureId: o.dep ?? depH, ...input }, { now: new Date(NOW0) });
  const hv = (tag: string, input: Rec = {}, o: { unit?: string; dep?: string } = {}) => call("revealManifestHealth", ctxOf(tag), { unitId: o.unit ?? uA, departureId: o.dep ?? depH, purpose: "SAFETY", ...input }, { now: new Date(NOW0) });
  const pr = (tag: string, input: Rec = {}, o: { unit?: string; dep?: string } = {}) => call("recordManifestPrint", ctxOf(tag), { unitId: o.unit ?? uA, departureId: o.dep ?? depH, ...input }, { now: new Date(NOW0) });
  type Aud = { id: string; action: string; actorType: string; actorId: string | null; unitId: string | null; targetType: string | null; targetId: string | null; after: Rec | null; before: Rec | null };
  const audits = async (action: string, tids = [tA, tB]) => q<Aud>(`SELECT id, action, "actorType"::text AS "actorType", "actorId", "unitId", "targetType", "targetId", after, before FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action = $2 ORDER BY "createdAt", id`, [tids, action]);
  const auditN = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "tenantId" = ANY($1::text[])`, [[tA, tB]]))[0]?.n ?? -1;
  const dataHash = async () => (await q<{ h: string }>(`SELECT md5(COALESCE((SELECT string_agg(id || "updatedAt"::text || answers::text || "fullName", ',' ORDER BY id) FROM "TripPassenger" WHERE "tenantId" = $1), '') ||
      COALESCE((SELECT string_agg(id || "updatedAt"::text || status || version::text, ',' ORDER BY id) FROM "TripBooking" WHERE "tenantId" = $1), '') ||
      COALESCE((SELECT string_agg(id || "updatedAt"::text || stops::text, ',' ORDER BY id) FROM "TripVehicleRun" WHERE "tenantId" = $1), '') ||
      COALESCE((SELECT string_agg(id || COALESCE("deletedAt"::text, '') || COALESCE(consent::text, ''), ',' ORDER BY id) FROM "TripDocument" WHERE "tenantId" = $1), '') ||
      (SELECT count(*)::text FROM "TripDocView" WHERE "tenantId" = $1) || (SELECT count(*)::text FROM "OutboxEvent" WHERE "tenantId" = $1)) AS h`, [tA]))[0]?.h ?? "";
  const M_IDS = () => [B.b1.id, B.b2.id, B.b3.id, B.b4.id, B.gone.id];
  const byCode = (ids: string[]) => [...ids].sort((a, b) => { const ca = Object.values(B).find((x) => x.id === a)?.code ?? "", cb = Object.values(B).find((x) => x.id === b)?.code ?? ""; return ca < cb ? -1 : ca > cb ? 1 : 0; });

  // ═══════════════ FX. ตัวควบคุมฟิกซ์เจอร์ (เขียวก่อนมีงาน — พิสูจน์ว่าข้อมูลที่ปลูกอ่านได้ผ่านบริการ T0.8 จริง) ═══════════════
  console.log("\n── FX: ตัวควบคุมฟิกซ์เจอร์ (ผ่านบริการ T0.8 เดิม) ──");
  const t08 = async (b: Bk) => asArr(V(await call("getTripPassengers", staff(b.unit), { bookingId: b.id }), "getTripPassengers (T0.8)").passengers);
  await st("FX-1", "ร้านชั่วคราวพร้อม: T0.8 อ่านผู้เดินทางที่ปลูกได้ตามตั้งใจ — b1 สุขภาพ [PROVIDED, DECLINED, MISSING] · เลขปิดบัง ••••<4 ตัวท้าย> · ไฟล์ 3 (ลบแล้ว 2 · รอลบ 1) · ผู้ถูกลบ purged · สินค้าบังคับลงนาม ⇒ MISSING + NOT_COLLECTED", async () => {
    ok(!setupErr && !settingsErr && !plantErr && depH, `ตั้งร้าน/ปลูกไม่สำเร็จ: ${setupErr || settingsErr || plantErr || "ไม่มีโมดูล trips"}`);
    const p1 = await t08(B.b1);
    eq(p1.map((p) => [p.id, p.health, p.formStatus]), [[B.b1.pax[0], "PROVIDED", "SUBMITTED"], [B.b1.pax[1], "DECLINED", "VERIFIED"], [B.b1.pax[2], "MISSING", "PENDING"]], "b1");
    eq([p1[0]?.docMasked, asArr(p1[0]?.documents).map((d) => [d.deleted, d.pendingDeletion]).sort().join("|"), asRec(p1[0]?.fields)?.finSize], [`••••${MK.doc.slice(-4)}`, "false,false|true,false|true,true", "42"], "เอกสาร/ไฟล์");
    eq((await t08(B.b2)).map((p) => p.purged), [false, true], "ผู้ถูกลบ");
    eq((await t08(B.w1)).map((p) => [p.health, asRec(p.waiver)?.status]), [["NOT_COLLECTED", "MISSING"], ["NOT_COLLECTED", "MISSING"]], "depW");
    eq((await t08(B.b4)).map((p) => [p.health, asRec(p.waiver)?.status]), [["MISSING", "NOT_REQUIRED"], ["MISSING", "NOT_REQUIRED"]], "b4");
  });
  await st("FX-2", "กล่องสุขภาพที่ปลูกเปิดได้ด้วยบริการ T0.8 (revealPassengerData) และได้เนื้อหาที่ปลูก — ข้อ HV จึงล้มได้ด้วยเหตุของใบนี้เท่านั้น · สถานะการจองที่ปลูก: HOLD 1 · CANCELLED 1 · ในใบ 5", async () => {
    ok(!plantErr && depH, `ปลูกไม่สำเร็จ: ${plantErr}`);
    const r = V(await call("revealPassengerData", staff(uA), { passengerId: B.b1.pax[0], what: "HEALTH", purpose: "SAFETY" }), "revealPassengerData (T0.8)");
    eq(asRec(r.health), { allergies: MK.allergy, conditions: MK.cond }, "เนื้อหาสุขภาพ");
    const stt = await q<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM "TripBooking" WHERE "departureId" = $1 GROUP BY status ORDER BY status`, [depH]);
    eq(stt.map((x) => [x.status, x.n]), [["CANCELLED", 1], ["CONFIRMED", 3], ["HOLD", 1], ["PAID", 1], ["TRAVELLED", 1]], "สถานะการจองของรอบ");
  });
  groupLine("FX");

  // ═══════════════ BT. ร้านชั่วคราว ═══════════════
  console.log("\n── BT: ร้านชั่วคราว (สิทธิ์ · แยกหน่วย/ร้าน · จัดกลุ่ม · เอกสาร · ถูกลบ · PII · เพดาน · เขตเวลา) ──");
  await st("BT-1", "สิทธิ์เห็นใบรายชื่อ ⇔ departure.view ∧ passenger.view: none/dv (ขาด passenger.view)/pv (ขาด departure.view) ⇒ FORBIDDEN · v/vb/vh/mg/เจ้าของ ⇒ ได้", async () => {
    needDb();
    for (const t of ["none", "dv", "pv"]) codeR(await lm(t), "FORBIDDEN", t);
    for (const t of ["v", "vb", "vh", "vw", "mg", "oa"]) VM(await lm(t), t);
  });
  await st("BT-2", "แยกหน่วย/ร้าน: ผู้ใช้หน่วยอื่น (a2) เปิดหน่วย uA ⇒ NOT_FOUND · รอบของหน่วยอื่นด้วย unitId ของตน ⇒ NOT_FOUND · เจ้าของร้านอื่น ⇒ NOT_FOUND · รอบร้านอื่น ⇒ NOT_FOUND", async () => {
    needDb();
    codeR(await lm("a2"), "NOT_FOUND", "a2 → uA");
    codeR(await lm("a2", {}, { unit: uA2, dep: depH }), "NOT_FOUND", "depH ผ่าน uA2");
    codeR(await lm("oa", {}, { unit: uA, dep: depC }), "NOT_FOUND", "depC ผ่าน uA");
    codeR(await call("loadManifestVM", ctxOf("ob"), { unitId: uA, departureId: depH }, { now: new Date(NOW0) }), "NOT_FOUND", "ob → tA");
    codeR(await lm("oa", {}, { dep: depB }), "NOT_FOUND", "รอบร้านอื่น");
    VM(await lm("a2", {}, { unit: uA2, dep: depC }), "a2 หน่วยตนเอง");
  });
  await st("BT-3", "ธงตามสิทธิ์: v (ไม่มีเงิน/สุขภาพ) · vb (เงิน) · vh (สุขภาพ) · vw (มี trips.* + reveal แต่ไม่มีคีย์สุขภาพตรงตัว ⇒ ไม่เห็นสุขภาพ) · mg (MANAGER ⇒ ไม่เห็นสุขภาพ) · เจ้าของ (ทั้งคู่) · canEditRuns/canSend = false เสมอ", async () => {
    needDb();
    const fl = async (t: string) => { const f = asRec(VM(await lm(t), t).flags) ?? {}; return [f.canSeeMoney, f.canSeeHealth, f.canExport, f.canPrint, f.canEditRuns, f.canSend]; };
    eq(await fl("v"), [false, false, true, true, false, false], "v"); eq(await fl("vb"), [true, false, true, true, false, false], "vb"); eq(await fl("vh"), [false, true, true, true, false, false], "vh");
    eq((await fl("vw"))[1], false, "vw สุขภาพ"); eq((await fl("mg"))[1], false, "mg สุขภาพ"); eq(await fl("oa"), [true, true, true, true, false, false], "oa");
  });
  await st("BT-4", "ชุดการจองของใบ = CONFIRMED/PART_PAID/PAID/TRAVELLED/NO_SHOW เท่านั้น: HOLD และ CANCELLED ไม่อยู่ในแถว/ยอดรวม · pendingBookings นับ HOLD+PENDING = 1 · เรียงตามเลขจอง (มุมมอง booking)", async () => {
    needDb(); const vm = VM(await lm("oa", { view: "booking" }), "load");
    eq(rowsOf(vm).map((r) => r.bookingId), byCode(M_IDS()), "แถว");
    eq(rowsOf(vm).map((r) => r.status).sort(), ["CONFIRMED", "CONFIRMED", "CONFIRMED", "PAID", "TRAVELLED"], "สถานะ");
    const t = asRec(vm.totals) ?? {};
    eq([t.bookings, t.people, t.pendingBookings, vm.bookingsTotal, vm.bookingsShown, vm.truncated], [5, 9, 1, 5, 5, false], "ยอดรวม");
    const js = JSON.stringify(vm);
    ok(!js.includes(MK.hold) && !js.includes(MK.cxl) && !js.includes(B.hold.id) && !js.includes(B.cxl.id), "การจอง HOLD/CANCELLED โผล่ใน VM");
  });
  await st("BT-5", "ยอดรวมตรงกับ SQL อิสระ: people = Σ qty SEAT · slots · named (ชื่อไม่ว่าง ∧ ไม่ถูกลบ) · formComplete (SUBMITTED|VERIFIED) · purged", async () => {
    needDb(); const t = asRec(VM(await lm("oa"), "load").totals) ?? {};
    const sql = (await q<Rec>(`SELECT (SELECT COALESCE(sum(i.qty), 0) FROM "TripBookingItem" i WHERE i."bookingId" = ANY($1::text[]) AND i.kind = 'SEAT' AND i.active)::int AS people,
        (SELECT count(*) FROM "TripPassenger" p WHERE p."bookingId" = ANY($1::text[]))::int AS slots,
        (SELECT count(*) FROM "TripPassenger" p WHERE p."bookingId" = ANY($1::text[]) AND p."fullName" <> '' AND NOT (COALESCE(p.answers->'purged'->'stages', '[]'::jsonb) ? 'ALL'))::int AS named,
        (SELECT count(*) FROM "TripPassenger" p WHERE p."bookingId" = ANY($1::text[]) AND p."formStatus" IN ('SUBMITTED','VERIFIED') AND NOT (COALESCE(p.answers->'purged'->'stages', '[]'::jsonb) ? 'ALL'))::int AS fc,
        (SELECT count(*) FROM "TripPassenger" p WHERE p."bookingId" = ANY($1::text[]) AND (COALESCE(p.answers->'purged'->'stages', '[]'::jsonb) ? 'ALL'))::int AS purged`, [M_IDS()]))[0] ?? {};
    eq([t.people, t.slots, t.named, t.formComplete, t.purged], [sql.people, sql.slots, sql.named, sql.fc, sql.purged], "totals = SQL");
    eq([t.people, t.slots, t.named, t.purged], [9, 9, 6, 2], "ค่าที่ปลูก");
    eq(asArr(t.pax).map((x) => [x.code, x.labelTh, x.labelEn, x.qty]), [["ADULT", "ผู้ใหญ่", "Adult", 9]], "pax");
  });
  await st("BT-6", "มุมมองตามรถ: กลุ่ม RUN เรียงตามเวลาจุดรับแรก (รถ ก 06:45 ก่อนรถ ข 07:35 แม้สร้างทีหลัง) แล้ว UNASSIGNED · แถวในรถเรียงตาม stops · เวลา/จุดรับ/หมายเหตุจาก stop · ชื่อรถ/ที่นั่ง/เส้นทาง · driverName null", async () => {
    needDb(); const vm = VM(await lm("oa", { view: "pickup" }), "load"); const gs = groupsOf(vm);
    eq(gs.map((g) => [g.kind, g.key, asArr(g.rows).map((r) => r.bookingId), g.people]), [["RUN", `run:${run1}`, [B.b1.id, B.b2.id], 5], ["RUN", `run:${run2}`, [B.b3.id], 1], ["UNASSIGNED", "unassigned", byCode([B.b4.id, B.gone.id]), 3]], "กลุ่ม");
    eq([asRec(gs[0]?.run), asRec(gs[1]?.run), gs[2]?.run], [{ id: run1, resourceId: van1, vehicleName: `รถตู้ ก ${STAMP}`, vehicleSeats: 10, driverName: null, route: [NASTY.place, "กะรน ซี แซนด์"] },
      { id: run2, resourceId: van2, vehicleName: `รถตู้ ข ${STAMP}`, vehicleSeats: null, driverName: null, route: ["ฉลอง วิลล่า"] }, null], "run");
    const pk = (id: string) => { const p = asRec(rowOf(vm, id)?.pickup) ?? {}; return [p.time, p.place, p.note]; };
    eq([pk(B.b1.id), pk(B.b2.id), pk(B.b3.id), pk(B.b4.id)], [["06:45", NASTY.place, "ล็อบบี้"], ["07:10", "กะรน ซี แซนด์", null], ["07:35", "ฉลอง วิลล่า", "บ้านเลขที่ 12/4"], [null, null, null]], "จุดรับ");
    eq(asRec(rowOf(vm, B.b1.id)?.pickup)?.hint, MK.hotel, "hint จากแบบฟอร์ม (pickupHotel)");
  });
  await st("BT-7", "จุดรับค้าง/ซ้ำ/ข้ามหน่วย: stop ของการจองที่ยกเลิก + ของหน่วยอื่น + การจองที่อยู่รถแรกแล้ว ⇒ ทิ้งและนับ staleStops = 3 · stop ผิดรูปถูกทิ้งเงียบ · รถของหน่วยอื่น/ร้านอื่นที่ชี้รอบเดียวกันไม่ถูกอ่าน (ชื่อหก ยังไม่จัดรถ) · รถที่ไม่มีแถวไม่เป็นกลุ่ม", async () => {
    needDb(); const vm = VM(await lm("oa", { view: "pickup" }), "load");
    eq(asRec(asRec(vm.totals)?.pickup), { assignedPeople: 6, vehicles: 2, unassignedPeople: 3, staleStops: 3 }, "pickup totals");
    const js = JSON.stringify(vm);
    ok(!js.includes(MK.other) && !js.includes("จุดของการจองที่ยกเลิก") && !js.includes("ซ้ำกับรถแรก") && !js.includes("จุดของหน่วยอื่น"), "ข้อมูลจาก stop ที่ต้องทิ้ง/รถข้ามหน่วยโผล่");
    eq(groupsOf(vm).filter((g) => g.kind === "RUN").length, 2, "จำนวนกลุ่มรถ");
    const bvm = VM(await lm("oa", { view: "booking" }), "booking");
    eq([asRec(rowOf(bvm, B.b3.id)?.pickup)?.time, asRec(rowOf(bvm, B.b4.id)?.pickup)?.time, asRec(asRec(bvm.totals)?.pickup)?.staleStops], ["07:35", null, 3], "มุมมอง booking ยังมี pickup ของแถว");
  });
  await st("BT-8", "สถานะเอกสารต่อการจอง = manifestDocState ของค่าจริง: b1 (3 ที่ · ชื่อ 2) MISSING_NAMES ขาด 1 · b2 (ชื่อ 1 + ถูกลบ 1) MISSING_NAMES · b3/b4 COMPLETE · การจองที่ผู้เดินทางถูกลบหมด PURGED · needsFix ของ b2 = 1", async () => {
    needDb(); const vm = VM(await lm("oa"), "load"); const f = fn("manifestDocState");
    const d = (id: string) => asRec(rowOf(vm, id)?.doc) ?? {};
    eq([d(B.b1.id).state, d(B.b1.id).named, d(B.b1.id).missingNames, d(B.b1.id).formComplete, d(B.b1.id).slots], ["MISSING_NAMES", 2, 1, 2, 3], "b1");
    eq([d(B.b2.id).state, d(B.b2.id).named, d(B.b2.id).missingNames, d(B.b2.id).needsFix], ["MISSING_NAMES", 1, 1, 1], "b2");
    eq([d(B.b3.id).state, d(B.b4.id).state, d(B.gone.id).state, d(B.gone.id).named], ["COMPLETE", "COMPLETE", "PURGED", 0], "b3/b4/gone");
    for (const r of rowsOf(vm)) { const x = asRec(r.doc) ?? {}; const purged = asArr(r.travellers).filter((p) => p.purged === true).length; eq(x.state, f({ seats: r.seats, slots: x.slots, purged, named: x.named, formComplete: x.formComplete }), `สูตรของ ${r.code}`); }
  });
  await st("BT-9", "รายคน: ลำดับ no 1.. ตาม (createdAt,id) · ชื่อ/สัญชาติ/ชนิดเอกสาร/เลขปิดบัง ••••<4 ตัวท้าย> · ประเภทคน · ขนาดตีนกบ · สถานะแบบฟอร์ม · รูปครบคีย์ · คนที่ยังไม่กรอกชื่อ fullName null", async () => {
    needDb(); const vm = VM(await lm("v"), "load"); const ts = asArr(rowOf(vm, B.b1.id)?.travellers);
    for (const p of ts) eq(Object.keys(p).sort(), [...PAX_KEYS_VM].sort(), "คีย์ผู้เดินทาง");
    eq(ts.map((p) => [p.passengerId, p.no, p.fullName, p.purged]), [[B.b1.pax[0], 1, `${MK.name} หนึ่ง`, false], [B.b1.pax[1], 2, NASTY.eq, false], [B.b1.pax[2], 3, null, false]], "ลำดับ/ชื่อ");
    const p0 = ts[0] ?? {};
    eq([p0.nationality, p0.docType, p0.docMasked, p0.paxTypeCode, p0.paxTypeTh, p0.paxTypeEn, p0.finSize, p0.formStatus, p0.isMinor], ["TH", "PASSPORT", `••••${MK.doc.slice(-4)}`, "ADULT", "ผู้ใหญ่", "Adult", "42", "SUBMITTED", false], "คนแรก");
    eq(p0.docMasked, fn("maskDoc")(MK.doc.slice(-4)), "= maskDoc ของ T0.8");
    eq([ts[1]?.formStatus, ts[2]?.formStatus, ts[2]?.docMasked, Array.isArray(ts[2]?.missing)], ["VERIFIED", "PENDING", null, true], "คนที่ 2–3");
  });
  await st("BT-10", "สุขภาพ = สถานะเท่านั้น: PROVIDED / DECLINED / MISSING (สินค้าเก็บสุขภาพ) / WITHDRAWN · สินค้าไม่เก็บ ⇒ NOT_COLLECTED · ยอดรวม healthProvided 2 · healthMissing = คนที่ MISSING · ตรง healthViewOf ของ T0.8", async () => {
    needDb(); const vm = VM(await lm("v"), "load");
    const h = (b: Bk, i: number) => asArr(rowOf(vm, b.id)?.travellers)[i]?.health;
    eq([h(B.b1, 0), h(B.b1, 1), h(B.b1, 2), h(B.b2, 0), h(B.b3, 0), h(B.b4, 0)], ["PROVIDED", "DECLINED", "MISSING", "PROVIDED", "WITHDRAWN", "MISSING"], "สถานะรายคน");
    const t = asRec(vm.totals) ?? {};
    eq([t.healthProvided, t.healthMissing], [2, 3], "ยอดรวมสุขภาพ");
    eq([asRec(rowOf(vm, B.b1.id)?.doc)?.healthProvided, asRec(rowOf(vm, B.b1.id)?.doc)?.healthMissing], [1, 1], "ต่อการจอง");
    const w = VM(await lm("v", {}, { dep: depW }), "depW");
    eq(asArr(rowsOf(w)[0]?.travellers).map((p) => p.health), ["NOT_COLLECTED", "NOT_COLLECTED"], "สินค้าไม่เก็บสุขภาพ");
  });
  await st("BT-11", "ลงนาม: สินค้าบังคับลงนาม (ALL) ยังไม่มีใครเซ็น ⇒ รายคน MISSING · waiverRequired 2 · waiverSigned 0 · สินค้าไม่บังคับ ⇒ NOT_REQUIRED · waiverRequired 0", async () => {
    needDb(); const w = VM(await lm("oa", {}, { dep: depW }), "depW"); const h = VM(await lm("oa"), "depH");
    eq([asArr(rowsOf(w)[0]?.travellers).map((p) => p.waiver), asRec(w.totals)?.waiverRequired, asRec(w.totals)?.waiverSigned, asRec(rowsOf(w)[0]?.doc)?.waiverRequired], [["MISSING", "MISSING"], 2, 0, 2], "ALL");
    eq([asArr(rowOf(h, B.b4.id)?.travellers).map((p) => p.waiver), asRec(h.totals)?.waiverRequired], [["NOT_REQUIRED", "NOT_REQUIRED"], 0], "NONE");
  });
  await st("BT-12", "ผู้เดินทางที่ถูกลบ (ลบทั้งแถว): fullName null · purged true · ช่องบุคคล null · ไม่นับ named · การจองที่ piiPurgedAt ⇒ bookerName null + bookerPurged true · ชื่อเดิมไม่โผล่ที่ใดใน VM", async () => {
    needDb(); const vm = VM(await lm("oa"), "load");
    const g = asArr(rowOf(vm, B.b2.id)?.travellers)[1] ?? {};
    eq([g.fullName, g.purged, g.nationality, g.docType, g.docMasked, g.finSize], [null, true, null, null, null, null], "ผู้เดินทางถูกลบ");
    const r = rowOf(vm, B.gone.id) ?? {};
    eq([r.bookerName, r.bookerPurged, r.phoneMasked, asArr(r.travellers).map((p) => [p.fullName, p.purged])], [null, true, null, [[null, true]]], "ผู้จองถูกลบ");
    ok(typeof rowOf(vm, B.b1.id)?.bookerName === "string" && rowOf(vm, B.b1.id)?.bookerPurged === false, "การจองปกติต้องมีชื่อผู้จอง");
    ok(!JSON.stringify(vm).includes(MK.gone), "ชื่อของผู้ที่ถูกลบโผล่");
  });
  await st("BT-13", "ไฟล์เอกสาร (หนี้ T0.8): นับ live 1 · pendingDeletion 1 (ลบแล้วแต่วัตถุยังไม่ยืนยันว่าหาย) · ไฟล์ที่ลบและยืนยันแล้วไม่นับ · VM ไม่มี fileId/URL/path", async () => {
    needDb(); const vm = VM(await lm("v"), "load");
    eq([asArr(rowOf(vm, B.b1.id)?.travellers)[0]?.docs, asArr(rowOf(vm, B.b1.id)?.travellers)[1]?.docs], [{ live: 1, pendingDeletion: 1 }, { live: 0, pendingDeletion: 0 }], "docs");
    const js = JSON.stringify(vm);
    ok(!js.includes(`zqxfile${STAMP}`) && !/https?:\/\//.test(js) && !/\/api\/files/.test(js), "VM มี fileId/URL");
  });
  await st("BT-14", "ข้อมูลส่วนบุคคลใน VM (ทุกบทบาท รวมเจ้าของ · ค่าตั้ง maskOnScreen = false): ไม่มีคีย์ต้องห้าม (docNumber · box · allergies · conditions · dob · phone · token · fileId · guardian …) · ไม่มีเลขเอกสารเต็ม/เนื้อหาสุขภาพ/เบอร์เต็ม · เบอร์ = maskPhone เท่านั้น", async () => {
    needDb();
    for (const t of ["v", "vb", "vh", "vw", "oa"]) for (const view of VIEWS) {
      const vm = VM(await lm(t, { view }), `${t}/${view}`);
      const badKeys = [...keysDeep(vm)].filter((k) => FORBIDDEN_VM_KEYS.test(k));
      ok(badKeys.length === 0, `${t}/${view}: คีย์ต้องห้าม ${badKeys.join(", ")}`);
      const leak = hits(JSON.stringify(vm), SENSITIVE_MARKERS());
      ok(leak.length === 0, `${t}/${view}: ค่าอ่อนไหวรั่ว ${leak.join(", ")}`);
    }
    const vm = VM(await lm("v"), "v");
    eq(rowOf(vm, B.b1.id)?.phoneMasked, fn("maskPhone")(MK.phone), "เบอร์ปิดบัง");
    eq(rowOf(vm, B.b4.id)?.phoneMasked, null, "ไม่มีเบอร์ ⇒ null");
  });
  await st("BT-15", "เงิน: ไม่มี trips.booking.view ⇒ outstandingSatang ของแถว/ยอดรวม = null ทั้งหมด (และไม่มีตัวเลขยอดจองใน VM) · มี ⇒ = outstandingOf ของแต่ละการจอง และยอดรวม = ผลบวก (TRAVELLED/PAID ที่ไม่ค้าง = 0)", async () => {
    needDb(); const v = VM(await lm("v"), "v"), b = VM(await lm("vb"), "vb"); const of = fn("outstandingOf");
    eq([rowsOf(v).map((r) => r.outstandingSatang), asRec(v.totals)?.outstandingSatang, asRec(v.totals)?.agentCollectBookings], [[null, null, null, null, null], null, null], "v");
    ok(![...keysDeep(v)].some((k) => /payable|gross|paidSatang|amountSatang|priceMinor/i.test(k)), "VM ของ v มีคีย์ยอดเงิน");
    let sum = 0;
    for (const r of rowsOf(b)) {
      const row = (await q<Rec>(`SELECT status, ("grossSatang" - "discountSatang" - "agentDiscountSatang")::int AS "payableSatang", "paidSatang" FROM "TripBooking" WHERE id = $1`, [String(r.bookingId)]))[0] ?? {};
      const exp = num(of(row)); sum += exp; eq(r.outstandingSatang, exp, `ค้างของ ${r.code}`);
    }
    eq([asRec(b.totals)?.outstandingSatang, asRec(b.totals)?.agentCollectBookings], [sum, 0], "ยอดรวม");
    ok(sum > 0 && rowOf(b, B.b4.id)?.outstandingSatang === 0, "TRAVELLED ต้องไม่ค้าง · ต้องมีการจองที่ค้างจริง");
  });
  await st("BT-16", "ของที่ต้องเตรียม + เรือ/ไกด์: รายการเสริม กล้อง 2 (ทั้งชุด) · ขนาดตีนกบ 38×1 · 42×2 · ยังไม่ระบุ = คนที่ไม่ถูกลบและไม่มีขนาด · อาหาร = คน 9 + ไกด์ 1 · boats/guides จาก TripResourceUse active เท่านั้น (รถที่ use ไม่ active ไม่โผล่)", async () => {
    needDb(); const vm = VM(await lm("v"), "load"); const p = asRec(vm.prep) ?? {}; const d = asRec(vm.departure) ?? {};
    eq(asArr(p.extras).map((x) => [x.nameTh, x.nameEn, x.qty]), [["เช่ากล้องกันน้ำ", "Waterproof camera", 2]], "extras");
    eq([p.finSizes, p.finMissing, p.meals], [[{ size: "38", n: 1 }, { size: "42", n: 2 }], 4, { travellers: 9, guides: 1 }], "ตีนกบ/อาหาร");
    eq([asArr(d.boats).map((x) => x.name), asArr(d.guides).map((x) => x.name), d.titleTh, d.titleEn, d.optionTh], [[`เรือ ${STAMP}`], [`ไกด์ ${STAMP}`], "ทดสอบ PH", "Test PH", "ร่วมกลุ่ม"], "departure");
    eq(asArr(rowOf(vm, B.b1.id)?.extras).map((x) => [x.nameTh, x.qty]), [["เช่ากล้องกันน้ำ", 1]], "extras ของแถว");
  });
  await st("BT-17", "ตัวโหลดไม่เขียนฐาน: แฮชข้อมูล (ผู้เดินทาง/การจอง/รถ/ไฟล์/TripDocView/Outbox) และจำนวน AuditLog ก่อน-หลังเรียก 5 บทบาท × 2 มุมมอง เท่าเดิม (รวมเจ้าของในหน่วยที่ maskOnScreen = false — ไม่มี list_unmasked)", async () => {
    needDb(); const h0 = await dataHash(), a0 = await auditN();
    for (const t of ["v", "vb", "vh", "oa", "mg"]) for (const view of VIEWS) VM(await lm(t, { view }), `${t}/${view}`);
    eq([await dataHash(), await auditN()], [h0, a0], "ฐานหลังโหลด");
  });
  await st("BT-18", "เขตเวลา + รอบว่าง: หน่วยโตเกียว รอบ 2027-04-09T23:30Z ⇒ timeText 08:30–16:30 · unit.tz Asia/Tokyo · ไม่มีการจอง ⇒ groups [] · ยอดรวม 0 · ไม่ truncated", async () => {
    needDb(); const vm = VM(await lm("v", {}, { unit: uT, dep: depT }), "tokyo"); const t = asRec(vm.totals) ?? {};
    eq([asRec(vm.departure)?.timeText, asRec(vm.departure)?.localDate, asRec(vm.unit)?.tz, groupsOf(vm), t.bookings, t.people, t.named, vm.truncated, vm.paxTruncated], ["08:30–16:30", "2027-04-10", "Asia/Tokyo", [], 0, 0, 0, false, false], "โตเกียว");
  });
  let CAPDEP = "";
  await st("BT-19", "เพดาน: รอบที่มีการจองเกินเพดาน (CAP+3) ⇒ แสดง CAP แถว · bookingsTotal/ยอดรวมคน จากคิวรีรวมทั้งชุด (ไม่ใช่จากแถวที่ถูกตัด) · truncated · ผู้เดินทางเกิน PAX_CAP ⇒ paxShown ≤ เพดาน + paxTruncated · ตัวเลขลงนาม/สุขภาพ = null", async () => {
    needDb(); const CAP = num(constOf("TRIPS_MANIFEST_BOOKING_CAP")), PCAP = num(constOf("TRIPS_MANIFEST_PAX_CAP"));
    const dep = await mkDep("PH", { date: "2027-04-11" }); const tpl = await mkBooking("PH", dep, ["ต้นแบบ เพดาน"]);
    const item = (await q<{ id: string }>(`SELECT id FROM "TripBookingItem" WHERE "bookingId" = $1 AND kind = 'SEAT' LIMIT 1`, [tpl.id]))[0]?.id ?? "";
    const n = CAP + 2, k = Math.floor(PCAP / CAP) + 2, nid = `'t14c${STAMP}b' || g`;
    await cloneRows("TripBooking", tpl.id, n, { id: nid, code: `'ZZ-${STAMP.slice(-4).toUpperCase()}-' || lpad(g::text, 5, '0')`, publicTokenHash: `md5('${STAMP}' || g) || md5('x${STAMP}' || g)` });
    await cloneRows("TripBookingItem", item, n, { id: `'t14c${STAMP}i' || g`, bookingId: nid });
    await pool.query(`INSERT INTO "TripPassenger" (id, "tenantId", "unitId", "bookingId", "fullName", answers, "formStatus", "isMinor", "createdAt", "updatedAt")
      SELECT 't14c${STAMP}p' || g || '_' || j, $1, $2, 't14c${STAMP}b' || g, 'เพดาน ' || g || '-' || j, '{}'::jsonb, 'PENDING', false, now(), now() FROM generate_series(1, ${n}) g, generate_series(1, ${k}) j`, [tA, uA]);
    CAPDEP = dep;
    const vm = VM(await lm("oa", { view: "booking" }, { dep }), "cap"); const t = asRec(vm.totals) ?? {};
    eq([vm.bookingsTotal, vm.bookingsShown, vm.bookingCap, vm.truncated, rowsOf(vm).length, t.bookings, t.people], [CAP + 3, CAP, CAP, true, CAP, CAP + 3, CAP + 3], "การจอง");
    ok(num(vm.paxShown) <= PCAP && vm.paxTruncated === true && num(vm.paxTotal) > PCAP, `ผู้เดินทาง: shown ${vm.paxShown} total ${vm.paxTotal} cap ${PCAP}`);
    ok(rowsOf(vm).reduce((a, r) => a + asArr(r.travellers).length, 0) <= PCAP, "จำนวนผู้เดินทางใน VM เกินเพดาน");
    eq([t.waiverSigned, t.waiverRequired, t.healthProvided, t.healthMissing], [null, null, null, null], "ตัวเลขที่ต้องอ่านรายคน = null เมื่อถูกตัด");
    eq(t.named, 1 + n * k, "named จากคิวรีรวม (ทั้งชุด)");
  });
  await st("BT-20", "อินพุต strict: คีย์เกิน · unitId ว่าง · departureId ยาว 129 · มีอักขระควบคุม ⇒ INVALID_INPUT (ไม่ throw · ไม่ 500) · ctx พัง ⇒ NOT_FOUND", async () => {
    needDb();
    codeR(await lm("v", { now: NOW0 }), "INVALID_INPUT", "ส่ง now ใน input"); codeR(await lm("v", { view: "PICKUP" }), "INVALID_INPUT", "view ตัวใหญ่");
    codeR(await call("loadManifestVM", ctxOf("v"), { unitId: "", departureId: depH }, {}), ["INVALID_INPUT", "NOT_FOUND"], "unitId ว่าง");
    codeR(await lm("v", {}, { dep: "x".repeat(129) }), ["INVALID_INPUT", "NOT_FOUND"], "ยาว 129");
    codeR(await lm("v", {}, { dep: "a\nb" }), ["INVALID_INPUT", "NOT_FOUND"], "ขึ้นบรรทัด");
    codeR(await call("loadManifestVM", { tenantId: tA }, { unitId: uA, departureId: depH }, {}), ["NOT_FOUND", "INVALID_INPUT"], "ctx พัง");
    codeR(await call("loadManifestVM", null, null), ["NOT_FOUND", "INVALID_INPUT"], "null");
  });
  await st("BT-21", "แผงรอบ (หนี้ T1.2): loadDeparturePanelVM.actions.manifest = true สำหรับผู้มี trips.passenger.view (เจ้าของ) และ false สำหรับผู้ไม่มี (dv)", async () => {
    needDb(); fn("loadManifestVM");
    const a = (r: Rec) => asRec(VM(r, "panel").actions)?.manifest;
    const o = await call("loadDeparturePanelVM", ctxOf("oa"), { unitId: uA, departureId: depH }, { now: new Date(NOW0) });
    const d = await call("loadDeparturePanelVM", ctxOf("dv"), { unitId: uA, departureId: depH }, { now: new Date(NOW0) });
    eq([a(o), a(d)], [true, false], "actions.manifest");
  });
  await st("BT-22", "เท่ากับ T0.8 ทุกคน (ห้ามเขียนสูตรซ้ำ): สำหรับทุกการจองในใบ ผู้เดินทางที่ไม่ถูกลบมี health · waiver · formStatus · missing · docMasked · isMinor · finSize ตรงกับ getTripPassengers ของการจองนั้น และจำนวนไฟล์ live/pendingDeletion ตรงกับรายการไฟล์", async () => {
    needDb(); const vm = VM(await lm("v"), "manifest"); const wvm = VM(await lm("v", {}, { dep: depW }), "manifest depW");
    for (const [b, m] of [[B.b1, vm], [B.b2, vm], [B.b3, vm], [B.b4, vm], [B.w1, wvm]] as const) {
      const ref = (await t08(b)).filter((p) => p.purged !== true);
      const mine = asArr(rowOf(m, b.id)?.travellers).filter((p) => p.purged !== true);
      eq(mine.map((p) => [p.passengerId, p.health, p.waiver, p.formStatus, p.missing, p.docMasked, p.isMinor, p.finSize, p.docs]),
        ref.map((p) => [p.id, p.health, asRec(p.waiver)?.status, p.formStatus, p.missing, p.docMasked, p.isMinor, asRec(p.fields)?.finSize ?? null,
          { live: asArr(p.documents).filter((d) => d.deleted !== true).length, pendingDeletion: asArr(p.documents).filter((d) => d.pendingDeletion === true).length }]), `การจอง ${b.code}`);
    }
  });
  groupLine("BT");

  // ═══════════════ EX. ส่งออก CSV ═══════════════
  console.log("\n── EX: ส่งออก CSV (สิทธิ์ · เนื้อหา · กันสูตร · เพดาน · audit) ──");
  const colIx = (name: string) => CSV_COLS.indexOf(name);
  await st("EX-1", "สิทธิ์ + ไม่บันทึกเมื่อปฏิเสธ: none/dv/pv ⇒ FORBIDDEN · หน่วยอื่น/ร้านอื่น/รอบไม่มี ⇒ NOT_FOUND · locale นอกชุด/คีย์เกิน ⇒ INVALID_INPUT — ทุกกรณีไม่มีแถว audit เพิ่ม และผลไม่มี csv", async () => {
    needDb(); fn("exportManifestCsv"); const a0 = await auditN();
    const rs: [Rec, string | string[], string][] = [[await ex("none"), "FORBIDDEN", "none"], [await ex("dv"), "FORBIDDEN", "dv"], [await ex("pv"), "FORBIDDEN", "pv"], [await ex("a2"), "NOT_FOUND", "a2"],
      [await ex("oa", {}, { dep: depC }), "NOT_FOUND", "depC"], [await ex("oa", {}, { dep: depB }), "NOT_FOUND", "depB"], [await ex("v", { locale: "fr" }), "INVALID_INPUT", "locale"], [await ex("v", { includeHealth: true }), "INVALID_INPUT", "คีย์เกิน"]];
    for (const [r, c, w] of rs) { codeR(r, c, w); ok(!("value" in r) && !JSON.stringify(r).includes(MK.name), `${w}: ผลปฏิเสธมีข้อมูล`); }
    eq(await auditN(), a0, "audit เพิ่มทั้งที่ปฏิเสธ");
  });
  let CSV: string[][] = []; let CSV_RAW = "";
  await st("EX-2", "เนื้อหา: หัว 16 คอลัมน์ตาม MANIFEST_CSV_COLUMNS (ข้อความไทยจาก messages) · 1 แถวต่อผู้เดินทางที่ยังไม่ถูกลบ (7) + 1 แถวของการจองที่ผู้เดินทางถูกลบหมด = 8 · ผู้ถูกลบ 2 คนไม่อยู่ในไฟล์ (purgedSkipped 2) · เรียงตามมุมมองรถ → ลำดับแถว → ลำดับคน", async () => {
    needDb(); const v = V(await ex("v"), "exportManifestCsv"); CSV_RAW = String(v.csv ?? ""); CSV = parseCsv(CSV_RAW);
    ok(CSV_RAW.startsWith("\uFEFF") && CSV_RAW.endsWith("\r\n") && !/[^\r]\n/.test(CSV_RAW) && !CSV_RAW.includes("\t"), "รูปไฟล์ (BOM/CRLF/ไม่มี tab)");
    const th = Object.fromEntries(flat(JSON.parse(read("src/messages/th/trips.json") || "{}")));
    eq(CSV[0], CSV_COLS.map((c) => th[`manifest.csv.${c}`]), "หัวคอลัมน์");
    ok(CSV.every((r) => r.length === CSV_COLS.length), "จำนวนคอลัมน์ไม่เท่ากันทุกแถว");
    eq([CSV.length - 1, v.rows, v.truncated, v.purgedSkipped], [8, 8, false, 2], "จำนวนแถว");
    const codes = CSV.slice(1).map((r) => r[colIx("bookingCode")]);
    const unassigned = [B.b4, B.gone].sort((a, b) => (a.code < b.code ? -1 : 1)).flatMap((b) => (b === B.b4 ? [b.code, b.code] : [b.code]));
    eq(codes, [B.b1.code, B.b1.code, B.b1.code, B.b2.code, B.b3.code, ...unassigned], "ลำดับการจอง");
    eq(CSV.slice(1, 4).map((r) => [r[colIx("paxNo")], r[colIx("pickupTime")]]), [["1", "06:45"], ["2", "06:45"], ["3", "06:45"]], "ลำดับคน/เวลารับ");
    const gone = CSV.slice(1).find((r) => r[colIx("bookingCode")] === B.gone.code) ?? [];
    eq([gone[colIx("traveller")], gone[colIx("paxNo")], gone[colIx("booker")], gone[colIx("paxType")], gone[colIx("health")], gone[colIx("formStatus")]], ["", "", "", "", "", ""], "แถวของการจองที่ถูกลบหมด (ช่องรายคนและชื่อผู้จองว่าง)");
  });
  await st("EX-3", "ค่าที่ถูกต้อง: ชื่อผู้เดินทาง · เลขเอกสารปิดบัง ••••<4 ตัวท้าย> · สัญชาติ · ขนาดตีนกบ · ชื่อผู้จอง · จุดรับ · เซลล์สถานะเป็นข้อความตามภาษา (ไม่ใช่รหัสดิบ) · คนที่ยังไม่กรอกชื่อ = ช่องว่าง", async () => {
    needDb(); ok(CSV.length > 1, "EX-2 ไม่ผ่าน"); const r1 = CSV[1] ?? [], r3 = CSV[3] ?? [];
    eq([r1[colIx("traveller")], r1[colIx("docMasked")], r1[colIx("nationality")], r1[colIx("finSize")], unq(r1[colIx("pickupPlace")] ?? "")], [`${MK.name} หนึ่ง`, `••••${MK.doc.slice(-4)}`, "TH", "42", NASTY.place], "แถวแรก");
    ok((r1[colIx("booker")] ?? "").includes(`ผู้จอง${STAMP}`), "ชื่อผู้จอง");
    eq([r3[colIx("traveller")], r3[colIx("paxNo")]], ["", "3"], "คนที่ยังไม่กรอกชื่อ");
    const th = Object.fromEntries(flat(JSON.parse(read("src/messages/th/trips.json") || "{}")));
    eq([r1[colIx("health")], r1[colIx("formStatus")], r1[colIx("waiver")], r1[colIx("docType")]], [th["manifest.health.PROVIDED"], th["manifest.formStatus.SUBMITTED"], th["manifest.waiver.NOT_REQUIRED"], th["manifest.docType.PASSPORT"]], "ข้อความสถานะ");
    const raw = CSV.slice(1).flatMap((r) => ["channel", "paxType", "docType", "formStatus", "waiver", "health", "group"].map((c) => r[colIx(c)] ?? "")).filter((c) => RAW_CODES.has(c));
    ok(raw.length === 0, `รหัสดิบในไฟล์: ${[...new Set(raw)].join(", ")}`);
  });
  await st("EX-4", "กันสูตร (ชื่อ/จุดรับที่ปลูก = + - @ tab+= และมี \" , ขึ้นบรรทัด): ไม่มีเซลล์ใดในไฟล์ขึ้นต้นด้วย = + - @ tab · ค่าหลังเอา ' ออกตรงกับที่ปลูก (อักขระควบคุมเป็นช่องว่าง) · จำนวนบรรทัดไม่เพี้ยน", async () => {
    needDb(); ok(CSV.length > 1, "EX-2 ไม่ผ่าน");
    const bad = CSV.flat().filter((c) => FORMULA_START.test(c));
    ok(bad.length === 0, `เซลล์อันตราย ${bad.length}: ${fmt(bad.slice(0, 3))}`);
    const names = CSV.slice(1).map((r) => r[colIx("traveller")] ?? "");
    const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    for (const n of [NASTY.eq, NASTY.at, NASTY.plus, NASTY.minus, NASTY.multi]) ok(names.includes(`'${clean(n)}`), `ไม่พบ '${clean(n).slice(0, 24)}… (ต้องมี ' นำหน้าและค่าเดิมครบ)`);
    ok((CSV[1]?.[colIx("pickupPlace")] ?? "").startsWith("'="), "จุดรับที่ขึ้นต้น = ต้องมี ' นำหน้า");
    eq(CSV_RAW.split("\r\n").length, CSV.length + 1, "จำนวนบรรทัดดิบ (ไม่มีขึ้นบรรทัดในเซลล์)");
  });
  await st("EX-5", "ไฟล์ไม่มีข้อมูลเกินจำเป็น (ทุกบทบาท รวมเจ้าของ + ผู้มีสิทธิ์สุขภาพ/เปิดเลข): ไม่มีเลขเอกสารเต็ม · เนื้อหาสุขภาพ · เบอร์ (แม้ปิดบัง) · id ภายใน · การจอง HOLD/CANCELLED · ผู้ถูกลบ · ของหน่วย/ร้านอื่น · ยอดเงิน", async () => {
    needDb();
    for (const t of ["v", "vh", "vw", "oa"]) {
      const csv = String(V(await ex(t), t).csv ?? "");
      const leak = hits(csv, [...SENSITIVE_MARKERS(), MK.hold, MK.cxl, MK.gone, MK.other, String(fn("maskPhone")(MK.phone)), B.b1.id, B.b1.pax[0], depH, run1, `zqxfile${STAMP}`]);
      ok(leak.length === 0, `${t}: รั่ว ${leak.join(", ")}`);
      ok(!csv.includes(String(B.b1.payable)) && !/\d{1,3}(,\d{3})+\.\d{2}/.test(csv), `${t}: มียอดเงิน`);
    }
  });
  await st("EX-6", "audit: ส่งออก 1 ครั้ง = 1 แถว trips.manifest.exported (USER · actorId ผู้เรียก · unitId · targetType TripDeparture · targetId รอบ · after = { departureId, format CSV, purpose MANIFEST, rows, truncated, purgedSkipped } เท่านั้น) · ชื่อไฟล์ = manifestFileName", async () => {
    needDb(); const before = (await audits("trips.manifest.exported")).length; const v = V(await ex("vb"), "export");
    const rows = await audits("trips.manifest.exported"); eq(rows.length, before + 1, "จำนวนแถว audit");
    const a = rows[rows.length - 1];
    eq([a?.actorType, a?.actorId, a?.unitId, a?.targetType, a?.targetId, a?.before], ["USER", U.vb.userId, uA, "TripDeparture", depH, null], "แถว audit");
    eq(a?.after, { departureId: depH, format: "CSV", purpose: "MANIFEST", rows: 8, truncated: false, purgedSkipped: 2 }, "after");
    eq(v.filename, fn("manifestFileName")(TRAVEL, depH), "ชื่อไฟล์");
  });
  await st("EX-7", "ภาษาอังกฤษ: หัวคอลัมน์จาก en ไม่มีอักษรไทย · เซลล์สถานะ/ช่องทาง/ประเภทคนไม่มีอักษรไทย (ชื่อคน/จุดรับคงเดิม) · ข้อมูลแถวเท่ากับไฟล์ไทย", async () => {
    needDb(); ok(CSV.length > 1, "EX-2 ไม่ผ่าน"); const en = parseCsv(String(V(await ex("v", { locale: "en" }), "en").csv ?? ""));
    const msg = Object.fromEntries(flat(JSON.parse(read("src/messages/en/trips.json") || "{}")));
    eq(en[0], CSV_COLS.map((c) => msg[`manifest.csv.${c}`]), "หัวอังกฤษ");
    ok((en[0] ?? []).every((c) => !/[฀-๿]/.test(c)), "หัวมีอักษรไทย");
    const thai = en.slice(1).flatMap((r) => ["channel", "paxType", "docType", "formStatus", "waiver", "health"].map((c) => r[colIx(c)] ?? "")).filter((c) => /[฀-๿]/.test(c));
    ok(thai.length === 0, `เซลล์สถานะยังเป็นไทย: ${fmt(thai.slice(0, 3))}`);
    eq(en.slice(1).map((r) => [r[colIx("bookingCode")], r[colIx("traveller")], r[colIx("paxType")]]), CSV.slice(1).map((r) => [r[colIx("bookingCode")], r[colIx("traveller")], r[colIx("paxNo")] ? "Adult" : ""]), "ข้อมูลแถว");
  });
  await st("EX-8", "ซ้ำ/พร้อมกัน: ส่งออก 5 ครั้งพร้อมกัน ⇒ สำเร็จทั้งหมด ไฟล์เหมือนกันทุกไบต์ · audit เพิ่ม 5 แถว (แต่ละครั้งคือเหตุการณ์) · ไม่มีแถวอื่นถูกแก้ (แฮชข้อมูลเท่าเดิม) · ไม่มี outbox เพิ่ม", async () => {
    needDb(); fn("exportManifestCsv"); const h0 = await dataHash(); const n0 = (await audits("trips.manifest.exported")).length;
    const rs = await Promise.all(Array.from({ length: 5 }, () => ex("v")));
    const csvs = rs.map((r) => String(V(r, "export").csv ?? ""));
    eq(new Set(csvs).size, 1, "ไฟล์ต่างกัน"); eq((await audits("trips.manifest.exported")).length, n0 + 5, "audit"); eq(await dataHash(), h0, "ข้อมูลถูกแก้");
  });
  await st("EX-9", "เพดาน: รอบที่เกินเพดาน ⇒ truncated true · แถวข้อมูล ≤ TRIPS_MANIFEST_PAX_CAP · audit จด truncated true + rows จริง · ขนาดไฟล์มีขอบเขต", async () => {
    needDb(); ok(CAPDEP, "BT-19 ไม่ผ่าน (ไม่มีรอบเกินเพดาน)"); const PCAP = num(constOf("TRIPS_MANIFEST_PAX_CAP"));
    const v = V(await ex("oa", {}, { dep: CAPDEP }), "export cap"); const rows = parseCsv(String(v.csv ?? ""));
    ok(v.truncated === true && rows.length - 1 <= PCAP && rows.length - 1 === v.rows && num(v.rows) > 0, `truncated ${v.truncated} rows ${rows.length - 1}/${v.rows} cap ${PCAP}`);
    ok(String(v.csv ?? "").length < PCAP * 2000, "ไฟล์ใหญ่เกินขอบเขต");
    const a = (await audits("trips.manifest.exported")).filter((x) => x.targetId === CAPDEP).pop();
    eq([a?.after?.truncated, a?.after?.rows], [true, v.rows], "audit");
  });
  await st("EX-10", "ร้านอื่น: เจ้าของร้าน B ส่งออกรอบของตน ⇒ มีแต่ของร้าน B · audit อยู่ใต้ร้าน B · ไม่มีชื่อของร้าน A", async () => {
    needDb(); const v = V(await call("exportManifestCsv", ctxOf("ob"), { unitId: uB, departureId: depB }, { now: new Date(NOW0) }), "ob export"); const csv = String(v.csv ?? "");
    ok(csv.includes(`${MK.other} ร้านอื่น`) && !csv.includes(MK.name) && !csv.includes(`${MK.allergy}-tb`), "เนื้อหาร้าน B");
    eq((await audits("trips.manifest.exported", [tB])).filter((x) => x.targetId === depB).length, 1, "audit ร้าน B");
  });
  groupLine("EX");

  // ═══════════════ HV. เปิดดูข้อมูลสุขภาพ ═══════════════
  console.log("\n── HV: เปิดดูข้อมูลสุขภาพของรอบ (สิทธิ์แคบ · audit รายคน) ──");
  const revealed = async () => (await audits("trips.passenger.revealed")).filter((a) => a.after?.via === "MANIFEST");
  await st("HV-1", "สิทธิ์แคบ: v/vb (ไม่มีคีย์สุขภาพ) · vw (trips.* + reveal + edit) · mg (MANAGER) ⇒ FORBIDDEN · pv (มีสุขภาพแต่ขาด departure.view) ⇒ FORBIDDEN · a2 (สุขภาพแต่หน่วยอื่น) ⇒ NOT_FOUND — ไม่มี audit · ผลไม่มีเนื้อหา", async () => {
    needDb(); fn("revealManifestHealth"); const a0 = await auditN();
    for (const t of ["v", "vb", "vw", "mg", "pv", "none"]) { const r = await hv(t); codeR(r, "FORBIDDEN", t); ok(hits(JSON.stringify(r), [MK.allergy, MK.cond, MK.allergy2]).length === 0, `${t}: ผลปฏิเสธมีเนื้อหา`); }
    codeR(await hv("a2"), "NOT_FOUND", "a2");
    codeR(await hv("oa", {}, { dep: depB }), "NOT_FOUND", "รอบร้านอื่น");
    eq(await auditN(), a0, "audit เพิ่มทั้งที่ปฏิเสธ");
  });
  await st("HV-2", "เนื้อหา (vh): เฉพาะผู้เดินทางของการจองในใบที่สุขภาพ PROVIDED และยังไม่ถูกลบ = 2 คน (แพ้/โรคตรงที่ปลูก) · ไม่มี DECLINED/WITHDRAWN/MISSING/ถูกลบ · ไม่มีของการจอง HOLD/CANCELLED/หน่วยอื่น/ร้านอื่น", async () => {
    needDb(); const v = V(await hv("vh"), "revealManifestHealth"); const items = asArr(v.items);
    eq([v.purpose, v.count, items.length], ["SAFETY", 2, 2], "จำนวน");
    const by = (pid: string) => items.find((x) => x.passengerId === pid) ?? {};
    eq([by(B.b1.pax[0]).allergies, by(B.b1.pax[0]).conditions, by(B.b1.pax[0]).fullName, by(B.b1.pax[0]).bookingId, by(B.b1.pax[0]).code], [MK.allergy, MK.cond, `${MK.name} หนึ่ง`, B.b1.id, B.b1.code], "คนแรก");
    eq([by(B.b2.pax[0]).allergies, by(B.b2.pax[0]).conditions], [MK.allergy2, null], "คนที่สอง");
    for (const it of items) eq(Object.keys(it).sort(), ["allergies", "bookingId", "code", "conditions", "fullName", "passengerId"], "คีย์รายการ");
    const js = JSON.stringify(v);
    ok(!js.includes(`${MK.allergy}-hold`) && !js.includes(`${MK.allergy}-cxl`) && !js.includes(`${MK.allergy}-u2`) && !js.includes(`${MK.allergy}-tb`) && !js.includes(MK.doc), "มีของที่ไม่ควรเปิด");
  });
  await st("HV-3", "audit รายคน commit แล้วเมื่อคืนค่า: 1 แถว trips.passenger.revealed ต่อคนใน items · USER/actorId · targetType TripPassenger · after = { passengerId, what HEALTH, purpose, via MANIFEST, departureId } เท่านั้น (ไม่มีเนื้อหา)", async () => {
    needDb(); fn("revealManifestHealth"); const b0 = (await revealed()).length; const v = V(await hv("vh", { purpose: "MANIFEST" }), "reveal");
    const rows = (await revealed()).slice(b0);
    eq([rows.length, v.count], [2, 2], "จำนวนแถว");
    eq(rows.map((a) => [a.actorType, a.actorId, a.unitId, a.targetType, a.targetId, a.before]).sort(), [B.b1.pax[0], B.b2.pax[0]].map((p) => ["USER", U.vh.userId, uA, "TripPassenger", p, null]).sort(), "แถว");
    for (const a of rows) eq(a.after, { passengerId: a.targetId, what: "HEALTH", purpose: "MANIFEST", via: "MANIFEST", departureId: depH }, "after");
    ok(hits(JSON.stringify(rows), PERSON_MARKERS()).length === 0, "audit มีข้อมูลบุคคล");
  });
  await st("HV-4", "วัตถุประสงค์: MANIFEST/SAFETY/CHECKIN ได้ · OTHER/ว่าง/ตัวเล็ก/ไม่ส่ง ⇒ INVALID_INPUT และไม่มี audit · เจ้าของร้านเปิดได้ (OWNER)", async () => {
    needDb(); fn("revealManifestHealth"); const b0 = (await revealed()).length;
    for (const p of ["OTHER", "", "safety", "PDPA_REQUEST", "CUSTOMER_SERVICE"]) codeR(await hv("vh", { purpose: p }), "INVALID_INPUT", `purpose ${p}`);
    codeR(await call("revealManifestHealth", ctxOf("vh"), { unitId: uA, departureId: depH }, {}), "INVALID_INPUT", "ไม่ส่ง purpose");
    eq((await revealed()).length, b0, "audit ทั้งที่ปฏิเสธ");
    eq(V(await hv("oa", { purpose: "CHECKIN" }), "oa").count, 2, "เจ้าของ"); eq((await revealed()).length, b0 + 2, "audit ของเจ้าของ");
  });
  await st("HV-5", "ไม่มีข้อมูลให้เปิด: รอบที่ไม่มีใครให้ข้อมูลสุขภาพ (depW) และรอบว่าง ⇒ ok · items [] · count 0 · ไม่มี audit", async () => {
    needDb(); fn("revealManifestHealth"); const a0 = await auditN();
    for (const dep of [depW, depE]) { const v = V(await hv("oa", {}, { dep }), `dep ${dep === depW ? "W" : "E"}`); eq([v.count, v.items], [0, []], "ว่าง"); }
    eq(await auditN(), a0, "audit");
  });
  await st("HV-6", "กุญแจหาย (ไม่มี INTEGRATIONS_CREDENTIALS_KEY): ทั้งคำขอ BUSY · ไม่คืนบางส่วน · ไม่มี audit · คืนกุญแจแล้วใช้ได้ตามเดิม", async () => {
    needDb(); fn("revealManifestHealth"); const a0 = await auditN(); const keep = process.env.INTEGRATIONS_CREDENTIALS_KEY;
    ok(keep, "สภาพแวดล้อมไม่มี INTEGRATIONS_CREDENTIALS_KEY");
    let r: Rec; delete process.env.INTEGRATIONS_CREDENTIALS_KEY;
    try { r = await hv("vh"); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = keep; }
    codeR(r, "BUSY", "กุญแจหาย"); ok(!("value" in r) && hits(JSON.stringify(r), [MK.allergy, MK.cond]).length === 0, "คืนข้อมูลทั้งที่ล้ม");
    eq(await auditN(), a0, "audit ทั้งที่ล้ม"); eq(V(await hv("vh"), "หลังคืนกุญแจ").count, 2, "ใช้ได้ตามเดิม");
  });
  await st("HV-7", "กล่องเสีย 1 ใบ (AAD ไม่ตรง — ย้ายกล่องจากคนอื่น): ทั้งคำขอ BUSY ไม่คืนของคนอื่น ไม่มี audit (ทั้งหมดหรือไม่มีเลย)", async () => {
    needDb(); fn("revealManifestHealth"); const dep = await mkDep("PH", { date: "2027-04-13" }); const b = await mkBooking("PH", dep, ["กล่อง ดี", "กล่อง เสีย"]);
    await plantPax(tA, b.pax[0], { formStatus: "SUBMITTED", health: { allergies: `${MK.allergy}-ok`, conditions: null } });
    await plantPax(tA, b.pax[1], { formStatus: "SUBMITTED", health: { allergies: "x", conditions: null } });
    await pool.query(`UPDATE "TripPassenger" SET answers = jsonb_set(answers, '{health,box}', to_jsonb($2::text)) WHERE id = $1`, [b.pax[1], seal({ v: 1, allergies: "ย้ายมา" }, `trips.pax.health.v1:${tA}:คนอื่น`)]);
    const a0 = await auditN(); const r = await hv("vh", {}, { dep });
    codeR(r, "BUSY", "กล่องเสีย"); ok(!JSON.stringify(r).includes(`${MK.allergy}-ok`), "คืนบางส่วน"); eq(await auditN(), a0, "audit");
  });
  await st("HV-8", "พร้อมกัน 5 คำขอ: สำเร็จทั้งหมด ได้ 2 รายการทุกคำขอ · audit เพิ่ม 10 แถว (ไม่รวบ ไม่หาย ไม่ deadlock) · ข้อมูลผู้เดินทางไม่ถูกแก้", async () => {
    needDb(); fn("revealManifestHealth"); const b0 = (await revealed()).length, h0 = await dataHash();
    const rs = await Promise.all(Array.from({ length: 5 }, () => hv("vh")));
    eq(rs.map((r) => V(r, "reveal").count), [2, 2, 2, 2, 2], "ผล"); eq((await revealed()).length, b0 + 10, "audit"); eq(await dataHash(), h0, "ข้อมูลถูกแก้");
  });
  await st("HV-9", "การเปิดสุขภาพไม่เปลี่ยนสิ่งที่ตัวโหลด/ไฟล์ส่งออกให้: หลังเปิดแล้ว VM ของ vh และ CSV ของ vh ยังไม่มีเนื้อหาสุขภาพ (ไม่มีแคช/ธงค้าง)", async () => {
    needDb(); V(await hv("vh"), "reveal");
    ok(hits(JSON.stringify(VM(await lm("vh"), "vm")), SENSITIVE_MARKERS()).length === 0, "VM มีเนื้อหาสุขภาพหลังเปิด");
    ok(hits(String(V(await ex("vh"), "csv").csv ?? ""), SENSITIVE_MARKERS()).length === 0, "CSV มีเนื้อหาสุขภาพหลังเปิด");
  });
  groupLine("HV");

  // ═══════════════ PR. บันทึกการพิมพ์ ═══════════════
  console.log("\n── PR: บันทึกการพิมพ์ ──");
  await st("PR-1", "สิทธิ์เท่าการส่งออก: none/dv/pv ⇒ FORBIDDEN · หน่วยอื่น ⇒ NOT_FOUND · คีย์เกิน ⇒ INVALID_INPUT — ไม่มี audit", async () => {
    needDb(); fn("recordManifestPrint"); const a0 = await auditN();
    for (const t of ["none", "dv", "pv"]) codeR(await pr(t), "FORBIDDEN", t);
    codeR(await pr("a2"), "NOT_FOUND", "a2"); codeR(await pr("v", { withHealth: true }), "INVALID_INPUT", "คีย์เกิน");
    eq(await auditN(), a0, "audit");
  });
  await st("PR-2", "พิมพ์ 1 ครั้ง = 1 แถว trips.manifest.printed (USER · actorId · unitId · TripDeparture · after = { departureId, purpose MANIFEST, passengers = ผู้เดินทางที่ยังไม่ถูกลบในใบ 7 }) · คืน { passengers: 7 } · ไม่มีข้อมูลบุคคลใน audit", async () => {
    needDb(); const n0 = (await audits("trips.manifest.printed")).length; const v = V(await pr("v"), "recordManifestPrint");
    const rows = await audits("trips.manifest.printed"); const a = rows[rows.length - 1];
    eq([rows.length, v.passengers], [n0 + 1, 7], "จำนวน");
    eq([a?.actorType, a?.actorId, a?.unitId, a?.targetType, a?.targetId, a?.after], ["USER", U.v.userId, uA, "TripDeparture", depH, { departureId: depH, purpose: "MANIFEST", passengers: 7 }], "แถว");
  });
  groupLine("PR");

  // ═══════════════ AU. สแกนข้อมูลส่วนบุคคล ═══════════════
  console.log("\n── AU: ไม่มีข้อมูลส่วนบุคคลใน audit / outbox / ops / ข้อความผิดพลาด ──");
  await st("AU-1", "AuditLog ที่ใบนี้เขียน (trips.manifest.* และ trips.passenger.revealed via MANIFEST) ของร้านทดสอบ: ไม่มีชื่อ/เบอร์/เลขเอกสาร/เนื้อหาสุขภาพ/ชื่อโรงแรม · ค่าใน after เป็น id/enum/จำนวน/บูลีนเท่านั้น · มีแถวจริง (ไม่ใช่ผ่านเพราะว่าง)", async () => {
    needDb(); fn("exportManifestCsv");
    const rows = [...(await audits("trips.manifest.exported")), ...(await audits("trips.manifest.printed")), ...(await revealed())];
    ok(rows.length >= 3, `แถว audit ของใบน้อยเกิน (${rows.length}) — ข้อ EX/HV/PR ยังไม่ผ่าน`);
    const leak = hits(JSON.stringify(rows), [...PERSON_MARKERS(), `ผู้จอง${STAMP}`]);
    ok(leak.length === 0, `audit รั่ว: ${leak.join(", ")}`);
    const allowed = new Set(["departureId", "format", "purpose", "rows", "truncated", "purgedSkipped", "passengers", "passengerId", "what", "via"]);
    const extra = [...new Set(rows.flatMap((a) => Object.keys(a.after ?? {})))].filter((k) => !allowed.has(k));
    ok(extra.length === 0, `คีย์แปลกใน after: ${extra.join(", ")}`);
    const other = (await q<{ action: string }>(`SELECT DISTINCT action FROM "AuditLog" WHERE "tenantId" = ANY($1::text[]) AND action LIKE 'trips.manifest.%'`, [[tA, tB]])).map((r) => r.action).filter((a) => !["trips.manifest.exported", "trips.manifest.printed"].includes(a));
    ok(other.length === 0, `action แปลก: ${other.join(", ")}`);
  });
  await st("AU-2", "ไม่มี event ใหม่: จำนวน OutboxEvent ของร้านทดสอบหลังรันทุกข้อ = ตอนปลูกฟิกซ์เจอร์เสร็จ (+ ที่เกิดจาก bookTripsNow ของข้อ BT-19/HV-7) และไม่มี type trips.manifest.* · payload ไม่มีตัวบ่งชี้อ่อนไหว", async () => {
    needDb(); fn("loadManifestVM"); ok(outboxBase >= 0, "ไม่มีฐานนับ outbox");
    const rows = await q<{ type: string; payload: Rec }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [[tA, tB]]);
    const mf = rows.filter((r) => /manifest|vehicle_run|health/.test(r.type));
    ok(mf.length === 0, `มี event ของใบ: ${[...new Set(mf.map((r) => r.type))].join(", ")}`);
    const late = rows.length - outboxBase;
    const fromBookings = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripBooking" WHERE "tenantId" = $1 AND "departureId" <> ALL($2::text[]) AND id NOT LIKE 't14c%'`, [tA, [depH, depW, depC, depE, depT]]))[0]?.n ?? 0;
    ok(late <= fromBookings * 6, `outbox เพิ่ม ${late} แถว (การจองใหม่หลังฐานนับ ${fromBookings})`);
    ok(hits(JSON.stringify(rows), SENSITIVE_MARKERS()).length === 0, "outbox มีค่าอ่อนไหว");
  });
  await st("AU-3", "OpsEvent ตั้งแต่เริ่มรัน: ไม่มีตัวบ่งชี้บุคคล/อ่อนไหว (ชื่อ · เบอร์ · เลขเอกสาร · สุขภาพ) — รวมกรณีล้ม (กุญแจหาย · กล่องเสีย) ที่ข้อ HV ทำให้เกิด", async () => {
    needDb(); fn("revealManifestHealth");
    const rows = await q<Rec>(`SELECT source, message, detail FROM "OpsEvent" WHERE "createdAt" >= $1`, [T0]);
    const leak = hits(JSON.stringify(rows), PERSON_MARKERS());
    ok(leak.length === 0, `OpsEvent รั่ว: ${leak.join(", ")}`);
  });
  await st("AU-4", "ข้อความผิดพลาดของบริการทั้ง 4 ตัวไม่สะท้อนอินพุต/ข้อมูลบุคคล: ส่ง departureId ที่มีตัวบ่งชี้ ⇒ ผลปฏิเสธไม่มีตัวบ่งชี้นั้น และ message เป็นข้อความสั้น (≤ 200 ตัว)", async () => {
    needDb(); const probe = `${MK.name}-${MK.allergy}`;
    for (const n of ["loadManifestVM", "exportManifestCsv", "revealManifestHealth", "recordManifestPrint"]) {
      const r = await call(n, ctxOf("oa"), { unitId: uA, departureId: probe, ...(n === "revealManifestHealth" ? { purpose: "SAFETY" } : {}) }, { now: new Date(NOW0) });
      ok(r.ok === false, `${n}: ต้องปฏิเสธ ${fmt(r)}`);
      ok(!JSON.stringify(r).includes(MK.name) && !JSON.stringify(r).includes(MK.allergy) && String(r.message ?? "").length <= 200, `${n}: ผลปฏิเสธสะท้อนอินพุต ${fmt(r)}`);
    }
  });
  groupLine("AU");

  exitCode = cks.some((c) => c.res !== "PASS") ? 1 : 0;
} catch (e) {
  record("FATAL", "ข้อสอบล้มกลางทาง (ไม่ควรเกิด)", "FAIL", errMsg(e));
  exitCode = 1;
} finally {
  try { await cleanupTenants(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try { const dbm = await tryImport("@/lib/core/db"); const p = asRec(dbm.mod?.prisma); const dc = p?.$disconnect; if (typeof dc === "function") await (dc as AnyFn).call(p); } catch { /* ignore */ }
  await pool.end().catch(() => undefined);
}

console.log(`\nเหลือให้ด่านภาพ + การกดจริง (ผู้คุม · scripts/visual-trips.mts t1.4 + parity-trips.sh 12): การ์ดสรุป 6 ใบ · ตาราง 7 คอลัมน์เต็มกว้าง 1440 ไม่เลื่อน · ป้าย 4 รูปทรง · 390 เป็นการ์ดไม่ล้น · ผังพิมพ์ (emulateMedia print) ไม่มีเปลือกแอป/ปุ่ม · ดาวน์โหลด CSV เปิดใน Excel ไม่คิดสูตร · กล่องสุขภาพปิดแล้วไม่ค้าง · action 3 ตัวผ่าน Next`);
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groupsOut: Record<string, string> = {};
for (const c of cks) { const g = c.id.replace(/-\d+$/, ""); const [p0, t0] = (groupsOut[g] ?? "0/0").split("/").map(Number); groupsOut[g] = `${p0 + (c.res === "PASS" ? 1 : 0)}/${t0 + 1}`; }
console.log(`\n===== QC TRIPS T1.4a · ใบรายชื่อรายวัน · สถานะเอกสาร · พิมพ์ · ส่งออก · ข้อมูลสุขภาพ =====\nผ่าน ${passed}/${cks.length} · ไม่ผ่าน ${failed.length} · ข้าม ${skipped.length}`);
console.log(`ต่อกลุ่ม: ${Object.entries(groupsOut).map(([g, v]) => `${g} ${v}`).join(" · ")}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), groups: groupsOut })}`);
process.exit(exitCode);
