// ops/sales.ts — op เปิดบิล / ยกเลิกบิลของ POS (ใบ P0.2)
//
// คู่กับ tool เดิมของผู้ช่วย AI `pos_create_sale` / `void_sale` (สกิล `sales` · ทั้งคู่เดินทาง proposal ใน proposals.ts)
// 🔴 ใบนี้ไม่เปลี่ยนทางเดินของ tool เดิม (มติผู้คุมงานข้อ 1) — op ที่นี่คือ "แหล่งความจริงในอนาคต" ของ REST + AI (P2.13/P3.9)
// 🔴 ตรรกะเงินอยู่ที่บริการเดิมเท่านั้น: `createSale` · `voidSale` (ผ่าน facade `pos/index`)
//    + `posUnitIsLinked` (ด่านสาขา — import ไฟล์ในโมดูลเดียวกัน `../../register` ตรง ซึ่งกติกาโมดูลอนุญาต)
//    สิ่งที่ทำที่นี่มีแค่ "ด่าน": id ที่มาจากผู้เรียก (unitId / saleId) ถูก resolve ซ้ำกับร้าน + ระบบ POS ของ actor
//    + สิทธิ์สาขาของคน + ตรวจรูปเงินก่อนเข้า transaction (ไม่เชื่อ id จาก client — กติกา COMMON · X2)

import { z } from "zod";
import { actorRefId, type ApiActor } from "@/lib/api/actor";
import { ApiError } from "@/lib/api/respond";
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit } from "@/lib/core/rbac";
import { createSale, PosSaleError, voidSale } from "../../index";
import { posUnitIsLinked } from "../../register";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";

/** เพดานของคอลัมน์เงิน/จำนวน (Postgres Int — pos.prisma: PosSale.*Satang · PosSaleLine · PosPayment) */
export const POS_INT_MAX = 2_147_483_647;
/** เพดานบรรทัดต่อบิล — กัน payload ยักษ์ (หน้าขายจริงไม่เคยถึง) */
const MAX_LINES = 200;
/** เพดานจำนวนต่อบรรทัด — คู่กับเพดานราคาแล้วผลคูณรวม ≤ 200 × 10,000 × Int max ≈ 4.3e15 < 2^53 (เลข JS ยังแม่น) */
const MAX_QTY = 10_000;

/** วิธีจ่ายที่ผู้เรียกภายนอกใช้ได้ (เท่ากับ tool เดิม) — DEPOSIT / ROOM_CHARGE เป็นทางภายในของโมดูลอื่น (มี refSaleId) */
const EXTERNAL_PAY_TYPES = ["CASH", "TRANSFER", "PROMPTPAY"] as const;

const satang = z.number().int().min(0).max(POS_INT_MAX);

/**
 * input ของ `sales.create`
 * 🔴 op นี้ไม่รับส่วนลด/คูปอง/สมาชิก ⇒ ยอดบิล = Σ qty × ราคา พอดี ⇒ ตรวจ "จ่ายครบพอดี" และ "ไม่ล้นคอลัมน์ Int"
 *    ได้ตั้งแต่ชั้น schema (ตอบ 422 validation พร้อมช่องที่ผิด) ก่อนแตะ transaction ของบิลเลย
 */
const createInput = z
  .object({
    unitId: z.string().min(1).max(64).describe("Branch / point of sale (BusinessUnit id) linked to this POS system."),
    lines: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200).describe("Line name as printed on the receipt."),
            qty: z.number().int().min(1).max(MAX_QTY).describe(`Quantity (whole number, max ${MAX_QTY}).`),
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
  .strict()
  .superRefine((v, ctx) => {
    let total = 0;
    v.lines.forEach((l, i) => {
      const lineTotal = l.qty * l.unitPriceSatang;
      if (lineTotal > POS_INT_MAX) {
        ctx.addIssue({ code: "custom", path: ["lines", i], message: "ยอดของรายการนี้สูงเกินกว่าที่ระบบบันทึกได้ — แยกเป็นหลายบิล" });
      }
      total += lineTotal;
    });
    if (total > POS_INT_MAX) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "ยอดรวมของบิลสูงเกินกว่าที่ระบบบันทึกได้ — แยกเป็นหลายบิล" });
      return;
    }
    const paid = v.payMethods.reduce((s, p) => s + p.amountSatang, 0);
    if (paid !== total) {
      ctx.addIssue({
        code: "custom",
        path: ["payMethods"],
        message: `ยอดชำระรวม ${paid} สตางค์ ต้องเท่ากับยอดบิล ${total} สตางค์พอดี`,
      });
    }
  });

/**
 * คีย์กันซ้ำที่ส่งลง `createSale` — **ผูกกับผู้เรียก** แบบเดียวกับบัญชี (`payments-write.ts` serviceKey)
 * 🔴 ทำไมต้องมี actorRefId: ชั้น REST กันซ้ำต่อ "คีย์ API" (keyId + Idempotency-Key) แต่ `createSale` คืนบิลเดิม
 *    ของทั้งร้านเมื่อคีย์ตรงกัน โดยไม่เทียบเนื้อคำขอ ⇒ ถ้าผูกแค่ระบบ สองแอปที่บังเอิญใช้ Idempotency-Key ตัวเดียวกัน
 *    จะได้บิลของอีกแอปกลับไป และบิลของตัวเองหายเงียบ
 * ไม่มีคีย์ (ทางที่ไม่ใช่ REST) → ใช้ requestId = ไม่กันซ้ำข้ามคำขอ (เหมือนบัญชี)
 */
export function posSaleServiceKey(actor: ApiActor, idempotencyKey: string | null, requestId: string): string {
  return `api:${actorRefId(actor)}:${idempotencyKey ?? requestId}`;
}

/**
 * คนในร้าน (ผู้กดยืนยันข้อเสนอ AI / ผู้ช่วย) ต้องเข้าถึงสาขานั้นได้ — กติกาเดียวกับหน้าขาย (`actions/pos.ts` assertPosCan)
 * คีย์ API = การเชื่อมต่อระดับร้าน (แบบเดียวกับ member/api/actor) ⇒ ไม่ผูกสาขา ไม่ต้องตรวจ
 * ไม่ผ่าน = 404 (ไม่บอกว่าสาขา/บิลนั้นมีอยู่)
 */
export function actorCanUseUnit(actor: Pick<ApiActor, "kind" | "membership">, unitId: string): boolean {
  if (actor.kind === "apikey") return true;
  return canAccessUnit(actor.membership, unitId);
}

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
  async handler({ actor, input, idempotencyKey, requestId }) {
    // ด่าน id + สาขา: สาขาต้องผูกกับระบบ POS ของ actor จริง และคนต้องเข้าถึงสาขานั้นได้ (ไม่ผ่าน = ไม่พบ)
    if (!actorCanUseUnit(actor, input.unitId) || !(await posUnitIsLinked(actor.tenantId, actor.systemId, input.unitId))) {
      throw new ApiError(404, "not_found", "ไม่พบจุดขายนี้ในระบบขายหน้าร้านที่เชื่อมไว้", "The point of sale was not found in this POS system.");
    }
    return createSale({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      systemId: actor.systemId,
      sourceModule: actor.kind === "apikey" ? "API" : "AI",
      ...(actor.keyId ? { sourceId: actor.keyId } : {}),
      idempotencyKey: posSaleServiceKey(actor, idempotencyKey, requestId),
      lines: input.lines,
      payMethods: input.payMethods,
    });
  },
});

/**
 * ที่มาของบิลที่ op นี้ยกเลิกได้ = บิลของ POS เอง (หน้าขาย · ผู้ช่วย AI ของ POS · REST ของ POS)
 * บิลที่ระบบอื่นเปิด (createSale ถูกเรียกจาก hotel/restaurant/booking/…) ต้องยกเลิกจากระบบต้นทาง
 * เพราะระบบนั้นมีสถานะของตัวเอง (การจอง/ออเดอร์/ตั๋ว/บัตรกำนัล) ที่ voidSale ไม่รู้จัก
 */
export const POS_NATIVE_SOURCES: readonly string[] = ["POS", "AI", "API"];

/** ชื่อไทยของระบบต้นทาง (ค่า `sourceModule` ที่โค้ดเขียนจริงตอน 1 ต.ค. 2569) */
const SOURCE_LABEL_TH: Record<string, string> = {
  HOTEL: "ระบบโรงแรม",
  RESTAURANT: "ระบบร้านอาหาร",
  BOOKING: "ระบบนัดหมาย/จองบริการ",
  TICKET: "ระบบขายตั๋ว",
  ECOM: "ร้านค้าออนไลน์",
  MEMBER: "ระบบสมาชิก (บัตรกำนัล/สมาชิกรายเดือน)",
  CLINIC: "ระบบคลินิก",
  RENTAL: "ระบบเช่า",
  SCHOOL: "ระบบโรงเรียน/คอร์สเรียน",
};

/** บิลจากระบบอื่น → 409 พร้อมบอกว่าต้องไปยกเลิกที่ไหน · บิลของ POS เอง → null */
export function foreignSaleError(sourceModule: string | null): ApiError | null {
  const src = sourceModule ?? "POS";
  if (POS_NATIVE_SOURCES.includes(src)) return null;
  const where = SOURCE_LABEL_TH[src] ?? "ระบบต้นทางที่เปิดบิลนี้";
  return new ApiError(
    409,
    "state_conflict",
    `บิลนี้เปิดมาจาก${where} — กรุณายกเลิกจากระบบนั้น เพื่อให้การจอง/ออเดอร์ที่ผูกอยู่ถูกยกเลิกไปพร้อมกัน`,
    "This bill was opened by another system. Cancel it from that system instead.",
  );
}

/** ข้อความที่ `voidSale` โยนเมื่อบิลไม่อยู่ในสถานะ PAID (service.ts — ตรวจซ้ำใน tx) */
const VOID_STATE_MESSAGE = "บิลนี้ void ไม่ได้";

/** error ของ voidSale → 409 เมื่อเป็นเรื่องสถานะ (บิลถูกยกเลิกไปแล้วระหว่างตรวจกับลงมือ · กะของบิลปิดแล้ว) · อื่น ๆ ปล่อยผ่าน */
export function voidErrorToApi(e: unknown): unknown {
  if (e instanceof Error && e.message === VOID_STATE_MESSAGE) {
    return new ApiError(409, "state_conflict", "บิลนี้ถูกยกเลิกไปแล้วหรือไม่อยู่ในสถานะที่ยกเลิกได้", "Only paid bills can be voided.");
  }
  // POS P1.9 R2 F5 ▸ S11: บิลหน้าขายในกะที่ปิดแล้ว = 409 (ไม่ใช่ 500) ◂
  if (e instanceof PosSaleError && e.code === "SHIFT_CLOSED") {
    return new ApiError(409, "state_conflict", "กะของบิลนี้ปิดแล้ว — ยกเลิกบิลไม่ได้ ใช้การคืนเงินแทน", "The shift of this bill is closed. Use a refund instead.");
  }
  return e;
}

const voidInput = z
  .object({ reason: z.string().trim().min(5).max(500).describe("Why the bill is voided. Stored in the audit log.") })
  .strict();

const salesVoid = definePosOp({
  id: "sales.void",
  method: "POST",
  path: "/sales/{id}/void", // ไม่มีใน POS-API §3 (มีแค่ refund) — ตัดสินที่ P2.13
  kind: "danger",
  action: POS_SCOPES.saleVoid,
  summary: "Void a paid POS bill opened at the point of sale. Reverses accounting, coupons, member rights and stock. Cannot be undone.",
  label: "ยกเลิกบิลขาย",
  input: voidInput,
  test: "POS-P0.2-OP.4",
  auditTarget: ({ params }) => (params.id ? { targetType: "PosSale", targetId: params.id } : null),
  async handler({ actor, params }) {
    const saleId = params.id ?? "";
    // ด่าน id: บิลต้องเป็นของร้าน + ระบบ POS ของ actor (tenantDb ผูก tenantId+systemId ให้เอง)
    const sale = await tenantDb({ tenantId: actor.tenantId, systemId: actor.systemId }).posSale.findFirst({
      where: { id: saleId },
      select: { id: true, unitId: true, status: true, sourceModule: true },
    });
    if (!sale || !actorCanUseUnit(actor, sale.unitId)) {
      throw new ApiError(404, "not_found", "ไม่พบบิลนี้ในระบบขายหน้าร้าน", "The bill was not found in this POS system.");
    }
    const foreign = foreignSaleError(sale.sourceModule);
    if (foreign) throw foreign;
    if (sale.status !== "PAID") {
      throw new ApiError(409, "state_conflict", `บิลนี้ยกเลิกไม่ได้ (สถานะปัจจุบัน: ${sale.status})`, "Only paid bills can be voided.");
    }
    try {
      await voidSale(actor.tenantId, sale.unitId, sale.id);
    } catch (e) {
      throw voidErrorToApi(e);
    }
    return { saleId: sale.id, status: "VOIDED" as const };
  },
});

export const SALES_OPS: ApiOp[] = [salesCreate, salesVoid];
