// seed-pos-perf.mts — ร้านชั่วคราวขนาดจริงสำหรับวัดประสิทธิภาพ POS (ใบ P5.3 · brief P5 §4 P5.3 · §10 มติ 7)
//
// ใช้ (ผู้คุมรันบนทรี d · QC5 เท่านั้นโดยปริยาย — ห้ามรันคู่ build/typecheck):
//   bash scripts/iso.sh pnpm exec tsx scripts/seed-pos-perf.mts --dry                     # แผน (ไม่ต่อ DB · ไม่โหลด env)
//   bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/seed-pos-perf.mts --preflight   # ตรวจเงื่อนไขของ writer ทุกตัว (อ่านอย่างเดียว · QC4/QC5)
//   bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-pos-perf.mts [--n 5000] [--categories 50]
//   bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/seed-pos-perf.mts --resume posqc-perf-<rand>   # ต่อแคตตาล็อกที่ค้าง
//   bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/seed-pos-perf.mts --drop posqc-perf-<rand>     # ลบทุกอย่างของร้านนี้ (และเท่านั้น)
//
// สร้างอะไร (ร้านใหม่ id = slug = `posqc-perf-<rand>` · ทุกแถวอยู่ในร้านนี้):
//   ร้าน + 2 สาขา SHOP (A = สาขาที่วัด · B = สาขาที่สอง) · ระบบ POS (ธง registerV2) · INVENTORY · ACCOUNT (+ ensureAccounting + ลิงก์ POS) · MEMBER
//   ผู้ใช้ 2 คน (OWNER ทุกสาขา · STAFF แคชเชียร์สาขา A สิทธิ์เท่าแคชเชียร์ QC) · หมวด 50 (catalog.createCategory) ·
//   สินค้า N = 5,000 ทุกสาขา มีบาร์โค้ด EAN-13 ไม่ซ้ำ (catalog.createProduct ทีละก้อนในธุรกรรมของผู้เรียก) ·
//   โปรราคา 3 กติกา (price-rule.savePriceRule) · สมาชิก 1 คน (member.findOrCreate) · พร้อมเพย์แบบคงที่ (payment.savePaymentProfile) ·
//   เครื่องขาย 1 เครื่องที่สาขา A (device.registerDevice) + PIN เจ้าของ/แคชเชียร์ (staff-pin.setStaffPin) ·
//   คีย์ REST ชุด pos-operate ผูกระบบ POS อายุ 7 วัน (api-keys.createApiKey · ข้อ B3 วัด /products/lookup)
//   ไฟล์กุญแจ (id · อีเมล · PIN · คีย์ REST) = `/root/pos-runs/perf/<tenantId>.creds.json` (สิทธิ์ 0600 · นอกรีโปเสมอ)
//
// กติกา (มติ 7 + LANE-RULES 22 ต.ค.):
//   🔴 writer ของโมดูลเท่านั้น — เขียนตรงด้วย prisma เฉพาะแถวที่ seed-pos-qc.mts เองก็เขียนตรง (Tenant · BusinessUnit · User · Membership ·
//      ธง settings.pos.registerV2 · AccountSystemLink) · แคตตาล็อก/หมวด/โปรห้ามเขียนตรง (F15.1)
//   🔴 ฐาน: QC5 (ep-fragrant-thunder) เท่านั้นโดยปริยาย · QC4 (ep-frosty-lab) อ่านได้ (--preflight/--drop) แต่สร้างได้เฉพาะ PERF_ALLOW_QC4=1
//      (QC4 = ฐานข้อสอบ — CD-P53-O2) · host อื่นทั้งหมด (prod · QC1–3 ของ CRM · อื่น ๆ) = exit 4
//   🔴 ไม่แตะร้าน QC เดิม (`posqc-coffee-tenant` · `posqc-resto-tenant`) ไม่ว่าทางไหน · --drop รับเฉพาะ id รูป `posqc-perf-[a-z0-9]{6,12}`
//      ที่ slug ตรงกับ id · ไม่เรียก drainAll (คิว outbox ไม่แยกร้าน) · ไม่อ่าน .env
//   ผลท้าย: `SEED_SUMMARY {...}` + `JSON_SUMMARY {...}` (total/passed = ขั้นตอนที่ผ่าน)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes, randomInt } from "node:crypto";

const SUITE = "seed-pos-perf";
const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const argOf = (f: string): string | null => (has(f) ? (ARGV[ARGV.indexOf(f) + 1] ?? null) : null);
const DRY = has("--dry");
const PREFLIGHT = has("--preflight");
const DROP_ID = argOf("--drop");
const RESUME_ID = argOf("--resume");

// ═════════════════════════ ค่าคงที่ของชุดข้อมูล (oracle qc-pos-p5.3 อ่านไฟล์กุญแจ ไม่ผูกค่าพวกนี้) ═════════════════════════
export const PERF_ID_RE = /^posqc-perf-[a-z0-9]{6,12}$/;
/** ร้าน QC เดิมที่ห้ามแตะเด็ดขาด (สัญญา pos-qc-env PQC) */
export const PERF_FORBIDDEN_TENANTS = ["posqc-coffee-tenant", "posqc-resto-tenant"] as const;
/** host ที่ยอมรับ: QC5 (ปริยาย) · QC4 (อ่าน + สร้างเมื่อ PERF_ALLOW_QC4=1) */
export const PERF_HOST_ALLOW = { qc5: "ep-fragrant-thunder", qc4: "ep-frosty-lab" } as const;
export const PERF_CREDS_DIR = "/root/pos-runs/perf";
const N_PRODUCTS = clampInt(argOf("--n") ?? process.env.PERF_N ?? "5000", 10, 20_000, 5000);
const N_CATEGORIES = clampInt(argOf("--categories") ?? "50", 1, 200, 50);
const BATCH = clampInt(process.env.PERF_BATCH ?? "25", 1, 100, 25);
const PROMPTPAY_ID = "0899000000"; // เบอร์ปลอมรูปแบบถูก (เดียวกับร้าน QC กาแฟ)
const CASHIER_PERMS: Record<string, boolean> = { "pos.sale.create": true, "member.customer.read": true }; // = PQC.cashierPermissions

function clampInt(raw: string, lo: number, hi: number, dflt: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : dflt;
}
/** บาร์โค้ด EAN-13 ของสินค้าลำดับ i (0-based) — 8859 + เลข 8 หลัก + check digit (ซ้ำไม่ได้ในร้าน · ไม่ขึ้นต้น 2x = ไม่ชนป้ายชั่ง) */
export function perfBarcode(i: number): string {
  const b12 = `8859${String(i).padStart(8, "0")}`;
  let s = 0;
  for (let k = 0; k < 12; k++) s += (k % 2 === 0 ? 1 : 3) * (b12.charCodeAt(k) - 48);
  return b12 + String((10 - (s % 10)) % 10);
}
/** ชื่อสินค้าลำดับ i — เรียงตามชื่อ = เรียงตามลำดับ (กริดหน้าแรก = 0001–0100) */
export const perfName = (i: number) => `P53 สินค้า ${String(i + 1).padStart(5, "0")}`;
const perfPrice = (i: number) => 1000 + ((i * 3_701) % 49_000); // ฿10–฿500 สตางค์เต็ม
const ids = (tid: string) => ({
  unitA: `${tid}-unit-a`,
  unitB: `${tid}-unit-b`,
  owner: { userId: `${tid}-user-owner`, membershipId: `${tid}-mb-owner`, email: `${tid}-owner@qc.invalid`, name: "เจ้าของร้านวัดผล (P5.3)" },
  cashier: { userId: `${tid}-user-cashier`, membershipId: `${tid}-mb-cashier`, email: `${tid}-cashier@qc.invalid`, name: "แคชเชียร์วัดผล (P5.3)" },
  deviceCode: `${tid}-dev`,
});
const credsPath = (tid: string) => `${PERF_CREDS_DIR}/${tid}.creds.json`;

// ═════════════════════════ --dry (ไม่ต่อ DB) ═════════════════════════
function plan(tid: string) {
  const I = ids(tid);
  return [
    `ร้าน Tenant id=slug=${tid} (prisma ตรง · แบบ seed-pos-qc)`,
    `สาขา ${I.unitA} (A · วัด) + ${I.unitB} (B) — BusinessUnit SHOP (prisma ตรง · ไม่มี writer ในโมดูล)`,
    "ระบบ POS · INVENTORY · ACCOUNT · MEMBER — system.createSystem + system.linkUnit ทั้ง 2 สาขา · ธง settings.pos.registerV2 (prisma ตรง · แบบ seed-pos-qc)",
    "บัญชี: account/gl.ensureAccounting + AccountSystemLink POS (prisma ตรง · แบบ seed-pos-qc)",
    `ผู้ใช้ ${I.owner.email} (OWNER ["*"]) · ${I.cashier.email} (STAFF [${I.unitA}] ${JSON.stringify(CASHIER_PERMS)}) — User/Membership (prisma ตรง · แบบ seed-pos-qc)`,
    `หมวด ${N_CATEGORIES} — catalog.createCategory (actor = เจ้าของ)`,
    `สินค้า ${N_PRODUCTS} ทุกสาขา · บาร์โค้ด ${perfBarcode(0)} … ${perfBarcode(N_PRODUCTS - 1)} · ราคา ฿10–฿500 · VAT 7% — catalog.createProduct ก้อนละ ${BATCH} ในธุรกรรมเดียว (${Math.ceil(N_PRODUCTS / BATCH)} ก้อน)`,
    "โปรราคา 3 — price-rule.savePriceRule: PROMO −10% 5 หมวดแรก · HAPPY_HOUR ราคา ฿25 สินค้า 20 ตัว (ทุกวัน 14:00–17:00) · PROMO −฿5 หมวดที่ 6",
    "สมาชิก 1 คน 0899000001 — member.findOrCreate (source STAFF)",
    `พร้อมเพย์คงที่ ${PROMPTPAY_ID} — payment.savePaymentProfile`,
    `เครื่อง ${I.deviceCode} ที่สาขา A — pos/device.registerDevice · PIN 6 หลักสุ่มของเจ้าของ+แคชเชียร์ — pos/staff-pin.setStaffPin`,
    "คีย์ REST pos-operate ผูก POS อายุ 7 วัน — api-keys.createApiKey",
    `ไฟล์กุญแจ ${credsPath(tid)} (0600)`,
  ];
}

// ═════════════════════════ ด่าน host + ด่านร้าน ═════════════════════════
type HostKind = "qc5" | "qc4";
function hostKind(): HostKind {
  const urls = [process.env.DATABASE_URL ?? "", process.env.DIRECT_URL ?? ""].filter(Boolean);
  if (!urls.length) die("ไม่มี DATABASE_URL — รันผ่าน scripts/qc5.sh (หรือ qc4.sh สำหรับ --preflight)", 4);
  const kinds = new Set<HostKind | "other">(urls.map((u) => (u.includes(PERF_HOST_ALLOW.qc5) ? "qc5" : u.includes(PERF_HOST_ALLOW.qc4) ? "qc4" : "other")));
  if (kinds.has("other") || kinds.size !== 1) die("host ไม่อยู่ในรายการอนุญาต (QC5 ep-fragrant-thunder · QC4 ep-frosty-lab) — หยุด", 4);
  return [...kinds][0] as HostKind;
}
export function assertPerfTenantId(tid: string): void {
  if ((PERF_FORBIDDEN_TENANTS as readonly string[]).includes(tid)) die(`ห้ามแตะร้าน QC เดิม ${tid}`, 4);
  if (!PERF_ID_RE.test(tid)) die(`id ร้านต้องเป็นรูป posqc-perf-[a-z0-9]{6,12} (ได้ ${tid.slice(0, 40)})`, 4);
}
function die(msg: string, code = 2): never {
  console.error(`🔴 ${SUITE}: ${msg}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 1, passed: 0, fatal: msg })}`);
  process.exit(code);
}

if (DRY) {
  const tid = RESUME_ID ?? DROP_ID ?? "posqc-perf-<rand>";
  console.log(`── ${SUITE} --dry (ไม่ต่อ DB) ──`);
  if (DROP_ID) {
    assertPerfTenantId(DROP_ID);
    console.log(`  --drop ${DROP_ID}: ลบทุกตารางที่มี tenantId = ${DROP_ID} (หลายรอบตาม FK) → Tenant (id+slug ตรง) → User อีเมล ${DROP_ID}-%@qc.invalid + Session ของผู้ใช้นั้น → ChatRateBucket ของคีย์ REST → ไฟล์กุญแจ`);
  } else for (const [i, s] of plan(tid).entries()) console.log(`  ${String(i + 1).padStart(2)}. ${s}`);
  console.log(`  ฐาน: QC5 (ปริยาย) · QC4 สร้างได้เฉพาะ PERF_ALLOW_QC4=1 · ห้าม ${PERF_FORBIDDEN_TENANTS.join(" / ")}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "dry", total: 1, passed: 1, products: N_PRODUCTS, categories: N_CATEGORIES, batch: BATCH })}`);
  process.exit(0);
}

// ═════════════════════════ env (ด่านเดิมของ POS: prod / QC1–3 ตายเสมอ) ═════════════════════════
const { loadPosQcEnv } = (await import("./pos-qc-env.mjs" as string)) as Any;
loadPosQcEnv(SUITE);
const HOST = hostKind();
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const t0 = Date.now();
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)} +${Math.round((Date.now() - t0) / 1000)}s] ${s}`);
const steps: { id: string; ok: boolean; detail: string }[] = [];
const step = (id: string, ok: boolean, detail: string) => {
  steps.push({ id, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${detail}`);
  return ok;
};
function finish(extra: Record<string, unknown>, code?: number): never {
  const failed = steps.filter((s) => !s.ok).map((s) => s.id);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, host: HOST, total: steps.length, passed: steps.length - failed.length, failed, ...extra })}`);
  void P.$disconnect().catch(() => undefined);
  process.exit(code ?? (failed.length ? 1 : 0));
}

async function tenantTables(): Promise<string[]> {
  const rows = (await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[];
  return rows.map((r: Any) => String(r.t));
}
async function countsFor(tid: string, tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid)) as Any[];
    const n = Number(r[0]?.n ?? 0);
    if (n) out[t] = n;
  }
  return out;
}
const pct = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]! : 0;
};

// ═════════════════════════ --preflight (อ่านอย่างเดียว · ตรวจทุกเงื่อนไขที่ writer ตรวจ) ═════════════════════════
if (PREFLIGHT) {
  console.log(`── ${SUITE} --preflight · host ${HOST} · อ่านอย่างเดียว ──`);
  const tid = `posqc-perf-${"0".repeat(6)}`;
  const I = ids(tid);
  // 1) ตารางที่ writer ใช้มีจริง (ชื่อ model ตรง schema ปัจจุบัน)
  const tables = await tenantTables();
  const need = ["Tenant", "BusinessUnit", "AppSystem", "AppSystemUnit", "Membership", "PosProduct", "PosCategory", "PosPriceRule", "PosDevice", "PosStaffPin", "PosShift", "ApiKey", "PaymentProfile", "Customer", "AuditLog", "AccountSystemLink"];
  const all = new Set([...tables, "Tenant"]);
  const missing = need.filter((t) => !all.has(t));
  step("PF1", missing.length === 0, `ตารางของ writer มีครบ (${need.length}) · ตารางที่มี tenantId ${tables.length}${missing.length ? ` · ขาด ${missing.join(",")}` : ""}`);
  // 2) id/slug/อีเมลรูปแบบนี้ยังไม่มีใคร (ซากรอบก่อนต้อง --drop ก่อน)
  const leftovers = (await P.tenant.findMany({ where: { OR: [{ id: { startsWith: "posqc-perf-" } }, { slug: { startsWith: "posqc-perf-" } }] }, select: { id: true, slug: true, createdAt: true } })) as Any[];
  step("PF2", true, `ร้าน posqc-perf-* ที่มีอยู่ ${leftovers.length}${leftovers.length ? ` (${leftovers.map((t: Any) => `${t.id} ${t.createdAt.toISOString()}`).join(" · ")} — --drop ก่อนสร้างใหม่ได้)` : ""}`);
  const emailHit = await P.user.count({ where: { email: { startsWith: "posqc-perf-" } } });
  step("PF3", true, `ผู้ใช้อีเมล posqc-perf-* ${emailHit}`);
  // 3) ร้าน QC เดิมห้ามแตะ — มีอยู่จริงและ id ไม่เข้ารูป perf (ด่าน assertPerfTenantId จับได้)
  const forb = (await P.tenant.findMany({ where: { id: { in: [...PERF_FORBIDDEN_TENANTS] } }, select: { id: true } })) as Any[];
  step("PF4", forb.every((t: Any) => !PERF_ID_RE.test(t.id)), `ร้าน QC เดิม ${forb.map((t: Any) => t.id).join(",") || "-"} ไม่เข้ารูป ${PERF_ID_RE}`);
  // 4) ตัวอ่านธง registerV2 · ราคา/บาร์โค้ด · โปร (ฟังก์ชันบริสุทธิ์ของโมดูล)
  const rs = (await import("@/lib/modules/pos/register-shared" as string)) as Any;
  step("PF5", rs.posRegisterV2On({ pos: { registerV2: true } }) === true, "posRegisterV2On({pos:{registerV2:true}}) = true (ธงที่ seed ตั้ง)");
  const ps = (await import("@/lib/modules/pos/price-shared" as string)) as Any;
  const fakeId = "c" + "x".repeat(24);
  const rules = priceRuleInputs(Array.from({ length: 6 }, () => fakeId), Array.from({ length: 20 }, () => fakeId));
  const parsed = rules.map((r) => ps.parsePriceRuleInput(r));
  step("PF6", parsed.every((p: Any) => p.ok === true), `parsePriceRuleInput รับโปรทั้ง 3 (${parsed.map((p: Any) => (p.ok ? "ok" : `${p.code} ${p.field ?? ""} ${p.message ?? ""}`)).join(" · ")}) · เพดาน ${ps.PRICE_RULE_LIMIT}`);
  const pp = (await import("@/lib/payment/promptpay" as string)) as Any;
  step("PF7", pp.isValidPromptPayId(PROMPTPAY_ID) === true, `isValidPromptPayId(${PROMPTPAY_ID}) = true (savePaymentProfile)`);
  const devMod = (await import("@/lib/modules/pos/device" as string)) as Any;
  const devOk = devMod.isPosDeviceCode(I.deviceCode.replace("000000", "abc123ef")) === true;
  step("PF8", devOk, `isPosDeviceCode(${I.deviceCode}) = ${devOk} · เพดานเครื่องปริยาย ${devMod.posDeviceLimit({})} ต่อสาขา (ใช้ 1)`);
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const sc = scopes.expandBundles(["pos-operate"]) as string[];
  step("PF9", sc.includes("pos.sale.create"), `expandBundles(pos-operate) ${sc.length} scope · มี pos.sale.create (products.lookup)`);
  step("PF10", !!process.env.SESSION_SECRET, `SESSION_SECRET ${process.env.SESSION_SECRET ? "มี (ไม่พิมพ์ค่า)" : "ไม่มี"} — oracle ออกโทเคนผู้ขายด้วย issueStaffToken (ต้องตรงกับเซิร์ฟเวอร์)`);
  // 5) บาร์โค้ดที่จะใช้ไม่ชนกับใครในฐาน (unique ต่อระบบ — ระบบใหม่ชนไม่ได้อยู่แล้ว · ตรวจเผื่อ InvItem)
  const sample = [0, 1, N_PRODUCTS - 1].map(perfBarcode);
  const clash = (await P.posProduct.count({ where: { barcode: { in: sample } } })) + (await P.invItem.count({ where: { barcode: { in: sample } } }));
  step("PF11", true, `บาร์โค้ดตัวอย่าง ${sample.join(",")} มีในฐานแล้ว ${clash} แถว (ต่างระบบ = ไม่ชน)`);
  // 6) RTT ของฐาน (SELECT 1 × 20) → ประมาณเวลาสร้าง
  const rt: number[] = [];
  for (let i = 0; i < 22; i++) {
    const s = performance.now();
    await P.$queryRawUnsafe("SELECT 1");
    if (i >= 2) rt.push(performance.now() - s);
  }
  const rtt = pct(rt, 50);
  // createProduct ≈ 8 คำสั่ง/สินค้า (ระบบ · ผู้กระทำ · สิทธิ์ · ล็อก · หมวด · บาร์โค้ดซ้ำ · insert · audit) ในก้อนเดียวกัน
  const estSec = Math.round((N_PRODUCTS * 8 * rtt) / 1000 + N_CATEGORIES * 8 * (rtt / 1000) + 60);
  step("PF12", rtt > 0, `RTT ฐาน p50 ${rtt.toFixed(1)} ms · p95 ${pct(rt, 95).toFixed(1)} ms → ประมาณเวลาสร้าง ${N_PRODUCTS} สินค้า ≈ ${Math.ceil(estSec / 60)} นาที`);
  // 7) ปลายทางไฟล์กุญแจอยู่นอกรีโป
  step("PF13", !PERF_CREDS_DIR.startsWith(process.cwd()), `ไฟล์กุญแจ ${PERF_CREDS_DIR} (นอกรีโป ${process.cwd()})`);
  step("PF14", true, `host ${HOST}: ${HOST === "qc5" ? "สร้างได้" : process.env.PERF_ALLOW_QC4 === "1" ? "สร้างได้ (PERF_ALLOW_QC4=1)" : "สร้างไม่ได้ — QC4 อ่านอย่างเดียว (preflight/drop)"}`);
  finish({ mode: "preflight", rttMs: Math.round(rtt * 10) / 10, estMin: Math.ceil(estSec / 60) });
}

/** โปรราคา 3 กติกา (อินพุตตรงตัวของ parsePriceRuleInput) */
function priceRuleInputs(catIds: string[], productIds: string[]): Record<string, unknown>[] {
  return [
    { name: "P53 ลด 10% 5 หมวดแรก", kind: "PROMO", adjust: "PERCENT_OFF", valueBp: 1000, categoryIds: catIds.slice(0, 5), priority: 10 },
    { name: "P53 แฮปปี้อาวร์ ฿25", kind: "HAPPY_HOUR", adjust: "PRICE", valueSatang: 2500, productIds: productIds.slice(0, 20), weekdays: [0, 1, 2, 3, 4, 5, 6], timeFrom: "14:00", timeTo: "17:00", priority: 20 },
    { name: "P53 ลด ฿5 หมวด 6", kind: "PROMO", adjust: "AMOUNT_OFF", valueSatang: 500, categoryIds: catIds.slice(5, 6), priority: 5 },
  ];
}

// ═════════════════════════ --drop <tenantId> ═════════════════════════
type WipeReport = { tables: number; deleted: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; bucketsLeft: number; err: string };
async function wipe(tid: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, deleted: 0, left: {}, tenantLeft: 0, usersLeft: 0, bucketsLeft: 0, err: "" };
  const t = (await P.$queryRawUnsafe(`SELECT id, slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
  if (t.length && t[0].slug !== tid) {
    rep.err = `slug ไม่ตรง id (${t[0].slug}) — ไม่ลบ`;
    return rep;
  }
  const keyIds = ((await P.$queryRawUnsafe(`SELECT id FROM "ApiKey" WHERE "tenantId" = $1`, tid).catch(() => [])) as Any[]).map((r: Any) => String(r.id));
  const tables = await tenantTables();
  rep.tables = tables.length;
  // FK วนในตัว (เดียวกับ qc-pos-p3.8 wipeTenant) ก่อนลบ
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "PosProduct" SET "parentId" = NULL WHERE "tenantId" = $1 AND "parentId" IS NOT NULL`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        for (;;) {
          const n = Number(await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE ctid IN (SELECT ctid FROM "${tb}" WHERE "tenantId" = $1 LIMIT 20000)`, tid));
          rep.deleted += n;
          if (n < 20000) break;
        }
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  const users = ((await P.$queryRawUnsafe(`SELECT id FROM "User" WHERE email LIKE $1`, `${tid}-%@qc.invalid`)) as Any[]).map((r: Any) => String(r.id));
  if (users.length) await P.session.deleteMany({ where: { userId: { in: users } } }).catch(() => {});
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $1`, tid);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 120)}`;
  }
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${tid}-%@qc.invalid`).catch((e: Error) => {
    rep.err ||= `ลบ User ไม่ได้: ${e.message.slice(0, 120)}`;
  });
  for (const k of keyIds) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${k}`).catch(() => {});
  rep.left = await countsFor(tid, tables);
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1 OR slug = $1`, tid)) as Any[])[0]?.n ?? 0);
  rep.usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${tid}-%@qc.invalid`)) as Any[])[0]?.n ?? 0);
  for (const k of keyIds) rep.bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%:${k}`)) as Any[])[0]?.n ?? 0);
  return rep;
}
if (DROP_ID) {
  assertPerfTenantId(DROP_ID);
  log(`ลบร้าน ${DROP_ID} · host ${HOST}`);
  let w = await wipe(DROP_ID);
  if (!w.err && (Object.keys(w.left).length || w.tenantLeft)) w = await wipe(DROP_ID); // drain พื้นหลังของเซิร์ฟเวอร์อาจเขียนเพิ่มระหว่างลบ
  const residue = Object.values(w.left).reduce((a, b) => a + b, 0) + w.tenantLeft + w.usersLeft + w.bucketsLeft;
  step("D1", !w.err, `ลบ ${w.deleted} แถวจาก ${w.tables} ตาราง${w.err ? ` · ${w.err}` : ""}`);
  step("D2", residue === 0, `ค้าง ${residue} (ตาราง ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft} · User ${w.usersLeft} · bucket ${w.bucketsLeft})`);
  if (existsSync(credsPath(DROP_ID))) rmSync(credsPath(DROP_ID), { force: true });
  step("D3", !existsSync(credsPath(DROP_ID)), `ไฟล์กุญแจ ${credsPath(DROP_ID)} ลบแล้ว`);
  console.log(`DROP_SUMMARY ${JSON.stringify({ tenantId: DROP_ID, deleted: w.deleted, residue })}`);
  finish({ mode: "drop", tenantId: DROP_ID, deleted: w.deleted, residue });
}

// ═════════════════════════ สร้าง (QC5 · หรือ QC4 + PERF_ALLOW_QC4=1) ═════════════════════════
if (HOST === "qc4" && process.env.PERF_ALLOW_QC4 !== "1") die("QC4 = ฐานข้อสอบ — สร้างร้านวัดผลได้บน QC5 เท่านั้น (ตั้ง PERF_ALLOW_QC4=1 เมื่อผู้คุมสั่งเท่านั้น · CD-P53-O2)", 4);
const TID = RESUME_ID ?? `posqc-perf-${randomBytes(6).toString("hex").slice(0, 8)}`;
assertPerfTenantId(TID);
const I = ids(TID);
const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
const catalog = (await import("@/lib/modules/pos/catalog" as string)) as Any;
const priceRule = (await import("@/lib/modules/pos/price-rule" as string)) as Any;
const memberFacade = (await import("@/lib/modules/member" as string)) as Any;
const payment = (await import("@/lib/payment/service" as string)) as Any;
const device = (await import("@/lib/modules/pos/device" as string)) as Any;
const staffPin = (await import("@/lib/modules/pos/staff-pin" as string)) as Any;
const apiKeys = (await import("@/lib/api-keys/service" as string)) as Any;
const scopesMod = (await import("@/lib/api-keys/scopes" as string)) as Any;

type Creds = {
  $note: string; tenantId: string; slug: string; host: HostKind; createdAt: string; done: Record<string, boolean>;
  systems: Record<string, string>; units: { a: string; b: string };
  users: { owner: typeof I.owner; cashier: typeof I.cashier };
  deviceCode: string; deviceRowId: string; pins: Record<string, string>;
  apiKey: { id: string; rawKey: string; prefix: string } | null; memberId: string;
  catalogue: { products: number; categories: number; priceRules: number; barcodeOf: string };
};
let C: Creds;
function saveCreds(): void {
  mkdirSync(PERF_CREDS_DIR, { recursive: true });
  writeFileSync(credsPath(TID), JSON.stringify(C, null, 2) + "\n", { mode: 0o600 });
  chmodSync(credsPath(TID), 0o600);
}
if (RESUME_ID) {
  if (!existsSync(credsPath(TID))) die(`--resume: ไม่มีไฟล์กุญแจ ${credsPath(TID)}`);
  C = JSON.parse(readFileSync(credsPath(TID), "utf8")) as Creds;
  log(`ต่อร้าน ${TID} (ขั้นที่เสร็จ: ${Object.keys(C.done).filter((k) => C.done[k]).join(",") || "-"})`);
} else {
  C = {
    $note: "เขียนโดย scripts/seed-pos-perf.mts — ร้านวัดผลชั่วคราว (ใบ P5.3) · ลบด้วย --drop · ห้าม commit",
    tenantId: TID, slug: TID, host: HOST, createdAt: new Date().toISOString(), done: {},
    systems: {}, units: { a: I.unitA, b: I.unitB }, users: { owner: I.owner, cashier: I.cashier },
    deviceCode: I.deviceCode, deviceRowId: "", pins: {}, apiKey: null, memberId: "",
    catalogue: { products: 0, categories: 0, priceRules: 0, barcodeOf: "perfBarcode(i) = 8859 + i 8 หลัก + check digit · ชื่อ perfName(i)" },
  };
}
log(`ร้าน ${TID} · host ${HOST} · สินค้า ${N_PRODUCTS} · หมวด ${N_CATEGORIES}`);
let crashed = "";
try {
  // ── 1. ร้าน · สาขา · ระบบ (แบบ seed-pos-qc / qc-pos-p2.13) ──
  if (!C.done.core) {
    const clash = await P.tenant.findFirst({ where: { OR: [{ id: TID }, { slug: TID }] }, select: { id: true } });
    if (clash && !RESUME_ID) throw new Error(`ร้าน ${TID} มีอยู่แล้ว`);
    if (!clash) await P.tenant.create({ data: { id: TID, name: `ร้านวัดผล P5.3 ${TID.slice(-8)}`, slug: TID } });
    for (const [id, name] of [[I.unitA, "สาขา A (วัดผล)"], [I.unitB, "สาขา B"]] as const)
      if (!(await P.businessUnit.findFirst({ where: { id, tenantId: TID } }))) await P.businessUnit.create({ data: { id, tenantId: TID, type: "SHOP", name, slug: id } });
    for (const type of ["POS", "INVENTORY", "ACCOUNT", "MEMBER"] as const) {
      if (!C.systems[type]) C.systems[type] = (await sysSvc.createSystem(TID, type, `${type} · วัดผล P5.3`)).id;
      for (const u of [I.unitA, I.unitB]) await sysSvc.linkUnit(TID, C.systems[type], u);
    }
    const s0 = (await P.appSystem.findUnique({ where: { id: C.systems.POS }, select: { settings: true } }))?.settings;
    const cur = s0 && typeof s0 === "object" && !Array.isArray(s0) ? (s0 as Record<string, Any>) : {};
    const pos = cur.pos && typeof cur.pos === "object" ? cur.pos : {};
    await P.appSystem.update({ where: { id: C.systems.POS }, data: { settings: { ...cur, pos: { ...pos, registerV2: true } } } });
    await gl.ensureAccounting({ tenantId: TID, systemId: C.systems.ACCOUNT });
    if (!(await P.accountSystemLink.findFirst({ where: { tenantId: TID, systemId: C.systems.ACCOUNT, linkedKind: "POS", linkedId: C.systems.POS } })))
      await P.accountSystemLink.create({ data: { tenantId: TID, systemId: C.systems.ACCOUNT, linkedKind: "POS", linkedId: C.systems.POS } });
    for (const [u, role, unitAccess, permissions] of [[I.owner, "OWNER", ["*"], {}], [I.cashier, "STAFF", [I.unitA], CASHIER_PERMS]] as const) {
      const byEmail = await P.user.findUnique({ where: { email: u.email }, select: { id: true } });
      if (byEmail && byEmail.id !== u.userId) throw new Error(`อีเมล ${u.email} เป็นของผู้ใช้อื่น`);
      if (!byEmail) await P.user.create({ data: { id: u.userId, email: u.email, name: u.name } });
      if (!(await P.membership.findFirst({ where: { userId: u.userId, tenantId: TID } })))
        await P.membership.create({ data: { id: u.membershipId, userId: u.userId, tenantId: TID, role, unitAccess: [...unitAccess], permissions, acceptedAt: new Date() } });
    }
    C.done.core = true;
    saveCreds();
    step("S1", true, `ร้าน + 2 สาขา + ระบบ ${Object.entries(C.systems).map(([k, v]) => `${k}=${v}`).join(" ")} + ผู้ใช้ 2`);
  }
  const owner = { userId: I.owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const catCtx = { tenantId: TID, systemId: C.systems.POS, actorUserId: I.owner.userId };
  const regCtx = { tenantId: TID, systemId: C.systems.POS, unitId: I.unitA };

  // ── 2. หมวด ──
  const cats = (await P.posCategory.findMany({ where: { tenantId: TID, systemId: C.systems.POS }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } })) as Any[];
  for (let k = cats.length; k < N_CATEGORIES; k++) {
    const name = `P53 หมวด ${String(k + 1).padStart(2, "0")}`;
    const r = await catalog.createCategory(catCtx, { name, nameEn: `P53 Category ${k + 1}`, sortOrder: k });
    cats.push({ id: r.id, name });
  }
  C.catalogue.categories = cats.length;
  step("S2", cats.length === N_CATEGORIES, `หมวด ${cats.length}/${N_CATEGORIES} (catalog.createCategory)`);

  // ── 3. สินค้า (ก้อนละ BATCH ในธุรกรรมเดียว · ล็อกร้านของ createProduct ซ้อนในธุรกรรมเดียวกันได้) ──
  const have = new Set(((await P.posProduct.findMany({ where: { tenantId: TID, systemId: C.systems.POS }, select: { barcode: true } })) as Any[]).map((r: Any) => String(r.barcode)));
  const todo = Array.from({ length: N_PRODUCTS }, (_, i) => i).filter((i) => !have.has(perfBarcode(i)));
  log(`สินค้า: มีแล้ว ${have.size} · ต้องสร้าง ${todo.length}`);
  let made = 0;
  for (let b = 0; b < todo.length; b += BATCH) {
    const chunk = todo.slice(b, b + BATCH);
    for (let attempt = 1; ; attempt++) {
      try {
        await P.$transaction(
          async (tx: Any) => {
            for (const i of chunk)
              await catalog.createProduct(catCtx, { name: perfName(i), nameEn: `P53 Product ${i + 1}`, kind: "PRODUCT", categoryId: cats[i % cats.length]!.id, basePriceSatang: perfPrice(i), vatRateBp: 700, barcode: perfBarcode(i), unitId: null }, tx);
          },
          { timeout: 120_000, maxWait: 20_000 },
        );
        break;
      } catch (e) {
        const code = (e as Any)?.code ?? "";
        if (attempt >= 4) throw new Error(`สินค้าก้อน ${b / BATCH + 1} (ลำดับ ${chunk[0]}–${chunk[chunk.length - 1]}) ล้ม ${attempt} ครั้ง: ${code} ${(e as Error).message.slice(0, 160)}`);
        log(`  ก้อน ${b / BATCH + 1} ล้ม (${code || (e as Error).message.slice(0, 60)}) — ลองใหม่ ${attempt}`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    made += chunk.length;
    if ((b / BATCH) % 20 === 0 || made === todo.length) log(`  สินค้า ${have.size + made}/${N_PRODUCTS}`);
  }
  const nProd = await P.posProduct.count({ where: { tenantId: TID, systemId: C.systems.POS, archivedAt: null } });
  const nBar = await P.posProduct.count({ where: { tenantId: TID, systemId: C.systems.POS, barcode: { not: null } } });
  C.catalogue.products = nProd;
  saveCreds();
  step("S3", nProd === N_PRODUCTS && nBar === N_PRODUCTS, `สินค้า ${nProd}/${N_PRODUCTS} · มีบาร์โค้ด ${nBar} (catalog.createProduct)`);

  // ── 4. โปรราคา ──
  const ruleNames = new Set(((await P.posPriceRule.findMany({ where: { tenantId: TID, systemId: C.systems.POS }, select: { name: true } })) as Any[]).map((r: Any) => r.name));
  const firstProducts = ((await P.posProduct.findMany({ where: { tenantId: TID, systemId: C.systems.POS }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20, select: { id: true } })) as Any[]).map((r: Any) => r.id);
  const ruleErr: string[] = [];
  for (const r of priceRuleInputs(cats.map((c: Any) => c.id), firstProducts)) {
    if (ruleNames.has(r.name)) continue;
    const res = await priceRule.savePriceRule(regCtx, owner, r);
    if (!res.ok) ruleErr.push(`${r.name}: ${res.code} ${res.field ?? ""}`);
  }
  C.catalogue.priceRules = await P.posPriceRule.count({ where: { tenantId: TID, systemId: C.systems.POS, archivedAt: null } });
  step("S4", ruleErr.length === 0 && C.catalogue.priceRules === 3, `โปรราคา ${C.catalogue.priceRules}/3 (price-rule.savePriceRule)${ruleErr.length ? ` · ${ruleErr.join(" · ")}` : ""}`);

  // ── 5. สมาชิก · พร้อมเพย์ ──
  const m = await memberFacade.findOrCreate({ tenantId: TID, memberSystemId: C.systems.MEMBER, phone: "0899000001", name: "สมาชิกวัดผล (P5.3)", source: "STAFF" });
  C.memberId = m.id;
  await payment.savePaymentProfile({ tenantId: TID, actorUserId: I.owner.userId }, { promptpayId: PROMPTPAY_ID, displayName: "ร้านวัดผล P5.3" });
  const ppRow = await P.paymentProfile.findUnique({ where: { tenantId: TID } });
  step("S5", !!m.id && ppRow?.promptpayId === PROMPTPAY_ID, `สมาชิก ${m.id} (member.findOrCreate) · พร้อมเพย์ ${ppRow?.promptpayId ?? "-"} (payment.savePaymentProfile)`);

  // ── 6. เครื่อง + PIN ──
  const rg = await device.registerDevice(regCtx, owner, { name: "เครื่องวัดผล P5.3", deviceCode: I.deviceCode });
  if (!rg.ok) throw new Error(`registerDevice ${I.deviceCode} → ${rg.code}`);
  C.deviceRowId = rg.device.id;
  for (const [k, u] of [["owner", I.owner], ["cashier", I.cashier]] as const) {
    if (C.pins[k]) continue;
    let last = "";
    for (let t = 0; t < 8 && !C.pins[k]; t++) {
      const pin = String(randomInt(100000, 1000000));
      const r = await staffPin.setStaffPin(regCtx, owner, { userId: u.userId, pin });
      if (r.ok) C.pins[k] = pin;
      else last = r.code;
      if (!r.ok && r.code !== "WEAK_PIN") break;
    }
    if (!C.pins[k]) throw new Error(`setStaffPin ${k} → ${last}`);
  }
  saveCreds();
  step("S6", !!C.deviceRowId && !!C.pins.owner && !!C.pins.cashier, `เครื่อง ${I.deviceCode} (${C.deviceRowId}) · PIN เจ้าของ/แคชเชียร์ (ไม่พิมพ์ค่า · อยู่ในไฟล์กุญแจ)`);

  // ── 7. คีย์ REST ──
  if (!C.apiKey) {
    const k = await apiKeys.createApiKey({ tenantId: TID }, "วัดผล P5.3 (lookup)", { scopes: scopesMod.expandBundles(["pos-operate"]), systemId: C.systems.POS, expiresAt: new Date(Date.now() + 7 * 86_400_000), createdById: I.owner.userId });
    C.apiKey = { id: k.id, rawKey: k.rawKey, prefix: k.prefix };
  }
  C.done.all = true;
  saveCreds();
  step("S7", !!C.apiKey, `คีย์ REST ${C.apiKey?.prefix ?? "-"}… (${C.apiKey?.id ?? "-"}) · api-keys.createApiKey`);
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  step("S0", false, `ล้ม: ${crashed.slice(0, 300)}`);
  console.error(`⚠️ ร้าน ${TID} ค้างครึ่งทาง — ต่อด้วย --resume ${TID} หรือลบด้วย --drop ${TID}`);
  if (existsSync(PERF_CREDS_DIR) || C.done.core) saveCreds();
}
const counts = await countsFor(TID, await tenantTables());
console.log(`\nร้าน ${TID} · ไฟล์กุญแจ ${credsPath(TID)} · ${Math.round((Date.now() - t0) / 1000)} วิ`);
console.log(`  แถวต่อตาราง ${JSON.stringify(counts)}`);
console.log(`  ต่อไป: oracle = bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --base http://127.0.0.1:<port> --tenant ${TID}`);
console.log(`  ลบ: bash scripts/iso.sh bash scripts/qc5.sh pnpm exec tsx scripts/seed-pos-perf.mts --drop ${TID}`);
console.log(`SEED_SUMMARY ${JSON.stringify({ tenantId: TID, host: HOST, creds: credsPath(TID), products: C.catalogue.products, categories: C.catalogue.categories, priceRules: C.catalogue.priceRules, sec: Math.round((Date.now() - t0) / 1000) })}`);
finish({ mode: "create", tenantId: TID, creds: credsPath(TID), counts });
