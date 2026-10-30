// QC — SVC D.10 · ตรวจสลิป/รับเงินหอ · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.10.md (§3 สัญญา · §4 DOM · §6 จุดที่เลือกเอง · §8.1 สถานการณ์แข่ง) · ledger/SVC-MASTER-PLAN.md แถว D.10
//        CC §3 (submitSlip · decideSlip · payment.slip.approved) §4.4 (notifyCustomer) §6.2 (recordExternalPayment) §7 · ภาพ ledger/design-dorm/06-slip-payments.png
//        บทเรียน /root/svc-runs/fix/{b8,d9,d8,d11,d3}.md (หนี้ D.9: A11 · IP-1b · W4 · W7)
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ค่าตั้ง/สัญญาโค้ด (เงินผ่าน facade บัญชีเท่านั้น · ไม่ส่ง LINE ตรง · ไม่มีคำต้องห้าม สคบ.)
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): รอบบิล D.8 · recordExternalPayment (2110) · decideSlip ⇒ outbox · ใบลด/เพิ่มหนี้ D.8 · แม่แบบใบเสร็จ · consumer B.8 ไม่แตะสลิปหอ
//   B  ยอดนิยามเดียว (A11): billBalances = outstandingMany (D.11) = พอร์ทัล (D.9) · ใบเพิ่มหนี้ · ใบลดหนี้ · ข้ามร้าน
//   C  consumer payment.slip.approved (DORM_BILL): ยอดตรง · ใบเสร็จ · GL · event · LINE · X4 ซ้ำ/พร้อมกัน/หลายโพรเซส · เกิน ⇒ 2110 · ใบเพิ่มหนี้ · ใบลดหนี้
//      · สลิปหลังจ่ายครบ (IP-1b พัก/CREDIT) · บิล VOID · ไม่ใช่ของหอ/ร้านอื่น/ยังไม่อนุมัติ · ยอดจากฐาน (V8)
//   R  ตัดสินมือ (reviewDormSlip/resolveHeldSlip): NOT_FOUND เนื้อเดียว · ชื่อไม่ตรง · ยกยอด (บิลหน้าถูก) · ขอโอนเพิ่ม · DENY · ปฏิเสธไม่มีบัญชี · ซ้ำเลขอ้างอิง
//      · อนุมัติซ้ำ/พร้อมกัน (X4) · สองสลิปบิลเดียว (W7) · อนุมัติแข่งเงินสด · บิลจ่ายครบ/VOID/ไม่มีใบ · พักแล้วเก็บเครดิต
//   M  รับเงินมือ (recordDormPayment): สิทธิ์ · คีย์กันซ้ำ · พร้อมกัน · บางส่วน · เกิน · ตรวจอินพุต · DENY
//   N  เลขใบเสร็จไม่ซ้ำ/ไม่ใช้ซ้ำ · ยกเลิก = กลับรายการ (ไม่ลบ) · ใบเสร็จสลิปที่ยกเลิกไม่ถูกลงซ้ำ
//   K  โมเดลจอ 06 (KPI ตรง · แยกหน่วย/ร้าน · แถวพัก · ลิงก์ statement · ไม่มี PII) · W สลิปแชทกำกวม (W4) · E event/LINE/PII · U DOM
//   Q  ฉาก svcqc (ต่อฉาก D.13) · V ภาพ (QC_BASE) · Z ล้าง · G regression (หลังล้าง)
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · โพรเซสลูกได้ env เดียวกัน
// 🔴 APP_URL = https://qc-d10.invalid · ร้านทดสอบ slug `qc-svc-d10-*` · ผู้ใช้ `svc-d10-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 สลิปของข้อสอบเขียนตรงลง PaymentSlip (สถานะ/ยอด/เหตุผลกำหนดได้ · ไม่พึ่งตัวต่อตรวจสลิป) — ผลเงินต้องเกิดจากโค้ดของใบเท่านั้น
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.10.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = G เป็น SKIP · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_VISUAL_SPECS, SQC_DORM_PAY_SCENE, SQC_TENANT, SQC_UNITS, SQC_USERS } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.10";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D10_NO_REGRESSION === "1";
const ORIGIN = "https://qc-d10.invalid";
const F = {
  pay: "src/lib/platform/dorm-pay.ts",
  balance: "src/lib/modules/dorm/balance.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  latefee: "src/lib/modules/dorm/latefee.ts",
  dormPortal: "src/lib/modules/dorm/portal.ts",
  portal: "src/lib/platform/dorm-portal.ts",
  line: "src/lib/platform/dorm-line.ts",
  slipVerify: "src/lib/payment/slip-verify.ts",
  accIndex: "src/lib/modules/account/index.ts",
  accService: "src/lib/modules/account/service.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  hookLabels: "src/lib/webhooks/labels.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  page: "src/app/app/u/[unitSlug]/dorm/payments/page.tsx",
  actions: "src/app/app/u/[unitSlug]/dorm/payments/actions.ts",
  comp: "src/components/dorm/DormPayments.tsx",
  homeShared: "src/components/dorm/dorm-home-shared.ts",
  scene: "scripts/svc-qc-payments-scene.mts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngOf = (seed: string): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`qc-d10:${seed}`).digest(), createHash("sha256").update(seed).digest()]));
const noopDeps = { put: async () => {}, del: async () => 200 };

// ═══════════════ โหมดโพรเซสลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก (ไม่สร้างข้อมูล/ไม่ล้าง) ═══════════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: Any[]; at: number };
      const rel = "src/lib/platform/dorm-pay.ts";
      const m = existsSync(join(ROOT, rel)) ? ((await import(pathToFileURL(join(ROOT, rel)).href)) as Any) : null;
      const runOne = async (x: Any): Promise<unknown> => {
        if (!m) return { childFail: `ยังไม่มี ${rel}` };
        const name = ({ consume: "onDormSlipApproved", review: "reviewDormSlip", cash: "recordDormPayment", void: "voidDormReceipt" } as Record<string, string>)[job.op];
        if (!name || typeof m[name] !== "function") return { childFail: `ไม่มี ${name ?? job.op}` };
        if (job.op === "consume") { await m[name](x.evt); return { ok: true }; }
        return m[name](x.ctx, x.input);
      };
      const wait = job.at - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      out = await Promise.all(job.items.map(async (x) => { try { return await runOne(x); } catch (e) { return { threw: errMsg(e) }; } }));
    } catch (e) { out = [{ childFail: errMsg(e) }]; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as Any; await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
    process.exit(0);
  }
}

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ยึดของ|ขนของออก|เข้าห้องโดยไม่/;
const PHONE_RE = /(\+?66|0)[689]\d{8}/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch ═══════════════
process.env.APP_URL = ORIGIN;
type FakeReq = { method: string; path: string; auth: string; json: Any; status: number };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    const rec: FakeReq = { method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), json, status: 0 };
    FAKE.push(rec);
    const send = (code: number, obj: unknown) => { rec.status = code; if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    const content = /^\/v2\/bot\/message\/([^/]+)\/content$/.exec(path);
    if (req.method === "GET" && content) {
      if (content[1].startsWith("404")) return send(404, { message: "not found" });
      rec.status = 200;
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(Buffer.from(pngOf(`line-${content[1]}`)));
    }
    if (req.method === "POST" && path === "/v2/bot/message/push") return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const LINE_API_BASE_SAVED = process.env.LINE_API_BASE;
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
const since = (m: number) => FAKE.slice(m);
const pushes = (m: number) => since(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");
const pushesTo = (ext: string, m: number) => pushes(m).filter((r) => r.json?.to === ext);
const contentGets = (m: number) => since(m).filter((r) => r.method === "GET" && /\/content$/.test(r.path));

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const payL = await loadIf(F.pay);
const balL = await loadIf(F.balance);
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SL = (await tryImport("@/lib/core/signed-link")).mod as Any;
const SLIP = (await tryImport("@/lib/payment/slip-verify")).mod as Any;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const ACC = (await tryImport("@/lib/modules/account")).mod as Any;
const SYS = (await tryImport("@/lib/modules/system/service")).mod as Any;
const ASV = (await tryImport("@/lib/modules/account/service")).mod as Any;
const GL = (await tryImport("@/lib/modules/account/gl")).mod as Any;
const DORM = (await tryImport("@/lib/modules/dorm")).mod as Any;
const LF = (await tryImport("@/lib/modules/dorm/latefee")).mod as Any;
const OC = (await tryImport("@/lib/outbox-consumers")).mod as Any;
const PORTAL = (await loadIf(F.portal)).mod as Any;
const LINE = (await loadIf(F.line)).mod as Any;
const PRISMA_NS = ((await tryImport("@prisma/client")).mod as Any)?.Prisma;
const PAY = {
  consume: () => fnOf(payL, "onDormSlipApproved", F.pay),
  review: () => fnOf(payL, "reviewDormSlip", F.pay),
  resolve: () => fnOf(payL, "resolveHeldSlip", F.pay),
  cash: () => fnOf(payL, "recordDormPayment", F.pay),
  voidR: () => fnOf(payL, "voidDormReceipt", F.pay),
  receipts: () => fnOf(payL, "dormBillReceipts", F.pay),
  model: () => fnOf(payL, "dormPaymentsModel", F.pay),
  attach: () => fnOf(payL, "attachChatSlip", F.pay),
  dismiss: () => fnOf(payL, "dismissChatSlip", F.pay),
  NF: (): string => { const t = payL.mod?.DORM_PAY_NF; ok(typeof t === "string" && THAI.test(t), `«${F.pay}» ยังไม่มี DORM_PAY_NF (${payL.err || "โหลดได้"})`); return t; },
};
const balances = async (tenantId: string, billIds: string[]): Promise<Map<string, Any>> => {
  const r = await fnOf(balL, "billBalances", F.balance)(tenantId, billIds);
  ok(r instanceof Map, `billBalances ต้องคืน Map ได้ ${fmt(r)}`);
  return r;
};

// ═══════════════ ฐานข้อมูล: ล้าง ═══════════════
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
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d10-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const parkOutbox = async (tids: string[]) => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tids); };

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
const SYNC_MS = 13_000;
async function fanout(op: string, groups: Any[][], at: number): Promise<Any[]> {
  const outs = await Promise.all(groups.map((items) => new Promise<Any[]>((resolve) => {
    const job = { op, items, at };
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? (JSON.parse(m[1]) as Any[]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); }
      catch { resolve(items.map(() => ({ childFail: "อ่านผลลูกไม่ได้" }))); }
    });
  })));
  return outs.flat();
}
const atIn = (ms = SYNC_MS) => Date.now() + ms;
const inProcAt = async <T,>(at: number, calls: (() => Promise<T>)[]) => { const w = at - Date.now(); if (w > 0) await sleep(w); return Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) } as Any; } })); };
const badOf = (rs: Any[]) => rs.filter((r) => r?.threw || r?.childFail || /P2028|P2024|P2002|40P01|Unique constraint/i.test(J(r)));

// ═══════════════ ฉาก (วันที่ตายตัว) ═══════════════
const P1 = "2026-10", P2 = "2026-11", P3 = "2026-12";
const NOW1 = "2026-09-25T03:00:00.000Z", NOW2 = "2026-10-25T03:00:00.000Z", NOW3 = "2026-11-25T03:00:00.000Z";
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const tenantIds: string[] = [];
const PHONES: string[] = [];
const NAMES: string[] = [];
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");
const ids: Record<string, string> = {};
const bills: Record<string, Any> = {};             // "L1:2026-11" → แถวบิล
const C: Record<string, { id: string; ext: string; partyId: string | null; conn: string }> = {};
const HELD: Record<string, string> = {};          // ชื่อ → slipId ที่ควรถูกพัก

console.log(`\n(ตัวจำลอง LINE ${FAKE_BASE} · APP_URL ${ORIGIN})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d10-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const NEW_FILES = [F.pay, F.balance, F.page, F.actions, F.comp, F.scene];
  await st("S-3", "มีไฟล์ใหม่ของใบครบ 6 ไฟล์ (§1)", () => { const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade: dorm-pay 11 ชื่อ + DORM_PAY_NF · balance.billBalances · dorm index export billBalances", () => {
    const P = ["DORM_PAY_NF", "onDormSlipApproved", "reviewDormSlip", "resolveHeldSlip", "recordDormPayment", "voidDormReceipt", "dormBillReceipts", "dormPaymentsModel", "stashChatSlip", "attachChatSlip", "dismissChatSlip"];
    const mp = P.filter((n) => payL.mod?.[n] === undefined);
    ok(!mp.length, `dorm-pay ขาด ${mp.join(",")} (${payL.err || "โหลดได้"})`);
    ok(typeof balL.mod?.billBalances === "function", `balance.ts ไม่มี billBalances (${balL.err || "โหลดได้"})`);
    ok(typeof DORM?.billBalances === "function", "@/lib/modules/dorm ไม่ export billBalances");
  });
  await st("S-5", "outbox: payment.slip.approved คง onDepositSlipApproved (B.8) + เพิ่ม dorm-pay.onDormSlipApproved · event ใหม่ dorm.bill.paid / dorm.bill.partially_paid ลง 3 ทะเบียน (ป้ายไทย)", () => {
    const s = stripComments(read(F.consumers));
    const i = s.search(/["']payment\.slip\.approved["']\s*:/);
    ok(i >= 0, "ไม่มี consumer payment.slip.approved");
    const blk = s.slice(i, i + 700);
    ok(/onDepositSlipApproved/.test(blk), "บล็อกไม่มี onDepositSlipApproved ของ B.8 แล้ว");
    ok(/import\(\s*["']@\/lib\/platform\/dorm-pay["']\s*\)/.test(blk) && /onDormSlipApproved\s*\(/.test(blk), `บล็อกไม่เรียก dorm-pay.onDormSlipApproved: ${blk.slice(0, 220).replace(/\s+/g, " ")}`);
    const al = read(F.autoLabels), hl = read(F.hookLabels);
    const bad: string[] = [];
    for (const ev of ["dorm.bill.paid", "dorm.bill.partially_paid"]) {
      if (!new RegExp(`["']${ev.replace(/\./g, "\\.")}["']\\s*:`).test(s)) bad.push(`consumer ${ev}`);
      const m = new RegExp(`value:\\s*["']${ev.replace(/\./g, "\\.")}["'],\\s*label:\\s*["']([^"']+)["']`).exec(al);
      if (!m || !THAI.test(m[1])) bad.push(`automation label ${ev}`);
      if (!al.includes(ev) && !hl.includes(ev)) bad.push(`webhook label ${ev}`);
    }
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-6", "ค่าตั้งใหม่ (ป้ายไทย · ชั้น UNIT · ค่าเริ่ม/ช่วง) + แม่แบบ slipRejected/payMore · dorm-pay อ่านค่าตั้งจากทะเบียน (ไม่ฝังนโยบาย)", () => {
    const want: [string, string, unknown, unknown[], unknown[]][] = [
      ["rooms.payment.afterPaidSlip", "enum", "REVIEW", ["REVIEW", "CREDIT"], ["AUTO", 1]],
      ["rooms.payment.notifyReceipt", "bool", true, [true, false], ["x"]],
      ["rooms.payment.chatSlipKeepDays", "days", 30, [1, 90], [0, 91, 1.5]],
    ];
    const bad: string[] = [];
    for (const [k, ty, fb, good, no] of want) {
      const d = SET?.getDef?.(k);
      if (!d) { bad.push(`${k} ไม่มี`); continue; }
      if (d.type !== ty || !THAI.test(d.labelTh ?? "") || !(d.chain as string[]).includes("UNIT") || !isDeepStrictEqual(d.defaults?._fallback, fb)) bad.push(`${k} ${J({ ty: d.type, fb: d.defaults?._fallback })}`);
      for (const v of good) if (d.schema?.safeParse?.(v)?.success !== true) bad.push(`${k} ไม่รับ ${J(v)}`);
      for (const v of no) if (d.schema?.safeParse?.(v)?.success === true) bad.push(`${k} รับ ${J(v)}`);
    }
    for (const k of ["rooms.msg.slipRejected", "rooms.msg.payMore"]) {
      const d = SET?.getDef?.(k);
      if (!d || d.type !== "template" || !THAI.test(d.labelTh ?? "") || !THAI.test(J(d.defaults?._fallback))) { bad.push(`${k} ไม่มี/ไม่ใช่แม่แบบไทย`); continue; }
      if (LEGAL_BAD.test(J(d.defaults?._fallback))) bad.push(`${k} มีคำต้องห้าม`);
      if (!J(d.defaults?._fallback).includes("{amount}") || !J(d.defaults?._fallback).includes("{payLink}")) bad.push(`${k} ไม่มี {amount}/{payLink}`);
    }
    const ps = stripComments(read(F.pay));
    for (const k of ["rooms.payment.afterPaidSlip", "rooms.payment.notifyReceipt", "rooms.payment.partial"]) if (!ps.includes(k)) bad.push(`dorm-pay ไม่อ่าน ${k}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-7", "เงินผ่าน facade บัญชีเท่านั้น: dorm-pay/balance ไม่เขียนตารางบัญชีตรง · ไม่ import prisma ดิบ · ไม่ Promise.all รอบ recordExternalPayment · LINE ผ่าน notifyCustomer · สลิปผ่าน decideSlip/submitSlip", () => {
    const ps = stripComments(read(F.pay)), bs = stripComments(read(F.balance));
    ok(ps && bs, "ยังไม่มีไฟล์");
    const bad: string[] = [];
    for (const [n, s] of [["dorm-pay", ps], ["balance", bs]] as const) {
      if (/\.(accountDocumentPayment|accountJournalEntry|accountJournalLine|accountDocument)\.(create|update|upsert|delete)/.test(s)) bad.push(`${n} เขียนตารางบัญชีตรง`);
      if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(s)) bad.push(`${n} import prisma ดิบ`);
      if (/\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyLineMessages)\b|api(-data)?\.line\.me/.test(s)) bad.push(`${n} ส่ง LINE ตรง`);
    }
    if (/Promise\.(all|allSettled)\s*\([\s\S]{0,500}?recordExternalPayment/.test(ps)) bad.push("Promise.all รอบ recordExternalPayment");
    for (const [re, n] of [[/recordExternalPayment\s*\(/, "recordExternalPayment"], [/notifyCustomer\s*\(/, "notifyCustomer"], [/decideSlip\s*\(/, "decideSlip"], [/submitSlip\s*\(/, "submitSlip"], [/billBalances\s*\(/, "billBalances"]] as const) if (!re.test(ps)) bad.push(`dorm-pay ไม่เรียก ${n}`);
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-8", "actions.ts: 'use server' · export async function เท่านั้น · เรียกฟังก์ชันของ dorm-pay · ไม่รับ tenantId/ยอดคาดหวัง/ยอดค้างจากฟอร์ม · ไม่ส่ง deps · page ใช้ dormPaymentsModel + notFound + force-dynamic", () => {
    const a = read(F.actions), p = stripComments(read(F.page));
    ok(a && p, "ยังไม่มีไฟล์หน้า/actions");
    ok(/^\s*["']use server["']/.test(a), "ไม่มี use server บรรทัดแรก");
    const code = stripComments(a);
    ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
    for (const n of ["reviewDormSlip", "recordDormPayment", "voidDormReceipt", "resolveHeldSlip", "attachChatSlip", "dismissChatSlip"]) ok(new RegExp(`\\b${n}\\s*\\(`).test(code), `actions ไม่เรียก ${n}`);
    ok(!/get\(\s*["'](tenantId|expectedSatang|dueSatang|outstandingSatang|unitTenant)["']\s*\)/.test(code), "อ่าน tenantId/ยอดคาดหวังจากฟอร์ม");
    ok(!/\bdeps\s*:|\bput\s*:|\bpolicy\s*:/.test(code), "ส่ง deps/policy จาก action");
    ok(/dormPaymentsModel\s*\(/.test(p) && /notFound\s*\(/.test(p) && /force-dynamic/.test(p), "page ไม่ใช้ dormPaymentsModel/notFound/force-dynamic");
    ok(!/^\s*["']use client["']/.test(read(F.page)), "page เป็น use client");
  }, "MAJOR");
  await st("S-9", "DormPayments.tsx: 'use client' บรรทัดแรก · default export · ไม่ import โมดูล server/next/* (import type ได้)", () => {
    const s = read(F.comp);
    ok(s, `ยังไม่มี ${F.comp}`);
    ok(/^\s*["']use client["']/.test(s), "ไม่มี use client");
    const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const bad = imps.filter((x) => /^@prisma\//.test(x) || /^@\/lib\/(modules|platform|core\/db|core\/settings|payment|storage)/.test(x) || /^next\//.test(x) || /actions$/.test(x));
    ok(!bad.length, `import ต้องห้าม ${bad.join(", ")}`);
    ok(/export\s+default\b/.test(s), "ไม่มี default export");
  }, "MAJOR");
  await st("S-10", "ไม่มี any · ไม่มี getDay/getDate/getMonth/getHours/getFullYear ดิบ · ไม่มีคำต้องห้าม สคบ. ในไฟล์ใหม่", () => {
    const files = [F.pay, F.balance, F.page, F.actions, F.comp];
    const miss = files.filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ยังไม่มี ${miss.join(", ")}`);
    const anyUse = files.filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const raw = files.filter((f) => /\.(getDay|getDate|getMonth|getHours|getFullYear)\s*\(\s*\)/.test(stripComments(read(f))));
    const legal = files.filter((f) => LEGAL_BAD.test(stripComments(read(f))));
    ok(!anyUse.length && !raw.length && !legal.length, `any=${anyUse.join(",") || "—"} เวลาเครื่อง=${raw.join(",") || "—"} คำต้องห้าม=${legal.join(",") || "—"}`);
  }, "MAJOR");
  await st("S-13", "(ผู้เขียนข้อสอบตั้งแล้ว) SQC_VISUAL_SPECS d.10 = จอ /dorm/payments?room=206 · SQC_DORM_PAY_SCENE ครบ 3 สลิป", () => {
    const sp = SQC_VISUAL_SPECS["d.10"];
    ok(Array.isArray(sp) && sp.length === 1 && sp[0].path.endsWith(`/dorm/payments?room=${SQC_DORM_PAY_SCENE.panelRoom}`), J(sp));
    eq(Object.keys(SQC_DORM_PAY_SCENE.slips).sort(), ["104", "206", "309"], "ห้องสลิป");
  }, "MINOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D10 ${tag}`, slug: `qc-svc-d10-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  ids.A = A; ids.B = B;
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUnit = async (tenantId: string, tag: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name, slug: `d10${tag}-${STAMP}` } })).id as string;
  const linkBook = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d10-${STAMP}-${key}@shark.local`, name: `QC D10 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d10" } });
  };
  const unsetVal = (tenantId: string, key: string, scopeId: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkParty = async (tenantId: string, name: string) => { NAMES.push(name); return (await prisma.party.create({ data: { tenantId, name, phone: newPhone() } })).id as string; };
  const mkRoomSet = async (tenantId: string, unitId: string, numbers: string[]) => {
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
    const b = (await prisma.roomBuilding.create({ data: { tenantId, unitId, name: "อาคาร ทดสอบ", floors: 3, sortOrder: 1 } })).id as string;
    const R: Record<string, string> = {};
    for (const n of numbers) R[n] = (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: ty, number: n, buildingId: b, floorNo: Number(n[0]), floor: n[0] } })).id as string;
    return { ty, R };
  };
  const mkLease = async (tenantId: string, unitId: string, roomId: string, roomTypeId: string, partyId: string) => {
    const snap = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId, roomId });
    const l = await prisma.dormLease.create({ data: {
      tenantId, unitId, roomId, partyId, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
      rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, coTenants: { occupants: [], vehicles: [] },
      policySnapshot: snap, signedAt: new Date(), createdById: "qc-d10", moveInPhotos: [] as Any, signatureFileId: null,
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    return l.id as string;
  };
  const mkFile = async (tenantId: string) => (await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path: `t/${tenantId}/private/qc-d10-${randomBytes(6).toString("hex")}.png`, cdnUrl: "private://qc-d10", contentType: "image/png", bytes: 64 } })).id as string;
  const billOf = async (leaseId: string, periodKey: string): Promise<Any> => prisma.dormBill.findFirst({ where: { leaseId, periodKey } });
  const sendAll = async (ctx: Any, unitId: string, runId: string, now: string) => { let last: Any = null; for (let i = 0; i < 40; i++) { last = await DORM.sendBillRun(ctx, { unitId, runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; } return last; };
  const runPeriod = async (ctx: Any, unitId: string, periodKey: string, now: string) => {
    const r = await DORM.prepareBillRun(ctx, { unitId, periodKey }, { now: new Date(now) });
    const s = r?.ok ? await sendAll(ctx, unitId, r.runId, now) : null;
    await parkOutbox(tenantIds);
    return { r, s };
  };
  let payN = 0;
  const pay = async (unitId: string, tenantId: string, bill: Any, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment({ tenantId, unitId, docId: bill.accountDocumentId, amountSatang: amount, idempotencyKey: `qc-d10-${STAMP}-fx${++payN}`, paidAt: new Date(`${ymd}T05:00:00.000Z`) });
    if (!r?.ok) throw new Error(`fixture รับชำระ: ${r?.code} ${r?.reason ?? ""}`);
    return r;
  };

  const LEASES_DA = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12", "L13", "L14", "L15", "L16", "L17", "L18", "L19", "L20"];
  try {
    const BOOK_A = await mkBook(A, `บัญชีหอ D10 A ${STAMP}`), BOOK_B = await mkBook(B, `บัญชีหอ D10 B ${STAMP}`);
    const DA = await mkUnit(A, "a", "หอดีสิบเอ"), DC = await mkUnit(A, "c", "หอดีสิบยกยอด"), DK = await mkUnit(A, "k", "หอดีสิบคิว"), DN = await mkUnit(A, "n", "หอดีสิบอื่น"), DB = await mkUnit(B, "b", "หอดีสิบบี");
    Object.assign(ids, { DA, DC, DK, DN, DB, BOOK_A, BOOK_B });
    for (const [t, bk, u] of [[A, BOOK_A, DA], [A, BOOK_A, DC], [A, BOOK_A, DK], [A, BOOK_A, DN], [B, BOOK_B, DB]] as const) {
      await linkBook(t, bk, u);
      await setVal(t, "rooms.utility.elec.metering", u, "NONE");
      await setVal(t, "rooms.utility.water.metering", u, "NONE");
      await setVal(t, "messaging.quietHours", u, null);
      await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
      await setVal(t, "rooms.lateFee.autoCharge", u, false);
      await setVal(t, "payments.receiver", u, { promptpayId: "0812345678", displayName: "หอดีสิบ" });
    }
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    ids.REV = await mkUser("rev", A, "STAFF", [DA, DC, DK], ["dorm.view", "dorm.slip.review"]);
    ids.CASH = await mkUser("cash", A, "STAFF", [DA, DC, DK], ["dorm.view", "dorm.payment.manual"]);
    ids.VIEW = await mkUser("view", A, "STAFF", [DA, DK], ["dorm.view"]);
    ids.PAYREV = await mkUser("payrev", A, "STAFF", [DA, DK], ["dorm.view", "payments.slip.review"]);
    // LINE OA (ตัวจำลอง): OA1 = หน่วย DA · OAK = หน่วย DK · OA2 = OA อื่นของร้าน A (ไม่ผูกหน่วย)
    const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `qc-d10-chat-${STAMP}` } })).id;
    const RAND = randomBytes(3).toString("hex");
    const mkConn = async (tag: string) =>
      (await prisma.chatChannelConnection.create({ data: { tenantId: A, systemId: sysA, type: "LINE", displayName: `qc-d10-${tag}-${STAMP}`, externalAccountId: `qc-d10-${tag}-${STAMP}`, credentials: { channelAccessToken: `qcd10tok${tag}${RAND}`, channelSecret: `qcd10sec${tag}${RAND}` }, meta: { basicId: `@qcd10${tag}` } } })).id as string;
    ids.OA1 = await mkConn("a1"); ids.OAK = await mkConn("k"); ids.OA2 = await mkConn("a2");
    ids.TOK1 = `Bearer qcd10toka1${RAND}`; ids.TOKK = `Bearer qcd10tokk${RAND}`; ids.TOK2 = `Bearer qcd10toka2${RAND}`;
    await setVal(A, "messaging.lineConnectionId", DA, ids.OA1);
    await setVal(A, "messaging.lineConnectionId", DK, ids.OAK);
    // ห้อง/ผู้เช่า/สัญญา
    const RA = await mkRoomSet(A, DA, LEASES_DA.map((_, i) => String(101 + i)));
    const RC = await mkRoomSet(A, DC, ["201"]);
    const RK = await mkRoomSet(A, DK, ["301", "302", "303", "304"]);
    const RN = await mkRoomSet(A, DN, ["401"]);
    const RB = await mkRoomSet(B, DB, ["101"]);
    const SUR = ["ใจดี", "ดีสิบ", "มั่นคง", "รุ่งเรือง", "สุขใจ"];
    for (const [i, k] of LEASES_DA.entries()) {
      ids[`P_${k}`] = await mkParty(A, `ผู้เช่า${k} ${SUR[i % SUR.length]}${i}`);
      ids[k] = await mkLease(A, DA, RA.R[String(101 + i)], RA.ty, ids[`P_${k}`]);
    }
    ids.P_C1 = await mkParty(A, "ยกยอด ทดสอบหนึ่ง"); ids.C1 = await mkLease(A, DC, RC.R["201"], RC.ty, ids.P_C1);
    for (const [i, k] of ["K1", "K2", "K3", "K4"].entries()) { ids[`P_${k}`] = await mkParty(A, `คิว${k} นามสกุลคิว${i}`); ids[k] = await mkLease(A, DK, RK.R[String(301 + i)], RK.ty, ids[`P_${k}`]); }
    ids.P_N1 = await mkParty(A, "หน่วยอื่น ทดสอบ"); ids.N1 = await mkLease(A, DN, RN.R["401"], RN.ty, ids.P_N1);
    ids.P_B1 = await mkParty(B, "ร้านบี ผู้เช่า"); ids.B1 = await mkLease(B, DB, RB.R["101"], RB.ty, ids.P_B1);
    ids.P_X = await mkParty(A, "คนนอก ไม่เช่า");
    // ผู้ติดต่อ LINE (ผู้รับข้อความ)
    const mkContact = async (key: string, conn: string, partyId: string | null) => {
      const ext = `Uqcd10${key}${RAND}`;
      const row = await prisma.chatContact.create({ data: { tenantId: A, systemId: sysA, channel: "LINE", channelConnectionId: conn, externalUserId: ext, partyId, lang: "th" } });
      C[key] = { id: row.id, ext, partyId, conn };
    };
    for (const k of ["L1", "L3", "L6", "L7", "L8", "L11", "L20"]) await mkContact(k, ids.OA1, ids[`P_${k}`]);
    await mkContact("L1b", ids.OA2, ids.P_L1);
    await mkContact("K4", ids.OAK, ids.P_K4); await mkContact("K3", ids.OAK, ids.P_K3); await mkContact("KX", ids.OAK, ids.P_X);
    // รอบ ต.ค. + พ.ย. (D.8 จริง) · จ่าย ต.ค. ทุกใบยกเว้น K4
    const cO = { tenantId: A, actorUserId: ids.OWN }, cB = { tenantId: B, actorUserId: ids.OWNB };
    const runs: Any[] = [];
    for (const u of [DA, DC, DK, DN]) runs.push(await runPeriod(cO, u, P1, NOW1));
    runs.push(await runPeriod(cB, DB, P1, NOW1));
    const allA = [...LEASES_DA, "C1", "K1", "K2", "K3", "K4", "N1"];
    for (const k of allA) bills[`${k}:${P1}`] = await billOf(ids[k], P1);
    bills[`B1:${P1}`] = await billOf(ids.B1, P1);
    for (const k of allA) if (k !== "K4" && bills[`${k}:${P1}`]?.accountDocumentId) await pay(k.startsWith("C") ? DC : k.startsWith("K") ? DK : k.startsWith("N") ? DN : DA, A, bills[`${k}:${P1}`], BASE, "2026-10-04");
    await pay(DB, B, bills[`B1:${P1}`], BASE, "2026-10-04");
    for (const u of [DA, DC, DK, DN]) runs.push(await runPeriod(cO, u, P2, NOW2));
    runs.push(await runPeriod(cB, DB, P2, NOW2));
    for (const k of allA) { bills[`${k}:${P1}`] = await billOf(ids[k], P1); bills[`${k}:${P2}`] = await billOf(ids[k], P2); }
    bills[`B1:${P2}`] = await billOf(ids.B1, P2);
    const sentOk = (k: string) => bills[k]?.status && ["SENT", "PARTIALLY_PAID", "PAID"].includes(bills[k].status) && !!bills[k].accountDocumentId && bills[k].totalSatang === BASE;
    const want = [...allA.map((k) => `${k}:${P2}`), "K4:2026-10", "B1:2026-11"];
    const bad = want.filter((k) => !sentOk(k));
    await st("PC-1", `ฉากเงินผ่าน D.8 (หน่วยไม่มีน้ำไฟ · บิลละ ฿4,800.00): รอบ ต.ค. + พ.ย. ของ 4 หน่วยร้าน A (${allA.length} สัญญา) + ร้าน B · จ่าย ต.ค. แล้วทุกใบยกเว้น K4`, () => {
      ok(!bad.length && runs.every((x) => x.s?.done), `ขาด ${bad.join(",")} · ${J(runs.map((x) => x.r?.code ?? x.s?.done))}`);
    });
    ready = !bad.length;
  } catch (e) {
    record("PC-1", "ฉากเงินผ่าน D.8", "FAIL", `สร้างฉากไม่ได้: ${errMsg(e)}`, "CRITICAL");
  }
  const { DA, DC, DK, DN, DB } = ids;
  const cO = { tenantId: A, actorUserId: ids.OWN }, cR = { tenantId: A, actorUserId: ids.REV }, cC = { tenantId: A, actorUserId: ids.CASH };
  const cV = { tenantId: A, actorUserId: ids.VIEW }, cP = { tenantId: A, actorUserId: ids.PAYREV }, cOB = { tenantId: B, actorUserId: ids.OWNB };
  const bl = (k: string): Any => bills[k] ?? {};
  const fresh = async (k: string): Promise<Any> => (bills[k] = await prisma.dormBill.findFirst({ where: { id: bl(k).id } }));

  // ── ตัวช่วยของข้อสอบ ──
  let slipN = 0;
  type SlipOpt = { tenantId?: string; unitId?: string; amount: number | null; status?: "NEEDS_REVIEW" | "AUTO_APPROVED" | "PENDING"; reasons?: string[]; transRef?: string | null; expected?: number; partyKey?: string };
  const mkSlip = async (k: string, o: SlipOpt): Promise<Any> => {
    const n = ++slipN;
    const tenantId = o.tenantId ?? A;
    const b = bl(k);
    const unitId = o.unitId ?? b.unitId;
    const s = await prisma.paymentSlip.create({ data: {
      tenantId, unitId, domain: "DORM", refType: "DORM_BILL", refId: b.id, partyId: b.partyId, fileId: await mkFile(tenantId),
      imageHash: sha(`qc-d10-${STAMP}-img-${n}`), transRef: o.transRef === undefined ? `QCD10${STAMP.toUpperCase()}T${n}` : o.transRef,
      expectedSatang: o.expected ?? BASE, amountSatang: o.amount, payerName: "ผู้โ***", bankCode: "004", transferredAt: new Date(Date.now() - 3_600_000),
      checks: { idempotencyKey: `qcd10-${STAMP}-${n}` }, status: o.status ?? "NEEDS_REVIEW", reviewReason: o.reasons?.length ? o.reasons.join(",") : null,
    } });
    return s;
  };
  const evtOf = (s: Any, over: Record<string, unknown> = {}) => ({
    id: `qc-d10-evt-${s.id}`, tenantId: s.tenantId, unitId: s.unitId, type: "payment.slip.approved", systemId: null,
    payload: { slipId: s.id, domain: "DORM", refType: "DORM_BILL", refId: s.refId, amountSatang: s.amountSatang ?? s.expectedSatang, status: s.status }, ...over,
  });
  const docsOfBill = async (b: Any): Promise<string[]> => {
    if (!b?.accountDocumentId) return [];
    const dn = await prisma.accountDocument.findMany({ where: { tenantId: b.tenantId, sourceDocId: b.accountDocumentId, docType: "DEBIT_NOTE" }, select: { id: true } });
    return [b.accountDocumentId, ...dn.map((d: Any) => d.id)];
  };
  const paidOn = async (b: Any): Promise<number> => {
    const docs = await docsOfBill(b);
    if (!docs.length) return 0;
    const r = await prisma.accountDocumentPayment.aggregate({ where: { tenantId: b.tenantId, documentId: { in: docs }, voidedAt: null }, _sum: { amount: true } });
    return Number(r._sum.amount ?? 0);
  };
  const receiptsAll = async (tenantId = A): Promise<Any[]> => prisma.accountDocument.findMany({ where: { tenantId, docType: "RECEIPT", source: "DORM" }, select: { id: true, docNo: true, status: true, grandTotal: true, refType: true, refId: true }, orderBy: { createdAt: "asc" } });
  const viewsOf = async (k: string, ctx: Any = cO): Promise<Any[]> => { const r = await PAY.receipts()(ctx, { unitId: bl(k).unitId, billId: bl(k).id }); ok(Array.isArray(r), `dormBillReceipts ได้ ${fmt(r)}`); return r; };
  const live = (vs: Any[]) => vs.filter((v) => v.status === "ISSUED");
  type GlSnap = { net: Map<string, number>; entries: number; reversals: number; unbalanced: string[]; income: number };
  const gl = async (tenantId = A): Promise<GlSnap> => {
    const ls: Any[] = await prisma.accountJournalLine.findMany({ where: { tenantId }, select: { entryId: true, debit: true, credit: true, account: { select: { code: true, type: true } } } });
    const net = new Map<string, number>(), per = new Map<string, number>();
    let income = 0;
    for (const l of ls) {
      net.set(l.account.code, (net.get(l.account.code) ?? 0) + l.debit - l.credit);
      per.set(l.entryId, (per.get(l.entryId) ?? 0) + l.debit - l.credit);
      if (l.account.type === "INCOME") income += l.credit - l.debit;
    }
    const entries = await prisma.accountJournalEntry.count({ where: { tenantId } });
    const reversals = await prisma.accountJournalEntry.count({ where: { tenantId, reversalOfId: { not: null } } });
    return { net, entries, reversals, unbalanced: [...per].filter(([, v]) => v !== 0).map(([k]) => k), income };
  };
  const d = (a: GlSnap, b: GlSnap, code: string) => (b.net.get(code) ?? 0) - (a.net.get(code) ?? 0);
  const billEvents = async (billId: string) => prisma.outboxEvent.findMany({ where: { tenantId: A, type: { in: ["dorm.bill.paid", "dorm.bill.partially_paid"] }, payload: { path: ["billId"], equals: billId } }, select: { type: true, payload: true, idempotencyKey: true } });
  const sameNF = (rs: Any[], what: string) => {
    const nf = PAY.NF();
    ok(rs.every((r) => r?.ok === false && r.code === "NOT_FOUND" && r.reason === nf), `${what}: ${fmt(rs)}`);
    eq(new Set(rs.map((r) => J(r))).size, 1, `${what}: เนื้อคำตอบต่างกัน`);
  };
  const portalOut = async (leaseId: string, billId?: string): Promise<Any> => {
    const load = PORTAL?.loadPortal;
    ok(typeof load === "function", "ไม่มี dorm-portal.loadPortal (D.9)");
    const tok = SL.signLink({ tenantId: A, purpose: "dorm.portal", subjectId: leaseId, expMin: 30 });
    const v = await load(tok, { bill: billId ?? null }, { clientKey: `qc-d10-${STAMP}-${randomBytes(3).toString("hex")}` });
    ok(v?.bill, `loadPortal ได้ ${fmt(v)}`);
    return v;
  };

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-2", "recordExternalPayment (D.2): คีย์เดิม = ผลเดิม · จ่ายเกิน ⇒ excess (Cr 2110) · บิล N1 พ.ย. (หน่วย DN)", async () => {
    needReady();
    const g0 = await gl();
    const inp = { tenantId: A, unitId: DN, docId: bl(`N1:${P2}`).accountDocumentId, amountSatang: BASE + 1_000, idempotencyKey: `qc-d10-${STAMP}-pc2`, paidAt: new Date("2026-11-03T05:00:00Z") };
    const a = await ACC.recordExternalPayment(inp), b = await ACC.recordExternalPayment(inp);
    ok(a?.ok && b?.ok && b.duplicate && a.appliedSatang === BASE && a.excessSatang === 1_000, `${fmt(a)} ${fmt(b)}`);
    const g1 = await gl();
    eq([d(g0, g1, "1100"), d(g0, g1, "2110"), g1.unbalanced.length], [-BASE, -1_000, 0], "GL");
  });
  await st("PC-3", "decideSlip (R0.6): OWNER อนุมัติสลิป NEEDS_REVIEW (หน่วย DN) ⇒ APPROVED + outbox payment.slip.approved 1 แถว (payload slipId)", async () => {
    needReady();
    const s = await mkSlip(`N1:${P2}`, { amount: BASE, unitId: DN });
    const r = await SLIP.decideSlip({ userId: ids.OWN }, { tenantId: A }, s.id, { decision: "APPROVE", reason: "ตัวควบคุม" });
    ok(r?.ok && r.status === "APPROVED", fmt(r));
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: A, type: "payment.slip.approved", payload: { path: ["slipId"], equals: s.id } } });
    eq(ev.length, 1, "event");
    ids.PC3_SLIP = s.id;
  });
  await st("PC-4", "ใบลด/เพิ่มหนี้ D.8 (adjustSentBill) ออกได้บนบิลที่ส่งแล้ว (ใช้ในฉาก B/C)", async () => {
    needReady();
    const cr = await DORM.adjustSentBill(cO, { unitId: DA, billId: bl(`L4:${P2}`).id, kind: "CREDIT", reason: "ยกเว้นส่วนต่างตามที่อนุมัติ", idempotencyKey: `qcd10-${STAMP}-cr4`, lines: [{ code: "OTHER", labelTh: "ส่วนลดพิเศษ", amountSatang: 30_000 }] });
    const db = await DORM.adjustSentBill(cO, { unitId: DA, billId: bl(`L5:${P2}`).id, kind: "DEBIT", reason: "ค่าซ่อมที่ผู้เช่าตกลง", idempotencyKey: `qcd10-${STAMP}-db5`, lines: [{ code: "OTHER", labelTh: "ค่าซ่อมก๊อกน้ำ", amountSatang: 25_000 }] });
    ok(cr?.ok && db?.ok, `${fmt(cr)} ${fmt(db)}`);
    eq(await prisma.accountDocument.count({ where: { tenantId: A, sourceDocId: bl(`L5:${P2}`).accountDocumentId, docType: "DEBIT_NOTE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } } }), 1, "ใบเพิ่มหนี้ L5");
  });
  await st("PC-5", "แม่แบบ rooms.msg.receipt มีอยู่ (ตัวแปร amount · receiptLink) · consumer payment.slip.approved ของ B.8 กับสลิปหอ = ไม่ทำอะไร ไม่ throw", async () => {
    const dRc = SET?.getDef?.("rooms.msg.receipt");
    ok(dRc && J(dRc.defaults?._fallback).includes("{amount}") && J(dRc.defaults?._fallback).includes("{receiptLink}"), "แม่แบบใบเสร็จ");
    needReady();
    const dep = (await tryImport("@/lib/modules/booking/deposit")).mod as Any;
    await dep.onDepositSlipApproved({ tenantId: A, unitId: DN, payload: { slipId: ids.PC3_SLIP } });
  }, "MAJOR");

  // ═══════════════ B ยอดนิยามเดียว (A11) ═══════════════
  console.log("\n── B ยอดนิยามเดียว ──");
  await st("B-1", "A11: บิล L5 พ.ย. + ใบเพิ่มหนี้ ฿250.00 ⇒ billBalances {invoice.open 480,000 · debit.open 25,000 · own = due = 505,000} = outstandingMany (D.11) = พอร์ทัล (D.9 outstanding + QR)", async () => {
    needReady();
    const b = bl(`L5:${P2}`);
    const m = await balances(A, [b.id]);
    const x = m.get(b.id);
    ok(x, "ไม่มีผลของบิล");
    eq([x.invoice?.docId, x.invoice?.openSatang, x.debitNotes.map((n: Any) => n.openSatang), x.ownOutstandingSatang, x.dueSatang, x.carriedIn, x.carriedOutSatang], [b.accountDocumentId, BASE, [25_000], 505_000, 505_000, [], 0], "ยอด");
    const om = await LF.outstandingMany(A, [b]);
    eq(om.get(b.id), 505_000, "outstandingMany (D.11)");
    const v = await portalOut(ids.L5, b.id);
    eq([v.bill.outstandingSatang, v.pay?.amountSatang], [505_000, 505_000], "พอร์ทัล");
  });
  await st("B-2", "ใบลดหนี้ (เช่น ยกเว้นค่าปรับ) ฿300.00 บนบิล L4 ⇒ due 450,000 ทุกที่ (billBalances · outstandingMany · พอร์ทัล QR)", async () => {
    needReady();
    const b = bl(`L4:${P2}`);
    const x = (await balances(A, [b.id])).get(b.id);
    eq([x?.invoice?.openSatang, x?.ownOutstandingSatang, x?.dueSatang], [450_000, 450_000, 450_000], "billBalances");
    eq((await LF.outstandingMany(A, [b])).get(b.id), 450_000, "outstandingMany");
    eq((await portalOut(ids.L4, b.id)).pay?.amountSatang, 450_000, "QR พอร์ทัล");
  });
  await st("B-3", "บิลจ่ายครบ (L1 ต.ค.) ⇒ due 0 · own 0 (ไม่ติดลบ)", async () => {
    needReady();
    const b = bl(`L1:${P1}`);
    const x = (await balances(A, [b.id])).get(b.id);
    eq([x?.dueSatang, x?.ownOutstandingSatang, x?.invoice?.openSatang], [0, 0, 0], "จ่ายครบ");
  }, "MAJOR");
  await st("B-4", "X1: billBalances(ร้าน B, [บิลของร้าน A]) ⇒ Map ว่าง · ขยะ ⇒ Map ว่าง (ไม่ throw)", async () => {
    needReady();
    const m = await balances(B, [bl(`L1:${P2}`).id, "nope", ""]);
    eq(m.size, 0, "ข้ามร้าน");
  });

  // ═══════════════ C consumer ═══════════════
  console.log("\n── C consumer สลิปอนุมัติ ──");
  await st("C-1", "สลิป AUTO_APPROVED ยอดตรง L1 พ.ย. ⇒ บิล PAID (paidSatang 480,000 · paidAt) · ใบเสร็จ RECEIPT 1 ใบ (docNo · allocations INVOICE 480,000 · credit 0) · GL Dr เงิน/Cr 1100 สมดุล ไม่มีรายได้/2110 · event dorm.bill.paid 1 · LINE ใบเสร็จ 1 ข้อความ (฿4,800.00) บน OA ของหน่วยเท่านั้น", async () => {
    needReady();
    const s = await mkSlip(`L1:${P2}`, { amount: BASE, status: "AUTO_APPROVED" });
    ids.C1_SLIP = s.id;
    const g0 = await gl(), r0 = (await receiptsAll()).length, m = mark();
    await PAY.consume()(evtOf(s));
    const b = await fresh(`L1:${P2}`);
    eq([b.status, b.paidSatang, !!b.paidAt], ["PAID", BASE, true], "บิล");
    eq(await paidOn(b), BASE, "รับชำระในบัญชี");
    const rs = await receiptsAll();
    eq(rs.length - r0, 1, "ใบเสร็จใหม่");
    const vs = await viewsOf(`L1:${P2}`);
    eq(vs.length, 1, "dormBillReceipts");
    const v = vs[0];
    ok(typeof v.docNo === "string" && v.docNo.length > 0 && v.slipId === s.id && v.status === "ISSUED" && ["PROMPTPAY", "TRANSFER"].includes(v.channel), `view ${fmt(v)}`);
    eq([v.amountSatang, v.creditSatang, v.allocations.map((a: Any) => [a.billId, a.kind, a.amountSatang])], [BASE, 0, [[b.id, "INVOICE", BASE]]], "ใบเสร็จ");
    ok(rs.some((x: Any) => x.id === v.receiptId && x.docNo === v.docNo), "receiptId/docNo ไม่ตรงเอกสารบัญชี");
    const g1 = await gl();
    eq([d(g0, g1, "1100"), d(g0, g1, "2110"), g1.unbalanced.length, g1.income - g0.income], [-BASE, 0, 0, 0], "GL");
    const ev = await billEvents(b.id);
    eq(ev.map((e: Any) => e.type), ["dorm.bill.paid"], "event");
    const ps = pushes(m);
    eq(ps.map((p) => [p.json?.to, p.auth]), [[C.L1.ext, ids.TOK1]], "push");
    ok(J(ps[0]?.json).includes("฿4,800.00"), "ข้อความไม่มียอด ฿4,800.00");
    eq(await prisma.serviceMessageLog.count({ where: { tenantId: A, dedupeKey: `rooms:receipt:${v.receiptId}` } }), 1, "log rooms:receipt:<receiptId>");
  });
  await st("C-2", "X4: consumer สลิปเดิมซ้ำ 3 ทางในโพรเซส + 2 โพรเซส × 3 ทางพร้อมกัน ⇒ ใบเสร็จยัง 1 · รับชำระยัง 480,000 · ไม่มี event/LINE ใหม่ · ไม่มี throw/P2002", async () => {
    needReady();
    ok(ids.C1_SLIP, "ต้องผ่าน C-1 ก่อน");
    const s = await prisma.paymentSlip.findFirst({ where: { id: ids.C1_SLIP } });
    const r0 = (await receiptsAll()).length, m = mark();
    const at = atIn();
    const [a, b] = await Promise.all([inProcAt(at, [0, 1, 2].map(() => async () => { await PAY.consume()(evtOf(s)); return { ok: true }; })), fanout("consume", [[0, 1, 2].map(() => ({ evt: evtOf(s) })), [0, 1, 2].map(() => ({ evt: evtOf(s) }))], at)]);
    eq(badOf([...a, ...b]), [], "ผิดปกติ");
    eq((await receiptsAll()).length - r0, 0, "ใบเสร็จใหม่");
    eq(await paidOn(bl(`L1:${P2}`)), BASE, "รับชำระ");
    eq((await billEvents(bl(`L1:${P2}`).id)).length, 1, "event");
    eq(pushes(m).length, 0, "push ใหม่");
  });
  await st("C-3", "ทางจริง: decideSlip (OWNER) บนสลิป L2 ⇒ แถว outbox ⇒ consumers['payment.slip.approved'] ⇒ บิล PAID + ใบเสร็จ 1 (B.8 ไม่ล้ม)", async () => {
    needReady();
    const s = await mkSlip(`L2:${P2}`, { amount: BASE });
    const r = await SLIP.decideSlip({ userId: ids.OWN }, { tenantId: A }, s.id, { decision: "APPROVE", reason: "ตรวจแล้ว" });
    ok(r?.ok, fmt(r));
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: A, type: "payment.slip.approved", payload: { path: ["slipId"], equals: s.id } } });
    ok(ev, "ไม่มี outbox");
    await OC.consumers["payment.slip.approved"](ev);
    const b = await fresh(`L2:${P2}`);
    eq([b.status, await paidOn(b), live(await viewsOf(`L2:${P2}`)).length], ["PAID", BASE, 1], "ผล");
    ids.C3_TRANSREF = s.transRef;
  });
  await st("C-4", "ไม่ลงเงิน: สลิป NEEDS_REVIEW (ยังไม่อนุมัติ) · event ที่ tenantId = ร้าน B แต่สลิปของร้าน A · สลิป REJECTED ⇒ ไม่มีรับชำระ/ใบเสร็จ/2110", async () => {
    needReady();
    const b = bl(`L13:${P2}`);
    const nr = await mkSlip(`L13:${P2}`, { amount: BASE });
    const au = await mkSlip(`L19:${P2}`, { amount: BASE, status: "AUTO_APPROVED" });
    const g0 = await gl(), r0 = (await receiptsAll()).length;
    await PAY.consume()(evtOf(nr));
    await PAY.consume()(evtOf(au, { tenantId: B }));
    await prisma.paymentSlip.update({ where: { id: au.id }, data: { status: "REJECTED" } });
    await PAY.consume()(evtOf(au));
    const g1 = await gl();
    eq([await paidOn(b), await paidOn(bl(`L19:${P2}`)), (await receiptsAll()).length - r0, d(g0, g1, "1100"), d(g0, g1, "2110")], [0, 0, 0, 0, 0], "ไม่มีเงิน");
    await prisma.paymentSlip.update({ where: { id: nr.id }, data: { status: "REJECTED" } }); // ปลด (ข้อ R ใช้สลิปของตัวเอง)
  });
  await st("C-5", "จ่ายเกิน: AUTO_APPROVED ฿5,000.00 บนบิล ฿4,800.00 (L3) · payload ยอดปลอม 1 สตางค์ (ใช้ยอดจากฐาน · V8) ⇒ PAID · ใบเสร็จ 500,000 (INVOICE 480,000 · credit 20,000) · GL Cr 2110 20,000 ไม่ใช่รายได้", async () => {
    needReady();
    const s = await mkSlip(`L3:${P2}`, { amount: 500_000, status: "AUTO_APPROVED" });
    ids.C5_SLIP = s.id;
    const g0 = await gl();
    await PAY.consume()(evtOf(s, { payload: { slipId: s.id, domain: "DORM", refType: "DORM_BILL", refId: s.refId, amountSatang: 1, status: "AUTO_APPROVED" } }));
    const b = await fresh(`L3:${P2}`);
    const v = live(await viewsOf(`L3:${P2}`))[0];
    eq([b.status, v?.amountSatang, v?.creditSatang, v?.allocations?.map((a: Any) => a.amountSatang)], ["PAID", 500_000, 20_000, [BASE]], "ผล");
    const g1 = await gl();
    eq([d(g0, g1, "1100"), d(g0, g1, "2110"), g1.unbalanced.length, g1.income - g0.income], [-BASE, -20_000, 0, 0], "GL");
    ids.C5_RECEIPT = v.receiptId;
  });
  await st("C-6", "ใบลดหนี้ ฿300 (L4 · ยกเว้น) ⇒ AUTO_APPROVED ฿4,500.00 = จ่ายครบพอดี · ไม่มี 2110 (ค่าที่ยกเว้นแล้วไม่ถูกเก็บ)", async () => {
    needReady();
    const s = await mkSlip(`L4:${P2}`, { amount: 450_000, expected: 450_000, status: "AUTO_APPROVED" });
    const g0 = await gl();
    await PAY.consume()(evtOf(s));
    const b = await fresh(`L4:${P2}`);
    const g1 = await gl();
    eq([b.status, d(g0, g1, "2110"), (await balances(A, [b.id])).get(b.id)?.dueSatang], ["PAID", 0, 0], "ผล");
  });
  await st("C-7", "ใบเพิ่มหนี้ (A11): AUTO_APPROVED ฿5,050.00 บน L5 ⇒ กระจาย INVOICE 480,000 → DEBIT_NOTE 25,000 (ลำดับ) · ใบเพิ่มหนี้จ่ายครบ · บิล PAID · credit 0", async () => {
    needReady();
    const s = await mkSlip(`L5:${P2}`, { amount: 505_000, expected: 505_000, status: "AUTO_APPROVED" });
    await PAY.consume()(evtOf(s));
    const b = await fresh(`L5:${P2}`);
    const v = live(await viewsOf(`L5:${P2}`))[0];
    eq([b.status, v?.allocations?.map((a: Any) => [a.kind, a.amountSatang]), v?.creditSatang, await paidOn(b)], ["PAID", [["INVOICE", BASE], ["DEBIT_NOTE", 25_000]], 0, 505_000], "ผล");
  });
  await st("C-8", "IP-1b: สลิป AUTO_APPROVED ใบที่ 2 บนบิลที่จ่ายครบแล้ว (L1) ค่าเริ่ม REVIEW ⇒ พัก: ไม่มีรับชำระ/ใบเสร็จ/2110 ใหม่ · replay ไม่เปลี่ยน", async () => {
    needReady();
    const s = await mkSlip(`L1:${P2}`, { amount: BASE, status: "AUTO_APPROVED" });
    HELD.afterPaid = s.id;
    const g0 = await gl(), r0 = (await receiptsAll()).length;
    await PAY.consume()(evtOf(s));
    await PAY.consume()(evtOf(s));
    const g1 = await gl();
    eq([await paidOn(bl(`L1:${P2}`)), (await receiptsAll()).length - r0, d(g0, g1, "2110"), d(g0, g1, "1010")], [BASE, 0, 0, 0], "ผล");
  });
  await st("C-9", "ค่าตั้ง rooms.payment.afterPaidSlip = CREDIT ⇒ สลิปหลังจ่ายครบ (L2) ลงทั้งก้อนเป็น 2110 + ใบเสร็จ (allocations ว่าง · credit 480,000)", async () => {
    needReady();
    await setVal(A, "rooms.payment.afterPaidSlip", DA, "CREDIT");
    try {
      const s = await mkSlip(`L2:${P2}`, { amount: BASE, status: "AUTO_APPROVED" });
      const g0 = await gl();
      await PAY.consume()(evtOf(s));
      const g1 = await gl();
      const v = live(await viewsOf(`L2:${P2}`)).find((x: Any) => x.slipId === s.id);
      eq([d(g0, g1, "2110"), d(g0, g1, "1100"), v?.allocations, v?.creditSatang], [-BASE, 0, [], BASE], "ผล");
    } finally { await unsetVal(A, "rooms.payment.afterPaidSlip", DA); }
  });
  await st("C-10", "บิล VOID (L14) ⇒ สลิป AUTO_APPROVED ไม่ลงเงิน (ใบแจ้งหนี้ไม่มีรับชำระ) · พัก", async () => {
    needReady();
    await prisma.dormBill.update({ where: { id: bl(`L14:${P2}`).id }, data: { status: "VOID" } });
    await fresh(`L14:${P2}`);
    const s = await mkSlip(`L14:${P2}`, { amount: BASE, status: "AUTO_APPROVED" });
    HELD.billVoid = s.id;
    const r0 = (await receiptsAll()).length;
    await PAY.consume()(evtOf(s));
    eq([await paidOn(bl(`L14:${P2}`)), (await receiptsAll()).length - r0], [0, 0], "ผล");
  });

  // ═══════════════ K-3 แถวพัก (ก่อนตัดสิน) ═══════════════
  await st("K-3", "คิวหน่วย DA: สลิปที่ถูกพักโผล่เป็น HELD (AFTER_PAID · BILL_VOID) actions = CREDIT/REFUND_DUE", async () => {
    needReady();
    const m = await PAY.model()(cR, { unitId: DA, periodKey: P2 });
    ok(m?.review, `model ${fmt(m)}`);
    const a = m.review.find((r: Any) => r.slipId === HELD.afterPaid), v = m.review.find((r: Any) => r.slipId === HELD.billVoid);
    eq([a?.status, a?.flags?.includes("AFTER_PAID"), [...(a?.actions ?? [])].sort(), v?.status, v?.flags?.includes("BILL_VOID")], ["HELD", true, ["CREDIT", "REFUND_DUE"], "HELD", true], "แถวพัก");
  });

  // ═══════════════ R ตัดสินมือ ═══════════════
  console.log("\n── R ตัดสินมือ ──");
  await st("R-1", "X1: ไม่มี dorm.slip.review (dorm.view · payments.slip.review อย่างเดียว) · หน่วยที่ไม่ได้คุม (DN) · ร้าน B · id ขยะ ⇒ NOT_FOUND เนื้อเดียวกันทุกไบต์ · สลิปไม่เปลี่ยน", async () => {
    needReady();
    const s6 = await mkSlip(`L6:${P2}`, { amount: BASE, reasons: ["PAYER_NAME_MISMATCH"] });
    const sN = await mkSlip(`N1:${P2}`, { amount: BASE, unitId: DN, transRef: null });
    ids.R2_SLIP = s6.id;
    const inp = (id: string) => ({ slipId: id, action: "APPROVE", reason: "ทดสอบสิทธิ์" });
    const rs = [await PAY.review()(cV, inp(s6.id)), await PAY.review()(cP, inp(s6.id)), await PAY.review()(cR, inp(sN.id)), await PAY.review()(cOB, inp(s6.id)), await PAY.review()(cR, inp("nope-xyz")), await PAY.resolve()(cV, { slipId: HELD.afterPaid, action: "CREDIT", reason: "x" })];
    sameNF(rs, "ผล");
    eq((await prisma.paymentSlip.findMany({ where: { id: { in: [s6.id, sN.id] } }, select: { status: true } })).map((x: Any) => x.status), ["NEEDS_REVIEW", "NEEDS_REVIEW"], "สถานะสลิป");
  });
  await st("R-2", "ชื่อผู้โอนไม่ตรง (L6): ผู้มี dorm.slip.review อย่างเดียว (ไม่มี payments.slip.review) อนุมัติ \"ญาติจ่ายแทน\" ⇒ APPROVED · ใบเสร็จ 480,000 · บิล PAID · consumer มาทีหลัง = ไม่มีอะไรเพิ่ม", async () => {
    needReady();
    ok(ids.R2_SLIP, "ต้องผ่าน R-1 ก่อน");
    const r = await PAY.review()(cR, { slipId: ids.R2_SLIP, action: "APPROVE", reason: "ญาติจ่ายแทน" });
    ok(r?.ok && r.status === "APPROVED" && r.receipt?.amountSatang === BASE, fmt(r));
    const s = await prisma.paymentSlip.findFirst({ where: { id: ids.R2_SLIP } });
    const r0 = (await receiptsAll()).length;
    await PAY.consume()(evtOf(s));
    eq([(await fresh(`L6:${P2}`)).status, await paidOn(bl(`L6:${P2}`)), (await receiptsAll()).length - r0], ["PAID", BASE, 0], "ผล");
  });
  await st("R-3", "ยกยอด (C1 หน่วย DC): สลิป ฿4,500.00 บนบิล ฿4,800.00 ⇒ PARTIAL_CARRY ⇒ บิล PARTIALLY_PAID (paid 450,000 · carriedSatang 30,000) · ใบเสร็จ 450,000 (carried 30,000) · event partially_paid · billBalances carriedOut 30,000", async () => {
    needReady();
    const s = await mkSlip(`C1:${P2}`, { amount: 450_000, reasons: ["AMOUNT_SHORT"] });
    const r = await PAY.review()(cR, { slipId: s.id, action: "PARTIAL_CARRY", reason: "รับไว้ก่อน ยกยอดที่ขาด" });
    ok(r?.ok && r.status === "APPROVED", fmt(r));
    const b = await fresh(`C1:${P2}`);
    eq([b.status, b.paidSatang, b.carriedSatang], ["PARTIALLY_PAID", 450_000, 30_000], "บิล");
    eq([r.receipt?.amountSatang, r.receipt?.carriedSatang, r.receipt?.creditSatang], [450_000, 30_000, 0], "ใบเสร็จ");
    eq((await billEvents(b.id)).map((e: Any) => e.type), ["dorm.bill.partially_paid"], "event");
    const x = (await balances(A, [b.id])).get(b.id);
    eq([x?.ownOutstandingSatang, x?.carriedOutSatang], [30_000, 30_000], "balance");
  });
  await st("R-4", "ยกยอดไปบิลหน้าถูก: รอบ ธ.ค. (D.8) ⇒ บิล ธ.ค. carriedIn [{พ.ย. 30,000}] · due 510,000 · บิล ธ.ค. ไม่รวมยอดยกในใบแจ้งหนี้ (480,000) · พอร์ทัล QR = 510,000", async () => {
    needReady();
    const r = await DORM.prepareBillRun(cO, { unitId: DC, periodKey: P3 }, { now: new Date(NOW3) });
    ok(r?.ok, fmt(r));
    let last: Any = null;
    for (let i = 0; i < 40; i++) { last = await DORM.sendBillRun(cO, { unitId: DC, runId: r.runId }, { now: new Date(NOW3) }); if (!last?.ok || last.done) break; }
    await parkOutbox(tenantIds);
    bills[`C1:${P3}`] = await billOf(ids.C1, P3);
    const dec = bl(`C1:${P3}`);
    ok(dec?.accountDocumentId && dec.totalSatang === BASE, `บิล ธ.ค. ${fmt(dec)}`);
    const x = (await balances(A, [dec.id])).get(dec.id);
    eq([x?.ownOutstandingSatang, x?.carriedIn?.map((c: Any) => [c.billId, c.periodKey, c.satang]), x?.dueSatang], [BASE, [[bl(`C1:${P2}`).id, P2, 30_000]], 510_000], "balance ธ.ค.");
    const v = await portalOut(ids.C1, dec.id);
    eq([v.pay?.amountSatang], [510_000], "พอร์ทัล");
  });
  await st("R-5", "จ่ายบิล ธ.ค. ฿5,100.00 (AUTO) ⇒ กระจายยอดยกมาก่อน: [พ.ย. INVOICE 30,000 · ธ.ค. INVOICE 480,000] · ทั้งสองบิล PAID · credit 0 · event paid ทั้ง 2 บิล", async () => {
    needReady();
    const dec = bl(`C1:${P3}`);
    ok(dec?.id, "ต้องผ่าน R-4 ก่อน");
    const s = await mkSlip(`C1:${P3}`, { amount: 510_000, expected: 510_000, status: "AUTO_APPROVED" });
    const g0 = await gl();
    await PAY.consume()(evtOf(s));
    const v = live(await viewsOf(`C1:${P3}`)).find((x: Any) => x.slipId === s.id);
    eq(v?.allocations?.map((a: Any) => [a.billId, a.kind, a.amountSatang]), [[bl(`C1:${P2}`).id, "INVOICE", 30_000], [dec.id, "INVOICE", BASE]], "allocations");
    eq([(await fresh(`C1:${P2}`)).status, (await fresh(`C1:${P3}`)).status, v?.creditSatang, d(g0, await gl(), "2110")], ["PAID", "PAID", 0, 0], "ผล");
    eq((await billEvents(bl(`C1:${P2}`).id)).map((e: Any) => e.type).sort(), ["dorm.bill.paid", "dorm.bill.partially_paid"], "event พ.ย.");
  });
  await st("R-6", "ขอโอนเพิ่ม (L8): สลิป ฿4,000.00 ⇒ ASK_MORE ⇒ PARTIALLY_PAID paid 400,000 carried 0 · due 80,000 · LINE payMore ถึงผู้เช่า (ยอด ฿800.00 + ลิงก์พอร์ทัล https)", async () => {
    needReady();
    const s = await mkSlip(`L8:${P2}`, { amount: 400_000, reasons: ["AMOUNT_SHORT"] });
    const m = mark();
    const r = await PAY.review()(cR, { slipId: s.id, action: "ASK_MORE", reason: "ขอให้โอนส่วนที่ขาด" });
    ok(r?.ok && r.status === "APPROVED", fmt(r));
    const b = await fresh(`L8:${P2}`);
    eq([b.status, b.paidSatang, b.carriedSatang, (await balances(A, [b.id])).get(b.id)?.dueSatang], ["PARTIALLY_PAID", 400_000, 0, 80_000], "บิล");
    const txt = J(pushesTo(C.L8.ext, m).map((p) => p.json));
    ok(txt.includes("฿800.00") && txt.includes(`${ORIGIN}/d/`), `ข้อความ ${txt.slice(0, 300)}`);
  });
  await st("R-7", "rooms.payment.partial = DENY ⇒ PARTIAL_CARRY/ASK_MORE = PARTIAL_DENIED (สลิปคง NEEDS_REVIEW · ไม่มีเงิน) · REJECT ได้", async () => {
    needReady();
    await setVal(A, "rooms.payment.partial", DA, "DENY");
    try {
      const s = await mkSlip(`L7:${P2}`, { amount: 450_000, reasons: ["AMOUNT_SHORT"] });
      ids.R8_SLIP = s.id;
      const a = await PAY.review()(cR, { slipId: s.id, action: "PARTIAL_CARRY", reason: "ยกยอด" }), b = await PAY.review()(cR, { slipId: s.id, action: "ASK_MORE", reason: "ขอเพิ่ม" });
      eq([a?.code, b?.code], ["PARTIAL_DENIED", "PARTIAL_DENIED"], "รหัส");
      eq([(await prisma.paymentSlip.findFirst({ where: { id: s.id } })).status, await paidOn(bl(`L7:${P2}`))], ["NEEDS_REVIEW", 0], "ไม่เปลี่ยน");
    } finally { await unsetVal(A, "rooms.payment.partial", DA); }
  });
  await st("R-8", "ปฏิเสธ (L7): REJECT ⇒ สลิป REJECTED · ไม่มีรับชำระ/ใบเสร็จ/รายการบัญชีใหม่ · บิลคง SENT · LINE slipRejected ถึงผู้เช่า (มีเหตุผล)", async () => {
    needReady();
    ok(ids.R8_SLIP, "ต้องผ่าน R-7 ก่อน");
    const g0 = await gl(), r0 = (await receiptsAll()).length, m = mark();
    const r = await PAY.review()(cR, { slipId: ids.R8_SLIP, action: "REJECT", reason: "ยอดในสลิปไม่ตรงกับบิล" });
    ok(r?.ok && r.status === "REJECTED" && r.receipt === null, fmt(r));
    const g1 = await gl();
    eq([await paidOn(bl(`L7:${P2}`)), (await receiptsAll()).length - r0, g1.entries - g0.entries, (await fresh(`L7:${P2}`)).status], [0, 0, 0, "SENT"], "ไม่มีบัญชี");
    ok(J(pushesTo(C.L7.ext, m).map((p) => p.json)).includes("ยอดในสลิปไม่ตรงกับบิล"), "ไม่มีข้อความแจ้งเหตุผล");
  });
  await st("R-9", "เลขอ้างอิงซ้ำ: อนุมัติสลิปไม่มีเลขอ้างอิง (L13) ด้วยเลขของสลิปที่อนุมัติแล้ว ⇒ DUPLICATE · ไม่มีเงิน", async () => {
    needReady();
    ok(ids.C3_TRANSREF, "ต้องผ่าน C-3 ก่อน");
    const s = await mkSlip(`L13:${P2}`, { amount: BASE, transRef: null, reasons: ["DUPLICATE_TRANSREF"] });
    const r = await PAY.review()(cR, { slipId: s.id, action: "APPROVE", reason: "ตรวจแล้ว", transRef: ids.C3_TRANSREF });
    eq([r?.ok, r?.code, await paidOn(bl(`L13:${P2}`))], [false, "DUPLICATE", 0], "ผล");
  });
  await st("R-10", "X4: อนุมัติสลิปเดียว (L16) 4 ทางในโพรเซส + 2 โพรเซส × 3 พร้อมกัน ⇒ สำเร็จ 1 (ที่เหลือ ALREADY_DECIDED/BUSY) · ใบเสร็จ 1 · รับชำระ 480,000", async () => {
    needReady();
    const s = await mkSlip(`L16:${P2}`, { amount: BASE });
    const inp = { slipId: s.id, action: "APPROVE", reason: "พร้อมกัน" };
    const at = atIn();
    const [a, b] = await Promise.all([inProcAt(at, [0, 1, 2, 3].map(() => () => PAY.review()(cR, inp))), fanout("review", [[0, 1, 2].map(() => ({ ctx: cR, input: inp })), [0, 1, 2].map(() => ({ ctx: cR, input: inp }))], at)]);
    const all = [...a, ...b];
    eq(badOf(all), [], "ผิดปกติ");
    eq(all.filter((r) => r?.ok).length, 1, "สำเร็จ");
    ok(all.filter((r) => !r?.ok).every((r) => ["ALREADY_DECIDED", "BUSY"].includes(r?.code)), `ผู้แพ้ ${fmt(all.filter((r) => !r?.ok).map((r) => r?.code))}`);
    eq([live(await viewsOf(`L16:${P2}`)).length, await paidOn(bl(`L16:${P2}`))], [1, BASE], "ผล");
  });
  await st("R-11", "W7: สองสลิปเต็มยอดบนบิลเดียว (L9) อนุมัติพร้อมกันจาก 2 โพรเซส ⇒ ลงบิล 1 ใบ · อีกใบ ALREADY_PAID/BUSY และยัง NEEDS_REVIEW · รับชำระ 480,000 · 2110 ไม่โต", async () => {
    needReady();
    const s1 = await mkSlip(`L9:${P2}`, { amount: BASE }), s2 = await mkSlip(`L9:${P2}`, { amount: BASE });
    const g0 = await gl();
    const at = atIn();
    const rs = await fanout("review", [[{ ctx: cR, input: { slipId: s1.id, action: "APPROVE", reason: "ทางหนึ่ง" } }], [{ ctx: cR, input: { slipId: s2.id, action: "APPROVE", reason: "ทางสอง" } }]], at);
    eq(badOf(rs), [], "ผิดปกติ");
    eq(rs.filter((r) => r?.ok).length, 1, "สำเร็จ");
    const loser = rs.find((r) => !r?.ok);
    ok(["ALREADY_PAID", "BUSY"].includes(loser?.code), `ผู้แพ้ ${fmt(loser)}`);
    const st2 = (await prisma.paymentSlip.findMany({ where: { id: { in: [s1.id, s2.id] } }, select: { status: true } })).map((x: Any) => x.status).sort();
    eq(st2, ["APPROVED", "NEEDS_REVIEW"], "สถานะสลิป");
    eq([await paidOn(bl(`L9:${P2}`)), d(g0, await gl(), "2110"), live(await viewsOf(`L9:${P2}`)).length], [BASE, 0, 1], "ผล");
  });
  await st("R-12", "อนุมัติแข่งเงินสด (L10): โพรเซสหนึ่งอนุมัติสลิปเต็ม · อีกโพรเซสรับเงินสดเต็ม พร้อมกัน ⇒ สำเร็จทางเดียว · รับชำระของบิล = 480,000 พอดี · 2110 ไม่โต · ใบเสร็จที่มีผล 1", async () => {
    needReady();
    const s = await mkSlip(`L10:${P2}`, { amount: BASE });
    const g0 = await gl();
    const at = atIn();
    const [ra, rc] = await Promise.all([
      fanout("review", [[{ ctx: cR, input: { slipId: s.id, action: "APPROVE", reason: "แข่งเงินสด" } }]], at),
      fanout("cash", [[{ ctx: cC, input: { unitId: DA, billId: bl(`L10:${P2}`).id, amountSatang: BASE, channel: "CASH", idempotencyKey: `qcd10-${STAMP}-race-cash` } }]], at),
    ]);
    const all = [...ra, ...rc];
    eq(badOf(all), [], "ผิดปกติ");
    eq(all.filter((r) => r?.ok).length, 1, `สำเร็จ ${fmt(all.map((r) => r?.code ?? r?.ok))}`);
    ok(all.filter((r) => !r?.ok).every((r) => ["ALREADY_PAID", "BUSY"].includes(r?.code)), "รหัสผู้แพ้");
    eq([await paidOn(bl(`L10:${P2}`)), d(g0, await gl(), "2110"), live(await viewsOf(`L10:${P2}`)).length], [BASE, 0, 1], "ผล");
  });
  await st("R-13", "IP-1b มือ: สลิป NEEDS_REVIEW บนบิลจ่ายครบ (L1) ⇒ APPROVE = ALREADY_PAID (สลิปคงเดิม) · REJECT ได้ · บิล VOID (L14) ⇒ BILL_VOID · บิลไม่มีใบ (L15) ⇒ NO_INVOICE (ทั้งตัดสินและเงินสด)", async () => {
    needReady();
    const s1 = await mkSlip(`L1:${P2}`, { amount: BASE });
    const a = await PAY.review()(cR, { slipId: s1.id, action: "APPROVE", reason: "ลอง" });
    eq([a?.code, (await prisma.paymentSlip.findFirst({ where: { id: s1.id } })).status], ["ALREADY_PAID", "NEEDS_REVIEW"], "บิลจ่ายครบ");
    const rj = await PAY.review()(cR, { slipId: s1.id, action: "REJECT", reason: "โอนซ้ำ คืนเงินแล้ว" });
    ok(rj?.ok && rj.status === "REJECTED", fmt(rj));
    const s2 = await mkSlip(`L14:${P2}`, { amount: BASE });
    eq((await PAY.review()(cR, { slipId: s2.id, action: "APPROVE", reason: "ลอง" }))?.code, "BILL_VOID", "VOID");
    await prisma.dormBill.update({ where: { id: bl(`L15:${P2}`).id }, data: { accountDocumentId: null } });
    await fresh(`L15:${P2}`);
    const s3 = await mkSlip(`L15:${P2}`, { amount: BASE });
    eq((await PAY.review()(cR, { slipId: s3.id, action: "APPROVE", reason: "ลอง" }))?.code, "NO_INVOICE", "ไม่มีใบ (ตัดสิน)");
    eq((await PAY.cash()(cC, { unitId: DA, billId: bl(`L15:${P2}`).id, amountSatang: BASE, channel: "CASH", idempotencyKey: `qcd10-${STAMP}-noinv` }))?.code, "NO_INVOICE", "ไม่มีใบ (เงินสด)");
  });
  await st("R-14", "สลิปที่พัก (AFTER_PAID · L1): resolveHeldSlip CREDIT ⇒ ใบเสร็จ credit 480,000 (allocations ว่าง) · 2110 +480,000 · ครั้งที่สอง NOT_FOUND · REFUND_DUE (BILL_VOID · L14) ⇒ ไม่มีบัญชี ออกจากคิว", async () => {
    needReady();
    const g0 = await gl();
    const r = await PAY.resolve()(cR, { slipId: HELD.afterPaid, action: "CREDIT", reason: "ผู้เช่าขอเก็บไว้หักบิลหน้า" });
    ok(r?.ok && r.receipt?.creditSatang === BASE && J(r.receipt?.allocations) === "[]", fmt(r));
    eq(d(g0, await gl(), "2110"), -BASE, "2110");
    eq((await PAY.resolve()(cR, { slipId: HELD.afterPaid, action: "CREDIT", reason: "ซ้ำ" }))?.code, "NOT_FOUND", "ครั้งที่สอง");
    const g1 = await gl();
    const rf = await PAY.resolve()(cR, { slipId: HELD.billVoid, action: "REFUND_DUE", reason: "บิลยกเลิก โอนคืนผู้เช่า" });
    ok(rf?.ok && rf.receipt === null, fmt(rf));
    eq((await gl()).entries - g1.entries, 0, "REFUND_DUE ไม่มีบัญชี");
    const m = await PAY.model()(cR, { unitId: DA, periodKey: P2 });
    ok(!m.review.some((x: Any) => x.slipId === HELD.afterPaid || x.slipId === HELD.billVoid), "ยังอยู่ในคิว");
  });

  // ═══════════════ M รับเงินมือ ═══════════════
  console.log("\n── M รับเงินมือ ──");
  const cashIn = (k: string, amount: number, key: string, channel = "CASH") => ({ unitId: bl(k).unitId, billId: bl(k).id, amountSatang: amount, channel, idempotencyKey: `qcd10-${STAMP}-${key}` });
  await st("M-1", "X1: ไม่มี dorm.payment.manual (dorm.view · dorm.slip.review) · ร้าน B · บิลขยะ · หน่วยไม่ตรงบิล ⇒ NOT_FOUND เนื้อเดียวกัน · ไม่มีเงิน", async () => {
    needReady();
    const inp = cashIn(`L11:${P2}`, BASE, "m1");
    const rs = [await PAY.cash()(cV, inp), await PAY.cash()(cR, inp), await PAY.cash()(cOB, inp), await PAY.cash()(cC, { ...inp, billId: "nope-xyz" }), await PAY.cash()(cC, { ...inp, unitId: DK }), await PAY.cash()(cOB, { ...inp, unitId: DB })];
    sameNF(rs, "ผล");
    eq(await paidOn(bl(`L11:${P2}`)), 0, "เงิน");
  });
  await st("M-2", "เงินสดเต็ม (L11) ⇒ ใบเสร็จ CASH 480,000 · บิล PAID · LINE ใบเสร็จ 1 · คีย์เดิมข้อมูลเดิม ⇒ duplicate:true ใบเสร็จเดิม · คีย์เดิมยอดอื่น ⇒ IDEMPOTENCY_CONFLICT", async () => {
    needReady();
    const m = mark();
    const a = await PAY.cash()(cC, cashIn(`L11:${P2}`, BASE, "m2"));
    ok(a?.ok && !a.duplicate && a.receipt?.channel === "CASH" && a.receipt?.amountSatang === BASE, fmt(a));
    const b = await PAY.cash()(cC, cashIn(`L11:${P2}`, BASE, "m2"));
    ok(b?.ok && b.duplicate && b.receipt?.receiptId === a.receipt.receiptId, fmt(b));
    eq((await PAY.cash()(cC, cashIn(`L11:${P2}`, 100_000, "m2")))?.code, "IDEMPOTENCY_CONFLICT", "คีย์ชน");
    eq([(await fresh(`L11:${P2}`)).status, await paidOn(bl(`L11:${P2}`)), live(await viewsOf(`L11:${P2}`)).length, pushesTo(C.L11.ext, m).length], ["PAID", BASE, 1, 1], "ผล");
    eq((await PAY.cash()(cC, cashIn(`L11:${P2}`, 1_000, "m2b")))?.code, "ALREADY_PAID", "บิลจ่ายครบ คีย์ใหม่");
  });
  await st("M-3", "ตรวจอินพุต ⇒ VALIDATION (ยอด 0 · ติดลบ · ทศนิยม · คีย์สั้น · ช่องทางแปลก) · บิล VOID (L14) ⇒ BILL_VOID", async () => {
    needReady();
    const base = cashIn(`L19:${P2}`, BASE, "m3");
    const rs = [await PAY.cash()(cC, { ...base, amountSatang: 0 }), await PAY.cash()(cC, { ...base, amountSatang: -5 }), await PAY.cash()(cC, { ...base, amountSatang: 1.5 }), await PAY.cash()(cC, { ...base, idempotencyKey: "short" }), await PAY.cash()(cC, { ...base, channel: "BITCOIN" })];
    eq(rs.map((r) => r?.code), ["VALIDATION", "VALIDATION", "VALIDATION", "VALIDATION", "VALIDATION"], "รหัส");
    eq((await PAY.cash()(cC, cashIn(`L14:${P2}`, BASE, "m3v")))?.code, "BILL_VOID", "VOID");
    eq(await paidOn(bl(`L19:${P2}`)), 0, "เงิน");
  }, "MAJOR");
  await st("M-4", "X3: คีย์เดียวเงินสดเต็ม (L18) 6 ทางในโพรเซส + 2 โพรเซส × 3 พร้อมกัน ⇒ ใบเสร็จ 1 · รับชำระ 480,000 · ผู้สำเร็จทุกรายได้ใบเสร็จเดียวกัน (อื่น = BUSY)", async () => {
    needReady();
    const inp = cashIn(`L18:${P2}`, BASE, "m4");
    const at = atIn();
    const [a, b] = await Promise.all([inProcAt(at, [0, 1, 2, 3, 4, 5].map(() => () => PAY.cash()(cC, inp))), fanout("cash", [[0, 1, 2].map(() => ({ ctx: cC, input: inp })), [0, 1, 2].map(() => ({ ctx: cC, input: inp }))], at)]);
    const all = [...a, ...b];
    eq(badOf(all), [], "ผิดปกติ");
    const oks = all.filter((r) => r?.ok);
    ok(oks.length >= 1 && new Set(oks.map((r) => r.receipt?.receiptId)).size === 1 && all.filter((r) => !r?.ok).every((r) => r?.code === "BUSY"), `ผล ${fmt(all.map((r) => r?.receipt?.receiptId ?? r?.code))}`);
    eq([live(await viewsOf(`L18:${P2}`)).length, await paidOn(bl(`L18:${P2}`))], [1, BASE], "ผล");
  });
  await st("M-5", "รับบางส่วนด้วยมือ (L12): ฿2,000.00 ⇒ PARTIALLY_PAID · ฿2,800.00 ⇒ PAID · ใบเสร็จ 2 ใบเลขต่างกัน", async () => {
    needReady();
    const a = await PAY.cash()(cC, cashIn(`L12:${P2}`, 200_000, "m5a"));
    ok(a?.ok, fmt(a));
    eq((await fresh(`L12:${P2}`)).status, "PARTIALLY_PAID", "หลังก้อนแรก");
    const b = await PAY.cash()(cC, cashIn(`L12:${P2}`, 280_000, "m5b", "TRANSFER"));
    ok(b?.ok && b.receipt?.channel === "TRANSFER", fmt(b));
    eq([(await fresh(`L12:${P2}`)).status, await paidOn(bl(`L12:${P2}`))], ["PAID", BASE], "หลังก้อนสอง");
    ok(a.receipt.docNo !== b.receipt.docNo, "เลขใบเสร็จซ้ำ");
    ids.M5_RECEIPT_B = b.receipt.receiptId; ids.M5_DOCNO_B = b.receipt.docNo;
  });
  await st("M-6", "เงินสดเกิน (L17) ฿5,000.00 ⇒ PAID · credit 20,000 · 2110 −20,000 · partial = DENY ⇒ เงินสดขาด (L20) = PARTIAL_DENIED", async () => {
    needReady();
    const g0 = await gl();
    const r = await PAY.cash()(cC, cashIn(`L17:${P2}`, 500_000, "m6"));
    ok(r?.ok && r.receipt?.creditSatang === 20_000, fmt(r));
    eq([(await fresh(`L17:${P2}`)).status, d(g0, await gl(), "2110")], ["PAID", -20_000], "ผล");
    await setVal(A, "rooms.payment.partial", DA, "DENY");
    try { eq((await PAY.cash()(cC, cashIn(`L20:${P2}`, 100_000, "m6d")))?.code, "PARTIAL_DENIED", "DENY"); } finally { await unsetVal(A, "rooms.payment.partial", DA); }
  });

  // ═══════════════ N เลข/ยกเลิก ═══════════════
  console.log("\n── N เลขใบเสร็จ · ยกเลิก ──");
  await st("N-1", "ยกเลิกใบเสร็จ (L12 ก้อนสอง · เหตุผล) ⇒ VOIDED เลขเดิม · บิลกลับ PARTIALLY_PAID paid 200,000 · กลับรายการ (entry เพิ่ม ไม่ลด · สมดุล · 1100 กลับ +280,000 · รายได้ไม่เปลี่ยน) · แถวรับชำระยังอยู่ (voidedAt)", async () => {
    needReady();
    ok(ids.M5_RECEIPT_B, "ต้องผ่าน M-5 ก่อน");
    const g0 = await gl();
    const pays0 = await prisma.accountDocumentPayment.count({ where: { tenantId: A } });
    const r = await PAY.voidR()(cO, { receiptId: ids.M5_RECEIPT_B, reason: "บันทึกผิดยอด ลงใหม่" });
    ok(r?.ok && r.receipt?.status === "VOIDED" && r.receipt?.docNo === ids.M5_DOCNO_B, fmt(r));
    const b = await fresh(`L12:${P2}`);
    const g1 = await gl();
    eq([b.status, b.paidSatang, await paidOn(b)], ["PARTIALLY_PAID", 200_000, 200_000], "บิล");
    ok(g1.entries > g0.entries && g1.unbalanced.length === 0 && d(g0, g1, "1100") === 280_000 && g1.income === g0.income, `GL entries ${g0.entries}→${g1.entries} 1100 ${d(g0, g1, "1100")} income ${g1.income - g0.income}`);
    eq(await prisma.accountDocumentPayment.count({ where: { tenantId: A } }), pays0, "แถวรับชำระไม่ถูกลบ");
  });
  await st("N-2", "หลังยกเลิก รับใหม่ ฿2,800.00 ⇒ ใบเสร็จใหม่เลขไม่ซ้ำเลขที่ยกเลิก · ทั้งร้าน: เลขใบเสร็จ DORM ไม่ว่างและไม่ซ้ำ (รวมใบที่ยกเลิก)", async () => {
    needReady();
    const r = await PAY.cash()(cC, cashIn(`L12:${P2}`, 280_000, "n2"));
    ok(r?.ok && r.receipt?.docNo && r.receipt.docNo !== ids.M5_DOCNO_B, fmt(r));
    const all = await receiptsAll();
    const nos = all.map((x: Any) => x.docNo ?? "");
    ok(nos.every((n: string) => n.length > 0) && new Set(nos).size === nos.length, `เลข ${J(nos)}`);
    eq((await fresh(`L12:${P2}`)).status, "PAID", "บิล");
  });
  await st("N-3", "X9: ยกเลิกใบเสร็จ — ไม่มีสิทธิ์ (dorm.view · dorm.slip.review · ร้าน B) ⇒ NOT_FOUND เนื้อเดียว · เหตุผลสั้น ⇒ VALIDATION · ยกเลิกซ้ำ ⇒ ALREADY_VOID", async () => {
    needReady();
    const inp = { receiptId: ids.M5_RECEIPT_B, reason: "ทดสอบสิทธิ์ยกเลิก" };
    sameNF([await PAY.voidR()(cV, inp), await PAY.voidR()(cR, inp), await PAY.voidR()(cOB, inp), await PAY.voidR()(cC, { ...inp, receiptId: "nope-xyz" })], "สิทธิ์");
    const live1 = live(await viewsOf(`L11:${P2}`))[0];
    eq((await PAY.voidR()(cC, { receiptId: live1.receiptId, reason: "" }))?.code, "VALIDATION", "เหตุผล");
    eq((await PAY.voidR()(cC, inp))?.code, "ALREADY_VOID", "ซ้ำ");
  }, "MAJOR");
  await st("N-4", "ยกเลิกใบเสร็จของสลิปจ่ายเกิน (L3) ⇒ 2110 กลับ +20,000 · บิลกลับค้าง · consumer replay สลิปนั้น ⇒ ไม่มีใบเสร็จใหม่ (หนึ่งสลิปลงได้ครั้งเดียวตลอดกาล)", async () => {
    needReady();
    ok(ids.C5_RECEIPT, "ต้องผ่าน C-5 ก่อน");
    const g0 = await gl();
    const r = await PAY.voidR()(cC, { receiptId: ids.C5_RECEIPT, reason: "สลิปปลอม ธนาคารแจ้ง" });
    ok(r?.ok, fmt(r));
    const g1 = await gl();
    eq([d(g0, g1, "2110"), d(g0, g1, "1100"), (await fresh(`L3:${P2}`)).status], [20_000, BASE, "SENT"], "กลับรายการ");
    const s = await prisma.paymentSlip.findFirst({ where: { id: ids.C5_SLIP } });
    const r0 = (await receiptsAll()).length;
    await PAY.consume()(evtOf(s));
    eq([(await receiptsAll()).length - r0, await paidOn(bl(`L3:${P2}`))], [0, 0], "replay");
  });

  // ═══════════════ K โมเดลจอ (หน่วย DK) ═══════════════
  console.log("\n── K โมเดลจอ 06 ──");
  await st("K-1", "หน่วย DK งวด พ.ย.: K1 จ่ายด้วยสลิป AUTO · K2 สลิปขาด ฿300 รอตรวจ · K3 ค้าง · K4 ค้าง ต.ค.+พ.ย. ⇒ KPI ตรง {received 480,000/1 บิล/auto 1 · review 1/480,000/[302] · unpaid 960,000/2 · overdue 480,000/[304]} · แถว K2 flags SHORT diff −30,000 actions ไม่มี APPROVE · recent มีเลขใบเสร็จ K1 · ลิงก์ statement", async () => {
    needReady();
    const s1 = await mkSlip(`K1:${P2}`, { amount: BASE, status: "AUTO_APPROVED" });
    await PAY.consume()(evtOf(s1));
    const s2 = await mkSlip(`K2:${P2}`, { amount: 450_000, reasons: ["AMOUNT_SHORT"] });
    ids.K2_SLIP = s2.id;
    const m = await PAY.model()(cR, { unitId: DK, periodKey: P2 });
    ok(m, "model null");
    ids.K_MODEL = J(m);
    eq([m.periodKey, m.periodLabel, m.can], [P2, "พ.ย. 2569", { review: true, manual: false }], "หัว");
    eq(m.kpi, { receivedSatang: BASE, receivedBills: 1, autoApproved: 1, reviewCount: 1, reviewSatang: BASE, reviewRooms: ["302"], unpaidSatang: 2 * BASE, unpaidBills: 2, overdueSatang: BASE, overdueRooms: ["304"] }, "kpi");
    eq(m.review.map((r: Any) => [r.slipId, r.roomNumber, r.dueSatang, r.slipSatang, r.diffSatang, r.status, r.flags]), [[s2.id, "302", BASE, 450_000, -30_000, "NEEDS_REVIEW", ["SHORT"]]], "review");
    eq([...m.review[0].actions].sort(), ["ASK_MORE", "PARTIAL_CARRY", "REJECT"], "actions");
    ok(m.review[0].tenantShort && !m.review[0].tenantShort.includes(" ") && !m.review[0].tenantShort.includes("นามสกุล"), `tenantShort ${m.review[0].tenantShort}`);
    const v1 = live(await viewsOf(`K1:${P2}`))[0];
    ok(m.recent.some((r: Any) => r.roomNumber === "301" && r.docNo === v1?.docNo && r.amountSatang === BASE && r.via === "SLIP"), `recent ${fmt(m.recent)}`);
    eq(m.links.statementMatch, `/app/sys/${ids.BOOK_A}/account/finance/reconcile`, "statement");
  });
  await st("K-2", "X1: โมเดลแยกหน่วย/ร้าน — DA ไม่มีสลิปของ DN/DK/ร้าน B · REV ดู DN ⇒ null · dorm.view อย่างเดียว ⇒ null · ร้าน B ⇒ null · CASH ⇒ can {review:false, manual:true}", async () => {
    needReady();
    const ma = await PAY.model()(cR, { unitId: DA, periodKey: P2 });
    const foreign = await prisma.paymentSlip.findMany({ where: { tenantId: { in: [A, B] }, NOT: { unitId: DA } }, select: { id: true } });
    const fset = new Set(foreign.map((x: Any) => x.id));
    ok(ma && !ma.review.some((r: Any) => fset.has(r.slipId)), "มีสลิปหน่วยอื่น");
    eq([await PAY.model()(cR, { unitId: DN }), await PAY.model()(cV, { unitId: DK }), await PAY.model()(cOB, { unitId: DK }), await PAY.model()(cR, { unitId: "nope" })], [null, null, null, null], "null");
    eq((await PAY.model()(cC, { unitId: DK, periodKey: P2 }))?.can, { review: false, manual: true }, "can");
  });
  await st("K-4", "X8/X10: โมเดลไม่มีเบอร์ · ไม่มีชื่อเต็ม (นามสกุล) · ไม่มี URL/path ไฟล์", async () => {
    needReady();
    const s = ids.K_MODEL ?? "";
    ok(s, "ต้องผ่าน K-1 ก่อน");
    const surnames = NAMES.map((n) => n.split(" ")[1]).filter(Boolean);
    ok(!PHONES.some((p) => s.includes(p)) && !PHONE_RE.test(s), "มีเบอร์");
    ok(!surnames.some((x) => s.includes(x!)), "มีนามสกุล");
    ok(!/private:\/\/|\/api\/files\/|t\/[a-z0-9]+\/private/.test(s), "มี path ไฟล์");
  }, "MAJOR");

  // ═══════════════ W สลิปจากแชท (W4) ═══════════════
  console.log("\n── W สลิปแชทกำกวม ──");
  const img = (key: string, messageId: string) => {
    const on = LINE?.onLineImage;
    ok(typeof on === "function", "ไม่มี dorm-line.onLineImage (D.9)");
    return on({ tenantId: A, connectionId: C[key].conn, chatContactId: C[key].id, partyId: C[key].partyId, replyToken: `rt${messageId}` }, { messageId }, { deps: noopDeps });
  };
  const MID = (n: string) => `${Date.now() % 1_000_000_000}${n}`.slice(0, 18);
  await st("W-1", "ผู้เช่า K4 (ค้าง ต.ค.+พ.ย. = กำกวม) ส่งรูป ⇒ ตอบข้อความเดิม (handled · ไม่แนบ) · ดึงรูป 1 ครั้ง · คิว chat มี 1 รายการ ห้อง 304 · ไม่มี PaymentSlip ของบิล K4 · ส่ง messageId เดิมซ้ำ = ยัง 1 รายการ", async () => {
    needReady();
    const m = mark();
    const mid = MID("71");
    ids.W_MID = mid;
    const r = await img("K4", mid);
    ok(r?.handled === true && r.attached === null, fmt(r));
    eq(contentGets(m).length, 1, "ดึงรูป");
    await img("K4", mid);
    const model = await PAY.model()(cR, { unitId: DK, periodKey: P2 });
    eq(model?.chat?.map((c: Any) => c.roomNumbers), [["304"]], "chat");
    ids.W_ITEM = model.chat[0].itemId;
    eq(await prisma.paymentSlip.count({ where: { tenantId: A, refId: { in: [bl(`K4:${P1}`).id, bl(`K4:${P2}`).id] } } }), 0, "สลิป");
  });
  await st("W-2", "แนบเข้าบิล ต.ค. ของ K4 (REV) ⇒ PaymentSlip DORM_BILL refId = บิล ต.ค. · expected 480,000 · partyId ผู้เช่า · แฮช = รูปจาก LINE · ออกจากคิว · แนบซ้ำ ⇒ NOT_FOUND", async () => {
    needReady();
    ok(ids.W_ITEM, "ต้องผ่าน W-1 ก่อน");
    const r = await PAY.attach()(cR, { itemId: ids.W_ITEM, billId: bl(`K4:${P1}`).id }, { deps: noopDeps });
    ok(r?.ok && r.slipId, fmt(r));
    const s = await prisma.paymentSlip.findFirst({ where: { id: r.slipId } });
    eq([s?.domain, s?.refType, s?.refId, s?.expectedSatang, s?.partyId, s?.imageHash], ["DORM", "DORM_BILL", bl(`K4:${P1}`).id, BASE, ids.P_K4, createHash("sha256").update(pngOf(`line-${ids.W_MID}`)).digest("hex")], "สลิป");
    ok(!((await PAY.model()(cR, { unitId: DK, periodKey: P2 }))?.chat ?? []).some((c: Any) => c.itemId === ids.W_ITEM), "ยังอยู่ในคิว");
    eq((await PAY.attach()(cR, { itemId: ids.W_ITEM, billId: bl(`K4:${P1}`).id }, { deps: noopDeps }))?.code, "NOT_FOUND", "แนบซ้ำ");
  });
  await st("W-3", "X1: รายการใหม่ — แนบเข้าบิลของสัญญาอื่น (K3) · ผู้ไม่มี dorm.slip.review · ร้าน B ⇒ NOT_FOUND เนื้อเดียว · ทิ้งรายการ (เหตุผล) ⇒ ไฟล์ส่วนตัวถูกลบ · ออกจากคิว", async () => {
    needReady();
    const f0 = await prisma.fileAsset.count({ where: { tenantId: A } });
    await img("K4", MID("72"));
    const f1 = await prisma.fileAsset.count({ where: { tenantId: A } });
    const model = await PAY.model()(cR, { unitId: DK, periodKey: P2 });
    const item = model?.chat?.[0]?.itemId;
    ok(item && f1 === f0 + 1, `item ${item} ไฟล์ ${f0}→${f1}`);
    sameNF([await PAY.attach()(cR, { itemId: item, billId: bl(`K3:${P2}`).id }, { deps: noopDeps }), await PAY.attach()(cV, { itemId: item, billId: bl(`K4:${P2}`).id }, { deps: noopDeps }), await PAY.attach()(cOB, { itemId: item, billId: bl(`K4:${P2}`).id }, { deps: noopDeps }), await PAY.dismiss()(cV, { itemId: item, reason: "ไม่ใช่สลิป" })], "สิทธิ์");
    const r = await PAY.dismiss()(cR, { itemId: item, reason: "รูปแจ้งซ่อม ไม่ใช่สลิป" }, { deps: noopDeps });
    ok(r?.ok, fmt(r));
    eq([await prisma.fileAsset.count({ where: { tenantId: A } }), ((await PAY.model()(cR, { unitId: DK, periodKey: P2 }))?.chat ?? []).length], [f0, 0], "หลังทิ้ง");
  });
  await st("W-4", "คนที่ไม่ใช่ผู้เช่า (Party ไม่มีสัญญา) ส่งรูป ⇒ ไม่ดึงรูป ไม่เก็บ ไม่ตอบ", async () => {
    needReady();
    const m = mark();
    const r = await img("KX", MID("73"));
    ok(r?.handled === false, fmt(r));
    eq([contentGets(m).length, ((await PAY.model()(cR, { unitId: DK, periodKey: P2 }))?.chat ?? []).length], [0, 0], "ผล");
  }, "MAJOR");

  // ═══════════════ E event/LINE/PII ═══════════════
  console.log("\n── E event · LINE · PII ──");
  await st("E-1", "event dorm.bill.* : payload คีย์เฉพาะ {unitId billId leaseId periodKey amountSatang receiptId} · ไม่มีเบอร์/ชื่อ · key ไม่ซ้ำ", async () => {
    needReady();
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: A, type: { in: ["dorm.bill.paid", "dorm.bill.partially_paid"] } }, select: { payload: true, idempotencyKey: true } });
    ok(ev.length >= 10, `event น้อย ${ev.length}`);
    const allowed = new Set(["unitId", "billId", "leaseId", "periodKey", "amountSatang", "receiptId"]);
    const bad = ev.filter((e: Any) => Object.keys(e.payload ?? {}).some((k) => !allowed.has(k)) || PHONE_RE.test(J(e.payload)) || NAMES.some((n) => J(e.payload).includes(n)));
    eq(bad.length, 0, `payload ${fmt(bad[0])}`);
    eq(new Set(ev.map((e: Any) => e.idempotencyKey)).size, ev.length, "key ซ้ำ");
  }, "MAJOR");
  await st("E-2", "rooms.payment.notifyReceipt = false ⇒ รับเงินสด (L20) ไม่มีข้อความ · ข้อความทั้งหมดของรอบ: OA ของหน่วยเท่านั้น (ไม่มี OA2) · ไม่มีคำต้องห้าม/เบอร์ · ไม่มีคำขอออกนอกเครื่อง", async () => {
    needReady();
    await setVal(A, "rooms.payment.notifyReceipt", DA, false);
    try {
      const m = mark();
      const r = await PAY.cash()(cC, cashIn(`L20:${P2}`, BASE, "e2"));
      ok(r?.ok, fmt(r));
      eq(pushesTo(C.L20.ext, m).length, 0, "push");
    } finally { await unsetVal(A, "rooms.payment.notifyReceipt", DA); }
    const ps = pushes(0);
    ok(!ps.some((p) => p.auth === ids.TOK2), "มีข้อความผ่าน OA2");
    const txt = J(ps.map((p) => p.json));
    ok(!LEGAL_BAD.test(txt) && !PHONE_RE.test(txt), "คำต้องห้าม/เบอร์");
    eq(BLOCKED, [], "คำขอนอกเครื่อง");
  }, "MAJOR");

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U DOM ──");
  await st("U-1", "DormPayments (renderToStaticMarkup · โมเดล K-1 · selected = สลิป K2): ราก data-dorm-payments · KPI 4 การ์ด (฿4,800.00) · แถว data-room=302 + ธง SHORT · แผง: radio PARTIAL_CARRY/ASK_MORE/REJECT (ไม่มี APPROVE) + reason + slipId + ปุ่มยืนยัน · recent มีเลขใบเสร็จ · ลิงก์ statement · ไม่มีเบอร์/นามสกุล", async () => {
    ok(existsSync(join(ROOT, F.comp)), `ยังไม่มี ${F.comp}`);
    ok(ids.K_MODEL, "ต้องผ่าน K-1 ก่อน");
    const React = (await import("react")) as Any;
    const RDS = (await import("react-dom/server")) as Any;
    const Comp = ((await import(pathToFileURL(join(ROOT, F.comp)).href)) as Any).default;
    const model = JSON.parse(ids.K_MODEL);
    const act = async () => ({});
    const html = String(RDS.renderToStaticMarkup(React.createElement(Comp, { model, unitSlug: "qc", selected: ids.K2_SLIP, actions: { review: act, resolve: act, cash: act, voidReceipt: act, attachChat: act, dismissChat: act } }))).replace(/<!-- -->/g, "");
    const bad: string[] = [];
    if (!/data-dorm-payments/.test(html) || !html.includes(`data-period="${P2}"`)) bad.push("ราก");
    for (const k of ["received", "review", "unpaid", "overdue"]) if (!html.includes(`data-pay-kpi="${k}"`)) bad.push(`kpi ${k}`);
    if (!html.includes("฿4,800.00")) bad.push("ยอด ฿4,800.00");
    if (!new RegExp(`data-pay-review-row="${ids.K2_SLIP}"[^>]*data-room="302"|data-room="302"[^>]*data-pay-review-row="${ids.K2_SLIP}"`).test(html)) bad.push("แถว 302");
    if (!html.includes('data-pay-flag="SHORT"')) bad.push("ธง SHORT");
    if (!html.includes(`data-pay-panel="${ids.K2_SLIP}"`)) bad.push("แผง");
    for (const v of ["PARTIAL_CARRY", "ASK_MORE", "REJECT"]) if (!new RegExp(`name="action"[^>]*value="${v}"|value="${v}"[^>]*name="action"`).test(html)) bad.push(`radio ${v}`);
    if (/value="APPROVE"/.test(html)) bad.push("มี APPROVE");
    if (!/name="reason"/.test(html) || !new RegExp(`name="slipId"[^>]*value="${ids.K2_SLIP}"|value="${ids.K2_SLIP}"[^>]*name="slipId"`).test(html) || !/data-pay-confirm/.test(html)) bad.push("ฟอร์ม");
    const rec = model.recent.find((r: Any) => r.docNo);
    if (!rec || !html.includes(`data-pay-receipt="${rec.docNo}"`)) bad.push("recent");
    if (!html.includes(`href="${model.links.statementMatch}"`) || !/data-pay-statement/.test(html)) bad.push("statement");
    if (/data-pay-cash/.test(html)) bad.push("ปุ่มเงินสดทั้งที่ can.manual=false");
    const surnames = NAMES.map((n) => n.split(" ")[1]).filter(Boolean);
    if (PHONES.some((p) => html.includes(p)) || surnames.some((x) => html.includes(x!))) bad.push("PII");
    if (LEGAL_BAD.test(html)) bad.push("คำต้องห้าม");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-d10-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (บิล/สลิป/เอกสารบัญชี/GL/outbox/log/ค่าตั้ง/ไฟล์) · ผู้ใช้ทดสอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d10-" } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: "svc-d10-" } } }), 0, "user");
  }, "MAJOR");
  globalThis.fetch = REAL_FETCH;
  if (LINE_API_BASE_SAVED === undefined) delete process.env.LINE_API_BASE; else process.env.LINE_API_BASE = LINE_API_BASE_SAVED;
  server.close();
}

// ═══════════════ S (git) ═══════════════
console.log("\n── S: ไฟล์ที่แตะ (git) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const removedLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim());
const OWN_FIXED = new Set<string>([F.pay, F.balance, F.dormIndex, F.latefee, F.dormPortal, F.portal, F.line, F.slipVerify, F.accIndex, F.accService, F.consumers, F.autoLabels, F.hookLabels, F.defs, F.page, F.actions, F.comp, F.homeShared]);
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.pay}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "D.10 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1) · มีไฟล์ใหม่ครบ", () => {
    const outside = ch.filter((f) => !OWN_FIXED.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    const miss = [F.pay, F.balance, F.page, F.comp].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core (นอก defs/rooms.ts) · notify-customer · payment (นอก slip-verify) · แชท · จองคิว · โมดูลหอเดิม (นอก balance/index/latefee/portal) · บัญชี (นอก index/service) · หน้าสาธารณะ (store)", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/platform/notify-customer.ts", "src/lib/payment", "src/lib/modules/chat", "src/lib/modules/booking", "src/lib/modules/dorm", "src/lib/modules/account", "src/app/(store)"])
    .filter((f) => ![F.defs, F.slipVerify, F.balance, F.dormIndex, F.latefee, F.dormPortal, F.accIndex, F.accService].includes(f as never));
  eq(banned, [], "ไฟล์");
});
await st("S-11", "ชิ้นกลางแตะแบบเพิ่มอย่างเดียว (ไม่มีบรรทัดที่ลบ): slip-verify.ts (R1) · account index/service (R2) · dorm index · postback/notify ไม่ถูกแตะ", () => {
  const bad: string[] = [];
  for (const f of [F.slipVerify, F.accIndex, F.accService, F.dormIndex, F.autoLabels, F.hookLabels, F.defs, F.homeShared]) { const r = removedLines(f); if (r.length) bad.push(`${f}: ลบ ${r.length} บรรทัด`); }
  ok(!bad.length, bad.join(" · "));
}, "MAJOR");
await st("S-12", "จุดแก้ไฟล์ D.9/D.11 จำกัด: latefee.ts ลบ ≤ 6 บรรทัด · dorm-line.ts ลบ ≤ 6 · dorm-portal.ts/portal.ts ลบ ≤ 20 · consumers ลบ ≤ 1 (บรรทัด payment.slip.approved)", () => {
  const lim: [string, number][] = [[F.latefee, 6], [F.line, 6], [F.portal, 20], [F.dormPortal, 20], [F.consumers, 1]];
  const bad = lim.map(([f, n]) => [f, removedLines(f).length, n] as const).filter(([, c, n]) => c > n);
  ok(!bad.length, bad.map(([f, c, n]) => `${f}: ลบ ${c} > ${n}`).join(" · "));
  const s = stripComments(read(F.slipVerify));
  ok(!read(F.slipVerify) || /dorm\.slip\.review|module:\s*["']dorm["']/.test(s) || !dirty([F.slipVerify]).length, "แตะ slip-verify แต่ไม่มีคีย์ dorm.slip.review");
}, "MAJOR");

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.dorm.slug }, select: { id: true } }) : null;
    const ns = u ? await prisma.paymentSlip.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id, domain: "DORM" } }) : 0;
    unitId = u?.id ?? "";
    if (!t || !u || ns === 0) why = "ร้าน svcqc ยังไม่มีฉาก D.13 (reseed → roomboard → lease → dorm-home ก่อน)";
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const n1 = "ฉาก svc-qc-payments-scene: รันได้ · รันซ้ำ = 0/0/0 · สลิป 104/206/309 ได้ยอด/ผู้โอน/เหตุผลตาม SQC_DORM_PAY_SCENE (refId/status/expected ของ D.13 ไม่เปลี่ยน)";
  const n2 = "โมเดลจอ 06 บนฉาก (owner): KPI = ภาพ (รับแล้ว ฿133,912.80/24 · รอตรวจ 3 ฿17,785.36 · ยังไม่จ่าย ฿22,428.24/4 · ค้าง ต.ค. ฿10,200.40 106·305) · แถว 206 ขาด ฿62.32 actions ยกยอด/ขอเพิ่ม/ปฏิเสธ · 104 ชื่อไม่ตรง · 309 ซ้ำ";
  if (why) { skip("Q-1", n1, why, "MAJOR"); skip("Q-2", n2, why, "MAJOR"); }
  else {
    await st("Q-1", n1, async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const before = await prisma.paymentSlip.findMany({ where: { tenantId: SQC_TENANT.id, unitId, domain: "DORM" }, select: { id: true, refId: true, status: true, expectedSatang: true, fileId: true } });
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const after = await prisma.paymentSlip.findMany({ where: { tenantId: SQC_TENANT.id, unitId, domain: "DORM" }, select: { id: true, refId: true, status: true, expectedSatang: true, fileId: true, amountSatang: true, reviewReason: true, bankCode: true } });
      eq(after.map((x: Any) => [x.id, x.refId, x.status, x.expectedSatang, x.fileId]).sort(), before.map((x: Any) => [x.id, x.refId, x.status, x.expectedSatang, x.fileId]).sort(), "ช่องของ D.13");
      const amounts = after.map((x: Any) => x.amountSatang).sort();
      eq(amounts, Object.values(SQC_DORM_PAY_SCENE.slips).map((x) => x.amountSatang).sort(), "ยอดสลิป");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const owner = await prisma.user.findFirst({ where: { email: SQC_USERS[0].email }, select: { id: true } });
      ok(owner, "ไม่มีผู้ใช้ owner ของ svcqc");
      const m = await PAY.model()({ tenantId: SQC_TENANT.id, actorUserId: owner.id }, { unitId, periodKey: SQC_DORM_PAY_SCENE.period });
      ok(m, "model null");
      const E = SQC_DORM_PAY_SCENE.expect;
      eq([m.kpi.receivedSatang, m.kpi.receivedBills, m.kpi.reviewCount, m.kpi.reviewSatang, m.kpi.reviewRooms, m.kpi.unpaidSatang, m.kpi.unpaidBills, m.kpi.overdueSatang, m.kpi.overdueRooms],
        [E.receivedSatang, E.receivedBills, E.reviewCount, E.reviewSatang, [...E.reviewRooms], E.unpaidSatang, E.unpaidBills, E.overdueSatang, [...E.overdueRooms]], "kpi");
      const row = (n: string) => m.review.find((r: Any) => r.roomNumber === n);
      eq([row("206")?.diffSatang, row("206")?.flags, [...(row("206")?.actions ?? [])].sort(), row("104")?.flags, row("309")?.flags?.includes("DUPLICATE")],
        [E.shortDiffSatang, ["SHORT"], ["ASK_MORE", "PARTIAL_CARRY", "REJECT"], ["PAYER_NAME"], true], "แถว");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const n1 = "visual-svc d.10 (จอ 06 /dorm/payments?room=206 · 1440 · HTTP < 400) — ผู้คุมเทียบ PARITY กับ 06-slip-payments.png";
  if (!base) skip("V-1", n1, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก D.13 + ฉาก D.10 แล้วรันซ้ำด้วย QC_BASE", "MAJOR");
  else {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.10", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const o = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    record("V-1", n1, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status} ${o.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
  }
}

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-d.8", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.11", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.9", args: ["--no-regression"], judge: (out) => { const s = summaryOf(out); return !!s && s.failed.every((id) => id === "S-1" || id === "S-2"); }, note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ D.9'" },
  { s: "qc-svc-d.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.5", judge: (out, code) => code === 0 || judgeNoFail(out), note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.6", judge: (out, code) => code === 0 || judgeNoFail(out), note: "ตรวจสลิปกลาง · decideSlip" },
  { s: "qc-svc-b.8", args: ["--no-regression"], judge: (out) => { const s = summaryOf(out); return !!s && s.failed.every((id) => id === "S-1" || id === "S-2"); }, note: "consumer payment.slip.approved ร่วม · ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ B.8'" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof payL.mod?.onDormSlipApproved === "function" && typeof balL.mod?.billBalances === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (dorm-pay.onDormSlipApproved / balance.billBalances) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D10_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d10-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.10 · ตรวจสลิป/รับเงินหอ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-* ไม่มี QC_BASE · Q-* svcqc ยังไม่มีฉาก D.13 · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
