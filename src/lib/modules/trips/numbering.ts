// ─────────────────────────────────────────────────────────────
// trips/numbering.ts — เลขจองทัวร์ (CC §K · L-15) · RUN TRIPS T0.6
// ใบสั่ง ledger/trips-briefs/T0.6.md §4
//
// 🔴 ตัวนับ = คำสั่งเดียวของ CC §K :995–:997 (INSERT … ON CONFLICT DO UPDATE … RETURNING) ใน tx ของผู้เรียก — ไม่อ่านแล้วเขียน · ไม่ max/count
// 🔴 ไม่ import db/ค่าตั้ง — prefix (X3 trips.sell.codePrefix) ผู้เรียกอ่าน "ก่อน" เปิด tx แล้วส่งเข้ามา · tx ล้ม ⇒ เลขคืน (rollback)
// ─────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

// ── T0.6 booking ──
type Tx = Prisma.TransactionClient;

/** เลขจองที่ถูกรูป: PREFIX-YYMM-NNNN (เกิน 9999 ⇒ 5 หลักขึ้นไป) */
export const BOOKING_CODE_RE = /^[A-Z]{1,4}-\d{4}-\d{4,}$/;
const PREFIX_RE = /^[A-Z]{1,4}$/;
const YMD_RE = /^(\d{4})-(\d{2})-\d{2}$/;
const BE_OFFSET = 543;

/** งวดของเลขจอง = ปี พ.ศ. 2 หลัก + เดือน ของวันเดินทาง (เวลาร้าน · YYYY-MM-DD) · รูปผิด ⇒ "" */
export function bookingPeriodOf(localDate: string): string {
  const m = YMD_RE.exec(typeof localDate === "string" ? localDate : "");
  if (!m) return "";
  return `${String((Number(m[1]) + BE_OFFSET) % 100).padStart(2, "0")}${m[2]}`;
}
/** PREFIX-งวด-ลำดับ (ลำดับ 4 หลัก · ≥ 10000 ใช้เลขเต็ม ไม่ล้ม · CC :1001) */
export function formatBookingCode(prefix: string, period: string, seq: number): string {
  return `${prefix}-${period}-${seq >= 10_000 ? String(seq) : String(seq).padStart(4, "0")}`;
}

/** จองลำดับถัดไปของ (tenant, series, period) — คำสั่งเดียว CC §K (ใน tx ของผู้เรียก) */
export async function nextSeqInTx(tx: unknown, input: { tenantId: string; series: string; period: string }): Promise<number> {
  const t = tx as Tx;
  const id = `sc_${randomUUID().replace(/-/g, "")}`;
  const rows = await t.$queryRaw<{ seq: number }[]>`
    INSERT INTO "SellCounter" ("id", "tenantId", "series", "period", "seq") VALUES (${id}, ${input.tenantId}, ${input.series}, ${input.period}, 1)
    ON CONFLICT ("tenantId", "series", "period") DO UPDATE SET "seq" = "SellCounter"."seq" + 1
    RETURNING "seq"`;
  const seq = rows[0]?.seq;
  if (typeof seq !== "number") throw new Error("[trips/numbering] จองเลขไม่สำเร็จ");
  return seq;
}

/** เลขจองถัดไป: series = prefix (X3) · งวด = เดือนเดินทาง · prefix/วันที่ผิดรูป ⇒ throw (ผู้เรียกตรวจก่อน) */
export async function nextBookingCodeInTx(tx: unknown, input: { tenantId: string; prefix: string; localDate: string }): Promise<string> {
  const period = bookingPeriodOf(input.localDate);
  if (!PREFIX_RE.test(input.prefix) || !period) throw new Error("[trips/numbering] prefix หรือวันเดินทางผิดรูป");
  const seq = await nextSeqInTx(tx, { tenantId: input.tenantId, series: input.prefix, period });
  return formatBookingCode(input.prefix, period, seq);
}
// ── /T0.6 booking ──
