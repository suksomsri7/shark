// op.ts — ประกาศ op ของ API "ระบบสมาชิก" (M1.11)
//
// ห่อ `defineOp` ของแกนกลางไว้ชั้นเดียว เพื่อเติมของที่ทุก op ของโมดูลนี้ต้องมีเหมือนกัน:
//   `module: "member"` — ติดไปกับเอกสาร/บันทึก
//   `auditAction: "member.api.<id>"` — 🔴 คีย์สิทธิ์ของโมดูลนี้ 1 ตัวครอบหลาย op
//      (`member.customer.update` = แก้โปรไฟล์ · ตั้งแท็ก · ตั้งผู้ดูแล · ผูกช่องทาง · ตั้งความยินยอม)
//      ถ้าเขียน `action` ลง AuditLog ตรง ๆ เจ้าของร้านจะย้อนอ่านไม่ออกว่าคีย์ทำ "อะไร"
//
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม — บทเรียนเดียวกับบัญชี/บอร์ดงาน)

import type { ZodType } from "zod";
import { defineOp, type ApiOp, type ApiOpCtx } from "@/lib/api/op";

export type { ApiOp, ApiOpCtx, ApiOpKind, ApiMethod, ApiRateKind } from "@/lib/api/op";

type MemberOpDefinition<S extends ZodType | undefined> = Omit<
  Parameters<typeof defineOp<S>>[0],
  "module" | "auditAction"
>;

/**
 * เป้าหมายของแถว audit ปริยายของโมดูลนี้ = **สมาชิกที่ถูกแตะ**
 *   - op ที่ทำงานกับสมาชิกหนึ่งคน (`/members/{id}/...`) → `Customer` + id จาก path
 *   - op ที่ "สร้าง" สมาชิก → `Customer` + id ที่เพิ่งสร้าง (อ่านจากคำตอบของ handler)
 *   - op อื่น (ฟิลด์ · นโยบาย · ลิงก์ที่มา · ระดับ) → ไม่ระบุ ⇒ แกนกลางใช้ค่าปริยาย `ApiOp`
 *
 * 🔴 ทำไมต้องเป็นสมาชิก: ประวัติของโมดูลนี้ถูกอ่านจาก "โปรไฟล์ของลูกค้าคนหนึ่ง" เสมอ
 *    (§6.4 · หน้า 360 แท็บประวัติ · บันทึกการเข้าถึงข้อมูลอ่อนไหว) — ถ้าแถวที่มาจาก REST
 *    ชี้ไปที่ชื่อ op เจ้าของร้านจะเปิดโปรไฟล์แล้วไม่เห็นเลยว่าแอปคู่ค้าแก้อะไรไปบ้าง
 */
function memberAuditTarget(path: string) {
  return (a: { params: Record<string, string>; data: unknown }): { targetType: string; targetId: string } | null => {
    if (path.startsWith("/members/{id}")) {
      const id = a.params.id;
      return id ? { targetType: "Customer", targetId: id } : null;
    }
    const data = a.data;
    const created = typeof data === "object" && data !== null ? (data as { customerId?: unknown }).customerId : null;
    return typeof created === "string" && created ? { targetType: "Customer", targetId: created } : null;
  };
}

/** ประกาศ op ของระบบสมาชิก (ชนิดของ `input` มาจาก zod schema เหมือน `defineOp` ของแกนกลาง) */
export function defineMemberOp<S extends ZodType | undefined = undefined>(def: MemberOpDefinition<S>): ApiOp {
  return defineOp<S>({
    auditTarget: memberAuditTarget(def.path),
    ...def,
    module: "member",
    auditAction: `member.api.${def.id}`,
  });
}

/** ctx ของ handler ที่รู้ชนิด input แล้ว */
export type MemberOpCtx<T> = ApiOpCtx<T>;
