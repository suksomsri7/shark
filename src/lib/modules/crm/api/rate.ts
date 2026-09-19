// rate.ts — เพดานอัตราต่อคีย์ของ REST CRM (ใบ C1.10 · AUDIT-CLASS X7)
//
// ถังแยกตามชนิดงาน (read / write / report) และแยก namespace ของโมดูล (`crm` — ไม่ใช่ acct/kb/mbr) ⇒ คีย์ที่ยิงโมดูลอื่นรัว ๆ
// ไม่กินโควตาของ CRM และรายงาน (พยากรณ์ยอด) ที่อ่านทั้ง pipeline ไม่แย่งถังของการอ่านทั่วไป
// ตัวนับอยู่บน DB (`checkRateLimitDb` คำสั่งเดียว) — ตัวนับในหน่วยความจำนับพลาดเมื่อมีหลายเครื่อง
//   ตัวเลขเท่าระบบสมาชิก (M1.11) ไม่ใช่บัญชี: ผู้เชื่อมต่อของ CRM คือแอปพนักงานขาย/ฟอร์ม/ระบบนำเข้า lead หลายเครื่องต่อร้าน
//   read 600/นาที · write 300/นาที (ต่ำกว่าสมาชิก — ไม่มีจอ POS ยิงรัว) · report 60/นาที — พยากรณ์อ่านทั้ง pipeline
//   ยิงถี่กว่านี้คือวนคิวรี ไม่ใช่การใช้งานจริง
import type { ApiRateKind } from "@/lib/api/op";

export const CRM_RATE_LIMITS: Record<ApiRateKind, { limit: number; windowMs: number }> = {
  read: { limit: 600, windowMs: 60_000 },
  write: { limit: 300, windowMs: 60_000 },
  report: { limit: 60, windowMs: 60_000 },
};
