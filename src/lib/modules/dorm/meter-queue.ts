// SVC D.6 ▸ คิวออฟไลน์ของหน้าจดมิเตอร์ (สัญญา ledger/svc-briefs/svc-brief-d.6.md §6)
//   pure ล้วน — ไม่มี import (ฝั่งเบราว์เซอร์ import ได้) · ไม่แก้อาร์เรย์เดิม (คืนอาร์เรย์ใหม่เสมอ) · ที่เก็บจริง (localStorage) อยู่ในคอมโพเนนต์
//   ความถูกต้องไม่พึ่งคิว: เซิร์ฟเวอร์ idempotent ต่อ มิเตอร์×งวด (ส่งซ้ำกี่รอบ = ค่าเดียว) — คิวแค่ไม่ทำให้เลขหาย

export type QueuedReading = {
  meterId: string;
  periodKey: string;
  value: number;
  readAt: string;
  clientKey: string;
  photo?: { dataUrl: string; contentType: string } | null;
};

const DEFAULT_BATCH = 50;
const MAX_BATCH = 200;
/** สถานะที่ถือว่า "เซิร์ฟเวอร์ตัดสินแล้ว" — เอาออกจากคิวได้ */
const SETTLED = new Set(["CREATED", "UPDATED", "UNCHANGED", "LOCKED", "REJECTED"]);

const sameSlot = (a: { meterId: string; periodKey: string }, b: { meterId: string; periodKey: string }) => a.meterId === b.meterId && a.periodKey === b.periodKey;

/** จด มิเตอร์×งวด เดิมซ้ำ = แทนที่รายการเดิม (ค่าใหม่ชนะ · ค่าใหม่ไม่มีรูป ⇒ คงรูปเดิม) — ตำแหน่งในคิวคงเดิม */
export function enqueueReading(queue: readonly QueuedReading[], item: QueuedReading): QueuedReading[] {
  const i = queue.findIndex((q) => sameSlot(q, item));
  if (i < 0) return [...queue, { ...item }];
  const old = queue[i];
  const merged: QueuedReading = { ...item, photo: item.photo ? item.photo : (old.photo ?? null) };
  return queue.map((q, k) => (k === i ? merged : q));
}

/** ชุดถัดไปที่จะส่ง: งวดเก่าสุดก่อน · เรียงตามที่เข้าคิว · ไม่เกิน max (ค่าเริ่ม 50 · เพดาน 200) · คิวว่าง ⇒ null */
export function nextBatch(queue: readonly QueuedReading[], max?: number): { periodKey: string; items: QueuedReading[] } | null {
  if (queue.length === 0) return null;
  const cap = typeof max === "number" && Number.isFinite(max) ? Math.min(Math.max(Math.floor(max), 1), MAX_BATCH) : DEFAULT_BATCH;
  let oldest = queue[0].periodKey;
  for (const q of queue) if (q.periodKey < oldest) oldest = q.periodKey;
  return { periodKey: oldest, items: queue.filter((q) => q.periodKey === oldest).slice(0, cap) };
}

/**
 * ปิดชุดที่ส่งไปแล้ว: เอาออกเฉพาะรายการที่ส่งไป "และ clientKey ยังตรงกับในคิว" (ระหว่างส่งมีคนจดค่าใหม่ ⇒ เก็บค่าใหม่ไว้ส่งรอบหน้า)
 * ไม่มีผลของรายการนั้น (เน็ตหลุดกลางทาง) ⇒ คงไว้ · REJECTED/LOCKED ที่ถูกเอาออก ⇒ รายงานใน rejected พร้อม code
 */
export function settleBatch(
  queue: readonly QueuedReading[],
  sent: readonly QueuedReading[],
  results: readonly { meterId: string; status: string; code?: string }[],
): { queue: QueuedReading[]; rejected: { meterId: string; code: string | null }[] } {
  const drop = new Set<number>();
  const rejected: { meterId: string; code: string | null }[] = [];
  for (const s of sent) {
    const res = results.find((r) => r.meterId === s.meterId);
    if (!res || !SETTLED.has(res.status)) continue;
    const i = queue.findIndex((q) => sameSlot(q, s) && q.clientKey === s.clientKey);
    if (i < 0 || drop.has(i)) continue;
    drop.add(i);
    if (res.status === "REJECTED" || res.status === "LOCKED") rejected.push({ meterId: s.meterId, code: res.code ?? null });
  }
  return { queue: queue.filter((_, i) => !drop.has(i)), rejected };
}
