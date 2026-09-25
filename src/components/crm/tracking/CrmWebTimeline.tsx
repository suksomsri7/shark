// CrmWebTimeline.tsx — บล็อก "การเข้าชมเว็บ" บนหน้าผู้ติดต่อ 360 (ใบ C2.6 · ภาพ 11)
//
// 🔴 คอมโพเนนต์แสดงผลล้วน ๆ (ไม่มี 'use client' · ไม่แตะ prisma/โมดูล CRM — F2.3): หน้า 360 เป็นคนอ่านข้อมูลผ่าน
//    `tracking.webTimeline` (ตามการมองเห็นของผู้ดู) แล้วส่งเข้ามาเป็น props
// 🔴 DTO ไม่มี ipHash/userAgent โดยเจตนา (PDPA — หน้าจอไม่ต้องรู้ว่าลูกค้าเข้าจาก IP อะไร)

import type { CrmWebTimelineSession } from "./types";

const BY_LABEL: Record<string, string> = {
  FORM: "จากการกรอกฟอร์ม",
  EMAIL_CLICK: "จากการกดลิงก์ในอีเมล",
  PORTAL: "จากการเข้าพอร์ทัลลูกค้า",
  LINK: "จากลิงก์ติดตาม",
};
const KIND_LABEL: Record<string, string> = {
  PAGEVIEW: "เปิดหน้า",
  CLICK: "กด",
  FORM_VIEW: "เห็นฟอร์ม",
  FORM_SUBMIT: "ส่งฟอร์ม",
  IDENTIFY: "รู้ว่าเป็นใคร",
  CONSENT: "ตอบเรื่องคุกกี้",
};

export function CrmWebTimeline({ sessions }: { sessions: CrmWebTimelineSession[] }) {
  return (
    <section className="card flex min-w-0 flex-col gap-2 p-4 text-sm" data-testid="crm-web-timeline">
      <h2 className="text-sm font-semibold">การเข้าชมเว็บไซต์</h2>
      {sessions.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีการเข้าชมที่รู้ว่าเป็นลูกค้ารายนี้</p>}
      {sessions.map((s) => (
        <div key={s.id} className="flex min-w-0 flex-col gap-1 rounded-lg border p-2" data-testid={`crm-web-session-${s.id}`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium">
              {s.startedAtLabel} · {s.pageViews} หน้า
            </span>
            <span className="text-[color:var(--color-muted)]">{s.identifiedBy ? BY_LABEL[s.identifiedBy] ?? s.identifiedBy : "ยังไม่ระบุที่มา"}</span>
          </div>
          {s.utm && (
            <div className="truncate text-xs text-[color:var(--color-muted)]">
              utm: {Object.entries(s.utm).map(([k, v]) => `${k}=${v}`).join(" · ")}
            </div>
          )}
          <ul className="flex min-w-0 flex-col gap-0.5 text-xs text-[color:var(--color-muted)]">
            {s.events.slice(0, 20).map((e, i) => (
              <li key={`${s.id}-${i}`} className="truncate">
                {e.atLabel} — {KIND_LABEL[e.kind] ?? e.kind} {e.title ?? e.url ?? ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
