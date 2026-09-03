// QC WO 4.1 — "InvItem canonical": สินค้าบัญชี ↔ คลังสินค้า (MAP §F.8–12, §F.15 · SPEC §8.2 "การเชื่อมต่อ")
//
// requires: acc-v2-seed
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-invitem.mts
//
// 🔴 ความปลอดภัยข้อมูล: ส่วนที่ **แก้ข้อมูล** ทำบน "ร้านทิ้ง" ที่สคริปต์สร้างเอง แล้วลบทิ้งใน finally เสมอ
//    ส่วนที่แตะร้าน QC จริง (`SIAM DIVE QC`) = **อ่านอย่างเดียว** (ข้อ IV1) — ไม่ขยับสต็อก/เอกสารของ fixture
//
// ครอบคลุม (ดู ledger/wo-notes/4.1.md)
//   IV1  fixture ของ seed: MASK-01 / TANK-12 ผูกสองทางจริง · sku/หน่วย/ต้นทุนตรงกัน · คงเหลืออ่านจาก InvItem
//   IV2  สร้างสินค้า + "ติดตามสต็อก" → InvItem เกิดพร้อม sku/หน่วย/ต้นทุน · ผูกสองทาง · ผูกซ้ำถูกปฏิเสธ
//   IV3  แก้ item (ชื่อ) และรับเข้าเปลี่ยนต้นทุน → AccountProduct ตามทัน (ชื่อ · ราคาซื้อ · หน่วย)
//   IV4  แก้สินค้าบัญชี (ชื่อ/sku) → item ตามทัน · ราคาขาย/VAT **ไม่** ไหลไปคลัง (ฟิลด์บัญชี)
//   IV5  อนุมัติใบเบิก 3 → InvItem.onHand −3 · มี movement key `acc-issue-<lineId>` · qtyOnHand เป็นกระจก
//   IV6  ยิงซ้ำด้วย key เดิม → ไม่มี movement ที่ 2 · onHand ไม่ขยับ (idempotent)
//   IV7  คืน 1 → onHand +1 · movement `acc-return-<lineId>` · ต้นทุนถัวเฉลี่ยไม่ขยับ
//   IV8  สต็อกในคลังไม่พอ → ปฏิเสธเป็นภาษาไทย · ไม่มีเอกสาร · onHand ไม่ขยับ
//   IV9  injected failure (item หายแต่ลิงก์ยังชี้อยู่) → คืน error ไทย · **ไม่มีเอกสารค้าง** (ธุรกรรมย้อนครบ)
//   IV10 เลิกผูก → คงเหลือถอยไปใช้ qtyOnHand (แช่แข็งยอดล่าสุดจากคลัง) · เบิกต่อเดินที่ qtyOnHand
//   IV11 สินค้าที่ไม่เคยผูกคลัง → พฤติกรรมเดิมเป๊ะ (qtyOnHand ลด · ไม่มี movement ในคลัง)
//   IV12 tenant isolation: ผูกกับ item ของอีกร้านถูกปฏิเสธ · sync ไม่ข้ามร้าน
//   IV13 degrade §F.15: ไม่ผูก / ไม่มีระบบบัญชี / item หาย → คืน { synced:false, reason } ไม่ throw
//   IV14 บริการ (SERVICE) ผูกคลังไม่ได้ · item ชนิดบริการก็ผูกไม่ได้
import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const prod = await import("@/lib/modules/account/product");
const link = await import("@/lib/modules/account/inventory-link");
const accIdx = await import("@/lib/modules/account");
const inv = await import("@/lib/modules/inventory/service");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};

console.log(`\n===== QC WO 4.1 · InvItem canonical (สินค้าบัญชี ↔ คลังสินค้า) =====`);
console.log(`[env] DB ${host}\n`);

// ─────────────────── ร้านทิ้ง (ทุกการเขียนเกิดที่นี่) ───────────────────
const stamp = Date.now();
const tenantIds: string[] = [];

async function makeShop(name: string, opts: { account?: boolean; inventory?: boolean } = {}) {
  const t = await prisma.tenant.create({ data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}-${tenantIds.length}` } });
  tenantIds.push(t.id);
  const acc = opts.account === false ? null : await system.createSystem(t.id, "ACCOUNT", "บัญชี");
  const ivs = opts.inventory === false ? null : await system.createSystem(t.id, "INVENTORY", "คลัง");
  return { tenantId: t.id, accSystemId: acc?.id ?? "", invSystemId: ivs?.id ?? "" };
}

try {
  // ═════════ IV1 — fixture ของ seed (อ่านอย่างเดียว) ═════════
  console.log("IV1 ชุดข้อมูล QC: สินค้าที่ผูกคลังไว้แล้ว (อ่านอย่างเดียว)");
  if (!existsSync(QC.expectedPath)) {
    bad("IV1.0 มีไฟล์เฉลย", `ไม่พบ ${QC.expectedPath} — รัน seed-acc-v2-qc.mts ก่อน`);
  } else {
    const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
      tenantId: string;
      systemId: string;
      products: number;
      inventory?: { systemId: string; linkedCount: number; unlinkedCount: number; linked: { sku: string; itemId: string; onHand: number; costSatang: number }[] };
    };
    if (!E.inventory) {
      bad("IV1.0 เฉลยมีคีย์ inventory", "ไม่มี — seed เก่า ต้อง seed ใหม่หลัง WO 4.1");
    } else {
      const accCtx = { tenantId: E.tenantId, systemId: E.systemId };
      const rows = await prod.listProductsWithStock(E.tenantId, E.systemId, { includeArchived: true });
      eq("IV1.1 จำนวนสินค้ายังเท่าเดิม (ไม่เพิ่มรายการใหม่)", rows.length, E.products);
      eq("IV1.2 สินค้าที่ผูกคลัง = 2", rows.filter((r) => r.invItemId).length, E.inventory.linkedCount);
      for (const l of E.inventory.linked) {
        const p = rows.find((r) => r.sku === l.sku);
        const item = await prisma.invItem.findFirst({ where: { id: l.itemId, tenantId: E.tenantId } });
        assert(`IV1.3 ${l.sku}: สินค้าบัญชีชี้ไป item`, p?.invItemId === l.itemId, `ได้ ${p?.invItemId}`);
        assert(`IV1.4 ${l.sku}: item ชี้กลับมาที่สินค้าบัญชี (ผูกสองทาง)`, item?.accountProductId === p?.id, `ได้ ${item?.accountProductId}`);
        eq(`IV1.5 ${l.sku}: sku ตรงกันสองฝั่ง`, item?.sku, p?.sku);
        eq(`IV1.6 ${l.sku}: ราคาซื้อ = ต้นทุนในคลัง`, p?.buyPrice, l.costSatang);
        eq(`IV1.7 ${l.sku}: คงเหลือมาจาก InvItem.onHand`, p?.stock, l.onHand);
        eq(`IV1.8 ${l.sku}: กระจก qtyOnHand ตรงกับคลัง`, Number(p?.qtyOnHand), l.onHand);
      }
      const stockMap = await link.productStockMap(accCtx, rows);
      const unlinked = rows.filter((r) => !r.invItemId);
      eq("IV1.9 สินค้าที่ไม่ผูกคลัง = 10 (ใช้ qtyOnHand ของตัวเอง)", unlinked.length, E.inventory.unlinkedCount);
      assert(
        "IV1.10 สินค้าไม่ผูกคลัง: productStockMap = qtyOnHand เดิม",
        unlinked.every((r) => stockMap.get(r.id) === Number(r.qtyOnHand)),
        "มีตัวที่ไม่ตรง",
      );
    }
  }

  // ═════════ ร้านทิ้งหลัก ═════════
  const shop = await makeShop("QC INVITEM");
  const accCtx = { tenantId: shop.tenantId, systemId: shop.accSystemId };
  const invCtx = { tenantId: shop.tenantId, systemId: shop.invSystemId };
  const unitPcs = await prod.createUnit(shop.tenantId, shop.accSystemId, "ชิ้น");
  if (!unitPcs.ok) throw new Error("สร้างหน่วยไม่สำเร็จ");

  const mk = async (input: Partial<Parameters<typeof prod.createProduct>[2]> & { name: string }) => {
    const r = await prod.createProduct(shop.tenantId, shop.accSystemId, {
      type: "GOODS",
      vatRateBp: 700,
      unitId: unitPcs.id,
      ...input,
    } as Parameters<typeof prod.createProduct>[2]);
    if (!r.ok) throw new Error(`สร้างสินค้า ${input.name} ไม่สำเร็จ: ${r.reason}`);
    return r.id;
  };

  // ═════════ IV2 — สร้างสินค้า + ติ๊ก "ติดตามสต็อก" ═════════
  console.log("\nIV2 ติ๊ก “ติดตามสต็อกในคลังสินค้า” → InvItem เกิดจริง");
  const pMask = await mk({ sku: "QC-MASK", name: "หน้ากากดำน้ำ (QC)", buyPrice: 168_000, salePrice: 285_000 });
  const l1 = await link.linkProductToItem(accCtx, pMask, { createItem: { reorderPoint: 5 } });
  assert("IV2.1 ผูกสำเร็จ (สร้าง item ใหม่ในคลัง)", l1.ok, l1.ok ? "" : l1.reason);
  const itemMaskId = l1.ok ? l1.itemId : "";
  const item1 = await prisma.invItem.findFirst({ where: { id: itemMaskId } });
  eq("IV2.2 item ใหม่: sku ยกมาจากสินค้าบัญชี", item1?.sku, "QC-MASK");
  eq("IV2.3 item ใหม่: ชื่อยกมา", item1?.name, "หน้ากากดำน้ำ (QC)");
  eq("IV2.4 item ใหม่: หน่วยยกมาจาก AccountUnit", item1?.unitLabel, "ชิ้น");
  eq("IV2.5 item ใหม่: ต้นทุน = ราคาซื้อของสินค้าบัญชี", item1?.costSatang, 168_000);
  eq("IV2.6 item ใหม่: จุดสั่งซื้อถูกตั้ง", item1?.reorderPoint, 5);
  eq("IV2.7 item ใหม่: onHand เริ่มที่ 0 (ของเข้าจริงต้องผ่าน movement)", item1?.onHand, 0);
  eq("IV2.8 item ชี้กลับมาที่สินค้าบัญชี", item1?.accountProductId, pMask);
  const prodMask1 = await prod.getProduct(shop.tenantId, shop.accSystemId, pMask);
  eq("IV2.9 สินค้าบัญชีชี้ไปที่ item", prodMask1?.invItemId, itemMaskId);
  const l1again = await link.linkProductToItem(accCtx, pMask, { createItem: {} });
  assert("IV2.10 ผูกซ้ำถูกปฏิเสธเป็นภาษาไทย", !l1again.ok && /ผูกกับคลัง/.test(l1again.ok ? "" : l1again.reason), JSON.stringify(l1again));
  const itemCount1 = await prisma.invItem.count({ where: { tenantId: shop.tenantId } });
  eq("IV2.11 ผูกซ้ำไม่สร้าง item เพิ่ม", itemCount1, 1);

  // ═════════ IV3 — sync คลัง → บัญชี ═════════
  console.log("\nIV3 แก้ที่คลัง → สินค้าบัญชีตามทัน (คลังเป็นต้นฉบับของ ชื่อ/sku/หน่วย/ต้นทุน)");
  await inv.updateItem(invCtx, itemMaskId, { name: "หน้ากากดำน้ำ Aqualung (QC)", unitLabel: "อัน" });
  const prodMask2 = await prod.getProduct(shop.tenantId, shop.accSystemId, pMask);
  eq("IV3.1 ชื่อไหลจากคลังมาที่สินค้าบัญชี", prodMask2?.name, "หน้ากากดำน้ำ Aqualung (QC)");
  const unitAfter = prodMask2?.unitId
    ? await prisma.accountUnit.findFirst({ where: { id: prodMask2.unitId } })
    : null;
  eq("IV3.2 หน่วยใหม่ถูกสร้าง/ผูกในระบบบัญชี", unitAfter?.name, "อัน");
  // รับของเข้าคลัง 20 ชิ้น ต้นทุน 200.00 → ถัวเฉลี่ยใหม่ (onHand เดิม 0) = 20000
  await inv.receive(invCtx, { itemId: itemMaskId, qty: 20, costSatang: 20_000, idempotencyKey: `qc-iv-rc-${stamp}`, sourceModule: "procurement" });
  const prodMask3 = await prod.getProduct(shop.tenantId, shop.accSystemId, pMask);
  eq("IV3.3 ต้นทุนถัวเฉลี่ยใหม่ไหลไปเป็น “ราคาซื้อ” ของสินค้าบัญชี", prodMask3?.buyPrice, 20_000);
  eq("IV3.4 กระจก qtyOnHand ตามคลัง (20)", Number(prodMask3?.qtyOnHand), 20);
  eq("IV3.5 คงเหลือที่อ่านผ่าน facade = 20", await link.productStock(accCtx, prodMask3!), 20);

  // ═════════ IV4 — sync บัญชี → คลัง (ชื่อ/sku/หน่วย เท่านั้น) ═════════
  console.log("\nIV4 แก้ที่บัญชี → คลังตามทันเฉพาะ ชื่อ/sku/หน่วย (ราคา/VAT ไม่ไหลไปคลัง)");
  const itemPriceBefore = (await prisma.invItem.findFirst({ where: { id: itemMaskId } }))!.priceSatang;
  const up = await prod.updateProduct(shop.tenantId, shop.accSystemId, pMask, {
    name: "หน้ากากดำน้ำรุ่นใหม่ (QC)",
    sku: "QC-MASK2",
    type: "GOODS",
    unitId: unitPcs.id,
    salePrice: 999_900,
    buyPrice: 20_000,
    vatRateBp: 0,
  });
  assert("IV4.0 แก้สินค้าบัญชีสำเร็จ", up.ok, up.ok ? "" : up.reason);
  const item4 = await prisma.invItem.findFirst({ where: { id: itemMaskId } });
  eq("IV4.1 ชื่อไหลไปที่คลัง", item4?.name, "หน้ากากดำน้ำรุ่นใหม่ (QC)");
  eq("IV4.2 sku ไหลไปที่คลัง", item4?.sku, "QC-MASK2");
  eq("IV4.3 หน่วยไหลไปที่คลัง", item4?.unitLabel, "ชิ้น");
  eq("IV4.4 ราคาขายของบัญชีไม่ไปทับราคาในคลัง", item4?.priceSatang, itemPriceBefore);
  eq("IV4.5 ต้นทุนในคลังไม่ถูกบัญชีเขียนทับ", item4?.costSatang, 20_000);

  // ═════════ IV5 — เบิก 3 ═════════
  console.log("\nIV5 อนุมัติใบเบิก 3 → คลังลด 3");
  const issue = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE",
    lines: [{ productId: pMask, qty: 3 }],
    note: "เบิกใช้งาน (QC)",
  });
  assert("IV5.1 สร้างใบเบิกสำเร็จ", issue.ok, issue.ok ? "" : issue.reason);
  const issueId = issue.ok ? issue.id : "";
  const issueLine = await prisma.accountDocumentLine.findFirstOrThrow({ where: { documentId: issueId } });
  const item5 = await prisma.invItem.findFirst({ where: { id: itemMaskId } });
  eq("IV5.2 InvItem.onHand ลด 3 (20 → 17)", item5?.onHand, 17);
  const mvIssue = await prisma.invMovement.findMany({ where: { tenantId: shop.tenantId, idempotencyKey: `acc-issue-${issueLine.id}` } });
  eq("IV5.3 มี movement 1 แถว key = acc-issue-<lineId>", mvIssue.length, 1);
  eq("IV5.4 movement เป็นขาออก −3", mvIssue[0]?.qtyDelta, -3);
  eq("IV5.5 movement อ้างกลับไปที่เอกสารบัญชี", `${mvIssue[0]?.refType}:${mvIssue[0]?.refId}`, `AccountDocument:${issueId}`);
  eq("IV5.6 movement ระบุที่มาว่าเป็นระบบบัญชี", mvIssue[0]?.sourceModule, "ACCOUNT");
  const prodMask5 = await prod.getProduct(shop.tenantId, shop.accSystemId, pMask);
  eq("IV5.7 กระจก qtyOnHand = 17 (ไม่ใช่แหล่งความจริง แต่ต้องไม่โกหก)", Number(prodMask5?.qtyOnHand), 17);
  eq("IV5.8 คงเหลือที่หน้าจออ่าน = 17", await link.productStock(accCtx, prodMask5!), 17);

  // ═════════ IV6 — idempotent ═════════
  console.log("\nIV6 ยิงซ้ำด้วย idempotencyKey เดิม → ไม่ตัดเบิ้ล");
  await inv.consume(invCtx, { itemId: itemMaskId, qty: 3, idempotencyKey: `acc-issue-${issueLine.id}`, sourceModule: "ACCOUNT" });
  const mvIssue2 = await prisma.invMovement.count({ where: { tenantId: shop.tenantId, idempotencyKey: `acc-issue-${issueLine.id}` } });
  eq("IV6.1 ยังมี movement แค่แถวเดียว", mvIssue2, 1);
  eq("IV6.2 onHand ไม่ขยับ (ยัง 17)", (await prisma.invItem.findFirst({ where: { id: itemMaskId } }))?.onHand, 17);

  // ═════════ IV7 — คืน 1 ═════════
  console.log("\nIV7 ใบส่งคืนเบิก 1 → คลังเพิ่ม 1 · ต้นทุนถัวเฉลี่ยไม่ขยับ");
  const ret = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE_RETURN",
    sourceDocId: issueId,
    adjustReason: "คืนของที่ไม่ได้ใช้",
    lines: [{ productId: pMask, qty: 1 }],
  });
  assert("IV7.1 สร้างใบส่งคืนสำเร็จ", ret.ok, ret.ok ? "" : ret.reason);
  const retLine = await prisma.accountDocumentLine.findFirstOrThrow({ where: { documentId: ret.ok ? ret.id : "" } });
  const item7 = await prisma.invItem.findFirst({ where: { id: itemMaskId } });
  eq("IV7.2 onHand เพิ่ม 1 (17 → 18)", item7?.onHand, 18);
  eq("IV7.3 ต้นทุนถัวเฉลี่ยไม่ขยับจากการคืนเบิก", item7?.costSatang, 20_000);
  const mvRet = await prisma.invMovement.findMany({ where: { tenantId: shop.tenantId, idempotencyKey: `acc-return-${retLine.id}` } });
  eq("IV7.4 มี movement 1 แถว key = acc-return-<lineId>", mvRet.length, 1);
  eq("IV7.5 movement เป็นขาเข้า +1", mvRet[0]?.qtyDelta, 1);
  eq("IV7.6 คืนเกินจำนวนที่เบิกยังถูกปฏิเสธเหมือนเดิม", (await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE_RETURN",
    sourceDocId: issueId,
    lines: [{ productId: pMask, qty: 99 }],
  })).ok, false);

  // ═════════ IV8 — สต็อกไม่พอ ═════════
  console.log("\nIV8 เบิกเกินของที่มีในคลัง → ปฏิเสธ ไม่มีเอกสาร");
  const docsBefore8 = await prisma.accountDocument.count({ where: { tenantId: shop.tenantId } });
  const over = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE",
    lines: [{ productId: pMask, qty: 500 }],
  });
  assert("IV8.1 ถูกปฏิเสธ", !over.ok, "ผ่านไปได้");
  assert("IV8.2 ข้อความเป็นภาษาไทยและบอกว่าสต็อกไม่พอ", !over.ok && /สต็อก.*ไม่พอ/.test(over.reason), over.ok ? "" : over.reason);
  eq("IV8.3 ไม่มีเอกสารเพิ่ม", await prisma.accountDocument.count({ where: { tenantId: shop.tenantId } }), docsBefore8);
  eq("IV8.4 onHand ไม่ขยับ", (await prisma.invItem.findFirst({ where: { id: itemMaskId } }))?.onHand, 18);

  // ═════════ IV9 — injected failure: ลิงก์เสีย (item ถูกลบ) ═════════
  console.log("\nIV9 injected failure: ลิงก์ชี้ไป item ที่ไม่มีแล้ว → ไม่มีเอกสารค้าง (ธุรกรรมย้อนครบ)");
  const pGhost = await mk({ sku: "QC-GHOST", name: "สินค้าลิงก์เสีย (QC)", buyPrice: 1_000 });
  const lGhost = await link.linkProductToItem(accCtx, pGhost, { createItem: {} });
  const ghostItemId = lGhost.ok ? lGhost.itemId : "";
  await prisma.invItem.deleteMany({ where: { id: ghostItemId } }); // จำลองข้อมูลคลังหาย
  const docsBefore9 = await prisma.accountDocument.count({ where: { tenantId: shop.tenantId } });
  const seqBefore9 = await prisma.accountDocSequence.findFirst({ where: { systemId: shop.accSystemId, docType: "GOODS_ISSUE" } });
  const broken = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE",
    lines: [{ productId: pGhost, qty: 1 }],
    allowNegative: true,
  });
  assert("IV9.1 ถูกปฏิเสธ ไม่ throw ออกมาที่หน้าเว็บ", !broken.ok, "ผ่านไปได้");
  assert("IV9.2 ข้อความเป็นภาษาไทย", !broken.ok && /คลังสินค้า|ลิงก์/.test(broken.reason), broken.ok ? "" : broken.reason);
  eq("IV9.3 ไม่มีเอกสารค้าง (rollback ครบ)", await prisma.accountDocument.count({ where: { tenantId: shop.tenantId } }), docsBefore9);
  const seqAfter9 = await prisma.accountDocSequence.findFirst({ where: { systemId: shop.accSystemId, docType: "GOODS_ISSUE" } });
  eq("IV9.4 เลขรันเอกสารไม่ถูกกินทิ้ง", seqAfter9?.lastNo, seqBefore9?.lastNo);
  eq("IV9.5 ไม่มี movement ค้างในคลัง", await prisma.invMovement.count({ where: { tenantId: shop.tenantId, itemId: ghostItemId } }), 0);

  // ═════════ IV10 — เลิกผูก ═════════
  console.log("\nIV10 เลิกติดตามสต็อกในคลัง → ถอยไปใช้ qtyOnHand ของบัญชีเอง");
  const un = await link.unlinkProductFromItem(accCtx, pMask);
  assert("IV10.1 เลิกผูกสำเร็จ", un.ok, un.ok ? "" : un.reason);
  const prodMask10 = await prod.getProduct(shop.tenantId, shop.accSystemId, pMask);
  eq("IV10.2 สินค้าบัญชีไม่ชี้ item แล้ว", prodMask10?.invItemId, null);
  eq("IV10.3 qtyOnHand ถูกแช่แข็งไว้ที่ยอดล่าสุดของคลัง (18)", Number(prodMask10?.qtyOnHand), 18);
  eq("IV10.4 item ไม่ชี้กลับมาแล้ว", (await prisma.invItem.findFirst({ where: { id: itemMaskId } }))?.accountProductId, null);
  eq("IV10.5 คงเหลือที่อ่านได้ = qtyOnHand (18)", await link.productStock(accCtx, prodMask10!), 18);
  const afterUnlink = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE",
    lines: [{ productId: pMask, qty: 2 }],
  });
  assert("IV10.6 เบิกหลังเลิกผูกสำเร็จ", afterUnlink.ok, afterUnlink.ok ? "" : afterUnlink.reason);
  eq("IV10.7 qtyOnHand ลดเอง (18 → 16)", Number((await prod.getProduct(shop.tenantId, shop.accSystemId, pMask))?.qtyOnHand), 16);
  eq("IV10.8 คลังไม่ถูกแตะแล้ว (onHand ยัง 18)", (await prisma.invItem.findFirst({ where: { id: itemMaskId } }))?.onHand, 18);

  // ═════════ IV11 — สินค้าที่ไม่เคยผูกคลัง (regression) ═════════
  console.log("\nIV11 สินค้าที่ไม่เคยผูกคลัง — พฤติกรรมเดิมเป๊ะ");
  const pPlain = await mk({ sku: "QC-PLAIN", name: "สินค้าไม่ผูกคลัง (QC)" });
  await prisma.accountProduct.updateMany({ where: { id: pPlain }, data: { qtyOnHand: 10 } });
  const mvBefore11 = await prisma.invMovement.count({ where: { tenantId: shop.tenantId } });
  const plainIssue = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE",
    lines: [{ productId: pPlain, qty: 3 }],
  });
  assert("IV11.1 เบิกสำเร็จ", plainIssue.ok, plainIssue.ok ? "" : plainIssue.reason);
  eq("IV11.2 qtyOnHand ลด 3 (10 → 7)", Number((await prod.getProduct(shop.tenantId, shop.accSystemId, pPlain))?.qtyOnHand), 7);
  eq("IV11.3 ไม่มี movement ในคลังเพิ่ม", await prisma.invMovement.count({ where: { tenantId: shop.tenantId } }), mvBefore11);
  const plainOver = await prod.createGoodsMovement({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    docType: "GOODS_ISSUE",
    lines: [{ productId: pPlain, qty: 99 }],
  });
  assert("IV11.4 กันสต็อกติดลบเหมือนเดิม", !plainOver.ok && /ไม่พอ/.test(plainOver.ok ? "" : plainOver.reason), JSON.stringify(plainOver));

  // ═════════ IV12 — tenant isolation ═════════
  console.log("\nIV12 tenant isolation");
  const other = await makeShop("QC INVITEM OTHER");
  const otherItem = await inv.createItem({ tenantId: other.tenantId, systemId: other.invSystemId }, { sku: "OTHER-1", name: "ของร้านอื่น" });
  const pCross = await mk({ sku: "QC-CROSS", name: "สินค้าทดสอบข้ามร้าน (QC)" });
  const cross = await link.linkProductToItem(accCtx, pCross, { itemId: otherItem.id });
  assert("IV12.1 ผูกกับ item ของอีกร้านถูกปฏิเสธ", !cross.ok, "ผูกได้ — รั่วข้ามร้าน!");
  assert("IV12.2 ข้อความเป็นภาษาไทย", !cross.ok && /ไม่พบ/.test(cross.ok ? "" : cross.reason), cross.ok ? "" : cross.reason);
  eq("IV12.3 item ของอีกร้านไม่ถูกแตะ", (await prisma.invItem.findFirst({ where: { id: otherItem.id } }))?.accountProductId, null);
  eq("IV12.4 สินค้าบัญชีไม่ถูกผูก", (await prod.getProduct(shop.tenantId, shop.accSystemId, pCross))?.invItemId, null);
  const crossSync = await accIdx.syncItemToAccountProduct({ tenantId: shop.tenantId, systemId: shop.invSystemId }, otherItem.id);
  eq("IV12.5 sync ข้ามร้านมองไม่เห็น item", crossSync, { synced: false, reason: "item-not-found" });

  // ═════════ IV13 — degrade §F.15 ═════════
  console.log("\nIV13 degrade อย่างสุภาพ (§F.15 “ไม่เชื่อม = ไม่ post”)");
  const loneItem = await inv.createItem(invCtx, { sku: "QC-LONE", name: "ของที่ไม่ผูกบัญชี" });
  eq("IV13.1 item ที่ไม่ผูก → unlinked (ไม่ throw)", await accIdx.syncItemToAccountProduct(invCtx, loneItem.id), { synced: false, reason: "unlinked" });
  eq("IV13.2 item ไม่มีจริง → item-not-found", await accIdx.syncItemToAccountProduct(invCtx, "ไม่มีจริง"), { synced: false, reason: "item-not-found" });
  eq("IV13.3 สินค้าบัญชีที่ไม่ผูก → unlinked", await link.syncProductToItem(accCtx, pPlain), { synced: false, reason: "unlinked" });
  const noAcc = await makeShop("QC INVITEM NOACC", { account: false });
  const noAccItem = await inv.createItem({ tenantId: noAcc.tenantId, systemId: noAcc.invSystemId }, { sku: "NA-1", name: "ร้านไม่มีบัญชี" });
  await prisma.invItem.updateMany({ where: { id: noAccItem.id }, data: { accountProductId: "ไม่มีจริง" } });
  eq(
    "IV13.4 ร้านที่ยังไม่เปิดระบบบัญชี → no-account-system (ไม่ throw)",
    await accIdx.syncItemToAccountProduct({ tenantId: noAcc.tenantId, systemId: noAcc.invSystemId }, noAccItem.id),
    { synced: false, reason: "no-account-system" },
  );
  let noInvOk = true;
  const noInv = await makeShop("QC INVITEM NOINV", { inventory: false });
  const noInvProd = await prod.createProduct(noInv.tenantId, noInv.accSystemId, { name: "สินค้าในร้านที่ไม่มีคลัง", type: "GOODS", vatRateBp: 700 });
  const noInvLink = noInvProd.ok
    ? await link.linkProductToItem({ tenantId: noInv.tenantId, systemId: noInv.accSystemId }, noInvProd.id, { createItem: {} })
    : { ok: false as const, reason: "สร้างสินค้าไม่สำเร็จ" };
  assert("IV13.5 ร้านที่ยังไม่เปิดระบบคลัง: บอกเหตุผลเป็นภาษาไทย ไม่ throw", noInvOk && !noInvLink.ok && /คลังสินค้า/.test(noInvLink.ok ? "" : noInvLink.reason), JSON.stringify(noInvLink));
  const noInvIssue = noInvProd.ok
    ? await prod.createGoodsMovement({ tenantId: noInv.tenantId, systemId: noInv.accSystemId, docType: "GOODS_ISSUE", lines: [{ productId: noInvProd.id, qty: 1 }], allowNegative: true })
    : { ok: false as const, reason: "" };
  assert("IV13.6 สินค้าที่ไม่ผูกคลัง ในร้านที่ไม่มีระบบคลัง — ยังเบิกได้ปกติ", noInvIssue.ok, noInvIssue.ok ? "" : noInvIssue.reason);

  // ═════════ IV14 — บริการ ═════════
  console.log("\nIV14 บริการไม่ติดตามสต็อก");
  const pSvc = await mk({ sku: "QC-SVC", name: "ค่าบริการ (QC)", type: "SERVICE" });
  const svcLink = await link.linkProductToItem(accCtx, pSvc, { createItem: {} });
  assert("IV14.1 สินค้าชนิด “บริการ” ผูกคลังไม่ได้", !svcLink.ok && /บริการ/.test(svcLink.ok ? "" : svcLink.reason), JSON.stringify(svcLink));
  const svcItem = await inv.createItem(invCtx, { sku: "QC-SVC-ITEM", name: "บริการในคลัง", kind: "SERVICE", durationMin: 30 });
  const pGoods = await mk({ sku: "QC-G2", name: "สินค้าจะผูกกับบริการ (QC)" });
  const svcLink2 = await link.linkProductToItem(accCtx, pGoods, { itemId: svcItem.id });
  assert("IV14.2 ผูกกับ item ชนิดบริการไม่ได้", !svcLink2.ok && /บริการ/.test(svcLink2.ok ? "" : svcLink2.reason), JSON.stringify(svcLink2));
} catch (e) {
  bad("CRASH", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ล้างแบบ best-effort */
    }
  };
  for (const id of tenantIds) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: id } }));
    for (const m of [
      "accountProduct", "accountUnit", "accountCategory", "accountMapping", "accountLedger",
      "accountPeriod", "accountDocSequence", "accountSettings",
      "invMovement", "invLot", "invLocationStock", "invLocation", "invItemImage", "invItem", "invSettings", "invCategory",
      "appNotification", "outboxEvent", "appSystemUnit", "appSystem",
    ]) {
      await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  console.log(`\n🧹 ลบร้านทดสอบ ${tenantIds.length} ร้าน`);
}

console.log(`\n===== QC WO 4.1 · InvItem canonical สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
