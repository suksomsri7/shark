// PROBE — SVC D.19 reviewer B (ยอดเงินตรง GL 1100 ในสถานะเงินยาก · ขอบวันไทย · X1 ข้ามร้าน/หน่วย/อาคาร · X6 CSV กันสูตร · อ่านพร้อมรับเงิน) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-d19-b.mts
// ข้อมูลใต้ร้าน `qc-svc-d19pb-*` + ผู้ใช้ `svc-d19pb-*@shark.local` · ไม่ออกนอกเครื่อง · ล้างใน finally
// หมวด: PC ตัวควบคุม · MN เงิน (ใบลดหนี้หลังจ่ายครบ · ใบเพิ่มหนี้ที่รับเงินแล้วยกเลิก · ยกยอด/จ่ายเกิน · ใบเพิ่มหนี้ลอย · ยกเลิกใบเสร็จ)
//       MD ขอบวันไทย · XS ด่าน · SC ขอบเขตอาคาร · CV CSV · CC อ่านพร้อมรับเงิน · RO อ่านอย่างเดียว
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes, randomInt } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

loadSvcQcEnv("probe-d19-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
process.env.APP_URL = "https://qc-d19pb.invalid";
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host);
  return new Response("{}", { status: 503 });
}) as typeof fetch;

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown) => {
  const d = typeof detail === "string" ? detail : J(detail);
  results.push({ id, ok, sev, what, detail: d });
  console.log(`  ${ok ? "✅ HOLD" : sev === "INFO" ? "ℹ️  INFO" : "❌ BREACH"} [${id}] (${sev}) ${what} — ${d.slice(0, 1600)}`);
};
const safe = async (id: string, sev: string, what: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, sev, what, `throw: ${errMsg(e)}`); } };
const codeOf = (x: any) => (x?.threw ? "THREW" : x === null ? "null" : x?.ok === true ? "OK" : x?.code ?? J(x).slice(0, 60));

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const DORM: any = await import("@/lib/modules/dorm" as string);
const ACC: any = await import("@/lib/modules/account" as string);
const ASV: any = await import("@/lib/modules/account/service" as string);
const GL: any = await import("@/lib/modules/account/gl" as string);
const SYS: any = await import("@/lib/modules/system/service" as string);
const SET: any = await import("@/lib/core/settings" as string);
const DPAY: any = await import("@/lib/platform/dorm-pay" as string);
const PRISMA_NS: any = (await import("@prisma/client" as string)).Prisma;

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
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
const parkOutbox = async (tids: string[]) => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tids); };

// ═══════════ ค่าคงที่ ═══════════
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const tenantIds: string[] = [];
const P1 = "2026-07", P2 = "2026-08", P3 = "2026-09";
const PERIODS = [P1, P2, P3];
const RUN_AT: Record<string, string> = { [P1]: "2026-06-25T03:00:00.000Z", [P2]: "2026-07-25T03:00:00.000Z", [P3]: "2026-08-25T03:00:00.000Z" };
const NOW = "2026-10-10T03:00:00.000Z"; // 10 ต.ค. ไทย
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const SENTISH = ["SENT", "PARTIALLY_PAID", "PAID"];
const DEAD = ["DRAFT", "VOIDED", "CANCELLED"];
const REV_TYPES = ["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE", "OTHER", "ADJUST"] as const;
const typeOfCode = (code: string) => (["RENT", "COMMON", "ELEC", "WATER", "LATE_FEE"].includes(code) ? code : "OTHER");
type M3 = { netSatang: number; vatSatang: number; grossSatang: number };
const z3 = (): M3 => ({ netSatang: 0, vatSatang: 0, grossSatang: 0 });
const add3 = (a: M3, b: M3, s = 1) => { a.netSatang += s * b.netSatang; a.vatSatang += s * b.vatSatang; a.grossSatang += s * b.grossSatang; };
const parseCsv = (s: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
};
const dangerous = (cell: string) => !/^-?\d+(\.\d+)?$/.test(cell) && /^[\t\r\n ]*[=+\-@]/.test(cell);
const satOfBaht = (s: string) => { const neg = s.startsWith("-"); const [i, f] = s.replace("-", "").split("."); return (neg ? -1 : 1) * (Number(i) * 100 + Number(f)); };

let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d19pb-" } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: { id: string }) => t.id));
  await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d19pb-" } } });

  // ═══════════ fixtures ═══════════
  console.log("\n── สร้างข้อมูล ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `PB D19 ${tag}`, slug: `qc-svc-d19pb-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false, taxId: null, branchCode: "00000", address: "99 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110" });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUnit = async (tenantId: string, tag: string, name: string, type = "DORM") => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `d19pb${tag}-${STAMP}` } })).id as string;
  const mem: Record<string, string> = {};
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = [], accepted = true) => {
    const u = await prisma.user.create({ data: { email: `svc-d19pb-${STAMP}-${key}@shark.local`, name: `PB19 ${key}` } });
    const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: accepted ? new Date() : null } });
    mem[key] = m.id;
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scope: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope, scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope, scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "pb-d19" } });
  };
  const U = (t: string, u: string, k: string, v: unknown) => setVal(t, k, "UNIT", u, v);
  const moneyUnit = async (t: string, u: string) => {
    await U(t, u, "rooms.utility.elec.metering", "NONE"); await U(t, u, "rooms.utility.water.metering", "NONE");
    await U(t, u, "messaging.quietHours", null); await U(t, u, "messaging.channelOrder", ["WEB_LINK"]);
    await U(t, u, "rooms.lateFee.autoCharge", false);
    await U(t, u, "payments.receiver", { promptpayId: "0812345678", displayName: "หอพีบีสิบเก้า" });
  };
  const ty = async (t: string, u: string) => (await prisma.hotelRoomType.create({ data: { tenantId: t, unitId: u, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
  const bld = async (t: string, u: string, name: string, s: number) => (await prisma.roomBuilding.create({ data: { tenantId: t, unitId: u, name, floors: 3, sortOrder: s } })).id as string;
  const room = async (t: string, u: string, tyId: string, b: string, n: string, active = true) => (await prisma.hotelRoom.create({ data: { tenantId: t, unitId: u, roomTypeId: tyId, number: n, buildingId: b, floorNo: 1, floor: "1", active } })).id as string;
  const LS: Record<string, { leaseId: string; partyId: string; roomId: string; roomNo: string; bld: string }> = {};
  const mkLease = async (key: string, t: string, u: string, roomId: string, roomNo: string, typeId: string, name: string, b: string) => {
    const party = await prisma.party.create({ data: { tenantId: t, name, phone: `08${randomInt(10_000_000, 99_999_999)}` } });
    const snap = await SET.snapshotPolicy({ tenantId: t }, "lease", { unitId: u, roomTypeId: typeId, roomId });
    const l = await prisma.dormLease.create({ data: {
      tenantId: t, unitId: u, roomId, partyId: party.id, status: "ACTIVE", startDate: dbDate("2026-01-01"), endDate: dbDate("2027-12-31"),
      rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, coTenants: { occupants: [], vehicles: [] },
      policySnapshot: snap, signedAt: new Date(), createdById: "pb-d19",
    } });
    const oc = await prisma.roomOccupancy.create({ data: { tenantId: t, unitId: u, roomId, startDate: dbDate("2026-01-01"), endDate: dbDate("2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
    await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    LS[key] = { leaseId: l.id, partyId: party.id, roomId, roomNo, bld: b };
  };

  const BOOK = await mkBook(A, `บัญชีหอ PB19 ${STAMP}`);
  const DA = await mkUnit(A, "a", "หอพีบีสิบเก้า"), DA2 = await mkUnit(A, "a2", "หอพีบีสิบเก้าสอง"), DX = await mkUnit(A, "x", "หอพีบีสิบเก้าลับ"), HA = await mkUnit(A, "h", "โรงแรมพีบี", "HOTEL");
  const DB = await mkUnit(B, "b", "หอพีบีร้านบี");
  await prisma.accountSystemLink.create({ data: { tenantId: A, systemId: BOOK, linkedKind: "BUSINESS", linkedId: DA, enabled: true } });
  await moneyUnit(A, DA);
  const OWN = await mkUser("own", A, "OWNER", ["*"]);
  const OWNB = await mkUser("ownb", B, "OWNER", ["*"]);
  const SC = await mkUser("sc", A, "STAFF", [DA], ["dorm.view", "dorm.slip.review"]);          // ผู้ดูแลอาคาร 1
  const SC2 = await mkUser("sc2", A, "STAFF", [DA, DA2], ["dorm.view", "dorm.slip.review"]);   // ได้อาคารของหน่วยอื่น ⇒ ต้องไม่เห็นอะไรใน DA
  const VW = await mkUser("vw", A, "STAFF", [DA], ["dorm.view"]);                              // ไม่เห็นเงิน
  const MGRX = await mkUser("mgrx", A, "MANAGER", [DX]);                                        // หน่วยอื่น
  const PEND = await mkUser("pend", A, "OWNER", ["*"], [], false);                              // ยังไม่ตอบรับ
  const tyA = await ty(A, DA), B1 = await bld(A, DA, "อาคาร หนึ่ง", 1), B2 = await bld(A, DA, "อาคาร สอง", 2);
  const tyA2 = await ty(A, DA2), BX = await bld(A, DA2, "อาคาร หน่วยสอง", 1);
  await room(A, DA2, tyA2, BX, "901");
  const tyB = await ty(B, DB), BB = await bld(B, DB, "อาคาร บี", 1);
  await room(B, DB, tyB, BB, "101");
  // อาคาร 1: ฉากเงิน (ชื่อธรรมดา) · อาคาร 2: เลขห้อง/ชื่อเป็นสูตร (X6)
  const B1L: [string, string, string][] = [["K1", "101", "กมล ใจดีพีบี"], ["K2", "102", "ขวัญ สุขพีบี"], ["K3", "103", "คมสัน ทองพีบี"], ["K4", "104", "งามตา ศรีพีบี"], ["K5", "105", "จันทร์ ดีพีบี"], ["K6", "106", "ฉัตร มั่นพีบี"]];
  const B2L: [string, string, string][] = [
    ["X1", "=1+1", `=HYPERLINK("http://x.invalid","x") พีบี`], ["X2", "+SUM(A1)", "+66ส่วนลด พีบี"], ["X3", "-2+3", "-1+1 พีบี"],
    ["X4", "@cmd", "@SUM(A1) พีบี"], ["X5", "\t=tab", "\t=tabname พีบี"], ["X6", "\r=cr", "\r@crname พีบี"], ["X7", "201", "ชบา ปกติพีบี"],
  ];
  for (const [k, no, name] of B1L) await mkLease(k, A, DA, await room(A, DA, tyA, B1, no), no, tyA, name, B1);
  for (const [k, no, name] of B2L) await mkLease(k, A, DA, await room(A, DA, tyA, B2, no), no, tyA, name, B2);
  const REPAIR = await room(A, DA, tyA, B1, "107"); // ห้องว่าง (เช่น ซ่อม) ยัง active ⇒ อยู่ในตัวหาร
  await room(A, DA, tyA, B1, "108", false);          // ห้องปิด ⇒ ไม่อยู่ในตัวหาร
  const cO = { tenantId: A, actorUserId: OWN };
  const sendAll = async (unitId: string, runId: string, now: string) => { let last: any = null; for (let i = 0; i < 40; i++) { last = await DORM.sendBillRun(cO, { unitId, runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; } return last; };
  const runs: any[] = [];
  for (const p of PERIODS) {
    const r = await DORM.prepareBillRun(cO, { unitId: DA, periodKey: p }, { now: new Date(RUN_AT[p]) });
    const s = r?.ok ? await sendAll(DA, r.runId, RUN_AT[p]) : null;
    runs.push({ p, r: codeOf(r), done: s?.done ?? codeOf(s) });
    await parkOutbox(tenantIds);
  }
  const billOf = async (k: string, p: string) => prisma.dormBill.findFirst({ where: { leaseId: LS[k].leaseId, periodKey: p } });
  const allKeys = [...B1L, ...B2L].map((x) => x[0]);
  const missing: string[] = [];
  for (const k of allKeys) for (const p of PERIODS) { const b = await billOf(k, p); if (!b || !SENTISH.includes(b.status) || !b.accountDocumentId || b.totalSatang !== BASE) missing.push(`${k}:${p}`); }
  console.log(`  รอบบิล ${J(runs)} · บิลไม่พร้อม ${missing.length} ${missing.slice(0, 5).join(",")}`);
  if (missing.length) throw new Error(`ฉากบิลไม่พร้อม ${missing.slice(0, 6).join(",")}`);

  // ═══════════ ความจริงอิสระ ═══════════
  const glArOfDocs = async (tenantId: string, systemId: string, docIds: string[]): Promise<number> => {
    if (!docIds.length) return 0;
    const pays: any[] = await prisma.accountDocumentPayment.findMany({ where: { tenantId, documentId: { in: docIds } }, select: { entryId: true } });
    const base: any[] = await prisma.accountJournalEntry.findMany({ where: { tenantId, systemId, OR: [{ refType: "AccountDocument", refId: { in: docIds } }, { id: { in: pays.map((p) => p.entryId).filter(Boolean) } }] }, select: { id: true } });
    const rev: any[] = base.length ? await prisma.accountJournalEntry.findMany({ where: { tenantId, reversalOfId: { in: base.map((e) => e.id) } }, select: { id: true } }) : [];
    const ls: any[] = await prisma.accountJournalLine.findMany({ where: { tenantId, entryId: { in: [...base, ...rev].map((e) => e.id) }, account: { code: "1100" } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.debit - l.credit, 0);
  };
  const docsOfLeases = async (keys: string[]): Promise<string[]> => {
    const bs: any[] = await prisma.dormBill.findMany({ where: { leaseId: { in: keys.map((k) => LS[k].leaseId) }, accountDocumentId: { not: null } }, select: { accountDocumentId: true } });
    const inv = bs.map((b) => b.accountDocumentId as string);
    const kids: any[] = inv.length ? await prisma.accountDocument.findMany({ where: { sourceDocId: { in: inv } }, select: { id: true } }) : [];
    return [...new Set([...inv, ...kids.map((k) => k.id)])];
  };
  const glOf = async (keys: string[]) => glArOfDocs(A, BOOK, await docsOfLeases(keys));
  const agingOwn = async (now = NOW) => DORM.dormAgingReport(cO, { unitId: DA }, { now: new Date(now) });
  const rowOf = (rep: any, k: string) => (rep?.rows ?? []).find((r: any) => r.leaseId === LS[k].leaseId);
  const rowTot = (rep: any, k: string) => rowOf(rep, k)?.buckets?.totalSatang ?? 0;
  const billIdsOf = async (keys: string[]) => (await prisma.dormBill.findMany({ where: { leaseId: { in: keys.map((k) => LS[k].leaseId) } }, select: { id: true } })).map((b: any) => b.id);
  const balOf = async (keys: string[]) => { const m = await DORM.billBalances(A, await billIdsOf(keys)); return [...m.values()].reduce((a: number, x: any) => a + x.ownOutstandingSatang, 0); };
  /** รายได้ต่องวดจากตารางบัญชี (เอกสารที่มีผลของบิล + ใบปรับยอด + รับชำระไม่ยกเลิก) */
  const expRev = async (p: string, roomIds?: Set<string>) => {
    const bs: any[] = await prisma.dormBill.findMany({ where: { unitId: DA, status: { in: SENTISH }, periodKey: p } });
    const m = { bills: 0, total: z3(), adjust: z3(), collected: 0 };
    for (const b of bs) {
      if (roomIds && !roomIds.has(b.roomId)) continue;
      const inv = await prisma.accountDocument.findFirst({ where: { id: b.accountDocumentId }, select: { status: true, subTotal: true, vatAmount: true, grandTotal: true } });
      if (!inv || DEAD.includes(inv.status)) continue;
      m.bills += 1;
      add3(m.total, { netSatang: inv.subTotal, vatSatang: inv.vatAmount, grossSatang: inv.grandTotal });
      const adj: any[] = await prisma.accountDocument.findMany({ where: { tenantId: A, refType: "DormBillAdjust", refId: { startsWith: `${b.id}:` }, status: { notIn: DEAD } }, select: { docType: true, subTotal: true, vatAmount: true, grandTotal: true } });
      for (const d of adj) { const v = { netSatang: d.subTotal, vatSatang: d.vatAmount, grossSatang: d.grandTotal }; const s = d.docType === "CREDIT_NOTE" ? -1 : 1; add3(m.adjust, v, s); add3(m.total, v, s); }
      const fam: any[] = await prisma.accountDocument.findMany({ where: { tenantId: A, OR: [{ id: b.accountDocumentId }, { sourceDocId: b.accountDocumentId, docType: "DEBIT_NOTE" }] }, select: { id: true } });
      const pp: any[] = await prisma.accountDocumentPayment.findMany({ where: { tenantId: A, documentId: { in: fam.map((x) => x.id) }, voidedAt: null }, select: { amount: true, whtAmountSatang: true } });
      m.collected += pp.reduce((a, x) => a + x.amount + (x.whtAmountSatang ?? 0), 0);
    }
    return m;
  };
  const gotRev = async (p: string, ctx = cO) => { const r = await DORM.dormRevenueReport(ctx, { unitId: DA, fromMonth: p, toMonth: p }, { now: new Date(NOW) }); const m = r?.months?.[0]; return { ok: r?.ok, bills: m?.bills, total: m?.total, adjust: m?.types?.ADJUST, collected: m?.collectedSatang, sumTypes: m ? REV_TYPES.reduce((a, t) => a + m.types[t].grossSatang, 0) : null }; };
  let pk = 0;
  const key = (t: string) => `pb19-${STAMP}-${t}-${++pk}`;
  const dpay = (k: string, billId: string, amount: number, ymd: string) => DPAY.recordDormPayment(cO, { unitId: DA, billId, amountSatang: amount, channel: "CASH", idempotencyKey: key(k), paidAt: `${ymd}T12:00:00+07:00` });
  const xpay = (docId: string, amount: number, ymd: string) => ACC.recordExternalPayment({ tenantId: A, unitId: DA, docId, amountSatang: amount, idempotencyKey: key("x"), paidAt: new Date(`${ymd}T05:00:00.000Z`) });
  const adjust = (billId: string, kind: "CREDIT" | "DEBIT", amount: number, code = kind === "CREDIT" ? "COMMON" : "OTHER") =>
    DORM.adjustSentBill(cO, { unitId: DA, billId, kind, reason: kind === "CREDIT" ? "ลดค่าส่วนกลางตามที่ตกลงกับผู้เช่า" : "ค่าซ่อมอุปกรณ์ที่ผู้เช่าตกลงจ่าย", idempotencyKey: key(kind), lines: [{ code, labelTh: kind === "CREDIT" ? "ลดค่าส่วนกลาง" : "ค่าซ่อม", amountSatang: amount }] });

  // ═══════════ ฉากเงินยาก (อาคาร 1) ═══════════
  console.log("\n── MN เงิน ──");
  // ค่าเริ่ม: ทุกสัญญาอาคาร 1 จ่าย ก.ค. ครบ (ยกเว้น K3 · K6) ด้วยทางรับเงินหอ D.10
  for (const k of ["K1", "K2", "K4", "K5"]) { const r = await dpay(k, (await billOf(k, P1))!.id, BASE, "2026-07-04"); if (!r?.ok) throw new Error(`pay ${k} ${codeOf(r)} ${r?.reason ?? ""}`); }

  // MN-1 ใบลดหนี้หลังจ่ายครบ (K1 ก.ค.) ⇒ ด่าน D.8 ปฏิเสธ (ไม่มีลูกหนี้ติดลบ) · ใบลดหนี้ก่อนแล้วจ่ายเต็ม (K1 ส.ค.) ⇒ ส่วนเกินไป 2110 · รายงาน = GL
  await safe("MN-1", "CRITICAL", "ใบลดหนี้หลังจ่ายครบ / ใบลดหนี้แล้วจ่ายเต็ม", async () => {
    const k1p1 = (await billOf("K1", P1))!;
    const cnAfter = await adjust(k1p1.id, "CREDIT", 30_000);
    const k1p2 = (await billOf("K1", P2))!;
    const cnFirst = await adjust(k1p2.id, "CREDIT", 80_000);
    const payFull = await dpay("K1", k1p2.id, BASE, "2026-08-04");
    await parkOutbox(tenantIds);
    const rep = await agingOwn();
    const gl = await glOf(["K1"]), bal = await balOf(["K1"]), got = rowTot(rep, "K1");
    // K1: ก.ค. 0 · ส.ค. 0 (ลด 800 + จ่าย 4,800 ⇒ เกิน 800) · ก.ย. 4,800 ยังไม่จ่าย
    const ok = cnAfter?.ok === false && cnAfter.code === "EXCEEDS_REMAINING" && cnFirst?.ok === true && payFull?.ok === true && got === gl && gl === bal && got === BASE;
    rec("MN-1", ok, "CRITICAL", "K1: ใบลดหนี้หลังจ่ายครบถูกปฏิเสธ · ลดก่อนแล้วจ่ายเต็ม ⇒ ค้าง = GL 1100 = billBalances (ไม่ติดลบ ไม่นับซ้ำ)", { cnAfter: codeOf(cnAfter), cnFirst: codeOf(cnFirst), payFull: codeOf(payFull), report: got, gl, bal });
    const rv = await gotRev(P2), ev = await expRev(P2);
    rec("MN-1r", rv.ok && isDeepStrictEqual(rv.total, ev.total) && isDeepStrictEqual(rv.adjust, ev.adjust) && rv.collected === ev.collected && rv.sumTypes === rv.total?.grossSatang, "CRITICAL", "รายได้ ส.ค. (มีใบลดหนี้ K1) = เอกสารบัญชีที่มีผล · ADJUST = −ใบลดหนี้ · เก็บแล้ว = รับชำระไม่ยกเลิก (รวมส่วนเกิน?)", { got: rv, exp: ev });
  });

  // MN-2 ใบเพิ่มหนี้ที่รับเงินแล้วยกเลิก (K2 ส.ค.): จ่ายใบแจ้งหนี้ครบ → ใบเพิ่มหนี้ 250 → รับเงิน 250 → ยกเลิกใบเพิ่มหนี้ (ต้องถูกปฏิเสธเพราะมีรับชำระ) → ยกเลิกใบเสร็จ → ยกเลิกใบเพิ่มหนี้
  await safe("MN-2", "CRITICAL", "ใบเพิ่มหนี้ที่รับเงินแล้วยกเลิก", async () => {
    const b = (await billOf("K2", P2))!;
    const p0 = await dpay("K2", b.id, BASE, "2026-08-04");
    const dn = await adjust(b.id, "DEBIT", 25_000);
    const p1 = await dpay("K2", b.id, 25_000, "2026-08-20");
    await parkOutbox(tenantIds);
    const rep1 = await agingOwn(); const gl1 = await glOf(["K2"]);
    const rv1 = await gotRev(P2), ev1 = await expRev(P2);
    const dnPays = dn?.ok ? await prisma.accountDocumentPayment.count({ where: { documentId: dn.docId, voidedAt: null } }) : -1;
    const v1 = dn?.ok ? await ASV.voidDocument(A, BOOK, dn.docId, "ทดสอบยกเลิกใบเพิ่มหนี้ที่รับเงินแล้ว") : null;
    rec("MN-2a", p0?.ok && dn?.ok && p1?.ok && dnPays === 1 && rowTot(rep1, "K2") === gl1 && v1?.ok === false && isDeepStrictEqual(rv1.adjust, ev1.adjust) && rv1.collected === ev1.collected, "CRITICAL",
      "K2 ใบเพิ่มหนี้รับเงินแล้ว: ค้าง = GL · ADJUST/เก็บแล้วรวมใบเพิ่มหนี้ · ยกเลิกใบเพิ่มหนี้ที่มีรับชำระ ⇒ บัญชีปฏิเสธ (ไม่มีสถานะ 'เงินค้างบนใบเพิ่มหนี้ที่ยกเลิก')",
      { pays: [codeOf(p0), codeOf(dn), codeOf(p1)], dnPays, report: rowTot(rep1, "K2"), gl: gl1, voidDn: v1, rev: rv1, exp: ev1 });
    // ถอยใบเสร็จของเงิน 250 แล้วยกเลิกใบเพิ่มหนี้
    const vr = p1?.ok ? await DPAY.voidDormReceipt(cO, { receiptId: p1.receipt.receiptId, reason: "ทดสอบถอยใบเสร็จก่อนยกเลิกใบเพิ่มหนี้" }) : null;
    const v2 = dn?.ok ? await ASV.voidDocument(A, BOOK, dn.docId, "ทดสอบยกเลิกใบเพิ่มหนี้หลังถอยเงิน") : null;
    await parkOutbox(tenantIds);
    const rep2 = await agingOwn(); const gl2 = await glOf(["K2"]); const bal2 = await balOf(["K2"]);
    const rv2 = await gotRev(P2), ev2 = await expRev(P2);
    const dnPaid = await DORM.billBalances(A, [b.id]);
    rec("MN-2b", vr?.ok === true && v2?.ok === true && rowTot(rep2, "K2") === gl2 && gl2 === bal2 && isDeepStrictEqual(rv2.adjust, ev2.adjust) && rv2.collected === ev2.collected && isDeepStrictEqual(rv2.total, ev2.total), "CRITICAL",
      "หลังถอยใบเสร็จ + ยกเลิกใบเพิ่มหนี้: ค้าง K2 = GL = billBalances · ADJUST ไม่นับใบที่ยกเลิก · เก็บแล้วไม่นับเงินที่ถอย (หนี้ที่ builder จด = ไม่เกิดจริง)",
      { voidReceipt: codeOf(vr), voidDn: codeOf(v2), report: rowTot(rep2, "K2"), gl: gl2, bal: bal2, own: dnPaid.get(b.id)?.ownOutstandingSatang, rev: rv2, exp: ev2 });
  });

  // MN-3 ยกยอด + จ่ายเกิน (K3): ก.ค. จ่าย 2,000 + ยกยอด 2,800 · ส.ค. จ่ายเกิน 1,000 · ก.ย. ไม่จ่าย ⇒ ไม่นับยอดยกมาซ้ำ · เงินเกินไม่หักลูกหนี้ใบอื่น (อยู่ 2110)
  await safe("MN-3", "CRITICAL", "ยกยอด + จ่ายเกิน", async () => {
    const b1 = (await billOf("K3", P1))!, b2 = (await billOf("K3", P2))!;
    const x1 = await xpay(b1.accountDocumentId!, 200_000, "2026-07-04");
    await prisma.dormBill.update({ where: { id: b1.id }, data: { carriedSatang: 280_000 } });
    const x2 = await xpay(b2.accountDocumentId!, BASE + 100_000, "2026-08-04");
    await parkOutbox(tenantIds);
    const rep = await agingOwn(); const gl = await glOf(["K3"]); const bal = await balOf(["K3"]);
    const r = rowOf(rep, "K3");
    const per = (r?.bills ?? []).map((x: any) => [x.periodKey, x.outstandingSatang]);
    const bb = await DORM.billBalances(A, [b1.id, b2.id, (await billOf("K3", P3))!.id]);
    const due3 = bb.get((await billOf("K3", P3))!.id)?.dueSatang;
    rec("MN-3", x1?.ok && x2?.ok && x2.excessSatang === 100_000 && r?.buckets?.totalSatang === gl && gl === bal && gl === 280_000 + BASE && isDeepStrictEqual(per, [[P1, 280_000], [P3, BASE]]), "CRITICAL",
      "K3: ค้าง = GL 1100 = 2,800 (ก.ค. ยกยอด ยังอยู่บิลต้นทาง) + 4,800 (ก.ย.) · ไม่นับยอดยกมาซ้ำที่บิลถัดไป · เงินเกิน ส.ค. 1,000 อยู่ 2110 ไม่หักลูกหนี้",
      { x2: { ok: x2?.ok, excess: x2?.excessSatang }, report: r?.buckets?.totalSatang, gl, bal, per, dueSatangP3_label: due3 });
  });

  // MN-4 ใบเพิ่มหนี้ลอย (K4 ส.ค.): ใบเพิ่มหนี้ 150 (ยังไม่จ่าย) แล้วยกเลิกใบแจ้งหนี้ ⇒ ลูกหนี้ยังมี 150 (= GL) · รายได้ไม่นับทั้งบิลตาม §2 ข้อ 7 (แต่ใบเพิ่มหนี้ยังมีผลในบัญชี)
  await safe("MN-4", "MAJOR", "ใบเพิ่มหนี้ลอยหลังยกเลิกใบแจ้งหนี้", async () => {
    const b = (await billOf("K4", P2))!;
    const dn = await adjust(b.id, "DEBIT", 15_000);
    const vd = await ASV.voidDocument(A, BOOK, b.accountDocumentId, "ทดสอบยกเลิกใบแจ้งหนี้ที่มีใบเพิ่มหนี้");
    await parkOutbox(tenantIds);
    const rep = await agingOwn(); const gl = await glOf(["K4"]); const bal = await balOf(["K4"]);
    rec("MN-4a", dn?.ok && rowTot(rep, "K4") === gl && gl === bal, "CRITICAL", "K4 ลูกหนี้ = GL 1100 = billBalances (ใบแจ้งหนี้ยกเลิก + ใบเพิ่มหนี้ลอย)", { dn: codeOf(dn), voidInv: vd, report: rowTot(rep, "K4"), gl, bal });
    if (vd?.ok) {
      const rv = await gotRev(P2), ev = await expRev(P2);
      const dnLive = dn?.ok ? await prisma.accountDocument.findFirst({ where: { id: dn.docId }, select: { status: true, grandTotal: true } }) : null;
      const agingHas = (rowOf(rep, "K4")?.bills ?? []).some((x: any) => x.periodKey === P2 && x.outstandingSatang === 15_000);
      // รายงานตามสัญญา §2 ข้อ 7 (ใบยกเลิก ⇒ ไม่นับทั้งบิล) — บันทึกเป็นข้อสังเกตความไม่สอดคล้องกับบัญชี (ใบเพิ่มหนี้ยังมีผล 150)
      rec("MN-4b", false, "INFO", "รายได้ ส.ค.: บิล K4 (ใบแจ้งหนี้ยกเลิก) ถูกตัดทั้งบิลรวมใบเพิ่มหนี้ที่ยังมีผล ⇒ ลูกหนี้แสดง 150 แต่รายได้/ADJUST ไม่มี 150 นี้", { dnStatus: dnLive?.status, agingHas, revAdjust: rv.adjust, expAdjustBySpec: ev.adjust, revTotal: rv.total, specMatch: isDeepStrictEqual(rv.total, ev.total) });
    }
  });

  // MN-5 ยกเลิกใบเสร็จ D.10 (K5 ก.ย.): จ่ายครบ → ยกเลิกใบเสร็จ ⇒ ค้างกลับมา 4,800 = GL
  await safe("MN-5", "CRITICAL", "ยกเลิกใบเสร็จ", async () => {
    const b = (await billOf("K5", P3))!;
    const p = await dpay("K5", b.id, BASE, "2026-09-04");
    const before = rowTot(await agingOwn(), "K5");
    const vr = p?.ok ? await DPAY.voidDormReceipt(cO, { receiptId: p.receipt.receiptId, reason: "ทดสอบยกเลิกใบเสร็จรายงานหอ" }) : null;
    await parkOutbox(tenantIds);
    const rep = await agingOwn(); const gl = await glOf(["K5"]);
    const rv = await gotRev(P3), ev = await expRev(P3);
    rec("MN-5", p?.ok && vr?.ok && before === BASE && rowTot(rep, "K5") === gl && gl === 2 * BASE && rv.collected === ev.collected, "CRITICAL", "K5 (ส.ค. ค้างอยู่ 4,800): จ่าย ก.ย. ครบ ⇒ เหลือ 4,800 · ยกเลิกใบเสร็จ ⇒ 9,600 = GL · เก็บแล้ว ก.ย. ไม่นับเงินที่ถอย", { pay: codeOf(p), voidR: codeOf(vr), before, after: rowTot(rep, "K5"), gl, rev: rv.collected, exp: ev.collected });
  });

  // MN-T ภาพรวม: ทุกสัญญา (ทั้งหน่วย) รายงาน = GL = billBalances · ถังรวม = Σ แถว
  await safe("MN-T", "CRITICAL", "ภาพรวมหน่วย", async () => {
    const rep = await agingOwn();
    const gl = await glOf(allKeys), bal = await balOf(allKeys);
    const sumRows = (rep.rows ?? []).reduce((a: number, r: any) => a + r.buckets.totalSatang, 0);
    const bk = rep.buckets; const parts = bk.notDueSatang + bk.d1_30Satang + bk.d31_60Satang + bk.d61_90Satang + bk.d90plusSatang;
    const perLease: string[] = [];
    for (const k of allKeys) { const g = await glOf([k]); if (g !== rowTot(rep, k)) perLease.push(`${k}: ${rowTot(rep, k)}≠GL ${g}`); }
    const unb: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM (SELECT "entryId" FROM "AccountJournalLine" WHERE "tenantId" = ANY($1::text[]) GROUP BY "entryId" HAVING sum(debit) <> sum(credit)) x`, tenantIds);
    rec("MN-T", rep.ok && bk.totalSatang === gl && gl === bal && sumRows === bk.totalSatang && parts === bk.totalSatang && !perLease.length && Number(unb[0]?.n ?? 0) === 0, "CRITICAL",
      "ทั้งหน่วยหลังฉากเงินยาก: ถังรวม = GL 1100 = Σ billBalances · ถัง 5 ช่อง = total = Σ แถว · ต่อสัญญาตรง GL ทุกสัญญา · ใบสำคัญสมดุล", { total: bk.totalSatang, gl, bal, sumRows, perLease, unbalanced: Number(unb[0]?.n ?? 0) });
  });

  // ═══════════ MD ขอบวันไทย ═══════════
  console.log("\n── MD ขอบวันไทย ──");
  await safe("MD", "CRITICAL", "ขอบวันไทย", async () => {
    const b = (await billOf("K6", P3))!;
    const due = b.dueDate.toISOString().slice(0, 10);
    const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const thaiAt = (ymd: string, hms: string) => new Date(Date.parse(`${ymd}T${hms}Z`) - 7 * 3_600_000).toISOString(); // เวลาไทย → UTC
    const cases: [string, number, string][] = [
      [thaiAt(due, "23:59:59"), 0, "notDue"], [thaiAt(addDays(due, 1), "00:00:00"), 1, "d1_30"],
      [thaiAt(addDays(due, 60), "23:59:59"), 60, "d31_60"], [thaiAt(addDays(due, 61), "00:00:00"), 61, "d61_90"],
      [thaiAt(addDays(due, 90), "23:59:59"), 90, "d61_90"], [thaiAt(addDays(due, 91), "00:00:00"), 91, "d90plus"],
    ];
    const bad: string[] = [];
    for (const [at, dl, bk] of cases) {
      const r = await agingOwn(at);
      const x = (rowOf(r, "K6")?.bills ?? []).find((y: any) => y.billId === b.id);
      if (!x || x.daysLate !== dl || x.bucket !== bk) bad.push(`${at}: ${J(x && { d: x.daysLate, b: x.bucket })} ≠ ${dl}/${bk}`);
    }
    rec("MD-1", !bad.length, "CRITICAL", `ถังเปลี่ยนที่เที่ยงคืนไทย (ครบ ${due}): 23:59:59 → 0 notDue · 00:00 วันถัดไป → 1 d1_30 · 60/61 · 90/91`, bad.length ? bad : "ตรงทุกขอบ");
  });

  // ═══════════ XS ด่าน ═══════════
  console.log("\n── XS ด่าน ──");
  await safe("XS", "CRITICAL", "ด่าน", async () => {
    const NF = DORM.DORM_REPORT_NF_REASON;
    const fns: [string, (ctx: any, unitId: any) => Promise<any>][] = [
      ["aging", (c, u) => DORM.dormAgingReport(c, { unitId: u }, { now: new Date(NOW) })],
      ["occ", (c, u) => DORM.dormOccupancyReport(c, { unitId: u, fromMonth: P1, toMonth: P3 }, { now: new Date(NOW) })],
      ["rev", (c, u) => DORM.dormRevenueReport(c, { unitId: u, fromMonth: P1, toMonth: P3 }, { now: new Date(NOW) })],
      ["model", (c, u) => DORM.dormReportModel(c, { unitId: u, range: "6M" }, { now: new Date(NOW) })],
      ["csv", (c, u) => DORM.dormReportCsv(c, { unitId: u, kind: "AGING" }, { now: new Date(NOW) })],
      ["csvBadKind", (c, u) => DORM.dormReportCsv(c, { unitId: u, kind: "XLSX" }, { now: new Date(NOW) })],
      ["occBadRange", (c, u) => DORM.dormOccupancyReport(c, { unitId: u, fromMonth: "2026-13", toMonth: 7 }, { now: new Date(NOW) })],
      ["modelBadRange", (c, u) => DORM.dormReportModel(c, { unitId: u, range: "ALL" }, { now: new Date(NOW) })],
    ];
    const cases: [string, any, any][] = [
      ["ร้าน B → หน่วย A", { tenantId: B, actorUserId: OWNB }, DA],
      ["ctx ร้าน B + userA → หน่วย A", { tenantId: B, actorUserId: OWN }, DA],
      ["owner A → หน่วยร้าน B", cO, DB],
      ["owner A → หน่วย HOTEL", cO, HA],
      ["owner A → id ไม่มีจริง", cO, "nope-unit"],
      ["owner A → id ไม่ใช่สตริง", cO, 123],
      ["owner A → id ว่าง", cO, ""],
      ["ผู้ดูแลอาคาร → หน่วยอื่นร้านเดียวกัน (ไม่มีใน unitAccess)", { tenantId: A, actorUserId: SC }, DX],
      ["MANAGER หน่วยอื่น → DA", { tenantId: A, actorUserId: MGRX }, DA],
      ["dorm.view อย่างเดียว (ไม่เห็นเงิน)", { tenantId: A, actorUserId: VW }, DA],
      ["สมาชิกยังไม่ตอบรับ", { tenantId: A, actorUserId: PEND }, DA],
      ["ผู้ใช้ร้าน B ใน ctx ร้าน A", { tenantId: A, actorUserId: OWNB }, DA],
      ["ctx ไม่ใช่ object", null, DA],
    ];
    const bad: string[] = [];
    for (const [n, c, u] of cases) for (const [fn, f] of fns) {
      let r: any; try { r = await f(c, u); } catch (e) { r = { threw: errMsg(e) }; }
      if (!isDeepStrictEqual(r, { ok: false, code: "NOT_FOUND", reason: NF })) bad.push(`${n}/${fn}: ${J(r).slice(0, 120)}`);
    }
    rec("XS-1", !bad.length, "CRITICAL", `ไม่พบเดียวกันทุกไบต์ ${cases.length} กรณี × ${fns.length} ทาง (รวมอินพุตผิดรูป ⇒ ด่านก่อนอินพุต)`, bad.length ? bad.slice(0, 8) : "ตรงทุกกรณี");
    // positive control: เจ้าของ + ผู้ดูแลอาคารผ่าน
    const pc = [await fns[0][1](cO, DA), await fns[0][1]({ tenantId: A, actorUserId: SC }, DA)];
    rec("XS-2", pc.every((x) => x?.ok === true), "CRITICAL", "positive control: owner/ผู้ดูแลอาคาร ผ่านด่าน", pc.map(codeOf));
  });

  // ═══════════ SC ขอบเขตอาคาร ═══════════
  console.log("\n── SC ขอบเขตอาคาร ──");
  await safe("SC", "CRITICAL", "ขอบเขตอาคาร", async () => {
    await U(A, DA, "rooms.access.managerScope", "BUILDING");
    await U(A, DA, "rooms.access.buildingAssignments", { [mem.sc]: [B1], [mem.sc2]: [BX] });
    const cS = { tenantId: A, actorUserId: SC }, cS2 = { tenantId: A, actorUserId: SC2 };
    const b1Rooms = new Set<string>((await prisma.hotelRoom.findMany({ where: { unitId: DA, buildingId: B1 }, select: { id: true } })).map((r: any) => String(r.id)));
    const b1Keys = B1L.map((x) => x[0]);
    const ag = await DORM.dormAgingReport(cS, { unitId: DA }, { now: new Date(NOW) });
    const glB1 = await glOf(b1Keys);
    const sumRows = (ag.rows ?? []).reduce((a: number, r: any) => a + r.buckets.totalSatang, 0);
    const outside = (ag.rows ?? []).filter((r: any) => !b1Rooms.has(r.roomId)).map((r: any) => r.roomNumber);
    rec("SC-1", ag.ok && !outside.length && ag.buckets.totalSatang === glB1 && sumRows === glB1, "CRITICAL", "ผู้ดูแลอาคาร 1: ลูกหนี้เฉพาะห้องอาคาร 1 · ถังรวม = Σ แถว = GL 1100 ของผู้เช่าอาคาร 1", { total: ag.buckets?.totalSatang, sumRows, glB1, outside });
    const occ = await DORM.dormOccupancyReport(cS, { unitId: DA, fromMonth: P3, toMonth: P3 }, { now: new Date(NOW) });
    const activeB1 = (await prisma.hotelRoom.count({ where: { unitId: DA, buildingId: B1, active: true } }));
    const m = occ.months?.[0];
    rec("SC-2", occ.ok && m?.rooms === activeB1 && m?.roomDays === activeB1 * 30 && m?.occupiedRoomDays === 6 * 30 && activeB1 === 7, "CRITICAL", "ผู้ดูแลอาคาร 1 เข้าพัก ก.ย.: ตัวหาร = ห้อง active อาคาร 1 (7 รวมห้องว่าง/ซ่อม 107 · ไม่รวมห้องปิด 108) × 30 · ผู้เช่า 6 × 30", { m, activeB1, repair: !!REPAIR });
    const rv = await gotRev(P1, cS), ev = await expRev(P1, b1Rooms);
    rec("SC-3", rv.ok && rv.bills === ev.bills && isDeepStrictEqual(rv.total, ev.total) && rv.collected === ev.collected, "CRITICAL", "ผู้ดูแลอาคาร 1 รายได้ ก.ค. = เอกสารของบิลห้องอาคาร 1 เท่านั้น", { got: rv, exp: ev });
    const csv = await DORM.dormReportCsv(cS, { unitId: DA, kind: "AGING" }, { now: new Date(NOW) });
    const rows = csv.ok ? parseCsv(csv.csv.replace(/^﻿/, "")).slice(1) : [];
    const sumCsv = rows.reduce((a, r) => a + satOfBaht(r[6]), 0);
    const roomsCsv = new Set(rows.map((r) => r[0]));
    rec("SC-4", csv.ok && sumCsv === glB1 && [...roomsCsv].every((n) => B1L.some((x) => x[1] === n)), "CRITICAL", "CSV ลูกหนี้ของผู้ดูแลอาคาร 1: Σ = GL อาคาร 1 · ไม่มีห้องอาคาร 2 (ห้องสูตร)", { sumCsv, glB1, rooms: [...roomsCsv] });
    const m2 = await DORM.dormReportModel(cS2, { unitId: DA }, { now: new Date(NOW) });
    rec("SC-5", m2.ok && m2.aging.rows.length === 0 && m2.aging.buckets.totalSatang === 0 && m2.occupancy.months.every((x: any) => x.rooms === 0) && m2.revenue.grand.total.grossSatang === 0, "CRITICAL", "ผู้ที่ได้อาคารของหน่วยอื่น (BX ของ DA2) ใน DA ⇒ fail closed: ok ศูนย์ทุกตัว", { ok: m2.ok, rows: m2.aging?.rows?.length, rev: m2.revenue?.grand?.total });
    // ถอดอาคาร ⇒ สดทันที
    await U(A, DA, "rooms.access.buildingAssignments", { [mem.sc2]: [BX] });
    const ag3 = await DORM.dormAgingReport(cS, { unitId: DA }, { now: new Date(NOW) });
    rec("SC-6", ag3.ok && ag3.rows.length === 0 && ag3.buckets.totalSatang === 0, "MAJOR", "ถอดรายชื่ออาคารของผู้ดูแล ⇒ รายงานศูนย์ทันที (ไม่แคช)", { rows: ag3.rows?.length, total: ag3.buckets?.totalSatang });
    await U(A, DA, "rooms.access.managerScope", "UNIT");
  });

  // ═══════════ CV CSV ═══════════
  console.log("\n── CV CSV ──");
  await safe("CV", "CRITICAL", "CSV", async () => {
    const bad: string[] = [];
    const files: Record<string, any> = {};
    for (const kind of ["AGING", "OCCUPANCY", "REVENUE"]) {
      const r = await DORM.dormReportCsv(cO, { unitId: DA, kind, fromMonth: P1, toMonth: P3 }, { now: new Date(NOW) });
      files[kind] = r;
      if (!r?.ok) { bad.push(`${kind}: ${codeOf(r)}`); continue; }
      if (!r.csv.startsWith("﻿")) bad.push(`${kind}: ไม่มี BOM`);
      if (!/^[A-Za-z0-9._-]+\.csv$/.test(r.filename)) bad.push(`${kind}: filename ${r.filename}`);
      const rows = parseCsv(r.csv.slice(1));
      if (rows.length - 1 !== r.rows) bad.push(`${kind}: rows ${r.rows} ≠ ${rows.length - 1}`);
      for (const row of rows) for (const c of row) if (dangerous(c)) bad.push(`${kind}: ช่องอันตราย ${J(c)}`);
    }
    const ag = files.AGING?.ok ? parseCsv(files.AGING.csv.slice(1)) : [];
    const roomsSeen = ag.slice(1).map((r) => r[0]);
    const want = B2L.filter((x) => x[0] !== "X7").map((x) => x[1]);
    const neutral = want.every((no) => roomsSeen.includes(`'${no}`));
    const names = ag.slice(1).map((r) => r[1]);
    const nameOk = names.every((n) => !dangerous(n)) && names.some((n) => n.startsWith("'=HYPERLINK")) && names.some((n) => n === "'=tabname") && names.some((n) => n === "'@crname");
    const rep = await agingOwn();
    const sumCsv = ag.slice(1).reduce((a, r) => a + satOfBaht(r[6]), 0);
    rec("CV-1", !bad.length && neutral && nameOk && sumCsv === rep.buckets.totalSatang, "CRITICAL",
      "CSV 3 แบบ: BOM · filename ASCII · rows ตรง · ไม่มีช่องอันตราย (เลขห้อง =1+1 / +SUM / -2+3 / @cmd / \\t= / \\r= และชื่อสูตร ⇒ ขึ้นต้น ') · Σ ค้าง = รายงาน",
      { bad: bad.slice(0, 8), roomsSeen: roomsSeen.filter((x) => x.startsWith("'")), names: names.filter((n) => n.startsWith("'")), sumCsv, total: rep.buckets.totalSatang });
    // เพดานจากค่าตั้ง (ร้าน): exportMaxRows = 3 ⇒ AGING TOO_LARGE · maxMonths = 2 ⇒ ช่วง 3 เดือน INVALID_INPUT · คืนค่า
    await setVal(A, "rooms.report.exportMaxRows", "TENANT", A, 3);
    await setVal(A, "rooms.report.maxMonths", "TENANT", A, 2);
    const t1 = await DORM.dormReportCsv(cO, { unitId: DA, kind: "AGING" }, { now: new Date(NOW) });
    const t2 = await DORM.dormReportCsv(cO, { unitId: DA, kind: "REVENUE", fromMonth: P1, toMonth: P3 }, { now: new Date(NOW) });
    const t3 = await DORM.dormReportModel(cO, { unitId: DA, range: "6M" }, { now: new Date(NOW) });
    await prisma.settingValue.deleteMany({ where: { tenantId: A, key: { in: ["rooms.report.exportMaxRows", "rooms.report.maxMonths"] } } });
    const t4 = await DORM.dormReportCsv(cO, { unitId: DA, kind: "AGING" }, { now: new Date(NOW) });
    rec("CV-2", t1?.code === "TOO_LARGE" && !("csv" in (t1 ?? {})) && t2?.code === "INVALID_INPUT" && t3?.ok && t3.fromMonth === "2026-09" && t3.toMonth === "2026-10" && t4?.ok, "MAJOR",
      "เพดานอ่านจากทะเบียนค่าตั้งต่อคำขอ: แถว 3 ⇒ TOO_LARGE ไม่มีไฟล์ · เดือน 2 ⇒ ช่วง 3 เดือน INVALID · 6M ตัดเหลือ 2 เดือน · ลบค่าแล้วผ่าน", { t1: codeOf(t1), t2: codeOf(t2), t3: t3?.ok && [t3.fromMonth, t3.toMonth], t4: codeOf(t4) });
  });

  // ═══════════ RO อ่านอย่างเดียว + CC พร้อมรับเงิน ═══════════
  console.log("\n── RO / CC ──");
  await safe("RO", "MAJOR", "อ่านอย่างเดียว", async () => {
    const snap = async () => ({
      audit: await prisma.auditLog.count({ where: { tenantId: { in: tenantIds } } }),
      outbox: await prisma.outboxEvent.count({ where: { tenantId: { in: tenantIds } } }),
      doc: await prisma.accountDocument.count({ where: { tenantId: { in: tenantIds } } }),
      je: await prisma.accountJournalEntry.count({ where: { tenantId: { in: tenantIds } } }),
      setv: await prisma.settingValue.count({ where: { tenantId: { in: tenantIds } } }),
      billUpd: (await prisma.dormBill.aggregate({ where: { tenantId: A }, _max: { updatedAt: true } }))._max.updatedAt?.toISOString(),
    });
    const s0 = await snap();
    for (const c of [cO, { tenantId: A, actorUserId: VW }, { tenantId: B, actorUserId: OWNB }]) {
      await DORM.dormReportModel(c, { unitId: DA, range: "YEAR" }, { now: new Date(NOW) });
      for (const kind of ["AGING", "OCCUPANCY", "REVENUE"]) await DORM.dormReportCsv(c, { unitId: DA, kind }, { now: new Date(NOW) });
    }
    const s1 = await snap();
    rec("RO-1", isDeepStrictEqual(s0, s1), "MAJOR", "เรียกรายงาน/CSV (owner · ไม่มีสิทธิ์ · ร้านอื่น) ⇒ ไม่มีแถวใหม่/แก้ไข", { s0, s1 });
  });

  await safe("CC", "MAJOR", "อ่านพร้อมรับเงิน", async () => {
    const b = (await billOf("K6", P1))!;
    const pre = await DORM.dormReportModel(cO, { unitId: DA, range: "6M" }, { now: new Date(NOW) });
    const T0 = pre.aging.buckets.totalSatang;
    const C0 = pre.revenue.months.find((m: any) => m.periodKey === P1)?.collectedSatang;
    let payR: any = null;
    let done = false;
    const payP = (async () => { await new Promise((r) => setTimeout(r, 900)); try { payR = await dpay("K6", b.id, BASE, "2026-10-09"); } finally { done = true; } })();
    const worker = async () => {
      const out: any[] = [];
      let extra = 0;
      while (extra < 2 && out.length < 60) {
        try { out.push(await DORM.dormReportModel(cO, { unitId: DA, range: "6M" }, { now: new Date(NOW) })); } catch (e) { out.push({ threw: errMsg(e) }); }
        if (done) extra++;
      }
      return out;
    };
    const rs = (await Promise.all([worker(), worker(), worker(), worker()])).flat(); await payP;
    await parkOutbox(tenantIds);
    const T1 = T0 - BASE, C1 = (C0 ?? 0) + BASE;
    const crashes = rs.filter((r) => !r?.ok).map(codeOf);
    const inner: string[] = []; const states: string[] = [];
    for (const r of rs.filter((x) => x?.ok)) {
      const bk = r.aging.buckets; const od = bk.d1_30Satang + bk.d31_60Satang + bk.d61_90Satang + bk.d90plusSatang;
      const sumRows = r.aging.rows.reduce((a: number, x: any) => a + x.buckets.totalSatang, 0);
      if (r.kpi.overdue.satang !== od || sumRows !== bk.totalSatang) inner.push("kpi/rows ไม่ตรงถัง");
      if (![T0, T1].includes(bk.totalSatang)) inner.push(`aging ${bk.totalSatang} ∉ {${T0},${T1}}`);
      const c = r.revenue.months.find((m: any) => m.periodKey === P1)?.collectedSatang;
      if (![C0, C1].includes(c)) inner.push(`collected ${c} ∉ {${C0},${C1}}`);
      states.push(`${bk.totalSatang === T0 ? "A0" : "A1"}${c === C0 ? "C0" : "C1"}`);
    }
    const torn = states.filter((s) => s === "A1C0" || s === "A0C1").length;
    const post = await DORM.dormReportModel(cO, { unitId: DA, range: "6M" }, { now: new Date(NOW) });
    const glNow = await glOf(allKeys);
    rec("CC-1", payR?.ok && !crashes.length && !inner.length && post.aging.buckets.totalSatang === T1 && glNow === T1, "MAJOR",
      "อ่าน dormReportModel 4 สายวนต่อเนื่องขนานกับรับเงิน K6 ก.ค. ⇒ ไม่ล้ม · แต่ละผล: ถังรวม ∈ {ก่อน, หลัง} · KPI/แถว สอดคล้องกับถังของผลเดียวกัน · จบแล้ว = GL",
      { pay: codeOf(payR), crashes, inner: inner.slice(0, 5), states: tallyOf(states), T0, T1, post: post.aging.buckets.totalSatang, glNow });
    rec("CC-2", torn === 0, "INFO", "ลูกหนี้กับเก็บแล้วในผลเดียวกันอ่านคนละจังหวะได้ (สัญญา §2 ข้อ 5 = อ่านสด ไม่มี snapshot เดียว)", { torn, states: tallyOf(states) });
  });
} catch (e) {
  console.log(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 1;
} finally {
  await cleanup(tenantIds);
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d19pb-" } } }); } catch { /* */ }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d19pb-" } } });
  console.log(`(cleanup: tenant ค้าง ${left} · คำขอนอกเครื่องที่บล็อก ${BLOCKED.length})`);
  const breach = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`PROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: breach.map((r) => r.id), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), cleanupLeft: left })}`);
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(exitCode);
}

function tallyOf(xs: string[]): Record<string, number> { const t: Record<string, number> = {}; for (const x of xs) t[x] = (t[x] ?? 0) + 1; return t; }
