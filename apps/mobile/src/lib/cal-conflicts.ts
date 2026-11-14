// นัดชน — สำเนาฝั่งแอปของ src/lib/modules/calendar/conflicts.ts (CAL1.9 · สัญญา §11 · R-CAL-35) · บริสุทธิ์ล้วน
//   แอปใช้รวมนัดในเครื่อง (source "device" · ไม่เคยถึงเซิร์ฟเวอร์) — คู่ที่ไม่มี device ใช้ AgendaResult.conflicts ของเซิร์ฟเวอร์
//   🔴 ต้องตรงกับฝั่งเซิร์ฟเวอร์ทุกบรรทัดของกติกา: ตรวจด้วย fixture ชุดเดียวกัน scripts/qc-cal-1.9.mts
//      (15 พ.ย.: สำเนาสคริปต์ที่เปลี่ยน import เป็นไฟล์นี้ → 17/17 ผ่านเท่ากับฝั่งเซิร์ฟเวอร์ รวม key sha1 · วิธีใน CAL-RESUME)
//   ต่างเพียง: sha1 ใช้ตัวคำนวณ JS (แอปไม่มี node:crypto) — ผลเท่ากันทุกไบต์
import type { AgendaItem, AgendaSource, ConflictNote } from "@/src/api/calendar";

const MIN_MS = 60_000;
const BKK_OFFSET_MS = 7 * 3_600_000;
export const CONFLICT_SOURCES: readonly AgendaSource[] = ["booking", "crm", "event", "google", "device"];
export const SUGGEST_MIN_LEAD = 15;

const hm = (ms: number) => {
  const t = new Date(ms + BKK_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
};

type Span = { it: AgendaItem; s: number; e: number };

function spans(items: AgendaItem[]): Span[] {
  const out: Span[] = [];
  for (const it of items) {
    if (!it.mine || it.allDay || it.done || !it.endAt || !CONFLICT_SOURCES.includes(it.source)) continue;
    const s = Date.parse(it.startAt),
      e = Date.parse(it.endAt);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    out.push({ it, s, e });
  }
  return out.sort((a, b) => a.s - b.s || (a.it.id < b.it.id ? -1 : a.it.id > b.it.id ? 1 : 0));
}

const overlaps = (a: Span, b: Span) => a.s < b.e && b.s < a.e && Math.min(a.e, b.e) - Math.max(a.s, b.s) >= MIN_MS;
const tight = (a: Span, b: Span, travelMs: number) => travelMs > 0 && b.s - a.e >= 0 && b.s - a.e < travelMs;

export function suggestRemindAt(bStartMs: number, travelMinutes: number, now: Date): string | null {
  if (bStartMs <= +now) return null;
  const cand = Math.floor((bStartMs - Math.max(travelMinutes, SUGGEST_MIN_LEAD) * MIN_MS) / (5 * MIN_MS)) * 5 * MIN_MS;
  const floor = Math.ceil((+now + MIN_MS) / MIN_MS) * MIN_MS;
  return new Date(Math.max(cand, floor)).toISOString();
}

// ───────── sha1 (UTF-8 · hex) — แทน node:crypto ของเซิร์ฟเวอร์ ─────────
function sha1Hex(str: string): string {
  const bytes: number[] = [];
  for (const ch of unescape(encodeURIComponent(str))) bytes.push(ch.charCodeAt(0));
  const ml = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (ml >>> (i * 8)) & 0xff);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4]! << 24) | (bytes[off + i * 4 + 1]! << 16) | (bytes[off + i * 4 + 2]! << 8) | bytes[off + i * 4 + 3]!;
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = tmp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export const conflictKey = (earlierId: string, laterId: string) => sha1Hex(`${earlierId}|${laterId}`);

export function conflicts(items: AgendaItem[], travelMinutes: number, now: Date): { byId: Record<string, string[]>; notes: ConflictNote[] } {
  const travelMs = Math.max(0, travelMinutes) * MIN_MS;
  const sp = spans(items);
  const byId: Record<string, string[]> = {};
  const link = (x: string, y: string) => {
    const arr = (byId[x] ??= []);
    if (!arr.includes(y)) arr.push(y);
  };
  for (let i = 0; i < sp.length; i++) {
    for (let j = i + 1; j < sp.length; j++) {
      const a = sp[i]!,
        b = sp[j]!;
      if (b.s >= a.e + travelMs) break;
      if (overlaps(a, b) || tight(a, b, travelMs)) {
        link(a.it.id, b.it.id);
        link(b.it.id, a.it.id);
      }
    }
  }
  const notes: ConflictNote[] = [];
  for (let i = 0; i + 1 < sp.length; i++) {
    const a = sp[i]!,
      b = sp[i + 1]!;
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
