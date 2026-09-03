// แหล่งเดียวของ "แท็บสถานะ" หน้ารายการ V2 (DocListPage) — DESIGN-SPEC-V2.md §3 คอลัมน์ "แท็บ" (WO 1.1)
//
// กติกา: เพิ่ม/แก้แท็บของ docType ใด ให้แก้ที่ไฟล์นี้ที่เดียว — ทั้ง (1) หน้ารายการ (DocListPage อ่าน LIST_TABS
// ผ่าน tabToFilter) และ (2) ตัวนับ flyout เมนู V2 (service.ts:accountFlyoutCounts อ่าน NAV_FLYOUT_TABS) ต้อง
// มาจากตารางนี้เท่านั้น — กันไม่ให้ตัวนับ flyout กับตัวนับแท็บของหน้ารายการเพี้ยนออกจากกัน (บทเรียน WO 0.4)
//
// ground truth ของ INVOICE = f3-invoice-list.png + scripts/acc-v2-expected.json (`invoiceTabs`):
//   ทั้งหมด 51 · ร่าง 3 · รอชำระ 12 · ชำระบางส่วน 2 · ชำระแล้ว 29 · พ้นกำหนด 4 · ยกเลิก 1
//   (ไม่มีแท็บ "รออนุมัติ" — INVOICE ไม่มี state AWAITING_APPROVAL ในโมเดลจริง แม้ §3 จะเขียนไว้กว้าง ๆ
//   ก็ตาม — parity gate ยึดภาพที่เจ้าของอนุมัติเป็นหลัก)
//
// docType อื่นที่ไม่มี mockup อ้างอิงตรง ๆ (QT/DR/RE/TX/CN/DN/BN/PUR/EXP/AP/DP/PO/APO/PTX/PRR) ยึดป้าย+ลำดับ
// ตามตาราง §3 ให้ใกล้เคียงที่สุด — แท็บที่อ้างสถานะซึ่งยัง "เกิดไม่ได้จริง" ในโมเดลปัจจุบัน (เช่น รออนุมัติของ
// เอกสารที่ยังไม่มี workflow อนุมัติ) ยังคงแสดงไว้ (นับได้ 0 เสมอจนกว่าจะมี WO ต่อ workflow) — ไม่ตัดออกเพื่อให้
// โครงหน้าตรง SPEC ล่วงหน้า ประกาศไว้ใน ledger/wo-notes/1.1.md
//
// แท็บที่ตั้งใจ "ไม่ทำ" ในรอบนี้ (ต้องมีของเพิ่มที่ยังไม่มี):
//   - "ออกบางส่วน/ออกครบแล้ว" (QT/PO derived จาก relation CONVERT แบบนับสัดส่วน) — ยังไม่มี logic นับสัดส่วน
//     การแปลงต่อบรรทัด ต้องเป็น WO แยก (INTEGRATION ซับซ้อนกว่าการกรอง status ตรง ๆ)
//   - "รอออกใบกำกับ" (RECEIPT ᵈ) — ต้องเช็ค relationsTo type TAX_FOR ไม่มี ยังไม่ทำในรอบนี้ (ไม่กระทบ IV/expected.json)
//   - "เอกสารอัตโนมัติ" (PUR/EXP/AP source∈{AI,IMPORT,INBOX} ∧ needsReview) — ฟิลด์ `needsReview` ยังไม่มีใน schema

import type { AccountDocType, AccountDocStatus } from "@prisma/client";
import type { StatusTabTone } from "@/components/account-v2/StatusTabs";
import type { DocStatusFilter } from "./service";

export type TabFilter = { status: DocStatusFilter; excludeOverdue?: boolean };

export type DocListTabDef = {
  key: string;
  label: string;
  tone?: StatusTabTone;
  filter: TabFilter;
};

const CANCELLED_STATUSES: AccountDocStatus[] = ["CANCELLED", "VOIDED"];

const all: DocListTabDef = { key: "all", label: "ทั้งหมด", filter: { status: "ALL" } };
const draft: DocListTabDef = { key: "draft", label: "ร่าง", filter: { status: "DRAFT" } };
const awaitingApproval: DocListTabDef = {
  key: "awaiting_approval",
  label: "รออนุมัติ",
  filter: { status: "AWAITING_APPROVAL" },
};
const approved: DocListTabDef = { key: "approved", label: "อนุมัติแล้ว", filter: { status: "APPROVED" } };
const overdue: DocListTabDef = {
  key: "overdue",
  label: "พ้นกำหนด",
  tone: "danger",
  filter: { status: "OVERDUE" },
};
const cancelled: DocListTabDef = {
  key: "cancelled",
  label: "ยกเลิก",
  filter: { status: CANCELLED_STATUSES },
};

// ตาราง §3 "แท็บ (ตามลำดับ)" ต่อ docType — เฉพาะ docType ที่ WO 1.1 ต่อหน้ารายการ
export const LIST_TABS: Partial<Record<AccountDocType, DocListTabDef[]>> = {
  QUOTATION: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอตอบรับ", filter: { status: "AWAITING_ACCEPT", excludeOverdue: true } },
    overdue,
    { key: "accepted", label: "ยอมรับแล้ว", filter: { status: "ACCEPTED" } },
    { key: "rejected", label: "ปฏิเสธแล้ว", filter: { status: "REJECTED" } },
    cancelled,
  ],
  DEPOSIT_RECEIPT: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    overdue,
    { key: "deduct", label: "รอหักมัดจำ", filter: { status: "AWAITING_DEDUCT" } },
    { key: "deducted", label: "หักมัดจำครบแล้ว", filter: { status: "DEDUCTED" } },
    cancelled,
  ],
  // ground truth: f3-invoice-list.png + acc-v2-expected.json.invoiceTabs — ห้ามต่างชุด/ลำดับ/ป้าย
  INVOICE: [
    all,
    draft,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    { key: "partial", label: "ชำระบางส่วน", filter: { status: "PARTIAL", excludeOverdue: true } },
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    overdue,
    cancelled,
  ],
  RECEIPT: [all, draft, { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } }, cancelled],
  TAX_INVOICE: [all, draft, { key: "issued", label: "ออกแล้ว", filter: { status: "ISSUED" } }, cancelled],
  CREDIT_NOTE: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระคืน", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  DEBIT_NOTE: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  BILLING_NOTE: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอรับชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    { key: "overdue", label: "เกินเวลารับชำระ", tone: "danger", filter: { status: "OVERDUE" } },
    { key: "paid", label: "รับชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  // ─── รายจ่าย ───
  PURCHASE_ORDER: [all, draft, awaitingApproval, approved, cancelled],
  ASSET_PURCHASE_ORDER: [all, draft, awaitingApproval, approved, cancelled],
  PURCHASE: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    overdue,
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  EXPENSE: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    overdue,
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  ASSET_PURCHASE: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    overdue,
    { key: "received", label: "รับแล้ว", filter: { status: "RECEIVED" } },
    cancelled,
  ],
  PURCHASE_TAX_INVOICE: [
    all,
    { key: "awaiting_receive", label: "รอรับใบกำกับ", filter: { status: "AWAITING_RECEIVE" } },
    { key: "received", label: "รับใบกำกับแล้ว", filter: { status: "RECEIVED" } },
    cancelled,
  ],
  // เพิ่มตาม §3 ให้ครบ — route ราคาถูกของ WO 1.2 (deposit-payment/credit-note-received/debit-note-received)
  // ก็ใช้ ExpenseListPage/LIST_TABS ชุดเดียวกับ WO 1.1 (กันแท็บว่างเปล่าตอนเปิดหน้าจริง)
  DEPOSIT_PAYMENT: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    overdue,
    { key: "deduct", label: "รอหักมัดจำ", filter: { status: "AWAITING_DEDUCT" } },
    { key: "deducted", label: "หักมัดจำครบแล้ว", filter: { status: "DEDUCTED" } },
    cancelled,
  ],
  CREDIT_NOTE_RECEIVED: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอรับชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    { key: "paid", label: "รับชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  DEBIT_NOTE_RECEIVED: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  // WO 1.7 §3 แถว "ใบรวมจ่าย CP": ร่าง · รออนุมัติ · รอชำระ · เกินเวลาชำระ · ชำระแล้ว · ยกเลิก
  COMBINED_PAYMENT: [
    all,
    draft,
    awaitingApproval,
    { key: "awaiting", label: "รอชำระ", filter: { status: "AWAITING_PAYMENT", excludeOverdue: true } },
    overdue,
    { key: "paid", label: "ชำระแล้ว", filter: { status: "PAID" } },
    cancelled,
  ],
  // ─── สินค้า: PRR — โมเดลปัจจุบันสร้างแล้ว = ISSUED ทันที ไม่มี workflow ร่าง/อนุมัติ (ยังนับ 0 เสมอจนกว่าจะมี WO ต่อ)
  GOODS_ISSUE: [all, draft, awaitingApproval, { key: "approved", label: "อนุมัติแล้ว", filter: { status: "ISSUED" } }, cancelled],
  GOODS_ISSUE_RETURN: [all, draft, awaitingApproval, { key: "approved", label: "อนุมัติแล้ว", filter: { status: "ISSUED" } }, cancelled],
  // WO 4.3 §8.4 — ใบปรับต้นทุนสินค้า (CA): ชุดแท็บเดียวกับใบเบิก
  COST_ADJUSTMENT: [all, draft, { key: "approved", label: "อนุมัติแล้ว", filter: { status: "ISSUED" } }, cancelled],
};

/** คืน filter (status/excludeOverdue) ของแท็บ key ที่ระบุ — ไม่พบ = fallback "ทั้งหมด" (ไม่ throw กันหน้าแตก) */
export function tabToFilter(docType: AccountDocType, key: string | undefined): TabFilter {
  const tabs = LIST_TABS[docType];
  const found = tabs?.find((t) => t.key === key);
  return found?.filter ?? { status: "ALL" };
}

/** ทางลัดใช้ในหน้ารายการ — แท็บที่ยังไม่รู้จัก (query แปลก ๆ) = แท็บแรก ("ทั้งหมด") เสมอ */
export function activeTabKey(docType: AccountDocType, key: string | undefined): string {
  const tabs = LIST_TABS[docType] ?? [all];
  return tabs.find((t) => t.key === key)?.key ?? tabs[0].key;
}

// ─────────────────────────────────────────────────────────────────────────
// NAV_FLYOUT_TABS — ย้ายมาจาก service.ts (WO 1.1) เพื่อให้ตัวนับ flyout เมนู V2 (AccountTabBar ระดับ 2)
// ใช้ที่มาเดียวกับแท็บของหน้ารายการด้านบน (กันเพี้ยนตามที่ BLUEPRINT §1 สั่ง — "ห้ามต่างชุดแท็บ")
// รูปแบบ: คีย์ผลลัพธ์ = `${docType}:${tabKey}` (และ `${docType}:all`) — service.ts:accountFlyoutCounts() ใช้
// สร้างตัวนับ 2 query รวมทุก docType ก่อนแมปกลับมาที่นี่ — ดูรายละเอียดกฎ excludeOverdue ที่ accountFlyoutCounts()
// ⚠️ นี่คือ "ชุดย่อย" ของ LIST_TABS (เฉพาะ 2–4 รายการที่โชว์ใน flyout ตาม §1) ไม่ใช่ทุกแท็บของหน้ารายการ
export const NAV_FLYOUT_TABS: Partial<Record<AccountDocType, Record<string, AccountDocStatus[] | "overdue">>> = {
  QUOTATION: { awaiting: ["AWAITING_ACCEPT"], accepted: ["ACCEPTED"], overdue: "overdue" },
  DEPOSIT_RECEIPT: { awaiting: ["AWAITING_PAYMENT"], overdue: "overdue", deduct: ["AWAITING_DEDUCT"] },
  INVOICE: { awaiting: ["AWAITING_PAYMENT"], paid: ["PAID"], overdue: "overdue" },
  RECEIPT: { paid: ["PAID"] },
  TAX_INVOICE: { issued: ["ISSUED"] },
  CREDIT_NOTE: {},
  DEBIT_NOTE: {},
  BILLING_NOTE: { awaiting: ["AWAITING_PAYMENT"], overdue: "overdue", paid: ["PAID"] },
  PURCHASE: { awaiting: ["AWAITING_PAYMENT"], paid: ["PAID"], overdue: "overdue" },
  EXPENSE: { awaiting: ["AWAITING_PAYMENT"], paid: ["PAID"], overdue: "overdue" },
  ASSET_PURCHASE: { awaiting: ["AWAITING_PAYMENT"], overdue: "overdue", received: ["RECEIVED"] },
  PURCHASE_ORDER: { awaiting_approval: ["AWAITING_APPROVAL"], approved: ["APPROVED"] },
  ASSET_PURCHASE_ORDER: { awaiting_approval: ["AWAITING_APPROVAL"], approved: ["APPROVED"] },
  PURCHASE_TAX_INVOICE: { awaiting_receive: ["AWAITING_RECEIVE"], received: ["RECEIVED"] },
  COMBINED_PAYMENT: { awaiting: ["AWAITING_PAYMENT"], overdue: "overdue", paid: ["PAID"] },
};

// ─────────────────────────────────────────────────────────────────────────
// ตัวกรองช่วงวันที่มาตรฐานหน้ารายการ (§1: preset default = "ปีนี้") — คำนวณเป็นวันที่ปฏิทินไทย (Asia/Bangkok)
// เสมอ (ไม่ใช่ TZ เครื่อง) ให้ตรงกับ bkkYearMonth() ของ service.ts (pipeline-M7)
import type { DateRangePreset } from "@/components/account-v2/ListFilters";

function bkkToday(now: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) };
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1-based

/** preset → {from,to} (ISO yyyy-mm-dd, ปฏิทินไทย) — "custom"/ไม่รู้จัก = ไม่กรอง (คืน {}) */
export function presetRangeBkk(preset: DateRangePreset | undefined, now: Date = new Date()): { from?: string; to?: string } {
  const { y, m } = bkkToday(now);
  if (preset === "this_month") {
    return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}` };
  }
  if (preset === "this_quarter") {
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const qEndMonth = qStartMonth + 2;
    return {
      from: `${y}-${pad2(qStartMonth)}-01`,
      to: `${y}-${pad2(qEndMonth)}-${pad2(lastDayOfMonth(y, qEndMonth))}`,
    };
  }
  if (preset === "this_year" || preset === undefined) {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return {}; // "custom" — from/to มาจาก input ของผู้ใช้เอง (ListFilters ส่งตรงมาแล้ว)
}

// docType ที่ WO 1.1 เดินสาย DocListPage เข้าให้ (ใช้ตรวจ coverage ใน qc-acc-v2-list.mts)
export const WO_1_1_DOC_TYPES: readonly AccountDocType[] = [
  "QUOTATION",
  "INVOICE",
  "RECEIPT",
  "TAX_INVOICE",
  "DEPOSIT_RECEIPT",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "BILLING_NOTE",
  "EXPENSE",
  "PURCHASE",
  "PURCHASE_ORDER",
  "ASSET_PURCHASE_ORDER",
  "ASSET_PURCHASE",
  "PURCHASE_TAX_INVOICE",
  "GOODS_ISSUE",
];
