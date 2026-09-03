// Account — รายการจัดชุด (bundle): ขายชุด 1 หน่วย = ตัดสต็อก "ส่วนประกอบ" ตามสูตร (WO 4.3 · SPEC §8.2)
//
// ทำไมต้องแยกไฟล์: ตัวตัดสต็อกนี้ถูกเรียกจาก 2 ทางที่อยู่คนละชั้น
//   1) `service.issueDocument` — ออกใบแจ้งหนี้/ใบเสร็จที่มีบรรทัดเป็นสินค้าชนิด BUNDLE (ใน tx ของเอกสาร)
//   2) `index.applyExternalSale` — บิล POS ที่ส่งบรรทัดมา (นอก tx · หลังสร้างเอกสารบิลแล้ว)
// ถ้าเอาไปไว้ใน product.ts จะเกิด import วน (product.ts → service.ts → product.ts)
//
// 🔴 ห้าม import raw `prisma` ที่นี่ (fitness F5 baseline freeze = 45 ไฟล์ เต็มแล้ว)
//    ⇒ ไฟล์นี้ไม่เปิด transaction เอง — ผู้เรียกส่ง `tx` เข้ามาเสมอ
//    🐞 บทเรียน (4 ก.ย.): เคยเปิดเองด้วย `tenantDb(accCtx).$transaction` แล้วพัง —
//       extension ของ tenantDb ยัด `systemId = ระบบบัญชี` ลงไปในทุก query รวมถึงตาราง `InvItem`
//       ของ **ระบบคลัง** ⇒ `consumeInTx` หาสินค้าไม่เจอ ("ไม่พบสินค้าในคลัง") แล้วถูก catch กลืน
//       = ขายชุดแล้วสต็อกไม่ลด เงียบ ๆ · ตัวห่อ non-tx อยู่ที่ `product.consumeBundleComponentsForDoc`
// chokepoint account→inventory (fitness F2 · WO 4.1): แตะสต็อกผ่านโมดูลคลังอย่างเดียว
import type { Prisma } from "@prisma/client";
import * as inventory from "@/lib/modules/inventory/service";
import { inventorySystemId } from "./inventory-link";

type Db = Prisma.TransactionClient;
export type AccCtx = { tenantId: string; systemId: string };

/** ผลของการตัดสต็อกส่วนประกอบ 1 เอกสาร */
export type BundleConsumeResult = {
  /** จำนวน "บรรทัดส่วนประกอบ" ที่ตัดสต็อกจริง (0 = เอกสารนี้ไม่มีชุด หรือชุดไม่มีสูตร) */
  consumed: number;
  /** เหตุที่ข้าม (ภาษาอังกฤษล้วน — ห้าม log ข้อมูลลูกค้า) */
  reason?: string;
};

/**
 * ตัดสต็อกส่วนประกอบของ "รายการจัดชุด" ที่อยู่ในเอกสารขาย 1 ใบ
 *
 * กติกา
 *  - จำนวนที่ตัด = จำนวนชุดในบรรทัด × จำนวนส่วนประกอบต่อชุด (ปัดเป็นจำนวนเต็มหน่วยตามที่คลังรองรับ)
 *  - ส่วนประกอบที่ **ผูกคลัง** → `inventory.consumeInTx` (คีย์ `acc-issue-<lineId>-<componentId>` ⇒ ยิงซ้ำไม่ตัดเบิ้ล)
 *    แล้วเขียนกระจก `AccountProduct.qtyOnHand` ให้ตรงยอดคลัง
 *  - ส่วนประกอบที่ **ไม่ผูกคลัง** → ลด `qtyOnHand` ของตัวเอง (พฤติกรรมเดียวกับใบเบิกของ WO 4.1)
 *  - ไม่มีระบบคลัง/ลิงก์เสีย → **ข้ามเงียบ** ตาม §F.15 ("ไม่เชื่อม = ไม่ post") ไม่ล้มการออกเอกสารขาย
 *  - สต็อกติดลบได้ (ขายไปแล้วห้าม block) — คลังตั้งธง needsReview ให้เอง
 */
export async function consumeBundleComponentsInTx(
  tx: Db,
  ctx: AccCtx,
  docId: string,
): Promise<BundleConsumeResult> {
  const lines = await tx.accountDocumentLine.findMany({
    where: { documentId: docId, tenantId: ctx.tenantId, systemId: ctx.systemId, productId: { not: null } },
    select: { id: true, qty: true, productId: true },
    orderBy: { sortOrder: "asc" },
  });
  if (lines.length === 0) return { consumed: 0, reason: "no-product-lines" };

  const bundleIds = await tx.accountProduct.findMany({
    where: {
      id: { in: [...new Set(lines.map((l) => l.productId as string))] },
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: "BUNDLE",
    },
    select: { id: true },
  });
  if (bundleIds.length === 0) return { consumed: 0, reason: "no-bundle-line" };
  const isBundle = new Set(bundleIds.map((b) => b.id));

  const recipe = await tx.accountProductBundleItem.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, bundleProductId: { in: [...isBundle] } },
    orderBy: { sortOrder: "asc" },
  });
  if (recipe.length === 0) return { consumed: 0, reason: "bundle-without-recipe" };

  const components = await tx.accountProduct.findMany({
    where: {
      id: { in: [...new Set(recipe.map((r) => r.componentProductId))] },
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
    },
    select: { id: true, name: true, type: true, invItemId: true, warehouseId: true, qtyOnHand: true },
  });
  const compById = new Map(components.map((c) => [c.id, c]));

  // ระบบคลัง (resolve ครั้งเดียวต่อเอกสาร) — ไม่มี = ตัดเฉพาะตัวที่ไม่ผูกคลัง
  const needsInv = components.some((c) => c.invItemId);
  const invSystemId = needsInv ? await inventorySystemId(ctx.tenantId) : null;
  const invCtx = invSystemId ? { tenantId: ctx.tenantId, systemId: invSystemId } : null;

  let consumed = 0;
  for (const line of lines) {
    if (!line.productId || !isBundle.has(line.productId)) continue;
    const setQty = Number(line.qty);
    if (!Number.isFinite(setQty) || setQty <= 0) continue;
    for (const r of recipe.filter((x) => x.bundleProductId === line.productId)) {
      const comp = compById.get(r.componentProductId);
      // บริการในชุด (เช่น "ค่าบริการติดตั้ง") ไม่มีสต็อกให้ตัด — ข้ามโดยไม่ถือว่าผิด
      if (!comp || comp.type === "SERVICE") continue;
      const qty = Math.round(setQty * Number(r.qty));
      if (qty <= 0) continue;

      if (comp.invItemId) {
        if (!invCtx) continue; // §F.15 degrade — ไม่มีระบบคลัง = ไม่ตัด (ไม่ล้มการขาย)
        try {
          const mv = await inventory.consumeInTx(tx, invCtx, {
            itemId: comp.invItemId,
            qty,
            sourceModule: "ACCOUNT",
            refType: "AccountDocument",
            refId: docId,
            note: "ขายรายการจัดชุด",
            locationId: comp.warehouseId,
            idempotencyKey: `acc-issue-${line.id}-${comp.id}`,
          });
          await tx.accountProduct.update({ where: { id: comp.id }, data: { qtyOnHand: mv.balanceAfter } });
          consumed += 1;
        } catch (e) {
          // ลิงก์เสีย/ของในคลังหาย — ข้ามตัวนี้ ไม่ล้มทั้งเอกสาร (§F.15)
          // แต่ต้อง "ดังพอให้เห็น" ไม่งั้นสต็อกหายเงียบ ๆ (ห้าม log ชื่อสินค้า/ลูกค้า — เฉพาะรหัสเหตุ)
          console.warn(`[account/bundle] consume component failed: ${e instanceof Error ? e.message : "unknown"}`);
          continue;
        }
      } else {
        await tx.accountProduct.update({
          where: { id: comp.id },
          data: { qtyOnHand: Number(comp.qtyOnHand) - qty },
        });
        // อัปเดตในหน่วยความจำด้วย เผื่อชุดเดียวกันโผล่หลายบรรทัดในใบเดียว
        compById.set(comp.id, { ...comp, qtyOnHand: (Number(comp.qtyOnHand) - qty) as unknown as typeof comp.qtyOnHand });
        consumed += 1;
      }
    }
  }
  return { consumed };
}
