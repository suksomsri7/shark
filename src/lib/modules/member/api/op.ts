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

/**
 * ใครเรียก op นี้ได้ (M3.10) — 3 เลนของ REST ระบบสมาชิก:
 *   `key`      คีย์ API ของร้าน (`shark_…`) + scope = `action` (ค่าปริยาย · op เกือบทั้งหมด)
 *   `customer` ตัวลูกค้าเอง (`cs_…` · path `/me/*`) — ไม่มี scope ใด ๆ · ดู `customer-lane.ts`
 *   `public`   ไม่ต้องมีอะไรเลย (path `/join/{tenantSlug}/*` · สมัครสมาชิกจากลิงก์ของร้าน) — ดู `public-lane.ts`
 */
export type MemberOpAuth = "key" | "customer" | "public";

/**
 * op ของระบบสมาชิก = `ApiOp` + 2 ช่องที่อ่านได้ตอนรันจริง (ข้อสอบ/คู่มือ/OpenAPI อ่านช่องเหล่านี้)
 *   `scope` — คีย์สิทธิ์ที่คีย์ API ต้องถือ (= `action`) · เลนสาธารณะ = `null` · เลนลูกค้า = `"customer"`
 *   `auth`  — เลนของ op (ดู `MemberOpAuth`)
 * 🔴 ช่องพวกนี้เป็นของโมดูล ไม่ใช่ของแกน — แกน REST ยังเห็นเป็น `ApiOp` ธรรมดาทุกประการ
 */
export type MemberApiOp = ApiOp & { scope: string | null; auth: MemberOpAuth };

type MemberOpDefinition<S extends ZodType | undefined> = Omit<
  Parameters<typeof defineOp<S>>[0],
  "module" | "auditAction"
> & {
  /** ไม่ระบุ = เดาจาก path: `/me` → customer · `/join/` → public · อื่น ๆ → key */
  auth?: MemberOpAuth;
};

/** เลนของ op จาก path — ค่าปริยายเมื่อผู้ประกาศไม่ระบุ `auth` */
export function memberAuthOfPath(path: string): MemberOpAuth {
  if (path === "/me" || path.startsWith("/me/")) return "customer";
  if (path.startsWith("/join/")) return "public";
  return "key";
}

/** อ่านเลนของ op ใด ๆ (op ที่ไม่ได้ประกาศผ่าน `defineMemberOp` = เดาจาก path) */
export function memberAuthOf(op: ApiOp): MemberOpAuth {
  const declared = (op as Partial<MemberApiOp>).auth;
  return declared === "key" || declared === "customer" || declared === "public" ? declared : memberAuthOfPath(op.path);
}

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
  const { auth: declaredAuth, ...rest } = def;
  const auth = declaredAuth ?? memberAuthOfPath(def.path);
  const base = defineOp<S>({
    auditTarget: memberAuditTarget(def.path),
    ...rest,
    module: "member",
    auditAction: `member.api.${def.id}`,
  });
  const op: MemberApiOp = { ...base, auth, scope: auth === "public" ? null : auth === "customer" ? "customer" : def.action };
  return op;
}

/** ctx ของ handler ที่รู้ชนิด input แล้ว */
export type MemberOpCtx<T> = ApiOpCtx<T>;
