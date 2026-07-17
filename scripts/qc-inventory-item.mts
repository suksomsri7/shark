// QC — Inventory: แก้ไข / ปิดการใช้งานสินค้า (CRUD) · Fable oracle (Builder ห้ามแตะ)
// สัญญา src/lib/modules/inventory/service.ts (ctx {tenantId, systemId} — system-scoped):
//   updateItem(ctx, itemId, { name?, sku?, barcode?, category?, unitLabel?, reorderPoint? })
//     · แก้เฉพาะ field ที่ตั้ง · ห้ามแตะ onHand/costSatang (ledger-derived) · name ว่าง/sku ซ้ำ → throw ไทย
//   archiveItem(ctx, itemId) → soft-delete (archivedAt) · ไม่โผล่ listItems · movement history คงอยู่
//   updateItem/archiveItem ข้ามร้าน (systemId อื่น) → throw (ไม่พบสินค้า)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`);
};
const item = (id: string) => prisma.invItem.findUnique({ where: { id } });

let tid = "";
try {
  const svc = (await import("@/lib/modules/inventory/service" as string)) as {
    [k: string]: (...a: any[]) => Promise<any>;
  };
  const t = await prisma.tenant.create({ data: { name: "QC INV ITEM", slug: `qc-inv-item-${Date.now()}` } });
  tid = t.id;
  const sA = await sys.createSystem(tid, "INVENTORY", "คลัง A");
  const sB = await sys.createSystem(tid, "INVENTORY", "คลัง B");
  const ctx = { tenantId: tid, systemId: sA.id };
  const ctxB = { tenantId: tid, systemId: sB.id };

  // สร้าง + รับเข้า → onHand/costSatang มีค่าจริง (ต้องไม่เปลี่ยนหลัง updateItem)
  const it = await svc.createItem(ctx, { sku: "SH-01", name: "แชมพู", barcode: "111", reorderPoint: 5 });
  const id = it.id as string;
  await svc.receive(ctx, { itemId: id, qty: 20, costSatang: 5000, idempotencyKey: "rc-item-1" });
  const before = await item(id);

  // ── II-1: updateItem แก้ชื่อ/บาร์โค้ด/จุดสั่งซื้อ สำเร็จ · onHand/costSatang ไม่เปลี่ยน ──
  await svc.updateItem(ctx, id, { name: "แชมพูใหม่", barcode: "999", reorderPoint: 8, category: "ของใช้" });
  const after = await item(id);
  chk("II-1.1", "แก้ชื่อ/บาร์โค้ด/จุดสั่งซื้อ/หมวด สำเร็จ",
    after?.name === "แชมพูใหม่" && after?.barcode === "999" && after?.reorderPoint === 8 && after?.category === "ของใช้");
  chk("II-1.2", `onHand/costSatang ไม่เปลี่ยน (onHand ${after?.onHand} cost ${after?.costSatang})`,
    after?.onHand === before?.onHand && after?.onHand === 20 && after?.costSatang === before?.costSatang && after?.costSatang === 5000);

  // ── II-1.3: แก้ SKU สำเร็จ ──
  await svc.updateItem(ctx, id, { sku: "SH-99" });
  chk("II-1.3", "แก้ SKU สำเร็จ", (await item(id))?.sku === "SH-99");

  // ── II-1.4: name ว่าง → throw · sku ซ้ำในระบบ → throw ──
  const it2 = await svc.createItem(ctx, { sku: "SH-02", name: "สบู่" });
  let nameThrew = false;
  try { await svc.updateItem(ctx, id, { name: "  " }); } catch { nameThrew = true; }
  let dupThrew = false;
  try { await svc.updateItem(ctx, id, { sku: "SH-02" }); } catch { dupThrew = true; } // ชนกับ it2
  chk("II-1.4", "name ว่าง → throw · sku ซ้ำ → throw", nameThrew && dupThrew);
  chk("II-1.5", "หลัง throw ข้อมูลเดิมคงอยู่ (sku ยัง SH-99)", (await item(id))?.sku === "SH-99");
  void it2;

  // ── II-2: archiveItem → ไม่โผล่ listItems · movement history คงอยู่ ──
  const mvBefore = await prisma.invMovement.count({ where: { systemId: sA.id, itemId: id } });
  await svc.archiveItem(ctx, id);
  const listed = (await svc.listItems(ctx)) as { id: string }[];
  chk("II-2.1", "archiveItem → ไม่โผล่ listItems", !listed.some((x) => x.id === id));
  chk("II-2.2", "archivedAt ถูกตั้ง", (await item(id))?.archivedAt != null);
  const mvAfter = await prisma.invMovement.count({ where: { systemId: sA.id, itemId: id } });
  chk("II-2.3", `ประวัติ movement คงอยู่ (${mvBefore} → ${mvAfter})`, mvAfter === mvBefore && mvAfter >= 1);

  // ── II-2.4: unarchive → กลับมาโผล่ ──
  if (svc.unarchiveItem) {
    await svc.unarchiveItem(ctx, id);
    const relisted = (await svc.listItems(ctx)) as { id: string }[];
    chk("II-2.4", "unarchive → กลับมาโผล่ listItems", relisted.some((x) => x.id === id));
  }

  // ── II-3: ข้ามร้าน (systemId อื่น) — update/archive → throw (ไม่พบ) · ของเดิมไม่ถูกแตะ ──
  let crossUpd = false;
  try { await svc.updateItem(ctxB, id, { name: "โดนแฮก" }); } catch { crossUpd = true; }
  let crossArc = false;
  try { await svc.archiveItem(ctxB, id); } catch { crossArc = true; }
  chk("II-3.1", "update/archive ข้ามร้าน → throw (ปฏิเสธ)", crossUpd && crossArc);
  chk("II-3.2", "ของร้านเดิมไม่ถูกแตะ (ชื่อยังไม่ใช่ 'โดนแฮก')", (await item(id))?.name !== "โดนแฮก");
} catch (e) {
  chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 200) : String(e)), false);
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try { await f(); } catch {}
  };
  if (tid) {
    for (const m of ["invMovement", "invLocationStock", "invLocation", "invLot", "invItem", "appSystemUnit", "appSystem"])
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Inventory Item (CRUD) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
