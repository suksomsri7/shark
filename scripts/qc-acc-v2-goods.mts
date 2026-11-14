// QC ACC T5.9 (E14 H4 H5 H6) — รายงานสินค้าและวัตถุดิบ · บันทึกของเสีย/ทำลาย · ของแถม · ถือเป็นขายราคาตลาด
// design note ledger/wo-notes/T5.9.md · ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T5.9 สินค้า" สร้าง/ลบเอง · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-goods.mts
//
// เฉลยมือ (สตางค์ · สินค้า A ผูกคลัง ทุน 10,000/หน่วย ราคาขาย 15,000 · ร้านจด VAT 7%):
//   ก่อนช่วง (ย้อน createdAt เป็นเดือนก่อน): รับ 20 → ยกมา 20 หน่วย 200,000
//   ในช่วง: รับ 10 (100,000) · ขาย POS 4 · เบิกใช้ในกิจการ 1 · ของแถม 2 · ของเสีย 1 · ใช้ส่วนตัว 3 (ยืนยัน) · ขาด 1
//   จ่ายรวม 12 = ขาย 4 · ใช้ในกิจการ 1 · ของแถม 2 · เสีย 1 · ถือเป็นขาย 4 · คงเหลือ 18 หน่วย 180,000
//   สินค้า B ไม่ผูกคลัง → untracked 1 + คำเตือน GOODS_REPORT_UNTRACKED
//   waste log: ของเสีย 1 + ขาด 1 = 2 ใบ · ผู้อนุมัติ = ผู้ทำ (ออกทันทีโดยเจ้าของ) → APPROVER_SAME · ไม่มีพยาน/รูป → EVIDENCE_MISSING "พยาน · รูปถ่าย"
//     บันทึกพยาน + แนบรูปให้ใบของเสีย → เหลือ APPROVER_SAME เท่านั้น
//   ถือเป็นขาย: ใช้ส่วนตัว 3 × 15,000 = 45,000 VAT 3,150 · ขาด 1 × 15,000 = 15,000 VAT 1,050 · รวม VAT 4,200 · ของแถม 1 ใบ ต้นทุน 20,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-goods");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown) => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const KEEP = process.env.KEEP === "1";
const FORBID = /references\/|\.md\b|\[(?:V2|V|S|U)\]|ถูกกฎหมาย/;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const PR: Any = await import("@/lib/modules/account/product" as string);
const GR: Any = await import("@/lib/modules/account/goods-report" as string);
const INV: Any = await import("@/lib/modules/inventory/service" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const TENANT_NAME = "QC T5.9 สินค้า";

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId);
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

const bkk = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
let tid = "";
const users: string[] = [];
try {
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t59-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT", "INVENTORY"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t59-${stamp}@qc.local`, name: "เจ้าของ T5.9" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T5.9")).id;
  const INVS = (await sysSvc.createSystem(tid, "INVENTORY", "คลัง T5.9")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  const invCtx = { tenantId: tid, systemId: INVS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T5.9", vatRegistered: true, vatRateBp: 700, taxId: "0105561000059", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const item = await INV.createItem(invCtx, { sku: "T59-A", name: "สินค้า A T5.9" });
  const prodA = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "สินค้า A T5.9", type: "GOODS", buyPrice: 10_000, salePrice: 15_000, invItemId: item.id, qtyOnHand: 0 } });
  await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "สินค้า B ไม่ผูกคลัง", type: "GOODS", buyPrice: 500 } });
  const r0 = await INV.receive(invCtx, { itemId: item.id, qty: 20, costSatang: 10_000, idempotencyKey: `t59-open-${stamp}`, sourceModule: "procurement" });
  const today = bkk(new Date());
  const from = `${today.slice(0, 7)}-01`;
  const prevMonth = new Date(Date.parse(`${from}T00:00:00+07:00`) - 10 * 86_400_000);
  await prisma.invMovement.updateMany({ where: { id: r0.id }, data: { createdAt: prevMonth } });
  await prisma.accountProduct.updateMany({ where: { id: prodA.id }, data: { qtyOnHand: 20 } });
  await INV.receive(invCtx, { itemId: item.id, qty: 10, costSatang: 10_000, idempotencyKey: `t59-rc-${stamp}`, sourceModule: "procurement" });
  await prisma.accountProduct.updateMany({ where: { id: prodA.id }, data: { qtyOnHand: 30 } });
  await INV.consume(invCtx, { itemId: item.id, qty: 4, idempotencyKey: `t59-sale-${stamp}`, sourceModule: "POS", refType: "PosSale" });
  await prisma.accountProduct.updateMany({ where: { id: prodA.id }, data: { qtyOnHand: 26 } });
  const mk = (reason: string, qty: number, extra: Any = {}) => PR.createGoodsMovement({ tenantId: tid, systemId: SYS, docType: "GOODS_ISSUE", lines: [{ productId: prodA.id, qty }], createdById: owner.id, adjustReason: reason, allowNegative: true, ...extra });
  const gBiz = await mk("ใช้ในกิจการ", 1);
  const gGive = await mk("ของแถม", 2);
  const gWaste = await mk("ของเสีย/ทำลาย", 1);
  const gOwn = await mk("ใช้ส่วนตัวเจ้าของ", 3, { ack: ["STOCK_ISSUE_PERSONAL_USE"] });
  const gShort = await mk("สินค้าขาด (นับแล้วขาด)", 1);
  chk("S0.1", "ใบเบิก 5 ใบออกได้ (ใช้ส่วนตัวยืนยันแล้ว)", [gBiz, gGive, gWaste, gOwn, gShort].every((g: Any) => g.ok), "ok ×5", [gBiz, gGive, gWaste, gOwn, gShort].map((g: Any) => g.ok || g.reason));

  // ═══ S1 รายงานรับ/จ่าย/คงเหลือ ═══
  const r = await GR.goodsPeriodReport(ctx, from, today);
  const a = r.rows.find((x: Any) => x.productId === prodA.id);
  chk("S1.1", "ยกมา 20 หน่วย 200,000", a?.opening.qty === 20 && a?.opening.valueSatang === 200_000, "20/200000", a?.opening);
  chk("S1.2", "รับ 10 หน่วย 100,000", a?.receipts.qty === 10 && a?.receipts.valueSatang === 100_000, "10/100000", a?.receipts);
  const iss = a ? Object.fromEntries(Object.entries(a.issues).map(([k, v]: Any) => [k, v.qty])) : {};
  chk("S1.3", "จ่าย: ขาย 4 · ใช้ในกิจการ 1 · ของแถม 2 · เสีย 1 · ถือเป็นขาย 4 · อื่น 0", JSON.stringify(iss) === JSON.stringify({ SALE: 4, BUSINESS_USE: 1, GIVEAWAY: 2, WASTE: 1, DEEMED_SALE: 4, OTHER: 0 }), { SALE: 4, BUSINESS_USE: 1, GIVEAWAY: 2, WASTE: 1, DEEMED_SALE: 4, OTHER: 0 }, iss);
  chk("S1.4", "คงเหลือ 18 หน่วย 180,000 · จ่ายรวม 12 หน่วย 120,000", a?.closing.qty === 18 && a?.closing.valueSatang === 180_000 && a?.issuesTotal.qty === 12 && a?.issuesTotal.valueSatang === 120_000, "18/180000", { c: a?.closing, t: a?.issuesTotal });
  chk("S1.5", "สินค้าไม่ผูกคลัง 1 รายการ + คำเตือน · คำเตือนรูปแบบรายงาน [S]", r.untracked === 1 && r.warnings.some((w: Any) => w.code === "GOODS_REPORT_UNTRACKED") && r.warnings.some((w: Any) => w.code === "GOODS_REPORT_FORMAT" && w.tag === "S"), "ครบ", r.warnings.map((w: Any) => w.code));
  chk("S1.6", "รวมทั้งรายงาน = แถวเดียว (180,000)", r.totals.closing.valueSatang === 180_000 && r.rows.length === 1, 180_000, r.totals.closing);
  const rPrev = await GR.goodsPeriodReport(ctx, bkk(prevMonth), bkk(prevMonth));
  chk("S1.7", "ช่วงเดือนก่อน (วันเดียว): ยกมา 0 · รับ 20 · คงเหลือ 20", rPrev.rows[0]?.opening.qty === 0 && rPrev.rows[0]?.receipts.qty === 20 && rPrev.rows[0]?.closing.qty === 20, "0/20/20", rPrev.rows[0]);
  let badRange = "";
  try { await GR.goodsPeriodReport(ctx, today, from === today ? "2000-01-01" : from); } catch (e) { badRange = e instanceof Error ? e.message : String(e); }
  chk("S1.8", "ช่วงวันที่กลับด้าน = error ภาษาไทย", /ช่วงวันที่ไม่ถูกต้อง/.test(badRange), "error", badRange);

  // ═══ S2 waste log ═══
  const w1 = await GR.wasteLog(ctx, from, today);
  chk("S2.1", "waste log 2 ใบ (ของเสีย + ขาด) · ต้นทุนรวม 20,000", w1.rows.length === 2 && w1.costTotalSatang === 20_000 && w1.rows.map((x: Any) => x.reasonCode).sort().join() === "SHORTAGE,WASTE", 2, w1.rows.map((x: Any) => [x.reasonCode, x.costTotalSatang]));
  const wr = w1.rows.find((x: Any) => x.reasonCode === "WASTE");
  chk("S2.2", "ขาดพยาน+รูป → EVIDENCE_MISSING ('พยาน · รูปถ่าย') + APPROVER_SAME", wr?.warnings.some((x: Any) => x.code === "STOCK_WASTE_EVIDENCE_MISSING" && /พยาน · รูปถ่าย/.test(x.messageTh)) && wr?.warnings.some((x: Any) => x.code === "STOCK_ISSUE_APPROVER_SAME"), "2 คำเตือน", wr?.warnings.map((x: Any) => x.code));
  chk("S2.3", "แถว: วันที่ · รายการ × จำนวน · ผู้ทำ/ผู้อนุมัติ = ชื่อเจ้าของ", wr?.date === today && wr?.items[0]?.qty === 1 && wr?.createdByName === "เจ้าของ T5.9" && wr?.approvedByName === "เจ้าของ T5.9", "ครบ", wr);
  const sv = await GR.saveStockEvidence(ctx, gWaste.id, { witnessName: "นาย พยาน", witnessRole: "ผู้จัดการ", method: "ทิ้งถังขยะ" });
  await prisma.accountAttachment.create({ data: { tenantId: tid, systemId: SYS, documentId: gWaste.id, fileName: "waste.jpg", fileUrl: "https://example.invalid/waste.jpg", mimeType: "image/jpeg", sizeBytes: 10 } });
  const w2 = await GR.wasteLog(ctx, from, today);
  const wr2 = w2.rows.find((x: Any) => x.reasonCode === "WASTE");
  chk("S2.4", "บันทึกพยาน + รูป → เหลือ APPROVER_SAME · พยาน 'นาย พยาน (ผู้จัดการ)' · รูป 1", sv.ok && wr2?.evidence.witnessName === "นาย พยาน" && wr2?.evidence.witnessRole === "ผู้จัดการ" && wr2?.photos === 1 && wr2?.warnings.map((x: Any) => x.code).join() === "STOCK_ISSUE_APPROVER_SAME", "APPROVER_SAME", wr2);
  const sv2 = await GR.saveStockEvidence(ctx, "nope", { witnessName: "x" });
  chk("S2.5", "บันทึกพยานใบที่ไม่มี = ไม่พบ", !sv2.ok, "fail", sv2);
  const jvBefore = await prisma.accountJournalEntry.count({ where: { systemId: SYS } });
  await GR.saveStockEvidence(ctx, gWaste.id, { witnessName: "นาย พยาน 2" });
  chk("S2.6", "บันทึกพยานไม่แตะสมุดรายวัน", (await prisma.accountJournalEntry.count({ where: { systemId: SYS } })) === jvBefore, jvBefore, "เปลี่ยน");

  // ═══ S3 ของแถม · ถือเป็นขาย ═══
  const g = await GR.giveawayDeemedSales(ctx, from, today, { setting: "WARN", vatRateBp: 700, vatRegistered: true });
  chk("S3.1", "ของแถม 1 ใบ ต้นทุน 20,000", g.giveaways.length === 1 && g.giveaways[0].costSatang === 20_000, 20_000, g.giveaways);
  const own = g.deemed.find((x: Any) => x.documentId === gOwn.id);
  const sh = g.deemed.find((x: Any) => x.documentId === gShort.id);
  chk("S3.2", "ใช้ส่วนตัว: ราคาตลาด 45,000 VAT 3,150 (ราคาขาย) · ขาด: 15,000 VAT 1,050 · รวม VAT 4,200", own?.marketValueSatang === 45_000 && own?.vatSatang === 3_150 && own?.marketBasis === "SALE_PRICE" && sh?.marketValueSatang === 15_000 && sh?.vatSatang === 1_050 && g.deemedVatSatang === 4_200, 4_200, g.deemed);
  chk("S3.3", "คำเตือน: ของแถม + STOCK_DEEMED_SALE_VAT (42.00 บาท) [V] · ไม่ตั้งภาษีขายเอง", g.warnings.some((x: Any) => x.code === "STOCK_ISSUE_GIVEAWAY") && g.warnings.some((x: Any) => x.code === "STOCK_DEEMED_SALE_VAT" && /42\.00/.test(x.messageTh) && x.tag === "V"), "ครบ", g.warnings.map((x: Any) => [x.code, x.messageTh]));
  const vatLines = await prisma.accountJournalLine.count({ where: { systemId: SYS, account: { code: "2200" }, entry: { refId: { in: [gOwn.id, gShort.id] } } } });
  chk("S3.4", "ใบเบิกถือเป็นขายไม่มีบรรทัดภาษีขาย (ระบบไม่ตั้งเอง)", vatLines === 0, 0, vatLines);
  const gOff = await GR.giveawayDeemedSales(ctx, from, today, { setting: "OFF", vatRateBp: 700, vatRegistered: true });
  chk("S3.5", "ร้านปิด (OFF): ยังคำนวณ แต่คำเตือนเป็น STOCK_DEEMED_SALE_OFF", gOff.warnings.some((x: Any) => x.code === "STOCK_DEEMED_SALE_OFF") && !gOff.warnings.some((x: Any) => x.code === "STOCK_DEEMED_SALE_VAT"), "OFF", gOff.warnings.map((x: Any) => x.code));
  const gNoVat = await GR.giveawayDeemedSales(ctx, from, today, { setting: "WARN", vatRateBp: 700, vatRegistered: false });
  chk("S3.6", "ร้านไม่จด VAT: ภาษี 0 · ไม่มีคำเตือนภาษีขาย", gNoVat.deemedVatSatang === 0 && !gNoVat.warnings.some((x: Any) => /DEEMED_SALE/.test(x.code)), 0, gNoVat.warnings.map((x: Any) => x.code));
  await prisma.accountProduct.updateMany({ where: { id: prodA.id }, data: { salePrice: null } });
  const gCost = await GR.giveawayDeemedSales(ctx, from, today, { setting: "WARN", vatRateBp: 700, vatRegistered: true });
  chk("S3.7", "ไม่มีราคาขาย → ใช้ต้นทุน (ใช้ส่วนตัว 30,000 VAT 2,100)", gCost.deemed.find((x: Any) => x.documentId === gOwn.id)?.marketBasis === "COST" && gCost.deemed.find((x: Any) => x.documentId === gOwn.id)?.vatSatang === 2_100, 2_100, gCost.deemed);

  // ═══ S4 คำเตือน: ข้อความผู้ใช้ไม่มี path/ป้าย · ไม่มีคำว่า "ถูกกฎหมาย" ═══
  const codes = ["GOODS_REPORT_FORMAT", "GOODS_REPORT_UNTRACKED", "STOCK_WASTE_EVIDENCE_MISSING", "STOCK_DEEMED_SALE_VAT", "STOCK_DEEMED_SALE_OFF"];
  const ws = codes.map((c) => W.legalWarning(c, { n: "1", missing: "พยาน", vat: "1.00" }));
  chk("S4.1", "5 รหัสใหม่: lawTh ไม่ว่าง · ข้อความ/อ้างอิงที่ผู้ใช้เห็นไม่มี path/ป้าย/คำว่าถูกกฎหมาย · [S] มีคำว่าโปรดตรวจกับนักบัญชีของร้าน", ws.every((w: Any) => w.lawTh && !FORBID.test(`${w.messageTh} ${w.lawTh}`)) && /โปรดตรวจกับนักบัญชีของร้าน/.test(ws[0].messageTh), "ครบ", ws.map((w: Any) => [w.code, w.lawTh]));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  for (const u of KEEP ? [] : users) await prisma.user.delete({ where: { id: u } }).catch(() => undefined);
  await prisma.$disconnect();
}
const failed = cks.filter((c) => !c.ok);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((f) => f.id) })}`);
process.exit(failed.length ? 1 : 0);
