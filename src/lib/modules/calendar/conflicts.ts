// conflicts.ts — นัดชน (CAL1.9 · สัญญา §11 · R-CAL-35) — **บริสุทธิ์ล้วน** (ไม่แตะฐาน · ไม่อ่านนาฬิกาเอง)
//   แอปมีสำเนาเดียวกัน (apps/mobile/src/lib/cal-conflicts.ts · CAL2.12) เพื่อรวมนัดในเครื่อง — ข้อสอบ fixture ชุดเดียวกันทั้งสองฝั่ง
//   ⚠️ แก้กติกาที่นี่ = แก้สำเนาฝั่งแอปด้วย
import { createHash } from "node:crypto";
import type { AgendaItem, AgendaSource, ConflictNote } from "./agenda";

const MIN_MS = 60_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
/** แหล่งที่นับนัดชน (มีช่วงเวลาจริง · ฉันต้องไปเอง) — ไม่นับ reminder/kanban/แถวสรุป/tax */
export const CONFLICT_SOURCES: readonly AgendaSource[] = ["booking", "crm", "event", "google", "device"];
/** เตือนล่วงหน้าขั้นต่ำของข้อเสนอ "เตือนออกตอน …" (นาที) */
export const SUGGEST_MIN_LEAD = 15;

const hm = (ms: number) => {
  const t = new Date(ms + BKK_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
};

type Span = { it: AgendaItem; s: number; e: number };

/** คู่ที่เข้าเกณฑ์ (mine · ไม่ทั้งวัน · มี endAt > startAt · แหล่งในชุด · ไม่ done) เรียงตามเวลาเริ่ม → id */
function spans(items: AgendaItem[]): Span[] {
  const out: Span[] = [];
  for (const it of items) {
    if (!it.mine || it.allDay || it.done || !it.endAt || !CONFLICT_SOURCES.includes(it.source)) continue;
    const s = Date.parse(it.startAt), e = Date.parse(it.endAt);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    out.push({ it, s, e });
  }
  return out.sort((a, b) => a.s - b.s || (a.it.id < b.it.id ? -1 : a.it.id > b.it.id ? 1 : 0));
}

/** ทับซ้อน ≥ 1 นาที */
const overlaps = (a: Span, b: Span) => a.s < b.e && b.s < a.e && Math.min(a.e, b.e) - Math.max(a.s, b.s) >= MIN_MS;
/** เวลาเดินทางไม่พอ (a เลิกก่อน b เริ่ม แต่ห่าง < travelMinutes) — เฉพาะ travelMinutes > 0 */
const tight = (a: Span, b: Span, travelMs: number) => travelMs > 0 && b.s - a.e >= 0 && b.s - a.e < travelMs;

/** เวลาเสนอให้เตือน: max(now + 1 นาที, ปัดลง 5 นาทีของ (เริ่ม b − max(เดินทาง, 15 นาที))) · b เริ่มแล้ว = null */
export function suggestRemindAt(bStartMs: number, travelMinutes: number, now: Date): string | null {
  if (bStartMs <= +now) return null;
  const cand = Math.floor((bStartMs - Math.max(travelMinutes, SUGGEST_MIN_LEAD) * MIN_MS) / (5 * MIN_MS)) * 5 * MIN_MS;
  const floor = Math.ceil((+now + MIN_MS) / MIN_MS) * MIN_MS;
  return new Date(Math.max(cand, floor)).toISOString();
}

export const conflictKey = (earlierId: string, laterId: string) => createHash("sha1").update(`${earlierId}|${laterId}`).digest("hex");

/**
 * นัดชนของรายการ agenda
 *   byId: ทุกคู่ที่ชน (ทั้งสองทิศ) → ใส่ `AgendaItem.conflictWith`
 *   notes: 1 ข้อความต่อ "คู่ติดกันตามเวลา" ที่ชน (การ์ดจอ 10) · OVERLAP มาก่อน TIGHT เมื่อเป็นคู่เดียวกัน
 */
export function conflicts(items: AgendaItem[], travelMinutes: number, now: Date): { byId: Record<string, string[]>; notes: ConflictNote[] } {
  const travelMs = Math.max(0, travelMinutes) * MIN_MS;
  const sp = spans(items);
  const byId: Record<string, string[]> = {};
  const link = (x: string, y: string) => {
    (byId[x] ??= []).includes(y) || byId[x]!.push(y);
  };
  for (let i = 0; i < sp.length; i++) {
    for (let j = i + 1; j < sp.length; j++) {
      const a = sp[i]!, b = sp[j]!;
      if (b.s >= a.e + travelMs) break; // เรียงตามเวลาเริ่ม ⇒ ตัวถัดไปเริ่มช้ากว่านี้ ไม่ชน a แน่
      if (overlaps(a, b) || tight(a, b, travelMs)) {
        link(a.it.id, b.it.id);
        link(b.it.id, a.it.id);
      }
    }
  }
  const notes: ConflictNote[] = [];
  for (let i = 0; i + 1 < sp.length; i++) {
    const a = sp[i]!, b = sp[i + 1]!;
    const kind = overlaps(a, b) ? "OVERLAP" : tight(a, b, travelMs) ? "TIGHT" : null;
    if (!kind) continue;
    const sug = suggestRemindAt(b.s, travelMinutes, now);
    const ask = sug ? ` · อยากให้ผมเตือน${kind === "TIGHT" ? "ออก" : ""}ตอน ${hm(Date.parse(sug))} ไหมครับ` : "";
    const text =
      kind === "OVERLAP"
        ? `⚠️ ${hm(b.s)} ${b.it.title} ชนกับ ${a.it.title} (${hm(a.s)}–${hm(a.e)})${ask}`
        : `⚠️ ${hm(b.s)} ${b.it.title} ชนกับเวลาเดินทางจาก${a.it.sub ?? a.it.title} (เลิก ${hm(a.e)})${ask}`;
    notes.push({ key: conflictKey(a.it.id, b.it.id), kind, earlierId: a.it.id, laterId: b.it.id, text, suggestRemindAt: sug });
  }
  return { byId, notes };
}
