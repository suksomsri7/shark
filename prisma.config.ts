import path from "node:path";
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 ไม่ auto-load .env — โหลดเองด้วย Node 20 (ไม่พึ่ง dotenv)
if (existsSync(".env")) process.loadEnvFile(".env");

// ⚠️ ห้ามใช้ env() ของ prisma/config — มัน throw ตั้งแต่โหลดไฟล์ถ้า env ไม่มี
// → postinstall (prisma generate) พังบนเครื่องที่ไม่มี .env เช่น CI T0 (เจอจริง run #2)
// generate ไม่ต่อ DB — ใช้ placeholder ได้ · คำสั่งที่ต่อจริง (migrate/db) จะพังเสียงดังเอง
const directUrl =
  process.env.DIRECT_URL ??
  "postgresql://no-env:no-env@localhost:5432/no_env_set?schema=public";

// Prisma 7 — multi-file schema (1 ไฟล์/โมดูล). core.prisma freeze หลัง Stage A.
// datasource.url ที่นี่ = การเชื่อมต่อสำหรับ CLI (migrate/introspect) → ใช้ DIRECT_URL (Neon)
// runtime client ใช้ DATABASE_URL (pooled) กำหนดใน src/lib/core/db.ts
export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: directUrl,
  },
});
