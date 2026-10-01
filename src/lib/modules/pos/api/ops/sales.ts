// ops/sales.ts — op เปิดบิล / ยกเลิกบิลของ POS (ใบ P0.2)
//
// คู่กับ tool เดิมของผู้ช่วย AI `pos_create_sale` / `void_sale` (สกิล `sales` · ทั้งคู่เดินทาง proposal ใน proposals.ts)
// 🔴 ใบนี้ไม่เปลี่ยนทางเดินของ tool เดิม (มติผู้คุมงานข้อ 1) — op ที่นี่คือ "แหล่งความจริงในอนาคต" ของ REST + AI (P2.13/P3.9)
// 🔴 handler เรียกบริการเดิมผ่าน facade `pos/index` เท่านั้น (`createSale` · `voidSale`) — ไม่มีตรรกะเงินใหม่
//    สิ่งที่ทำที่นี่มีแค่ "ด่าน id": id ที่มาจากผู้เรียก (unitId / saleId) ถูก resolve ซ้ำกับร้าน + ระบบ POS ของ actor ก่อนเสมอ
//    (ไม่เชื่อ id จาก client — กติกา COMMON · X2)

import { z } from "zod";
import { ApiError } from "@/lib/api/respond";
import { tenantDb } from "@/lib/core/db";
import { createSale, voidSale } from "../../index";
import { posUnitIsLinked } from "../../register";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";

/** เพดานบรรทัดต่อบิล — กัน payload ยักษ์ (หน้าขายจริงไม่เคยถึง) */
const MAX_LINES = 200;

/** วิธีจ่ายที่ผู้เรียกภายนอกใช้ได้ (เท่ากับ tool เดิม) — DEPOSIT / ROOM_CHARGE เป็นทางภายในของโมดูลอื่น (มี refSaleId) */
const EXTERNAL_PAY_TYPES = ["CASH", "TRANSFER", "PROMPTPAY"] as const;

const satang = z.number().int().min(0);

const createInput = z
  .object({
    unitId: z.string().min(1).max(64).describe("Branch / point of sale (BusinessUnit id) linked to this POS system."),
    lines: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200).describe("Line name as printed on the receipt."),
            qty: z.number().int().min(1).max(100_000).describe("Quantity (whole number)."),
            unitPriceSatang: satang.describe("Unit price in satang (baht x 100)."),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_LINES)
      .describe("Bill lines. Free-text lines only in this version (no stock item / member / coupon links yet)."),
    payMethods: z
      .array(
        z
          .object({
            type: z.enum(EXTERNAL_PAY_TYPES).describe("CASH, TRANSFER or PROMPTPAY."),
            amountSatang: satang.describe("Amount paid with this method, in satang."),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .describe("Payments. The sum must equal the bill total exactly."),
  })
  .strict();

const salesCreate = definePosOp({
  id: "sales.create",
  method: "POST",
  path: "/sales",
  kind: "write",
  action: POS_SCOPES.saleCreate,
  summary: "Open and pay a POS bill in one step. Payments must add up to the bill total exactly (all amounts in satang).",
  label: "เปิดบิลขาย",
  input: createInput,
  test: "POS-P0.2-OP.3",
  auditTarget: ({ data }) => {
    const id = typeof data === "object" && data !== null ? (data as { saleId?: unknown }).saleId : null;
    return typeof id === "string" && id ? { targetType: "PosSale", targetId: id } : null;
  },
  async handler({ actor, input, idempotencyKey }) {
    // ด่าน id: สาขาต้องผูกกับระบบ POS ของ actor จริง (ร้านอื่น/ระบบอื่น = ไม่พบ · ไม่บอกว่ามีอยู่)
    if (!(await posUnitIsLinked(actor.tenantId, actor.systemId, input.unitId))) {
      throw new ApiError(404, "not_found", "ไม่พบจุดขายนี้ในระบบขายหน้าร้านที่เชื่อมไว้", "The point of sale was not found in this POS system.");
    }
    // createSale ต้องมีคีย์กันซ้ำเสมอ — REST บังคับ Idempotency-Key ที่ dispatch แล้ว · ทางอื่นต้องส่งมาเอง
    if (!idempotencyKey) {
      throw new ApiError(400, "idempotency_required", "ต้องส่งคีย์กันซ้ำ (Idempotency-Key) มากับการเปิดบิล", "An Idempotency-Key is required to open a bill.");
    }
    return createSale({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      systemId: actor.systemId,
      sourceModule: actor.kind === "apikey" ? "API" : "AI",
      ...(actor.keyId ? { sourceId: actor.keyId } : {}),
      // แยก namespace จากคีย์ภายใน (`ai-<proposalId>` ของ proposals.ts) — คีย์ภายนอกชนของภายในไม่ได้
      idempotencyKey: `api:${actor.systemId}:${idempotencyKey}`,
      lines: input.lines,
      payMethods: input.payMethods,
    });
  },
});

const voidInput = z
  .object({ reason: z.string().trim().min(5).max(500).describe("Why the bill is voided. Stored in the audit log.") })
  .strict();

const salesVoid = definePosOp({
  id: "sales.void",
  method: "POST",
  path: "/sales/{id}/void",
  kind: "danger",
  action: POS_SCOPES.saleVoid,
  summary: "Void a paid POS bill. Reverses accounting, coupons, member rights and stock. Cannot be undone.",
  label: "ยกเลิกบิลขาย",
  input: voidInput,
  test: "POS-P0.2-OP.4",
  auditTarget: ({ params }) => (params.id ? { targetType: "PosSale", targetId: params.id } : null),
  async handler({ actor, params }) {
    const saleId = params.id ?? "";
    // ด่าน id: บิลต้องเป็นของร้าน + ระบบ POS ของ actor (tenantDb ผูก tenantId+systemId ให้เอง)
    const sale = await tenantDb({ tenantId: actor.tenantId, systemId: actor.systemId }).posSale.findFirst({
      where: { id: saleId },
      select: { id: true, unitId: true, status: true },
    });
    if (!sale) {
      throw new ApiError(404, "not_found", "ไม่พบบิลนี้ในระบบขายหน้าร้าน", "The bill was not found in this POS system.");
    }
    if (sale.status !== "PAID") {
      throw new ApiError(409, "state_conflict", `บิลนี้ยกเลิกไม่ได้ (สถานะปัจจุบัน: ${sale.status})`, "Only paid bills can be voided.");
    }
    await voidSale(actor.tenantId, sale.unitId, sale.id);
    return { saleId: sale.id, status: "VOIDED" as const };
  },
});

export const SALES_OPS: ApiOp[] = [salesCreate, salesVoid];
