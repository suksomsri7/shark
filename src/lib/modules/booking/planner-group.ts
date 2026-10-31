// SVC B.15 — ด่านห้องแบบกลุ่ม "ห้องเดียว" (pure · ไม่อ่าน DB/นาฬิกา) · ใบสั่ง ledger/svc-briefs/svc-brief-b.15.md §4 ข้อ 2
// ใช้ร่วม: service.ts (bookGroup · findGroupSlots · ทาง staffCount · rescheduleGroup) — สูตรเดียว ("กลุ่มลงที่ t ได้ไหม" ฝั่งห้อง)
// ด่านว่างไหม = ResBook ของ planner-resources.ts (สูตรเดียวกับตัววางคิว · ช่วงถือต่อแถวตามนิยาม B.13 §4.6) — ไฟล์นี้แค่เลือกชิ้นเดียวให้ทั้งกลุ่ม
import type { ResBook } from "./planner-resources";

/** สมาชิกหนึ่งคน: ชนิดที่ต้องใช้ (ไม่ซ้ำ · ลำดับของบริการ) · ช่วงบริการ [start, endService) · ชิ้นที่อยากได้ก่อน (ชิ้นเดิมตอนเลื่อน) */
export type GroupResNeed = { kinds: readonly string[]; start: number; endService: number; prefer?: readonly string[] };

const TMP = "\u0002grp:";

/**
 * ต่อชนิด k ที่สมาชิกบางคนต้องใช้ ⇒ เลือกชิ้นเดียว r ชนิด k (ชิ้นที่ prefer ก่อน แล้ว first-fit ตามลำดับเลือกชิ้นของสมุด)
 * ที่รับช่วงถือของทุกสมาชิกที่ต้องใช้ k พร้อมกันโดยไม่เกินความจุ ณ จุดใด และไม่ทับปิดซ่อม (เพิ่มทีละคนแล้วตรวจ free) —
 * ไม่มีชิ้นเดียวที่รับได้ทั้งหมด ⇒ null (ห้ามแยกกลุ่มไปคนละชิ้น) · คืน id ต่อสมาชิกตามลำดับชนิดของสมาชิกนั้น · ไม่แก้สมุด (ลงชั่วคราวแล้วถอดออก)
 */
export function pickGroupResources(book: ResBook, needs: readonly GroupResNeed[]): string[][] | null {
  const kinds: string[] = [];
  for (const n of needs) for (const k of n.kinds) if (!kinds.includes(k)) kinds.push(k);
  const chosen = new Map<string, string>();
  for (const k of kinds) {
    const users = needs.filter((n) => n.kinds.includes(k));
    const order: string[] = [];
    for (const u of users) for (const id of u.prefer ?? []) if (book.get(id)?.kind === k && !order.includes(id)) order.push(id);
    for (const r of book.ofKind(k)) if (!order.includes(r.id)) order.push(r.id);
    let got: string | null = null;
    for (const id of order) {
      const r = book.get(id);
      if (!r) continue;
      let fit = true;
      const tmp: string[] = [];
      for (const u of users) {
        if (!book.free(r, u.start, u.endService)) {
          fit = false;
          break;
        }
        const t = `${TMP}${tmp.length}`;
        tmp.push(t);
        book.add(r.id, t, u.start, u.endService);
      }
      for (const t of tmp) book.remove(t);
      if (fit) {
        got = r.id;
        break;
      }
    }
    if (got === null) return null;
    chosen.set(k, got);
  }
  return needs.map((n) => n.kinds.map((k) => chosen.get(k) as string));
}
