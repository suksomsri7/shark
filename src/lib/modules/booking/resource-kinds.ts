// SVC B.13 — ชนิดทรัพยากร + ป้ายไทย (pure · ไม่มี import ค่า) · ใบสั่ง ledger/svc-briefs/svc-brief-b.13.md §3.2
// ลำดับตายตัว (มติ R6: 7 ชนิดคงที่) — defs/booking.ts คัดลอกรายการนี้เป็น z.enum (core ห้าม import โมดูล) · ข้อสอบ T-0 ตรวจว่าเท่ากัน
// client component import ไฟล์นี้ได้ (ไม่มี I/O)

export const RESOURCE_KINDS = ["CHAIR", "BED", "SOFA", "ROOM", "COUPLE_ROOM", "EQUIPMENT", "EXAM_ROOM"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABELS_TH: Record<ResourceKind, string> = {
  CHAIR: "เก้าอี้",
  BED: "เตียง",
  SOFA: "โซฟา",
  ROOM: "ห้อง",
  COUPLE_ROOM: "ห้องคู่",
  EQUIPMENT: "อุปกรณ์",
  EXAM_ROOM: "ห้องตรวจ",
};

export function isResourceKind(v: unknown): v is ResourceKind {
  return typeof v === "string" && (RESOURCE_KINDS as readonly string[]).includes(v);
}

/** ค่าตั้ง booking.service.resourceKinds ที่ resolve แล้ว → รายการชนิดที่ใช้ได้ (ไม่รู้จัก/ซ้ำ ⇒ ตัดทิ้ง · ไม่ใช่ array ⇒ []) */
export function kindsFromSetting(v: unknown): ResourceKind[] {
  if (!Array.isArray(v)) return [];
  const out: ResourceKind[] = [];
  for (const k of v) if (isResourceKind(k) && !out.includes(k)) out.push(k);
  return out.slice(0, 3);
}

/** ป้ายไทยของชุดชนิด (ภาพ 11 คอลัมน์ "ต้องใช้") · [] ⇒ "—" */
export function kindsLabelTh(kinds: readonly string[]): string {
  const xs = kinds.filter(isResourceKind).map((k) => RESOURCE_KIND_LABELS_TH[k]);
  return xs.length ? xs.join(" + ") : "—";
}
