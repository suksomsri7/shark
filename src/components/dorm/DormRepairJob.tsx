'use client';
// SVC D.16 ▸ มือถือช่าง: งานซ่อม 1 รายการ (ภาพ หอ 13ค · 390 PARITY) — สัญญา DOM ledger/svc-briefs/svc-brief-d.16.md §5.3
//   • ข้อมูลจาก dormRepairJob (import จาก lib ได้เฉพาะ type) · action รับทาง prop ⇒ render ด้วย renderToStaticMarkup ได้
//   • รูปผู้เช่า/หลังซ่อม = ลิงก์ /api/files ผูกผู้ดู (หมดอายุ ≤ 15 นาที) · ป้ายเข้าห้อง · เวลาสะดวก · ใครจ่ายค่าซ่อม (ค่าตั้งต่อหมวด · อ่านอย่างเดียว)
//   • ปิดงาน: รูปหลังซ่อม (กล้องหลัง) + "ซ่อมเสร็จ · แจ้งผู้เช่าทาง LINE" · ไม่มีเบอร์/นามสกุล · 390 ไม่ล้น · ปุ่ม ≥ 44px
import { useState, useTransition, type FormEvent } from "react";
import type { RepairJob } from "@/lib/modules/dorm";

type ActionFn = (prev: unknown, fd: FormData) => Promise<unknown>;
export type DormRepairJobProps = { job: RepairJob; completeAction: ActionFn; backHref?: string };

type Result = { ok?: unknown; reason?: unknown };
const msgOf = (r: unknown): { ok: boolean; text: string } => {
  const x = (r && typeof r === "object" ? r : {}) as Result;
  if (x.ok === true) return { ok: true, text: "ปิดงานแล้ว — ระบบแจ้งผู้เช่าทาง LINE" };
  return { ok: false, text: typeof x.reason === "string" ? x.reason : "ปิดงานไม่สำเร็จ — ลองใหม่อีกครั้ง" };
};
const CARD = "flex flex-col rounded-[14px] border border-[#e4e4e7] bg-white p-4";
const ICON = "h-4 w-4 shrink-0 text-[#52525b]";

export default function DormRepairJob({ job, completeAction, backHref }: DormRepairJobProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = !job.canComplete;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const m = msgOf(await completeAction(null, fd));
      setMsg(m);
      if (m.ok && typeof window !== "undefined") window.location.reload();
    });
  };
  const photos = [...job.photos.map((p) => ({ ...p, after: false })), ...job.afterPhotos.map((p) => ({ ...p, after: true }))];

  return (
    <div data-repair-job={job.repairId} data-status={job.status} className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#fafafa] text-[#18181b]">
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        {backHref ? (
          <a href={backHref} aria-label="กลับรายการแจ้งซ่อม" className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl">
            ‹
          </a>
        ) : null}
        <div className="min-w-0">
          <div className="text-[13px] text-[#71717a]">
            {job.ticketNo} · การ์ดบอร์ดงาน &quot;{job.boardName}&quot;{job.cardLinked ? "" : " · ยังไม่มีการ์ด"}
          </div>
          <h1 className="break-words text-xl font-bold leading-snug">
            {job.roomNumber} · {job.text}
          </h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <a key={`${p.url}-${i}`} href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-xl border border-[#e4e4e7] bg-[#f4f4f5]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-repair-photo={p.after ? "AFTER" : "TENANT"} src={p.url} alt={p.after ? "รูปหลังซ่อม" : "รูปจากผู้เช่า"} className="h-full w-full object-cover" />
            </a>
          ))}
          {photos.length === 0 ? (
            <div className="col-span-3 flex aspect-[6/1] items-center justify-center rounded-xl border border-dashed border-[#d4d4d8] text-sm text-[#a1a1aa]">ผู้เช่าไม่ได้แนบรูป</div>
          ) : null}
        </div>

        <section className={`${CARD} gap-2`}>
          <div className="flex items-center gap-2 text-sm" data-repair-entry={job.allowEntry ? "ALLOW" : "DENY"}>
            <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            {job.allowEntry ? <b>เข้าห้องได้ตอนผู้เช่าไม่อยู่</b> : <b>ห้ามเข้าตอนไม่อยู่ — นัดก่อน</b>}
          </div>
          <div className="flex items-center gap-2 text-sm" data-repair-time="">
            <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="min-w-0 break-words">{job.preferredTime ?? "ผู้เช่าไม่ได้ระบุเวลาสะดวก"}</span>
          </div>
          <div className="text-xs text-[#71717a]">
            {job.categoryLabel}
            {job.tenantFirstName ? ` · ผู้เช่า ${job.tenantFirstName}` : ""}
          </div>
        </section>

        <section className={`${CARD} gap-3`}>
          <div className="text-sm font-bold">{done ? "ซ่อมเสร็จแล้ว" : "ปิดงาน"}</div>
          <div>
            <div className="mb-2 text-sm font-bold">ใครจ่ายค่าซ่อม</div>
            <div className="flex flex-wrap gap-2">
              <span
                data-payer="DORM"
                data-on={job.payer === "DORM" ? "true" : "false"}
                className={`inline-flex min-h-10 items-center rounded-xl border px-4 text-sm ${job.payer === "DORM" ? "border-[#18181b] bg-[#18181b] font-semibold text-white" : "border-[#e4e4e7] text-[#3f3f46]"}`}
              >
                หอ
              </span>
              <span
                data-payer="TENANT"
                data-on={job.payer === "TENANT" ? "true" : "false"}
                className={`inline-flex min-h-10 items-center rounded-xl border px-4 text-sm ${job.payer === "TENANT" ? "border-[#18181b] bg-[#18181b] font-semibold text-white" : "border-[#e4e4e7] text-[#3f3f46]"}`}
              >
                ผู้เช่า
              </span>
            </div>
          </div>
          <div className="text-xs text-[#71717a]">ค่าเริ่มตั้งได้ต่อหมวดซ่อม · เรียกเก็บผู้เช่าต้องแนบรูปความเสียหาย</div>
          {done && job.doneAt ? <div className="text-xs text-[#166534]">ปิดงานแล้ว · แจ้งผู้เช่าทาง LINE</div> : null}
        </section>
      </main>

      {job.canComplete ? (
        <form data-repair-complete="" onSubmit={onSubmit} className="sticky bottom-0 flex flex-col gap-2 border-t border-[#e4e4e7] bg-white px-4 pb-5 pt-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="shrink-0 font-medium">+ รูปหลังซ่อม</span>
            <input type="file" name="afterPhotos" accept="image/*" capture="environment" multiple className="min-w-0 flex-1 text-sm" />
          </label>
          <button type="submit" disabled={pending} className="inline-flex min-h-14 w-full items-center justify-center rounded-[14px] bg-[#0a0a0a] text-base font-bold text-white disabled:opacity-60">
            {pending ? "กำลังปิดงาน…" : "ซ่อมเสร็จ · แจ้งผู้เช่าทาง LINE"}
          </button>
          {msg ? <p className={`text-sm ${msg.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>{msg.text}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
