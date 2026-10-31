// ─────────────────────────────────────────────────────────────
// defs/integrations.ts — ค่าตั้งของศูนย์เชื่อมต่อ (pure) · SVC C.3 §2.1 · ภาคผนวก ก หอ #83
// 🔴 ชั้นร้าน (TENANT) อย่างเดียว · แก้ได้เฉพาะเจ้าของร้าน (ownerOnly) · "เมื่อผู้ให้บริการไม่ตอบ" ตั้งที่แถวการเชื่อมต่อแต่ละแถว
//    (เก็บที่แถวอยู่แล้ว — ไม่มีค่าตั้งซ้ำในไฟล์นี้)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { SettingDef } from "../types";

const DEFS: SettingDef[] = [
  {
    key: "integrations.quota.alertPercent", // #83
    domain: "integrations",
    group: "alerts",
    type: "percent",
    percentScale: 100,
    labelTh: "เตือนเจ้าของเมื่อโควตาของตัวเชื่อมเหลือไม่เกิน (%)",
    helpTh: "ระบบตรวจโควตาของผู้ให้บริการทุกชั่วโมง แล้วแจ้งเจ้าของร้านในแอปครั้งเดียวต่อรอบที่โควตาใกล้หมด",
    schema: z.number().int().min(1).max(99),
    defaults: { _fallback: 10 },
    chain: ["TENANT"],
    editPermission: "settings.integrations.manage",
    ownerOnly: true,
  },
];

defineSettings("integrations", DEFS, { groupLabelsTh: { alerts: "แจ้งเตือนตัวเชื่อม" } });
