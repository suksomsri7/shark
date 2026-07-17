import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import * as approval from "@/lib/modules/approval/service";
import * as invSvc from "./service";
import type { Ctx } from "./service";

// Procurement (WO-0028) — จัดซื้อเข้าคลัง (ระบบ INVENTORY): Supplier → PO → รับของ → movement
// ⚠️ การเข้าสต็อกจริง "ต้อง" ผ่าน invSvc.receive เท่านั้น (idempotencyKey `po-<lineId>`)
//    ห้ามแตะ InvItem.onHand / InvMovement ตรง ๆ ที่นี่ — ให้ ledger เป็น source of truth เดียว
// scope: Supplier/PurchaseOrder = system-scoped · PoLine = tenant-scoped (query ผ่าน poId)
//    → tenantDb(ctx) inject filter ให้ครบทุก query (defense-in-depth ชั้น 2)

// ───────────── Supplier ─────────────

export type CreateSupplierInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
};

export async function createSupplier(ctx: Ctx, input: CreateSupplierInput): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("กรุณาระบุชื่อซัพพลายเออร์");
  const sup = await tenantDb(ctx).supplier.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      note: input.note?.trim() || null,
    },
  });
  return { id: sup.id };
}

export async function listSuppliers(ctx: Ctx) {
  return tenantDb(ctx).supplier.findMany({ orderBy: { createdAt: "desc" } });
}

// ───────────── Vendor Portal (WO-0059) — ลิงก์พกพา read-only ต่อ supplier ─────────────
// ผู้ขายเปิดลิงก์ /vendor/<token> เห็น PO ของตัวเองอย่างเดียว (ไม่ต้องล็อกอิน)

// เปิด/หมุนลิงก์ผู้ขาย — สุ่ม token ใหม่ทุกครั้ง (crypto 24 ไบต์ → base64url 32 ตัว ≥20 · ห้าม Math.random)
//   เรียกซ้ำ = rotate: token เดิมใช้ไม่ได้ทันที (portalToken @unique ทับค่าเดิม)
export async function enableVendorPortal(ctx: Ctx, supplierId: string): Promise<{ token: string }> {
  const token = randomBytes(24).toString("base64url");
  const res = await tenantDb(ctx).supplier.updateMany({
    where: { id: supplierId },
    data: { portalToken: token },
  });
  if (res.count === 0) throw new Error("ไม่พบซัพพลายเออร์");
  return { token };
}

// ปิดลิงก์ผู้ขาย — portalToken = null (ลิงก์เดิมตายทันที) · false ถ้าไม่พบในขอบเขต
export async function disableVendorPortal(ctx: Ctx, supplierId: string): Promise<boolean> {
  const res = await tenantDb(ctx).supplier.updateMany({
    where: { id: supplierId },
    data: { portalToken: null },
  });
  return res.count > 0;
}

// view สาธารณะจาก token — { supplier: { name }, pos: [...] } | null
//   token ปลอม/ปิดแล้ว → null · เห็นเฉพาะ PO ของ supplier ตัวเอง เรียงใหม่ก่อน · ไม่มี token/ข้อมูล supplier อื่นหลุด
export async function getVendorPortalView(
  token: string,
): Promise<{ supplier: { name: string }; pos: { code: string; status: string; totalSatang: number; createdAt: Date }[] } | null> {
  const t = token?.trim();
  if (!t) return null;
  // public: ยังไม่รู้ tenant จนกว่าจะ resolve token → prisma ตรงครั้งเดียว
  //   (portalToken เป็น @unique ระดับ global — ปลอดภัยไม่ต้องมี tenant filter ตรงจุดนี้)
  const supplier = await prisma.supplier.findUnique({ where: { portalToken: t } });
  if (!supplier) return null;
  // จากนั้น query PO ต่อด้วย tenant/system ของ supplier เอง (defense-in-depth ชั้น 2 — เห็นเฉพาะ scope ตัวเอง)
  const ctx: Ctx = { tenantId: supplier.tenantId, systemId: supplier.systemId };
  const pos = await tenantDb(ctx).purchaseOrder.findMany({
    where: { supplierId: supplier.id },
    include: { lines: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    supplier: { name: supplier.name },
    pos: pos.map((po) => ({
      code: po.code,
      status: po.status,
      totalSatang: po.lines.reduce((s, l) => s + l.qty * l.costSatang, 0),
      createdAt: po.createdAt,
    })),
  };
}

// ───────────── Purchase Order ─────────────

export type PoLineInput = { itemId: string; qty: number; costSatang: number };
export type CreatePoInput = {
  supplierId: string;
  note?: string | null;
  lines: PoLineInput[];
};

// running code `PO-0001` ต่อระบบ — ระวัง race:
//   นับ count+1 แล้วสร้างภายใน tx · ถ้าโดน unique (@@unique[systemId, code]) ชนจากคนสร้างพร้อมกัน
//   → P2002 แล้ว retry (recount) — ไม่ใช้ counter table / upsert (กติกาห้าม upsert)
export async function createPo(ctx: Ctx, input: CreatePoInput): Promise<{ id: string; code: string }> {
  const lines = input.lines ?? [];
  if (lines.length === 0) throw new Error("ใบสั่งซื้อต้องมีรายการสินค้าอย่างน้อย 1 รายการ");

  const db = tenantDb(ctx);
  const note = input.note?.trim() || null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await db.purchaseOrder.count();
    const code = `PO-${String(count + 1).padStart(4, "0")}`;
    try {
      const po = await db.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            supplierId: input.supplierId,
            code,
            status: "DRAFT",
            note,
          },
        });
        await tx.poLine.createMany({
          data: lines.map((l) => ({
            tenantId: ctx.tenantId,
            poId: created.id,
            itemId: l.itemId,
            qty: Math.max(0, Math.round(l.qty)),
            costSatang: Math.max(0, Math.round(l.costSatang)),
          })),
        });
        return created;
      });
      return { id: po.id, code: po.code };
    } catch (e) {
      // code ชนกับ PO ที่คนอื่นเพิ่งสร้าง → นับใหม่แล้วลองอีกครั้ง
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("สร้างใบสั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

// ยืนยันสั่งซื้อ (WO-0049b) — ผูกสายอนุมัติ:
//   ยอด PO = Σ qty×costSatang → resolvePolicy(PurchaseOrder, amountSatang)
//   · มีสายอนุมัติ → submitForApproval (requestedById = ผู้กด ?? "system") → PO **คง DRAFT** + คืน { pending: true }
//     (effect ใน approval-effects.ts จะเปลี่ยนเป็น ORDERED เองหลังอนุมัติครบขั้น)
//   · ไม่มีสายอนุมัติ → DRAFT→ORDERED (+orderedAt) เหมือนเดิม + คืน true (caller boolean เดิมไม่พัง)
//   · ไม่พบ/ไม่ใช่ DRAFT → false (guard กัน race)
export async function markOrdered(
  ctx: Ctx,
  poId: string,
  actorUserId?: string,
): Promise<boolean | { pending: true }> {
  // ต้องเป็น DRAFT ก่อน + ต้องรู้ยอดรวมเพื่อ resolve สายอนุมัติตามวงเงิน
  const po = await tenantDb(ctx).purchaseOrder.findFirst({
    where: { id: poId, status: "DRAFT" },
    include: { lines: true },
  });
  if (!po) return false; // ไม่พบ/ไม่ใช่ DRAFT

  const amountSatang = po.lines.reduce((s, l) => s + l.qty * l.costSatang, 0);
  const policy = await approval.resolvePolicy(
    { tenantId: ctx.tenantId },
    { entityType: "PurchaseOrder", systemId: ctx.systemId, amountSatang },
  );
  if (policy) {
    // มีสายอนุมัติ → ยื่นเข้าสาย · PO คง DRAFT จน effect อนุมัติค่อยเปลี่ยนเป็น ORDERED
    await approval.submitForApproval(
      { tenantId: ctx.tenantId },
      {
        entityType: "PurchaseOrder",
        entityId: poId,
        systemId: ctx.systemId,
        amountSatang,
        requestedById: actorUserId ?? "system",
      },
    );
    return { pending: true };
  }

  // ไม่มีสายอนุมัติ → พฤติกรรมเดิม
  const res = await tenantDb(ctx).purchaseOrder.updateMany({
    where: { id: poId, status: "DRAFT" },
    data: { status: "ORDERED", orderedAt: new Date() },
  });
  return res.count > 0;
}

// poIds ที่มีคำขออนุมัติค้าง (PENDING) — ใช้โชว์ป้าย "รออนุมัติ" ในหน้า PO (WO-0049b)
//   อ่านตาราง ApprovalRequest ผ่าน tenantDb (tenant-scoped) เพื่อแสดงผลเท่านั้น
//   (การ "เดินเรื่อง" อนุมัติทั้งหมดยังผ่าน approval facade — read นี้ไม่เปลี่ยนสถานะใด ๆ)
export async function pendingApprovalPoIds(ctx: Ctx): Promise<Set<string>> {
  const rows = await tenantDb(ctx).approvalRequest.findMany({
    where: { entityType: "PurchaseOrder", status: "PENDING" },
    select: { entityId: true },
  });
  return new Set(rows.map((r) => r.entityId));
}

// ORDERED → RECEIVED (+ receivedAt) แล้วรับทุก line เข้าสต็อกผ่าน invSvc.receive
//   - เปลี่ยนสถานะแบบ conditional (where status=ORDERED) ก่อน → คนเดียวชนะ = กันรับซ้ำ/race
//   - invSvc.receive idempotencyKey `po-<lineId>` → ต่อให้เรียกซ้ำก็ไม่เบิ้ลสต็อก
// opts.locationId = คลังปลายทางที่รับของเข้า (ไม่ส่ง = คลังหลัก) — WO-0037
export async function receivePo(ctx: Ctx, poId: string, opts?: { locationId?: string }): Promise<{ ok: boolean; note: string }> {
  const flipped = await tenantDb(ctx).purchaseOrder.updateMany({
    where: { id: poId, status: "ORDERED" },
    data: { status: "RECEIVED", receivedAt: new Date() },
  });
  if (flipped.count === 0) {
    return { ok: false, note: "รับของได้เฉพาะใบสั่งซื้อที่สถานะ “สั่งซื้อแล้ว” เท่านั้น" };
  }

  const lines = await tenantDb(ctx).poLine.findMany({ where: { poId } });
  for (const line of lines) {
    await invSvc.receive(ctx, {
      itemId: line.itemId,
      qty: line.qty,
      costSatang: line.costSatang,
      idempotencyKey: `po-${line.id}`,
      sourceModule: "procurement",
      refType: "PurchaseOrder",
      refId: poId,
      locationId: opts?.locationId ?? null,
    });
  }
  const total = lines.reduce((s, l) => s + l.qty, 0);
  return { ok: true, note: `รับของเข้าคลังแล้ว ${total.toLocaleString("th-TH")} ชิ้น` };
}

// DRAFT/ORDERED → CANCELLED · RECEIVED → false (ยกเลิกของที่รับเข้าคลังแล้วไม่ได้)
export async function cancelPo(ctx: Ctx, poId: string): Promise<boolean> {
  const res = await tenantDb(ctx).purchaseOrder.updateMany({
    where: { id: poId, status: { in: ["DRAFT", "ORDERED"] } },
    data: { status: "CANCELLED" },
  });
  return res.count > 0;
}

// รายละเอียด PO + lines (พร้อมชื่อ/หน่วยสินค้า) — null ถ้าไม่พบในขอบเขต
export async function poDetail(ctx: Ctx, poId: string) {
  const po = await tenantDb(ctx).purchaseOrder.findFirst({
    where: { id: poId },
    include: { lines: true },
  });
  if (!po) return null;

  const itemIds = [...new Set(po.lines.map((l) => l.itemId))];
  const items =
    itemIds.length > 0
      ? await tenantDb(ctx).invItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, sku: true, unitLabel: true },
        })
      : [];
  const byId = new Map(items.map((i) => [i.id, i]));

  return {
    ...po,
    lines: po.lines.map((l) => {
      const it = byId.get(l.itemId);
      return {
        ...l,
        itemName: it?.name ?? "(สินค้าถูกลบ)",
        itemSku: it?.sku ?? "",
        unitLabel: it?.unitLabel ?? "ชิ้น",
      };
    }),
  };
}

// ───────────── reads สำหรับ UI ─────────────

// รายการ PO (ล่าสุดก่อน) + ชื่อซัพพลายเออร์ + จำนวนรายการ + ยอดรวม (สตางค์)
export async function listPos(ctx: Ctx, take = 100) {
  const db = tenantDb(ctx);
  const [pos, suppliers] = await Promise.all([
    db.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, include: { lines: true }, take }),
    db.supplier.findMany({ select: { id: true, name: true } }),
  ]);
  const supName = new Map(suppliers.map((s) => [s.id, s.name]));
  return pos.map((po) => ({
    id: po.id,
    code: po.code,
    status: po.status,
    supplierName: supName.get(po.supplierId) ?? "(ไม่พบซัพพลายเออร์)",
    lineCount: po.lines.length,
    totalQty: po.lines.reduce((s, l) => s + l.qty, 0),
    totalSatang: po.lines.reduce((s, l) => s + l.qty * l.costSatang, 0),
    createdAt: po.createdAt,
  }));
}
