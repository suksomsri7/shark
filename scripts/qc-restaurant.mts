process.loadEnvFile(".env"); try { process.loadEnvFile(".env.local"); } catch {}
const { prisma } = await import("@/lib/core/db");
const menu = await import("@/lib/modules/restaurant/menu");
const table = await import("@/lib/modules/restaurant/table");
const order = await import("@/lib/modules/restaurant/order");
const kds = await import("@/lib/modules/restaurant/kds");
const out: string[] = [];
const ok = (n: string) => out.push("  ✅ " + n);
const bad = (n: string, e: unknown) => out.push("  ❌ " + n + " — " + (e instanceof Error ? e.message : String(e)));
let tenantId = ""; let unitId = "";
try {
  const t = await prisma.tenant.create({ data: { name: "RQC", slug: "rqc-" + Date.now() } }); tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "RESTAURANT", name: "ครัว QC", slug: "kqc-" + Date.now() } }); unitId = unit.id;
  const ctx = [tenantId, unitId] as const;
  try {
    await menu.ensureDefaultStations(...ctx);
    const stations = await menu.listStations(...ctx);
    const cat = await menu.createCategory(...ctx, { name: "อาหารจานเดียว" });
    if (!cat.ok) throw new Error("cat: " + cat.reason);
    const it = await menu.createItem(...ctx, { categoryId: cat.id, stationId: stations[0].id, name: "ข้าวกะเพรา", basePrice: 6000 });
    if (!it.ok) throw new Error("item: " + it.reason);
    ok(`เมนู: ${stations.length} สถานี KDS + หมวด + เมนู "ข้าวกะเพรา" ฿60`);

    const zone = await table.createZone(...ctx, "โซนหน้าร้าน");
    if (!zone.ok) throw new Error("zone");
    const tb = await table.createTable(...ctx, { zoneId: zone.id, name: "A1", seats: 4 });
    if (!tb.ok) throw new Error("table");
    ok(`โต๊ะ: โซน + โต๊ะ A1 (qrToken ${tb.qrToken.slice(0, 6)}…)`);

    const sess = await table.openSession(...ctx, tb.id, { guestCount: 2 });
    if (!sess.ok) throw new Error("session: " + sess.reason);
    // เปิดซ้ำ = ได้ session เดิม (partial unique)
    const sess2 = await table.openSession(...ctx, tb.id);
    if (!sess2.ok || sess2.id !== sess.id || sess2.created) throw new Error("เปิดโต๊ะซ้ำต้องได้ session เดิม");
    ok(`เปิดโต๊ะ: session เดียว/โต๊ะ (กันเปิดซ้ำ ✓)`);

    const ord = await order.createOrder({ tenantId, unitId, type: "DINE_IN", sessionId: sess.id, cart: [{ menuItemId: it.id, qty: 2, choiceIds: [] }], placedByUserId: "staff-qc" });
    if (!ord.ok) throw new Error("order: " + JSON.stringify(ord.err));
    ok(`สั่งอาหาร: ออเดอร์ #${ord.dailyNo} ข้าวกะเพรา×2`);

    // KDS: station queue → advance ทุก item จนเสร็จ
    const q = await kds.stationQueue(tenantId, unitId, stations[0].id);
    const items = await prisma.restaurantOrderItem.findMany({ where: { tenantId, unitId } });
    for (const oi of items) { await kds.advanceItem(tenantId, unitId, oi.id); await kds.advanceItem(tenantId, unitId, oi.id); }
    ok(`KDS: คิว ${q.length ?? 0} + advance รายการจนเสร็จ`);

    // checkout (ไม่ผูก POS → fallback ปิดโต๊ะ)
    const co = await order.checkout({ tenantId, unitId, sessionId: sess.id, payMethod: "CASH" });
    if (!co.ok) throw new Error("checkout: " + co.reason);
    const doc = await prisma.tableSession.findUnique({ where: { id: sess.id } });
    if (doc?.status !== "CLOSED") throw new Error("ปิดโต๊ะแล้ว status ต้อง CLOSED: " + doc?.status);
    ok(`เช็คบิล: ยอด ฿${(co.totalSatang / 100).toFixed(2)} + ปิดโต๊ะ (fallback ไม่ผูก POS) ✓`);
  } catch (e) { bad("dine-in loop", e); }
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tenantId) {
    for (const m of ["restaurantOrderItemOption","restaurantOrderItem","restaurantOrder","restaurantServiceRequest","tableSession","restaurantTable","restaurantZone","menuItemOptionGroup","menuOptionChoice","menuOptionGroup","menuItem","menuCategory","kdsStation","restaurantDailyCounter","restaurantSetting"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
}
console.log("\n===== QC Restaurant P1 (dine-in loop, Neon) =====\n" + out.join("\n"));
const failed = out.filter((l) => l.includes("❌")).length;
console.log(`\n${failed === 0 ? "🎉 Restaurant dine-in loop ผ่าน" : "⚠️ ล้ม " + failed}\n`);
await prisma.$disconnect(); process.exit(failed === 0 ? 0 : 1);
