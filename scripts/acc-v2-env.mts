// ตัวโหลด env ร่วมของงาน "บัญชี V2" — ทุกสคริปต์ `*acc-v2*` ต้องผ่านที่นี่
//
// 🔴 เหตุผลที่ต้องมีไฟล์นี้ (BLUEPRINT §2): `.env` ของรีโปนี้ชี้ **DB production จริง**
//    ถ้าสคริปต์ seed/QC เผลอโหลด `.env` = เขียนทับข้อมูลลูกค้าจริง (เคยทำแชท prod ดับ 2.5 ชม. มาแล้ว)
//    ⇒ งานนี้โหลด `.env.qc` เท่านั้น + มีด่านกันพลาด 3 ชั้นก่อนคืน prisma ให้ใคร
//
// ด่าน:
//   1) ไม่มี `.env.qc` → ตาย พร้อมบอกวิธีสร้าง
//   2) DATABASE_URL/DIRECT_URL ชี้ host ของ production branch → ตาย
//   3) APP_ENV ต้องเป็น development (prod build ของจริงใช้ production)

import { existsSync } from "node:fs";
import { resolve } from "node:path";

// host ของ Neon branch `production` — ห้ามให้สคริปต์งานนี้แตะเด็ดขาด
// (เก็บเป็นชิ้นส่วนของ host ไม่ใช่ URL เต็ม — ไม่มีรหัสผ่านในรีโป)
const PROD_HOST_MARK = "ep-royal-night";

export const ENV_FILE = ".env.qc";

export function loadQcEnv(): { databaseUrl: string; host: string } {
  const path = resolve(process.cwd(), ENV_FILE);
  if (!existsSync(path)) {
    console.error(
      `❌ ไม่พบ ${ENV_FILE} ที่ ${path}\n` +
        `   สร้างด้วย: pnpm neon:create wo-acc-v2-qc → ก๊อป .env มาเป็น .env.qc แล้วทับ DATABASE_URL/DIRECT_URL/APP_ENV=development`,
    );
    process.exit(1);
  }
  process.loadEnvFile(path);

  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  if (!db) {
    console.error(`❌ ${ENV_FILE} ไม่มี DATABASE_URL`);
    process.exit(1);
  }
  for (const [label, url] of [
    ["DATABASE_URL", db],
    ["DIRECT_URL", direct],
  ] as const) {
    if (url && url.includes(PROD_HOST_MARK)) {
      console.error(
        `🔴 หยุด! ${label} ใน ${ENV_FILE} ชี้ไป production branch (${PROD_HOST_MARK}…) — สคริปต์งานบัญชี V2 ห้ามแตะ prod`,
      );
      process.exit(1);
    }
  }
  if (process.env.APP_ENV !== "development") {
    console.error(
      `🔴 หยุด! APP_ENV=${process.env.APP_ENV ?? "(ว่าง)"} — ${ENV_FILE} ต้องตั้ง APP_ENV=development`,
    );
    process.exit(1);
  }
  const host = new URL(db).hostname;
  return { databaseUrl: db, host };
}

/** ชื่อ tenant/ผู้ใช้ QC — ใช้ร่วมกันทุกสคริปต์ (seed · ตรวจ · ถ่ายภาพ) */
export const QC = {
  tenantName: "SIAM DIVE QC",
  tenantSlug: "siam-dive-qc",
  ownerEmail: "qc-owner@shark.local",
  ownerName: "เจ้าของร้าน (QC)",
  expectedPath: "scripts/acc-v2-expected.json",
  shotsDir: ".qc-shots/acc-v2",
  /** วันที่อ้างอิงของชุดข้อมูล (ตรึงไว้ให้ผลนิ่ง — BLUEPRINT §2) */
  today: "2026-09-30",
  /** เลยวันนี้แล้วตัวเลข "พ้นกำหนด" อาจเพี้ยน (dueDate ของใบที่ยังไม่พ้นกำหนดอยู่ พ.ย.–ธ.ค. 2026) */
  oracleValidUntil: "2026-10-31",
} as const;
