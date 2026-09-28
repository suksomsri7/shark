// backfill-group-cheque-links.mts — C5.4-C round 8 (R8-1): การชำระของเอกสารกลุ่ม (ใบวางบิล/ใบรวมจ่าย) ด้วยเช็ค — ก่อนแก้ ผูกเช็คกับ "งวดแรก" งวดเดียว
//   ⇒ งวดของใบลูกใบอื่นใน "ครั้งเดียวกัน" ไม่มี chequeId (เช็คเด้งคืนหนี้แค่ใบแรก · ยกเลิกงวดอื่นเลี่ยงกติกาเช็คได้)
//   ชุดของครั้งเดียวกัน = คีย์กันซ้ำ `GRP#<groupId>#<clientKey>#<childDocId>` (groupChildKey) — ตัด `#<childDocId>` ท้ายออกได้ batchKey เดียวกัน
//   ผูก: batch ที่มีเช็คผูกอยู่ **ใบเดียว** และมีงวดช่องทาง CHEQUE ที่ chequeId ยังว่าง ⇒ ตั้ง chequeId ให้ (updateMany where chequeId null — รันซ้ำได้)
//   ไม่แตะ: batch ที่มีเช็คมากกว่า 1 ใบ (รายงานให้คนดู) · งวดที่ช่องทางไม่ใช่ CHEQUE
//   รายงานเพิ่ม: งวดที่ถูกยกเลิกไปแล้วขณะเช็คของครั้งนั้นยังมีผล (ผลของบั๊กเดิม — ต้องให้บัญชีตรวจ ไม่แก้อัตโนมัติ)
//   ค่าเริ่มต้น DRY-RUN · `--apply` เขียน · `--tenant=<id>` จำกัดร้าน · 🔴 prod = เจ้าของตัดสิน (C6.2) · QC เท่านั้นที่รัน --apply ได้ในรอบนี้
// Run (QC2): bash scripts/qc2.sh pnpm exec tsx scripts/pending/c54c/backfill-group-cheque-links.mts [--tenant=<id>] [--apply]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const TENANT = (ARGV.find((a) => a.startsWith("--tenant=")) ?? "").slice("--tenant=".length) || null;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const host = String(process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0] || "(no DATABASE_URL)";
console.log(`[backfill-group-cheque-links] DB ${host} · ${APPLY ? "APPLY" : "DRY-RUN"}${TENANT ? ` · tenant ${TENANT}` : " · all tenants"}`);
if (APPLY && /ep-royal-night/.test(host)) { console.log("🔴 prod host — --apply is an owner decision (C6.2); refusing"); process.exit(2); }

type Row = { id: string; tenantId: string; systemId: string; documentId: string; channel: string; chequeId: string | null; voidedAt: Date | null; idempotencyKey: string };
const rows = (await P.accountDocumentPayment.findMany({
  where: { idempotencyKey: { startsWith: "GRP#" }, ...(TENANT ? { tenantId: TENANT } : {}) },
  select: { id: true, tenantId: true, systemId: true, documentId: true, channel: true, chequeId: true, voidedAt: true, idempotencyKey: true },
  orderBy: [{ tenantId: "asc" }, { id: "asc" }],
})) as Row[];
const batchOf = (k: string) => k.slice(0, k.lastIndexOf("#"));
const batches = new Map<string, Row[]>();
for (const r of rows) { const k = `${r.systemId}|${batchOf(r.idempotencyKey)}`; batches.set(k, [...(batches.get(k) ?? []), r]); }

const toLink: { row: Row; chequeId: string }[] = [];
const multi: string[] = [];
const reviewVoided: string[] = [];
for (const [k, list] of batches) {
  const cheques = [...new Set(list.map((r) => r.chequeId).filter((x): x is string => !!x))];
  if (cheques.length === 0) continue;
  if (cheques.length > 1) { multi.push(`${k} cheques=${cheques.join(",")}`); continue; }
  const chq = cheques[0]!;
  const st = (await P.accountCheque.findUnique({ where: { id: chq }, select: { status: true } }))?.status;
  for (const r of list) {
    if (!r.chequeId && r.channel === "CHEQUE") toLink.push({ row: r, chequeId: chq });
    if (!r.chequeId && r.channel === "CHEQUE" && r.voidedAt && st && st !== "BOUNCED" && st !== "VOIDED") reviewVoided.push(`${r.tenantId} payment ${r.id} doc ${r.documentId} voided while cheque ${chq} is ${st}`);
  }
}
const perTenant = new Map<string, number>();
for (const t of toLink) perTenant.set(t.row.tenantId, (perTenant.get(t.row.tenantId) ?? 0) + 1);
console.log(`group batches with a cheque: ${[...batches.values()].filter((l) => l.some((r) => r.chequeId)).length} · payments to link: ${toLink.length} in ${perTenant.size} tenant(s)`);
for (const [t, n] of perTenant) console.log(`   tenant ${t}: ${n}`);
if (multi.length) console.log(`(not touched) batches with more than one cheque: ${multi.length}\n   ${multi.slice(0, 20).join("\n   ")}`);
if (reviewVoided.length) console.log(`(review — accounting) child payments voided while their cheque is still live: ${reviewVoided.length}\n   ${reviewVoided.slice(0, 50).join("\n   ")}`);

let applied = 0;
if (APPLY) {
  for (const t of toLink) {
    const n = await P.accountDocumentPayment.updateMany({ where: { id: t.row.id, chequeId: null }, data: { chequeId: t.chequeId } });
    if (n.count === 1) {
      applied += 1;
      await P.auditLog.create({ data: { tenantId: t.row.tenantId, actorType: "SYSTEM", action: "account.payment.cheque.backfill", targetType: "AccountDocumentPayment", targetId: t.row.id, after: { chequeId: t.chequeId, reason: "C5.4-C R8-1: group cheque linked to every child payment of the batch" } } });
    }
  }
  console.log(`applied: ${applied}/${toLink.length}`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ mode: APPLY ? "apply" : "dry-run", tenant: TENANT, batchesWithCheque: [...batches.values()].filter((l) => l.some((r) => r.chequeId)).length, toLink: toLink.length, tenants: perTenant.size, multiCheque: multi.length, reviewVoided: reviewVoided.length, applied })}`);
await prisma.$disconnect();
