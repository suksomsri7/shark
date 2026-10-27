// ─────────────────────────────────────────────────────────────
// defs/payments.ts — ค่าตั้งร่วมเรื่องรับเงิน/ตรวจสลิป (pure) · CC §3.4 · ใบสั่ง R0.3 §7.1
// ชั้น TENANT→UNIT · ตรงภาคผนวก ก หอ #53–#57 (หอ #58 รับบางส่วน อยู่ใน defs/rooms.ts)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { defineSettings } from "../registry";
import type { SettingDef } from "../types";

const EDIT = "settings.payments.edit";
const CHAIN = ["TENANT", "UNIT"] as const;

const DEFS: SettingDef[] = [
  {
    key: "payments.receiver", domain: "payments", group: "receiver", type: "table", labelTh: "บัญชีรับเงิน (พร้อมเพย์)",
    helpTh: "บัญชีที่ลูกค้าโอนเข้า — ผูกกับโปรไฟล์รับเงินของร้าน (CC §2.3 PROMPTPAY)",
    schema: z.object({ paymentProfileId: z.string().min(1).max(64), labelTh: z.string().max(80).optional() }).nullable(),
    defaults: { _fallback: null },
    chain: CHAIN, editPermission: EDIT, ownerOnly: true, sensitivity: "MONEY",
  },
  {
    key: "payments.slip.autoApprove", domain: "payments", group: "slip", type: "bool", labelTh: "อนุมัติสลิปอัตโนมัติเมื่อตรวจผ่าน",
    schema: z.boolean(),
    defaults: { _fallback: false },
    chain: CHAIN, editPermission: EDIT, requires: { integration: "SLIP_VERIFY" },
  },
  {
    key: "payments.slip.toleranceSatang", domain: "payments", group: "slip", type: "money", labelTh: "ยอดโอนคลาดเคลื่อนที่ยอมรับ (สตางค์)",
    schema: z.number().int().min(0).max(100_000_000),
    defaults: { _fallback: 0 },
    chain: CHAIN, editPermission: EDIT, sensitivity: "MONEY",
  },
  {
    key: "payments.slip.payerNameMatch", domain: "payments", group: "slip", type: "enum", labelTh: "ชื่อผู้โอนไม่ตรงกับผู้จ่าย",
    schema: z.enum(["OFF", "WARN", "BLOCK"]),
    defaults: { _fallback: "WARN" },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "payments.slip.maxAgeHours", domain: "payments", group: "slip", type: "int", labelTh: "สลิปเก่าได้ไม่เกิน (ชั่วโมง)",
    schema: z.number().int().min(1).max(720),
    defaults: { _fallback: 72 },
    chain: CHAIN, editPermission: EDIT,
  },
  {
    key: "payments.slip.onVerifierDown", domain: "payments", group: "slip", type: "enum", labelTh: "เมื่อระบบตรวจสลิปขัดข้อง",
    schema: z.enum(["MANUAL", "REJECT"]),
    defaults: { _fallback: "MANUAL" },
    chain: CHAIN, editPermission: EDIT,
  },
];

defineSettings("payments", DEFS);
