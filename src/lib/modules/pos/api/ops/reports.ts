// ops/reports.ts — op อ่านยอดขายของ POS (ใบ P0.2)
//
// คู่กับ tool เดิมของผู้ช่วย AI `sales_summary` / `sales_by_day` (สกิล `sales` · ตาราง POS_LEGACY_AI_TOOLS ใน registry.ts)
// 🔴 tool เดิมสองตัวนั้นคิวรี posSale เองใน `src/lib/ai/tools.ts` (ไม่มีฟังก์ชันบริการของ POS ให้เรียก)
//    ใบนี้ห้ามลอกตรรกะจาก tools.ts และห้ามเพิ่มตรรกะธุรกิจใหม่ ⇒ op ทั้งสองประกอบจาก `closeDaySummary`
//    (สรุปยอดปิดวันของระบบ POS — บริการเดิมที่หน้าปิดวันใช้อยู่ · ผ่าน facade `pos/index`) วันละครั้ง
//    ความต่างจาก tool เดิม (บันทึกใน wo-notes · ผู้คุมงานเคาะตอน P2.13):
//      - นับเป็น "วันตามปฏิทินไทย" รวมวันนี้ (tool เดิมนับย้อน N×24 ชม. จากตอนนี้)
//      - ขอบเขต = ระบบ POS ของ actor (tool เดิม = ระบบ POS ตัวแรกของร้าน)
//      - เพดาน 31 วัน (closeDaySummary = 3 คิวรีต่อวัน · ช่วงยาวกว่านี้ต้องมีคิวรีช่วงวันของบริการเอง — P2.13 `reports/*`)

import { z } from "zod";
import { bkkToday, closeDaySummary, type PosDaySummary } from "../../index";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";

/** เพดานจำนวนวันของ op สรุปยอด (ดูหัวไฟล์) */
export const POS_REPORT_MAX_DAYS = 31;

/** อ่านพร้อมกันทีละกี่วัน — กันกิน connection pool หมดตอนขอ 31 วัน */
const DAY_BATCH = 4;

const daysInput = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(POS_REPORT_MAX_DAYS)
      .optional()
      .describe(`How many Thai calendar days to cover, counting today. Default 7, max ${POS_REPORT_MAX_DAYS}.`),
  })
  .strict();

/** วันที่ธุรกิจ (YYYY-MM-DD เวลาไทย) ย้อนหลัง n วันนับวันนี้ — เรียงใหม่ → เก่า (คำนวณบนวันที่ล้วน ไม่แตะเขตเวลาเครื่อง) */
function businessDatesBack(n: number): string[] {
  const today = bkkToday();
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(base - i * 86_400_000).toISOString().slice(0, 10));
}

/** สรุปปิดวันของทุกวันในช่วง (ใหม่ → เก่า) — เรียกบริการเดิมเท่านั้น */
async function daySummaries(ctx: { tenantId: string; systemId: string }, days: number): Promise<PosDaySummary[]> {
  const dates = businessDatesBack(days);
  const out: PosDaySummary[] = [];
  for (let i = 0; i < dates.length; i += DAY_BATCH) {
    const batch = dates.slice(i, i + DAY_BATCH);
    out.push(...(await Promise.all(batch.map((d) => closeDaySummary(ctx, d)))));
  }
  return out;
}

const salesSummary = definePosOp({
  id: "sales.summary",
  method: "GET",
  path: "/reports/sales-summary",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.saleCreate,
  summary: "Total paid sales of this POS system over the last N Thai calendar days (including today): bill count and net sales in satang.",
  label: "สรุปยอดขายย้อนหลัง",
  input: daysInput,
  test: "POS-P0.2-OP.1",
  async handler({ actor, input }) {
    const days = input.days ?? 7;
    const rows = await daySummaries({ tenantId: actor.tenantId, systemId: actor.systemId }, days);
    return {
      days,
      from: rows[rows.length - 1]?.businessDate ?? null,
      to: rows[0]?.businessDate ?? null,
      billCount: rows.reduce((s, r) => s + r.billCount, 0),
      netSalesSatang: rows.reduce((s, r) => s + r.netSalesSatang, 0),
      voidCount: rows.reduce((s, r) => s + r.voidCount, 0),
      voidTotalSatang: rows.reduce((s, r) => s + r.voidTotalSatang, 0),
    };
  },
});

const salesByDay = definePosOp({
  id: "sales.byDay",
  method: "GET",
  path: "/reports/sales-by-day",
  kind: "read",
  rate: "report",
  action: POS_SCOPES.saleCreate,
  summary: "Paid sales of this POS system per Thai calendar day for the last N days (newest first): net sales in satang and bill count per day.",
  label: "ยอดขายรายวัน",
  input: daysInput,
  test: "POS-P0.2-OP.2",
  async handler({ actor, input }) {
    const days = input.days ?? 7;
    const rows = await daySummaries({ tenantId: actor.tenantId, systemId: actor.systemId }, days);
    return {
      days,
      rows: rows.map((r) => ({ businessDate: r.businessDate, netSalesSatang: r.netSalesSatang, billCount: r.billCount })),
    };
  },
});

export const REPORTS_OPS: ApiOp[] = [salesSummary, salesByDay];
