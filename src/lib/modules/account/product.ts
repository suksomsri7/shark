// Account — สินค้า/บริการ + หน่วย + กลุ่มจัดประเภท + เบิก/คืนสินค้า (§3.4)
// scope = feature: ทุกตาราง tenantId + systemId · เงิน Int สตางค์ · จำนวน (qty) Decimal
// เบิกสินค้า (GOODS_ISSUE/GOODS_ISSUE_RETURN): ตัด/คืน qtyOnHand ใน $transaction — ไม่โพสต์ GL v1 (มูลค่า inventory 🔜)
// เจ้าของไฟล์นี้ = subagent Products (ไม่แตะ service.ts/actions.ts/ui.tsx/gl.ts/coa.ts/prisma)
import { prisma } from "@/lib/core/db";
import type {
  AccountDocType,
  AccountProductType,
  Prisma,
} from "@prisma/client";

// ─────────────────── ค่าคงที่ ───────────────────

export const GOODS_PREFIX: Record<"GOODS_ISSUE" | "GOODS_ISSUE_RETURN", string> = {
  GOODS_ISSUE: "GI",
  GOODS_ISSUE_RETURN: "GIR",
};

export const PRODUCT_TYPE_LABEL: Record<AccountProductType, string> = {
  GOODS: "สินค้า",
  SERVICE: "บริการ",
};

// จำนวนเป็นบาท (แสดง) — เงินสตางค์→บาท (คงรูปเดียวกับ service.ts baht())
export const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// จำนวน (Decimal) → string อ่านง่าย (ตัดศูนย์ท้าย)
export function qtyText(q: Prisma.Decimal | number | string): string {
  const n = Number(q);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 4 });
}

// ─────────────────── หน่วย (AccountUnit) ───────────────────

export function listUnits(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean },
) {
  return prisma.accountUnit.findMany({
    where: { tenantId, systemId, ...(opts?.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

export async function createUnit(
  tenantId: string,
  systemId: string,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const n = name.trim();
  if (!n) return { ok: false, reason: "กรุณากรอกชื่อหน่วย" };
  try {
    const u = await prisma.accountUnit.create({ data: { tenantId, systemId, name: n } });
    return { ok: true, id: u.id };
  } catch {
    return { ok: false, reason: "มีหน่วยชื่อนี้อยู่แล้ว" };
  }
}

export async function renameUnit(tenantId: string, systemId: string, id: string, name: string) {
  const n = name.trim();
  if (!n) return { ok: false as const, reason: "กรุณากรอกชื่อหน่วย" };
  await prisma.accountUnit.updateMany({ where: { id, tenantId, systemId }, data: { name: n } });
  return { ok: true as const };
}

export async function archiveUnit(tenantId: string, systemId: string, id: string) {
  await prisma.accountUnit.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: new Date() },
  });
}

// ─────────────────── กลุ่มจัดประเภท (AccountCategory) ───────────────────

export function listCategories(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean },
) {
  return prisma.accountCategory.findMany({
    where: { tenantId, systemId, ...(opts?.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

export function categoryAppliesTo(appliesTo: unknown): AccountDocType[] {
  if (!Array.isArray(appliesTo)) return [];
  return appliesTo.filter((x): x is AccountDocType => typeof x === "string");
}

export async function createCategory(
  tenantId: string,
  systemId: string,
  input: { name: string; appliesTo?: AccountDocType[] },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "กรุณากรอกชื่อกลุ่ม" };
  try {
    const c = await prisma.accountCategory.create({
      data: {
        tenantId,
        systemId,
        name,
        appliesTo: (input.appliesTo ?? []) as Prisma.InputJsonValue,
      },
    });
    return { ok: true, id: c.id };
  } catch {
    return { ok: false, reason: "มีกลุ่มชื่อนี้อยู่แล้ว" };
  }
}

export async function updateCategory(
  tenantId: string,
  systemId: string,
  id: string,
  input: { name?: string; appliesTo?: AccountDocType[] },
) {
  const data: Prisma.AccountCategoryUpdateManyMutationInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo as Prisma.InputJsonValue;
  await prisma.accountCategory.updateMany({ where: { id, tenantId, systemId }, data });
}

export async function archiveCategory(tenantId: string, systemId: string, id: string) {
  await prisma.accountCategory.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: new Date() },
  });
}

// ─────────────────── สินค้า/บริการ (AccountProduct) ───────────────────

export function listProducts(
  tenantId: string,
  systemId: string,
  opts?: { includeArchived?: boolean; type?: AccountProductType },
) {
  return prisma.accountProduct.findMany({
    where: {
      tenantId,
      systemId,
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
      ...(opts?.type ? { type: opts.type } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getProduct(tenantId: string, systemId: string, id: string) {
  return prisma.accountProduct.findFirst({ where: { id, tenantId, systemId } });
}

export type ProductInput = {
  sku?: string | null;
  name: string;
  nameEn?: string | null;
  type?: AccountProductType;
  unitId?: string | null;
  salePrice?: number | null; // สตางค์
  buyPrice?: number | null; // สตางค์
  vatRateBp?: number;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  imageUrl?: string | null;
};

export async function createProduct(
  tenantId: string,
  systemId: string,
  input: ProductInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "กรุณากรอกชื่อสินค้า/บริการ" };
  try {
    const p = await prisma.accountProduct.create({
      data: {
        tenantId,
        systemId,
        sku: input.sku?.trim() || null,
        name,
        nameEn: input.nameEn?.trim() || null,
        type: input.type ?? "GOODS",
        unitId: input.unitId || null,
        salePrice: input.salePrice ?? null,
        buyPrice: input.buyPrice ?? null,
        vatRateBp: input.vatRateBp ?? 700,
        incomeAccountId: input.incomeAccountId || null,
        expenseAccountId: input.expenseAccountId || null,
        imageUrl: input.imageUrl?.trim() || null,
      },
    });
    return { ok: true, id: p.id };
  } catch {
    return { ok: false, reason: "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่" };
  }
}

export async function updateProduct(
  tenantId: string,
  systemId: string,
  id: string,
  input: ProductInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "กรุณากรอกชื่อสินค้า/บริการ" };
  try {
    await prisma.accountProduct.updateMany({
      where: { id, tenantId, systemId },
      data: {
        sku: input.sku?.trim() || null,
        name,
        nameEn: input.nameEn?.trim() || null,
        type: input.type ?? "GOODS",
        unitId: input.unitId || null,
        salePrice: input.salePrice ?? null,
        buyPrice: input.buyPrice ?? null,
        vatRateBp: input.vatRateBp ?? 700,
        incomeAccountId: input.incomeAccountId || null,
        expenseAccountId: input.expenseAccountId || null,
        imageUrl: input.imageUrl?.trim() || null,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่" };
  }
}

export async function archiveProduct(
  tenantId: string,
  systemId: string,
  id: string,
  archived = true,
) {
  await prisma.accountProduct.updateMany({
    where: { id, tenantId, systemId },
    data: { archivedAt: archived ? new Date() : null },
  });
}

// ─────────────────── บัญชี GL (สำหรับ dropdown override รายได้/ค่าใช้จ่าย) ───────────────────

// รายได้ = INCOME · ค่าใช้จ่าย/ต้นทุน = COGS/EXPENSE — ถ้ายังไม่ seed ผังบัญชี จะได้ []
export function listIncomeAccounts(tenantId: string, systemId: string) {
  return prisma.accountLedger.findMany({
    where: { tenantId, systemId, archivedAt: null, type: "INCOME" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export function listExpenseAccounts(tenantId: string, systemId: string) {
  return prisma.accountLedger.findMany({
    where: { tenantId, systemId, archivedAt: null, type: { in: ["COGS", "EXPENSE"] } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

// ─────────────────── เลขรันเอกสารเบิก (จองใน tx เดียวกับ insert) ───────────────────

async function nextGoodsDocNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
  systemId: string,
  docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN",
  date: Date,
): Promise<string> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const periodKey = `${year}-${month}`;
  const prefix = GOODS_PREFIX[docType];
  const seq = await tx.accountDocSequence.upsert({
    where: { systemId_docType_periodKey: { systemId, docType, periodKey } },
    create: { tenantId, systemId, docType, prefix, periodKey, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
  });
  return `${prefix}-${year}-${month}-${String(seq.lastNo).padStart(4, "0")}`;
}

// ─────────────────── เบิก/คืนสินค้า (GOODS_ISSUE / GOODS_ISSUE_RETURN) ───────────────────

export type GoodsLineInput = {
  productId: string;
  qty: number; // จำนวนหน่วย (>0)
  description?: string | null;
};

// สร้างเอกสารเบิก/คืน + ตัด/คืน qtyOnHand ใน $transaction (ไม่โพสต์ GL)
// GOODS_ISSUE = ตัดสต็อก (qtyOnHand -= qty) · GOODS_ISSUE_RETURN = คืน (qtyOnHand += qty)
export async function createGoodsMovement(input: {
  tenantId: string;
  systemId: string;
  docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN";
  issueDate?: Date;
  contactId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  lines: GoodsLineInput[];
  allowNegative?: boolean; // GOODS_ISSUE: อนุญาตให้สต็อกติดลบ (default = กัน)
  createdById?: string | null;
}): Promise<{ ok: true; id: string; docNo: string } | { ok: false; reason: string }> {
  const clean = input.lines
    .map((l) => ({ productId: l.productId, qty: Number(l.qty), description: l.description ?? null }))
    .filter((l) => l.productId && Number.isFinite(l.qty) && l.qty > 0);
  if (clean.length === 0) return { ok: false, reason: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" };
  const sign = input.docType === "GOODS_ISSUE" ? -1 : 1;
  const issueDate = input.issueDate ?? new Date();

  try {
    const res = await prisma.$transaction(async (tx) => {
      // โหลดสินค้าที่อ้าง — ต้องเป็น GOODS + อยู่ในระบบเดียวกัน
      const ids = [...new Set(clean.map((l) => l.productId))];
      const products = await tx.accountProduct.findMany({
        where: { id: { in: ids }, tenantId: input.tenantId, systemId: input.systemId },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      for (const l of clean) {
        const p = byId.get(l.productId);
        if (!p) throw new Error("ไม่พบสินค้าในรายการ");
        if (p.type !== "GOODS") throw new Error(`"${p.name}" เป็นบริการ — เบิกสต็อกไม่ได้`);
      }
      // รวมจำนวนต่อสินค้า (กันเลือกสินค้าเดียวหลายบรรทัด)
      const deltaById = new Map<string, number>();
      for (const l of clean) {
        deltaById.set(l.productId, (deltaById.get(l.productId) ?? 0) + l.qty);
      }

      const docNo = await nextGoodsDocNo(tx, input.tenantId, input.systemId, input.docType, issueDate);
      const doc = await tx.accountDocument.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.systemId,
          docType: input.docType,
          docNo,
          status: "ISSUED",
          direction: "INTERNAL",
          issueDate,
          contactId: input.contactId || null,
          categoryId: input.categoryId || null,
          note: input.note?.trim() || null,
          createdById: input.createdById ?? null,
          lines: {
            create: clean.map((l, i) => ({
              tenantId: input.tenantId,
              systemId: input.systemId,
              sortOrder: i,
              description: l.description || byId.get(l.productId)!.name,
              qty: l.qty,
              unitName: null,
              unitPrice: 0, // ไม่โพสต์มูลค่า (inventory valuation 🔜)
              discount: 0,
              vatRateBp: 0,
              amount: 0,
              productId: l.productId,
            })),
          },
        },
      });

      // ตัด/คืน qtyOnHand ต่อสินค้า — กันติดลบถ้าไม่อนุญาต (GOODS_ISSUE เท่านั้น)
      for (const [productId, qty] of deltaById) {
        const p = byId.get(productId)!;
        const current = Number(p.qtyOnHand);
        const nextQty = current + sign * qty;
        if (sign < 0 && !input.allowNegative && nextQty < 0) {
          throw new Error(
            `สต็อก "${p.name}" ไม่พอ (คงเหลือ ${qtyText(current)}, เบิก ${qtyText(qty)})`,
          );
        }
        await tx.accountProduct.update({
          where: { id: productId },
          data: { qtyOnHand: nextQty },
        });
      }
      return { id: doc.id, docNo };
    });
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "บันทึกเอกสารเบิกไม่สำเร็จ" };
  }
}

// รายการเอกสารเบิก/คืนย้อนหลัง (ทั้งสองชนิด)
export function listGoodsMovements(
  tenantId: string,
  systemId: string,
  opts?: { take?: number },
) {
  return prisma.accountDocument.findMany({
    where: { tenantId, systemId, docType: { in: ["GOODS_ISSUE", "GOODS_ISSUE_RETURN"] } },
    orderBy: { issueDate: "desc" },
    take: opts?.take ?? 100,
    include: {
      contact: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, include: { product: { select: { name: true } } } },
    },
  });
}

// ความเคลื่อนไหวย้อนหลังต่อสินค้า (ledger การ์ดสต็อกอย่างง่าย)
export async function productMovements(
  tenantId: string,
  systemId: string,
  productId: string,
  opts?: { take?: number },
) {
  const lines = await prisma.accountDocumentLine.findMany({
    where: {
      tenantId,
      systemId,
      productId,
      document: { docType: { in: ["GOODS_ISSUE", "GOODS_ISSUE_RETURN"] } },
    },
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 100,
    include: { document: { select: { docNo: true, docType: true, issueDate: true, note: true } } },
  });
  return lines.map((l) => ({
    id: l.id,
    docNo: l.document.docNo,
    docType: l.document.docType,
    issueDate: l.document.issueDate,
    note: l.document.note,
    qty: Number(l.qty),
    delta: (l.document.docType === "GOODS_ISSUE" ? -1 : 1) * Number(l.qty),
  }));
}
