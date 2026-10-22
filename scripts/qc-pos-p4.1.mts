// QC — POS RUN ใบ P4.1 (S): ทะเบียนปุ่ม/ฟอร์มครบทุกจอ — ฟิลด์ของตัวกด (target · db · opener · needs · viewport · safety · บทบาท public) +
//   ปิดหนี้ปุ่มไร้ testid ในขอบเขต + $mockupGaps · เขียนก่อนสร้าง (red-before) · ผู้เขียนข้อสอบ (บัญชี B · 22 ต.ค. 2026)
//   ข้อสอบสถิตล้วน: ไม่แตะ DB · ไม่ต่อเครือข่าย · ไม่ import "@/…" · ไม่เขียนไฟล์ในทรี (ตัวพิสูจน์ R7 ใช้โฟลเดอร์ชั่วคราวใน os.tmpdir() แล้วลบทิ้ง — Z1)
//   requires: (ไม่มี seed — ข้อสอบสถิต)
//
// สัญญา: ledger/pos-briefs/pos-brief-P4.md §2 (ตัวเลขทะเบียน) · §4 P4.1 R1–R14 · §8 · §10 มติ 1–9 + addendum (W29 หน้าขายเดิม OUT · W30) ·
//        prompt ledger/pos-briefs/pos-prompt-accountB-P4.1-ORACLE.md · โน้ต ledger/wo-notes/pos-P4.1-oracle.md
//        (ตาราง id ↔ brief · ผลแดงก่อนสร้าง · สถิติที่ผู้สร้างต้องทำให้เป็น 0 · เมล็ด $mockupGaps · CD-P41-O1…)
// ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT โดยผู้คุมเท่านั้น · ทุกข้อยกเว้นต้องมี probe ลบจดในโน้ต)
//
// ของที่ผู้สร้าง P4.1 ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   scripts/pos-ui-inventory.json — ทุกแถว: expect.target (หรือ ui + state) · mutation: expect.db "<Model> <ฟิลด์/สถานะ>" หรือ oracle = id ข้อสอบ DB ที่มีจริง ·
//     opener/needs/viewport ตามสคีมา $fields · แถวหน้า /r /q /d /developers = roles ["public"] · แถวการ์ดปฏิเสธ (ui · state "refused") ·
//     safety บนแถวเงิน/ภายนอก/เลขเอกสาร · baselineDebt ในขอบเขต = 0 (ใส่ testid ในโค้ด + ลดตัวเลข) · $legacyOut (W29) · $mockupGaps
//   src/** — data-testid ของหนี้ 19 จุดในขอบเขต (products 12 · close 3 · CloseDayTools 2 · sales 1 · shifts 1) · หน้าขายเดิม (register-ui.tsx 22 ·
//     register-legacy-page.tsx 5) อยู่นอกขอบเขต (มติ 3 · W29) — ตัวเลขหนี้คงเดิม
//
// 🔴 ทุกข้อพิสูจน์ตัวเองว่า "แดงได้" ด้วย probe: สำเนาทะเบียนในหน่วยความจำที่ถูกทำให้ผิดหนึ่งจุด → ฟังก์ชันตรวจเดียวกันต้องแดง ·
//    probe ไม่แดง = ข้อนั้นแดง (ข้อสอบตรวจอะไรไม่ได้) · R7 ใช้สำเนาทะเบียนในโฟลเดอร์ชั่วคราว (src = symlink อ่านอย่างเดียว)
//    --list = พิมพ์ทุก id · --no-db = โหมดเดียวกับปกติ (ข้อสอบนี้ไม่มีส่วน DB) · exit 1 เมื่อแดง
//    หมุด: PIN = ฐานที่ข้อสอบเขียน (env P41_PIN) — ใช้ข้อเดียว: R5 ปิดหนี้ด้วยการ "ใส่ testid" ไม่ใช่ "ลบปุ่ม" (นับ element กดได้ของไฟล์หนี้ที่ PIN ด้วย git show)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUITE = "qc-pos-p4.1";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const PFX = "P4.1";
const PIN = process.env.P41_PIN || "6e32c1e2"; // ฐานที่เขียนข้อสอบ (origin/session/pos 22 ต.ค. 06:2xZ) — R5 นับปุ่มของไฟล์หนี้ที่หมุดนี้

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) ═════════════════════════
// X-group: S สถิต (ทุกข้อของใบนี้) · "-" คืนสภาพ
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`${PFX}-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  D("R1", "S", "[§4 R1 · G1] ทุกแถวมี expect.target (ไม่ว่าง) หรือ expect.type ui พร้อม state"),
  D("R2", "S", "[§4 R2 · G1] ทุกแถว mutation มี expect.db = \"<Model ที่มีใน prisma/schema> <ฟิลด์/สถานะ>\" หรือ oracle ที่ระบุ id ข้อสอบ DB ที่มีจริงใน --list ของ qc-pos-* (อ่านไฟล์ ไม่รัน · ไม่นับกลุ่ม S/P)"),
  D("R3", "S", "[§4 R3 · มติ 2] $fields อธิบาย opener · needs · viewport · safety · คีย์ที่มีในแถวถูกรูป: opener = testid ของแถวบนหน้าเดียวกัน (แพตเทิร์น * ได้ · \"<testid>=<ค่า>\") ไม่ชี้ตัวเอง ไม่ซ้ำ ไม่วน · needs = ข้อความ ≥ 4 ตัว · viewport ∈ desktop|tablet|mobile (ไม่ครบทั้ง 3)"),
  D("R4", "S", "[§4 R4 · ⚠️3 · มติ 2] บทบาท public: $roles + ROW_ROLES ของ fitness-pos มี public · แถวหน้า /r /q /d /developers = roles [\"public\"] เท่านั้น · แถวหน้าพนักงานไม่มี public"),
  D("R5", "S", "[§4 R5 · ⚠️4 · มติ 3 · W29] baselineDebt = 0 ทุกไฟล์ในขอบเขต (ทะเบียน + สแกนจริง) · $legacyOut = register-ui.tsx + register-legacy-page.tsx (W29) · ไฟล์หนี้ ณ PIN ปุ่มกดได้ไม่ลดลง (ปิดหนี้ = ใส่ testid ไม่ใช่ลบปุ่ม)"),
  D("R6", "S", "[§4 R6 · G6] mockup ครบ: ต่อ ledger/design-pos/NN.body.html นับปุ่ม/ลิงก์/ช่องกรอก เทียบแถวทะเบียนของหน้าที่แมป — ส่วนต่าง > 0 ต้องมีรายการ $mockupGaps (mockup · bucket · gap ตรงตัว · reason) · ไม่มีรายการค้าง · ทุก mockup ถูกแมป"),
  D("R7", "S", "[§4 R7] F15.3a + F15.3b ของ scripts/fitness-pos.mts เขียว (runPosFitness ตัวจริง) · probe: สำเนาทะเบียนที่มีแถวผี + ขาดแถวปุ่มจริง → ทั้งสองแดง"),
  D("R8", "S", "[§4 R8] ไม่มี testid ผีในข้อสอบ: ทุก testid ที่ qc-pos-* / visual-pos.mts อ้าง (tid(…) · [data-testid=…] · getByTestId) มีในทะเบียน หรือในโค้ด src (หรือ $foreign)"),
  D("R9", "S", "[§4 R9] hiddenFor ⊆ {owner manager cashier public} · ไม่ทับ roles (≠ roles)"),
  // POS P4.1 builder ▸ ORACLE-EDIT มติ W8 (ผู้คุม B 22 ต.ค. 07:3xZ · CD-P42-W8 "W8 ใช่"): ทุกแถวหน้าพนักงานต้องอ้างผู้จัดการ ◂
  D("R9b", "S", "[W8 · CD-P42-W8] ทุกแถวที่ไม่ใช่หน้าสาธารณะระบุ manager ใน roles หรือ hiddenFor (ตัวกด P4.2 ไม่มีแถว skip no-role-claim ของผู้จัดการ)"),
  D("R10", "S", "[§4 R10 · V4] การ์ดปฏิเสธทุกใบ (refusals ของ pos-visual-sweep.json + data-testid pos-…-refusal/-refused ในโค้ด POS) มีแถวทะเบียน expect ui · state \"refused\""),
  D("R11", "S", "[§4 R11 · ⚠️6 · มติ 5] แถว mutation/download ที่ไปถึงตัวเขียนเงิน (MONEY_ACTIONS · db ชี้ตารางเงิน) มี safety ∈ money|external|counter · ตัวจับแถวเงินเจอ ≥ 1 แถว"),
  D("R12", "S", "[§4 R12 · มติ 5] safety ถูกค่า (money|external|counter) · แถวภายนอก (พิมพ์ · LINE · Beam · e-Tax · LAN agent · webhook) = external · แถวเลขเอกสาร (ใบกำกับ/ใบลดหนี้/ตัวนับ) = counter|external · ไม่มี safety บนแถว navigate/modal"),
  D("R13", "S", "[§4 R13] ภาษาไทย: ทุกคีย์ข้อความที่ expect.note อ้าง (msg:pos.… · pos.….* · \"คีย์/ข้อความ pos.…\") มีใน src/messages/th"),
  D("R14", "S", "[§4 R14] ภาษาอังกฤษ: คีย์ชุดเดียวกับ R13 มีใน src/messages/en"),
  D("Z1", "-", "ไม่มีของค้าง (ไม่มี DB): ทะเบียน/สถานะ git ของทรีก่อน-หลังรันเท่ากัน · โฟลเดอร์ชั่วคราวของ probe R7 ถูกลบ"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string; probe: string }>();
function chk(id: string, ok: boolean, expected: string, actual: string, probe = "-"): void {
  const full = id.startsWith(`${PFX}-`) ? id : `${PFX}-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  results.set(full, { ok, expected, actual, probe });
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 110)}${ok ? ` — ${actual.slice(0, 200)}` : ` — expected ${expected} | actual ${actual.slice(0, 900)}`} · probe: ${probe}`);
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const ex = (p: string) => existsSync(join(ROOT, p));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isRec = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
const joinP = (p: string[], n = 12) => (p.length ? `${p.length} ปัญหา: ${p.slice(0, n).join(" · ")}${p.length > n ? " · …" : ""}` : "ครบ");
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const globRe = (g: string) => new RegExp("^" + g.split("*").map(escRe).join(".*") + "$");
/** id (ตรงตัวหรือแพตเทิร์น) จับคู่รายการ (ตรงตัวหรือแพตเทิร์น) ได้สองทาง */
function matchesAny(id: string, list: readonly string[], exact?: Set<string>): boolean {
  if ((exact ?? new Set(list)).has(id)) return true;
  if (list.some((r) => r.includes("*") && globRe(r).test(id))) return true;
  if (id.includes("*")) {
    const re = globRe(id);
    if (list.some((r) => re.test(r))) return true;
  }
  return false;
}
function git(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}
function walk(rel: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = `${rel}/${e}`;
    let st;
    try {
      st = statSync(join(ROOT, p));
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ═════════════════════════ ค่าคงที่ของข้อสอบ (ผู้คุมเป็นเจ้าของ · CD-P41-O*) ═════════════════════════
const INVENTORY = "scripts/pos-ui-inventory.json";
const ROLE_UNIVERSE = ["owner", "manager", "cashier", "public"];
const SAFETY = ["money", "external", "counter"];
const VIEWPORTS = ["desktop", "tablet", "mobile"]; // desktop = 1440×900 · tablet = 1024×768 · mobile = 390×844 (POS-MASTER-PLAN §1 X10/X11)
const NEW_FIELDS = ["opener", "needs", "viewport", "safety"];
/** มติ 3 · W29: หน้าขายเดิม (ธง registerV2 ปิด) อยู่นอกขอบเขต P4 — หนี้ 22 + 5 คงเป็นหนี้ที่บันทึกไว้ */
const LEGACY_OUT = ["src/lib/modules/pos/register-ui.tsx", "src/lib/modules/pos/register-legacy-page.tsx"];
const isPublicPage = (p: string) => p === "/d" || p.startsWith("/d/") || p.startsWith("/r/") || p.startsWith("/q/") || p === "/developers" || p.startsWith("/developers/");
const STAFF = "/app/sys/[id]/pos/";
/** R6: mockup → หน้าในทะเบียน (CD-P41-O4) */
const MOCKUP_PAGES: Record<string, string[]> = {
  "01-register": ["register"],
  "02-payment": ["register"],
  "03-tables": ["tables"],
  "04-kds": ["kds"],
  "05-mobile": ["register", "stock"],
  "06-products": ["products", "products/price-rules"],
  "07-shift": ["shifts", "close"],
  "08-reports": ["reports", "reports/print"],
  "09-online-orders": ["orders"],
  "10-settings-integrations": ["settings"],
  "11-customer-display": ["/d", "/r/[token]"],
  "12-bills-refund": ["sales"],
  "13-shift-open-lock": ["shifts", "register"],
  "14-member-hold": ["register"],
  "15-taxinvoice-split": ["register", "tables", "/r/[token]"],
  "16-stock-ops": ["stock"],
  "17-settings-3": ["settings"],
  "18-onboarding": ["settings"],
  "19-states": ["register", "products", "orders", "settings"],
  "20-en-ipad": ["register"],
  "21-approval-plan": ["register"],
};
const pageOf = (p: string) => (p.startsWith("/") ? p : `${STAFF}${p}`);
/** R6: คลาส/แท็กของ mockup → bucket (ไม่นับ chip/pitem/opt/ri/kbd = ป้าย/ไทล์ซ้ำ/แถบแอป — CD-P41-O4) */
const MOCKUP_BUCKET_CLASS: Record<string, string[]> = { buttons: ["btn", "tab", "sw", "cbx", "seg", "rad"], links: ["lnk"], inputs: ["inp", "sel"] };
const MOCKUP_BUCKET_TAG: Record<string, string[]> = { buttons: ["button"], links: ["a"], inputs: ["input", "select", "textarea"] };
const REGISTRY_BUCKET_KIND: Record<string, string[]> = { buttons: ["button", "menu", "tab", "toggle", "filter", "drag"], links: ["link"], inputs: ["input", "textarea", "select"] };
/** R11: server action / route ที่เขียนเงินหรือมูลค่าสะสม (CD-P41-O6 — รายการของข้อสอบ · เพิ่มได้ด้วย ORACLE-EDIT) */
const MONEY_ACTIONS = [
  "submitRegisterSaleAction", "registerPayTendersAction", "voidSaleAction", "refundSaleAction",
  "registerTakeDepositAction", "registerRefundDepositAction",
  "createPaymentIntentAction", "confirmPaymentIntentManualAction", "cancelPaymentIntentAction",
  "payOrderAction", "acceptOfflineSaleAction", "recordCashMovementAction", "confirmSlipAction",
  "sellGiftCardAction", "reloadGiftCardAction", "transferGiftCardAction", "POST /api/pos/sync",
];
/** R11: ตารางเงินใน expect.db */
const MONEY_MODELS = ["PosSale", "PosPayment", "PosPaymentIntent", "PosDeposit", "PosDepositTxn", "GiftCard", "GiftCardTxn", "PosCashMovement"];
/** R12: ผลภายนอก (พิมพ์ · LINE · Beam · e-Tax · LAN agent · webhook) */
const EXTERNAL_ACTIONS = ["sendReceiptAction", "reprintReceiptAction", "requestChatPaymentAction", "kitchenSlipPayloadAction"];
const EXTERNAL_TEXT = /\bBeam\b|\be-?Tax\b|\bwebhook\b|\bLAN\b|print-agent|เครื่องพิมพ์|พิมพ์(ใบ|ซ้ำ|สำเนา|ครัว|บิล)|print\(\)|\bLINE\b(?! MAN)/; // ตัวพิมพ์ตรง (Line ของ PosTableSplit/Part/Line ไม่ใช่ LINE) · LINE MAN = ช่องทาง ไม่ใช่การส่ง
/** แถวตั้งค่า (เก็บค่า printerConfig/settings) ไม่ใช่ผลภายนอก แม้ข้อความพูดถึงเครื่องพิมพ์/Beam */
const CONFIG_ROW = /\bupdateDeviceAction\b|printerConfig|\b(update|save|set)\w*Settings?\w*Action\b/;
/** R12: เลขเอกสาร (ตัวนับ) */
const COUNTER_ACTIONS = ["issueFullTaxInvoiceAction", "issueFromTaxInvoiceRequestAction"];
const COUNTER_TEXT = /\b(PosReceiptCounter|PosDocCounter|PosShiftCounter)\b|ใบกำกับภาษีเต็มรูป|ใบกำกับเต็มรูป|ใบลดหนี้|\(CN\)|#CN|\bcredit note\b/i;
const REFUSAL_ID = /^pos-[a-z0-9*-]*-refus(al|ed)$/;

// ═════════════════════════ ข้อเท็จจริงจากดิสก์ (อ่านครั้งเดียว · ไม่ขึ้นกับทะเบียน) ═════════════════════════
type Facts = {
  fp: Any; // scripts/fitness-pos.mts
  scan: Any; // scripts/lib/crm-testid-scan.mts
  posFiles: string[];
  posIds: { id: string; file: string; interactive: boolean }[];
  srcIds: string[];
  srcStrings: string[];
  models: Set<string>;
  dbCheckIds: Set<string>;
  listedSuites: number;
  testUsed: Map<string, string[]>;
  mockups: Record<string, Record<string, number>>;
  mockupFiles: string[];
  refusals: string[];
  msgs: Record<string, Map<string, unknown>>;
  rowRolesSrc: string;
  debtNow: Map<string, string[]>;
  pinInteractive: Map<string, number>;
  pinOk: boolean;
  headInteractive: Map<string, number>;
};
const fp = (await import("./fitness-pos.mjs" as string)) as Any;
const scan = (await import("./lib/crm-testid-scan.mjs" as string)) as Any;

function interactiveTotal(src: string, file: string): number {
  const hits = (scan.scanTestids(src) as Any[]).filter((h) => h.interactive).length;
  return hits + (fp.untestidControls(src, file) as string[]).length;
}
function readMessages(loc: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const flat = (o: unknown, p: string) => {
    if (isRec(o)) for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k);
    else out.set(p, o);
  };
  const dir = `src/messages/${loc}`;
  if (ex(dir))
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith(".json")).sort()) {
      const j = JSON.parse(rd(`${dir}/${f}`)) as unknown;
      const ns = f.replace(/\.json$/, "");
      flat(j, ns); // ไฟล์ = namespace (pos.json → pos.*)
      if (isRec(j)) for (const [k, v] of Object.entries(j)) if (k === "pos" || k.startsWith("pos.")) flat(v, k);
    }
  if (ex(`src/messages/${loc}.json`)) {
    const j = JSON.parse(rd(`src/messages/${loc}.json`)) as unknown;
    if (isRec(j)) for (const [k, v] of Object.entries(j)) flat(v, k);
  }
  return out;
}
/** id ข้อสอบจาก --list ของ qc-pos-* (อ่านไฟล์ ไม่รัน): D("X", "grp", …) + ค่าคงที่ของ D · ทูเพิลตรงตัว ["P1.4-B1", "grp", …] */
function readDbCheckIds(): { ids: Set<string>; suites: number } {
  const ids = new Set<string>();
  let suites = 0;
  for (const f of readdirSync(join(ROOT, "scripts")).filter((x) => /^qc-pos-.*\.mts$/.test(x) && x !== `${SUITE}.mts`).sort()) {
    const src = rd(`scripts/${f}`);
    if (!src.includes("--list")) continue;
    suites++;
    const consts = new Map<string, string>();
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*"([^"]*)"/g)) consts.set(m[1]!, m[2]!);
    const dl = /const\s+D\s*=\s*\([^)]*\)[^\n]*?`([^`]*)`/.exec(src);
    if (dl) {
      const tpl = dl[1]!.replace(/\$\{(\w+)\}/g, (all, v: string) => (v === "id" ? "\u0000" : consts.get(v) ?? all));
      const [pre, post] = tpl.split("\u0000") as [string, string | undefined];
      if (post !== undefined && !pre.includes("${"))
        for (const m of src.matchAll(/\bD\(\s*"([^"]+)"\s*,\s*"([^"]*)"/g)) if (m[2] !== "S" && m[2] !== "P") ids.add(`${pre}${m[1]}${post}`);
    }
    for (const m of src.matchAll(/\[\s*"([A-Z][A-Za-z0-9.]*-[A-Za-z0-9.]+)"\s*,\s*"([^"]*)"\s*,\s*"/g)) if (m[2] !== "S" && m[2] !== "P") ids.add(m[1]!);
  }
  return { ids, suites };
}
/** testid ที่ข้อสอบอ้าง (ไม่รวมไฟล์นี้) */
function readTestUsed(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const files = readdirSync(join(ROOT, "scripts")).filter((x) => (/^qc-pos-.*\.mts$/.test(x) && x !== `${SUITE}.mts`) || x === "visual-pos.mts");
  // [op, ค่า]: op "" = ตรงตัว · "^" ขึ้นต้น · "$" ลงท้าย · "*" มีอยู่ (ตัวเลือก CSS) → แพตเทิร์น *
  const RX = [/\btid\(\s*()"([^"]+)"/g, /\btid\(\s*()`([^`]+)`/g, /data-testid\s*([\^$*~|]?)=\s*\\?"([^"\\]+)/g, /data-testid\s*([\^$*~|]?)=\s*'([^']+)'/g, /getByTestId\(\s*()["'`]([^"'`]+)/g];
  for (const f of files.sort()) {
    const src = rd(`scripts/${f}`);
    for (const rx of RX)
      for (const m of src.matchAll(rx)) {
        const op = m[1] ?? "";
        const raw = m[2]!.replace(/\$\{[^}]*\}/g, "*");
        const v = (op === "^" ? `${raw}*` : op === "$" ? `*${raw}` : op === "*" ? `*${raw}*` : raw).replace(/\*+/g, "*");
        if (!/^[a-z*][a-z0-9*_-]*$/.test(v) || v.replace(/\*/g, "").length < 4) continue;
        const prev = used.get(v) ?? [];
        if (!prev.includes(f)) prev.push(f);
        used.set(v, prev);
      }
  }
  return used;
}
function countMockup(html: string): Record<string, number> {
  const body = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const c: Record<string, number> = { buttons: 0, links: 0, inputs: 0 };
  for (const m of body.matchAll(/<([a-zA-Z][\w-]*)(\s[^>]*)?>/g)) {
    const tag = m[1]!.toLowerCase();
    const cls = new Set((/\bclass="([^"]*)"/.exec(m[2] ?? "")?.[1] ?? "").split(/\s+/).filter(Boolean));
    let hit = "";
    for (const [b, list] of Object.entries(MOCKUP_BUCKET_CLASS)) if (!hit && list.some((x) => cls.has(x))) hit = b;
    if (!hit) for (const [b, list] of Object.entries(MOCKUP_BUCKET_TAG)) if (!hit && list.includes(tag)) hit = b;
    if (hit) c[hit] = (c[hit] ?? 0) + 1;
  }
  return c;
}

function readFacts(inv: Any): Facts {
  const posFiles = fp.discoverPosFiles(ROOT) as string[];
  const posIds: Facts["posIds"] = [];
  const debtNow = new Map<string, string[]>();
  const headInteractive = new Map<string, number>();
  for (const f of posFiles) {
    const src = rd(f);
    for (const h of scan.scanTestids(src) as Any[]) posIds.push({ id: String(h.id), file: f, interactive: !!h.interactive });
    if (f.endsWith(".tsx")) {
      const u = fp.untestidControls(src, f) as string[];
      if (u.length) debtNow.set(f, u);
    }
  }
  const srcIds = new Set<string>();
  const srcStrings = new Set<string>(); // ค่าคงที่สตริงในโค้ด (testid ที่ส่งผ่าน prop เช่น testId="pos-shift-open-dialog" · `pos-x-${id}` → pos-x-*)
  for (const f of walk("src", (p) => /\.(tsx|ts)$/.test(p))) {
    const src = rd(f);
    for (const h of scan.scanTestids(src) as Any[]) srcIds.add(String(h.id));
    for (const m of src.matchAll(/"([a-z][a-z0-9-]{3,80})"|'([a-z][a-z0-9-]{3,80})'|`([a-z][^`\n]{3,120})`/g)) {
      const v = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, "*").replace(/\*+/g, "*");
      if (v.includes("-") && /^[a-z][a-z0-9*-]*$/.test(v)) srcStrings.add(v);
    }
  }
  const models = new Set<string>();
  for (const f of walk("prisma", (p) => p.endsWith(".prisma"))) for (const m of rd(f).matchAll(/^model\s+(\w+)/gm)) models.add(m[1]!);
  const { ids: dbCheckIds, suites } = readDbCheckIds();
  const mockups: Facts["mockups"] = {};
  const mockupFiles = ex("ledger/design-pos") ? readdirSync(join(ROOT, "ledger/design-pos")).filter((x) => /^\d\d-.*\.body\.html$/.test(x)).sort() : [];
  for (const f of mockupFiles) mockups[f.replace(/\.body\.html$/, "")] = countMockup(rd(`ledger/design-pos/${f}`));
  let sweepRefusals: string[] = [];
  try {
    const sw = JSON.parse(rd("scripts/pos-visual-sweep.json") || "{}") as Any;
    sweepRefusals = isRec(sw?.refusals) ? Object.values(sw.refusals).filter((v): v is string => typeof v === "string") : [];
  } catch {
    sweepRefusals = ["(อ่าน pos-visual-sweep.json ไม่ได้)"];
  }
  const refusals = [...new Set([...sweepRefusals, ...posIds.map((x) => x.id).filter((id) => REFUSAL_ID.test(id))])].sort();
  // R5: element กดได้ของไฟล์หนี้ ณ PIN (git show) เทียบ HEAD
  const pinOk = git(["cat-file", "-e", `${PIN}^{commit}`]) !== null;
  const pinInteractive = new Map<string, number>();
  if (pinOk) {
    let pinInv: Any = null;
    try {
      pinInv = JSON.parse(git(["show", `${PIN}:${INVENTORY}`]) ?? "null");
    } catch {
      pinInv = null;
    }
    const files = new Set<string>([...((pinInv?.baselineDebt?.items ?? []) as Any[]).map((d) => String(d?.file ?? "")), ...((inv?.baselineDebt?.items ?? []) as Any[]).map((d) => String(d?.file ?? ""))]);
    for (const f of [...files].filter((x) => x.endsWith(".tsx") && !LEGACY_OUT.includes(x))) {
      const s = git(["show", `${PIN}:${f}`]);
      if (s !== null) pinInteractive.set(f, interactiveTotal(s, f));
      if (ex(f)) headInteractive.set(f, interactiveTotal(rd(f), f));
    }
  }
  return {
    fp,
    scan,
    posFiles,
    posIds,
    srcIds: [...srcIds],
    srcStrings: [...srcStrings],
    models,
    dbCheckIds,
    listedSuites: suites,
    testUsed: readTestUsed(),
    mockups,
    mockupFiles,
    refusals,
    msgs: { th: readMessages("th"), en: readMessages("en") },
    rowRolesSrc: /const\s+ROW_ROLES\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(rd("scripts/fitness-pos.mts"))?.[1] ?? "",
    debtNow,
    pinInteractive,
    pinOk,
    headInteractive,
  };
}

// ═════════════════════════ ฟังก์ชันตรวจ (บริสุทธิ์: (ทะเบียน, ข้อเท็จจริง) → ปัญหา[]) ═════════════════════════
type Inv = Any;
const rowsOf = (inv: Inv): Any[] => (Array.isArray(inv?.rows) ? inv.rows : []);
const tidOf = (r: Any) => str(r?.testid) || "?";
const rowText = (r: Any) => [r?.expect?.target, r?.expect?.db, r?.expect?.note, r?.expect?.resultTarget].filter((x) => typeof x === "string").join(" \u0001 ");
const hasWord = (text: string, w: string) => new RegExp(`(^|[^A-Za-z0-9_])${escRe(w)}([^A-Za-z0-9_]|$)`).test(text);
const pageShort = (p: string) => p.replace(STAFF, "");
function perPage(list: Any[]): string {
  const c = new Map<string, number>();
  for (const r of list) c.set(pageShort(String(r?.page ?? "?")), (c.get(pageShort(String(r?.page ?? "?"))) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ");
}

function r1(inv: Inv): string[] {
  const bad = rowsOf(inv).filter((r) => !str(r?.expect?.target) && !(r?.expect?.type === "ui" && str(r?.expect?.state)));
  return bad.length ? [`${bad.length} แถวไม่มี target (และไม่ใช่ ui + state) — ต่อหน้า: ${perPage(bad)} — ตัวอย่าง ${bad.slice(0, 6).map(tidOf).join(", ")}`] : [];
}
function dbOk(db: unknown, F: Facts): boolean {
  const s = str(db);
  const m = /^([A-Z][A-Za-z0-9]+)(\([^)]*\))?([\s\S]*)$/.exec(s);
  return !!m && F.models.has(m[1]!) && !!m[3]!.replace(/^[\s.:=]+/, "").trim();
}
function oracleOk(o: unknown, F: Facts): boolean {
  return str(o).split(/[\s,#·|;]+/).some((t) => F.dbCheckIds.has(t));
}
function r2(inv: Inv, F: Facts): string[] {
  if (F.models.size < 50) return [`อ่าน prisma/schema ได้ ${F.models.size} model (ตัวตรวจพัง)`];
  if (F.dbCheckIds.size < 100) return [`อ่าน id ข้อสอบ DB จาก --list ได้ ${F.dbCheckIds.size} (ตัวตรวจพัง)`];
  const muts = rowsOf(inv).filter((r) => r?.expect?.type === "mutation");
  const bad = muts.filter((r) => !dbOk(r?.expect?.db, F) && !oracleOk(r?.oracle, F));
  const dbFmt = muts.filter((r) => str(r?.expect?.db) && !dbOk(r?.expect?.db, F)).map((r) => `${tidOf(r)}="${str(r.expect.db).slice(0, 30)}"`);
  return bad.length
    ? [`${bad.length}/${muts.length} แถว mutation ไม่มี db ที่ถูกรูป/oracle id — ต่อหน้า: ${perPage(bad)} — ตัวอย่าง ${bad.slice(0, 5).map(tidOf).join(", ")}${dbFmt.length ? ` · db ผิดรูป ${dbFmt.length}: ${dbFmt.slice(0, 4).join(", ")}` : ""}`]
    : [];
}
function r3(inv: Inv): string[] {
  const p: string[] = [];
  const fields = isRec(inv?.$fields) ? inv.$fields : {};
  const missing = NEW_FIELDS.filter((k) => !str(fields[k]));
  if (missing.length) p.push(`$fields ไม่อธิบาย ${missing.join(" · ")} (มติ 2)`);
  const rows = rowsOf(inv);
  const byPage = new Map<string, string[]>();
  for (const r of rows) byPage.set(String(r?.page), [...(byPage.get(String(r?.page)) ?? []), tidOf(r)]);
  const steps = (v: unknown): string[] | null => (typeof v === "string" ? [v] : Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? (v as string[]) : null);
  const edges = new Map<string, string[]>();
  for (const r of rows) {
    const t = tidOf(r);
    if ("opener" in (r ?? {})) {
      const s = steps(r.opener);
      if (!s) p.push(`${t}: opener ต้องเป็น string หรือ string[] ไม่ว่าง`);
      else {
        const ids = s.map((x) => x.split("=")[0]!.trim());
        const onPage = byPage.get(String(r.page)) ?? [];
        for (const id of ids) {
          if (!id) p.push(`${t}: opener มีขั้นว่าง`);
          else if (id === t) p.push(`${t}: opener ชี้ตัวเอง`);
          else if (!matchesAny(id, onPage)) p.push(`${t}: opener "${id}" ไม่ใช่แถวบนหน้า ${pageShort(String(r.page))}`);
        }
        if (new Set(s).size !== s.length) p.push(`${t}: opener มีขั้นซ้ำ`);
        edges.set(`${r.page}|${t}`, ids.map((id) => `${r.page}|${id}`));
      }
    }
    if ("needs" in (r ?? {})) {
      const n = steps(r.needs);
      if (!n || n.some((x) => x.trim().length < 4)) p.push(`${t}: needs ต้องเป็นข้อความ (≥ 4 ตัว) หรือ array ของข้อความ`);
    }
    if ("viewport" in (r ?? {})) {
      const v = steps(r.viewport);
      if (!v || v.some((x) => !VIEWPORTS.includes(x)) || new Set(v).size !== v.length) p.push(`${t}: viewport ต้องอยู่ใน ${VIEWPORTS.join("|")} ไม่ซ้ำ`);
      else if (VIEWPORTS.every((x) => v.includes(x))) p.push(`${t}: viewport ครบ 3 จอ = ไม่ต้องใส่`);
    }
  }
  // opener วน (ตามขั้นแรกของทุกแถว)
  const seen = new Set<string>();
  for (const start of edges.keys()) {
    const path: string[] = [];
    let cur: string | undefined = start;
    while (cur && edges.has(cur) && !path.includes(cur) && path.length < 50) {
      path.push(cur);
      cur = edges.get(cur)![0];
    }
    if (cur && path.includes(cur)) {
      const key = [...path.slice(path.indexOf(cur))].sort().join(">");
      if (!seen.has(key)) p.push(`opener วน: ${path.slice(path.indexOf(cur)).map((x) => x.split("|")[1]).join(" → ")}`);
      seen.add(key);
    }
  }
  return p;
}
function r4(inv: Inv, F: Facts): string[] {
  const p: string[] = [];
  if (!/\bpublic\b/.test(String(inv?.$roles ?? ""))) p.push("$roles ไม่มี public");
  if (!/["']public["']/.test(F.rowRolesSrc)) p.push("ROW_ROLES ของ scripts/fitness-pos.mts ไม่มี \"public\" (F15.3b · มติ 2 ORACLE-EDIT)");
  const rows = rowsOf(inv);
  const pub = rows.filter((r) => isPublicPage(String(r?.page ?? "")));
  const badPub = pub.filter((r) => !(Array.isArray(r?.roles) && r.roles.length === 1 && r.roles[0] === "public"));
  if (badPub.length) p.push(`${badPub.length}/${pub.length} แถวหน้าสาธารณะไม่ใช่ roles ["public"] — ต่อหน้า: ${perPage(badPub)}`);
  const badStaff = rows.filter((r) => !isPublicPage(String(r?.page ?? "")) && Array.isArray(r?.roles) && r.roles.includes("public"));
  if (badStaff.length) p.push(`${badStaff.length} แถวหน้าพนักงานมี public: ${badStaff.slice(0, 5).map(tidOf).join(", ")}`);
  if (!pub.length) p.push("ไม่พบแถวหน้าสาธารณะเลย (ตัวตรวจพัง/ทะเบียนหาย)");
  return p;
}
function r5(inv: Inv, F: Facts): string[] {
  const p: string[] = [];
  const items: Any[] = Array.isArray(inv?.baselineDebt?.items) ? inv.baselineDebt.items : [];
  const inScopeReg = items.filter((d) => !LEGACY_OUT.includes(String(d?.file)) && Number(d?.untestid ?? 0) > 0);
  if (inScopeReg.length) p.push(`baselineDebt ในขอบเขต ${inScopeReg.reduce((a, d) => a + Number(d.untestid), 0)} จุด: ${inScopeReg.map((d) => `${String(d.file).replace("src/app/app/sys/[id]/pos/", "pos/")} ${d.untestid}`).join(" · ")}`);
  const live = [...F.debtNow.entries()].filter(([f]) => !LEGACY_OUT.includes(f));
  if (live.length) p.push(`สแกนจริง: element กดได้ไร้ testid ในขอบเขต ${live.reduce((a, [, l]) => a + l.length, 0)} จุด: ${live.map(([f, l]) => `${f.replace("src/app/app/sys/[id]/pos/", "pos/")} ${l.join(" ")}`).join(" · ")}`);
  const lo = inv?.$legacyOut;
  const loItems: Any[] = Array.isArray(lo?.items) ? lo.items : [];
  const loFiles = loItems.map((x) => String(x?.file ?? "")).sort();
  if (!isRec(lo)) p.push("ไม่มี $legacyOut (W29: register-ui.tsx + register-legacy-page.tsx นอกขอบเขต)");
  else {
    if (loFiles.join(",") !== [...LEGACY_OUT].sort().join(",")) p.push(`$legacyOut = [${loFiles.join(", ")}] (คาด ${LEGACY_OUT.join(", ")})`);
    for (const x of loItems) if (!/W29/.test(String(x?.why ?? ""))) p.push(`$legacyOut ${x?.file}: why ต้องอ้าง W29`);
  }
  if (!F.pinOk) p.push(`หมุด ${PIN} ไม่มีในทรี (ตั้ง P41_PIN)`);
  for (const [f, n] of F.pinInteractive) {
    const now = F.headInteractive.get(f);
    const item = items.find((d) => d?.file === f);
    const why = str(item?.removed);
    if ((now ?? 0) < n && why.length < 12) p.push(`${f}: element กดได้ ${n} (${PIN}) → ${now ?? "ไฟล์หาย"} — ปิดหนี้ด้วยการลบปุ่ม? ใส่เหตุผลใน baselineDebt.items[].removed (≥ 12 ตัว)`);
  }
  return p;
}
function mockupGaps(inv: Inv, F: Facts): { want: Map<string, number>; detail: string[] } {
  const want = new Map<string, number>();
  const detail: string[] = [];
  const rows = rowsOf(inv);
  for (const [mk, counts] of Object.entries(F.mockups)) {
    const pages = (MOCKUP_PAGES[mk] ?? []).map(pageOf);
    const reg: Record<string, number> = {};
    for (const [b, kinds] of Object.entries(REGISTRY_BUCKET_KIND)) reg[b] = rows.filter((r) => pages.includes(String(r?.page)) && kinds.includes(String(r?.kind))).length;
    for (const b of Object.keys(REGISTRY_BUCKET_KIND)) {
      const d = (counts[b] ?? 0) - (reg[b] ?? 0);
      if (d > 0) want.set(`${mk}|${b}`, d);
    }
    detail.push(`${mk.slice(0, 2)} ${Object.keys(REGISTRY_BUCKET_KIND).map((b) => `${b[0]}${counts[b] ?? 0}/${reg[b] ?? 0}`).join(" ")}`);
  }
  return { want, detail };
}
function r6(inv: Inv, F: Facts): string[] {
  const p: string[] = [];
  if (F.mockupFiles.length < 21) p.push(`พบ mockup ${F.mockupFiles.length} ไฟล์ (คาด ≥ 21)`);
  for (const mk of Object.keys(F.mockups)) if (!MOCKUP_PAGES[mk]) p.push(`${mk} ยังไม่ถูกแมปกับหน้า (ORACLE-EDIT MOCKUP_PAGES)`);
  for (const [mk, pages] of Object.entries(MOCKUP_PAGES)) for (const pg of pages) if (!rowsOf(inv).some((r) => r?.page === pageOf(pg))) p.push(`${mk} แมปหน้า ${pg} ที่ไม่มีแถวในทะเบียน`);
  const { want } = mockupGaps(inv, F);
  const mg = inv?.$mockupGaps;
  const items: Any[] = Array.isArray(mg?.items) ? mg.items : [];
  if (!isRec(mg)) p.push(`ไม่มี $mockupGaps (ส่วนต่างที่ต้องมีเหตุผล ${want.size} รายการ: ${[...want.entries()].map(([k, v]) => `${k} +${v}`).join(" · ") || "ไม่มี"})`);
  else {
    const have = new Map<string, Any>();
    for (const it of items) {
      const k = `${str(it?.mockup)}|${str(it?.bucket)}`;
      if (have.has(k)) p.push(`$mockupGaps ซ้ำ ${k}`);
      have.set(k, it);
    }
    for (const [k, d] of want) {
      const it = have.get(k);
      if (!it) p.push(`${k} ส่วนต่าง +${d} ไม่มีรายการ`);
      else {
        if (Number(it.gap) !== d) p.push(`${k} gap ${it.gap} (นับได้ ${d})`);
        if (str(it.reason).length < 12) p.push(`${k} reason สั้นเกิน (≥ 12 ตัว)`);
      }
    }
    for (const k of have.keys()) if (!want.has(k)) p.push(`$mockupGaps ${k} ค้าง (ไม่มีส่วนต่างแล้ว — ลบออก)`);
  }
  return p;
}
async function r7(root: string): Promise<{ a: boolean | null; b: boolean | null; detail: string }> {
  const got = new Map<string, { ok: boolean; detail: string }>();
  const log = console.log;
  console.log = () => {};
  try {
    fp.runPosFitness((id: string, _n: string, ok: boolean, detail: string) => {
      if (id === "F15.3a" || id === "F15.3b") got.set(id, { ok, detail });
    }, root);
  } finally {
    console.log = log;
  }
  const a = got.get("F15.3a");
  const b = got.get("F15.3b");
  return { a: a ? a.ok : null, b: b ? b.ok : null, detail: `F15.3a ${a ? (a.ok ? "เขียว" : `แดง: ${a.detail.slice(0, 220)}`) : "ไม่รัน"} · F15.3b ${b ? (b.ok ? "เขียว" : `แดง: ${b.detail.slice(0, 220)}`) : "ไม่รัน"}` };
}
function r8(inv: Inv, F: Facts): string[] {
  const reg = rowsOf(inv).map(tidOf);
  const regSet = new Set(reg);
  const foreign: string[] = (Array.isArray(inv?.$foreign?.items) ? inv.$foreign.items : []).map((x: Any) => String(x?.testid ?? ""));
  const all = [...new Set([...F.srcIds, ...F.srcStrings])];
  const srcSet = new Set(all);
  // แพตเทิร์นของโค้ดที่ใช้จับคู่ได้: ขึ้นต้นด้วยตัวอักษร (ไม่ใช่ *) และตัวอักษรจริง ≥ 8 — `${a}-${b}` / `pos-${x}` กว้างจนรับทุกชื่อ (CD-P41-O7)
  const narrow = all.filter((id) => id.includes("*") && !id.startsWith("*") && id.replace(/\*/g, "").length >= 8).map(globRe);
  // testid ประกอบ: `${testId}-total` (โค้ด "*-total") + testId="pos-report-table" (สตริงในโค้ด) ⇒ pos-report-table-total มีจริง
  const lead = all.filter((id) => id.startsWith("*") && id.replace(/\*/g, "").length >= 4).map((id) => globRe(id.slice(1)));
  const composed = (id: string) => lead.some((re) => { for (let i = 4; i < id.length - 2; i++) if (re.test(id.slice(i)) && srcSet.has(id.slice(0, i))) return true; return false; });
  const inSrc = (id: string) => srcSet.has(id) || narrow.some((re) => re.test(id)) || composed(id) || (id.includes("*") && (() => { const re = globRe(id); return all.some((x) => re.test(x)); })());
  const ghosts = [...F.testUsed.entries()].filter(([id]) => !matchesAny(id, reg, regSet) && !inSrc(id) && !foreign.includes(id));
  if (F.testUsed.size < 100) return [`อ่าน testid ในข้อสอบได้ ${F.testUsed.size} (ตัวตรวจพัง)`];
  return ghosts.length ? [`${ghosts.length} testid ผีที่ข้อสอบอ้าง: ${ghosts.slice(0, 10).map(([id, fs]) => `${id} (${fs.slice(0, 2).join(",")})`).join(" · ")}`] : [];
}
function r9(inv: Inv): string[] {
  const p: string[] = [];
  for (const r of rowsOf(inv)) {
    const hf: unknown[] = Array.isArray(r?.hiddenFor) ? r.hiddenFor : r?.hiddenFor === undefined ? [] : ["(ไม่ใช่ array)"];
    const roles: unknown[] = Array.isArray(r?.roles) ? r.roles : [];
    const out = hf.filter((x) => !ROLE_UNIVERSE.includes(String(x)));
    const both = hf.filter((x) => roles.includes(x));
    if (out.length) p.push(`${tidOf(r)}: hiddenFor นอกชุดบทบาท ${out.join(",")}`);
    if (both.length) p.push(`${tidOf(r)}: hiddenFor ทับ roles ${both.join(",")}${both.length === roles.length && hf.length === roles.length ? " (= roles)" : ""}`);
  }
  return p;
}
/** POS P4.1 builder ▸ ORACLE-EDIT มติ W8: แถวหน้าพนักงาน (ไม่ใช่ /r /q /d /developers) ต้องมี manager ใน roles หรือ hiddenFor — หน้าสาธารณะ = roles ["public"] (R4) ไม่นับ ◂ */
function r9b(inv: Inv): string[] {
  const staff = rowsOf(inv).filter((r) => !isPublicPage(String(r?.page ?? "")));
  const bad = staff.filter((r) => !(Array.isArray(r?.roles) && r.roles.includes("manager")) && !(Array.isArray(r?.hiddenFor) && r.hiddenFor.includes("manager")));
  if (!staff.length) return ["ไม่พบแถวหน้าพนักงานเลย (ตัวตรวจพัง/ทะเบียนหาย)"];
  return bad.length ? [`${bad.length}/${staff.length} แถวหน้าพนักงานไม่ระบุ manager (roles/hiddenFor) — ต่อหน้า: ${perPage(bad)} — ${bad.slice(0, 8).map(tidOf).join(", ")}`] : [];
}
function r10(inv: Inv, F: Facts): string[] {
  if (!F.refusals.length) return ["ไม่พบการ์ดปฏิเสธเลย (ตัวตรวจพัง)"];
  const rows = rowsOf(inv);
  const bad: string[] = [];
  for (const id of F.refusals) {
    const hit = rows.filter((r) => {
      const t = tidOf(r);
      return t === id || (t.includes("*") && globRe(t).test(id)) || (id.includes("*") && globRe(id).test(t));
    });
    if (!hit.length) bad.push(`${id} (ไม่มีแถว)`);
    else if (!hit.some((r) => r?.expect?.type === "ui" && r?.expect?.state === "refused")) bad.push(`${id} (expect ไม่ใช่ ui · state refused)`);
  }
  return bad.length ? [`${bad.length}/${F.refusals.length} การ์ดปฏิเสธ: ${bad.join(" · ")}`] : [];
}
const isMoneyRow = (r: Any) => {
  if (!["mutation", "download"].includes(String(r?.expect?.type))) return false; // ui/toast/inline-error ที่พูดถึง action = ไม่ใช่จุดกดที่เขียนเงิน
  const t = rowText(r);
  if (MONEY_ACTIONS.some((a) => (a.includes(" ") ? t.includes(a) : hasWord(t, a)))) return true;
  const db = str(r?.expect?.db);
  return MONEY_MODELS.some((m) => hasWord(db, m));
};
const isExternalRow = (r: Any) => {
  if (!["mutation", "download", "toast"].includes(String(r?.expect?.type))) return false;
  const t = rowText(r);
  if (EXTERNAL_ACTIONS.some((a) => hasWord(t, a))) return true;
  return EXTERNAL_TEXT.test(t) && !CONFIG_ROW.test(t) && !/^(AppSystem|BusinessUnit)\b/.test(str(r?.expect?.db));
};
const isCounterRow = (r: Any) => {
  const ty = String(r?.expect?.type);
  const t = rowText(r);
  if (["mutation", "download", "ui", "toast"].includes(ty) && COUNTER_ACTIONS.some((a) => hasWord(t, a))) return true;
  return ["mutation", "download"].includes(ty) && COUNTER_TEXT.test(t);
};
function r11(inv: Inv): string[] {
  const money = rowsOf(inv).filter(isMoneyRow);
  if (!money.length) return ["ตัวจับแถวเงินไม่เจอแถวเลย (ตัวตรวจพัง/ทะเบียนหาย)"];
  const bad = money.filter((r) => !SAFETY.includes(String(r?.safety ?? "")));
  return bad.length ? [`${bad.length}/${money.length} แถวเงินไม่มี safety — ต่อหน้า: ${perPage(bad)} — ${bad.slice(0, 8).map(tidOf).join(", ")}`] : [];
}
function r12(inv: Inv): string[] {
  const p: string[] = [];
  const rows = rowsOf(inv);
  const badVal = rows.filter((r) => "safety" in (r ?? {}) && !SAFETY.includes(String(r.safety)));
  if (badVal.length) p.push(`safety ผิดค่า ${badVal.length}: ${badVal.slice(0, 5).map((r) => `${tidOf(r)}=${JSON.stringify(r.safety)}`).join(", ")}`);
  const ext = rows.filter(isExternalRow);
  const badExt = ext.filter((r) => r?.safety !== "external");
  if (badExt.length) p.push(`${badExt.length}/${ext.length} แถวภายนอกไม่ใช่ safety external — ต่อหน้า: ${perPage(badExt)} — ${badExt.slice(0, 6).map(tidOf).join(", ")}`);
  const ctr = rows.filter((r) => isCounterRow(r) && !isExternalRow(r));
  const badCtr = ctr.filter((r) => r?.safety !== "counter" && r?.safety !== "external");
  if (badCtr.length) p.push(`${badCtr.length}/${ctr.length} แถวเลขเอกสารไม่ใช่ safety counter — ${badCtr.slice(0, 6).map(tidOf).join(", ")}`);
  const over = rows.filter((r) => "safety" in (r ?? {}) && ["navigate", "modal"].includes(String(r?.expect?.type)));
  if (over.length) p.push(`safety บนแถว navigate/modal (กดได้ปลอดภัย — ห้ามตัดออกจากตัวกด) ${over.length}: ${over.slice(0, 5).map(tidOf).join(", ")}`);
  if (!ext.length) p.push("ตัวจับแถวภายนอกไม่เจอแถวเลย (ตัวตรวจพัง)");
  return p;
}
/** คีย์ข้อความที่ note อ้าง: msg:<คีย์> · pos.x.y.* · "คีย์|ข้อความ|ข้อความตั้งต้น|key|message pos.x.y" (คีย์สิทธิ์/ชื่อ audit ไม่นับ) */
function noteRefs(inv: Inv): { key: string; tree: boolean; where: string }[] {
  const out: { key: string; tree: boolean; where: string }[] = [];
  for (const r of rowsOf(inv)) {
    const note = String(r?.expect?.note ?? "");
    for (const m of note.matchAll(/(msg:)?\b((?:pos|common)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)(\.\*)?/g)) {
      const at = m.index ?? 0;
      const prev = at > 0 ? note[at - 1]! : " ";
      if (!m[1] && /[\w./-]/.test(prev)) continue;
      const before = note.slice(Math.max(0, at - 16), at);
      const named = !!m[1] || !!m[3] || /(คีย์|ข้อความ|ข้อความตั้งต้น|\bkey|\bmessage)\s*$/i.test(before);
      if (named) out.push({ key: m[2]!, tree: !!m[3], where: tidOf(r) });
    }
  }
  return out;
}
function rMsg(inv: Inv, F: Facts, loc: "th" | "en"): string[] {
  const keys = F.msgs[loc]!;
  if (keys.size < 500) return [`อ่าน src/messages/${loc} ได้ ${keys.size} คีย์ (ตัวตรวจพัง)`];
  const allKeys = [...keys.keys()];
  const resolves = (k: string, tree: boolean) => (!tree && keys.has(k) && typeof keys.get(k) === "string") || allKeys.some((x) => x.startsWith(`${k}.`)) || (!tree && keys.has(k));
  const refs = noteRefs(inv);
  const bad = refs.filter((x) => !resolves(x.key, x.tree));
  return bad.length ? [`${bad.length}/${refs.length} คีย์ไม่มีใน ${loc}: ${bad.slice(0, 8).map((x) => `${x.key}${x.tree ? ".*" : ""} (${x.where})`).join(" · ")}`] : [];
}

// ═════════════════════════ probe: ทำสำเนาทะเบียนให้ผิดหนึ่งจุด → ตัวตรวจเดียวกันต้องแดง ═════════════════════════
const PROBE_TID = "p41probeghost"; // ไม่มีขีด/ไม่ขึ้นต้น pos- — แพตเทิร์นกว้างในโค้ด (`${x}-total` · `${a}-${b}`) จับไม่ได้
function firstRow(inv: Inv, pred: (r: Any) => boolean): Any | null {
  return rowsOf(inv).find(pred) ?? null;
}
function probeInv(inv: Inv, mut: (c: Inv) => void): Inv {
  const c = clone(inv);
  mut(c);
  return c;
}
function probeOutcome(problems: string[]): string {
  return problems.length ? `แดงตามคาด (${problems[0]!.slice(0, 70)})` : "ไม่แดง ❗";
}

// ═════════════════════════ รัน ═════════════════════════
console.log(`${SUITE} — ข้อสอบสถิต ${NODB ? "(--no-db = โหมดเดียวกัน)" : ""} · ทรี ${ROOT} · head ${(git(["rev-parse", "--short=8", "HEAD"]) ?? "?").trim()} · PIN ${PIN}`);
const invRaw = rd(INVENTORY);
const snapBefore = { inv: sha(invRaw), status: git(["status", "--porcelain", "--untracked-files=all", "--", "scripts", "ledger", "src", "prisma"]) ?? "?" };
let INV: Inv = null;
try {
  INV = JSON.parse(invRaw) as Inv;
} catch (e) {
  console.log(`❌ อ่าน ${INVENTORY} ไม่ได้: ${(e as Error).message}`);
}
const F = readFacts(INV);
console.log(
  `   ทะเบียน ${rowsOf(INV).length} แถว · ไฟล์ POS ${F.posFiles.length} · testid ใน src ${F.srcIds.length} · model ${F.models.size} · id ข้อสอบ DB ${F.dbCheckIds.size} (${F.listedSuites} ชุดมี --list) · testid ที่ข้อสอบอ้าง ${F.testUsed.size} · mockup ${F.mockupFiles.length} · การ์ดปฏิเสธ ${F.refusals.length}`,
);
let tempDir = "";

async function step(id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ตรวจได้ (ไม่ throw)", `THROW ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
}
/** ข้อมาตรฐาน: ผลจริง + probe (ต้องแดง) */
function judge(id: string, expected: string, real: string[], probe: string[], okText: string): void {
  const pOk = probe.length > 0;
  chk(id, real.length === 0 && pOk, expected, real.length ? joinP(real, 6) : pOk ? okText : "probe ไม่แดง — ตัวตรวจจับความผิดที่ใส่ไว้ไม่ได้", probeOutcome(probe));
}

await step("R1", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, (x) => !!str(x?.expect?.target) && x?.expect?.type !== "ui");
    if (r) delete r.expect.target;
  });
  judge("R1", "0 แถวไม่มี target", r1(INV), r1(pr), `${rowsOf(INV).length} แถวมี target/state`);
});
await step("R2", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, (x) => x?.expect?.type === "mutation");
    if (r) {
      delete r.expect.db;
      r.oracle = "P4.1-PROBE-NOPE";
    }
  });
  judge("R2", "0 แถว mutation ไร้ db/oracle id", r2(INV, F), r2(pr, F), `${rowsOf(INV).filter((r) => r?.expect?.type === "mutation").length} แถว mutation ครบ`);
});
await step("R3", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, () => true);
    if (r) {
      r.opener = [PROBE_TID];
      r.viewport = "huge";
    }
  });
  judge("R3", "$fields ครบ + คีย์ถูกรูป", r3(INV), r3(pr), `ถูกรูป (opener ${rowsOf(INV).filter((r) => "opener" in r).length} · needs ${rowsOf(INV).filter((r) => "needs" in r).length} · viewport ${rowsOf(INV).filter((r) => "viewport" in r).length})`);
});
await step("R4", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, (x) => isPublicPage(String(x?.page ?? "")));
    if (r) r.roles = ["owner"];
    const s = firstRow(c, (x) => !isPublicPage(String(x?.page ?? "")));
    if (s) s.roles = [...(Array.isArray(s.roles) ? s.roles : []), "public"];
  });
  judge("R4", "public ครบ", r4(INV, F), r4(pr, F), `${rowsOf(INV).filter((r) => isPublicPage(String(r?.page ?? ""))).length} แถวหน้าสาธารณะ = public`);
});
await step("R5", () => {
  const pr = probeInv(INV, (c) => {
    const items: Any[] = Array.isArray(c?.baselineDebt?.items) ? c.baselineDebt.items : [];
    const d = items.find((x) => !LEGACY_OUT.includes(String(x?.file)));
    if (d) d.untestid = Number(d.untestid ?? 0) + 1;
    else items.push({ file: "src/app/app/sys/[id]/pos/sales/page.tsx", untestid: 1 });
  });
  // probe ของตัวสแกน: element กดได้ไร้ testid ในซอร์สสังเคราะห์ต้องนับได้
  const synth = (fp.untestidControls(`export const X = () => <button onClick={() => 1}>x</button>;`, "probe.tsx") as string[]).length;
  const probe = r5(pr, F);
  if (synth !== 1) probe.length = 0;
  judge("R5", "หนี้ในขอบเขต 0 + $legacyOut + ไม่ลบปุ่ม", r5(INV, F), probe, `หนี้ในขอบเขต 0 · นอกขอบเขต ${LEGACY_OUT.map((f) => `${f.split("/").pop()} ${(F.debtNow.get(f) ?? []).length}`).join(" · ")}`);
});
await step("R6", () => {
  const F2: Facts = { ...F, mockups: { ...F.mockups, "01-register": { ...(F.mockups["01-register"] ?? {}), buttons: 100000 } } };
  const real = r6(INV, F);
  const probe = r6(INV, F2).filter((x) => x.includes("01-register|buttons") || x.includes("ไม่มี $mockupGaps"));
  const pOk = probe.length > 0;
  const det = mockupGaps(INV, F).detail.join(" · ");
  chk("R6", real.length === 0 && pOk, "ส่วนต่างทุกจุดมีเหตุผล", real.length ? `${joinP(real, 8)} · นับ (ปุ่ม/ลิงก์/ช่อง mockup/ทะเบียน): ${det}` : pOk ? `ครบ · ${det}` : "probe ไม่แดง", probeOutcome(probe));
});
await step("R7", async () => {
  const real = await r7(ROOT);
  // probe: สำเนาทะเบียน (แถวผี + ลบแถวของปุ่มจริงหนึ่งแถว) ในโฟลเดอร์ชั่วคราว · src = symlink (อ่านอย่างเดียว)
  tempDir = mkdtempSync(join(tmpdir(), "qc-pos-p41-"));
  let pr = { a: null as boolean | null, b: null as boolean | null, detail: "ไม่รัน" };
  try {
    mkdirSync(join(tempDir, "scripts"));
    symlinkSync(join(ROOT, "src"), join(tempDir, "src"));
    for (const f of ["crm-ui-inventory.json", "pos-sale-contract.json"]) if (ex(`scripts/${f}`)) symlinkSync(join(ROOT, "scripts", f), join(tempDir, "scripts", f));
    const c = clone(INV);
    const live = new Set(F.posIds.filter((x) => x.interactive && !x.id.includes("*")).map((x) => x.id));
    const victim = rowsOf(c).findIndex((r) => live.has(tidOf(r)));
    if (victim >= 0) c.rows.splice(victim, 1);
    c.rows.push({ page: `${STAFF}register`, testid: PROBE_TID, kind: "button", roles: ["owner"], hiddenFor: [], expect: { type: "ui", target: "pos-register", state: "changes" }, wo: "P4.1", oracle: "", system: "POS" });
    if (rowsOf(c).length) c.rows.push(clone(c.rows[0])); // แถวซ้ำ — F15.3b ต้องแดงแม้ตัวจับแถวผีถูกแพตเทิร์นกว้างกลืน (CD-P41-O8)
    writeFileSync(join(tempDir, INVENTORY), JSON.stringify(c));
    pr = await r7(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  const pOk = pr.a === false && pr.b === false;
  chk("R7", real.a === true && real.b === true && pOk, "F15.3a + F15.3b เขียว", pOk ? real.detail : `${real.detail} · probe ไม่แดงครบ (${pr.detail})`, pOk ? "แดงตามคาด (F15.3a + F15.3b)" : `ไม่แดง ❗ ${pr.detail.slice(0, 120)}`);
});
await step("R8", () => {
  const F2: Facts = { ...F, testUsed: new Map([...F.testUsed, [PROBE_TID, ["probe"]]]) };
  const nonReg = [...F.testUsed.keys()].filter((id) => !matchesAny(id, rowsOf(INV).map(tidOf))).length;
  judge("R8", "0 testid ผี", r8(INV, F), r8(INV, F2), `${F.testUsed.size} testid ที่ข้อสอบอ้าง (ไม่อยู่ในทะเบียน ${nonReg} = ไม่ใช่ตัวกด แต่มีในโค้ด)`);
});
await step("R9", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, (x) => Array.isArray(x?.roles) && x.roles.length > 0);
    if (r) r.hiddenFor = [...r.roles];
    const s = firstRow(c, (x) => x !== r);
    if (s) s.hiddenFor = ["nobody"];
  });
  judge("R9", "hiddenFor ⊆ บทบาท · ไม่ทับ roles", r9(INV), r9(pr), `${rowsOf(INV).filter((r) => Array.isArray(r?.hiddenFor) && r.hiddenFor.length).length} แถวมี hiddenFor ถูกต้อง`);
});
await step("R9b", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, (x) => !isPublicPage(String(x?.page ?? "")));
    if (r) {
      r.roles = (Array.isArray(r.roles) ? r.roles : []).filter((x: string) => x !== "manager");
      r.hiddenFor = (Array.isArray(r.hiddenFor) ? r.hiddenFor : []).filter((x: string) => x !== "manager");
    }
  });
  const staff = rowsOf(INV).filter((r) => !isPublicPage(String(r?.page ?? "")));
  judge("R9b", "ทุกแถวหน้าพนักงานระบุ manager", r9b(INV), r9b(pr), `${staff.length} แถวหน้าพนักงาน · manager ใน roles ${staff.filter((r) => Array.isArray(r?.roles) && r.roles.includes("manager")).length} · ใน hiddenFor ${staff.filter((r) => Array.isArray(r?.hiddenFor) && r.hiddenFor.includes("manager")).length}`);
});
await step("R10", () => {
  const F2: Facts = { ...F, refusals: [...F.refusals, "pos-p41-probe-refusal"] };
  judge("R10", "การ์ดปฏิเสธมีแถว ui · refused ครบ", r10(INV, F), r10(INV, F2), `${F.refusals.length} การ์ด: ${F.refusals.join(", ")}`);
});
await step("R11", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, isMoneyRow);
    if (r) delete r.safety;
  });
  judge("R11", "แถวเงินมี safety ครบ", r11(INV), r11(pr), `${rowsOf(INV).filter(isMoneyRow).length} แถวเงินมี safety`);
});
await step("R12", () => {
  const pr = probeInv(INV, (c) => {
    const r = firstRow(c, isExternalRow);
    if (r) r.safety = "money";
    const s = firstRow(c, (x) => x?.expect?.type === "navigate");
    if (s) s.safety = "bogus";
  });
  judge("R12", "safety ถูกค่า/ถูกชนิด", r12(INV), r12(pr), `ภายนอก ${rowsOf(INV).filter(isExternalRow).length} · เลขเอกสาร ${rowsOf(INV).filter(isCounterRow).length}`);
});
for (const [id, loc] of [["R13", "th"], ["R14", "en"]] as const) {
  await step(id, () => {
    const pr = probeInv(INV, (c) => {
      const r = firstRow(c, () => true);
      if (r) r.expect = { ...(r.expect ?? {}), note: `${String(r?.expect?.note ?? "")} · msg:pos.p41.probe.missing` };
    });
    const refs = noteRefs(INV);
    judge(id, `คีย์ที่ note อ้างมีใน ${loc}`, rMsg(INV, F, loc), rMsg(pr, F, loc), `${refs.length} คีย์อ้าง (${[...new Set(refs.map((x) => `${x.key}${x.tree ? ".*" : ""}`))].slice(0, 6).join(", ")})`);
  });
}
await step("Z1", () => {
  const after = { inv: sha(rd(INVENTORY)), status: git(["status", "--porcelain", "--untracked-files=all", "--", "scripts", "ledger", "src", "prisma"]) ?? "?" };
  const residue = (b: typeof after, a: typeof after, tmp: string) => [
    ...(b.inv !== a.inv ? [`ทะเบียนถูกแก้ระหว่างรัน (${b.inv} → ${a.inv})`] : []),
    ...(b.status !== a.status ? [`สถานะ git เปลี่ยนระหว่างรัน`] : []),
    ...(tmp && existsSync(tmp) ? [`โฟลเดอร์ชั่วคราว ${tmp} ค้าง`] : []),
  ];
  const real = residue(snapBefore, after, tempDir);
  const probe = residue(snapBefore, { inv: "probe", status: `${after.status}?? probe\n` }, "");
  judge("Z1", "ไม่มีของค้าง", real, probe, `ทะเบียน ${after.inv} · git status เท่าเดิม · ไม่มีโฟลเดอร์ชั่วคราวค้าง`);
});

// ═════════════════════════ สรุป ═════════════════════════
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const missingIds = CHECKS.map(([id]) => id).filter((id) => !results.has(id));
for (const id of missingIds) failed.push(id);
console.log(`\n${failed.length ? "❌" : "✅"} ${SUITE}: ${results.size - failed.length + missingIds.length}/${CHECKS.length} ผ่าน${failed.length ? ` — แดง: ${failed.join(" ")}` : ""}`);
console.log(
  `JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: NODB ? "no-db" : "static", total: CHECKS.length, passed: CHECKS.length - failed.length, failed, skipped: false, registered: CHECKS.length, pin: PIN, probes: Object.fromEntries([...results.entries()].map(([id, r]) => [id, r.probe.startsWith("แดงตามคาด")])) })}`,
);
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P4.1: ตัวกด (P4.2 qc-pos-buttons.mts + pos-buttons-fixtures.mts · มติ 4) · การแก้บั๊กที่ตัวกดพบ (P4.3) ·
//   หน้าขายเดิม register-ui.tsx / register-legacy-page.tsx (มติ 3 · W29) · visual-pos.mts ห้ามแก้ (⚠️5)
// ชุด regression ของผู้สร้าง: fitness-pos (F15.3) · fitness ±env · qc-pos-p1.3 (S5.5 แถวหน้าขาย) · qc-pos-p3.4 (ST7) · qc-pos-p2.14 (V3/V4/G1/G2) · typecheck 8192
