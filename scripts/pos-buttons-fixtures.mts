// pos-buttons-fixtures.mts — POS RUN ใบ P4.2 (ตัวกดทุกปุ่ม · ผู้เขียนตัวกด บัญชี B · 22 ต.ค. 2026)
//   โมดูลคู่ของ scripts/qc-pos-buttons.mts (ตัวกด) และ scripts/qc-pos-p4.2.mts (ข้อสอบสรุปผล) — 3 ชั้น:
//   (1) ทะเบียน + กติกา (บริสุทธิ์ · ไม่แตะ DB · ไม่ import "@/…"): อ่าน scripts/pos-ui-inventory.json · กติกาแถวของ P4.1
//       ถูก "ยืม" จาก scripts/qc-pos-p4.1.mts ตรง ๆ (CD-P42-W1: ข้อสอบ P4.1 ไม่ export ⇒ ดึงประกาศตามชื่อจากซอร์ส → transpile →
//       ประเมินในขอบเขตปิด · ดึงไม่ได้ = ตัวกดไม่วางแผนเลย (fail-closed) — ไม่เขียนกติกาซ้ำ) · ตารางผ่าน (pass matrix · มติ 6) ·
//       ตัวจำแนกแถว (press / absent / visible / skip(เหตุผล)) ที่ตัวกดและข้อสอบใช้ร่วมกัน
//   (2) fixture บน QC5 (มติ 5 · W30): สาขาเฉพาะของตัวกด `posqc-btn-unit` ในร้าน coffee (หา-หรือ-สร้าง · คงไว้) ผูกระบบของร้าน ·
//       ผู้ใช้ตัวกด (ผู้จัดการ/แคชเชียร์ของสาขานี้ · หา-หรือ-สร้าง · คงไว้) · เครื่องของตัวกด (registerDevice) · PIN (setStaffPin · แถวเดิมคืนค่า) ·
//       โทเคนผู้ขาย (issueStaffToken) · กะของตัวกด (openShift → closeShift นับตรงยอด ทุกรอบ) · ค่าตั้ง settings.pos ของระบบ POS
//       จำทั้งก้อนไว้ใน settings.pos._qcP42Before แล้วคืนค่าตรงตัวหลังทุกแถวที่เขียน + finally + สัญญาณ (แบบ P3.9U/P3.8U)
//       🔴 ด่านร้าน QC = `T.tenantId === "posqc-coffee-tenant"` (ค่าคงที่ · ไม่ใช่ slug/prefix — บทเรียน 22 ต.ค. 05:0xZ)
//       🔴 ทุกขั้นที่ล้มโยน StepError บอกขั้น + ค่าที่ใช้ · ไม่สร้างระบบ/ข้อมูลถาวรบน QC4 เด็ดขาด (writer ทุกตัวถามด่าน QC5 ก่อน)
//   (3) pre-flight อ่านอย่างเดียว (`--preflight`): ประเมินเงื่อนไขของ writer ทุกตัวที่ fixture จะเรียก แล้วพิมพ์ทีละบรรทัด (PF …) —
//       รันบน QC4 ได้ (อ่านอย่างเดียว · ผ่าน qc4.sh + ล็อก POS) ก่อนส่งงาน · บน QC5 ก่อนรอบจริงของผู้คุม
//
// ใช้ (ผู้เขียนตัวกด — อ่านอย่างเดียว):
//   bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight
// ผู้คุม (QC5 ก่อนรอบจริง): bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, randomInt } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// ═════════════════════════ (1) ทะเบียน + กติกา (บริสุทธิ์) ═════════════════════════
export const REGISTRY_PATH = "scripts/pos-ui-inventory.json";
export const P41_ORACLE = "scripts/qc-pos-p4.1.mts";
export const SHOTS_DIR = ".qc-shots/pos/buttons";
export const QC_TENANT = "posqc-coffee-tenant";
export const STAFF = "/app/sys/[id]/pos/";

export type Row = {
  page: string;
  testid: string;
  kind: string;
  roles: string[];
  hiddenFor?: string[];
  expect: { type: string; target?: string; state?: string; db?: string; anyOf?: (string | { type?: string; target?: string; state?: string })[]; resultTarget?: string; note?: string };
  wo?: string;
  oracle?: string;
  system?: string;
  query?: string;
  opener?: string | string[];
  needs?: string | string[];
  viewport?: string | string[];
  safety?: string;
};
export type Registry = { raw: string; hash: string; json: Any; rows: Row[] };
export const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const rowKey = (r: Pick<Row, "page" | "testid">) => `${r.page}#${r.testid}`;

export function readRegistry(root: string, rel = REGISTRY_PATH): Registry {
  const raw = readFileSync(join(root, rel), "utf8");
  const json = JSON.parse(raw) as Any;
  const rows = Array.isArray(json?.rows) ? (json.rows as Row[]) : [];
  if (!rows.length) throw new StepError("อ่านทะเบียน", `${rel} ไม่มี rows`);
  return { raw, hash: sha16(raw), json, rows };
}

/** ชื่อประกาศที่ยืมจากข้อสอบ P4.1 (ลำดับตามไฟล์ · ชื่อหาย = fail-closed) — CD-P42-W1 */
const P41_NAMES = [
  "isRec", "str", "escRe", "globRe", "matchesAny",
  "ROLE_UNIVERSE", "SAFETY", "VIEWPORTS", "NEW_FIELDS", "LEGACY_OUT", "isPublicPage", "STAFF",
  "MONEY_ACTIONS", "MONEY_MODELS", "EXTERNAL_ACTIONS", "EXTERNAL_TEXT", "CONFIG_ROW", "COUNTER_ACTIONS", "COUNTER_TEXT", "REFUSAL_ID",
  "readDbCheckIds", "rowsOf", "tidOf", "rowText", "hasWord", "pageShort", "r3", "r9", "isMoneyRow", "isExternalRow", "isCounterRow",
] as const;
export type P41Rules = {
  isPublicPage: (p: string) => boolean;
  globRe: (g: string) => RegExp;
  matchesAny: (id: string, list: readonly string[]) => boolean;
  SAFETY: string[];
  VIEWPORTS: string[];
  ROLE_UNIVERSE: string[];
  isMoneyRow: (r: Any) => boolean;
  isExternalRow: (r: Any) => boolean;
  isCounterRow: (r: Any) => boolean;
  r3: (inv: Any) => string[];
  r9: (inv: Any) => string[];
  readDbCheckIds: () => { ids: Set<string>; suites: number };
  /** sha ของซอร์สข้อสอบ P4.1 ที่ยืมมา (บันทึกลงสรุป) */
  sourceHash: string;
};
/** ตัดประกาศระดับบนสุดตามชื่อ: บรรทัดเริ่ม → บรรทัดถัดไปที่ย่อหน้า/ว่าง/ปิดวงเล็บ (ไฟล์ P4.1 เขียนแบบนี้ทุกประกาศ) */
export function extractDecl(src: string, name: string): string {
  const lines = src.split("\n");
  const re = new RegExp(`^(?:export\\s+)?(?:const|let|function|async function)\\s+${name}\\b`);
  const i = lines.findIndex((l) => re.test(l));
  if (i < 0) throw new StepError("ยืมกติกา P4.1", `ไม่พบประกาศ ${name} ใน ${P41_ORACLE}`);
  const out = [lines[i]!];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j]!;
    if (l === "" || /^[\s}\])]/.test(l)) out.push(l);
    else break;
  }
  return out.join("\n");
}
export function loadP41Rules(root: string): P41Rules {
  const src = readFileSync(join(root, P41_ORACLE), "utf8");
  const code = P41_NAMES.map((n) => extractDecl(src, n)).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false } }).outputText;
  const rd = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
  // ขอบเขตปิด: ตัวแปรที่ประกาศที่ยืมอ้างถึง (ROOT · SUITE · rd · readdirSync · join) ส่งเข้าไปตรง ๆ — ไม่มี global อื่น
  const fn = new Function("ROOT", "SUITE", "rd", "readdirSync", "join", `"use strict";\n${js}\nreturn { ${P41_NAMES.join(", ")} };`) as (...a: unknown[]) => Any;
  const m = fn(root, "qc-pos-p4.1", rd, readdirSync, join);
  // ตัวพิสูจน์ว่ายืมมาครบและทำงาน (ไม่ผ่าน = โยน — ตัวกดไม่วางแผน)
  const probes: [string, boolean][] = [
    ["isPublicPage(/r/x)", m.isPublicPage("/r/[token]") === true && m.isPublicPage(`${STAFF}register`) === false],
    ["SAFETY", Array.isArray(m.SAFETY) && m.SAFETY.includes("money") && m.SAFETY.includes("external") && m.SAFETY.includes("counter")],
    ["VIEWPORTS", Array.isArray(m.VIEWPORTS) && m.VIEWPORTS.join(",") === "desktop,tablet,mobile"],
    ["isMoneyRow", m.isMoneyRow({ expect: { type: "mutation", target: "action:submitRegisterSaleAction" } }) === true && m.isMoneyRow({ expect: { type: "ui" } }) === false],
    ["isExternalRow", m.isExternalRow({ expect: { type: "mutation", target: "action:sendReceiptAction" } }) === true],
    ["isCounterRow", m.isCounterRow({ expect: { type: "mutation", target: "action:issueFullTaxInvoiceAction" } }) === true],
    ["r3", Array.isArray(m.r3({ $fields: {}, rows: [] })) && m.r3({ $fields: {}, rows: [] }).length > 0],
    ["r9", Array.isArray(m.r9({ rows: [{ testid: "x", roles: ["owner"], hiddenFor: ["owner"] }] })) && m.r9({ rows: [{ testid: "x", roles: ["owner"], hiddenFor: ["owner"] }] }).length > 0],
  ];
  const bad = probes.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) throw new StepError("ยืมกติกา P4.1", `ตัวพิสูจน์ไม่ผ่าน: ${bad.join(", ")}`);
  return { ...m, sourceHash: sha16(src) } as P41Rules;
}

// ── ตารางผ่าน (pass matrix) · มติ 6 · มติ 9 (รอบละ 1 ช่อง) ──
export const USERS = ["owner", "manager", "cashier", "public"] as const;
export type UserKey = (typeof USERS)[number];
export const DEVICES = {
  desktop: { w: 1440, h: 900, reg: "desktop", isMobile: false, hasTouch: false },
  ipad: { w: 1024, h: 768, reg: "tablet", isMobile: false, hasTouch: true },
  mobile: { w: 390, h: 844, reg: "mobile", isMobile: true, hasTouch: true },
} as const;
export type DeviceKey = keyof typeof DEVICES;
export type Locale = "th" | "en";
export type Cell = { user: UserKey; device: DeviceKey; locale: Locale };
export const cellName = (c: Cell) => `${c.user}-${c.device}${c.locale === "en" ? "-en" : ""}`;
export const summaryFile = (c: Cell) => `${SHOTS_DIR}/summary-${cellName(c)}.json`;
/** EN_MOBILE_PAGES ของ visual-pos (register · sales · receipt-public · display · qr-public) ในรูป page ของทะเบียน */
export const isEnMobilePage = (page: string) => page === `${STAFF}register` || page === `${STAFF}sales` || page.startsWith("/r/") || page === "/d" || page.startsWith("/q/");
/**
 * ตารางผ่าน 19 ช่อง (CD-P42-W3): th = staff × 3 ขนาด · en = staff × 1440 + staff × 390 (เฉพาะหน้า EN_MOBILE) ·
 * public = 1440 + 390 ทั้ง th/en (en 390 เฉพาะหน้า EN_MOBILE — /developers/pos ไม่อยู่) — ไม่มี ipad ของ public (มติ 6)
 */
export const PASS_MATRIX: readonly Cell[] = [
  ...(["owner", "manager", "cashier"] as const).flatMap((u) => (["desktop", "ipad", "mobile"] as const).map((d) => ({ user: u, device: d, locale: "th" as const }))),
  ...(["owner", "manager", "cashier"] as const).flatMap((u) => (["desktop", "mobile"] as const).map((d) => ({ user: u, device: d, locale: "en" as const }))),
  ...(["desktop", "mobile"] as const).flatMap((d) => (["th", "en"] as const).map((l) => ({ user: "public" as const, device: d, locale: l }))),
];
const asList = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** แถวของช่อง: หน้าตามชนิดผู้ใช้ (public ↔ หน้าสาธารณะ) · en 390 = หน้า EN_MOBILE · viewport ของแถวไม่ครอบจอนี้ = ทะเบียนไม่อ้าง (ไม่อยู่ในช่อง) */
export function cellRows(rows: readonly Row[], cell: Cell, rules: Pick<P41Rules, "isPublicPage">): Row[] {
  const reg = DEVICES[cell.device].reg;
  return rows.filter((r) => {
    const pub = rules.isPublicPage(String(r.page));
    if ((cell.user === "public") !== pub) return false;
    if (cell.locale === "en" && cell.device === "mobile" && !isEnMobilePage(r.page)) return false;
    const vp = asList(r.viewport);
    if (vp.length && !vp.includes(reg)) return false;
    return true;
  });
}

// ── ตัวจำแนกแถว (บริสุทธิ์) ──
/** เหตุผลที่ข้ามได้ (ข้อสอบ W6 ตรวจว่าเหตุผลทุกตัว ⊆ ชุดนี้) */
export const SKIP_REASONS = {
  "no-role-claim": "บทบาทนี้ไม่อยู่ทั้งใน roles และ hiddenFor — ทะเบียนไม่อ้างอะไร",
  "not-pos-page": "หน้าไม่ใช่ของ POS (หน้าครัวเดิม /app/u/[unitSlug]/restaurant/kds · หมายเหตุ P4.1)",
  "missing-target": "ทะเบียนยังไม่มี expect.target (R1 ของ P4.1 — รอผู้สร้าง P4.1)",
  "missing-db": "แถว mutation ยังไม่มี db ที่ถูกรูปหรือ oracle id (R2 ของ P4.1 — รอผู้สร้าง P4.1)",
  "missing-safety": "ตัวจับแถวเงิน/ภายนอก/เลขเอกสารของ P4.1 จับได้แต่แถวไม่มี safety (R11/R12) — ไม่กด (fail-closed)",
  external: "safety external — ไม่กด ต้องอ้าง oracle (มติ 5 · W3)",
  "once-per-run": "แถว money/counter กดจริงแล้วในรอบนี้ (มติ 5: ครั้งเดียวต่อรอบ)",
  needs: "row.needs — ข้อมูลตั้งต้นไม่มีในชุด fixture (คอนโทรลไม่ขึ้น/ใช้ไม่ได้)",
  "needs-fixture": "ตัวแปรในหน้า/คิวรีหาค่าจริงไม่ได้ (โทเคนหน้าสาธารณะ · โต๊ะ · รหัสจับคู่ …)",
  "file-upload": "input[type=file] — อัปโหลดขึ้นที่เก็บไฟล์จริง (ไม่กด)",
  // ── P4.2 rules update (ผู้คุม B 22 ต.ค. 21:05Z · CD-P42-R1…R13) — นับใน perReason ทุกตัว · ไม่ทำให้ตก (เกณฑ์ผ่านเดิม) ──
  "hidden-input": "input[type=hidden] — ไม่มีอะไรให้กด/มองเห็น (CD-P41-B2 · CD-P42-R1)",
  static: "testid เดียวกันเป็น span/ชิปนิ่งสำหรับผู้ใช้ 1 สาขา — ไม่ใช่ element ที่กดได้ (CD-P41-B3/F15 · CD-P42-R2)",
  "disabled-expected": "ผู้ใช้ในบทบาทเห็นคอนโทรลแต่ปิดใช้ ตามที่ทะเบียนบอก (needs อ้าง CD-P41-F13 หรือ expect disabled · CD-P42-R3)",
  "needs-persona": "opener/needs ที่บทบาทนี้ทำให้เกิดไม่ได้ (จอ PIN ที่ถึงได้เฉพาะผู้ไม่มีสิทธิ์ · การ์ดปฏิเสธที่ไม่มีผู้ใช้ QC ถึง — CD-P41-F17/F12 · CD-P42-R5)",
  "idle-expected": "กดแล้วไม่มีผลเพราะอยู่ในสถานะนั้นแล้ว (radio aria-checked · สลับภาษา/สาขาไปที่เป็นอยู่ — CD-P41-F26/F27 · CD-P42-R8/R9)",
  "dead-known": "แถวตายที่รู้แล้ว (CD-P41-B6 · ไม่กด · นับไม่ตก จน P4.3 ลบ — CD-P42-R12)",
} as const;
export type SkipReason = keyof typeof SKIP_REASONS;
/** เหตุผลที่เป็น "ช่องโหว่ทะเบียน" — ข้อสอบ W8 ต้องเป็น 0 (ผู้สร้าง P4.1 เติมแล้ว) */
export const REGISTRY_GAP_REASONS: readonly SkipReason[] = ["missing-target", "missing-db", "missing-safety"];
export type PlanAction = "press" | "absent" | "visible" | "skip";
export type PlanItem = {
  key: string;
  row: Row;
  idx: number;
  action: PlanAction;
  reason?: SkipReason;
  detail?: string;
  /** safety ที่ตัวกดใช้ (ของแถว หรือ "money"/"external"/"counter" ที่ตัวจับ P4.1 พบเมื่อแถวไม่มี) */
  safety: "money" | "external" | "counter" | null;
  /** money/counter = กดในสาขา posqc-btn เท่านั้น ครั้งเดียวต่อรอบ */
  moneyUnit: boolean;
  /** แถว mutation ตรวจผลด้วย: db (อ่าน prisma) · oracle (id ที่มีจริง) · ui (resultTarget/target) */
  verify: "db" | "oracle" | "ui" | "-";
  opener: string[];
  needs: string | null;
};
const isTestidLike = (s: string) => /^[a-z][a-z0-9*-]*$/.test(s) && s.includes("-");
export function oracleIdOk(o: unknown, ids: Set<string>): string | null {
  const t = String(o ?? "").split(/[\s,#·|;]+/).find((x) => ids.has(x));
  return t ?? null;
}
function dbOk(db: unknown): boolean {
  const s = String(db ?? "").trim();
  const m = /^([A-Z][A-Za-z0-9]+)(\([^)]*\))?([\s\S]*)$/.exec(s);
  return !!m && !!m[3]!.replace(/^[\s.:=]+/, "").trim();
}
/** จำแนกแถวของช่อง → การกระทำ (ไม่มี DB · ไม่มีเบราว์เซอร์ — ใช้ใน --list/--dry/ด่าน และรอบจริง) */
export function classify(row: Row, idx: number, cell: Cell, rules: P41Rules, oracleIds: Set<string>): PlanItem {
  const base: PlanItem = { key: rowKey(row), row, idx, action: "press", safety: null, moneyUnit: false, verify: "-", opener: asList(row.opener), needs: asList(row.needs).join(" · ") || null };
  const skip = (reason: SkipReason, detail = ""): PlanItem => ({ ...base, action: "skip", reason, detail });
  const roles = asList(row.roles);
  const hidden = asList(row.hiddenFor);
  const ex = row.expect ?? { type: "" };
  // safety (ของแถว · หรือตัวจับของ P4.1 เมื่อแถวไม่มี — fail-closed)
  const own = rules.SAFETY.includes(String(row.safety ?? "")) ? (row.safety as PlanItem["safety"]) : null;
  const detected: PlanItem["safety"] = rules.isExternalRow(row) ? "external" : rules.isCounterRow(row) ? "counter" : rules.isMoneyRow(row) ? "money" : null;
  base.safety = own ?? detected;
  base.moneyUnit = base.safety === "money" || base.safety === "counter";
  // CD-P42-R12: แถวตายที่รู้แล้ว (B6) — ก่อนทุกกติกา (ไม่เปิดหน้า ไม่กด) · นับเป็น skip dead-known
  const dk = DEAD_KNOWN[base.key];
  if (dk) return skip("dead-known", dk);
  if (!rules.isPublicPage(row.page) && !row.page.startsWith(STAFF)) return skip("not-pos-page", row.page);
  const isHidden = hidden.includes(cell.user);
  if (!isHidden && !roles.includes(cell.user)) return skip("no-role-claim", `roles ${roles.join(",") || "-"} · hiddenFor ${hidden.join(",") || "-"}`);
  if (isHidden) return { ...base, action: "absent" };
  // CD-P42-R5: บทบาทนี้ทำให้ opener/needs เกิดไม่ได้ (F17 จอ PIN · F12 การ์ดปฏิเสธ) — ก่อนตรวจเห็น (การ์ด F12 เป็น notice)
  const pu = personaUnreachable(row, cell.user);
  if (pu) return skip("needs-persona", pu);
  // CD-P42-R1: ช่องซ่อนที่ทะเบียนประกาศ (needs "type=hidden") — ตัวกดยังจับ input[type=hidden] ตอนรันด้วย (เหตุผลเดียวกัน)
  if (HIDDEN_INPUT_RE.test(base.needs ?? "")) return skip("hidden-input", "needs ประกาศ type=hidden");
  // การ์ด/ป้ายที่ไม่กด: notice · ui refused · ui disabled = ตรวจว่าเห็น (และ disabled) เท่านั้น
  if (row.kind === "notice" || (ex.type === "ui" && (ex.state === "refused" || ex.state === "disabled"))) return { ...base, action: "visible" };
  if (!own && detected) return skip("missing-safety", `ตัวจับ P4.1 = ${detected}`);
  if (base.safety === "external") {
    const o = oracleIdOk(row.oracle, oracleIds);
    return skip("external", o ? `oracle ${o}` : `ไม่มี oracle id ที่มีจริง (${row.oracle || "-"})`);
  }
  const target = String(ex.target ?? "");
  if (!target && !(ex.type === "ui" && ex.state) && !(ex.anyOf ?? []).length) {
    // ช่องกรอก/สวิตช์ ui ที่ไม่มีเป้า = ตรวจว่าค่าเปลี่ยน (ไม่ตาย) ได้ · ที่เหลือ (navigate/modal/toast/mutation/download) ต้องมีเป้า
    if (!(ex.type === "ui" && ["input", "textarea", "select", "toggle"].includes(row.kind))) return skip("missing-target", `${ex.type} ไม่มี target`);
  }
  if (ex.type === "mutation") {
    if (dbOk(ex.db)) base.verify = "db";
    else if (oracleIdOk(row.oracle, oracleIds)) base.verify = "oracle";
    else return skip("missing-db", `db "${ex.db ?? "-"}" · oracle "${row.oracle || "-"}"`);
  } else if (ex.type === "ui" || ex.type === "modal" || ex.type === "toast" || ex.type === "inline-error") base.verify = "ui";
  return base;
}
export type CellPlan = { cell: Cell; items: PlanItem[]; total: number; byAction: Record<string, number>; perReason: Record<string, number> };
export function planCell(reg: Registry, cell: Cell, rules: P41Rules, oracleIds: Set<string>, filter?: (r: Row) => boolean): CellPlan {
  const items: PlanItem[] = [];
  reg.rows.forEach((r, i) => {
    if (!cellRows([r], cell, rules).length) return;
    if (filter && !filter(r)) return;
    items.push(classify(r, i, cell, rules, oracleIds));
  });
  const byAction: Record<string, number> = {};
  const perReason: Record<string, number> = {};
  for (const it of items) {
    byAction[it.action] = (byAction[it.action] ?? 0) + 1;
    if (it.reason) perReason[it.reason] = (perReason[it.reason] ?? 0) + 1;
  }
  return { cell, items, total: items.length, byAction, perReason };
}
// ═════════════════════════ P4.2 rules update (CD-P42-R1…R13 · บริสุทธิ์ — ตัวกด/ด่าน/ข้อสอบใช้ร่วม) ═════════════════════════
/** CD-P42-R12 (B6 ของโน้ต P4.1 fix1 · CD-P41-B6 + แถว 844/964 ของรอบตรวจ): แถวตายที่รู้แล้ว — dead-known จน P4.3 ลบแถว */
export const DEAD_KNOWN: Readonly<Record<string, string>> = {
  [`${STAFF}register#pos-pay-button`]: "CD-P41-B6 · testid มีแค่หน้าขายเดิม register-ui.tsx (W29)",
  [`${STAFF}register#pos-member-select`]: "CD-P41-B6 · testid มีแค่หน้าขายเดิม register-ui.tsx (W29)",
  [`${STAFF}register#pos-catalog-item`]: "CD-P41-B6 · testid มีแค่หน้าขายเดิม register-ui.tsx (W29)",
  [`${STAFF}register#pos-reg-member-remove`]: "CD-P41-B6 · CartPanel ไม่ใช้ทางสำรองนี้ (memberSlot ส่งเสมอ)",
  [`${STAFF}settings#pos-settings-card-state-offline`]: "CD-P41-B6 · หน้า settings ส่ง offlineLive เสมอ",
  ["/app/u/[unitSlug]/restaurant/kds#pos-kds-legacy-open"]: "CD-P41-B6 · จอครัวเดิม redirect ก่อนแถบ (แถว 844)",
  [`${STAFF}sales#pos-sales-unit-all`]: "CD-P41-B6 · เป็น <option> ของ pos-bills-unit (แถว 964 · ถึงได้ด้วยขั้น pos-bills-unit=*)",
};
/**
 * CD-P42-R5 (CD-P41-F17 · F12): แถวที่บทบาทนี้ทำให้ opener/needs เกิดไม่ได้ — ใช้เมื่อแถวยังมี needs (ทะเบียนยังบอกว่ามีเงื่อนไข) ·
 * F17: จอ PIN ที่ถึงได้เฉพาะผู้ไม่มีสิทธิ์ (เจ้าของ/ผู้จัดการ เพดานส่วนลด 10000 · ไม่ติดด่านตาราง HR · ตัวกดใส่โทเคนพนักงานเสมอ · มีสิทธิ์ยกเลิกบิล) ·
 * F12: การ์ดปฏิเสธที่ไม่มีผู้ใช้ QC คนใดถึง (แคชเชียร์ได้การ์ดปฏิเสธทั้งหน้า หรือผ่านด่าน)
 */
export const PERSONA_UNREACHABLE: readonly { page: string; testids: readonly string[]; users: readonly UserKey[]; why: string }[] = [
  {
    page: `${STAFF}register`,
    testids: ["pos-discount-over-manager", "pos-discount-over-key-*", "pos-discount-over-key-0", "pos-discount-over-key-del", "pos-discount-over-clear", "pos-discount-over-pin-apply", "pos-discount-over-request", "pos-discount-over-cancel", "pos-approval-wait-close", "pos-approval-wait-cancel"],
    users: ["owner", "manager"],
    why: "CD-P41-F17 · จอส่วนลดเกินเพดาน: เจ้าของ/ผู้จัดการเพดานปริยาย 10000 bp (register-shared.ts POS_DISCOUNT_CAPS_DEFAULT) — ส่วนลด 90% ไม่เกิน",
  },
  {
    page: `${STAFF}register`,
    testids: ["pos-mgr-pin-manager", "pos-mgr-pin-key-*", "pos-mgr-pin-key-0", "pos-mgr-pin-key-del", "pos-mgr-pin-clear", "pos-mgr-pin-submit"],
    users: ["owner", "manager"],
    why: "CD-P41-F17 · จอ PIN ผู้จัดการ (OFF_SCHEDULE) ขึ้นเฉพาะพนักงานที่ติดด่านตาราง HR",
  },
  {
    page: `${STAFF}sales`,
    testids: ["pos-bills-need-pin-close", "pos-bills-need-pin-link", "pos-bills-mgr-pin-close"],
    users: ["owner", "manager"],
    why: "CD-P41-F17 · จอ PIN ของบิล: ตัวกดใส่โทเคนพนักงานเสมอ · เจ้าของ/ผู้จัดการมีสิทธิ์ยกเลิกบิล",
  },
  {
    page: "*",
    testids: ["pos-stock-count-refusal", "pos-stock-*-refusal", "pos-tables-refusal", "pos-orders-refusal", "pos-kds-refusal", "pos-shift-x-refusal"],
    users: ["cashier"],
    why: "CD-P41-F12 · การ์ดปฏิเสธที่ไม่มีผู้ใช้ QC ถึง (แคชเชียร์ได้การ์ดปฏิเสธทั้งหน้า หรือผ่านด่านของสาขาตัวเอง)",
  },
];
export function personaUnreachable(row: Row, user: UserKey): string | null {
  if (!asList(row.needs).length) return null;
  for (const g of PERSONA_UNREACHABLE) if ((g.page === "*" || g.page === row.page) && g.users.includes(user) && g.testids.includes(row.testid)) return g.why;
  return null;
}
/** CD-P42-R1: needs ที่ประกาศช่องซ่อน */
export const HIDDEN_INPUT_RE = /type=hidden/;
/**
 * CD-P42-R3 (CD-P41-F13): บทบาทที่ทะเบียนบอกว่า "เห็นแต่ปิดใช้" — ข้อความ needs ที่อ้าง CD-P41-F13 ระบุบทบาท (แคชเชียร์ → cashier ·
 * ผู้จัดการ → manager · ไม่ระบุ = ผู้ไม่ใช่เจ้าของ) · expect.state disabled = ทุกบทบาทใน roles · เจ้าของไม่ได้รับข้อยกเว้นจาก F13 เด็ดขาด
 * (กันข้อกังวลของ CD-P41-F13: needs ด้านสิทธิ์ต้องไม่ทำให้ regression ของเจ้าของ/ผู้จัดการผ่านแบบ skip)
 */
export function f13Users(row: Pick<Row, "needs" | "expect" | "roles">): UserKey[] {
  if (row.expect?.state === "disabled") return asList(row.roles) as UserKey[];
  const out = new Set<UserKey>();
  const add = (seg: string) => {
    const c = seg.includes("แคชเชียร์");
    const m = seg.includes("ผู้จัดการ");
    if (c || !m) out.add("cashier");
    if (m || !c) out.add("manager");
  };
  for (const n of asList(row.needs)) {
    for (let i = n.indexOf("CD-P41-F13"); i >= 0; i = n.indexOf("CD-P41-F13", i + 1)) {
      // ข้อความของ F13 = ช่วงหลัง "—" ตัวสุดท้ายก่อนรหัส ("— แคชเชียร์ QC เห็นแต่ปิดใช้ (disabled · CD-P41-F13)")
      const head = n.slice(0, i);
      const seg = head.slice(Math.max(head.lastIndexOf("—"), i - 160, 0));
      add(seg);
    }
  }
  return [...out];
}
/**
 * CD-P42-R7 (CD-P41-F22): กดที่ทิ้งผลข้างเคียงต่อแถวอื่น/รอบหน้า — ย้ายไปท้ายรอบ (หลังทุกหน้า) แล้ว fixture คืนค่าที่คืนได้ ·
 * แถวตาม fix2 (476 506 822 307 537 1161 1183) + แถวที่ needs/note บอก "press last"/"กดท้าย"/"reset"/CD-P41-F22 ·
 * pos-device-revoke-confirm (307 · ถอนเครื่องของเบราว์เซอร์นี้เอง) = ลำดับสุดท้ายเสมอ
 */
export const SIDE_EFFECT_KEYS: Readonly<Record<string, string>> = {
  [`${STAFF}settings#pos-settings-general-save-stock`]: "476 นโยบายสต็อกของสาขาค้าง BLOCK (BusinessUnit.settings) → คืนค่า settings ของสาขา",
  [`${STAFF}settings#pos-settings-account-confirm-off`]: "506 ปิดการลงบัญชีของ POS (AccountSystemLink) → setPosAccountLink เปิดคืน",
  [`${STAFF}kds#pos-kds-setup-link`]: "822 หน้าตั้งค่าร้านอาหารสร้างสถานีครัวปริยาย (คงไว้ในสาขา posqc-btn)",
  [`${STAFF}settings#pos-device-revoke-confirm`]: "307 ถอนเครื่องของเบราว์เซอร์นี้ → คืนสถานะ ACTIVE ของเครื่องตัวกด",
  [`${STAFF}settings#pos-channel-drawer-save`]: "537 สร้างช่องทางใหม่ 1 ช่อง/รอบ → ลบช่องทางที่เกิดในรอบ",
  [`${STAFF}settings#pos-channel-creds-webhook`]: "1161 ตัวเปิดเชื่อม LINE MAN = ช่องทางใหม่ → ลบช่องทาง/credentials ที่เกิดในรอบ",
  [`${STAFF}settings#pos-device-lan-token-copy`]: "1183 ตัวช่วยพิมพ์ LAN → ถอน (revokePrintAgent) ตัวที่เกิดในรอบ",
};
export const SIDE_EFFECT_TEXT_RE = /press last|กดท้าย|\breset\b|รีเซ็ต|CD-P41-F22/i;
export function sideEffectOf(row: Row): string | null {
  const k = SIDE_EFFECT_KEYS[rowKey(row)];
  if (k) return k;
  const t = `${asList(row.needs).join(" ")} ${row.expect?.note ?? ""}`;
  return SIDE_EFFECT_TEXT_RE.test(t) ? `needs/note: ${(SIDE_EFFECT_TEXT_RE.exec(t) ?? [""])[0]}` : null;
}
/** ลำดับในช่วงท้าย: ถอนเครื่องตัวเองท้ายสุด */
export const sideEffectRank = (row: Row) => (row.testid === "pos-device-revoke-confirm" ? 9 : 1);
/**
 * CD-P42-R11 (CD-P41-F29): ขั้น opener — "<testid>" · "<testid>=<ค่า>" ("=*" · "=on"/"=off" · "=click") · ลงท้าย "?" = ขั้นไม่บังคับ
 * (บทบาทนี้ไม่มี element นั้น ⇒ ข้ามโดยไม่ผิด) · ค่าที่ลงท้าย ? จริงใช้ไม่ได้ · ค่า " " (ช่องว่าง 1 ตัว) = search-noop (CD-P42-R10)
 */
export function parseStep(s: string): { raw: string; tid: string; val: string | null; optional: boolean } {
  const optional = s.endsWith("?");
  const body = optional ? s.slice(0, -1) : s;
  const i = body.indexOf("=");
  return { raw: s, tid: (i < 0 ? body : body.slice(0, i)).trim(), val: i < 0 ? null : body.slice(i + 1), optional };
}
/**
 * CD-P42-R4 (CD-P41-F16): URL ตรงเป้า navigate — path ตามแพตเทิร์น ([x] <x> * = 1 ส่วน) · query/hash ของ URL ไม่สน
 * เว้นแต่เป้ามี query เอง: ทุกคีย์ของเป้าต้องมีใน URL (ค่า [x]/<x>/ว่าง = ค่าใดก็ได้ที่ไม่ว่าง · ลงท้าย * = ขึ้นต้น · อื่น ๆ = ตรงตัว) · เป้า "#x" = hash ตรง
 */
export function navMatches(target: string, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url, "http://x.invalid");
  } catch {
    return false;
  }
  if (target.startsWith("#")) return u.hash === target;
  if (!target.startsWith("/")) return false;
  const [tPath, tQueryHash = ""] = target.split("?") as [string, string?];
  const ph = /(\[[^\]]+\]|<[^>]+>|\*)/g;
  const pat = tPath.split(ph).map((p) => (/^(\[[^\]]+\]|<[^>]+>|\*)$/.test(p) ? "[^/]+" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  if (!new RegExp(`^${pat}(?:$|/)`).test(u.pathname)) return false;
  const tq = tQueryHash.split("#")[0]!;
  if (!tq) return true;
  for (const [k, v] of new URLSearchParams(tq)) {
    const got = u.searchParams.get(k);
    if (got === null) return false;
    if (!v || /^(\[[^\]]+\]|<[^>]+>)$/.test(v)) {
      if (!got) return false;
    } else if (v.endsWith("*")) {
      if (!got.startsWith(v.slice(0, -1))) return false;
    } else if (got !== v) return false;
  }
  return true;
}
/** CD-P42-R10 (CD-P41-F28): ช่องค้นหา — PREFILL ไม่พิมพ์ลง (search-noop) · ขั้น "=<ช่องว่าง>" ของทะเบียน = พิมพ์ 1 ตัวแล้วลบ */
export const SEARCH_RE = /(search|query|-q$|find|lookup)/;
export const isSearchLike = (testid: string, type = "") => type === "search" || SEARCH_RE.test(testid.toLowerCase());
/**
 * CD-P42-R6 (CD-P41-F18): ค่าส่วนลดที่ตัวกดพิมพ์เอง (PREFILL / "=*") ต้องไม่เกินเพดานแคชเชียร์ (register-shared.ts
 * REGISTER_STAFF_MAX_DISCOUNT_BP = 1000 bp · อ่านค่าจริงจาก settings.pos.discount ตอนรัน) — % = ครึ่งเพดาน · บาท = 1 (สินค้าตะกร้า ≥ ฿10)
 */
export const DISCOUNT_RE = /discount/;
export const STAFF_DISCOUNT_CAP_BP_DEFAULT = 1000;
export function discountFill(testid: string, capBp: number): string {
  if (capBp < 200) return "0";
  return /(pct|percent)/.test(testid.toLowerCase()) ? String(Math.max(1, Math.floor(capBp / 200))) : "1";
}
/** CD-P42-R9 (CD-P41-F27): ตัวสลับภาษา/สาขา — กดตอนอยู่ในสถานะนั้นแล้ว = idle-expected */
export const SWITCH_RE = /(-locale-|-lang-|unit-option-|unit-switch$|-unit$)/;
export const localeOfSwitch = (testid: string): "th" | "en" | null => {
  const m = /-(locale|lang)-(?:switch-)?(th|en)$/.exec(testid);
  return m ? (m[2] as "th" | "en") : null;
};
/** CD-P42-R8 (CD-P41-F26): expect.anyOf — สตริง (เป้าแบบเดียวกับ type หลัก) หรืออ็อบเจกต์ {type, target, state?} — ผ่านเมื่อข้อใดข้อหนึ่งผ่าน */
export type ExpectAlt = { type: string; target: string; state?: string };
export function expectAlts(ex: Row["expect"]): ExpectAlt[] {
  const out: ExpectAlt[] = [{ type: ex.type, target: String(ex.target ?? ""), state: ex.state }];
  for (const a of (Array.isArray(ex.anyOf) ? ex.anyOf : []) as unknown[]) {
    if (typeof a === "string" && a) out.push({ type: ex.type, target: a, state: ex.state });
    else if (a && typeof a === "object" && typeof (a as Any).target === "string") out.push({ type: String((a as Any).type ?? ex.type), target: (a as Any).target, state: typeof (a as Any).state === "string" ? (a as Any).state : undefined });
  }
  return out;
}
/** CD-P42-R8: แถวคัดลอกลงคลิปบอร์ด — ตรวจด้วย navigator.clipboard (สิทธิ์ของ context) · อ่านไม่ได้ = ข้อความบนหน้า */
export const isClipboardRow = (row: Row) => /-copy(-|$)/.test(row.testid) || /clipboard|คัดลอก/.test(String(row.expect?.note ?? ""));
/** เหตุผลที่ "ตัวกดตัดสินตอนรัน" ได้เท่านั้น (แผน = press/visible) — ข้อสอบ W6/W11 */
export const DYNAMIC_REASONS: readonly SkipReason[] = ["needs", "needs-fixture", "file-upload", "once-per-run", "static", "disabled-expected", "idle-expected", "hidden-input"];
/** เหตุผลที่ตัวจำแนก (สถิต) เท่านั้นตัดสิน — สรุปต้องตรงแผน */
export const STATIC_REASONS: readonly SkipReason[] = ["no-role-claim", "not-pos-page", "missing-target", "missing-db", "missing-safety", "external", "dead-known", "needs-persona", "hidden-input"];

/** ค่าประมาณเวลา/แถว (วินาที) ตามการกระทำ — โหลดหน้าใหม่ 3–4 วิ + กด/รอผล (CRM run6 ≈ 4.4 วิ/แถว) */
export const SEC_PER = { press: 6, absent: 3.5, visible: 3, skip: 0 } as const;
export const estimateSec = (p: CellPlan) => Math.round(p.items.reduce((a, it) => a + SEC_PER[it.action], 0) + 90 /* fixture + เบราว์เซอร์ + เก็บกวาด */);

// ═════════════════════════ (2) fixture บน QC5 ═════════════════════════
/** ขั้นที่ล้ม — บอกขั้น + ค่าที่ใช้เสมอ (บทเรียน 22 ต.ค. 05:0xZ) */
export class StepError extends Error {
  constructor(public step: string, public value: string) {
    super(`[${step}] ${value}`);
  }
}
export const BTN = {
  unit: { id: "posqc-btn-unit", slug: "pos-qc-btn", name: "สาขาตัวกด (QC P4.2)", type: "SHOP" },
  /** ผู้ใช้ของตัวกด — ผู้จัดการ/แคชเชียร์ที่เข้าได้เฉพาะสาขา posqc-btn (เจ้าของ = เจ้าของร้าน QC เดิม · units *) — CD-P42-W4 */
  manager: { userId: "posqc-btn-user-manager", membershipId: "posqc-btn-mb-manager", email: "pos-qc-btn-manager@shark.local", name: "ผู้จัดการสาขาตัวกด (QC P4.2)", role: "MANAGER" },
  cashier: { userId: "posqc-btn-user-cashier", membershipId: "posqc-btn-mb-cashier", email: "pos-qc-btn-cashier@shark.local", name: "แคชเชียร์สาขาตัวกด (QC P4.2)", role: "STAFF" },
  device: (user: string) => `posqc-btn-dev-${user}`,
  ua: "qc-pos-buttons",
  floatSatang: 100_000,
} as const;
export const QC5_HOST_MARK = "ep-fragrant-thunder";
export const QC4_HOST_MARK = "ep-frosty-lab";
export type Ctx = {
  T: Any; // PQC.coffee
  sys: string;
  unitId: string;
  systems: Record<string, string>;
  persona: { userId: string; membershipId: string; email: string; name: string; role: string } | null;
  deviceCode: string;
  deviceRowId: string;
  pin: string;
  staffJson: string;
  shiftId: string;
  shiftOpenedHere: boolean;
  pinRestore: { userId: string; row: Any | null }[];
  settingsSnap: { had: boolean; v: Any } | null;
  restores: { label: string; ok: boolean; detail: string }[];
  log: string[];
  cartProductIds: string[];
  tokens: Record<string, string | null>;
  /** CD-P42-R13: สาขาของโทเคนหน้าสาธารณะ (แถวเงินหน้าสาธารณะกดได้เฉพาะโทเคนของสาขา posqc-btn) */
  tokenUnits: Record<string, string | null>;
  cleaned: boolean;
  // ── CD-P42-R7 (CD-P41-F22): สิ่งที่ fixture คืนค่าได้นอก settings.pos ──
  runStart: Date;
  /** BusinessUnit.settings ของสาขา posqc-btn ก่อนรอบ (476 นโยบายสต็อก) — เก็บใน marker ด้วย (กู้หลังถูก kill) */
  unitSnap: { v: Any } | null;
  /** AccountSystemLink ของ POS เปิดอยู่ก่อนรอบ (506) — null = ไม่เคยเชื่อม */
  accountLinkOn: boolean | null;
  /** เครื่อง ACTIVE ของสาขา posqc-btn ก่อนรอบ (307 ถอนเครื่องตัวเอง) */
  deviceSnap: string[];
  /** เพดานส่วนลด STAFF (bp) จาก settings.pos.discount — ค่าที่ตัวกดพิมพ์เองไม่เกินนี้ (CD-P42-R6) */
  staffDiscountCapBp: number;
};
let PRISMA: Any = null;
export async function db(): Promise<Any> {
  if (!PRISMA) PRISMA = ((await import("@/lib/core/db" as string)) as Any).prisma;
  return PRISMA;
}
const env = (k: string) => process.env[k] ?? "";
export const dbHost = (): string => {
  try {
    return new URL(env("DATABASE_URL")).hostname;
  } catch {
    return "?";
  }
};
/** 🔴 writer ทุกตัวเรียกก่อนเขียน: QC5 เท่านั้น · ร้าน QC ตรงค่าคงที่ */
export function assertWritable(T: Any): void {
  if (T?.tenantId !== QC_TENANT) throw new StepError("ด่านร้าน QC", `T.tenantId=${String(T?.tenantId)} ≠ ${QC_TENANT}`);
  const d = env("DATABASE_URL");
  const dd = env("DIRECT_URL");
  if (!d.includes(QC5_HOST_MARK) || (dd && !dd.includes(QC5_HOST_MARK))) throw new StepError("ด่านฐาน", `DATABASE_URL/DIRECT_URL host ${dbHost()} ไม่ใช่ QC5 (${QC5_HOST_MARK}) — fixture เขียนได้บน QC5 เท่านั้น (QC4 = ฐานข้อสอบ)`);
}
const isRecObj = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
async function actorOfMembership(membershipId: string, userId: string): Promise<{ userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> }> {
  const P = await db();
  const mb = await P.membership.findUnique({ where: { id: membershipId }, select: { role: true, unitAccess: true, permissions: true } });
  if (!mb) throw new StepError("actor", `ไม่พบ membership ${membershipId}`);
  return {
    userId,
    role: mb.role,
    unitAccess: Array.isArray(mb.unitAccess) ? (mb.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
    permissions: isRecObj(mb.permissions) ? mb.permissions : {},
  };
}
export function personaOf(T: Any, user: UserKey): Ctx["persona"] {
  if (user === "public") return null;
  if (user === "owner") return { ...T.users.owner };
  return { ...(user === "manager" ? BTN.manager : BTN.cashier) };
}
async function readPos(sys: string): Promise<{ had: boolean; v: Any; raw: Any }> {
  const P = await db();
  const s = await P.appSystem.findFirst({ where: { id: sys, tenantId: QC_TENANT }, select: { settings: true } });
  const st = isRecObj(s?.settings) ? s!.settings : {};
  return { had: Object.prototype.hasOwnProperty.call(st, "pos"), v: st.pos, raw: st };
}
/** เขียน settings.pos ทั้งก้อน (undefined = ลบคีย์) — แตะเฉพาะคีย์ pos ของ AppSystem POS ของร้าน QC */
async function writePos(sys: string, v: Any): Promise<void> {
  const P = await db();
  if (v === undefined) {
    await P.$executeRaw`UPDATE "AppSystem" SET "settings" = "settings" - 'pos' WHERE "id" = ${sys} AND "tenantId" = ${QC_TENANT} AND jsonb_typeof("settings") = 'object'`;
    return;
  }
  const json = JSON.stringify(v);
  await P.$executeRaw`UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}', ${json}::jsonb, true) WHERE "id" = ${sys} AND "tenantId" = ${QC_TENANT}`;
}
const stable = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (isRecObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const withoutMarker = (v: Any) => (isRecObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "_qcP42Before")) : v);

/** marker ใน settings.pos._qcP42Before — {had, v} ของ settings.pos + (CD-P42-R7) settings ของสาขา posqc-btn + สถานะลิงก์บัญชี (กู้หลังถูก kill) */
const markerOf = (c: Ctx) => ({
  had: c.settingsSnap!.had,
  v: c.settingsSnap!.had ? (c.settingsSnap!.v ?? null) : null,
  ...(c.unitSnap ? { unit: c.unitSnap.v } : {}),
  ...(c.accountLinkOn !== null ? { accountLinkOn: c.accountLinkOn } : {}),
});
const writeMarked = (c: Ctx) => writePos(c.sys, { ...(isRecObj(c.settingsSnap!.v) ? c.settingsSnap!.v : {}), _qcP42Before: markerOf(c) });
// ── CD-P42-R7: settings ของสาขา posqc-btn (BusinessUnit.settings — 476 นโยบายสต็อก) ──
async function readUnitSettings(): Promise<Any | undefined> {
  const P = await db();
  const u = await P.businessUnit.findFirst({ where: { id: BTN.unit.id, tenantId: QC_TENANT }, select: { settings: true } });
  return u ? (u.settings ?? {}) : undefined;
}
async function writeUnitSettings(v: Any): Promise<void> {
  const P = await db();
  await P.businessUnit.updateMany({ where: { id: BTN.unit.id, tenantId: QC_TENANT }, data: { settings: v ?? {} } });
}
// ── CD-P42-R7: ลิงก์ POS↔บัญชี (AccountSystemLink · 506 ปิดการลงบัญชี) — คืนด้วย writer ของโมดูล setPosAccountLink ──
async function readAccountLinkOn(sys: string): Promise<boolean | null> {
  const P = await db();
  const links: { enabled: boolean; archivedAt: Date | null }[] = await P.$queryRaw`SELECT enabled, "archivedAt" FROM "AccountSystemLink" WHERE "tenantId" = ${QC_TENANT} AND "linkedKind" = 'POS' AND "linkedId" = ${sys}`;
  return links.length ? links.some((l) => l.enabled && !l.archivedAt) : null;
}
async function enableAccountLink(c: Ctx): Promise<string> {
  const pi = (await import("@/lib/pos-integrations" as string)) as Any;
  const owner = await actorOfMembership(c.T.users.owner.membershipId, c.T.users.owner.userId);
  const r = await pi.setPosAccountLink({ tenantId: QC_TENANT, systemId: c.sys }, owner, { enabled: true });
  if (!r?.ok) throw new StepError("setPosAccountLink", `enabled:true → ${r?.code ?? "?"}`);
  return r.changed ? "เปิดการลงบัญชีคืน (setPosAccountLink)" : "การลงบัญชีเปิดอยู่แล้ว";
}

/** จำ settings.pos ทั้งก้อน (หรือคืนจากซาก _qcP42Before ของรอบที่ถูก kill) แล้วเขียนคีย์จำไว้ก่อนกดอะไร ·
 *  CD-P42-R7: จำ settings ของสาขา posqc-btn + สถานะลิงก์บัญชีด้วย (ซากของรอบก่อน = คืนก่อน) */
export async function rememberSettings(c: Ctx, withUnit = false): Promise<void> {
  if (c.settingsSnap) return;
  assertWritable(c.T);
  const cur = await readPos(c.sys);
  const res = isRecObj(cur.v) && isRecObj(cur.v._qcP42Before) ? (cur.v._qcP42Before as Any) : null;
  if (res) {
    c.settingsSnap = { had: res.had === true, v: res.had === true ? res.v : undefined };
    c.log.push("กวาดซากค่าตั้งของรอบก่อน (คืนจาก settings.pos._qcP42Before)");
    await writePos(c.sys, c.settingsSnap.had ? c.settingsSnap.v : undefined);
    if (res.unit !== undefined && (await readUnitSettings()) !== undefined) {
      await writeUnitSettings(res.unit);
      c.log.push("คืน settings ของสาขา posqc-btn จากซาก");
    }
    if (res.accountLinkOn === true && (await readAccountLinkOn(c.sys)) === false) c.log.push(`ซากลิงก์บัญชี: ${await enableAccountLink(c)}`);
  } else c.settingsSnap = { had: cur.had, v: withoutMarker(cur.v) };
  c.accountLinkOn = await readAccountLinkOn(c.sys);
  if (withUnit) {
    const u = await readUnitSettings();
    c.unitSnap = u === undefined ? null : { v: u };
  }
  await writeMarked(c);
}
/** สาขา posqc-btn เพิ่งสร้าง (หลัง rememberSettings) — จำ settings ของมันตอนนี้ */
async function rememberUnitSettings(c: Ctx): Promise<void> {
  if (c.unitSnap || !c.settingsSnap) return;
  const u = await readUnitSettings();
  if (u === undefined) return;
  c.unitSnap = { v: u };
  await writeMarked(c);
}
/** หลังแถวที่เขียน: settings.pos (ไม่นับ marker) · settings ของสาขา posqc-btn · ลิงก์บัญชี ≠ ที่จำไว้ ⇒ คืนตรงตัว (marker คงอยู่จนจบรอบ) — คืน true เมื่อคืนค่า */
export async function restoreSettingsIfChanged(c: Ctx, label: string): Promise<boolean> {
  if (!c.settingsSnap) return false;
  let did = false;
  const cur = await readPos(c.sys);
  if (stable(withoutMarker(cur.v)) !== stable(c.settingsSnap.v)) {
    await writeMarked(c);
    const after = await readPos(c.sys);
    const ok = stable(withoutMarker(after.v)) === stable(c.settingsSnap.v);
    c.restores.push({ label, ok, detail: ok ? "settings.pos คืนค่าตรงตัว" : "คืนค่าแล้วยังไม่ตรง" });
    did = true;
  }
  if (c.unitSnap) {
    const u = await readUnitSettings();
    if (u !== undefined && stable(u) !== stable(c.unitSnap.v)) {
      await writeUnitSettings(c.unitSnap.v);
      const ok = stable(await readUnitSettings()) === stable(c.unitSnap.v);
      c.restores.push({ label: `${label} · สาขา`, ok, detail: ok ? "BusinessUnit.settings ของ posqc-btn คืนค่าตรงตัว" : "settings ของสาขาคืนแล้วยังไม่ตรง" });
      did = true;
    }
  }
  if (c.accountLinkOn === true && (await readAccountLinkOn(c.sys)) === false) {
    try {
      const d = await enableAccountLink(c);
      c.restores.push({ label: `${label} · ลิงก์บัญชี`, ok: (await readAccountLinkOn(c.sys)) === true, detail: d });
    } catch (e) {
      c.restores.push({ label: `${label} · ลิงก์บัญชี`, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
    did = true;
  }
  return did;
}
async function finalSettingsRestore(c: Ctx): Promise<void> {
  if (!c.settingsSnap) return;
  if (c.unitSnap) {
    const u = await readUnitSettings();
    if (u !== undefined && stable(u) !== stable(c.unitSnap.v)) await writeUnitSettings(c.unitSnap.v);
    const ok = stable(await readUnitSettings()) === stable(c.unitSnap.v);
    c.restores.push({ label: "จบรอบ · สาขา", ok, detail: ok ? "BusinessUnit.settings ของ posqc-btn = ก่อนรอบ" : "settings ของสาขาไม่ตรงก่อนรอบ" });
  }
  if (c.accountLinkOn === true && (await readAccountLinkOn(c.sys)) === false) {
    const d = await enableAccountLink(c).catch((e: unknown) => `ล้ม: ${e instanceof Error ? e.message : e}`);
    c.restores.push({ label: "จบรอบ · ลิงก์บัญชี", ok: (await readAccountLinkOn(c.sys)) === true, detail: d });
  }
  await writePos(c.sys, c.settingsSnap.had ? c.settingsSnap.v : undefined);
  const after = await readPos(c.sys);
  const ok = after.had === c.settingsSnap.had && stable(after.v) === stable(c.settingsSnap.v);
  c.restores.push({ label: "จบรอบ", ok, detail: ok ? "settings.pos = ก่อนรอบ (ลบ _qcP42Before)" : "settings.pos ไม่ตรงก่อนรอบ" });
}
/**
 * CD-P42-R7 (CD-P41-F22): หลังแถวผลข้างเคียง + จบรอบ — คืนสิ่งที่รอบนี้สร้าง/เปลี่ยนในสาขา posqc-btn (ของตัวกดเอง · W30):
 * เครื่องที่ถูกถอน (307) → ACTIVE · ตัวช่วยพิมพ์ LAN ที่เกิดในรอบ (1183) → revokePrintAgent · credentials ที่เกิดในรอบ (1161/1164) → ลบ ·
 * ช่องทางที่เกิดในรอบ (537/1161) → ลบ (ติด FK = เก็บ archivedAt) — ไม่แตะสาขาอื่นเด็ดขาด (where unitId = posqc-btn-unit)
 */
export async function resetSideEffects(c: Ctx, label: string, opts: { channels?: boolean } = {}): Promise<{ label: string; ok: boolean; detail: string }[]> {
  const out: { label: string; ok: boolean; detail: string }[] = [];
  if (!c.persona) return out;
  assertWritable(c.T);
  const P = await db();
  const where = { tenantId: QC_TENANT, unitId: BTN.unit.id };
  const step = async (l: string, f: () => Promise<string | null>) => {
    try {
      const d = await f();
      if (d) out.push({ label: `${label} · ${l}`, ok: true, detail: d });
    } catch (e) {
      out.push({ label: `${label} · ${l}`, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  };
  await step("เครื่อง", async () => {
    if (!c.deviceSnap.length) return null;
    const r = await P.posDevice.updateMany({ where: { ...where, id: { in: c.deviceSnap }, status: "REVOKED" }, data: { status: "ACTIVE", revokedAt: null } });
    return r.count ? `คืนเครื่อง ACTIVE ${r.count} เครื่อง (ถูกถอนระหว่างรอบ)` : null;
  });
  await step("ตัวช่วยพิมพ์ LAN", async () => {
    const agents: { id: string; systemId: string }[] = await P.posPrintAgent.findMany({ where: { ...where, revokedAt: null, createdAt: { gte: c.runStart } }, select: { id: true, systemId: true } });
    if (!agents.length) return null;
    const pr = (await import("@/lib/modules/pos/print-relay" as string)) as Any;
    const owner = await actorOfMembership(c.T.users.owner.membershipId, c.T.users.owner.userId);
    for (const a of agents) {
      const r = await pr.revokePrintAgent({ tenantId: QC_TENANT, systemId: a.systemId, unitId: BTN.unit.id }, owner, { agentId: a.id });
      if (!r?.ok) throw new StepError("revokePrintAgent", `${a.id} → ${r?.code ?? "?"}`);
    }
    return `ถอนตัวช่วยพิมพ์ ${agents.length} ตัว`;
  });
  await step("credentials", async () => {
    const r = await P.posIntegrationCredential.deleteMany({ where: { ...where, createdAt: { gte: c.runStart } } });
    return r.count ? `ลบ credentials ที่เกิดในรอบ ${r.count} แถว` : null;
  });
  if (opts.channels !== false) await step("ช่องทาง", async () => {
    const ch: { id: string; code: string }[] = await P.salesChannel.findMany({ where: { ...where, createdAt: { gte: c.runStart } }, select: { id: true, code: true } });
    if (!ch.length) return null;
    let del = 0;
    let arch = 0;
    for (const x of ch) {
      try {
        await P.salesChannel.deleteMany({ where: { ...where, id: x.id } });
        del++;
      } catch {
        await P.salesChannel.updateMany({ where: { ...where, id: x.id }, data: { archivedAt: new Date(), active: false } });
        arch++;
      }
    }
    return `ช่องทางที่เกิดในรอบ: ลบ ${del}${arch ? ` · เก็บ ${arch} (มีแถวอ้าง)` : ""}`;
  });
  return out;
}

/** หา-หรือ-สร้างของถาวรของตัวกด (สาขา · ลิงก์ระบบ · ผู้ใช้ตัวกด) — W30 คงไว้ · ทุกขั้นบอกค่าที่ใช้ */
async function ensureUnitAndLinks(c: Ctx): Promise<void> {
  const P = await db();
  const T = c.T;
  const u = await P.businessUnit.findFirst({ where: { id: BTN.unit.id }, select: { id: true, tenantId: true } });
  if (u && u.tenantId !== T.tenantId) throw new StepError("สาขา posqc-btn", `id ${BTN.unit.id} เป็นของร้าน ${u.tenantId}`);
  if (!u) {
    const slugTaken = await P.businessUnit.findFirst({ where: { tenantId: T.tenantId, slug: BTN.unit.slug }, select: { id: true } });
    if (slugTaken) throw new StepError("สาขา posqc-btn", `slug ${BTN.unit.slug} ถูกใช้โดย ${slugTaken.id}`);
    // ไม่มี writer ของสาขาในโมดูล — แบบเดียวกับ visual-pos (สาขาแคตตาล็อกว่าง P1.18U) · CD-P42-W5
    await P.businessUnit.create({ data: { id: BTN.unit.id, tenantId: T.tenantId, type: BTN.unit.type, name: BTN.unit.name, slug: BTN.unit.slug } });
    c.log.push(`สร้างสาขา ${BTN.unit.id}`);
  }
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  for (const [type, id] of Object.entries(c.systems)) {
    const link = await P.appSystemUnit.findFirst({ where: { tenantId: T.tenantId, unitId: BTN.unit.id, type }, select: { systemId: true } });
    if (link?.systemId === id) continue;
    const sys = await P.appSystem.findFirst({ where: { id, tenantId: T.tenantId }, select: { id: true } });
    if (!sys) throw new StepError(`ผูกระบบ ${type}`, `ไม่พบ AppSystem ${id}`);
    await sysSvc.linkUnit(T.tenantId, id, BTN.unit.id);
    c.log.push(`ผูก ${type} ${id} → ${BTN.unit.id}`);
  }
}
async function ensurePersona(c: Ctx, key: "manager" | "cashier"): Promise<void> {
  const P = await db();
  const T = c.T;
  const p = BTN[key];
  const byEmail = await P.user.findUnique({ where: { email: p.email }, select: { id: true } });
  if (byEmail && byEmail.id !== p.userId) throw new StepError(`ผู้ใช้ตัวกด ${key}`, `อีเมล ${p.email} เป็นของ ${byEmail.id}`);
  await P.user.upsert({ where: { id: p.userId }, update: {}, create: { id: p.userId, email: p.email, name: p.name } });
  // สิทธิ์ = ของผู้ใช้ QC เดิมในบทบาทเดียวกัน (แคชเชียร์ = membership แคชเชียร์ของร้าน · ผู้จัดการ = {} แบบผู้จัดการภาพ P2.11U)
  let permissions: Record<string, unknown> = {};
  if (key === "cashier") {
    const seed = await P.membership.findUnique({ where: { id: T.users.cashier.membershipId }, select: { permissions: true } });
    if (!seed) throw new StepError("ผู้ใช้ตัวกด cashier", `ไม่พบ membership แคชเชียร์ QC ${T.users.cashier.membershipId}`);
    permissions = isRecObj(seed.permissions) ? seed.permissions : {};
  }
  await P.membership.upsert({
    where: { userId_tenantId: { userId: p.userId, tenantId: T.tenantId } },
    update: { role: p.role, unitAccess: [BTN.unit.id], permissions, acceptedAt: new Date() },
    create: { id: p.membershipId, userId: p.userId, tenantId: T.tenantId, role: p.role, unitAccess: [BTN.unit.id], permissions, acceptedAt: new Date() },
  });
}
/** เครื่อง + PIN + โทเคนผู้ขาย + กะ ของผู้ใช้รอบนี้ บนสาขา posqc-btn */
async function ensureDeviceShift(c: Ctx): Promise<void> {
  const P = await db();
  const T = c.T;
  const owner = await actorOfMembership(T.users.owner.membershipId, T.users.owner.userId);
  const ctx = { tenantId: T.tenantId, systemId: c.sys, unitId: BTN.unit.id };
  const dev = (await import("@/lib/modules/pos/device" as string)) as Any;
  const rg = await dev.registerDevice(ctx, owner, { name: `เครื่องตัวกด ${c.persona?.userId ?? "public"}`.slice(0, 60), deviceCode: c.deviceCode });
  if (!rg.ok) throw new StepError("registerDevice", `${c.deviceCode} → ${rg.code}`);
  c.deviceRowId = rg.device.id;
  if (!c.persona) return;
  const pinSvc = (await import("@/lib/modules/pos/staff-pin" as string)) as Any;
  const a = await actorOfMembership(c.persona.membershipId, c.persona.userId);
  const prev = await P.posStaffPin.findUnique({ where: { unitId_userId: { unitId: BTN.unit.id, userId: a.userId } }, select: { pinHash: true, failedCount: true, lockedUntil: true, setById: true } });
  c.pinRestore.push({ userId: a.userId, row: prev });
  let last = "";
  for (let i = 0; i < 8 && !c.pin; i++) {
    const pin = String(randomInt(100000, 1000000));
    const r = await pinSvc.setStaffPin(ctx, owner, { userId: a.userId, pin });
    if (r.ok) c.pin = pin;
    else last = r.code;
    if (!r.ok && r.code !== "WEAK_PIN") break;
  }
  if (!c.pin) throw new StepError("setStaffPin", `${a.userId} @ ${BTN.unit.id} → ${last || "?"}`);
  const t = await pinSvc.issueStaffToken({ tenantId: T.tenantId, systemId: c.sys, unitId: BTN.unit.id, deviceId: c.deviceCode }, { unitId: BTN.unit.id, deviceId: c.deviceCode, userId: a.userId });
  c.staffJson = JSON.stringify({ userId: a.userId, name: c.persona.name, role: a.role, staffToken: t.staffToken, expiresAt: t.expiresAt });
  const sh = (await import("@/lib/modules/pos/shift" as string)) as Any;
  const open = await P.posShift.findFirst({ where: { tenantId: T.tenantId, unitId: BTN.unit.id, deviceId: c.deviceCode, status: "OPEN" }, select: { id: true } });
  if (open) c.shiftId = open.id;
  else {
    const r = await sh.openShift(ctx, owner, { deviceId: c.deviceCode, deviceLabel: "ตัวกด P4.2", floatSatang: BTN.floatSatang });
    if (!r.ok) throw new StepError("openShift", `${c.deviceCode} float ${BTN.floatSatang} → ${r.code}`);
    c.shiftId = r.shift.id;
    c.shiftOpenedHere = true;
  }
}
/** สินค้าสำหรับตะกร้า (มติ 5 "cart fixtures"): สินค้าของระบบ POS ทุกสาขา ราคาบวก ไม่ปิดขายที่สาขา posqc-btn — ชื่อตายตัวของ seed ก่อน */
async function findCartProducts(c: Ctx): Promise<void> {
  const P = await db();
  const rows: Any[] = await P.posProduct.findMany({ where: { tenantId: QC_TENANT, systemId: c.sys, archivedAt: null, unitId: null }, select: { id: true, name: true, basePriceSatang: true, unavailableUnitIds: true }, take: 400 });
  const okRow = (r: Any) => Number(r.basePriceSatang ?? 0) > 0 && !(r.unavailableUnitIds ?? []).includes(BTN.unit.id);
  const pref = ["อเมริกาโน่เย็น", "ลาเต้ร้อน"];
  const named = pref.map((n) => rows.find((r) => r.name === n && okRow(r))).filter(Boolean) as Any[];
  c.cartProductIds = [...named, ...rows.filter((r) => okRow(r) && !named.includes(r))].slice(0, 3).map((r) => r.id);
}
/** โทเคนของหน้าสาธารณะ (อ่านอย่างเดียว · ไม่สร้าง) — ไม่มี = แถวของหน้านั้น skip(needs-fixture) ·
 *  CD-P42-R13: เลือกของสาขา posqc-btn ก่อน แล้วจดสาขาของโทเคน (แถวเงินหน้าสาธารณะกดได้เฉพาะโทเคนของสาขานี้) */
async function findPublicTokens(c: Ctx): Promise<void> {
  const P = await db();
  const pick = async (label: string, f: (unitId?: string) => Promise<{ v: string | null; unitId: string | null } | null>) => {
    const r = await f(BTN.unit.id).catch(() => null) ?? await f().catch(() => null);
    c.tokens[label] = r?.v ?? null;
    c.tokenUnits[label] = r?.v ? (r.unitId ?? null) : null;
  };
  const u = (unitId?: string) => (unitId ? { unitId } : {});
  await pick("token", async (unitId) => {
    const x = await P.posSale.findFirst({ where: { tenantId: QC_TENANT, ...u(unitId), publicToken: { not: null }, status: "PAID", docType: "SALE" }, orderBy: { createdAt: "desc" }, select: { publicToken: true, unitId: true } });
    return x ? { v: x.publicToken, unitId: x.unitId } : null;
  });
  await pick("qrToken", async (unitId) => {
    const x = await P.restaurantTable.findFirst({ where: { tenantId: QC_TENANT, ...u(unitId), archivedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { qrToken: true, unitId: true } });
    return x ? { v: x.qrToken, unitId: x.unitId } : null;
  });
  await pick("linkToken", async (unitId) => {
    const x = await P.posOrderLink.findFirst({ where: { tenantId: QC_TENANT, ...u(unitId), status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { token: true, unitId: true } });
    return x ? { v: x.token, unitId: x.unitId } : null;
  });
  await pick("orderToken", async (unitId) => {
    const x = await P.posOrder.findFirst({ where: { tenantId: QC_TENANT, ...u(unitId), publicToken: { not: null } }, orderBy: { receivedAt: "desc" }, select: { publicToken: true, unitId: true } });
    return x ? { v: x.publicToken, unitId: x.unitId } : null;
  });
  c.tokens.saleId = (await P.posSale.findFirst({ where: { tenantId: QC_TENANT, unitId: BTN.unit.id, status: "PAID", docType: "SALE" }, orderBy: { createdAt: "desc" }, select: { id: true } }).catch(() => null))?.id ?? null;
  c.tokenUnits.saleId = c.tokens.saleId ? BTN.unit.id : null;
}
/** CD-P42-R7: ซากของรอบที่ถูก kill ในสาขา posqc-btn (ของตัวกดเอง) — เครื่องตัวกดที่ถูกถอน · ตัวช่วยพิมพ์ที่ยังไม่ถอน · credentials — คืนก่อนเริ่ม */
async function healResidue(c: Ctx): Promise<void> {
  const P = await db();
  const where = { tenantId: QC_TENANT, unitId: BTN.unit.id };
  const codes = USERS.filter((x) => x !== "public").map((x) => BTN.device(x));
  const d = await P.posDevice.updateMany({ where: { ...where, deviceCode: { in: codes }, status: "REVOKED" }, data: { status: "ACTIVE", revokedAt: null } });
  if (d.count) c.log.push(`ซาก: คืนเครื่องตัวกด ACTIVE ${d.count}`);
  const saved = c.runStart;
  c.runStart = new Date(0);
  try {
    const keep = c.deviceSnap;
    c.deviceSnap = [];
    // ช่องทางเก่าในสาขานี้ไม่ลบย้อนหลัง (อาจเป็นของ fixture/รอบก่อนที่ตั้งใจคง) — ลบเฉพาะที่เกิดในรอบนี้ตอนจบ
    for (const r of await resetSideEffects(c, "ซากรอบก่อน", { channels: false })) {
      c.log.push(`${r.label}: ${r.detail}`);
      if (!r.ok) throw new StepError("กวาดซาก", `${r.label} → ${r.detail}`);
    }
    c.deviceSnap = keep;
  } finally {
    c.runStart = saved;
  }
}
export function newCtx(T: Any, user: UserKey): Ctx {
  return {
    T,
    sys: T.systems.POS.id,
    unitId: BTN.unit.id,
    systems: Object.fromEntries(Object.entries(T.systems as Record<string, { id: string }>).map(([k, v]) => [k, v.id])),
    persona: personaOf(T, user),
    deviceCode: BTN.device(user),
    deviceRowId: "",
    pin: "",
    staffJson: "",
    shiftId: "",
    shiftOpenedHere: false,
    pinRestore: [],
    settingsSnap: null,
    restores: [],
    log: [],
    cartProductIds: [],
    tokens: {},
    tokenUnits: {},
    cleaned: false,
    runStart: new Date(),
    unitSnap: null,
    accountLinkOn: null,
    deviceSnap: [],
    staffDiscountCapBp: STAFF_DISCOUNT_CAP_BP_DEFAULT,
  };
}
/** ตั้ง fixture ทั้งชุดก่อนเปิดเบราว์เซอร์ (QC5 เท่านั้น) — ล้ม = StepError (ตัวกดหยุด · เก็บกวาดสิ่งที่ทำไปแล้ว) */
export async function ensureFixtures(c: Ctx, user: UserKey): Promise<void> {
  assertWritable(c.T);
  await rememberSettings(c, user !== "public");
  if (user !== "public") {
    // หน้าสาธารณะไม่ใช้สาขา/เครื่อง/กะ — public เขียนเฉพาะ marker ของค่าตั้ง
    await ensureUnitAndLinks(c);
    await rememberUnitSettings(c); // CD-P42-R7: สาขาอาจเพิ่งสร้าง
    await healResidue(c);
    if (user === "manager" || user === "cashier") await ensurePersona(c, user);
    await ensureDeviceShift(c);
    await findCartProducts(c);
    const P = await db();
    c.deviceSnap = (await P.posDevice.findMany({ where: { tenantId: QC_TENANT, unitId: BTN.unit.id, status: "ACTIVE" }, select: { id: true } })).map((d: { id: string }) => d.id);
    // CD-P42-R6: เพดานส่วนลด STAFF จริงของร้าน (ค่าที่ตัวกดพิมพ์เองไม่เกินนี้)
    const rs = (await import("@/lib/modules/pos/register-shared" as string)) as Any;
    c.staffDiscountCapBp = Number(rs.posDiscountCaps((await readPos(c.sys)).raw)?.STAFF ?? STAFF_DISCOUNT_CAP_BP_DEFAULT);
  }
  await findPublicTokens(c);
}
/** finally + สัญญาณ: ปิดกะของตัวกดแบบนับตรงยอด · คืน PIN เดิม · คืน settings.pos ตรงตัว — เรียกซ้ำได้ · ไม่โยน (ผลลง restores) */
export async function cleanupFixtures(c: Ctx): Promise<void> {
  if (c.cleaned) return;
  c.cleaned = true;
  const P = await db();
  const T = c.T;
  const step = async (label: string, f: () => Promise<string>) => {
    try {
      c.restores.push({ label, ok: true, detail: await f() });
    } catch (e) {
      c.restores.push({ label, ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  };
  // CD-P42-R7: คืนผลข้างเคียงในสาขา posqc-btn ก่อน (เครื่องที่ถูกถอนต้อง ACTIVE ก่อนปิดกะ)
  try {
    for (const r of await resetSideEffects(c, "จบรอบ")) c.restores.push(r);
  } catch (e) {
    c.restores.push({ label: "จบรอบ · ผลข้างเคียง", ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : String(e) });
  }
  if (c.shiftId)
    await step("ปิดกะของตัวกด", async () => {
      const sh = (await import("@/lib/modules/pos/shift" as string)) as Any;
      const row = await P.posShift.findFirst({ where: { id: c.shiftId, tenantId: T.tenantId } });
      if (!row) throw new StepError("closeShift", `ไม่พบกะ ${c.shiftId}`);
      if (row.status !== "OPEN") return `กะ ${c.shiftId} สถานะ ${row.status} อยู่แล้ว`;
      const expected = (await sh.computeReport(P, row)).expectedCashSatang;
      const owner = await actorOfMembership(T.users.owner.membershipId, T.users.owner.userId);
      const r = await sh.closeShift({ tenantId: T.tenantId, systemId: c.sys, unitId: BTN.unit.id }, owner, { shiftId: c.shiftId, countedCashSatang: expected, idempotencyKey: `posqc-btn-close-${c.shiftId}` });
      if (!r.ok) throw new StepError("closeShift", `${c.shiftId} counted ${expected} → ${r.code}`);
      return `ปิดกะ ${c.shiftId} (นับ = ยอดคาด ${expected})`;
    });
  for (const pr of c.pinRestore)
    await step(`คืน PIN ${pr.userId}`, async () => {
      if (!pr.row) return "ไม่มีแถวเดิม — คงแถวของตัวกด (สาขา posqc-btn · W30 คงไว้)";
      await P.posStaffPin.update({ where: { unitId_userId: { unitId: BTN.unit.id, userId: pr.userId } }, data: pr.row });
      return "คืนแถวเดิม";
    });
  await step("คืน settings.pos", async () => {
    await finalSettingsRestore(c);
    return "ดูแถวจบรอบ";
  });
}

// ═════════════════════════ ตรวจผล DB ของแถว mutation (อ่านอย่างเดียว) ═════════════════════════
/** ตารางที่มี unitId — แถว money/counter ต้องลงสาขา posqc-btn (ข้อสอบ W7) */
export const MONEY_MODELS_UNIT = ["PosSale", "PosPayment", "PosPaymentIntent", "PosDeposit", "PosCashMovement", "PosShift"];
type Write = { model: string; del: boolean };
/** db = "PosSale PAID + PosPayment · AuditLog pos.x" → โมเดลที่ต้องถูกเขียน (≤ 3 ตัวแรก) */
export function writesOf(dbText: string | undefined, models: Set<string>): Write[] {
  const out: Write[] = [];
  for (const seg of String(dbText ?? "").split(/ · |\s\+\s|, |;/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([A-Z][A-Za-z0-9]+)\b/.exec(seg);
    if (!m || !models.has(m[1]!) || out.some((w) => w.model === m[1])) continue;
    if (/ไม่เปลี่ยน|ไม่เพิ่ม|ไม่เขียน|ไม่ลบ/.test(seg)) continue;
    out.push({ model: m[1]!, del: /ถูกลบ|ลบแถว|ลบแล้ว|\bdeleted\b/.test(seg) });
    if (out.length >= 3) break;
  }
  return out;
}
const toCamel = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
let DMMF: Map<string, { created: boolean; updated: boolean; tenant: boolean; unit: boolean }> | null = null;
export async function modelInfo(): Promise<Map<string, { created: boolean; updated: boolean; tenant: boolean; unit: boolean }>> {
  if (DMMF) return DMMF;
  const { Prisma } = (await import("@prisma/client" as string)) as Any;
  const ms = (Prisma?.dmmf?.datamodel?.models ?? []) as { name: string; fields: { name: string }[] }[];
  DMMF = new Map(ms.map((m) => [m.name, { created: m.fields.some((f) => f.name === "createdAt"), updated: m.fields.some((f) => f.name === "updatedAt"), tenant: m.fields.some((f) => f.name === "tenantId"), unit: m.fields.some((f) => f.name === "unitId") }]));
  return DMMF;
}
export async function dbNow(): Promise<Date> {
  const P = await db();
  return P.$queryRawUnsafe(`SELECT now() AS t`).then((r: Any) => new Date(new Date(r[0].t).getTime() - 500)).catch(() => new Date(Date.now() - 5_000));
}
export async function countTenant(model: string): Promise<number | null> {
  const P = await db();
  return P[toCamel(model)]?.count({ where: { tenantId: QC_TENANT } }).catch(() => null) ?? null;
}
/** ผลเขียนหลังกด: แถวของร้าน QC ที่ createdAt/updatedAt ≥ since (ลบ = จำนวนลด) · คืนสาขาของแถวที่เขียน (ตารางที่มี unitId) */
export async function writtenSince(w: Write, since: Date, before: number | null): Promise<{ ok: boolean; units: string[] }> {
  const P = await db();
  const info = (await modelInfo()).get(w.model);
  const d = P[toCamel(w.model)];
  if (!d || !info?.tenant) return { ok: false, units: [] };
  if (w.del) {
    const n = await d.count({ where: { tenantId: QC_TENANT } }).catch(() => null);
    return { ok: before !== null && n !== null && n < before, units: [] };
  }
  const OR = [...(info.updated ? [{ updatedAt: { gte: since } }] : []), ...(info.created ? [{ createdAt: { gte: since } }] : [])];
  if (!OR.length) return { ok: false, units: [] };
  const rows: Any[] = await d.findMany({ where: { tenantId: QC_TENANT, OR }, select: info.unit ? { id: true, unitId: true } : { id: true }, take: 20 }).catch(() => []);
  return { ok: rows.length > 0, units: info.unit ? [...new Set(rows.map((r) => String(r.unitId)))] : [] };
}

// ═════════════════════════ (3) pre-flight อ่านอย่างเดียว ═════════════════════════
export type PF = { key: string; state: "ok" | "would-create" | "missing" | "warn" | "block"; value: string };
/** ประเมินเงื่อนไขของ writer ทุกตัวที่ ensureFixtures จะเรียก — ไม่เขียนอะไรเลย (findFirst/count/findUnique เท่านั้น) */
export async function preflight(T: Any, users: readonly UserKey[] = ["owner", "manager", "cashier", "public"]): Promise<PF[]> {
  const P = await db();
  const out: PF[] = [];
  const add = (key: string, state: PF["state"], value: string) => out.push({ key, state, value });
  const q = async <X,>(f: () => Promise<X>): Promise<X | "ERR"> => f().catch((e: unknown) => {
    add("read-error", "block", e instanceof Error ? e.message.slice(0, 140) : String(e));
    return "ERR" as const;
  });
  add("db-host", dbHost().includes(QC5_HOST_MARK) ? "ok" : dbHost().includes(QC4_HOST_MARK) ? "warn" : "block", `${dbHost()} (${dbHost().includes(QC5_HOST_MARK) ? "QC5 — fixture เขียนได้" : dbHost().includes(QC4_HOST_MARK) ? "QC4 — อ่านอย่างเดียว · fixture จะปฏิเสธการเขียน" : "ไม่ใช่ QC4/QC5"})`);
  add("tenant-guard", T?.tenantId === QC_TENANT ? "ok" : "block", `T.tenantId=${T?.tenantId} (ค่าคงที่ ${QC_TENANT})`);
  const tenant = await q(() => P.tenant.findUnique({ where: { id: T.tenantId }, select: { id: true, slug: true, limits: true } }));
  add("tenant-row", tenant && tenant !== "ERR" ? "ok" : "block", tenant && tenant !== "ERR" ? `${(tenant as Any).id} slug ${(tenant as Any).slug}` : "ไม่มีแถวร้าน QC (seed-pos-qc ยังไม่ลง)");
  for (const [type, s] of Object.entries(T.systems as Record<string, { id: string }>)) {
    const row = await q(() => P.appSystem.findFirst({ where: { id: s.id, tenantId: T.tenantId }, select: { id: true, type: true } }));
    add(`system-${type}`, row && row !== "ERR" && (row as Any).type === type ? "ok" : "block", `${s.id} ${row && row !== "ERR" ? `type ${(row as Any).type}` : "ไม่มี"} (linkUnit ต้องมีระบบ)`);
  }
  const ownerMb = await q(() => P.membership.findUnique({ where: { id: T.users.owner.membershipId }, select: { role: true, unitAccess: true, userId: true } }));
  add("owner-membership", ownerMb && ownerMb !== "ERR" && (ownerMb as Any).role === "OWNER" ? "ok" : "block", ownerMb && ownerMb !== "ERR" ? `role ${(ownerMb as Any).role} unitAccess ${JSON.stringify((ownerMb as Any).unitAccess)} (registerDevice/setStaffPin/openShift/closeShift actor)` : "ไม่มี");
  const cashMb = await q(() => P.membership.findUnique({ where: { id: T.users.cashier.membershipId }, select: { role: true, permissions: true } }));
  add("cashier-permissions-source", cashMb && cashMb !== "ERR" ? "ok" : "block", cashMb && cashMb !== "ERR" ? `role ${(cashMb as Any).role} permissions ${JSON.stringify((cashMb as Any).permissions)} (สำเนาให้แคชเชียร์ตัวกด)` : "ไม่มี membership แคชเชียร์ QC");
  const unit = await q(() => P.businessUnit.findFirst({ where: { id: BTN.unit.id }, select: { id: true, tenantId: true, slug: true, status: true } }));
  if (unit && unit !== "ERR") add("btn-unit", (unit as Any).tenantId === T.tenantId ? "ok" : "block", `${BTN.unit.id} tenant ${(unit as Any).tenantId} slug ${(unit as Any).slug} status ${(unit as Any).status}`);
  else {
    const slug = await q(() => P.businessUnit.findFirst({ where: { tenantId: T.tenantId, slug: BTN.unit.slug }, select: { id: true } }));
    add("btn-unit", slug && slug !== "ERR" ? "block" : "would-create", slug && slug !== "ERR" ? `slug ${BTN.unit.slug} ถูกใช้โดย ${(slug as Any).id}` : `${BTN.unit.id} slug ${BTN.unit.slug} type ${BTN.unit.type} (prisma.businessUnit.create · CD-P42-W5)`);
  }
  for (const [type, s] of Object.entries(T.systems as Record<string, { id: string }>)) {
    const link = await q(() => P.appSystemUnit.findFirst({ where: { tenantId: T.tenantId, unitId: BTN.unit.id, type }, select: { systemId: true } }));
    add(`link-${type}`, link && link !== "ERR" && (link as Any).systemId === s.id ? "ok" : "would-create", link && link !== "ERR" ? `ผูกอยู่กับ ${(link as Any).systemId}${(link as Any).systemId === s.id ? "" : ` → linkUnit ${s.id}`}` : `linkUnit(${T.tenantId}, ${s.id}, ${BTN.unit.id})`);
  }
  for (const k of ["manager", "cashier"] as const) {
    if (!users.includes(k)) continue;
    const p = BTN[k];
    const byEmail = await q(() => P.user.findUnique({ where: { email: p.email }, select: { id: true } }));
    const byId = await q(() => P.user.findUnique({ where: { id: p.userId }, select: { id: true, email: true } }));
    const clash = byEmail && byEmail !== "ERR" && (byEmail as Any).id !== p.userId;
    add(`persona-${k}-user`, clash ? "block" : byId && byId !== "ERR" ? "ok" : "would-create", clash ? `อีเมล ${p.email} เป็นของ ${(byEmail as Any).id}` : `${p.userId} ${p.email}${byId && byId !== "ERR" ? "" : " (user.upsert)"}`);
    const mb = await q(() => P.membership.findFirst({ where: { userId: p.userId, tenantId: T.tenantId }, select: { id: true, role: true, unitAccess: true } }));
    add(`persona-${k}-membership`, mb && mb !== "ERR" ? "ok" : "would-create", mb && mb !== "ERR" ? `${(mb as Any).id} role ${(mb as Any).role} unitAccess ${JSON.stringify((mb as Any).unitAccess)} (upsert คืนเป็น ${p.role} [${BTN.unit.id}])` : `membership.upsert ${p.membershipId} ${p.role} unitAccess [${BTN.unit.id}]`);
  }
  const limit = (() => {
    const l = (tenant && tenant !== "ERR" ? (tenant as Any).limits : null) as Any;
    const n = Number(l?.posDevices);
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 3;
  })();
  const active = await q(() => P.posDevice.count({ where: { tenantId: T.tenantId, unitId: BTN.unit.id, status: "ACTIVE" } }));
  for (const u of users) {
    if (u === "public") continue; // หน้าสาธารณะไม่ใช้เครื่อง/PIN/กะ
    const code = BTN.device(u);
    const codeOk = /^[A-Za-z0-9_-]{8,64}$/.test(code);
    const d = await q(() => P.posDevice.findFirst({ where: { unitId: BTN.unit.id, deviceCode: code }, select: { id: true, status: true, tenantId: true } }));
    const exists = d && d !== "ERR";
    // CD-P42-R7: เครื่องตัวกดที่ถูกถอน (ซาก 307 ของรอบที่ถูก kill) = fixture คืน ACTIVE ก่อนเริ่ม (warn ไม่ขวาง)
    add(`device-${u}`, !codeOk ? "block" : exists && (d as Any).status === "REVOKED" ? "warn" : exists ? "ok" : Number(active === "ERR" ? 0 : active) >= limit ? "block" : "would-create", `${code} ${exists ? `status ${(d as Any).status}${(d as Any).status === "REVOKED" ? " (ซาก — fixture คืน ACTIVE)" : ""}` : `registerDevice (ACTIVE ${active === "ERR" ? "?" : active}/${limit} ของสาขา)`}${codeOk ? "" : " · รหัสผิดรูป"}`);
    const pers = personaOf(T, u)!;
    const pin = await q(() => P.posStaffPin.findUnique({ where: { unitId_userId: { unitId: BTN.unit.id, userId: pers.userId } }, select: { id: true, lockedUntil: true } }));
    add(`pin-${u}`, pin && pin !== "ERR" ? "ok" : "would-create", pin && pin !== "ERR" ? `มีแถว PIN (จำแล้วคืนค่าใน finally) lockedUntil ${(pin as Any).lockedUntil ?? "-"}` : `setStaffPin ${pers.userId} (owner actor · สุ่ม 6 หลัก · ไม่พิมพ์ค่า)`);
    const sh = await q(() => P.posShift.findFirst({ where: { tenantId: T.tenantId, unitId: BTN.unit.id, deviceId: code, status: "OPEN" }, select: { id: true, openedAt: true } }));
    add(`shift-${u}`, sh && sh !== "ERR" ? "warn" : "would-create", sh && sh !== "ERR" ? `กะ OPEN ค้าง ${(sh as Any).id} (${(sh as Any).openedAt?.toISOString?.()}) — ตัวกดรับต่อแล้วปิดตอนจบ` : `openShift float ${BTN.floatSatang} → closeShift นับตรงยอดตอนจบ`);
  }
  add("session-secret", env("SESSION_SECRET") ? "ok" : "block", env("SESSION_SECRET") ? "มี (issueStaffToken · ไม่พิมพ์ค่า) — ต้องตรงกับของเซิร์ฟเวอร์ QC" : "ไม่มี SESSION_SECRET — ออกโทเคนผู้ขายไม่ได้");
  const pos = await q(() => readPos(T.systems.POS.id));
  if (pos !== "ERR") {
    const v = isRecObj((pos as Any).v) ? (pos as Any).v : {};
    add("settings-residue", isRecObj(v._qcP42Before) ? "warn" : "ok", isRecObj(v._qcP42Before) ? "มีซาก _qcP42Before — รอบหน้าจะคืนค่าจากซากก่อน" : "ไม่มีซาก _qcP42Before");
    add("settings-registerV2", v.registerV2 === true ? "ok" : "warn", `settings.pos.registerV2=${JSON.stringify(v.registerV2)} (ปิด = หน้าขายเดิม W29 · แถวหน้าขายใหม่จะไม่ขึ้น)`);
    add("settings-offline", "ok", `settings.pos.offline.enabled=${JSON.stringify(v?.offline?.enabled)} (เปิด = หน้าขายดึง snapshot ตอนโหลด · ตัวกดเว้น ≥ 61 วิต่อเครื่อง)`);
    add("settings-shift-required", "ok", `settings.pos.shift.requiredRegister=${JSON.stringify(v?.shift?.requiredRegister)} (ตัวกดเปิดกะของตัวเองเสมอ)`);
  }
  const prods = await q(() => P.posProduct.count({ where: { tenantId: T.tenantId, systemId: T.systems.POS.id, archivedAt: null, unitId: null, basePriceSatang: { gt: 0 } } }));
  add("cart-products", prods !== "ERR" && Number(prods) > 0 ? "ok" : "block", `สินค้าทุกสาขาราคาบวก ${prods === "ERR" ? "?" : prods} รายการ (ตะกร้าของแถวเงิน)`);
  const memberPhone = T.member?.phone ?? "";
  const cust = await q(() => P.customer.count({ where: { tenantId: T.tenantId, phone: memberPhone } }));
  add("member", cust !== "ERR" && Number(cust) > 0 ? "ok" : "missing", `สมาชิก QC โทร ${memberPhone}: ${cust === "ERR" ? "?" : cust} แถว (แถวสมาชิก = needs เมื่อไม่มี)`);
  const credit = await q(() => P.posCreditAccount.count({ where: { tenantId: T.tenantId } }));
  add("credit-accounts", credit !== "ERR" && Number(credit) > 0 ? "ok" : "missing", `PosCreditAccount ${credit === "ERR" ? "?" : credit} แถว (บิลเครดิต/บริษัท = needs เมื่อไม่มี)`);
  const board = await q(() => P.kanbanBoard.count({ where: { tenantId: T.tenantId, archivedAt: null } }));
  add("kanban-board", board !== "ERR" && Number(board) > 0 ? "ok" : "missing", `KanbanBoard ของร้าน ${board === "ERR" ? "?" : board} (การ์ดบอร์ด = needs เมื่อไม่มี)`);
  const tokens: [string, () => Promise<number>][] = [
    ["token(/r)", () => P.posSale.count({ where: { tenantId: T.tenantId, publicToken: { not: null }, status: "PAID" } })],
    ["qrToken(/q/t)", () => P.restaurantTable.count({ where: { tenantId: T.tenantId, archivedAt: null } })],
    ["linkToken(/q)", () => P.posOrderLink.count({ where: { tenantId: T.tenantId, status: "ACTIVE" } })],
    ["orderToken(/q/o)", () => P.posOrder.count({ where: { tenantId: T.tenantId, publicToken: { not: null } } })],
  ];
  for (const [k, f] of tokens) {
    const n = await q(f);
    add(`public-${k}`, n !== "ERR" && Number(n) > 0 ? "ok" : "missing", `${n === "ERR" ? "?" : n} แถว (อ่านอย่างเดียว · ไม่มี = skip(needs-fixture))`);
  }
  // ภายนอก: กดแถว external ไม่เกิดอยู่แล้ว แต่ผลข้างเคียงผ่าน outbox ของแถวปกติ (ขาย → ส่ง LINE/webhook) ต้องปิด
  // CD-P42-R7: นับนอกสาขา posqc-btn (ของจริงของร้าน = ขวาง) · ในสาขา posqc-btn = ซากของตัวกดเอง (fixture ถอน/ลบก่อนเริ่ม = warn)
  const notBtn = { unitId: { not: BTN.unit.id } };
  const ext: [string, () => Promise<number>, (() => Promise<number>) | null][] = [
    ["WebhookEndpoint active", () => P.webhookEndpoint.count({ where: { tenantId: T.tenantId, active: true } }), null],
    ["PosPrintAgent not revoked", () => P.posPrintAgent.count({ where: { tenantId: T.tenantId, revokedAt: null, ...notBtn } }), () => P.posPrintAgent.count({ where: { tenantId: T.tenantId, revokedAt: null, unitId: BTN.unit.id } })],
    ["PosIntegrationCredential COMPLETE", () => P.posIntegrationCredential.count({ where: { tenantId: T.tenantId, status: "COMPLETE", ...notBtn } }), () => P.posIntegrationCredential.count({ where: { tenantId: T.tenantId, status: "COMPLETE", unitId: BTN.unit.id } })],
  ];
  for (const [k, f, fb] of ext) {
    const n = await q(f);
    add(`external-${k}`, n === "ERR" ? "warn" : Number(n) > 0 ? "block" : "ok", `${n === "ERR" ? "?" : n}${fb ? " นอกสาขา posqc-btn" : ""} (> 0 = ตัวกดไม่เริ่ม — ปิดก่อน)`);
    if (fb) {
      const m = await q(fb);
      if (m !== "ERR" && Number(m) > 0) add(`residue-${k}`, "warn", `${m} ในสาขา ${BTN.unit.id} (ซากของตัวกด — fixture ถอน/ลบก่อนเริ่ม · CD-P42-R7)`);
    }
  }
  return out;
}

// ═════════════════════════ CLI: --preflight ═════════════════════════
const isMain = (() => {
  try {
    return !!process.argv[1] && /pos-buttons-fixtures\.mts$/.test(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  const argv = process.argv.slice(2);
  if (!argv.includes("--preflight")) {
    console.log("ใช้: … pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight [--user owner|manager|cashier|public]  (อ่านอย่างเดียว)");
    process.exit(2);
  }
  const { loadPosQcEnv, PQC } = (await import("./pos-qc-env.mjs" as string)) as Any;
  loadPosQcEnv("pos-buttons-fixtures --preflight"); // QC4 = ปกติ · QC5 = POS_QC_ALLOW_HOST จาก qc5.sh · prod/QC1–3 = ตาย
  const T = PQC.coffee;
  const u = argv.includes("--user") ? (argv[argv.indexOf("--user") + 1] as UserKey) : null;
  let rows: PF[] = [];
  let fatal = "";
  try {
    rows = await preflight(T, u ? [u] : USERS);
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e);
  }
  for (const r of rows) console.log(`PF ${r.state.padEnd(12)} ${r.key.padEnd(34)} ${r.value}`);
  const by: Record<string, number> = {};
  for (const r of rows) by[r.state] = (by[r.state] ?? 0) + 1;
  const blocks = rows.filter((r) => r.state === "block" && r.key !== "db-host").length;
  console.log(`\n${fatal ? `❌ ${fatal}` : blocks ? `🔴 pre-flight: ${blocks} ข้อขวาง` : "🟢 pre-flight: ไม่มีข้อขวาง"} · ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(" · ")} · ไม่มีการเขียน`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "pos-buttons-fixtures", mode: "preflight", host: dbHost(), total: rows.length, passed: rows.length - blocks, blocks, byState: by, fatal: fatal || null })}`);
  await (await db()).$disconnect().catch(() => {});
  process.exit(fatal || blocks ? 1 : 0);
}
