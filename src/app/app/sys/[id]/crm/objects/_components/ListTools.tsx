// ListTools.tsx — เครื่องมือของหน้ารายการวัตถุ (CRM v2 · ใบ C1.9): นำเข้า CSV · บันทึกมุมมอง
// 🔴 'use client' — ค่าคงที่เพดานจาก `objects-shared.ts` (บริสุทธิ์) · action จาก `objects-actions.ts` · ผลลัพธ์/ข้อผิดพลาดแสดงในแผง (ไม่ใช้ alert)
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OBJECT_IMPORT_MAX_BYTES, OBJECT_IMPORT_MAX_ROWS } from "@/lib/modules/crm/objects-shared";
import { deleteObjectViewAction, importRecordsAction, renameObjectViewAction, saveObjectViewAction } from "@/lib/modules/crm/objects-actions";

/**
 * นำเข้า CSV — แถวหัว = ชื่ออ้างอิงของฟิลด์ (+ `title` · `parentId`) · เพดาน OBJECT_IMPORT_MAX_ROWS แถว / OBJECT_IMPORT_MAX_BYTES ไบต์
 * AUDIT-CLASS X6: ตรวจขนาดในเครื่องก่อนส่ง (บอกผู้ใช้ก่อนกด) — บริการตรวจซ้ำเสมอ
 */
export function ImportRecordsButton({ systemId, objectKey, label, columns }: { systemId: string; objectKey: string; label: string; columns: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string; errors?: { row: number; reason: string }[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const header = columns.join(",");

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="object-import-btn">
        นำเข้า CSV
      </button>
    );
  }
  return (
    <form
      className="card flex w-full flex-col gap-2 p-3 text-sm"
      data-testid="object-import-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const bytes = new TextEncoder().encode(csv).length;
        if (!csv.trim()) {
          setMsg({ tone: "err", text: "ใส่ข้อมูล CSV หรือเลือกไฟล์ก่อนนำเข้า" });
          return;
        }
        if (bytes > OBJECT_IMPORT_MAX_BYTES) {
          setMsg({ tone: "err", text: `ไฟล์ใหญ่เกิน ${(OBJECT_IMPORT_MAX_BYTES / 1024 / 1024).toFixed(0)} MB ต่อครั้ง — แบ่งไฟล์แล้วนำเข้าทีละส่วน` });
          return;
        }
        startTransition(async () => {
          const res = await importRecordsAction(systemId, objectKey, { csv });
          if (!res.ok) {
            setMsg({ tone: "err", text: res.error });
            return;
          }
          setMsg({
            tone: "ok",
            text: `นำเข้า${label}แล้ว ${res.data.created.toLocaleString("th-TH")} รายการ${res.data.skipped ? ` · ข้าม ${res.data.skipped.toLocaleString("th-TH")} แถว` : ""}`,
            errors: res.data.errors.slice(0, 10),
          });
          setCsv("");
          router.refresh();
        });
      }}
    >
      <p className="text-xs text-[color:var(--color-muted)]">
        แถวแรกเป็นชื่ออ้างอิงของฟิลด์ เช่น <code className="break-all">{header || "title"}</code> · ไม่เกิน {OBJECT_IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถวต่อครั้ง
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        data-testid="object-import-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setCsv(await file.text());
        }}
        className="text-xs"
      />
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={5} className="input font-mono text-xs" placeholder={header} data-testid="object-import-text" />
      {msg && (
        <div className="text-xs" style={{ color: msg.tone === "err" ? "var(--color-danger)" : "var(--color-accent)" }} role={msg.tone === "err" ? "alert" : "status"} data-testid="object-import-result">
          {msg.text}
          {msg.errors && msg.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[color:var(--color-muted)]">
              {msg.errors.map((x) => (
                <li key={x.row}>
                  แถว {x.row}: {x.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} data-testid="object-import-cancel">
          ปิด
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending} data-testid="object-import-submit">
          {pending ? "กำลังนำเข้า…" : "นำเข้า"}
        </button>
      </div>
    </form>
  );
}

/** บันทึกตัวกรองปัจจุบัน (f.* + ค้นหา) เป็นมุมมอง — ส่วนตัว หรือทั้งร้าน (เจ้าของร้าน/ผู้จัดการ) */
export function SaveViewButton({ systemId, objectKey, filters, canShare }: { systemId: string; objectKey: string; filters: { f: Record<string, string>; q: string }; canShare: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [team, setTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="object-view-save-btn">
        บันทึกมุมมอง
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="object-view-save-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await saveObjectViewAction(systemId, objectKey, { name, filters: { f: filters.f, q: filters.q }, scope: team ? "TEAM" : "PRIVATE" });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setOpen(false);
          setName("");
          router.refresh();
        });
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อมุมมอง" className="input text-sm" data-testid="object-view-name" />
      {canShare && (
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} data-testid="object-view-team" />
          ใช้ร่วมกันทั้งร้าน
        </label>
      )}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending} data-testid="object-view-save-submit">
        บันทึก
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} data-testid="object-view-save-cancel">
        ยกเลิก
      </button>
      {error && (
        <span className="w-full text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-view-save-error">
          {error}
        </span>
      )}
    </form>
  );
}

// CRM C1.9 ▸ รีวิว S5: จัดการมุมมอง (เปลี่ยนชื่อ · ลบ) — หน้าส่งมาเฉพาะมุมมองที่ผู้ใช้คนนี้แก้ได้ · บริการตรวจสิทธิ์ซ้ำเสมอ
function ViewRow({ systemId, objectKey, view }: { systemId: string; objectKey: string; view: { id: string; name: string } }) {
  const router = useRouter();
  const [name, setName] = useState(view.name);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  return (
    <li className="flex flex-col gap-1 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input min-w-0 flex-1 text-sm" aria-label="ชื่อมุมมอง" data-testid="object-view-rename-input" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || name.trim() === view.name}
          onClick={() => run(async () => { const r = await renameObjectViewAction(systemId, objectKey, view.id, { name }); return r.ok ? { ok: true as const } : r; })}
          data-testid="object-view-rename-save"
        >
          เปลี่ยนชื่อ
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={armed ? { color: "var(--color-danger)", borderColor: "var(--color-danger)" } : undefined}
          disabled={pending}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            run(async () => { const r = await deleteObjectViewAction(systemId, objectKey, view.id); return r.ok ? { ok: true as const } : r; });
          }}
          data-testid="object-view-delete"
        >
          {armed ? "กดอีกครั้งเพื่อลบ" : "ลบ"}
        </button>
      </div>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }} role="alert" data-testid="object-view-manage-error">
          {error}
        </span>
      )}
    </li>
  );
}

export function ManageViewsButton({ systemId, objectKey, views }: { systemId: string; objectKey: string; views: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (views.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-1">
      <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => setOpen(!open)} data-testid="object-view-manage-btn">
        {open ? "ปิดการจัดการมุมมอง" : "จัดการมุมมอง"}
      </button>
      {open && (
        <ul className="card flex flex-col divide-y p-3" data-testid="object-view-manage-list">
          {views.map((v) => (
            <ViewRow key={v.id} systemId={systemId} objectKey={objectKey} view={v} />
          ))}
        </ul>
      )}
    </div>
  );
}
// ◂ CRM C1.9
