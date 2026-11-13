// HR H2.12 ▸ F1 + F5 — ประเภทการลาตามกฎหมาย (ชุดตั้งต้นที่ร้านเลือกเพิ่มเอง) + คำเตือนเมื่อร้านตั้งต่ำกว่า · ไฟล์บริสุทธิ์ (ไม่ import อะไร · ไม่แตะฐานข้อมูล)
//   แหล่ง: shark-thai-law/references/domain-labour-payroll.md §ค (ตรวจ 13 พ.ย. 2569) — ผลค้นคว้า ไม่ใช่คำปรึกษากฎหมาย ·
//   ป้ายความมั่นใจเก็บในตาราง (tag) ไม่แสดงเป็นป้ายบนจอ: [V]/[V2] แสดงมาตรา · [U] ใช้ถ้อยคำกลาง ("โปรดตรวจกับ…") ·
//   คำเตือน (F5) อ้างมาตราเฉพาะ [V] · อื่น ๆ ถ้อยคำกลาง · ไม่บล็อกการบันทึกเด็ดขาด (SKILL §2 ข้อ 1–3) ·
//   ไม่สร้างให้อัตโนมัติ · ไม่สร้างซ้ำเมื่อร้านมีประเภทที่ตรงกันอยู่แล้ว · ทุกค่าแก้ได้ก่อนเพิ่ม ·
//   ข้อจำกัดที่ยังทำไม่ได้ (ไม่มี migration ในใบนี้): ลาเลี้ยงดูบุตรจ่าย 50% (D-H212-partial-pay-leave) · โควตาต่อครรภ์/ภายใน 90 วันหลังคลอด
//   ตั้งเป็นโควตาต่อปี + หมายเหตุ (D-H212-per-event-quota) ◂

export type LawTag = "V" | "V2" | "U";
export type LeaveCategory = "SICK" | "PERSONAL" | "VACATION" | "OTHER";
/** ชนิดตามกฎหมายที่ระบบจำได้จากประเภทการลาของร้าน */
export type StatKind = "sick" | "personal" | "annual" | "maternityPaid" | "maternityUnpaid" | "paternity" | "military" | "unpaid" | "childcare";

export type LeavePreset = {
  key: StatKind;
  category: LeaveCategory;
  /** null = ไม่จำกัด */
  quotaDays: number | null;
  paid: boolean;
  minServiceDays: number;
  attachmentAfterDays: number | null;
  /** ป้ายความมั่นใจของแหล่ง (ภายใน — ไม่แสดงเป็นป้าย) */
  tag: LawTag;
  /** มาตราที่อ้าง (แสดงเมื่อ tag V/V2) · null = ไม่มีมาตรา ⇒ ถ้อยคำกลาง */
  ref: string | null;
  /** โควตาตามกฎหมายเป็น "ต่อครั้ง/ต่อครรภ์" — ระบบตั้งได้แค่ต่อปี (D-H212-per-event-quota) */
  perEvent: boolean;
  /** false = แสดงในรายการแต่กดเพิ่มไม่ได้ (ระบบยังทำไม่ได้) */
  supported: boolean;
};

/** ชุดตั้งต้นตามกฎหมาย — ค่า = ตาราง §ค · ลำดับ = ลำดับบนจอ */
export const LEAVE_PRESETS: readonly LeavePreset[] = [
  { key: "sick", category: "SICK", quotaDays: 30, paid: true, minServiceDays: 0, attachmentAfterDays: 3, tag: "V", ref: "ม.32, ม.57", perEvent: false, supported: true },
  { key: "personal", category: "PERSONAL", quotaDays: 3, paid: true, minServiceDays: 0, attachmentAfterDays: null, tag: "V2", ref: "ม.34, ม.57/1", perEvent: false, supported: true },
  { key: "annual", category: "VACATION", quotaDays: 6, paid: true, minServiceDays: 365, attachmentAfterDays: null, tag: "V2", ref: "ม.30", perEvent: false, supported: true },
  { key: "maternityPaid", category: "OTHER", quotaDays: 60, paid: true, minServiceDays: 0, attachmentAfterDays: null, tag: "V", ref: "ม.41, ม.59", perEvent: true, supported: true },
  { key: "maternityUnpaid", category: "OTHER", quotaDays: 60, paid: false, minServiceDays: 0, attachmentAfterDays: null, tag: "V", ref: "ม.41", perEvent: true, supported: true },
  { key: "paternity", category: "OTHER", quotaDays: 15, paid: true, minServiceDays: 0, attachmentAfterDays: null, tag: "V", ref: "ม.41/1, ม.59/2", perEvent: true, supported: true },
  { key: "military", category: "OTHER", quotaDays: 60, paid: true, minServiceDays: 0, attachmentAfterDays: null, tag: "V", ref: "ม.35, ม.58", perEvent: false, supported: true },
  { key: "unpaid", category: "OTHER", quotaDays: null, paid: false, minServiceDays: 0, attachmentAfterDays: null, tag: "U", ref: null, perEvent: false, supported: true },
  { key: "childcare", category: "OTHER", quotaDays: 15, paid: true, minServiceDays: 0, attachmentAfterDays: null, tag: "V", ref: "ม.41 วรรคสี่, ม.59/1", perEvent: false, supported: false },
];
export const LEAVE_PRESET_KEYS: readonly StatKind[] = LEAVE_PRESETS.map((p) => p.key);
export const leavePresetOf = (key: unknown): LeavePreset | null => LEAVE_PRESETS.find((p) => p.key === key) ?? null;
/** แสดงมาตราได้เมื่อแหล่ง [V]/[V2] และมีมาตรา */
export const presetShowsRef = (p: LeavePreset) => (p.tag === "V" || p.tag === "V2") && !!p.ref;

/** ข้อความปฏิเสธคงที่ (server action → รหัสสั้น) */
export const LEAVE_PRESET_TEXT = {
  unknown: "ไม่พบประเภทการลาตามกฎหมายนี้ — กรุณาเปิดหน้านี้ใหม่",
  unsupported: "ระบบยังไม่รองรับประเภทการลานี้ (จ่ายค่าจ้างบางส่วน)",
  exists: "ร้านมีประเภทการลานี้อยู่แล้ว — แก้ที่รายการด้านบนแทนการเพิ่มซ้ำ",
} as const;

export type PolicyLike = { id: string; name: string; category: string; paid: boolean; quotaDays: unknown; minServiceDays: number; unitId?: string | null; active?: boolean };
const quota = (q: unknown): number | null => {
  if (q === null || q === undefined || q === "") return null;
  const n = Number(String(q));
  return Number.isFinite(n) ? n : null;
};

/** ชนิดตามกฎหมายของประเภทการลาของร้าน (หมวด + ชื่อ) · null = ไม่ตรงชนิดใด */
export function statKindOf(p: Pick<PolicyLike, "name" | "category" | "paid" | "quotaDays">): StatKind | null {
  if (p.category === "SICK") return "sick";
  if (p.category === "PERSONAL") return "personal";
  if (p.category === "VACATION") return "annual";
  if (p.category !== "OTHER") return null;
  const n = String(p.name ?? "").toLowerCase();
  if (/เลี้ยงดูบุตร|child[\s-]?care/.test(n)) return "childcare";
  if (/ภริยา|ภรรยา|คู่สมรส|paternity|spouse/.test(n)) return "paternity";
  if (/คลอด|maternity/.test(n)) return p.paid ? "maternityPaid" : "maternityUnpaid";
  if (/ทหาร|military/.test(n)) return "military";
  if (!p.paid && (/ไม่รับค่าจ้าง|ไม่ได้ค่าจ้าง|unpaid/.test(n) || quota(p.quotaDays) === null)) return "unpaid";
  return null;
}

export type PresetRow = LeavePreset & { existing: { id: string; name: string } | null };
/** รายการชุดตั้งต้น + ประเภทของร้านที่ตรงอยู่แล้ว (นับเฉพาะประเภททั้งร้านที่ยังใช้งาน — ชุดตั้งต้นสร้างเป็นประเภททั้งร้าน) */
export function leavePresetRows(policies: readonly PolicyLike[]): PresetRow[] {
  const live = policies.filter((p) => p.active !== false && (p.unitId ?? null) === null);
  return LEAVE_PRESETS.map((pr) => {
    // ลาคลอดส่วนไม่ได้ค่าจ้าง: ร้านที่ตั้งลาคลอดประเภทเดียวครบ 120 วัน (หรือไม่จำกัด) แล้ว = มีแล้ว
    const whole = (p: PolicyLike) => pr.key === "maternityUnpaid" && statKindOf(p) === "maternityPaid" && (quota(p.quotaDays) === null || quota(p.quotaDays)! >= 120);
    const hit = live.find((p) => statKindOf(p) === pr.key) ?? live.find(whole) ?? null;
    return { ...pr, existing: hit ? { id: hit.id, name: hit.name } : null };
  });
}

export type LeaveWarning =
  | { code: "fewerV"; kind: StatKind; ref: string; law: number; set: number }
  | { code: "unpaidV"; kind: StatKind; ref: string }
  | { code: "fewerN"; kind: StatKind; law: number; set: number }
  | { code: "unpaidN"; kind: StatKind }
  | { code: "serviceN"; kind: StatKind; law: number; set: number }
  | { code: "maternityTotal"; kind: "maternityPaid" | "maternityUnpaid"; ref: string; law: number; set: number }
  | { code: "maternityPaidDays"; kind: "maternityPaid" | "maternityUnpaid"; ref: string; law: number; set: number };

/**
 * F5 — คำเตือนต่อประเภทการลาที่ตรงชนิดตามกฎหมายแต่ตั้งวันน้อยกว่า/ไม่จ่ายค่าจ้าง (ไม่บล็อก) · key = id ของประเภท ·
 * ลาคลอดนับรวมทุกประเภทลาคลอดของร้าน (ส่วนได้ค่าจ้าง + ส่วนไม่ได้ค่าจ้าง): รวม < 120 (ม.41) · ส่วนได้ค่าจ้างรวม < 60 (ม.59)
 */
export function leavePolicyWarnings(policies: readonly PolicyLike[]): Map<string, LeaveWarning[]> {
  const out = new Map<string, LeaveWarning[]>();
  const live = policies.filter((p) => p.active !== false);
  const push = (id: string, w: LeaveWarning) => out.set(id, [...(out.get(id) ?? []), w]);
  const lawOf = (k: StatKind) => LEAVE_PRESETS.find((x) => x.key === k)!;
  const mat = live.filter((p) => {
    const k = statKindOf(p);
    return k === "maternityPaid" || k === "maternityUnpaid";
  });
  const sum = (xs: readonly PolicyLike[]) => (xs.some((p) => quota(p.quotaDays) === null) ? Infinity : xs.reduce((a, p) => a + (quota(p.quotaDays) ?? 0), 0));
  const matTotal = sum(mat);
  const matPaid = sum(mat.filter((p) => p.paid));
  for (const p of live) {
    const k = statKindOf(p);
    if (!k || k === "unpaid" || k === "childcare") continue;
    const q = quota(p.quotaDays);
    if (k === "maternityPaid" || k === "maternityUnpaid") {
      if (matTotal < 120) push(p.id, { code: "maternityTotal", kind: k, ref: "ม.41", law: 120, set: matTotal });
      if (matPaid < 60) push(p.id, { code: "maternityPaidDays", kind: k, ref: "ม.59", law: 60, set: Number.isFinite(matPaid) ? matPaid : 0 });
      continue;
    }
    const law = lawOf(k);
    const cite = law.tag === "V" && law.ref ? law.ref : null;
    if (law.paid && !p.paid) push(p.id, cite ? { code: "unpaidV", kind: k, ref: k === "sick" ? "ม.57" : k === "paternity" ? "ม.59/2" : k === "military" ? "ม.58" : cite } : { code: "unpaidN", kind: k });
    if (law.quotaDays !== null && q !== null && q < law.quotaDays) push(p.id, cite ? { code: "fewerV", kind: k, ref: cite, law: law.quotaDays, set: q } : { code: "fewerN", kind: k, law: law.quotaDays, set: q });
    if (law.minServiceDays > 0 && p.minServiceDays > law.minServiceDays) push(p.id, { code: "serviceN", kind: k, law: law.minServiceDays, set: p.minServiceDays });
  }
  return out;
}
// ◂ HR H2.12
