"use server";

// ─────────────────────────────────────────────────────────────
// import-actions.ts — server actions ของตัวช่วยนำเข้า CSV (WO 1.8, DESIGN-SPEC-V2.md §8.5)
// 🔴 ไฟล์นี้ **ไม่ import prisma** โดยเจตนา — ทุกการแตะ DB ผ่าน service/product/expense (fitness F5)
//
// กติกาความปลอดภัยเหมือน editor-actions.ts ทุกประการ:
//   1) loadAccountSystem(systemId) ผูก tenant
//   2) assertAccountCan(auth, "account.import") ก่อนแตะข้อมูลใด ๆ
//   3) ตัวเลข/ค่าที่สร้างจริงคำนวณ/ตรวจใหม่ฝั่ง server เสมอ — ไม่เชื่อ mapping/preview ที่ client ส่งมา
//   4) idempotent ต่อไฟล์: refType="CSV_IMPORT" · refId=`${fileHash}:${rowKey}` (เอกสาร) —
//      ผู้ติดต่อ/สินค้าอาศัยกุญแจธรรมชาติ (เลขภาษี+สาขา / เบอร์ / SKU) กันซ้ำอยู่แล้ว
//
// 🔴 WO D3: ตรรกะจริง (`previewImportCore`/`runImportCore`) ย้ายไป `import-core.ts` แล้ว — ไฟล์นั้น
//    **ไม่ import `./guard`** (ซึ่งลาก session/env มาด้วยตอนโหลดโมดูล) เพื่อให้ REST บัญชี
//    (`api/ops/import.ts`) เรียกตรงได้โดยไม่ต้องมี Next.js request context เหมือนที่นี่ทำ · ที่นี่แค่
//    ผูก session (`loadAccountSystem`) + สิทธิ์ + เพดานอัตรา แล้วส่งต่อ — คงชื่อ/พฤติกรรมเดิมทุกประการ
//    ให้ `ImportWizard.tsx`/`scripts/qc-acc-v2-import.mts`/`scripts/qc-acc-v2-coa.mts` ที่เรียกอยู่แล้วใช้ได้เป๊ะ
// ─────────────────────────────────────────────────────────────

import { safeReason } from "./errors";
import { loadAccountSystem } from "./guard";
import { assertAccountCan } from "./access";
import { accountRateGuard } from "./rate-limit";
import type { ColumnMapping } from "./import-shared";
import { previewImportCore, runImportCore, type ImportRunResult, type PreviewResult } from "./import-core";

// Fable (D3 ตรวจรับ): **ไม่ re-export ฟังก์ชัน core จากไฟล์ "use server"** — ทุก async function ที่ export
// จากไฟล์นี้กลายเป็น server action ที่ client เรียกได้ตรง ๆ โดยส่ง tenantId ใด ๆ มาก็ได้ (ไม่มีด่านสิทธิ์)
// ⇒ ผู้ที่ต้องการ core ให้ import จาก `./import-core` โดยตรง (ops/import.ts · ข้อสอบ)
export type { PreviewRow, PreviewResult, ImportRunResult } from "./import-core";

export async function previewImportAction(
  systemId: string,
  kindRaw: string,
  csvText: string,
  mappingOverride?: ColumnMapping,
): Promise<PreviewResult> {
  try {
    const { auth, tenantId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.import");
    return await previewImportCore(tenantId, systemId, kindRaw, csvText, mappingOverride);
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านไฟล์ไม่สำเร็จ") };
  }
}

export async function runImportAction(
  systemId: string,
  kindRaw: string,
  csvText: string,
  mapping: ColumnMapping,
  skipErrorRows: boolean,
): Promise<ImportRunResult> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(systemId);
    assertAccountCan(auth, "account.import");
    // WO 9.2 ข้อ 11 — นำเข้า 1 ไฟล์ = สร้างได้ถึง IMPORT_MAX_ROWS แถว ⇒ ต้องมีเพดานต่อระบบ
    const rate = await accountRateGuard("import", systemId);
    if (!rate.ok) return { ok: false, reason: rate.reason };
    return await runImportCore(tenantId, systemId, userId, kindRaw, csvText, mapping, skipErrorRows);
  } catch (e) {
    return { ok: false, reason: safeReason(e, "นำเข้าไม่สำเร็จ") };
  }
}
