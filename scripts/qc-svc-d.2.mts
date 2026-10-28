// QC — SVC D.2 · facade บัญชีสำหรับหอ · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-d.2.md (ผูกตรงตัว) · ledger/SVC-MASTER-PLAN.md แถว D.2 · ledger/SVC-CORE-CONTRACT.md §6.2
//        ledger/DESIGN-DORM-HOTEL.md §8 แถวบัญชี · A2 · A9 · ใบสั่ง D.1 §7 (VAT ต่อบรรทัด = computeTotals) · ใบสั่ง R0.6 §8 carry
//
// กลุ่มข้อ:
//   F  ไฟล์ · export · ALLOWED_EDGES dorm→account · bridge import ผ่าน facade · account ไม่ import dorm · ไม่มี any
//   B  dormBillInvoiceLines (pure): qty 1 × amountSatang · taxKind · meta.code · หน่วย/อัตราในคำอธิบาย
//   I  ใบแจ้งหนี้ DORM: สุ่มหลายร้อยบิล 3 โหมด VAT ⇒ ยอดตรง buildDormBill ทุกสตางค์ + GL ตั้งหนี้ถูก · ออกเลขที่ · idempotent · 10 ทาง · ตรวจ input · VAT ไม่ตรงสมุด · ไม่ผูก
//   C  CRM ทางเดิมได้ผลเหมือนเดิมทุกไบต์ (เทียบสำเนาทางเดิมที่เรียก service ชุดเดียวกัน) · ข้อความ error เดิม · คีย์ผลคืนเดิม
//   P  recordExternalPayment: พอดี/ขาด/เกิน (Cr 2110) · ซ้ำ/พร้อมกัน 10 คีย์เดียว = ครั้งเดียว · 10 คีย์ต่าง = applied รวมพอดี · ตรวจ input · ข้ามร้าน/ข้ามหน่วย/เอกสาร CRM
//   N  ใบลดหนี้/เพิ่มหนี้ผ่านของเดิม: GL ถูกฝั่ง · เพดานคงค้าง · ปิดยอด ⇒ PAID · idempotent · ข้ามร้าน
//   S  เงินประกัน: หนี้สิน 2140 lazy (ป้ายรอตรวจ J4) · รับ/ซ้ำ/พร้อมกัน · ชนรหัส · ปิดรายการเดียว (คืนเต็ม/หักบางส่วน/ทวงเพิ่ม) · พร้อมกัน 10 = ครั้งเดียว · ข้ามหน่วย/ร้าน
//   G  ทุกใบสำคัญในสมุดทดสอบสมดุล · ไม่มีพักรายการ 9999 · E event ที่เกิดลงทะเบียน consumer แล้ว · Z ทำความสะอาด
//
// 🔴 เขียนฐาน qc-svc — รันผ่าน gate lock (ห้ามครอบ timeout):
//    bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.2.mts
// ข้อมูล: tenant ใช้แล้วทิ้ง 2 ร้าน (slug ขึ้นต้น "svc-d2-") · ลบทั้งหมดใน finally · วันที่สัมพัทธ์ทั้งหมด · สุ่มแบบมีเมล็ด (SEED=… ทำซ้ำได้)
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-d.2";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_HINT = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.2.mts";

// ═══════════════ 0. ด่านฐานข้อมูล + gate lock ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: ${RUN_HINT}`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
  if (process.env.SHARK_GATE_LOCK_MARKER !== "1" || process.env.GATE_LOCK_FILE !== "/tmp/shark-gate-svc.lock") {
    console.error(`🔴 ${LABEL}: ไม่ได้รันใต้ gate lock ของ SVC (with-gate-lock.sh ผ่าน qc-svc.sh) — รันผ่าน: ${RUN_HINT}`);
    process.exit(4);
  }
}
loadSvcQcEnv(LABEL);

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const out = (s: string) => console.log(s);
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);
const PMAX = 8;
const why = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
async function step(id: string, name: string, fn: (p: string[]) => Promise<void>, sev: Sev = "CRITICAL") {
  const p: string[] = [];
  try { await fn(p); } catch (e) { p.push(`โยน: ${errMsg(e)}`); }
  chk(id, name, p.length === 0, why(p), sev);
}
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const tryImport = async (p: string): Promise<Any> => {
  try { return await import(p as string); } catch (e) { out(`  (โหลด ${p} ไม่ได้: ${errMsg(e).slice(0, 160)})`); return null; }
};
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, __missing: true, code: `MISSING:${name}` };
  try { return await fn(...args); } catch (e) { return { ok: false, threw: true, code: "THREW", message: errMsg(e) }; }
}
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.__missing ? `ไม่มีฟังก์ชัน ${r.code}` : r?.threw ? `โยน(${String(r.message).replace(/\s+/g, " ").trim().slice(0, 90)})` : `${String(r?.code)}:${String(r?.reason ?? "").slice(0, 60)}`);
/** ปฏิเสธถูกแบบ: ok:false + code ตรง + reason ไทยไม่ว่าง ไม่มีข้อความเทคนิค */
const refused = (r: Any, ...codes: string[]) =>
  r?.ok === false && !r?.threw && !r?.__missing && codes.includes(r?.code) && typeof r?.reason === "string" && /[฀-๿]/.test(r.reason) && !/prisma|invalid `|P20\d\d|stack|undefined|null/i.test(r.reason);
async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; res[i] = await fn(items[i], i); }
  }));
  return res;
}

// ═══════════════ สุ่มแบบมีเมล็ด ═══════════════
const SEED = Number(process.env.SEED ?? Math.floor(Math.random() * 2 ** 31));
let rs = SEED >>> 0;
const rnd = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

// ═══════════════ วันที่สัมพัทธ์ (วันไทย) ═══════════════
const bkkYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const DAY = 86_400_000;
const TODAY = bkkYmd(new Date());
const IN7 = bkkYmd(new Date(Date.now() + 7 * DAY));
const AGO2 = bkkYmd(new Date(Date.now() - 2 * DAY));

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: Any };
const SYS: Any = await tryImport("@/lib/modules/system/service");
const SV: Any = await tryImport("@/lib/modules/account/service");
const GL: Any = await tryImport("@/lib/modules/account/gl");
const ACC: Any = await tryImport("@/lib/modules/account");
const CALC: Any = await tryImport("@/lib/modules/dorm/calc");
const BRIDGE_FILE = "src/lib/modules/dorm/account-bridge.ts";
const BR: Any = has(BRIDGE_FILE) ? await tryImport("@/lib/modules/dorm/account-bridge") : null;
const FACADE = ["createExternalInvoice", "recordExternalPayment", "createExternalCreditNote", "createExternalDebitNote", "postSecurityDeposit", "securityDepositHeld", "settleSecurityDeposit"];

// ═══════════════ สถานะทดสอบ ═══════════════
const RAND = randomBytes(4).toString("hex");
const PFX = `svc-d2-${RAND}`;
const VALID_TAX = "0105561000003";
const T = { A: "", B: "" };
const U = { V: "", N: "", X: "", B: "", W: "", Q: "", R: "", M: "" }; // V = จด VAT · N = ไม่จด · X = ไม่ผูกบัญชี · B = ร้าน B · (ORACLE-EDIT 28 ต.ค. review) W = หน่วยที่ 2 สมุด V · Q = สมุด ON_PAYMENT · R = ย้ายลิงก์ · M = หลายลิงก์
const SYSID = { V: "", N: "", B: "", Q: "" };
// ORACLE-EDIT 28 ต.ค. (review) F3: เงินประกันผูกผู้เช่า (Party) — main = ผู้เช่าหลักของข้อสอบ · other = ผู้เช่าคนอื่นหอเดียวกัน · b = ผู้เช่าร้าน B
const PARTY = { main: "", other: "", b: "" };
const CRM_SRC = `${PFX}-crm`;
const VAT_INC = { registered: true, pricesIncludeVat: true };
const VAT_EXC = { registered: true, pricesIncludeVat: false };
const VAT_NO = { registered: false, pricesIncludeVat: true };
const DEP_KEY = "TENANT_SECURITY_DEPOSIT";
const VAT_CODES = new Set(["2200", "2205", "2210"]);
let refN = 0;
const newRef = () => `${PFX}-r${++refN}`;
const newKey = (t = "k") => `${PFX}-${t}-${randomBytes(5).toString("hex")}`;

// ═══════════════ ตัวช่วยสมุดบัญชี ═══════════════
type EL = { code: string; type: string; debit: number; credit: number };
type EN = { id: string; docNo: string; refType: string | null; refId: string | null; lines: EL[] };
async function entries(systemId: string, where: Any = {}): Promise<EN[]> {
  const es = (await prisma.accountJournalEntry.findMany({
    where: { systemId, ...where }, orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: { select: { code: true, type: true } } } } },
  })) as Any[];
  return es.map((e) => ({ id: e.id, docNo: e.docNo, refType: e.refType, refId: e.refId, lines: e.lines.map((l: Any) => ({ code: l.account.code, type: l.account.type, debit: l.debit, credit: l.credit })) }));
}
const entryIdSet = async (systemId: string) => new Set(((await prisma.accountJournalEntry.findMany({ where: { systemId }, select: { id: true } })) as Any[]).map((e) => e.id as string));
async function since(systemId: string, before: Set<string>): Promise<EN[]> {
  return (await entries(systemId)).filter((e) => !before.has(e.id));
}
const dr = (e: EN) => e.lines.reduce((s, l) => s + l.debit, 0);
const cr = (e: EN) => e.lines.reduce((s, l) => s + l.credit, 0);
/** ยอดสุทธิ dr − cr ต่อรหัส รวมทุกใบ */
function net(es: EN[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of es) for (const l of e.lines) m.set(l.code, (m.get(l.code) ?? 0) + l.debit - l.credit);
  return m;
}
const nz = (m: Map<string, number>, c: string) => m.get(c) ?? 0;
const vatNet = (m: Map<string, number>) => [...m].filter(([c]) => VAT_CODES.has(c)).reduce((s, [, v]) => s + v, 0);
const typeTouched = (es: EN[], t: string) => es.some((e) => e.lines.some((l) => l.type === t && (l.debit !== 0 || l.credit !== 0)));
async function depLedger(systemId: string): Promise<Any> {
  return prisma.accountMapping.findFirst({ where: { systemId, key: DEP_KEY }, include: { account: true } });
}
const docOf = (id: string): Promise<Any> => prisma.accountDocument.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
const counts = async (tenantId: string) => ({
  docs: await prisma.accountDocument.count({ where: { tenantId } }),
  pays: await prisma.accountDocumentPayment.count({ where: { tenantId } }),
  ents: await prisma.accountJournalEntry.count({ where: { tenantId } }),
});
const sameCounts = (a: Any, b: Any) => a.docs === b.docs && a.pays === b.pays && a.ents === b.ents;

// ═══════════════ ตัวเรียก facade ═══════════════
type Line = { description: string; qty: number; unitPriceSatang: number; taxKind: "EXEMPT" | "VAT7" | "NONE"; meta?: Record<string, string | number> };
/** แมปอ้างอิงของผู้คุม (ใบสั่ง D.1 "ส่งต่อ" · ใบสั่ง D.2 §3.5) — ใช้ทดสอบ facade แยกจาก bridge */
const refLines = (bill: Any): Line[] => bill.lines.map((l: Any) => ({ description: l.labelTh, qty: 1, unitPriceSatang: l.amountSatang, taxKind: l.taxKind, meta: { code: l.code } }));
const simpleLines = (xs: [number, "EXEMPT" | "VAT7" | "NONE"][]): Line[] => xs.map(([a, k], i) => ({ description: `รายการ ${i + 1}`, qty: 1, unitPriceSatang: a, taxKind: k }));
function dormInv(tenantId: string, unitId: string, lines: Line[], vat: Any, o: Any = {}): Promise<Any> {
  return call(ACC, "createExternalInvoice", {
    tenantId, sourceKind: "DORM", unitId, refType: "DormBill", refId: o.refId ?? newRef(),
    customer: { name: o.name ?? `ผู้เช่า ${PFX} ${refN}` }, partyId: o.partyId ?? null, lines, vat, // ORACLE-EDIT 28 ต.ค. (review): partyId เลือกได้
    issueDate: o.issueDate ?? TODAY, dueDate: o.dueDate === undefined ? IN7 : o.dueDate, ...(o.extra ?? {}),
  });
}
const pay = (tenantId: string, unitId: string, docId: string, amountSatang: number, idempotencyKey: string, o: Any = {}) =>
  call(ACC, "recordExternalPayment", { tenantId, unitId, docId, amountSatang, idempotencyKey, paidAt: new Date(), channel: "TRANSFER", ...o });
// ORACLE-EDIT 28 ต.ค. (review) F3: postSecurityDeposit ต้องมี partyId — ค่าเริ่ม = ผู้เช่าหลักของร้านนั้น (ส่ง o.partyId ทับได้ · null = ไม่ส่ง)
const deposit = (tenantId: string, unitId: string, leaseId: string, amountSatang: number, idempotencyKey: string, o: Any = {}) =>
  call(ACC, "postSecurityDeposit", { tenantId, unitId, leaseId, amountSatang, idempotencyKey, paidAt: new Date(), channel: "TRANSFER", partyId: tenantId === T.B ? PARTY.b : PARTY.main, ...o });
const held = (tenantId: string, unitId: string, leaseId: string) => call(ACC, "securityDepositHeld", { tenantId, unitId, leaseId });
const settle = (tenantId: string, unitId: string, leaseId: string, applyToDocIds: string[], idempotencyKey: string, o: Any = {}) =>
  call(ACC, "settleSecurityDeposit", { tenantId, unitId, leaseId, idempotencyKey, date: new Date(), applyToDocIds, refund: { channel: "TRANSFER" }, ...o });
const note = (fn: "createExternalCreditNote" | "createExternalDebitNote", tenantId: string, unitId: string, sourceDocId: string, lines: Line[], vat: Any, o: Any = {}) =>
  call(ACC, fn, { tenantId, unitId, sourceDocId, refType: "DormBillAdjust", refId: o.refId ?? newRef(), reason: o.reason ?? "แก้ยอดค่าน้ำตามมิเตอร์ที่จดผิด", lines, vat, issueDate: TODAY });
const outstanding = (d: Any, cn = 0) => Math.max(0, d.grandTotal - d.paidTotal - cn);
async function liveCN(docId: string): Promise<number> {
  const xs = (await prisma.accountDocument.findMany({ where: { sourceDocId: docId, docType: "CREDIT_NOTE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, select: { grandTotal: true } })) as Any[];
  return xs.reduce((s, x) => s + x.grandTotal, 0);
}

// ═══════════════ บิลสุ่ม (D.1 จริง) ═══════════════
const TARIFF = { kind: "TARIFF", tiers: [{ uptoUnits: 150, rateE4: 32_484 }, { uptoUnits: 400, rateE4: 42_218 }, { uptoUnits: null, rateE4: 44_217 }], ftE4: 3_972 };
function randomUtility(kind: "ELEC" | "WATER"): Any {
  const start = ri(0, 90_000);
  const seg = [{ start, end: start + ri(0, kind === "ELEC" ? 420 : 40) }];
  const r = rnd();
  if (r < 0.3) return { kind: "METERED", segments: seg, method: { kind: "FIXED_RATE", satangPerUnit: kind === "ELEC" ? ri(400, 900) : ri(1_500, 2_500) } };
  if (r < 0.5) { const billUnits = ri(1_000, 6_000); return { kind: "METERED", segments: seg, method: { kind: "ACTUAL_COST", billSatang: billUnits * ri(400, 600) + ri(0, 99), billUnits } }; }
  if (r < 0.62 && kind === "ELEC") return { kind: "METERED", segments: seg, method: TARIFF };
  if (r < 0.75) return { kind: "FLAT", method: rnd() < 0.5 ? { kind: "FLAT", per: "ROOM", satang: ri(5_000, 30_000) } : { kind: "FLAT", per: "PERSON", satang: ri(5_000, 15_000), persons: ri(1, 3) } };
  if (r < 0.88) return { kind: "ALLOCATED", amountSatang: ri(0, 80_000) };
  return null;
}
const SERVICES = [["PARK", "ค่าที่จอดรถ"], ["NET", "ค่าอินเทอร์เน็ต"], ["CLEAN", "ค่าทำความสะอาด"], ["LAUNDRY", "ค่าเครื่องซักผ้า"]] as const;
function randomBill(vat: Any): Any {
  for (let tries = 0; tries < 20; tries++) {
    try {
      const services = Array.from({ length: ri(0, 2) }, () => { const [code, labelTh] = pick(SERVICES); return { code: `${code}${ri(1, 99)}`, labelTh, amountSatang: ri(0, 60_000), ...(rnd() < 0.3 ? { taxKind: pick(["EXEMPT", "VAT7", "NONE"] as const) } : {}) }; });
      const bill = CALC.buildDormBill({
        rentSatang: ri(250_000, 1_200_000) + (rnd() < 0.3 ? ri(1, 99) : 0),
        commonFeeSatang: rnd() < 0.5 ? 0 : ri(0, 150_000),
        electricity: randomUtility("ELEC"), water: randomUtility("WATER"),
        lateFeeSatang: rnd() < 0.2 ? ri(5_000, 50_000) : 0,
        services, vat,
      });
      if (bill?.lines?.length) return bill;
    } catch { /* สุ่มใหม่ */ }
  }
  throw new Error("สุ่มบิลไม่ได้ (calc ของ D.1 โยนทุกครั้ง)");
}

// ═══════════════ เริ่ม ═══════════════
out(`\n===== QC SVC D.2 · facade บัญชีสำหรับหอ · SEED=${SEED} · ${PFX} =====`);
const START = new Date(Date.now() - 5_000);

try {
  // ───────── F ไฟล์ · โครงสร้าง ─────────
  out("\n── F ไฟล์ · โครงสร้าง ──");
  const idxSrc = read("src/lib/modules/account/index.ts");
  {
    const missing = FACADE.filter((n) => typeof ACC?.[n] !== "function");
    chk("F-1", `facade บัญชี export ครบ ${FACADE.length} ชื่อ`, missing.length === 0, `ขาด ${missing.join(", ")}`);
  }
  chk("F-2", "มี «dorm/account-bridge.ts» + export dormBillInvoiceLines", typeof BR?.dormBillInvoiceLines === "function", has(BRIDGE_FILE) ? "ไม่มี export" : "ไม่มีไฟล์");
  {
    const fit = read("scripts/fitness.mts").split("\n");
    const i = fit.findIndex((l) => /["']dorm→account["']/.test(l));
    const commented = i >= 0 && fit.slice(Math.max(0, i - 3), i + 1).some((l) => /\/\/.*SVC D\.2/.test(l));
    chk("F-3", "fitness ALLOWED_EDGES มี \"dorm→account\" + คอมเมนต์เหตุผล // SVC D.2", i >= 0 && commented, i < 0 ? "ไม่มีเส้น" : "ไม่มีคอมเมนต์ SVC D.2 ภายใน 3 บรรทัดเหนือ", "MAJOR");
  }
  {
    const src = read(BRIDGE_FILE);
    const imps = [...src.matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
    const bad = imps.filter((p) => !(p === "@/lib/modules/account" || p === "./calc" || p === "@/lib/modules/dorm/calc"));
    const anyUse = /:\s*any\b|as\s+any\b|<any>/.test(src);
    const impure = /prisma|@\/lib\/core\/db|Date\.now\(|Math\.random\(|new Date\(\s*\)/.test(src);
    chk("F-4", "bridge import ได้แค่ facade บัญชี + ./calc · ไม่มี any · pure", has(BRIDGE_FILE) && bad.length === 0 && !anyUse && !impure, !has(BRIDGE_FILE) ? "ไม่มีไฟล์" : `import เกิน=${bad.join(",") || "—"} any=${anyUse} impure=${impure}`, "MAJOR");
  }
  {
    const accFiles = ["index.ts", "service.ts", "gl.ts", "coa.ts"].map((f) => read(`src/lib/modules/account/${f}`)).join("\n");
    const rev = /["']@\/lib\/modules\/dorm/.test(accFiles);
    const anyNew = /createExternalCreditNote|recordExternalPayment|settleSecurityDeposit/.test(idxSrc) ? /(recordExternalPayment|settleSecurityDeposit|postSecurityDeposit|createExternalCreditNote|createExternalDebitNote)[\s\S]{0,4000}?:\s*any\b/.test(idxSrc) : false;
    chk("F-5", "บัญชีไม่ import dorm (ทิศเดียว) · ฟังก์ชันใหม่ไม่มี any", !rev && !anyNew, `account→dorm=${rev} any=${anyNew}`, "MAJOR");
  }
  {
    const coa = read("src/lib/modules/account/coa.ts");
    const seeded = /\[\s*["']TENANT_SECURITY_DEPOSIT["']/.test(coa) || /\[\s*["']214\d["']\s*,\s*["']LIABILITY["']/.test(coa);
    chk("F-6", "ผังตั้งต้นของทุกร้าน (COA/MAPPINGS) ไม่ถูกเพิ่มบัญชีประกัน (สร้าง lazy)", !seeded, "พบ 214x/TENANT_SECURITY_DEPOSIT ในผังตั้งต้น", "MAJOR");
  }

  // ───────── B bridge (pure) ─────────
  out("\n── B dormBillInvoiceLines ──");
  await step("B-1", "500 บิลสุ่ม: 1 บรรทัดบิล = 1 บรรทัดเอกสาร · qty 1 · unitPrice = amountSatang · taxKind เดิม · meta.code · คำอธิบายเริ่มด้วย labelTh", async (p) => {
    if (typeof BR?.dormBillInvoiceLines !== "function") { p.push("ไม่มี dormBillInvoiceLines"); return; }
    for (let i = 0; i < 500 && p.length < PMAX; i++) {
      const bill = randomBill(pick([VAT_INC, VAT_EXC, VAT_NO]));
      const ls: Any[] = BR.dormBillInvoiceLines(bill);
      if (!Array.isArray(ls) || ls.length !== bill.lines.length) { p.push(`#${i} จำนวนบรรทัด ${ls?.length} ≠ ${bill.lines.length}`); continue; }
      bill.lines.forEach((bl: Any, j: number) => {
        const l = ls[j];
        if (l.qty !== 1 || l.unitPriceSatang !== bl.amountSatang || l.taxKind !== bl.taxKind || l?.meta?.code !== bl.code || typeof l.description !== "string" || !l.description.startsWith(bl.labelTh))
          p.push(`#${i}.${j} ${bl.code}: ${js({ qty: l.qty, u: l.unitPriceSatang, tk: l.taxKind, code: l?.meta?.code, d: l.description })} คาด amount ${bl.amountSatang} ${bl.taxKind}`);
      });
    }
  });
  await step("B-2", "บรรทัดมิเตอร์แสดงหน่วย + ราคาต่อหน่วยเป็นบาท 2 ตำแหน่ง (กฎหมาย · D.1 §3.1)", async (p) => {
    if (typeof BR?.dormBillInvoiceLines !== "function") { p.push("ไม่มี dormBillInvoiceLines"); return; }
    const bill = CALC.buildDormBill({ rentSatang: 450_000, commonFeeSatang: 50_000, vat: VAT_INC,
      electricity: { kind: "METERED", segments: [{ start: 12_034, end: 12_154 }], method: { kind: "FIXED_RATE", satangPerUnit: 472 } },
      water: { kind: "METERED", segments: [{ start: 880, end: 892 }], method: { kind: "FIXED_RATE", satangPerUnit: 1_600 } } });
    const ls: Any[] = BR.dormBillInvoiceLines(bill);
    const e = ls.find((l) => l?.meta?.code === "ELEC");
    const w = ls.find((l) => l?.meta?.code === "WATER");
    if (!e || !/120/.test(e.description) || !e.description.includes("4.72")) p.push(`ไฟ: "${e?.description}" ต้องมี 120 และ 4.72`);
    if (!w || !/12/.test(w.description) || !w.description.includes("16.00")) p.push(`น้ำ: "${w?.description}" ต้องมี 12 และ 16.00`);
    const t = CALC.buildDormBill({ rentSatang: 450_000, commonFeeSatang: 0, vat: VAT_NO, electricity: { kind: "METERED", segments: [{ start: 100, end: 337 }], method: TARIFF } });
    const te = (BR.dormBillInvoiceLines(t) as Any[]).find((l) => l?.meta?.code === "ELEC");
    if (!te || !te.description.includes("237")) p.push(`TARIFF: "${te?.description}" ต้องมีหน่วย 237`);
  }, "MAJOR");

  // ───────── setup ─────────
  out("\n── setup: ร้านใช้แล้วทิ้ง A/B · หน่วยหอ · สมุดบัญชี · ลิงก์ BUSINESS ──");
  const ta = await prisma.tenant.create({ data: { name: `SVC D.2 A ${RAND}`, slug: `${PFX}-a` } });
  const tb = await prisma.tenant.create({ data: { name: `SVC D.2 B ${RAND}`, slug: `${PFX}-b` } });
  T.A = ta.id; T.B = tb.id;
  const unit = async (tenantId: string, tag: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name: `หอ ${tag} ${RAND}`, slug: `${PFX}-${tag}` } })).id as string;
  U.V = await unit(T.A, "v"); U.N = await unit(T.A, "n"); U.X = await unit(T.A, "x"); U.B = await unit(T.B, "b");
  // ORACLE-EDIT 28 ต.ค. (review): หน่วยเพิ่ม W/Q/R/M + Party จริง (ผูกผู้ติดต่อของใบกับเงินประกัน)
  U.W = await unit(T.A, "w"); U.Q = await unit(T.A, "q"); U.R = await unit(T.A, "r"); U.M = await unit(T.A, "m");
  PARTY.main = (await prisma.party.create({ data: { tenantId: T.A, name: `ผู้เช่าหลัก ${PFX}` } })).id;
  PARTY.other = (await prisma.party.create({ data: { tenantId: T.A, name: `ผู้เช่าห้องอื่น ${PFX}` } })).id;
  PARTY.b = (await prisma.party.create({ data: { tenantId: T.B, name: `ผู้เช่าร้าน B ${PFX}` } })).id;
  const mkSys = async (tenantId: string, name: string, vat: boolean, extra: Any = {}) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await SV.saveSettings(tenantId, s.id, vat ? { orgName: name, taxId: VALID_TAX, vatRegistered: true, vatRateBp: 700, ...extra } : { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    return s.id as string;
  };
  SYSID.V = await mkSys(T.A, `บัญชีหอ V ${RAND}`, true);
  SYSID.N = await mkSys(T.A, `บัญชีหอ N ${RAND}`, false);
  SYSID.B = await mkSys(T.B, `บัญชีหอ B ${RAND}`, true);
  const link = (tenantId: string, systemId: string, linkedKind: string, linkedId: string, enabled = true) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind, linkedId, enabled } });
  await link(T.A, SYSID.V, "BUSINESS", U.V);
  await link(T.A, SYSID.N, "BUSINESS", U.N);
  await link(T.B, SYSID.B, "BUSINESS", U.B);
  await link(T.A, SYSID.V, "CRM", CRM_SRC);
  // ORACLE-EDIT 28 ต.ค. (review): W ใช้สมุด V ร่วม · Q สมุดจด VAT จุดภาษี ON_PAYMENT · R/M เริ่มที่สมุด V (S-15/S-16 ย้าย/เพิ่มลิงก์เอง)
  SYSID.Q = await mkSys(T.A, `บัญชีหอ Q ${RAND}`, true, { taxPointBasis: "ON_PAYMENT" });
  await link(T.A, SYSID.V, "BUSINESS", U.W);
  await link(T.A, SYSID.Q, "BUSINESS", U.Q);
  await link(T.A, SYSID.V, "BUSINESS", U.R);
  await link(T.A, SYSID.V, "BUSINESS", U.M);
  out(`  A=${T.A} B=${T.B} · sysV=${SYSID.V} sysN=${SYSID.N} sysB=${SYSID.B}`);

  // ───────── PC positive control (ต้องเขียวตั้งแต่ก่อนมีงาน) ─────────
  await step("PC-1", "positive control: createDocument เดิม + แมปอ้างอิง (qty 1 × amount · VAT7=700 · อื่น −1 · vatMode ตามโหมด) ⇒ ยอดเอกสาร = buildDormBill ทุกสตางค์ 3 โหมด × 40 บิล (เกณฑ์ I-1 ทำได้จริง)", async (p) => {
    for (const [mode, systemId, vat] of [["INC", SYSID.V, VAT_INC], ["EXC", SYSID.V, VAT_EXC], ["NONE", SYSID.N, VAT_NO]] as const) {
      for (let i = 0; i < 40 && p.length < PMAX; i++) {
        const b = randomBill(vat);
        const d = await SV.createDocument({ tenantId: T.A, systemId, docType: "INVOICE", vatMode: vat.registered ? (vat.pricesIncludeVat ? "INCLUDE" : "EXCLUDE") : "NONE",
          lines: b.lines.map((l: Any) => ({ description: l.labelTh, qty: 1, unitPrice: l.amountSatang, vatRateBp: l.taxKind === "VAT7" ? 700 : -1 })) });
        if (d.subTotal !== b.subtotalSatang || d.vatAmount !== b.vatSatang || d.grandTotal !== b.totalSatang) p.push(`${mode}#${i} ${d.subTotal}/${d.vatAmount}/${d.grandTotal} ≠ ${b.subtotalSatang}/${b.vatSatang}/${b.totalSatang}`);
      }
    }
  });

  await step("PC-2", "positive control: ใบแจ้งหนี้เดิม (issueDocument) + recordPayment เต็มยอด ⇒ GL สุทธิ Dr 1010 / Cr 1100 · VAT สุทธิ 0 · ไม่แตะรายได้ (เกณฑ์ P-1 ทำได้จริง)", async (p) => {
    const d = await SV.createDocument({ tenantId: T.A, systemId: SYSID.V, docType: "INVOICE", vatMode: "INCLUDE", lines: [{ description: "ค่าห้อง", qty: 1, unitPrice: 500_000, vatRateBp: -1 }, { description: "ส่วนกลาง", qty: 1, unitPrice: 35_000, vatRateBp: 700 }] });
    const iss = await SV.issueDocument(T.A, SYSID.V, d.id);
    if (!iss?.ok) { p.push(`issue ${js(iss)}`); return; }
    const b4 = await entryIdSet(SYSID.V);
    const r = await SV.recordPayment(T.A, SYSID.V, d.id, { amount: 535_000, channel: "TRANSFER", idempotencyKey: newKey("pc2") });
    if (!r?.ok || r.status !== "PAID") p.push(`pay ${js(r)}`);
    const es = await since(SYSID.V, b4); const m = net(es);
    if (nz(m, "1010") !== 535_000 || nz(m, "1100") !== -535_000 || vatNet(m) !== 0 || typeTouched(es, "INCOME")) p.push(`GL ${js([...m])}`);
  });

  // ───────── S-0 lazy (ก่อนมีประกันใด ๆ) ─────────
  await step("S-0", "สมุดที่ยังไม่เคยรับประกัน: ไม่มี mapping TENANT_SECURITY_DEPOSIT · ไม่มีบัญชี 214x (lazy · ร้านไม่มีหอไม่เห็น)", async (p) => {
    for (const s of [SYSID.V, SYSID.N, SYSID.B]) {
      if (await depLedger(s)) p.push(`${s} มี mapping แล้ว`);
      const l = await prisma.accountLedger.count({ where: { systemId: s, code: { startsWith: "214" } } });
      if (l) p.push(`${s} มีบัญชี 214x ${l} บัญชี`);
    }
  }, "MAJOR");

  // ───────── I ใบแจ้งหนี้ DORM ─────────
  out("\n── I ใบแจ้งหนี้ DORM ──");
  const N_PER_MODE = Number(process.env.D2_BILLS_PER_MODE ?? 100);
  const MODES = [["INC", U.V, SYSID.V, VAT_INC], ["EXC", U.V, SYSID.V, VAT_EXC], ["NONE", U.N, SYSID.N, VAT_NO]] as const;
  const jobs: { mode: string; unitId: string; systemId: string; vat: Any; bill: Any; refId: string }[] = [];
  for (const [mode, unitId, systemId, vat] of MODES) for (let i = 0; i < N_PER_MODE; i++) jobs.push({ mode, unitId, systemId, vat, bill: randomBill(vat), refId: newRef() });
  const t0 = Date.now();
  const results = await pool(jobs, 6, (j) => dormInv(T.A, j.unitId, refLines(j.bill), j.vat, { refId: j.refId, name: `ผู้เช่า ${j.refId}` }));
  out(`  (${jobs.length} ใบ · ${((Date.now() - t0) / 1000).toFixed(1)} วิ)`);
  const okIdx = results.map((r, i) => (r?.ok ? i : -1)).filter((i) => i >= 0);
  chk("I-0", `ออกใบแจ้งหนี้ DORM ได้ทุกใบ (${jobs.length} ใบ · 3 โหมด VAT)`, okIdx.length === jobs.length, `ได้ ${okIdx.length}/${jobs.length} · ตัวอย่าง ${codeOf(results.find((r) => !r?.ok))}`);
  const docs = new Map<string, Any>();
  if (okIdx.length) {
    const rows = (await prisma.accountDocument.findMany({ where: { id: { in: okIdx.map((i) => results[i].docId) } }, include: { lines: { orderBy: { sortOrder: "asc" } } } })) as Any[];
    for (const d of rows) docs.set(d.id, d);
  }
  for (const mode of ["INC", "EXC", "NONE"]) {
    await step(`I-1.${mode}`, `โหมด ${mode}: subTotal/VAT/grandTotal ของเอกสาร = buildDormBill ทุกสตางค์ · ผลคืนตรง`, async (p) => {
      let n = 0;
      jobs.forEach((j, i) => {
        if (j.mode !== mode) return;
        const r = results[i];
        if (!r?.ok) { p.push(`#${i} ${codeOf(r)}`); return; }
        const d = docs.get(r.docId);
        n++;
        const b = j.bill;
        if (!d || d.subTotal !== b.subtotalSatang || d.vatAmount !== b.vatSatang || d.grandTotal !== b.totalSatang)
          p.push(`#${i} doc ${d?.subTotal}/${d?.vatAmount}/${d?.grandTotal} ≠ บิล ${b.subtotalSatang}/${b.vatSatang}/${b.totalSatang}`);
        if (r.subTotalSatang !== b.subtotalSatang || r.vatSatang !== b.vatSatang || r.totalSatang !== b.totalSatang) p.push(`#${i} ผลคืน ${r.subTotalSatang}/${r.vatSatang}/${r.totalSatang}`);
      });
      if (n !== N_PER_MODE) p.push(`ตรวจได้ ${n}/${N_PER_MODE}`);
    });
  }
  await step("I-2", "ทุกใบ: ออกแล้ว (AWAITING_PAYMENT · มีเลขที่ไม่ซ้ำ) · source DORM · refSystemId = หน่วย · refType/refId · vatMode ตามโหมด · created true", async (p) => {
    if (docs.size !== jobs.length) p.push(`มีเอกสารให้ตรวจ ${docs.size}/${jobs.length}`);
    const nos = new Set<string>();
    jobs.forEach((j, i) => {
      const r = results[i]; const d = r?.ok ? docs.get(r.docId) : null;
      if (!d) return;
      const vm = j.mode === "INC" ? "INCLUDE" : j.mode === "EXC" ? "EXCLUDE" : "NONE";
      if (d.status !== "AWAITING_PAYMENT" || !d.docNo || d.docType !== "INVOICE" || d.source !== "DORM" || d.refSystemId !== j.unitId || d.refType !== "DormBill" || d.refId !== j.refId || d.vatMode !== vm || r.created !== true || r.docNo !== d.docNo || r.status !== d.status)
        p.push(`#${i} ${js({ st: d.status, no: d.docNo, src: d.source, rs: d.refSystemId === j.unitId, rt: d.refType, vm: d.vatMode, created: r.created })}`);
      if (d.docNo) { if (nos.has(`${d.systemId}:${d.docNo}`)) p.push(`เลขซ้ำ ${d.docNo}`); nos.add(`${d.systemId}:${d.docNo}`); }
    });
  });
  await step("I-3", "บรรทัดเอกสาร = บรรทัดบิล (ลำดับ · qty 1 · unitPrice/amount = amountSatang · vatRateBp VAT7=700 EXEMPT=−1 NONE=−1)", async (p) => {
    if (docs.size !== jobs.length) p.push(`มีเอกสารให้ตรวจ ${docs.size}/${jobs.length}`);
    jobs.forEach((j, i) => {
      const r = results[i]; const d = r?.ok ? docs.get(r.docId) : null;
      if (!d) return;
      if (d.lines.length !== j.bill.lines.length) { p.push(`#${i} บรรทัด ${d.lines.length} ≠ ${j.bill.lines.length}`); return; }
      j.bill.lines.forEach((bl: Any, k: number) => {
        const l = d.lines[k];
        const bp = bl.taxKind === "VAT7" ? 700 : -1;
        if (Number(l.qty) !== 1 || l.unitPrice !== bl.amountSatang || l.amount !== bl.amountSatang || (j.mode !== "NONE" && l.vatRateBp !== bp))
          p.push(`#${i}.${k} ${bl.code} ${js({ q: String(l.qty), u: l.unitPrice, a: l.amount, bp: l.vatRateBp })} คาด ${bl.amountSatang}/${bp}`);
      });
    });
  });
  await step("I-4", "GL ตอนออก: 1 ใบสำคัญ/ใบ · สมดุล · Dr 1100 = grandTotal · Cr รายได้ = subTotal · Cr ภาษีขาย (2200/2205/2210) = VAT · ไม่มี 9999", async (p) => {
    if (docs.size !== jobs.length) p.push(`มีเอกสารให้ตรวจ ${docs.size}/${jobs.length}`);
    const ids = [...docs.keys()];
    const es = (await prisma.accountJournalEntry.findMany({ where: { refType: "AccountDocument", refId: { in: ids } }, include: { lines: { include: { account: { select: { code: true, type: true } } } } } })) as Any[];
    const by = new Map<string, Any[]>();
    for (const e of es) by.set(e.refId, [...(by.get(e.refId) ?? []), e]);
    for (const [id, d] of docs) {
      const xs = by.get(id) ?? [];
      if (xs.length !== 1) { p.push(`${d.docNo} ใบสำคัญ ${xs.length}`); continue; }
      const ls = xs[0].lines as Any[];
      const s = (f: (l: Any) => boolean, k: "debit" | "credit") => ls.filter(f).reduce((a, l) => a + l[k], 0);
      const D = s(() => true, "debit"), C = s(() => true, "credit");
      const ar = s((l) => l.account.code === "1100", "debit") - s((l) => l.account.code === "1100", "credit");
      const inc = s((l) => l.account.type === "INCOME", "credit") - s((l) => l.account.type === "INCOME", "debit");
      const vat = s((l) => VAT_CODES.has(l.account.code), "credit") - s((l) => VAT_CODES.has(l.account.code), "debit");
      const sus = ls.some((l) => l.account.code === "9999");
      if (D !== C || ar !== d.grandTotal || inc !== d.subTotal - d.discountAmount || vat !== d.vatAmount || sus) p.push(`${d.docNo} D${D}/C${C} AR${ar}/${d.grandTotal} inc${inc}/${d.subTotal} vat${vat}/${d.vatAmount}${sus ? " 9999" : ""}`);
    }
  });

  // ตัวอย่างเดี่ยว (ใช้ต่อในหลายข้อ)
  const one = randomBill(VAT_INC);
  const oneRef = newRef();
  const r1 = await dormInv(T.A, U.V, refLines(one), VAT_INC, { refId: oneRef });
  await step("I-5", "ซ้ำคีย์เดิม (refType/refId) ⇒ ใบเดิม created:false · ไม่มีเอกสาร/ใบสำคัญ/เลขที่ใหม่", async (p) => {
    if (!r1?.ok) { p.push(`ใบแรก ${codeOf(r1)}`); return; }
    const c0 = await counts(T.A);
    const r2 = await dormInv(T.A, U.V, refLines(one), VAT_INC, { refId: oneRef });
    const c1 = await counts(T.A);
    if (!r2?.ok || r2.docId !== r1.docId || r2.created !== false || r2.docNo !== r1.docNo) p.push(`ซ้ำ ${codeOf(r2)} docId=${r2?.docId === r1.docId} created=${r2?.created}`);
    if (!sameCounts(c0, c1)) p.push(`แถวเพิ่ม ${js(c0)}→${js(c1)}`);
  });
  await step("I-6", "ซ้ำคีย์เดิมแต่ยอดต่าง ⇒ IDEMPOTENCY_CONFLICT · ใบเดิมไม่เปลี่ยน", async (p) => {
    if (!r1?.ok) { p.push("ไม่มีใบแรก"); return; }
    const before = js(await docOf(r1.docId));
    const ls = refLines(one); ls[0] = { ...ls[0], unitPriceSatang: ls[0].unitPriceSatang + 100 };
    const r = await dormInv(T.A, U.V, ls, VAT_INC, { refId: oneRef });
    if (!refused(r, "IDEMPOTENCY_CONFLICT")) p.push(codeOf(r));
    if (js(await docOf(r1.docId)) !== before) p.push("ใบเดิมถูกแก้");
  });
  await step("I-7", "X3: ยิงพร้อมกัน 10 ทาง ref เดียว ⇒ 1 ใบ · ทุกตัว ok docId เดียว · ใบสำคัญ 1", async (p) => {
    const ref = newRef(); const b = randomBill(VAT_EXC);
    const rs10 = await Promise.all(Array.from({ length: 10 }, () => dormInv(T.A, U.V, refLines(b), VAT_EXC, { refId: ref })));
    const ids = new Set(rs10.filter((r) => r?.ok).map((r) => r.docId));
    if (rs10.some((r) => !r?.ok)) p.push(`ไม่ ok: ${rs10.filter((r) => !r?.ok).map(codeOf).slice(0, 3).join(" | ")}`);
    if (ids.size !== 1) p.push(`docId ${ids.size} แบบ`);
    const n = await prisma.accountDocument.count({ where: { tenantId: T.A, refType: "DormBill", refId: ref } });
    if (n !== 1) p.push(`เอกสาร ${n} ใบ`);
    if (rs10.filter((r) => r?.created === true).length !== 1) p.push(`created:true ${rs10.filter((r) => r?.created === true).length} ตัว`);
    const [id] = [...ids];
    if (id && (await prisma.accountJournalEntry.count({ where: { refType: "AccountDocument", refId: id } })) !== 1) p.push("ใบสำคัญไม่ใช่ 1");
  });
  await step("I-8", "ค่าตั้ง VAT ของหอไม่ตรงสมุด (ทั้งสองทิศ) ⇒ VAT_SETTING_MISMATCH · ไม่มีแถว", async (p) => {
    const c0 = await counts(T.A);
    const a = await dormInv(T.A, U.N, refLines(randomBill(VAT_INC)), VAT_INC);
    const b = await dormInv(T.A, U.V, refLines(randomBill(VAT_NO)), VAT_NO);
    if (!refused(a, "VAT_SETTING_MISMATCH")) p.push(`หอจด/สมุดไม่จด: ${codeOf(a)}`);
    if (!refused(b, "VAT_SETTING_MISMATCH")) p.push(`หอไม่จด/สมุดจด: ${codeOf(b)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  await step("I-9", "บรรทัดผิด ⇒ INVALID_LINE · ไม่มีแถว (ว่าง · qty 0/1.5 · ราคา −1/1.5/NaN · taxKind แปลก · คำอธิบายว่าง · 201 บรรทัด)", async (p) => {
    const c0 = await counts(T.A);
    const base = simpleLines([[10_000, "EXEMPT"]])[0];
    const bad: [string, Line[]][] = [
      ["ว่าง", []], ["qty0", [{ ...base, qty: 0 }]], ["qty1.5", [{ ...base, qty: 1.5 }]], ["ราคา-1", [{ ...base, unitPriceSatang: -1 }]],
      ["ราคา1.5", [{ ...base, unitPriceSatang: 1.5 }]], ["NaN", [{ ...base, unitPriceSatang: Number.NaN }]], ["taxKind", [{ ...base, taxKind: "VAT10" as Any }]],
      ["desc", [{ ...base, description: "  " }]], ["201", Array.from({ length: 201 }, () => base)],
    ];
    for (const [tag, ls] of bad) { const r = await dormInv(T.A, U.V, ls, VAT_INC); if (!refused(r, "INVALID_LINE")) p.push(`${tag}: ${codeOf(r)}`); }
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  await step("I-10", "X1: หน่วยไม่ผูก / ลิงก์ปิด / ร้าน B อ้างหน่วยของ A / ร้าน A อ้างหน่วยของ B ⇒ NOT_LINKED · ไม่มีแถว", async (p) => {
    const ls = simpleLines([[10_000, "EXEMPT"]]);
    const cA = await counts(T.A), cB = await counts(T.B);
    const l = await link(T.A, SYSID.V, "BUSINESS", U.X, false);
    for (const [tag, t, u] of [["ไม่ผูก/ปิด", T.A, U.X], ["B→หน่วย A", T.B, U.V], ["A→หน่วย B", T.A, U.B]] as const) {
      const r = await dormInv(t, u, ls, VAT_INC);
      if (!refused(r, "NOT_LINKED")) p.push(`${tag}: ${codeOf(r)}`);
    }
    await prisma.accountSystemLink.delete({ where: { id: l.id } });
    if (!sameCounts(cA, await counts(T.A)) || !sameCounts(cB, await counts(T.B))) p.push("มีแถวเพิ่ม");
  });
  await step("I-11", "issueDate/dueDate = วันไทยตามที่ส่ง · draft:true ⇒ ร่าง ไม่มีเลขที่ ไม่มีใบสำคัญ", async (p) => {
    const r = await dormInv(T.A, U.V, simpleLines([[123_456, "EXEMPT"], [10_700, "VAT7"]]), VAT_INC, { issueDate: AGO2, dueDate: IN7 });
    const d = r?.ok ? await docOf(r.docId) : null;
    if (!d || bkkYmd(d.issueDate) !== AGO2 || !d.dueDate || bkkYmd(d.dueDate) !== IN7) p.push(`${codeOf(r)} issue=${d ? bkkYmd(d.issueDate) : "-"} due=${d?.dueDate ? bkkYmd(d.dueDate) : "-"}`);
    const dr0 = await dormInv(T.A, U.V, simpleLines([[50_000, "EXEMPT"]]), VAT_INC, { extra: { draft: true } });
    const dd = dr0?.ok ? await docOf(dr0.docId) : null;
    if (!dd || dd.status !== "DRAFT" || dd.docNo !== null || dd.source !== "DORM") p.push(`draft ${codeOf(dr0)} ${dd?.status}/${dd?.docNo}`);
    if (dd && (await prisma.accountJournalEntry.count({ where: { refType: "AccountDocument", refId: dd.id } })) !== 0) p.push("ร่างมีใบสำคัญ");
  });

  // ───────── C CRM ทางเดิม ─────────
  out("\n── C CRM ทางเดิมไม่เปลี่ยน ──");
  const roundQty4 = (q: number) => (Number.isFinite(q) ? Math.round(q * 10_000) / 10_000 : q);
  /** สำเนาทางเดิมของ createExternalInvoice (CRM) ก่อนใบ D.2 — เรียก service ชุดเดียวกันตรงตัว */
  async function legacyCrmInvoice(input: Any): Promise<Any> {
    const lk = await SV.findAccountLinkFor(input.tenantId, input.sourceKind, input.sourceSystemId);
    if (!lk) return { ok: false, reason: "ยังไม่เชื่อมระบบบัญชี" };
    const ctx = { tenantId: input.tenantId, systemId: lk.systemId };
    const ex = await SV.findDocByRef(ctx.systemId, "INVOICE", input.refType, input.refId);
    if (ex) return { ok: true, docId: ex.id, created: false };
    const contact = await SV.findOrCreateCustomerContact(ctx, { ...input.customer, partyId: input.partyId ?? null });
    const lines = input.lines && input.lines.length > 0 ? input.lines.map((l: Any) => ({ ...l, qty: roundQty4(l.qty) })) : [{ description: input.title, qty: 1, unitPrice: input.valueSatang }];
    const doc = await SV.createDocument({ tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "INVOICE", contactId: contact.id, lines, discountAmount: input.discountAmount ?? undefined, note: input.note ?? undefined, createdById: input.createdById ?? undefined });
    await SV.setDocExternalRef(doc.id, { refSystemId: input.sourceSystemId, refType: input.refType, refId: input.refId });
    return { ok: true, docId: doc.id, created: true };
  }
  const DOC_SKIP = new Set(["id", "createdAt", "updatedAt", "refId", "issueDate", "contactId"]);
  const LINE_SKIP = new Set(["id", "documentId", "createdAt", "updatedAt"]);
  async function projection(id: string): Promise<Any> {
    const d = (await docOf(id)) as Any;
    if (!d) return null;
    const o: Any = {};
    for (const [k, v] of Object.entries(d)) if (!DOC_SKIP.has(k) && k !== "lines") o[k] = v;
    o.issueYmd = bkkYmd(d.issueDate);
    o.lines = (d.lines as Any[]).map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !LINE_SKIP.has(k))));
    o.entries = await prisma.accountJournalEntry.count({ where: { refType: "AccountDocument", refId: id } });
    return JSON.parse(js(o));
  }
  const crmIn = (o: Any) => ({ tenantId: T.A, sourceSystemId: CRM_SRC, sourceKind: "CRM", refType: "CrmDeal", title: "งานติดตั้งแอร์ 3 เครื่อง", valueSatang: 4_500_000, customer: { name: `ลูกค้า CRM ${PFX}` }, partyId: null, createdById: null, ...o });
  const CRM_CASES: [string, Any][] = [
    ["ไม่มีบรรทัด", {}],
    ["มีบรรทัด+ส่วนลด", { lines: [{ description: "แอร์ 12000 BTU", qty: 3, unitPrice: 1_390_000, vatRateBp: 700 }, { description: "ค่าติดตั้ง", qty: 1.23456, unitPrice: 150_000 }], discountAmount: 50_000, note: "ส่งภายใน 7 วัน" }],
    ["บริษัท+เลขภาษี", { customer: { name: `บริษัท ทดสอบ ${PFX} จำกัด`, taxId: "0105562222222", branchCode: "00000" }, valueSatang: 1_000_001 }],
  ];
  for (const [i, [tag, o]] of CRM_CASES.entries()) {
    await step(`C-${i + 1}`, `CRM ${tag}: แถวเอกสาร+บรรทัด+ผลคืน เหมือนทางเดิมทุกช่อง (ยกเว้น id/เวลา/refId)`, async (p) => {
      const nf = crmIn({ refId: newRef(), ...o });
      const nl = crmIn({ refId: newRef(), ...o });
      const rf = await call(ACC, "createExternalInvoice", nf);
      const rl = await legacyCrmInvoice(nl);
      if (!rf?.ok || !rl?.ok) { p.push(`facade ${codeOf(rf)} · เดิม ${codeOf(rl)}`); return; }
      if (js(Object.keys(rf).sort()) !== js(["created", "docId", "ok"])) p.push(`คีย์ผลคืน ${js(Object.keys(rf))}`);
      if (rf.created !== true) p.push("created ไม่ใช่ true");
      const [pf, pl] = [await projection(rf.docId), await projection(rl.docId)];
      if (js(pf) !== js(pl)) {
        const diff = Object.keys({ ...pf, ...pl }).filter((k) => js(pf?.[k]) !== js(pl?.[k]));
        p.push(`ต่างที่ ${diff.join(",")} · ${diff.slice(0, 2).map((k) => `${k}: ${js(pf?.[k]).slice(0, 80)} vs ${js(pl?.[k]).slice(0, 80)}`).join(" | ")}`);
      }
      const cproj = async (docId: string) => { const c = await prisma.accountContact.findFirst({ where: { id: (await docOf(docId))?.contactId ?? "-" } }); return c ? js({ ...Object.fromEntries(Object.entries(c).filter(([k]) => !["id", "createdAt", "updatedAt", "code", "partyId"].includes(k))), hasParty: !!(c as Any).partyId }) : "ไม่มี"; };
      const [cf, cl] = [await cproj(rf.docId), await cproj(rl.docId)];
      if (cf !== cl) { const a = JSON.parse(cf), b = JSON.parse(cl); const ks = Object.keys({ ...a, ...b }).filter((k) => js(a?.[k]) !== js(b?.[k])); p.push(`ผู้ติดต่อต่างจากทางเดิมที่ ${ks.map((k) => `${k}: ${js(a?.[k]).slice(0, 40)} vs ${js(b?.[k]).slice(0, 40)}`).join(" · ")}`); }
      const again = await call(ACC, "createExternalInvoice", nf);
      if (js(again) !== js({ ok: true, docId: rf.docId, created: false })) p.push(`เรียกซ้ำ ${js(again)}`);
    });
  }
  await step("C-4", "CRM ข้อความปฏิเสธเดิมตรงตัว + คีย์ {ok,reason} เท่านั้น", async (p) => {
    const cases: [Any, string][] = [
      [crmIn({ refId: newRef(), sourceSystemId: `${PFX}-nolink` }), "ยังไม่เชื่อมระบบบัญชี"],
      [crmIn({ refId: newRef(), valueSatang: -1 }), `มูลค่าดีลต้องเป็นศูนย์หรือมากกว่า (ได้รับ ฿${SV.baht(-1)})`],
      [crmIn({ refId: newRef(), lines: [{ description: "x", qty: -1, unitPrice: 100 }] }), "รายการที่ 1: จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (ได้รับ -1)"],
      [crmIn({ refId: newRef(), valueSatang: 1.5 }), "มูลค่าดีลต้องเป็นจำนวนเต็มสตางค์ (ได้รับ 1.5)"],
    ];
    for (const [inp, reason] of cases) {
      const r = await call(ACC, "createExternalInvoice", inp);
      if (js(r) !== js({ ok: false, reason })) p.push(`${js(r).slice(0, 120)} ≠ ${reason}`);
    }
  });
  await step("C-5", "CRM ใบที่สร้างยังเป็นร่าง source MANUAL ไม่มีใบสำคัญ (ทางเดิมไม่ถูกเปลี่ยนเป็นออกเลข/DORM)", async (p) => {
    const r = await call(ACC, "createExternalInvoice", crmIn({ refId: newRef() }));
    const d = r?.ok ? await docOf(r.docId) : null;
    if (!d || d.status !== "DRAFT" || d.source !== "MANUAL" || d.docNo !== null) p.push(`${codeOf(r)} ${d?.status}/${d?.source}/${d?.docNo}`);
  });

  // ───────── P recordExternalPayment ─────────
  out("\n── P รับชำระ ──");
  const T1 = 535_000; // ฿5,350 = ห้อง 5,000 (ยกเว้น) + ส่วนกลาง 350 (VAT รวม)
  // ORACLE-EDIT 28 ต.ค. (review) F3: ใบของข้อสอบผูก Party (ค่าเริ่ม = ผู้เช่าหลักของร้าน) เพื่อให้หักประกันของผู้เช่าคนเดียวกันได้
  const mk = async (lines: [number, "EXEMPT" | "VAT7" | "NONE"][] = [[500_000, "EXEMPT"], [35_000, "VAT7"]], unitId = U.V, t = T.A, vat: Any = VAT_INC, partyId?: string) => {
    const r = await dormInv(t, unitId, simpleLines(lines), vat, { partyId: partyId ?? (t === T.B ? PARTY.b : PARTY.main) });
    if (!r?.ok) throw new Error(`ออกใบแจ้งหนี้ทดสอบไม่ได้: ${codeOf(r)}`);
    return (await docOf(r.docId)) as Any;
  };
  await step("P-1", "จ่ายพอดี ⇒ PAID · applied=ยอด excess 0 · คงค้าง 0 · GL: Dr 1010 / Cr 1100 · VAT สุทธิ 0 · ไม่มีรายได้ · สมดุล", async (p) => {
    const d = await mk();
    const b4 = await entryIdSet(SYSID.V);
    const r = await pay(T.A, U.V, d.id, T1, newKey("p1"), { slipId: `${PFX}-slip-1` });
    const d2 = await docOf(d.id);
    if (!r?.ok || r.appliedSatang !== T1 || r.excessSatang !== 0 || r.outstandingSatang !== 0 || r.status !== "PAID" || !r.paymentId || r.duplicate !== false) p.push(`ผล ${codeOf(r)} ${js(r).slice(0, 160)}`);
    if (d2.status !== "PAID" || d2.paidTotal !== T1) p.push(`เอกสาร ${d2.status}/${d2.paidTotal}`);
    const es = await since(SYSID.V, b4); const m = net(es);
    if (nz(m, "1010") !== T1 || nz(m, "1100") !== -T1 || vatNet(m) !== 0 || typeTouched(es, "INCOME") || es.some((e) => dr(e) !== cr(e))) p.push(`GL ${js([...m])}`);
  });
  await step("P-2", "จ่ายขาด ⇒ PARTIAL · คงค้างถูก · จ่ายส่วนที่เหลือ ⇒ PAID", async (p) => {
    const d = await mk();
    const r = await pay(T.A, U.V, d.id, 200_000, newKey());
    if (!r?.ok || r.status !== "PARTIAL" || r.appliedSatang !== 200_000 || r.excessSatang !== 0 || r.outstandingSatang !== T1 - 200_000) p.push(`ขาด ${js(r).slice(0, 160)}`);
    const r2 = await pay(T.A, U.V, d.id, T1 - 200_000, newKey());
    if (!r2?.ok || r2.status !== "PAID" || r2.outstandingSatang !== 0) p.push(`ที่เหลือ ${codeOf(r2)} ${r2?.status}`);
    if ((await docOf(d.id)).paidTotal !== T1) p.push("paidTotal ไม่ตรง");
  });
  await step("P-3", "จ่ายเกิน ⇒ PAID · applied = คงค้าง · excess = ส่วนเกิน · GL: Dr 1010 เต็ม / Cr 1100 applied / Cr 2110 excess (ไม่ใช่รายได้ ไม่ใช่ 2140)", async (p) => {
    const d = await mk();
    await pay(T.A, U.V, d.id, 100_000, newKey());
    const b4 = await entryIdSet(SYSID.V);
    const r = await pay(T.A, U.V, d.id, 600_000, newKey());
    const rem = T1 - 100_000, ex = 600_000 - rem;
    if (!r?.ok || r.appliedSatang !== rem || r.excessSatang !== ex || r.status !== "PAID" || r.outstandingSatang !== 0) p.push(`ผล ${js(r).slice(0, 160)}`);
    const d2 = await docOf(d.id);
    if (d2.paidTotal !== T1) p.push(`paidTotal ${d2.paidTotal} ≠ ${T1} (ห้ามบันทึกเกินหนี้)`);
    const es = await since(SYSID.V, b4); const m = net(es);
    if (nz(m, "1010") !== 600_000 || nz(m, "1100") !== -rem || nz(m, "2110") !== -ex || typeTouched(es, "INCOME") || es.some((e) => dr(e) !== cr(e))) p.push(`GL ${js([...m])}`);
    const dl = await depLedger(SYSID.V);
    if (dl && es.some((e) => e.lines.some((l) => l.code === dl.account.code))) p.push("ส่วนเกินลงบัญชีเงินประกัน");
  });
  await step("P-4", "X4: คีย์เดิมซ้ำ ⇒ duplicate:true · paymentId เดิม · ไม่มีแถว/ใบสำคัญใหม่ (รวมกรณีส่วนเกินล้วน)", async (p) => {
    const d = await mk();
    const k = newKey("slip");
    const a = await pay(T.A, U.V, d.id, T1, k);
    const c0 = await counts(T.A);
    const b = await pay(T.A, U.V, d.id, T1, k);
    if (!b?.ok || b.duplicate !== true || b.paymentId !== a?.paymentId || b.appliedSatang !== T1) p.push(`ซ้ำ ${js(b).slice(0, 140)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
    const k2 = newKey("slipx");
    const x1 = await pay(T.A, U.V, d.id, 70_000, k2);
    if (!x1?.ok || x1.appliedSatang !== 0 || x1.excessSatang !== 70_000 || x1.paymentId !== null) p.push(`จ่ายใบที่ PAID แล้ว ${js(x1).slice(0, 140)}`);
    const c1 = await counts(T.A);
    const x2 = await pay(T.A, U.V, d.id, 70_000, k2);
    if (!x2?.ok || x2.duplicate !== true || x2.excessSatang !== 70_000) p.push(`ซ้ำส่วนเกินล้วน ${js(x2).slice(0, 140)}`);
    if (!sameCounts(c1, await counts(T.A))) p.push("ส่วนเกินล้วนซ้ำแล้วมีแถวเพิ่ม");
  });
  await step("P-5", "คีย์เดิมแต่ยอดต่าง/เอกสารต่าง ⇒ IDEMPOTENCY_CONFLICT · ไม่มีแถว", async (p) => {
    const d = await mk(); const d2 = await mk();
    const k = newKey();
    await pay(T.A, U.V, d.id, 100_000, k);
    const c0 = await counts(T.A);
    const a = await pay(T.A, U.V, d.id, 100_001, k);
    const b = await pay(T.A, U.V, d2.id, 100_000, k);
    if (!refused(a, "IDEMPOTENCY_CONFLICT")) p.push(`ยอดต่าง ${codeOf(a)}`);
    if (!refused(b, "IDEMPOTENCY_CONFLICT")) p.push(`เอกสารต่าง ${codeOf(b)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  await step("P-6", "X3: 10 ทางพร้อมกันคีย์เดียว ⇒ ทุกตัว ok · paymentId เดียว · แถวรับชำระ 1 · paidTotal ครั้งเดียว · เงินเข้า GL ครั้งเดียว", async (p) => {
    const d = await mk();
    const k = newKey("slip10");
    const b4 = await entryIdSet(SYSID.V);
    const rs10 = await Promise.all(Array.from({ length: 10 }, () => pay(T.A, U.V, d.id, 300_000, k)));
    if (rs10.some((r) => !r?.ok)) p.push(`ไม่ ok: ${rs10.filter((r) => !r?.ok).map(codeOf).slice(0, 3).join(" | ")}`);
    const pids = new Set(rs10.map((r) => r?.paymentId));
    if (pids.size !== 1) p.push(`paymentId ${pids.size} แบบ`);
    if (rs10.filter((r) => r?.ok && r.duplicate === false).length !== 1) p.push(`duplicate:false ${rs10.filter((r) => r?.ok && r.duplicate === false).length} ตัว`);
    if ((await prisma.accountDocumentPayment.count({ where: { documentId: d.id } })) !== 1) p.push("แถวรับชำระไม่ใช่ 1");
    if ((await docOf(d.id)).paidTotal !== 300_000) p.push("paidTotal ไม่ใช่ 300,000");
    if (nz(net(await since(SYSID.V, b4)), "1010") !== 300_000) p.push("เงินเข้า GL ไม่ใช่ครั้งเดียว");
  });
  await step("P-7", "X3: 10 สลิป (คีย์ต่าง) ยอดเต็มพร้อมกัน ⇒ applied รวม = ยอดใบพอดี · excess รวม = 9 เท่า · paidTotal = grand · AR ของใบ = 0 · 2110 = excess", async (p) => {
    const d = await mk();
    const b4 = await entryIdSet(SYSID.V);
    const rs10 = await Promise.all(Array.from({ length: 10 }, (_, i) => pay(T.A, U.V, d.id, T1, newKey(`s${i}`))));
    if (rs10.some((r) => !r?.ok)) p.push(`ไม่ ok: ${rs10.filter((r) => !r?.ok).map(codeOf).slice(0, 3).join(" | ")}`);
    const ap = rs10.reduce((s, r) => s + (r?.appliedSatang ?? 0), 0), ex = rs10.reduce((s, r) => s + (r?.excessSatang ?? 0), 0);
    if (ap !== T1 || ex !== 9 * T1) p.push(`applied ${ap} excess ${ex}`);
    const d2 = await docOf(d.id);
    if (d2.paidTotal !== T1 || d2.status !== "PAID") p.push(`เอกสาร ${d2.status}/${d2.paidTotal}`);
    const m = net(await since(SYSID.V, b4));
    if (nz(m, "1010") !== 10 * T1 || nz(m, "1100") !== -T1 || nz(m, "2110") !== -9 * T1) p.push(`GL ${js([...m])}`);
  });
  await step("P-8", "ยอดผิด ⇒ INVALID_AMOUNT (0 · −1 · 1.5 · NaN) · คีย์ว่าง ⇒ INVALID_INPUT · ไม่มีแถว", async (p) => {
    const d = await mk();
    const c0 = await counts(T.A);
    for (const a of [0, -1, 1.5, Number.NaN]) { const r = await pay(T.A, U.V, d.id, a, newKey()); if (!refused(r, "INVALID_AMOUNT")) p.push(`${a}: ${codeOf(r)}`); }
    const e = await pay(T.A, U.V, d.id, 100, "  ");
    if (!refused(e, "INVALID_INPUT")) p.push(`คีย์ว่าง: ${codeOf(e)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  await step("P-9", "เงินสด ⇒ Dr 1000 · PROMPTPAY ⇒ Dr 1010", async (p) => {
    const d = await mk();
    let b4 = await entryIdSet(SYSID.V);
    await pay(T.A, U.V, d.id, 100_000, newKey(), { channel: "CASH" });
    let m = net(await since(SYSID.V, b4));
    if (nz(m, "1000") !== 100_000 || nz(m, "1010") !== 0) p.push(`CASH ${js([...m])}`);
    b4 = await entryIdSet(SYSID.V);
    await pay(T.A, U.V, d.id, 100_000, newKey(), { channel: "PROMPTPAY" });
    m = net(await since(SYSID.V, b4));
    if (nz(m, "1010") !== 100_000) p.push(`PROMPTPAY ${js([...m])}`);
  }, "MAJOR");
  await step("P-10", "X1: ร้าน B ใช้ docId ของ A · หน่วย N ใช้เอกสารหน่วย V · เอกสาร CRM ในสมุดเดียวกัน ⇒ NOT_FOUND · เอกสารไม่ขยับ", async (p) => {
    const d = await mk();
    const crm = await call(ACC, "createExternalInvoice", crmIn({ refId: newRef() }));
    const cA = await counts(T.A), cB = await counts(T.B);
    const a = await pay(T.B, U.B, d.id, 100_000, newKey());
    const b = await pay(T.A, U.N, d.id, 100_000, newKey());
    const c = crm?.ok ? await pay(T.A, U.V, crm.docId, 100_000, newKey()) : { ok: false, code: "ไม่มีใบ CRM" };
    for (const [t, r] of [["B→A", a], ["N→V", b], ["CRM", c]] as const) if (!refused(r, "NOT_FOUND")) p.push(`${t}: ${codeOf(r)}`);
    if (!sameCounts(cA, await counts(T.A)) || !sameCounts(cB, await counts(T.B))) p.push("มีแถวเพิ่ม");
  });
  await step("P-11", "ใบร่าง ⇒ NOT_PAYABLE · ไม่มีแถว", async (p) => {
    const r = await dormInv(T.A, U.V, simpleLines([[50_000, "EXEMPT"]]), VAT_INC, { extra: { draft: true } });
    if (!r?.ok) { p.push(`สร้างร่าง ${codeOf(r)}`); return; }
    const c0 = await counts(T.A);
    const x = await pay(T.A, U.V, r.docId, 50_000, newKey());
    if (!refused(x, "NOT_PAYABLE")) p.push(codeOf(x));
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  await step("P-12", "โหมดราคาไม่รวม VAT: จ่ายตาม grandTotal (รวม VAT) ⇒ PAID", async (p) => {
    const d = await mk([[450_000, "EXEMPT"], [100_000, "VAT7"]], U.V, T.A, VAT_EXC);
    if (d.grandTotal !== 557_000) p.push(`grand ${d.grandTotal} ≠ 557,000`);
    const r = await pay(T.A, U.V, d.id, d.grandTotal, newKey());
    if (!r?.ok || r.status !== "PAID" || r.excessSatang !== 0) p.push(codeOf(r));
  });

  // ───────── N ใบลดหนี้/เพิ่มหนี้ ─────────
  out("\n── N ใบลดหนี้ / ใบเพิ่มหนี้ ──");
  await step("N-1", "ใบลดหนี้บางส่วน: ออกเลข ISSUED · DORM · sourceDocId · ยอด = computeBill · GL Dr รายได้+VAT / Cr 1100 สมดุล · คงค้างลด · จ่ายส่วนที่เหลือพอดี ⇒ PAID", async (p) => {
    const d = await mk([[500_000, "EXEMPT"], [107_000, "VAT7"]]);
    const cnLines = simpleLines([[53_500, "VAT7"]]);
    const b4 = await entryIdSet(SYSID.V);
    const r = await note("createExternalCreditNote", T.A, U.V, d.id, cnLines, VAT_INC);
    const cn = r?.ok ? await docOf(r.docId) : null;
    const exp = CALC.computeBill({ lines: cnLines.map((l) => ({ code: "X", labelTh: l.description, amountSatang: l.unitPriceSatang, taxKind: l.taxKind })), vat: VAT_INC });
    if (!cn || cn.docType !== "CREDIT_NOTE" || cn.status !== "ISSUED" || !cn.docNo || cn.source !== "DORM" || cn.sourceDocId !== d.id || cn.refSystemId !== U.V) p.push(`CN ${codeOf(r)} ${js({ t: cn?.docType, s: cn?.status, src: cn?.source })}`);
    if (cn && (cn.grandTotal !== exp.totalSatang || cn.vatAmount !== exp.vatSatang || cn.subTotal !== exp.subtotalSatang)) p.push(`ยอด CN ${cn.subTotal}/${cn.vatAmount}/${cn.grandTotal}`);
    const es = await since(SYSID.V, b4); const m = net(es);
    const incDr = es.reduce((s, e) => s + e.lines.filter((l) => l.type === "INCOME").reduce((a, l) => a + l.debit - l.credit, 0), 0);
    if (nz(m, "1100") !== -exp.totalSatang || vatNet(m) !== exp.vatSatang || incDr !== exp.subtotalSatang || es.some((e) => dr(e) !== cr(e))) p.push(`GL ${js([...m])} incDr ${incDr}`);
    const rem = d.grandTotal - exp.totalSatang;
    const x = await pay(T.A, U.V, d.id, rem, newKey());
    if (!x?.ok || x.status !== "PAID" || x.excessSatang !== 0 || x.appliedSatang !== rem) p.push(`จ่ายหลัง CN ${js(x).slice(0, 140)}`);
  });
  await step("N-2", "ใบลดหนี้เกินคงค้าง ⇒ EXCEEDS_REMAINING · ไม่มีเอกสารที่ออกแล้วเพิ่ม", async (p) => {
    const d = await mk();
    await pay(T.A, U.V, d.id, 500_000, newKey());
    const n0 = await prisma.accountDocument.count({ where: { tenantId: T.A, docType: "CREDIT_NOTE", status: { not: "DRAFT" } } });
    const r = await note("createExternalCreditNote", T.A, U.V, d.id, simpleLines([[35_100, "EXEMPT"]]), VAT_INC);
    if (!refused(r, "EXCEEDS_REMAINING")) p.push(codeOf(r));
    if ((await prisma.accountDocument.count({ where: { tenantId: T.A, docType: "CREDIT_NOTE", status: { not: "DRAFT" } } })) !== n0) p.push("มีใบลดหนี้ออกเพิ่ม");
  });
  await step("N-3", "ใบลดหนี้ปิดยอดคงค้างทั้งหมด ⇒ ต้นทาง PAID · ซ้ำ ref เดิม ⇒ ใบเดิม created:false", async (p) => {
    const d = await mk();
    await pay(T.A, U.V, d.id, 500_000, newKey());
    const ref = newRef();
    const r = await note("createExternalCreditNote", T.A, U.V, d.id, simpleLines([[35_000, "VAT7"]]), VAT_INC, { refId: ref });
    if (!r?.ok) { p.push(codeOf(r)); return; }
    if ((await docOf(d.id)).status !== "PAID") p.push(`ต้นทาง ${(await docOf(d.id)).status}`);
    if ((await liveCN(d.id)) !== 35_000) p.push("ยอดใบลดหนี้ที่มีผลไม่ตรง");
    const again = await note("createExternalCreditNote", T.A, U.V, d.id, simpleLines([[35_000, "VAT7"]]), VAT_INC, { refId: ref });
    if (!again?.ok || again.docId !== r.docId || again.created !== false) p.push(`ซ้ำ ${codeOf(again)} ${again?.created}`);
  });
  await step("N-4", "เหตุผลว่าง ⇒ INVALID_INPUT · ข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND · ไม่มีแถว", async (p) => {
    const d = await mk();
    const cA = await counts(T.A), cB = await counts(T.B);
    const a = await note("createExternalCreditNote", T.A, U.V, d.id, simpleLines([[1_000, "EXEMPT"]]), VAT_INC, { reason: "   " });
    const b = await note("createExternalCreditNote", T.B, U.B, d.id, simpleLines([[1_000, "EXEMPT"]]), VAT_INC);
    const c = await note("createExternalDebitNote", T.A, U.N, d.id, simpleLines([[1_000, "NONE"]]), VAT_NO);
    if (!refused(a, "INVALID_INPUT")) p.push(`เหตุผลว่าง ${codeOf(a)}`);
    if (!refused(b, "NOT_FOUND")) p.push(`ร้าน B ${codeOf(b)}`);
    if (!refused(c, "NOT_FOUND")) p.push(`หน่วย N ${codeOf(c)}`);
    if (!sameCounts(cA, await counts(T.A)) || !sameCounts(cB, await counts(T.B))) p.push("มีแถวเพิ่ม");
  });
  await step("N-5", "ใบเพิ่มหนี้: ออกเลข · DORM · ยอด = computeBill · GL Dr 1100 / Cr รายได้ + Cr VAT สมดุล", async (p) => {
    const d = await mk();
    const dnLines = simpleLines([[21_400, "VAT7"], [5_000, "NONE"]]);
    const b4 = await entryIdSet(SYSID.V);
    const r = await note("createExternalDebitNote", T.A, U.V, d.id, dnLines, VAT_INC);
    const dn = r?.ok ? await docOf(r.docId) : null;
    const exp = CALC.computeBill({ lines: dnLines.map((l) => ({ code: "X", labelTh: l.description, amountSatang: l.unitPriceSatang, taxKind: l.taxKind })), vat: VAT_INC });
    if (!dn || dn.docType !== "DEBIT_NOTE" || !dn.docNo || dn.source !== "DORM" || dn.grandTotal !== exp.totalSatang || dn.vatAmount !== exp.vatSatang) p.push(`DN ${codeOf(r)} ${dn?.grandTotal}/${dn?.vatAmount}`);
    const es = await since(SYSID.V, b4); const m = net(es);
    const incCr = es.reduce((s, e) => s + e.lines.filter((l) => l.type === "INCOME").reduce((a, l) => a + l.credit - l.debit, 0), 0);
    if (nz(m, "1100") !== exp.totalSatang || vatNet(m) !== -exp.vatSatang || incCr !== exp.subtotalSatang || es.some((e) => dr(e) !== cr(e))) p.push(`GL ${js([...m])}`);
  });

  // ───────── S เงินประกัน ─────────
  out("\n── S เงินประกัน (หนี้สิน) ──");
  const L = { a: `${PFX}-lease-a`, b: `${PFX}-lease-b`, c: `${PFX}-lease-c`, d: `${PFX}-lease-d`, e: `${PFX}-lease-e`, f: `${PFX}-lease-f`, g: `${PFX}-lease-g` };
  let DEP_CODE = "";
  await step("S-1", "รับประกัน ฿9,000 โอน: JV เดียว Dr 1010 / Cr บัญชีประกัน · บัญชี = LIABILITY รหัส 2140 ชื่อ \"เงินประกันรับจากผู้เช่า\" ป้ายรอตรวจ (J4) · mapping สร้างแล้ว · ไม่มี VAT/รายได้/2110 · held = 9,000", async (p) => {
    const b4 = await entryIdSet(SYSID.V);
    const r = await deposit(T.A, U.V, L.a, 900_000, newKey("dep"));
    if (!r?.ok || !r.entryId || !r.entryNo || r.heldSatang !== 900_000 || r.duplicate !== false) p.push(`ผล ${codeOf(r)} ${js(r).slice(0, 140)}`);
    const dl = await depLedger(SYSID.V);
    if (!dl) { p.push("ไม่มี mapping TENANT_SECURITY_DEPOSIT"); return; }
    DEP_CODE = dl.account.code;
    if (dl.account.type !== "LIABILITY" || dl.account.code !== "2140" || dl.account.name !== "เงินประกันรับจากผู้เช่า" || !/รอตรวจ/.test(dl.account.description ?? "")) p.push(`บัญชี ${js({ c: dl.account.code, t: dl.account.type, n: dl.account.name, d: dl.account.description })}`);
    const es = await since(SYSID.V, b4);
    if (es.length !== 1) p.push(`ใบสำคัญ ${es.length}`);
    const m = net(es);
    if (nz(m, "1010") !== 900_000 || nz(m, DEP_CODE) !== -900_000 || vatNet(m) !== 0 || nz(m, "2110") !== 0 || typeTouched(es, "INCOME") || es.some((e) => dr(e) !== cr(e))) p.push(`GL ${js([...m])}`);
    if (r?.ok && es[0] && (r.entryId !== es[0].id || r.entryNo !== es[0].docNo)) p.push("entryId/entryNo ไม่ตรงใบสำคัญ");
    if ((await held(T.A, U.V, L.a)) !== 900_000) p.push(`held ${await held(T.A, U.V, L.a)}`);
  });
  await step("S-2", "รับเพิ่มเงินสด ฿4,500 (หลายครั้งต่อสัญญา) ⇒ Dr 1000 · held = 13,500 · mapping/บัญชีไม่สร้างซ้ำ", async (p) => {
    const b4 = await entryIdSet(SYSID.V);
    const r = await deposit(T.A, U.V, L.a, 450_000, newKey("dep"), { channel: "CASH" });
    const m = net(await since(SYSID.V, b4));
    if (!r?.ok || r.heldSatang !== 1_350_000) p.push(`ผล ${codeOf(r)} held ${r?.heldSatang}`);
    if (nz(m, "1000") !== 450_000 || nz(m, DEP_CODE || "2140") !== -450_000) p.push(`GL ${js([...m])}`);
    if ((await prisma.accountLedger.count({ where: { systemId: SYSID.V, name: "เงินประกันรับจากผู้เช่า" } })) !== 1) p.push("บัญชีประกันมีมากกว่า 1");
    if ((await held(T.A, U.V, L.a)) !== 1_350_000) p.push("held ไม่ใช่ 13,500");
  });
  await step("S-3", "X3/X4: คีย์เดิมซ้ำ ⇒ duplicate entryId เดิม ไม่มี JV ใหม่ · 10 ทางพร้อมกันคีย์ใหม่ ⇒ JV 1 · held เพิ่มครั้งเดียว · คีย์เดิมยอดต่าง ⇒ IDEMPOTENCY_CONFLICT", async (p) => {
    const k = newKey("dep");
    const a = await deposit(T.A, U.V, L.b, 300_000, k);
    const c0 = await counts(T.A);
    const b = await deposit(T.A, U.V, L.b, 300_000, k);
    if (!b?.ok || b.duplicate !== true || b.entryId !== a?.entryId) p.push(`ซ้ำ ${js(b).slice(0, 120)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("ซ้ำแล้วมีแถวเพิ่ม");
    const x = await deposit(T.A, U.V, L.b, 300_001, k);
    if (!refused(x, "IDEMPOTENCY_CONFLICT")) p.push(`ยอดต่าง ${codeOf(x)}`);
    const k10 = newKey("dep10");
    const b4 = await entryIdSet(SYSID.V);
    const rs10 = await Promise.all(Array.from({ length: 10 }, () => deposit(T.A, U.V, L.b, 200_000, k10)));
    if (rs10.some((r) => !r?.ok)) p.push(`ไม่ ok ${rs10.filter((r) => !r?.ok).map(codeOf).slice(0, 2).join(" | ")}`);
    if (new Set(rs10.map((r) => r?.entryId)).size !== 1) p.push("entryId หลายแบบ");
    if ((await since(SYSID.V, b4)).length !== 1) p.push("JV ไม่ใช่ 1");
    if ((await held(T.A, U.V, L.b)) !== 500_000) p.push(`held ${await held(T.A, U.V, L.b)} ≠ 500,000`);
  });
  await step("S-4", "ยอดผิด ⇒ INVALID_AMOUNT (0 · −1 · 1.5) · หน่วยไม่ผูก ⇒ NOT_LINKED · ไม่มีแถว", async (p) => {
    const c0 = await counts(T.A);
    for (const a of [0, -1, 1.5]) { const r = await deposit(T.A, U.V, L.c, a, newKey()); if (!refused(r, "INVALID_AMOUNT")) p.push(`${a}: ${codeOf(r)}`); }
    const n = await deposit(T.A, U.X, L.c, 100_000, newKey());
    if (!refused(n, "NOT_LINKED")) p.push(`ไม่ผูก ${codeOf(n)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  await step("S-5", "X1: ยอดถือข้ามหน่วย (N · สัญญาเดียวกัน) = 0 · ข้ามร้าน (B) = 0 · ไม่ throw", async (p) => {
    const a = await held(T.A, U.N, L.a), b = await held(T.B, U.B, L.a), c = await held(T.B, U.V, L.a);
    if (a !== 0 || b !== 0 || c !== 0) p.push(`N=${js(a)} B=${js(b)} B→V=${js(c)}`);
  });
  await step("S-6", "สมุดที่มีรหัส 2140 ของร้านอยู่แล้ว (ASSET) ⇒ ประกันลงบัญชี LIABILITY รหัส 2141–2149 · บัญชีของร้านไม่ถูกแตะ", async (p) => {
    const own = await prisma.accountLedger.create({ data: { tenantId: T.B, systemId: SYSID.B, code: "2140", name: "เงินฝากประจำของร้าน (ทดสอบชนรหัส)", type: "ASSET" } });
    const r = await deposit(T.B, U.B, L.d, 250_000, newKey("depB"));
    const dl = await depLedger(SYSID.B);
    if (!r?.ok || !dl) { p.push(`${codeOf(r)} mapping=${!!dl}`); return; }
    if (dl.account.id === own.id || dl.account.type !== "LIABILITY" || !/^214[1-9]$/.test(dl.account.code)) p.push(`บัญชี ${dl.account.code}/${dl.account.type}`);
    if ((await prisma.accountJournalLine.count({ where: { accountId: own.id } })) !== 0) p.push("ลงบัญชีของร้าน");
    if ((await held(T.B, U.B, L.d)) !== 250_000) p.push("held B ไม่ใช่ 2,500");
  }, "MAJOR");

  // ── ปิดประกัน ──
  const depAmt = async (leaseId: string, amt: number) => { const r = await deposit(T.A, U.V, leaseId, amt, newKey("dep")); if (!r?.ok) throw new Error(`รับประกันไม่ได้: ${codeOf(r)}`); };
  const settleChecks = (p: string[], es: EN[], heldAmt: number, applied: number, refund: number) => {
    const m = net(es);
    const depDebitEntries = es.filter((e) => e.lines.some((l) => l.code === DEP_CODE && l.debit > 0));
    if (depDebitEntries.length !== 1) p.push(`JV ที่ Dr บัญชีประกัน ${depDebitEntries.length} ใบ (ต้อง 1 · หัก+คืนรายการเดียว)`);
    const e = depDebitEntries[0];
    if (e) {
      const s = (c: string, k: "debit" | "credit") => e.lines.filter((l) => l.code === c).reduce((a, l) => a + l[k], 0);
      const cash = s("1010", "credit") + s("1000", "credit");
      if (s(DEP_CODE, "debit") !== heldAmt || s("1100", "credit") !== applied || cash !== refund) p.push(`JV ปิด: Dr ประกัน ${s(DEP_CODE, "debit")} Cr 1100 ${s("1100", "credit")} Cr เงิน ${cash}`);
    }
    if (nz(m, DEP_CODE) !== heldAmt || nz(m, "1100") !== -applied || nz(m, "1010") + nz(m, "1000") !== -refund || vatNet(m) !== 0 || typeTouched(es, "INCOME") || nz(m, "2110") !== 0) p.push(`สุทธิ ${js([...m])}`);
    if (es.some((x) => dr(x) !== cr(x))) p.push("JV ไม่สมดุล");
  };
  await step("S-7", "ปิดประกัน คืนเต็ม (ไม่มีหัก): JV เดียว Dr ประกัน 9,000 / Cr 1010 9,000 · held 0 · ผลคืนถูก", async (p) => {
    await depAmt(L.c, 900_000);
    const b4 = await entryIdSet(SYSID.V);
    const r = await settle(T.A, U.V, L.c, [], newKey("st"));
    if (!r?.ok || r.heldSatang !== 900_000 || r.appliedSatang !== 0 || r.refundSatang !== 900_000 || r.tenantOwesSatang !== 0 || r.duplicate !== false) p.push(`ผล ${codeOf(r)} ${js(r).slice(0, 160)}`);
    settleChecks(p, await since(SYSID.V, b4), 900_000, 0, 900_000);
    if ((await held(T.A, U.V, L.c)) !== 0) p.push("held หลังปิดไม่ใช่ 0");
  });
  await step("S-8", "ปิดประกัน หักบางส่วน (ค่าน้ำไฟวันออก + ค่าเสียหาย ออกเป็นใบแจ้งหนี้ก่อน) ⇒ หัก 4,200 คืน 4,800 · JV เดียว · ใบที่ถูกหัก PAID", async (p) => {
    await depAmt(L.e, 900_000);
    const util = await mk([[120_000, "VAT7"]]);
    const dmg = await mk([[300_000, "NONE"]]);
    const b4 = await entryIdSet(SYSID.V);
    const r = await settle(T.A, U.V, L.e, [util.id, dmg.id], newKey("st"));
    if (!r?.ok || r.appliedSatang !== 420_000 || r.refundSatang !== 480_000 || r.tenantOwesSatang !== 0) p.push(`ผล ${codeOf(r)} ${js(r).slice(0, 160)}`);
    if (r?.ok && js(r.applied) !== js([{ docId: util.id, amountSatang: 120_000 }, { docId: dmg.id, amountSatang: 300_000 }])) p.push(`applied ${js(r.applied)}`);
    for (const d of [util, dmg]) { const x = await docOf(d.id); if (x.status !== "PAID" || x.paidTotal !== d.grandTotal) p.push(`${x.docNo} ${x.status}/${x.paidTotal}`); }
    settleChecks(p, await since(SYSID.V, b4), 900_000, 420_000, 480_000);
  });
  await step("S-9", "ปิดประกัน หักเกินประกัน (ทวงเพิ่ม): ถือ 3,000 · ใบ 5,000 ⇒ หัก 3,000 คืน 0 ทวง 2,000 · ใบ PARTIAL คงค้าง 2,000 · ไม่มีขาเงิน", async (p) => {
    await depAmt(L.f, 300_000);
    const big = await mk([[500_000, "NONE"]]);
    const b4 = await entryIdSet(SYSID.V);
    const r = await settle(T.A, U.V, L.f, [big.id], newKey("st"));
    if (!r?.ok || r.appliedSatang !== 300_000 || r.refundSatang !== 0 || r.tenantOwesSatang !== 200_000) p.push(`ผล ${codeOf(r)} ${js(r).slice(0, 160)}`);
    const x = await docOf(big.id);
    if (x.status !== "PARTIAL" || outstanding(x) !== 200_000) p.push(`ใบ ${x.status} คงค้าง ${outstanding(x)}`);
    const es = await since(SYSID.V, b4);
    settleChecks(p, es, 300_000, 300_000, 0);
    if (es.some((e) => e.lines.some((l) => (l.code === "1010" || l.code === "1000") && l.credit > 0))) p.push("มีขาจ่ายเงินทั้งที่คืน 0");
    const owe = await pay(T.A, U.V, big.id, 200_000, newKey());
    if (!owe?.ok || owe.status !== "PAID") p.push(`ทวงแล้วจ่าย ${codeOf(owe)}`);
  });
  await step("S-10", "X3/X4: ปิดซ้ำคีย์เดิม ⇒ duplicate ผลเดิม ไม่มี JV ใหม่ · ปิดอีกครั้งคีย์ใหม่ ⇒ NO_DEPOSIT_HELD · 10 ทางพร้อมกัน (คีย์ต่าง) ⇒ ปิดครั้งเดียว", async (p) => {
    await depAmt(L.g, 400_000);
    const k = newKey("st");
    const a = await settle(T.A, U.V, L.g, [], k);
    const c0 = await counts(T.A);
    const b = await settle(T.A, U.V, L.g, [], k);
    if (!b?.ok || b.duplicate !== true || b.entryId !== a?.entryId || b.refundSatang !== 400_000) p.push(`ซ้ำ ${js(b).slice(0, 140)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("ซ้ำแล้วมีแถว");
    const c = await settle(T.A, U.V, L.g, [], newKey("st"));
    if (!refused(c, "NO_DEPOSIT_HELD")) p.push(`ปิดซ้ำคีย์ใหม่ ${codeOf(c)}`);
    const L10 = `${PFX}-lease-10`;
    await depAmt(L10, 200_000);
    const b4 = await entryIdSet(SYSID.V);
    const rs10 = await Promise.all(Array.from({ length: 10 }, (_, i) => settle(T.A, U.V, L10, [], newKey(`st${i}`))));
    const wins = rs10.filter((r) => r?.ok && r.duplicate === false);
    const others = rs10.filter((r) => !(r?.ok && r.duplicate === false));
    if (wins.length !== 1) p.push(`ปิดสำเร็จ ${wins.length} ครั้ง`);
    if (others.some((r) => !(r?.ok && r.duplicate === true) && !refused(r, "NO_DEPOSIT_HELD"))) p.push(`ตัวแพ้ ${others.map(codeOf).slice(0, 2).join(" | ")}`);
    const es = await since(SYSID.V, b4);
    if (nz(net(es), DEP_CODE) !== 200_000 || nz(net(es), "1010") !== -200_000) p.push(`GL ${js([...net(es)])}`);
    if ((await held(T.A, U.V, L10)) !== 0) p.push("held ไม่ใช่ 0");
  });
  await step("S-11", "X1: applyToDocIds มีใบของร้าน B / หน่วย N / ใบ CRM ⇒ NOT_FOUND ทั้งคำขอ · ไม่มี JV · held ไม่ขยับ · ปิดสัญญาที่ไม่เคยรับ ⇒ NO_DEPOSIT_HELD", async (p) => {
    const lease = `${PFX}-lease-x1`;
    await depAmt(lease, 500_000);
    const mine = await mk([[100_000, "NONE"]]);
    const other = await mk([[100_000, "NONE"]], U.B, T.B, VAT_INC);
    const nDoc = await mk([[100_000, "NONE"]], U.N, T.A, VAT_NO);
    const crm = await call(ACC, "createExternalInvoice", crmIn({ refId: newRef() }));
    const c0 = await counts(T.A);
    for (const [tag, ids] of [["B", [mine.id, other.id]], ["N", [nDoc.id]], ["CRM", crm?.ok ? [crm.docId] : ["ไม่มี"]]] as const) {
      const r = await settle(T.A, U.V, lease, [...ids], newKey("st"));
      if (!refused(r, "NOT_FOUND")) p.push(`${tag}: ${codeOf(r)}`);
    }
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
    if ((await held(T.A, U.V, lease)) !== 500_000) p.push("held ขยับ");
    if ((await docOf(mine.id)).paidTotal !== 0) p.push("ใบของหน่วยถูกหักทั้งที่คำขอล้ม");
    const z = await settle(T.A, U.V, `${PFX}-lease-never`, [], newKey("st"));
    if (!refused(z, "NO_DEPOSIT_HELD")) p.push(`ไม่เคยรับ ${codeOf(z)}`);
    const xb = await settle(T.B, U.B, lease, [], newKey("st"));
    if (!refused(xb, "NO_DEPOSIT_HELD", "NOT_FOUND")) p.push(`ร้าน B ปิดสัญญาของ A ${codeOf(xb)}`);
  });
  await step("S-12", "ยอดบัญชีประกันทั้งสมุด V = Σ ยอดถือของทุกสัญญาที่ยังไม่ปิด (หนี้สินคงเหลือถูก)", async (p) => {
    if (!DEP_CODE) { p.push("ไม่มีบัญชีประกัน"); return; }
    const bal = -nz(net(await entries(SYSID.V)), DEP_CODE);
    const leases = [L.a, L.b, `${PFX}-lease-x1`];
    const sum = (await Promise.all(leases.map((l) => held(T.A, U.V, l)))).reduce((s: number, x: Any) => s + Number(x || 0), 0);
    if (bal !== sum || bal !== 1_350_000 + 500_000 + 500_000) p.push(`ยอดบัญชี ${bal} · Σheld ${sum}`);
  });

  // ═════════ ORACLE-EDIT 28 ต.ค. (review) — ชุดเพิ่มหลังผู้ตรวจ 2 คน (/root/svc-runs/fix/d2.md F1–F8) ═════════
  // วางหลัง S-12 (ยอดบัญชีประกันสมุด V ของ S-12 นับเฉพาะสัญญาเดิม) · ทุกสัญญาใหม่ใช้ leaseId ใหม่
  out("\n── ORACLE-EDIT 28 ต.ค. (review) · P-13 P-14 N-6 N-7 S-13…S-18 G-3 ──");
  const JR: Any = await tryImport("@/lib/modules/account/journal-v2");
  const REF_DEP = (GL?.DORM_DEPOSIT_REF_TYPE as string) || "DormSecurityDeposit";
  const REF_EX = (GL?.DORM_EXCESS_REF_TYPE as string) || "DormPaymentExcess";
  const newLease = (t: string) => `${PFX}-lease-${t}-${randomBytes(3).toString("hex")}`;
  /** ใบสำคัญใหม่ของหลายสมุดรวมกัน (snapshot ต่อสมุด) */
  const snapMany = async (ss: string[]) => { const m = new Map<string, Set<string>>(); for (const x of [...new Set(ss)]) m.set(x, await entryIdSet(x)); return m; };
  const sinceMany = async (m: Map<string, Set<string>>) => { const o: EN[] = []; for (const [x, b] of m) o.push(...(await since(x, b))); return o; };
  const cashNet = (m: Map<string, number>) => nz(m, "1000") + nz(m, "1010");
  const reverseSettle = (unitId: string, leaseId: string, o: Any) => call(ACC, "reverseSecurityDepositSettlement", { tenantId: T.A, unitId, leaseId, reason: "หักค่าเสียหายผิดใบ — ถอยเพื่อปิดใหม่", createdById: null, ...o });
  const paidOff = async (d: Any) => { const r = await pay(T.A, U.V, d.id, d.grandTotal - d.paidTotal, newKey("pre")); if (!r?.ok) throw new Error(`จ่ายเตรียมไม่ได้ ${codeOf(r)}`); };

  // ORACLE-EDIT 28 ต.ค. (review) — positive control ของ P-13: ทีละคำขอ คีย์เดียวข้ามหน่วย ⇒ ตัวที่ 2 IDEMPOTENCY_CONFLICT (ทางนี้ถูกอยู่แล้ว)
  await step("PC-3", "positive control: คีย์เดียวข้ามหน่วย (V แล้ว W) ทีละคำขอ ⇒ ตัวที่ 2 IDEMPOTENCY_CONFLICT · ไม่มีแถว", async (p) => {
    const dA = await mk([[10_000, "NONE"]]); const dB = await mk([[10_000, "NONE"]], U.W);
    const K = newKey("pc3");
    const a = await pay(T.A, U.V, dA.id, 10_000, K);
    const c0 = await counts(T.A);
    const b = await pay(T.A, U.W, dB.id, 10_000, K);
    if (!a?.ok) p.push(`ตัวแรก ${codeOf(a)}`);
    if (!refused(b, "IDEMPOTENCY_CONFLICT")) p.push(`ตัวที่ 2 ${codeOf(b)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
  });
  // ORACLE-EDIT 28 ต.ค. (review) F1 — B-B1 BLOCKER
  await step("P-13", "F1/X3/X4: คีย์เดียว 10 ทางพร้อมกัน ข้าม 2 หน่วยสมุดเดียว (V∥W) และข้าม 2 สมุด (V∥N) · ฝั่ง V เป็นส่วนเกินล้วน ⇒ ลงเงินครั้งเดียว (fresh 1 · ที่เหลือ duplicate/IDEMPOTENCY_CONFLICT · Σ เงินเข้า GL = ยอดเดียว)", async (p) => {
    const AMT = 10_000;
    for (const [tag, u2, s2, vat2] of [["V∥W", U.W, SYSID.V, VAT_INC], ["V∥N", U.N, SYSID.N, VAT_NO]] as const) {
      for (let round = 0; round < 3 && p.length < PMAX; round++) {
        const dA = await mk([[AMT, "NONE"]]); await paidOff(dA); // V: ชำระครบแล้ว ⇒ คำขอนี้เป็นส่วนเกินล้วน (ไม่มีแถวรับชำระให้ unique ชน)
        const dB = await mk([[AMT, "NONE"]], u2, T.A, vat2);
        const K = newKey("p13");
        const snap = await snapMany([SYSID.V, s2]);
        const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? pay(T.A, u2, dB.id, AMT, K) : pay(T.A, U.V, dA.id, AMT, K))));
        const fresh = rs.filter((r) => r?.ok && r.duplicate === false);
        const odd = rs.filter((r) => !(r?.ok && r.duplicate === false) && !(r?.ok && r.duplicate === true) && !refused(r, "IDEMPOTENCY_CONFLICT"));
        const cash = cashNet(net(await sinceMany(snap)));
        if (fresh.length !== 1 || odd.length || cash !== AMT) p.push(`${tag} รอบ ${round}: fresh ${fresh.length} · แปลก ${odd.map(codeOf).slice(0, 2).join("|") || "—"} · เงินเข้า GL ${cash} (ต้อง ${AMT})`);
      }
    }
  });
  // ORACLE-EDIT 28 ต.ค. (review) F1 — คีย์เดียวข้ามฟังก์ชัน
  await step("P-14", "F1: คีย์เดียวข้ามฟังก์ชัน (รับชำระ → รับประกัน/ปิดประกัน · รับประกัน → รับชำระ) ⇒ IDEMPOTENCY_CONFLICT ไม่มีแถว · 10 ทางพร้อมกัน จ่าย(W)∥รับประกัน(V) คีย์เดียว ⇒ เงินลงครั้งเดียว", async (p) => {
    const d = await mk([[100_000, "NONE"]]);
    const leaseY = newLease("p14y"); await depAmt(leaseY, 200_000);
    const K1 = newKey("p14a");
    const a = await pay(T.A, U.V, d.id, 100_000, K1);
    if (!a?.ok) { p.push(`จ่าย ${codeOf(a)}`); return; }
    const c0 = await counts(T.A);
    const x1 = await deposit(T.A, U.V, newLease("p14"), 100_000, K1);
    const x2 = await settle(T.A, U.V, leaseY, [], K1);
    if (!refused(x1, "IDEMPOTENCY_CONFLICT")) p.push(`จ่าย→รับประกัน ${codeOf(x1)}`);
    if (!refused(x2, "IDEMPOTENCY_CONFLICT")) p.push(`จ่าย→ปิดประกัน ${codeOf(x2)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("ปฏิเสธ (จ่าย→ประกัน) แล้วมีแถวเพิ่ม");
    const K2 = newKey("p14b");
    const dp = await deposit(T.A, U.V, newLease("p14"), 50_000, K2);
    if (!dp?.ok) p.push(`รับประกัน ${codeOf(dp)}`);
    const d2 = await mk([[50_000, "NONE"]]);
    const c2 = await counts(T.A);
    const x3 = await pay(T.A, U.V, d2.id, 50_000, K2);
    if (!refused(x3, "IDEMPOTENCY_CONFLICT")) p.push(`รับประกัน→จ่าย ${codeOf(x3)}`);
    if (!sameCounts(c2, await counts(T.A))) p.push("ปฏิเสธ (ประกัน→จ่าย) แล้วมีแถวเพิ่ม");
    if ((await held(T.A, U.V, leaseY)) !== 200_000) p.push("held ของสัญญา Y ขยับ");
    const AMT = 30_000; const K3 = newKey("p14c"); const d3 = await mk([[AMT, "NONE"]], U.W); const leaseZ = newLease("p14z");
    const snap = await snapMany([SYSID.V]);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? pay(T.A, U.W, d3.id, AMT, K3) : deposit(T.A, U.V, leaseZ, AMT, K3))));
    const fresh = rs.filter((r) => r?.ok && r.duplicate === false);
    const cash = cashNet(net(await sinceMany(snap)));
    if (fresh.length !== 1 || cash !== AMT) p.push(`พร้อมกัน: fresh ${fresh.length} · เงินเข้า GL ${cash} (ต้อง ${AMT}) · ${rs.filter((r) => !r?.ok).map(codeOf).slice(0, 2).join("|")}`);
  });

  // ORACLE-EDIT 28 ต.ค. (review) F5 — A-M4
  await step("N-6", "F5: ใบเพิ่มหนี้ของใบ DORM จ่ายผ่าน recordExternalPayment ได้ (Dr 1010 / Cr 1100 · ไม่เป็นส่วนเกิน) และหักในปิดประกันได้", async (p) => {
    const d = await mk();
    const dn = await note("createExternalDebitNote", T.A, U.V, d.id, simpleLines([[21_400, "VAT7"]]), VAT_INC);
    if (!dn?.ok) { p.push(`DN ${codeOf(dn)}`); return; }
    const snap = await snapMany([SYSID.V]);
    const r = await pay(T.A, U.V, dn.docId, 21_400, newKey("n6"));
    if (!r?.ok || r.appliedSatang !== 21_400 || r.excessSatang !== 0 || r.outstandingSatang !== 0) p.push(`จ่าย DN ${codeOf(r)} ${js(r).slice(0, 120)}`);
    const x = await docOf(dn.docId);
    if (x.paidTotal !== 21_400) p.push(`DN paidTotal ${x.paidTotal}`);
    const m = net(await sinceMany(snap));
    if (nz(m, "1010") !== 21_400 || nz(m, "1100") !== -21_400 || nz(m, "2110") !== 0) p.push(`GL ${js([...m])}`);
    const ln = newLease("n6"); await depAmt(ln, 50_000);
    const dn2 = await note("createExternalDebitNote", T.A, U.V, d.id, simpleLines([[10_000, "NONE"]]), VAT_INC);
    if (!dn2?.ok) { p.push(`DN2 ${codeOf(dn2)}`); return; }
    const s = await settle(T.A, U.V, ln, [dn2.docId], newKey("n6s"));
    if (!s?.ok || s.appliedSatang !== 10_000 || s.refundSatang !== 40_000) p.push(`ปิดประกันหัก DN ${codeOf(s)} ${js(s).slice(0, 120)}`);
    if ((await docOf(dn2.docId)).paidTotal !== 10_000) p.push("DN2 ไม่ถูกหัก");
  });
  // ORACLE-EDIT 28 ต.ค. (review) F6 — B-M3
  await step("N-7", "F6: ใบลด/เพิ่มหนี้อ้างใบ DORM ที่ถูกยกเลิก หรือเป็นร่าง ⇒ NOT_PAYABLE · ไม่มีใบลด/เพิ่มหนี้ที่ออกแล้วเพิ่ม · ไม่มี JV", async (p) => {
    const inv = await mk();
    const v = await SV.voidDocument(T.A, SYSID.V, inv.id, "ออกบิลผิดห้อง");
    if (!v?.ok) { p.push(`เตรียม: ยกเลิกใบไม่ได้ ${js(v)}`); return; }
    const dr0 = await dormInv(T.A, U.V, simpleLines([[50_000, "EXEMPT"]]), VAT_INC, { extra: { draft: true }, partyId: PARTY.main });
    if (!dr0?.ok) { p.push(`เตรียม: ร่าง ${codeOf(dr0)}`); return; }
    const issuedNotes = () => prisma.accountDocument.count({ where: { tenantId: T.A, docType: { in: ["CREDIT_NOTE", "DEBIT_NOTE"] }, status: { not: "DRAFT" } } });
    const n0 = await issuedNotes(); const e0 = (await counts(T.A)).ents;
    for (const [tag, src] of [["ยกเลิก", inv.id], ["ร่าง", dr0.docId]] as const) {
      for (const fn of ["createExternalCreditNote", "createExternalDebitNote"] as const) {
        const r = await note(fn, T.A, U.V, src, simpleLines([[1_000, "NONE"]]), VAT_INC);
        if (!refused(r, "NOT_PAYABLE")) p.push(`${tag} ${fn === "createExternalCreditNote" ? "CN" : "DN"}: ${codeOf(r)}`);
      }
    }
    if ((await issuedNotes()) !== n0 || (await counts(T.A)).ents !== e0) p.push("มีใบลด/เพิ่มหนี้หรือ JV เพิ่ม");
  });

  // ORACLE-EDIT 28 ต.ค. (review) F2 — A-M1 · B-M1
  await step("S-13", "F2: ปิด → (voidPayment งวดหักประกันถูกกัน) → ถอยด้วย reverseSecurityDepositSettlement ⇒ ยอดถือกลับ · ใบกลับ AWAITING_PAYMENT · GL 2140/1100/เงิน สุทธิ 0 · ถอยซ้ำ = ครั้งเดียว · ปิดใหม่ได้ · 1100 สุทธิ = คงค้างเอกสารทุกจังหวะ", async (p) => {
    const lease = newLease("s13"); await depAmt(lease, 900_000);
    const snap0 = await snapMany([SYSID.V]);
    const inv = await mk([[400_000, "NONE"]]);
    const k = newKey("s13");
    const snapS = await snapMany([SYSID.V]);
    const s = await settle(T.A, U.V, lease, [inv.id], k);
    if (!s?.ok || s.appliedSatang !== 400_000 || s.refundSatang !== 500_000) { p.push(`ปิด ${codeOf(s)}`); return; }
    const payRow = (await prisma.accountDocumentPayment.findFirst({ where: { documentId: inv.id, voidedAt: null } })) as Any;
    const cV = await counts(T.A);
    const vp = payRow ? await SV.voidPayment(T.A, SYSID.V, inv.id, payRow.id, "ยกเลิกงวดหักประกันตรง ๆ") : { ok: true };
    if (!payRow) p.push("ไม่พบแถวรับชำระงวดหักประกัน");
    if (vp?.ok !== false || !/[฀-๿]/.test(String(vp?.reason ?? ""))) p.push(`voidPayment งวดหักประกัน ${js(vp).slice(0, 100)}`);
    if ((await docOf(inv.id)).paidTotal !== 400_000 || !sameCounts(cV, await counts(T.A))) p.push("voidPayment ที่ถูกกันยังเขียนอะไรบางอย่าง");
    const r = await reverseSettle(U.V, lease, { idempotencyKey: k });
    if (!r?.ok) { p.push(`ถอย ${codeOf(r)}`); return; }
    const x = await docOf(inv.id);
    if (x.status !== "AWAITING_PAYMENT" || x.paidTotal !== 0) p.push(`ใบหลังถอย ${x.status}/${x.paidTotal}`);
    if ((await held(T.A, U.V, lease)) !== 900_000) p.push(`held หลังถอย ${js(await held(T.A, U.V, lease))}`);
    const mS = net(await sinceMany(snapS));
    if (nz(mS, DEP_CODE) !== 0 || nz(mS, "1100") !== 0 || cashNet(mS) !== 0) p.push(`ปิด+ถอย สุทธิไม่ 0: ${js([...mS])}`);
    if (nz(net(await sinceMany(snap0)), "1100") !== outstanding(x)) p.push(`1100 สุทธิ ${nz(net(await sinceMany(snap0)), "1100")} ≠ คงค้าง ${outstanding(x)}`);
    const settleJv = (await prisma.accountJournalEntry.findFirst({ where: { id: s.entryId } })) as Any;
    if (settleJv?.status !== "REVERSED") p.push(`JV ปิด สถานะ ${settleJv?.status}`);
    if (payRow && !((await prisma.accountDocumentPayment.findUnique({ where: { id: payRow.id } })) as Any)?.voidedAt) p.push("งวดหักประกันไม่ถูกยกเลิก");
    const c1 = await counts(T.A);
    const r2 = await reverseSettle(U.V, lease, { idempotencyKey: k });
    if (!r2?.ok || !sameCounts(c1, await counts(T.A))) p.push(`ถอยซ้ำ ${codeOf(r2)} (ต้อง ok ไม่มีแถวใหม่)`);
    const s2 = await settle(T.A, U.V, lease, [inv.id], newKey("s13b"));
    if (!s2?.ok || s2.appliedSatang !== 400_000 || s2.refundSatang !== 500_000) p.push(`ปิดใหม่ ${codeOf(s2)} ${js(s2).slice(0, 100)}`);
    const y = await docOf(inv.id);
    if (y.status !== "PAID" || nz(net(await sinceMany(snap0)), "1100") !== outstanding(y)) p.push(`หลังปิดใหม่ ${y.status} · 1100 ${nz(net(await sinceMany(snap0)), "1100")} ≠ ${outstanding(y)}`);
  });
  // ORACLE-EDIT 28 ต.ค. (review) F3 — A-M2
  await step("S-14", "F3: postSecurityDeposit ไม่มี partyId ⇒ INVALID_INPUT · ปิดประกันของผู้เช่า A ใส่ใบของผู้เช่า B (หอเดียวกัน) ⇒ NOT_FOUND ทั้งคำขอ ไม่มี JV held ไม่ขยับ · ใบของตัวเอง = หักได้ (positive)", async (p) => {
    const c0 = await counts(T.A);
    const np = await deposit(T.A, U.V, newLease("s14n"), 100_000, newKey("s14n"), { partyId: null });
    if (!refused(np, "INVALID_INPUT")) p.push(`ไม่มี partyId ${codeOf(np)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("ไม่มี partyId แล้วมีแถว");
    const lease = newLease("s14"); await depAmt(lease, 300_000);
    const own = await mk([[100_000, "NONE"]]);
    const theirs = await mk([[100_000, "NONE"]], U.V, T.A, VAT_INC, PARTY.other);
    const c1 = await counts(T.A);
    for (const [tag, ids] of [["ของคนอื่น", [theirs.id]], ["ปน", [own.id, theirs.id]]] as const) {
      const r = await settle(T.A, U.V, lease, [...ids], newKey("s14"));
      if (!refused(r, "NOT_FOUND")) p.push(`${tag}: ${codeOf(r)}`);
    }
    if (!sameCounts(c1, await counts(T.A)) || (await held(T.A, U.V, lease)) !== 300_000 || (await docOf(theirs.id)).paidTotal !== 0) p.push("ปฏิเสธแล้วมีผล");
    const ok = await settle(T.A, U.V, lease, [own.id], newKey("s14ok"));
    if (!ok?.ok || ok.appliedSatang !== 100_000) p.push(`ใบของตัวเอง ${codeOf(ok)}`);
  });
  // ORACLE-EDIT 28 ต.ค. (review) F4 — A-M3 · B-M2 (ย้ายลิงก์)
  await step("S-15", "F4: รับประกันที่สมุด V → ปิดลิงก์ V เปิดลิงก์ N ⇒ securityDepositHeld ยังเห็นยอด (ไม่ใช่ 0) · ปิดประกัน ⇒ DEPOSIT_IN_OTHER_BOOK (ไม่ใช่ NO_DEPOSIT_HELD) · ไม่มี JV ทั้งสองสมุด", async (p) => {
    const lease = newLease("s15");
    const d = await deposit(T.A, U.R, lease, 70_000, newKey("s15"));
    if (!d?.ok) { p.push(`เตรียม: รับประกัน ${codeOf(d)}`); return; }
    if ((await held(T.A, U.R, lease)) !== 70_000) p.push("positive: held ก่อนย้าย ไม่ใช่ 70,000");
    await prisma.accountSystemLink.updateMany({ where: { tenantId: T.A, systemId: SYSID.V, linkedKind: "BUSINESS", linkedId: U.R }, data: { enabled: false, archivedAt: new Date() } });
    await link(T.A, SYSID.N, "BUSINESS", U.R);
    const h = await held(T.A, U.R, lease);
    if (h !== 70_000) p.push(`held หลังย้าย ${js(h)} (ต้อง 70,000)`);
    const snap = await snapMany([SYSID.V, SYSID.N]);
    const r = await settle(T.A, U.R, lease, [], newKey("s15s"));
    if (!refused(r, "DEPOSIT_IN_OTHER_BOOK")) p.push(`ปิด ${codeOf(r)}`);
    if ((await sinceMany(snap)).length) p.push("มี JV");
  });
  // ORACLE-EDIT 28 ต.ค. (review) F4 — หลายลิงก์
  await step("S-16", "F4: หน่วยผูก 2 สมุดพร้อมกัน ⇒ ใบแจ้งหนี้/รับชำระ/รับประกัน/ปิดประกัน/ใบลดหนี้ ⇒ AMBIGUOUS_LINK ไม่มีแถว · securityDepositHeld ไม่ตอบ 0 เงียบ", async (p) => {
    const lease = newLease("s16");
    const pre = await deposit(T.A, U.M, lease, 50_000, newKey("s16pre"));
    if (!pre?.ok) { p.push(`positive: ลิงก์เดียวรับประกันได้ ${codeOf(pre)}`); return; }
    const anyDoc = await mk([[10_000, "NONE"]]);
    await link(T.A, SYSID.N, "BUSINESS", U.M);
    const c0 = await counts(T.A);
    const rs: [string, Any][] = [
      ["ใบแจ้งหนี้", await dormInv(T.A, U.M, simpleLines([[10_000, "NONE"]]), VAT_INC, { partyId: PARTY.main })],
      ["รับชำระ", await pay(T.A, U.M, anyDoc.id, 10_000, newKey("s16"))],
      ["รับประกัน", await deposit(T.A, U.M, newLease("s16b"), 10_000, newKey("s16"))],
      ["ปิดประกัน", await settle(T.A, U.M, lease, [], newKey("s16"))],
      ["ใบลดหนี้", await note("createExternalCreditNote", T.A, U.M, anyDoc.id, simpleLines([[1_000, "NONE"]]), VAT_INC)],
    ];
    for (const [tag, r] of rs) if (!refused(r, "AMBIGUOUS_LINK")) p.push(`${tag}: ${codeOf(r)}`);
    if (!sameCounts(c0, await counts(T.A))) p.push("มีแถวเพิ่ม");
    const h = await held(T.A, U.M, lease);
    if (!(h === 50_000 || refused(h, "AMBIGUOUS_LINK"))) p.push(`held ${js(h)} (ต้อง 50,000 หรือ AMBIGUOUS_LINK)`);
  });
  // ORACLE-EDIT 28 ต.ค. (review) F8
  await step("S-17", "F8: ปิดประกันคีย์เดิมแต่รายการใบต่าง ⇒ IDEMPOTENCY_CONFLICT ไม่มีแถว · รายการเดิม ⇒ duplicate", async (p) => {
    const lease = newLease("s17"); await depAmt(lease, 500_000);
    const d1 = await mk([[100_000, "NONE"]]); const d2 = await mk([[100_000, "NONE"]]);
    const k = newKey("s17");
    const a = await settle(T.A, U.V, lease, [d1.id], k);
    if (!a?.ok) { p.push(`ปิด ${codeOf(a)}`); return; }
    const c0 = await counts(T.A);
    for (const [tag, ids] of [["เพิ่มใบ", [d1.id, d2.id]], ["ไม่มีใบ", []], ["ใบอื่น", [d2.id]]] as const) {
      const r = await settle(T.A, U.V, lease, [...ids], k);
      if (!refused(r, "IDEMPOTENCY_CONFLICT")) p.push(`${tag}: ${codeOf(r)}`);
    }
    if (!sameCounts(c0, await counts(T.A)) || (await docOf(d2.id)).paidTotal !== 0) p.push("มีแถว/ใบที่ 2 ถูกหัก");
    const same = await settle(T.A, U.V, lease, [d1.id], k);
    if (!same?.ok || same.duplicate !== true || same.entryId !== a.entryId) p.push(`รายการเดิม ${codeOf(same)} dup=${same?.duplicate}`);
  });
  // ORACLE-EDIT 28 ต.ค. (review) — positive control ของ S-18 (ทางเดิมของบัญชี V2)
  await step("PC-4", "positive control: สมุด ON_PAYMENT + recordPayment เดิม ⇒ ใบกำกับภาษีอัตโนมัติ VAT 70.00 · 2210 สุทธิ 0 · Cr 2200 = 7,000", async (p) => {
    const snap = await snapMany([SYSID.Q]);
    const d = await SV.createDocument({ tenantId: T.A, systemId: SYSID.Q, docType: "INVOICE", vatMode: "INCLUDE", lines: [{ description: "ค่าห้อง", qty: 1, unitPrice: 400_000, vatRateBp: -1 }, { description: "ค่าน้ำไฟ", qty: 1, unitPrice: 107_000, vatRateBp: 700 }] });
    const iss = await SV.issueDocument(T.A, SYSID.Q, d.id);
    if (!iss?.ok) { p.push(`issue ${js(iss)}`); return; }
    const r = await SV.recordPayment(T.A, SYSID.Q, d.id, { amount: 507_000, channel: "TRANSFER", idempotencyKey: newKey("pc4") });
    if (!r?.ok) p.push(`pay ${js(r)}`);
    const ti = (await prisma.accountDocument.findMany({ where: { systemId: SYSID.Q, docType: "TAX_INVOICE", sourceDocId: d.id, status: { notIn: ["VOIDED", "CANCELLED"] } } })) as Any[];
    if (ti.length !== 1 || ti[0].vatAmount !== 7_000) p.push(`ใบกำกับ ${ti.length} ใบ vat ${ti[0]?.vatAmount}`);
    const m = net(await sinceMany(snap));
    if (nz(m, "2210") !== 0 || nz(m, "2200") !== -7_000) p.push(`GL ${js([...m])}`);
  });
  // ORACLE-EDIT 28 ต.ค. (review) — B จุดบอดข้อ 4
  await step("S-18", "สมุด VAT จุดภาษี ON_PAYMENT: ปิดประกันหักใบ (VAT 70.00) ⇒ ใบกำกับภาษีอัตโนมัติของงวดหักประกัน VAT 7,000 · 2210 สุทธิ 0 · Cr 2200 = 7,000 · JV ปิดยังเป็นใบเดียว", async (p) => {
    const lease = newLease("s18");
    const dq = await deposit(T.A, U.Q, lease, 600_000, newKey("s18d"));
    if (!dq?.ok) { p.push(`รับประกัน ${codeOf(dq)}`); return; }
    const snap = await snapMany([SYSID.Q]);
    const inv = await mk([[400_000, "EXEMPT"], [107_000, "VAT7"]], U.Q);
    const s = await settle(T.A, U.Q, lease, [inv.id], newKey("s18"));
    if (!s?.ok || s.appliedSatang !== 507_000 || s.refundSatang !== 93_000) { p.push(`ปิด ${codeOf(s)} ${js(s).slice(0, 120)}`); return; }
    const payRow = (await prisma.accountDocumentPayment.findFirst({ where: { documentId: inv.id, voidedAt: null } })) as Any;
    const ti = (await prisma.accountDocument.findMany({ where: { systemId: SYSID.Q, docType: "TAX_INVOICE", sourceDocId: inv.id, status: { notIn: ["VOIDED", "CANCELLED"] } } })) as Any[];
    if (ti.length !== 1 || ti[0].vatAmount !== 7_000) p.push(`ใบกำกับ ${ti.length} ใบ vat ${ti[0]?.vatAmount}`);
    if (ti[0] && payRow && ti[0].sourcePaymentId && ti[0].sourcePaymentId !== payRow.id) p.push("ใบกำกับไม่ได้ผูกงวดหักประกัน");
    const es = await sinceMany(snap); const m = net(es);
    if (nz(m, "2210") !== 0 || nz(m, "2200") !== -7_000 || nz(m, "2205") !== 0) p.push(`VAT ${js([...m])}`);
    const depCodeQ = (await depLedger(SYSID.Q))?.account?.code;
    if (es.filter((e) => e.lines.some((l) => l.code === depCodeQ && l.debit > 0)).length !== 1) p.push("JV ที่ Dr บัญชีประกันไม่ใช่ 1 ใบ");
    if (es.some((e) => dr(e) !== cr(e))) p.push("JV ไม่สมดุล");
  });
  // ORACLE-EDIT 28 ต.ค. (review รอบ 2) F9 — B-N1: ถอยการปิดประกันต้องเคารพล็อกข้อมูลก่อนวันที่ (วันที่ JV ปิด + paidAt ทุกงวดหักประกัน)
  await step("S-19", "F9: สมุด ON_PAYMENT ปิดประกัน (ใบกำกับอัตโนมัติ) → ตั้ง lockBeforeDate หลังวันปิด ⇒ (positive: voidPayment งวดปกติถูกปฏิเสธ) · reverseSecurityDepositSettlement ⇒ PERIOD_LOCKED · ไม่มีอะไรเปลี่ยน (held · สถานะ/paidTotal ใบ · ใบกำกับ · งวด · JV)", async (p) => {
    const lease = newLease("s19");
    const dq = await deposit(T.A, U.Q, lease, 600_000, newKey("s19d"));
    if (!dq?.ok) { p.push(`เตรียม: รับประกัน ${codeOf(dq)}`); return; }
    const inv = await mk([[400_000, "EXEMPT"], [107_000, "VAT7"]], U.Q);
    const k = newKey("s19");
    const s = await settle(T.A, U.Q, lease, [inv.id], k);
    if (!s?.ok || s.appliedSatang !== 507_000) { p.push(`เตรียม: ปิด ${codeOf(s)}`); return; }
    // งวดรับชำระปกติในช่วงเดียวกัน (positive control ของด่านล็อก)
    const nInv = await mk([[50_000, "EXEMPT"]], U.Q);
    const np = await SV.recordPayment(T.A, SYSID.Q, nInv.id, { amount: 50_000, channel: "TRANSFER", idempotencyKey: newKey("s19n") });
    if (!np?.ok || !np.paymentId) { p.push(`เตรียม: รับชำระปกติ ${js(np)}`); return; }
    const lockAt = new Date(Date.now() + 2 * DAY);
    await prisma.accountSettings.updateMany({ where: { tenantId: T.A, systemId: SYSID.Q }, data: { lockBeforeDate: lockAt } });
    try {
      const vp = await SV.voidPayment(T.A, SYSID.Q, nInv.id, np.paymentId, "ทดสอบยกเลิกในช่วงล็อก");
      if (vp?.ok !== false || !/ล็อก/.test(String(vp?.reason ?? ""))) p.push(`positive: voidPayment ในช่วงล็อก ${js(vp).slice(0, 100)}`);
      const payRow = (await prisma.accountDocumentPayment.findFirst({ where: { documentId: inv.id } })) as Any;
      const tiBefore = (await prisma.accountDocument.findMany({ where: { systemId: SYSID.Q, docType: "TAX_INVOICE", sourceDocId: inv.id }, select: { id: true, status: true }, orderBy: { id: "asc" } })) as Any[];
      if (!tiBefore.some((t) => t.status !== "VOIDED" && t.status !== "CANCELLED")) p.push("เตรียม: ไม่มีใบกำกับอัตโนมัติของงวดหักประกัน");
      const snapDoc = js(await docOf(inv.id));
      const h0 = await held(T.A, U.Q, lease);
      const c0 = await counts(T.A);
      const r = await reverseSettle(U.Q, lease, { idempotencyKey: k });
      if (!refused(r, "PERIOD_LOCKED")) p.push(`ถอยในช่วงล็อก ${codeOf(r)}`);
      if (!sameCounts(c0, await counts(T.A))) p.push("มีแถว/JV เพิ่ม");
      if (js(await docOf(inv.id)) !== snapDoc) p.push("ใบแจ้งหนี้เปลี่ยน (สถานะ/paidTotal)");
      if (js(await held(T.A, U.Q, lease)) !== js(h0)) p.push(`held เปลี่ยน ${js(h0)}→${js(await held(T.A, U.Q, lease))}`);
      const tiAfter = (await prisma.accountDocument.findMany({ where: { systemId: SYSID.Q, docType: "TAX_INVOICE", sourceDocId: inv.id }, select: { id: true, status: true }, orderBy: { id: "asc" } })) as Any[];
      if (js(tiAfter) !== js(tiBefore)) p.push("ใบกำกับภาษีเปลี่ยนสถานะ");
      if (payRow && ((await prisma.accountDocumentPayment.findUnique({ where: { id: payRow.id } })) as Any)?.voidedAt) p.push("งวดหักประกันถูกยกเลิก");
      const jv = (await prisma.accountJournalEntry.findFirst({ where: { id: s.entryId }, select: { status: true } })) as Any;
      if (jv?.status !== "POSTED") p.push(`JV ปิด สถานะ ${jv?.status}`);
    } finally {
      await prisma.accountSettings.updateMany({ where: { tenantId: T.A, systemId: SYSID.Q }, data: { lockBeforeDate: null } });
    }
  });
  // ORACLE-EDIT 28 ต.ค. (review) — positive control ของ G-3: ใบสำคัญทั่วไปยังกลับรายการได้ตามเดิม
  await step("PC-5", "positive control: JV ทั่วไป (postManualJV) กลับรายการผ่าน reverseJournalEntry ได้ตามเดิม", async (p) => {
    const lid = async (code: string) => ((await prisma.accountLedger.findFirst({ where: { systemId: SYSID.V, code } })) as Any)?.id as string;
    const j = await GL.postManualJV({ tenantId: T.A, systemId: SYSID.V }, { date: new Date(), memo: "ทดสอบ PC-5", lines: [{ accountId: await lid("1000"), debit: 1_000, credit: 0 }, { accountId: await lid("3000"), debit: 0, credit: 1_000 }] });
    const r = await JR?.reverseJournalEntry?.({ tenantId: T.A, systemId: SYSID.V }, j.entryId, "ทดสอบกลับรายการ");
    if (!r?.ok) p.push(`กลับรายการ ${js(r)}`);
  });
  // ORACLE-EDIT 28 ต.ค. (review) F7 — A-M5
  await step("G-3", "F7: กลับรายการ JV ของหอ (รับประกัน · ปิดประกัน · ส่วนเกิน) ทางสมุดรายวันทั่วไป ⇒ ปฏิเสธข้อความไทย · สถานะ POSTED · ไม่มี JV ใหม่", async (p) => {
    const es = (await entries(SYSID.V)).filter((e) => e.refType === REF_DEP || e.refType === REF_EX);
    const rows = (await prisma.accountJournalEntry.findMany({ where: { id: { in: es.map((e) => e.id) }, status: "POSTED" }, select: { id: true } })) as Any[];
    const posted = new Set(rows.map((r) => r.id as string));
    const pickE = (f: (e: EN) => boolean) => es.find((e) => posted.has(e.id) && f(e));
    const targets: [string, EN | undefined][] = [
      ["รับประกัน", pickE((e) => e.refType === REF_DEP && e.lines.some((l) => l.code === DEP_CODE && l.credit > 0))],
      ["ปิดประกัน", pickE((e) => e.refType === REF_DEP && e.lines.some((l) => l.code === DEP_CODE && l.debit > 0))],
      ["ส่วนเกิน", pickE((e) => e.refType === REF_EX)],
    ];
    for (const [tag, e] of targets) {
      if (!e) { p.push(`ไม่พบ JV ${tag}`); continue; }
      const n0 = (await counts(T.A)).ents;
      const r = await JR?.reverseJournalEntry?.({ tenantId: T.A, systemId: SYSID.V }, e.id, "ทดสอบกลับรายการ JV หอ");
      const st = ((await prisma.accountJournalEntry.findUnique({ where: { id: e.id }, select: { status: true } })) as Any)?.status;
      if (r?.ok !== false || !/[฀-๿]/.test(String(r?.reason ?? "")) || st !== "POSTED" || (await counts(T.A)).ents !== n0) p.push(`${tag}: ${js(r).slice(0, 90)} สถานะ ${st}`);
    }
  }, "CRITICAL");

  // ───────── G ภาพรวม GL · E event ─────────
  out("\n── G · E ──");
  await step("G-1", "ทุกใบสำคัญในสมุดทดสอบ (V · N · B) สมดุล · ไม่มีบรรทัดพักรายการ 9999 · งบทดลองรวม 0", async (p) => {
    for (const s of [SYSID.V, SYSID.N, SYSID.B, SYSID.Q].filter(Boolean)) { // ORACLE-EDIT 28 ต.ค. (review): + สมุด Q
      const es = await entries(s);
      const bad = es.filter((e) => dr(e) !== cr(e));
      if (bad.length) p.push(`${s}: ไม่สมดุล ${bad.length} ใบ (${bad[0].docNo})`);
      if (es.some((e) => e.lines.some((l) => l.code === "9999"))) p.push(`${s}: มี 9999`);
      const tb = [...net(es).values()].reduce((a, b) => a + b, 0);
      if (tb !== 0) p.push(`${s}: งบทดลอง ${tb}`);
    }
  });
  await step("G-2", "ไม่มี JV ใดของเงินประกันแตะ 2110 / รายได้ / VAT (ประกันไม่ใช่รายได้ · ไม่ใช่มัดจำหักได้)", async (p) => {
    if (!DEP_CODE) { p.push("ไม่มีบัญชีประกัน"); return; }
    const es = (await entries(SYSID.V)).filter((e) => e.lines.some((l) => l.code === DEP_CODE && l.credit > 0));
    for (const e of es) if (e.lines.some((l) => l.code === "2110" || l.type === "INCOME" || VAT_CODES.has(l.code))) p.push(e.docNo);
  });
  await step("E-1", "event ที่เกิดในร้านทดสอบลงทะเบียน consumer แล้วทุกตัว · ไม่มี event ใหม่ของใบนี้ (dorm.* / ประกัน)", async (p) => {
    const reg = read("src/lib/outbox-consumers.ts");
    const types = [...new Set(((await prisma.outboxEvent.findMany({ where: { tenantId: { in: [T.A, T.B] }, createdAt: { gte: START } }, select: { type: true } })) as Any[]).map((e) => e.type as string))];
    for (const t of types) {
      if (!reg.includes(`"${t}"`) && !reg.includes(`'${t}'`)) p.push(`ไม่ลงทะเบียน ${t}`);
      if (/^dorm\.|deposit/i.test(t) && !/^account\.(payment|invoice|document)/.test(t)) p.push(`event ใหม่ ${t}`);
    }
  }, "MAJOR");
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  // ───────── Z ทำความสะอาด ─────────
  const del = async (name: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { out(`  ⚠ ลบ ${name}: ${errMsg(e)}`); } };
  if (T.A) await del("lockBeforeDate.reset", () => prisma.accountSettings.updateMany({ where: { tenantId: T.A }, data: { lockBeforeDate: null } })); // ORACLE-EDIT 28 ต.ค. (review รอบ 2)
  for (const tenantId of [T.A, T.B].filter(Boolean)) {
    await del("journalLine", () => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del("entry.unlink", () => prisma.accountJournalEntry.updateMany({ where: { tenantId }, data: { reversalOfId: null } }));
    await del("entry", () => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del("payment.unlink", () => prisma.accountDocumentPayment.updateMany({ where: { tenantId }, data: { chequeId: null, whtCertDocId: null } }));
    await del("payment", () => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del("paymentRequest", () => prisma.accountPaymentRequest.deleteMany({ where: { tenantId } }));
    await del("relation", () => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del("line", () => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del("doc.unlink", () => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await del("attachment", () => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del("document", () => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del("sequence", () => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del("mapping", () => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del("finance", () => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del("ledger.unparent", () => prisma.accountLedger.updateMany({ where: { tenantId }, data: { parentId: null } }));
    await del("ledger", () => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del("period", () => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del("contact", () => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del("settings", () => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del("link", () => prisma.accountSystemLink.deleteMany({ where: { tenantId } }));
    await del("outbox", () => prisma.outboxEvent.deleteMany({ where: { tenantId } }));
    await del("audit", () => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del("systemUnit", () => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del("system", () => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del("party", () => prisma.party.deleteMany({ where: { tenantId } })); // ORACLE-EDIT 28 ต.ค. (review)
    await del("unit", () => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  try {
    const left = (await prisma.tenant.count({ where: { slug: { startsWith: PFX } } }))
      + (T.A || T.B ? (await prisma.accountDocument.count({ where: { tenantId: { in: [T.A, T.B].filter(Boolean) } } }))
        + (await prisma.accountJournalEntry.count({ where: { tenantId: { in: [T.A, T.B].filter(Boolean) } } }))
        + (await prisma.outboxEvent.count({ where: { tenantId: { in: [T.A, T.B].filter(Boolean) } } })) : 0);
    chk("Z-1", "ทำความสะอาด: ไม่เหลือร้าน/เอกสาร/ใบสำคัญ/event ของรอบนี้", left === 0, `เหลือ ${left}`, "MAJOR");
  } catch (e) {
    chk("Z-1", "ทำความสะอาด", false, errMsg(e), "MAJOR");
  }
  await prisma.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const passed = cks.length - failed.length;
out(`\n===== QC SVC D.2 · facade บัญชีสำหรับหอ =====\nผ่าน ${passed}/${cks.length} · SEED=${SEED}`);
out(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), seed: SEED })}`);
process.exit(failed.length > 0 ? 1 : 0);
