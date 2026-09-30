// C5.4-C round 11 · R10-2 — capture the REAL deadlock cycle of recordGroupPayment ∥ bounce(other cheque on a child of the same group)
//   (hunter probe-r10d G3 pairing) · Prisma folds 40P01 into P2034 without the DETAIL ⇒ a third connection samples pg_stat_activity /
//   pg_blocking_pids / the not-granted pg_locks of our own backends every ~40 ms and prints every mutual-wait snapshot (the cycle as it forms).
// QC2 only · throwaway tenant · deleted at the end.
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54c/trace-r10-2-deadlock.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const raw: string[] = [];
const origTx = P.$transaction.bind(P);
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { raw.push(`${String((e as Any)?.code ?? "")}|${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 300)}`); throw e; } };
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const watcher = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }) as Any; // separate pool: the sampler must never queue behind the transactions it watches
const TAG = `qc-c54c-dl-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
const ROUNDS = Number(process.env.ROUNDS ?? 20);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC DL", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "งาน", qty: 1, unitPrice: 1_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  let seq = 0;
  const snaps: string[] = []; let sampling = false;
  const sampler = async () => {
    while (sampling) {
      const rows = (await watcher.$queryRawUnsafe(`
        SELECT a.pid, pg_blocking_pids(a.pid) AS blockers, a.wait_event_type AS wt, a.wait_event AS we, left(regexp_replace(a.query, '\\s+', ' ', 'g'), 150) AS q,
               (SELECT string_agg(l.locktype || ':' || l.mode || coalesce(':' || c.relname, '') || coalesce(':xid' || l.transactionid::text, '') || coalesce(':tuple(' || l.page || ',' || l.tuple || ')', ''), ' | ')
                  FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation WHERE l.pid = a.pid AND NOT l.granted) AS waits,
               (SELECT string_agg(DISTINCT l.transactionid::text, ',') FROM pg_locks l WHERE l.pid = a.pid AND l.locktype = 'transactionid' AND l.granted) AS ownxid
          FROM pg_stat_activity a WHERE a.datname = current_database() AND a.state <> 'idle'`).catch(() => [])) as Any[];
      const blocked = rows.filter((r) => (r.blockers ?? []).length > 0);
      const byPid = new Map(rows.map((r) => [r.pid, r]));
      const mutual = blocked.some((r) => (r.blockers as number[]).some((b) => ((byPid.get(b)?.blockers ?? []) as number[]).includes(r.pid)));
      if (blocked.length > 0) snaps.push(`${mutual ? "CYCLE" : "wait"} ${blocked.map((r) => `pid ${r.pid} (xid ${r.ownxid ?? "-"}) blocked by [${r.blockers}] on {${r.waits ?? `${r.wt}/${r.we}`}} running «${r.q}»`).join("  ‖  ")}`);
      await new Promise((ok) => setTimeout(ok, 40));
    }
  };
  const tally: Record<string, number> = {};
  const cycles: string[] = [];
  const samples: string[] = [];
  const rawAll: Record<string, number> = {};
  for (let i = 0; i < ROUNDS; i += 1) {
    const kids = [await inv(), await inv(), await inv(), await inv()];
    const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
    if (!g.ok) throw new Error(`group: ${g.reason}`);
    const oc = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `O${++seq}`, bankName: "B", chequeDate: new Date(), amount: 1_070_000, documentId: kids[3] });
    snaps.length = 0; raw.length = 0; sampling = true;
    const s = sampler();
    const rs = await Promise.all([
      grp.recordGroupPayment(T, A, g.id, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 1_570_000, note: "", feeSatang: 0, wht: [], cheque: { chequeNo: `G${seq}`, bankName: "KBank", chequeDate: today } }, { clientKey: `dl${i}${randomBytes(3).toString("hex")}` }),
      cheque.bounceCheque(T, A, oc.id, "x"),
    ]);
    sampling = false; await s;
    const k = rs.map((r: Any) => (r.ok ? "ok" : /ไม่สำเร็จ/.test(String(r.reason)) ? "GENERIC" : "refused")).join("|");
    tally[k] = (tally[k] ?? 0) + 1;
    for (const e of raw) rawAll[/40P01|deadlock/i.test(e) ? "DEADLOCK(40P01)" : /P2034/.test(e) ? "P2034(write conflict/deadlock)" : /P2002/.test(e) ? "P2002(unique: journal/doc no.)" : /P2028|timeout|expired/i.test(e) ? "TX-TIMEOUT" : /[ก-๙]/.test(e) ? "thai-refusal" : e.slice(0, 80)] = (rawAll[/40P01|deadlock/i.test(e) ? "DEADLOCK(40P01)" : /P2034/.test(e) ? "P2034(write conflict/deadlock)" : /P2002/.test(e) ? "P2002(unique: journal/doc no.)" : /P2028|timeout|expired/i.test(e) ? "TX-TIMEOUT" : /[ก-๙]/.test(e) ? "thai-refusal" : e.slice(0, 80)] ?? 0) + 1;
    const dl = raw.filter((e) => /40P01|deadlock|P2034/i.test(e));
    if (dl.length > 0 || snaps.some((x) => x.startsWith("CYCLE"))) cycles.push(`#${i} ${k} raw=${JSON.stringify(dl)}\n    ${[...new Set(snaps)].slice(-6).join("\n    ")}`);
    else if (k.includes("GENERIC") && samples.length < 3) samples.push(`#${i} ${k} raw=${JSON.stringify(raw.map((e) => e.slice(0, 260)))}\n    ${[...new Set(snaps)].slice(-3).join("\n    ")}`);
  }
  log(`TRACE group(a,b by cheque) ∥ bounce(other cheque on child d) ×${ROUNDS}: ${JSON.stringify(tally)} · raw ${JSON.stringify(rawAll)} · rounds with deadlock/cycle ${cycles.length}`);
  for (const c of cycles.slice(0, 5)) log(c);
  for (const c of samples) log(`GENERIC sample ${c}`);
} catch (e) { log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    log(`CLEAN left=${left}`); }
  await prisma.$disconnect(); await watcher.$disconnect();
}
process.exit(0);
