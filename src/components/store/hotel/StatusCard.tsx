// SVC H.8 ▸ หน้าสถานะการจอง (ภาพ 16 ค) — หัวการ์ด (ไอคอน · ชื่อสถานะ · รหัส · ห้อง/วัน/ผู้เข้าพัก) + บรรทัดเงิน (มัดจำ · จ่ายที่โรงแรม · เช็กอิน/เอาต์)
import type { ReactNode } from "react";

export type StatusLine = { k: string; v: string; strong?: boolean };

export function StatusCard(props: { tone: "ok" | "wait" | "gone"; title: string; subtitle: string; lines: StatusLine[]; children?: ReactNode }) {
  const icon =
    props.tone === "ok" ? (
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    ) : props.tone === "wait" ? (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 8.5v4l2.5 1.5" />
      </>
    ) : (
      <path d="M7 7l10 10M17 7L7 17" />
    );
  return (
    <div className="flex flex-col gap-3" data-status-card={props.tone}>
      <div className="flex flex-col items-center gap-2 rounded-[18px] border border-[color:var(--color-line)] px-4 py-5 text-center">
        <div className={`grid h-14 w-14 place-items-center rounded-full ${props.tone === "gone" ? "bg-[color:var(--color-muted)]" : "bg-[color:var(--color-ink)]"} text-white`}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon}
          </svg>
        </div>
        <div className="text-lg font-bold">{props.title}</div>
        <div className="text-sm text-[color:var(--color-muted)]">{props.subtitle}</div>
      </div>
      {props.lines.length ? (
        <div className="flex flex-col gap-2 rounded-[18px] border border-[color:var(--color-line)] px-4 py-3">
          {props.lines.map((l) => (
            <div key={l.k} className="flex items-baseline gap-2 text-sm">
              <span className="text-[color:var(--color-muted)]">{l.k}</span>
              <span className="flex-1 border-b border-dotted border-[color:var(--color-line)]" />
              <span className={`tabular-nums ${l.strong ? "font-bold" : "font-semibold"}`}>{l.v}</span>
            </div>
          ))}
        </div>
      ) : null}
      {props.children}
    </div>
  );
}
