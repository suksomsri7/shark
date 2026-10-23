// qc-pos-buttons.mts — POS RUN ใบ P4.2 "กดทุกปุ่ม" (ตัวกดตามทะเบียน · พอร์ตจาก scripts/qc-crm-buttons.mts) — ผู้เขียนตัวกด บัญชี B · 22 ต.ค. 2026
//
// อ่าน scripts/pos-ui-inventory.json (ทะเบียน P4.1: page · testid · kind · roles · hiddenFor · expect · oracle · query + opener · needs ·
// viewport · safety) แล้ว ต่อ "ช่อง" ของตารางผ่าน (ผู้ใช้ × จอ × ภาษา · มติ 6 · รอบละ 1 ช่อง มติ 9): เปิดทุกหน้าของทะเบียนในฐานะผู้ใช้นั้น
// บนเซิร์ฟเวอร์ QC5 ที่ผู้คุมเสิร์ฟ (--base) · ไล่ opener · หา element · ตรวจเห็น/ไม่เห็น/เปิดใช้ · กดตาม kind/safety/expect · ตัดสินผล
//
// ใช้ (builder ใช้ได้เฉพาะ --list / --dry · รอบจริง = CONTROLLER-RUN บนทรี d · QC5 เท่านั้น):
//   bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-buttons.mts --list [--user u --device d] [--page p|all] [--only <glob>]
//   bash scripts/iso.sh env CI=1 pnpm exec tsx scripts/qc-pos-buttons.mts --dry --user owner --device desktop --page all
//   ผู้คุม (รอบจริง · หลัง build+serve บนทรี d · ห้ามรันคู่ build/qc:all/รอบตัวกดอื่น):
//   bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-buttons.mts --user owner --device desktop --page all --base http://127.0.0.1:<port>
//   (en: env LOCALE=en ภายใน iso.sh ไม่ใช่ก่อน · หรือ --locale en)
//   ไม่มี --base และไม่มี --dry/--list (ด่าน pos-gates / qc:all) = โหมดด่าน: ตรวจแผนแบบสถิต (ไม่มีเบราว์เซอร์ · ไม่แตะ DB) — CD-P42-W2
//
// ═════════════════════════ สัญญา (ledger/wo-notes/pos-P4.2-walker.md) ═════════════════════════
// ช่อง      PASS_MATRIX 19 ช่อง (pos-buttons-fixtures.mts): th staff × desktop|ipad|mobile · en staff × desktop + mobile(หน้า EN_MOBILE) ·
//           public × desktop|mobile × th|en — แถวของช่อง = cellRows (หน้าตามชนิดผู้ใช้ · viewport ของแถว) · ทุกแถวของช่องอยู่ในสรุปครั้งเดียวเสมอ
// จำแนก     classify(): บทบาทไม่อยู่ใน roles/hiddenFor = skip(no-role-claim) · hiddenFor = ต้องไม่เห็น (เห็น = hiddenLeak) · notice/ui refused|disabled
//           = ต้องเห็น (disabled ตรวจด้วย) · safety external = ไม่กดเด็ดขาด (skip external + oracle) · ตัวจับเงิน/ภายนอก/เลขเอกสารของ P4.1 พบ
//           แต่แถวไม่มี safety = ไม่กด (skip missing-safety · fail-closed) · ไม่มี target/db ตาม R1/R2 = skip(missing-target|missing-db)
// สาขา      หน้าพนักงานทุกหน้าเปิดด้วย ?unit=posqc-btn-unit (CD-P42-W6) — ตัวกดไม่เขียนอะไรที่สีลม/อารีย์ · แถว money/counter กดครั้งเดียวต่อรอบ
//           แล้วตรวจว่าแถวเงินที่เกิด (PosSale/PosPayment/…) อยู่สาขา posqc-btn (ไม่ใช่ = error money-outside-btn)
// กด        button|link|menu|tab|toggle → คลิก (ตกไป DOM click) · input|textarea|select → พิมพ์/เลือกค่า fixture · form|filter → requestSubmit ·
//           ก่อนแถว mutation/download/form: เติมช่องกรอกพี่น้องในฟอร์มเดียวกันที่ยังว่าง (PREFILL) · แถวเงินหน้าขาย = ใส่ตะกร้าก่อน (สินค้า fixture)
// ตาย       ภายใน 3 วิ ไม่มี DOM mutation · navigation · request · แท็บใหม่ · ดาวน์โหลด · ค่าเปลี่ยน ⇒ dead (ui state selected = ไม่ตรวจตาย)
// คาด       modal/toast → target เห็นใน 6 วิ · navigate → URL ตรง target (+ HTTP < 400) · ui → appears/disappears/changes/count/selected ·
//           download → ไฟล์มีขนาด · mutation → มีคำขอเขียน (non-GET) ไม่มี ≥ 400 ไม่มีข้อความผิดพลาดใหม่ + ผล: db = แถวของโมเดลที่ระบุถูก
//           เขียนหลังกด (อ่านด้วย prisma อย่างเดียว) · oracle = id ข้อสอบที่มีจริง (ไม่รันชุด) · target/resultTarget ที่เป็น testid ต้องขึ้น
// นับต่อแถว console error · hydration (418/423/425 · "Hydration") · ล้นแนวนอน (html/body/main) ต่อ URL — แบบ visual-pos
// ค่าตั้ง   settings.pos ของระบบ POS จำทั้งก้อนใน _qcP42Before → คืนตรงตัวหลังทุกแถวที่เขียน + finally + สัญญาณ (pos-buttons-fixtures)
// อัตรา     snapshot ออฟไลน์ 1 ใบ/เครื่อง/60 วิ (ไม่แตะกฎ): ธง offline เปิด ⇒ เว้น ≥ 61 วิระหว่างโหลดหน้าขายของเครื่องเดียวกัน
// ผลลัพธ์   .qc-shots/pos/buttons/summary-<user>-<device>[-en].json + JSON_SUMMARY {total ok dead wrongExpect hiddenLeak skip error perReason …} ·
//           ภาพเฉพาะแถวที่ไม่ ok: .qc-shots/pos/buttons/<page>/<testid>-<user>-<device>[-en].png
// กติกา R2 (ผู้คุม B 22 ต.ค. 21:05Z · โน้ต "## rules update" CD-P42-R1…R13): R1 input[type=hidden] = hidden-input · R2 กดเฉพาะ element ที่กดได้
//           (span/ชิปนิ่งของผู้ใช้ 1 สาขา = static) · R3 F13 ปิดใช้ = disabled-expected · R4 navigate ไม่สน query/hash เว้นเป้ามี query ·
//           R5 F17/F12 = needs-persona · R6 ขั้นทะเบียนกรอกก่อน PREFILL · PREFILL ไม่ทับ + ส่วนลด ≤ เพดานแคชเชียร์ · R7 แถวผลข้างเคียงช่วงท้าย + คืนค่า ·
//           R8 anyOf อ็อบเจกต์ · select ตัวเลือกเดียว + needs = needs · radio เลือกอยู่ = idle-expected · คลิปบอร์ด → ข้อความบนหน้า · R9 สลับภาษา/สาขา
//           ที่เป็นอยู่ = idle-expected · R10 search-noop · R11 ขั้น "?" ไม่บังคับ · R12 B6 = dead-known · R13 นโยบายเงิน (ด่าน B8)
// 🔴 ห้ามแก้ scripts/visual-pos.mts (หมุด ⚠️5) — ตัวช่วยที่ต้องใช้คัดลอกมาเป็นของไฟล์นี้ · fixture ทั้งหมดอยู่ใน pos-buttons-fixtures.mts
// 🔴 รอบจริง: QC5 เท่านั้น (host ep-fragrant-thunder) · ต้องอยู่ใต้ with-gate-lock (SHARK_GATE_LOCK_MARKER) · pre-flight มีข้อขวาง = ไม่เริ่ม ·
//    ไม่ต่อเครือข่ายนอกเซิร์ฟเวอร์ QC (globalThis.fetch ถูกครอบ) · session ที่ mint ลบเสมอ (finally + สัญญาณ) · โปรไฟล์ chromium ลบเสมอ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  BTN, DEAD_KNOWN, DEVICES, DISCOUNT_RE, PASS_MATRIX, PERSONA_UNREACHABLE, REGISTRY_GAP_REASONS, SHOTS_DIR, SKIP_REASONS, STAFF, QC_TENANT, SWITCH_RE,
  assertWritable, cellName, cellRows, classify, cleanupFixtures, countTenant, db, dbHost, dbNow, discountFill, ensureFixtures, estimateSec, expectAlts, f13Users,
  isClipboardRow, isSearchLike, loadP41Rules, localeOfSwitch, modelInfo, navMatches, newCtx, parseStep, planCell, preflight, readRegistry, resetSideEffects,
  moneyRowsSince, restoreSettingsIfChanged, rowKey, sha16, sideEffectOf, sideEffectRank, summaryFile, writesOf, writtenSince, type ExpectAlt,
  SELF_CLICK_FIRST, posSettingsChanged, posSettingsPaths,
  type Cell, type CellPlan, type Ctx, type DeviceKey, type Locale, type P41Rules, type PlanItem, type Registry, type Row, type SkipReason, type UserKey,
} from "./pos-buttons-fixtures.mjs";

const SUITE = "qc-pos-buttons";
const ROOT = process.cwd();
// ═════════════════════════ CLI ═════════════════════════
const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const argOf = (f: string): string | null => (has(f) ? (ARGV[ARGV.indexOf(f) + 1] ?? null) : null);
const LIST = has("--list");
const DRY = has("--dry");
const JSON_OUT = has("--json");
const USER = argOf("--user") as UserKey | null;
const DEVICE = argOf("--device") as DeviceKey | null;
const PAGE = argOf("--page") ?? "all";
const ONLY = argOf("--only");
const BASE_RAW = argOf("--base");
const LOCALE: Locale = (argOf("--locale") ?? (process.env.LOCALE === "en" ? "en" : "th")) === "en" ? "en" : "th";
function die(msg: string, code = 2): never {
  console.error(`❌ ${msg}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, fatal: msg })}`);
  process.exit(code);
}
if (USER && !["owner", "manager", "cashier", "public"].includes(USER)) die(`--user ${USER} ไม่รู้จัก — owner|manager|cashier|public`);
if (DEVICE && !(DEVICE in DEVICES)) die(`--device ${DEVICE} ไม่รู้จัก — desktop|ipad|mobile`);
if (ONLY && !/^[a-z0-9*-]+$/.test(ONLY)) die(`--only ${ONLY} ต้องเป็น testid หรือแพตเทิร์น * (a-z 0-9 - *)`);
if (PAGE !== "all" && !/^[A-Za-z0-9/[\]._*-]+$/.test(PAGE)) die(`--page ${PAGE} ไม่ถูกรูป`);
/** --page: "all" · ชื่อสั้นของหน้าพนักงาน ("register" · "products/price-rules") · path เต็มของทะเบียน ("/r/[token]") */
const pageWanted = (p: string) => PAGE === "all" || p === PAGE || p === `${STAFF}${PAGE}`;
const globRe0 = (g: string) => new RegExp(`^${g.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
const onlyRe = ONLY ? globRe0(ONLY) : null;
const rowFilter = (r: Row) => pageWanted(r.page) && (!onlyRe || onlyRe.test(r.testid) || (r.testid.includes("*") && globRe0(r.testid).test(ONLY!)));

// ═════════════════════════ ทะเบียน + กติกา (ไม่มี DB) ═════════════════════════
let REG: Registry;
let RULES: P41Rules;
let ORACLE_IDS: Set<string>;
try {
  REG = readRegistry(ROOT);
  RULES = loadP41Rules(ROOT);
  ORACLE_IDS = RULES.readDbCheckIds().ids;
} catch (e) {
  die(`อ่านทะเบียน/ยืมกติกา P4.1 ไม่ได้ — ตัวกดไม่วางแผน (fail-closed): ${e instanceof Error ? e.message : e}`);
}
const HEAD = (() => {
  try {
    return execFileSync("git", ["-C", ROOT, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "?";
  }
})();
const plans = (cells: Cell[]) => cells.map((c) => planCell(REG, c, RULES, ORACLE_IDS, rowFilter));
const fmtMin = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;

// ═════════════════════════ --list ═════════════════════════
if (LIST) {
  const cells = PASS_MATRIX.filter((c) => (!USER || c.user === USER) && (!DEVICE || c.device === DEVICE) && (!has("--locale") && !process.env.LOCALE ? true : c.locale === LOCALE));
  const ps = plans(cells);
  console.log(`${SUITE} --list · ทะเบียน ${REG.rows.length} แถว (hash ${REG.hash}) · head ${HEAD} · หน้า ${PAGE}${ONLY ? ` · only ${ONLY}` : ""} · ${cells.length} ช่อง`);
  for (const p of ps) console.log(`LIST ${cellName(p.cell).padEnd(20)} ${String(p.total).padStart(5)} · ${Object.entries(p.byAction).map(([k, v]) => `${k} ${v}`).join(" · ")}${Object.keys(p.perReason).length ? ` · skip: ${Object.entries(p.perReason).map(([k, v]) => `${k} ${v}`).join(" · ")}` : ""}`);
  if (ps.length === 1) for (const it of ps[0]!.items) console.log(`ITEM ${it.action.padEnd(7)} ${(it.reason ?? "-").padEnd(15)} ${it.safety ?? "-"} ${it.key}`);
  const total = ps.reduce((a, p) => a + p.total, 0);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total, passed: total, registryHash: REG.hash, head: HEAD, cells: Object.fromEntries(ps.map((p) => [cellName(p.cell), p.total])) })}`);
  process.exit(0);
}

// ═════════════════════════ --dry ═════════════════════════
if (DRY) {
  const cells = PASS_MATRIX.filter((c) => (!USER || c.user === USER) && (!DEVICE || c.device === DEVICE) && c.locale === LOCALE);
  const all = plans([...PASS_MATRIX]);
  const ps = plans(cells);
  console.log(`═══ ${SUITE} --dry (ไม่เปิดเบราว์เซอร์ · ไม่แตะ DB · ไม่ต่อเซิร์ฟเวอร์) ═══`);
  console.log(`ทะเบียน ${REG.rows.length} แถว (hash ${REG.hash}) · กติกา P4.1 ยืมจาก ${"scripts/qc-pos-p4.1.mts"} (sha ${RULES.sourceHash}) · oracle id ${ORACLE_IDS.size} · head ${HEAD}`);
  const r3 = RULES.r3(REG.json);
  const r9 = RULES.r9(REG.json);
  console.log(`ตรวจคีย์ตัวกด (R3 opener/needs/viewport · R9 hiddenFor ของ P4.1): ${r3.length + r9.length ? `❌ ${[...r3, ...r9].slice(0, 12).join(" · ")}` : "✅ ถูกรูป"} · opener ${REG.rows.filter((r) => r.opener).length} · needs ${REG.rows.filter((r) => r.needs).length} · viewport ${REG.rows.filter((r) => r.viewport).length} · safety ${REG.rows.filter((r) => r.safety).length}`);
  console.log(`\n── ตารางผ่าน (มติ 6 · รอบละ 1 ช่อง มติ 9 · ประมาณการ ${"6 วิ/กด · 3.5 วิ/ตรวจซ่อน · 3 วิ/ตรวจเห็น · +90 วิ/รอบ"}) ──`);
  let sum = 0;
  for (const p of all) {
    const s = estimateSec(p);
    sum += s;
    console.log(`  ${cellName(p.cell).padEnd(20)} แถว ${String(p.total).padStart(5)} · ${Object.entries(p.byAction).map(([k, v]) => `${k} ${v}`).join(" · ").padEnd(40)} ≈ ${fmtMin(s)} ชม.`);
  }
  const gapAll = all.reduce((a, pl) => a + REGISTRY_GAP_REASONS.reduce((b, r) => b + (pl.perReason[r] ?? 0), 0), 0);
  console.log(`  รวม ${all.length} ช่อง ≈ ${fmtMin(sum)} ชม. (ช่องโหว่ทะเบียน ${gapAll} รายการ · รอบละ 1 ช่อง — แถว needs ที่ fixture ไม่มีจะจบเร็วกว่าประมาณการ)`);
  for (const p of ps) {
    console.log(`\n── แผนช่อง ${cellName(p.cell)} · หน้า ${PAGE}${ONLY ? ` · only ${ONLY}` : ""}: ${p.total} แถว · ${Object.entries(p.byAction).map(([k, v]) => `${k} ${v}`).join(" · ")} ──`);
    const byReason = new Map<string, PlanItem[]>();
    for (const it of p.items) if (it.reason) byReason.set(it.reason, [...(byReason.get(it.reason) ?? []), it]);
    for (const [r, list] of byReason) console.log(`  ⏭️  ${String(list.length).padStart(4)} × ${r} — ${SKIP_REASONS[r as SkipReason]} · เช่น ${list.slice(0, 4).map((x) => x.row.testid).join(", ")}`);
    const money = p.items.filter((it) => it.action === "press" && it.moneyUnit);
    console.log(`  💰 money/counter ที่จะกด (สาขา ${BTN.unit.id} · ครั้งเดียวต่อรอบ): ${money.length}${money.length ? ` — ${money.slice(0, 8).map((x) => x.row.testid).join(", ")}` : ""}`);
    const ext = p.items.filter((it) => it.reason === "external");
    console.log(`  🛡️ external (ไม่กด · อ้าง oracle): ${ext.length}${ext.length ? ` — ${ext.slice(0, 6).map((x) => `${x.row.testid} (${x.detail})`).join(", ")}` : ""}`);
    // CD-P42-R1…R13 ในช่องนี้ (แผน + สิ่งที่ตัวกดจะตัดสินตอนรัน)
    const pr = p.items.filter((x) => x.action === "press");
    const opSteps = pr.flatMap((x) => x.opener.map(parseStep));
    console.log(`  🧩 กติกา P4.2 R2: dead-known ${p.perReason["dead-known"] ?? 0} (B6 ${Object.keys(DEAD_KNOWN).length} แถว) · needs-persona ${p.perReason["needs-persona"] ?? 0} (F17/F12 ${PERSONA_UNREACHABLE.reduce((a, g) => a + g.testids.length, 0)} testid) · hidden-input ${p.perReason["hidden-input"] ?? 0} · ` +
      `F13 ปิดใช้ได้ (${p.cell.user}) ${pr.filter((x) => f13Users(x.row).includes(p.cell.user)).length} · ผลข้างเคียงช่วงท้าย ${pr.filter((x) => sideEffectOf(x.row)).length}${pr.some((x) => x.row.testid === "pos-device-revoke-confirm") ? " (307 ท้ายสุด)" : ""} · ` +
      `ขั้นไม่บังคับ "?" ${opSteps.filter((x) => x.optional).length} · search-noop "= " ${opSteps.filter((x) => x.val === " ").length} · anyOf ${pr.filter((x) => expectAlts(x.row.expect).length > 1).length} · คลิปบอร์ด ${pr.filter((x) => isClipboardRow(x.row)).length} · ตัวสลับ ${pr.filter((x) => SWITCH_RE.test(x.row.testid)).length}`);
    const byPage = new Map<string, number>();
    for (const it of p.items) byPage.set(it.row.page.replace(STAFF, ""), (byPage.get(it.row.page.replace(STAFF, "")) ?? 0) + 1);
    console.log(`  หน้า: ${[...byPage.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    if (p.cell.user !== "public")
      console.log(`  fixture (รอบจริง · QC5): สาขา ${BTN.unit.id} (หา-หรือ-สร้าง · ผูก ${"POS INVENTORY ACCOUNT MEMBER POINT"}) · ผู้ใช้ ${p.cell.user === "owner" ? "เจ้าของร้าน QC" : BTN[p.cell.user as "manager" | "cashier"].userId} · เครื่อง ${BTN.device(p.cell.user)} · PIN สุ่ม (ไม่พิมพ์) · กะ float ฿${BTN.floatSatang / 100} (ปิดนับตรงยอดตอนจบ) · settings.pos → _qcP42Before`);
    else console.log("  fixture (รอบจริง · QC5): ไม่มี session · โทเคนหน้าสาธารณะอ่านจาก DB อย่างเดียว (ไม่มี = skip needs-fixture) · settings.pos → _qcP42Before");
    try {
      mkdirSync(SHOTS_DIR, { recursive: true });
      writeFileSync(`${SHOTS_DIR}/plan-dry-${cellName(p.cell)}.json`, JSON.stringify({ at: new Date().toISOString(), head: HEAD, registryHash: REG.hash, cell: p.cell, page: PAGE, only: ONLY, total: p.total, byAction: p.byAction, perReason: p.perReason, items: p.items.map((it) => ({ key: it.key, action: it.action, reason: it.reason ?? null, detail: it.detail ?? null, safety: it.safety, moneyUnit: it.moneyUnit, verify: it.verify })) }, null, 2));
    } catch {
      /* .qc-shots เขียนไม่ได้ — แผนยังพิมพ์ครบ */
    }
  }
  const total = ps.reduce((a, p) => a + p.total, 0);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "dry", total, passed: total, registryHash: REG.hash, head: HEAD, keyProblems: r3.length + r9.length, cells: Object.fromEntries(ps.map((p) => [cellName(p.cell), { total: p.total, byAction: p.byAction, perReason: p.perReason, estSec: estimateSec(p) }])), matrixEstSec: sum })}`);
  process.exit(r3.length + r9.length ? 1 : 0);
}

// ═════════════════════════ โหมดด่าน (ไม่มี --base): ตรวจแผนแบบสถิต — CD-P42-W2 ═════════════════════════
if (!BASE_RAW) {
  const mkClip = (testid: string): Row => ({ page: `${STAFF}tables`, testid, kind: "button", roles: ["owner"], expect: { type: "ui" } });
  const res: { id: string; ok: boolean; detail: string }[] = [];
  const chk = (id: string, ok: boolean, detail: string) => {
    res.push({ id, ok, detail });
    console.log(`  ${ok ? "✅" : "❌"} [${id}] ${detail.slice(0, 400)}`);
  };
  console.log(`${SUITE} — โหมดด่าน (ไม่มี --base: ไม่เปิดเบราว์เซอร์ · ไม่แตะ DB) · รอบจริง = CONTROLLER-RUN · ผลรอบจริงตัดสินโดย qc-pos-p4.2`);
  const all = plans([...PASS_MATRIX]);
  chk("B1", REG.rows.length > 0 && !!RULES.sourceHash, `ทะเบียน ${REG.rows.length} แถว (hash ${REG.hash}) · กติกา P4.1 ยืมครบ (sha ${RULES.sourceHash}) · oracle id ${ORACLE_IDS.size}`);
  {
    const p: string[] = [];
    for (const pl of all) {
      const want = cellRows(REG.rows, pl.cell, RULES).filter(rowFilter).map(rowKey);
      const got = pl.items.map((x) => x.key);
      if (want.length !== got.length || new Set(got).size !== got.length || want.some((k) => !got.includes(k))) p.push(`${cellName(pl.cell)} ${got.length}/${want.length}`);
    }
    chk("B2", p.length === 0, p.length ? `แผนไม่ครอบแถวของช่องครั้งเดียว: ${p.join(" · ")}` : `${all.length} ช่อง · ทุกแถวของช่องอยู่ในแผนครั้งเดียว (${all.reduce((a, x) => a + x.total, 0)} รายการ)`);
  }
  {
    const bad = all.flatMap((pl) => pl.items.filter((it) => it.action === "press" && (it.safety === "external" || (it.moneyUnit && !it.row.safety)))).map((it) => it.key);
    chk("B3", bad.length === 0, bad.length ? `แผนจะกดแถวภายนอก/แถวเงินที่ไม่มี safety: ${bad.slice(0, 6).join(", ")}` : "ไม่มีแผนกดแถว external · แถวที่ตัวจับเงินของ P4.1 พบแต่ไม่มี safety = skip(missing-safety)");
  }
  {
    const r = [...RULES.r3(REG.json), ...RULES.r9(REG.json)];
    chk("B4", r.length === 0, r.length ? `คีย์ตัวกดผิดรูป: ${r.slice(0, 6).join(" · ")}` : "opener/needs/viewport/hiddenFor ถูกรูป (R3/R9 ของ P4.1)");
  }
  {
    // ตัวพิสูจน์ fail-closed: แถวสังเคราะห์ต้องได้การกระทำที่ถูก
    const cell: Cell = { user: "cashier", device: "desktop", locale: "th" };
    const mk = (x: Partial<Row>): Row => ({ page: `${STAFF}register`, testid: "pos-p42-probe", kind: "button", roles: ["owner", "cashier"], hiddenFor: [], expect: { type: "ui", target: "pos-reg-lines", state: "changes" }, ...x });
    const cases: [string, Row, string][] = [
      ["เงินไม่มี safety", mk({ expect: { type: "mutation", target: "action:submitRegisterSaleAction", db: "PosSale PAID" } }), "skip:missing-safety"],
      ["external", mk({ safety: "external", expect: { type: "mutation", target: "action:sendReceiptAction", db: "PosSale x" } }), "skip:external"],
      ["money", mk({ safety: "money", expect: { type: "mutation", target: "action:submitRegisterSaleAction", db: "PosSale PAID" } }), "press:money"],
      ["hiddenFor", mk({ roles: ["owner"], hiddenFor: ["cashier"] }), "absent"],
      ["no claim", mk({ roles: ["owner"], hiddenFor: [] }), "skip:no-role-claim"],
      ["refused", mk({ kind: "notice", expect: { type: "ui", state: "refused" } }), "visible"],
    ];
    const bad: string[] = [];
    for (const [n, r, want] of cases) {
      const it = classify(r, 0, cell, RULES, ORACLE_IDS);
      const got = it.action === "skip" ? `skip:${it.reason}` : it.action === "press" && it.moneyUnit ? `press:${it.safety}` : it.action;
      if (got !== want) bad.push(`${n}: ${got} (คาด ${want})`);
    }
    chk("B5", bad.length === 0, bad.length ? bad.join(" · ") : `ตัวจำแนก fail-closed ถูก ${cases.length}/${cases.length} กรณี (เงินไม่มี safety · external · money · hiddenFor · no claim · refused)`);
  }
  {
    // ด่านฐานของ writer: QC4/ไม่ตั้ง = ปฏิเสธ · ร้านผิด = ปฏิเสธ (ไม่ต่อ DB จริง)
    const saved = { d: process.env.DATABASE_URL, dd: process.env.DIRECT_URL };
    const tries: [string, string, string, boolean][] = [
      ["QC4", "postgres://u:p@ep-frosty-lab-x.neon.tech/db", QC_TENANT, false],
      ["QC5", "postgres://u:p@ep-fragrant-thunder-x.neon.tech/db", QC_TENANT, true],
      ["ร้านอื่น", "postgres://u:p@ep-fragrant-thunder-x.neon.tech/db", "posqc-resto-tenant", false],
    ];
    const bad: string[] = [];
    for (const [n, url, tenant, want] of tries) {
      process.env.DATABASE_URL = url;
      process.env.DIRECT_URL = url;
      let ok = true;
      try {
        assertWritable({ tenantId: tenant });
      } catch {
        ok = false;
      }
      if (ok !== want) bad.push(`${n}: ${ok ? "ผ่าน" : "ปฏิเสธ"} (คาด ${want ? "ผ่าน" : "ปฏิเสธ"})`);
    }
    if (saved.d === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.d;
    if (saved.dd === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = saved.dd;
    chk("B6", bad.length === 0, bad.length ? bad.join(" · ") : "ด่าน writer: QC4 ปฏิเสธ · QC5 + ร้าน posqc-coffee-tenant ผ่าน · ร้านอื่นปฏิเสธ");
  }
  {
    const gaps = all.reduce((a, pl) => a + REGISTRY_GAP_REASONS.reduce((b, r) => b + (pl.perReason[r] ?? 0), 0), 0);
    chk("B7", true, `ข้อมูล (ไม่ตัดสิน): ช่องโหว่ทะเบียน ${gaps} รายการทุกช่อง (missing-target/db/safety · รอผู้สร้าง P4.1) — ข้อสอบ qc-pos-p4.2 W8 เป็นตัวตัดสิน`);
  }
  {
    // CD-P42-R13 นโยบายเงิน (brief P4 §4 ⚠️6) บนทะเบียนเต็ม: แถวภายนอก (safety หรือตัวจับ R12) ไม่ถูกวางกดในช่องใด · แถวเงิน/ตัวนับที่วางกด
    // ตรวจผลด้วย db/oracle · ไม่อยู่บนหน้าที่ query unit=* (ต้องลงสาขา posqc-btn) · ไม่มี opener ที่กดแถว external ก่อนถึงคอนโทรล
    const bad: string[] = [];
    const ext12 = REG.rows.filter((r) => RULES.isExternalRow(r)).length;
    const mon11 = REG.rows.filter((r) => RULES.isMoneyRow(r)).length;
    const extOwn = REG.rows.filter((r) => r.safety === "external").length;
    const safetyOf = new Map(REG.rows.map((r) => [rowKey(r), r.safety ?? ""]));
    let moneyPress = 0;
    const uiMoney = new Set<string>();
    for (const pl of all)
      for (const it of pl.items) {
        if (it.action === "press" && (it.safety === "external" || RULES.isExternalRow(it.row))) bad.push(`${cellName(pl.cell)} ${it.key} external วางกด`);
        if (it.action === "press" && it.moneyUnit) {
          moneyPress++;
          // แถว mutation ต้องมี db/oracle (ตัวจำแนก = missing-db ถ้าไม่มี) · แถวเงินที่ไม่ใช่ mutation (ไม่มีการเขียนให้ตรวจ — เช่น pos-taxinv-submit
          // หน้าขายที่แค่เก็บผู้ซื้อในตะกร้า) = ตรวจ ui + ด่านแถวเงินหลังกดว่าลงสาขา posqc-btn (บันทึก · ไม่ตก) — CD-P42-R13
          if (it.row.expect.type === "mutation" && it.verify !== "db" && it.verify !== "oracle") bad.push(`${cellName(pl.cell)} ${it.key} ${it.safety} ไม่มี db/oracle (verify ${it.verify})`);
          else if (it.verify !== "db" && it.verify !== "oracle") uiMoney.add(it.key);
          if (/(^|&)unit=\*/.test(String(it.row.query ?? ""))) bad.push(`${cellName(pl.cell)} ${it.key} ${it.safety} บนหน้า unit=*`);
        }
        if (it.action === "press")
          for (const st of it.opener) {
            const t = parseStep(st).tid;
            const hit = REG.rows.find((r) => r.page === it.row.page && r.testid !== it.row.testid && (r.testid === t || (t.includes("*") && RULES.globRe(t).test(r.testid))) && safetyOf.get(rowKey(r)) === "external");
            if (hit) bad.push(`${cellName(pl.cell)} ${it.key} opener ${st} = แถว external ${hit.testid}`);
          }
      }
    chk("B8", bad.length === 0, bad.length ? `นโยบายเงินไม่ครบ: ${[...new Set(bad)].slice(0, 6).join(" · ")}` : `ตัวจับ R12 ${ext12} แถว + safety external ${extOwn} แถว ไม่ถูกวางกดใน ${all.length} ช่อง (skip:external ก่อน reveal) · ตัวจับ R11 ${mon11} แถว · แถวเงิน/ตัวนับที่วางกด ${moneyPress} รายการทุกช่อง ตรวจด้วย db/oracle (แถว mutation) · ไม่ใช่ mutation ${uiMoney.size} แถว = ui + ด่านสาขาหลังกด (${[...uiMoney].map((k) => k.replace(STAFF, "")).join(", ") || "-"}) · สาขา posqc-btn (ไม่มี unit=*) · ไม่มี opener ผ่านแถว external (CD-P42-R13)`);
  }
  {
    // CD-P42-R1/R3/R5/R7/R12 ตัวจำแนกของกติกาใหม่ (แถวสังเคราะห์)
    const bad: string[] = [];
    const mk = (x: Partial<Row>): Row => ({ page: `${STAFF}register`, testid: "pos-p42-probe", kind: "button", roles: ["owner", "manager", "cashier"], hiddenFor: [], expect: { type: "ui", target: "pos-reg-lines", state: "changes" }, ...x });
    const got = (r: Row, user: UserKey) => {
      const it = classify(r, 0, { user, device: "desktop", locale: "th" }, RULES, ORACLE_IDS);
      return it.action === "skip" ? `skip:${it.reason}` : it.action;
    };
    const cases: [string, Row, UserKey, string][] = [
      ["B6 dead-known", mk({ testid: "pos-pay-button" }), "owner", "skip:dead-known"],
      ["F17 owner", mk({ testid: "pos-discount-over-request", needs: "ผู้ขายที่มีเพดานส่วนลด" }), "owner", "skip:needs-persona"],
      ["F17 cashier ยังกด", mk({ testid: "pos-discount-over-cancel", needs: "ผู้ขายที่มีเพดานส่วนลด" }), "cashier", "press"],
      ["F12 cashier", mk({ page: `${STAFF}stock`, testid: "pos-stock-count-refusal", kind: "notice", roles: ["cashier"], hiddenFor: ["owner", "manager"], needs: "บทบาท QC ไม่มีชุดนี้", expect: { type: "ui", state: "refused" } }), "cashier", "skip:needs-persona"],
      ["F12 ไม่มี needs", mk({ page: `${STAFF}stock`, testid: "pos-stock-count-refusal", kind: "notice", roles: ["cashier"], hiddenFor: ["owner", "manager"], expect: { type: "ui", state: "refused" } }), "cashier", "visible"],
      ["B2 hidden", mk({ kind: "input", needs: "ช่องซ่อน type=hidden — ตัวกดไม่กด" }), "owner", "skip:hidden-input"],
    ];
    for (const [n, r, u, want] of cases) if (got(r, u) !== want) bad.push(`${n}: ${got(r, u)} (คาด ${want})`);
    const f13 = f13Users({ roles: ["owner", "manager", "cashier"], needs: "สิทธิ์ pos.channel.manage — แคชเชียร์ QC เห็นแต่ปิดใช้ (disabled · CD-P41-F13)", expect: { type: "mutation" } });
    if (f13.join(",") !== "cashier") bad.push(`F13 บทบาท = ${f13.join(",")} (คาด cashier)`);
    if (f13Users({ roles: ["owner"], needs: "ไม่มีรหัส", expect: { type: "mutation" } }).length) bad.push("F13 ไม่มีรหัสแต่ได้บทบาท");
    const f13b = f13Users({ roles: ["owner", "manager", "cashier"], needs: "ผู้จัดการ 1 สาขาเห็นแต่ปิดใช้ — ผู้จัดการและแคชเชียร์ QC เห็นแต่ปิดใช้ (disabled · CD-P41-F13)", expect: { type: "mutation" } });
    if (f13b.join(",") !== "cashier") bad.push(`F13 ข้อความเอ่ยสองบทบาท = ${f13b.join(",")} (คาด cashier — คำที่ใกล้ที่สุด)`);
    const se = REG.rows.find((r) => r.testid === "pos-device-revoke-confirm");
    if (se && (!sideEffectOf(se) || sideEffectRank(se) !== 9)) bad.push("307 ไม่อยู่ท้ายสุดของช่วงผลข้างเคียง");
    const late = REG.rows.filter((r) => sideEffectOf(r)).length;
    chk("B9", bad.length === 0, bad.length ? bad.join(" · ") : `กติกาใหม่ ${cases.length + 3}/${cases.length + 3} กรณี (dead-known · needs-persona F17/F12 · hidden-input · F13 เฉพาะบทบาทที่ระบุ) · แถวผลข้างเคียงช่วงท้าย ${late} แถว (307 ท้ายสุด)`);
  }
  {
    // CD-P42-R4/R6/R8/R9/R10/R11 ตัวช่วยบริสุทธิ์
    const bad: string[] = [];
    const t = (n: string, ok: boolean) => {
      if (!ok) bad.push(n);
    };
    const H = "http://127.0.0.1:3299";
    t("F16 query ของ URL ไม่สน", navMatches("/app/sys/[id]/pos/register", `${H}/app/sys/s1/pos/register?unit=u1#x`));
    t("F16 เป้ามี query ตรง", navMatches("/app/sys/[id]/pos/settings?tab=devices", `${H}/app/sys/s1/pos/settings?unit=u1&tab=devices`));
    t("F16 เป้ามี query ไม่ตรง", !navMatches("/app/sys/[id]/pos/settings?tab=devices", `${H}/app/sys/s1/pos/settings?tab=general`));
    t("F16 ค่า [x]", navMatches("/app/sys/[kanbanId]/kanban/b/[boardId]?card=[cardId]", `${H}/app/sys/k/kanban/b/b1?card=c9`) && !navMatches("/app/sys/[kanbanId]/kanban/b/[boardId]?card=[cardId]", `${H}/app/sys/k/kanban/b/b1`));
    t("F16 ค่าว่าง", navMatches("/app/sys/[id]/pos/register?unit=", `${H}/app/sys/s/pos/register?unit=u2`));
    t("F16 path ต่าง", !navMatches("/app/sys/[id]/pos/register", `${H}/app/sys/s/pos/sales`));
    t("F16 เป้ามี #hash", navMatches("/app/sys/[id]/pos/settings#devices", `${H}/app/sys/s/pos/settings?unit=u#devices`) && !navMatches("/app/sys/[id]/pos/settings#devices", `${H}/app/sys/s/pos/settings#general`));
    const a = parseStep("pos-prod-scope-pick?");
    const b = parseStep("pos-x-amount=5?");
    const c = parseStep("pos-kds-86-search= ");
    {
      // ORACLE-EDIT CD-P42-R11 ของ qc-pos-p4.1 R3 (ตัวจริงที่ยืมมา): "<แถวจริง>?" ผ่าน · "<ไม่มีจริง>?" ยังแดง (probe ลบ)
      const rowOf = (testid: string, opener?: string[]) => ({ page: `${STAFF}tables`, testid, kind: "button", roles: ["owner", "manager", "cashier"], hiddenFor: [], expect: { type: "ui", target: "pos-tbl-grid", state: "changes" }, ...(opener ? { opener } : {}) });
      const inv = (op: string) => ({ ...REG.json, rows: [rowOf("pos-p42-a"), rowOf("pos-p42-b", [op])] });
      t("F29 R3 ของ P4.1", RULES.r3(inv("pos-p42-a?")).length === 0 && RULES.r3(inv("pos-p42-zz?")).length > 0 && RULES.r3(inv("pos-p42-a=5?")).length === 0);
    }
    t("F29 ขั้นไม่บังคับ", a.optional && a.tid === "pos-prod-scope-pick" && a.val === null && b.optional && b.tid === "pos-x-amount" && b.val === "5" && !c.optional && c.val === " ");
    t("F18 เพดานส่วนลด", discountFill("pos-reg-line-discount-1", 1000) === "1" && discountFill("pos-reg-bill-discount-percent", 1000) === "5" && discountFill("pos-reg-line-discount-1", 0) === "0" && Number(discountFill("pos-x-discount-pct", 1000)) * 100 <= 1000);
    t("F28 ช่องค้นหา", isSearchLike("pos-kds-86-search") && isSearchLike("pos-x", "search") && !isSearchLike("pos-reg-deprcv-amount"));
    const al = expectAlts({ type: "modal", target: "pos-a", anyOf: [{ type: "toast", target: "pos-b" }, "pos-c"] });
    t("F26 anyOf อ็อบเจกต์+สตริง", al.length === 3 && al[1]!.type === "toast" && al[1]!.target === "pos-b" && al[2]!.type === "modal" && al[2]!.target === "pos-c");
    t("F27 ตัวสลับ", localeOfSwitch("pos-locale-switch-th") === "th" && localeOfSwitch("pos-rpub-lang-en") === "en" && SWITCH_RE.test("pos-reg-unit-option-*") && !SWITCH_RE.test("pos-reg-pay"));
    t("F26 คลิปบอร์ด", isClipboardRow(mkClip("pos-tbl-qr-copy")) && !isClipboardRow(mkClip("pos-reg-pay")));
    // POS P4.3 walker fix1 ▸ H16 เส้นทาง settings.pos ของแถว AppSystem · R3/R4 ตาราง SELF_CLICK_FIRST ชี้แถวที่มีจริง · H8/H11 แถวผลข้างเคียงช่วงท้าย ◂
    t("H16 settings.pos", posSettingsPaths("AppSystem(POS).settings.pos.{register.autoLockMinutes, heldCart.expireDays, receiptLocale}").join(",") === "register.autoLockMinutes,heldCart.expireDays,receiptLocale" &&
      posSettingsPaths("AppSystem(POS).settings.pos.payment.promptpayIdByUnit.<unitId>").join(",") === `payment.promptpayIdByUnit.${BTN.unit.id}` &&
      posSettingsPaths("AppSystem(POS).settings.pos.receipt (jsonb_set · header/footer)").join(",") === "receipt" && posSettingsPaths("PosSale PAID").length === 0 &&
      writesOf("KanbanBoard + AppSystem(POS).settings.pos.board.defaultBoardId", new Set(["KanbanBoard", "AppSystem"])).map((w) => `${w.model}:${(w.pos ?? []).join("|")}`).join(",") === "KanbanBoard:,AppSystem:board.defaultBoardId");
    t("R3/R4 SELF_CLICK_FIRST", Object.keys(SELF_CLICK_FIRST).length === 2 && Object.keys(SELF_CLICK_FIRST).every((k) => REG.rows.some((r) => rowKey(r) === k)));
    t("H8/H11 ช่วงท้าย", ["shifts#pos-shift-close-submit", "kds#pos-kds-pause"].every((k) => {
      const r = REG.rows.find((x) => rowKey(x) === `${STAFF}${k}`);
      return !!r && !!sideEffectOf(r);
    }));
    chk("B10", bad.length === 0, bad.length ? `ตัวช่วยไม่ผ่าน: ${bad.join(" · ")}` : "navMatches F16 (7) · parseStep F29 + R3 ของ P4.1 (ขั้น ? ของแถวจริงผ่าน · ของไม่มีจริงแดง) · เพดานส่วนลด F18 · search-noop F28 · anyOf/คลิปบอร์ด F26 · ตัวสลับ F27 · P4.3 H16 settings.pos · R3/R4 SELF_CLICK_FIRST · H8/H11 ช่วงท้าย — ผ่านทุกกรณี");
  }
  const passed = res.filter((r) => r.ok).length;
  console.log(`\n${passed === res.length ? "✅" : "❌"} ${SUITE} (ด่าน): ${passed}/${res.length}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "gate", total: res.length, passed, failed: res.filter((r) => !r.ok).map((r) => r.id), registryHash: REG.hash })}`);
  process.exit(passed === res.length ? 0 : 1);
}

// ═════════════════════════ รอบจริง (CONTROLLER-RUN · QC5) ═════════════════════════
if (!USER || !DEVICE) die("รอบจริงต้องระบุ --user และ --device (รอบละ 1 ช่อง · มติ 9)");
const CELL: Cell = { user: USER!, device: DEVICE!, locale: LOCALE };
if (!PASS_MATRIX.some((c) => c.user === CELL.user && c.device === CELL.device && c.locale === CELL.locale)) die(`ช่อง ${cellName(CELL)} ไม่อยู่ในตารางผ่าน (public ไม่มี ipad · มติ 6)`);
let BASE = "";
try {
  const u = new URL(BASE_RAW!);
  if (u.port === "3215") die(`${BASE_RAW} คือพอร์ตของ CRM (:3215) — LANE-RULES ข้อ 4`);
  BASE = u.origin;
} catch {
  die(`--base ${BASE_RAW} ไม่ใช่ URL`);
}
if (process.env.SHARK_GATE_LOCK_MARKER !== "1") die("รอบจริงต้องอยู่ใต้ scripts/with-gate-lock.sh (ไม่พบ SHARK_GATE_LOCK_MARKER) — ห้ามรันคู่รอบอื่น (มติ 9)");
if (process.env.CI) die("รอบจริงห้ามตั้ง CI (with-gate-lock ข้าม flock เมื่อมี CI — memory reference)");
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ผู้คุมต้อง build + serve บนทรี d ก่อน`);
}
// 🔴 ไม่มีเครือข่ายนอกเซิร์ฟเวอร์ QC จากโปรเซสนี้ (LINE/Beam/e-Tax ไม่ถูกเรียกแน่นอน) — prisma ไม่ใช้ fetch
{
  const real = globalThis.fetch;
  globalThis.fetch = ((input: Any, init?: Any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    if (!url.startsWith(BASE)) return Promise.reject(new Error(`ตัวกดห้ามต่อ ${url.slice(0, 80)} (นอกเซิร์ฟเวอร์ QC)`));
    return real(input, init);
  }) as typeof fetch;
}
const { loadPosQcEnv, PQC } = (await import("./pos-qc-env.mjs" as string)) as Any;
loadPosQcEnv(SUITE);
const T = PQC.coffee;
try {
  assertWritable(T); // QC5 เท่านั้น · ร้าน QC ตรงค่าคงที่
} catch (e) {
  die(e instanceof Error ? e.message : String(e), 4);
}
const P = await db();
const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PLAN: CellPlan = planCell(REG, CELL, RULES, ORACLE_IDS, rowFilter);
const CTX: Ctx = newCtx(T, CELL.user);
const PROFILE = [`/tmp/chr-pos-btn-${process.pid}`, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-pos-btn-${process.pid}`];
const SESSIONS: string[] = [];
let BROWSER: Any = null;
const RUN_START = new Date();
const START_MS = Date.now();

type Result = { key: string; page: string; testid: string; class: "ok" | "dead" | "wrongExpect" | "hiddenLeak" | "skip" | "error"; reason?: string; detail?: string; shot?: string; safety?: string | null; unit?: string; oracle?: string; verify?: string; ms?: number };
const RESULTS = new Map<string, Result>();
const CONSOLE: { key: string; detail: string }[] = [];
const HYDRATION: { key: string; detail: string }[] = [];
const OVERFLOW: { key: string; detail: string }[] = [];
const HTTP: { key: string; detail: string }[] = [];
const MONEY: { key: string; testid: string; units: string[]; models: string[] }[] = [];
const PAGES: { path: string; status: number; rows: number; ms: number }[] = [];
const PRESSED_ONCE = new Set<string>();
let FATAL = "";

/** PREFILL: แถว press ทั้งหมดของหน้าเดียวกันในแผน (ไม่ขึ้นกับกลุ่ม — กลุ่มช่วงท้ายของ CD-P42-R7 มีแค่แถวผลข้างเคียง) */
const PAGE_PRESS = new Map<string, PlanItem[]>();
for (const it of PLAN.items) if (it.action === "press") PAGE_PRESS.set(it.row.page, [...(PAGE_PRESS.get(it.row.page) ?? []), it]);
const siblingsOf = (it: PlanItem) => PAGE_PRESS.get(it.row.page) ?? [];
const rec = (it: PlanItem, r: Omit<Result, "key" | "page" | "testid">) => RESULTS.set(it.key, { key: it.key, page: it.row.page, testid: it.row.testid, safety: it.safety, verify: it.verify, oracle: it.row.oracle || undefined, ...r });
// แถว skip ของแผน (ไม่ต้องเปิดหน้า) ลงผลก่อน
for (const it of PLAN.items) if (it.action === "skip") rec(it, { class: "skip", reason: it.reason, detail: it.detail });

// ═════════════════════════ ตัวช่วยหน้าเว็บ (พอร์ตจาก qc-crm-buttons.mts · ของไฟล์นี้เอง) ═════════════════════════
const NAME_SHIM = "globalThis.__name = globalThis.__name || function (f) { return f; };";
function selOf(testid: string): string {
  if (!testid.includes("*")) return `[data-testid="${testid}"]`;
  const prefix = testid.slice(0, testid.indexOf("*"));
  const suffix = testid.slice(testid.lastIndexOf("*") + 1);
  return [prefix ? `[data-testid^="${prefix}"]` : "", suffix ? `[data-testid$="${suffix}"]` : ""].join("") || "[data-testid]";
}
const looksLikeTestid = (s: string) => /^[a-z][a-z0-9*-]*$/.test(s) && s.includes("-");
/** ตัวแรกที่มองเห็น (คู่ desktop/mobile ใช้ testid เดียว) · แพตเทิร์น = ตัวแรกที่กดได้จริง ไม่อยู่ใน notList · waitMs > 0 = รอถี่ 200 ms ·
 *  onlyTags (POS P4.3 walker fix1 ▸ H12) = รับเฉพาะ tagName เหล่านี้ (แถวช่องกรอกแบบแพตเทิร์น — กัน span ราคาในรายการชนแพตเทิร์นของช่องกรอก) ◂ */
async function findVisible(page: Any, testid: string, notList: string[] = [], waitMs = 0, onlyTags: string[] | null = null): Promise<Any | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const h = await page
      .evaluateHandle((pSel: string, nots: string[], pattern: boolean, glob: string, tags: string[] | null) => {
        const re = (g: string) => new RegExp(`^${g.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
        const vis = (el: Element) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          const cs = getComputedStyle(el as HTMLElement);
          return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
        };
        let fallback: Element | null = null;
        for (const el of Array.from(document.querySelectorAll(pSel))) {
          const t = el.getAttribute("data-testid") ?? "";
          if (pattern && !re(glob).test(t)) continue;
          if (nots.some((n) => (n.includes("*") ? re(n).test(t) : n === t))) continue;
          if (tags && !tags.includes(el.tagName)) continue;
          if (!vis(el)) continue;
          if (!pattern) return el;
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role") ?? "";
          const idle = (el as HTMLButtonElement).disabled === true || ["aria-pressed", "aria-selected"].some((a) => el.getAttribute(a) === "true");
          if ((["button", "input", "select", "textarea", "summary"].includes(tag) || (tag === "a" && el.hasAttribute("href")) || ["button", "link", "menuitem", "tab", "switch", "checkbox", "option", "radio"].includes(role)) && !idle) return el;
          fallback ??= el;
        }
        return fallback;
      }, selOf(testid), notList, testid.includes("*"), testid, onlyTags)
      .catch(() => null);
    const el = h?.asElement?.() ?? null;
    if (el) return el;
    await h?.dispose?.().catch(() => {});
    if (Date.now() >= deadline) return null;
    await sleep(200);
  }
}
async function settle(page: Any, maxMs = 4000): Promise<void> {
  await page.waitForNetworkIdle({ idleTime: 350, timeout: maxMs }).catch(() => {});
}
async function clickEl(page: Any, el: Any): Promise<void> {
  // POS P4.3 walker fix1 ▸ H13: คอนเทนเนอร์ที่ไม่กดได้เอง (ไม่มีตัวจับคลิกของตัวเอง) แต่มีลิงก์/ปุ่มข้างใน (pressInfo "มีคอนโทรลข้างใน" — เช่นแถบแท็บ
  //   module-tabs.tsx:16 ที่กลางแถบว่างเมื่อแท็บน้อย) → กดลิงก์ที่ไม่ใช่หน้าปัจจุบัน/ปุ่มที่เปิดใช้ตัวแรกข้างในแทนกลางกล่อง ◂
  const inner = await el
    .evaluateHandle((e: Any) => {
      const PRESS = "button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=switch], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option]";
      if (e.tagName === "FORM" || e.matches(PRESS) || e.closest(PRESS) || (e.tagName === "LABEL" && (e.control || e.querySelector("input,select,textarea")))) return null;
      const k = Object.keys(e).find((n) => n.startsWith("__reactProps$"));
      const pr = k ? e[k] : null;
      if (pr && ["onClick", "onMouseDown", "onPointerDown", "onPointerUp", "onTouchStart", "onKeyDown"].some((h) => typeof pr[h] === "function")) return null;
      if (!e.querySelector(PRESS)) return null;
      return e.querySelector('a[href]:not([aria-current="page"]), button:not([disabled])');
    })
    .catch(() => null);
  const innerEl = inner?.asElement?.() ?? null;
  if (innerEl) el = innerEl;
  else await inner?.dispose?.().catch(() => {});
  await el.evaluate((e: HTMLElement) => {
    const a = e.closest("a");
    if (a && /^(tel|mailto|sms|line):/i.test(a.getAttribute("href") ?? "")) a.addEventListener("click", (ev) => ev.preventDefault(), { once: true });
  }).catch(() => {});
  const covered: boolean = await el
    .evaluate((e: HTMLElement) => {
      e.scrollIntoView({ block: "center", inline: "center" });
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && hit !== e && !e.contains(hit) && !(hit as HTMLElement).contains?.(e);
    })
    .catch(() => false);
  if (covered) {
    await el.evaluate((e: HTMLElement) => e.click());
    return;
  }
  try {
    await el.click({ delay: 20 });
  } catch {
    await el.evaluate((e: HTMLElement) => e.click());
  }
}
const RAND = Math.random().toString(36).slice(2, 7).replace(/[^a-z0-9]/g, "q");
let fillSeq = 0;
const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
/** ค่า fixture ตามชื่อ testid + ชนิดช่อง (เงิน = บาทจำนวนเต็มเล็ก · ข้อความ = qc-btn-<สุ่ม> ไม่ซ้ำ) */
function fillValueFor(testid: string, type: string): string {
  const t = testid.toLowerCase();
  if (t === "pos-stock-scan") return "PQC-CF-LATTE"; // POS P4.3 walker fix1 ▸ H7: SKU จริงของ seed (pos-qc-env.mts:279) — บันทึกเฉพาะ Enter (StockCount.tsx:510-513) ◂
  const u = `${RAND}${(++fillSeq).toString(36)}`;
  if (type === "email" || /email/.test(t)) return `qc-btn-${u}@example.com`;
  if (type === "tel" || /phone|tel$/.test(t)) return `08${String(randomDigits(8))}`;
  if (/taxid|tax-id/.test(t)) return "0105559012342";
  if (/branch/.test(t)) return "00000";
  if (/pin/.test(t)) return CTX.pin || "135790";
  if (/barcode|ean/.test(t)) return "8850999000015";
  // CD-P42-R6: ส่วนลดที่ตัวกดพิมพ์เอง ไม่เกินเพดานแคชเชียร์ (register-shared.ts · ก่อนกฎ pct/qty — "discount" มีคำว่า count)
  if (DISCOUNT_RE.test(t)) return discountFill(t, CTX.staffDiscountCapBp);
  if (type === "url" || /url$|website/.test(t)) return `https://qc-btn-${u}.example.com`;
  if (type === "time") return "09:00";
  if (type === "date" || /date|from$|to$/.test(t)) return todayBkk();
  if (type === "datetime-local") return `${todayBkk()}T10:00`;
  if (type === "month") return todayBkk().slice(0, 7);
  if (type === "color") return "#123456";
  if (/(pct|percent|rate|bp)$/.test(t)) return "10";
  if (/(qty|count|seats|party|minutes|hours|days|limit|max|min)/.test(t) || type === "number" || type === "range") return "2";
  // POS P4.3 walker fix1 ▸ H5: ช่องค้นหาก่อนคำเงิน ("pos-price-rule-product-search" มีคำว่า price → เดิมได้ "20" แล้วรายการว่าง PriceRulesClient.tsx:304-307) ◂
  if (/(search|query|-q$|find)/.test(t)) return "ลาเต้";
  if (/(price|amount|satang|float|cash|tender|deposit|credit|value|total|baht)/.test(t)) return "20";
  if (/(reason|note|memo|comment)/.test(t)) return `qc-btn-${u} เหตุผลทดสอบ`;
  return `qc-btn-${u}`;
}
function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String(Math.floor(Math.random() * 10));
  return s;
}
function differ(v: string, cur: string): string {
  if (v !== cur) return v;
  if (/^-?\d+(\.\d+)?$/.test(v)) return String(Number(v) + 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace(/\d{2}$/, (d) => String(Math.min(28, Number(d) + 1)).padStart(2, "0"));
  return `${v}2`;
}
/** POS P4.3 walker fix1 ▸ H7: ช่องที่ส่งด้วย Enter (ไม่ใช่ Tab) ◂ */
const ENTER_SUBMIT = new Set(["pos-stock-scan"]);
/** ใส่ค่าแบบผู้ใช้ — คืนค่าก่อน/หลังเพื่อตัดสิน "ตาย" ด้วยตัวค่าเอง · ช่องไฟล์ = skipped */
async function fillEl(page: Any, el: Any, testid: string): Promise<{ before: string; after: string; skipped?: string }> {
  const meta: { tag: string; type: string; value: string; ro: boolean; im: string } = await el.evaluate((e: Any) => ({ tag: e.tagName.toLowerCase(), type: (e.getAttribute("type") ?? "").toLowerCase(), value: String(e.value ?? ""), ro: !!e.readOnly && !e.disabled, im: (e.getAttribute("inputmode") ?? "").toLowerCase() }));
  if (meta.ro && meta.tag !== "select" && meta.value.trim()) return { before: "ro", after: `ro:${meta.value.slice(0, 30)}` };
  const snap = async () => el.evaluate((e: Any) => `${e.value ?? ""}|${e.checked ?? ""}|${e.getAttribute("aria-checked") ?? e.getAttribute("aria-pressed") ?? ""}|${e.getAttribute("data-state") ?? ""}`).catch(() => "detached");
  const before = await snap();
  if (meta.tag === "select") {
    let opts: { value: string; selected: boolean; disabled: boolean }[] = [];
    for (let i = 0; i < 20; i++) {
      opts = await el.evaluate((s: HTMLSelectElement) => Array.from(s.options).map((o) => ({ value: o.value, selected: o.selected, disabled: o.disabled })));
      if (opts.some((o) => !o.selected && !o.disabled && o.value !== "")) break;
      await sleep(200);
    }
    const cand = opts.find((o) => !o.selected && !o.disabled && o.value !== "") ?? opts.find((o) => !o.selected && !o.disabled);
    // CD-P42-R8 (CD-P41-F26): select ที่เปิดใช้แต่มีตัวเลือกเดียว — ไม่มีอะไรให้เปลี่ยน (แถวมี needs = skippedNeeds ไม่ใช่ dead)
    if (!cand) return { before, after: before, skipped: "one-option" };
    await el.select(cand.value);
  } else if (meta.tag === "input" && meta.type === "file") return { before, after: before, skipped: "file" };
  else if (meta.tag === "input" && ["checkbox", "radio"].includes(meta.type)) await clickEl(page, el);
  else if (meta.tag === "input" && ["date", "time", "datetime-local", "month", "color", "range", "number"].includes(meta.type)) {
    const v = differ(fillValueFor(testid, meta.type), meta.value);
    await el.evaluate((e: HTMLInputElement, val: string) => {
      let x = val;
      if ((e.type === "number" || e.type === "range") && x !== "") {
        let n = Number(x);
        const lo = e.min !== "" ? Number(e.min) : -Infinity;
        const hi = e.max !== "" ? Number(e.max) : Infinity;
        n = Math.min(Math.max(n, lo), hi);
        if (String(n) === String(e.value)) n = n > lo ? n - 1 : n + 1;
        x = String(n);
      }
      e.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, x);
      e.dispatchEvent(new Event("input", { bubbles: true }));
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }, v);
    await el.evaluate((e: HTMLElement) => e.blur()).catch(() => {});
  } else if (meta.tag === "input" || meta.tag === "textarea") {
    await el.click({ clickCount: 3 }).catch(async () => {
      await el.evaluate((e: HTMLElement) => e.focus());
    });
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    const eff = meta.type || (/^(decimal|numeric)$/.test(meta.im) ? "number" : "");
    // POS P4.3 walker fix1 ▸ H1: พิมพ์ช้ากว่าเครื่องสแกน — ช่วงห่าง ≤ SCAN_MAX_GAP_MS 30 (scan-shared.ts:8) + Tab = สแกน ⇒ หน้าขายคืนค่าช่อง + toast
    //   "ยังไม่รับการสแกน" (RegisterScreen.tsx:2577-2629) · H7: ช่องสแกนสต็อกบันทึกด้วย Enter เท่านั้น ◂
    await page.keyboard.type(differ(fillValueFor(testid, eff), meta.value), { delay: 45 });
    await sleep(60);
    await page.keyboard.press(ENTER_SUBMIT.has(testid) ? "Enter" : "Tab");
  } else await clickEl(page, el); // สวิตช์ที่เป็นปุ่ม
  await sleep(150);
  return { before, after: await snap() };
}
// navMatches = pos-buttons-fixtures.mts (CD-P42-R4: query/hash ของ URL ไม่สน เว้นแต่เป้ามี query · ด่าน B10 ทดสอบ)
const urlKey = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.pathname}${x.search}`;
  } catch {
    return u;
  }
};
const ALERT_IGNORE: string[] = [];
// POS P4.3 walker fix1 ▸ H9: คำเตือนคีย์ครั้งเดียว role="alert" ในแผงคีย์ดิบ (ApiKeysCard.tsx:281-284) = สำเร็จ ไม่ใช่คำปฏิเสธ — alertsNow ข้ามทุกอย่างใน pos-settings-api-raw ◂
async function alertsNow(page: Any): Promise<string[]> {
  return page
    .evaluate((ign: string[]) => Array.from(document.querySelectorAll('[role="alert"],[data-testid$="-error"]:not([role="status"])')).filter((e) => (e as HTMLElement).offsetParent !== null && (e.textContent ?? "").trim() && !ign.includes(e.getAttribute("data-testid") ?? "") && !e.closest('[data-testid="pos-settings-api-raw"]')).map((e) => `${e.getAttribute("data-testid") ?? "alert"}: ${(e.textContent ?? "").trim().slice(0, 140)}`), ALERT_IGNORE)
    .catch(() => []);
}
async function pageSays(page: Any): Promise<string> {
  return page
    .evaluate(() => Array.from(document.querySelectorAll('[role="alert"],[data-testid$="-error"],[aria-invalid="true"]')).filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => `${e.getAttribute("data-testid") ?? e.tagName.toLowerCase()}: ${((e.textContent ?? "").trim() || "aria-invalid").slice(0, 100)}`).slice(0, 3).join(" | "))
    .catch(() => "");
}
async function uiSnapshot(page: Any, testid: string): Promise<string | null> {
  const el = (await findVisible(page, testid, [], 0)) ?? (await page.$(selOf(testid)).catch(() => null));
  if (!el) return null;
  return el.evaluate((e: Any) => e.outerHTML + "|" + [e, ...Array.from(e.querySelectorAll("input,select,textarea"))].map((x: Any) => `${x.value ?? ""}:${x.checked ?? ""}`).join(",")).catch(() => null);
}
async function countVisible(page: Any, testid: string): Promise<number> {
  return page.evaluate((sel: string) => Array.from(document.querySelectorAll(sel)).filter((e) => (e as HTMLElement).getClientRects().length > 0).length, selOf(testid)).catch(() => -1);
}
/** CD-P42-R1: testid นี้เป็น input[type=hidden] (มองไม่เห็นเสมอ) */
async function hiddenInput(page: Any, testid: string): Promise<boolean> {
  return page.evaluate((sel: string) => {
    const all = Array.from(document.querySelectorAll(sel));
    return all.length > 0 && all.every((e) => e.tagName === "INPUT" && (e.getAttribute("type") ?? "").toLowerCase() === "hidden");
  }, selOf(testid)).catch(() => false);
}
/**
 * CD-P42-R2 (CD-P41-B3/F15): element ที่กดได้ = button · a[href] · input · select · textarea · summary · form (แถว form/filter) ·
 * [role=button|link|switch|checkbox|radio|tab|menuitem(+radio/checkbox)|option] · label ของช่อง · [tabindex] ที่มีตัวจับคลิก —
 * ตัวเอง/บรรพบุรุษ/ลูก (การ์ดที่มีปุ่มข้างใน) · ตัวจับคลิกของ React (onClick/onPointerDown…) ที่ไม่มี tabindex ก็นับ (กัน static ปลอม · บันทึกไว้)
 */
async function pressInfo(el: Any): Promise<{ ok: boolean; what: string }> {
  return el
    .evaluate((e: Any) => {
      const PRESS = "button, a[href], input, select, textarea, summary, [role=button], [role=link], [role=switch], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option]";
      const tag = e.tagName.toLowerCase();
      const what = `<${tag}${e.getAttribute("role") ? ` role=${e.getAttribute("role")}` : ""}>`;
      const handler = (x: Any) => {
        const k = Object.keys(x).find((n) => n.startsWith("__reactProps$"));
        const p = k ? x[k] : null;
        return !!p && ["onClick", "onMouseDown", "onPointerDown", "onPointerUp", "onTouchStart", "onKeyDown"].some((h) => typeof p[h] === "function");
      };
      if (tag === "form" || e.matches(PRESS) || e.closest(PRESS)) return { ok: true, what };
      if (tag === "label" && (e.control || e.querySelector("input,select,textarea"))) return { ok: true, what };
      if (e.querySelector(PRESS)) return { ok: true, what: `${what} มีคอนโทรลข้างใน` };
      if (handler(e)) return { ok: true, what: `${what}${e.hasAttribute("tabindex") ? " tabindex" : " ไม่มี tabindex"} + ตัวจับคลิก` };
      return { ok: false, what };
    })
    .catch(() => ({ ok: true, what: "?" }));
}
/** CD-P42-R8 radio ที่เลือกอยู่แล้ว · R9 ตัวสลับภาษา/สาขาที่อยู่ในสถานะนั้นแล้ว → ข้อความ (ว่าง = ไม่ idle) */
async function idleState(el: Any, testid: string): Promise<string> {
  return el
    .evaluate((e: Any, sw: boolean, loc: string | null) => {
      const tag = e.tagName.toLowerCase();
      const type = (e.getAttribute("type") ?? "").toLowerCase();
      const role = e.getAttribute("role") ?? "";
      if ((tag === "input" && type === "radio" && e.checked) || (["radio", "menuitemradio"].includes(role) && e.getAttribute("aria-checked") === "true")) return "radio เลือกอยู่แล้ว (aria-checked=true · CD-P41-F26)";
      if (!sw) return "";
      const cur = ["aria-pressed", "aria-selected", "aria-checked"].some((a) => e.getAttribute(a) === "true") || (e.hasAttribute("aria-current") && e.getAttribute("aria-current") !== "false") || ["active", "on", "checked"].includes(e.getAttribute("data-state") ?? "");
      if (cur) return "ตัวสลับอยู่ในสถานะนี้แล้ว (aria · CD-P41-F27)";
      if (loc && (document.documentElement.lang || "").toLowerCase().startsWith(loc)) return `ภาษาปัจจุบัน = ${loc} (CD-P41-F27)`;
      return "";
    }, SWITCH_RE.test(testid), localeOfSwitch(testid))
    .catch(() => "");
}
const isDisabled = (el: Any): Promise<boolean> => el.evaluate((e: Any) => !!e.disabled || e.getAttribute("aria-disabled") === "true").catch(() => false);
/** CD-P42-R8: คลิปบอร์ด (สิทธิ์ clipboard-read ของ context) — คืนความยาว + hash เท่านั้น (โทเคน/คีย์ห้ามลง log) · อ่านไม่ได้ = null */
async function clipboardRead(page: Any): Promise<{ len: number; hash: string } | null> {
  const t: string | null = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }).catch(() => null);
  return t === null ? null : { len: t.length, hash: sha16(t) };
}
/** CD-P42-R9: ตัวสลับภาษาตั้งคุกกี้ LOCALE/lang — คืนเป็นภาษาของช่องหลังกด (แถวถัดไปของช่องเห็นภาษาเดิม) */
async function resetLocale(page: Any): Promise<void> {
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  const mk = (name: string) => (https ? { name, value: CELL.locale, url: BASE, path: "/", secure: true } : { name, value: CELL.locale, domain: host, path: "/" });
  await page.setCookie(mk("LOCALE"), mk("lang")).catch(() => {});
}
/** CD-P42-R11: ขั้น opener (ลงท้าย "?" = ไม่บังคับ) — parseStep ของ pos-buttons-fixtures.mts */
const splitOpener = (o: string) => parseStep(o);
type PageState = { openChain: string[]; dirty: boolean; notes: string[] };
const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((x, i) => x === b[i]);
/** CD-P42-R6: ช่องที่ขั้นทะเบียนกรอกแล้ว (=ค่า · =* · search-noop) — PREFILL ไม่แตะ (ไม่ว่าค่าจะว่างหรือไม่) */
const markFilled = (el: Any) => el.evaluate((e: Element) => {
  const w = window as Any;
  (w.__qcFilled ??= new WeakSet()).add(e);
}).catch(() => {});
/** CD-P42-R10 (CD-P41-F28) search-noop: พิมพ์อักษรที่ไม่มีผล 1 ตัวแล้วลบ (ค่าท้าย = "" · ทะเบียนเลิกใช้ "= " ได้ภายหลัง) */
async function searchNoop(page: Any, el: Any): Promise<void> {
  await el.evaluate((e: HTMLElement) => e.focus()).catch(() => {});
  await page.keyboard.type("a", { delay: 5 });
  await sleep(120);
  await page.keyboard.press("Backspace");
  await el.evaluate((e: HTMLInputElement) => {
    if (e.value !== "") {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, "");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }).catch(() => {});
}
/** CD-P42-R7 (CD-P41-F22): เบอร์ที่ทะเบียนตรึงไว้ทำให้ Customer created:false ตั้งแต่รอบ 2 — แถวที่ db ระบุ Customer ⇒ สุ่มเบอร์ต่อรอบ */
const freshPhone = (it: PlanItem, tid: string, val: string) =>
  it.row.expect.type === "mutation" && /^Customer\b/.test(String(it.row.expect.db ?? "")) && /phone/.test(tid) && /^0\d{8,9}$/.test(val) ? `08${randomDigits(8)}` : val;
/** ไล่ opener (เฉพาะขั้นที่ยังต้องกด) แล้วหาคอนโทรลของแถว — แบบเดียวกับ C4.2 · ขั้นทะเบียนกรอกก่อน PREFILL เสมอ (CD-P42-R6) */
/** POS P4.3 walker fix1 ▸ H12: แถวช่องกรอกแบบแพตเทิร์น รับเฉพาะ INPUT/TEXTAREA/SELECT (span ราคา ProductsClient.tsx:184 ชนแพตเทิร์นของช่อง ProductPanel.tsx:356) ·
 *  แถว testid ตรงตัวไม่กรอง (pos-sales-unit-all เป็น <option>) · แถว SELF_CLICK_FIRST หาแบบไม่กรองก่อนแตะ (ปุ่ม "นับ" → ช่องกรอก) ◂ */
const FIELD_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
const rowTags = (it: PlanItem, afterSelfClick = false): string[] | null =>
  it.row.testid.includes("*") && ["input", "textarea", "select"].includes(it.row.kind) && (afterSelfClick || !SELF_CLICK_FIRST[it.key]) ? FIELD_TAGS : null;
async function reveal(page: Any, path: string, it: PlanItem, state: PageState, hidden: boolean, notList: string[]): Promise<{ el: Any | null; reason: string }> {
  const chain = it.opener;
  const pendingValue = chain.slice(state.openChain.length).some((o) => splitOpener(o).val !== null);
  const tags = rowTags(it);
  let el = await findVisible(page, it.row.testid, notList, 0, tags);
  if (el && !pendingValue) return { el, reason: "" };
  for (let i = state.openChain.length; i < chain.length; i++) {
    const { tid, val, optional } = splitOpener(chain[i]!);
    let later = false;
    if (val === null) {
      for (const t of chain.slice(i + 1)) if (await findVisible(page, splitOpener(t).tid, [], 0)) later = true;
      if (!later && (await findVisible(page, it.row.testid, notList, 0, tags))) later = true;
    }
    if (later) {
      state.openChain.push(chain[i]!);
      continue;
    }
    const op = await findVisible(page, tid, [], optional || el ? 600 : hidden ? 1500 : 3500);
    if (!op) {
      // CD-P42-R11 (CD-P41-F29): ขั้น "…?" ไม่มีสำหรับบทบาทนี้ = ข้ามโดยไม่ผิด
      if (optional) {
        state.openChain.push(chain[i]!);
        state.notes.push(`ข้ามขั้นไม่บังคับ ${tid}`);
        continue;
      }
      return { el: null, reason: `ตัวเปิด ${chain[i]} หาไม่พบ (ลำดับ ${chain.join(" → ")})` };
    }
    if (val === null || val === "click") await clickEl(page, op).catch(() => {});
    else if (val === "on" || val === "off") {
      const on: boolean = await op.evaluate((e: HTMLInputElement) => (e.tagName === "INPUT" ? e.checked : e.getAttribute("aria-checked") === "true" || e.getAttribute("aria-selected") === "true")).catch(() => false);
      if (on !== (val === "on")) await clickEl(page, op).catch(() => {});
    } else if (val === "*") {
      await fillEl(page, op, tid).catch(() => {});
      await markFilled(op);
    } else if (val === " ") {
      await searchNoop(page, op);
      await markFilled(op);
      state.notes.push(`search-noop ${tid}`);
    } else {
      const v = freshPhone(it, tid, val);
      if (v !== val) state.notes.push(`สุ่มเบอร์ ${tid} (CD-P41-F22)`);
      const tag: string = await op.evaluate((e: Element) => e.tagName.toLowerCase()).catch(() => "");
      if (tag === "select") await op.select(v).catch(() => {});
      else
        await op.evaluate((e: HTMLInputElement, x: string) => {
          Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(e, x);
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.dispatchEvent(new Event("change", { bubbles: true }));
        }, v).catch(() => {});
      await markFilled(op);
    }
    await settle(page, 3000);
    await sleep(250);
    state.openChain.push(chain[i]!);
    if (urlKey(page.url()) !== urlKey(`${BASE}${path}`)) state.dirty = true;
  }
  el = await findVisible(page, it.row.testid, notList, hidden ? 800 : chain.length ? 4000 : 2500, tags);
  if (el) return { el, reason: "" };
  const said = await pageSays(page);
  return { el: null, reason: `${chain.length ? `กด ${chain.join(" → ")} แล้วยังไม่เห็น ${it.row.testid}` : "ควรเห็น (อยู่ใน roles) แต่หาไม่พบ"}${said ? ` · หน้าแสดง: ${said}` : ""}` };
}
/** PREFILL: ช่องกรอกของหน้าเดียวกันที่อยู่ในฟอร์ม/กล่องเดียวกับคอนโทรลนี้และยังว่าง — กรอกก่อนกดส่ง */
async function prefill(page: Any, it: PlanItem, group: PlanItem[], el: Any): Promise<string[]> {
  const done: string[] = [];
  const box = await el.evaluateHandle((e: Element) => (e.tagName === "FORM" ? e : e.closest('form, [role="dialog"], dialog, [aria-modal="true"], [data-testid$="-form"], [data-testid$="-dialog"], [data-testid$="-sheet"], [data-testid$="-panel"]') ?? e.closest("section, fieldset"))).catch(() => null);
  if (!box?.asElement?.()) return done;
  for (const s of group) {
    if (s === it || !["input", "textarea", "select", "toggle"].includes(s.row.kind) || s.action !== "press" || s.row.expect.type === "navigate") continue;
    const se = await findVisible(page, s.row.testid, [], 0);
    if (!se) continue;
    const inside = await box.evaluate((c: Element, x: Element) => c.contains(x), se).catch(() => false);
    if (!inside) continue;
    // CD-P42-R10 search-noop: PREFILL ไม่พิมพ์ลงช่องค้นหา (พิมพ์แล้วกรองรายการ/ถอดคอนโทรลที่จะกดออก — CD-P41-F28)
    const stype: string = await se.evaluate((x: Element) => (x.getAttribute("type") ?? "").toLowerCase()).catch(() => "");
    if (isSearchLike(s.row.testid, stype)) continue;
    if (s.row.testid === "pos-ord-man-conv" || s.row.testid === "pos-ord-man-party") continue; // POS P4.3 walker fix1 ▸ H10: ลิงก์ลูกค้าไม่บังคับ — assertCustomerLinks order.ts:721-731 ◂
    const empty = await se.evaluate((x: Any) => {
      if ((window as Any).__qcFilled?.has?.(x)) return false; // CD-P42-R6: ขั้นทะเบียนกรอกแล้ว — PREFILL ไม่ทับ
      const tag = x.tagName.toLowerCase();
      const type = (x.getAttribute("type") ?? "").toLowerCase();
      if (tag === "input" && (type === "radio" || type === "file")) return false;
      if (tag === "input" && type === "checkbox") return false; // สวิตช์ไม่ติ๊กเอง (อาจเปิดฟิลด์/ผลภายนอก)
      if (tag === "input" || tag === "textarea" || tag === "select") return String(x.value ?? "") === "";
      return false;
    }).catch(() => false);
    if (!empty) continue;
    await fillEl(page, se, s.row.testid).catch(() => {});
    done.push(s.row.testid);
  }
  if (done.length) await settle(page, 2500);
  return done;
}
async function overflowNow(page: Any): Promise<string> {
  return page
    .evaluate(() => {
      const d = document.documentElement;
      const boxes = [d, document.body, ...Array.from(document.querySelectorAll("main, [role=main]"))].filter(Boolean) as Element[];
      const over = boxes.find((b) => b.scrollWidth > b.clientWidth + 1);
      return over ? `${over === d ? "html" : over === document.body ? "body" : over.tagName.toLowerCase()} scrollWidth ${over.scrollWidth} > ${over.clientWidth}` : "";
    })
    .catch(() => "");
}
const HYDRATION_RE = /Hydration|hydrat|Minified React error #(418|423|425)|did not match\. Server/i;
const shotPath = (it: PlanItem) => {
  const pg = it.row.page.replace(STAFF, "").replace(/^\//, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+$/g, "") || "root";
  const tid = it.row.testid.replace(/\*/g, "x").replace(/[^A-Za-z0-9_-]+/g, "_");
  return `${SHOTS_DIR}/${pg}/${tid}-${CELL.user}-${CELL.device}${CELL.locale === "en" ? "-en" : ""}.png`;
};
async function failShot(page: Any, it: PlanItem): Promise<string> {
  const f = shotPath(it);
  try {
    mkdirSync(f.slice(0, f.lastIndexOf("/")), { recursive: true });
    await page.screenshot({ path: f, fullPage: false });
    return f;
  } catch {
    return "";
  }
}

// ═════════════════════════ URL ของแถว ═════════════════════════
/** แถว mutation ต่อหน้า (testid) — ใช้ตัดสินว่าแถว/opener ของหน้าสาธารณะเขียนหรือไม่ */
const MUTATION_TIDS = new Map<string, string[]>();
for (const r of REG.rows) if (r.expect?.type === "mutation") MUTATION_TIDS.set(r.page, [...(MUTATION_TIDS.get(r.page) ?? []), r.testid]);
/** CD-P42-R13: แถวนี้ (หรือขั้น opener ของมัน) เขียนข้อมูล — เงิน/ตัวนับ · expect mutation · ขั้นที่ชี้แถว mutation ของหน้าเดียวกัน */
function publicWrites(it: PlanItem): boolean {
  if (it.moneyUnit || it.row.expect.type === "mutation") return true;
  const muts = MUTATION_TIDS.get(it.row.page) ?? [];
  return it.opener.some((st) => {
    const t = parseStep(st).tid;
    return muts.some((m) => m === t || (t.includes("*") && globRe0(t).test(m)) || (m.includes("*") && globRe0(m).test(t)));
  });
}
function pathOf(it: PlanItem): { path: string | null; missing: string | null } {
  let p = it.row.page.replace("[id]", CTX.sys);
  const tok = (k: string) => CTX.tokens[k] ?? null;
  let btnTok = false;
  for (const m of p.matchAll(/\[([A-Za-z]+)\]/g)) {
    const v = m[1] === "unitSlug" ? null : tok(m[1]!);
    if (!v) return { path: null, missing: `[${m[1]}]` };
    // CD-P42-R13: แถวที่เขียนบนหน้าสาธารณะ (เงิน · mutation · หรือ opener ผ่านแถว mutation — เช่น /q pos-qr-place · ส่งออเดอร์ · เรียกพนักงาน ·
    //   ขอใบกำกับ · จับคู่จอ /d) กดได้เฉพาะโทเคนของสาขา posqc-btn — โทเคนสาขาอื่น (สีลม/อารีย์) = หาค่าไม่ได้ (ไม่กด · ไม่เขียนนอกสาขาตัวกด)
    const pubW = !it.row.page.startsWith(STAFF) && publicWrites(it);
    if (pubW && CTX.tokenUnits[m[1]!] !== BTN.unit.id) return { path: null, missing: `[${m[1]}] ของสาขา ${BTN.unit.id} (แถวเขียนบนหน้าสาธารณะ · มติเงิน ⚠️6)` };
    if (pubW) btnTok = true;
    p = p.replace(m[0], encodeURIComponent(v));
  }
  let q = String(it.row.query ?? "");
  for (const m of q.matchAll(/\[([A-Za-z]+)\]/g)) {
    const k = m[1]!;
    const v = k === "unitId" ? BTN.unit.id : k === "date" ? todayBkk() : tok(k);
    if (!v) return { path: null, missing: `[${k}]` };
    if (k !== "unitId" && k !== "date" && !it.row.page.startsWith(STAFF) && publicWrites(it)) {
      if (CTX.tokenUnits[k] !== BTN.unit.id) return { path: null, missing: `[${k}] ของสาขา ${BTN.unit.id} (แถวเขียนบนหน้าสาธารณะ)` };
      btnTok = true;
    }
    q = q.replace(m[0], encodeURIComponent(v));
  }
  // หน้าสาธารณะที่เขียนแต่ไม่มีโทเคนบอกสาขา = ไม่รู้ว่าจะลงสาขาไหน → ไม่กด (fail-closed)
  if (!it.row.page.startsWith(STAFF) && publicWrites(it) && !btnTok) return { path: null, missing: `โทเคนของสาขา ${BTN.unit.id} (หน้าสาธารณะไม่มีตัวแปรบอกสาขา)` };
  const staff = it.row.page.startsWith(STAFF);
  const params = new URLSearchParams(q);
  // CD-P42-W6: หน้าพนักงานทุกหน้าใช้สาขา posqc-btn (ไม่มี unit = เติม · unit อื่น = แทน · "*" = ทุกสาขาตามทะเบียน)
  if (staff && params.get("unit") !== "*") params.set("unit", BTN.unit.id);
  if (CELL.locale === "en" && it.row.page === "/d") params.set("lang", "en");
  const qs = params.toString();
  return { path: `${p}${qs ? `?${qs}` : ""}`, missing: null };
}

// ═════════════════════════ session ═════════════════════════
async function mintCookies(): Promise<Any[]> {
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  const out: Any[] = [];
  if (CTX.persona) {
    const token = "posbtn" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const ttl = new Date(Date.now() + 6 * 3600_000);
    const row = await P.session.create({ data: { userId: CTX.persona.userId, tokenHash: sha256(token), userAgent: BTN.ua, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
    SESSIONS.push(row.id);
    out.push(https ? { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true } : { name: "shark_session", value: token, domain: host, path: "/" });
    out.push(https ? { name: "shark_tenant", value: T.tenantId, url: BASE, path: "/", secure: true } : { name: "shark_tenant", value: T.tenantId, domain: host, path: "/" });
  }
  if (CELL.locale === "en") out.push(https ? { name: "LOCALE", value: "en", url: BASE, path: "/", secure: true } : { name: "LOCALE", value: "en", domain: host, path: "/" });
  return out;
}
/** เก็บกวาดครั้งเดียว — ผู้เรียกทุกราย (finally + สัญญาณ) รอ promise เดียวกันจนเสร็จ (สัญญาณกลางทางไม่ตัด closeShift/คืนค่า/ลบ session) */
let cleanupP: Promise<void> | null = null;
function cleanupAll(why: string): Promise<void> {
  cleanupP ??= cleanupOnce(why);
  return cleanupP;
}
async function cleanupOnce(why: string): Promise<void> {
  try {
    await BROWSER?.close();
  } catch {
    /* ปิดแล้ว */
  }
  for (const d of PROFILE) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี */
    }
  }
  await cleanupFixtures(CTX).catch((e: unknown) => CTX.restores.push({ label: `เก็บกวาด (${why})`, ok: false, detail: String(e).slice(0, 160) }));
  try {
    if (SESSIONS.length) await P.session.deleteMany({ where: { id: { in: SESSIONS } } });
    await P.session.deleteMany({ where: { userAgent: BTN.ua, expiresAt: { lt: new Date() } } });
  } catch (e) {
    CTX.restores.push({ label: "ลบ session", ok: false, detail: String(e).slice(0, 160) });
  }
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.on(sig, () => {
    FATAL ||= `ถูกหยุดด้วย ${sig}`;
    void cleanupAll(sig).finally(() => {
      writeSummary();
      process.exit(130);
    });
  });

// ═════════════════════════ อัตรา snapshot ออฟไลน์ ═════════════════════════
let OFFLINE_ON = false;
let lastRegisterLoad = 0;
async function snapGate(path: string): Promise<void> {
  if (!OFFLINE_ON || !path.includes("/pos/register")) return;
  const wait = lastRegisterLoad + 61_000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRegisterLoad = Date.now();
}

// ═════════════════════════ ตะกร้า (แถวเงินหน้าขาย · มติ 5 cart fixtures) ═════════════════════════
async function ensureCart(page: Any): Promise<string> {
  const lines = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="pos-reg-cart-bar"]');
    if (bar && bar.getClientRects().length > 0) return Number(bar.getAttribute("data-count") ?? 0);
    return Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]')).filter((e) => e.getClientRects().length > 0).length;
  }).catch(() => 0);
  if (lines > 0) return "";
  const id = CTX.cartProductIds[0];
  if (!id) return "ไม่มีสินค้าตะกร้าของ fixture";
  const card = await findVisible(page, `pos-reg-product-${id}`, [], 6000);
  if (!card) return `ไม่เห็นการ์ดสินค้า pos-reg-product-${id}`;
  await clickEl(page, card);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="pos-reg-pay"],[data-testid="pos-reg-cart-bar-pay"]')).some((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled), { timeout: 15_000 }).catch(() => undefined);
  return "";
}

// ═════════════════════════ วิ่งหนึ่งกลุ่มหน้า ═════════════════════════
async function runGroup(path: string, group: PlanItem[], cookies: Any[]): Promise<void> {
  const t0 = Date.now();
  const dv = DEVICES[CELL.device];
  const ctxB = typeof BROWSER.createBrowserContext === "function" ? await BROWSER.createBrowserContext() : await BROWSER.createIncognitoBrowserContext();
  const page = await ctxB.newPage();
  await page.setViewport({ width: dv.w, height: dv.h, deviceScaleFactor: 1, isMobile: dv.isMobile, hasTouch: dv.hasTouch });
  if (cookies.length) await page.setCookie(...cookies);
  await page.evaluateOnNewDocument(NAME_SHIM);
  if (CTX.persona && CTX.staffJson)
    await page.evaluateOnNewDocument(
      (dk: string, dev: string, sk: string, sj: string) => {
        try {
          window.localStorage.setItem(dk, dev);
          window.sessionStorage.setItem(sk, sj);
        } catch {
          /* ไม่มี storage */
        }
      },
      "shark.pos.deviceId",
      CTX.deviceCode,
      `pos-staff:${CTX.deviceCode}`,
      CTX.staffJson,
    );
  page.on("dialog", (d: Any) => d.accept().catch(() => {}));
  const cErrs: string[] = [];
  let reqCount = 0;
  let nonGet = 0;
  const resp: { status: number; url: string; ct: string; disp: string; nav: boolean }[] = [];
  page.on("pageerror", (e: Error) => cErrs.push(e.message.slice(0, 200)));
  page.on("console", (m: Any) => {
    // POS P4.3 walker fix1 ▸ H15: ค่า URL โลโก้ของตัวกด (https://qc-btn-….example.com) โหลดไม่ได้ = เสียงของ fixture ไม่ใช่บั๊ก ◂
    if (/Failed to load resource/i.test(String(m.text()))) {
      let host = "";
      try {
        host = new URL(String(m.location?.()?.url ?? "")).hostname;
      } catch {
        /* ไม่มี URL */
      }
      if (host.endsWith(".example.com")) return;
    }
    if (m.type() === "error" || (m.type() === "warning" && HYDRATION_RE.test(String(m.text())))) cErrs.push(String(m.text()).slice(0, 200));
  });
  page.on("request", (r: Any) => {
    reqCount++;
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) nonGet++;
  });
  page.on("response", (r: Any) => {
    try {
      const h = r.headers();
      resp.push({ status: r.status(), url: String(r.url()), ct: String(h["content-type"] ?? ""), disp: String(h["content-disposition"] ?? ""), nav: r.request().isNavigationRequest() && r.frame() === page.mainFrame() });
    } catch {
      /* ข้าม */
    }
  });
  const tabs: Any[] = [];
  const onTarget = (t: Any) => {
    try {
      if (t.opener() === page.target()) tabs.push(t);
    } catch {
      /* ข้าม */
    }
  };
  BROWSER.on("targetcreated", onTarget);
  const DL: { name: string; bytes: number }[] = [];
  try {
    const cdp = await page.target().createCDPSession();
    mkdirSync(`${SHOTS_DIR}/dl`, { recursive: true });
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: `${ROOT}/${SHOTS_DIR}/dl`, eventsEnabled: true }).catch(() => {});
    const byGuid = new Map<string, { name: string; bytes: number }>();
    cdp.on("Browser.downloadWillBegin", (e: Any) => {
      const d = { name: String(e.suggestedFilename ?? ""), bytes: 0 };
      byGuid.set(e.guid, d);
      DL.push(d);
    });
    cdp.on("Browser.downloadProgress", (e: Any) => {
      const d = byGuid.get(e.guid);
      if (d) d.bytes = Math.max(d.bytes, Number(e.receivedBytes ?? 0), Number(e.totalBytes ?? 0));
    });
  } catch {
    /* ดาวน์โหลดตัดสินจาก response */
  }
  const state: PageState = { openChain: [], dirty: true, notes: [] };
  // CD-P42-R8: แถวคัดลอกใช้ navigator.clipboard ได้จริงใน headless (ไม่ได้ = ตกไปข้อความบนหน้า)
  await ctxB.overridePermissions?.(BASE, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]).catch(() => {});
  let navStatus = 0;
  const load = async () => {
    await snapGate(path);
    const r = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => null);
    navStatus = r?.status?.() ?? navStatus;
    await sleep(300);
    state.openChain = [];
    state.dirty = false;
  };
  const ovfSeen = new Set<string>();
  // ลำดับ: ทะเบียน · แถว needs ท้าย · แถวเงิน/ตัวนับท้ายสุด (บิลที่เกิดไม่กวนแถวอื่น)
  // CD-P42-R7: แถวผลข้างเคียงมาในกลุ่มช่วงท้ายของตัวเอง — ถอนเครื่องตัวเองท้ายสุด
  const rank = (it: PlanItem) => (sideEffectOf(it.row) ? 10 + sideEffectRank(it.row) : it.moneyUnit ? 2 : it.needs ? 1 : 0);
  const rows = [...group].sort((a, b) => rank(a) - rank(b) || a.idx - b.idx);
  const allNames = REG.rows.filter((r) => r.page === group[0]!.row.page).map((r) => r.testid);
  for (const it of rows) {
    const t1 = Date.now();
    const errsBefore = cErrs.length;
    const ngRow = nonGet; // คำขอเขียนก่อนแถวนี้ — finally คืนค่าตั้งเมื่อแถวเขียน (ทุกทางออก รวม catch/continue)
    const respBefore = resp.length;
    const notList = it.row.testid.includes("*") ? allNames.filter((n) => n !== it.row.testid && globRe0(it.row.testid).test(n)) : [];
    let stopWatcher: (() => Promise<void>) | null = null; // POS P4.3 walker fix1 ▸ H3 ◂
    try {
      if (state.dirty || urlKey(page.url()) !== urlKey(`${BASE}${path}`) || !isPrefix(state.openChain, it.opener)) await load();
      if (it.action === "absent") {
        const rv = await reveal(page, path, it, state, navStatus >= 400, notList);
        state.notes.splice(0);
        if (rv.el) rec(it, { class: "hiddenLeak", detail: "อยู่ใน hiddenFor แต่มองเห็นได้", shot: await failShot(page, it) });
        else rec(it, { class: "ok", detail: `ไม่เห็น (hiddenFor${navStatus >= 400 ? ` · หน้า HTTP ${navStatus}` : ""})` });
        continue;
      }
      if (it.action === "visible") {
        const rv = await reveal(page, path, it, state, false, notList);
        state.notes.splice(0);
        if (!rv.el) {
          if (await hiddenInput(page, it.row.testid)) rec(it, { class: "skip", reason: "hidden-input", detail: "input[type=hidden] (CD-P42-R1)" });
          else if (it.needs) rec(it, { class: "skip", reason: "needs", detail: rv.reason });
          else rec(it, { class: "dead", detail: rv.reason, shot: await failShot(page, it) });
          continue;
        }
        if (it.row.expect.state === "disabled") {
          const dis: boolean = await rv.el.evaluate((e: Any) => !!e.disabled || e.getAttribute("aria-disabled") === "true").catch(() => false);
          if (!dis) {
            rec(it, { class: "wrongExpect", detail: "คาดว่า disabled แต่กดได้", shot: await failShot(page, it) });
            continue;
          }
        }
        rec(it, { class: "ok", detail: it.row.expect.state ? `เห็น (${it.row.expect.state})` : "เห็น" });
        continue;
      }
      // ── press ──
      if (it.moneyUnit && PRESSED_ONCE.has(it.key)) {
        rec(it, { class: "skip", reason: "once-per-run", detail: "กดแล้วในรอบนี้" });
        continue;
      }
      if (it.moneyUnit && it.row.page === `${STAFF}register`) {
        const why = await ensureCart(page);
        if (why) {
          rec(it, { class: it.needs ? "skip" : "error", reason: it.needs ? "needs" : undefined, detail: `ตะกร้า fixture: ${why}`, shot: await failShot(page, it) });
          state.dirty = true;
          continue;
        }
      }
      const rv = await reveal(page, path, it, state, false, notList);
      const notes = state.notes.splice(0);
      if (!rv.el) {
        if (await hiddenInput(page, it.row.testid)) rec(it, { class: "skip", reason: "hidden-input", detail: "input[type=hidden] (CD-P42-R1)" });
        else if (it.needs) rec(it, { class: "skip", reason: "needs", detail: rv.reason });
        else rec(it, { class: "dead", detail: `${rv.reason}${navStatus >= 400 ? ` · หน้า HTTP ${navStatus}` : ""}`, shot: await failShot(page, it) });
        continue;
      }
      let el = rv.el;
      // POS P4.3 walker fix1 ▸ R3/R4 (SELF_CLICK_FIRST — แทน opener "<ตัวเอง>=click" ที่ qc-pos-p4.1 R3 ห้าม): แตะ element ของแถว 1 ครั้ง แล้วหาใหม่ด้วย testid ตรงตัว ◂
      if (SELF_CLICK_FIRST[it.key]) {
        const exact: string = await el.evaluate((e: Element) => e.getAttribute("data-testid") ?? "").catch(() => "");
        await clickEl(page, el).catch(() => {});
        await settle(page, 3000);
        await sleep(250);
        const again = exact ? await findVisible(page, exact, [], 2500, rowTags(it, true)) : null;
        notes.push(`แตะ ${exact || it.row.testid} ก่อน 1 ครั้ง (${SELF_CLICK_FIRST[it.key]!.slice(0, 2)})`);
        if (!again) {
          if (it.needs) rec(it, { class: "skip", reason: "needs", detail: `แตะ ${exact} แล้วไม่เห็นคอนโทรลของแถว (needs)` });
          else rec(it, { class: "dead", detail: `แตะ ${exact} แล้วไม่เห็นคอนโทรลของแถว`, shot: await failShot(page, it) });
          state.dirty = true;
          continue;
        }
        el = again;
      }
      // CD-P42-R2 (B3/F15): กดเฉพาะ element ที่กดได้ — span/ชิปนิ่ง testid เดียวกันของผู้ใช้ 1 สาขา = static (ไม่ใช่ dead)
      const pi = await pressInfo(el);
      if (!pi.ok) {
        if (CELL.user === "manager" || CELL.user === "cashier") rec(it, { class: "skip", reason: "static", detail: `${pi.what} ไม่ใช่ element ที่กดได้ (ผู้ใช้ 1 สาขา · CD-P41-B3)` });
        else rec(it, { class: "dead", detail: `${pi.what} ไม่ใช่ element ที่กดได้ (CD-P42-R2)`, shot: await failShot(page, it) });
        continue;
      }
      // CD-P42-R8 (radio aria-checked) · R9 (สลับภาษา/สาขาไปที่เป็นอยู่) = idle-expected
      const idle = await idleState(el, it.row.testid);
      if (idle) {
        rec(it, { class: "skip", reason: "idle-expected", detail: idle });
        continue;
      }
      let prefilled: string[] = [];
      if (it.row.expect.type === "mutation" || it.row.expect.type === "download" || it.row.kind === "form") {
        prefilled = await prefill(page, it, siblingsOf(it), el); // ช่องพี่น้องทั้งหน้า (กลุ่มช่วงท้ายมีแค่แถวผลข้างเคียง)
        if (prefilled.length) el = (await findVisible(page, it.row.testid, notList, 1500, rowTags(it, !!SELF_CLICK_FIRST[it.key]))) ?? el;
      }
      // CD-P42-R3 (CD-P41-F13): บทบาทที่ทะเบียนบอกว่าเห็นแต่ปิดใช้ (ตรวจหลังขั้นทะเบียน + PREFILL — ช่องว่างไม่ทำให้ปิดเอง)
      if ((await isDisabled(el)) && f13Users(it.row).includes(CELL.user as UserKey)) {
        rec(it, { class: "skip", reason: "disabled-expected", detail: `${CELL.user} เห็นแต่ปิดใช้ (CD-P41-F13)` });
        continue;
      }
      // POS P4.3 walker fix1 ▸ H4: คอนโทรลปิดใช้ก่อนกด — เดิมกฎ disabled→needs ทำหลังตัดสิน "ตาย" เท่านั้น (คำขอเบื้องหลังทำให้ดูมีชีวิต แล้วพิมพ์ลงช่องอื่นที่โฟกัสอยู่) ·
      //   aria-disabled ที่ทะเบียนบอกว่าแตะแล้วขึ้นเหตุผล (anyOf toast/inline-error เช่น pos-reg-custom-item ของแคชเชียร์) ยังกดตามเดิม ◂
      if (await isDisabled(el)) {
        const native: boolean = await el.evaluate((e: Any) => !!e.disabled).catch(() => false);
        const tapReason = expectAlts(it.row.expect).some((a) => a.type === "toast" || a.type === "inline-error");
        if (native || !tapReason) {
          if (it.needs) rec(it, { class: "skip", reason: "needs", detail: "คอนโทรล disabled ก่อนกด (needs)" });
          else rec(it, { class: "dead", detail: "disabled ก่อนกด (ไม่มี needs)", shot: await failShot(page, it) });
          continue;
        }
      }
      const tag: string = await el.evaluate((e: Element) => `${e.tagName.toLowerCase()}:${(e.getAttribute("type") ?? "").toLowerCase()}`).catch(() => "");
      if (tag === "input:file") {
        rec(it, { class: "skip", reason: "file-upload", detail: "input[type=file]" });
        continue;
      }
      if (tag === "input:hidden") {
        rec(it, { class: "skip", reason: "hidden-input", detail: "input[type=hidden] (CD-P42-R1)" });
        continue;
      }
      const isField = /^(input|textarea|select):/.test(tag);
      const checkLike = /^input:(checkbox|radio)$/.test(tag) || ["switch", "checkbox", "radio"].includes(await el.evaluate((e: Element) => e.getAttribute("role") ?? "").catch(() => ""));
      const ex = it.row.expect;
      const alts = expectAlts(ex); // CD-P42-R8: anyOf สตริง/อ็อบเจกต์
      await page.evaluate(() => {
        const w = window as Any;
        w.__qcMut = 0;
        if (!w.__qcObs) {
          w.__qcObs = new MutationObserver(() => {
            w.__qcMut++;
          });
          w.__qcObs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        }
      }).catch(() => {});
      const urlBefore = page.url();
      const reqBefore = reqCount;
      const ngBefore = nonGet;
      const tabsBefore = tabs.length;
      const dlBefore = DL.length;
      const alertsBefore = new Set(ex.type === "mutation" ? await alertsNow(page) : []);
      const uiT = ex.type === "ui" && ex.target && looksLikeTestid(ex.target) ? ex.target : "";
      // ภาพก่อนกดของเป้า ui ทุกตัว (หลัก + anyOf) — ตัดสิน changes/unchanged/count
      const uiBefore = new Map<string, { snap: string | null; vis: boolean; count: number }>();
      for (const a of alts) {
        if (a.type !== "ui" || !looksLikeTestid(a.target) || uiBefore.has(a.target)) continue;
        uiBefore.set(a.target, { snap: await uiSnapshot(page, a.target), vis: !!(await findVisible(page, a.target, [], 0)), count: a.state === "count" ? await countVisible(page, a.target) : -1 });
      }
      const clipRow = isClipboardRow(it.row);
      const clipBefore = clipRow ? await clipboardRead(page) : null;
      const models = await modelInfo();
      const writes = ex.type === "mutation" && it.verify === "db" ? writesOf(ex.db, new Set(models.keys())) : [];
      const delBefore = new Map<string, number | null>();
      for (const w of writes) if (w.del) delBefore.set(w.model, await countTenant(w.model));
      const pressedAt = ex.type === "mutation" || it.moneyUnit ? await dbNow() : new Date();
      const moneyBefore = new Set(it.moneyUnit ? (await moneyRowsSince(pressedAt)).map((x) => `${x.model}:${x.id}`) : []);
      let actErr = "";
      let valueChanged = false;
      try {
        if ((it.row.kind === "form" || it.row.kind === "filter") && tag.startsWith("form:")) await el.evaluate((f: Any) => (typeof f.requestSubmit === "function" ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))));
        else if (isField || ["toggle", "select", "input", "textarea"].includes(it.row.kind)) {
          const r = await fillEl(page, el, it.row.testid);
          if (r.skipped === "file") {
            rec(it, { class: "skip", reason: "file-upload", detail: "input[type=file]" });
            continue;
          }
          if (r.skipped === "one-option") {
            // CD-P42-R8 (CD-P41-F26): select เปิดใช้ที่มีตัวเลือกเดียว + needs = skippedNeeds (ไม่ใช่ dead)
            if (it.needs) rec(it, { class: "skip", reason: "needs", detail: "select มีตัวเลือกเดียว (needs · CD-P41-F26)" });
            else rec(it, { class: "dead", detail: "select มีตัวเลือกเดียว — ไม่มีค่าให้เปลี่ยน", shot: await failShot(page, it) });
            continue;
          }
          valueChanged = r.before !== r.after;
        } else if (/-(scrim|backdrop|overlay)$/.test(it.row.testid)) await el.click({ offset: { x: 4, y: 4 } }); // POS P4.3 walker fix1 ▸ H2: กลางม่าน = กล่อง (RegisterDialog.tsx:68-71) ◂
        else await clickEl(page, el);
      } catch (e) {
        actErr = e instanceof Error ? e.message.slice(0, 160) : String(e);
      }
      if (it.moneyUnit) PRESSED_ONCE.add(it.key);
      // POS P4.3 walker fix1 ▸ H3: เฝ้าเป้าผลตั้งแต่กด — toast หายใน 4 วิ (RegisterScreen.tsx:401 · OrdersScreen.tsx:140 · KdsScreen.tsx:92 · ProductsClient.tsx:67) ·
      //   PayDone เดินต่อเองใน 5 วิ (PayDone.tsx:39,214-224) แต่ settle 8 วิ + รอ db 5 วิ มาก่อนตรวจ resultTarget ◂
      const watchT = [...new Set([ex.resultTarget, ex.target, ...alts.filter((a) => ["modal", "toast", "inline-error"].includes(a.type)).map((a) => a.target)].filter((x): x is string => !!x && looksLikeTestid(x)))];
      const seen = new Set<string>();
      let watching = true;
      const watcher = (async () => {
        while (watching) {
          for (const x of watchT) {
            if (seen.has(x)) continue;
            const h = await findVisible(page, x, [], 0).catch(() => null);
            if (h) {
              seen.add(x);
              await h.dispose?.().catch(() => {});
            }
          }
          await sleep(150);
        }
      })();
      stopWatcher = async () => {
        watching = false;
        await watcher.catch(() => {});
      };
      // ── ตาย (3 วิ) ──
      let dead = actErr !== "";
      if (!dead && !(ex.type === "ui" && ex.state === "selected")) {
        dead = true;
        for (let i = 0; i < 20; i++) {
          const mut = isField ? 0 : await page.evaluate(() => (window as Any).__qcMut ?? 0).catch(() => 1);
          if (valueChanged || mut > 0 || reqCount > reqBefore || page.url() !== urlBefore || tabs.length > tabsBefore || DL.length > dlBefore) {
            dead = false;
            break;
          }
          await sleep(150);
        }
      }
      if (dead) {
        const dis = await isDisabled(el);
        if (it.needs && dis) rec(it, { class: "skip", reason: "needs", detail: "คอนโทรลมีแต่ disabled (needs)" });
        else rec(it, { class: actErr ? "error" : "dead", detail: actErr || `ไม่มี DOM mutation/navigation/network ภายใน 3 วิ${dis ? " · disabled ตอนกด" : ""}${prefilled.length ? ` · prefill ${prefilled.join(",")}` : ""}`, shot: await failShot(page, it) });
        state.dirty = true;
        await stopWatcher();
        continue;
      }
      // ── คาด (หลัก แล้ว anyOf — CD-P42-R8) ──
      const VIS = ["modal", "toast", "inline-error"];
      const visTids = alts.filter((a) => VIS.includes(a.type) && looksLikeTestid(a.target)).map((a) => a.target);
      const navPaths = alts.filter((a) => a.type === "navigate" && (a.target.startsWith("/") || a.target.startsWith("#"))).map((a) => a.target);
      const anyVisible = async (tids: string[], ms: number): Promise<string | null> => {
        for (let t = Date.now() + ms; ; ) {
          for (const c of tids) if (await findVisible(page, c, [], 0)) return c;
          if (Date.now() >= t) return null;
          await sleep(200);
        }
      };
      const navNow = async (ms: number): Promise<{ ok: boolean; detail: string }> => {
        let hit = false;
        for (let i = 0; i < Math.max(1, Math.round(ms / 200)) && !hit; i++) {
          const urls = [page.url(), ...tabs.slice(tabsBefore).map((t: Any) => String(t.url?.() ?? ""))];
          hit = urls.some((u) => navPaths.some((t) => navMatches(t, u))); // CD-P42-R4
          if (!hit) await sleep(200);
        }
        const navBad = resp.slice(respBefore).filter((r) => r.nav && r.status >= 400);
        if (hit && navBad.length) return { ok: false, detail: `ปลายทางตอบ HTTP ${navBad[0]!.status}` };
        return { ok: hit, detail: hit ? "" : `url=${urlKey(page.url())} ไม่ตรง ${navPaths.join(" | ")}` };
      };
      const uiNow = async (a: ExpectAlt): Promise<{ ok: boolean; detail: string }> => {
        const tg = looksLikeTestid(a.target) ? a.target : "";
        const b = uiBefore.get(tg) ?? { snap: null, vis: false, count: -1 };
        if (!tg) return { ok: true, detail: isField ? "ค่าในช่องเปลี่ยน" : "มีผล (ไม่ตาย)" };
        if (a.state === "disappears") {
          let gone = false;
          for (let i = 0; i < 20 && !gone; i++) {
            gone = !(await findVisible(page, tg, [], 0));
            if (!gone) await sleep(150);
          }
          return { ok: gone, detail: gone ? "" : `${tg} ยังเห็นอยู่` };
        }
        if (a.state === "selected") {
          // POS P4.3 walker fix1 ▸ R6/R7: เป้า = แพตเทิร์นของแถวเอง ⇒ ตรวจ element ที่กด (หลายการ์ดเครื่อง: แพตเทิร์นหาได้การ์ดอื่นที่ไม่ถูกเลือก DeviceSettings.tsx:340-342) ◂
          const own = tg === it.row.testid && (await el.evaluate((e: Element) => e.isConnected).catch(() => false));
          const s = own ? el : await findVisible(page, tg, [], 3000);
          const ok = !!s && (await s.evaluate((e: Element) => ["aria-selected", "aria-pressed", "aria-checked"].some((x) => e.getAttribute(x) === "true") || (e.hasAttribute("aria-current") && e.getAttribute("aria-current") !== "false")).catch(() => false));
          return { ok, detail: ok ? "" : `${tg} ไม่ประกาศสถานะเลือก` };
        }
        if (a.state === "count") {
          let after = b.count;
          for (let i = 0; i < 20 && after === b.count; i++) {
            await sleep(200);
            after = await countVisible(page, tg);
          }
          const ok = after >= 0 && after !== b.count;
          return { ok, detail: ok ? "" : `จำนวน ${tg} ไม่เปลี่ยน (${b.count} → ${after})` };
        }
        if (a.state === "unchanged") {
          await sleep(800);
          const ok = (await uiSnapshot(page, tg)) === b.snap;
          return { ok, detail: ok ? "" : `${tg} เปลี่ยน (คาดไม่เปลี่ยน)` };
        }
        if (a.state === "changes" || b.vis) {
          let after: string | null = null;
          for (let i = 0; i < 20; i++) {
            after = await uiSnapshot(page, tg);
            if (after !== null && after !== b.snap) break;
            await sleep(200);
          }
          const ok = after !== null && after !== b.snap;
          return { ok, detail: ok ? "" : `${tg} ไม่เปลี่ยนภายใน 4 วิ` };
        }
        const ok = !!(await findVisible(page, tg, [], 5000));
        return { ok, detail: ok ? "" : `ไม่เห็น ${tg}` };
      };
      let ok = true;
      let detail = "";
      /** ผลหลักล้มแบบที่ anyOf ช่วยไม่ได้ (CD-P42-R8): ตอบ ≥ 400 · แถวเงิน/ตัวนับที่ไม่พบการเขียน/ถูกปฏิเสธ (เงินต้องพิสูจน์การเขียนเสมอ) */
      let hardFail = false;
      if (VIS.includes(ex.type)) {
        if (!visTids.length) detail = ex.type === "inline-error" ? "inline-error ไม่มีเป้า (อ่อน)" : "";
        else {
          const hit = visTids.find((x) => seen.has(x)) ?? (await anyVisible(visTids, 6000)); // H3
          ok = !!hit;
          detail = hit ? (hit !== ex.target ? `anyOf ${hit}` : "") : `ไม่เห็น ${visTids.join(" | ")} ภายใน 6 วิ`;
        }
      } else if (ex.type === "navigate") {
        if (!navPaths.length) {
          ok = false;
          detail = `target ไม่ใช่ path (${alts.map((a) => a.target).join(" | ")})`;
        } else ({ ok, detail } = await navNow(8000));
      } else if (ex.type === "ui") {
        if (!uiT) detail = isField ? "ค่าในช่องเปลี่ยน" : "มีผล (ไม่ตาย)";
        else ({ ok, detail } = await uiNow(alts[0]!));
      } else if (ex.type === "download") {
        await settle(page, 6000);
        let dl = DL.slice(dlBefore);
        for (let i = 0; i < 20 && !dl.some((d) => d.bytes > 0); i++) {
          await sleep(200);
          dl = DL.slice(dlBefore);
        }
        const attach = resp.slice(respBefore).find((r) => /attachment/i.test(r.disp) && r.status < 400);
        ok = dl.some((d) => d.bytes > 0) || !!attach;
        detail = ok ? "" : "ไม่พบไฟล์ดาวน์โหลดที่มีเนื้อหา";
      } else if (ex.type === "mutation") {
        await settle(page, 8000);
        const bad = resp.slice(respBefore).filter((r) => r.status >= 400);
        const wrote = nonGet > ngBefore;
        ok = wrote && !bad.length;
        if (bad.length) hardFail = true;
        let deferred = false;
        if (isField && !wrote && valueChanged) {
          deferred = await el.evaluate((e: Element) => !!e.closest('form, [role="dialog"], dialog, [data-testid$="-form"], [data-testid$="-sheet"], [data-testid$="-dialog"]')).catch(() => false);
          if (deferred) ok = true;
        }
        detail = !wrote && !deferred ? `ไม่มีคำขอเขียน${await pageSays(page).then((x) => (x ? ` · หน้าแสดง: ${x}` : ""))}` : bad.length ? `response ≥ 400: ${bad.slice(0, 2).map((r) => `${r.status} ${urlKey(r.url).slice(0, 60)}`).join(",")}` : "";
        if (ok && !deferred) {
          const na = (await alertsNow(page)).filter((x) => !alertsBefore.has(x));
          if (na.length) {
            ok = false;
            detail = `เซิร์ฟเวอร์ตอบปฏิเสธ: ${na.slice(0, 2).join(" | ")}`;
          }
        }
        if (ok && !deferred && it.verify === "db") {
          // db ที่ไม่มีโมเดลที่รู้จักเลย = ตรวจไม่ได้ ⇒ ไม่ผ่าน (เดิมผ่านเงียบ)
          let hit = false;
          if (!writes.length) detail = `db "${ex.db}" ไม่ระบุโมเดลที่รู้จัก (prisma) — ตรวจผลเขียนไม่ได้`;
          for (let t = Date.now() + 5000; !hit && Date.now() < t; ) {
            for (const w of writes) {
              // POS P4.3 walker fix1 ▸ H16: AppSystem.settings.pos.<k> = เทียบค่าก่อนรอบ (_qcP42Before) กับตอนนี้ — แทน updatedAt ของ AppSystem ใดก็ได้ของร้าน (fx writtenSince) ◂
              const r = w.pos?.length ? await posSettingsChanged(CTX, w.pos) : await writtenSince(w, pressedAt, delBefore.get(w.model) ?? null);
              if (r.ok) hit = true;
            }
            if (!hit) await sleep(400);
          }
          if (!hit) {
            ok = false;
            if (writes.length) detail = `ไม่พบการเขียนของ ${writes.map((w) => (w.pos?.length ? `${w.model}.settings.pos.{${w.pos.join(",")}} (ไม่ต่างจากก่อนกด)` : w.model)).join(" / ")} หลังกด (db "${ex.db}")`;
            if (!writes.length) hardFail = true;
          }
        } else if (ok && !deferred && it.verify === "oracle") detail = `ผลเขียนยืนยันด้วย oracle ${String(it.row.oracle).slice(0, 40)} (ไม่รันชุด)`;
        const rt = [ex.resultTarget, ex.target].find((x) => !!x && looksLikeTestid(x));
        if (ok && !deferred && rt && !seen.has(rt) && !(await findVisible(page, rt, [], 6000))) { // H3
          ok = false;
          detail = `ไม่เห็น ${rt} หลังกด`;
        }
      }
      // CD-P42-R8: หลักไม่ผ่าน ⇒ anyOf ข้อใดข้อหนึ่งผ่าน = ok (ป้าย/กล่อง · navigate · ui) — ไม่ช่วยเมื่อ hardFail · แถวเงิน mutation ต้องพิสูจน์การเขียน
      if (it.moneyUnit && ex.type === "mutation" && !ok) hardFail = true;
      if (!ok && !hardFail && alts.length > 1) {
        const v = alts.slice(1).filter((a) => VIS.includes(a.type) && looksLikeTestid(a.target)).map((a) => a.target);
        const hitV = v.find((x) => seen.has(x)) ?? (v.length ? await anyVisible(v, 1500) : null); // H3 (R1: toast 4 วิหายก่อนถึง anyOf)
        if (hitV) {
          ok = true;
          const refusal = alts.some((a) => a.target === hitV && a.type === "inline-error");
          detail = `${refusal ? "anyOf-refusal (ปฏิเสธตามที่ทะเบียนอนุญาต)" : "anyOf"} ${hitV} (หลัก: ${detail})`;
        }
        if (!ok && ex.type !== "navigate" && navPaths.length && (await navNow(1500)).ok) {
          ok = true;
          detail = `anyOf navigate (หลัก: ${detail})`;
        }
        for (const a of alts.slice(1)) {
          if (ok || a.type !== "ui") continue;
          const r = await uiNow(a);
          if (r.ok) {
            ok = true;
            detail = `anyOf ui ${a.target}${a.state ? ` ${a.state}` : ""} (หลัก: ${detail})`;
          }
        }
      }
      // CD-P42-R8 (CD-P41-F26): แถวคัดลอก — คลิปบอร์ดเปลี่ยน = ok · อ่านคลิปบอร์ดไม่ได้ = ข้อความบนหน้า ("คัดลอกแล้ว"/"Copied")
      if (!ok && !hardFail && clipRow) {
        const after = await clipboardRead(page);
        if (after !== null && after.len > 0 && after.hash !== clipBefore?.hash) {
          ok = true;
          detail = `คลิปบอร์ดได้ข้อความ ${after.len} ตัว (ไม่บันทึกเนื้อหา) · หลัก: ${detail}`;
        } else if (after === null) {
          const said: string = await el.evaluate((e: Element) => `${e.textContent ?? ""} ${e.getAttribute("aria-label") ?? ""} ${document.querySelector('[role="status"],[data-testid$="-toast"]')?.textContent ?? ""}`).catch(() => "");
          if (/คัดลอกแล้ว|copied/i.test(said)) {
            ok = true;
            detail = `อ่านคลิปบอร์ดไม่ได้ — ข้อความบนหน้า "คัดลอกแล้ว" · หลัก: ${detail}`;
          }
        }
      }
      if (notes.length) detail = `${detail}${detail ? " · " : ""}${notes.join(" · ")}`;
      await stopWatcher(); // H3
      // ── แถวเงิน: แถวเงินที่เกิดต้องอยู่สาขา posqc-btn ──
      if (it.moneyUnit) {
        // CD-P42-R13: แถวเงินที่เกิดใหม่หลังกด (createdAt · diff กับ id ก่อนกด · PosPayment ผ่าน saleId) — ไม่ใช่ updatedAt ของแถวเก่า
        const units = new Set<string>();
        const fresh = (await moneyRowsSince(pressedAt)).filter((x) => !moneyBefore.has(`${x.model}:${x.id}`));
        const touched = [...new Set(fresh.map((x) => x.model))];
        fresh.forEach((x) => units.add(x.unitId));
        MONEY.push({ key: it.key, testid: it.row.testid, units: [...units], models: touched });
        const outside = [...units].filter((u) => u !== BTN.unit.id);
        if (outside.length) {
          rec(it, { class: "error", detail: `money-outside-btn: แถวเงินลงสาขา ${outside.join(",")} (ต้อง ${BTN.unit.id}) · ${touched.join(",")}`, shot: await failShot(page, it), unit: outside.join(",") });
          state.dirty = true;
          continue;
        }
      }
      if (ok) rec(it, { class: "ok", detail: detail || undefined, unit: it.moneyUnit ? BTN.unit.id : undefined });
      else rec(it, { class: "wrongExpect", detail, shot: await failShot(page, it), unit: it.moneyUnit ? BTN.unit.id : undefined });
      // ── สถานะถัดไป (ผลบันทึกแล้ว — ข้อผิดพลาดตรงนี้ไม่ทับผล · ลงหน้าใหม่แทน) ──
      try {
        for (const t of tabs.splice(tabsBefore)) {
          try {
            await (await t.page())?.close();
          } catch {
            /* ข้าม */
          }
        }
        if (urlKey(page.url()) !== urlKey(urlBefore) || checkLike) state.dirty = true;
        else if (isField && ex.type !== "mutation" && !isSearchLike(it.row.testid, tag.split(":")[1] ?? "")) {
          /* ค่าในช่องคงสภาพหน้า (PREFILL ใช้ต่อ) */
        } else if (isField && isSearchLike(it.row.testid, tag.split(":")[1] ?? "")) state.dirty = true; // POS P4.3 walker fix1 ▸ H5: คำค้นค้างกรองรายการของแถวถัดไป ◂
        else if (ok && (ex.type === "modal" || (ex.type === "ui" && (ex.state ?? "appears") === "appears"))) state.openChain.push(it.row.testid);
        else state.dirty = true;
      } catch {
        state.dirty = true;
      }

    } catch (e) {
      rec(it, { class: "error", detail: e instanceof Error ? e.message.slice(0, 200) : String(e), shot: await failShot(page, it).catch(() => "") });
      state.dirty = true;
    } finally {
      if (stopWatcher) await stopWatcher().catch(() => {}); // H3: ทุกทางออก
      // คืนค่าหลังแถว (ทุกทางออก — ok/dead/skip/error) · ไม่โยน
      try {
        // CD-P42-R9: ตัวสลับภาษาตั้งคุกกี้ของทั้ง context — คืนภาษาของช่อง
        if (localeOfSwitch(it.row.testid)) {
          await resetLocale(page);
          state.dirty = true;
        }
        // CD-P42-R7 (CD-P41-F22): แถวผลข้างเคียง (ช่วงท้าย) — fixture คืนสิ่งที่คืนได้ในสาขา posqc-btn ทันที + settings
        if (sideEffectOf(it.row) && it.action === "press") {
          for (const x of await resetSideEffects(CTX, it.key)) CTX.restores.push(x);
          state.dirty = true;
        }
        // settings.pos · settings ของสาขา · ลิงก์บัญชี — ทุกแถวที่ส่งคำขอเขียน (ok/wrongExpect/dead/error/money-outside)
        if ((nonGet > ngRow || sideEffectOf(it.row)) && (await restoreSettingsIfChanged(CTX, it.key))) state.dirty = true;
      } catch (e) {
        CTX.restores.push({ label: `${it.key} · คืนค่าหลังแถว`, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
      }
      const r = RESULTS.get(it.key);
      if (r) r.ms = Date.now() - t1;
      const errs = cErrs.slice(errsBefore);
      const hyd = errs.filter((x) => HYDRATION_RE.test(x));
      const con = errs.filter((x) => !HYDRATION_RE.test(x));
      if (con.length) CONSOLE.push({ key: it.key, detail: con.slice(0, 3).join(" | ") });
      if (hyd.length) HYDRATION.push({ key: it.key, detail: hyd.slice(0, 2).join(" | ") });
      const h5 = resp.slice(respBefore).filter((x) => x.status >= 500);
      if (h5.length) HTTP.push({ key: it.key, detail: h5.slice(0, 3).map((x) => `${x.status} ${urlKey(x.url).slice(0, 80)}`).join(", ") });
      const ov = /^about:/.test(page.url()) ? "" : await overflowNow(page);
      if (ov && !ovfSeen.has(urlKey(page.url()))) {
        ovfSeen.add(urlKey(page.url()));
        OVERFLOW.push({ key: it.key, detail: `${ov} (url ${urlKey(page.url())})` });
      }
    }
  }
  BROWSER.off("targetcreated", onTarget);
  await ctxB.close().catch(() => {});
  PAGES.push({ path, status: navStatus, rows: group.length, ms: Date.now() - t0 });
  const okHere = group.filter((g) => RESULTS.get(g.key)?.class === "ok").length;
  console.log(`  ${path.slice(0, 90)} — ${okHere}/${group.length} ok · HTTP ${navStatus} · ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
}

// ═════════════════════════ สรุป ═════════════════════════
function writeSummary(): void {
  const rows = PLAN.items.map((it) => RESULTS.get(it.key) ?? { key: it.key, page: it.row.page, testid: it.row.testid, class: "error" as const, detail: FATAL ? `ไม่ได้รัน (${FATAL.slice(0, 80)})` : "ไม่ได้รัน", safety: it.safety });
  const n = (c: Result["class"]) => rows.filter((r) => r.class === c).length;
  const perReason: Record<string, number> = {};
  for (const r of rows) if (r.class === "skip") perReason[r.reason ?? "?"] = (perReason[r.reason ?? "?"] ?? 0) + 1;
  const S = {
    suite: SUITE, at: new Date().toISOString(), head: HEAD, base: BASE, dbHost: dbHost(), registryHash: REG.hash, p41Sha: RULES.sourceHash,
    oracleIdsHash: sha16([...ORACLE_IDS].sort().join(",")),
    cell: CELL, page: PAGE, only: ONLY, unit: BTN.unit.id, deviceCode: CTX.deviceCode,
    total: rows.length, ok: n("ok"), dead: n("dead"), wrongExpect: n("wrongExpect"), hiddenLeak: n("hiddenLeak"), skip: n("skip"), error: n("error"), perReason,
    consoleErrors: CONSOLE, hydration: HYDRATION, overflow: OVERFLOW, http5xx: HTTP, moneyPresses: MONEY, restores: CTX.restores, fixtureLog: CTX.log,
    pages: PAGES, ms: Date.now() - START_MS, fatal: FATAL || null, rows,
  };
  try {
    mkdirSync(SHOTS_DIR, { recursive: true });
    writeFileSync(summaryFile(CELL), JSON.stringify(S, null, 2));
  } catch (e) {
    console.error(`⚠️ เขียนสรุปไม่ได้: ${e instanceof Error ? e.message : e}`);
  }
  const passBar = !S.fatal && S.ok === S.total - S.skip && !S.dead && !S.wrongExpect && !S.hiddenLeak && !S.error && !S.consoleErrors.length && !S.hydration.length && !S.overflow.length && S.restores.every((r) => r.ok);
  console.log(`\n${passBar ? "🟢" : "🔴"} ${SUITE} ${cellName(CELL)}: ok ${S.ok}/${S.total} · skip ${S.skip} · dead ${S.dead} · wrongExpect ${S.wrongExpect} · hiddenLeak ${S.hiddenLeak} · error ${S.error} · console ${S.consoleErrors.length} · hydration ${S.hydration.length} · overflow ${S.overflow.length} · money ${S.moneyPresses.length} · ${(S.ms / 60000).toFixed(1)} นาที → ${summaryFile(CELL)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, cell: cellName(CELL), total: S.total, passed: S.ok, ok: S.ok, dead: S.dead, wrongExpect: S.wrongExpect, hiddenLeak: S.hiddenLeak, skip: S.skip, error: S.error, perReason, consoleErrors: S.consoleErrors.length, hydration: S.hydration.length, overflow: S.overflow.length, moneyPresses: S.moneyPresses.length, restoreFailures: S.restores.filter((r) => !r.ok).length, fatal: S.fatal })}`);
}

// ═════════════════════════ main ═════════════════════════
console.log(`═══ ${SUITE} · ช่อง ${cellName(CELL)} · หน้า ${PAGE}${ONLY ? ` · only ${ONLY}` : ""} · ${PLAN.total} แถว (${Object.entries(PLAN.byAction).map(([k, v]) => `${k} ${v}`).join(" · ")}) · base ${BASE} · DB ${dbHost()} · head ${HEAD} ═══`);
try {
  const pf = await preflight(T, [CELL.user]);
  const blocks = pf.filter((x) => x.state === "block");
  for (const x of pf) if (x.state !== "ok") console.log(`  PF ${x.state} ${x.key} ${x.value}`);
  if (blocks.length) throw new Error(`pre-flight มีข้อขวาง: ${blocks.map((b) => `${b.key} (${b.value.slice(0, 60)})`).join(" · ")}`);
  const pos = await P.appSystem.findFirst({ where: { id: CTX.sys, tenantId: QC_TENANT }, select: { settings: true } });
  OFFLINE_ON = (pos?.settings as Any)?.pos?.offline?.enabled === true;
  await ensureFixtures(CTX, CELL.user);
  console.log(`  fixture: ${CTX.log.join(" · ") || "มีครบแล้ว"} · เครื่อง ${CTX.deviceCode}${CTX.shiftId ? ` · กะ ${CTX.shiftId}` : ""} · สินค้าตะกร้า ${CTX.cartProductIds.length} · โทเคน ${Object.entries(CTX.tokens).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ")} · offline ${OFFLINE_ON ? "เปิด (เว้น 61 วิ)" : "ปิด"}`);
  const cookies = await mintCookies();
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as Any;
  BROWSER = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE[0]}`] });
  const groups = new Map<string, PlanItem[]>();
  // CD-P42-R7 (CD-P41-F22): แถวผลข้างเคียง (กดจริง) = ช่วงท้ายของรอบ หลังทุกหน้า · fixture คืนค่าหลังแต่ละแถว
  const late = new Map<string, PlanItem[]>();
  for (const it of PLAN.items) {
    if (it.action === "skip") continue;
    const { path, missing } = pathOf(it);
    if (!path) {
      rec(it, { class: "skip", reason: "needs-fixture", detail: `หาค่า ${missing} ไม่ได้` });
      continue;
    }
    const g = it.action === "press" && sideEffectOf(it.row) ? late : groups;
    g.set(path, [...(g.get(path) ?? []), it]);
  }
  const lateOrder = [...late.entries()].sort((a, b) => Math.max(...a[1].map((x) => sideEffectRank(x.row))) - Math.max(...b[1].map((x) => sideEffectRank(x.row))));
  const total = groups.size + lateOrder.length;
  let gi = 0;
  for (const [path, group] of [...groups.entries(), ...lateOrder]) {
    gi++;
    process.stdout.write(`[${gi}/${total}${gi > groups.size ? " ช่วงท้าย" : ""}] `);
    try {
      await runGroup(path, group, cookies);
    } catch (e) {
      // ตั้งหน้าไม่ได้ (context/หน้าใหม่ล้ม) — แถวของกลุ่มที่ยังไม่มีผล = error · กลุ่มถัดไป (รวมช่วงท้ายที่คืนค่า) ยังเดินต่อ
      const msg = `กลุ่มหน้า ${path.slice(0, 80)} ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
      console.error(`  ❌ ${msg}`);
      for (const it of group) if (!RESULTS.has(it.key)) rec(it, { class: "error", detail: msg });
    }
  }
} catch (e) {
  FATAL = e instanceof Error ? e.message.slice(0, 400) : String(e);
  console.error(`❌ ${FATAL}`);
} finally {
  await cleanupAll("finally");
  for (const r of CTX.restores) if (!r.ok) console.log(`  ❌ คืนค่า ${r.label}: ${r.detail}`);
  if (existsSync(`${SHOTS_DIR}/dl`)) rmSync(`${SHOTS_DIR}/dl`, { recursive: true, force: true });
  writeSummary();
  await P.$disconnect().catch(() => {});
}
process.exit(FATAL ? 2 : 0);
