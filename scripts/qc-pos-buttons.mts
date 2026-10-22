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
// 🔴 ห้ามแก้ scripts/visual-pos.mts (หมุด ⚠️5) — ตัวช่วยที่ต้องใช้คัดลอกมาเป็นของไฟล์นี้ · fixture ทั้งหมดอยู่ใน pos-buttons-fixtures.mts
// 🔴 รอบจริง: QC5 เท่านั้น (host ep-fragrant-thunder) · ต้องอยู่ใต้ with-gate-lock (SHARK_GATE_LOCK_MARKER) · pre-flight มีข้อขวาง = ไม่เริ่ม ·
//    ไม่ต่อเครือข่ายนอกเซิร์ฟเวอร์ QC (globalThis.fetch ถูกครอบ) · session ที่ mint ลบเสมอ (finally + สัญญาณ) · โปรไฟล์ chromium ลบเสมอ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  BTN, DEVICES, PASS_MATRIX, REGISTRY_GAP_REASONS, SHOTS_DIR, SKIP_REASONS, STAFF, MONEY_MODELS_UNIT, QC_TENANT,
  assertWritable, cellName, cellRows, classify, cleanupFixtures, countTenant, db, dbHost, dbNow, ensureFixtures, estimateSec, loadP41Rules, modelInfo,
  newCtx, planCell, preflight, readRegistry, restoreSettingsIfChanged, rowKey, sha16, summaryFile, writesOf, writtenSince,
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
  console.log(`  รวม ${all.length} ช่อง ≈ ${fmtMin(sum)} ชม. (วันนี้ — แถวที่ skip เพราะทะเบียนยังไม่เติมจะกลายเป็น press หลังผู้สร้าง P4.1 ⇒ เวลาเพิ่ม)`);
  for (const p of ps) {
    console.log(`\n── แผนช่อง ${cellName(p.cell)} · หน้า ${PAGE}${ONLY ? ` · only ${ONLY}` : ""}: ${p.total} แถว · ${Object.entries(p.byAction).map(([k, v]) => `${k} ${v}`).join(" · ")} ──`);
    const byReason = new Map<string, PlanItem[]>();
    for (const it of p.items) if (it.reason) byReason.set(it.reason, [...(byReason.get(it.reason) ?? []), it]);
    for (const [r, list] of byReason) console.log(`  ⏭️  ${String(list.length).padStart(4)} × ${r} — ${SKIP_REASONS[r as SkipReason]} · เช่น ${list.slice(0, 4).map((x) => x.row.testid).join(", ")}`);
    const money = p.items.filter((it) => it.action === "press" && it.moneyUnit);
    console.log(`  💰 money/counter ที่จะกด (สาขา ${BTN.unit.id} · ครั้งเดียวต่อรอบ): ${money.length}${money.length ? ` — ${money.slice(0, 8).map((x) => x.row.testid).join(", ")}` : ""}`);
    const ext = p.items.filter((it) => it.reason === "external");
    console.log(`  🛡️ external (ไม่กด · อ้าง oracle): ${ext.length}${ext.length ? ` — ${ext.slice(0, 6).map((x) => `${x.row.testid} (${x.detail})`).join(", ")}` : ""}`);
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
/** ตัวแรกที่มองเห็น (คู่ desktop/mobile ใช้ testid เดียว) · แพตเทิร์น = ตัวแรกที่กดได้จริง ไม่อยู่ใน notList · waitMs > 0 = รอถี่ 200 ms */
async function findVisible(page: Any, testid: string, notList: string[] = [], waitMs = 0): Promise<Any | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const h = await page
      .evaluateHandle((pSel: string, nots: string[], pattern: boolean, glob: string) => {
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
          if (!vis(el)) continue;
          if (!pattern) return el;
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role") ?? "";
          const idle = (el as HTMLButtonElement).disabled === true || ["aria-pressed", "aria-selected"].some((a) => el.getAttribute(a) === "true");
          if ((["button", "input", "select", "textarea", "summary"].includes(tag) || (tag === "a" && el.hasAttribute("href")) || ["button", "link", "menuitem", "tab", "switch", "checkbox", "option", "radio"].includes(role)) && !idle) return el;
          fallback ??= el;
        }
        return fallback;
      }, selOf(testid), notList, testid.includes("*"), testid)
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
  const u = `${RAND}${(++fillSeq).toString(36)}`;
  if (type === "email" || /email/.test(t)) return `qc-btn-${u}@example.com`;
  if (type === "tel" || /phone|tel$/.test(t)) return `08${String(randomDigits(8))}`;
  if (/taxid|tax-id/.test(t)) return "0105559012342";
  if (/branch/.test(t)) return "00000";
  if (/pin/.test(t)) return CTX.pin || "135790";
  if (/barcode|ean/.test(t)) return "8850999000015";
  if (type === "url" || /url$|website/.test(t)) return `https://qc-btn-${u}.example.com`;
  if (type === "time") return "09:00";
  if (type === "date" || /date|from$|to$/.test(t)) return todayBkk();
  if (type === "datetime-local") return `${todayBkk()}T10:00`;
  if (type === "month") return todayBkk().slice(0, 7);
  if (type === "color") return "#123456";
  if (/(pct|percent|rate|bp)$/.test(t)) return "10";
  if (/(qty|count|seats|party|minutes|hours|days|limit|max|min)/.test(t) || type === "number" || type === "range") return "2";
  if (/(price|amount|satang|float|cash|tender|discount|deposit|credit|value|total|baht)/.test(t)) return "20";
  if (/(search|query|-q$|find)/.test(t)) return "ลาเต้";
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
    if (cand) await el.select(cand.value);
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
    await page.keyboard.type(differ(fillValueFor(testid, eff), meta.value), { delay: 5 });
    await page.keyboard.press("Tab");
  } else await clickEl(page, el); // สวิตช์ที่เป็นปุ่ม
  await sleep(150);
  return { before, after: await snap() };
}
function navMatches(target: string, url: string): boolean {
  if (target.startsWith("#")) {
    try {
      return new URL(url).hash === target;
    } catch {
      return false;
    }
  }
  if (!target.startsWith("/")) return false;
  const pat = target.split("?")[0]!.split(/(\[[^\]]+\]|<[^>]+>|\*)/g).map((p) => (/^(\[[^\]]+\]|<[^>]+>|\*)$/.test(p) ? "[^/]+" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* url เป็น path อยู่แล้ว */
  }
  return new RegExp(`^${pat}(?:$|/|\\?)`).test(path);
}
const urlKey = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.pathname}${x.search}`;
  } catch {
    return u;
  }
};
const ALERT_IGNORE: string[] = [];
async function alertsNow(page: Any): Promise<string[]> {
  return page
    .evaluate((ign: string[]) => Array.from(document.querySelectorAll('[role="alert"],[data-testid$="-error"]:not([role="status"])')).filter((e) => (e as HTMLElement).offsetParent !== null && (e.textContent ?? "").trim() && !ign.includes(e.getAttribute("data-testid") ?? "")).map((e) => `${e.getAttribute("data-testid") ?? "alert"}: ${(e.textContent ?? "").trim().slice(0, 140)}`), ALERT_IGNORE)
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
const splitOpener = (o: string): { tid: string; val: string | null } => {
  const i = o.indexOf("=");
  return i < 0 ? { tid: o, val: null } : { tid: o.slice(0, i), val: o.slice(i + 1) };
};
type PageState = { openChain: string[]; dirty: boolean };
const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((x, i) => x === b[i]);
/** ไล่ opener (เฉพาะขั้นที่ยังต้องกด) แล้วหาคอนโทรลของแถว — แบบเดียวกับ C4.2 */
async function reveal(page: Any, path: string, it: PlanItem, state: PageState, hidden: boolean, notList: string[]): Promise<{ el: Any | null; reason: string }> {
  const chain = it.opener;
  const pendingValue = chain.slice(state.openChain.length).some((o) => splitOpener(o).val !== null);
  let el = await findVisible(page, it.row.testid, notList, 0);
  if (el && !pendingValue) return { el, reason: "" };
  for (let i = state.openChain.length; i < chain.length; i++) {
    const { tid, val } = splitOpener(chain[i]!);
    let later = false;
    if (val === null) {
      for (const t of chain.slice(i + 1)) if (await findVisible(page, splitOpener(t).tid, [], 0)) later = true;
      if (!later && (await findVisible(page, it.row.testid, notList, 0))) later = true;
    }
    if (later) {
      state.openChain.push(chain[i]!);
      continue;
    }
    const op = await findVisible(page, tid, [], el ? 600 : hidden ? 1500 : 3500);
    if (!op) return { el: null, reason: `ตัวเปิด ${chain[i]} หาไม่พบ (ลำดับ ${chain.join(" → ")})` };
    if (val === null || val === "click") await clickEl(page, op).catch(() => {});
    else if (val === "on" || val === "off") {
      const on: boolean = await op.evaluate((e: HTMLInputElement) => (e.tagName === "INPUT" ? e.checked : e.getAttribute("aria-checked") === "true" || e.getAttribute("aria-selected") === "true")).catch(() => false);
      if (on !== (val === "on")) await clickEl(page, op).catch(() => {});
    } else if (val === "*") await fillEl(page, op, tid).catch(() => {});
    else {
      const tag: string = await op.evaluate((e: Element) => e.tagName.toLowerCase()).catch(() => "");
      if (tag === "select") await op.select(val).catch(() => {});
      else
        await op.evaluate((e: HTMLInputElement, v: string) => {
          Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(e, v);
          e.dispatchEvent(new Event("input", { bubbles: true }));
          e.dispatchEvent(new Event("change", { bubbles: true }));
        }, val).catch(() => {});
    }
    await settle(page, 3000);
    await sleep(250);
    state.openChain.push(chain[i]!);
    if (urlKey(page.url()) !== urlKey(`${BASE}${path}`)) state.dirty = true;
  }
  el = await findVisible(page, it.row.testid, notList, hidden ? 800 : chain.length ? 4000 : 2500);
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
    const empty = await se.evaluate((x: Any) => {
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
function pathOf(it: PlanItem): { path: string | null; missing: string | null } {
  let p = it.row.page.replace("[id]", CTX.sys);
  const tok = (k: string) => CTX.tokens[k] ?? null;
  for (const m of p.matchAll(/\[([A-Za-z]+)\]/g)) {
    const v = m[1] === "unitSlug" ? null : tok(m[1]!);
    if (!v) return { path: null, missing: `[${m[1]}]` };
    p = p.replace(m[0], encodeURIComponent(v));
  }
  let q = String(it.row.query ?? "");
  for (const m of q.matchAll(/\[([A-Za-z]+)\]/g)) {
    const k = m[1]!;
    const v = k === "unitId" ? BTN.unit.id : k === "date" ? todayBkk() : tok(k);
    if (!v) return { path: null, missing: `[${k}]` };
    q = q.replace(m[0], encodeURIComponent(v));
  }
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
let cleanedAll = false;
async function cleanupAll(why: string): Promise<void> {
  if (cleanedAll) return;
  cleanedAll = true;
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
  const state: PageState = { openChain: [], dirty: true };
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
  const rank = (it: PlanItem) => (it.moneyUnit ? 2 : it.needs ? 1 : 0);
  const rows = [...group].sort((a, b) => rank(a) - rank(b) || a.idx - b.idx);
  const allNames = REG.rows.filter((r) => r.page === group[0]!.row.page).map((r) => r.testid);
  for (const it of rows) {
    const t1 = Date.now();
    const errsBefore = cErrs.length;
    const respBefore = resp.length;
    const notList = it.row.testid.includes("*") ? allNames.filter((n) => n !== it.row.testid && globRe0(it.row.testid).test(n)) : [];
    try {
      if (state.dirty || urlKey(page.url()) !== urlKey(`${BASE}${path}`) || !isPrefix(state.openChain, it.opener)) await load();
      if (it.action === "absent") {
        const rv = await reveal(page, path, it, state, navStatus >= 400, notList);
        if (rv.el) rec(it, { class: "hiddenLeak", detail: "อยู่ใน hiddenFor แต่มองเห็นได้", shot: await failShot(page, it) });
        else rec(it, { class: "ok", detail: `ไม่เห็น (hiddenFor${navStatus >= 400 ? ` · หน้า HTTP ${navStatus}` : ""})` });
        continue;
      }
      if (it.action === "visible") {
        const rv = await reveal(page, path, it, state, false, notList);
        if (!rv.el) {
          if (it.needs) rec(it, { class: "skip", reason: "needs", detail: rv.reason });
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
      if (!rv.el) {
        if (it.needs) rec(it, { class: "skip", reason: "needs", detail: rv.reason });
        else rec(it, { class: "dead", detail: `${rv.reason}${navStatus >= 400 ? ` · หน้า HTTP ${navStatus}` : ""}`, shot: await failShot(page, it) });
        continue;
      }
      let el = rv.el;
      let prefilled: string[] = [];
      if (it.row.expect.type === "mutation" || it.row.expect.type === "download" || it.row.kind === "form") {
        prefilled = await prefill(page, it, group, el);
        if (prefilled.length) el = (await findVisible(page, it.row.testid, notList, 1500)) ?? el;
      }
      const tag: string = await el.evaluate((e: Element) => `${e.tagName.toLowerCase()}:${(e.getAttribute("type") ?? "").toLowerCase()}`).catch(() => "");
      if (tag === "input:file") {
        rec(it, { class: "skip", reason: "file-upload", detail: "input[type=file]" });
        continue;
      }
      const isField = /^(input|textarea|select):/.test(tag);
      const checkLike = /^input:(checkbox|radio)$/.test(tag) || ["switch", "checkbox", "radio"].includes(await el.evaluate((e: Element) => e.getAttribute("role") ?? "").catch(() => ""));
      const ex = it.row.expect;
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
      const uiBefore = uiT ? await uiSnapshot(page, uiT) : null;
      const visBefore = uiT ? !!(await findVisible(page, uiT, [], 0)) : false;
      const countBefore = uiT && ex.state === "count" ? await countVisible(page, uiT) : -1;
      const models = await modelInfo();
      const writes = ex.type === "mutation" && it.verify === "db" ? writesOf(ex.db, new Set(models.keys())) : [];
      const delBefore = new Map<string, number | null>();
      for (const w of writes) if (w.del) delBefore.set(w.model, await countTenant(w.model));
      const pressedAt = ex.type === "mutation" || it.moneyUnit ? await dbNow() : new Date();
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
          valueChanged = r.before !== r.after;
        } else await clickEl(page, el);
      } catch (e) {
        actErr = e instanceof Error ? e.message.slice(0, 160) : String(e);
      }
      if (it.moneyUnit) PRESSED_ONCE.add(it.key);
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
        const dis: boolean = await el.evaluate((e: Any) => !!e.disabled || e.getAttribute("aria-disabled") === "true").catch(() => false);
        if (it.needs && dis) rec(it, { class: "skip", reason: "needs", detail: "คอนโทรลมีแต่ disabled (needs)" });
        else rec(it, { class: actErr ? "error" : "dead", detail: actErr || `ไม่มี DOM mutation/navigation/network ภายใน 3 วิ${dis ? " · disabled ตอนกด" : ""}${prefilled.length ? ` · prefill ${prefilled.join(",")}` : ""}`, shot: await failShot(page, it) });
        state.dirty = true;
        continue;
      }
      // ── คาด ──
      let ok = true;
      let detail = "";
      const cands = [ex.target, ...(ex.anyOf ?? [])].filter((x): x is string => !!x);
      if (ex.type === "modal" || ex.type === "toast" || ex.type === "inline-error") {
        const tids = cands.filter(looksLikeTestid);
        if (!tids.length) detail = ex.type === "inline-error" ? "inline-error ไม่มีเป้า (อ่อน)" : "";
        else {
          let found = false;
          for (let t = Date.now() + 6000; !found && Date.now() < t; ) {
            for (const c of tids) if (await findVisible(page, c, [], 0)) found = true;
            if (!found) await sleep(200);
          }
          ok = found;
          detail = found ? "" : `ไม่เห็น ${tids.join(" | ")} ภายใน 6 วิ`;
        }
      } else if (ex.type === "navigate") {
        const paths = cands.filter((c) => c.startsWith("/") || c.startsWith("#"));
        if (!paths.length) {
          ok = false;
          detail = `target ไม่ใช่ path (${cands.join(" | ")})`;
        } else {
          ok = false;
          for (let i = 0; i < 40 && !ok; i++) {
            const urls = [page.url(), ...tabs.slice(tabsBefore).map((t: Any) => String(t.url?.() ?? ""))];
            ok = urls.some((u) => paths.some((t) => navMatches(t, u)));
            if (!ok) await sleep(200);
          }
          const navBad = resp.slice(respBefore).filter((r) => r.nav && r.status >= 400);
          if (ok && navBad.length) {
            ok = false;
            detail = `ปลายทางตอบ HTTP ${navBad[0]!.status}`;
          } else if (!ok) detail = `url=${urlKey(page.url())} ไม่ตรง ${paths.join(" | ")}`;
        }
      } else if (ex.type === "ui") {
        if (!uiT) detail = isField ? "ค่าในช่องเปลี่ยน" : "มีผล (ไม่ตาย)";
        else if (ex.state === "disappears") {
          let gone = false;
          for (let i = 0; i < 20 && !gone; i++) {
            gone = !(await findVisible(page, uiT, [], 0));
            if (!gone) await sleep(150);
          }
          ok = gone;
          detail = gone ? "" : `${uiT} ยังเห็นอยู่`;
        } else if (ex.state === "selected") {
          const s = await findVisible(page, uiT, [], 3000);
          ok = !!s && (await s.evaluate((e: Element) => ["aria-selected", "aria-pressed", "aria-checked"].some((a) => e.getAttribute(a) === "true") || (e.hasAttribute("aria-current") && e.getAttribute("aria-current") !== "false")).catch(() => false));
          detail = ok ? "" : `${uiT} ไม่ประกาศสถานะเลือก`;
        } else if (ex.state === "count") {
          let after = countBefore;
          for (let i = 0; i < 20 && after === countBefore; i++) {
            await sleep(200);
            after = await countVisible(page, uiT);
          }
          ok = after >= 0 && after !== countBefore;
          detail = ok ? "" : `จำนวน ${uiT} ไม่เปลี่ยน (${countBefore} → ${after})`;
        } else if (ex.state === "unchanged") {
          await sleep(800);
          const after = await uiSnapshot(page, uiT);
          ok = after === uiBefore;
          detail = ok ? "" : `${uiT} เปลี่ยน (คาดไม่เปลี่ยน)`;
        } else if (ex.state === "changes" || visBefore) {
          let after: string | null = null;
          for (let i = 0; i < 20; i++) {
            after = await uiSnapshot(page, uiT);
            if (after !== null && after !== uiBefore) break;
            await sleep(200);
          }
          ok = after !== null && after !== uiBefore;
          detail = ok ? "" : `${uiT} ไม่เปลี่ยนภายใน 4 วิ`;
        } else {
          ok = !!(await findVisible(page, uiT, [], 5000));
          detail = ok ? "" : `ไม่เห็น ${uiT}`;
        }
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
          let hit = writes.length === 0;
          const units = new Set<string>();
          for (let t = Date.now() + 5000; !hit && Date.now() < t; ) {
            for (const w of writes) {
              const r = await writtenSince(w, pressedAt, delBefore.get(w.model) ?? null);
              r.units.forEach((u) => units.add(u));
              if (r.ok) hit = true;
            }
            if (!hit) await sleep(400);
          }
          if (!hit) {
            ok = false;
            detail = `ไม่พบการเขียนของ ${writes.map((w) => w.model).join(" / ")} หลังกด (db "${ex.db}")`;
          }
        } else if (ok && !deferred && it.verify === "oracle") detail = `ผลเขียนยืนยันด้วย oracle ${String(it.row.oracle).slice(0, 40)} (ไม่รันชุด)`;
        const rt = [ex.resultTarget, ex.target].find((x) => !!x && looksLikeTestid(x));
        if (ok && !deferred && rt && !(await findVisible(page, rt, [], 6000))) {
          ok = false;
          detail = `ไม่เห็น ${rt} หลังกด`;
        }
      }
      // ── แถวเงิน: แถวเงินที่เกิดต้องอยู่สาขา posqc-btn ──
      if (it.moneyUnit) {
        const units = new Set<string>();
        const touched: string[] = [];
        for (const m of MONEY_MODELS_UNIT) {
          const r = await writtenSince({ model: m, del: false }, pressedAt, null);
          if (r.ok) touched.push(m);
          r.units.forEach((u) => units.add(u));
        }
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
      // ── สถานะถัดไป ──
      for (const t of tabs.splice(tabsBefore)) {
        try {
          await (await t.page())?.close();
        } catch {
          /* ข้าม */
        }
      }
      if (urlKey(page.url()) !== urlKey(urlBefore) || checkLike) state.dirty = true;
      else if (isField && ex.type !== "mutation") {
        /* ค่าในช่องคงสภาพหน้า (PREFILL ใช้ต่อ) */
      } else if (ok && (ex.type === "modal" || (ex.type === "ui" && (ex.state ?? "appears") === "appears"))) state.openChain.push(it.row.testid);
      else state.dirty = true;
      if (nonGet > ngBefore && (await restoreSettingsIfChanged(CTX, it.key))) state.dirty = true;
    } catch (e) {
      rec(it, { class: "error", detail: e instanceof Error ? e.message.slice(0, 200) : String(e), shot: await failShot(page, it).catch(() => "") });
      state.dirty = true;
    } finally {
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
  for (const it of PLAN.items) {
    if (it.action === "skip") continue;
    const { path, missing } = pathOf(it);
    if (!path) {
      rec(it, { class: "skip", reason: "needs-fixture", detail: `หาค่า ${missing} ไม่ได้` });
      continue;
    }
    groups.set(path, [...(groups.get(path) ?? []), it]);
  }
  let gi = 0;
  for (const [path, group] of groups) {
    gi++;
    process.stdout.write(`[${gi}/${groups.size}] `);
    await runGroup(path, group, cookies);
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
