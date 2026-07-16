// QC — Lot/Expiry/Barcode (WO-0038) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา (schema มีแล้ว: InvLot unique [itemId,lotCode] + InvMovement.lotCode?):
// src/lib/modules/inventory/service.ts เพิ่ม:
//   receive(ctx, {..., lotCode?, expiryDate?}) — ระบุ lot → get-or-create InvLot (itemId,lotCode) แล้ว onHand ของ lot += qty
//     · expiryDate ส่งมา → ตั้งให้ lot (lot เดิมที่ยังไม่มีวันหมดอายุก็เติมได้) · movement บันทึก lotCode
//     · ไม่ระบุ lot → พฤติกรรมเดิมเป๊ะ ไม่แตะ InvLot (qc-inventory/qc-warehouse ห้าม regress)
//   consume(ctx, {..., lotCode?}) — ระบุ lot → lot.onHand -= qty (ติดลบยอม + needsReview ตามนโยบายเดิม) · movement บันทึก lotCode
//   itemLots(ctx, itemId) → InvLot[] ของ item เรียง expiryDate ใกล้ก่อน (null ท้ายสุด)
//   findItemByBarcode(ctx, barcode) → item | null (เทียบตรง InvItem.barcode)
//   expiringLots(ctx, { withinDays }) → lot ที่ onHand > 0 และมี expiryDate ≤ now+withinDays (รวมที่หมดแล้ว) เรียง expiryDate
//   sweepExpiringLots(now?: Date) → number — วนทุก tenant ACTIVE ที่มีระบบ INVENTORY (cap 50):
//     เจอ lot ใกล้หมดอายุ (7 วัน) → AppNotification 1 ฉบับ/ร้าน/วัน (title "สินค้าใกล้หมดอายุ" · body ไทยระบุชื่อสินค้า+lot)
//     + emitOutbox "inventory.lot.expiring" (payload มี lots) · idempotent ต่อวัน BKK: รันซ้ำวันเดิม → ไม่สร้างซ้ำ คืน 0 สำหรับร้านนั้น
//   cron: runDailyCron เพิ่ม field lotsExpiring (try/catch → -1 แบบ field อื่น — ของเดิมห้ามหาย)
//   automation: AUTOMATION_EVENTS เพิ่ม { value: "inventory.lot.expiring", label: ไทย } (จุดต่อ Automation กติกาแจ้งเตือน/webhook)
//   UI: ฟอร์มรับเข้า มีช่อง lot+วันหมดอายุ (ไม่บังคับ) · หน้า item ดู lot คงเหลือ · ช่องค้นหาด้วยบาร์โค้ด
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const DAY = 86400000;

let tid = "";
try {
  const svc = (await import("@/lib/modules/inventory/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> }; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (typeof svc.itemLots !== "function" || typeof svc.sweepExpiringLots !== "function") { chk("LOT-0", "service มี itemLots/sweepExpiringLots", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC LOT", slug: `qc-lot-${Date.now()}` } }); tid = t.id;
    const s = await sys.createSystem(tid, "INVENTORY", "คลัง"); const ctx = { tenantId: tid, systemId: s.id };
    const it = await svc.createItem(ctx, { sku: "LOT-01", name: "นมกล่อง", barcode: "8850001112223", reorderPoint: 0 });
    const itemId = it.id as string;

    // 1) receive ระบุ lot
    const soon = new Date(Date.now() + 3 * DAY); const far = new Date(Date.now() + 60 * DAY);
    await svc.receive(ctx, { itemId, qty: 10, costSatang: 1000, idempotencyKey: "lt-rc-1", lotCode: "L-A", expiryDate: soon });
    const lotA = await prisma.invLot.findFirst({ where: { itemId, lotCode: "L-A" } });
    chk("LOT-1.1", "รับเข้า lot L-A 10 → InvLot เกิด onHand 10 + expiry + movement.lotCode", lotA?.onHand === 10 && !!lotA?.expiryDate && (await prisma.invMovement.findFirst({ where: { tenantId: tid, idempotencyKey: "lt-rc-1" } }))?.lotCode === "L-A", "10+expiry", `${lotA?.onHand}`);
    await svc.receive(ctx, { itemId, qty: 5, costSatang: 1000, idempotencyKey: "lt-rc-2", lotCode: "L-A" });
    chk("LOT-1.2", "รับ lot เดิมซ้ำ → สะสม 15 ไม่เกิดแถวใหม่", (await prisma.invLot.count({ where: { itemId } })) === 1 && (await prisma.invLot.findFirst({ where: { itemId, lotCode: "L-A" } }))?.onHand === 15, "15/1แถว", "?");
    await svc.receive(ctx, { itemId, qty: 8, costSatang: 1000, idempotencyKey: "lt-rc-3", lotCode: "L-B", expiryDate: far });
    await svc.receive(ctx, { itemId, qty: 7, costSatang: 1000, idempotencyKey: "lt-rc-4" });
    chk("LOT-1.3", "รับไม่ระบุ lot → ไม่แตะ InvLot (ยัง 2 lot รวม 23) + item.onHand รวม 30", (await prisma.invLot.count({ where: { itemId } })) === 2 && (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand === 30, "2 lot/30", "?");

    // 2) consume ระบุ lot
    await svc.consume(ctx, { itemId, qty: 4, idempotencyKey: "lt-cs-1", lotCode: "L-A" });
    chk("LOT-2.1", "ตัด 4 จาก L-A → lot 11 + item 26", (await prisma.invLot.findFirst({ where: { itemId, lotCode: "L-A" } }))?.onHand === 11 && (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand === 26, "11/26", "?");
    await svc.consume(ctx, { itemId, qty: 20, idempotencyKey: "lt-cs-2", lotCode: "L-B" });
    chk("LOT-2.2", "ตัดเกิน lot L-B → ติดลบ -12 + movement needsReview", (await prisma.invLot.findFirst({ where: { itemId, lotCode: "L-B" } }))?.onHand === -12 && (await prisma.invMovement.findFirst({ where: { tenantId: tid, idempotencyKey: "lt-cs-2" } }))?.needsReview === true, "-12+review", "?");

    // 3) barcode + itemLots
    chk("LOT-3.1", "findItemByBarcode เจอ + ไม่เจอคืน null", ((await svc.findItemByBarcode(ctx, "8850001112223")) as { id?: string })?.id === itemId && (await svc.findItemByBarcode(ctx, "0000000000000")) === null, "เจอ/null", "?");
    const lots = (await svc.itemLots(ctx, itemId)) as { lotCode: string }[];
    chk("LOT-3.2", "itemLots เรียง expiry ใกล้ก่อน (L-A ก่อน L-B)", lots.length === 2 && lots[0].lotCode === "L-A" && lots[1].lotCode === "L-B", "A,B", JSON.stringify(lots.map((l) => l.lotCode)));

    // 4) expiringLots
    const ex = (await svc.expiringLots(ctx, { withinDays: 7 })) as { lotCode: string }[];
    chk("LOT-4.1", "expiringLots 7 วัน → เฉพาะ L-A (L-B 60 วัน + L-B ติดลบไม่นับ)", ex.length === 1 && ex[0].lotCode === "L-A", "L-A", JSON.stringify(ex.map((l) => l.lotCode)));

    // 5) sweep + notification + outbox idempotent
    const n1 = await svc.sweepExpiringLots();
    const notiCount = () => prisma.appNotification.count({ where: { tenantId: tid, title: "สินค้าใกล้หมดอายุ" } });
    chk("LOT-5.1", "sweep → AppNotification 1 ฉบับ (body มีชื่อสินค้า) + outbox inventory.lot.expiring", n1 >= 1 && (await notiCount()) === 1 && ((await prisma.appNotification.findFirst({ where: { tenantId: tid, title: "สินค้าใกล้หมดอายุ" } }))?.body ?? "").includes("นมกล่อง") && (await prisma.outboxEvent.count({ where: { tenantId: tid, type: "inventory.lot.expiring" } })) >= 1, "1 ฉบับ+outbox", `n=${n1}`);
    await svc.sweepExpiringLots();
    chk("LOT-5.2", "sweep ซ้ำวันเดิม → idempotent (ยัง 1 ฉบับ)", (await notiCount()) === 1, "1", String(await notiCount()));

    // 6) automation event + cron field
    const labels = (await import("@/lib/automation/labels")) as unknown as { AUTOMATION_EVENTS: { value: string; label: string }[] };
    const evt = labels.AUTOMATION_EVENTS.find((e) => e.value === "inventory.lot.expiring");
    chk("LOT-6.1", "AUTOMATION_EVENTS มี inventory.lot.expiring ป้ายไทย", !!evt && /[ก-๙]/.test(evt.label), "มี", JSON.stringify(evt ?? null));
    const cron = (await import("@/lib/platform/cron")) as unknown as { runDailyCron: (now?: Date) => Promise<Record<string, number>> };
    const res = await cron.runDailyCron();
    chk("LOT-6.2", "runDailyCron มี field lotsExpiring (number) + field เดิมครบ", typeof res.lotsExpiring === "number" && ["subsExpired", "proposalsExpired", "outboxDrained", "tenantsPurged", "weeklyReports"].every((k) => typeof res[k] === "number"), "ครบ", JSON.stringify(Object.keys(res)));

    // 7) isolation
    chk("LOT-7.1", "tenant อื่นไม่เห็น lot (guard)", await (async () => { const t2 = await prisma.tenant.create({ data: { name: "QC LOT2", slug: `qc-lot2-${Date.now()}` } }); const s2 = await sys.createSystem(t2.id, "INVENTORY", "คลัง2"); const l = (await svc.itemLots({ tenantId: t2.id, systemId: s2.id }, itemId)) as unknown[]; await prisma.appSystemUnit.deleteMany({ where: { tenantId: t2.id } }); await prisma.appSystem.deleteMany({ where: { tenantId: t2.id } }); await prisma.businessUnit.deleteMany({ where: { tenantId: t2.id } }); await prisma.tenant.delete({ where: { id: t2.id } }); return l.length === 0; })(), "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["invMovement", "invLot", "invLocationStock", "invLocation", "invItem", "appNotification", "outboxEvent", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Lot/Expiry/Barcode =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
