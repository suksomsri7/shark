import path from "node:path";
import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 ไม่ auto-load .env — โหลดเองด้วย Node 20 (ไม่พึ่ง dotenv)
if (existsSync(".env")) process.loadEnvFile(".env");

// Prisma 7 — multi-file schema (1 ไฟล์/โมดูล). core.prisma freeze หลัง Stage A.
// datasource.url ที่นี่ = การเชื่อมต่อสำหรับ CLI (migrate/introspect) → ใช้ DIRECT_URL (Neon)
// runtime client ใช้ DATABASE_URL (pooled) กำหนดใน src/lib/core/db.ts
export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
