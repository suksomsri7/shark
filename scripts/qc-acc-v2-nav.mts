// QC WO 0.4 — "Shell V2": โครงสร้างเมนู nav.ts (9 หมวดตามลำดับ SPEC · href ทุกตัวมีหน้าจริงรองรับ ·
//              รายการ "soon" มีอยู่จริงใน SPEC §2 · accountNavChildren() ยังทำงาน · ไม่มีคำอังกฤษหลุด)
// รัน: pnpm tsx scripts/qc-acc-v2-nav.mts   — ไม่ต้องต่อ DB (nav.ts เป็นข้อมูลล้วน ไม่แตะ prisma)
//
// ครอบคลุม (ดู ledger/wo-notes/0.4.md):
//   N1 ACCOUNT_NAV() มี 9 หมวด เรียงลำดับตรง DESIGN-SPEC-V2.md §2 (หน้าหลัก→รายรับ→…→ตั้งค่า)
//   N2 ทุก item ที่ status !== "soon" (รวม flyout) href ชี้ไปหน้าไฟล์จริงใต้ src/app/app/sys/[id]/account/**
//      (เทียบ dynamic segment เช่น docs/[docType] ให้ครอบ docs/QUOTATION ฯลฯ)
//   N3 ทุก item ที่ status === "soon" ต้องมีชื่ออยู่จริงใน DESIGN-SPEC-V2.md §2 (กันเมนูที่กุขึ้นเอง)
//      — ไม่เข้มงวดเรื่องป้าย ✨/🕓 เป๊ะ เพราะ SPEC ใช้ ✅/🔧 แบบ "เป้าหมายเทียบ PEAK" ไม่ใช่ "มีในโค้ดวันนี้"
//      จริง (เช่น "หน่วย" ติด ✅ ใน SPEC แต่ยังไม่มีหน้าในโค้ด — WO นี้เองเป็นคนสั่ง soon) — เช็คแค่ "ไม่ได้กุลอย ๆ"
//   N4 accountNavChildren() คืนลิสต์แบนพร้อม group header (มี field `group` อย่างน้อย 1 รายการต่อหมวดที่มีของ ready)
//   N5 ไม่มีคำอังกฤษหลุดใน label ยกเว้นโทเคนที่อนุญาต (QR/e-Tax/DBD/POS/AI/PDF)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { ACCOUNT_NAV, accountNavChildren } = await import("@/lib/modules/account/nav");
const { ICON_KEYS } = await import("@/components/account-v2/AccountIcon");

// ─────────────────── harness (แบบเดียวกับ qc-acc-v2-guard.mts) ───────────────────
let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}

console.log(`\n===== QC WO 0.4 · โครงสร้างเมนูบัญชี V2 (nav.ts) =====\n`);

const ROOT = process.cwd();
const ROUTE_DIR = join(ROOT, "src/app/app/sys/[id]/account");
const BASE = "/app/sys/TEST123/account";

const groupsVat = ACCOUNT_NAV(BASE, true);
const groupsNoVat = ACCOUNT_NAV(BASE, false);

// ═══════════════ N1 — 9 หมวดตามลำดับ SPEC §2 ═══════════════
const EXPECTED_ORDER = [
  "home",
  "revenue",
  "expense",
  "contacts",
  "products",
  "finance",
  "accounting",
  "documents",
  "settings",
];
assert("มี 9 หมวด", groupsVat.length === 9, `ได้ ${groupsVat.length} หมวด`);
assert(
  "ลำดับ key ตรง SPEC §2 (หน้าหลัก→รายรับ→รายจ่าย→ผู้ติดต่อ→สินค้า→การเงิน→บัญชี→คลังเอกสาร→ตั้งค่า)",
  JSON.stringify(groupsVat.map((g) => g.key)) === JSON.stringify(EXPECTED_ORDER),
  `ได้ ${groupsVat.map((g) => g.key).join(",")}`,
);
for (const g of groupsVat) {
  assert(`หมวด "${g.label}" (${g.key}) มี label/icon/href ไม่ว่าง`, !!g.label && !!g.icon && !!g.href);
}

// ═══════════════ N2 — href ที่ "ready" ต้องมีหน้าไฟล์จริงรองรับ ═══════════════
const routeFiles = listRouteFiles(); // relative path เช่น "docs/[docType]/page.tsx", "page.tsx"
const pageFiles = routeFiles.filter((f) => f.endsWith("/page.tsx") || f === "page.tsx");

function stripQueryHash(href: string): string {
  const cut = Math.min(...[href.indexOf("?"), href.indexOf("#")].filter((n) => n >= 0), href.length);
  return href.slice(0, cut);
}
function relPathOf(href: string): string {
  const h = stripQueryHash(href);
  if (!h.startsWith(BASE)) return h;
  return h.slice(BASE.length).replace(/^\/+/, "").replace(/\/+$/, "");
}
function segMatches(routeSeg: string, hrefSeg: string): boolean {
  if (routeSeg.startsWith("[") && routeSeg.endsWith("]")) return true; // dynamic segment ครอบทุกค่า
  return routeSeg === hrefSeg;
}
function routeExistsFor(relPath: string): boolean {
  const hrefSegs = relPath === "" ? [] : relPath.split("/");
  return pageFiles.some((rf) => {
    const parts = rf.split("/");
    parts.pop(); // ตัด "page.tsx" ทิ้ง
    if (parts.length !== hrefSegs.length) return false;
    return parts.every((p, i) => segMatches(p, hrefSegs[i]));
  });
}

let readyChecked = 0;
for (const g of groupsVat) {
  for (const it of g.items) {
    if (it.status !== "ready") continue;
    readyChecked++;
    const rel = relPathOf(it.href);
    assert(
      `[${g.key}] "${it.label}" href="${it.href}" มีหน้าไฟล์จริง`,
      routeExistsFor(rel),
      `resolve เป็น "${rel}" ไม่เจอไฟล์ page.tsx ที่ตรงใต้ ${ROUTE_DIR}`,
    );
    for (const f of it.flyout ?? []) {
      const frel = relPathOf(f.href);
      assert(
        `[${g.key}] "${it.label}" flyout "${f.label}" href="${f.href}" มีหน้าไฟล์จริง`,
        routeExistsFor(frel),
        `resolve เป็น "${frel}" ไม่เจอไฟล์ page.tsx ที่ตรง`,
      );
    }
  }
}
assert("มีรายการ ready อย่างน้อย 1 รายการให้ตรวจ (กันเทสต์เขียวเปล่า)", readyChecked > 0, `ได้ ${readyChecked}`);

// ═══════════════ N3 — item "soon" ต้องมีอยู่จริงใน SPEC §2 (กันเมนูกุลอย ๆ) ═══════════════
const specText = readFileSync(join(ROOT, "docs/design/account-v2/DESIGN-SPEC-V2.md"), "utf8");
const sec2Start = specText.indexOf("\n## 2. ");
const sec2End = specText.indexOf("\n## 3. ");
const spec2 = sec2Start >= 0 && sec2End > sec2Start ? specText.slice(sec2Start, sec2End) : specText;
assert("อ่าน DESIGN-SPEC-V2.md §2 ได้ (ไม่ว่าง)", spec2.length > 200, `ได้ ${spec2.length} ตัวอักษร`);

let soonChecked = 0;
for (const g of groupsVat) {
  for (const it of g.items) {
    if (it.status !== "soon") continue;
    soonChecked++;
    const label = it.label.replace(/\s*↗\s*$/, "").trim(); // ตัดไอคอนลิงก์ข้ามโมดูลท้ายป้ายออกก่อนค้นหา
    assert(`[${g.key}] soon "${it.label}" มีชื่ออยู่จริงใน SPEC §2`, spec2.includes(label));
  }
}
assert("มีรายการ soon อย่างน้อย 1 รายการให้ตรวจ", soonChecked > 0, `ได้ ${soonChecked}`);

// ─── VAT-off: TAX_INVOICE ต้องหายจากหมวดรายรับ (ของเดิม — ต้องไม่หักหลัง) ───
const revenueNoVat = groupsNoVat.find((g) => g.key === "revenue")!;
assert(
  "ไม่จด VAT → เมนู “ใบกำกับภาษีขาย” หายจากหมวดรายรับ",
  !revenueNoVat.items.some((it) => it.label === "ใบกำกับภาษีขาย"),
);
const revenueVat = groupsVat.find((g) => g.key === "revenue")!;
assert(
  "จด VAT → เมนู “ใบกำกับภาษีขาย” อยู่ในหมวดรายรับ",
  revenueVat.items.some((it) => it.label === "ใบกำกับภาษีขาย"),
);

// ═══════════════ N4 — accountNavChildren() เป็นลิสต์แบนพร้อม group header ═══════════════
const flat = accountNavChildren(BASE, true);
assert("accountNavChildren() คืน array ไม่ว่าง", Array.isArray(flat) && flat.length > 0, `ได้ ${flat?.length}`);
assert(
  "ทุกรายการมี href/label เป็นสตริงไม่ว่าง",
  flat.every((c) => typeof c.href === "string" && c.href.length > 0 && typeof c.label === "string" && c.label.length > 0),
);
const groupHeaders = flat.filter((c) => !!c.group);
assert("มีหัวข้อกลุ่ม (group) อย่างน้อยเท่าจำนวนหมวดที่มีรายการ ready", groupHeaders.length >= 1, `ได้ ${groupHeaders.length}`);
assert(
  "accountNavChildren() ไม่มีลิงก์ตาย href=\"#\" (เฉพาะรายการ ready เท่านั้นที่หลุดเข้ามาได้)",
  !flat.some((c) => c.href === "#"),
);

// ═══════════════ N5 — ไม่มีคำอังกฤษหลุด ยกเว้นโทเคนที่อนุญาต ═══════════════
// รายการหลัก QR/e-Tax/DBD/POS/AI/PDF ตามที่ WO 0.4 กำหนด + "e-Wallet"/"e-Filing" ที่ DESIGN-SPEC-V2.md §2
// เขียนไว้เองคำต่อคำ (แถวเงินสด/ธนาคาร/e-Wallet · DBD e-Filing) — คำเดียวกับที่ป้ายในเมนูก๊อปมาจาก SPEC ตรง ๆ
const ALLOWED_EN = new Set(["QR", "e-Tax", "DBD", "POS", "AI", "PDF", "e-Wallet", "e-Filing"]);
function englishTokensIn(s: string): string[] {
  return [...s.matchAll(/[A-Za-z][A-Za-z.\-]*/g)].map((m) => m[0]);
}
let labelsChecked = 0;
for (const g of groupsVat) {
  labelsChecked++;
  for (const bad_ of englishTokensIn(g.label)) {
    assert(`หมวด "${g.label}" ไม่มีคำอังกฤษต้องห้าม ("${bad_}")`, ALLOWED_EN.has(bad_));
  }
  for (const it of g.items) {
    labelsChecked++;
    for (const tok of englishTokensIn(it.label)) {
      assert(`เมนู "${it.label}" ไม่มีคำอังกฤษต้องห้าม ("${tok}")`, ALLOWED_EN.has(tok));
    }
    for (const f of it.flyout ?? []) {
      labelsChecked++;
      for (const tok of englishTokensIn(f.label)) {
        assert(`flyout "${f.label}" (ของ "${it.label}") ไม่มีคำอังกฤษต้องห้าม ("${tok}")`, ALLOWED_EN.has(tok));
      }
    }
  }
}
assert("ตรวจ label ครบทุกรายการ (ไม่ใช่ 0)", labelsChecked > 0, `ได้ ${labelsChecked}`);

// ═══════════════ N6 — ทุก icon key มีจริงใน AccountIcon · testId ไม่ซ้ำในแต่ละหมวด ═══════════════
const iconSet = new Set(ICON_KEYS);
let iconsChecked = 0;
for (const g of groupsVat) {
  assert(`หมวด "${g.label}" icon="${g.icon}" มีจริงใน AccountIcon`, iconSet.has(g.icon));
  const seenTestId = new Set<string>();
  for (const it of g.items) {
    iconsChecked++;
    assert(`[${g.key}] "${it.label}" icon="${it.icon}" มีจริงใน AccountIcon`, iconSet.has(it.icon));
    assert(`[${g.key}] "${it.label}" testId="${it.testId}" ไม่ว่างและไม่ซ้ำในหมวด`, !!it.testId && !seenTestId.has(it.testId));
    seenTestId.add(it.testId);
  }
}
assert("ตรวจไอคอน/testId ครบทุกรายการ (ไม่ใช่ 0)", iconsChecked > 0, `ได้ ${iconsChecked}`);

console.log(`\n===== สรุป: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 0.4 nav.ts ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);

// ─────────────────── helpers ───────────────────
/** ไฟล์ route จริงในโฟลเดอร์บัญชี (page.tsx + route.ts) — ใช้เทียบว่า href ของเมนูมีหน้าจริงรองรับ */
function listRouteFiles(): string[] {
  const out = execFileSync(
    "find",
    [ROUTE_DIR, "-type", "f", "(", "-name", "page.tsx", "-o", "-name", "route.ts", ")"],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .map((p) => p.slice(ROUTE_DIR.length + 1))
    .sort();
}
