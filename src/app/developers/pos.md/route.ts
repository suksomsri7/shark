// /developers/pos.md — สำเนาข้อความล้วนของ `docs/api/POS-API.md` (ใบ P2.13)
//
// ผู้ช่วย AI และ CLI หลายตัวดึง URL ที่ลงท้าย `.md` แทนการแกะ HTML · route นี้ตอบด้วย **ไบต์เดียวกันเป๊ะ**
// กับไฟล์คู่มือที่ `scripts/gen-pos-api-docs.mts` สร้างไว้ (แบบเดียวกับ /developers/kanban.md)
// 🔴 ชื่อโฟลเดอร์ `pos.md` เป็น path segment คงที่ — static ชนะ dynamic · **ไม่ต้องใช้คีย์** (ไม่มีข้อมูลของร้านใดเลย)
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/api/POS-API.md");
const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  const body = await readFile(DOC_PATH, "utf8");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
