// C5.4-C round-9 hunter probe F (QC2 only · throwaway tenant · deleted at the end)
//   M1  after a bounce, is there a manual way out? voidDocument on the orphan auto tax invoice (ON_PAYMENT) · voidDocument on the orphan WHT cert (WTI)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r9/probe-r9f.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cq-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R9", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const short = (r: Any) => (r?.ok ? "ok" : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 110)})`);
  const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_PAYMENT", lines: [{ description: "บริการ", qty: 1, unitPrice: 10_000_000 }] });
  await accSvc.issueDocument(T, A, d.id);
  const v0 = await bal("2200"); const w0 = await bal("1160");
  const p = await accSvc.recordPayment(T, A, d.id, { channel: "CHEQUE", amount: 10_400_000, whtAmountSatang: 300_000, whtRateBp: 300, whtIncomeType: "M40_2" });
  const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `M${randomBytes(2).toString("hex")}`, bankName: "B", chequeDate: new Date(), amount: 10_400_000, documentId: d.id, paymentId: p.paymentId });
  const b = await cheque.bounceCheque(T, A, c.id, "x");
  const ti = await P.accountDocument.findFirst({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: p.paymentId }, select: { id: true, status: true } });
  const pay = await P.accountDocumentPayment.findUnique({ where: { id: p.paymentId }, select: { whtCertDocId: true, voidedAt: true } });
  log(`M1 pay ${short(p)} cheque ${short(c)} bounce ${short(b)} · orphan TI ${ti?.status} · orphan WTI ${pay?.whtCertDocId ? (await P.accountDocument.findUnique({ where: { id: pay.whtCertDocId }, select: { status: true } }))?.status : "none"} · 2200 Δ ${(await bal("2200")) - v0} · 1160 Δ ${(await bal("1160")) - w0}`);
  const vti = ti ? await accSvc.voidDocument(T, A, ti.id, "manual cleanup") : null;
  const vw = pay?.whtCertDocId ? await accSvc.voidDocument(T, A, pay.whtCertDocId, "manual cleanup") : null;
  const vp = await accSvc.voidPayment(T, A, d.id, p.paymentId, "x");
  log(`M1 manual: voidDocument(TI) ${short(vti)} · voidDocument(WTI) ${short(vw)} · voidPayment ${short(vp)} · 2200 Δ ${(await bal("2200")) - v0} (clean = 0) · 1160 Δ ${(await bal("1160")) - w0} (clean = 0)`);
} catch (e) { log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    log(`CLEAN left=${left}`); }
  await prisma.$disconnect();
}
process.exit(0);
