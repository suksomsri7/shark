// QC — Inventory: สต็อกกลาง + movement ledger (contract C-1) · Fable oracle, Builder ห้ามแตะ
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const rules = await import("@/lib/modules/inventory/rules");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
// RULES
chk("IV-R.1", "moving avg (10@100 + 10@200 = 150)", rules.movingAvgCost(10, 10000, 10, 20000) === 15000, "15000", String(rules.movingAvgCost(10, 10000, 10, 20000)));
chk("IV-R.2", "needsReorder (onHand 3 ≤ RP 5)", rules.needsReorder(3, 5) && !rules.needsReorder(9, 5), "true/false", "?");
chk("IV-R.3", "isNegative (-2)", rules.isNegative(-2) && !rules.isNegative(0), "true", "?");
let tid = "";
try {
  const svc = await import("@/lib/modules/inventory/service" as string).catch(() => null);
  const t = await prisma.tenant.create({ data: { name: "QC INV", slug: `qc-inv-${Date.now()}` } }); tid = t.id;
  const s = await sys.createSystem(tid, "INVENTORY", "คลัง"); const ctx = { tenantId: tid, systemId: s.id };
  if (!svc) { chk("IV-0", "มี inventory/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const it = await svc.createItem(ctx, { sku: "SH-01", name: "แชมพู", reorderPoint: 5 });
    const itemId = (it as { id?: string }).id ?? "";
    chk("IV-1.1", "สร้าง item onHand 0", (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand === 0, "0", "?");
    await svc.receive(ctx, { itemId, qty: 20, costSatang: 5000, idempotencyKey: "rc-1" });
    chk("IV-2.1", "รับเข้า 20 → onHand 20", (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand === 20, "20", String((await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand));
    chk("IV-2.2", "movement มี balanceAfter 20", (await prisma.invMovement.findFirst({ where: { systemId: s.id, type: "IN" } }))?.balanceAfter === 20, "20", "?");
    await svc.receive(ctx, { itemId, qty: 20, costSatang: 5000, idempotencyKey: "rc-1" });
    chk("IV-3.1", "รับซ้ำ idempotencyKey เดิม → ไม่เพิ่ม (ยัง 20)", (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand === 20, "20", String((await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand));
    await svc.consume(ctx, { itemId, qty: 3, sourceModule: "POS", refType: "PosSale", refId: "x", idempotencyKey: "cs-1" });
    chk("IV-4.1", "ตัดออก 3 → onHand 17", (await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand === 17, "17", String((await prisma.invItem.findUnique({ where: { id: itemId } }))?.onHand));
    const oh = await svc.onHand(ctx, [itemId]);
    chk("IV-4.2", "onHand() อ่านได้ = 17", Array.isArray(oh) && (oh[0] as { onHand?: number })?.onHand === 17, "17", JSON.stringify(oh).slice(0, 40));
    await svc.consume(ctx, { itemId, qty: 100, sourceModule: "POS", refType: "PosSale", refId: "y", idempotencyKey: "cs-2" });
    const neg = await prisma.invItem.findUnique({ where: { id: itemId } });
    chk("IV-5.1", "ตัดเกินสต็อก → ยอมติดลบ (-83) ไม่ throw", neg?.onHand === -83, "-83", String(neg?.onHand));
    chk("IV-5.2", "movement ติดลบตั้งธง needsReview", (await prisma.invMovement.findFirst({ where: { systemId: s.id, idempotencyKey: "cs-2" } }))?.needsReview === true, "true", "?");
    const low = await svc.lowStock(ctx);
    chk("IV-6.1", "lowStock: ติดลบ ≤ RP → เข้ารายการเตือน", Array.isArray(low) && low.length >= 1, "≥1", String((low as unknown[])?.length));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 120) : String(e)); }
finally { if (tid) { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const m of ["invMovement", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
  await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect(); }
const f = cks.filter((c) => !c.ok); console.log(`\n===== QC Inventory =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) }));
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
