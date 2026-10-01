// r8 rerun copy of hunt-54c-r7 (unchanged logic). NOTE: B2a/B2c now expect voidPayment(live cheque pay) REFUSED (B2c ruling r7).
// r7 follow-up: double bounce (double-click / REST retry) → over-collection proof + sequential control. QC2 only.
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r7/probe-r7-bounce.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54ct-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const ar = async () => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = '1100'`, A)) as Any[])[0]?.n);
  const mk = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); await accSvc.issueDocument(T, A, d.id); return d.id as string; };
  const st = async (id: string) => P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true } });
  // sequential control
  { const inv = await mk(); await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_000_000 });
    const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "S1", bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: inv });
    const b1 = await cheque.bounceCheque(T, A, c.id, "x"); const b2 = await cheque.bounceCheque(T, A, c.id, "x");
    console.log(`CTL sequential bounce twice: ${b1.ok}/${b2.ok ? "ok" : b2.reason} · INV ${JSON.stringify(await st(inv))} (expect paid 5000000)`); }
  // race + consequence
  { const inv = await mk(); await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: 5_000_000 });
    const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: "R1", bankName: "B", chequeDate: new Date(), amount: 3_000_000, documentId: inv });
    const ar0 = await ar();
    const r = await Promise.all([cheque.bounceCheque(T, A, c.id, "x"), cheque.bounceCheque(T, A, c.id, "x")]);
    const s = await st(inv); const f = await accSvc.paymentTargetOf(T, A, inv); const out = accSvc.paymentOutstandingOf(f.target);
    const pay = await accSvc.recordPayment(T, A, inv, { channel: "TRANSFER", amount: out });
    const s2 = await st(inv);
    const bounceEntries = await P.accountJournalEntry.count({ where: { systemId: A, refType: "AccountCheque", refId: c.id } }).catch(() => "?");
    const voided = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided" } });
    console.log(`RACE bounce∥bounce ${r.map((x: Any) => (x.ok ? "ok" : x.reason)).join("|")} · INV after=${JSON.stringify(s)} outstanding shown=${out} (true 5700000) · AR Δ(bounce)=${(await ar()) - ar0} · journal entries for cheque=${bounceEntries} · payment.voided events=${voided}`);
    console.log(`  collect shown outstanding ${out} → ${pay.ok ? "ok" : pay.reason} · INV=${JSON.stringify(s2)} · GL AR1100 now=${await ar()} (negative = over-collected from customer)`); }
} catch (e) { console.log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    console.log(`CLEAN left=${left}`); }
  await prisma.$disconnect();
}
process.exit(0);
