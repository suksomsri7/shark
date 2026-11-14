// นัดชน — สำเนาฝั่งแอปของ conflicts.ts (สัญญา docs/modules/32-secretary-calendar.md §11 · CAL1.9 เซิร์ฟเวอร์ / CAL2.12 แอป) · บริสุทธิ์
// แอปใช้เฉพาะเมื่อรวมนัดในเครื่อง (source "device" · ไม่เคยถึงเซิร์ฟเวอร์) — คู่ที่ไม่มี device ใช้ AgendaResult.conflicts ของเซิร์ฟเวอร์
// ⚠️ เมื่อ CAL1.9 ขึ้น ให้เทียบกับ src/lib/modules/calendar/conflicts.ts ด้วย fixture ชุดเดียวกัน (สัญญาข้อ "สำเนาเดียวกัน")
import type { AgendaItem, ConflictNote } from "@/src/api/calendar";
import { hhmm } from "./cal-date";

const ELIGIBLE = new Set(["booking", "crm", "event", "google", "device"]);
const MIN = 60_000;

function eligible(i: AgendaItem): boolean {
  return i.mine && !i.allDay && !!i.endAt && ELIGIBLE.has(i.source) && !i.done;
}

/** key คงที่ของคู่ (สัญญาใช้ sha1 — แอปใช้ hash สั้นแบบไม่เข้ารหัส: ใช้แค่จำ "ไม่ต้อง" ในเครื่อง) */
export function pairKey(a: string, b: string): string {
  let h = 2166136261;
  for (const ch of `${a}|${b}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `k${h.toString(16)}`;
}

export function suggestAt(bStart: number, travelMinutes: number, now: number): string | null {
  if (bStart <= now) return null;
  const raw = Math.max(now + MIN, bStart - Math.max(travelMinutes, 15) * MIN);
  const floored = Math.floor(raw / (5 * MIN)) * (5 * MIN); // ปัดลง 5 นาที (สัญญา §11)
  // ปัดลงแล้วตกเป็นอดีต (ใกล้เวลานัดมาก) ⇒ นาทีถัดไป
  return new Date(floored >= now + 30_000 ? floored : Math.ceil((now + MIN) / MIN) * MIN).toISOString();
}

/** คู่ติดกันตามเวลา (เรียงตาม start) ที่ทับซ้อน ≥ 1 นาที (OVERLAP) หรือห่างน้อยกว่าเวลาเดินทาง (TIGHT · travelMinutes > 0) */
export function conflicts(items: AgendaItem[], travelMinutes: number, now: Date): { byId: Record<string, string[]>; notes: ConflictNote[] } {
  const list = items.filter(eligible).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || (a.id < b.id ? -1 : 1));
  const byId: Record<string, string[]> = {};
  const notes: ConflictNote[] = [];
  const add = (x: string, y: string) => (byId[x] = [...(byId[x] ?? []), y]);
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i];
    const b = list[i + 1];
    const aS = Date.parse(a.startAt);
    const aE = Date.parse(a.endAt as string);
    const bS = Date.parse(b.startAt);
    const bE = Date.parse(b.endAt as string);
    const overlap = Math.min(aE, bE) - Math.max(aS, bS);
    let kind: ConflictNote["kind"] | null = null;
    if (aS < bE && bS < aE && overlap >= MIN) kind = "OVERLAP";
    else if (travelMinutes > 0 && bS - aE >= 0 && bS - aE < travelMinutes * MIN) kind = "TIGHT";
    if (!kind) continue;
    add(a.id, b.id);
    add(b.id, a.id);
    const sug = suggestAt(bS, travelMinutes, now.getTime());
    const ask = sug ? ` · อยากให้ผมเตือนออกตอน ${hhmm(sug)} ไหมครับ` : "";
    const from = a.sub ? a.sub.split(" · ").pop() : a.title;
    const text =
      kind === "TIGHT"
        ? `⚠️ ${hhmm(b.startAt)} ${b.title} ชนกับเวลาเดินทางจาก${from} (เลิก ${hhmm(a.endAt)})${ask}`
        : `⚠️ ${hhmm(b.startAt)} ${b.title} ชนกับ ${a.title} (${hhmm(a.startAt)}–${hhmm(a.endAt)})${ask}`;
    notes.push({ key: pairKey(a.id, b.id), kind, earlierId: a.id, laterId: b.id, text, suggestRemindAt: sug });
  }
  return { byId, notes };
}
