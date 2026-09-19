// controller: ลบร้านทดสอบที่ค้างจาก qc-acc-v2-security รอบ 17 ก.ย. (cleanup ไม่จบ) — QC1 เท่านั้น · ชื่อร้านต้องขึ้นต้น QCSEC92-
// ต้นเหตุ S5 แดง: idempotencyKey `pp:ch_qc_dup` ของร้านค้างชน unique ทั้งตาราง (debugger 19 ก.ย. · ledger/crm-c1-close-reds.md)
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!host.includes("ep-plain-art")) { console.error("not QC1:", host); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const ids = ["cmu5qp0u40000pqkzcvtap2vm", "cmu5qp0ya0001pqkz6cld5oue"];
const ts = await P.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
console.log("found", ts);
for (const t of ts) {
  if (!String(t.name).startsWith("QCSEC92-")) { console.error("refuse:", t.name); process.exit(1); }
  const tenantId = t.id;
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { console.log("skip:", (e as Error).message.split("\n")[0]); } };
  for (const m of ["accountJournalLine","accountJournalEntry","accountPaymentRequest","accountDocumentPayment","accountDocumentRelation","accountDocumentLine","accountAttachment","accountDocument","accountDocSequence","accountProduct","accountContact","accountFinance","accountPeriod","accountMapping","accountLedger","accountSettings","appNotification","appSystemUnit","appSystem","auditLog","outboxEvent","membership"])
    await del(() => P[m].deleteMany({ where: { tenantId } }));
  await del(() => P.tenant.delete({ where: { id: tenantId } }));
}
console.log("left:", await P.tenant.count({ where: { id: { in: ids } } }), "dupKey rows:", await P.accountDocumentPayment.count({ where: { idempotencyKey: "pp:ch_qc_dup" } }));
await prisma.$disconnect();
