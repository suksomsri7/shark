"use client";
// SVC H.6 ▸ คิวออฟไลน์ของมือถือแม่บ้าน (ใบ h.6 §0 "offline retry")
//   • การกดที่ส่งไม่ถึงเซิร์ฟเวอร์ (เน็ตหลุด/ส่งล้มระหว่างทาง) ⇒ เก็บลง localStorage พร้อม idempotencyKey เดิม
//   • ได้สัญญาณ 'online' / กลับมาเปิดหน้า / ทุก 30 วิ ⇒ ส่งซ้ำตามลำดับ · เซิร์ฟเวอร์ตอบผลเดิมเมื่อคีย์ซ้ำ (ไม่ทำซ้ำ)
//   • ผลปฏิเสธที่ชัด (ไม่ใช่เน็ต) ⇒ ทิ้งรายการนั้น แจ้งสั้น ๆ · รูปแจ้งของเสียไม่เข้าคิว (ต้องออนไลน์)
import { useCallback, useEffect, useRef, useState } from "react";
import { HK_QUEUE_EVENT, HK_QUEUE_STORE, type HkQueueKind, type HkQueued, type HkResult, type HkSend } from "./hk-shared";

const MAX_TRIES = 20;
const RETRY_MS = 30_000;

function readQueue(): HkQueued[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HK_QUEUE_STORE);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as HkQueued[]).filter((x) => x && typeof x.id === "string" && typeof x.kind === "string") : [];
  } catch {
    return [];
  }
}
function writeQueue(q: HkQueued[]): void {
  try {
    window.localStorage.setItem(HK_QUEUE_STORE, JSON.stringify(q));
  } catch {
    /* ที่เก็บเต็ม/ปิด — ข้าม */
  }
  window.dispatchEvent(new Event(HK_QUEUE_EVENT));
}

/** ส่งเลย · ส่งไม่ถึง (โยน = เน็ต) ⇒ เข้าคิว (idempotencyKey ต้องอยู่ใน input แล้ว) */
type Sent = HkResult & { queued?: boolean };
type Input = { [key: string]: unknown };
export async function sendOrQueue(kind: HkQueueKind, input: Input, send: HkSend): Promise<Sent> {
  try {
    return await send(input);
  } catch {
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey : `${kind}-${Date.now().toString(36)}`;
    const q = readQueue().filter((x) => x.id !== key);
    q.push({ id: key, kind, input: { ...input, idempotencyKey: key }, at: Date.now(), tries: 0 });
    writeQueue(q);
    return { ok: false, code: "QUEUED", reason: "ยังส่งไม่ได้ (ไม่มีสัญญาณ) — เก็บไว้ ส่งให้อัตโนมัติเมื่อกลับมาออนไลน์", queued: true };
  }
}

export type HkOfflineQueueProps = { senders: Partial<Record<HkQueueKind, HkSend>>; onFlushed?: () => void };

export default function HkOfflineQueue({ senders, onFlushed }: HkOfflineQueueProps) {
  const [count, setCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  const flush = useCallback(async () => {
    if (busy.current || typeof window === "undefined" || !window.navigator.onLine) return;
    busy.current = true;
    let sent = 0;
    try {
      for (const item of readQueue()) {
        const send = senders[item.kind];
        if (!send) continue;
        try {
          const r = await send({ ...item.input, idempotencyKey: item.id });
          writeQueue(readQueue().filter((x) => x.id !== item.id));
          sent++;
          if (!r.ok && r.reason) setNote(`ส่งรายการที่ค้างไม่สำเร็จ: ${r.reason}`);
        } catch {
          const left = readQueue().map((x) => (x.id === item.id ? { ...x, tries: x.tries + 1 } : x)).filter((x) => MAX_TRIES > x.tries);
          writeQueue(left);
          break; // เน็ตยังไม่มา — รอรอบหน้า
        }
      }
    } finally {
      busy.current = false;
    }
    if (sent > 0) onFlushed?.();
  }, [senders, onFlushed]);

  useEffect(() => {
    const sync = () => setCount(readQueue().length);
    sync();
    const onOnline = () => void flush();
    window.addEventListener(HK_QUEUE_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("online", onOnline);
    const t = window.setInterval(() => void flush(), RETRY_MS);
    void flush();
    return () => {
      window.removeEventListener(HK_QUEUE_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("online", onOnline);
      window.clearInterval(t);
    };
  }, [flush]);

  if (!count && !note) return null;
  return (
    <div data-hk-offline={count} role="status" className="mx-4 flex items-center justify-between gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]">
      <span className="min-w-0">{count ? `รอส่ง ${count} รายการ (ไม่มีสัญญาณ) — ส่งให้เองเมื่อกลับมาออนไลน์` : note}</span>
      {count ? (
        <button type="button" onClick={() => void flush()} className="min-h-9 shrink-0 rounded-lg border border-[#f59e0b] px-3 text-[13px] font-semibold">
          ส่งเลย
        </button>
      ) : (
        <button type="button" onClick={() => setNote(null)} className="min-h-9 shrink-0 rounded-lg px-2 text-[13px]" aria-label="ปิดข้อความ">
          ✕
        </button>
      )}
    </div>
  );
}
