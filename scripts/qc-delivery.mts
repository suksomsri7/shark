// QC — Delivery โครง (WO-0060) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
//   src/lib/delivery/adapters.ts: DeliveryAdapter { key, label(ไทย), manualTracking: boolean } + ADAPTERS registry
//     · v1 มี "MANUAL" (ร้านส่งเอง/กรอกเลขพัสดุ) — โครง adapter รอเจ้าจริง (flash/kerry) อนาคต
//   src/lib/delivery/service.ts (ctx {tenantId, unitId}):
//     createShipment(ctx, { orderId, provider, trackingNo?, note? }) → {id}
//       · order ต้องอยู่ unit นี้ + status PAID เท่านั้น (อื่น throw ไทย) · provider ไม่อยู่ใน ADAPTERS → throw
//       · order ละ 1 shipment (unique orderId — ซ้ำ throw ไทย)
//     updateShipment(ctx, shipmentId, { status?, trackingNo?, note? }) → boolean — สถานะเดิน PREPARING→SHIPPED→DELIVERED (ย้อน/ข้ามได้ v1 ไม่บังคับ แต่ CANCELLED แล้วห้ามแก้ → false)
//     getShipmentForOrder(ctx, orderId) → shipment | null
//   ฝั่ง public: หน้า /s/.../shop/order/[code] แสดงสถานะจัดส่ง + เลขพัสดุ เมื่อมี shipment (แก้หน้าเดิม — shop.getOrderByCode ฝั่ง shop ห้ามแตะ signature · ดึง shipment แยกใน page)
//   UI ฝั่งร้าน: หน้า orders ของ shop เพิ่มปุ่ม "จัดส่ง" (เลือก provider+เลขพัสดุ) + อัปเดตสถานะ · actions assertCan delivery.shipment.*
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = "";
try {
  const ad = (await import("@/lib/delivery/adapters" as string).catch(() => null)) as { ADAPTERS: Record<string, { key: string; label: string }> } | null;
  const dv = (await import("@/lib/delivery/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!ad || !dv) { chk("DV-0", "มี delivery/adapters+service", false, "มี", "ยังไม่สร้าง"); }
  else {
    chk("DV-1.1", "ADAPTERS มี MANUAL ป้ายไทย", !!ad.ADAPTERS.MANUAL && /[ก-๙]/.test(ad.ADAPTERS.MANUAL.label), "มี", JSON.stringify(Object.keys(ad.ADAPTERS)));
    const t = await prisma.tenant.create({ data: { name: "QC DLV", slug: `qc-dlv-${Date.now()}` } }); tid = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ร้าน", slug: `dlv-${Date.now()}` } });
    await sys.createSystem(tid, "POS", "ขาย");
    const shop = (await import("@/lib/modules/shop/service")) as unknown as { createProduct: (c: unknown, i: unknown) => Promise<{ id: string }>; createOrder: (c: unknown, i: unknown) => Promise<{ id: string; code: string }>; confirmOrderPaid: (c: unknown, id: string) => Promise<unknown> };
    const ctx = { tenantId: tid, unitId: unit.id };
    const p = await shop.createProduct(ctx, { name: "ของส่ง", priceSatang: 10000 });
    const od = await shop.createOrder(ctx, { customerName: "ก", customerPhone: "1", lines: [{ productId: p.id, qty: 1 }] });
    let thPending = false; try { await dv.createShipment(ctx, { orderId: od.id, provider: "MANUAL" }); } catch { thPending = true; }
    chk("DV-2.1", "order ยัง PENDING_PAYMENT → สร้าง shipment ไม่ได้ (throw ไทย)", thPending, "throw", "?");
    await shop.confirmOrderPaid(ctx, od.id);
    let thProv = false; try { await dv.createShipment(ctx, { orderId: od.id, provider: "FLASH" }); } catch { thProv = true; }
    chk("DV-2.2", "provider นอก registry → throw", thProv, "throw", "?");
    const sh = await dv.createShipment(ctx, { orderId: od.id, provider: "MANUAL", trackingNo: "TH123456789" });
    chk("DV-2.3", "สร้าง shipment สำเร็จ (PREPARING + tracking)", !!sh.id && (await prisma.shipment.findUnique({ where: { orderId: od.id as string } }))?.status === "PREPARING", "PREPARING", "?");
    let thDup = false; try { await dv.createShipment(ctx, { orderId: od.id, provider: "MANUAL" }); } catch { thDup = true; }
    chk("DV-2.4", "order ละ 1 shipment — ซ้ำ throw", thDup, "throw", "?");
    chk("DV-3.1", "อัปเดต SHIPPED→DELIVERED ได้", (await dv.updateShipment(ctx, sh.id, { status: "SHIPPED" })) === true && (await dv.updateShipment(ctx, sh.id, { status: "DELIVERED" })) === true && (await prisma.shipment.findUnique({ where: { id: sh.id as string } }))?.status === "DELIVERED", "DELIVERED", "?");
    chk("DV-3.2", "getShipmentForOrder เจอ + order อื่น null", ((await dv.getShipmentForOrder(ctx, od.id)) as { id?: string })?.id === sh.id && (await dv.getShipmentForOrder(ctx, "no-such")) === null, "เจอ/null", "?");
    const pageSrc = (await import("node:fs")).readFileSync("src/app/(store)/s/[tenantSlug]/[unitSlug]/shop/order/[code]/page.tsx", "utf8");
    chk("DV-4.1", "หน้า public order แสดงข้อมูลจัดส่ง (อ้าง shipment)", /[Ss]hipment|จัดส่ง/.test(pageSrc), "มี", "?", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["shipment", "shopOrderLine", "shopOrder", "shopProduct", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Delivery =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
