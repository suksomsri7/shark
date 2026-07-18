// QC — Bulk operations (WO Bulk ops) · ทำหลายรายการพร้อมกัน: อนุมัติคำขอ / ใบลา / นับสต็อก
// ⚠️ standalone-typesafe: dynamic import + wide cast (any จงใจ — oracle ล้ำหน้าโค้ด)
//
// สัญญาที่ทดสอบ:
//   approval.bulkDecide(m, ctx{tenantId}, requestIds[], "APPROVED"|"REJECTED", note?)
//     → { done, failed:[{id, reason}] } · วน decide() ต่อใบ (สิทธิ์/claim/atomic เดิม) · ทำต่อแม้บางใบ fail
//   hr.bulkDecideLeave(ctx{tenantId,systemId}, leaveIds[], "APPROVED"|"REJECTED", decidedById?)
//     → { done, failed:[{id, reason}] }
//   inventory.bulkCount(ctx{tenantId,systemId}, counts:[{itemId, countedQty}])
//     → { done, failed:[{itemId, reason}] } · วน adjust() ตั้ง onHand = countedQty (movement ADJUST · ไม่โพสต์ GL)
//   cross-tenant: bulk ด้วย id ร้านอื่น → ข้าม/ปฏิเสธ (failed) ไม่แตะข้อมูลร้านต้นทาง
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const MGR = { role: "MANAGER", unitAccess: [] as string[], permissions: {}, userId: "mgr-1" };

let t1 = ""; let t2 = "";
try {
  const ap = (await import("@/lib/modules/approval/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  const hr = (await import("@/lib/modules/hr/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  const inv = (await import("@/lib/modules/inventory/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  if (!ap?.bulkDecide) chk("B-0.1", "มี approval.bulkDecide", false, "มี", "ยังไม่สร้าง");
  if (!hr?.bulkDecideLeave) chk("B-0.2", "มี hr.bulkDecideLeave", false, "มี", "ยังไม่สร้าง");
  if (!inv?.bulkCount) chk("B-0.3", "มี inventory.bulkCount", false, "มี", "ยังไม่สร้าง");

  if (ap?.bulkDecide && hr?.bulkDecideLeave && inv?.bulkCount) {
    const ta = await prisma.tenant.create({ data: { name: "QC BULK", slug: `qc-bulk-${Date.now()}` } }); t1 = ta.id;
    const tb = await prisma.tenant.create({ data: { name: "QC BULK2", slug: `qc-bulk2-${Date.now()}` } }); t2 = tb.id;
    const cA = { tenantId: t1 };

    // ═══ 1) Approval bulkDecide (2 ok, 1 สถานะไม่ถูก) ═══
    await ap.createPolicy(cA, { name: "PO ทุกใบ", entityType: "PurchaseOrder", steps: [{ order: 1, approverRole: "MANAGER" }] });
    const rr = [];
    for (let i = 1; i <= 3; i++) rr.push(await ap.submitForApproval(cA, { entityType: "PurchaseOrder", entityId: `po-${i}`, amountSatang: 10000, requestedById: "u1" }));
    // ทำใบที่ 3 ให้สถานะไม่ถูก (ยกเลิก) → bulk จะข้าม
    await ap.cancelRequest(cA, rr[2].requestId);
    const bd = await ap.bulkDecide(MGR, cA, rr.map((r) => r.requestId), "APPROVED");
    chk("B-1.1", "bulkDecide 3 ใบ → done=2 failed=1", bd.done === 2 && bd.failed.length === 1, "done2/fail1", `done${bd.done}/fail${bd.failed.length}`);
    chk("B-1.2", "ใบที่อนุมัติได้ → APPROVED จริงใน DB", (await prisma.approvalRequest.findUnique({ where: { id: rr[0].requestId } }))?.status === "APPROVED" && (await prisma.approvalRequest.findUnique({ where: { id: rr[1].requestId } }))?.status === "APPROVED", "APPROVED", "?");
    chk("B-1.3", "ใบที่ถูกยกเลิก → คง CANCELLED (ไม่ถูกแตะ)", (await prisma.approvalRequest.findUnique({ where: { id: rr[2].requestId } }))?.status === "CANCELLED", "CANCELLED", "?");
    chk("B-1.4", "failed มี reason (id ที่พลาด)", bd.failed[0]?.id === rr[2].requestId && typeof bd.failed[0]?.reason === "string", "มี reason", JSON.stringify(bd.failed[0] ?? {}).slice(0, 60));

    // cross-tenant: ใช้ ctx ร้าน t2 ตัดสินคำขอของ t1 → failed ทั้งหมด ไม่แตะ
    const r4 = await ap.submitForApproval(cA, { entityType: "PurchaseOrder", entityId: "po-4", amountSatang: 10000, requestedById: "u1" });
    const bx = await ap.bulkDecide(MGR, { tenantId: t2 }, [r4.requestId], "APPROVED");
    chk("B-1.5", "cross-tenant approval → done=0 failed=1 · คำขอคง PENDING", bx.done === 0 && bx.failed.length === 1 && (await prisma.approvalRequest.findUnique({ where: { id: r4.requestId } }))?.status === "PENDING", "ไม่แตะ", `done${bx.done}/PENDING?`);

    // ═══ 2) HR bulkDecideLeave หลายใบ → อนุมัติครบ ═══
    const sHr = await sys.createSystem(t1, "HR", "พนักงาน"); const cHr = { tenantId: t1, systemId: sHr.id };
    const emp = await hr.createEmployee(cHr, { name: "สมชาย" });
    const lv: string[] = [];
    for (let i = 0; i < 3; i++) { const l = await hr.requestLeave(cHr, { employeeId: emp.id, type: "SICK", fromDate: "2026-09-01", toDate: "2026-09-02", reason: `ป่วย${i}` }); lv.push(l.id); }
    const bl = await hr.bulkDecideLeave(cHr, lv, "APPROVED", "own-1");
    chk("B-2.1", "bulkDecideLeave 3 ใบ → done=3 failed=0", bl.done === 3 && bl.failed.length === 0, "done3", `done${bl.done}/fail${bl.failed.length}`);
    chk("B-2.2", "ใบลาทั้ง 3 → APPROVED จริง", (await prisma.hrLeave.count({ where: { systemId: sHr.id, status: "APPROVED" } })) === 3, "3", String(await prisma.hrLeave.count({ where: { systemId: sHr.id, status: "APPROVED" } })));

    // cross-tenant HR: ร้าน t2 ตัดสินใบลาของ t1 → failed ไม่แตะ
    const sHr2 = await sys.createSystem(t2, "HR", "พนักงาน2"); const cHr2 = { tenantId: t2, systemId: sHr2.id };
    const emp1 = await hr.createEmployee(cHr, { name: "สมหญิง" });
    const l1 = await hr.requestLeave(cHr, { employeeId: emp1.id, type: "PERSONAL", fromDate: "2026-09-05", toDate: "2026-09-05" });
    const blx = await hr.bulkDecideLeave(cHr2, [l1.id], "APPROVED", "own-2");
    chk("B-2.3", "cross-tenant HR → done=0 failed=1 · ใบลาคง PENDING", blx.done === 0 && blx.failed.length === 1 && (await prisma.hrLeave.findUnique({ where: { id: l1.id } }))?.status === "PENDING", "ไม่แตะ", `done${blx.done}/PENDING?`);

    // ═══ 3) Inventory bulkCount 3 สินค้า → onHand = จำนวนนับ + movement ADJUST ═══
    const sInv = await sys.createSystem(t1, "INVENTORY", "คลัง"); const cInv = { tenantId: t1, systemId: sInv.id };
    await sys.createSystem(t1, "ACCOUNT", "บัญชี"); // มีระบบบัญชี → พิสูจน์ว่า ADJUST ยังไม่โพสต์ GL
    const items: string[] = [];
    for (let i = 1; i <= 3; i++) { const it = await inv.createItem(cInv, { sku: `BK-${i}`, name: `สินค้า${i}` }); items.push(it.id); await inv.receive(cInv, { itemId: it.id, qty: 5, costSatang: 1000, idempotencyKey: `rc-${i}` }); }
    const glBefore = await prisma.accountJournalEntry.count({ where: { tenantId: t1 } });
    const bc = await inv.bulkCount(cInv, [{ itemId: items[0], countedQty: 8 }, { itemId: items[1], countedQty: 3 }, { itemId: items[2], countedQty: 0 }]);
    chk("B-3.1", "bulkCount 3 สินค้า → done=3 failed=0", bc.done === 3 && bc.failed.length === 0, "done3", `done${bc.done}/fail${bc.failed.length}`);
    chk("B-3.2", "onHand = จำนวนนับ (8/3/0)", (await prisma.invItem.findUnique({ where: { id: items[0] } }))?.onHand === 8 && (await prisma.invItem.findUnique({ where: { id: items[1] } }))?.onHand === 3 && (await prisma.invItem.findUnique({ where: { id: items[2] } }))?.onHand === 0, "8/3/0", "?");
    chk("B-3.3", "movement ADJUST เกิดครบ 3 รายการ", (await prisma.invMovement.count({ where: { systemId: sInv.id, type: "ADJUST" } })) === 3, "3", String(await prisma.invMovement.count({ where: { systemId: sInv.id, type: "ADJUST" } })));
    chk("B-3.4", "ADJUST ไม่โพสต์ GL (cpa: journal entry ไม่เพิ่ม)", (await prisma.accountJournalEntry.count({ where: { tenantId: t1 } })) === glBefore, `=${glBefore}`, String(await prisma.accountJournalEntry.count({ where: { tenantId: t1 } })));

    // cross-tenant inventory: ร้าน t2 นับสินค้าของ t1 → failed ไม่แตะ
    const sInv2 = await sys.createSystem(t2, "INVENTORY", "คลัง2"); const cInv2 = { tenantId: t2, systemId: sInv2.id };
    const bcx = await inv.bulkCount(cInv2, [{ itemId: items[0], countedQty: 999 }]);
    chk("B-3.5", "cross-tenant inventory → done=0 failed=1 · onHand คงเดิม (8)", bcx.done === 0 && bcx.failed.length === 1 && (await prisma.invItem.findUnique({ where: { id: items[0] } }))?.onHand === 8, "ไม่แตะ", `done${bcx.done}/onHand?`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [t1, t2].filter(Boolean)) {
    for (const m of ["approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy", "hrAttendance", "hrLeave", "hrEmployee", "invMovement", "invLocationStock", "invLot", "invLocation", "invItem", "accountJournalLine", "accountJournalEntry", "appNotification", "outboxEvent", "appSystemUnit", "appSystem"])
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Bulk Operations =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) }));
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
