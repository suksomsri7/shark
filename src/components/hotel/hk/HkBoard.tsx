"use client";
// SVC H.6 ▸ แม่บ้าน · งานวันนี้ (โรงแรม) — บอร์ดมือถือ 390 (ภาพ 13 ก)
//   • ชิป ของฉัน / ทั้งหมด / เสร็จ (ตัวเลขจาก hkBoard) · การ์ดเรียงด่วนตามเซิร์ฟเวอร์ · ห้องอื่น (ว่างสะอาด/ปิดซ่อม) พับไว้ท้าย "ทั้งหมด"
//   • สด: subscribeHotelHk (Ably เมื่อเจ้าของตั้งกุญแจ) + poll ทุก 15 วิ เสมอ ⇒ router.refresh() · ล้างตอนออกจากหน้า
//   • แถบล่าง: งานห้อง · แจ้งเสีย · ฉัน (ประวัติของฉัน) · "ของใช้" ยังไม่เปิด (ซ่อน) · คิวออฟไลน์ส่งซ้ำเมื่อกลับมาออนไลน์
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeHotelHk } from "@/lib/realtime/client";
import HkRoomCard from "./HkRoomCard";
import HkDefectDialog from "./HkDefectDialog";
import HkOfflineQueue from "./HkOfflineQueue";
import { isWorkRow, type HkCounts, type HkDefectSend, type HkRow, type HkSend } from "./hk-shared";

const POLL_MS = 15_000;
type Chip = "mine" | "all" | "done";

export type HkBoardProps = {
  unitId: string;
  base: string;
  dateLabel: string;
  unitName: string;
  meId: string;
  meName: string;
  rows: HkRow[];
  counts: HkCounts;
  inspectionRequired: boolean;
  canBlock: boolean;
  defectAction: HkDefectSend;
  senders: { setStatus: HkSend; finish: HkSend; inspect: HkSend; minibar: HkSend; start: HkSend };
};

export default function HkBoard(p: HkBoardProps) {
  const router = useRouter();
  const [chip, setChip] = useState<Chip>(p.counts.mine > 0 ? "mine" : "all");
  const [defectOpen, setDefectOpen] = useState(false);
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    const refresh = () => router.refresh();
    const unsub = subscribeHotelHk(p.unitId, () => refresh());
    const t = window.setInterval(refresh, POLL_MS);
    return () => {
      unsub();
      window.clearInterval(t);
    };
  }, [p.unitId, router]);

  const work = useMemo(() => p.rows.filter(isWorkRow), [p.rows]);
  const other = useMemo(() => p.rows.filter((r) => !isWorkRow(r)), [p.rows]);
  const list = useMemo(() => {
    if (chip === "mine") return [...work.filter((r) => r.assignedTo === p.meId && !r.done), ...work.filter((r) => r.done)];
    if (chip === "done") return work.filter((r) => r.done);
    return work;
  }, [chip, work, p.meId]);
  const chips: { key: Chip; label: string; n: number }[] = [
    { key: "mine", label: "ของฉัน", n: p.counts.mine },
    { key: "all", label: "ทั้งหมด", n: p.counts.total },
    { key: "done", label: "เสร็จ", n: p.counts.done },
  ];

  return (
    <div data-hk-board={p.unitId} aria-label="แม่บ้าน · งานวันนี้ (โรงแรม)" className="mx-auto flex min-h-[70dvh] w-full max-w-[480px] flex-col bg-white text-[#18181b]">
      <header className="px-4 pb-2 pt-2">
        <div className="text-[13px] text-[#71717a]">
          {p.dateLabel} · {p.unitName}
        </div>
        <h1 className="text-xl font-bold leading-snug">งานห้องวันนี้ · {p.meName}</h1>
      </header>

      <div role="tablist" aria-label="กรองงานห้อง" className="flex gap-2 overflow-x-auto px-4 pb-3">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={chip === c.key}
            data-hk-chip={c.key}
            onClick={() => setChip(c.key)}
            className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm ${chip === c.key ? "border-[#0a0a0a] bg-[#0a0a0a] font-semibold text-white" : "border-[#e4e4e7] text-[#3f3f46]"}`}
          >
            {c.label} {c.n}
          </button>
        ))}
      </div>

      <HkOfflineQueue senders={p.senders} onFlushed={() => router.refresh()} />

      <main className="flex flex-1 flex-col gap-2 px-4 pb-24 pt-2">
        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d4d4d8] px-4 py-6 text-center text-sm text-[#71717a]">
            {chip === "mine" ? "ยังไม่มีห้องที่คุณกดเริ่มทำ — เลือกห้องจาก «ทั้งหมด» แล้วกด «เริ่มทำ»" : chip === "done" ? "ยังไม่มีห้องที่เสร็จวันนี้" : "วันนี้ไม่มีงานห้อง"}
          </p>
        ) : (
          list.map((r) => <HkRoomCard key={r.roomId} row={r} href={`${p.base}/${r.roomId}`} inspectionRequired={p.inspectionRequired} meId={p.meId} />)
        )}
        {chip === "all" && other.length ? (
          <div className="mt-2">
            <button type="button" onClick={() => setShowOther((v) => !v)} className="min-h-11 w-full rounded-xl border border-[#e4e4e7] px-4 text-left text-sm text-[#52525b]" aria-expanded={showOther}>
              ห้องว่างพร้อมขาย/ปิดซ่อม {other.length} ห้อง {showOther ? "▴" : "▾"}
            </button>
            {showOther ? (
              <div className="mt-2 flex flex-col gap-2">
                {other.map((r) => (
                  <HkRoomCard key={r.roomId} row={r} href={`${p.base}/${r.roomId}`} inspectionRequired={p.inspectionRequired} meId={p.meId} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      <nav aria-label="เมนูแม่บ้าน" className="sticky bottom-0 grid grid-cols-3 border-t border-[#e4e4e7] bg-white pb-2 pt-1">
        <a href={p.base} aria-current="page" className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-bold text-[#18181b]">
          <span aria-hidden="true">✓</span>งานห้อง
        </a>
        <button type="button" onClick={() => setDefectOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] text-[#52525b]">
          <span aria-hidden="true">⚠</span>แจ้งเสีย
        </button>
        <a href={`${p.base}/logs?mine=1`} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] text-[#52525b]">
          <span aria-hidden="true">☺</span>ฉัน
        </a>
      </nav>

      {defectOpen ? (
        <HkDefectDialog
          rooms={p.rows.map((r) => ({ roomId: r.roomId, number: r.number }))}
          canBlock={p.canBlock}
          action={p.defectAction}
          onClose={() => setDefectOpen(false)}
          onDone={() => {
            setDefectOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
