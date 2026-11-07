"use client";
// SVC H.6 ▸ ทำห้อง (ภาพ 13 ข · มือถือ 390) — หัว "ดีลักซ์ · ออกแล้ว 10:12" + เลขห้อง + ป้าย "กำลังทำ N นาที"
//   • ยังไม่เริ่ม ⇒ ปุ่มใหญ่ "เริ่มทำ" · เริ่มแล้ว ⇒ เช็กลิสต์ + มินิบาร์ + แจ้งของเสีย + ปุ่มใหญ่ "เสร็จ · ส่งให้ตรวจ"
//   • ห้องสะอาดรอตรวจ + สิทธิ์ตรวจ ⇒ "ผ่านการตรวจ" / "ไม่ผ่าน (บอกเหตุผล)" · ห้องสะอาด/ตรวจแล้ว ⇒ "สั่งทำใหม่"
//   • ทุกการกดใส่ idempotencyKey · ส่งไม่ถึง ⇒ เข้าคิวออฟไลน์ (HkOfflineQueue) ส่งซ้ำเองเมื่อกลับมาออนไลน์
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import HkChecklist, { loadChecks, type HkChecks } from "./HkChecklist";
import HkMinibar, { type HkQty } from "./HkMinibar";
import HkDefectDialog from "./HkDefectDialog";
import HkOfflineQueue, { sendOrQueue } from "./HkOfflineQueue";
import { contextTh, minutesSince, newIdempotencyKey, statusTh, thTime, type HkDefectSend, type HkMinibarItem, type HkRow, type HkSend } from "./hk-shared";

const NO_CHECKS: HkChecks = {};
const NO_QTY: HkQty = {};
const NO_MSG: { ok: boolean; text: string } | null = null;

export type HkRoomSheetProps = {
  backHref: string;
  meId: string;
  row: HkRow;
  checklist: string[];
  minibar: HkMinibarItem[];
  inHouse: boolean;
  inspectionRequired: boolean;
  canInspect: boolean;
  canBlock: boolean;
  today: string;
  senders: { setStatus: HkSend; start: HkSend; release: HkSend; finish: HkSend; inspect: HkSend; minibar: HkSend };
  defectAction: HkDefectSend;
};

export default function HkRoomSheet(p: HkRoomSheetProps) {
  const router = useRouter();
  const r = p.row;
  const storeKey = `shark.hotel.hk.check.${r.roomId}.${p.today}`;
  const [checks, setChecks] = useState(NO_CHECKS);
  const [qty, setQty] = useState(NO_QTY);
  const [msg, setMsg] = useState(NO_MSG);
  const [defect, setDefect] = useState(false);
  const [failNote, setFailNote] = useState("");
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setChecks(loadChecks(storeKey)), [storeKey]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const mine = r.assignedTo === p.meId;
  const working = !!r.assignedTo && !!r.startedAt;
  const ooo = r.hkStatus === "OUT_OF_ORDER";
  const minutes = working ? minutesSince(r.startedAt, now) : 0;
  const head = useMemo(() => {
    const parts = [r.typeName, contextTh(r.context)];
    if (r.context === "DEPARTED" && r.departedAt) parts[1] = `ออกแล้ว ${thTime(r.departedAt)}`;
    if ((r.context === "ARRIVING" || r.context === "DEPARTED") && r.arrivalTime) parts.push(`แขกเข้า ${r.arrivalTime}`);
    return parts.filter(Boolean).join(" · ");
  }, [r]);

  const run = (kind: "setStatus" | "start" | "release" | "finish" | "inspect", input: Record<string, unknown>, okText: string, after?: () => void) => {
    const send = p.senders[kind];
    start(async () => {
      const res = kind === "start" || kind === "release" ? await send(input).catch(() => ({ ok: false, reason: "ไม่มีสัญญาณ — ลองใหม่เมื่อมีเน็ต" })) : await sendOrQueue(kind, input, send);
      if (res.ok) {
        setMsg({ ok: true, text: okText });
        after?.();
        router.refresh();
      } else setMsg({ ok: false, text: res.reason ?? "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง" });
    });
  };

  const finish = () => {
    const minibar = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => ({ key, qty: n }));
    run(
      "finish",
      { roomId: r.roomId, checklist: p.checklist.map((key) => ({ key, done: checks[key] === true })), minibar, idempotencyKey: newIdempotencyKey("finish") },
      p.inspectionRequired ? "เสร็จแล้ว — ส่งให้หัวหน้าตรวจ" : "เสร็จแล้ว — ห้องพร้อมขาย",
      () => {
        try {
          window.localStorage.removeItem(storeKey);
        } catch {
          /* ข้าม */
        }
        setQty({});
      },
    );
  };

  return (
    <div data-hk-sheet={r.roomId} data-hk-status={r.hkStatus} className="mx-auto flex min-h-[70dvh] w-full max-w-[480px] flex-col bg-white text-[#18181b]">
      <header className="flex items-start gap-2 px-4 pb-3 pt-2">
        <a href={p.backHref} aria-label="กลับงานห้องวันนี้" className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl">
          ‹
        </a>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-[#71717a]">{head}</div>
          <h1 className="text-xl font-bold">{r.number}</h1>
          <div className="text-[13px] text-[#52525b]">{statusTh(r.hkStatus, p.inspectionRequired)}{r.guestRequest ? ` · ${r.guestRequest}` : ""}</div>
        </div>
        {working ? (
          <span data-hk-working={minutes} className="mt-3 shrink-0 rounded-lg border border-[#0a0a0a] px-3 py-1 text-[13px] font-semibold">
            {mine ? `กำลังทำ ${minutes} นาที` : `มีคนทำอยู่ ${minutes} นาที`}
          </span>
        ) : null}
      </header>

      <HkOfflineQueue senders={{ setStatus: p.senders.setStatus, finish: p.senders.finish, inspect: p.senders.inspect, minibar: p.senders.minibar }} onFlushed={() => router.refresh()} />

      <main className="flex flex-1 flex-col gap-3 px-4 pb-32 pt-2">
        {ooo ? <p className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#991b1b]">ห้องนี้ปิดซ่อมอยู่ — ปล่อยห้องได้ที่ปฏิทินห้อง (หน้าเคาน์เตอร์)</p> : null}
        {r.hkStatus === "DIRTY" ? (
          <>
            <HkChecklist items={p.checklist} storeKey={storeKey} value={checks} onChange={setChecks} disabled={!mine} />
            <HkMinibar items={p.minibar} qty={qty} onChange={setQty} inHouse={p.inHouse} disabled={!mine} />
          </>
        ) : null}
        {!ooo ? (
          <button type="button" onClick={() => setDefect(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#d4d4d8] px-4 text-[15px] text-[#52525b]">
            <span aria-hidden="true">⚠</span>แจ้งของเสีย/ของหาย (รูป → ช่าง)
          </button>
        ) : null}
        {r.hkStatus === "CLEAN" && p.canInspect ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">ถ้าไม่ผ่าน บอกแม่บ้านว่าต้องแก้อะไร</span>
            <input value={failNote} onChange={(e) => setFailNote(e.currentTarget.value)} maxLength={300} placeholder="เช่น พื้นห้องน้ำยังเปียก" className="min-h-12 rounded-xl border border-[#e4e4e7] px-3 text-base" />
          </label>
        ) : null}
        {msg ? <p className={`text-sm ${msg.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>{msg.text}</p> : null}
        {working && mine && r.hkStatus === "DIRTY" ? (
          <button type="button" disabled={pending} onClick={() => run("release", { roomId: r.roomId }, "คืนห้องเข้ากองงานแล้ว")} className="min-h-11 text-sm text-[#52525b] underline">
            ยกเลิกเริ่มทำ (ให้คนอื่นทำแทน)
          </button>
        ) : null}
      </main>

      <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-[#e4e4e7] bg-white px-4 pb-5 pt-3">
        {r.hkStatus === "DIRTY" && !mine ? (
          <button type="button" disabled={pending} onClick={() => run("start", { roomId: r.roomId, ...(working && p.canInspect ? { override: true } : {}) }, "เริ่มทำแล้ว")} className="inline-flex min-h-14 w-full items-center justify-center rounded-[14px] bg-[#0a0a0a] text-lg font-bold text-white disabled:opacity-60">
            {working ? (p.canInspect ? "รับงานแทน · เริ่มทำ" : "มีคนกำลังทำห้องนี้") : "เริ่มทำ"}
          </button>
        ) : null}
        {r.hkStatus === "DIRTY" && mine ? (
          <button type="button" data-hk-finish="" disabled={pending} onClick={finish} className="inline-flex min-h-14 w-full items-center justify-center rounded-[14px] bg-[#0a0a0a] text-lg font-bold text-white disabled:opacity-60">
            {p.inspectionRequired ? "เสร็จ · ส่งให้ตรวจ" : "เสร็จ · ห้องพร้อมขาย"}
          </button>
        ) : null}
        {r.hkStatus === "CLEAN" && p.canInspect ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={pending || !failNote.trim()} onClick={() => run("inspect", { roomId: r.roomId, pass: false, note: failNote.trim(), idempotencyKey: newIdempotencyKey("inspect") }, "ส่งกลับให้แม่บ้านแก้แล้ว")} className="min-h-14 rounded-[14px] border border-[#e4e4e7] text-base font-semibold disabled:opacity-50">
              ไม่ผ่าน
            </button>
            <button type="button" disabled={pending} onClick={() => run("inspect", { roomId: r.roomId, pass: true, idempotencyKey: newIdempotencyKey("inspect") }, "ตรวจผ่าน — ห้องพร้อมขาย")} className="min-h-14 rounded-[14px] bg-[#0a0a0a] text-base font-bold text-white disabled:opacity-60">
              ผ่านการตรวจ
            </button>
          </div>
        ) : null}
        {(r.hkStatus === "CLEAN" || r.hkStatus === "INSPECTED") && !(r.hkStatus === "CLEAN" && p.canInspect) ? (
          <button type="button" disabled={pending} onClick={() => run("setStatus", { roomId: r.roomId, to: "DIRTY", note: "สั่งทำใหม่", idempotencyKey: newIdempotencyKey("set") }, "ตั้งเป็นห้องต้องทำใหม่แล้ว")} className="inline-flex min-h-14 w-full items-center justify-center rounded-[14px] border border-[#e4e4e7] text-base font-semibold disabled:opacity-60">
            สั่งทำใหม่ (ห้องยังไม่เรียบร้อย)
          </button>
        ) : null}
      </footer>

      {defect ? (
        <HkDefectDialog
          roomId={r.roomId}
          roomNumber={r.number}
          canBlock={p.canBlock}
          action={p.defectAction}
          onClose={() => setDefect(false)}
          onDone={() => {
            setDefect(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
