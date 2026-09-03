// ตัวโหลด env ร่วมของงาน "บัญชี V2" — ทุกสคริปต์ `*acc-v2*` ต้องผ่านที่นี่
//
// 🔴 เหตุผลที่ต้องมีไฟล์นี้ (BLUEPRINT §2): `.env` ของรีโปนี้ชี้ **DB production จริง**
//    ถ้าสคริปต์ seed/QC เผลอโหลด `.env` = เขียนทับข้อมูลลูกค้าจริง (เคยทำแชท prod ดับ 2.5 ชม. มาแล้ว)
//    ⇒ งานนี้โหลด `.env.qc` เท่านั้น + มีด่านกันพลาด 3 ชั้นก่อนคืน prisma ให้ใคร
//
// ด่าน:
//   1) ไม่มี `.env.qc` **และ** ไม่มี DATABASE_URL+DIRECT_URL ใน env → ตาย พร้อมบอกวิธีสร้าง
//   2) DATABASE_URL/DIRECT_URL ชี้ host ของ production branch → ตาย (ด่านนี้เด็ดขาด ทุกโหมด)
//   3) APP_ENV ต้องไม่ใช่ production · โหมดไฟล์บังคับ development เป๊ะ
//
// 🟢 โหมด CI (WO 0.7): บน GitHub Actions **ไม่มี `.env.qc`** (และไม่มี `.env` ด้วย) — แต่ละ shard
//    export DATABASE_URL/DIRECT_URL ของ Neon branch สด ๆ ของตัวเองมาให้แล้ว (.github/workflows/ci.yml)
//    ⇒ ถ้าไม่มีไฟล์แต่มี env ครบ + host ไม่ใช่ prod ⇒ รับได้ (พิมพ์ "CI env" ให้เห็นชัดใน log)
//    ด่าน prod ยังทำงานเหมือนเดิมทุกประการ — โหมดนี้ **ผ่อนแค่เรื่องไฟล์** ไม่ได้ผ่อนเรื่อง host

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";

// host ของ Neon branch `production` — ห้ามให้สคริปต์งานนี้แตะเด็ดขาด
// (เก็บเป็นชิ้นส่วนของ host ไม่ใช่ URL เต็ม — ไม่มีรหัสผ่านในรีโป)
const PROD_HOST_MARK = "ep-royal-night";

export const ENV_FILE = ".env.qc";

/** `file` = โหลดจาก .env.qc (เครื่อง dev) · `ci` = ใช้ env ที่ export มาให้แล้ว (GitHub Actions) */
export type QcEnvSource = "file" | "ci";

export function loadQcEnv(): { databaseUrl: string; host: string; source: QcEnvSource } {
  const path = resolve(process.cwd(), ENV_FILE);
  const hasFile = existsSync(path);
  // env ที่ export มาก่อน "ชนะ" ไฟล์เสมอ (พฤติกรรมของ process.loadEnvFile — วัดจริงแล้ว)
  // ⇒ เช็ก CI จากตอนก่อนโหลดไฟล์ ไม่ใช่หลังโหลด
  const preDb = process.env.DATABASE_URL ?? "";
  const preDirect = process.env.DIRECT_URL ?? "";
  let source: QcEnvSource;

  if (hasFile) {
    process.loadEnvFile(path);
    source = "file";
  } else if (preDb && preDirect) {
    source = "ci";
  } else {
    console.error(
      `❌ ไม่พบ ${ENV_FILE} ที่ ${path} และ env ก็ไม่มี DATABASE_URL+DIRECT_URL ครบ\n` +
        `   เครื่อง dev: pnpm neon:create wo-acc-v2-qc → ก๊อป .env มาเป็น .env.qc แล้วทับ DATABASE_URL/DIRECT_URL/APP_ENV=development\n` +
        `   CI: ตั้ง DATABASE_URL/DIRECT_URL ของ Neon branch ให้ครบก่อนเรียก (ดู .github/workflows/ci.yml)`,
    );
    process.exit(1);
  }

  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  if (!db) {
    console.error(`❌ ${ENV_FILE} ไม่มี DATABASE_URL`);
    process.exit(1);
  }
  // 🔴 ด่าน prod — เด็ดขาด ไม่มีข้อยกเว้นในทุกโหมด
  for (const [label, url] of [
    ["DATABASE_URL", db],
    ["DIRECT_URL", direct],
  ] as const) {
    if (url && url.includes(PROD_HOST_MARK)) {
      console.error(
        `🔴 หยุด! ${label} (${source === "ci" ? "จาก env" : ENV_FILE}) ชี้ไป production branch (${PROD_HOST_MARK}…) — สคริปต์งานบัญชี V2 ห้ามแตะ prod`,
      );
      process.exit(1);
    }
  }
  if (source === "ci") {
    // CI ไม่ได้ตั้ง APP_ENV ให้ — ตั้งเองเป็น development (คุกกี้/flag ของแอปต้องอยู่โหมด dev)
    // แต่ถ้ามีใครตั้ง production มาแล้ว = ผิดที่ผิดทาง ตายทันที
    if (process.env.APP_ENV === "production") {
      console.error(`🔴 หยุด! APP_ENV=production — สคริปต์งานบัญชี V2 ห้ามรันในโหมด production`);
      process.exit(1);
    }
    process.env.APP_ENV ??= "development";
  } else if (process.env.APP_ENV !== "development") {
    console.error(
      `🔴 หยุด! APP_ENV=${process.env.APP_ENV ?? "(ว่าง)"} — ${ENV_FILE} ต้องตั้ง APP_ENV=development`,
    );
    process.exit(1);
  }
  const host = new URL(db).hostname;
  if (source === "ci") console.log(`ℹ️  CI env — ไม่มี ${ENV_FILE} · ใช้ DATABASE_URL/DIRECT_URL จาก env (host ${host})`);
  return { databaseUrl: db, host, source };
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

// ─────────────────────────────────────────────────────────────────────────────
// หา "ร้าน QC + ระบบบัญชี" จาก **คีย์ที่เสถียร** (ชื่อร้าน + ชนิดระบบ) ไม่ใช่ id ใน acc-v2-expected.json
//
// 🔴 ทำไม (WO 0.7): `acc-v2-expected.json` ถูก commit ไว้ แต่ seed เขียนทับทุกครั้ง และ id เป็น cuid
//    ⇒ ไฟล์ที่ commit = id ของ Neon branch `wo-acc-v2-qc` เท่านั้น · บน CI แต่ละ shard มี branch ของตัวเอง
//    id คนละชุดแน่นอน ⇒ ชุดที่ผูกกับ id ต้องให้ qc-all.mts สั่ง seed ใหม่ก่อนรัน (มันเขียนเฉลยใหม่ให้)
//    ส่วนตัวที่หาได้จากคีย์เสถียร ให้หาแบบนี้แทน — ทนต่อทั้งเฉลยเก่าและ DB คนละก้อน
// ─────────────────────────────────────────────────────────────────────────────

/** คืน tenantId/systemId ของร้าน QC บัญชี V2 · null = ยังไม่ได้ seed ใน DB ก้อนนี้ */
export async function resolveAccV2Scope(
  prisma: PrismaClient,
): Promise<{ tenantId: string; systemId: string } | null> {
  const tenant = await prisma.tenant.findFirst({ where: { name: QC.tenantName }, select: { id: true } });
  if (!tenant) return null;
  const system = await prisma.appSystem.findFirst({
    where: { tenantId: tenant.id, type: "ACCOUNT" },
    select: { id: true },
  });
  if (!system) return null;
  return { tenantId: tenant.id, systemId: system.id };
}

/** มีชุดข้อมูล QC บัญชี V2 อยู่ใน DB ก้อนนี้แล้วหรือยัง (ร้าน + ระบบบัญชี + มีเอกสารจริง) */
export async function isAccV2SeedPresent(prisma: PrismaClient): Promise<boolean> {
  const scope = await resolveAccV2Scope(prisma);
  if (!scope) return false;
  // มีร้างเปล่า ๆ ไม่นับ — ต้องมีเอกสารที่ seed สร้างไว้จริง (seed ล้มกลางทางจะจับได้ตรงนี้)
  const docs = await prisma.accountDocument.count({ where: { tenantId: scope.tenantId, systemId: scope.systemId } });
  return docs > 0;
}
