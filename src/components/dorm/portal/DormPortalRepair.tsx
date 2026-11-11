'use client';
// SVC D.16 ▸ หน้าแจ้งซ่อมของผู้เช่า (หอ 05ค · อ้างอิง DOM) — สัญญา DOM ledger/svc-briefs/svc-brief-d.16.md §5.1
//   • ข้อมูลจาก loadPortalRepairs (import จาก lib ได้เฉพาะ type) · action รับทาง prop ⇒ render ด้วย renderToStaticMarkup ได้
//   • ฟอร์ม: หมวด · อาการ · รูป (≤ 4 · รวม ≤ 10 MB) · อนุญาตเข้าห้องตอนไม่อยู่ · เวลาสะดวก · คีย์กันส่งซ้ำสร้างครั้งเดียวต่อการเปิดฟอร์ม
//   • เรื่องที่แจ้งไว้ (สัญญานี้เท่านั้น) + ให้คะแนนงานที่เสร็จ (ครั้งเดียว) · ไม่มีไฟล์/ชื่อ/เบอร์ · มือถือ 390 ไม่ล้น · ปุ่ม ≥ 44px
import { useState, useTransition, type FormEvent } from "react";
import type { PortalRepairView } from "@/lib/modules/dorm";

type ActionFn = (prev: unknown, fd: FormData) => Promise<unknown>;
export type DormPortalRepairProps = { view: PortalRepairView; submitAction: ActionFn; rateAction: ActionFn };

const newKey = (): string => {
  try {
    return `rp-${crypto.randomUUID()}`;
  } catch {
    return `rp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};
type Result = { ok?: unknown; reason?: unknown };
const msgOf = (r: unknown, okText: string): { ok: boolean; text: string } => {
  const x = (r && typeof r === "object" ? r : {}) as Result;
  if (x.ok === true) return { ok: true, text: okText };
  return { ok: false, text: typeof x.reason === "string" ? x.reason : "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง" };
};
const BTN = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold";
const CARD = "rounded-2xl border border-[#e4e4e7] bg-white p-4";
const STATUS_TONE: Record<string, string> = {
  OPEN: "border-[#e4e4e7] text-[#3f3f46]",
  IN_PROGRESS: "border-[#f59e0b] text-[#92400e]",
  DONE: "border-[#16a34a] text-[#166534]",
  CANCELLED: "border-[#e4e4e7] text-[#a1a1aa]",
};

function RateForm({ repairId, rateAction }: { repairId: string; rateAction: ActionFn }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setMsg(msgOf(await rateAction(null, fd), "ขอบคุณที่ให้คะแนนงานซ่อม")));
  };
  if (msg?.ok) return <p className="mt-2 text-sm text-[#166534]">{msg.text}</p>;
  return (
    <form data-repair-rate={repairId} onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="repairId" value={repairId} />
      <div className="text-sm font-medium">ให้คะแนนงานซ่อมนี้</div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-xl border border-[#e4e4e7] px-3 text-sm">
            <input type="radio" name="rating" value={String(n)} required className="h-4 w-4" />
            <span>{n} ★</span>
          </label>
        ))}
      </div>
      <input name="note" maxLength={300} placeholder="หมายเหตุถึงหอ (ไม่บังคับ)" className="min-h-11 w-full rounded-xl border border-[#e4e4e7] px-3 text-sm" />
      <button type="submit" disabled={pending} className={`${BTN} bg-[#18181b] text-white disabled:opacity-60`}>
        {pending ? "กำลังส่ง…" : "ส่งคะแนน"}
      </button>
      {msg && !msg.ok ? <p className="text-sm text-[#b91c1c]">{msg.text}</p> : null}
    </form>
  );
}

export default function DormPortalRepair({ view, submitAction, rateAction }: DormPortalRepairProps) {
  const [key, setKey] = useState<string>(() => newKey());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const m = msgOf(await submitAction(null, fd), "ส่งเรื่องแจ้งซ่อมแล้ว — หอจะติดต่อกลับ และแจ้งทาง LINE เมื่อซ่อมเสร็จ");
      setMsg(m);
      if (m.ok) {
        form.reset();
        setKey(newKey());
        if (typeof window !== "undefined") window.location.reload();
      }
    });
  };

  return (
    <div data-dorm-repair="" className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 py-5 text-[#18181b]">
      <header className="flex flex-col gap-1">
        <div className="text-xs text-[#71717a]">{view.unitName}</div>
        <h1 className="text-xl font-bold">แจ้งซ่อม · ห้อง {view.roomNumber}</h1>
        <a href={view.links.portal} className="text-sm text-[#2563eb] underline">
          ← กลับหน้าบิลและเอกสาร
        </a>
      </header>

      <form data-repair-form="" onSubmit={onSubmit} className={`${CARD} flex flex-col gap-4`}>
        <input type="hidden" name="idempotencyKey" value={key} />
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">หมวดงานซ่อม</legend>
          <div className="grid grid-cols-2 gap-2">
            {view.categories.map((c) => (
              <label key={c.code} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#e4e4e7] px-3 text-sm">
                <input type="radio" name="category" value={c.code} required className="h-4 w-4" />
                <span className="min-w-0 truncate">{c.labelTh}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">อาการที่ต้องซ่อม</span>
          <textarea name="text" maxLength={1000} required rows={4} placeholder="เช่น ก๊อกน้ำอ่างล้างหน้าหยดทั้งคืน" className="w-full rounded-xl border border-[#e4e4e7] p-3 text-sm" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">รูปประกอบ (ไม่เกิน 4 รูป)</span>
          <input type="file" name="photos" accept="image/*" multiple className="min-h-11 w-full text-sm" />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="allowEntry" defaultChecked={view.entryDefault} className="h-5 w-5" />
          <span>ให้ช่างเข้าห้องตอนฉันไม่อยู่ได้</span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">เวลาที่สะดวกให้ช่างเข้า</span>
          <input name="preferredTime" maxLength={120} placeholder="เช่น จ.–ศ. หลัง 17:00" className="min-h-11 w-full rounded-xl border border-[#e4e4e7] px-3 text-sm" />
        </label>
        <button type="submit" disabled={pending} className={`${BTN} min-h-12 w-full bg-[#18181b] text-base text-white disabled:opacity-60`}>
          {pending ? "กำลังส่ง…" : "ส่งเรื่องแจ้งซ่อม"}
        </button>
        {msg ? <p className={`text-sm ${msg.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>{msg.text}</p> : null}
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">เรื่องที่แจ้งไว้</h2>
        {view.items.length === 0 ? (
          <p className="text-sm text-[#71717a]">ยังไม่มีเรื่องแจ้งซ่อม</p>
        ) : (
          view.items.map((it) => (
            <article
              key={it.repairId}
              data-repair-item={it.repairId}
              data-status={it.status}
              className={`${CARD} ${it.current ? "ring-2 ring-[#18181b]" : ""} flex min-w-0 flex-col gap-1`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-semibold">{it.ticketNo}</span>
                <span className="text-sm text-[#52525b]">· {it.categoryLabel}</span>
                <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[it.status] ?? ""}`}>{it.statusLabel}</span>
              </div>
              <p className="break-words text-sm text-[#3f3f46]">{it.text}</p>
              <div className="text-xs text-[#71717a]">
                แจ้งเมื่อ {it.createdLabel}
                {it.doneLabel ? ` · ซ่อมเสร็จ ${it.doneLabel}` : ""}
              </div>
              {it.rating !== null ? (
                <div className="text-sm text-[#b45309]" aria-label={`ให้คะแนน ${it.rating} ดาว`}>
                  {"★".repeat(it.rating)}
                  <span className="text-[#d4d4d8]">{"★".repeat(Math.max(0, 5 - it.rating))}</span>
                </div>
              ) : null}
              {it.status === "DONE" && it.canRate ? <RateForm repairId={it.repairId} rateAction={rateAction} /> : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
