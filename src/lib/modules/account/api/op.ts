// op.ts — ชนิดของ "หนึ่ง endpoint" ในทะเบียน API บัญชี (WO A3 · แกนย้ายไปของกลางตอน K1.15)
//
// 🔴 ตัวจริงอยู่ที่ `src/lib/api/op.ts` แล้ว (บอร์ดงานใช้ตัวเดียวกัน) — ไฟล์นี้เหลือไว้เป็นชื่อเดิม
//    ให้ `ops/*.ts` ทั้ง 18 ไฟล์ import ต่อได้โดยไม่ต้องแก้ทีละไฟล์ · พฤติกรรมเหมือนเดิมทุกอย่าง
export {
  API_METHODS,
  defineOp,
  rateKindOf,
} from "@/lib/api/op";
export type {
  ApiMethod,
  ApiOp,
  ApiOpCtx,
  ApiOpKind,
  ApiOpTool,
  ApiRateKind,
} from "@/lib/api/op";
