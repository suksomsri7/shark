// QC — Procurement (WO-0028) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/modules/inventory/procurement.ts (ctx: {tenantId, systemId} ระบบ INVENTORY):
//   createSupplier(ctx, { name, phone?, email?, note? }): Promise<{id}>
//   listSuppliers(ctx)
//   createPo(ctx, { supplierId, note?, lines: {itemId, qty, costSatang}[] }): Promise<{id, code}>  // DRAFT · code รัน PO-0001 ต่อ system · lines ว่าง → throw ไทย
//   markOrdered(ctx, poId): Promise<boolean>       // DRAFT→ORDERED + orderedAt · อื่น false
//   receivePo(ctx, poId): Promise<{ ok: boolean; note: string }>
//     — ORDERED→RECEIVED + receivedAt · ทุก line → invSvc.receive (idempotencyKey `po-<lineId>` — receive ซ้ำไม่เบิ้ล)
//     — สถานะไม่ใช่ ORDERED → ok:false ไทย
//   cancelPo(ctx, poId): Promise<boolean>          // DRAFT/ORDERED→CANCELLED · RECEIVED → false
//   poDetail(ctx, poId)                            // + lines + item name
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = "";
try {
  const pc = await import("@/lib/modules/inventory/procurement" as string).catch(() => null);
  if (!pc) { chk("PC-0", "มี inventory/procurement.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC PO", slug: `qc-po-${Date.now()}` } }); tid = t.id;
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    const ctx = { tenantId: tid, systemId: inv.id };
    const invSvc = await import("@/lib/modules/inventory/service");
    const item = await invSvc.createItem(ctx, { sku: "PO-A", name: "น้ำยาสระผม", reorderPoint: 5 });

    const sup = await pc.createSupplier(ctx, { name: "บ.ซัพพลายดี", phone: "021112222" });
    chk("PC-1.1", "createSupplier + list", (await pc.listSuppliers(ctx)).length === 1, "1", "?");

    let threw = false; try { await pc.createPo(ctx, { supplierId: sup.id, lines: [] }); } catch { threw = true; }
    chk("PC-1.2", "PO ไม่มีรายการ → throw ไทย", threw, "throw", String(threw));

    const po1 = await pc.createPo(ctx, { supplierId: sup.id, lines: [{ itemId: item.id, qty: 24, costSatang: 8000 }] });
    chk("PC-2.1", "createPo → DRAFT + code PO-0001", po1.code === "PO-0001" && (await prisma.purchaseOrder.findUnique({ where: { id: po1.id } }))?.status === "DRAFT", "PO-0001", String(po1.code));
    const po2 = await pc.createPo(ctx, { supplierId: sup.id, lines: [{ itemId: item.id, qty: 1, costSatang: 8000 }] });
    chk("PC-2.2", "code รันต่อ PO-0002", po2.code === "PO-0002", "PO-0002", String(po2.code));

    chk("PC-3.1", "receivePo ตอน DRAFT → ok:false (ต้อง ORDERED ก่อน)", (await pc.receivePo(ctx, po1.id)).ok === false, "false", "?");
    chk("PC-3.2", "markOrdered → ORDERED", (await pc.markOrdered(ctx, po1.id)) === true && (await prisma.purchaseOrder.findUnique({ where: { id: po1.id } }))?.status === "ORDERED", "ORDERED", "?");
    const rec = await pc.receivePo(ctx, po1.id);
    const onHand = (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand;
    chk("PC-3.3", "receivePo → RECEIVED + สต็อกเข้า 24", rec.ok === true && onHand === 24, "24", String(onHand));
    const lines = await prisma.poLine.findMany({ where: { poId: po1.id } });
    chk("PC-3.4", "movement ใช้ idempotencyKey po-<lineId>", (await prisma.invMovement.count({ where: { tenantId: tid, idempotencyKey: `po-${lines[0].id}` } })) === 1, "1", "?");
    chk("PC-3.5", "receive ซ้ำ → ok:false + สต็อกไม่เบิ้ล", (await pc.receivePo(ctx, po1.id)).ok === false && (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand === 24, "24 คงเดิม", "?");

    chk("PC-4.1", "cancelPo (DRAFT) → CANCELLED", (await pc.cancelPo(ctx, po2.id)) === true && (await prisma.purchaseOrder.findUnique({ where: { id: po2.id } }))?.status === "CANCELLED", "CANCELLED", "?");
    chk("PC-4.2", "cancel PO ที่ RECEIVED → false", (await pc.cancelPo(ctx, po1.id)) === false, "false", "?");
    const det = await pc.poDetail(ctx, po1.id);
    chk("PC-4.3", "poDetail มี lines + ชื่อสินค้า", !!det && JSON.stringify(det).includes("น้ำยาสระผม"), "มีชื่อ", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["poLine", "purchaseOrder", "supplier", "invMovement", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Procurement =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
