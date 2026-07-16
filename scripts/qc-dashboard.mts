// QC — Dashboard หน้าแรกกิจการ (WO-0030) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/dashboard/service.ts:
//   dashboardSummary(ctx: { tenantId: string }): Promise<{
//     salesTodaySatang: number; salesTodayCount: number;   // PosSale PAID วันนี้ (วัน BKK — ใช้ dayKeyBangkok เทียบ createdAt)
//     newCustomers7d: number;                               // Customer สร้างใน 7 วัน
//     lowStockCount: number;                                // InvItem onHand ≤ reorderPoint (ทุกระบบ INVENTORY, ไม่นับ archived)
//     pendingLeaves: number;                                // HrLeave PENDING
//     unreadNotifications: number;                          // AppNotification readAt null
//   }>  — ระบบไหนไม่ได้เปิด → ตัวเลขหมวดนั้น 0 (ห้าม throw)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const db = await import("@/lib/dashboard/service" as string).catch(() => null);
  if (!db) { chk("DB-0", "มี src/lib/dashboard/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC DASH", slug: `qc-db-${Date.now()}` } }); tid = t.id;
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    const hr = await sys.createSystem(tid, "HR", "คน");
    const pos = await sys.createSystem(tid, "POS", "ขาย");
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "หลัก", slug: `db-${Date.now()}` } });
    await prisma.posSale.createMany({ data: [
      { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "d1", status: "PAID", subtotalSatang: 10000, grandTotalSatang: 10000 },
      { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "d2", status: "PAID", subtotalSatang: 5000, grandTotalSatang: 5000 },
      { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "d3", status: "VOIDED", subtotalSatang: 99999, grandTotalSatang: 99999 },
      { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "d4", status: "PAID", subtotalSatang: 7777, grandTotalSatang: 7777, createdAt: new Date(Date.now() - 3 * 86400000) },
    ] });
    await prisma.customer.createMany({ data: [
      { tenantId: tid, memberSystemId: member.id, name: "ใหม่" },
      { tenantId: tid, memberSystemId: member.id, name: "เก่า", createdAt: new Date(Date.now() - 30 * 86400000) },
    ] });
    const invSvc = await import("@/lib/modules/inventory/service");
    const item = await invSvc.createItem({ tenantId: tid, systemId: inv.id }, { sku: "D-1", name: "ของ", reorderPoint: 5 });
    await invSvc.receive({ tenantId: tid, systemId: inv.id }, { itemId: item.id, qty: 3, costSatang: 100, idempotencyKey: "dr" });
    const hrSvc = await import("@/lib/modules/hr/service");
    const emp = await hrSvc.createEmployee({ tenantId: tid, systemId: hr.id }, { name: "พ" });
    await hrSvc.requestLeave({ tenantId: tid, systemId: hr.id }, { employeeId: emp.id, type: "SICK", fromDate: "2026-08-01", toDate: "2026-08-01" });
    await prisma.appNotification.createMany({ data: [
      { tenantId: tid, title: "a", body: "b" },
      { tenantId: tid, title: "c", body: "d", readAt: new Date() },
    ] });

    const s = await db.dashboardSummary({ tenantId: tid });
    chk("DB-1.1", "ยอดขายวันนี้ = 150 บาท (PAID วันนี้ 2 บิล — ไม่นับ VOID/บิลเก่า)", s.salesTodaySatang === 15000 && s.salesTodayCount === 2, "15000/2", `${s.salesTodaySatang}/${s.salesTodayCount}`);
    chk("DB-1.2", "สมาชิกใหม่ 7 วัน = 1", s.newCustomers7d === 1, "1", String(s.newCustomers7d));
    chk("DB-1.3", "สต็อกใกล้หมด = 1", s.lowStockCount === 1, "1", String(s.lowStockCount));
    chk("DB-1.4", "ใบลารอ = 1", s.pendingLeaves === 1, "1", String(s.pendingLeaves));
    chk("DB-1.5", "แจ้งเตือนยังไม่อ่าน = 1", s.unreadNotifications === 1, "1", String(s.unreadNotifications));

    const t2 = await prisma.tenant.create({ data: { name: "QC DASH2", slug: `qc-db2-${Date.now()}` } }); tid2 = t2.id;
    const s2 = await db.dashboardSummary({ tenantId: tid2 });
    chk("DB-2.1", "ร้านเปล่า (ไม่มีระบบใด) → ศูนย์หมด ไม่ throw", s2.salesTodaySatang === 0 && s2.lowStockCount === 0 && s2.pendingLeaves === 0, "0 หมด", JSON.stringify(s2));
    chk("DB-2.2", "kernel guard: ข้อมูลไม่รั่วข้ามร้าน", s2.newCustomers7d === 0 && s2.unreadNotifications === 0, "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["appNotification", "hrLeave", "hrEmployee", "invMovement", "invItem", "posSale", "customer", "appSystemUnit", "appSystem", "businessUnit"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Dashboard =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
