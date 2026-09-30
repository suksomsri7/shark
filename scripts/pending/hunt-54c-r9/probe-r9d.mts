// C5.4-C round-9 hunter probe D (QC2 only · throwaway tenant · deleted at the end)
//   U1  unrelated pair: voidPayment(doc A, CHEQUE-channel group child key) ∥ recordPayment(doc B) ×12 — raw error behind "บันทึกชำระไม่สำเร็จ"?
//   U2  same with plain TRANSFER payments, no keys ×12
//   U3  R1b shape again (void lands after child 1, before child 2) ×8 with raw errors captured — partial writes of a refused group payment
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r9/probe-r9d.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rawErrors: string[] = [];
const origTx = P.$transaction.bind(P);
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { rawErrors.push(`${String((e as Any)?.code ?? "")} ${String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 260)}`); throw e; } };
const TAG = `qc-hunt54cy-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R9", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true } })) as Any;
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const short = (r: Any) => (r?.ok ? "ok" : /ไม่สำเร็จ$/.test(String(r?.reason)) ? "GENERIC" : "refused");
  for (const [name, cheq] of [["U1", true], ["U2", false]] as const) {
    rawErrors.length = 0; const tally: Record<string, number> = {};
    for (let k = 0; k < 12; k += 1) {
      const a = await inv(); const b = await inv();
      const pa = await accSvc.recordPayment(T, A, a, { channel: cheq ? "CHEQUE" : "TRANSFER", financeAccountId: cheq ? null : bank.id, amount: 10_700_000, idempotencyKey: cheq ? `GRP#x${k}#c#${a}` : null });
      const rs = await Promise.all([accSvc.voidPayment(T, A, a, pa.paymentId, "x"), accSvc.recordPayment(T, A, b, { channel: cheq ? "CHEQUE" : "TRANSFER", financeAccountId: cheq ? null : bank.id, amount: 10_700_000 })]);
      const key = rs.map(short).join("|"); tally[key] = (tally[key] ?? 0) + 1;
    }
    log(`${name} voidPayment(A) ∥ recordPayment(B) ${JSON.stringify(tally)} · raw ${[...new Set(rawErrors.map((e) => e.slice(0, 200)))].slice(0, 3).join(" ‖ ") || "none"}`);
  }
  { // U3
    rawErrors.length = 0; const tally: Record<string, number> = {}; const partial: string[] = [];
    for (let k = 0; k < 8; k += 1) {
      const kids = [await inv(), await inv(), await inv()];
      const g = (await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] })).id;
      const ck = `u3_${k}_${randomBytes(3).toString("hex")}`; const bk = grp.groupBatchKey(g, ck);
      const t0 = await bal("1040"); const ob0 = await P.outboxEvent.count({ where: { tenantId: T } });
      let stop = false; let vr: Any = null;
      const poller = (async () => { while (!stop) { const p = await P.accountDocumentPayment.findFirst({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, select: { id: true, documentId: true } }); if (p) { vr = await accSvc.voidPayment(T, A, p.documentId, p.id, "x"); return; } } })();
      const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 32_100_000, note: "", feeSatang: 0, wht: [], cheque: { chequeNo: `U3-${k}`, bankName: "KBank", chequeDate: today } }, { clientKey: ck });
      stop = true; await poller;
      const ps = await P.accountDocumentPayment.findMany({ where: { tenantId: T, idempotencyKey: { startsWith: `${bk}#` } }, select: { voidedAt: true, chequeId: true } });
      const key = `group ${r.ok ? "ok" : short(r)} · void ${vr ? short(vr) : "none"}`; tally[key] = (tally[key] ?? 0) + 1;
      if (!r.ok) partial.push(`#${k} refused "${String(r.reason).slice(0, 40)}" but left ${ps.filter((p: Any) => !p.voidedAt).length} live CHEQUE payments, cheques ${ps.filter((p: Any) => p.chequeId).length}, docs ${(await Promise.all(kids.map(st))).map((d: Any) => d.status).join(",")}, 1040 Δ ${(await bal("1040")) - t0}, outbox +${(await P.outboxEvent.count({ where: { tenantId: T } })) - ob0}`);
    }
    log(`U3 ${JSON.stringify(tally)}`);
    for (const p of partial.slice(0, 4)) log(`U3 partial ${p}`);
    log(`U3 raw ${[...new Set(rawErrors.map((e) => e.slice(0, 200)))].slice(0, 4).join(" ‖ ") || "none"}`);
  }
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
