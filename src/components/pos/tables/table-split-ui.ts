// table-split-ui.ts — POS P2.5U ตัวช่วยบริสุทธิ์ของแผงแยกบิล (15B/15C · client-safe · ไม่แตะ DB/เซิร์ฟเวอร์ · ไม่มีข้อความไทย)
//   ร่างแผนบนจอ (แบบ · จำนวนบิล · การระบุบิล/ที่นั่งต่อรายการ · สมาชิกต่อบิล) ⇄ อินพุตของ registerSplitTableAction / allocateTableSplit (table-split-shared.ts)
//   🔴 เงินเดียวที่คิดบนจอ = allocateTableSplit (ตัวแบ่งบริสุทธิ์ตัวเดียวกับเซิร์ฟเวอร์) เพื่อพรีวิว — บันทึกแล้วค่าของเซิร์ฟเวอร์ (SplitPlanView) ชนะเสมอ ·
//      ยอดของรายการ (lineSatang) มาจาก registerTableDetailAction (lineTotalSatang) · ไม่มีการคูณ/บวกเงินเองที่นี่
//   การระบุบิล: assign[itemId][partNo] = จำนวนหน่วย · partNo 0 = กลางโต๊ะ (SEAT เท่านั้น — หารทุกที่นั่ง) · EQUAL ไม่มีการระบุ

import {
  allocateTableSplit,
  TABLE_SPLIT_MAX_PARTS,
  TABLE_SPLIT_MIN_PARTS,
  type SplitPlanView,
  type TableSplitAllocation,
  type TableSplitMode,
  type TableSplitResult,
} from "@/lib/modules/pos/table-split-shared";
import type { RegisterTableDetailResult } from "@/lib/modules/pos/table-shared";

type Detail = Extract<RegisterTableDetailResult, { ok: true }>;

/** รายการหนึ่งของแผง (ซ้าย) — ทุกค่ามาจากแผงโต๊ะของเซิร์ฟเวอร์ */
export type SplitItemRow = { id: string; name: string; sub: string; qty: number; unitSatang: number; lineSatang: number };
/** partNo → จำนวนหน่วย (0 = กลางโต๊ะ) */
export type PartQty = Record<number, number>;
export type SplitDraft = {
  mode: TableSplitMode;
  partCount: number;
  assign: Record<string, PartQty>;
  /** partNo → memberId (null = ไม่มีสมาชิก) · ไม่มีคีย์ = ปริยาย (สมาชิกของโต๊ะอยู่บิล 1) */
  members: Record<number, string | null>;
};

export const SHARED = 0;
/** ใบที่ส่งเข้าจอชำระ (TableCheckout · มติ 7) — memberId ของใบ = ส่งใน cart เสมอเมื่อมี (fix1 มติ 7 · STORE_CREDIT) */
export type SplitPayPart = { partId: string; partNo: number; partCount: number; memberId: string | null; memberName: string | null };
export const clampParts = (n: number) => Math.min(TABLE_SPLIT_MAX_PARTS, Math.max(TABLE_SPLIT_MIN_PARTS, Math.floor(n) || TABLE_SPLIT_MIN_PARTS));

/** รายการของแผงตามลำดับ ids (unpaidItemIds ของแผงโต๊ะ หรือรายการของแผน) · ไม่พบในรอบ = ข้าม */
export function splitItemsOf(detail: Detail | null, ids: readonly string[]): SplitItemRow[] {
  if (!detail) return [];
  const all = new Map(detail.rounds.flatMap((r) => r.items.map((i) => [i.id, i] as const)));
  const out: SplitItemRow[] = [];
  for (const id of ids) {
    const i = all.get(id);
    if (!i) continue;
    out.push({ id, name: i.name, sub: [...i.options.map((o) => o.name), i.note ?? ""].filter(Boolean).join(" · "), qty: i.qty, unitSatang: i.unitPriceSatang, lineSatang: i.lineTotalSatang });
  }
  return out;
}

/** รายการของแผน (ลำดับตามรายการค้างจ่ายของโต๊ะก่อน แล้วตามลำดับในแผน) */
export function planItemIds(plan: SplitPlanView, order: readonly string[]): string[] {
  const inPlan = new Set(plan.parts.flatMap((p) => p.lines.map((l) => l.itemId)));
  const known = order.filter((id) => inPlan.has(id));
  const rest = [...inPlan].filter((id) => !known.includes(id));
  return [...known, ...rest];
}

/** ร่างเปล่าของแบบหนึ่ง (ITEM 2 บิล · EQUAL/SEAT = จำนวนลูกค้า ≥ 2) */
export function emptyDraft(mode: TableSplitMode, guests: number | null, keepMembers: Record<number, string | null> = {}): SplitDraft {
  const n = mode === "ITEM" ? 2 : clampParts(guests ?? 2);
  return { mode, partCount: n, assign: {}, members: { ...keepMembers } };
}

/** ร่างจากแผนที่บันทึกแล้ว (แก้แผน = แทนแผนเดิม) */
export function draftFromPlan(plan: SplitPlanView): SplitDraft {
  const assign: Record<string, PartQty> = {};
  const members: Record<number, string | null> = {};
  for (const part of plan.parts) {
    members[part.no] = part.memberId;
    for (const l of part.lines) {
      if (plan.mode === "EQUAL") continue;
      const a = (assign[l.itemId] ??= {});
      if (l.qty !== null) a[part.no] = (a[part.no] ?? 0) + l.qty;
      else if (part.no === 1 && l.shareNum !== null) a[SHARED] = (a[SHARED] ?? 0) + l.shareNum; // ส่วนแบ่งกลางโต๊ะ: นับครั้งเดียวจากบิล 1
    }
  }
  return { mode: plan.mode, partCount: plan.partCount, assign, members };
}

export const assignedOf = (d: SplitDraft, itemId: string): number => Object.values(d.assign[itemId] ?? {}).reduce((a, b) => a + b, 0);
/** บิลที่รายการนี้อยู่ทั้งหมด (เรียงเลข · 0 = กลางโต๊ะ) */
export const partsOf = (d: SplitDraft, itemId: string): number[] =>
  Object.entries(d.assign[itemId] ?? {})
    .filter(([, q]) => q > 0)
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
/** รายการนี้อยู่บิลเดียวครบทุกหน่วย → เลขบิล · ไม่งั้น null */
export function singlePart(d: SplitDraft, item: SplitItemRow): number | null {
  const ps = partsOf(d, item.id);
  return ps.length === 1 && (d.assign[item.id]?.[ps[0]!] ?? 0) === item.qty ? ps[0]! : null;
}
export const unassignedItems = (d: SplitDraft, items: readonly SplitItemRow[]): SplitItemRow[] => (d.mode === "EQUAL" ? [] : items.filter((i) => assignedOf(d, i.id) !== i.qty));
export function emptyParts(d: SplitDraft): number[] {
  if (d.mode === "EQUAL") return [];
  const used = new Set<number>();
  for (const a of Object.values(d.assign)) for (const [k, q] of Object.entries(a)) if (q > 0) used.add(Number(k));
  if (used.has(SHARED)) return []; // กลางโต๊ะหารทุกที่นั่ง ⇒ ไม่มีที่นั่งว่างเงิน
  return Array.from({ length: d.partCount }, (_, i) => i + 1).filter((n) => !used.has(n));
}

/** ทั้งรายการไปบิลเดียว (แตะครั้งเดียว · 15B) */
export function assignWhole(d: SplitDraft, item: SplitItemRow, partNo: number): SplitDraft {
  return { ...d, assign: { ...d.assign, [item.id]: { [partNo]: item.qty } } };
}
/** จำนวนหน่วยของรายการในบิลหนึ่ง (ตัวปรับในป๊อปโอเวอร์ · ไม่ให้รวมเกินจำนวนของรายการ) */
export function assignQty(d: SplitDraft, item: SplitItemRow, partNo: number, qty: number): SplitDraft {
  const cur = { ...(d.assign[item.id] ?? {}) };
  const others = Object.entries(cur).reduce((a, [k, q]) => (Number(k) === partNo ? a : a + q), 0);
  const v = Math.max(0, Math.min(qty, item.qty - others));
  if (v > 0) cur[partNo] = v;
  else delete cur[partNo];
  return { ...d, assign: { ...d.assign, [item.id]: cur } };
}
export function clearItem(d: SplitDraft, itemId: string): SplitDraft {
  const assign = { ...d.assign };
  delete assign[itemId];
  return { ...d, assign };
}

/** เพิ่มบิล (≤ 20) */
export const addPart = (d: SplitDraft): SplitDraft => (d.partCount >= TABLE_SPLIT_MAX_PARTS ? d : { ...d, partCount: d.partCount + 1 });
/** ลบบิลที่ว่าง (เลขหลังจากนั้นเลื่อนลง) · บิลไม่ว่าง/เหลือ 2 = ไม่เปลี่ยน */
export function removePart(d: SplitDraft, partNo: number): SplitDraft {
  if (d.partCount <= TABLE_SPLIT_MIN_PARTS || !emptyParts(d).includes(partNo)) return d;
  const shift = (n: number) => (n > partNo ? n - 1 : n);
  const assign: Record<string, PartQty> = {};
  for (const [id, a] of Object.entries(d.assign)) {
    const b: PartQty = {};
    for (const [k, q] of Object.entries(a)) if (Number(k) !== partNo) b[shift(Number(k))] = q;
    assign[id] = b;
  }
  const members: Record<number, string | null> = {};
  for (const [k, m] of Object.entries(d.members)) if (Number(k) !== partNo) members[shift(Number(k))] = m;
  return { ...d, partCount: d.partCount - 1, assign, members };
}
/** จำนวนบิล/ที่นั่ง (สเต็ปเปอร์ "− N คน +" ของหารเท่า · ที่นั่ง) — ลดแล้วการระบุของที่นั่งที่หายไปถูกล้าง */
export function setPartCount(d: SplitDraft, n: number): SplitDraft {
  const count = clampParts(n);
  if (count === d.partCount) return d;
  const assign: Record<string, PartQty> = {};
  for (const [id, a] of Object.entries(d.assign)) {
    const b: PartQty = {};
    for (const [k, q] of Object.entries(a)) if (Number(k) <= count) b[Number(k)] = q;
    assign[id] = b;
  }
  const members: Record<number, string | null> = {};
  for (const [k, m] of Object.entries(d.members)) if (Number(k) <= count) members[Number(k)] = m;
  return { ...d, partCount: count, assign, members };
}

/** การระบุบิลของร่าง → allocations ของ registerSplitTable (EQUAL = null) */
export function allocationsOf(d: SplitDraft, items: readonly SplitItemRow[]): TableSplitAllocation[] | null {
  if (d.mode === "EQUAL") return null;
  const out: TableSplitAllocation[] = [];
  for (const it of items) for (const [k, q] of Object.entries(d.assign[it.id] ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) if (q > 0) out.push({ itemId: it.id, partNo: Number(k) === SHARED ? null : Number(k), qty: q });
  return out;
}

/** พรีวิวด้วยตัวแบ่งบริสุทธิ์ (ระบุครบเท่านั้น · ไม่ครบ = null) — ค่าของเซิร์ฟเวอร์ชนะเมื่อบันทึก */
export function previewOf(d: SplitDraft, items: readonly SplitItemRow[], serviceChargeBp: number): Extract<TableSplitResult, { ok: true }> | { ok: false; code: string } | null {
  if (!items.length) return null;
  if (unassignedItems(d, items).length || emptyParts(d).length) return null;
  const r = allocateTableSplit({
    mode: d.mode,
    partCount: d.partCount,
    items: items.map((i) => ({ id: i.id, qty: i.qty, unitSatang: i.unitSatang })),
    allocations: allocationsOf(d, items),
    serviceChargeBp,
  });
  return r.ok ? r : { ok: false, code: r.code };
}

/** ร่างเท่ากับแผนที่บันทึกไว้ไหม (ไม่มีอะไรต้องบันทึก) */
export function sameAsPlan(d: SplitDraft, plan: SplitPlanView | null): boolean {
  if (!plan) return false;
  const p = draftFromPlan(plan);
  if (p.mode !== d.mode || p.partCount !== d.partCount) return false;
  const norm = (a: Record<string, PartQty>) =>
    JSON.stringify(
      Object.entries(a)
        .map(([id, q]) => [id, Object.entries(q).filter(([, v]) => v > 0).sort()] as const)
        .filter(([, q]) => q.length)
        .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    );
  if (norm(p.assign) !== norm(d.assign)) return false;
  for (let n = 1; n <= d.partCount; n++) if (n in d.members && (d.members[n] ?? null) !== (p.members[n] ?? null)) return false;
  return true;
}

/** สมาชิกของบิลตามร่าง (ปริยาย: สมาชิกของโต๊ะอยู่บิล 1) */
export const memberOfPart = (d: SplitDraft, partNo: number, sessionMemberId: string | null): string | null => (partNo in d.members ? (d.members[partNo] ?? null) : partNo === 1 ? sessionMemberId : null);

/** ใบที่ควรเลือกต่อ (ยังไม่จ่าย เลขต่ำสุด ถัดจากใบที่เพิ่งจ่าย) */
export function nextOpenPart(plan: SplitPlanView | null, after = 0): number | null {
  if (!plan) return null;
  const open = plan.parts.filter((p) => p.status !== "PAID").map((p) => p.no);
  return open.find((n) => n > after) ?? open[0] ?? null;
}
