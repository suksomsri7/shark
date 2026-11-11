// QC — SVC G2 (ด่านเต็มก่อน UAT หอ · ใบ D.15) · e2e หอครบสายบนสัญญาเดียว — builder G2 เขียน (ไม่ใช่ oracle ของใบ)
// ช่องว่างที่ปิด (จากการไล่ d.2–d.19): ไม่มีข้อสอบใดเดินครบสายบนสัญญาเดียว · มิเตอร์จาก submitReadings ไม่เคยถูกออกบิล (d.8 ใส่เลขตรงตาราง)
//   · สลิปพอร์ทัลไม่เคยถูกอนุมัติจนออกใบเสร็จ (d.9 จบ PENDING · d.10 สร้างสลิปตรงฐาน) · outbox ไม่ถูก dispatch ต่อกันเอง
//   · ไม่มีข้อตรวจเลขใบเสร็จ/บัญชีเงินฝั่ง Dr ตอนรับเงินจากสลิป
//
// สายเดียวต่อเนื่อง (service/facade จริงเท่านั้น — prisma.create ตรงเฉพาะร้าน/ผู้ใช้/สมุด/ค่าตั้ง/ตัวจำลอง LINE แบบเดียวกับ d.4 d.8 d.9):
//   E-1 นำเข้าไฟล์ CSV (uploadImport → previewImport → createImport) 2 ห้อง · สัญญา · มิเตอร์ไฟ/น้ำ เลขเริ่ม
//   E-2 จดมิเตอร์งวดนี้ผ่าน submitReadings (+confirmReading ถ้ามีป้าย) · บิลการไฟฟ้า/ประปาผ่าน recordAuthorityBill
//   E-3 prepareBillRun + sendBillRun ⇒ ยอดบิล = ค่าเช่า + (เลขใหม่−เลขเริ่ม)×อัตรา (อัตราจากค่าตั้งจริง) · INVOICE source DORM · GL Dr 1100 = grandTotal
//   E-4 ระบาย outbox ด้วย drainAll (ตัวเดียวกับ /api/cron/outbox · วนจนเงียบ) ⇒ LINE push 1/บิล · ลิงก์ /d/<token> ถอดด้วย verifyLink ได้สัญญาถูก
//   E-5 ผู้เช่าส่งสลิปผ่าน submitPortalSlip (token จากลิงก์ในข้อความ LINE)
//   E-6 ร้านอนุมัติด้วย decideSlip ⇒ ระบายจนเงียบ ⇒ บิล PAID · RECEIPT 1 ใบ docNo ตามรูปแบบเลขเอกสารของสมุด · push ใบเสร็จทาง LINE
//   E-7 GL: Dr บัญชีเงิน (ตามช่องทาง/บัญชีเงินของการรับชำระ → ผังบัญชี) / Cr 1100 = ยอดรับ · 1100 ของสัญญาคงเหลือ 0 · ทุกรายการสมดุล
//   E-8 ทำซ้ำในรอบ (import/prepare/send/slip/decide/drain ซ้ำ ⇒ ไม่มีแถวใหม่) · รันทั้งไฟล์ซ้ำ ⇒ FINGERPRINT เดิม
//   PC  positive control: ก่อนอนุมัติ 1100 ของสัญญา ≠ 0 · ห้องที่ 2 (ไม่จ่าย) 1100 คงค้าง = ยอดบิล · พอร์ทัลเห็นยอดค้าง
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง node:http 127.0.0.1 + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · APP_URL = https://qc-d15e2e.invalid
// 🔴 ร้านทดสอบ slug `qc-svc-d15e2e-*` · ผู้ใช้ `svc-d15e2e-*@shark.local` · ล้างใน finally + กวาดค้างตอนเริ่ม (idempotent)
// 🔴 วันที่ = นาฬิกาจริง (งวดบัญชีเก่าของฐาน QC ปิดแล้ว): งวดมิเตอร์ = เดือนนี้ · นำเข้าจดเลขเริ่ม = วันสุดท้ายเดือนก่อน · รอบบิล = เดือนหน้า (utilityTiming ARREARS)
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d15-e2e.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

type Any = any;
const LABEL = "qc-svc-d15-e2e";
const ORIGIN = "https://qc-d15e2e.invalid";
const SLUG = "qc-svc-d15e2e-";
const EMAIL = "svc-d15e2e-";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
// ตัวตรวจสลิป FAKE แบบเดียวกับ d.9/r0.6 (ไม่ยิงผู้ให้บริการจริง) · กุญแจลับของรอบเมื่อยังไม่มี
process.env.INTEGRATIONS_FAKE = "1";
if ((process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.APP_URL = ORIGIN;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const fmt = (v: unknown): string => J(v).slice(0, 300);
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngOf = (seed: string): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`qc-d15e2e:${seed}`).digest(), createHash("sha256").update(seed).digest()]));
const noopDeps = { put: async () => {}, del: async () => 200 };

// ═══════════════ ผลข้อ ═══════════════
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; why: string }[] = [];
class AssertFail extends Error {}
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string) => {
  cks.push({ id, res, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const failedIds = () => cks.filter((c) => c.res === "FAIL").map((c) => c.id);
/** ข้อที่พึ่งข้อก่อนหน้า: ข้อก่อนหน้าแดง ⇒ SKIP (ไม่ใช่ผ่าน) */
const st = async (id: string, name: string, needs: string[], fn: () => unknown | Promise<unknown>) => {
  const broken = needs.filter((n) => !cks.some((c) => c.id === n && c.res === "PASS"));
  if (broken.length) return record(id, name, "SKIP", `ต้องผ่าน ${broken.join(",")} ก่อน`);
  try { await fn(); record(id, name, "PASS", ""); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`); }
};

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch (แบบ d.9) ═══════════════
type FakeReq = { method: string; path: string; auth: string; json: Any };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    FAKE.push({ method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), json });
    const send = (code: number, obj: unknown) => { if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && path === "/v2/bot/message/push") return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/richmenu") return send(200, { richMenuId: `richmenu-qcd15${FAKE.length}` });
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ผู้เช่าคิวซี", userId: path.split("/").pop() });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.LINE_API_BASE = FAKE_BASE;
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const mark = () => FAKE.length;
const pushesSince = (m: number) => FAKE.slice(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: Any };
const DORM = (await import("@/lib/modules/dorm" as string)) as Any;
const ACC = (await import("@/lib/modules/account" as string)) as Any;
const SYS = (await import("@/lib/modules/system/service" as string)) as Any;
const ASV = (await import("@/lib/modules/account/service" as string)) as Any;
const GL = (await import("@/lib/modules/account/gl" as string)) as Any;
const NUM = (await import("@/lib/modules/account/doc-numbering" as string)) as Any;
const SCH = (await import("@/lib/modules/account/settings-schema" as string)) as Any;
const SET = (await import("@/lib/core/settings" as string)) as Any;
const SL = (await import("@/lib/core/signed-link" as string)) as Any;
const SLIP = (await import("@/lib/payment/slip-verify" as string)) as Any;
const OC = (await import("@/lib/outbox-consumers" as string)) as Any;
const PORTAL = (await import("@/lib/platform/dorm-portal" as string)) as Any;
const PAY = (await import("@/lib/platform/dorm-pay" as string)) as Any;
const PRISMA_NS = ((await import("@prisma/client" as string)) as Any).Prisma;

// ═══════════════ ล้าง (แบบ d.9) ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ไม่เป็นไร */ } };
  await soft(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: { in: tids } }, data: { reversalOfId: null } }));
  await soft(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId: { in: tids } }, data: { chequeId: null, whtCertDocId: null } }));
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  await soft(() => prisma.dormMeter.updateMany({ where: { tenantId: { in: tids } }, data: { replacedById: null } }));
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc(tids: string[]) {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, "%qc-d15e2e-%");
    for (const t of tids) await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%${t}%`);
  } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
}

// ═══════════════ เวลา/งวด (นาฬิกาจริง · เขตไทย) ═══════════════
const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const addMonths = (p: string, n: number) => { const [y, m] = p.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const lastDayOf = (p: string) => { const [y, m] = p.split("-").map(Number); return `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const TODAY = bkkYmd(new Date());
const P_UTIL = TODAY.slice(0, 7);          // งวดจดมิเตอร์ = เดือนนี้
const P_START = addMonths(P_UTIL, -1);     // เลขเริ่มจากไฟล์นำเข้า = งวดก่อน
const READ_DATE = lastDayOf(P_START);
const P_BILL = addMonths(P_UTIL, 1);       // รอบบิล (ค่าน้ำไฟย้อนหลัง 1 เดือน = P_UTIL)
const START_BE = `01/01/${Number(TODAY.slice(0, 4)) + 543}`; // เข้าอยู่ 1 ม.ค. ปีนี้ (พ.ศ.) ⇒ เต็มเดือนทุกงวด

// ═══════════════ ฉาก ═══════════════
// ห้อง · ชื่อ · ค่าเช่า · ประกัน · ไฟ (เริ่ม→ใหม่) · น้ำ (เริ่ม→ใหม่) — ห้อง A จ่ายผ่านสลิป · ห้อง B ไม่จ่าย (positive control 1100 ค้าง)
const ROOMS = [
  { no: "E101", name: "สมพร ทดสอบหนึ่ง", rent: 450_000, deposit: 900_000, e0: 1287, e1: 1412, w0: 312, w1: 318 },
  { no: "E102", name: "วนิดา ทดสอบสอง", rent: 520_000, deposit: 1_040_000, e0: 2000, e1: 2080, w0: 400, w1: 404 },
] as const;
const AUTH_ELEC = { billSatang: 472_000, units: 1000 }; // ⇒ ต้นทุนจริง floor(472000/1000) = 472 สตางค์/หน่วย
const AUTH_WATER = { billSatang: 160_000, units: 100 }; // ⇒ 1,600 สตางค์/หน่วย
const MAPPING: Record<string, string> = { "0": "room", "1": "tenantName", "2": "phone", "3": "startDate", "4": "months", "5": "rent", "6": "deposit", "7": "elecReading", "8": "waterReading" };
const csvOf = (phones: string[]) => {
  const head = "ห้อง,ชื่อผู้เช่า,เบอร์โทร,วันเข้าอยู่,ระยะสัญญา,ค่าเช่า,เงินประกัน,มิเตอร์ไฟ,มิเตอร์น้ำ";
  const rows = ROOMS.map((r, i) => [r.no, r.name, phones[i], START_BE, "24", (r.rent / 100).toFixed(2), (r.deposit / 100).toFixed(2), String(r.e0), String(r.w0)].join(","));
  return new TextEncoder().encode(`${[head, ...rows].join("\r\n")}\r\n`);
};

const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const tenantIds: string[] = [];
const FP: Record<string, unknown> = {}; // ลายนิ้วมือของรอบ (เทียบข้ามรอบ — E-8)
const S: Record<string, Any> = {};      // สถานะที่ข้อหลังใช้

// GL snapshot (แบบ d.10)
type GlSnap = { net: Map<string, number>; unbalanced: string[]; entryIds: Set<string> };
const gl = async (tenantId: string): Promise<GlSnap> => {
  const ls: Any[] = await prisma.accountJournalLine.findMany({ where: { tenantId }, select: { entryId: true, debit: true, credit: true, account: { select: { code: true } } } });
  const net = new Map<string, number>(), per = new Map<string, number>();
  for (const l of ls) {
    net.set(l.account.code, (net.get(l.account.code) ?? 0) + l.debit - l.credit);
    per.set(l.entryId, (per.get(l.entryId) ?? 0) + l.debit - l.credit);
  }
  return { net, unbalanced: [...per].filter(([, v]) => v !== 0).map(([k]) => k), entryIds: new Set(per.keys()) };
};
const dGl = (a: GlSnap, b: GlSnap, code: string) => (b.net.get(code) ?? 0) - (a.net.get(code) ?? 0);

/** ระบายด้วยตัวระบายจริง (drainAll = /api/cron/outbox) วนจนแถวของร้านนี้ไม่มี PENDING ที่ถึงเวลา และรอบสุดท้ายไม่มีอะไรให้หยิบ */
async function drainQuiet(tenantId: string): Promise<{ rounds: number; processed: number; failed: number; leftMine: number }> {
  let processed = 0, failed = 0, rounds = 0;
  for (; rounds < 25; rounds++) {
    const r = await OC.drainAll();
    processed += r?.processed ?? 0; failed += r?.failed ?? 0;
    const mine = await prisma.outboxEvent.count({ where: { tenantId, status: "PENDING", availableAt: { lte: new Date() } } });
    if (mine === 0 && (r?.processed ?? 0) === 0 && (r?.failed ?? 0) === 0) break;
  }
  const leftMine = await prisma.outboxEvent.count({ where: { tenantId, status: "PENDING", availableAt: { lte: new Date() } } });
  return { rounds: rounds + 1, processed, failed, leftMine };
}

const URL_RE = /https:\/\/qc-d15e2e\.invalid\/d\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(\?bill=([A-Za-z0-9_-]+))?/g;
const linksOf = (v: unknown) => [...J(v).matchAll(URL_RE)].map((m) => ({ token: m[1], bill: m[3] ?? null }));

let exitCode = 0;
console.log(`\n${LABEL} · ตัวจำลอง LINE ${FAKE_BASE} · APP_URL ${ORIGIN} · วันนี้ ${TODAY} · เลขเริ่ม ${READ_DATE} · จด ${P_UTIL} · รอบบิล ${P_BILL}`);
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc(stale.map((t: { id: string }) => t.id));

  // ═══════════════ ตั้งร้าน (แบบ d.9 mkBook/mkUnit/linkBook/mkUser/setVal/mkConn) ═══════════════
  console.log("\n── ตั้งร้าน/สมุด/หน่วย/ผู้ใช้/LINE OA (ตัวจำลอง) ──");
  const T = (await prisma.tenant.create({ data: { name: "QC D15 E2E", slug: `${SLUG}a-${STAMP}` } })).id as string;
  tenantIds.push(T);
  const book = await SYS.createSystem(T, "ACCOUNT", `บัญชีหอ D15E2E ${STAMP}`);
  const BOOK = book.id as string;
  await ASV.saveSettings(T, BOOK, { orgName: "หอดีสิบห้า", vatRegistered: false });
  await GL.ensureAccounting({ tenantId: T, systemId: BOOK });
  // ORACLE-EDIT (ผู้คุม 1 พ.ย. · G2F-cash-first) ▸ เงินสดถูกสร้างก่อนธนาคาร (useForReceive ปริยาย) — สลิปพร้อมเพย์ต้องไม่ลงบัญชีเงินสด ◂
  await prisma.accountFinance.create({ data: { tenantId: T, systemId: BOOK, type: "CASH", name: "เงินสดหน้าเคาน์เตอร์", useForReceive: true, createdAt: new Date(Date.now() - 60_000) } });
  await prisma.accountFinance.create({ data: { tenantId: T, systemId: BOOK, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
  const UNIT = (await prisma.businessUnit.create({ data: { tenantId: T, type: "DORM", name: "หอดีสิบห้า", slug: `d15e2e-${STAMP}` } })).id as string;
  await prisma.accountSystemLink.create({ data: { tenantId: T, systemId: BOOK, linkedKind: "BUSINESS", linkedId: UNIT, enabled: true } });
  const setVal = async (key: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId: T, key, scope: "UNIT", scopeId: UNIT } });
    await prisma.settingValue.create({ data: { tenantId: T, key, scope: "UNIT", scopeId: UNIT, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d15e2e" } });
  };
  await setVal("messaging.quietHours", null);            // ไม่ให้เวลาเงียบเลื่อนข้อความ (นาฬิกาจริง)
  await setVal("messaging.channelOrder", ["LINE", "WEB_LINK"]);
  await setVal("rooms.lateFee.autoCharge", false);
  await setVal("payments.receiver", { promptpayId: "0812345678", displayName: "หอดีสิบห้า" });
  const OWN = (await prisma.user.create({ data: { email: `${EMAIL}${STAMP}-owner@shark.local`, name: "QC D15E2E owner" } })).id as string;
  await prisma.membership.create({ data: { userId: OWN, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const cO = { tenantId: T, actorUserId: OWN };
  const chatSys = (await prisma.appSystem.create({ data: { tenantId: T, type: "CHAT", name: `qc-d15e2e-chat-${STAMP}` } })).id as string;
  const RAND = randomBytes(3).toString("hex");
  const CONN = (await prisma.chatChannelConnection.create({ data: { tenantId: T, systemId: chatSys, type: "LINE", displayName: `qc-d15e2e-${STAMP}`, externalAccountId: `qc-d15e2e-${STAMP}`,
    credentials: { channelAccessToken: `qcd15tok${RAND}`, channelSecret: `qcd15sec${RAND}` }, meta: { basicId: "@qcd15e2e" } } })).id as string;
  const TOKEN_AUTH = `Bearer qcd15tok${RAND}`;
  await setVal("messaging.lineConnectionId", CONN);
  const phones = ROOMS.map((_, i) => `08${String(10_000_000 + ((parseInt(STAMP.slice(-6), 36) * 7 + i * 7919) % 89_999_999)).padStart(8, "0").slice(-8)}`);
  FP.periods = { READ_DATE, P_UTIL, P_BILL };

  // ═══════════════ E-1 นำเข้า ═══════════════
  console.log("\n── E-1 นำเข้าไฟล์ ──");
  const before = { leases: await prisma.dormLease.count({ where: { tenantId: T } }), docs: await prisma.accountDocument.count({ where: { tenantId: T } }) };
  await st("E-1", `นำเข้า CSV ${ROOMS.length} ห้อง (uploadImport → previewImport ยืนยันแมป → createImport): ห้อง/สัญญา ACTIVE/ผู้เช่า Party/มิเตอร์ไฟ+น้ำ เลขเริ่มตามไฟล์ · เลข PERIOD ${P_START} · ไม่มีใบแจ้งหนี้`, [], async () => {
    const u = await DORM.uploadImport(cO, { unitId: UNIT, fileName: "ทะเบียนหอ-d15.csv", contentType: "text/csv", data: csvOf(phones) }, { put: async () => {} });
    ok(u?.ok, `uploadImport ${fmt(u)}`);
    eq([u.rowCount, u.columnCount], [ROOMS.length, 9], "แถว/คอลัมน์");
    const p = await DORM.previewImport(cO, { unitId: UNIT, batchId: u.batchId, mapping: MAPPING, options: { dateFormat: "BE_DMY", meterReadDate: READ_DATE, depositChannel: "TRANSFER" } });
    ok(p?.ok, `previewImport ${fmt(p)}`);
    ok(p.summary?.mustFix === 0 && p.summary?.ready === ROOMS.length, `พรีวิว ${fmt({ summary: p.summary, issues: p.issues })}`);
    const c = await DORM.createImport(cO, { unitId: UNIT, batchId: u.batchId, previewHash: p.previewHash });
    ok(c?.ok && c.status === "CREATED" && c.duplicate === false, `createImport ${fmt(c)}`);
    S.batchId = u.batchId; S.previewHash = p.previewHash;
    const leases: Any[] = await prisma.dormLease.findMany({ where: { tenantId: T, unitId: UNIT }, include: { room: { select: { number: true } } } });
    eq(leases.length - before.leases, ROOMS.length, "สัญญาใหม่");
    S.L = {};
    for (const [i, r] of ROOMS.entries()) {
      const l = leases.find((x) => x.room?.number === r.no);
      ok(l, `ไม่มีสัญญาห้อง ${r.no}`);
      eq([l.status, l.rentSatang, l.depositSatang, bkkYmd(l.startDate).slice(5)], ["ACTIVE", r.rent, r.deposit, "01-01"], `สัญญา ${r.no}`);
      const party = await prisma.party.findFirst({ where: { id: l.partyId, tenantId: T }, select: { name: true } });
      ok(party?.name === r.name, `Party ${r.no} = ${party?.name}`);
      S.L[r.no] = { leaseId: l.id, partyId: l.partyId, roomId: l.roomId, phone: phones[i] };
    }
    const meters: Any[] = await DORM.listMeters(cO, { unitId: UNIT });
    S.M = {};
    for (const r of ROOMS) {
      const e = meters.find((m) => m.roomId === S.L[r.no].roomId && m.kind === "ELEC"), w = meters.find((m) => m.roomId === S.L[r.no].roomId && m.kind === "WATER");
      ok(e && w, `มิเตอร์ห้อง ${r.no} ${fmt(meters)}`);
      eq([e.startReading, w.startReading], [r.e0, r.w0], `เลขเริ่ม ${r.no}`);
      S.M[r.no] = { e: e.meterId, w: w.meterId };
    }
    const rds: Any[] = await prisma.dormMeterReading.findMany({ where: { tenantId: T, unitId: UNIT, kind: "PERIOD", periodKey: P_START }, select: { meterId: true, value: true } });
    eq(rds.length, ROOMS.length * 2, "เลข PERIOD จากไฟล์");
    for (const r of ROOMS) eq([rds.find((x) => x.meterId === S.M[r.no].e)?.value, rds.find((x) => x.meterId === S.M[r.no].w)?.value], [r.e0, r.w0], `เลขงวด ${P_START} ${r.no}`);
    eq(await prisma.accountDocument.count({ where: { tenantId: T, docType: "INVOICE" } }), 0, "ใบแจ้งหนี้จากการนำเข้า");
  });
  // ผู้ติดต่อ LINE ของผู้เช่าแต่ละราย (ตัวจำลอง · แบบ d.9 mkContact)
  if (S.L) for (const r of ROOMS) {
    const ext = `Uqcd15${r.no}${RAND}`;
    await prisma.chatContact.create({ data: { tenantId: T, systemId: chatSys, channel: "LINE", channelConnectionId: CONN, externalUserId: ext, partyId: S.L[r.no].partyId, lang: "th" } });
    S.L[r.no].ext = ext;
  }

  // ═══════════════ E-2 จดมิเตอร์ ═══════════════
  console.log("\n── E-2 จดมิเตอร์งวดนี้ ──");
  await st("E-2", `submitReadings ${P_UTIL} ทุกมิเตอร์ (ไฟ/น้ำ) ⇒ CREATED · ป้าย ⇒ confirmReading ACCEPT · หน่วย = ใหม่ − เริ่ม · recordAuthorityBill ไฟ/น้ำ ${P_UTIL}`, ["E-1"], async () => {
    const items = ROOMS.flatMap((r) => [{ meterId: S.M[r.no].e, value: r.e1 }, { meterId: S.M[r.no].w, value: r.w1 }]);
    const s = await DORM.submitReadings(cO, { unitId: UNIT, periodKey: P_UTIL, items });
    ok(s?.ok, `submitReadings ${fmt(s)}`);
    const bad = (s.results as Any[]).filter((x) => x.status !== "CREATED");
    ok(!bad.length, `ผลจด ${fmt(bad)}`);
    const flagged = (s.results as Any[]).filter((x) => x.flag || x.held);
    for (const f of flagged) {
      const c = await DORM.confirmReading(cO, { unitId: UNIT, readingId: f.readingId, action: "ACCEPT", note: "e2e ยืนยันเลข" });
      ok(c?.ok && !c.held, `confirmReading ${fmt(c)}`);
    }
    S.flagged = flagged.length;
    for (const r of ROOMS) {
      eq((s.results as Any[]).find((x) => x.meterId === S.M[r.no].e)?.units, r.e1 - r.e0, `หน่วยไฟ ${r.no}`);
      eq((s.results as Any[]).find((x) => x.meterId === S.M[r.no].w)?.units, r.w1 - r.w0, `หน่วยน้ำ ${r.no}`);
    }
    const ae = await DORM.recordAuthorityBill(cO, { unitId: UNIT, kind: "ELEC", periodKey: P_UTIL, ...AUTH_ELEC });
    const aw = await DORM.recordAuthorityBill(cO, { unitId: UNIT, kind: "WATER", periodKey: P_UTIL, ...AUTH_WATER });
    ok(ae?.ok && aw?.ok, `recordAuthorityBill ${fmt(ae)} ${fmt(aw)}`);
  });

  // ═══════════════ E-3 รอบบิล ═══════════════
  console.log("\n── E-3 รอบบิล ──");
  const g0 = await gl(T);
  const ruleOf = async () => {
    const keys = ["rooms.utility.elec.method", "rooms.utility.water.method", "rooms.utility.elec.fixedRate", "rooms.utility.water.fixedRate", "rooms.billing.utilityTiming", "rooms.billing.rentTiming", "rooms.vat.registered", "rooms.utility.minimum"];
    const v = await SET.resolveSettings({ tenantId: T }, keys, { unitId: UNIT });
    const val = (k: string) => v[k]?.value;
    const rateOf = (kind: "elec" | "water") => {
      const m = val(`rooms.utility.${kind}.method`);
      if (m === "FIXED_RATE") return val(`rooms.utility.${kind}.fixedRate`) as number;
      if (m === "ACTUAL_COST") { const a = kind === "elec" ? AUTH_ELEC : AUTH_WATER; return Math.floor(a.billSatang / a.units); }
      throw new AssertFail(`วิธีคิด ${kind} = ${m} (ข้อสอบรองรับ ACTUAL_COST/FIXED_RATE)`);
    };
    ok(val("rooms.billing.utilityTiming") === "ARREARS" && val("rooms.billing.rentTiming") === "ADVANCE" && val("rooms.vat.registered") === false && (val("rooms.utility.minimum") ?? null) === null,
      `ค่าตั้งรอบบิลไม่ใช่ค่าเริ่ม ${fmt(Object.fromEntries(keys.map((k) => [k, val(k)])))}`);
    return { elec: rateOf("elec"), water: rateOf("water"), method: [val("rooms.utility.elec.method"), val("rooms.utility.water.method")] };
  };
  await st("E-3", `prepareBillRun ${P_BILL} (น้ำไฟ ${P_UTIL}) + sendBillRun จนจบ ⇒ บิล ${ROOMS.length} ใบ ยอด = ค่าเช่า + หน่วย×อัตรา (อัตราจากค่าตั้ง) · บรรทัด RENT/ELEC/WATER · INVOICE source DORM grandTotal = บิล · GL Dr 1100 = Σ grandTotal · สมดุล`, ["E-2"], async () => {
    const rate = await ruleOf();
    S.rate = rate;
    const exp: Record<string, number> = {};
    for (const r of ROOMS) exp[r.no] = r.rent + (r.e1 - r.e0) * rate.elec + (r.w1 - r.w0) * rate.water;
    S.exp = exp;
    const p = await DORM.prepareBillRun(cO, { unitId: UNIT, periodKey: P_BILL });
    ok(p?.ok && p.created === true, `prepareBillRun ${fmt(p)}`);
    eq([p.utilityPeriodKey, p.billCount, p.heldCount, p.totalSatang, p.gate?.ok], [P_UTIL, ROOMS.length, 0, Object.values(exp).reduce((a, b) => a + b, 0), true], "รอบ");
    S.runId = p.runId;
    let s: Any = null;
    for (let i = 0; i < 20; i++) { s = await DORM.sendBillRun(cO, { unitId: UNIT, runId: p.runId }); if (!s?.ok || s.done) break; }
    ok(s?.ok && s.done && s.status === "SENT" && (s.failed ?? []).length === 0, `sendBillRun ${fmt(s)}`);
    S.B = {};
    for (const r of ROOMS) {
      const b = await prisma.dormBill.findFirst({ where: { tenantId: T, leaseId: S.L[r.no].leaseId, periodKey: P_BILL } });
      ok(b && b.status === "SENT" && b.accountDocumentId, `บิล ${r.no} ${fmt(b && { status: b.status, doc: b.accountDocumentId })}`);
      eq(b.totalSatang, exp[r.no], `ยอดบิล ${r.no}`);
      const lines = (b.lines as Any[]).map((l) => [l.code, l.amountSatang]);
      eq(lines, [["RENT", r.rent], ["ELEC", (r.e1 - r.e0) * rate.elec], ["WATER", (r.w1 - r.w0) * rate.water]], `บรรทัด ${r.no}`);
      const d = await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId, tenantId: T } });
      eq([d?.docType, d?.source, d?.grandTotal, d?.systemId, d?.status], ["INVOICE", "DORM", exp[r.no], BOOK, "AWAITING_PAYMENT"], `ใบแจ้งหนี้ ${r.no}`);
      // เลขใบแจ้งหนี้ตามรูปแบบที่สมุดตั้ง
      const cfg = await NUM.loadNumberingContext(prisma, BOOK, "INVOICE", SCH.fallbackPrefixOf("INVOICE"));
      const re = NUM.seriesMatcher(cfg.effectivePattern, { prefix: cfg.prefix, date: d.issueDate, branchCode: cfg.branchCode }, cfg.reset);
      ok(typeof d.docNo === "string" && (!re || re.test(d.docNo)), `เลขใบแจ้งหนี้ ${d.docNo} ไม่ตรงรูปแบบ ${cfg.effectivePattern}`);
      S.B[r.no] = { billId: b.id, docId: d.id, docNo: d.docNo, total: b.totalSatang, contactId: d.contactId };
    }
    const g1 = await gl(T);
    eq([dGl(g0, g1, "1100"), g1.unbalanced.length], [Object.values(exp).reduce((a, b) => a + b, 0), 0], "GL 1100/สมดุล");
    FP.bills = ROOMS.map((r) => [r.no, S.B[r.no].total, S.B[r.no].docNo]);
    FP.rate = rate;
  });

  // ═══════════════ E-4 outbox → LINE ═══════════════
  console.log("\n── E-4 ระบาย outbox → LINE ──");
  const foreign = await prisma.outboxEvent.count({ where: { tenantId: { not: T }, status: "PENDING", availableAt: { lte: new Date() } } });
  if (foreign) console.log(`  (ข้อมูล: event PENDING ของร้านอื่นบนฐานนี้ ${foreign} แถว — drainAll ระบายรวม)`);
  await st("E-4", "drainAll วนจนเงียบ ⇒ dorm.billrun.sent DONE ทุกบิล · LINE push 1 ครั้ง/บิล ถึงผู้เช่าเจ้าของบิล ด้วย token ของ OA หน่วย · ลิงก์ /d/<token>?bill=<billId> · verifyLink(dorm.portal) = สัญญาของห้อง", ["E-3"], async () => {
    const m = mark();
    const dr = await drainQuiet(T);
    ok(dr.leftMine === 0, `ยังค้าง ${fmt(dr)}`);
    const evs: Any[] = await prisma.outboxEvent.findMany({ where: { tenantId: T, type: "dorm.billrun.sent" }, select: { status: true, idempotencyKey: true } });
    eq(evs.map((e) => e.status).sort(), ROOMS.map(() => "DONE"), "สถานะ event");
    const ps = pushesSince(m);
    eq(ps.length, ROOMS.length, `push ทั้งหมด (${fmt(ps.map((p) => p.json?.to))})`);
    S.tokens = {};
    for (const r of ROOMS) {
      const mine = ps.filter((p) => p.json?.to === S.L[r.no].ext);
      eq(mine.length, 1, `push ถึง ${r.no}`);
      eq(mine[0].auth, TOKEN_AUTH, `token OA ${r.no}`);
      const links = linksOf(mine[0].json);
      ok(links.length >= 1, `ไม่มีลิงก์พอร์ทัลในข้อความ ${r.no}: ${fmt(mine[0].json)}`);
      const lk = links.find((l) => l.bill === S.B[r.no].billId) ?? links[0];
      eq(lk.bill, S.B[r.no].billId, `?bill= ${r.no}`);
      eq(SL.verifyLink(lk.token, "dorm.portal"), { tenantId: T, subjectId: S.L[r.no].leaseId }, `verifyLink ${r.no}`);
      S.tokens[r.no] = lk.token;
    }
    const m2 = mark();
    const dr2 = await drainQuiet(T);
    eq([pushesSince(m2).length, dr2.leftMine], [0, 0], "ระบายซ้ำไม่ส่งซ้ำ");
  });

  // ═══════════════ PC ก่อนจ่าย ═══════════════
  console.log("\n── PC ก่อนรับเงิน ──");
  const ar = async (no: string): Promise<number> => {
    // 1100 ของสัญญา = บรรทัด 1100 ของรายการที่อ้างใบแจ้งหนี้ของบิล / การรับชำระของใบนั้น / ใบเสร็จของบิล
    const pays: Any[] = await prisma.accountDocumentPayment.findMany({ where: { tenantId: T, documentId: S.B[no].docId }, select: { id: true } });
    const rcpt: Any[] = await prisma.accountDocument.findMany({ where: { tenantId: T, docType: "RECEIPT", sourceDocId: S.B[no].docId }, select: { id: true } });
    const refIds = [S.B[no].docId, ...pays.map((p) => p.id), ...rcpt.map((x) => x.id)];
    const ls: Any[] = await prisma.accountJournalLine.findMany({ where: { tenantId: T, account: { code: "1100" }, entry: { refId: { in: refIds } } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.debit - l.credit, 0);
  };
  const A0 = ROOMS[0].no, B0 = ROOMS[1].no;
  await st("PC-1", `positive control: ก่อนอนุมัติ 1100 ของสัญญา ${A0} = ยอดบิล (≠ 0) · ${B0} = ยอดบิล · พอร์ทัล (token จาก LINE) เห็นยอดค้าง = บิล`, ["E-4"], async () => {
    eq([await ar(A0), await ar(B0)], [S.B[A0].total, S.B[B0].total], "1100 ต่อสัญญา");
    ok(S.B[A0].total > 0, "ยอด 0");
    const v = await PORTAL.loadPortal(S.tokens[A0], { bill: S.B[A0].billId }, { clientKey: `qc-d15e2e-${STAMP}-v` });
    ok(v?.bill, `loadPortal ${fmt(v)}`);
    eq([v.bill.billId ?? v.bill.id, v.bill.outstandingSatang], [S.B[A0].billId, S.B[A0].total], "พอร์ทัล");
  });

  // ═══════════════ E-5 สลิปพอร์ทัล ═══════════════
  console.log("\n── E-5 ผู้เช่าส่งสลิปผ่านพอร์ทัล ──");
  await st("E-5", `submitPortalSlip (token จากลิงก์ LINE ของ ${A0}) ⇒ ok · สลิป DORM/DORM_BILL ของบิล · expected = ยอดบิล · ยังไม่ลงเงิน · ส่งซ้ำคีย์เดิม ⇒ replayed สลิปเดิม`, ["E-4"], async () => {
    const file = { data: pngOf(`slip-${A0}`), contentType: "image/png" };
    const idem = `e2e-${A0}`;
    const s = await PORTAL.submitPortalSlip(S.tokens[A0], { billId: S.B[A0].billId, file, idempotencyKey: idem }, { clientKey: `qc-d15e2e-${STAMP}-s`, deps: noopDeps });
    ok(s?.ok && typeof s.slipId === "string", `submitPortalSlip ${fmt(s)}`);
    const row = await prisma.paymentSlip.findFirst({ where: { id: s.slipId, tenantId: T } });
    eq([row?.domain, row?.refType, row?.refId, row?.unitId, row?.partyId, row?.expectedSatang], ["DORM", "DORM_BILL", S.B[A0].billId, UNIT, S.L[A0].partyId, S.B[A0].total], "สลิป");
    ok(["PENDING", "NEEDS_REVIEW"].includes(row.status), `สถานะสลิป ${row.status} (ต้องรอคนตรวจ)`);
    const again = await PORTAL.submitPortalSlip(S.tokens[A0], { billId: S.B[A0].billId, file, idempotencyKey: idem }, { clientKey: `qc-d15e2e-${STAMP}-s`, deps: noopDeps });
    ok(again?.ok && again.slipId === s.slipId && again.replayed === true, `ส่งซ้ำ ${fmt(again)}`);
    eq(await prisma.paymentSlip.count({ where: { tenantId: T, refId: S.B[A0].billId } }), 1, "จำนวนสลิป");
    eq(await prisma.accountDocumentPayment.count({ where: { tenantId: T, documentId: S.B[A0].docId } }), 0, "ยังไม่มีรับชำระ");
    S.slipId = s.slipId; S.slipStatus = row.status; S.slipTransRef = row.transRef;
  });

  // ═══════════════ E-6 อนุมัติ → ใบเสร็จ ═══════════════
  console.log("\n── E-6 ร้านอนุมัติสลิป → ใบเสร็จ ──");
  const gPre = await gl(T);
  await st("E-6", `decideSlip (OWNER · APPROVE) ⇒ outbox payment.slip.approved ⇒ drainAll จนเงียบ ⇒ บิล ${A0} PAID · RECEIPT 1 ใบ docNo = เลขถัดไปตามรูปแบบสมุด (peekDocNo ก่อนอนุมัติ) · LINE ใบเสร็จ 1 ข้อความถึงผู้เช่า`, ["E-5"], async () => {
    const rc0 = await prisma.accountDocument.count({ where: { tenantId: T, docType: "RECEIPT" } });
    const cfg = await NUM.loadNumberingContext(prisma, BOOK, "RECEIPT", SCH.fallbackPrefixOf("RECEIPT"));
    const peek = await NUM.peekDocNo(prisma, { systemId: BOOK, docType: "RECEIPT", fallbackPrefix: SCH.fallbackPrefixOf("RECEIPT"), date: new Date() });
    const tref = S.slipTransRef ? undefined : `QCD15${STAMP.toUpperCase()}A`;
    const r = await SLIP.decideSlip({ userId: OWN }, { tenantId: T }, S.slipId, { decision: "APPROVE", reason: "ตรวจยอดตรงบิลแล้ว", ...(tref ? { transRef: tref } : {}) });
    ok(r?.ok && r.status === "APPROVED", `decideSlip ${fmt(r)}`);
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: T, type: "payment.slip.approved", payload: { path: ["slipId"], equals: S.slipId } } });
    eq(ev.length, 1, "outbox payment.slip.approved");
    const m = mark();
    const dr = await drainQuiet(T);
    ok(dr.leftMine === 0, `ยังค้าง ${fmt(dr)}`);
    eq((await prisma.outboxEvent.findFirst({ where: { id: ev[0].id } }))?.status, "DONE", "event สลิป");
    const b = await prisma.dormBill.findFirst({ where: { id: S.B[A0].billId } });
    eq([b?.status, b?.paidSatang, !!b?.paidAt], ["PAID", S.B[A0].total, true], "บิล");
    const inv = await prisma.accountDocument.findFirst({ where: { id: S.B[A0].docId } });
    eq([inv?.status, inv?.paidTotal], ["PAID", S.B[A0].total], "ใบแจ้งหนี้");
    const rcs: Any[] = await prisma.accountDocument.findMany({ where: { tenantId: T, docType: "RECEIPT" }, orderBy: { createdAt: "asc" } });
    eq(rcs.length - rc0, 1, "ใบเสร็จใหม่");
    const rc = rcs[rcs.length - 1];
    eq([rc.source, rc.systemId, rc.grandTotal], ["DORM", BOOK, S.B[A0].total], "ใบเสร็จ");
    ok(!["VOIDED", "CANCELLED", "DRAFT"].includes(rc.status), `สถานะใบเสร็จ ${rc.status}`);
    const re = NUM.seriesMatcher(cfg.effectivePattern, { prefix: cfg.prefix, date: rc.issueDate, branchCode: cfg.branchCode }, cfg.reset);
    ok(typeof rc.docNo === "string" && (!re || re.test(rc.docNo)), `เลขใบเสร็จ ${rc.docNo} ไม่ตรงรูปแบบ ${cfg.effectivePattern}`);
    eq(rc.docNo, peek, `เลขใบเสร็จ = เลขถัดไป (รูปแบบ ${cfg.effectivePattern})`);
    const views: Any[] = await PAY.dormBillReceipts(cO, { unitId: UNIT, billId: S.B[A0].billId });
    const live = (views ?? []).filter((v) => v.status === "ISSUED");
    eq(live.map((v) => [v.receiptId, v.docNo, v.slipId, v.amountSatang, v.creditSatang]), [[rc.id, rc.docNo, S.slipId, S.B[A0].total, 0]], "dormBillReceipts");
    const ps = pushesSince(m);
    eq(ps.map((p) => [p.json?.to, p.auth]), [[S.L[A0].ext, TOKEN_AUTH]], "push ใบเสร็จ");
    const baht = (S.B[A0].total / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ok(J(ps[0].json).includes(baht), `ข้อความใบเสร็จไม่มียอด ${baht}`);
    S.receipt = { id: rc.id, docNo: rc.docNo, pattern: cfg.effectivePattern, channel: live[0]?.channel };
    FP.receipt = [rc.docNo, rc.grandTotal, cfg.effectivePattern];
  });

  // ═══════════════ E-7 GL ═══════════════
  console.log("\n── E-7 สมุดบัญชี ──");
  await st("E-7", `GL การรับเงิน: Dr บัญชีเงิน (ตามช่องทาง/บัญชีเงินของการรับชำระ → ผังบัญชี) = ยอด / Cr 1100 = ยอด · ไม่มี 2110/รายได้ใหม่ · 1100 ของสัญญา ${A0} = 0 · ${B0} คงค้าง = บิล · ทุกรายการสมดุล`, ["E-6"], async () => {
    const gPost = await gl(T);
    const total = S.B[A0].total;
    const pays: Any[] = await prisma.accountDocumentPayment.findMany({ where: { tenantId: T, documentId: S.B[A0].docId, voidedAt: null } });
    eq(pays.map((p) => p.amount), [total], "รับชำระ");
    const pay = pays[0];
    // บัญชีเงินที่คาด (อ่านจากผังบัญชี/บัญชีเงินของสมุด — ไม่ฝังรหัส): บัญชีเงินระบุ ⇒ ledger ของบัญชีนั้น · ไม่ระบุ ⇒ mapping CASH (เงินสด) / BANK (อื่น ๆ)
    let expAcc: string | null = null;
    if (pay.financeAccountId) {
      const fa = await prisma.accountFinance.findFirst({ where: { id: pay.financeAccountId, systemId: BOOK }, select: { ledgerAccountId: true, type: true } });
      // ORACLE-EDIT (ผู้คุม 1 พ.ย. · G2F-cash-first) ▸ ช่องทางไม่ใช่เงินสด ⇒ บัญชีเงินต้องไม่ใช่ CASH/PETTY_CASH ◂
      if (pay.channel !== "CASH" && (fa?.type === "CASH" || fa?.type === "PETTY_CASH")) throw new Error(`สลิป ${pay.channel} ลงบัญชีเงินสด (${fa?.type})`);
      expAcc = fa?.ledgerAccountId ?? (await prisma.accountMapping.findFirst({ where: { systemId: BOOK, key: fa?.type === "CASH" ? "CASH" : "BANK" } }))?.accountId ?? null;
    } else {
      expAcc = (await prisma.accountMapping.findFirst({ where: { systemId: BOOK, key: pay.channel === "CASH" ? "CASH" : "BANK" } }))?.accountId ?? null;
    }
    ok(expAcc, "หา บัญชีเงินที่คาดไม่ได้");
    const expCode = (await prisma.accountLedger.findFirst({ where: { id: expAcc }, select: { code: true } }))?.code;
    const newEntries = [...gPost.entryIds].filter((id) => !gPre.entryIds.has(id));
    const lines: Any[] = await prisma.accountJournalLine.findMany({ where: { tenantId: T, entryId: { in: newEntries } }, select: { entryId: true, debit: true, credit: true, account: { select: { id: true, code: true } } } });
    const by = (pred: (l: Any) => boolean) => lines.filter(pred).reduce((a, l) => a + l.debit - l.credit, 0);
    eq([by((l) => l.account.id === expAcc), by((l) => l.account.code === "1100")], [total, -total], `Dr ${expCode} / Cr 1100 (ช่องทาง ${pay.channel})`);
    ok(lines.filter((l) => l.debit > 0).every((l) => l.account.id === expAcc), `Dr อื่นนอกบัญชีเงิน ${fmt(lines.filter((l) => l.debit > 0).map((l) => [l.account.code, l.debit]))}`);
    eq([dGl(gPre, gPost, "2110"), gPost.unbalanced.length], [0, 0], "2110/สมดุล");
    const income = lines.filter((l) => /^4/.test(l.account.code)).reduce((a, l) => a + l.credit - l.debit, 0);
    eq(income, 0, "รายได้จากการรับเงิน");
    eq([await ar(A0), await ar(B0)], [0, S.B[B0].total], "1100 ต่อสัญญา");
    eq(dGl(gPre, gPost, "1100"), -total, "1100 ทั้งสมุด");
    S.gl = { channel: pay.channel, finance: pay.financeAccountId ? "ระบุ" : "ไม่ระบุ", drCode: expCode };
    FP.gl = [pay.channel, expCode, total];
  });

  // ═══════════════ E-8 ทำซ้ำ ═══════════════
  console.log("\n── E-8 ทำซ้ำ (idempotent) ──");
  await st("E-8", "ทำซ้ำทุกขั้น: createImport ชุดเดิม ⇒ duplicate · prepareBillRun ⇒ created false · sendBillRun ⇒ sent 0 · submitPortalSlip บิลจ่ายแล้ว ⇒ ไม่รับ · decideSlip ซ้ำ ⇒ INVALID_STATE · consumer สลิปซ้ำ + drainAll ⇒ ไม่มีใบเสร็จ/รับชำระ/push/รายการบัญชีใหม่", ["E-7"], async () => {
    const snap = async () => ({
      leases: await prisma.dormLease.count({ where: { tenantId: T } }), meters: await prisma.dormMeter.count({ where: { tenantId: T } }), readings: await prisma.dormMeterReading.count({ where: { tenantId: T } }),
      bills: await prisma.dormBill.count({ where: { tenantId: T } }), docs: await prisma.accountDocument.count({ where: { tenantId: T } }), pays: await prisma.accountDocumentPayment.count({ where: { tenantId: T } }),
      entries: await prisma.accountJournalEntry.count({ where: { tenantId: T } }), slips: await prisma.paymentSlip.count({ where: { tenantId: T } }),
    });
    const s0 = await snap(), m = mark();
    const c = await DORM.createImport(cO, { unitId: UNIT, batchId: S.batchId, previewHash: S.previewHash });
    ok(c?.ok && c.duplicate === true, `createImport ซ้ำ ${fmt(c)}`);
    const p = await DORM.prepareBillRun(cO, { unitId: UNIT, periodKey: P_BILL });
    ok(p?.ok && p.created === false && p.runId === S.runId, `prepare ซ้ำ ${fmt(p)}`);
    const s = await DORM.sendBillRun(cO, { unitId: UNIT, runId: S.runId });
    ok(s?.ok && s.sent === 0 && s.done, `send ซ้ำ ${fmt(s)}`);
    const sl = await PORTAL.submitPortalSlip(S.tokens[A0], { billId: S.B[A0].billId, file: { data: pngOf(`slip2-${A0}`), contentType: "image/png" }, idempotencyKey: `e2e-${A0}-2` }, { clientKey: `qc-d15e2e-${STAMP}-s2`, deps: noopDeps });
    ok(sl?.ok === false && sl.code === "NOT_PAYABLE", `สลิปบิลจ่ายแล้ว ${fmt(sl)}`);
    const d = await SLIP.decideSlip({ userId: OWN }, { tenantId: T }, S.slipId, { decision: "APPROVE", reason: "กดซ้ำ" });
    ok(d?.ok === false && d.code === "INVALID_STATE", `decide ซ้ำ ${fmt(d)}`);
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: T, type: "payment.slip.approved", payload: { path: ["slipId"], equals: S.slipId } } });
    await OC.consumers["payment.slip.approved"](ev);
    await OC.consumers["dorm.billrun.sent"]((await prisma.outboxEvent.findFirst({ where: { tenantId: T, type: "dorm.billrun.sent", payload: { path: ["billId"], equals: S.B[A0].billId } } })));
    const dr = await drainQuiet(T);
    const s1 = await snap();
    eq(s1, s0, "แถวธุรกิจ/บัญชี");
    eq([pushesSince(m).length, dr.leftMine], [0, 0], "push/คิว");
    eq((await prisma.dormBill.findFirst({ where: { id: S.B[A0].billId } }))?.status, "PAID", "บิล");
  });
  console.log(`  FINGERPRINT ${J(FP)}`);
} catch (e) {
  record("FATAL", "สคริปต์ล้มกลางทาง", "FAIL", errMsg(e));
} finally {
  // ═══════════════ Z ล้าง ═══════════════
  try {
    await cleanup(tenantIds);
    await cleanupMisc(tenantIds);
    const left = tenantIds.length ? await prisma.tenant.count({ where: { id: { in: tenantIds } } }) : 0;
    const users = await prisma.user.count({ where: { email: { startsWith: EMAIL } } });
    if (left === 0 && users === 0) record("Z-1", "ล้างร้าน/ผู้ใช้ทดสอบครบ", "PASS", "");
    else record("Z-1", "ล้างร้าน/ผู้ใช้ทดสอบครบ", "FAIL", `ค้าง tenant ${left} user ${users}`);
  } catch (e) { record("Z-1", "ล้างร้าน/ผู้ใช้ทดสอบครบ", "FAIL", errMsg(e)); }
  if (BLOCKED.length) console.log(`  (ข้อมูล: fetch นอกเครื่องถูกบล็อก ${BLOCKED.length} ครั้ง: ${[...new Set(BLOCKED)].join(", ")})`);
  if (S.rate) console.log(`  (ตัวเลข: อัตรา ${J(S.rate)} · บิล ${J(S.B && Object.fromEntries(Object.entries(S.B).map(([k, v]: [string, Any]) => [k, [v.total, v.docNo]])))} · ใบเสร็จ ${J(S.receipt)} · GL ${J(S.gl)} · สลิปตอนส่ง ${S.slipStatus} · ป้ายมิเตอร์ ${S.flagged})`);
  const failed = failedIds();
  const skipped = cks.filter((c) => c.res === "SKIP").map((c) => c.id);
  console.log(`\nJSON_SUMMARY ${J({ total: cks.length, passed: cks.filter((c) => c.res === "PASS").length, failed, skipped })}`);
  exitCode = failed.length ? 1 : 0;
  server.close();
  try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
}
process.exit(exitCode);
