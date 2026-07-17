// QC — Approval wiring (WO-0049b): ผูกสายอนุมัติเข้า PO + ใบลาจริง · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// 1) src/lib/modules/inventory/procurement.ts — markOrdered(ctx, poId, actorUserId?) เปลี่ยนเป็น:
//    ยอด PO = Σ qty×costSatang จาก PoLine → approval.resolvePolicy({entityType:"PurchaseOrder", amountSatang})
//    · มี policy → approval.submitForApproval (entityId=poId · requestedById=actorUserId ?? "system") → PO **คง DRAFT** + คืน { pending: true }
//    · ไม่มี policy → ORDERED ตรงเหมือนเดิม (คืน true/{pending:false} — ของเดิมใครเรียกแบบ boolean ต้องไม่พัง: คืนค่า truthy)
//    · fitness allowlist เปิดแล้ว: inventory→approval
// 2) src/lib/modules/hr/service.ts — requestLeave: หลังสร้างใบลา → resolvePolicy({entityType:"HrLeave"})
//    · มี policy → submitForApproval (entityId=leaveId) — ใบลาคง PENDING · ไม่มี → พฤติกรรมเดิม · allowlist: hr→approval
// 3) src/lib/approval-effects.ts (composition root ใหม่ นอก modules):
//    applyApprovalEffect(evt) — เรียกจาก consumer "approval.request.approved"/"rejected" (ห่อเพิ่มใน outbox-consumers ต่อจาก notify เดิม — notify เดิมห้ามหาย):
//    · approved + entityType "PurchaseOrder" → PO DRAFT→ORDERED (updateMany เงื่อนไข DRAFT + orderedAt)
//    · approved + entityType "HrLeave" → leave PENDING→APPROVED (decidedById "approval-engine")
//    · rejected + "HrLeave" → PENDING→REJECTED · rejected + "PurchaseOrder" → คง DRAFT (ไม่ทำอะไร)
//    · entityType อื่น → เงียบ ๆ (โมดูลอนาคต)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const OWNER = { role: "OWNER", unitAccess: [] as string[], permissions: {}, userId: "own-1" };
let tid = "";
try {
  const ap = (await import("@/lib/modules/approval/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  const proc = (await import("@/lib/modules/inventory/procurement")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  const hr = (await import("@/lib/modules/hr/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  const outbox = (await import("@/lib/outbox-consumers")) as unknown as { drainAll: () => Promise<unknown> };
  const t = await prisma.tenant.create({ data: { name: "QC APW", slug: `qc-apw-${Date.now()}` } }); tid = t.id;
  const invS = await sys.createSystem(tid, "INVENTORY", "คลัง");
  const hrS = await sys.createSystem(tid, "HR", "คน");
  const invCtx = { tenantId: tid, systemId: invS.id }; const hrCtx = { tenantId: tid, systemId: hrS.id }; const tCtx = { tenantId: tid };
  const invSvc = (await import("@/lib/modules/inventory/service")) as unknown as { createItem: (c: unknown, i: unknown) => Promise<{ id: string }> };
  const item = await invSvc.createItem(invCtx, { sku: "APW-1", name: "ของ" });
  const sup = await proc.createSupplier(invCtx, { name: "ผู้ขาย" });

  // 1) PO + policy วงเงิน ≥ 3000 (300000 สตางค์)
  await ap.createPolicy(tCtx, { name: "PO ใหญ่", entityType: "PurchaseOrder", thresholdSatang: 300000, steps: [{ order: 1, approverRole: "OWNER" }] });
  const poBig = await proc.createPo(invCtx, { supplierId: sup.id, lines: [{ itemId: item.id, qty: 4, costSatang: 100000 }] }); // 4000 บาท
  const r1 = await proc.markOrdered(invCtx, poBig.id, "u-staff");
  const reqRow = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "PurchaseOrder", entityId: poBig.id as string } });
  chk("AW-1.1", "PO เกิน threshold → คง DRAFT + ApprovalRequest PENDING", (r1 as { pending?: boolean })?.pending === true && (await prisma.purchaseOrder.findUnique({ where: { id: poBig.id as string } }))?.status === "DRAFT" && reqRow?.status === "PENDING", "DRAFT+PENDING", "?");
  await ap.decide(OWNER, tCtx, reqRow!.id, { decision: "APPROVED" });
  await outbox.drainAll();
  chk("AW-1.2", "OWNER อนุมัติ + drain → PO ORDERED (effect ทำงาน)", (await prisma.purchaseOrder.findUnique({ where: { id: poBig.id as string } }))?.status === "ORDERED", "ORDERED", String((await prisma.purchaseOrder.findUnique({ where: { id: poBig.id as string } }))?.status));
  const poSmall = await proc.createPo(invCtx, { supplierId: sup.id, lines: [{ itemId: item.id, qty: 1, costSatang: 50000 }] }); // 500 บาท
  await proc.markOrdered(invCtx, poSmall.id, "u-staff");
  chk("AW-1.3", "PO ต่ำกว่า threshold → ORDERED ตรงเหมือนเดิม (ไม่มี request)", (await prisma.purchaseOrder.findUnique({ where: { id: poSmall.id as string } }))?.status === "ORDERED" && (await prisma.approvalRequest.count({ where: { tenantId: tid, entityId: poSmall.id as string } })) === 0, "ORDERED/0", "?");

  // 2) ใบลา + policy
  await ap.createPolicy(tCtx, { name: "ใบลาทุกใบ", entityType: "HrLeave", steps: [{ order: 1, approverRole: "OWNER" }] });
  const emp = await prisma.hrEmployee.create({ data: { tenantId: tid, systemId: hrS.id, name: "พนักงาน" } });
  const lv1 = await hr.requestLeave(hrCtx, { employeeId: emp.id, type: "PERSONAL", fromDate: new Date("2026-09-01"), toDate: new Date("2026-09-02") });
  const lvReq = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "HrLeave", entityId: lv1.id as string } });
  chk("AW-2.1", "ยื่นใบลา (มี policy) → leave PENDING + request PENDING", (await prisma.hrLeave.findUnique({ where: { id: lv1.id as string } }))?.status === "PENDING" && lvReq?.status === "PENDING", "PENDING×2", "?");
  await ap.decide(OWNER, tCtx, lvReq!.id, { decision: "APPROVED" });
  await outbox.drainAll();
  chk("AW-2.2", "อนุมัติ + drain → ใบลา APPROVED", (await prisma.hrLeave.findUnique({ where: { id: lv1.id as string } }))?.status === "APPROVED", "APPROVED", "?");
  const lv2 = await hr.requestLeave(hrCtx, { employeeId: emp.id, type: "SICK", fromDate: new Date("2026-09-05"), toDate: new Date("2026-09-06") });
  const lvReq2 = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityId: lv2.id as string } });
  await ap.decide(OWNER, tCtx, lvReq2!.id, { decision: "REJECTED", note: "คนไม่พอ" });
  await outbox.drainAll();
  chk("AW-2.3", "ปฏิเสธ + drain → ใบลา REJECTED", (await prisma.hrLeave.findUnique({ where: { id: lv2.id as string } }))?.status === "REJECTED", "REJECTED", "?");
  chk("AW-3.1", "notify เดิมยังส่ง (AppNotification จาก approval ≥3)", (await prisma.appNotification.count({ where: { tenantId: tid } })) >= 3, "≥3", String(await prisma.appNotification.count({ where: { tenantId: tid } })));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "hrLeave", "hrEmployee", "poLine", "purchaseOrder", "supplier", "invMovement", "invItem", "outboxEvent", "appNotification", "webhookDelivery", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Approval Wiring =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
