"use client";

// AttachmentFilterBar — แถวตัวกรองคลังเอกสาร V2 (WO 7.1 · เฟรม f9-documents.png)
// f9 บรรทัดเดียว: [📅 วันที่อัปโหลด: … ▾] [ประเภท: ทั้งหมด ▾] [ผู้อัปโหลด: ทั้งหมด ▾] [🔍 ค้นหาชื่อไฟล์]
// เพิ่ม "โฟลเดอร์ ▾" ต่อท้ายตาม DESIGN-SPEC-V2 §12 ข้อความ (ภาพ f9 ตัดจบก่อนเห็น — จดเป็นความต่างใน wo-notes)
// pattern เดียวกับ JournalFilterBar/WhtFilterBar (auto-submit ทันที ไม่มีปุ่ม "แสดง")
import { useEffect, useRef, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { DateInput } from "./DateInput";
import { DOC_TYPE_HINT_OPTIONS } from "@/lib/modules/account/attachment-shared";

export function AttachmentFilterBar({
  pathname,
  tab,
  view,
  range,
  presets,
  from,
  to,
  docTypeHint,
  uploaderId,
  uploaders,
  folder,
  folders,
  q,
}: {
  pathname: string;
  tab: string;
  view: string;
  range: string;
  presets: readonly { key: string; label: string }[];
  from: string;
  to: string;
  docTypeHint: string;
  uploaderId: string;
  uploaders: readonly { id: string; name: string }[];
  folder: string;
  folders: readonly string[];
  q: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sel, setSel] = useState(range);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    formRef.current?.requestSubmit();
  }, [sel, f, t]);
  const fire = () => { pending.current = true; };

  return (
    <form ref={formRef} method="GET" action={pathname} className="flex flex-wrap items-center gap-2" data-testid="documents-filters">
      <input type="hidden" name="tab" value={tab} />
      {view !== "list" && <input type="hidden" name="view" value={view} />}

      <label className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
        <AccountIcon name="calendar" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
        <span className="text-[color:var(--color-muted)]">วันที่อัปโหลด:</span>
        <select
          name="range"
          value={sel}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="วันที่อัปโหลด"
          data-testid="documents-range"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setSel(v);
            if (v !== "custom") fire();
          }}
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </label>

      {sel === "custom" && (
        <div className="flex items-center gap-1.5" data-testid="documents-range-custom">
          <DateInput name="from" value={f} onChange={(iso) => { fire(); setF(iso); }} testId="documents-from" />
          <span className="text-[color:var(--color-muted)]">–</span>
          <DateInput name="to" value={t} onChange={(iso) => { fire(); setT(iso); }} testId="documents-to" />
        </div>
      )}

      <label className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
        <span className="text-[color:var(--color-muted)]">ประเภท:</span>
        <select
          name="type"
          defaultValue={docTypeHint}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="ประเภท"
          data-testid="documents-type"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">ทั้งหมด</option>
          {DOC_TYPE_HINT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
        <span className="text-[color:var(--color-muted)]">ผู้อัปโหลด:</span>
        <select
          name="uploader"
          defaultValue={uploaderId}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="ผู้อัปโหลด"
          data-testid="documents-uploader"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">ทั้งหมด</option>
          {uploaders.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
        <AccountIcon name="folder" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)]" />
        <span className="text-[color:var(--color-muted)]">โฟลเดอร์:</span>
        <select
          name="folder"
          defaultValue={folder}
          className="border-0 bg-transparent py-2 pr-1 text-sm font-medium outline-none"
          aria-label="โฟลเดอร์"
          data-testid="documents-folder"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">ทั้งหมด</option>
          {folders.map((f2) => (
            <option key={f2} value={f2}>{f2}</option>
          ))}
        </select>
      </label>

      <div className="relative min-w-[200px] flex-1">
        <AccountIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ค้นหาชื่อไฟล์, ผู้นำเข้า"
          className="input w-full pl-8"
          aria-label="ค้นหาชื่อไฟล์, ผู้นำเข้า"
          data-testid="documents-search"
        />
      </div>

      <button type="submit" className="sr-only">แสดง</button>
    </form>
  );
}

export default AttachmentFilterBar;
