"use client";

// InboxFilterBar — แถวตัวกรองกล่องขาเข้า (WO 7.2 · เฟรม g15-documents-inbox.png)
// g15 บรรทัดเดียว: [✉ ส่งเข้าอีเมล: inbox-<slug>@shark.in.th ⧉] [▽ ที่มา: ทั้งหมด ▾] [🔍 ค้นหาชื่อไฟล์]
// pattern เดียวกับ AttachmentFilterBar (auto-submit ทันทีที่เลือก · ไม่มีปุ่ม "แสดง")
import { useState } from "react";
import { AccountIcon } from "./AccountIcon";

export const INBOX_SOURCE_OPTIONS: ReadonlyArray<{ value: string; label: string; soon?: boolean }> = [
  { value: "UPLOAD", label: "อัปโหลด" },
  // อีเมลขาเข้ายังไม่มีของจริง (ดู inbox.ts → ingestInboundEmail) — โชว์ไว้ให้รู้ว่ากำลังจะมี แต่เลือกไม่ได้
  { value: "EMAIL", label: "อีเมล (เร็ว ๆ นี้)", soon: true },
  { value: "CHAT", label: "แชท" },
  { value: "APP", label: "แอปถ่ายบิล" },
];

export function InboxFilterBar({
  pathname,
  tab,
  source,
  q,
  inboxEmail,
}: {
  pathname: string;
  tab: string;
  source: string;
  q: string;
  inboxEmail: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <form method="GET" action={pathname} className="flex flex-wrap items-center gap-2" data-testid="inbox-filters">
      <input type="hidden" name="tab" value={tab} />

      <div
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-2 text-sm"
        style={{ borderColor: "var(--color-line)" }}
        data-testid="inbox-email-box"
      >
        <AccountIcon name="mail" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
        <span className="text-[color:var(--color-muted)]">ส่งเข้าอีเมล:</span>
        <span className="font-medium" data-testid="inbox-email-address">{inboxEmail}</span>
        <button
          type="button"
          aria-label="คัดลอกอีเมลกล่องขาเข้า"
          title={copied ? "คัดลอกแล้ว" : "คัดลอก"}
          className="rounded p-0.5 text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
          data-testid="inbox-email-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(inboxEmail).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => setCopied(false),
            );
          }}
        >
          <AccountIcon name={copied ? "check" : "copy"} className="h-4 w-4" />
        </button>
      </div>

      <label
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      >
        <AccountIcon name="filter" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
        <span className="text-[color:var(--color-muted)]">ที่มา:</span>
        <select
          name="source"
          defaultValue={source}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="ที่มา"
          data-testid="inbox-source"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">ทั้งหมด</option>
          {INBOX_SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.soon}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="relative min-w-[200px] flex-1">
        <AccountIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาชื่อไฟล์"
          className="input w-full pl-8"
          aria-label="ค้นหาชื่อไฟล์"
          data-testid="inbox-search"
        />
      </div>

      <button type="submit" className="sr-only">แสดง</button>
    </form>
  );
}

export default InboxFilterBar;
