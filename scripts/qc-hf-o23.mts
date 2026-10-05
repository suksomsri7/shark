// QC — HF-O23: หน้าขายเดิม (`registerSaleAction`) ยึดคีย์กันซ้ำของโมดูลอื่นได้ (idempotency-key squatting)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh env QC_ENV_FILE=.env.qc pnpm exec tsx scripts/qc-hf-o23.mts
//      (DATABASE_URL/DIRECT_URL ต้องเป็น QC4 · host ep-frosty-lab — ไม่ใช่ = exit 4 ก่อนเขียนแถวแรก)
//
// ปัญหา: คีย์จาก client ถูกใช้ค้น/สร้าง PosSale ตรง ๆ ในช่อง unique(tenantId, idempotencyKey) เดียวกับ
//   hotel-sale-<id> · booking-sale-<id> · ticket-sale-<id> · ecom-<id> · rental-<id> · clinic-<id> · school-<id> · subscription-<id> · …
//   ⇒ (ก) จองคีย์ล่วงหน้า → createSale ของโมดูลนั้นคืนบิลปลอม (ห้อง/ออเดอร์ไม่ถูกเก็บเงิน) · (ข) อ่านเลขใบเสร็จ/ยอดของบิลโมดูลอื่น
// แก้: src/lib/modules/pos/legacy-key.ts — คีย์ client [A-Za-z0-9_-]{8,100} · เก็บ "pos1:"+คีย์ · คืนเฉพาะบิล POS สาขาเดียวกัน
//      · คีย์เปล่า (แท็บก่อน deploy) ค้นเฉพาะเมื่อไม่มีแถว pos1: และต้องเป็นบิล POS สาขาเดียวกัน
//
// --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต/pure (ST*) ไม่โหลด env/prisma (exit 1 ถ้าแดง)
// SKIP (exit 0) เมื่อของ HF-O23 ยังไม่มี · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
// DB: ร้านชั่วคราว slug qc-hfo23-<stamp> · ลบทั้งหมดใน finally · Z1 ตรวจไม่เหลือแถว
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-hf-o23";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
const QC4_HOST_MARK = "ep-frosty-lab";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) ═════════════════════════
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`O23-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  D("ST1", "X2", "[static] legacy-key.ts: POS1_KEY_PREFIX = \"pos1:\" · isPosClientKey = /^[A-Za-z0-9_-]{8,100}$/ · export lookupPosKey/posStoredKey"),
  D("ST2", "X2", "[static] registerSaleAction: ตรวจ isPosClientKey ก่อน · idempotencyKey = posStoredKey(…) · ค้นผ่าน lookupPosKey · taken = error · ไม่มี posSale.findUnique ด้วยคีย์ดิบในตัว action"),
  D("ST3", "X2", "[static] lookupPosKey: คืนเฉพาะ sourceModule === \"POS\" && unitId เดียวกัน · ค้นคีย์เปล่าหลังไม่เจอแถว pos1: เท่านั้น"),
  D("ST4", "-", "[static] register-ui newKey: crypto.randomUUID + ทางสำรองไม่มี \".\" (Math.random().toString(36))"),
  D("ST5", "X2", "[pure] isPosClientKey: รับ UUID · k-<ts>-<base36> · hotel-sale-<cuid> · ปฏิเสธ pos1:… · reg2:… · มีจุด/ช่องว่าง · <8 · >100 · ไม่ใช่สตริง · posStoredKey ใส่ pos1:"),
  D("ST6", "X2", "[static] ทางเข้าอื่นใน src/lib/actions + src/app/api ไม่ส่งคีย์จาก client ตรงเข้า createSale/posSale (ผู้เรียก createSale ใน actions/api = pos.ts · booking.ts ที่ใช้คีย์ booking-sale-<id> ของเซิร์ฟเวอร์)"),
  D("DB1", "X2", "จองคีย์: คีย์ client hotel-sale-<x> → lookupPosKey = none · ขายด้วย posStoredKey → แถวเก็บเป็น pos1:hotel-sale-<x> (ไม่ใช่คีย์เปล่า)"),
  D("DB2", "X4", "โมดูลโรงแรมขายทีหลังด้วยคีย์เปล่า hotel-sale-<x> → ได้บิลใหม่ของตัวเอง (id ต่างจากบิลจอง · sourceModule HOTEL · ยอดของโรงแรม)"),
  D("DB3", "-", "กดซ้ำ: lookupPosKey(สาขาเดิม, คีย์เดิม) = replay บิลเดิม (receiptNo/ยอดเดียวกัน · legacyBareKey false) · สาขาอื่นของร้านเดียวกัน = taken (ไม่คืนบิล)"),
  D("DB4", "X2", "อ่านบิลโมดูลอื่น: บิล HOTEL คีย์เปล่า hotel-sale-<y> → lookupPosKey(คีย์นั้น) = none (ไม่คืนเลขใบเสร็จ/ยอด) · ขายต่อด้วย pos1: ได้ · บิลโรงแรมไม่ถูกแตะ"),
  D("DB5", "-", "ช่วงเปลี่ยนรุ่น: บิล POS คีย์เปล่า (ก่อน deploy) สาขาเดียวกัน → replay legacyBareKey true · สาขาอื่น → none"),
  D("Z1", "-", "คืนสภาพ: ร้านชั่วคราว qc-hfo23-* ถูกลบ · ไม่เหลือ PosSale/PosSaleLine/PosPayment/OutboxEvent ของร้านนั้น"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  if (!TITLE.has(`O23-${id}`)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(`O23-${id}`, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [O23-${id}] ${TITLE.get(`O23-${id}`)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const squash = (s: string) => s.replace(/\s+/g, " ");
const short = (v: unknown, n = 200) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
/** ตัวฟังก์ชัน (จาก `export async function name` ถึง `export` ถัดไป) */
function fnBody(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

const KEY_FILE = "src/lib/modules/pos/legacy-key.ts";
const ACTION_FILE = "src/lib/actions/pos.ts";
const UI_FILE = "src/lib/modules/pos/register-ui.tsx";
const STATIC_IDS = CHECKS.map(([id]) => id).filter((id) => id.startsWith("O23-ST"));

async function runStatic(): Promise<void> {
  const k = rd(KEY_FILE);
  const ks = squash(k);
  chk(
    "ST1",
    ks.includes(`POS1_KEY_PREFIX = "pos1:"`) && k.includes("/^[A-Za-z0-9_-]{8,100}$/") && /export async function lookupPosKey\(/.test(k) && /export const posStoredKey\b/.test(k),
    "prefix + charset + exports",
    k ? "บางอย่างขาด" : `${KEY_FILE} ไม่มี`,
  );

  const act = fnBody(rd(ACTION_FILE), "registerSaleAction");
  const as = squash(act);
  const okIdx = as.indexOf("isPosClientKey(clientKey)");
  const lookIdx = as.indexOf("lookupPosKey(prisma, tenantId, input.unitId, clientKey)");
  const createIdx = as.indexOf("createSale(");
  chk(
    "ST2",
    okIdx > 0 &&
      lookIdx > okIdx &&
      createIdx > lookIdx &&
      as.includes("const idempotencyKey = posStoredKey(clientKey)") &&
      /if \(prior\.kind === "taken"\) return \{ status: "error"/.test(as) &&
      !/posSale\.findUnique/.test(act) &&
      /createSale\(\{[^}]*?sourceModule: "POS", idempotencyKey,/.test(as),
    "ตรวจคีย์ → lookupPosKey → createSale(pos1:)",
    act ? `okIdx=${okIdx} lookIdx=${lookIdx} createIdx=${createIdx} rawFind=${/posSale\.findUnique/.test(act)}` : "ไม่พบ registerSaleAction",
  );

  const lk = squash(fnBody(k, "lookupPosKey"));
  const prefIdx = lk.indexOf("idempotencyKey: posStoredKey(clientKey)");
  const bareIdx = lk.indexOf("idempotencyKey: clientKey }");
  const retPrefIdx = lk.indexOf("if (pref) {");
  chk(
    "ST3",
    lk.includes(`r.sourceModule === "POS" && r.unitId === unitId`) && prefIdx > 0 && retPrefIdx > prefIdx && bareIdx > retPrefIdx && lk.includes("if (bare && ownPos(bare))") && lk.includes("if (!ownPos(pref)) return { kind: \"taken\" }"),
    "POS+สาขา · pos1: ก่อน · คีย์เปล่าหลัง",
    `prefIdx=${prefIdx} retPref=${retPrefIdx} bareIdx=${bareIdx}`,
  );

  const ui = squash(rd(UI_FILE));
  const nk = /const newKey = \(\) =>(.*?);/.exec(ui)?.[1] ?? "";
  chk("ST4", nk.includes("crypto.randomUUID()") && nk.includes("Math.random().toString(36)") && !/\$\{Math\.random\(\)\}/.test(nk), "UUID + base36", nk || "ไม่พบ newKey");

  // ST5 — pure (legacy-key.ts ไม่ import ของ runtime ใด ๆ — import type เท่านั้น)
  let st5 = "";
  try {
    const m = (await import("@/lib/modules/pos/legacy-key" as string)) as Any;
    const yes = ["3f2c1a9e-5b7d-4c2e-9f10-aa11bb22cc33", `k-${Date.now()}-${Math.random().toString(36).slice(2)}`, "hotel-sale-cm1abcdefg0001", "ABCDEFGH", "a".repeat(100)];
    const no: unknown[] = ["pos1:3f2c1a9e-5b7d", "reg2:abcdefghij", "k-123-0.5555555", "abc def ghij", "short7x", "a".repeat(101), "", 12345678, null, undefined];
    const badYes = yes.filter((v) => !m.isPosClientKey(v));
    const badNo = no.filter((v) => m.isPosClientKey(v));
    const stored = m.posStoredKey("hotel-sale-x1234567");
    if (badYes.length || badNo.length || stored !== "pos1:hotel-sale-x1234567" || m.POS1_KEY_PREFIX !== "pos1:") st5 = `badYes=${short(badYes)} badNo=${short(badNo)} stored=${stored}`;
  } catch (e) {
    st5 = `โหลดไม่ได้: ${(e as Error).message.slice(0, 120)}`;
  }
  chk("ST5", !st5, "ชุดอักษร/ความยาว/คำนำหน้าถูก", st5 || "ok");

  // ST6 — ทางเข้าอื่น
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir: string, out: string[] = []): string[] => {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) return out;
    for (const n of readdirSync(abs)) {
      const p = `${dir}/${n}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(n)) out.push(p);
    }
    return out;
  };
  const files = [...walk("src/lib/actions"), ...walk("src/app/api")];
  const callers = files.filter((f) => /\bcreateSale\(|posSale\.(create|upsert)\(/.test(rd(f))).sort();
  const booking = squash(rd("src/lib/actions/booking.ts"));
  const expected = ["src/lib/actions/booking.ts", "src/lib/actions/pos.ts"];
  chk(
    "ST6",
    JSON.stringify(callers) === JSON.stringify(expected) && booking.includes("idempotencyKey: `booking-sale-${appt.id}`"),
    expected.join(","),
    callers.join(",") || "(ไม่มี)",
  );
}

// ═════════════════════════ --no-db ═════════════════════════
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, KEY_FILE))) skipReasons.push(`${KEY_FILE} ยังไม่มี`);

if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต/pure (ข้ออื่นต้องใช้ DB)`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id.slice(4), false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ env (QC4 เท่านั้น) ═════════════════════════
process.env.QC_ENV_FILE ??= ".env.qc"; // ปริยายของ loadLegacyQcEnv คือ .env (prod) — ชุดนี้ไม่ยอม
if (process.env.QC_ENV_FILE === ".env") {
  console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env คือ production — ห้าม`);
  process.exit(4);
}
const { loadLegacyQcEnv } = await import("./qc-env-guard.mjs" as string);
loadLegacyQcEnv(SUITE);
function assertQc4BeforeWrite(): void {
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${QC4_HOST_MARK}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}
assertQc4BeforeWrite();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของ HF-O23 ยังไม่มี`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service")) as Any;
const pos = (await import("@/lib/modules/pos/service")) as Any;
let lk: Any = null;
try {
  lk = await import("@/lib/modules/pos/legacy-key" as string);
} catch (e) {
  console.log(`  (โหลด legacy-key ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
}
const lookup = async (tid: string, unitId: string, key: string): Promise<Any> => {
  if (typeof lk?.lookupPosKey !== "function") return { kind: "MISSING" };
  try {
    return await lk.lookupPosKey(prisma, tid, unitId, key);
  } catch (e) {
    return { kind: "THROW", message: (e as Error).message.slice(0, 160) };
  }
};
const stored = (k: string) => (typeof lk?.posStoredKey === "function" ? lk.posStoredKey(k) : `MISSING:${k}`);

const stamp = Date.now();
const SLUG = `qc-hfo23-${stamp}`;
const tenants: string[] = [];

async function runDb(): Promise<void> {
  const t = await P.tenant.create({ data: { name: "QC HF-O23 key squat", slug: SLUG } });
  tenants.push(t.id);
  const tid = t.id as string;
  const u1 = await P.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขา 1", slug: `hfo23-a-${stamp}` } });
  const u2 = await P.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขา 2", slug: `hfo23-b-${stamp}` } });
  const posSys = await sys.createSystem(tid, "POS", "POS");
  await sys.linkUnit(tid, posSys.id, u1.id);
  await sys.linkUnit(tid, posSys.id, u2.id);
  const sale = (unitId: string, key: string, sourceModule: string, satang: number) =>
    pos.createSale({ tenantId: tid, unitId, systemId: posSys.id, sourceModule, idempotencyKey: key, lines: [{ name: `QC ${sourceModule}`, qty: 1, unitPriceSatang: satang }], payMethods: [{ type: "CASH", amountSatang: satang }] });

  // DB1 — จองคีย์ของโรงแรม
  const X = `hotel-sale-qcx${stamp}`;
  const pre = await lookup(tid, u1.id, X);
  const squat = await sale(u1.id, stored(X), "POS", 100);
  const squatRow = await P.posSale.findUnique({ where: { id: squat.saleId }, select: { idempotencyKey: true, sourceModule: true } });
  const bareRowAfterSquat = await P.posSale.count({ where: { tenantId: tid, idempotencyKey: X } });
  chk("DB1", pre.kind === "none" && squatRow?.idempotencyKey === `pos1:${X}` && bareRowAfterSquat === 0, `none · pos1:${X} · คีย์เปล่า 0 แถว`, `${pre.kind} · ${squatRow?.idempotencyKey} · bare=${bareRowAfterSquat}`);

  // DB2 — โรงแรมขายจริงทีหลัง
  const hotel = await sale(u1.id, X, "HOTEL", 250_000);
  const hotelRow = await P.posSale.findUnique({ where: { id: hotel.saleId }, select: { idempotencyKey: true, sourceModule: true, grandTotalSatang: true } });
  chk(
    "DB2",
    hotel.saleId !== squat.saleId && hotelRow?.sourceModule === "HOTEL" && hotelRow?.idempotencyKey === X && hotel.grandTotalSatang === 250_000,
    "บิลใหม่ HOTEL 250000",
    `same=${hotel.saleId === squat.saleId} ${short(hotelRow)}`,
  );

  // DB3 — กดซ้ำ
  const re1 = await lookup(tid, u1.id, X);
  const re2 = await lookup(tid, u2.id, X);
  chk(
    "DB3",
    re1.kind === "replay" && re1.sale?.saleId === squat.saleId && re1.sale?.receiptNo === squat.receiptNo && re1.sale?.grandTotalSatang === 100 && re1.sale?.legacyBareKey === false && re2.kind === "taken",
    "replay บิลเดิม · สาขาอื่น taken",
    `${short(re1)} · ${re2.kind}`,
  );

  // DB4 — อ่านบิลโมดูลอื่นด้วยคีย์เปล่า
  const Y = `hotel-sale-qcy${stamp}`;
  const hotelY = await sale(u1.id, Y, "HOTEL", 777_700);
  const peek = await lookup(tid, u1.id, Y);
  const after = await sale(u1.id, stored(Y), "POS", 50);
  const hotelYRow = await P.posSale.findUnique({ where: { id: hotelY.saleId }, select: { idempotencyKey: true, sourceModule: true, grandTotalSatang: true, status: true } });
  chk(
    "DB4",
    peek.kind === "none" && !peek.sale && after.saleId !== hotelY.saleId && after.grandTotalSatang === 50 && hotelYRow?.idempotencyKey === Y && hotelYRow?.grandTotalSatang === 777_700 && hotelYRow?.sourceModule === "HOTEL",
    "none · ขายใหม่ 50 · บิลโรงแรมเดิม",
    `${short(peek)} · after=${after.grandTotalSatang} · ${short(hotelYRow)}`,
  );

  // DB5 — แท็บก่อน deploy (บิล POS คีย์เปล่า)
  const L = `legacy${stamp}`;
  const legacy = await sale(u1.id, L, "POS", 300);
  const b1 = await lookup(tid, u1.id, L);
  const b2 = await lookup(tid, u2.id, L);
  chk(
    "DB5",
    b1.kind === "replay" && b1.sale?.saleId === legacy.saleId && b1.sale?.legacyBareKey === true && b1.sale?.grandTotalSatang === 300 && b2.kind === "none",
    "replay legacyBareKey · สาขาอื่น none",
    `${short(b1)} · ${b2.kind}`,
  );
}

const RESIDUE_MODELS = ["posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent"] as const;
async function cleanup(): Promise<void> {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ลบต่อ */
    }
  };
  for (const id of tenants) {
    for (const m of ["posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent", "auditLog", "appNotification", "opsLog", "party", "appSystemUnit", "appSystem", "businessUnit"]) {
      await d(() => P[m]?.deleteMany({ where: { tenantId: id } }));
    }
    await d(() => P.tenant.delete({ where: { id } }));
  }
}

let crashed = "";
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  }
}
const residue: string[] = [];
for (const id of tenants) {
  for (const m of RESIDUE_MODELS) {
    const n = await P[m].count({ where: { tenantId: id } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
}
const leftTenants = await P.tenant.count({ where: { slug: { startsWith: "qc-hfo23-" } } }).catch(() => -1);
chk("Z1", residue.length === 0 && leftTenants === 0 && tenants.length > 0, "ไม่เหลือแถว", `tenants=${tenants.length} left=${leftTenants} ${residue.join(",")}`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id.slice(4), false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
