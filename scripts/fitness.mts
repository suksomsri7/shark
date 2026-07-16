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
  ["lib/core/sanitize.ts",              "BUILD 🔜 — SECURITY.md [B]"],
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

const BASELINE = { f5RawPrisma: 36 }; // วัดจริง 2026-07-15 (34) + approval/service.ts (WO-0049: $transaction atomic กับ outbox — pattern เดียวกับ POS) + inventory/service.ts (WO-0038: sweepExpiringLots ข้ามร้าน — pattern เดียว sweepWeeklyAnalysis) — ratchet ลงได้อย่างเดียว (F2 ใช้ allowlist รายเส้นแล้ว)

const moduleDir = join(ROOT, "src", "lib", "modules");
const moduleNames = existsSync(moduleDir)
  ? readdirSync(moduleDir).filter((d) => statSync(join(moduleDir, d)).isDirectory())
  : [];
const moduleFiles = walk(moduleDir, (p) => p.endsWith(".ts") || p.endsWith(".tsx"));

// F2: import ข้ามโมดูล — allowlist รายเส้น (แข็งกว่านับจำนวน: เส้นใหม่สลับแทนเส้นเก่าไม่ได้)
// เส้นที่อนุญาต = 10 เส้นเดิม (หนี้จะหมดตอน port Phase 3) + chokepoint ที่สถาปนิกอนุมัติ
const ALLOWED_EDGES = new Set([
  // หนี้เดิม (วัด 2026-07-15) — ratchet: ลบได้ ห้ามเพิ่มกลับ
  "booking→member", "booking→system", "chat→member",
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
  "shop→system",  // resolve ระบบ POS/INVENTORY ที่ผูก unit (เหมือน restaurant→system)
]);
const crossEdges = new Set<string>();
for (const f of moduleFiles) {
  const self = relative(moduleDir, f).split("/")[0];
  for (const m of readFileSync(f, "utf8").matchAll(/from\s+["']@\/lib\/modules\/([a-z-]+)/g)) {
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
  const missing = actionFiles.filter((f) => !/assertCan|assertAccountCan/.test(readFileSync(f, "utf8"))).map(rel);
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
const availableBad: string[] = [];
for (const m of systemsSrc.matchAll(/code:\s*"([A-Z_]+)"[^}]*kind:\s*"(business|feature)"[^}]*status:\s*"(available|coming_soon)"/g)) {
  const [, code, kind, status] = m;
  if (status !== "available") continue;
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
