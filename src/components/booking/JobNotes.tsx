// SVC B.16 — กล่องความชอบ/ข้อห้ามของลูกค้าบนการ์ดงาน (จอแถวเดียว + มือถือหมอ) · สัญญา DOM: ใบสั่ง §3.4
// 🔴 ไม่มี state/hook (render บน server ได้) · import type เท่านั้นจากตัวโหลด (ไม่ลาก server ลง client)
// 🔴 ไม่มีโน้ตของงานนี้ ⇒ ไม่ render อะไรเลย (จอ B.5 เดิมเท่าเดิมทุกไบต์) · 390 px ตัดบรรทัดได้ (break-words)
import type { JobCustomerNotes } from "@/lib/modules/booking/customer-notes";

export type JobNotesMap = Record<string, JobCustomerNotes>;

/** มีโน้ตของงานนี้ไหม (ใช้ตัดสินคลาสของแถว — ไม่มี = คลาสเดิม) */
export function hasJobNotes(notes: JobNotesMap | undefined, appointmentId: string): boolean {
  const n = notes?.[appointmentId];
  return !!n && (n.items.length > 0 || n.hidden > 0);
}

export default function JobNotes({ notes, appointmentId, tone = "light" }: { notes?: JobNotesMap; appointmentId: string; tone?: "light" | "dark" }) {
  if (!hasJobNotes(notes, appointmentId)) return null;
  const n = notes![appointmentId]!;
  const dark = tone === "dark";
  return (
    <div
      data-job-notes={appointmentId}
      className={
        "mt-1.5 w-full min-w-0 basis-full rounded-lg px-2 py-1.5 text-xs " +
        (dark ? "bg-white/10" : "border border-[color:var(--color-note-line)] bg-[color:var(--color-note)]")
      }
    >
      <ul className="flex flex-col gap-0.5">
        {n.items.map((it) => (
          <li
            key={it.key}
            data-job-note={it.key}
            data-sensitive={it.sensitive ? "true" : "false"}
            className={"break-words " + (it.sensitive ? (dark ? "font-semibold text-amber-200" : "font-semibold text-[color:var(--color-note-ink)]") : "")}
          >
            {it.sensitive ? (
              <span aria-label="ข้อมูลอ่อนไหว" title="ข้อมูลอ่อนไหว" className="mr-1 inline-block rounded bg-amber-500/20 px-1 text-[10px]">
                อ่อนไหว
              </span>
            ) : null}
            <span className={dark ? "opacity-80" : "text-[color:var(--color-muted)]"}>{it.label}:</span> <span>{it.display}</span>
          </li>
        ))}
      </ul>
      {n.hidden > 0 ? (
        <p data-job-notes-hidden={String(n.hidden)} className={"mt-0.5 break-words text-[11px] " + (dark ? "opacity-70" : "text-[color:var(--color-muted)]")}>
          ซ่อน {n.hidden} รายการ — ไม่มีสิทธิ์ดูข้อมูลอ่อนไหว
        </p>
      ) : null}
    </div>
  );
}
