// QC — Multi-warehouse (WO-0037) · Fable oracle, Builder ห้ามแตะ · สเปค: docs/sds/modules/inventory.md
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/modules/inventory/service.ts (เพิ่มจากของเดิม — ห้ามทำ regression qc-inventory 12 ข้อ + qc-procurement):
//   ensureDefaultLocation(ctx) → { id } — get-or-create InvLocation isDefault ชื่อ "คลังหลัก" (race-safe: unique [systemId,name] + catch P2002 → refind)
//   createLocation(ctx, { name }) → { id } — ชื่อว่าง/ซ้ำ → throw ไทย
//   listLocations(ctx) → active (archivedAt null) เรียง default ก่อน
//   receive/consume(ctx, { ..., locationId? }) — locationId ไม่ส่ง = คลัง default
//     · lazy migration ต่อ item: ครั้งแรกที่ item ถูกแตะยุค multi-warehouse (ยังไม่มีแถว InvLocationStock ของ item นี้)
//       → seed แถวคลัง default ด้วย onHand ปัจจุบัน "ก่อน" apply delta — invariant: sum(InvLocationStock ของ item) == InvItem.onHand เสมอ
//     · movement row บันทึก locationId ที่ใช้จริง · InvItem.onHand ยังเป็นยอดรวมทุกคลัง (ของเดิมห้ามเพี้ยน)
//   transfer(ctx, { itemId, fromLocationId, toLocationId, qty, idempotencyKey, note? }) → { ok: boolean }
//     · qty ≤ 0 → throw · from == to → throw
//     · atomic tx: movement คู่ type TRANSFER (ขาออก qtyDelta -qty @from · ขาเข้า +qty @to · idempotencyKey `<key>-out` / `<key>-in`)
//     · InvItem.onHand ไม่เปลี่ยน · stock ต่อคลังย้ายตามจริง · ยิงซ้ำ key เดิม → ไม่ทำซ้ำ (ok:false)
//     · โอนจนคลังต้นทางติดลบ → ยอม (นโยบายเดิม) + needsReview=true ที่ movement ขาออก
//   onHandByLocation(ctx, itemId) → [{ locationId, name, onHand }] (รวม default · เฉพาะแถวที่มี)
//   adjust(ctx, { ..., locationId? }) — เดินเรื่องเดียวกับ receive/consume (คลัง default ถ้าไม่ส่ง)
// procurement.ts: receivePo(ctx, poId, opts?: { locationId?: string }) — ส่งต่อไป receive ทุก line (default = คลังหลัก)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = "";
try {
  const svc = (await import("@/lib/modules/inventory/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด (standalone-typesafe)
  const proc = (await import("@/lib/modules/inventory/procurement" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  if (!svc || typeof svc.ensureDefaultLocation !== "function") { chk("WH-0", "service.ts มี ensureDefaultLocation", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC WH", slug: `qc-wh-${Date.now()}` } }); tid = t.id;
    const s = await sys.createSystem(tid, "INVENTORY", "คลัง"); const ctx = { tenantId: tid, systemId: s.id };

    // 1) locations
    const d1 = await svc.ensureDefaultLocation(ctx);
    const d2 = await svc.ensureDefaultLocation(ctx);
    chk("WH-1.1", "ensureDefaultLocation idempotent (id เดิม + isDefault)", d1.id === d2.id && (await prisma.invLocation.findUnique({ where: { id: d1.id as string } }))?.isDefault === true, "id เดิม", "?");
    const locB = await svc.createLocation(ctx, { name: "คลังสาขา B" });
    let threw = false; try { await svc.createLocation(ctx, { name: "คลังสาขา B" }); } catch { threw = true; }
    chk("WH-1.2", "createLocation ชื่อซ้ำ → throw", threw, "throw", "?");
    chk("WH-1.3", "listLocations = 2 (default ก่อน)", await (async () => { const l = (await svc.listLocations(ctx)) as { id: string; isDefault: boolean }[]; return l.length === 2 && l[0].isDefault === true; })(), "2/default ก่อน", "?");

    // 2) lazy migration + receive ต่อคลัง
    const it = await svc.createItem(ctx, { sku: "WH-01", name: "น้ำดื่ม", reorderPoint: 2 });
    const itemId = it.id as string;
    await prisma.invItem.update({ where: { id: itemId }, data: { onHand: 7 } }); // จำลอง item ยุคเก่า (มีสต็อกก่อน multi-warehouse)
    await svc.receive(ctx, { itemId, qty: 3, costSatang: 1000, idempotencyKey: "wh-rc-1" });
    const sumStock = async () => (await prisma.invLocationStock.findMany({ where: { itemId } })).reduce((a, r) => a + r.onHand, 0);
    const stockAt = async (lid: string) => (await prisma.invLocationStock.findFirst({ where: { itemId, locationId: lid } }))?.onHand ?? 0;
    const itemOnHand = async () => (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand ?? -999;
    chk("WH-2.1", "lazy seed: legacy 7 + รับ 3 → default 10 · invariant sum==onHand", (await stockAt(d1.id as string)) === 10 && (await itemOnHand()) === 10 && (await sumStock()) === 10, "10/10/10", `${await stockAt(d1.id as string)}/${await itemOnHand()}/${await sumStock()}`);
    await svc.receive(ctx, { itemId, qty: 5, costSatang: 1000, idempotencyKey: "wh-rc-2", locationId: locB.id });
    chk("WH-2.2", "รับ 5 เข้าคลัง B → B=5 default=10 รวม 15", (await stockAt(locB.id as string)) === 5 && (await stockAt(d1.id as string)) === 10 && (await itemOnHand()) === 15, "5/10/15", `${await stockAt(locB.id as string)}/${await stockAt(d1.id as string)}/${await itemOnHand()}`);
    chk("WH-2.3", "movement บันทึก locationId", (await prisma.invMovement.findFirst({ where: { tenantId: tid, idempotencyKey: "wh-rc-2" } }))?.locationId === locB.id, "B", "?");

    // 3) transfer
    const tr = await svc.transfer(ctx, { itemId, fromLocationId: d1.id, toLocationId: locB.id, qty: 4, idempotencyKey: "wh-tf-1" });
    chk("WH-3.1", "โอน 4 default→B → 6/9 รวมเดิม 15 + movement TRANSFER คู่", tr.ok === true && (await stockAt(d1.id as string)) === 6 && (await stockAt(locB.id as string)) === 9 && (await itemOnHand()) === 15 && (await prisma.invMovement.count({ where: { tenantId: tid, type: "TRANSFER" } })) === 2, "6/9/15/2", `${await stockAt(d1.id as string)}/${await stockAt(locB.id as string)}/${await itemOnHand()}/${await prisma.invMovement.count({ where: { tenantId: tid, type: "TRANSFER" } })}`);
    const tr2 = await svc.transfer(ctx, { itemId, fromLocationId: d1.id, toLocationId: locB.id, qty: 4, idempotencyKey: "wh-tf-1" });
    chk("WH-3.2", "โอนซ้ำ key เดิม → ไม่ทำซ้ำ (ยัง 6/9)", tr2.ok === false && (await stockAt(d1.id as string)) === 6 && (await stockAt(locB.id as string)) === 9, "6/9", "?");
    let th1 = false; try { await svc.transfer(ctx, { itemId, fromLocationId: d1.id, toLocationId: d1.id, qty: 1, idempotencyKey: "wh-tf-x" }); } catch { th1 = true; }
    let th2 = false; try { await svc.transfer(ctx, { itemId, fromLocationId: d1.id, toLocationId: locB.id, qty: 0, idempotencyKey: "wh-tf-y" }); } catch { th2 = true; }
    chk("WH-3.3", "โอนคลังเดียวกัน/qty 0 → throw ทั้งคู่", th1 && th2, "throw", `${th1}/${th2}`);

    // 4) consume ต่อคลัง
    await svc.consume(ctx, { itemId, qty: 2, sourceModule: "POS", refType: "PosSale", refId: "z", idempotencyKey: "wh-cs-1", locationId: locB.id });
    chk("WH-4.1", "ตัด 2 จาก B → B=7 รวม 13", (await stockAt(locB.id as string)) === 7 && (await itemOnHand()) === 13, "7/13", `${await stockAt(locB.id as string)}/${await itemOnHand()}`);
    await svc.consume(ctx, { itemId, qty: 1, idempotencyKey: "wh-cs-2" });
    chk("WH-4.2", "ตัด 1 ไม่ระบุคลัง → default=5 รวม 12", (await stockAt(d1.id as string)) === 5 && (await itemOnHand()) === 12, "5/12", `${await stockAt(d1.id as string)}/${await itemOnHand()}`);
    const byLoc = (await svc.onHandByLocation(ctx, itemId)) as { locationId: string; name: string; onHand: number }[];
    chk("WH-4.3", "onHandByLocation ครบ 2 คลัง sum==12", byLoc.length === 2 && byLoc.reduce((a, r) => a + r.onHand, 0) === 12 && byLoc.every((r) => typeof r.name === "string"), "2 แถว sum 12", JSON.stringify(byLoc).slice(0, 80));

    // 5) โอนจนติดลบ → ยอม + needsReview (นโยบายเดิม)
    await svc.transfer(ctx, { itemId, fromLocationId: locB.id, toLocationId: d1.id, qty: 100, idempotencyKey: "wh-tf-2" });
    chk("WH-5.1", "โอนเกิน → B=-93 default=105 รวมเดิม 12 + needsReview ขาออก", (await stockAt(locB.id as string)) === -93 && (await stockAt(d1.id as string)) === 105 && (await itemOnHand()) === 12 && (await prisma.invMovement.findFirst({ where: { tenantId: tid, idempotencyKey: "wh-tf-2-out" } }))?.needsReview === true, "-93/105/12/review", `${await stockAt(locB.id as string)}/${await stockAt(d1.id as string)}/${await itemOnHand()}`);

    // 6) PO รับเข้าเลือกคลัง
    if (!proc) { chk("WH-6.0", "มี procurement.ts", false, "มี", "import ไม่ได้"); }
    else {
      const sup = await proc.createSupplier(ctx, { name: "ผู้ขาย WH" });
      const po = await proc.createPo(ctx, { supplierId: sup.id, lines: [{ itemId, qty: 6, costSatang: 900 }] });
      await proc.markOrdered(ctx, po.id);
      const rc = await proc.receivePo(ctx, po.id, { locationId: locB.id });
      chk("WH-6.1", "receivePo เข้าคลัง B → B=-87 รวม 18 · invariant คง", rc.ok === true && (await stockAt(locB.id as string)) === -87 && (await itemOnHand()) === 18 && (await sumStock()) === 18, "-87/18/18", `${await stockAt(locB.id as string)}/${await itemOnHand()}/${await sumStock()}`);
    }

    // 7) tenant isolation
    chk("WH-7.1", "tenant อื่นไม่เห็น location (guard)", await (async () => { const t2 = await prisma.tenant.create({ data: { name: "QC WH2", slug: `qc-wh2-${Date.now()}` } }); const s2 = await sys.createSystem(t2.id, "INVENTORY", "คลัง2"); const l = (await svc.listLocations({ tenantId: t2.id, systemId: s2.id })) as unknown[]; await prisma.appSystemUnit.deleteMany({ where: { tenantId: t2.id } }); await prisma.appSystem.deleteMany({ where: { tenantId: t2.id } }); await prisma.businessUnit.deleteMany({ where: { tenantId: t2.id } }); await prisma.tenant.delete({ where: { id: t2.id } }); return l.length === 0; })(), "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["invMovement", "invLocationStock", "invLocation", "poLine", "purchaseOrder", "supplier", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Multi-warehouse =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
