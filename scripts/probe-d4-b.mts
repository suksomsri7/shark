// PROBE — SVC D.4 reviewer B (โจมตีด้วยหลายโพรเซสจริง) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d4-b.mts
// ข้อมูลใต้ร้าน slug `qc-svc-d4pb-*` + ผู้ใช้ `svc-d4pb-*@shark.local` · ล้างใน finally ทุกครั้ง (+ กวาดค้างตอนเริ่ม) · temp /tmp/svc-d4b-*
// หมวดตาม ledger/svc-briefs/svc-brief-d.4.md §12 R1–R15 + ตัวตรวจเงินหลังทุกฉาก (JV สมดุล · ยอดถือ = ไฟล์ · ย้อน = กลับรายการ ไม่ลบ)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, writeFileSync, appendFileSync, readFileSync, unlinkSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import * as zlib from "node:zlib";
import pg from "pg";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DORM_IDX = "src/lib/modules/dorm/index.ts";
const PARSE_MOD = "src/lib/modules/dorm/import-parse.ts";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const imp = (rel: string): Promise<any> => import(pathToFileURL(join(ROOT, rel)).href);

// ── ด่านฐาน (QC svc เท่านั้น) ──
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  let hn = "";
  try { hn = new URL(process.env[n] ?? "").hostname; } catch { /* */ }
  if (!hn.startsWith(svcQcHostMark()) /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) */) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
if ((process.env.SESSION_SECRET ?? "").length < 32) process.env.SESSION_SECRET = randomBytes(32).toString("hex");

// ═══════════ ค่าแปลง JSON ↔ อาร์กิวเมนต์ ═══════════
function revive(x: any): any {
  if (Array.isArray(x)) return x.map(revive);
  if (x && typeof x === "object") {
    if (typeof x.__date === "string") return new Date(x.__date);
    if (typeof x.__file === "string") return new Uint8Array(readFileSync(x.__file));
    const o: any = {};
    for (const [k, v] of Object.entries(x)) o[k] = revive(v);
    return o;
  }
  return x;
}
const slim = (r: any): any => {
  if (!r || typeof r !== "object") return r;
  return {
    ok: r.ok, code: r.code, status: r.status, duplicate: r.duplicate, reason: typeof r.reason === "string" ? r.reason.slice(0, 160) : undefined,
    blockers: r.blockers, failedRowNo: r.failedRowNo, failedCode: r.failedCode, done: r.done, batchId: r.batchId, added: r.added, runId: r.runId,
    leaseId: r.leaseId, previewHash: r.previewHash, entryId: r.entryId, undone: r.undone,
    results: Array.isArray(r.results) ? r.results.map((x: any) => ({ status: x?.status, readingId: x?.readingId, code: x?.code })) : undefined,
  };
};

// ═══════════ โหมดลูก: แยกไฟล์อย่างเดียว (วัดเวลา/หน่วยความจำ) ═══════════
if (process.env.PROBE_D4B_PARSE) {
  const spec = JSON.parse(process.env.PROBE_D4B_PARSE) as { file: string; cap: number };
  const P = await imp(PARSE_MOD);
  const data = new Uint8Array(readFileSync(spec.file));
  const base = process.resourceUsage().maxRSS;
  const t0 = Date.now();
  let r: any;
  try { r = P.parseImportFile(data, { maxUnzippedBytes: spec.cap }); } catch (e) { r = { threw: errMsg(e) }; }
  const ms = Date.now() - t0;
  console.log(`PARSE ${J({ ms, ok: r?.ok, code: r?.code, rows: r?.rows?.length, cols: r?.headers?.length, threw: r?.threw, baseMaxRssMB: Math.round(base / 1024), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024) })}`);
  process.exit(0);
}

// ═══════════ โหมดลูก: เรียก facade พร้อมกัน (READY → รอไฟล์ go → ยิง) ═══════════
type Call = { m: "dorm" | "acc"; op: string; a: any[]; delayMs?: number };
const goFile = (run: string, key: string) => `/tmp/svc-d4b-go-${run}-${key}`;
if (process.env.PROBE_D4B_CHILD) {
  const spec = JSON.parse(process.env.PROBE_D4B_CHILD) as { run: string; key: string; calls: Call[] };
  try {
    const { prisma } = (await import("@/lib/core/db" as string)) as any;
    await prisma.$queryRawUnsafe("SELECT 1");
    const mods: Record<string, any> = { dorm: await imp(DORM_IDX), acc: await import("@/lib/modules/account" as string) };
    console.log(`READY ${spec.key}`);
    const t0 = Date.now();
    while (!existsSync(goFile(spec.run, spec.key))) { if (Date.now() - t0 > 400_000) process.exit(5); await sleep(5); }
    const outs = await Promise.all(spec.calls.map(async (c) => {
      if (c.delayMs) await sleep(c.delayMs);
      const a = revive(c.a);
      if (c.op === "uploadImport") a[2] = { put: async () => {} };
      const s = Date.now();
      try {
        if (c.op === "uploadMem") {
          const b0 = process.resourceUsage().maxRSS;
          const r = await mods.dorm.uploadImport(a[0], a[1], { put: async () => {} });
          return { op: c.op, r: slim(r), ms: Date.now() - s, startedAt: s, baseMaxRssMB: Math.round(b0 / 1024), maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024) };
        }
        const r = await mods[c.m][c.op](...a);
        return { op: c.op, r: slim(r), ms: Date.now() - s, startedAt: s };
      } catch (e) { return { op: c.op, threw: errMsg(e), ms: Date.now() - s, startedAt: s }; }
    }));
    console.log(`RES ${spec.key} ${JSON.stringify(outs)}`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}

// ═══════════ โพรเซสหลัก ═══════════
const LOG = `/tmp/svc-d4b-probe.out.${process.pid}.log`;
{
  process.stdout.on("error", () => { /* */ });
  const orig = console.log.bind(console);
  console.log = (...x: unknown[]) => { try { appendFileSync(LOG, `${x.map((y) => (typeof y === "string" ? y : J(y))).join(" ")}\n`); } catch { /* */ } try { orig(...x); } catch { /* */ } };
  console.log(`(probe log: ${LOG} · start ${new Date().toISOString()})`);
}
const RUN = Date.now().toString(36);
const tmpFiles: string[] = [];
type Kid = { key: string; proc: ChildProcess; ready: Promise<boolean>; done: Promise<any[]>; errs: string[] };
function spawnKid(key: string, calls: Call[]): Kid {
  const errs: string[] = [];
  const proc = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, PROBE_D4B_CHILD: JSON.stringify({ run: RUN, key, calls }) }, stdio: ["ignore", "pipe", "pipe"] });
  let readyRes: (v: boolean) => void = () => {};
  const ready = new Promise<boolean>((r) => { readyRes = r; });
  let res: any[] | null = null;
  createInterface({ input: proc.stdout! }).on("line", (l) => {
    if (l === `READY ${key}`) readyRes(true);
    else if (l.startsWith(`RES ${key} `)) { try { res = JSON.parse(l.slice(`RES ${key} `.length)); } catch { res = [{ childFail: "parse" }]; } }
    else if (l.startsWith("CHILD_ERR")) errs.push(l);
  });
  let tail = "";
  proc.stderr!.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-800); });
  const done = new Promise<any[]>((resolve) => {
    proc.on("exit", (code, sig) => {
      readyRes(false);
      if (code !== 0) errs.push(`exit ${code}/${sig} ${tail.split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 300)}`);
      resolve(res ?? calls.map((c) => ({ op: c.op, childFail: `exit=${code}/${sig} ${errs.join(" ").slice(0, 200)}` })));
    });
  });
  return { key, proc, ready, done, errs };
}
const go = (key: string) => { const f = goFile(RUN, key); writeFileSync(f, "go"); tmpFiles.push(f); };
/** ยิงจากหลายโพรเซสพร้อมกัน (+ inProc ยิงพร้อมกันในโพรเซสหลักเมื่อส่ง) */
async function fan(key: string, perChild: Call[][], inProc?: () => Promise<any[]>): Promise<{ kids: any[]; mine: any[] }> {
  const kids = perChild.map((calls, i) => spawnKid(`${key}${i}`, calls));
  const ok = await Promise.all(kids.map((k) => Promise.race([k.ready, sleep(300_000).then(() => false)])));
  if (ok.some((x) => !x)) {
    for (const k of kids) if (k.proc.exitCode === null) k.proc.kill("SIGKILL");
    throw new Error(`ลูกไม่พร้อม ${ok.filter(Boolean).length}/${kids.length} ${kids.flatMap((k) => k.errs).slice(0, 2).join(" · ")}`);
  }
  for (const k of kids) go(k.key);
  const mineP = inProc ? inProc() : Promise.resolve([]);
  const res = await Promise.all(kids.map((k) => Promise.race([k.done, sleep(400_000).then(() => { if (k.proc.exitCode === null) k.proc.kill("SIGKILL"); return [{ childFail: "timeout" }]; })])));
  return { kids: res.flat(), mine: await mineP };
}

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown = "") => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : "❌ BREACH"} [${id}] (${sev}) ${what}${d ? ` — ${d.slice(0, 2000)}` : ""}`);
};
const notes: string[] = [];
const note = (s: string) => { notes.push(s); console.log(`  ℹ️  ${s}`); };
const BADRX = /P2028|P2024|P2002|P2034|40P01|deadlock|timed out|Unable to start a transaction|Transaction already closed/i;
const codeOf = (x: any) => (x?.threw ? "THREW" : x?.childFail ? "CHILDFAIL" : x?.r === null ? "null" : x?.r?.ok === true ? (x.r.duplicate ? "OK_DUP" : "OK") : x?.r?.code ?? "?");
const badOf = (rs: any[]) => rs.filter((x) => x?.threw || x?.childFail || ["UNAVAILABLE", "INTERNAL", "ERROR"].includes(String(x?.r?.code)) || BADRX.test(J(x)));
const tally = (rs: any[]) => { const t: Record<string, number> = {}; for (const x of rs) { const k = `${x?.op ?? "?"}:${codeOf(x)}`; t[k] = (t[k] ?? 0) + 1; } return t; };
const wrapIn = (op: string, r: any) => ({ op, r: slim(r) });
const step = async (id: string, fn: () => Promise<void>) => {
  console.log(`\n── ${id} ──`);
  try { await fn(); } catch (e) { rec(`${id}-ERR`, false, "PROBE", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", e instanceof Error ? `${e.message} ${String(e.stack).split("\n").slice(1, 3).join(" ")}` : String(e)); }
};

// ═══════════ โมดูล ═══════════
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const dorm: any = await imp(DORM_IDX);
const PARSE: any = await imp(PARSE_MOD);
const ACC: any = await import("@/lib/modules/account" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const CSV: any = await import("@/lib/core/csv" as string);
const SV: any = await import("./svc-qc-data.mjs" as string);
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;
const direct = () => new pg.Client({ connectionString: process.env.DIRECT_URL });

// ═══════════ วันที่ไทย ═══════════
const DAY = 86_400_000;
const bkkYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = bkkYmd(new Date());
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const CUR_P = TODAY.slice(0, 7);

// ═══════════ ไฟล์ ═══════════
const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const enc = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const csvBytes = (headers: string[], rows: string[][]) => enc("﻿" + [headers, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n");
const crc32 = (b: Uint8Array): number => (zlib as any).crc32(b) >>> 0;
type ZE = { name: string; data: Uint8Array; deflate?: boolean; declaredSize?: number };
function zipBytes(entries: ZE[]): Uint8Array {
  const parts: Buffer[] = []; const central: Buffer[] = []; let off = 0;
  for (const e of entries) {
    const nameB = Buffer.from(e.name, "utf8"); const raw = Buffer.from(e.data);
    const comp = e.deflate ? zlib.deflateRawSync(raw, { level: 9 }) : raw; const crc = crc32(raw); const size = e.declaredSize ?? raw.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
    central.push(ch, nameB);
    off += lh.length + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central); const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]));
}
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colRef = (i: number) => { let s = ""; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const xlsxShell = (sheetXml: string | Uint8Array, sst?: string, extra: ZE[] = []): Uint8Array => zipBytes([
  { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`) },
  { name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ผู้เช่า" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
  { name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="sharedStrings" Target="sharedStrings.xml"/></Relationships>`) },
  { name: "xl/worksheets/sheet1.xml", data: typeof sheetXml === "string" ? enc(sheetXml) : sheetXml, deflate: true },
  ...(sst !== undefined ? [{ name: "xl/sharedStrings.xml", data: enc(sst), deflate: true }] : []),
  ...extra,
]);
function xlsxOf(headers: string[], rows: string[][]): Uint8Array {
  const all = [headers, ...rows];
  const cell = (c: string, ref: string) => (c === "" ? "" : /^(0|[1-9]\d*)(\.\d+)?$/.test(c) ? `<c r="${ref}"><v>${Number(c)}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => cell(c, `${colRef(ci)}${ri + 1}`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return xlsxShell(xml);
}
const tmpWrite = (name: string, b: Uint8Array) => { const p = `/tmp/svc-d4b-${RUN}-${name}.bin`; writeFileSync(p, b); tmpFiles.push(p); return p; };

const MAP: Record<string, string> = { "0": "room", "1": "tenantName", "2": "phone", "3": "startDate", "4": "rent", "5": "deposit", "6": "elecReading", "7": "waterReading", "8": "arrears", "9": "IGNORE", "10": "note" };
const SAMPLE0 = SV.sqcImportSample(TODAY, { variant: "clean" });
const READ_DATE: string = SAMPLE0.readDate;
const READ_P = READ_DATE.slice(0, 7);
const OPTS = { dateFormat: "BE_DMY", meterReadDate: READ_DATE, depositChannel: "TRANSFER" };
const fileOf = (pre: string, rooms: string[]) => { const s = SV.sqcImportSample(TODAY, { variant: "clean", phonePrefix: pre }); return { headers: s.headers as string[], rows: (s.rows as string[][]).filter((r) => rooms.includes(r[0])) }; };
const depOf = (rows: string[][]) => rows.filter((r) => r[1] !== "").reduce((s, r) => s + Math.round(Number(r[5] || 0) * 100), 0);
const leasesOf = (rows: string[][]) => rows.filter((r) => r[1] !== "").length;
const phoneNorm = (p: string) => p.replace(/\D/g, "");
const ROOMS8 = ["101", "102", "103", "104", "105", "106", "107", "108"];

// ═══════════ ล้าง ═══════════
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
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* */ } };
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

const tenantIds: string[] = [];
let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d4pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d4pb-" } } });
  {
    const t: any[] = await prisma.$queryRawUnsafe(`SELECT to_regclass('"DormImportBatch"')::text AS t`);
    if (!t[0]?.t) throw new Error("ไม่มีตาราง DormImportBatch ในฐาน QC (migration svc_d4 ยังไม่ลง) — probe ทำต่อไม่ได้");
  }

  // ═══════════ fixtures ═══════════
  const stamp = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D4 ${tag}`, slug: `qc-svc-d4pb-${tag}-${stamp}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const BOOK = { [A]: await mkBook(A, `บัญชี PB D4 A ${stamp}`), [B]: await mkBook(B, `บัญชี PB D4 B ${stamp}`) } as Record<string, string>;
  let unitSeq = 0;
  const mkDorm = async (tenantId: string, tag: string, type = "DORM") => {
    const u = (await prisma.businessUnit.create({ data: { tenantId, type, name: `หอ PB4 ${tag}`, slug: `pb4${tag}-${stamp}-${++unitSeq}` } })).id as string;
    if (type === "DORM") await prisma.accountSystemLink.create({ data: { tenantId, systemId: BOOK[tenantId], linkedKind: "BUSINESS", linkedId: u, enabled: true } });
    return u;
  };
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d4pb-${stamp}-${key}@shark.local`, name: `PB4 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    return u.id as string;
  };
  const setU = async (tenantId: string, unitId: string, key: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId: unitId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId: unitId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d4" } });
  };
  const OWN = await mkUser("owner-a", A, "OWNER", ["*"]);
  const OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
  const cO = { tenantId: A, actorUserId: OWN }, cB = { tenantId: B, actorUserId: OWNB };

  // ── facade ──
  const noop = async () => {};
  const up = (ctx: any, unitId: string, data: Uint8Array, fileName = "ทะเบียน.csv") => dorm.uploadImport(ctx, { unitId, fileName, contentType: fileName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv", data }, { put: noop });
  const pv = (ctx: any, unitId: string, batchId: string, extra: Record<string, unknown> = {}) => dorm.previewImport(ctx, { unitId, batchId, mapping: MAP, options: OPTS, ...extra });
  const cr = (ctx: any, unitId: string, batchId: string, previewHash: string, legalAck?: any) => dorm.createImport(ctx, { unitId, batchId, previewHash, ...(legalAck ? { legalAck } : {}) });
  const ud = (ctx: any, unitId: string, batchId: string, reason = "ทดสอบย้อนกลับการนำเข้า probe", now?: Date) => dorm.undoImport(ctx, { unitId, batchId, reason }, now ? { now } : undefined);
  const prepFile = async (ctx: any, unitId: string, bytes: Uint8Array, fileName = "ทะเบียน.csv", extra: Record<string, unknown> = {}) => {
    const u = await up(ctx, unitId, bytes, fileName);
    if (!u?.ok) throw new Error(`upload ล้ม ${J(slim(u))}`);
    const p = await pv(ctx, unitId, u.batchId, extra);
    if (!p?.ok) throw new Error(`preview ล้ม ${J(slim(p))}`);
    return { batchId: u.batchId as string, hash: p.previewHash as string, p, u };
  };
  const batchRow = (id: string) => prisma.dormImportBatch.findUnique({ where: { id } });
  const expireClaim = (id: string) => prisma.$executeRawUnsafe(`UPDATE "DormImportBatch" SET "claimUntil" = now() - interval '10 minutes' WHERE id = $1`, id);
  /** ทำต่อจน CREATED (ดัน claim หมดอายุเมื่อ BUSY) */
  const finishCreate = async (unitId: string, batchId: string, hash: string, tries = 5) => {
    let last: any = null;
    for (let i = 0; i < tries; i++) {
      const b = await batchRow(batchId);
      if (b?.status === "CREATED") return { status: "CREATED", last };
      if (b?.status === "CREATING" && b.claimToken) await expireClaim(batchId);
      let h = hash;
      if (b?.status === "DRAFT" || b?.status === "UNDONE") { const p = await pv(cO, unitId, batchId); h = p?.previewHash ?? hash; }
      last = await cr(cO, unitId, batchId, h);
    }
    return { status: (await batchRow(batchId))?.status, last };
  };
  const finishUndo = async (unitId: string, batchId: string, tries = 4) => {
    let last: any = null;
    for (let i = 0; i < tries; i++) {
      const b = await batchRow(batchId);
      if (b?.status === "UNDONE") return { status: "UNDONE", last };
      if ((b?.status === "UNDOING" || b?.status === "CREATING") && b.claimToken) await expireClaim(batchId);
      last = await ud(cO, unitId, batchId);
      if (last?.code === "UNDO_BLOCKED") break;
    }
    return { status: (await batchRow(batchId))?.status, last };
  };

  // ═══════════ ตัวตรวจเงิน/ความสอดคล้อง (หลังทุกฉาก) ═══════════
  const seenJv = new Map<string, string>(); // id → tenantId
  const LIVE = ["DRAFT", "ACTIVE", "NOTICE"];
  const impBatchOf = (l: any): string | null => (l?.policySnapshot as any)?.import?.batchId ?? null;
  async function invariants(tenantId: string, unitId: string, o: { expectHeld?: Record<string, number> } = {}): Promise<string[]> {
    const P: string[] = [];
    const jvs = await prisma.accountJournalEntry.findMany({ where: { tenantId }, select: { id: true, status: true, reversalOfId: true, refType: true, refId: true, idempotencyKey: true, lines: { select: { debit: true, credit: true } } } });
    const jvIds = new Set(jvs.map((e: any) => e.id));
    for (const e of jvs) {
      const d = e.lines.reduce((s: number, l: any) => s + Number(l.debit) - Number(l.credit), 0);
      if (d !== 0) P.push(`JV ไม่สมดุล ${e.id} Δ${d}`);
      seenJv.set(e.id, tenantId);
    }
    for (const [id, t] of seenJv) if (t === tenantId && !jvIds.has(id)) P.push(`JV ถูกลบ ${id}`);
    const leases = await prisma.dormLease.findMany({ where: { tenantId, unitId }, select: { id: true, roomId: true, status: true, depositSatang: true, endReason: true, policySnapshot: true } });
    const perRoom = new Map<string, number>();
    for (const l of leases) if (LIVE.includes(l.status)) perRoom.set(l.roomId, (perRoom.get(l.roomId) ?? 0) + 1);
    for (const [r, n] of perRoom) if (n > 1) P.push(`ห้อง ${r} มีสัญญามีผล ${n}`);
    const depJ = jvs.filter((e: any) => e.refType === "DormSecurityDeposit" && String(e.refId).startsWith(`${unitId}:`));
    const batches = await prisma.dormImportBatch.findMany({ where: { tenantId, unitId } });
    const bStatus = new Map<string, string>(batches.map((b: any) => [b.id, b.status]));
    const heldBy: Record<string, number> = {};
    for (const l of leases) {
      const held = await ACC.securityDepositHeld({ tenantId, unitId, leaseId: l.id });
      const mine = depJ.filter((e: any) => e.refId === `${unitId}:${l.id}`);
      const recv = mine.filter((e: any) => !e.reversalOfId && String(e.idempotencyKey ?? "").includes("#RECEIVE:"));
      const settled = mine.some((e: any) => !e.reversalOfId && String(e.idempotencyKey ?? "").includes("#SETTLE:") && e.status !== "REVERSED");
      if (recv.length > 1) P.push(`สัญญา ${l.id} JV รับประกัน ${recv.length} รายการ`);
      if (l.status === "ACTIVE" && !settled && held !== l.depositSatang) P.push(`สัญญา ACTIVE ${l.id} ยอดถือ ${held} ≠ ประกัน ${l.depositSatang}`);
      if (l.status !== "ACTIVE" && l.status !== "NOTICE" && held !== 0) P.push(`สัญญา ${l.status} ${l.id} ยังถือเงิน ${held}`);
      if (held < 0) P.push(`สัญญา ${l.id} ยอดถือติดลบ ${held}`);
      if (String(l.endReason ?? "").startsWith("IMPORT_UNDONE")) {
        for (const r of recv) {
          const revs = jvs.filter((e: any) => e.reversalOfId === r.id).length;
          if (r.status !== "REVERSED" || revs !== 1) P.push(`สัญญาย้อน ${l.id} JV รับ ${r.id} status=${r.status} กลับรายการ=${revs}`);
        }
        const bills = await prisma.dormBill.count({ where: { tenantId, unitId, leaseId: l.id } });
        if (bills) P.push(`บิล ${bills} ใบบนสัญญาที่ย้อนแล้ว ${l.id}`);
      }
      const b = impBatchOf(l);
      if (b && LIVE.includes(l.status)) {
        heldBy[b] = (heldBy[b] ?? 0) + held;
        const st = bStatus.get(b);
        if (st === "UNDONE") P.push(`สัญญามีผล ${l.id} (${l.status}) ของชุดที่ UNDONE`);
        if (l.status === "DRAFT" && (st === "CREATED" || st === "UNDONE")) P.push(`สัญญา DRAFT ค้าง ${l.id} ชุด ${st}`);
      }
    }
    const meters = await prisma.dormMeter.findMany({ where: { tenantId, unitId, removedAt: null, roomId: { not: null } }, select: { id: true, note: true, room: { select: { active: true } } } });
    for (const m of meters) if (m.room && !m.room.active) P.push(`มิเตอร์ใช้งาน ${m.id} บนห้องที่ปิดแล้ว (note=${m.note})`);
    for (const b of batches) {
      const m: any = b.manifest;
      const rows: any[] = m && typeof m === "object" && m.rows ? Object.values(m.rows) : [];
      const live = leases.filter((l: any) => impBatchOf(l) === b.id && LIVE.includes(l.status)).map((l: any) => l.id).sort();
      if (b.status === "CREATED") {
        const notDone = rows.filter((r) => r.status !== "DONE").length;
        const man = rows.filter((r) => typeof r.leaseId === "string").map((r) => r.leaseId).sort();
        if (notDone) P.push(`ชุด ${b.id} CREATED แต่ manifest ยังไม่ DONE ${notDone} แถว`);
        if (J(man) !== J(live)) P.push(`ชุด ${b.id} manifest สัญญา ${man.length} ≠ ฐาน ${live.length}`);
      }
      if (b.status === "UNDONE") {
        const orphanM = await prisma.dormMeter.count({ where: { tenantId, unitId, note: `import:${b.id}`, removedAt: null } });
        if (orphanM) P.push(`ชุด ${b.id} UNDONE แต่มิเตอร์ของชุดยังใช้งาน ${orphanM}`);
        const roomIds = rows.filter((r) => r.roomId && r.roomCreated).map((r) => r.roomId);
        const act = roomIds.length ? await prisma.hotelRoom.count({ where: { id: { in: roomIds }, active: true } }) : 0;
        if (act) P.push(`ชุด ${b.id} UNDONE แต่ห้องที่ชุดสร้างยัง active ${act}`);
      }
      if (b.status === "CREATED" || b.status === "UNDONE") {
        const exp = o.expectHeld?.[b.id];
        if (typeof exp === "number" && (heldBy[b.id] ?? 0) !== (b.status === "UNDONE" ? 0 : exp)) P.push(`ชุด ${b.id} ยอดถือรวม ${heldBy[b.id] ?? 0} ≠ คาด ${b.status === "UNDONE" ? 0 : exp}`);
      }
    }
    return P;
  }
  const money = async (id: string, tenantId: string, unitIds: string[], o: { expectHeld?: Record<string, number> } = {}) => {
    const P: string[] = [];
    for (const u of unitIds) P.push(...(await invariants(tenantId, u, o)).map((x) => `[${u.slice(-6)}] ${x}`));
    rec(`${id}-M`, !P.length, "BLOCKER", "ตัวตรวจเงิน/ความสอดคล้อง: JV สมดุล · ไม่มี JV ถูกลบ · สัญญามีผล 1/ห้อง · ACTIVE ยอดถือ = ประกัน · ย้อน = JV รับ REVERSED + กลับรายการ 1 · ไม่มีบิลบนสัญญาที่ย้อน · manifest = ฐาน · ไม่มีของค้างหลัง UNDONE", P.slice(0, 12));
  };
  const blockedCount = async (c: pg.Client, holderPid: number) => Number((await c.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`, [holderPid])).rows[0].n);
  const waitBlocked = async (c: pg.Client, holderPid: number, ms = 90_000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await blockedCount(c, holderPid)) > 0) return true; await sleep(50); } return false; };

  // ═══════════ R1 createImport 12 ทาง (4 โพรเซส × 3) + 30 ทางในโพรเซสเดียว ═══════════
  const U1 = await mkDorm(A, "r1");
  const F1 = fileOf("080", ROOMS8);
  let b1 = "", h1 = "";
  await step("R1", async () => {
    const x = await prepFile(cO, U1, csvBytes(F1.headers, F1.rows));
    b1 = x.batchId; h1 = x.hash;
    const call = (): Call => ({ m: "dorm", op: "createImport", a: [cO, { unitId: U1, batchId: b1, previewHash: h1 }] });
    const { kids, mine } = await fan("r1", Array.from({ length: 4 }, () => [call(), call(), call()]), async () => {
      const rs = await Promise.all(Array.from({ length: 30 }, async () => { try { return wrapIn("createImport", await cr(cO, U1, b1, h1)); } catch (e) { return { op: "createImport", threw: errMsg(e) }; } }));
      return rs;
    });
    const all = [...kids, ...mine];
    const workers = all.filter((x) => x?.r?.ok === true && x.r.duplicate === false).length;
    const others = all.filter((x) => !(x?.r?.ok === true && x.r.duplicate === false));
    const okOthers = others.every((x) => (x?.r?.ok === true && x.r.duplicate === true) || x?.r?.code === "BUSY");
    const fin = await finishCreate(U1, b1, h1);
    const leases = await prisma.dormLease.count({ where: { tenantId: A, unitId: U1, status: { in: LIVE } } });
    const rooms = await prisma.hotelRoom.count({ where: { tenantId: A, unitId: U1, active: true } });
    const jv = await prisma.accountJournalEntry.count({ where: { tenantId: A, refType: "DormSecurityDeposit", refId: { startsWith: `${U1}:` } } });
    const meters = await prisma.dormMeter.count({ where: { tenantId: A, unitId: U1, removedAt: null } });
    const readings = await prisma.dormMeterReading.count({ where: { tenantId: A, unitId: U1 } });
    rec("R1", workers <= 1 && okOthers && !badOf(all).length && fin.status === "CREATED" && leases === leasesOf(F1.rows) && rooms === 8 && jv === leasesOf(F1.rows) && meters === 16 && readings === 16, "BLOCKER",
      "createImport ชุดเดียว 12 ทาง/4 โพรเซส + 30 ทางในโพรเซส ⇒ ผู้ทำจริง ≤1 · ที่เหลือ BUSY/duplicate · ห้อง/สัญญา/JV/มิเตอร์/เลข = แผนพอดี · 0 throw/P2028/P2024",
      { tally: tally(all), workers, bad: badOf(all).slice(0, 3), final: fin.status, leases, rooms, jv, meters, readings });
    const again = await Promise.all(Array.from({ length: 6 }, () => cr(cO, U1, b1, h1)));
    rec("R1b", again.every((r: any) => r?.ok === true && r.duplicate === true), "MAJOR", "createImport ซ้ำหลัง CREATED 6 ทาง ⇒ duplicate:true ทั้งหมด", again.map((r: any) => `${r?.ok}/${r?.duplicate}/${r?.code ?? ""}`));
    await money("R1", A, [U1], { expectHeld: { [b1]: depOf(F1.rows) } });
  });

  // ═══════════ R3 undoImport 12 ทาง (4 โพรเซส) + 30 ทางในโพรเซส ═══════════
  await step("R3", async () => {
    const recvBefore = (await prisma.accountJournalEntry.findMany({ where: { tenantId: A, refType: "DormSecurityDeposit", refId: { startsWith: `${U1}:` }, reversalOfId: null } })).map((e: any) => e.id);
    const call = (): Call => ({ m: "dorm", op: "undoImport", a: [cO, { unitId: U1, batchId: b1, reason: "probe ย้อนพร้อมกัน R3" }] });
    const { kids, mine } = await fan("r3", Array.from({ length: 4 }, () => [call(), call(), call()]), async () =>
      Promise.all(Array.from({ length: 30 }, async () => { try { return wrapIn("undoImport", await ud(cO, U1, b1, "probe ย้อนพร้อมกัน R3")); } catch (e) { return { op: "undoImport", threw: errMsg(e) }; } })));
    const all = [...kids, ...mine];
    const workers = all.filter((x) => x?.r?.ok === true && x.r.duplicate === false).length;
    const okOthers = all.filter((x) => !(x?.r?.ok === true && x.r.duplicate === false)).every((x) => (x?.r?.ok === true && x.r.duplicate === true) || x?.r?.code === "BUSY");
    const fin = await finishUndo(U1, b1);
    const still = await prisma.accountJournalEntry.findMany({ where: { id: { in: recvBefore } } });
    const revs = await prisma.accountJournalEntry.count({ where: { reversalOfId: { in: recvBefore } } });
    rec("R3", workers <= 1 && okOthers && !badOf(all).length && fin.status === "UNDONE" && still.length === recvBefore.length && still.every((e: any) => e.status === "REVERSED") && revs === recvBefore.length, "BLOCKER",
      "undoImport 12 ทาง/4 โพรเซส + 30 ทางในโพรเซส ⇒ ย้อนครั้งเดียว · JV กลับรายการ = JV รับ พอดี · ไม่มี JV ถูกลบ",
      { tally: tally(all), workers, final: fin.status, recv: recvBefore.length, still: still.length, revs, bad: badOf(all).slice(0, 3) });
    await money("R3", A, [U1], { expectHeld: { [b1]: depOf(F1.rows) } });
  });

  // ═══════════ R4 undo ∥ create (CREATED → แข่ง · แล้ว UNDONE → แข่ง) ═══════════
  await step("R4", async () => {
    const U4 = await mkDorm(A, "r4");
    const F = fileOf("082", ["101", "102", "103", "104", "105", "106"]);
    const x = await prepFile(cO, U4, csvBytes(F.headers, F.rows));
    const c0 = await cr(cO, U4, x.batchId, x.hash);
    if (!c0?.ok) throw new Error(`สร้างตั้งต้นล้ม ${J(slim(c0))}`);
    const state = async () => {
      const ls = await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U4 } });
      const mine = ls.filter((l: any) => impBatchOf(l) === x.batchId);
      const live = mine.filter((l: any) => l.status === "ACTIVE").length, dead = mine.filter((l: any) => l.status === "CANCELLED").length, draft = mine.filter((l: any) => l.status === "DRAFT").length;
      const b = await batchRow(x.batchId);
      return { live, dead, draft, status: b?.status, holder: !!b?.claimToken };
    };
    const rounds: any[] = [];
    for (let round = 0; round < 2; round++) {
      const p = await pv(cO, U4, x.batchId);
      const cc = (): Call => ({ m: "dorm", op: "createImport", a: [cO, { unitId: U4, batchId: x.batchId, previewHash: p?.previewHash ?? x.hash }] });
      const uu = (): Call => ({ m: "dorm", op: "undoImport", a: [cO, { unitId: U4, batchId: x.batchId, reason: "probe แข่ง R4" }] });
      const { kids } = await fan(`r4${round}`, [[uu(), cc(), uu()], [cc(), uu(), cc()], [uu(), uu(), cc()], [cc(), cc(), uu()]]);
      const s = await state();
      const half = !((s.live === 6 && s.status === "CREATED") || (s.live === 0 && s.draft === 0 && s.status === "UNDONE"));
      rounds.push({ round, tally: tally(kids), s, half, bad: badOf(kids).slice(0, 2) });
      if (half) { await finishCreate(U4, x.batchId, x.hash).catch(() => null); }
    }
    rec("R4", rounds.every((r) => !r.half && !r.bad.length), "BLOCKER", "undo ∥ create 6+6 (4 โพรเซส) บนชุด CREATED แล้วบนชุด UNDONE ⇒ สถานะสุดท้ายของผู้ชนะเดียว (ACTIVE ครบ+CREATED หรือ CANCELLED ครบ+UNDONE) — ห้ามครึ่ง ๆ", rounds);
    await money("R4", A, [U4], { expectHeld: { [x.batchId]: depOf(F.rows) } });
  });

  // ═══════════ R2 สองไฟล์ห้องทับ (CSV vs XLSX ข้อมูลเดียวกัน + ห้องเพิ่ม 2) ═══════════
  await step("R2", async () => {
    const U2 = await mkDorm(A, "r2");
    const F = fileOf("083", ["101", "102", "103", "104", "105", "106"]);
    const extra = [["113", "ทดสอบ ห้องเพิ่มหนึ่ง", "083-113-4410", F.rows[0][3], "4500", "9000", "1500", "300", "", "", ""], ["114", "ทดสอบ ห้องเพิ่มสอง", "083-114-4410", F.rows[0][3], "4500", "9000", "1501", "301", "", "", ""]];
    const xa = await prepFile(cO, U2, csvBytes(F.headers, F.rows), "a.csv");
    const xb = await prepFile(cO, U2, xlsxOf(F.headers, [...F.rows, ...extra]), "b.xlsx");
    const { kids } = await fan("r2", [
      [{ m: "dorm", op: "createImport", a: [cO, { unitId: U2, batchId: xa.batchId, previewHash: xa.hash }] }, { m: "dorm", op: "createImport", a: [cO, { unitId: U2, batchId: xa.batchId, previewHash: xa.hash }] }],
      [{ m: "dorm", op: "createImport", a: [cO, { unitId: U2, batchId: xb.batchId, previewHash: xb.hash }] }, { m: "dorm", op: "createImport", a: [cO, { unitId: U2, batchId: xb.batchId, previewHash: xb.hash }] }],
    ]);
    const fa = await finishCreate(U2, xa.batchId, xa.hash), fb = await finishCreate(U2, xb.batchId, xb.hash);
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: A, unitId: U2, active: true }, select: { number: true } });
    const dupRooms = rooms.length - new Set(rooms.map((r: any) => r.number)).size;
    const leases = await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U2, status: { in: LIVE } } });
    const parties = await prisma.party.findMany({ where: { tenantId: A, phoneNorm: { startsWith: "083" } }, select: { phoneNorm: true } });
    const dupParty = parties.length - new Set(parties.map((p: any) => p.phoneNorm)).size;
    let held = 0;
    for (const l of leases) held += await ACC.securityDepositHeld({ tenantId: A, unitId: U2, leaseId: l.id });
    const want = depOf(F.rows) + 1_800_000;
    rec("R2", !badOf(kids).length && fa.status === "CREATED" && fb.status === "CREATED" && dupRooms === 0 && rooms.length === 8 && leases.length === 8 && dupParty === 0 && held === want, "BLOCKER",
      "สองไฟล์ห้องทับ (CSV 6 ห้อง ∥ XLSX 6 ห้องเดิม + 2 ใหม่) สร้างพร้อมกัน ⇒ ไม่มีห้อง/สัญญา/Party ซ้ำ · ยอดประกันรวม = ไม่ซ้ำ",
      { tally: tally(kids), fa: fa.status, fb: fb.status, faLast: slim(fa.last), fbLast: slim(fb.last), rooms: rooms.length, dupRooms, leases: leases.length, dupParty, held, want });
    await money("R2", A, [U2]);
  });

  // ═══════════ R5 SIGKILL ตัวสร้างกลางแถว → ทำต่อ / ย้อนตรง ═══════════
  /** lock: party = ล็อก advisory เบอร์ของแถวเป้า (ค้างใน createLease) · tenant = แถว Tenant (ค้างใน moveIn = เงิน) · import = ล็อกหน่วยหลัง R1 ของแถวเป้า (ค้างที่ tx R2 หลังเงิน+มิเตอร์) */
  const killCase = async (id: string, pre: string, how: "party" | "tenant" | "import", target: string, after: "resume" | "undo") => {
    const U = await mkDorm(A, `k${id.toLowerCase()}`);
    const rooms = ["101", "102", "103", "104", "105"];
    const F = fileOf(pre, rooms);
    const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
    const targetRow = F.rows.findIndex((r) => r[0] === target) + 2;
    const tRow = F.rows.find((r) => r[0] === target)!;
    const hc = direct(); await hc.connect();
    const mon = direct(); await mon.connect();
    let phase = "";
    try {
      const hpid = Number((await hc.query("SELECT pg_backend_pid() AS p")).rows[0].p);
      await hc.query("BEGIN");
      if (how === "party") await hc.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`dorm.party:${A}:ph:${phoneNorm(tRow[2])}`]);
      if (how === "tenant") await hc.query(`SELECT id FROM "Tenant" WHERE id = $1 FOR UPDATE`, [A]);
      const kid = spawnKid(`${id}c`, [{ m: "dorm", op: "createImport", a: [cO, { unitId: U, batchId: x.batchId, previewHash: x.hash }] }]);
      if (!(await kid.ready)) throw new Error(`ลูกไม่พร้อม ${kid.errs.join(" ")}`);
      go(kid.key);
      if (how === "import") {
        const t0 = Date.now();
        for (;;) {
          const b = await batchRow(x.batchId);
          if ((b?.manifest as any)?.rows?.[String(targetRow)]) break;
          if (Date.now() - t0 > 120_000 || b?.status === "CREATED") throw new Error(`ไม่เห็นแถว ${targetRow} เริ่ม (status=${b?.status})`);
          await sleep(10);
        }
        await hc.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`dorm.import:${U}`]);
      }
      const blocked = await waitBlocked(mon, hpid);
      const ls = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U } })).filter((l: any) => impBatchOf(l) === x.batchId);
      const tl = ls.find((l: any) => (l.policySnapshot as any)?.import?.rowNo === targetRow);
      const jvN = await prisma.accountJournalEntry.count({ where: { tenantId: A, refType: "DormSecurityDeposit", refId: { startsWith: `${U}:` } } });
      const mN = await prisma.dormMeter.count({ where: { tenantId: A, unitId: U, removedAt: null } });
      phase = `blocked=${blocked} leases=${ls.length} target=${tl ? tl.status : "none"} jv=${jvN} meters=${mN}`;
      kid.proc.kill("SIGKILL");
      await kid.done;
      await hc.query("COMMIT");
    } finally {
      try { await hc.query("ROLLBACK"); } catch { /* */ }
      await hc.end().catch(() => null);
      await mon.end().catch(() => null);
    }
    await sleep(1500);
    const busyNow = await cr(cO, U, x.batchId, x.hash);
    const pvNow = await pv(cO, U, x.batchId);
    const snapAfterKill = await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U } });
    note(`${id} (${how}@${target}) ตอนฆ่า: ${phase} · หลังฆ่า createImport=${busyNow?.code ?? busyNow?.ok} preview=${pvNow?.code ?? pvNow?.ok} สัญญาในฐาน=${snapAfterKill.length}`);
    rec(`${id}-busy`, busyNow?.ok === false && busyNow.code === "BUSY", "MAJOR", `${id}: ทันทีหลังฆ่า (claim ยังไม่หมด) createImport ⇒ BUSY (ไม่ทำซ้อน)`, slim(busyNow));
    await expireClaim(x.batchId);
    if (after === "resume") {
      const r = await cr(cO, U, x.batchId, x.hash);
      const fin = r?.ok ? { status: "CREATED" } : await finishCreate(U, x.batchId, x.hash);
      const ls = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U } })).filter((l: any) => impBatchOf(l) === x.batchId);
      const live = ls.filter((l: any) => l.status === "ACTIVE");
      const extraDead = ls.filter((l: any) => l.status !== "ACTIVE");
      rec(id, r?.ok === true && fin.status === "CREATED" && live.length === leasesOf(F.rows) && new Set(live.map((l: any) => l.roomId)).size === live.length && extraDead.length === 0, "BLOCKER",
        `${id}: SIGKILL ตัวสร้าง (${how}@${target}) → claim หมด → createImport ทำต่อจนครบ · รับสัญญาค้างเป็นของชุด (ไม่ซ้ำ)`,
        { resume: slim(r), final: fin.status, live: live.length, want: leasesOf(F.rows), nonActive: extraDead.map((l: any) => l.status), phase });
      await money(id, A, [U], { expectHeld: { [x.batchId]: depOf(F.rows) } });
      const u = await ud(cO, U, x.batchId, "probe ย้อนหลังทำต่อ");
      const ls2 = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U } })).filter((l: any) => impBatchOf(l) === x.batchId);
      rec(`${id}-undo`, u?.ok === true && ls2.every((l: any) => l.status === "CANCELLED"), "BLOCKER", `${id}: undo หลังทำต่อ ⇒ ย้อนครบรวมแถวที่ค้าง`, { undo: slim(u), statuses: ls2.map((l: any) => l.status) });
      await money(`${id}-undo`, A, [U]);
    } else {
      const u = await ud(cO, U, x.batchId, "probe ย้อนตรงหลังตัวสร้างตาย");
      const ls = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U } })).filter((l: any) => impBatchOf(l) === x.batchId);
      const orphanMeters = await prisma.dormMeter.count({ where: { tenantId: A, unitId: U, removedAt: null, note: `import:${x.batchId}` } });
      const orphanReads = await prisma.dormMeterReading.count({ where: { tenantId: A, unitId: U, source: "IMPORT" } });
      const roomsAct = await prisma.hotelRoom.count({ where: { tenantId: A, unitId: U, active: true } });
      rec(id, u?.ok === true && ls.every((l: any) => l.status === "CANCELLED") && orphanMeters === 0 && orphanReads === 0 && roomsAct === 0, "MAJOR",
        `${id}: SIGKILL ตัวสร้าง (${how}@${target}) → undo ตรงจาก CREATING ไม่มีผู้ถือ ⇒ ย้อนครบ (สัญญา · เงิน · ห้อง · มิเตอร์/เลขของแถวที่ค้าง)`,
        { undo: slim(u), statuses: ls.map((l: any) => l.status), orphanMeters, orphanReads, roomsActive: roomsAct, phase });
      await money(id, A, [U]);
    }
  };
  await step("R5a", () => killCase("R5a", "084", "party", "103", "resume"));
  await step("R5b", () => killCase("R5b", "085", "tenant", "101", "resume"));
  await step("R5c", () => killCase("R5c", "086", "import", "102", "resume"));
  await step("R5d", () => killCase("R5d", "087", "import", "102", "undo"));

  // ═══════════ R6 zombie: ตัวสร้างหยุดนิ่ง (SIGSTOP) หลัง R1 ของแถว → ถูกแย่ง claim → ชุด CREATED → UNDONE → ตื่น ═══════════
  await step("R6", async () => {
    const U = await mkDorm(A, "r6");
    const rooms = ["101", "102", "103", "104", "105", "106"];
    const F = fileOf("088", rooms);
    // ห้องมีอยู่ก่อนนำเข้า (ย้อนแล้วห้องยัง active ⇒ zombie ที่ตื่นสร้างสัญญาบนห้องนี้ได้ถ้าไม่ตรวจชุด/claim)
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: U, name: "เดิม", capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: 450000 } })).id;
    const bld = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: U, name: "อาคารเดิม", floors: 3, sortOrder: 1 } })).id;
    const roomId: Record<string, string> = {};
    for (const r of rooms) roomId[r] = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: U, roomTypeId: ty, number: r, buildingId: bld, floorNo: 1, floor: "1" } })).id;
    const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
    const mon = direct(); await mon.connect();
    let frozeAt = "", zres: any[] = [];
    try {
      const kid = spawnKid("r6z", [{ m: "dorm", op: "createImport", a: [cO, { unitId: U, batchId: x.batchId, previewHash: x.hash }] }]);
      if (!(await kid.ready)) throw new Error(`ลูกไม่พร้อม ${kid.errs.join(" ")}`);
      go(kid.key);
      const pid = kid.proc.pid!;
      let frozen = false;
      for (let tries = 0; tries < 400 && !frozen; tries++) {
        const b = await batchRow(x.batchId);
        if (b?.status === "CREATED") break;
        const m: any = b?.manifest;
        const started = m?.rows ? Object.values(m.rows).find((r: any) => r.status !== "DONE" && Number(r.rowNo) >= 3) as any : null;
        if (!started) { await sleep(5); continue; }
        process.kill(pid, "SIGSTOP");
        await sleep(150);
        const idle = Number((await mon.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`)).rows[0].n);
        const hasLease = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U, roomId: started.roomId ?? "-" } })).some((l: any) => impBatchOf(l) === x.batchId);
        if (idle > 0) { process.kill(pid, "SIGCONT"); await sleep(40); continue; }
        frozen = true;
        frozeAt = `row ${started.rowNo} (${started.room}) leaseExists=${hasLease}`;
      }
      if (!frozen) { note(`R6: แช่แข็ง zombie ไม่ได้ (ไม่เจอจังหวะนอก tx) — ดูผลจำลองแทน`); }
      else {
        await expireClaim(x.batchId);
        const res = await cr(cO, U, x.batchId, x.hash);
        const resU = await ud(cO, U, x.batchId, "probe zombie ย้อนระหว่าง zombie หลับ");
        note(`R6: zombie หลับที่ ${frozeAt} · ผู้ทำต่อ=${res?.code ?? (res?.ok ? "OK" : "?")} · ย้อน=${resU?.code ?? (resU?.ok ? "OK" : "?")}`);
        process.kill(pid, "SIGCONT");
      }
      zres = await Promise.race([kid.done, sleep(180_000).then(() => { kid.proc.kill("SIGKILL"); return [{ childFail: "timeout" }]; })]);
    } finally { await mon.end().catch(() => null); }
    const b = await batchRow(x.batchId);
    const live = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U, status: { in: LIVE } } })).filter((l: any) => impBatchOf(l) === x.batchId);
    rec("R6", frozeAt === "" ? true : (b?.status === "UNDONE" && live.length === 0 && zres.every((z: any) => !(z?.r?.ok === true && z.r.duplicate === false))), "MAJOR",
      "R6 (โพรเซสจริง): zombie ที่ถูกแย่ง claim ตื่นหลังชุด UNDONE ⇒ tx R1/R2 ถูกปฏิเสธ · ไม่มีสัญญา/เงินหลุดหลัง UNDONE",
      { frozeAt: frozeAt || "ไม่ได้แช่แข็ง", zombie: zres.map((z: any) => codeOf(z)), status: b?.status, liveAfter: live.map((l: any) => `${l.status}:${(l.policySnapshot as any)?.import?.rowNo}`) });
    // จำลองจังหวะเดียวกันแบบกำหนดได้: งานต่อแถวของ zombie หลัง R1 = createLease(…, mark) + moveIn(…, mark) — เรียกตรงหลังชุด UNDONE บนห้องเดิมที่ยัง active
    if (b?.status !== "UNDONE") await finishUndo(U, x.batchId);
    const row = F.rows[2];
    const mark = { importBatchId: x.batchId, rowNo: 4 };
    const startIso = (() => { const [d, m, y] = row[3].split("/").map(Number); return `${2500 + y - 543}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; })();
    const sim = await dorm.createLease(cO, { unitId: U, roomId: roomId[row[0]], startDate: startIso, months: 12, tenant: { name: row[1], phone: row[2] }, rentSatang: 450000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 0 }, mark);
    const mv = sim?.ok ? await dorm.moveIn(cO, { unitId: U, leaseId: sim.leaseId, paidAt: new Date(), channel: "TRANSFER" }, mark) : null;
    const held = sim?.ok ? await ACC.securityDepositHeld({ tenantId: A, unitId: U, leaseId: sim.leaseId }) : 0;
    rec("R6-sim", !(sim?.ok && mv?.ok), "MAJOR",
      "R6 (จำลองกำหนดได้): หลังชุด UNDONE งานต่อแถวของ zombie (createLease+moveIn พร้อมเครื่องหมาย importBatchId) บนห้องที่มีอยู่ก่อนนำเข้า ⇒ ต้องถูกปฏิเสธ (ชุดไม่ใช่ CREATING/claim ไม่ใช่ของมัน)",
      { createLease: slim(sim), moveIn: slim(mv), held, batch: (await batchRow(x.batchId))?.status, note: "D.5 รับ internal mark โดยไม่ตรวจสถานะชุด/claimToken · moveIn ข้ามด่านลงชื่อ+รูปด้วย mark นี้" });
    if (sim?.ok) { await prisma.dormLease.updateMany({ where: { id: sim.leaseId }, data: { policySnapshot: { ...(await prisma.dormLease.findUnique({ where: { id: sim.leaseId } })).policySnapshot, import: { batchId: "probe-sim", rowNo: 4 } } } }); }
    await money("R6", A, [U]);
  });

  // ═══════════ R7 undo ∥ D.8 เตรียมรอบบิล ═══════════
  await step("R7", async () => {
    // positive control: หน่วยนำเข้า → prepareBillRun ต้องมีบิล > 0 (ไม่งั้นข้อนี้ไม่มีความหมาย)
    const UPC = await mkDorm(A, "r7pc");
    const FPC = fileOf("089", ["101", "102"]);
    const xpc = await prepFile(cO, UPC, csvBytes(FPC.headers, FPC.rows));
    await cr(cO, UPC, xpc.batchId, xpc.hash);
    const pc = await dorm.prepareBillRun(cO, { unitId: UPC, periodKey: CUR_P });
    const pcBills = await prisma.dormBill.count({ where: { tenantId: A, unitId: UPC } });
    rec("R7-PC", pcBills > 0, "PC", "positive control: หน่วยนำเข้าแล้ว prepareBillRun งวดปัจจุบันมีบิลจริง", { prep: slim(pc), bills: pcBills });
    const units: { U: string; b: string; F: any }[] = [];
    const pres = ["090", "091", "092", "093"];
    for (let i = 0; i < 4; i++) {
      const U = await mkDorm(A, `r7${i}`);
      const F = fileOf(pres[i], ["101", "102", "103", "104", "105", "106"]);
      const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
      const c = await cr(cO, U, x.batchId, x.hash);
      if (!c?.ok) throw new Error(`สร้างล้ม ${J(slim(c))}`);
      units.push({ U, b: x.batchId, F });
    }
    const delays = [0, 250, 900, 2200];
    const { kids } = await fan("r7", [
      units.map((u) => ({ m: "dorm", op: "undoImport", a: [cO, { unitId: u.U, batchId: u.b, reason: "probe ย้อนแข่งรอบบิล" }] }) as Call),
      units.map((u, i) => ({ m: "dorm", op: "prepareBillRun", a: [cO, { unitId: u.U, periodKey: CUR_P }], delayMs: delays[i] }) as Call),
    ]);
    const per: any[] = [];
    let breach = 0;
    for (const u of units) {
      const ls = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: u.U } })).filter((l: any) => impBatchOf(l) === u.b);
      const cancelled = ls.filter((l: any) => l.status === "CANCELLED").map((l: any) => l.id);
      const billsOnCancelled = cancelled.length ? await prisma.dormBill.count({ where: { tenantId: A, unitId: u.U, leaseId: { in: cancelled } } }) : 0;
      const bills = await prisma.dormBill.count({ where: { tenantId: A, unitId: u.U } });
      if (billsOnCancelled) breach++;
      per.push({ unit: u.U.slice(-6), batch: (await batchRow(u.b))?.status, cancelled: cancelled.length, bills, billsOnCancelled });
    }
    rec("R7", breach === 0 && !badOf(kids).length, "MAJOR", "undo ∥ prepareBillRun (2 โพรเซส · 4 หน่วย · หน่วงเตรียมบิล 0/250/900/2200 ms) ⇒ UNDO_BLOCKED หรือไม่มีบิลบนสัญญาที่ CANCELLED",
      { tally: tally(kids), per, results: kids.map((k: any) => `${k.op}:${codeOf(k)}@${k.ms}ms ${k.r?.blockers ? J(k.r.blockers.map((b: any) => b.code)) : ""}`) });
    await money("R7", A, units.map((u) => u.U));
  });

  // ═══════════ R8 undo ∥ settleSecurityDeposit / reverseSecurityDepositSettlement ═══════════
  await step("R8", async () => {
    const units: { U: string; b: string; lease: string; dep: number }[] = [];
    const pres = ["094", "095", "096"];
    for (let i = 0; i < 3; i++) {
      const U = await mkDorm(A, `r8${i}`);
      const F = fileOf(pres[i], ["101", "102", "103"]);
      const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
      const c = await cr(cO, U, x.batchId, x.hash);
      if (!c?.ok) throw new Error(`สร้างล้ม ${J(slim(c))}`);
      const l = (await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U, status: "ACTIVE" }, orderBy: { createdAt: "asc" } }))[0];
      units.push({ U, b: x.batchId, lease: l.id, dep: l.depositSatang });
    }
    const delays = [0, 200, 700];
    const { kids } = await fan("r8", [
      units.map((u) => ({ m: "dorm", op: "undoImport", a: [cO, { unitId: u.U, batchId: u.b, reason: "probe ย้อนแข่งปิดประกัน" }] }) as Call),
      units.map((u, i) => ({ m: "acc", op: "settleSecurityDeposit", a: [{ tenantId: A, unitId: u.U, leaseId: u.lease, idempotencyKey: `pb-settle-${u.lease}`, applyToDocIds: [], refund: { channel: "TRANSFER" }, createdById: OWN }], delayMs: delays[i] }) as Call),
    ]);
    const per: any[] = [];
    let bad = 0;
    for (const u of units) {
      const und = kids.find((k: any) => k.op === "undoImport" && J(k).includes(u.b)) ?? kids.filter((k: any) => k.op === "undoImport")[units.indexOf(u)];
      const set = kids.filter((k: any) => k.op === "settleSecurityDeposit")[units.indexOf(u)];
      const l = await prisma.dormLease.findUnique({ where: { id: u.lease } });
      const held = await ACC.securityDepositHeld({ tenantId: A, unitId: u.U, leaseId: u.lease });
      const jvs = await prisma.accountJournalEntry.findMany({ where: { tenantId: A, refType: "DormSecurityDeposit", refId: `${u.U}:${u.lease}` }, select: { idempotencyKey: true, status: true, reversalOfId: true } });
      const recvRev = jvs.some((e: any) => String(e.idempotencyKey).includes("#RECEIVE:") && !e.reversalOfId && e.status === "REVERSED");
      const settleLive = jvs.some((e: any) => String(e.idempotencyKey).includes("#SETTLE:") && !e.reversalOfId && e.status !== "REVERSED");
      const doubled = recvRev && settleLive; // ทั้งกลับรายการรับ และ คืนเงินออกไป ⇒ เงินออกซ้ำ
      const setOk = set?.r?.ok === true;
      const undoLeaseCancelled = l?.status === "CANCELLED";
      const ok = !doubled && held >= 0 && (!setOk || !undoLeaseCancelled);
      if (!ok) bad++;
      per.push({ settle: codeOf(set), undo: codeOf(und), blockers: und?.r?.blockers?.map((b: any) => b.code), lease: l?.status, held, recvRev, settleLive });
    }
    rec("R8", bad === 0 && !badOf(kids).length, "BLOCKER", "undo ∥ settleSecurityDeposit (2 โพรเซส · 3 หน่วย) ⇒ ผู้ชนะเดียว: ปิดประกันสำเร็จ ⇒ สัญญานั้นไม่ถูกย้อน (DEPOSIT_MOVED) · ย้อนสำเร็จ ⇒ ปิดประกันล้ม · ไม่มีเงินออกซ้ำ", { per, tally: tally(kids) });
    await money("R8a", A, units.map((u) => u.U));
    // รอบสอง: หน่วยที่ปิดประกันชนะ ⇒ ถอยการปิด ∥ undo
    const won = units.filter((_, i) => per[i].settle === "OK");
    if (won.length) {
      for (const u of won) { const b = await batchRow(u.b); if (b?.claimToken) await expireClaim(u.b); }
      const { kids: k2 } = await fan("r8b", [
        won.map((u) => ({ m: "dorm", op: "undoImport", a: [cO, { unitId: u.U, batchId: u.b, reason: "probe ย้อนแข่งถอยปิดประกัน" }], delayMs: 150 }) as Call),
        won.map((u) => ({ m: "acc", op: "reverseSecurityDepositSettlement", a: [{ tenantId: A, unitId: u.U, leaseId: u.lease, idempotencyKey: `pb-settle-${u.lease}`, reason: "probe ถอยปิดประกัน", createdById: OWN }] }) as Call),
      ]);
      const per2: any[] = [];
      for (const u of won) {
        const l = await prisma.dormLease.findUnique({ where: { id: u.lease } });
        const held = await ACC.securityDepositHeld({ tenantId: A, unitId: u.U, leaseId: u.lease });
        per2.push({ lease: l?.status, held, ok: (l?.status === "CANCELLED" && held === 0) || (l?.status === "ACTIVE" && (held === u.dep || held === 0)) });
      }
      rec("R8b", per2.every((p) => p.ok) && !badOf(k2).length, "BLOCKER", "ถอยการปิดประกัน ∥ undo ⇒ สัญญา CANCELLED+ยอดถือ 0 หรือ ACTIVE (ยอดถือสอดคล้อง) · GL สมดุล", { per2, tally: tally(k2) });
      await money("R8b", A, won.map((u) => u.U));
    } else note("R8b: ไม่มีหน่วยที่ปิดประกันชนะ — ข้ามรอบถอยการปิด");
  });

  // ═══════════ R9 import ∥ createLease มือห้องเดียวกัน · import ∥ submitReadings ═══════════
  await step("R9a", async () => {
    const out: any[] = [];
    for (const [i, delay] of [[0, 0], [1, 1200]] as const) {
      const U = await mkDorm(A, `r9a${i}`);
      const rooms = ["101", "102", "103", "104"];
      const F = fileOf(i === 0 ? "097" : "098", rooms);
      const ty = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: U, name: "เดิม", capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: 450000 } })).id;
      const bld = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: U, name: "อาคารเดิม", floors: 3, sortOrder: 1 } })).id;
      const rid: Record<string, string> = {};
      for (const r of rooms) rid[r] = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: U, roomTypeId: ty, number: r, buildingId: bld, floorNo: 1, floor: "1" } })).id;
      const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
      const manual = { unitId: U, roomId: rid["103"], startDate: addDays(TODAY, -10), months: 12, tenant: { name: "ผู้เช่า มือทำเอง", phone: `09${String(Date.now() + i).slice(-8)}` }, rentSatang: 450000, depositSatang: 900000, advanceRentSatang: 0, bookingFeeSatang: 0 };
      const { kids } = await fan(`r9a${i}`, [[{ m: "dorm", op: "createImport", a: [cO, { unitId: U, batchId: x.batchId, previewHash: x.hash }] }], [{ m: "dorm", op: "createLease", a: [cO, manual], delayMs: delay }]]);
      const live = await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U, roomId: rid["103"], status: { in: LIVE } } });
      const imp1 = kids.find((k: any) => k.op === "createImport");
      const man = kids.find((k: any) => k.op === "createLease");
      // ชุดค้าง PARTIAL ⇒ ทางออกเดียวคือ undo (preview BUSY) — ย้อนแล้วสัญญามือต้องอยู่ครบ
      const b = await batchRow(x.batchId);
      let undo: any = null, manualAfter: any = null, pvStuck: any = null;
      if (b?.status === "CREATING") {
        pvStuck = await pv(cO, U, x.batchId, { decisions: { [String(F.rows.findIndex((r) => r[0] === "103") + 2)]: [{ action: "SKIP" }] } });
        undo = await ud(cO, U, x.batchId, "probe ย้อนชุดค้างจากห้องชน");
      }
      if (man?.r?.ok) manualAfter = await prisma.dormLease.findUnique({ where: { id: man.r.leaseId } });
      out.push({ delay, import: codeOf(imp1), failed: imp1?.r?.failedCode, manual: codeOf(man), live103: live.length, batch: b?.status, pvStuck: pvStuck ? codeOf(wrapIn("pv", pvStuck)) : null, undo: undo ? codeOf(wrapIn("undo", undo)) : null, manualAfter: manualAfter?.status ?? null, bad: badOf(kids).length });
      await money(`R9a${i}`, A, [U]);
    }
    rec("R9a", out.every((o) => o.live103 === 1 && !o.bad && (o.manual !== "OK" || o.manualAfter === "DRAFT" || o.manualAfter === "ACTIVE")), "BLOCKER",
      "import ∥ createLease มือบนห้องเดียวกัน (2 โพรเซส) ⇒ ห้องมีสัญญาเดียว · import แถวนั้น PARTIAL (ROOM_TAKEN) ไม่ซ้อน · ย้อนชุดค้างแล้วสัญญามือไม่ถูกแตะ", out);
    if (out.some((o) => o.pvStuck === "BUSY")) note("R9a: ชุดที่ PARTIAL ค้าง CREATING — previewImport (เพื่อ SKIP แถวที่ชน) ได้ BUSY เสมอ ⇒ ทางออกเดียวคือ undo ทั้งชุด (ตามใบ §3.3 · บันทึกไว้ให้ผู้คุมพิจารณา UX)");
  });
  await step("R9b", async () => {
    // (โพรเซสจริง) ห้อง+มิเตอร์มีก่อน · import ∥ submitReadings มือ งวดเดียวกัน
    const U = await mkDorm(A, "r9b");
    const rooms = ["101", "102", "103", "104"];
    const F = fileOf("099", rooms);
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: U, name: "เดิม", capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: 450000 } })).id;
    const bld = (await prisma.roomBuilding.create({ data: { tenantId: A, unitId: U, name: "อาคารเดิม", floors: 3, sortOrder: 1 } })).id;
    const meters: { id: string; room: string; kind: string; file: number }[] = [];
    for (const r of rooms) {
      const rid = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: U, roomTypeId: ty, number: r, buildingId: bld, floorNo: 1, floor: "1" } })).id;
      const row = F.rows.find((z) => z[0] === r)!;
      for (const [kind, v] of [["ELEC", Number(row[6])], ["WATER", Number(row[7])]] as const) {
        const m = await dorm.createMeter(cO, { unitId: U, kind, roomId: rid, startReading: Math.max(0, v - 100) });
        if (!m?.ok) throw new Error(`createMeter ล้ม ${J(m)}`);
        meters.push({ id: m.meterId, room: r, kind, file: v });
      }
    }
    const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
    const items = meters.map((m) => ({ meterId: m.id, value: m.file + 7, readAt: `${READ_DATE}T10:00:00+07:00` }));
    const { kids } = await fan("r9b", [[{ m: "dorm", op: "createImport", a: [cO, { unitId: U, batchId: x.batchId, previewHash: x.hash }] }], [{ m: "dorm", op: "submitReadings", a: [cO, { unitId: U, periodKey: READ_P, items }], delayMs: 300 }]]);
    const rows = await prisma.dormMeterReading.findMany({ where: { tenantId: A, unitId: U, kind: "PERIOD", periodKey: READ_P } });
    const per = new Map<string, number>();
    for (const r of rows) per.set(r.meterId, (per.get(r.meterId) ?? 0) + 1);
    const man = kids.find((k: any) => k.op === "submitReadings");
    const manualCreated = new Set<string>((man?.r?.results ?? []).map((z: any, i: number) => (z.status === "CREATED" ? meters[i].id : "")).filter(Boolean));
    const overwritten = rows.filter((r: any) => manualCreated.has(r.meterId) && r.value !== meters.find((m) => m.id === r.meterId)!.file + 7).map((r: any) => r.meterId);
    rec("R9b", [...per.values()].every((n) => n === 1) && per.size === meters.length && overwritten.length === 0 && !badOf(kids).length, "MAJOR",
      "import ∥ submitReadings มือ (2 โพรเซส) มิเตอร์/งวดเดียวกัน ⇒ เลข PERIOD แถวเดียวต่อมิเตอร์ · เลขที่มือจดไว้ก่อนไม่ถูกไฟล์ทับ (METER_CONFLICT)",
      { tally: tally(kids), perMeter: [...per.values()], manual: man?.r?.results?.map((z: any) => z.status), overwritten: overwritten.length, sources: rows.map((r: any) => r.source) });
    await finishCreate(U, x.batchId, x.hash);
    await money("R9b", A, [U]);
  });
  await step("R9c", async () => {
    // (กำหนดจังหวะได้) จดมือลงในช่องระหว่าง "import ตรวจว่ายังไม่มีเลข" กับ submitReadings ของ import: ถือล็อก dorm.meter:<id>:<งวด> แล้วเขียนแถว MANUAL ใน tx เดียวกัน (= submitReadings มือที่ชนะคิว)
    const U = await mkDorm(A, "r9c");
    const F = fileOf("061", ["101"]);
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId: A, unitId: U, name: "เดิม", capacity: 2, baseRateSatang: 0, depositSatang: 0, rentMode: "MONTHLY", monthlyRateSatang: 450000 } })).id;
    const rid = (await prisma.hotelRoom.create({ data: { tenantId: A, unitId: U, roomTypeId: ty, number: "101", floorNo: 1, floor: "1" } })).id;
    const fileElec = Number(F.rows[0][6]);
    const m = await dorm.createMeter(cO, { unitId: U, kind: "ELEC", roomId: rid, startReading: fileElec - 100 });
    const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
    const hc = direct(); await hc.connect(); const mon = direct(); await mon.connect();
    let blocked = false;
    try {
      const hpid = Number((await hc.query("SELECT pg_backend_pid() AS p")).rows[0].p);
      await hc.query("BEGIN");
      await hc.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`dorm.meter:${m.meterId}:${READ_P}`]);
      const kid = spawnKid("r9c", [{ m: "dorm", op: "createImport", a: [cO, { unitId: U, batchId: x.batchId, previewHash: x.hash }] }]);
      if (!(await kid.ready)) throw new Error("ลูกไม่พร้อม");
      go(kid.key);
      blocked = await waitBlocked(mon, hpid, 120_000);
      await hc.query(`INSERT INTO "DormMeterReading" ("id","tenantId","unitId","meterId","periodKey","kind","value","readAt","source","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'PERIOD',$6,now(),'MANUAL',now(),now())`,
        [`pbman${randomBytes(6).toString("hex")}`, A, U, m.meterId, READ_P, fileElec + 5]);
      await hc.query("COMMIT");
      const r = await kid.done;
      const row = await prisma.dormMeterReading.findFirst({ where: { tenantId: A, unitId: U, meterId: m.meterId, periodKey: READ_P, kind: "PERIOD" } });
      rec("R9c", !blocked ? true : row?.value === fileElec + 5, "MINOR",
        "(จังหวะกำหนดได้) เลขมือที่ลงระหว่าง import ตรวจ 'ยังไม่มีเลข' กับ submitReadings ของ import ⇒ import ต้องไม่ทับค่ามือ (ใบ §2.6 METER_CONFLICT คงค่าในระบบ)",
        { blocked, import: r.map((z: any) => codeOf(z)), final: row ? { value: row.value, source: row.source } : null, manual: fileElec + 5, file: fileElec });
    } finally { try { await hc.query("ROLLBACK"); } catch { /* */ } await hc.end().catch(() => null); await mon.end().catch(() => null); }
    await money("R9c", A, [U]);
  });

  // ═══════════ R10 สองหน่วยร้านเดียวกันนำเข้าพร้อมกัน ═══════════
  await step("R10", async () => {
    const Ua = await mkDorm(A, "r10a"), Ub = await mkDorm(A, "r10b");
    const Fa = fileOf("062", ROOMS8), Fb = fileOf("063", ROOMS8);
    const xa = await prepFile(cO, Ua, csvBytes(Fa.headers, Fa.rows)), xb = await prepFile(cO, Ub, csvBytes(Fb.headers, Fb.rows));
    const ca = (): Call => ({ m: "dorm", op: "createImport", a: [cO, { unitId: Ua, batchId: xa.batchId, previewHash: xa.hash }] });
    const cb = (): Call => ({ m: "dorm", op: "createImport", a: [cO, { unitId: Ub, batchId: xb.batchId, previewHash: xb.hash }] });
    const { kids } = await fan("r10", [[ca(), cb()], [cb(), ca()]]);
    const okOrResumable = kids.every((k: any) => k?.r?.ok === true || ["BUSY", "PARTIAL"].includes(k?.r?.code));
    const fa = await finishCreate(Ua, xa.batchId, xa.hash), fb = await finishCreate(Ub, xb.batchId, xb.hash);
    const drafts = await prisma.dormLease.count({ where: { tenantId: A, unitId: { in: [Ua, Ub] }, status: "DRAFT" } });
    rec("R10", okOrResumable && !badOf(kids).length && fa.status === "CREATED" && fb.status === "CREATED" && drafts === 0, "MAJOR",
      "สองหน่วยร้านเดียวกันนำเข้าพร้อมกัน (2 โพรเซส · คิวเงินระดับร้าน) ⇒ สำเร็จหรือ BUSY/PARTIAL ที่ทำต่อได้ · ไม่มี DRAFT ค้าง · ไม่ throw", { tally: tally(kids), fa: fa.status, fb: fb.status, drafts });
    await money("R10", A, [Ua, Ub], { expectHeld: { [xa.batchId]: depOf(Fa.rows), [xb.batchId]: depOf(Fb.rows) } });
  });

  // ═══════════ R11 บังคับ 40P01 ═══════════
  await step("R11", async () => {
    const U = await mkDorm(A, "r11");
    const F = fileOf("064", ["101", "102", "103", "104", "105", "106"]);
    const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
    const statDl = async () => Number((await prisma.$queryRawUnsafe(`SELECT deadlocks::bigint AS d FROM pg_stat_database WHERE datname = current_database()`) as any[])[0].d);
    const dl0 = await statDl();
    const kid = spawnKid("r11", [{ m: "dorm", op: "createImport", a: [cO, { unitId: U, batchId: x.batchId, previewHash: x.hash }] }]);
    if (!(await kid.ready)) throw new Error("ลูกไม่พร้อม");
    let stop = false, attacks = 0, myDl = 0, myOther = "";
    const atk = direct(); await atk.connect();
    const attacker = (async () => {
      while (!stop) {
        try {
          await atk.query("BEGIN");
          await atk.query(`SELECT id FROM "DormImportBatch" WHERE id = $1 FOR UPDATE`, [x.batchId]);
          await sleep(250);
          await atk.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`dorm.import:${U}`]);
          await atk.query("COMMIT");
        } catch (e) { if (/deadlock/i.test(errMsg(e))) myDl++; else myOther = errMsg(e); try { await atk.query("ROLLBACK"); } catch { /* */ } }
        attacks++;
        await sleep(30);
      }
    })();
    go(kid.key);
    const r = await Promise.race([kid.done, sleep(300_000).then(() => [{ childFail: "timeout" }])]);
    stop = true; await attacker; await atk.end().catch(() => null);
    const dl1 = await statDl();
    const mid = await batchRow(x.batchId);
    const midInv = await invariants(A, U);
    const fin = await finishCreate(U, x.batchId, x.hash, 8);
    const forced = dl1 - dl0;
    rec("R11-PC", forced > 0, "PC", "positive control: เกิด deadlock จริง (pg_stat_database.deadlocks เพิ่ม)", { forced, attacks, attackerVictim: myDl, myOther });
    const code = r[0]?.r?.ok === true ? "OK" : r[0]?.r?.code;
    rec("R11", !badOf(r).length && ["OK", "BUSY", "PARTIAL"].includes(code) && fin.status === "CREATED" && midInv.filter((p) => !/manifest/.test(p) || mid?.status === "CREATED").length === 0, "BLOCKER",
      "บังคับ 40P01 (ล็อกแถวชุดก่อน แล้วขอล็อกหน่วย ระหว่าง createImport) ⇒ ลองใหม่ 1 ครั้งแล้ว BUSY/PARTIAL · ไม่ throw · ไม่มีครึ่งแถว · ทำต่อได้จนครบ",
      { child: r.map((z: any) => codeOf(z)), childRes: slim(r[0]?.r), midStatus: mid?.status, midInv: midInv.slice(0, 4), final: fin.status, finLast: slim(fin.last) });
    await money("R11", A, [U], { expectHeld: { [x.batchId]: depOf(F.rows) } });
  });

  // ═══════════ R12 ข้ามหน่วย/ข้ามร้าน · previewHash ของชุดอื่น ═══════════
  await step("R12", async () => {
    const Ua = await mkDorm(A, "r12a"), Ua2 = await mkDorm(A, "r12b"), Ub = await mkDorm(B, "r12x"), Uh = await mkDorm(A, "r12h", "HOTEL");
    const F = fileOf("065", ["101", "102"]);
    const xa = await prepFile(cO, Ua, csvBytes(F.headers, F.rows));
    const F2 = fileOf("066", ["101", "103"]);
    const xa2 = await prepFile(cO, Ua, csvBytes(F2.headers, F2.rows), "อีกไฟล์.csv");
    const xb = await prepFile(cB, Ub, csvBytes(F.headers, F.rows));
    const before = await prisma.dormLease.count({ where: { tenantId: { in: [A, B] } } });
    const fake = `c${randomBytes(12).toString("hex")}`;
    const W: [string, any][] = [];
    const wr = async (label: string, f: () => Promise<any>) => { try { W.push([label, await f()]); } catch (e) { W.push([label, { threw: errMsg(e) }]); } };
    await wr("B→A batch@A unit preview", () => pv(cB, Ua, xa.batchId));
    await wr("B→A batch@A unit create", () => cr(cB, Ua, xa.batchId, xa.hash));
    await wr("B→A batch@A unit undo", () => ud(cB, Ua, xa.batchId));
    await wr("B→A batch@B unit preview", () => pv(cB, Ub, xa.batchId));
    await wr("B→A batch@B unit create", () => cr(cB, Ub, xa.batchId, xa.hash));
    await wr("A→B batch@A unit create", () => cr(cO, Ua, xb.batchId, xb.hash));
    await wr("A→B batch@B unit create", () => cr(cO, Ub, xb.batchId, xb.hash));
    await wr("A batch other unit", () => cr(cO, Ua2, xa.batchId, xa.hash));
    await wr("A batch hotel unit", () => pv(cO, Uh, xa.batchId));
    await wr("fake batch", () => cr(cO, Ua, fake, xa.hash));
    await wr("fake batch undo", () => ud(cO, Ua, fake));
    await wr("guess B→A", () => dorm.guessColumns(cB, { unitId: Ua, batchId: xa.batchId }, { guesser: null }));
    await wr("upload B→A unit", () => up(cB, Ua, csvBytes(F.headers, F.rows)));
    await wr("spoof tenantId", () => cr({ tenantId: A, actorUserId: OWNB }, Ua, xa.batchId, xa.hash));
    const nf = W.filter(([, r]) => r?.ok === false && r.code === "NOT_FOUND");
    const reasons = new Set(nf.map(([, r]) => r.reason));
    const reads = {
      get: await dorm.getImport(cB, { unitId: Ua, batchId: xa.batchId }), getOther: await dorm.getImport(cO, { unitId: Ua2, batchId: xa.batchId }),
      csv: await dorm.importIssuesCsv(cB, { unitId: Ua, batchId: xa.batchId }), list: await dorm.listImports(cB, { unitId: Ua }),
    };
    const after = await prisma.dormLease.count({ where: { tenantId: { in: [A, B] } } });
    rec("R12", nf.length === W.length && reasons.size === 1 && reads.get === null && reads.getOther === null && reads.csv === null && Array.isArray(reads.list) && reads.list.length === 0 && after === before, "BLOCKER",
      "batchId ที่เดา/ขโมย ข้ามร้าน/ข้ามหน่วย/หน่วยโรงแรม/ปลอม tenantId ⇒ NOT_FOUND reason เดียวกันทุกกรณี (= ชุดที่ไม่มีจริง) · อ่าน null/[] · ไม่มีอะไรเกิด",
      { results: W.map(([l, r]) => `${l}=${r?.code ?? (r?.ok ? "OK!" : r?.threw ?? "?")}`), reasons: [...reasons].map((s: any) => String(s).slice(0, 60)), reads: { get: reads.get === null, getOther: reads.getOther === null, csv: reads.csv === null, list: reads.list?.length }, leases: [before, after] });
    // previewHash ของชุดอื่น (หน่วยเดียวกัน)
    const st = await cr(cO, Ua, xa2.batchId, xa.hash);
    const own2 = await pv(cO, Ua, xa2.batchId);
    const leaked = st?.previewHash && st.previewHash === xa.hash;
    rec("R12b", st?.ok === false && st.code === "STALE_PREVIEW" && !leaked && (!st.previewHash || st.previewHash === own2.previewHash), "MAJOR",
      "previewHash ของชุดอื่น (หน่วยเดียวกัน) ⇒ STALE_PREVIEW · hash ที่คืน = ของชุดตัวเอง · ไม่มีอะไรเกิด", { st: slim(st), own: own2?.previewHash?.slice(0, 12) });
    // ใช้ hash ของไฟล์อื่นของร้าน A (xa2) — ไฟล์เดียวกันบนหน่วยว่างเท่ากันให้ hash เดียวกันโดยชอบ (hash ผูกเนื้อหา ไม่ผูกชุด) จึงไม่ใช้ xa.hash
    const stB = await cr(cB, Ub, xb.batchId, xa2.hash);
    rec("R12c", stB?.ok === false && stB.code === "STALE_PREVIEW" && stB.previewHash !== xa2.hash, "MAJOR", "ร้าน B ส่ง previewHash ของไฟล์อื่นของร้าน A ⇒ STALE_PREVIEW (ไม่สร้าง)", slim(stB));
    await money("R12", A, [Ua, Ua2]);
  });

  // ═══════════ R13 ขอบหน้าต่าง undo 23:59:59 ↔ 00:00:00 ไทย · undoDays เปลี่ยนระหว่างทาง ═══════════
  await step("R13", async () => {
    const mk = async (tag: string, pre: string) => {
      const U = await mkDorm(A, tag);
      const F = fileOf(pre, ["101"]);
      const x = await prepFile(cO, U, csvBytes(F.headers, F.rows));
      const c = await cr(cO, U, x.batchId, x.hash);
      if (!c?.ok) throw new Error(`สร้างล้ม ${J(slim(c))}`);
      const b = await batchRow(x.batchId);
      return { U, b: x.batchId, d: bkkYmd(b.committedAt as Date) };
    };
    const a = await mk("r13a", "067"), bb = await mk("r13b", "068");
    const at = (ymd: string, hms: string) => new Date(`${ymd}T${hms}+07:00`);
    const R: Record<string, any> = {};
    R.a_next0000 = await ud(cO, a.U, a.b, "probe ขอบเวลา", at(addDays(a.d, 1), "00:00:00.000"));
    R.a_utcTrap = await ud(cO, a.U, a.b, "probe ขอบเวลา", new Date(`${a.d}T17:00:00.000Z`));
    await setU(A, a.U, "rooms.import.undoDays", 2);
    R.a_days2_d3 = await ud(cO, a.U, a.b, "probe ขอบเวลา", at(addDays(a.d, 3), "00:00:00.000"));
    const view = await dorm.getImport(cO, { unitId: a.U, batchId: a.b });
    R.a_days2_d2end = await ud(cO, a.U, a.b, "probe ขอบเวลา", at(addDays(a.d, 2), "23:59:59.999"));
    R.b_end = await ud(cO, bb.U, bb.b, "probe ขอบเวลา", at(bb.d, "23:59:59.999"));
    const c = (r: any) => (r?.ok ? "OK" : r?.code);
    rec("R13", c(R.a_next0000) === "UNDO_EXPIRED" && c(R.a_utcTrap) === "UNDO_EXPIRED" && c(R.a_days2_d3) === "UNDO_EXPIRED" && c(R.a_days2_d2end) === "OK" && c(R.b_end) === "OK", "MAJOR",
      "ขอบหน้าต่าง undo ตามวันไทย: undoDays 0 ⇒ 00:00:00.000 วันถัดไป EXPIRED (รวม 17:00Z) · 23:59:59.999 วันเดียวกันได้ · เปลี่ยน undoDays=2 ระหว่างทาง ⇒ ค่าสด: วัน+3 00:00 EXPIRED · วัน+2 23:59:59.999 ได้",
      { d: a.d, ...Object.fromEntries(Object.entries(R).map(([k, v]) => [k, c(v)])), undoUntilAfterSetting: view?.undoUntil ?? null });
    if (view?.undoUntil && view.undoUntil !== at(addDays(a.d, 2), "23:59:59.999").toISOString()) note(`R13: getImport.undoUntil=${view.undoUntil} (คาด ${at(addDays(a.d, 2), "23:59:59.999").toISOString()})`);
    await money("R13", A, [a.U, bb.U]);
  });

  // ═══════════ R14 ไฟล์ระเบิด (เวลา < 5 วิ · RSS ไม่เกิน ~300 MB) ═══════════
  await step("R14", async () => {
    const CAP = 40_000_000; // = min(40MB, maxFileBytes 2,000,000 × 20) ตามที่ uploadImport ส่งให้ parser
    const parseChild = (file: string, timeoutMs = 60_000): Promise<any> => new Promise((resolve) => {
      const p = spawn(process.execPath, ["--max-old-space-size=2048", ...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, PROBE_D4B_PARSE: JSON.stringify({ file, cap: CAP }) }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "", err = "";
      const t0 = Date.now();
      p.stdout.on("data", (b: Buffer) => { out += b.toString(); });
      p.stderr.on("data", (b: Buffer) => { err = (err + b.toString()).slice(-400); });
      const timer = setTimeout(() => { p.kill("SIGKILL"); }, timeoutMs);
      p.on("exit", (code, sig) => {
        clearTimeout(timer);
        const m = /PARSE (\{.*\})/.exec(out);
        resolve(m ? JSON.parse(m[1]) : { died: `${code}/${sig}`, wallMs: Date.now() - t0, err: err.split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 200) });
      });
    });
    const hdr = `<row r="1"><c r="A1" t="inlineStr"><is><t>ห้อง</t></is></c><c r="B1" t="inlineStr"><is><t>ชื่อผู้เช่า</t></is></c></row>`;
    const sheet = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${hdr}${body}</sheetData></worksheet>`;
    const cases: { id: string; what: string; bytes: Uint8Array; want: string[] }[] = [];
    // a) 30 MB หลังคลาย (แถวเล็ก ๆ จำนวนมาก)
    {
      const one = `<row><c t="inlineStr"><is><t>1</t></is></c></row>`;
      cases.push({ id: "R14a", what: "sheet 30 MB หลังคลาย (แถวเล็ก ~600k)", bytes: xlsxShell(sheet(one.repeat(Math.floor(30_000_000 / one.length)))), want: ["UNSAFE_FILE", "TOO_MANY_ROWS", "OK"] });
    }
    // b) 10,000 รายการใน zip
    cases.push({ id: "R14b", what: "zip 10,000 รายการ", bytes: xlsxShell(sheet(`<row><c t="inlineStr"><is><t>1</t></is></c></row>`), undefined, Array.from({ length: 10_000 }, (_, i) => ({ name: `x/${i}.xml`, data: enc("<a/>") }))), want: ["UNSAFE_FILE"] });
    // c) แถวว่างที่อ้างคอลัมน์ไกล (IG = 241) — แต่ละแถว ~23 ไบต์ ขยายเป็น 241 ช่องในหน่วยความจำ
    {
      const one = `<row><c r="IG1"/></row>`;
      cases.push({ id: "R14c", what: "แถว <c r=\"IG1\"/> ×1.6M (39 MB · ช่องละ 241 คอลัมน์ในหน่วยความจำ)", bytes: xlsxShell(sheet(one.repeat(Math.floor(39_000_000 / one.length)))), want: ["UNSAFE_FILE", "TOO_MANY_ROWS", "TOO_MANY_COLUMNS", "EMPTY_FILE", "OK"] });
    }
    // d) XML ยาว: <row> ไม่ปิด ×100k (500 KB) — regex lazy สแกนถึงท้ายทุกครั้ง
    cases.push({ id: "R14d", what: "<row> ไม่ปิด ×100k (500 KB หลังคลาย · ไฟล์ < 5 KB)", bytes: xlsxShell(sheet("<row>".repeat(100_000))), want: ["UNSAFE_FILE", "UNSUPPORTED_FORMAT", "EMPTY_FILE", "OK", "TOO_MANY_ROWS"] });
    // e) <si> ไม่ปิดใน sharedStrings ×100k
    cases.push({ id: "R14e", what: "sharedStrings <si> ไม่ปิด ×100k", bytes: xlsxShell(sheet(`<row><c t="s"><v>0</v></c></row>`), `<sst>${"<si>".repeat(100_000)}</sst>`), want: ["UNSAFE_FILE", "UNSUPPORTED_FORMAT", "EMPTY_FILE", "OK"] });
    // f) <c> ไม่ปิดในแถวเดียว ×100k
    cases.push({ id: "R14f", what: "<c> ไม่ปิด ×100k ในแถวเดียว", bytes: xlsxShell(sheet(`<row>${"<c>".repeat(100_000)}</row>`)), want: ["UNSAFE_FILE", "UNSUPPORTED_FORMAT", "EMPTY_FILE", "OK", "TOO_MANY_COLUMNS"] });
    // g) ขนาดที่ประกาศโกหก (บอก 100 ไบต์ คลายจริง 40 MB)
    {
      const big = new Uint8Array(Buffer.alloc(40_000_000, 0x41));
      cases.push({ id: "R14g", what: "entry ประกาศ usize 100 แต่คลายจริง 40 MB", bytes: zipBytes([
        { name: "xl/workbook.xml", data: enc(`<workbook xmlns:r="r"><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
        { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`) },
        { name: "xl/worksheets/sheet1.xml", data: big, deflate: true, declaredSize: 100 },
      ]), want: ["UNSAFE_FILE"] });
    }
    // h) XML ลึก (ซ้อน 200k ชั้น)
    cases.push({ id: "R14h", what: "XML ซ้อนลึก 200k ชั้นในเซลล์", bytes: xlsxShell(sheet(`<row><c t="inlineStr"><is>${"<x>".repeat(200_000)}<t>a</t>${"</x>".repeat(200_000)}</is></c></row>`)), want: ["UNSAFE_FILE", "OK", "UNSUPPORTED_FORMAT", "EMPTY_FILE"] });
    for (const c of cases) {
      const f = tmpWrite(c.id, c.bytes);
      const r = await parseChild(f);
      const code = r.died ? `DIED(${r.died})` : r.ok ? "OK" : r.code ?? (r.threw ? "THREW" : "?");
      const rssDelta = r.maxRssMB && r.baseMaxRssMB ? r.maxRssMB - r.baseMaxRssMB : null;
      const fast = !r.died && r.ms < 5000;
      const lean = !r.died && (rssDelta ?? 0) <= 300;
      rec(c.id, fast && lean && c.want.includes(code), "MAJOR", `ไฟล์ระเบิด: ${c.what} (zip ${c.bytes.length.toLocaleString()} ไบต์) ⇒ ${c.want.join("/")} < 5 วิ · RSS เพิ่ม ≤ 300 MB · ไม่ throw/ไม่ตาย`,
        { code, ms: r.ms ?? r.wallMs, rssDeltaMB: rssDelta, maxRssMB: r.maxRssMB, rows: r.rows, err: r.err });
    }
    // i) CSV 1 แถว 9 MB: ค่าตั้งเดิม ⇒ FILE_TOO_LARGE · ยก maxFileBytes 10M ⇒ ผ่านอัปโหลดได้ แต่ preview ต้อง CELL_TOO_LONG
    const U = await mkDorm(A, "r14");
    const csv9 = enc(`ห้อง,ชื่อผู้เช่า\r\n101,${"ก".repeat(3_000_000)}\r\n`);
    const t0 = Date.now(); const r1 = await up(cO, U, csv9, "ใหญ่.csv"); const ms1 = Date.now() - t0;
    await setU(A, U, "rooms.import.maxFileBytes", 10_000_000);
    const t1 = Date.now(); const r2 = await up(cO, U, csv9, "ใหญ่.csv"); const ms2 = Date.now() - t1;
    let p2: any = null, ms3 = 0;
    if (r2?.ok) { const t2 = Date.now(); p2 = await dorm.previewImport(cO, { unitId: U, batchId: r2.batchId, mapping: { "0": "room", "1": "tenantName" }, options: OPTS }); ms3 = Date.now() - t2; }
    const longIssue = (p2?.issues ?? []).find((i: any) => i.code === "CELL_TOO_LONG");
    rec("R14i", r1?.code === "FILE_TOO_LARGE" && ms1 < 5000 && (r2?.ok ? !!longIssue && ms2 < 5000 && ms3 < 5000 && String(longIssue.value ?? "").length <= 1000 : ["TOO_MANY_ROWS", "UNSAFE_FILE"].includes(r2?.code)), "MAJOR",
      "CSV แถวเดียว 9 MB: ค่าเริ่ม ⇒ FILE_TOO_LARGE · maxFileBytes 10M ⇒ อัปได้แต่พรีวิว CELL_TOO_LONG (ค่าที่สะท้อนกลับถูกตัด) ภายใน < 5 วิ",
      { r1: slim(r1), ms1, r2: slim(r2), ms2, ms3, cellIssue: longIssue ? { sev: longIssue.severity, valueLen: String(longIssue.value ?? "").length } : null });
    // j) ขยายผ่าน sharedStrings: 1000 แถว × 60 คอลัมน์ อ้างสตริงเดียว 999 ตัวอักษร (ไฟล์เล็ก · อยู่ในเพดานทุกข้อ) ⇒ ข้อมูล 60 MB ในหน่วยความจำ/ฐาน
    {
      const U2 = await mkDorm(A, "r14j");
      const s = "ข".repeat(999);
      const hdrCells = Array.from({ length: 60 }, (_, i) => `<c r="${colRef(i)}1" t="inlineStr"><is><t>h${i}</t></is></c>`).join("");
      const rowX = (n: number) => `<row r="${n}">${Array.from({ length: 60 }, (_, i) => `<c r="${colRef(i)}${n}" t="s"><v>0</v></c>`).join("")}</row>`;
      const body = Array.from({ length: 1000 }, (_, i) => rowX(i + 2)).join("");
      const bytes = xlsxShell(`<?xml version="1.0"?><worksheet><sheetData><row r="1">${hdrCells}</row>${body}</sheetData></worksheet>`, `<sst><si><t>${s}</t></si></sst>`);
      const f = tmpWrite("R14j", bytes);
      const { kids } = await fan("r14j", [[{ m: "dorm", op: "uploadMem", a: [cO, { unitId: U2, fileName: "ขยาย.xlsx", contentType: "application/octet-stream", data: { __file: f } }] }]]);
      const k = kids[0];
      const sz: any[] = k?.r?.batchId ? await prisma.$queryRawUnsafe(`SELECT octet_length("parsed"::text)::bigint AS n FROM "DormImportBatch" WHERE id = $1`, k.r.batchId) : [];
      const dbMB = sz[0] ? Math.round(Number(sz[0].n) / 1e6) : 0;
      let pvMs = 0;
      if (k?.r?.batchId) { const t = Date.now(); await dorm.previewImport(cO, { unitId: U2, batchId: k.r.batchId }); pvMs = Date.now() - t; }
      const rss = k?.maxRssMB && k?.baseMaxRssMB ? k.maxRssMB - k.baseMaxRssMB : null;
      rec("R14j", (k?.ms ?? 1e9) < 5000 && (rss ?? 0) <= 300 && dbMB <= 20 && pvMs < 5000, "MINOR",
        `ขยายผ่าน sharedStrings: xlsx ${bytes.length.toLocaleString()} ไบต์ (ทุกเพดานผ่าน: 1000 แถว · 60 คอลัมน์ · เซลล์ 999) ⇒ อัปโหลด/พรีวิว < 5 วิ · RSS ≤ 300 MB · ไม่เก็บ JSON ขยายหลายสิบ MB ลงฐาน`,
        { upload: codeOf(k), ms: k?.ms, rssDeltaMB: rss, parsedInDbMB: dbMB, previewMs: pvMs });
    }
  });

  // ═══════════ R15 เซลล์อันตรายไหลผ่านทุกทางส่งออก ═══════════
  await step("R15", async () => {
    const FORMULA_START = /^(?:[\t\r\n]|[ ]*[=+\-@＝＋－＠])/;
    const U = await mkDorm(A, "r15");
    const base = fileOf("069", ["101", "102", "103", "104", "105", "106", "107", "109", "110", "111"]);
    const evil = ["=cmd|' /C calc'!A0", "=HYPERLINK(\"http://evil.example\",\"คลิก\")", "+SUM(1,2) ชื่อ", "-2+3 ชื่อ", "@SUM(A1) ชื่อ", "\t=1+1 แท็บ", " =1+1 เว้นวรรค", "＝１＋１ เต็ม", "\r=1 ซีอาร์", "＠ชื่อ เต็ม"];
    const headers = [...base.headers.slice(0, 9), "=cmd|' /C calc'!A0", "หมายเหตุ", "อาคาร", "ประเภทห้อง"];
    const rows = base.rows.map((r, i) => [...r.slice(0, 1), evil[i], ...r.slice(2, 10), i === 0 ? "=HYPERLINK(\"http://x\",\"y\")" : i === 1 ? "@note" : "", "=B1 อาคาร", i < 5 ? "-ประเภท" : "@ประเภท"]);
    rows.push(["-A1", "ปกติ ชื่อ", "069-777-4410", base.rows[0][3], "4500", "9000", "1200", "300", "", "", "", "=B1 อาคาร", "-ประเภท"]);
    const map15 = { ...MAP, "11": "building", "12": "roomType" };
    const u = await up(cO, U, csvBytes(headers, rows), "=HYPERLINK(\"x\").csv");
    if (!u?.ok) throw new Error(`upload ${J(slim(u))}`);
    let p = await dorm.previewImport(cO, { unitId: U, batchId: u.batchId, mapping: map15, options: OPTS });
    const mustRows = [...new Set(((p?.rows ?? []) as any[]).filter((r) => r.severity === "MUST_FIX").map((r) => r.rowNo))];
    const roomInv = (p?.issues ?? []).find((i: any) => i.room === "-A1" || (i.code === "ROOM_INVALID"));
    if (mustRows.length) p = await dorm.previewImport(cO, { unitId: U, batchId: u.batchId, mapping: map15, options: OPTS, decisions: Object.fromEntries(mustRows.map((n) => [String(n), [{ action: "SKIP" }]])) });
    const c = await cr(cO, U, u.batchId, p?.previewHash);
    const bad: string[] = [];
    const chk = (where: string, v: unknown) => { if (typeof v === "string" && FORMULA_START.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) bad.push(`${where}: ${J(v).slice(0, 50)}`); };
    const walk = (where: string, x: any, depth = 0) => { if (depth > 6 || x == null) return; if (typeof x === "string") chk(where, x); else if (Array.isArray(x)) x.forEach((y, i) => walk(`${where}[${i}]`, y, depth + 1)); else if (typeof x === "object") for (const [k, y] of Object.entries(x)) if (!["previewHash", "batchId", "unitId", "id", "leaseId", "roomId", "partyId"].includes(k)) walk(`${where}.${k}`, y, depth + 1); };
    walk("upload", { headers: u.headers, samples: u.samples, fileName: u.fileName });
    walk("preview.issues", (p?.issues ?? []).map((i: any) => ({ value: i.value, room: i.room })));
    const view = await dorm.getImport(cO, { unitId: U, batchId: u.batchId });
    walk("getImport", { headers: view?.headers, samples: view?.samples, fileName: view?.fileName, issues: (view?.issues ?? []).map((i: any) => ({ value: i.value, room: i.room })) });
    walk("listImports", await dorm.listImports(cO, { unitId: U }));
    const csvCells = (where: string, text: string | null) => { if (!text) return; const t = CSV.parseCsv(text); [t.headers, ...t.rows].forEach((r: string[], i: number) => r.forEach((cell, j) => chk(`${where}[${i}][${j}]`, cell))); };
    csvCells("importIssuesCsv", await dorm.importIssuesCsv(cO, { unitId: U, batchId: u.batchId }));
    csvCells("importTemplateCsv", dorm.importTemplateCsv());
    const ll = await dorm.listLeases(cO, { unitId: U });
    walk("listLeases", (ll?.rows ?? []).map((r: any) => ({ name: r.tenantName ?? r.name ?? r.partyName, room: r.roomNumber ?? r.room })));
    const ls = await prisma.dormLease.findMany({ where: { tenantId: A, unitId: U }, select: { id: true, partyId: true, policySnapshot: true } });
    for (const l of ls.slice(0, 12)) { const g = await dorm.getLease(cO, { unitId: U, leaseId: l.id }); walk(`getLease`, { name: g?.tenant?.name ?? g?.tenantName, room: g?.room?.number ?? g?.roomNumber }); chk("contract.tenantName", (l.policySnapshot as any)?.contract?.tenantName); }
    const parties = await prisma.party.findMany({ where: { id: { in: ls.map((l: any) => l.partyId) } }, select: { name: true } });
    parties.forEach((x: any) => chk("Party.name(DB)", x.name));
    (await prisma.hotelRoom.findMany({ where: { tenantId: A, unitId: U }, select: { number: true, note: true } })).forEach((x: any) => { chk("HotelRoom.number", x.number); chk("HotelRoom.note", x.note); });
    (await prisma.roomBuilding.findMany({ where: { tenantId: A, unitId: U }, select: { name: true } })).forEach((x: any) => chk("RoomBuilding.name", x.name));
    (await prisma.hotelRoomType.findMany({ where: { tenantId: A, unitId: U }, select: { name: true } })).forEach((x: any) => chk("HotelRoomType.name", x.name));
    const pr = await dorm.prepareBillRun(cO, { unitId: U, periodKey: CUR_P });
    if (pr?.runId) csvCells("billRunCsv", await dorm.billRunCsv(cO, { unitId: U, runId: pr.runId }));
    // DOM ของจอ หอ 12
    try {
      const scr = await imp("src/components/dorm/ImportScreen.tsx");
      const React: any = await import("react" as string); const RDS: any = await import("react-dom/server" as string);
      const C = typeof scr.default === "function" ? scr.default : scr.ImportScreen;
      const html = String(RDS.renderToStaticMarkup(React.createElement(C, { unitSlug: "x", view, preview: p })));
      const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
      html.split(/<[^>]+>/).map(unesc).filter((t) => t.trim() !== "").forEach((t) => chk("DOM", t));
      for (const m of html.matchAll(/\s(?:value|title|aria-label)="([^"]*)"/g)) chk("DOM@attr", unesc(m[1]));
    } catch (e) { bad.push(`DOM render ล้ม ${errMsg(e)}`); }
    rec("R15", bad.length === 0 && c?.ok === true, "MAJOR", "เซลล์อันตราย (= + - @ tab CR ตัวเต็มความกว้าง DDE HYPERLINK · หัวคอลัมน์ · ชื่อไฟล์ · อาคาร/ประเภท/หมายเหตุ) ไหลผ่าน ชื่อ→สัญญา→listLeases/getLease→CSV ทุกตัว (issues · template · บิล)→DOM ⇒ ไม่มีช่องใดขึ้นต้นด้วยสูตร",
      { create: slim(c), mustFixRows: mustRows, roomInvalid: roomInv ? `${roomInv.code}/${roomInv.severity}` : null, bad: bad.slice(0, 15), nBad: bad.length });
    rec("R15b", !!roomInv && roomInv.severity === "MUST_FIX", "MINOR", "เลขห้องขึ้นต้นด้วยสูตร (-A1) ⇒ ROOM_INVALID ต้องแก้", roomInv ?? null);
    await money("R15", A, [U]);
  });
} catch (e) {
  console.log(`💥 CRASH: ${e instanceof Error ? e.stack : String(e)}`);
  exitCode = 2;
} finally {
  await cleanup(tenantIds);
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d4pb-" } } });
  for (const f of tmpFiles) { try { unlinkSync(f); } catch { /* */ } }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d4pb-" } } });
  const lu = await prisma.user.count({ where: { email: { startsWith: "svc-d4pb-" } } });
  console.log(`\n── ล้าง: tenant ค้าง ${left} · user ค้าง ${lu} ──`);
  if (notes.length) console.log(`\nNOTES:\n${notes.map((n) => `  - ${n}`).join("\n")}`);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nPROBE_SUMMARY ${J({ total: results.length, fail: bad.map((r) => `${r.id}:${r.sev}`) })}`);
  await prisma.$disconnect();
  process.exit(exitCode || (bad.length ? 1 : 0));
}
