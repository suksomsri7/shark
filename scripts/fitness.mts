// Fitness functions — กันสถาปัตยกรรม/เอกสารเน่า เชิงกลไก (ไม่ใช่ด้วย prose)
// รัน: cd /root/projects/shark-in-th && pnpm exec tsx scripts/fitness.mts
// กติกา: เร็ว (<10s) · ไม่ต่อเน็ต · ไม่แตะ DB → ใช้เป็น pre-commit + CI gate ได้
//
// ทำไมต้องมี: repo นี้มีเอกสาร ~1.9MB ที่บรรยายระบบที่ไม่เคยถูกสร้าง —
//   `contracts.ts` = stub 0 importer · outbox/notify()/event bus ไม่มีจริง ·
//   `can()` ไม่เคยถูกเขียน · `CORE_API.md` ไม่มีไฟล์ · "14 ระบบ" ในหัวข้อ แต่ตารางมี 18
// ทุก claim ที่ *executable* เป็นจริง · ทุก claim ที่เป็น *prose* เชื่อไม่ได้
// → ไฟล์นี้เปลี่ยน claim ให้ executable ทีละข้อ
//
// สถานะ F1-F9 (ตามแผน AI Business OS §4.2):
//   F7 docs xref            ✅ ทำแล้ว (ไฟล์นี้)
//   F8 no db push drift     ✅ ทำแล้ว (ไฟล์นี้ — static; ตัวเต็มต้องต่อ DB อยู่ใน CI)
//   F2 no cross-module import   ✅ ทำแล้ว (baseline mode — ดู BASELINE ล่าง)
//   F5 no raw prisma in modules ✅ ทำแล้ว (baseline mode)
//   F1/F3/F4/F6/F9          🔜 ต้องรอ module manifest (Phase 1)

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// ─────────────────── โครง result (แบบเดียวกับ qc-account-cpa.mts) ───────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; detail: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, detail: string, sev: Sev = "MAJOR") {
  checks.push({ id, name, ok, detail, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${detail}`}`);
}

// ─────────────────── helpers ───────────────────
function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p);

// อ่านรายชื่อ model จาก schema — ใช้ทั้ง F1 และ F8
const schemaFiles = walk(join(ROOT, "prisma", "schema"), (p) => p.endsWith(".prisma"));
const models = new Set<string>();
for (const f of schemaFiles) {
  for (const m of readFileSync(f, "utf8").matchAll(/^model\s+(\w+)\s*\{/gm)) models.add(m[1]);
}


// ═══════════════════════════════════════════════════════════════
// F7 — ทุก path ที่อ้างใน docs ต้อง resolve ได้จริง
//   จับ: `CORE_API.md` (ไฟล์ไม่มีอยู่จริง แต่ _CONVENTIONS อ้างเป็น event registry)
// ═══════════════════════════════════════════════════════════════
console.log("\n── F7: docs xref — path ที่อ้างในเอกสารต้องมีจริง ──");

const docFiles = walk(join(ROOT, "docs"), (p) => p.endsWith(".md"));
const PATH_RE = /`([a-zA-Z0-9_@./-]+\.(?:ts|tsx|mts|md|prisma|json|css))`/g;

// ref ที่จงใจไม่ resolve (อธิบายเหตุผลทุกตัว — ห้ามใส่เพื่อให้เขียวเฉยๆ)
const XREF_IGNORE = new Set<string>([
  "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", // ไฟล์ root ทั่วไป อ้างลอยๆ
]);

// ─── XREF ratchet baseline ───
// ref ที่ "ตายอยู่แล้ว" ณ 2026-07-15 = ไฟล์ที่สเปคสัญญาไว้แต่ไม่เคยถูกสร้าง
// **ไม่ใช่การซ่อนปัญหา** — ตรึงไว้ให้เห็นชัด + กัน ref ตายใหม่เพิ่ม (ต้องลดลงเท่านั้น)
// ทุกตัวมี disposition: BUILD = ต้องสร้าง · RENAME = สเปคเรียกชื่อผิด · DROP = ลบ ref ทิ้ง
const XREF_BASELINE = new Map<string, string>([
  ["CORE_API.md",                       "DROP — event registry ที่ _CONVENTIONS/WORKPLAN อ้าง ไม่เคยมีไฟล์. Phase 1 จะ generate docs/05_CONTRACTS.md จาก manifest แทน"],
  ["PROGRESS.md",                       "RENAME — ของจริงคือ docs/progress/_HANDOFF.md"],
  ["docs/registry.md",                  "DROP — QC3 อ้าง registry ที่ไม่เคยมี"],
  ["lib/core/db/raw.ts",                "BUILD 🔜 — SECURITY.md/QC4 วางไว้ (raw SQL ที่ผูก tenant guard). Phase 1 kernel"],
  ["lib/core/net/safeFetch.ts",         "BUILD 🔜 — SECURITY.md [B] (SSRF guard)"],
  ["test/fixtures/isolation.ts",        "BUILD 🔜 — SECURITY.md tenant-isolation gate → จะมาเป็น qc persona 'attacker'"],
  ["lib/modules/pos/sale-service.ts",   "RENAME — ของจริงคือ lib/modules/pos/service.ts"],
  ["prisma/schema/backoffice.prisma",   "BUILD 🔜 — ระบบ backoffice (15-backoffice.md) ยังไม่เริ่ม"],
]);

// index ไฟล์จริงทั้ง repo ไว้ match แบบ suffix — เพราะเอกสารเขียน path ย่อเป็นปกติ
// (เช่น `account/layout.tsx` = src/app/app/sys/[id]/account/layout.tsx · `06-member.md` = docs/modules/06-member.md)
// เจตนา: ให้ resolve เหมือนที่ "คนอ่านแล้วหาไฟล์เจอ" → เหลือแต่ ref ที่ตายจริง
const allFiles = walk(ROOT, () => true).map(rel);

function resolves(doc: string, ref: string): boolean {
  const direct = [
    resolve(dirname(doc), ref),   // relative กับเอกสาร
    resolve(ROOT, ref),           // relative กับ repo root
    resolve(ROOT, "docs", ref),
    resolve(ROOT, "docs", "modules", ref),
    resolve(ROOT, "src", ref),
  ];
  if (direct.some(existsSync)) return true;
  // fallback: มีไฟล์จริงไหนลงท้ายด้วย ref นี้ไหม (path ย่อ)
  const needle = "/" + ref.replace(/^\.\//, "");
  return allFiles.some((f) => ("/" + f).endsWith(needle));
}

type Miss = { doc: string; ref: string };
const misses: Miss[] = [];
let refCount = 0;

for (const doc of docFiles) {
  const src = readFileSync(doc, "utf8");
  const seen = new Set<string>();
  for (const m of src.matchAll(PATH_RE)) {
    const ref = m[1];
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (XREF_IGNORE.has(ref)) continue;
    // resolve ได้เฉพาะ ref ที่บอกที่อยู่ (มี /) หรือเป็น .md (อ้างกันในโฟลเดอร์ docs)
    const isPathy = ref.includes("/");
    const isDoc = ref.endsWith(".md");
    if (!isPathy && !isDoc) continue; // เช่น `service.ts` เดี่ยวๆ = กำกวมเกินตัดสิน
    // path สัมบูรณ์ (/root/..., /tmp/...) = อยู่นอก repo ตรวจบน CI ไม่ได้ (เครื่องอื่นไม่มี)
    // — เจอจริง run #3: docs อ้าง /tmp/qc-*.mts ซึ่งกู้เข้า scripts/ แล้ว · ที่เหลือ (plan file
    // ใน /root/.claude) เป็น machine-local โดยเจตนา → ข้าม ไม่ใช่ผ่าน (ระวังอย่าอ้าง /tmp เพิ่ม)
    if (ref.startsWith("/")) continue;
    refCount++;
    if (!resolves(doc, ref)) misses.push({ doc: rel(doc), ref });
  }
}
const newMisses = misses.filter((m) => !XREF_BASELINE.has(m.ref));
const healed = [...XREF_BASELINE.keys()].filter((ref) => !misses.some((m) => m.ref === ref));

chk(
  "F7.1",
  `ไม่มี ref ตายใหม่ในเอกสาร (ตรวจ ${refCount} ref ใน ${docFiles.length} ไฟล์ · หนี้เดิม ${XREF_BASELINE.size})`,
  newMisses.length === 0,
  newMisses.length
    ? `${newMisses.length} ref ตายใหม่ (ไม่อยู่ใน baseline):\n` +
      newMisses.map((m) => `        ${m.doc} → \`${m.ref}\``).join("\n")
    : `ไม่มีใหม่ · หนี้เดิมเหลือ ${XREF_BASELINE.size - healed.length}/${XREF_BASELINE.size}`,
  "MAJOR",
);
// ratchet: baseline ต้องหดลงเท่านั้น — ซ่อมแล้วต้องถอดออกจาก baseline ทันที ไม่งั้นมันจะกลับมาเน่าเงียบ ๆ
chk(
  "F7.2",
  "XREF_BASELINE ไม่มีรายการที่ซ่อมแล้ว (ratchet)",
  healed.length === 0,
  healed.length ? `ซ่อมแล้ว ${healed.length} ตัว — ถอดออกจาก XREF_BASELINE ใน fitness.mts: ${healed.join(", ")}` : "ตรง",
  "MINOR",
);

// ═══════════════════════════════════════════════════════════════
// F1 — ทุก model ใน schema ต้องลงทะเบียน scope (fail-closed)
//   จับ: ลืม register model ใหม่ → เดิม `?? "global"` = ปิด tenant isolation เงียบ ๆ
//   ตอนนี้ scopeOf() โยนตอน runtime — F1 ทำให้แดงตั้งแต่ PR แทนที่จะไปแดงบน prod
// ═══════════════════════════════════════════════════════════════
console.log("\n── F1: ทุก model ลงทะเบียน scope (fail-closed) ──");
{
  const schemaModelNames = [...models];
  const scopeSrc = readFileSync(join(ROOT, "src", "lib", "core", "scope.ts"), "utf8");
  // อ่านชื่อ model ที่ลงทะเบียน จากบล็อก CORE_SCOPES/MODULE_SCOPES (key: descriptor)
  const registered = new Set(
    [...scopeSrc.matchAll(/^\s{2}(\w+):\s*(?:g\(|tenant|unit|sys\(|\{)/gm)].map((m) => m[1]),
  );
  const missing = schemaModelNames.filter((m) => !registered.has(m));
  const extra = [...registered].filter((m) => !schemaModelNames.includes(m));
  chk(
    "F1.1",
    `ทุก model (${schemaModelNames.length}) ลงทะเบียนใน scope.ts`,
    missing.length === 0,
    missing.length ? `${missing.length} ตัวยังไม่ลงทะเบียน → query จะโยนตอน runtime: ${missing.join(", ")}` : "ครบ",
    "CRITICAL",
  );
  chk(
    "F1.2",
    "ไม่มี model ในทะเบียนที่ไม่มีใน schema แล้ว",
    extra.length === 0,
    extra.length ? `ตกค้าง: ${extra.join(", ")} — ลบออกจาก scope.ts` : "ตรง",
    "MINOR",
  );
  // ⚠️ ต้องตัดคอมเมนต์ก่อนเช็ค — ไม่งั้นไป match คอมเมนต์ที่อธิบายบั๊กเก่าเอง (เจอจริง 2026-07-16)
  const code = scopeSrc
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
  chk(
    "F1.3",
    'scopeOf fail-closed (ไม่มี `?? "global"` ในโค้ดจริง)',
    !/\?\?\s*"global"/.test(code),
    'เจอ `?? "global"` ในโค้ด = ลืม register แล้วเงียบ → ต้องโยนแทน',
    "CRITICAL",
  );
  chk(
    "F1.4",
    "scopeOf โยนเมื่อไม่รู้จัก model",
    /throw new Error\(/.test(code.split("export function scopeOf")[1]?.split("export ")[0] ?? ""),
    "scopeOf ต้อง throw ไม่ใช่ return ค่า default",
    "CRITICAL",
  );
}

// ═══════════════════════════════════════════════════════════════
// F8 — ห้าม db push drift: ทุก model ใน schema ต้องอยู่ใน migration
//   จับ: 81/94 models ไม่มี migration (ต้นเหตุ: เชื่อผิดว่า migrate dev interactive)
//   (ตัวเต็ม = `prisma migrate diff --from-config-datasource --to-schema --exit-code` ใน CI)
// ═══════════════════════════════════════════════════════════════
console.log("\n── F8: migration ครอบทุก model (กัน `db push` drift) ──");

const migSql = walk(join(ROOT, "prisma", "migrations"), (p) => p.endsWith(".sql"))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
const unmigrated = [...models].filter((m) => !migSql.includes(`"${m}"`));
chk(
  "F8.1",
  `ทุก model (${models.size}) มีใน migration`,
  unmigrated.length === 0,
  unmigrated.length ? `${unmigrated.length} model ไม่มี migration: ${unmigrated.slice(0, 8).join(", ")}${unmigrated.length > 8 ? "…" : ""}` : "ครบ",
  "CRITICAL",
);

// ═══════════════════════════════════════════════════════════════
// F2 — โมดูลห้าม import ข้ามโมดูล (ยกเว้นผ่าน facade index.ts)
// F5 — โมดูลห้าม import raw `prisma` (ต้องใช้ tenantDb/db ที่ผูก scope แล้ว)
//
// BASELINE MODE: วันนี้ละเมิดอยู่จริง (F2: 10 เส้น · F5: 30 ไฟล์) — จะหมดไปตอน port (Phase 3)
// กติกา: **ห้ามเพิ่ม** — ตัวเลขต้องลดลงเท่านั้น (ratchet) · เพิ่มเมื่อไหร่ CI แดงทันที
// ═══════════════════════════════════════════════════════════════
console.log("\n── F2/F5: ขอบเขตโมดูล (baseline ratchet — ห้ามเพิ่ม) ──");

const BASELINE = { f5RawPrisma: 45 }; // 34 (2026-07-15)+approval(tx+outbox) +inventory(sweep ข้ามร้าน) +shop(resolveUnit จาก slug) +forms(getPublicForm จาก token) +account/period-sweep(ปิดงวดข้ามร้าน WO-0039) +inventory/procurement(vendor portalToken resolve ก่อนรู้ tenant WO-0059) +pos/register(catalog/member reads ข้ามระบบ WO-Wave1-B) +school/rental/clinic(refund: lookup posSale ด้วย idempotencyKey กรอง tenantId ตรง — Wave2-E/F/G · oracle cross-tenant เขียว) +chat/retention(PDPA sweep ข้ามร้าน WO-C12 — ไล่ทุก ChatSetting ก่อนรู้ tenant เหมือน inventory sweep · where ผูก tenantId+systemId ทุกตัว · oracle qc-chat-retention RT-3.2 เขียว) — ทุกตัวจงใจ · ratchet ลงได้อย่างเดียว

const moduleDir = join(ROOT, "src", "lib", "modules");
const moduleNames = existsSync(moduleDir)
  ? readdirSync(moduleDir).filter((d) => statSync(join(moduleDir, d)).isDirectory())
  : [];
const moduleFiles = walk(moduleDir, (p) => p.endsWith(".ts") || p.endsWith(".tsx"));

// F2: import ข้ามโมดูล — allowlist รายเส้น (แข็งกว่านับจำนวน: เส้นใหม่สลับแทนเส้นเก่าไม่ได้)
// เส้นที่อนุญาต = 10 เส้นเดิม (หนี้จะหมดตอน port Phase 3) + chokepoint ที่สถาปนิกอนุมัติ
const ALLOWED_EDGES = new Set([
  // chokepoint (K2.9 · ledger/KANBAN-RUN.md ท้าย §K3.2 "เส้น import ข้ามโมดูลที่ Fable อนุมัติ"):
  // การกระทำ `open_approval` ของกฎอัตโนมัติบอร์ดงาน ยื่นคำขอผ่าน `approval.submitForApproval`
  // แล้วเขียนความเห็นผูกกลับมาที่การ์ด · ทิศทางเดียว (approval ไม่รู้จัก kanban)
  "kanban→approval",
  // chokepoint (K3.2 · ledger/KANBAN-RUN.md ท้าย §K3.2 "เส้น import ข้ามโมดูลที่ Fable อนุมัติ"):
  // ปุ่ม "สร้างงาน" ในหัวห้องแชท → บอร์ดงาน ผ่าน facade `kanban/links.createCardFromExternal`
  // + ทะเบียนสวิตช์ `kanban/integrations` เท่านั้น · ทิศทางเดียว (บอร์ดงานไม่รู้จักแชท — F2 ยังเฝ้าอยู่)
  "chat→kanban",
  // หนี้เดิม (วัด 2026-07-15) — ratchet: ลบได้ ห้ามเพิ่มกลับ
  "booking→member", "booking→system", "chat→member",
  "booking→pos", // chokepoint (WO-Wave3-A): มัดจำ booking ปิดเงินผ่าน pos.createSale DEPOSIT (C-2)
  "pos→member", "pos→point", "pos→system",
  "restaurant→member", "restaurant→pos", "restaurant→system",
  "reward→point",
  // chokepoint ที่อนุมัติ (BLUEPRINT_CONNECTIONS §3.2): เงินทุกบาทผ่าน POS → Account
  // — อนุมัติโดย Fable 2026-07-16 สำหรับ WO-0002 (contract 2.4) · import ได้เฉพาะ account/index
  "pos→account",
  // chokepoint ที่อนุมัติ (contract 2.3): POS ใช้คูปองตอนขายจริง (validate/redeem/release)
  // — WO-0003 · POS เป็นจุดตัดเงินเดียวที่เรียก coupon.redeem ใน tx ของบิล
  "pos→coupon",
  // chokepoint (2.1): business systems ปิดเงินผ่าน POS → บัญชีอัตโนมัติ (M1 downstream)
  // — Fable อนุมัติล่วงหน้า WO-0007/0008 (restaurant→pos มีอยู่แล้วด้านบน)
  "ticket→pos",
  // chokepoint (WO-0036): payroll ลงบัญชีเงินเดือนผ่าน account facade (postPayrollJV)
  // — Fable อนุมัติ 2026-07-17 (NIGHT RUN) · import ได้เฉพาะ account/index
  "hr→account",
  // chokepoint (WO Inventory→Account): perpetual inventory — ทุก movement (รับซื้อ/ตัดขาย/คืน)
  // โพสต์ต้นทุนสต็อกอัตโนมัติผ่าน account facade (postInventoryGl) · import ได้เฉพาะ account/index
  // — account-bridge.ts (mirror pos/account-bridge) resolve ระบบ ACCOUNT แล้วเลือก Dr/Cr ตามชนิด movement
  "inventory→account",
  "ticket→system",  // resolve POS/POINT ที่ผูก unit (เหมือน restaurant→system, booking→system)
  "hotel→pos",
  "hotel→system",
  // chokepoint (2.4 ฝั่งเอกสาร): CRM ออกใบเสนอราคาผ่าน account facade (WO-0010)
  "crm→account",
  // marketing อ่าน segment ลูกค้าจาก member (WO-0013)
  "marketing→member",
  // chokepoint (WO-0053): E-commerce ปิดเงินผ่าน pos.createSale (C-2) + ตัดสต็อกผ่าน inventory facade
  // — Fable อนุมัติ 2026-07-17 (RUN 2)
  "shop→pos",
  "shop→inventory",
  // chokepoint (WO-Wave1-B): หน้าขาย POS อ่านสินค้าในคลังมาเป็น catalog (เหมือน shop→inventory)
  "pos→inventory",
  "shop→system",  // resolve ระบบ POS/INVENTORY ที่ผูก unit (เหมือน restaurant→system)
  // chokepoint (WO-0054): ฟอร์มส่ง lead เข้า CRM ผ่าน crm facade + resolve ระบบ CRM
  "forms→crm",
  "forms→system",
  // chokepoint (WO-0050): Rental ปิดเงินตอนคืนผ่าน pos.createSale (C-2) + resolve ระบบ POS
  "rental→pos",
  "rental→system",
  // chokepoint (WO-0051): School เก็บค่าเรียนผ่าน pos.createSale (C-2) + resolve ระบบ POS/MEMBER
  "school→pos",
  "school→system",
  "school→member",
  // chokepoint (WO-0060): Delivery ผูก shipment กับ ShopOrder (อ่านสถานะ order ผ่าน shop facade)
  "delivery→shop",
  // chokepoint (WO-0052): Clinic เก็บเงิน→pos + จ่ายยา→inventory + resolve ระบบ + ผูกสมาชิก
  "clinic→pos",
  "clinic→inventory",
  "clinic→system",
  "clinic→member",
  // chokepoint (WO-0049b): PO/ใบลา เข้าสายอนุมัติผ่าน approval facade
  "inventory→approval",
  "hr→approval",
  // contract C-2 (13 ส.ค. 2026): availability = ของ HR — ระบบจองถาม hr.employeesOnLeave
  // ลาอนุมัติแล้ว → ช่องจองของช่างคนนั้นปิดเอง · ห้าม copy สูตรวันลาไปไว้ในโมดูลจอง
  "booking→hr",
  // contract (13 ส.ค. 2026 · ข้อ 12-15): บริการมีต้นฉบับเดียวในแคตตาล็อกกลาง (InvItem kind=SERVICE)
  // ระบบจองอ่านบริการจาก inventory + สร้าง projection ต่อสาขา · ห้ามสร้าง/แก้บริการเองอีก
  "booking→inventory",
  // chokepoint (WO-Wave4-D): สมัครสมาชิกเก็บค่าสมาชิกผ่าน pos.createSale (C-2) → ลงบัญชีอัตโนมัติ
  // + resolve ระบบ POS/POINT ที่ผูก unit เดียวกับระบบ MEMBER (เหมือน school→pos/system)
  "member→pos",
  "member→system",
  // chokepoint (WO 3.1 — Party): ตัวตนกลางระดับ tenant · ผู้ผลิตทุกตัวเรียกผ่าน facade `party/index.ts`
  // เท่านั้น (findOrCreate/safeFindOrCreate) — Fable อนุมัติล่วงหน้าตามใบสั่งงาน (INTEGRATION-MAP §F.1/§F.7)
  "account→party",
  "member→party", // findOrCreate = ทางเข้าเดียวกับที่ chat.maybeAutoLinkMember เรียกอยู่แล้ว (ไม่แตะ chat/**)
  "crm→party",
  "hr→party", // จาก name/phone/email เท่านั้น — ห้ามส่ง nationalId/PDPA อื่นเข้า party
  "inventory→party", // Supplier (procurement.ts)
  // chokepoint (WO 3.2 — หน้าผู้ติดต่อ V2): ป้าย "สมาชิก"/"CRM" (badges ที่มา §7.1) มาจาก Customer/CrmContact
  // ที่ partyId เดียวกัน — อ่านอย่างเดียว (listPartyIdsWithCustomer/listPartyIdsWithContact) อนุมัติล่วงหน้า
  // ตามใบสั่งงาน WO 3.2 ข้อ A ("Customer / CrmContact / ChatContact rows … read-only queries")
  "account→member",
  "account→crm",
  // chokepoint (WO 4.1 — InvItem canonical · MAP §F.8–12): แคตตาล็อกกลาง = InvItem
  //   บัญชี → คลัง: อ่านสต็อกจริง + ตัด/คืนใบเบิกผ่าน inventory.consumeInTx/receiveInTx (ทางเดียวที่แตะสต็อกได้)
  //   คลัง → บัญชี: syncItemToAccountProduct ผ่าน account/index (เส้น inventory→account เดิม)
  //   — Fable อนุมัติล่วงหน้าตามใบสั่งงาน WO 4.1
  "account→inventory",
  // chokepoint (WO 8.3 — เพดานอนุมัติ §9.4): เกินเพดาน = ยื่นเข้า "สายอนุมัติ" กลางของแพลตฟอร์ม
  //   (approval/service.submitForApproval) แทนการปฏิเสธเฉย ๆ ⇒ คนที่มีเพดานสูงกว่ามากดต่อได้
  //   ทิศเดียว account→approval · ผลกลับเข้าเอกสารเกิดที่ composition root (approval-effects.ts)
  "account→approval",
  // chokepoint (K2.2 — มุมมองปฏิทินของบอร์ดงาน): `listBoardCalendar` ผสมงานอ่านอย่างเดียวจากปฏิทินกลาง
  //   ของร้าน (`calendar/service.getCalendarEvents` — ใบลา/นัดหมาย/เข้าพัก) เมื่อสวิตช์ "แสดงงานจากระบบอื่น"
  //   เปิดอยู่ · ทิศเดียว kanban→calendar (อ่านอย่างเดียว ไม่มี write path กลับ)
  //   — Fable อนุมัติล่วงหน้า (ledger/KANBAN-RUN.md §K2.2 กล่อง "เส้น import ข้ามโมดูลที่ Fable อนุมัติ")
  "kanban→calendar",
  // chokepoint (K3.1 — เชื่อมข้อมูล SHARK): ตัวแปลผลชนิด `PARTY` ของ `KanbanCardLink` อ่าน/ค้นชื่อ
  //   ผู้ติดต่อผ่าน facade `party/index.ts` เท่านั้น (`listBriefsByIds` / `searchByName` — คืนแค่ id+ชื่อ)
  //   ⇒ ห้ามแตะตาราง `Party` ตรงตามพิมพ์เขียว §9.1 · ทิศเดียว kanban→party (party ไม่รู้จัก kanban)
  //   — Fable อนุมัติล่วงหน้า (ledger/KANBAN-RUN.md ท้าย §K3.2 กล่อง "เส้น import ข้ามโมดูลที่ Fable อนุมัติ")
  "kanban→party",
  // chokepoint (CRM C1.7 — ผู้คุมงาน RUN CRM v2 อนุมัติ): ตัวแปลผลลิงก์ DEAL/COMPANY/CRM_CONTACT/CUSTOM_RECORD ของบอร์ดงาน
  //   ถาม facade `crm` (visibility.visibleIdsForViewer · import แบบ lazy) ว่าผู้ดูมองเห็นเรคคอร์ดนั้นไหม — ซ่อนชื่อ/ลิงก์เมื่อมองไม่เห็น
  //   (ไม่มีทางอื่น: บอร์ดงานต้องไม่รู้กติกา OWN/TEAM/ALL ของ CRM เอง) · เส้นนี้ทำให้ crm↔kanban เป็น **สองทาง** ผ่าน facade ทั้งคู่
  //   (crm→kanban: activities.ts เรียก facade บอร์ดงานเปิดการ์ด · kanban→crm: ตัวแปลผลลิงก์) — import แบบ lazy ทั้งสองฝั่งกันวงโหลด (TDZ)
  "kanban→crm",
  // chokepoint (M1.4 — ระบบสมาชิก v2 · ledger/MEMBER-RUN.md §2 M1.4):
  //   member→approval : "รวมสมาชิกซ้ำ" ของผู้จัดการต้องผ่านสายอนุมัติกลาง (submitForApproval)
  //                     ทิศเดียว · ผลกลับเข้าโมดูลสมาชิกเกิดที่ composition root (approval-effects.ts)
  //   member→point    : หน้า 360 อ่านแต้มคงเหลือ + ตอนรวมคนต้องโอนแต้มเป็นรายการ MERGE สองฝั่ง
  //                     ผ่าน facade `point/index.ts` เท่านั้น (สร้างที่ใบนี้)
  "member→approval",
  "member→point",
  // chokepoint (M2.x — ระบบสมาชิก v2 Loyalty · ledger/MEMBER-RUN.md §2 M2.1–M2.5 · Fable อนุมัติล่วงหน้า 10 ก.ย. 2569):
  //   point→member    : กฎแต้ม (TIER_MULTIPLIER/NO_POINT_EXPIRY) อ่านระดับ+สิทธิ์ผ่าน facade member (benefitsFor)
  //   point→approval  : ปรับแต้มมือเกินเพดาน → สายอนุมัติกลาง (M2.2) · ผลกลับที่ approval-effects.ts
  //   stamp→member / stamp→point / stamp→voucher : สแตมป์ตรวจ tier/unit ผ่าน member · ครบ → แต้ม (earnWithLot) / voucher (issue origin STAMP)
  //   member→stamp    : รวมคน (mergeMembers) โอนใบสแตมป์ผ่าน facade stamp.mergeProgress
  //   reward→stamp / reward→member : แลกด้วยสแตมป์ (useStamps) · ตรวจระดับ/สาขา · brief สมาชิกในผลสแกน
  //   voucher→member / voucher→approval : ตรวจระดับ/สาขา/brief · ออกเกินเพดาน → สายอนุมัติกลาง (M2.5)
  //   ทิศเดียวทุกเส้น · hook ย้อนกลับ (tier→voucher ต้อนรับ) ลงทะเบียนที่ composition root src/lib/member-hooks.ts
  "point→member",
  "point→approval",
  "stamp→member",
  "stamp→point",
  "stamp→voucher",
  "member→stamp",
  "reward→stamp",
  "reward→member",
  "voucher→member",
  "voucher→approval",
  //   giftcard→pos / giftcard→account / giftcard→member (M2.6): ขาย/เติมบัตร = PosSale (pos.createSale) · ผูกบัญชี (D3) ผ่าน facade account
  //   (postGiftCardSale/Use/Expire + reverseFor) · ตรวจสมาชิกผู้รับ/โอนผ่าน member
  "giftcard→pos",
  "giftcard→account",
  "giftcard→member",
  //   member→voucher / member→giftcard / member→reward / member→coupon (M2.7 wallet facade): getWallet/quoteApply/applyOnSale รวมทุกสิทธิ์
  //   ผ่าน facade ของแต่ละโมดูล (index.ts) — วงจร voucher↔member ยอมรับได้เพราะทั้งสองฝั่งแตะกันผ่าน facade เท่านั้น
  "member→voucher",
  "member→giftcard",
  "member→reward",
  "member→coupon",
  //   marketing→voucher / marketing→coupon / marketing→chat (M3.2 แคมเปญ v2): แนบ voucher/คูปองรายคน · ส่ง LINE ผ่าน chat facade pushToContact
  //   (marketing→member มีอยู่แล้ว · segments ผ่าน facade member)
  "marketing→voucher",
  "marketing→coupon",
  "marketing→chat",
  //   member→kanban (M3.4 รีวิวคะแนนต่ำ → การ์ดบอร์ดงานผ่าน facade links.createCardFromExternal · M3.7 ไทม์ไลน์อ่านการ์ดที่ผูก PARTY ผ่าน listCardsForTarget)
  //   ORACLE-EDIT F2.1: เพิ่มเส้นนี้ + ให้ F2 นับ dynamic import() ด้วย (เดิมจับแค่ `from` → reviews.ts ใช้ import() หลบการตรวจได้)
  "member→kanban",
  //   member→account (M3.7 ไทม์ไลน์อ่านเอกสารบัญชีของ party ผ่าน facade listDocsByParty — ข้อสอบ M3.7 S4.2 คาดเส้นนี้) · ORACLE-EDIT F2.1
  "member→account",
  // ═══ CRM v2 ▸ ใบ C0.3 (facade ที่ CRM ต้องใช้ในโมดูลอื่น) ═══
  //   Fable/ผู้คุมงานอนุมัติล่วงหน้าตาม CRM-MASTER-PLAN §9 + ใบ C0.3 · **ทิศเดียวทุกเส้น** และ
  //   import ได้เฉพาะ `index.ts` ของปลายทางเท่านั้น (F2.2 ยังเฝ้าฝั่ง account อยู่)
  //   เส้น `crm→account` / `crm→party` มีอยู่แล้วด้านบน (WO-0010 / WO 3.1)
  //   crm→chat      : ส่ง LINE หาผู้ติดต่อ + รายการห้องแชทของบริษัทในหน้า 360 (sendLineToParty / listConversationsByParty)
  //   crm→hr        : คอมมิชชันของพนักงานขาย → HrPayAdjustment · เช็ค "ลาอยู่ไหม" ก่อนแจกลูกค้าใหม่ (C2.3/C3.3)
  //   crm→inventory : บรรทัดดีลเลือกสินค้า/บริการจากแคตตาล็อกกลาง InvItem (C1.5)
  //   crm→approval  : ส่วนลด/คอมมิชชัน/โอนงาน/คำขอพอร์ทัล เกินเพดาน → สายอนุมัติกลาง (ผลกลับที่ approval-effects.ts)
  //   crm→member    : ผู้ติดต่อที่เป็นสมาชิก (สิทธิ์/แต้ม/ความยินยอม) ผ่าน facade member เท่านั้น (C1.4)
  //   crm→kanban    : งานของดีล/กิจกรรม → การ์ดบอร์ดงาน ผ่าน links.createCardFromExternal (เส้นเดียวกับ member→kanban)
  //   crm→forms     : ฟอร์มเว็บ → lead (ทิศหลักคือ forms→crm ที่มีอยู่แล้ว · ขานี้ใช้ตอน CRM อ่านนิยามฟอร์ม C2.6)
  //   (ไม่มี `crm→storage` / `crm→ai` เพราะไม่มีโมดูลชื่อนั้นใน src/lib/modules — ของกลางพวกนั้นอยู่ที่ `src/lib/*`)
  "crm→chat",
  "crm→hr",
  "crm→inventory",
  "crm→approval",
  "crm→member",
  "crm→kanban",
  "crm→forms",
  // CRM C1.11 ▸ chat→crm : แผงข้าง "CRM" ในห้องแชท (`chat/crm-panel-actions.ts`) อ่านการ์ดย่อผ่าน `crm.briefFor` (การมองเห็นของ CRM) ·
  //   ปุ่มสร้าง lead/บันทึกกิจกรรมผ่าน `crm.contacts.leadFromBridge` / `crm.activities.logActivity` — facade index เท่านั้น (F2.3)
  "chat→crm",
  // ◂ CRM C1.11
  // CRM C1.1 ▸ partyId ทุกระบบ (C11 · พิมพ์เขียว 20-crm-v2 §4.1): จุดสร้างแถวธุรกรรม 9 จุดเรียก `party.safeFindOrCreate`
  //   ด้วยชื่อ/เบอร์/อีเมลที่แถวมีอยู่แล้ว (นอก transaction ธุรกิจ · ไม่มีวัน throw) — ทิศเดียว <โมดูล>→party
  "booking→party", // Appointment (ชื่อ+เบอร์ลูกค้า)
  "shop→party", // ShopOrder (ชื่อ+เบอร์ผู้สั่ง)
  "rental→party", // RentalBooking (ชื่อ+เบอร์ผู้เช่า)
  "queue→party", // QueueTicket (ชื่อ/เบอร์/อีเมลที่กรอก — ไม่กรอกเบอร์ = ไม่ผูก)
  "clinic→party", // PatientRecord + ClinicVisit (Party ของคนไข้)
  "ticket→party", // TicketOrder (ชื่อ+เบอร์ผู้ซื้อ)
  "school→party", // SchoolEnrollment (ชื่อ+เบอร์ผู้เรียน)
  "hotel→party", // HotelReservation (ชื่อ+เบอร์/อีเมลผู้เข้าพัก)
  // ◂ CRM C1.1
  // CRM C2.4 ▸ ปฏิทิน CRM รวม "นัดของ Party เดียวกัน" จากสามโมดูลธุรกิจ (พิมพ์เขียว §3.8 · มติผู้คุมงาน C2.4 ข้อ 8)
  //   crm→booking : `booking/index.appointmentsByParty` — Appointment ที่ไม่ถูกยกเลิก (ชื่อบริการ + เวลา)
  //   crm→clinic  : `clinic/index.appointmentsByParty`  — ClinicVisit (เวลา + สถานะเท่านั้น · **ไม่มี**อาการ/การวินิจฉัย/ค่ารักษา)
  //   crm→school  : `school/index.appointmentsByParty`  — SchoolEnrollment ENROLLED|PAID ที่วันเริ่มของรอบเรียน
  //   🔴 ทิศเดียวและ **อ่านอย่างเดียว**: facade ทั้งสามใบไม่มีคำสั่งเขียนเลย (ข้อสอบ C2.4-S4.3 เทียบแถวก่อน/หลัง) ·
  //      CRM โหลดแบบ lazy import ตอนใช้ (booking/service → pos → account → … → crm facade = วงโหลดถ้า import หัวไฟล์)
  "crm→booking",
  "crm→clinic",
  "crm→school",
  // ◂ CRM C2.4
]);
const crossEdges = new Set<string>();
for (const f of moduleFiles) {
  const self = relative(moduleDir, f).split("/")[0];
  for (const m of readFileSync(f, "utf8").matchAll(/(?:from\s+|import\(\s*)["']@\/lib\/modules\/([a-z-]+)/g)) {
    if (m[1] !== self) crossEdges.add(`${self}→${m[1]}`);
  }
}
const illegalEdges = [...crossEdges].filter((e) => !ALLOWED_EDGES.has(e));
chk(
  "F2.1",
  `import ข้ามโมดูลอยู่ใน allowlist (${crossEdges.size} เส้น / อนุญาต ${ALLOWED_EDGES.size})`,
  illegalEdges.length === 0,
  illegalEdges.length ? `เส้นเถื่อน: ${illegalEdges.sort().join(" · ")}` : "ครบ",
  "MAJOR",
);
// chokepoint discipline: pos→account ต้อง import ผ่าน facade index เท่านั้น (ห้ามล้วง service/gl ตรง)
const deepAccountImports = moduleFiles
  .filter((f) => relative(moduleDir, f).split("/")[0] !== "account")
  .filter((f) => /from\s+["']@\/lib\/modules\/account\/(?!index)/.test(readFileSync(f, "utf8")));
chk(
  "F2.2",
  "โมดูลอื่นแตะ account ได้เฉพาะผ่าน account/index (facade)",
  deepAccountImports.length === 0,
  deepAccountImports.length ? `ล้วงลึก: ${deepAccountImports.map(rel).join(", ")}` : "ครบ",
  "MAJOR",
);

// ═══ F2.3 (ใบ CRM v2 C0.2) — โค้ดนอกโมดูล CRM แตะ crm ได้เฉพาะทางเข้าที่ประกาศไว้ ═══
// ทางเข้าที่ถูกต้องมี 2 ทาง (มติผู้คุมงาน C0.2 addendum 3):
//   • `@/lib/modules/crm`      = facade ฝั่งเซิร์ฟเวอร์ (index.ts)
//   • `@/lib/modules/crm/ui`   = ทางเข้าคอมโพเนนต์ — **ไม่ใช่การล้วงลึก**: `src/app/app/sys/[id]/page.tsx`
//     import Hub ของทุกโมดูลจาก `<module>/ui` อยู่แล้ว 10 ตัว (coupon · meeting · kanban · chat · inventory ·
//     hr · marketing · member · point · reward) — CRM เดินตามพี่น้องสิบตัวนี้ ห้าม "แก้" กลับเป็นข้อยกเว้นรายไฟล์
//     🔴 เหตุผลทางเทคนิคด้วย: ถ้าลาก ./ui เข้า index.ts ทุกคนที่ import facade จะได้ ui.tsx → @/lib/core/context
//        → @/lib/env ติดมาในกราฟ ⇒ ทะเบียน AI (F10) / บัญชี (F13) ระเบิดในโหมดไร้ env (ด่าน D5 · pre-commit)
// สิ่งที่ห้าม = ของภายในโมดูล: service · rules · actions และไฟล์ภายในอื่นที่จะมาทีหลัง (settings · where · nav …)
// รูปเดียวกับ F2.2 ของบัญชี (กรองรายชื่อไฟล์ → กันโมดูลตัวเอง → matcher → บอกไฟล์ที่ผิด) ต่างกันข้อเดียว:
// **กวาดทั้ง `src/`** ไม่ใช่แค่ moduleFiles เพราะผู้เรียก CRM รายหนึ่งอยู่นอก src/lib/modules (`src/lib/ai/proposals.ts`)
//
// ยกเว้น 2 โฟลเดอร์ ซึ่งคือ "ตัวโมดูล CRM เอง" ไม่ใช่โมดูลอื่น — ดูค่าคงที่ CRM_SELF_DIRS ด้านล่าง:
//   (ก) ไฟล์ของโมดูลเอง (facade ต้อง import ./service ของตัวเอง)  (ข) route ของ CRM ที่ Next บังคับให้อยู่ใต้ src/app
// 🔴 **จงใจไม่ยกเว้น** route ของ CRM ที่ชื่อโฟลเดอร์ไม่ได้สะกดว่า crm ตามมติ RESOLUTIONS R-C.5/R-C.7 —
//    `src/app/b/[slug]/**` (portal) · `/u/[token]` (เลิกรับข่าว) · `/t/*` (ติดตามอีเมล/เว็บ) · `/l/[code]` (ลิงก์ย่อ):
//    ใบ C2.5 / C3.5 ที่สร้างหน้าพวกนี้ **ต้องเรียกผ่าน facade** เหมือนคนนอกทุกราย (ตัดสินแล้ว ไม่ใช่ของหลุด)
//    ⇒ ด่านนี้แดงตอนทำ C2.5/C3.5 = ย้ายฟังก์ชันที่ต้องใช้ขึ้น facade · ห้ามขยายรายการยกเว้น
//
// matcher — บทเรียนจากรีวิว C0.2 (3 รูรั่วที่เคยเขียวทั้งที่โมดูลเปิดโล่ง):
//   1) จับ **ทุก specifier ที่มี `modules/crm/`** ไม่ใช่เฉพาะรูป `@/…` — `"../modules/crm/service"` ที่ IDE
//      auto-import ให้ ก็ต้องโดน (ข้อสอบ C0.2 จับรูปนี้อยู่แล้ว · ด่านนี้ต้องไม่อ่อนกว่าข้อสอบ ซึ่งจะไม่ถูกรันอีกหลัง C1.1)
//   2) ยกเว้นต้องผูกอัญประกาศ: เขียน (?!index) ลอย ๆ ⇒ `crm/index-shared` (ธรรมเนียม *-shared.ts ของรีโป) หรือ
//      `crm/indexing` หลุดฟรี ⇒ ใช้ (?!index["']) · ส่วน (?!ui["']) ถูกอยู่แล้ว (`crm/ui-internals`, `crm/ui/Sub` ยังโดนจับ)
//   3) จับ `require(...)` และ `import "…";` เปล่า ๆ ด้วย — webpack แปลง alias ให้ทั้งคู่ = ทางลอดจริง
// ไม่มีประตูหลัง: specifier ที่โผล่ในคอมเมนต์/สตริงก็แดง — false positive แบบนี้ถูกและเสียงดัง ดีกว่ามีข้อยกเว้นให้ใช้
const CRM_SELF_DIRS = ["src/lib/modules/crm/", "src/app/app/sys/[id]/crm/"];
const CRM_DEEP_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'][^"']*modules\/crm\/(?!index["'])(?!ui["'])/g;
// รายงานเป็น `ไฟล์:บรรทัด` — คนที่เจอด่านแดงต้องกระโดดไปบรรทัดนั้นได้ทันที
// CRM C2.1 ▸ ข้อยกเว้นรายเส้น (ไฟล์ → specifier ตรงตัว) ที่สัญญาใบงานบังคับ — ไม่ใช่รายการยกเว้นรายโฟลเดอร์:
//   src/lib/automation/engine.ts → "@/lib/modules/crm/automation" : สัญญา C2.1 ข้อ E (ข้อสอบ qc-crm-c2.1 S0.6) ให้เอนจินกลาง
//   delegate แบบ lazy import ตรงไฟล์ "แบบเดียวกับบอร์ดงาน" (`@/lib/modules/kanban/automation`) — facade ลากทั้งโมดูล CRM
//   (บัญชี/แชท/สมาชิก) เข้ากราฟของทุก event ที่ขึ้นต้น crm.* โดยไม่จำเป็น · specifier อื่นในไฟล์เดียวกันยังโดนจับตามปกติ
const CRM_DEEP_ALLOWED: ReadonlyMap<string, string> = new Map([["src/lib/automation/engine.ts", "@/lib/modules/crm/automation"]]);
// ◂ CRM C2.1
const deepCrmImports = walk(join(ROOT, "src"), (p) => p.endsWith(".ts") || p.endsWith(".tsx"))
  .filter((f) => !CRM_SELF_DIRS.some((d) => rel(f).startsWith(d)))
  .flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(CRM_DEEP_RE)]
      .filter((m) => !(CRM_DEEP_ALLOWED.has(rel(f)) && readFileSync(f, "utf8").slice((m.index ?? 0) + m[0].search(/["']/) + 1).startsWith(`${CRM_DEEP_ALLOWED.get(rel(f))}${m[0][m[0].search(/["']/)]}`))) // CRM C2.1 ◂
      .map(
      (m) => `${rel(f)}:${readFileSync(f, "utf8").slice(0, m.index ?? 0).split("\n").length}`,
    ),
  );
chk(
  "F2.3",
  "โค้ดอื่นแตะ crm ได้เฉพาะผ่าน crm/index (facade) หรือ crm/ui (ทางเข้าคอมโพเนนต์)",
  deepCrmImports.length === 0,
  deepCrmImports.length ? `ล้วงลึก: ${deepCrmImports.join(", ")}` : "ครบ",
  "MAJOR",
);

// F5: raw prisma ในโมดูล
const rawPrismaFiles = moduleFiles.filter((f) =>
  /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(readFileSync(f, "utf8")),
);
chk(
  "F5.1",
  `raw prisma ในโมดูลไม่เพิ่ม (baseline ${BASELINE.f5RawPrisma})`,
  rawPrismaFiles.length <= BASELINE.f5RawPrisma,
  rawPrismaFiles.length > BASELINE.f5RawPrisma
    ? `เพิ่มเป็น ${rawPrismaFiles.length} ไฟล์ (ล่าสุดที่เพิ่ม ดู git diff)`
    : `${rawPrismaFiles.length} ไฟล์ (จะเป็น 0 หลัง port Phase 3)`,
  "MAJOR",
);

// ═══════════════════════════════════════════════════════════════
// F6 — authz coverage: ทุกไฟล์ server actions ต้องมีการตรวจสิทธิ์
//   วันนี้: authz มีแค่ account (1/15) — พนักงาน STAFF ทำอะไรก็ได้ทุกโมดูล
//   ratchet: baseline = ไฟล์ที่ยังไม่มี (WO-0006 ไล่ปิด) — ห้ามเพิ่ม ลดได้อย่างเดียว
// ═══════════════════════════════════════════════════════════════
console.log("\n── F6: authz coverage (ratchet — ห้ามเพิ่มไฟล์ไร้การตรวจสิทธิ์) ──");
{
  const AUTHZ_BASELINE = new Set<string>([]);
  // WO-0006 — หนี้ authz ปิดครบ 10/10 ไฟล์ → baseline ว่างถาวร (ratchet)
  // ทุก mutating server action เรียก assertCan ก่อนลงมือแล้ว ด้วย convention <module>.<entity>.<verb>
  // โมดูลระดับหน่วย (ส่ง unitId เข้า query):
  //   • hotel — reservation.create/checkIn/checkOut/cancel · room/roomType create/delete/setStatus
  //   • queue — type/counter/display · ticket issue/callNext/serve/done/cancel/transfer
  //   • ticket — event/type/order · checkin.scan
  //   • จอง — service/staff · appointment.setStatus
  //   • ร้านอาหาร — setting/station/category/item/zone/table/session/order/kds/checkout
  // โมดูลระดับระบบ (module+action · systemId scope รอ kernel Phase ถัดไป):
  //   • kanban · meeting · chat · coupon
  // ระดับร้าน (tenant admin): ทะเบียนระบบ — system/link/reward
  // ↓ รายการไฟล์ action ที่ตรวจจริง (fail-closed) — ห้ามแตะตรรกะ chk ด้านล่าง
  const actionFiles = [
    ...walk(join(ROOT, "src", "lib", "modules"), (p) => p.endsWith("actions.ts")),
    ...walk(join(ROOT, "src", "lib", "actions"), (p) => p.endsWith(".ts")),
  ].filter((f) => !f.endsWith("auth.ts") && !f.endsWith("onboarding.ts")); // ก่อน login ไม่มีสิทธิ์ให้ตรวจ
  // requireMembership = authz ระดับ account (สลับกิจการ ฯลฯ) — เข้มเท่ากัน: ตรวจสมาชิกภาพจริงจาก DB ก่อนลงมือ
  // 🔴 วัด "มีด่านสิทธิ์จริงไหม" ไม่ใช่ "พิมพ์คำว่า assertCan ไหม" (ยกระดับ 1 ก.ย.)
  //    เหตุ: พอยุบตรรกะสิทธิ์ซ้ำ 2 ชุดไปไว้ที่ `chat/guard.ts` แล้ว import มาใช้ (`assertChatCan`)
  //    ด่านเดิมอ่านว่า "ไฟล์นี้ไม่มีการตรวจสิทธิ์" ⇒ **ด่านที่ลงโทษการยุบโค้ดซ้ำ และให้รางวัลกับ
  //    การ copy-paste ตรรกะความปลอดภัย** ซึ่งตรงข้ามกับสิ่งที่มันตั้งใจกัน
  //    (บทเรียนซ้ำรอบที่ 5: ข้อสอบต้องวัดพฤติกรรม ไม่ใช่ล็อกชื่อตัวแปร/ไฟล์)
  //
  //    ⚠️ ยังคง **fail-closed** และเข้มกว่าเดิม: ไม่ได้เติมชื่อ `assertChatCan` ลง allowlist
  //    (นั่นจะทำให้ใครก็ตามตั้งชื่อฟังก์ชันเปล่า ๆ ว่า `assertChatCan` แล้วผ่านด่านได้)
  //    แต่ **ตามรอย import ลึก 1 ชั้น แล้วเปิดตัวฟังก์ชันปลายทางอ่านว่ามันเรียกด่านจริงหรือเปล่า**
  //    · ตามรอยไม่ได้ / เปิดไฟล์ไม่เจอ / ในตัวฟังก์ชันไม่มีด่าน ⇒ นับว่า "ไม่มี" เหมือนเดิม
  const DIRECT_AUTHZ = /assertCan|assertAccountCan|requireMembership\(/;

  /** ตัดตัวฟังก์ชัน `name` ออกมาจากซอร์ส (นับวงเล็บปีกกา) — คืน "" ถ้าไม่เจอ
   *  🔴 ข้ามวงเล็บพารามิเตอร์ก่อนนับปีกกา — ไม่งั้น `function f(args: { a: string }) {` จะได้แค่ type ของพารามิเตอร์
   *     แล้วตัดสินว่า "ไม่มีด่าน" ทั้งที่มี (จุดบอดที่สาย F เจอใน qc-chat-v2-context 1 ก.ย.) */
  function bodyOf(src: string, name: string): string {
    const decl = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b|(?:export\\s+)?const\\s+${name}\\s*[:=]`);
    const m = decl.exec(src);
    if (!m) return "";
    // ถ้าเป็น function/arrow ที่มีวงเล็บพารามิเตอร์ ให้ข้ามไปหลัง `)` ที่ปิดวงเล็บนั้นก่อน
    let from = m.index + m[0].length;
    const paren = src.indexOf("(", from);
    const braceFirst = src.indexOf("{", from);
    if (paren >= 0 && (braceFirst < 0 || paren < braceFirst)) {
      let pd = 0;
      for (let i = paren; i < src.length; i++) {
        if (src[i] === "(") pd++;
        else if (src[i] === ")" && --pd === 0) { from = i + 1; break; }
      }
    }
    const open = src.indexOf("{", from);
    if (open < 0) return "";
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
    }
    return "";
  }

  /** ไฟล์นี้ import ฟังก์ชันที่ **พิสูจน์ได้ว่าเรียกด่านสิทธิ์จริง** มาใช้หรือเปล่า */
  function importsProvenGuard(file: string, src: string): boolean {
    const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
    for (const im of src.matchAll(IMPORT_RE)) {
      const spec = im[2];
      // เฉพาะโมดูลในรีโปเท่านั้น — ของนอกพิสูจน์ไม่ได้ ⇒ ไม่นับ
      const base = spec.startsWith("@/")
        ? join(ROOT, "src", spec.slice(2))
        : spec.startsWith(".")
          ? resolve(dirname(file), spec)
          : "";
      if (!base) continue;
      const target = [".ts", ".tsx", "/index.ts", "/index.tsx"]
        .map((ext) => base + ext)
        .find((cand) => existsSync(cand));
      if (!target) continue;
      const targetSrc = readFileSync(target, "utf8");
      const names = im[1].split(",").map((n) => n.replace(/^.*\bas\b/, "").trim()).filter(Boolean);
      for (const n of names) {
        if (DIRECT_AUTHZ.test(bodyOf(targetSrc, n))) return true;
      }
    }
    return false;
  }

  const missing = actionFiles
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return !DIRECT_AUTHZ.test(src) && !importsProvenGuard(f, src);
    })
    .map(rel);
  const newMissing = missing.filter((m) => !AUTHZ_BASELINE.has(m));
  const healed = [...AUTHZ_BASELINE].filter((b) => !missing.includes(b));
  chk("F6.1", `ไม่มีไฟล์ action ใหม่ที่ไร้การตรวจสิทธิ์ (หนี้เดิม ${AUTHZ_BASELINE.size})`, newMissing.length === 0,
    newMissing.length ? `ใหม่: ${newMissing.join(", ")}` : `หนี้เหลือ ${missing.length}/${AUTHZ_BASELINE.size}`, "CRITICAL");
  chk("F6.2", "AUTHZ_BASELINE ไม่มีรายการที่ปิดแล้ว (ratchet)", healed.length === 0,
    healed.length ? `ปิดแล้ว ถอดออก: ${healed.join(", ")}` : "ตรง", "MINOR");
}

// ═══════════════════════════════════════════════════════════════
// F9(บางส่วน) — ทะเบียนระบบต้องไม่ขัดกับตัวเอง
//   จับ: systems.ts comment เขียน "14" แต่ SYSTEM_DEFS มี 18 entry
// ═══════════════════════════════════════════════════════════════
console.log("\n── F9: ทะเบียนระบบสอดคล้องกับ Prisma enum ──");

const systemsSrc = readFileSync(join(ROOT, "src", "lib", "systems.ts"), "utf8");
const defCodes = [...systemsSrc.matchAll(/code:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
const appSystemSrc = readFileSync(join(ROOT, "prisma", "schema", "app_system.prisma"), "utf8");
const coreSrc = readFileSync(join(ROOT, "prisma", "schema", "core.prisma"), "utf8");
const enumVals = (src: string, name: string) => {
  const m = src.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]+)\\}`));
  return m ? m[1].split(/\s+/).filter((s) => /^[A-Z_]+$/.test(s)) : [];
};
const systemType = new Set(enumVals(appSystemSrc, "SystemType"));
const unitType = new Set(enumVals(coreSrc, "UnitType"));

// available ทุกตัวต้องมีใน enum จริง ไม่งั้นสร้างไม่ได้ตอน runtime
// ยกเว้น: fixed-page system (WO-0073 — เช่น KB) = หน้า /app/* ระดับ tenant ไม่ instantiate เป็น AppSystem
//   จึงไม่ต้องมีใน enum · รายชื่อต้องตรงกับ FIXED_PAGE_SYSTEMS ใน src/lib/systems.ts
const FIXED_PAGE_EXEMPT = new Set(["KB", "PAGES"]);
const availableBad: string[] = [];
for (const m of systemsSrc.matchAll(/code:\s*"([A-Z_]+)"[^}]*kind:\s*"(business|feature)"[^}]*status:\s*"(available|coming_soon)"/g)) {
  const [, code, kind, status] = m;
  if (status !== "available") continue;
  if (FIXED_PAGE_EXEMPT.has(code)) continue;
  const pool = kind === "business" ? unitType : systemType;
  if (!pool.has(code)) availableBad.push(`${code}(${kind})`);
}
chk(
  "F9.1",
  `SYSTEM_DEFS ที่ available ทุกตัวมีใน Prisma enum จริง (${defCodes.length} entry)`,
  availableBad.length === 0,
  availableBad.length ? `available แต่ไม่มีใน enum → สร้างไม่ได้: ${availableBad.join(", ")}` : "ครบ",
  "CRITICAL",
);

// comment ในไฟล์ห้ามขัดกับจำนวนจริง
const claimed = systemsSrc.match(/ทะเบียน\s*"ระบบ"\s*ทั้ง\s*(\d+)/);
chk(
  "F9.2",
  `comment ใน systems.ts ตรงกับจำนวน SYSTEM_DEFS จริง (${defCodes.length})`,
  !claimed || Number(claimed[1]) === defCodes.length,
  claimed && Number(claimed[1]) !== defCodes.length
    ? `comment เขียน "${claimed[1]}" แต่มีจริง ${defCodes.length} entry`
    : "ตรง",
  "MINOR",
);

// ─────────────────── F10: ทะเบียนสกิล AI ครบถ้วน ───────────────────
// ทำไมต้องมีด่าน: ตั้งแต่ 8 ส.ค. 2026 เราไม่ยัด tool ครบทุกตัวให้ LLM แล้ว (แพง 76,703 token)
// AI เห็นเฉพาะเครื่องมือในสกิลที่โหลด → **tool ที่ไม่ได้ลงทะเบียนสกิล = AI เรียกไม่ได้เลย และเงียบสนิท**
console.log("\n── F10: ทะเบียนสกิล AI (tool ทุกตัวต้องมีบ้าน) ──");
{
  let detail = "ครบ";
  let ok = true;
  try {
    const { assertSkillRegistryComplete, SKILLS, CORE_TOOLS } = await import("@/lib/ai/skills");
    const { toolRegistry } = await import("@/lib/ai/tools");
    assertSkillRegistryComplete();
    detail = `${toolRegistry().length} tool · ${SKILLS.length} สกิล + แกนกลาง ${CORE_TOOLS.length}`;
  } catch (e) {
    ok = false;
    detail = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  chk("F10.1", "ทุก tool อยู่ในสกิลหรือแกนกลาง พอดี 1 ที่", ok, detail);
}

// ─────────────────── F11: ข้อสอบต้องไม่เน่าตามเวลา ───────────────────
// เหตุการณ์จริง 19 ส.ค. 2026: `qc-hotel-refund` ฮาร์ดโค้ดวันเข้าพัก "2026-08-01"
// พอถึงวันจริง วันนั้นกลายเป็น "อดีต" → `createReservation` ปฏิเสธตามด่านที่ถูกต้องของมันเอง
// → ข้อสอบแดง 6 ข้อ **ทั้งที่โค้ดไม่ได้พัง** และแดงเงียบมา ~3 สัปดาห์ (ไม้บรรทัดโกหก)
// ด่านนี้จับ "วันที่ตายตัวที่กลายเป็นอดีตไปแล้ว" เฉพาะในข้อสอบที่ยิง flow ซึ่งมีด่านกันจองย้อนหลัง
// → false positive = 0 (วันอนาคตผ่านตลอด และจะแดงพอดีตอนที่มันเน่าจริง ๆ)
console.log("\n── F11: ข้อสอบไม่เน่าตามเวลา (ห้ามฮาร์ดโค้ดวันที่ที่เป็นอดีตแล้ว) ──");
{
  // flow ที่ "ปฏิเสธวันในอดีต" เท่านั้น — เรียก service ตรง หรือผ่าน payload ของ AI proposal
  // 🔴 ห้ามจับกว้างกว่านี้ (เช่น `checkInDate:` เปล่า ๆ): ข้อสอบหลายชุด seed แถวด้วย prisma ตรง ๆ
  //    ซึ่งไม่ผ่านด่านวันที่ → วันที่ตายตัวที่นั่นเป็น fixture ที่ถูกต้อง ไม่ใช่ของเน่า (เคส qc-calendar)
  const DATE_GUARDED_CALLS =
    /\bcreateReservation\s*\(|\bcreateAppointment\s*\(|\bdateStr\s*:|hotel_create_reservation/;
  const DATE_LIT = /"(\d{4}-\d{2}-\d{2})"/g;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // business date ไทย
  const rotten: string[] = [];
  // 🔴 บทเรียนซ้ำ 3 รอบของ repo นี้: grep แยกโค้ดกับคอมเมนต์ไม่ออก
  //    (คอมเมนต์อธิบายบั๊กเก่ามักอ้างวันที่เดิม → จะโดนจับเองทั้งที่โค้ดแก้แล้ว)
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const p of walk(join(ROOT, "scripts"), (f) => /qc-.*\.mts$/.test(f))) {
    const src = stripComments(readFileSync(p, "utf8"));
    if (!DATE_GUARDED_CALLS.test(src)) continue;
    for (const m of src.matchAll(DATE_LIT)) {
      if (m[1]! < today) rotten.push(`${rel(p)}: "${m[1]}"`);
    }
  }
  chk(
    "F11.1",
    "ข้อสอบที่ยิง flow กันจองย้อนหลัง ไม่มีวันที่ตายตัวที่เป็นอดีตแล้ว",
    rotten.length === 0,
    rotten.length ? `${rotten.length} จุดเน่า: ${rotten.slice(0, 5).join(" · ")} — ใช้วันสัมพัทธ์ (dPlus(n)) แทน` : "ไม่มี",
  );
}

// ─────────────────── F12: cookie ทุกตัวต้องมี secure ───────────────────
// เจอจริง 19 ส.ค. 2026: `shark_tenant` (setActiveTenant) เป็น cookie ตัวเดียวในระบบที่ลืม `secure`
// ขณะที่ session / backoffice / oauth-state / webchat ตั้งครบหมด → หลุดเพราะ "ไม่มีใครเฝ้า" ไม่ใช่เพราะตั้งใจ
// ด่านนี้ทำให้ลืมอีกไม่ได้: ทุกจุดที่ตั้ง cookie ต้องระบุ secure ในบล็อก option เดียวกัน
console.log("\n── F12: cookie ทุกตัวตั้ง secure (ห้ามหลุดผ่าน http) ──");
{
  const SET_RE = /(?:cookies\(\)\s*\)?|jar|store|res\.cookies|\bcookieStore)\s*\.set\(/g;
  const bad: string[] = [];
  for (const p of walk(join(ROOT, "src"), (f) => /\.tsx?$/.test(f))) {
    const src = readFileSync(p, "utf8");
    if (!/\.set\(/.test(src)) continue;
    for (const m of src.matchAll(SET_RE)) {
      // ดูบล็อก option ที่ตามมา (ถึงวงเล็บปิดของ .set — พอสำหรับ literal ที่เราเขียนกันจริง)
      const tail = src.slice(m.index!, m.index! + 400);
      if (!/httpOnly\s*:/.test(tail)) continue; // ไม่ใช่ cookie ที่มี option (เช่น Map.set/searchParams.set)
      if (!/secure\s*:/.test(tail)) {
        bad.push(`${rel(p)}:${src.slice(0, m.index!).split("\n").length}`);
      }
    }
  }
  chk("F12.1", "ทุกจุดที่ตั้ง cookie ระบุ secure", bad.length === 0,
    bad.length ? `ขาด secure ที่: ${bad.join(" · ")}` : "ครบทุกจุด");
}

// ─────────────────── F13: ทะเบียน API (บัญชี + บอร์ดงาน) ───────────────────
// A4 ทำให้ "ทะเบียน op" เป็นแหล่งความจริงเดียวของ REST + OpenAPI + คู่มือ + สกิล AI
// ด่านนี้กันของ 3 อย่างที่พังเงียบเป็นประจำเวลาเพิ่ม endpoint ใหม่:
//   (1) เพิ่ม op แล้วไม่มีข้อสอบครอบ → พังบน prod ก่อนที่ CI จะรู้
//   (2) เพิ่ม op แล้วลืม generate คู่มือ → เอกสารโกหก (ผู้เชื่อมต่อยิงตามคู่มือแล้ว 404)
//   (3) ใส่ `tool` ให้ op แต่ไม่ลงทะเบียนในสกิล → AI มองไม่เห็น เงียบสนิท (บทเรียนเดียวกับ F10)
console.log("\n── F13: ทะเบียน API (op ทุกตัวมีข้อสอบ · คู่มือไม่เก่า · tool มีบ้าน) ──");
{
  const { ACCOUNT_OPS } = await import("@/lib/modules/account/api/registry");

  // F13.1 — ทุก op มี test id ที่ปรากฏจริงในข้อสอบชุด qc-account-api-*
  const qcSrc = walk(join(ROOT, "scripts"), (f) => /qc-account-api-.*\.mts$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const untested = ACCOUNT_OPS.filter((o) => !o.test || !qcSrc.includes(`"${o.test}"`));
  chk(
    "F13.1",
    `ทุก op (${ACCOUNT_OPS.length}) มี test id ที่อ้างถึงจริงใน scripts/qc-account-api-*.mts`,
    untested.length === 0,
    untested.length
      ? `${untested.length} op ไม่มีข้อสอบครอบ: ${untested.map((o) => `${o.id}(test=${o.test || "-"})`).join(", ")}`
      : "ครบ",
  );

  // F13.2 — คู่มือตรงกับ generator (import ฟังก์ชันบริสุทธิ์ ไม่ spawn — เร็วกว่าและไม่เขียนไฟล์)
  let docsOk = true;
  let docsDetail = "ตรง";
  try {
    const { renderDocs } = await import("./gen-account-api-docs.mjs");
    const docPath = join(ROOT, "docs", "api", "ACCOUNT-API.md");
    const onDisk = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
    docsOk = onDisk === renderDocs();
    if (!docsOk) docsDetail = "docs/api/ACCOUNT-API.md ไม่ตรงกับทะเบียน — รัน: pnpm exec tsx scripts/gen-account-api-docs.mts";
  } catch (e) {
    docsOk = false;
    docsDetail = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  chk("F13.2", "docs/api/ACCOUNT-API.md ตรงกับ generator (ไม่ stale)", docsOk, docsDetail);

  // F13.3 — op ที่ประกาศ tool ต้องมีชื่อนั้นในทะเบียนสกิล (ยังไม่มี op ไหนประกาศ = ผ่านแบบว่างเปล่า)
  const withTool = ACCOUNT_OPS.filter((o) => o.tool);
  const skillsSrc = readFileSync(join(ROOT, "src", "lib", "ai", "skills.ts"), "utf8");
  const orphanTools = withTool.filter((o) => !skillsSrc.includes(`"${o.tool!.name}"`));
  chk(
    "F13.3",
    `tool ของ op บัญชี (${withTool.length} ตัว) ลงทะเบียนในสกิล AI แล้ว`,
    orphanTools.length === 0,
    orphanTools.length
      ? `${orphanTools.length} tool ไม่มีในสกิล → AI เรียกไม่ได้: ${orphanTools.map((o) => o.tool!.name).join(", ")}`
      : withTool.length === 0
        ? "ยังไม่มี op ไหนประกาศ tool (E1 จะเป็นตัวเติม)"
        : "ครบ",
  );
}

// ─────────────────── F13 (ต่อ): ทะเบียน API บอร์ดงาน (K1.15 · D15) ───────────────────
// เงื่อนไขเดียวกับบัญชีเป๊ะ ๆ — ทุก WO ของ P2/P3 ที่เพิ่มฟีเจอร์ให้บอร์ดงานต้องเพิ่ม op ของตัวเองในทะเบียน
// แล้ว 3 ด่านนี้จะบังคับให้ "มีข้อสอบครอบ · คู่มือไม่เก่า · tool มีบ้านในสกิล" ตามมาเอง
{
  const { KANBAN_OPS } = await import("@/lib/modules/kanban/api/registry");

  // F13.4 — ทุก op มี test id ที่ปรากฏจริงในข้อสอบชุด qc-kanban-*
  const kbQcSrc = walk(join(ROOT, "scripts"), (f) => /qc-kanban-.*\.mts$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const untestedKb = KANBAN_OPS.filter((o) => !o.test || !kbQcSrc.includes(`"${o.test}"`));
  chk(
    "F13.4",
    `ทุก op ของบอร์ดงาน (${KANBAN_OPS.length}) มี test id ที่อ้างถึงจริงใน scripts/qc-kanban-*.mts`,
    untestedKb.length === 0,
    untestedKb.length
      ? `${untestedKb.length} op ไม่มีข้อสอบครอบ: ${untestedKb.map((o) => `${o.id}(test=${o.test || "-"})`).join(", ")}`
      : "ครบ",
  );

  // F13.5 — คู่มือตรงกับ generator (import ฟังก์ชันบริสุทธิ์ ไม่ spawn)
  let kbDocsOk = true;
  let kbDocsDetail = "ตรง";
  try {
    const { renderDocs } = await import("./gen-kanban-api-docs.mjs");
    const docPath = join(ROOT, "docs", "api", "KANBAN-API.md");
    const onDisk = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
    kbDocsOk = onDisk === renderDocs();
    if (!kbDocsOk) kbDocsDetail = "docs/api/KANBAN-API.md ไม่ตรงกับทะเบียน — รัน: pnpm exec tsx scripts/gen-kanban-api-docs.mts";
  } catch (e) {
    kbDocsOk = false;
    kbDocsDetail = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  chk("F13.5", "docs/api/KANBAN-API.md ตรงกับ generator (ไม่ stale)", kbDocsOk, kbDocsDetail);

  // F13.6 — op ที่ประกาศ tool ต้องมีชื่อนั้นในทะเบียนสกิล (สกิล `tasks`)
  const kbWithTool = KANBAN_OPS.filter((o) => o.tool);
  const skillsSrc2 = readFileSync(join(ROOT, "src", "lib", "ai", "skills.ts"), "utf8");
  const kbOrphans = kbWithTool.filter((o) => !skillsSrc2.includes(`"${o.tool!.name}"`));
  chk(
    "F13.6",
    `tool ของ op บอร์ดงาน (${kbWithTool.length} ตัว) ลงทะเบียนในสกิล AI แล้ว`,
    kbOrphans.length === 0,
    kbOrphans.length ? `${kbOrphans.length} tool ไม่มีในสกิล → AI เรียกไม่ได้: ${kbOrphans.map((o) => o.tool!.name).join(", ")}` : "ครบ",
  );
}

// ─────────────────── F13 (ต่อ): ทะเบียน API ระบบสมาชิก (M1.11) ───────────────────
// เงื่อนไขเดียวกับบัญชี/บอร์ดงานเป๊ะ ๆ — ทุก WO ของ M2/M3 ที่เพิ่มฟีเจอร์ให้ระบบสมาชิกต้องเพิ่ม op
// ของตัวเองในทะเบียน แล้ว 3 ด่านนี้จะบังคับให้ "มีข้อสอบครอบ · คู่มือไม่เก่า · tool มีบ้านในสกิล" ตามมาเอง
{
  const { MEMBER_OPS } = await import("@/lib/modules/member/api/registry");

  // F13.7 — ทุก op มี test id ที่ปรากฏจริงในข้อสอบชุด qc-member-*
  const mbQcSrc = walk(join(ROOT, "scripts"), (f) => /qc-member-.*\.mts$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const untestedMb = MEMBER_OPS.filter((o) => !o.test || !mbQcSrc.includes(`"${o.test}"`));
  chk(
    "F13.7",
    `ทุก op ของระบบสมาชิก (${MEMBER_OPS.length}) มี test id ที่อ้างถึงจริงใน scripts/qc-member-*.mts`,
    untestedMb.length === 0,
    untestedMb.length
      ? `${untestedMb.length} op ไม่มีข้อสอบครอบ: ${untestedMb.map((o) => `${o.id}(test=${o.test || "-"})`).join(", ")}`
      : "ครบ",
  );

  // F13.8 — คู่มือตรงกับ generator (import ฟังก์ชันบริสุทธิ์ ไม่ spawn)
  let mbDocsOk = true;
  let mbDocsDetail = "ตรง";
  try {
    const { renderDocs } = await import("./gen-member-api-docs.mjs");
    const docPath = join(ROOT, "docs", "api", "MEMBER-API.md");
    const onDisk = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
    mbDocsOk = onDisk === renderDocs();
    if (!mbDocsOk) mbDocsDetail = "docs/api/MEMBER-API.md ไม่ตรงกับทะเบียน — รัน: pnpm exec tsx scripts/gen-member-api-docs.mts";
  } catch (e) {
    mbDocsOk = false;
    mbDocsDetail = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  chk("F13.8", "docs/api/MEMBER-API.md ตรงกับ generator (ไม่ stale)", mbDocsOk, mbDocsDetail);

  // F13.9 — op ที่ประกาศ tool ต้องมีชื่อนั้นในทะเบียนสกิล (สกิล `members`)
  const mbWithTool = MEMBER_OPS.filter((o) => o.tool);
  const skillsSrc3 = readFileSync(join(ROOT, "src", "lib", "ai", "skills.ts"), "utf8");
  const mbOrphans = mbWithTool.filter((o) => !skillsSrc3.includes(`"${o.tool!.name}"`));
  chk(
    "F13.9",
    `tool ของ op ระบบสมาชิก (${mbWithTool.length} ตัว) ลงทะเบียนในสกิล AI แล้ว`,
    mbOrphans.length === 0,
    mbOrphans.length ? `${mbOrphans.length} tool ไม่มีในสกิล → AI เรียกไม่ได้: ${mbOrphans.map((o) => o.tool!.name).join(", ")}` : "ครบ",
  );
}

// ─────────────────── F13 (ต่อ): ทะเบียน API ของ CRM (CRM C1.10) ───────────────────
// เงื่อนไขเดียวกับบัญชี/บอร์ดงาน/สมาชิกเป๊ะ ๆ — ทุกใบของ CRM ที่เพิ่ม op (C2.11 · C3.4 · C3.8) ต้องลงทะเบียนใน `CRM_OPS`
// แล้ว 3 ด่านนี้บังคับ "มีข้อสอบครอบ · คู่มือไม่เก่า · tool มีบ้านในสกิล `crm`" ตามมาเอง
// 🔴 ไม่มี `--check` ของโฟลเดอร์สกิล (`.claude/skills/shark-crm-api` อยู่ใน .gitignore) — F13.11 เทียบเฉพาะ docs/api/CRM-API.md
{
  const { CRM_OPS } = await import("@/lib/modules/crm/api/registry");

  // F13.10 — ทุก op มี test id ที่ปรากฏจริงในข้อสอบชุด qc-crm-*
  const crmQcSrc = walk(join(ROOT, "scripts"), (f) => /qc-crm-.*\.mts$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const untestedCrm = CRM_OPS.filter((o) => !o.test || !crmQcSrc.includes(`"${o.test}"`));
  chk(
    "F13.10",
    `ทุก op ของ CRM (${CRM_OPS.length}) มี test id ที่อ้างถึงจริงใน scripts/qc-crm-*.mts`,
    untestedCrm.length === 0,
    untestedCrm.length
      ? `${untestedCrm.length} op ไม่มีข้อสอบครอบ: ${untestedCrm.map((o) => `${o.id}(test=${o.test || "-"})`).join(", ")}`
      : "ครบ",
  );

  // F13.11 — docs/api/CRM-API.md ตรงกับ generator (import ฟังก์ชันบริสุทธิ์ `renderDocs` ของ gen-crm-api-docs — ไม่ spawn ไม่เขียนไฟล์)
  let crmDocsOk = true;
  let crmDocsDetail = "ตรง";
  try {
    const { renderDocs } = await import("./gen-crm-api-docs.mjs");
    const docPath = join(ROOT, "docs", "api", "CRM-API.md");
    const onDisk = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
    crmDocsOk = onDisk === renderDocs();
    if (!crmDocsOk) crmDocsDetail = "docs/api/CRM-API.md ไม่ตรงกับทะเบียน — รัน: pnpm exec tsx scripts/gen-crm-api-docs.mts";
  } catch (e) {
    crmDocsOk = false;
    crmDocsDetail = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  chk("F13.11", "docs/api/CRM-API.md ตรงกับ generator (ไม่ stale)", crmDocsOk, crmDocsDetail);

  // F13.12 — op ที่ประกาศ tool ต้องมีชื่อนั้นในทะเบียนสกิล (สกิล `crm`)
  const crmWithTool = CRM_OPS.filter((o) => o.tool);
  const skillsSrc4 = readFileSync(join(ROOT, "src", "lib", "ai", "skills.ts"), "utf8");
  const crmOrphans = crmWithTool.filter((o) => !skillsSrc4.includes(`"${o.tool!.name}"`));
  chk(
    "F13.12",
    `tool ของ op CRM (${crmWithTool.length} ตัว) ลงทะเบียนในสกิล AI แล้ว`,
    crmOrphans.length === 0,
    crmOrphans.length ? `${crmOrphans.length} tool ไม่มีในสกิล → AI เรียกไม่ได้: ${crmOrphans.map((o) => o.tool!.name).join(", ")}` : "ครบ",
  );
}

// ═══════════════════════════════════════════════════════════════
// F14 — ทะเบียนปุ่ม CRM (CRM-MASTER-PLAN §7 · ด่าน D8 ของทุกใบ UI)
//   เจตนา: "ทุกปุ่ม/ลิงก์/ฟอร์มของ CRM ถูกกดจริงด้วยข้อสอบ" เริ่มจากการมีทะเบียนที่ตรงกับโค้ดเสมอ
//   F14.1 = ปุ่มในโค้ดต้องมีแถวในทะเบียน (ไม่มีปุ่มลอย · ไม่มี testid ที่อ่านค่าไม่ออก) ·
//   F14.2 = ทะเบียนต้องซื่อสัตย์กับโค้ด (ไม่มีแถวผี/แถวซ้ำ/แถวพิการ · baseline ไม่เหลือตัวที่ปิดแล้ว)
//   🔴 static ล้วน — อ่านไฟล์อย่างเดียว ไม่แตะ DB/เน็ต (ต้องผ่านทั้งแบบมี DATABASE_URL และ `env -u DATABASE_URL`)
// ═══════════════════════════════════════════════════════════════
console.log("\n── F14: ทะเบียนปุ่ม CRM (ปุ่มทุกตัวมีแถว · แถวทุกแถวมีปุ่มจริง) ──");
{
  // ── ขอบเขต "โฟลเดอร์ UI ของ CRM" ── (เดิมเป็นรายชื่อตายตัว → พลาดโฟลเดอร์ที่ใบหลังสร้างโดยไม่มีใครมาเติมรายชื่อ)
  //   (ก) ค้นหาเอง: ทุกโฟลเดอร์ที่มี segment ชื่อ "crm" ใต้ src/app · src/components · src/lib/modules
  //       → C1.3 จะวาง UI ไว้ที่ src/components/crm/… หรือหน้าใหม่ใต้ .../crm/… ก็ถูกกวาดทันทีโดยไม่ต้องแก้ด่านนี้
  //       (ชื่อโฟลเดอร์ต้องสะกดว่า "crm" เป๊ะ ๆ จึงลากโมดูลอื่นเข้ามาไม่ได้)
  //   (ข) route สาธารณะของ CRM ที่ชื่อโฟลเดอร์ไม่ได้สะกดว่า crm (มติ RESOLUTIONS R-C §7 · C15) — ต้องระบุมือ
  //       ⚠️ สามตัวนี้เป็น route ระดับบนสุด ไม่ใช่ของ CRM ผูกขาด: ถ้าโมดูลอื่นมาลงหน้าที่นี่ testid ของมันจะถูกนับเข้า
  //       ทะเบียน CRM ด้วย (ยอมรับไว้ก่อน — ข้อความ finding บอกชื่อไฟล์เสมอจึงเห็นได้ทันทีว่ามาจากใคร)
  const CRM_SEARCH_ROOTS = ["src/app", "src/components", "src/lib/modules"];
  const CRM_PUBLIC_DIRS = [
    "src/app/b",   // portal ลูกค้า /b/[slug]/* (มติ C15 · ใบ C3.5)
    "src/app/u",   // ยกเลิกรับอีเมล /u/[token] — มีฟอร์ม+ปุ่ม (ใบ C2.5)
    "src/app/t",   // ติดตามอีเมล/เว็บ + หน้ายินยอม /t/* (ใบ C2.5/C2.6)
  ];
  /** โฟลเดอร์ที่มีอยู่จริงและต้องสแกน (โฟลเดอร์ที่ยังไม่มี = ไม่มีข้อค้นพบ ไม่ใช่ error) */
  function discoverCrmDirs(): string[] {
    const out = new Set<string>();
    for (const root of CRM_SEARCH_ROOTS) {
      const abs = join(ROOT, root);
      if (!existsSync(abs)) continue;
      const stack = [abs];
      while (stack.length) {
        const d = stack.pop()!;
        for (const e of readdirSync(d)) {
          if (e === "node_modules" || e === ".next" || e === ".git") continue;
          const child = join(d, e);
          if (!statSync(child).isDirectory()) continue;
          if (e === "crm") { out.add(rel(child)); continue; } // เจอรากของ CRM แล้ว — walk จะกวาดทั้งกิ่งเอง
          stack.push(child);
        }
      }
    }
    for (const d of CRM_PUBLIC_DIRS) if (existsSync(join(ROOT, d))) out.add(d);
    return [...out].sort();
  }
  // จุดยึดพิสูจน์ว่า "ตัวค้นหายังทำงาน": หน้า CRM ที่มีอยู่จริงวันนี้ต้องถูกค้นเจอเสมอ
  const CRM_ANCHOR_DIRS = ["src/app/app/sys/[id]/crm", "src/lib/modules/crm"];
  const INVENTORY = "scripts/crm-ui-inventory.json";

  // ── ค่า data-testid ที่ "กดได้/กรอกได้" เท่านั้นที่ต้องลงทะเบียน (กล่องโครง/ป้ายไม่ต้อง) ──
  const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea", "form", "summary", "option", "dialog"]);
  // ชื่อคอมโพเนนต์ที่ "โดยธรรมชาติแล้วกดได้" — ตรวจทั้งชื่อเต็มและชื่อท้ายจุด (`Dialog.Trigger` → `Trigger`)
  const INTERACTIVE_COMPONENT = /(Button|Btn|Link|Input|Textarea|Select|Form|Toggle|Switch|Checkbox|Radio|Tab|Tabs|Menu|Dropdown|Upload|Picker|Slider|Search|Combobox|Modal|Sheet|Drawer|Trigger|Item|Option|Action|Close|Cancel|Submit|Save)$/;
  // prop ที่แปลว่า "มีคนกด/พิมพ์ใส่ได้" — รวมสไตล์ headless UI (onSelect/onValueChange/onOpenChange/onPress)
  const INTERACTIVE_ATTR = /\bon(Click|Change|Input|Submit|KeyDown|KeyUp|KeyPress|Drag\w*|Drop|Toggle|Select|ValueChange|CheckedChange|OpenChange|Press|PointerDown|MouseDown)\s*=|\bhref\s*=|\baction\s*=|\brole\s*=\s*\{?["']?(button|tab|link|menuitem|switch|checkbox|option)\b|\btabIndex\s*=|\bdraggable\s*=|\bcontentEditable\s*=/;
  // ค่าที่ "อ่านออก": "…" · '…' · {`…`} · {"…"} · {'…'}
  const TESTID_RE = /data-testid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g;
  // ทุกจุดที่เขียน data-testid (ใช้หาตัวที่ TESTID_RE อ่านไม่ออก เช่น `data-testid={someVar}` — ห้ามเงียบ)
  const ANY_TESTID_RE = /data-testid\s*=/g;

  /** ชื่อที่สร้างจากตัวแปร (`deal-card-${id}`) → แพตเทิร์น `deal-card-*` (ทะเบียนลงแถวเดียวคลุมทั้งชุดได้) */
  const normId = (v: string) => v.replace(/\$\{[^}]*\}/g, "*").replace(/\*+/g, "*").trim();
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** `foo-*` → /^foo-.*$/ (ใช้จับคู่ "แพตเทิร์น ↔ ชื่อจริง" ทั้งสองทาง) */
  const globRe = (g: string) => new RegExp("^" + g.split("*").map(escapeRe).join(".*") + "$");

  /** แท็กที่ห่อ data-testid ตัวนี้ + ข้อความ attribute ทั้งก้อน (ข้ามวงเล็บปีกกา/สตริงถูกต้อง) */
  function tagAround(src: string, at: number): { tag: string; attrs: string } {
    let open = -1;
    for (let i = at; i >= 0; i--) if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] ?? "")) { open = i; break; }
    if (open < 0) return { tag: "", attrs: "" };
    const tag = (/^<([A-Za-z][\w.]*)/.exec(src.slice(open, open + 80)) ?? [, ""])[1] as string;
    let depth = 0, quote = "", end = src.length;
    for (let i = open; i < src.length; i++) {
      const c = src[i]!;
      if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth <= 0) { end = i; break; }
    }
    return { tag, attrs: src.slice(open, end) };
  }
  const isInteractive = (tag: string, attrs: string) =>
    INTERACTIVE_TAGS.has(tag) ||
    INTERACTIVE_TAGS.has(tag.split(".").pop() ?? "") ||          // `Dialog.Trigger` → ดูชื่อท้ายจุดด้วย
    INTERACTIVE_COMPONENT.test(tag) ||
    INTERACTIVE_COMPONENT.test(tag.split(".").pop() ?? "") ||
    INTERACTIVE_ATTR.test(attrs);
  const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;

  type Found = { id: string; file: string; interactive: boolean };
  const found: Found[] = [];
  const unreadable: { file: string; line: number; snippet: string; interactive: boolean }[] = [];
  const dirsPresent = discoverCrmDirs();
  let scannedFiles = 0;
  for (const dir of dirsPresent) {
    for (const f of walk(join(ROOT, dir), (p) => p.endsWith(".tsx") || p.endsWith(".ts"))) {
      scannedFiles++;
      const src = readFileSync(f, "utf8");
      const readAt = new Set<number>();
      for (const m of src.matchAll(TESTID_RE)) {
        readAt.add(m.index ?? -1);
        const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "";
        const { tag, attrs } = tagAround(src, m.index ?? 0);
        found.push({ id: normId(raw), file: rel(f), interactive: isInteractive(tag, attrs) });
      }
      // data-testid ที่อ่านค่าไม่ออก (มาจากตัวแปร/ฟังก์ชัน) — ลงทะเบียนไม่ได้ ⇒ ต้องรายงาน ไม่ใช่ทิ้งเงียบ
      for (const m of src.matchAll(ANY_TESTID_RE)) {
        const at = m.index ?? -1;
        if (readAt.has(at)) continue;
        const { tag, attrs } = tagAround(src, at);
        unreadable.push({ file: rel(f), line: lineOf(src, at), snippet: src.slice(at, at + 60).split("\n")[0]!, interactive: isInteractive(tag, attrs) });
      }
    }
  }

  // ── ratchet baseline: หนี้ testid ที่ "มีอยู่ก่อนมีทะเบียน" — ห้ามเพิ่ม ลดได้อย่างเดียว ──
  // ณ ใบ C0.1 (17 ก.ย. 2569): UI ของ CRM v1 (3 หน้า + src/lib/modules/crm/ui.tsx) **ไม่มี data-testid สักตัว**
  // (ยืนยันด้วย grep = 0) ⇒ baseline ว่างตั้งแต่วันแรก และด่านนี้กัด "โค้ดใหม่" ทันทีตามเจตนาของใบ
  // วิธีใช้ถ้าจำเป็นต้องตรึงหนี้: ["<testid>", "<เหตุผล + ใบที่จะปิด>"] แล้วถอดออกเมื่อลงทะเบียนจริง (F14.2 บังคับให้ถอด)
  const CRM_TESTID_BASELINE = new Map<string, string>([]);

  // 🔴 ประกาศเป็น unknown[] (ของที่ parse มาจาก JSON คือ unknown จริง ๆ) — ไม่ผูกชนิดล่วงหน้าแล้วต้องมาเทียบ null
  let rows: unknown[] = [];
  let invErr = "";
  try {
    const invPath = join(ROOT, INVENTORY);
    if (!existsSync(invPath)) throw new Error(`ไม่พบ ${INVENTORY}`);
    const parsed = JSON.parse(readFileSync(invPath, "utf8"));
    const raw = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(raw)) throw new Error(`${INVENTORY} ต้องมีคีย์ "rows" เป็น array`);
    rows = raw;
  } catch (e) {
    invErr = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }

  /** ค่า testid ที่ใช้ได้ของแถวนี้ (ไม่ใช่ออบเจ็กต์ · ไม่มีคีย์ · ว่าง · ไม่ใช่สตริง ⇒ null) */
  const rowTestid = (r: unknown): string | null => {
    if (typeof r !== "object" || r === null) return null;
    const v = (r as { testid?: unknown }).testid;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  // แถวพิการ ⇒ มองไม่เห็นทั้งสองด่านถ้าไม่ดัก (F14.2 จับ)
  const malformed = rows.map((r, i) => ({ i, r })).filter(({ r }) => rowTestid(r) === null);
  const rowIdsAll = rows.map(rowTestid).filter((x): x is string => x !== null);

  // 🔴 แพตเทิร์นกว้างเกิน = ช่องโหว่แบบเดียวกับ `deal-*` คลุมปุ่มทั้งหน้า แต่แย่กว่า:
  //    แถวเดียว `{"testid":"*"}` (หรือ `d-*`) จะคลุม testid ที่สร้างจากตัวแปร **ทั้งระบบ** และไม่เป็นแถวผีด้วย
  //    ⇒ ตัดทิ้งจากการคุ้มครอง แล้วรายงานเป็นแถวพิการ (ไม่ใช่เงียบ)
  const MIN_PATTERN_CHARS = 4;
  const degenerate = rowIdsAll.filter((id) => id.includes("*") && id.replace(/\*/g, "").length < MIN_PATTERN_CHARS);
  const rowIds = rowIdsAll.filter((id) => !degenerate.includes(id));

  const rowExact = new Set(rowIds.filter((id) => !id.includes("*")));
  const rowPatterns = rowIds.filter((id) => id.includes("*")).map((id) => ({ id, re: globRe(id) }));
  const codeIds = found.map((f) => f.id);
  const codeExact = new Set(codeIds.filter((id) => !id.includes("*")));
  const codePatterns = codeIds.filter((id) => id.includes("*")).map((id) => ({ id, re: globRe(id) }));

  /** testid ในโค้ดตัวนี้ มีแถวคลุมไหม
   *  🔴 แถวแพตเทิร์น (`deal-*`) คลุมได้ **เฉพาะ** ชื่อที่โค้ดสร้างจากตัวแปรจริง (ชื่อที่ normalise แล้วมี `*`)
   *     ชื่อที่เขียนตรง ๆ ในโค้ดต้องมีแถวตรงตัว — ไม่งั้นแถวเดียว `deal-*` จะกลืนปุ่มทั้งหน้า
   *     แล้ว C4.2 ก็ไม่มี expect/roles/hiddenFor รายปุ่มให้กด (ซึ่งคือทั้งหมดของ §7) */
  const registered = (id: string) =>
    rowExact.has(id) || (id.includes("*") && rowPatterns.some((r) => r.re.test(id) || globRe(id).test(r.id)));

  /** แถวนี้ชี้ไปที่ testid ที่มีจริงในโค้ดไหม (แถวแพตเทิร์นต้องคู่กับชื่อที่สร้างจากตัวแปรจริงเท่านั้น) */
  const inCode = (id: string) =>
    id.includes("*")
      ? codePatterns.some((c) => c.re.test(id) || globRe(id).test(c.id))
      : codeExact.has(id) || codePatterns.some((c) => c.re.test(id));

  // F14.1 — ปุ่ม/ช่องกรอกในโฟลเดอร์ CRM ทุกตัวต้องมีแถวในทะเบียน (ยกเว้นหนี้ใน baseline)
  const interactiveIds = [...new Map(found.filter((f) => f.interactive).map((f) => [`${f.id}@${f.file}`, f])).values()];
  const unregistered = interactiveIds.filter((f) => !registered(f.id) && !CRM_TESTID_BASELINE.has(f.id));
  const unreadableInteractive = unreadable.filter((u) => u.interactive);
  // positive control ของตัวสแกนเอง (2 ชั้น): โฟลเดอร์ยึดต้องถูกค้นเจอ · และต้องสแกนได้ไฟล์จริง
  const anchorMissed = CRM_ANCHOR_DIRS.filter((d) => existsSync(join(ROOT, d)) && !dirsPresent.includes(d));
  const scanBroken = dirsPresent.length > 0 && scannedFiles === 0;
  const f141Problems = [
    invErr ? `อ่านทะเบียนไม่ได้ — ${invErr}` : "",
    anchorMissed.length ? `ตัวค้นหาโฟลเดอร์ CRM พัง — หาโฟลเดอร์ที่มีอยู่จริงไม่เจอ: ${anchorMissed.join(", ")}` : "",
    scanBroken ? `สแกนไม่เจอไฟล์เลยทั้งที่พบโฟลเดอร์ ${dirsPresent.join(", ")} — ตัวสแกนเพี้ยนจากของจริง` : "",
    unregistered.length
      ? `${unregistered.length} ตัวไม่มีแถว: ${unregistered.slice(0, 12).map((f) => `${f.id} (${f.file})`).join(" · ")}${unregistered.length > 12 ? " …" : ""} → เพิ่มแถวใน ${INVENTORY} ตาม §7 (ชื่อที่มาจากตัวแปรเท่านั้นที่ลงเป็นแพตเทิร์น เช่น deal-card-*)`
      : "",
    unreadableInteractive.length
      ? `${unreadableInteractive.length} จุดเขียน data-testid ด้วยค่าที่อ่านไม่ออก (ลงทะเบียนไม่ได้): ${unreadableInteractive.slice(0, 8).map((u) => `${u.file}:${u.line} ${u.snippet}`).join(" · ")} → ใช้สตริงตรง ๆ หรือ {\`ชื่อ-\${id}\`}`
      : "",
  ].filter(Boolean);
  chk(
    "F14.1",
    `data-testid ที่กดได้ในโฟลเดอร์ CRM (${interactiveIds.length} ตัว · สแกน ${scannedFiles} ไฟล์ใน ${dirsPresent.length} โฟลเดอร์: ${dirsPresent.join(", ") || "-"}) มีแถวใน ${INVENTORY} ครบ (หนี้เดิม ${CRM_TESTID_BASELINE.size})`,
    f141Problems.length === 0,
    f141Problems.length
      ? f141Problems.join(" · ")
      : `ครบ (ทะเบียน ${rowIds.length} แถว · สแกน ${scannedFiles} ไฟล์ · โฟลเดอร์ ${dirsPresent.length})`,
    "CRITICAL",
  );

  // F14.2 — ทะเบียนต้องซื่อสัตย์กับโค้ด: ไม่มีแถวผี · ไม่มีแถวซ้ำ · ไม่มีแถวพิการ · baseline ไม่เหลือตัวที่ปิดหนี้ไปแล้ว (ratchet)
  const ghosts = rowIds.filter((id) => !inCode(id));
  const dupes = rowIds.filter((id, i) => rowIds.indexOf(id) !== i);
  const healed = [...CRM_TESTID_BASELINE.keys()].filter((b) => !codeExact.has(b) || registered(b));
  const problems = [
    ghosts.length ? `แถวผี ${ghosts.length} (ไม่มี testid นี้ในโค้ด · แถวแพตเทิร์นต้องคู่กับชื่อที่สร้างจากตัวแปร): ${ghosts.slice(0, 12).join(", ")}${ghosts.length > 12 ? " …" : ""}` : "",
    dupes.length ? `แถวซ้ำ: ${[...new Set(dupes)].join(", ")}` : "",
    degenerate.length ? `แถวแพตเทิร์นกว้างเกินจนไร้ความหมาย ${degenerate.length} (ตัวอักษรที่ไม่ใช่ * ต้อง ≥ ${MIN_PATTERN_CHARS}): ${degenerate.join(", ")} — แถวเดียวจะกลืน testid ที่สร้างจากตัวแปรทั้งระบบ แล้ว C4.2 ไม่เหลือ expect/roles/hiddenFor รายปุ่มให้กด` : "",
    malformed.length ? `แถวพิการ (ไม่มีคีย์ testid หรือค่าว่าง) ${malformed.length}: ${malformed.slice(0, 6).map((m) => `#${m.i} ${JSON.stringify(m.r).slice(0, 80)}`).join(" · ")}` : "",
    healed.length ? `CRM_TESTID_BASELINE มีตัวที่ปิดแล้ว ถอดออก: ${healed.join(", ")}` : "",
  ].filter(Boolean);
  chk(
    "F14.2",
    `ทุกแถวใน ${INVENTORY} (${rowIds.length}) ชี้ไปที่ testid ที่มีจริงในโค้ด + baseline ไม่มีตัวที่ปิดแล้ว`,
    invErr === "" && problems.length === 0,
    invErr ? `อ่านทะเบียนไม่ได้ — ${invErr}` : problems.length ? problems.join(" · ") : "ตรง",
  );
}

// ─────────────────── สรุป ───────────────────
const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== FITNESS =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({
  total: checks.length,
  passed: checks.length - failed.length,
  findings: failed.map((c) => ({ id: c.id, name: c.name, detail: c.detail, sev: c.sev })),
}));

// CI gate: CRITICAL/MAJOR ตกแม้ข้อเดียว = แดง
process.exit(bySev("CRITICAL") + bySev("MAJOR") > 0 ? 1 : 0);
