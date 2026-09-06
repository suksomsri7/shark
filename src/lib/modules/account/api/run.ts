// run.ts — "รัน op หนึ่งตัวในนามของ actor" (WO E1 · แกนย้ายไป `src/lib/api/run.ts` ตอน K1.15)
//
// ตรวจ input (zod ของ op) · ตรวจสิทธิ์ (`actor.can`) · เรียก handler · เขียน audit = อยู่ที่แกนกลางที่เดียว
// ⇒ REST บัญชี · สกิล AI บัญชี · REST บอร์ดงาน · สกิล AI บอร์ดงาน เดินด่านเดียวกันเป๊ะ
export {
  detailsMessageTh,
  detailsOfIssues,
  runOpAsActor,
  validateOpInput,
  validateWith,
} from "@/lib/api/run";
export type { OpInputResult, RunOpArgs, RunOpResult } from "@/lib/api/run";
