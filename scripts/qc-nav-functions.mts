// QC "แตกฟังก์ชัน" — กันเมนู accordion (childrenFor ใน src/app/app/layout.tsx) จาก dead link
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx scripts/qc-nav-functions.mts
// กติกา: static เท่านั้น (อ่าน route จาก src/app ด้วย fs) · ไม่ต่อเน็ต · ไม่แตะ DB
//
// ตรวจอะไร:
//   1. ทุก child href ที่ประกาศใน childrenFor → มี page.tsx จริงในระบบไฟล์ (dead link = 0)
//   2. ทุกระบบที่ "ควรมี" sub-route → ได้ children จริง (business by slug / feature by id)
//   3. POS children มี "ขายหน้าร้าน" (register) + "ปิดวัน" (close)
//   4. นับจำนวนระบบที่กาง children (ต้องเพิ่มจากเดิม 2 → ครบตามที่ตั้งใจ)

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

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
const EXPECT_FEATURE = ["POS", "ACCOUNT", "HR", "INVENTORY", "CRM", "MARKETING", "COUPON", "MEMBER", "POINT", "REWARD", "CHAT", "MEETING", "KANBAN"];

// ─── map href (route) → path ไฟล์ page.tsx จริง ──────────────────────────────
// business: /app/u/${slugOrId}/rest  → src/app/app/u/[unitSlug]/rest/page.tsx
// feature:  /app/sys/${slugOrId}/rest → src/app/app/sys/[id]/rest/page.tsx
function pageFileFor(kind: "business" | "feature", rest: string): string {
  const base = kind === "business" ? "src/app/app/u/[unitSlug]" : "src/app/app/sys/[id]";
  const clean = rest.replace(/^\//, "");
  const direct = join(ROOT, base, clean, "page.tsx");
  if (existsSync(direct) || !clean) return direct;
  // route แบบ dynamic: /account/docs/RECEIPT → .../account/docs/[docType]/page.tsx
  // (ไม่รองรับตรงนี้ = ฟ้อง dead link ปลอมให้ลิงก์ที่ใช้ได้จริง แล้วคนจะเริ่มไม่เชื่อข้อสอบ)
  let dir = join(ROOT, base);
  for (const seg of clean.split("/")) {
    const exact = join(dir, seg);
    if (existsSync(exact)) { dir = exact; continue; }
    const dyn = existsSync(dir)
      ? readdirSync(dir).find((d) => d.startsWith("[") && statSync(join(dir, d)).isDirectory())
      : undefined;
    if (!dyn) return direct; // ไม่มีทั้งชื่อตรงและ dynamic → dead link จริง
    dir = join(dir, dyn);
  }
  return join(dir, "page.tsx");
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

// 🔴 ระบบบัญชีไม่พิมพ์ลิสต์ไว้ใน layout แล้ว — ดึงจากทะเบียนกลาง `account/nav.ts` (ตัวเดียวกับ sidebar)
// ถ้าไม่ตามไปอ่านที่นั่น ด่าน "dead link" จะเหลือแค่ 1 ลิงก์ของบัญชี = ข้อสอบวัดอะไรไม่ได้
const accCase = cases.find((c) => c.type === "ACCOUNT");
if (accCase) {
  const navSrc = readFileSync(join(ROOT, "src/lib/modules/account/nav.ts"), "utf8");
  const navHrefs = [...navSrc.matchAll(/href:\s*`\$\{base\}([^`]*)`/g)].map((m) => m[1]);
  chk("S0.1", `ตามลิงก์บัญชีไปที่ account/nav.ts ได้ (${navHrefs.length} รายการ)`,
    navHrefs.length >= 20 && /accountNavChildren/.test(featureBody),
    `เจอ ${navHrefs.length} href · layout อ้าง accountNavChildren = ${/accountNavChildren/.test(featureBody)}`,
    "CRITICAL");
  accCase.hrefs.push(...navHrefs.map((h) => `\`\${s}/account${h}\``));
}

// ตัด ?query และ #hash ออกจาก href ก่อนแมปเป็นไฟล์ page.tsx — เหมือน stripQueryHash() ใน account/nav.ts
// 🔴 WO 1.1: ไม่ตัดแล้วพลาด — href ของ flyout เมนูบัญชี V2 มี `?tab=…`/`#new` ต่อท้าย (เช่น `/po?tab=awaiting_approval`,
// `/purchase#new`) พาธไฟล์จริงคือ `.../po/page.tsx` ไม่ใช่โฟลเดอร์ชื่อ "po?tab=awaiting_approval" — ไม่ตัดก่อนเทียบ
// ทำให้ S1 ฟ้อง dead link ปลอม 43 ลิงก์ทั้งที่ route มีจริง (เจอ 2 ก.ย. ตอนต่อหน้ารายการ WO 1.1)
function stripQueryHash(href: string): string {
  const qi = href.indexOf("?");
  const hi = href.indexOf("#");
  const cut = Math.min(...[qi, hi].filter((n) => n >= 0), href.length);
  return href.slice(0, cut);
}

// แปลง href token → rest path (เทียบกับ base ของ kind)
function hrefToRest(token: string): string | null {
  if (token === "s" || token === "b") return ""; // root = /app/sys/<id> หรือ /app/u/<slug>
  // `${b}/x/y` หรือ `${s}/x/y`
  const inner = token.slice(1, -1); // ตัด backtick
  const mm = /^\$\{[bs]\}(.*)$/.exec(inner);
  if (!mm) return null;
  return stripQueryHash(mm[1]); // เช่น "/hotel/reservations" หรือ "" (query/hash ตัดทิ้งก่อนแมปไฟล์)
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

// ─── S1.2: ทุก href บัญชีที่มี ?tab=/&tab= → tab key ต้องมีจริงใน LIST_TABS (list-tabs.ts) ──────
// WO 1.1: กันลิงก์ flyout เมนู V2 พิมพ์ tab key ผิด (เช่น "awaiting_accept" ทั้งที่หน้ารายการประกาศ "awaiting")
// เงียบ ๆ ไม่มีใครจับ — S1 เช็คแค่ "ไฟล์ route มีจริง" แต่ไม่เช็คว่า query tab นั้นตรงกับแท็บที่หน้ารายการรู้จัก
// อ่านแบบ static จากซอร์ส (ไม่ import service.ts/list-tabs.ts ตรง ๆ เพื่อเลี่ยงพ่วง @/lib/core/db —
// สคริปต์นี้ประกาศตัวเองว่า "ไม่แตะ DB" ที่หัวไฟล์ ต้องรักษาไว้)
const listTabsSrc = readFileSync(join(ROOT, "src/lib/modules/account/list-tabs.ts"), "utf8");
// ชื่อ const ทางลัดที่ใช้ซ้ำในหลาย docType (all/draft/awaitingApproval/...) → key จริงของมัน
const shortcutKeyOf = new Map<string, string>();
for (const m of listTabsSrc.matchAll(/const (\w+): DocListTabDef = \{\s*key: "([a-z_]+)"/g)) {
  shortcutKeyOf.set(m[1], m[2]);
}
// ตัดเฉพาะบล็อก `export const LIST_TABS = { ... };` แล้วหา key ที่ประกาศจริงต่อ docType
// (นับสมดุลวงเล็บ `[` `]` เฉพาะระดับอาร์เรย์ของ docType นั้น — object `{}` ข้างในไม่กวนเพราะนับคนละสัญลักษณ์)
const ltBody = listTabsSrc.slice(listTabsSrc.indexOf("export const LIST_TABS"));
const tabKeysByDocType = new Map<string, Set<string>>();
for (const dm of ltBody.matchAll(/\n {2}([A-Z_]+): \[/g)) {
  const docType = dm[1];
  let depth = 0;
  let j = (dm.index ?? 0) + dm[0].length - 1; // ตำแหน่ง "["
  for (; j < ltBody.length; j++) {
    if (ltBody[j] === "[") depth++;
    else if (ltBody[j] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const arrText = ltBody.slice((dm.index ?? 0) + dm[0].length - 1, j + 1);
  const keys = new Set<string>();
  for (const km of arrText.matchAll(/key:\s*"([a-z_]+)"/g)) keys.add(km[1]);
  for (const idm of arrText.matchAll(/\b([a-zA-Z]+)\b/g)) {
    const sc = shortcutKeyOf.get(idm[1]);
    if (sc) keys.add(sc);
  }
  tabKeysByDocType.set(docType, keys);
}
// "recent" = ทางลัด "ล่าสุด" ของ flyout เท่านั้น (sort=recent) ไม่ใช่แท็บที่โชว์ในแถบสถานะของหน้ารายการ
// (ไม่มีใน mockup f3 — ดู list-tabs.ts หัวไฟล์) ⇒ ไม่อยู่ใน LIST_TABS แต่เป็นคีย์ที่ถูกต้องเสมอ
const ALWAYS_VALID_TAB_KEYS = new Set(["recent"]);

function docTypeAndTabFromHref(h: string): { docType: string; tab: string } | null {
  const tabMatch = /[?&]tab=([a-z_]+)/.exec(h);
  if (!tabMatch) return null;
  const tab = tabMatch[1];
  const docTypeParam = /[?&]docType=([A-Z_]+)/.exec(h);
  if (docTypeParam) return { docType: docTypeParam[1], tab };
  const docsMatch = /^\/docs\/([A-Z_]+)/.exec(h);
  if (docsMatch) return { docType: docsMatch[1], tab };
  if (h.startsWith("/po")) return { docType: "PURCHASE_ORDER", tab };
  if (h.startsWith("/purchase")) return { docType: "PURCHASE", tab };
  if (h.startsWith("/expense")) return { docType: "EXPENSE", tab };
  if (h.startsWith("/asset-buy")) return { docType: "ASSET_PURCHASE", tab };
  if (h.startsWith("/goods-issue")) return { docType: "GOODS_ISSUE", tab };
  return null; // route นอกขอบเขตแท็บเอกสาร (เช่น /wht?tab=credit) — ไม่ใช่ scope เช็คนี้
}

const navSrcForTabs = readFileSync(join(ROOT, "src/lib/modules/account/nav.ts"), "utf8");
const navHrefsForTabs = [...navSrcForTabs.matchAll(/href:\s*`\$\{base\}([^`]*)`/g)].map((m) => m[1]);
const badTabLinks: string[] = [];
let tabLinksChecked = 0;
for (const h of navHrefsForTabs) {
  const parsed = docTypeAndTabFromHref(h);
  if (!parsed) continue;
  tabLinksChecked++;
  if (ALWAYS_VALID_TAB_KEYS.has(parsed.tab)) continue;
  const keys = tabKeysByDocType.get(parsed.docType);
  if (!keys || !keys.has(parsed.tab)) {
    badTabLinks.push(`${parsed.docType}?tab=${parsed.tab} (href="${h}") — ไม่มีในหน้ารายการ (list-tabs.ts)`);
  }
}
chk(
  "S1.2",
  `href บัญชีที่มี ?tab= ทุกอัน ตรงกับแท็บจริงใน list-tabs.ts (${tabLinksChecked} links)`,
  badTabLinks.length === 0,
  `tab key ไม่ตรง ${badTabLinks.length}:\n     - ${badTabLinks.join("\n     - ")}`,
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

// ─── S5: completeness — ทุก page.tsx ที่ไม่ใช่ [param] ต้องอยู่ใน accordion ────
// enumerate route จริงจาก fs ต่อระบบ แล้วเทียบกับ children ที่ประกาศ (declared ⊇ required)
// ครอบคลุม: hotel/restaurant/shop/queue/ticket/booking (business) + POS (feature)
// (ACCOUNT ยกเว้น — มี ~20 route กางเฉพาะฟังก์ชันหลัก)
const APP = join(ROOT, "src/app/app");
const BIZ_BASE = join(APP, "u/[unitSlug]");
const POS_BASE = join(APP, "sys/[id]");

// รวบรวม page.tsx ใต้ dir (recursive) → คืน rest path เทียบกับ baseForRest · ตัด segment ที่เป็น [param]
// หน้าที่คงอยู่เพื่อ "ลิงก์เก่าที่ส่งออกไปแล้วต้องไม่ตาย" — ไม่ใช่ฟังก์ชันของระบบ จึงไม่ต้องมีในเมนู
// 🔴 เพิ่มรายชื่อที่นี่ได้เฉพาะเมื่อเขียนเหตุผลกำกับ · ห้ามใส่เพื่อให้ข้อสอบเขียวเฉย ๆ
const COMPAT_REDIRECTS = new Set<string>([
  // WO-CW4: กล่องแชทย้ายไปอยู่หน้า "ภาพรวม" แล้ว แต่ push/AppNotification ที่ส่งออกไปก่อนหน้านี้
  // ชี้มาที่ `/app/sys/<id>/chat?c=<id>` ⇒ ไฟล์ต้องอยู่ต่อและ redirect พา `?c=` ไปด้วย
  // ถ้าบังคับให้มีในเมนู = ได้แท็บซ้ำที่พาไปที่เดิม ซึ่งขัดกับ §6.1 (เหลือ 2 แท็บ)
  "src/app/app/sys/[id]/chat/page.tsx",
]);

function routesUnder(dir: string, baseForRest: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        if (/^\[.*\]$/.test(name)) continue; // ข้ามโฟลเดอร์ [param]
        walk(full);
      } else if (name === "page.tsx") {
        // 🔴 Fable 31 ส.ค. — ยกเว้นเฉพาะ "หน้าเปลี่ยนทางเพื่อความเข้ากันได้" ที่ประกาศไว้ข้างล่าง
        //    เจตนาเดิมของ S5 ไม่เปลี่ยน: **หน้าที่มีเนื้อหาจริงห้ามเป็นหน้ากำพร้า**
        //    ใช้รายชื่อชัดเจน ไม่ใช่ฮิวริสติก "ไม่มี JSX = redirect" เพราะหน้าแบบนี้มักมี JSX
        //    สำหรับกรณีไม่มีสิทธิ์อยู่ด้วย (ต้องอธิบายให้คนอ่านรู้เรื่อง ไม่ใช่เด้งไปเจอ error ดิบ)
        //    ⇒ ฮิวริสติกจะกลืนหน้าจริงในอนาคตโดยไม่มีใครรู้ · รายชื่อบังคับให้ต้องเขียนเหตุผลทุกครั้ง
        // เทียบด้วยหางของ path — `full` เป็น absolute (สร้างจาก ROOT) ส่วนรายชื่อเขียนแบบ repo-relative
        if ([...COMPAT_REDIRECTS].some((x) => full.endsWith(x))) continue;
        const rel = relative(baseForRest, d); // "" = root · "restaurant/menu" ฯลฯ
        out.push(rel === "" ? "" : "/" + rel.split("/").join("/"));
      }
    }
  };
  walk(dir);
  return out;
}

// declared: type → Set ของ rest ที่ประกาศใน accordion
const declaredByType = new Map<string, Set<string>>();
for (const c of cases) {
  const set = declaredByType.get(c.type) ?? new Set<string>();
  for (const token of c.hrefs) {
    const rest = hrefToRest(token);
    if (rest !== null) set.add(rest);
  }
  declaredByType.set(c.type, set);
}

// required: type → route จริงจาก fs
const BIZ_COMPLETE: { type: string; dir: string }[] = [
  { type: "HOTEL", dir: "hotel" },
  { type: "RESTAURANT", dir: "restaurant" },
  { type: "SHOP", dir: "shop" },
  { type: "QUEUE", dir: "queue" },
  { type: "TICKET", dir: "ticket" },
  { type: "BOOKING", dir: "booking" },
];
const requiredByType = new Map<string, string[]>();
for (const b of BIZ_COMPLETE) {
  requiredByType.set(b.type, routesUnder(join(BIZ_BASE, b.dir), BIZ_BASE));
}
// POS: root overview (sys/[id]/page.tsx → "") + ทุกหน้าใต้ sys/[id]/pos
{
  const posRoot = existsSync(join(POS_BASE, "page.tsx")) ? [""] : [];
  const posSub = routesUnder(join(POS_BASE, "pos"), POS_BASE); // "/pos/register" ฯลฯ
  requiredByType.set("POS", [...posRoot, ...posSub]);
}
// HR / INVENTORY: root overview (sys/[id]/page.tsx → "") + ทุกหน้าย่อยใต้ folder ของระบบ
// (batch แตกฟังก์ชัน HR+Inventory — 1 ฟังก์ชัน = 1 หน้า)
{
  const sysRoot = existsSync(join(POS_BASE, "page.tsx")) ? [""] : [];
  requiredByType.set("HR", [...sysRoot, ...routesUnder(join(POS_BASE, "hr"), POS_BASE)]);
  requiredByType.set("INVENTORY", [...sysRoot, ...routesUnder(join(POS_BASE, "inventory"), POS_BASE)]);
}
// CRM / MARKETING / COUPON: root overview (sys/[id]/page.tsx → "") + ทุกหน้าย่อยใต้ folder ของระบบ
// (batch 2 แตกฟังก์ชัน CRM+Marketing+Coupon — CRM แตกจริง 3 หน้า · Marketing/Coupon ฟังก์ชันเดียว = hub + 1 หน้า)
{
  const sysRoot = existsSync(join(POS_BASE, "page.tsx")) ? [""] : [];
  requiredByType.set("CRM", [...sysRoot, ...routesUnder(join(POS_BASE, "crm"), POS_BASE)]);
  requiredByType.set("MARKETING", [...sysRoot, ...routesUnder(join(POS_BASE, "marketing"), POS_BASE)]);
  requiredByType.set("COUPON", [...sysRoot, ...routesUnder(join(POS_BASE, "coupon"), POS_BASE)]);
}
// MEMBER / POINT / REWARD: root overview (sys/[id]/page.tsx → "") + ทุกหน้าย่อยใต้ folder ของระบบ
// (batch 3 แตกฟังก์ชัน สมาชิก+แต้ม+รางวัล — MEMBER แตกจริง 3 หน้า · POINT/REWARD อย่างละ 2 หน้า)
{
  const sysRoot = existsSync(join(POS_BASE, "page.tsx")) ? [""] : [];
  requiredByType.set("MEMBER", [...sysRoot, ...routesUnder(join(POS_BASE, "member"), POS_BASE)]);
  requiredByType.set("POINT", [...sysRoot, ...routesUnder(join(POS_BASE, "point"), POS_BASE)]);
  requiredByType.set("REWARD", [...sysRoot, ...routesUnder(join(POS_BASE, "reward"), POS_BASE)]);
}
// CHAT / MEETING / KANBAN: root overview (sys/[id]/page.tsx → "") + ทุกหน้าย่อยใต้ folder ของระบบ
// (batch 4 แตกฟังก์ชัน แชท+แชทภายใน+บอร์ดงาน — CHAT แตกจริง 2 หน้า (สนทนา /chat + เชื่อมช่องทาง)
//  · MEETING ฟังก์ชันเดียว = hub + 1 หน้า (/meeting) · KANBAN แตกจริง 2 หน้า (งานของฉัน + บอร์ด)
//  · หมายเหตุ: routesUnder ข้ามโฟลเดอร์ [param] อยู่แล้ว → kanban/[boardId] ไม่ถูกนับเป็น nav)
{
  const sysRoot = existsSync(join(POS_BASE, "page.tsx")) ? [""] : [];
  requiredByType.set("CHAT", [...sysRoot, ...routesUnder(join(POS_BASE, "chat"), POS_BASE)]);
  requiredByType.set("MEETING", [...sysRoot, ...routesUnder(join(POS_BASE, "meeting"), POS_BASE)]);
  requiredByType.set("KANBAN", [...sysRoot, ...routesUnder(join(POS_BASE, "kanban"), POS_BASE)]);
}

const incomplete: string[] = [];
for (const [type, required] of requiredByType) {
  const declared = declaredByType.get(type) ?? new Set<string>();
  const missing = required.filter((r) => !declared.has(r));
  if (missing.length > 0) {
    incomplete.push(`${type}: ขาด ${missing.map((m) => m || "(ภาพรวม)").join(", ")}`);
  }
}
chk(
  "S5",
  "accordion กางครบทุก sub-route จริง (completeness: hotel/restaurant/shop/queue/ticket/booking/POS/HR/INVENTORY/CRM/MARKETING/COUPON/MEMBER/POINT/REWARD/CHAT/MEETING/KANBAN)",
  incomplete.length === 0,
  `ไม่ครบ:\n     - ${incomplete.join("\n     - ")}`,
  "CRITICAL",
);

// ─── S6: KB (fixed-page accordion) — child href มีไฟล์จริง + กางครบทุก route ────
// KB ไม่ได้อยู่ใน childrenFor (เป็น fixed-page /app/kb) → อ่านจาก fixedPageChildrenFor แทน
// declared = href ที่ประกาศใน case "KB" · required = ทุก page.tsx ใต้ src/app/app/kb (ข้าม [param])
const KB_BASE = join(APP, "kb");
const fpStart = src.indexOf("function fixedPageChildrenFor");
const fpEnd = fpStart >= 0 ? src.indexOf("export default async function AppLayout", fpStart) : -1;
const fpBody = fpStart >= 0 && fpEnd > fpStart ? src.slice(fpStart, fpEnd) : "";
const kbCaseMatch = /case\s+"KB":([\s\S]*?)(?=case\s+"|default:)/.exec(fpBody);
const kbDeclared = new Set<string>();
if (kbCaseMatch) {
  const hrefRe = /href:\s*"([^"]+)"/g;
  let h: RegExpExecArray | null;
  while ((h = hrefRe.exec(kbCaseMatch[1])) !== null) kbDeclared.add(h[1]);
}
// required: ทุก page.tsx ใต้ kb (ข้าม [param]) → map เป็น absolute href /app/kb[/rest]
const kbRequired = routesUnder(KB_BASE, KB_BASE).map((rest) => "/app/kb" + rest);
const kbDead = [...kbDeclared].filter((href) => {
  const rel = href.replace(/^\/app\/kb/, "").replace(/^\//, "");
  return !existsSync(join(KB_BASE, rel, "page.tsx"));
});
const kbMissing = kbRequired.filter((r) => !kbDeclared.has(r));
chk(
  "S6",
  `KB accordion: child href มีไฟล์จริง + กางครบ (${kbDeclared.size} ประกาศ / ${kbRequired.length} route)`,
  kbDeclared.size > 0 && kbDead.length === 0 && kbMissing.length === 0,
  `dead=[${kbDead.join(",")}] ขาด=[${kbMissing.join(",")}]`,
  "MAJOR",
);

// ─── สรุป ─────────────────────────────────────────────────────────────────────
console.log("\n  ── completeness (route จริง vs accordion) ──");
for (const [type, required] of requiredByType) {
  const declared = declaredByType.get(type) ?? new Set<string>();
  const covered = required.filter((r) => declared.has(r)).length;
  console.log(`     ${type} · ${covered}/${required.length} route`);
}

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
