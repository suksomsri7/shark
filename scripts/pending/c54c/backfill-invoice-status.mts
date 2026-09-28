// backfill-invoice-status.mts — C5.4-C (review round 3 · 3): ใบแจ้งหนี้ที่ค้าง PARTIAL ทั้งที่ "รับชำระ + ใบลดหนี้ที่ยังมีผล ≥ ยอดเต็ม"
//   (ก่อน C5.4-C recordPayment ไม่นับใบลดหนี้ ⇒ ไม่มีวันเป็น PAID) → PAID ด้วยกติกาเดียวกับ `receivableStatusOf` ของบริการบัญชี
//   🔴 ไม่ยิง event ใด ๆ (ไม่มี account.invoice.paid ย้อนหลัง — webhook/CRM ของร้านไม่ถูกปลุกด้วยเหตุการณ์เก่า) · เขียน AuditLog ต่อใบ
//   ค่าเริ่มต้น = DRY-RUN (อ่านอย่างเดียว) · `--apply` = เขียน · `--tenant=<id>` = จำกัดร้านเดียว
//   ใบ AWAITING_PAYMENT ที่ใบลดหนี้ลดหนี้ทั้งใบ (ไม่เคยรับเงิน) = รายงานเป็นข้อมูลเท่านั้น (ไม่แตะ — ไม่อยู่ในคำสั่งของใบนี้)
// Run (QC2):  bash scripts/qc2.sh pnpm exec tsx scripts/pending/c54c/backfill-invoice-status.mts [--tenant=<id>] [--apply]
// Prod: owner decision (C6.2) — dry-run first, then --apply per tenant.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const TENANT = (ARGV.find((a) => a.startsWith("--tenant=")) ?? "").slice("--tenant=".length) || null;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const ACC = (await import("@/lib/modules/account/service" as string)) as Any;
const host = String(process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(no DATABASE_URL)";
console.log(`[backfill-invoice-status] DB ${host} · ${APPLY ? "APPLY" : "DRY-RUN"}${TENANT ? ` · tenant ${TENANT}` : " · all tenants"}`);

type Row = { id: string; tenantId: string; systemId: string; docNo: string | null; status: string; grand: number; paid: number; cn: number };
const rows = ((await P.$queryRawUnsafe(
  `WITH RECURSIVE fam("root", "id", "depth", "systemId") AS (
       SELECT i."id", i."id", 0, i."systemId" FROM "AccountDocument" i WHERE i."docType"::text = 'INVOICE' AND i."status"::text IN ('PARTIAL','AWAITING_PAYMENT') ${TENANT ? `AND i."tenantId" = $1` : ""}
       UNION ALL
       SELECT f."root", k."id", f."depth" + 1, f."systemId" FROM fam f JOIN "AccountDocument" k ON k."sourceDocId" = f."id" AND k."systemId" = f."systemId"
        WHERE f."depth" < 3 AND k."docType"::text NOT IN ('CREDIT_NOTE','DEBIT_NOTE'))
   SELECT d."id", d."tenantId", d."systemId", d."docNo", d."status"::text AS "status", d."grandTotal" AS "grand", d."paidTotal" AS "paid",
          COALESCE((SELECT sum(c."grandTotal") FROM "AccountDocument" c
                     WHERE c."systemId" = d."systemId" AND c."docType"::text = 'CREDIT_NOTE'
                       AND c."sourceDocId" IN (SELECT f."id" FROM fam f WHERE f."root" = d."id")
                       AND c."status"::text NOT IN ('DRAFT','VOIDED','CANCELLED')), 0)::bigint AS "cn"
     FROM "AccountDocument" d
    WHERE d."docType"::text = 'INVOICE' AND d."status"::text IN ('PARTIAL','AWAITING_PAYMENT')
      ${TENANT ? `AND d."tenantId" = $1` : ""}
      AND EXISTS (SELECT 1 FROM "AccountDocument" c WHERE c."systemId" = d."systemId" AND c."docType"::text = 'CREDIT_NOTE'
                    AND c."sourceDocId" IN (SELECT f."id" FROM fam f WHERE f."root" = d."id")
                    AND c."status"::text NOT IN ('DRAFT','VOIDED','CANCELLED'))
    ORDER BY d."tenantId", d."id"`,
  ...(TENANT ? [TENANT] : []),
)) as Any[]).map((r) => ({ ...r, grand: Number(r.grand), paid: Number(r.paid), cn: Number(r.cn) })) as Row[];

const fix = rows.filter((r) => r.status === "PARTIAL" && r.paid > 0 && r.paid + r.cn >= r.grand);
const info = rows.filter((r) => r.status === "AWAITING_PAYMENT" && r.paid === 0 && r.cn >= r.grand);
const tenants = new Set(fix.map((r) => r.tenantId));
console.log(`candidates (INVOICE with live credit notes, not PAID): ${rows.length}`);
console.log(`→ PARTIAL fully settled by payments + credit notes (would become PAID): ${fix.length} in ${tenants.size} tenant(s)`);
for (const r of fix.slice(0, 50)) console.log(`   ${r.tenantId} ${r.docNo ?? r.id} grand ${r.grand} paid ${r.paid} cn ${r.cn}`);
if (fix.length > 50) console.log(`   … ${fix.length - 50} more`);
console.log(`(info only — not touched) AWAITING_PAYMENT fully credited, no money received: ${info.length}`);

let applied = 0;
if (APPLY) {
  for (const r of fix) {
    const done = await P.$transaction(async (tx: Any) => {
      await tx.$queryRaw`SELECT "id" FROM "AccountDocument" WHERE "id" = ${r.id} FOR UPDATE`;
      const cur = await tx.accountDocument.findFirst({ where: { id: r.id }, select: { status: true, grandTotal: true, paidTotal: true } });
      const famIds = await ACC.docFamilyIds(tx, r.systemId, r.id); // hunt F1: ทั้งครอบครัวใบแจ้งหนี้
      const cn = await tx.accountDocument.aggregate({ where: { systemId: r.systemId, docType: "CREDIT_NOTE", sourceDocId: { in: famIds }, status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } }, _sum: { grandTotal: true } });
      const credit = Number(cn._sum.grandTotal ?? 0);
      if (!cur || cur.status !== "PARTIAL" || cur.paidTotal <= 0 || cur.paidTotal + credit < cur.grandTotal) return false;
      const n = await tx.accountDocument.updateMany({ where: { id: r.id, status: "PARTIAL" }, data: { status: "PAID" } });
      if (n.count !== 1) return false;
      await tx.auditLog.create({ data: { tenantId: r.tenantId, actorType: "SYSTEM", action: "account.invoice.status.backfill", targetType: "AccountDocument", targetId: r.id,
        before: { status: "PARTIAL" }, after: { status: "PAID", paidTotalSatang: cur.paidTotal, creditNoteSatang: credit, reason: "C5.4-C: payments + credit notes cover the invoice (no event emitted)" } } });
      return true;
    });
    if (done) applied += 1;
  }
  console.log(`applied: ${applied}/${fix.length} (no outbox events written)`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ mode: APPLY ? "apply" : "dry-run", tenant: TENANT, candidates: rows.length, wouldFix: fix.length, tenants: tenants.size, applied, infoFullyCreditedUnpaid: info.length })}`);
await prisma.$disconnect();
