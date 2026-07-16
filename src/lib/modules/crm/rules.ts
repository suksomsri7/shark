// CRM — สมอง/กติกา (FREEZE โดย Fable) · pure ไม่แตะ DB
// service (Builder) เรียกใช้ · oracle ตรวจกติกาพวกนี้เป็น golden
//
// หลักที่ห้ามละเมิด:
// - deal.kind = สำเนาของ stage.kind เสมอ (ห้ามตั้งตรง) · ย้าย stage → sync kind + closedAt
// - lifecycleStage เลื่อนได้ตามลูกศรเดียว: LEAD → PROSPECT → CUSTOMER (LOST แยกทาง)
//   Deal WON → contact เป็น CUSTOMER · ทุก Deal ของ contact LOST หมด + ไม่มี OPEN → LOST

import type { CrmStageKind, CrmLifecycleStage } from "@prisma/client";

/** pipeline เริ่มต้นตอน ensureCrm — 5 ขั้นมาตรฐานงานขาย */
export const DEFAULT_PIPELINE = {
  name: "ไปป์ไลน์การขาย",
  stages: [
    { name: "ผู้สนใจใหม่", kind: "OPEN" as CrmStageKind, probability: 10 },
    { name: "ติดต่อแล้ว", kind: "OPEN" as CrmStageKind, probability: 30 },
    { name: "เสนอราคา", kind: "OPEN" as CrmStageKind, probability: 60 },
    { name: "ปิดการขายได้", kind: "WON" as CrmStageKind, probability: 100 },
    { name: "ไม่สำเร็จ", kind: "LOST" as CrmStageKind, probability: 0 },
  ],
};

/** ย้าย deal เข้า stage นี้ → kind + closedAt ควรเป็นอะไร */
export function dealStateForStage(stageKind: CrmStageKind, now: Date): { kind: CrmStageKind; closedAt: Date | null } {
  return { kind: stageKind, closedAt: stageKind === "OPEN" ? null : now };
}

/** deal ปิดแบบ WON → contact lifecycle ควรเป็น CUSTOMER */
export function lifecycleAfterDealWon(current: CrmLifecycleStage): CrmLifecycleStage {
  return current === "CUSTOMER" ? "CUSTOMER" : "CUSTOMER";
}

/** เลื่อน lifecycle ได้ไหม (กันถอยหลังผิดทาง: CUSTOMER ห้ามกลับเป็น LEAD) */
const ORDER: Record<CrmLifecycleStage, number> = { LEAD: 0, PROSPECT: 1, CUSTOMER: 2, LOST: -1 };
export function canAdvanceLifecycle(from: CrmLifecycleStage, to: CrmLifecycleStage): boolean {
  if (to === "LOST") return from !== "CUSTOMER"; // ลูกค้าแล้วไม่นับ lost
  if (from === "LOST") return to === "LEAD" || to === "PROSPECT"; // กู้กลับมาได้
  return ORDER[to] >= ORDER[from];
}

/** weighted forecast: Σ(value × probability%) ของดีล OPEN */
export function weightedForecast(deals: { valueSatang: number; kind: CrmStageKind; probability: number }[]): number {
  return deals
    .filter((d) => d.kind === "OPEN")
    .reduce((sum, d) => sum + Math.round((d.valueSatang * d.probability) / 100), 0);
}
