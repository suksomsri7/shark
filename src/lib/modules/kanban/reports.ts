// reports.ts — รายงาน + ส่งออกของบอร์ดงาน (เริ่มไฟล์นี้ใน K2.1 · `exportCardsCsv` ตามสัญญา §K2.1
// § 5.6 พิมพ์เขียว: `openCards`/`overdue`/`workload`/`throughput`/`aging` มาเติมใน K2.10)
//
// 🔴 ไม่แตะ prisma ตรง ๆ — พึ่ง `listBoardTable` (K2.1) ให้ทำงานกรอง/เรียง/join ให้ครบ ⇒ ตัวเลข/รายชื่อ
//    ในไฟล์ CSV ตรงกับสิ่งที่ผู้ใช้เห็นในตารางเป๊ะ (ที่มาเดียวกัน ไม่มีทางเพี้ยนกันเอง)
import { csvRow } from "@/lib/core/csv";
import { listBoardTable } from "./table";
import type { BoardFilters } from "./filters";
import type { KanbanActor, KanbanCtx } from "./types";

const CSV_BOM = "﻿";
const CSV_HEADER = ["#", "การ์ด", "คอลัมน์", "ผู้รับผิดชอบ", "กำหนดส่ง", "เช็คลิสต์", "ป้ายกำกับ", "แก้ไขล่าสุด"];

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว — คิดเอง ห้าม toLocale* (บทเรียนทั้งโมดูล)
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "5/9/2569 18:00" — วันที่ไทย พ.ศ. (ไม่ใช้ toLocaleDateString ตามกติกาของโมดูล) */
function thaiDateTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) + BKK_OFFSET_MS;
  const d = new Date(ms);
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear() + 543;
  return `${day}/${month}/${year} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export type ExportCardsCsvInput = { now: Date; filters?: BoardFilters };

/**
 * ส่งออกการ์ดของบอร์ด (ตามตัวกรองปัจจุบัน) เป็น CSV — BOM UTF-8 ให้ Excel เปิดภาษาไทยไม่เพี้ยน
 * ดึง "ทุกแถวที่ตรงตัวกรอง" (ไม่ใช่แค่หน้าปัจจุบันของตาราง) เรียงตามลำดับบนบอร์ด
 */
export async function exportCardsCsv(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
  opts: ExportCardsCsvInput,
): Promise<string> {
  const { rows } = await listBoardTable(ctx, actor, boardId, {
    now: opts.now,
    filters: opts.filters ?? {},
    page: 1,
    // ไม่มีเพดานจำนวนการ์ด/บอร์ดในระบบ (D4) ⇒ ขอมาให้ครบทุกแถวที่กรองได้ในเที่ยวเดียว
    pageSize: 1_000_000,
  });

  const lines = [csvRow(CSV_HEADER)];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.cardNo,
        r.title,
        r.columnName,
        r.assignees.map((a) => a.name).join("; "),
        thaiDateTime(r.dueAt),
        r.checklistTotal > 0 ? `${r.checklistDone}/${r.checklistTotal}` : "",
        r.labels.map((l) => l.name).join("; "),
        thaiDateTime(r.updatedAt),
      ]),
    );
  }
  return CSV_BOM + lines.join("\n");
}
