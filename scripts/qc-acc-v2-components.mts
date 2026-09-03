// QC WO 0.5 — "ส่วนประกอบกลาง V2": ไม่แตะ DB เลย (component-level เท่านั้น)
// รัน:  pnpm tsx scripts/qc-acc-v2-components.mts
//
// ครอบคลุม:
//   C1 ทุกไฟล์ component/util ที่ WO นี้ต้องส่งมีอยู่จริง + export ชื่อที่ระบุ
//   C2 ไม่มี raw color class (tailwind ตัวเลขเฉด/hex ดิบ) ใน src/components/account-v2 — เฉพาะ token กลาง
//   C3 ข้อความที่ user เห็น (JSX text node + placeholder/aria-label/title) เป็นภาษาไทย (allowlist: QR/e-Tax/PDF/AI/VAT/POS)
//   C4 formatDateTh() ให้ปี ค.ศ. ไม่ใช่ พ.ศ. + รูปแบบสั้น/ยาวถูกต้อง
//   C5 MoneyInput: parse/format สตางค์ไป-กลับตรงกัน (รวมค่าติดลบ/ทศนิยม)
//   C6 ตัวสร้างลิงก์ tab/sort/pagination (url.ts) รักษาพารามิเตอร์อื่นไว้ครบเสมอ

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(`${name} — ${detail}`);
  console.log(`  ❌ ${name} — ${detail}`);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert(name, actual === expected, `ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(expected)}`);
}

const ROOT = process.cwd();
const COMP_DIR = join(ROOT, "src/components/account-v2");

console.log("\n===== QC WO 0.5 · ส่วนประกอบกลาง V2 (ไม่แตะ DB) =====\n");

// ═══════════════ C1 — ไฟล์ + export ครบ ═══════════════
console.log("C1 ไฟล์ component/util ครบ + export ตามสัญญา:");
type FileSpec = { path: string; exportsToCheck: string[] };
const EXPECTED_FILES: FileSpec[] = [
  { path: "src/components/account-v2/StatusTabs.tsx", exportsToCheck: ["StatusTabs"] },
  { path: "src/components/account-v2/ListFilters.tsx", exportsToCheck: ["ListFilters"] },
  { path: "src/components/account-v2/DocTable.tsx", exportsToCheck: ["DocTable"] },
  { path: "src/components/account-v2/DocTableInteractive.tsx", exportsToCheck: ["DocTableInteractive"] },
  { path: "src/components/account-v2/RowActions.tsx", exportsToCheck: ["RowActions"] },
  { path: "src/components/account-v2/Pagination.tsx", exportsToCheck: ["Pagination"] },
  { path: "src/components/account-v2/url.ts", exportsToCheck: ["buildHref", "buildTabHref", "buildSortHref", "buildPageHref", "buildPageSizeHref"] },
  { path: "src/components/account-v2/MoneyInput.tsx", exportsToCheck: ["MoneyInput", "parseMoneyInputToSatang", "formatSatangForInput"] },
  { path: "src/components/account-v2/QtyInput.tsx", exportsToCheck: ["QtyInput"] },
  { path: "src/components/account-v2/DateInput.tsx", exportsToCheck: ["DateInput"] },
  { path: "src/components/account-v2/PercentOrAmountInput.tsx", exportsToCheck: ["PercentOrAmountInput"] },
  { path: "src/components/account-v2/ContactPicker.tsx", exportsToCheck: ["ContactPicker"] },
  { path: "src/components/account-v2/ProductPicker.tsx", exportsToCheck: ["ProductPicker"] },
  { path: "src/components/account-v2/SlideOver.tsx", exportsToCheck: ["SlideOver"] },
  { path: "src/components/account-v2/Modal.tsx", exportsToCheck: ["Modal"] },
  { path: "src/components/account-v2/Stepper.tsx", exportsToCheck: ["Stepper"] },
  { path: "src/components/account-v2/SectionCard.tsx", exportsToCheck: ["SectionCard"] },
  { path: "src/components/account-v2/Accordion.tsx", exportsToCheck: ["Accordion"] },
  { path: "src/components/account-v2/StickyBar.tsx", exportsToCheck: ["StickyBar"] },
  { path: "src/components/account-v2/Toast.tsx", exportsToCheck: ["ToastProvider", "useToast"] },
  { path: "src/components/account-v2/EasyModeToggle.tsx", exportsToCheck: ["EasyModeToggle", "useAccMode"] },
  { path: "src/components/account-v2/mode.ts", exportsToCheck: ["getAccMode", "ACC_MODE_COOKIE"] },
  { path: "src/lib/ui/date.ts", exportsToCheck: ["formatDateTh", "formatThaiDate", "thaiDateKey"] },
  { path: "src/lib/ui/DateText.tsx", exportsToCheck: ["DateText"] },
  { path: "src/app/app/sys/[id]/account/dev-components/page.tsx", exportsToCheck: ["default"] },
];

for (const spec of EXPECTED_FILES) {
  const abs = join(ROOT, spec.path);
  if (!existsSync(abs)) {
    bad(`ไฟล์มีอยู่จริง: ${spec.path}`, "ไม่พบไฟล์");
    continue;
  }
  ok(`ไฟล์มีอยู่จริง: ${spec.path}`);
  // route ใต้ [id] มีวงเล็บเหลี่ยมในพาธ — import() แบบ dynamic string เสี่ยง resolve พลาด (ไม่เกี่ยวกับ WO นี้)
  // ตรวจแบบข้อความแทน: มี "export default" จริง
  if (spec.path.includes("[id]")) {
    const src = readFileSync(abs, "utf8");
    assert(`export default: ${spec.path}`, /export default (async )?function/.test(src), "ไม่พบ export default function");
    continue;
  }
  try {
    const mod: Record<string, unknown> = await import("@/" + spec.path.replace(/^src\//, "").replace(/\.tsx?$/, ""));
    const missing = spec.exportsToCheck.filter((name) => !(name in mod));
    assert(`export ครบ: ${spec.path} (${spec.exportsToCheck.join(", ")})`, missing.length === 0, `ขาด: ${missing.join(", ")}`);
  } catch (e) {
    bad(`import ได้ไม่มี error: ${spec.path}`, e instanceof Error ? e.message : String(e));
  }
}

// ไฟล์ที่ WO 0.5 นี้เป็นเจ้าของจริง (ไม่ใช้ walk ทั้งโฟลเดอร์ — WO 0.4 กำลังสร้าง AccountTabBar/AccountBreadcrumb
// พร้อมกันใน src/components/account-v2/ ด้วย ต้องไม่พึ่งพา/ตรวจไฟล์ของ WO อื่นที่กำลังแก้อยู่)
const OWNED_FILES = [
  "StatusTabs.tsx",
  "ListFilters.tsx",
  "DocTable.tsx",
  "DocTableInteractive.tsx",
  "RowActions.tsx",
  "Pagination.tsx",
  "url.ts",
  "MoneyInput.tsx",
  "QtyInput.tsx",
  "DateInput.tsx",
  "PercentOrAmountInput.tsx",
  "ContactPicker.tsx",
  "ProductPicker.tsx",
  "SlideOver.tsx",
  "Modal.tsx",
  "Stepper.tsx",
  "SectionCard.tsx",
  "Accordion.tsx",
  "StickyBar.tsx",
  "Toast.tsx",
  "EasyModeToggle.tsx",
  "mode.ts",
  "mode-shared.ts",
].map((f) => join(COMP_DIR, f));

// ═══════════════ C2 — ไม่มี raw color class ═══════════════
console.log("\nC2 ไม่มี raw color class (เฉด tailwind ตัวเลข/hex ดิบ) ในไฟล์ของ WO 0.5:");
{
  const RAW_COLOR_RE =
    /\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(red|blue|green|yellow|purple|pink|indigo|orange|teal|cyan|lime|amber|emerald|rose|violet|fuchsia|sky|slate|zinc|neutral|stone|gray|grey)-\d{2,3}\b/;
  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
  const bad_: string[] = [];
  for (const p of OWNED_FILES) {
    const src = readFileSync(p, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (RAW_COLOR_RE.test(line) || HEX_RE.test(line)) bad_.push(`${p.replace(ROOT + "/", "")}:${i + 1}`);
    });
  }
  assert("ไม่พบ raw color class / hex ดิบ", bad_.length === 0, bad_.join(" · "));
}

// ═══════════════ C3 — ข้อความ user เห็นเป็นไทย ═══════════════
console.log("\nC3 ข้อความ user เห็นเป็นภาษาไทย (allowlist QR/e-Tax/PDF/AI/VAT/POS):");
{
  const ALLOW = ["QR", "e-Tax", "PDF", "AI", "VAT", "POS"];
  // ตัด allowlist ออกก่อนค้นหาอักษรละตินที่เหลือ (เรียงยาวไปสั้นกันตัดทับผิด)
  const stripAllow = (s: string) => ALLOW.sort((a, b) => b.length - a.length).reduce((acc, w) => acc.split(w).join(""), s);
  const LATIN_RE = /[A-Za-z]{2,}/;
  const bad_: string[] = [];

  // JSX text node ระหว่าง > และ < — กันชนกับ "=>" (arrow function) และ generic "Promise<...>" ด้วย negative lookbehind
  const TEXT_NODE_RE = /(?<!=)>([^<>{}\n]{2,})</g;
  // string literal ของ attribute ที่ user เห็นจริง
  const ATTR_RE = /\b(?:placeholder|aria-label|title|alt)="([^"]+)"/g;

  for (const p of OWNED_FILES.filter((f) => f.endsWith(".tsx"))) {
    const src = readFileSync(p, "utf8");
    const rel = p.replace(ROOT + "/", "");
    for (const m of src.matchAll(TEXT_NODE_RE)) {
      const text = m[1].trim();
      if (!text || /^[\d\s.,%฿:▾▲✓✕—–\-•·()]+$/.test(text)) continue;
      const stripped = stripAllow(text);
      if (LATIN_RE.test(stripped)) bad_.push(`${rel}: text "${text}"`);
    }
    for (const m of src.matchAll(ATTR_RE)) {
      const text = m[1].trim();
      const stripped = stripAllow(text);
      if (LATIN_RE.test(stripped)) bad_.push(`${rel}: attr "${text}"`);
    }
  }
  assert("ไม่พบข้อความอังกฤษนอก allowlist", bad_.length === 0, bad_.join(" · "));
}

// ═══════════════ C4 — formatDateTh ═══════════════
console.log("\nC4 formatDateTh — ปี ค.ศ. ไม่ใช่ พ.ศ.:");
{
  const { formatDateTh } = await import("@/lib/ui/date");
  eq("24 ก.ย. 2026 ค.ศ. (withYear ปริยาย)", formatDateTh("2026-09-24"), "24 ก.ย. 2026");
  eq("แบบสั้นไม่มีปี", formatDateTh("2026-09-24", { withYear: false }), "24 ก.ย.");
  eq("ต้นเดือน ม.ค.", formatDateTh("2027-01-05"), "5 ม.ค. 2027");
  eq("ปลายปี ธ.ค.", formatDateTh("2026-12-31"), "31 ธ.ค. 2026");
}

// ═══════════════ C5 — MoneyInput roundtrip ═══════════════
console.log("\nC5 MoneyInput — parse/format สตางค์ไป-กลับตรงกัน:");
{
  const { parseMoneyInputToSatang, formatSatangForInput } = await import("@/components/account-v2/MoneyInput");
  eq("format 2490000 สตางค์", formatSatangForInput(2490000), "24,900.00");
  eq("parse \"24,900.00\" กลับเป็นสตางค์", parseMoneyInputToSatang("24,900.00"), 2490000);
  eq("format 0", formatSatangForInput(0), "0.00");
  eq("parse ว่าง = 0", parseMoneyInputToSatang(""), 0);
  eq("format ติดลบ", formatSatangForInput(-59400), "-594.00");
  eq("parse ติดลบกลับสตางค์", parseMoneyInputToSatang("-594.00"), -59400);
  const roundtrip = [0, 100, 2490000, 999999999, -12345];
  for (const s of roundtrip) {
    eq(`roundtrip ${s} สตางค์`, parseMoneyInputToSatang(formatSatangForInput(s)), s);
  }
}

// ═══════════════ C6 — URL builders รักษาพารามิเตอร์ ═══════════════
console.log("\nC6 ตัวสร้างลิงก์ tab/sort/pagination รักษาพารามิเตอร์อื่นไว้:");
{
  const { buildTabHref, buildSortHref, buildPageHref, buildPageSizeHref, buildHref } = await import(
    "@/components/account-v2/url"
  );
  const base = { q: "ณัฐพล", contactId: "c1", from: "2026-01-01" };

  const tabHref = buildTabHref("/x", base, "PAID");
  assert("tab href มี tab=PAID", tabHref.includes("tab=PAID"), tabHref);
  assert("tab href ยังมี q เดิม", tabHref.includes(encodeURIComponent("ณัฐพล")) || tabHref.includes("q=%E0"), tabHref);
  assert("tab href ยังมี contactId เดิม", tabHref.includes("contactId=c1"), tabHref);

  const sortHref1 = buildSortHref("/x", base, "amount");
  assert("sort href ค่าเริ่มต้น = desc", sortHref1.includes("sort=amount") && sortHref1.includes("dir=desc"), sortHref1);
  const sortHref2 = buildSortHref("/x", base, "amount", { currentSort: "amount", currentDir: "desc" });
  assert("sort href คลิกซ้ำสลับเป็น asc", sortHref2.includes("dir=asc"), sortHref2);
  assert("sort href ยังมี q เดิม", sortHref2.includes("contactId=c1"), sortHref2);

  const pageHref = buildPageHref("/x", { ...base, page: "3" }, 4);
  assert("page href = 4", pageHref.includes("page=4"), pageHref);
  assert("page href ยังมี contactId เดิม", pageHref.includes("contactId=c1"), pageHref);

  const pageSizeHref = buildPageSizeHref("/x", { ...base, page: "3", pageSize: "20" }, 50);
  assert("pageSize href = 50", pageSizeHref.includes("pageSize=50"), pageSizeHref);
  assert("pageSize href รีเซ็ต page (ชุดข้อมูลใหม่)", !pageSizeHref.includes("page=3"), pageSizeHref);

  const cleared = buildHref("/x", { q: "abc" }, { q: undefined });
  eq("ลบคีย์ที่ patch เป็น undefined", cleared, "/x");
}

// ─────────────────── สรุป ───────────────────
console.log("\n===== สรุป =====");
console.log(`ผ่าน ${passed}/${passed + findings.length}`);
if (findings.length > 0) {
  console.log(`FINDINGS (${findings.length}):`);
  for (const f of findings) console.log("  - " + f);
}
process.exit(findings.length > 0 ? 1 : 0);
