// ─────────────────────────────────────────────────────────────
// defs/_fixture.ts — ฟิกซ์เจอร์ค่าตั้งของข้อสอบ «scripts/qc-svc-r0.3.mts» เท่านั้น (domain "qcfx")
// ตามใบสั่ง R0.3 §8 ตรงตัว (ข้อสอบผูกทุกค่า) · 🔴 ห้ามไฟล์ใดใน src/ import ไฟล์นี้ (ข้อสอบ S-3)
// ─────────────────────────────────────────────────────────────
import { z } from "zod";
import { isValidOutOfScopeReason } from "../legal/th-rental-2568";
import { defineSettings } from "../registry";
import type { GroupRule, SettingDef } from "../types";

const EDIT = "qcfx.settings.edit";
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const MSG = { th: "เรียน {ชื่อ} ห้อง {ห้อง} ยอด {ยอด} บาท" };

const DEFS: SettingDef[] = [
  {
    key: "qcfx.general.label", domain: "qcfx", group: "general", type: "text", labelTh: "ชื่อเรียกผู้ให้บริการ",
    schema: z.string().min(1).max(40),
    defaults: { QCFX_A: "ช่าง", QCFX_B: "หมอนวด", _fallback: "พนักงาน" },
    chain: ["TENANT", "UNIT"], editPermission: EDIT,
  },
  {
    key: "qcfx.late.graceMin", domain: "qcfx", group: "late", type: "minutes", labelTh: "ผ่อนผันมาสาย (นาที)",
    schema: int(0, 120),
    defaults: { QCFX_A: 10, QCFX_B: 15, _fallback: 5 },
    chain: ["TENANT", "UNIT", "SERVICE", "STAFF"], editPermission: EDIT,
  },
  {
    key: "qcfx.late.noShowAfterMin", domain: "qcfx", group: "late", type: "minutes", labelTh: "ถือว่าไม่มาหลัง (นาที)",
    schema: int(0, 240),
    defaults: { QCFX_A: 20, QCFX_B: 30, _fallback: 15 },
    chain: ["TENANT", "UNIT", "SERVICE", "STAFF"], editPermission: EDIT,
  },
  {
    key: "qcfx.fee.rentSatang", domain: "qcfx", group: "fee", type: "money", labelTh: "ค่าเช่า (สตางค์)",
    schema: int(0, 10_000_000),
    defaults: { QCFX_A: 350000, QCFX_B: 420000, _fallback: 0 },
    chain: ["TENANT", "UNIT", "BUILDING", "ROOM_TYPE", "ROOM"], editPermission: EDIT,
    effectiveDated: true, sensitivity: "MONEY",
  },
  {
    key: "qcfx.legal.mode", domain: "qcfx", group: "legal", type: "enum", labelTh: "โหมดตรวจกฎหมาย",
    schema: z.enum(["STRICT", "WARN", "OUT_OF_SCOPE"]),
    enumLabelsTh: { STRICT: "เข้มงวด", WARN: "เตือน", OUT_OF_SCOPE: "นอกขอบเขตประกาศ" },
    defaults: { QCFX_A: "STRICT", QCFX_B: "STRICT", _fallback: "STRICT" },
    chain: ["UNIT"], editPermission: EDIT, sensitivity: "LEGAL",
  },
  {
    key: "qcfx.legal.outOfScopeReason", domain: "qcfx", group: "legal", type: "text", labelTh: "เหตุผลที่อยู่นอกขอบเขตประกาศ",
    schema: z.string().max(500).nullable(),
    defaults: { QCFX_A: null, QCFX_B: null, _fallback: null },
    chain: ["UNIT"], editPermission: EDIT, sensitivity: "LEGAL",
  },
  {
    key: "qcfx.deposit.returnDays", domain: "qcfx", group: "deposit", type: "days", labelTh: "คืนเงินประกันภายใน (วัน)",
    schema: int(0, 60),
    defaults: { QCFX_A: 7, QCFX_B: 7, _fallback: 7 },
    chain: ["TENANT", "UNIT", "ROOM_TYPE"], editPermission: EDIT, legal: ["DEPOSIT_RETURN_DAYS"],
  },
  {
    key: "qcfx.deposit.autoVerify", domain: "qcfx", group: "deposit", type: "bool", labelTh: "ตรวจสลิปมัดจำอัตโนมัติ",
    schema: z.boolean(),
    defaults: { QCFX_A: false, QCFX_B: false, _fallback: false },
    chain: ["TENANT", "UNIT"], editPermission: EDIT, requires: { integration: "SLIP_VERIFY" },
  },
  {
    key: "qcfx.msg.reminder", domain: "qcfx", group: "msg", type: "template", labelTh: "ข้อความเตือนชำระ",
    schema: z.object({ th: z.string().min(1).max(1000), en: z.string().max(1000).nullable().optional() }),
    defaults: { QCFX_A: MSG, QCFX_B: MSG, _fallback: MSG },
    chain: ["TENANT", "UNIT"], editPermission: EDIT,
    templateVars: ["ชื่อ", "ห้อง", "ยอด"], legal: ["TEMPLATE_NO_THREAT"],
  },
  {
    key: "qcfx.owner.payoutNote", domain: "qcfx", group: "owner", type: "text", labelTh: "บันทึกบัญชีรับเงินของเจ้าของ",
    schema: z.string().max(200),
    defaults: { QCFX_A: "", QCFX_B: "", _fallback: "" },
    chain: ["TENANT", "UNIT"], editPermission: EDIT, ownerOnly: true, sensitivity: "MONEY",
  },
];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const GROUP_RULES: GroupRule[] = [
  {
    group: "late",
    check: (v) => {
      const grace = num(v["qcfx.late.graceMin"]);
      const noShow = num(v["qcfx.late.noShowAfterMin"]);
      if (grace === null || noShow === null || noShow > grace) return [];
      return [{ key: "qcfx.late.noShowAfterMin", code: "NO_SHOW_BEFORE_GRACE", messageTh: `เวลา "ถือว่าไม่มา" (${noShow} นาที) ต้องมากกว่าเวลาผ่อนผันมาสาย (${grace} นาที)` }];
    },
  },
  {
    group: "legal",
    check: (v) => {
      if (v["qcfx.legal.mode"] !== "OUT_OF_SCOPE") return [];
      const r = v["qcfx.legal.outOfScopeReason"];
      if (isValidOutOfScopeReason(typeof r === "string" ? r : null)) return [];
      return [{ key: "qcfx.legal.outOfScopeReason", code: "OUT_OF_SCOPE_REASON_REQUIRED", messageTh: "โหมดนอกขอบเขตประกาศต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร" }];
    },
  },
];

defineSettings("qcfx", DEFS, {
  templates: [
    { key: "QCFX_A", version: 1, labelTh: "แม่แบบทดสอบ ก" },
    { key: "QCFX_B", version: 2, labelTh: "แม่แบบทดสอบ ข" },
  ],
  groupLabelsTh: {
    general: "ทั่วไป (ทดสอบ)",
    late: "มาสาย (ทดสอบ)",
    fee: "ค่าใช้จ่าย (ทดสอบ)",
    legal: "กฎหมาย (ทดสอบ)",
    deposit: "เงินประกัน (ทดสอบ)",
    msg: "ข้อความ (ทดสอบ)",
    owner: "เจ้าของ (ทดสอบ)",
  },
  snapshots: { "qcfx.doc": ["qcfx.late.graceMin", "qcfx.late.noShowAfterMin", "qcfx.fee.rentSatang", "qcfx.deposit.returnDays"] },
  groupRules: GROUP_RULES,
});
