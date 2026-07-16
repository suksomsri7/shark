// QC — Approval Engine (WO-0049) · Fable oracle, Builder ห้ามแตะ · สเปค: docs/sds/modules/future-approval.md
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/approval/service.ts (ctx {tenantId} — tenant-scoped ผ่าน tenantDb):
//   createPolicy(ctx, { name, entityType, thresholdSatang?, unitId?, systemId?, steps: [{order, approverRole, approverUserId?}] }) → {id}
//     · steps ว่าง → throw ไทย · สร้าง policy+steps ใน nested create เดียว
//   setPolicyActive(ctx, policyId, active) · listPolicies(ctx)
//   resolvePolicy(ctx, { entityType, unitId?, systemId?, amountSatang? }) → policy|null
//     · เฉพาะ active · threshold: amountSatang >= thresholdSatang (null = ทุกจำนวน · amount null+มี threshold = ไม่เข้า)
//     · เจาะจงสุดชนะ: unitId ตรง > systemId ตรง > global (null ทั้งคู่)
//   submitForApproval(ctx, { entityType, entityId, unitId?, systemId?, amountSatang?, requestedById })
//     → { autoApproved: true } เมื่อไม่มี policy · ไม่งั้น { requestId } (PENDING step 1) + emitOutbox "approval.request.submitted"
//     · ยื่นซ้ำ entity เดิมที่ยัง PENDING → คืน requestId เดิม (idempotencyKey approval-<entityType>-<entityId>)
//   decide(m: MembershipCtx & { userId: string }, ctx, requestId, { decision: "APPROVED"|"REJECTED", note? })
//     → { ok, status, note } · ตรวจสิทธิ์: step ปัจจุบัน approverUserId ตรง userId หรือ role ผ่าน (OWNER ตัดสินได้ทุก step · MANAGER ได้เฉพาะ step role MANAGER)
//     · claim อะตอมมิก updateMany เงื่อนไข currentStepOrder (กันแข่งกด) · Decision append-only
//     · APPROVED ขั้นสุดท้าย → status APPROVED + decidedAt + emitOutbox "approval.request.approved"
//     · REJECTED ขั้นใด → REJECTED ทันที + emit "approval.request.rejected"
//   listPending(ctx, m) → คำขอ PENDING ที่ step ปัจจุบันรอ "คนแบบนี้" ตัดสิน (role/userId)
//   cancelRequest(ctx, requestId) → PENDING→CANCELLED (อื่น false)
// outbox: ผูก handler ทั้ง 3 type ใน outbox-consumers → AppNotification (ไทย) ให้ร้าน
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const OWNER = { role: "OWNER", unitAccess: [] as string[], permissions: {}, userId: "own-1" };
const MGR = { role: "MANAGER", unitAccess: [] as string[], permissions: {}, userId: "mgr-1" };

let tid = ""; let tid2 = "";
try {
  const ap = (await import("@/lib/modules/approval/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด (standalone-typesafe)
  if (!ap) { chk("AP-0", "มี approval/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC APPROVE", slug: `qc-ap-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC AP2", slug: `qc-ap2-${Date.now()}` } }); tid2 = t2.id;
    const ctx = { tenantId: tid };

    // 1) policy + resolve
    let threw = false; try { await ap.createPolicy(ctx, { name: "x", entityType: "PurchaseOrder", steps: [] }); } catch { threw = true; }
    chk("AP-1.1", "steps ว่าง → throw", threw, "throw", "?");
    const pGlobal = await ap.createPolicy(ctx, { name: "PO ทั้งร้าน ≥5,000", entityType: "PurchaseOrder", thresholdSatang: 500000, steps: [{ order: 1, approverRole: "MANAGER" }, { order: 2, approverRole: "OWNER" }] });
    const pUnit = await ap.createPolicy(ctx, { name: "PO สาขาเฉพาะ", entityType: "PurchaseOrder", unitId: "unit-A", steps: [{ order: 1, approverRole: "OWNER" }] });
    chk("AP-1.2", "resolve เจาะจงสุดชนะ (unit ตรง)", ((await ap.resolvePolicy(ctx, { entityType: "PurchaseOrder", unitId: "unit-A", amountSatang: 999999 })) as { id?: string })?.id === pUnit.id, "unit ชนะ", "?");
    chk("AP-1.3", "ยอดต่ำกว่า threshold → null (ไม่ต้องอนุมัติ)", (await ap.resolvePolicy(ctx, { entityType: "PurchaseOrder", amountSatang: 100000 })) === null, "null", "?");
    chk("AP-1.4", "ยอดถึง threshold → เจอ policy global", ((await ap.resolvePolicy(ctx, { entityType: "PurchaseOrder", amountSatang: 600000 })) as { id?: string })?.id === pGlobal.id, "เจอ", "?");

    // 2) submit
    const auto = await ap.submitForApproval(ctx, { entityType: "HrLeave", entityId: "lv-1", requestedById: "u1" });
    chk("AP-2.1", "ไม่มี policy → autoApproved", auto.autoApproved === true, "true", JSON.stringify(auto));
    const r1 = await ap.submitForApproval(ctx, { entityType: "PurchaseOrder", entityId: "po-1", amountSatang: 600000, requestedById: "u1" });
    chk("AP-2.2", "มี policy → PENDING step 1 + outbox submitted", !!r1.requestId && (await prisma.approvalRequest.findUnique({ where: { id: r1.requestId as string } }))?.currentStepOrder === 1 && (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "approval.request.submitted" } })) >= 1, "PENDING", "?");
    const r1b = await ap.submitForApproval(ctx, { entityType: "PurchaseOrder", entityId: "po-1", amountSatang: 600000, requestedById: "u1" });
    chk("AP-2.3", "ยื่นซ้ำ entity เดิม → requestId เดิม", r1b.requestId === r1.requestId, "เดิม", "?");

    // 3) decide 2 ขั้น
    chk("AP-3.1", "listPending สำหรับ MANAGER เห็นคำขอ", ((await ap.listPending(ctx, MGR)) as unknown as unknown[]).length >= 1, "≥1", "?");
    const d1 = await ap.decide(MGR, ctx, r1.requestId, { decision: "APPROVED", note: "ผ่านขั้นหัวหน้า" });
    chk("AP-3.2", "MANAGER อนุมัติ step 1 → เลื่อน step 2 ยัง PENDING", d1.ok === true && (await prisma.approvalRequest.findUnique({ where: { id: r1.requestId as string } }))?.currentStepOrder === 2, "step 2", JSON.stringify(d1).slice(0, 60));
    const dMgrAgain = await ap.decide(MGR, ctx, r1.requestId, { decision: "APPROVED" });
    chk("AP-3.3", "MANAGER ตัดสิน step OWNER → ok:false", dMgrAgain.ok === false, "false", "?");
    const d2 = await ap.decide(OWNER, ctx, r1.requestId, { decision: "APPROVED" });
    const fin = await prisma.approvalRequest.findUnique({ where: { id: r1.requestId as string } });
    chk("AP-3.4", "OWNER อนุมัติขั้นสุดท้าย → APPROVED + decidedAt + outbox approved", d2.ok === true && fin?.status === "APPROVED" && !!fin?.decidedAt && (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "approval.request.approved" } })) >= 1, "APPROVED", String(fin?.status));
    chk("AP-3.5", "ตัดสินซ้ำหลังจบ → ok:false", ((await ap.decide(OWNER, ctx, r1.requestId, { decision: "APPROVED" })) as { ok: boolean }).ok === false, "false", "?");
    chk("AP-3.6", "Decision append-only ครบ 2 แถว", (await prisma.approvalDecision.count({ where: { requestId: r1.requestId as string } })) === 2, "2", "?");

    // 4) reject + cancel + isolation
    const r2 = await ap.submitForApproval(ctx, { entityType: "PurchaseOrder", entityId: "po-2", amountSatang: 700000, requestedById: "u1" });
    const dj = await ap.decide(MGR, ctx, r2.requestId, { decision: "REJECTED", note: "แพงไป" });
    chk("AP-4.1", "REJECT ขั้นแรก → REJECTED ทันที + outbox rejected", dj.ok === true && (await prisma.approvalRequest.findUnique({ where: { id: r2.requestId as string } }))?.status === "REJECTED" && (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "approval.request.rejected" } })) >= 1, "REJECTED", "?");
    const r3 = await ap.submitForApproval(ctx, { entityType: "PurchaseOrder", entityId: "po-3", amountSatang: 700000, requestedById: "u1" });
    chk("AP-4.2", "cancel PENDING → CANCELLED · ซ้ำ false", ((await ap.cancelRequest(ctx, r3.requestId)) as unknown as boolean) === true && ((await ap.cancelRequest(ctx, r3.requestId)) as unknown as boolean) === false, "true/false", "?");
    chk("AP-4.3", "tenant อื่นมองไม่เห็น (guard)", ((await ap.listPolicies({ tenantId: tid2 })) as unknown as unknown[]).length === 0, "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "appNotification", "outboxEvent"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Approval Engine =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
