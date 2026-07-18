// QC "แตกฟังก์ชัน" — กันเมนู accordion (childrenFor ใน src/app/app/layout.tsx) จาก dead link
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx scripts/qc-nav-functions.mts
// กติกา: static เท่านั้น (อ่าน route จาก src/app ด้วย fs) · ไม่ต่อเน็ต · ไม่แตะ DB
//
// ตรวจอะไร:
//   1. ทุก child href ที่ประกาศใน childrenFor → มี page.tsx จริงในระบบไฟล์ (dead link = 0)
//   2. ทุกระบบที่ "ควรมี" sub-route → ได้ children จริง (business by slug / feature by id)
//   3. POS children มี "ขายหน้าร้าน" (register) + "ปิดวัน" (close)
//   4. นับจำนวนระบบที่กาง children (ต้องเพิ่มจากเดิม 2 → ครบตามที่ตั้งใจ)

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LAYOUT = join(ROOT, "src/app/app/layout.tsx");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; detail: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, detail: string, sev: Sev = "MAJOR") {
  checks.push({ id, name, ok, detail, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
}

// ─── ระบบที่ "ควรมี" children (ตาม WO แตกฟังก์ชัน) ─────────────────────────────
const EXPECT_BUSINESS = ["HOTEL", "RESTAURANT", "SHOP", "QUEUE", "TICKET", "BOOKING"];
const EXPECT_FEATURE = ["POS", "ACCOUNT"];

// ─── map href (route) → path ไฟล์ page.tsx จริง ──────────────────────────────
// business: /app/u/${slugOrId}/rest  → src/app/app/u/[unitSlug]/rest/page.tsx
// feature:  /app/sys/${slugOrId}/rest → src/app/app/sys/[id]/rest/page.tsx
function pageFileFor(kind: "business" | "feature", rest: string): string {
  const base = kind === "business" ? "src/app/app/u/[unitSlug]" : "src/app/app/sys/[id]";
  const clean = rest.replace(/^\//, "");
  return join(ROOT, base, clean, "page.tsx");
}

const src = readFileSync(LAYOUT, "utf8");

// ตัดเฉพาะ body ของ childrenFor (ตั้งแต่ประกาศ ถึงคอมเมนต์ "ระบบทั้งหมด")
const start = src.indexOf("const childrenFor");
const end = src.indexOf("// ระบบทั้งหมด", start);
chk("S0", "หา childrenFor ใน layout.tsx", start >= 0 && end > start, "ไม่พบบล็อก childrenFor", "CRITICAL");

const body = start >= 0 && end > start ? src.slice(start, end) : "";

// business switch อยู่ในบล็อก `if (kind === "business")` — feature อยู่นอก
// แยกด้วยจุดเริ่ม `const s = ` (feature base) — ก่อนหน้านั้นคือ business
const splitAt = body.indexOf("const s = `/app/sys");
const businessBody = splitAt >= 0 ? body.slice(0, splitAt) : body;
const featureBody = splitAt >= 0 ? body.slice(splitAt) : "";

// ดึงทุก case block → hrefs
type ParsedCase = { type: string; kind: "business" | "feature"; hrefs: string[] };
function parseCases(text: string, kind: "business" | "feature"): ParsedCase[] {
  const out: ParsedCase[] = [];
  const caseRe = /case\s+"([A-Z_]+)":([\s\S]*?)(?=case\s+"|default:)/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(text)) !== null) {
    const type = m[1];
    const blk = m[2];
    const hrefs: string[] = [];
    const hrefRe = /href:\s*(`[^`]*`|\bs\b|\bb\b)/g;
    let h: RegExpExecArray | null;
    while ((h = hrefRe.exec(blk)) !== null) hrefs.push(h[1]);
    out.push({ type, kind, hrefs });
  }
  return out;
}

const cases = [...parseCases(businessBody, "business"), ...parseCases(featureBody, "feature")];

// แปลง href token → rest path (เทียบกับ base ของ kind)
function hrefToRest(token: string): string | null {
  if (token === "s" || token === "b") return ""; // root = /app/sys/<id> หรือ /app/u/<slug>
  // `${b}/x/y` หรือ `${s}/x/y`
  const inner = token.slice(1, -1); // ตัด backtick
  const mm = /^\$\{[bs]\}(.*)$/.exec(inner);
  if (!mm) return null;
  return mm[1]; // เช่น "/hotel/reservations" หรือ ""
}

// ─── S1: dead link = 0 ────────────────────────────────────────────────────────
const deadLinks: string[] = [];
let totalHrefs = 0;
for (const c of cases) {
  for (const token of c.hrefs) {
    const rest = hrefToRest(token);
    if (rest === null) {
      deadLinks.push(`${c.type}: parse ไม่ได้ (${token})`);
      continue;
    }
    totalHrefs++;
    const file = pageFileFor(c.kind, rest);
    if (!existsSync(file)) {
      deadLinks.push(`${c.type} → ${token} → ${file.replace(ROOT + "/", "")} (ไม่มีไฟล์)`);
    }
  }
}
chk(
  "S1",
  `child href ทุกอันมี page.tsx จริง (${totalHrefs} links)`,
  deadLinks.length === 0,
  `dead link ${deadLinks.length}:\n     - ${deadLinks.join("\n     - ")}`,
  "CRITICAL",
);

// ─── S2: ระบบที่ควรมี children → มีจริง ────────────────────────────────────────
const haveTypes = new Set(cases.map((c) => c.type));
const missingBiz = EXPECT_BUSINESS.filter((t) => !haveTypes.has(t));
const missingFeat = EXPECT_FEATURE.filter((t) => !haveTypes.has(t));
chk(
  "S2",
  `ระบบที่ควรกาง children ครบ (business ${EXPECT_BUSINESS.length} + feature ${EXPECT_FEATURE.length})`,
  missingBiz.length === 0 && missingFeat.length === 0,
  `ขาด business=[${missingBiz.join(",")}] feature=[${missingFeat.join(",")}]`,
  "CRITICAL",
);

// ─── S3: POS children มี register + close ─────────────────────────────────────
const pos = cases.find((c) => c.type === "POS");
const posHrefs = pos ? pos.hrefs.join(" ") : "";
const posHasRegister = /pos\/register/.test(posHrefs);
const posHasClose = /pos\/close/.test(posHrefs);
chk(
  "S3",
  "POS children มี ขายหน้าร้าน (register) + ปิดวัน (close)",
  !!pos && posHasRegister && posHasClose,
  `register=${posHasRegister} close=${posHasClose}`,
  "CRITICAL",
);

// ─── S4: จำนวนระบบที่กาง children เพิ่มจากเดิม 2 ────────────────────────────────
const withChildren = cases.length;
chk(
  "S4",
  `จำนวนระบบที่กาง children = ${withChildren} (เดิม 2 → ควร ≥ ${EXPECT_BUSINESS.length + EXPECT_FEATURE.length})`,
  withChildren >= EXPECT_BUSINESS.length + EXPECT_FEATURE.length,
  `มีแค่ ${withChildren}`,
  "MAJOR",
);

// ─── สรุป ─────────────────────────────────────────────────────────────────────
console.log("\n  ── ระบบที่กาง children ──");
for (const c of cases) {
  console.log(`     ${c.kind === "business" ? "🏢" : "⚙️ "} ${c.type} · ${c.hrefs.length} ฟังก์ชันย่อย`);
}

const failed = checks.filter((c) => !c.ok);
const critical = failed.filter((c) => c.sev === "CRITICAL");
console.log(
  `\n  ${failed.length === 0 ? "✅ ผ่านทั้งหมด" : `❌ ตก ${failed.length} (CRITICAL ${critical.length})`} — ${checks.length} เช็ก`,
);
process.exit(failed.length === 0 ? 0 : 1);
