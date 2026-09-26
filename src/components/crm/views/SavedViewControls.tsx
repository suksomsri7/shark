"use client";

// SavedViewControls.tsx — "บันทึกมุมมองนี้" + "ลบมุมมองนี้" ของหน้ารายการผู้ติดต่อ/บริษัท/ดีล (ใบ C3.2 · addendum ข้อ 12)
//   บันทึก = ตัวกรองที่เปิดอยู่ตอนนี้ (หน้าส่งมาเป็น props — บริการเก็บเฉพาะคีย์ใน whitelist ของ objectKey)
//   ขอบเขต: ส่วนตัว หรือ "ทั้งทีม" ของทีมที่ตัวเองอยู่ (ผู้จัดการ/เจ้าของร้านเลือกได้ทุกทีม) — ทีมจริง ไม่ใช่ทั้งร้าน
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — action มาทาง props · error แสดงในฟอร์ม (ไม่ใช้ alert)
// 🔴 390 px: ฟอร์มพับอยู่ในปุ่มเดียว · ช่องกรอกเต็มความกว้าง

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Fail = { ok: false; error: string; code?: string };
export type CreateViewActionFn = (systemId: string, input: { objectKey: string; name: string; scope: string; teamId: string | null; filters: Record<string, unknown> }) => Promise<{ ok: true; id: string } | Fail>;
export type DeleteViewActionFn = (systemId: string, objectKey: string, viewId: string) => Promise<{ ok: true } | Fail>;

const muted = "text-[color:var(--color-muted)]";

export function SavedViewControls({
  systemId,
  objectKey,
  filters,
  teams,
  current,
  viewParam,
  create,
  remove,
}: {
  systemId: string;
  objectKey: "contact" | "company" | "deal";
  /** ตัวกรองที่หน้าใช้อยู่ตอนนี้ (ชื่อคีย์ตามสัญญาของบริการ list*) */
  filters: Record<string, unknown>;
  teams: { id: string; name: string }[];
  /** มุมมองที่เลือกอยู่ (ถ้ามี) — ลบได้เมื่อ editable */
  current: { id: string; name: string; editable: boolean } | null;
  /** ชื่อพารามิเตอร์ URL ของมุมมองบนหน้านั้น (contacts/companies = "view" · deals = "saved") */
  viewParam: string;
  create: CreateViewActionFn;
  remove: DeleteViewActionFn;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PRIVATE" | "TEAM">("PRIVATE");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasFilter = Object.values(filters).some((v) => v !== null && v !== undefined && v !== "" && !(typeof v === "object" && Object.keys(v as object).length === 0));

  const save = () => {
    setErr(null);
    if (!name.trim()) return setErr("ตั้งชื่อมุมมองก่อนบันทึก");
    if (scope === "TEAM" && !teamId) return setErr("เลือกทีมที่จะแชร์มุมมองนี้ให้");
    start(async () => {
      const r = await create(systemId, { objectKey, name: name.trim(), scope, teamId: scope === "TEAM" ? teamId : null, filters });
      if (!r.ok) return setErr(r.error);
      setOpen(false);
      setName("");
      const u = new URL(window.location.href);
      u.searchParams.set(viewParam, r.id);
      router.push(`${u.pathname}?${u.searchParams.toString()}`);
      router.refresh();
    });
  };

  const del = () => {
    if (!current) return;
    setErr(null);
    start(async () => {
      const r = await remove(systemId, objectKey, current.id);
      if (!r.ok) return setErr(r.error);
      const u = new URL(window.location.href);
      u.searchParams.delete(viewParam);
      router.push(`${u.pathname}${u.searchParams.toString() ? `?${u.searchParams.toString()}` : ""}`);
      router.refresh();
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" className="btn-sm" onClick={() => setOpen((x) => !x)} aria-expanded={open} disabled={!hasFilter} title={hasFilter ? undefined : "เลือกตัวกรองก่อน แล้วค่อยบันทึกเป็นมุมมอง"} data-testid="crm-view-save-open">
          บันทึกมุมมองนี้
        </button>
        {current?.editable && (
          <button type="button" className={`text-sm ${muted} underline-offset-2 hover:underline`} onClick={del} disabled={pending} data-testid="crm-view-delete">
            ลบมุมมอง “{current.name}”
          </button>
        )}
      </div>
      {open && (
        <div className="card flex min-w-0 flex-col gap-2 p-3" data-testid="crm-view-save-form">
          <label className="flex min-w-0 flex-col gap-1 text-xs">
            <span className={muted}>ชื่อมุมมอง</span>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="เช่น ดีลของฉันที่นิ่งเกิน 7 วัน" data-testid="crm-view-name" />
          </label>
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm" role="radiogroup" aria-label="ใครเห็นมุมมองนี้">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="crm-view-scope" checked={scope === "PRIVATE"} onChange={() => setScope("PRIVATE")} data-testid="crm-view-scope-private" />
              เฉพาะฉัน
            </label>
            <label className={`flex items-center gap-1.5 ${teams.length ? "" : "opacity-50"}`}>
              <input type="radio" name="crm-view-scope" checked={scope === "TEAM"} disabled={teams.length === 0} onChange={() => setScope("TEAM")} data-testid="crm-view-scope-team" />
              แชร์ให้ทีม
            </label>
            {scope === "TEAM" && (
              <select className="input w-auto min-w-0 flex-1" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="ทีม" data-testid="crm-view-team">
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {teams.length === 0 && <p className={`text-xs ${muted}`}>ยังไม่ได้อยู่ในทีมไหน — บันทึกเป็นมุมมองส่วนตัวได้</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending} data-testid="crm-view-save">
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button type="button" className="btn-sm" onClick={() => setOpen(false)} disabled={pending} data-testid="crm-view-cancel">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="text-sm text-[color:var(--color-danger)]" data-testid="crm-view-error">
          {err}
        </p>
      )}
    </div>
  );
}
