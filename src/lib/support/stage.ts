// stage.ts — ขั้นของเคสช่วยเหลือ (help-cases · 15 พ.ย. 2026 · แบบ /root/mockups/secretary-help/help.png) — ไฟล์ pure (ไม่แตะฐาน)
//   แถบ 5 ขั้นที่ร้านเห็น: รับเรื่อง → ตรวจสอบ → แก้ไข → รอยืนยัน → ปิดเคส · ขั้นพิเศษ "รอข้อมูลจากคุณ" (NEED_INFO · ป้ายชมพู)
//   `status` เดิม (OPEN/PENDING/RESOLVED) = "ตาใคร" ที่แท็บ backoffice + flow เดิมใช้ — ตั้งขั้นเมื่อไหร่ status ตามตาราง STAGE_STATUS
//     (ทีมกำลังทำ = OPEN · รอร้าน = PENDING · ปิด = RESOLVED) · ทีมตอบข้อความยังตั้ง PENDING ตามเดิมโดยไม่แตะขั้น
//   กติกาฝั่งร้าน (shopReplyStage): ตอบตอน NEED_INFO ⇒ CHECKING · ตอบตอน AWAITING_CONFIRM ("ยังไม่หาย") ⇒ FIXING · ตอบหลังปิด ⇒ RECEIVED (เปิดใหม่)
import type { SupportCaseStage, SupportCaseStatus } from "@prisma/client";

export const CASE_STAGES = ["RECEIVED", "CHECKING", "FIXING", "NEED_INFO", "AWAITING_CONFIRM", "CLOSED"] as const satisfies readonly SupportCaseStage[];
export type CaseStage = (typeof CASE_STAGES)[number];

export function isCaseStage(v: unknown): v is CaseStage {
  return typeof v === "string" && (CASE_STAGES as readonly string[]).includes(v);
}

/** status ที่คู่กับขั้น (ตั้งพร้อมกันทุกครั้งที่เปลี่ยนขั้น) */
export const STAGE_STATUS: Record<CaseStage, SupportCaseStatus> = {
  RECEIVED: "OPEN",
  CHECKING: "OPEN",
  FIXING: "OPEN",
  NEED_INFO: "PENDING",
  AWAITING_CONFIRM: "PENDING",
  CLOSED: "RESOLVED",
};

/** ขั้นบนแถบ 5 ขั้น (1..5) — NEED_INFO ไม่มีช่องของตัวเอง: ใช้ช่องของขั้นก่อนหน้า (ส่ง prev มา) · ไม่รู้ = 2 (ตรวจสอบ) */
export const STAGE_STEP: Record<Exclude<CaseStage, "NEED_INFO">, number> = { RECEIVED: 1, CHECKING: 2, FIXING: 3, AWAITING_CONFIRM: 4, CLOSED: 5 };
export function stageStep(stage: CaseStage, prevBeforeNeedInfo?: CaseStage | null): number {
  if (stage !== "NEED_INFO") return STAGE_STEP[stage];
  return prevBeforeNeedInfo && prevBeforeNeedInfo !== "NEED_INFO" ? Math.min(STAGE_STEP[prevBeforeNeedInfo], 3) : 2;
}

/** ป้ายไทย (ร้าน/backoffice) — ชุดเดียวกับ i18n help.stage.* ของแอป */
export const STAGE_LABEL_TH: Record<CaseStage, string> = {
  RECEIVED: "รับเรื่องแล้ว",
  CHECKING: "กำลังตรวจสอบ",
  FIXING: "กำลังแก้ไข",
  NEED_INFO: "รอข้อมูลจากคุณ",
  AWAITING_CONFIRM: "แก้แล้ว · รอคุณยืนยัน",
  CLOSED: "ปิดเคสแล้ว",
};

/** ขั้นใหม่เมื่อร้านพิมพ์ต่อ (null = ไม่เปลี่ยน) */
export function shopReplyStage(cur: CaseStage): CaseStage | null {
  if (cur === "NEED_INFO") return "CHECKING";
  if (cur === "AWAITING_CONFIRM") return "FIXING";
  if (cur === "CLOSED") return "RECEIVED";
  return null;
}

/** ขั้นที่ตามมาจากการตั้ง status แบบเดิม (backoffice ปุ่มปิดเคส ฯลฯ) — null = ไม่เปลี่ยน */
export function stageForStatus(cur: CaseStage, status: SupportCaseStatus): CaseStage | null {
  if (status === "RESOLVED") return cur === "CLOSED" ? null : "CLOSED";
  return cur === "CLOSED" ? "RECEIVED" : null;
}

/** เลขเคสที่ร้านเห็น (#SHARK-000124 ไม่มี #) — ตรงกับ caseNoLabel ของ backoffice */
export function caseNoText(caseNo: number): string {
  return `SHARK-${String(Math.max(0, Math.floor(Number(caseNo) || 0))).padStart(6, "0")}`;
}

/** หัว push เมื่อทีมเปลี่ยนขั้น: "เคส #SHARK-000124 · สถานะ → กำลังแก้ไข" */
export function stagePushTitle(caseNo: number, stage: CaseStage): string {
  return `เคส #${caseNoText(caseNo)} · สถานะ → ${STAGE_LABEL_TH[stage]}`;
}
