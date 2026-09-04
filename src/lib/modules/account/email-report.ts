// email-report.ts — รายงานทางอีเมล สรุปรายวัน/รายสัปดาห์ (SPEC §9.3 · WO 8.2)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์ทั้งไฟล์** (ไม่แตะ DB · ไม่ส่งเมล) — ข้อสอบเรียกตรงแล้วเทียบข้อความ/คีย์ได้เลย
//    ตัวส่งจริงคือ `service.runAccountEmailReports` (อยู่ที่นั่นเพราะ fitness F5.1 ตรึงจำนวนไฟล์ที่ import prisma)
//
// ปลอดภัยต่อการรันซ้ำ: กันซ้ำด้วย "คีย์ต่องวด" (`acc-report:<systemId>:DAILY:2026-09-30`)
// ที่บันทึกเป็น AppNotification 1 แถว — cron ยิงซ้ำ/รันมือระหว่างวันก็ไม่ส่งเมลซ้ำ
// (กติกาเดียวกับตัวเตือนของ WO 1.9 และ period-sweep — ไม่สร้างตารางใหม่)

import type { AccountPolicy } from "./policy";
import { formatDateTh } from "@/lib/ui/date";

export type ReportKind = "DAILY" | "WEEKLY";

export const REPORT_MARKER_TITLE = "ส่งรายงานบัญชีทางอีเมลแล้ว";

const TZ = "Asia/Bangkok";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/**
 * คีย์งวดของรายงาน — รายวันใช้ "วันไทย" · รายสัปดาห์ใช้ "วันจันทร์ของสัปดาห์นั้น (เวลาไทย)"
 * 🔴 คำนวณจากสตริงวันไทยล้วน ๆ ไม่ใช้ `getDay()` ของ Date (กับดัก TZ — บทเรียน 26 ส.ค.)
 */
export function reportPeriodKey(kind: ReportKind, now: Date): string {
  const ymd = dayKey(now);
  if (kind === "DAILY") return ymd;
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  // เที่ยงวัน UTC ของวันไทยนั้น — ใช้หา day-of-week โดยไม่มีทางเหลื่อมวัน
  const noon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = noon.getUTCDay(); // 0 = อาทิตย์
  const backToMonday = (dow + 6) % 7;
  const monday = new Date(noon.getTime() - backToMonday * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** คีย์กันส่งซ้ำ (1 ร้าน × 1 ชนิด × 1 งวด = 1 ครั้ง) */
export function reportIdempotencyKey(systemId: string, kind: ReportKind, now: Date): string {
  return `acc-report:${systemId}:${kind}:${reportPeriodKey(kind, now)}`;
}

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ReportInput = {
  orgName: string;
  kind: ReportKind;
  now: Date;
  kpi: {
    receivable: { count: number; amount: number };
    payable: { count: number; amount: number };
    overdue: { count: number; amount: number };
    cashTotal: number;
  };
  /** งานที่รอทำ (จำนวนใบ) — ไม่ใส่ชื่อลูกค้าลงเมล (ห้ามส่งข้อมูลลูกค้าออกนอกระบบ) */
  pending: { quotationAwaitingAccept: number; poAwaitingApproval: number; needsReview: number; total: number };
  fiscalYearLabel: string;
};

/**
 * ประกอบหัวเรื่อง + เนื้อความ (ภาษาคน · ไม่มี enum · ไม่มีชื่อ/เบอร์ลูกค้า)
 * บริสุทธิ์ 100% — ข้อสอบเรียกตรงแล้วเทียบสตริงได้
 */
export function composeAccountReport(input: ReportInput): { subject: string; text: string } {
  const label = input.kind === "DAILY" ? "สรุปบัญชีรายวัน" : "สรุปบัญชีรายสัปดาห์";
  const dateText = formatDateTh(input.now);
  const subject = `${label} ${input.orgName} — ${dateText}`;
  const lines = [
    `${label} ของ ${input.orgName}`,
    `ณ วันที่ ${dateText} · ${input.fiscalYearLabel}`,
    "",
    `เงินในมือทุกช่องทาง   ฿${baht(input.kpi.cashTotal)}`,
    `ค้างรับจากลูกค้า      ฿${baht(input.kpi.receivable.amount)} (${input.kpi.receivable.count} ใบ)`,
    `ค้างจ่ายผู้ขาย        ฿${baht(input.kpi.payable.amount)} (${input.kpi.payable.count} ใบ)`,
    `เลยกำหนดชำระ         ฿${baht(input.kpi.overdue.amount)} (${input.kpi.overdue.count} ใบ)`,
    "",
    `งานที่รอคุณ ${input.pending.total} รายการ`,
    `· ใบเสนอราคารอลูกค้าตอบรับ  ${input.pending.quotationAwaitingAccept} ใบ`,
    `· ใบสั่งซื้อรออนุมัติ        ${input.pending.poAwaitingApproval} ใบ`,
    `· ใบสำคัญที่ต้องตรวจ        ${input.pending.needsReview} ใบ`,
    "",
    "เปิดดูรายละเอียดได้ที่หน้าบัญชีของร้าน — ปิดรายงานนี้ได้ที่ ตั้งค่า › นโยบายบัญชี",
  ];
  return { subject, text: lines.join("\n") };
}

/** ชนิดรายงานที่ร้านนี้ต้องส่ง "วันนี้" ตามนโยบาย (รายสัปดาห์ส่งวันจันทร์เวลาไทย) */
export function reportKindsDue(policy: Pick<AccountPolicy, "emailReportDaily" | "emailReportWeekly">, now: Date): ReportKind[] {
  const out: ReportKind[] = [];
  if (policy.emailReportDaily) out.push("DAILY");
  if (policy.emailReportWeekly && reportPeriodKey("WEEKLY", now) === dayKey(now)) out.push("WEEKLY");
  return out;
}
