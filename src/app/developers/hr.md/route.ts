// /developers/hr.md — สำเนาข้อความล้วนของ `docs/api/HR-API.md` (ใบ H4.8)
//
// ผู้ช่วย AI และ CLI ดึง URL ที่ลงท้าย `.md` แทนการแกะ HTML · ตอบด้วยไบต์เดียวกับไฟล์ที่ `scripts/gen-hr-api-docs.mts` สร้าง
// 🔴 ไม่ต้องใช้คีย์ (ไม่มีข้อมูลของร้านใดเลย)
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/api/HR-API.md");
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
