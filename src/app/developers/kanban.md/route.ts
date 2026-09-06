// /developers/kanban.md — สำเนาข้อความล้วนของ `docs/api/KANBAN-API.md` (K1.15)
//
// ผู้ช่วย AI และ CLI หลายตัวดึง URL ที่ลงท้าย `.md` แทนการแกะ HTML · route นี้จึงตอบด้วย
// **ไบต์เดียวกันเป๊ะ** กับไฟล์คู่มือที่ `scripts/gen-kanban-api-docs.mts` สร้างไว้ — ไฟล์เดียวกับที่
// หน้า `/developers/kanban` (HTML) อ้างถึง ⇒ มีแหล่งความจริงเดียวที่ต้องคอยให้ตรงกัน
//
// 🔴 ชื่อโฟลเดอร์ `kanban.md` เป็น path segment คงที่ (จุดเป็นตัวอักษรธรรมดา ไม่ใช่ไวยากรณ์
//    `[...]` / `(...)` / `@...` ของ Next) — ทริกเดียวกับ `openapi.json/route.ts`
//    (`node_modules/next/dist/docs/.../07-api-routes.md` §Caveats: static ชนะ dynamic)
// **ไม่ต้องใช้คีย์**: เอกสารนี้ไม่มีข้อมูลของร้านใดเลย
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/api/KANBAN-API.md");
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
