// ops/me.ts — op ของ "ตัวลูกค้าเอง" (MEMBER-API §2.20 · M1.11)
//
// 🔴 ช่องทางนี้เป็นของ **ลูกค้า** ไม่ใช่ของร้าน: `/me/*` ตอบจาก session ลูกค้า (LIFF / ในแอป)
//    ที่ผูกกับ `customerId` คนเดียว — คีย์ API ของร้านไม่มีทางเป็น "ลูกค้าคนนั้น" ได้เลย
//    ⇒ ประกาศไว้ในทะเบียนตั้งแต่ตอนนี้ (สัญญา/เอกสาร/OpenAPI ต้องบอกความจริงว่ามีเส้นทางนี้)
//      แต่ตอบ 401 `customer_session_required` เมื่อถูกเรียกด้วยคีย์ — ไม่ใช่ 403 `scope_missing`
//      เพราะ 403 จะทำให้ผู้เชื่อมต่อไล่เติม scope ไปเรื่อย ๆ ทั้งที่ **ไม่มี scope ไหนเปิดทางนี้ได้**
//    ทางเข้าจริงมาในใบ M2.9 (session ลูกค้า `platform_auth` + หน้า `/m/*`)
//
// ทำไม `action` เป็นคีย์อ่าน/แก้ของลูกค้าทั่วไป: ด่านสิทธิ์ของแกน REST ต้องผ่านก่อนถึง handler
// ⇒ ถ้าตั้ง action เป็นคีย์ที่ไม่มีใครมี ผู้เรียกจะได้ 403 ก่อนเห็นเหตุผลจริง

import { z } from "zod";
import { ApiError } from "@/lib/api/respond";
import { defineMemberOp, type ApiOp } from "../op";

/** ทุก op ของช่องทางลูกค้า ตอบเหมือนกันเมื่อผู้เรียกไม่ใช่ตัวลูกค้าเอง */
function requireCustomerSession(): never {
  throw new ApiError(
    401,
    "customer_session_required",
    "เส้นทางนี้เป็นของลูกค้าเอง (เข้าผ่านบัตรสมาชิกในไลน์หรือในแอป) — คีย์ API ของร้านใช้ไม่ได้ " +
      "ถ้าต้องการอ่านหรือแก้ข้อมูลสมาชิกในนามร้าน ใช้ /members/{id} แทน",
    "This lane belongs to the customer and needs a customer session. Use the shop-facing /members endpoints instead.",
    "ไม่มีชุดสิทธิ์ใดของคีย์ที่เปิดเส้นทาง /me ได้",
  );
}

const meGet = defineMemberOp({
  id: "me.get",
  method: "GET",
  path: "/me",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The signed-in customer's own profile and the fields the shop lets them see. Needs a customer session (LIFF or the mobile app); a shop API key gets 401 customer_session_required.",
  label: "โปรไฟล์ของฉัน",
  test: "M1.11-S2.10",
  async handler() {
    return requireCustomerSession();
  },
});

const meUpdate = defineMemberOp({
  id: "me.update",
  method: "PATCH",
  path: "/me",
  kind: "write",
  action: "member.customer.update",
  summary:
    "The signed-in customer edits their own details. Only fields the shop marked as customer editable may be sent. Needs a customer session; a shop API key gets 401 customer_session_required.",
  label: "แก้ไขข้อมูลของฉัน",
  input: z
    .object({
      fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
        .optional()
        .describe("Only field keys whose `customerEditable` is true in GET /fields/layout?audience=customer."),
    })
    .strict(),
  test: "M1.11-S2.10",
  async handler() {
    return requireCustomerSession();
  },
});

const meCard = defineMemberOp({
  id: "me.card",
  method: "GET",
  path: "/me/card",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The signed-in customer's membership card: member code, tier and a short lived QR token staff can scan at the counter. Needs a customer session; a shop API key gets 401 customer_session_required.",
  label: "บัตรสมาชิกของฉัน",
  test: "M1.11-S2.10",
  async handler() {
    return requireCustomerSession();
  },
});

export const ME_OPS: ApiOp[] = [meGet, meUpdate, meCard];
