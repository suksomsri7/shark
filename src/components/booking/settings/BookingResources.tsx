"use client";

// ─────────────────────────────────────────────────────────────
// BookingResources.tsx — จอง 12 ส่วน "ห้อง · เตียง · อุปกรณ์" · SVC B.13 §3.6
//   ตาราง: ทรัพยากร · ชนิด (ป้ายไทย) · รับได้ (คน) · เก็บ/เตรียม · ใช้กับบริการ · สถานะ (ใช้งาน / ปิดซ่อมถึง … / ปิดใช้)
//   + เพิ่มทรัพยากร · แก้แถว · ปิดซ่อม (ช่วงเวลา) — เขียนผ่าน server action ที่หน้าห่อ bind unitSlug ให้แล้ว
// 🔴 ไม่ import ค่าจาก server (ยกเว้น resource-kinds ที่ pure) · ไม่มีคีย์ค่าตั้ง · ไม่มี useRouter (action เรียก refresh เอง)
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { RESOURCE_KINDS, RESOURCE_KIND_LABELS_TH } from "@/lib/modules/booking/resource-kinds";
import type { ResourcesModel, ResourceViewRow } from "./booking-settings-shared";
import { BTN_GHOST, BTN_PRIMARY, cx, failText, MUTED, Switch } from "./BookingPolicySettings";

type Fail = { ok: false; code?: string; reason?: string };
type Ok = { ok: true };
export type ResourceFormValue = { kind: string; name: string; capacity: number; cleanupMin: number; sortOrder: number; active?: boolean };
export type BookingResourceActions = {
  create(input: ResourceFormValue): Promise<Ok | Fail>;
  update(input: { id: string } & Partial<ResourceFormValue>): Promise<Ok | Fail>;
  maintenance(input: { id: string; windows: { startAt: string; endAt: string | null; note?: string }[] }): Promise<Ok | Fail>;
};

const INPUT = "input min-h-11 w-full min-w-0";
const STATUS_CLS: Record<ResourceViewRow["status"], string> = {
  ACTIVE: "",
  MAINT: "inline-flex rounded-md border border-[color:var(--color-danger)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-danger)]",
  OFF: "text-[color:var(--color-muted)]",
};

/** "YYYY-MM-DDTHH:mm" (เวลาไทย) ⇄ ISO */
const toIso = (local: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const ms = Date.parse(`${local}:00+07:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const toLocal = (iso: string | null): string => (iso ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16) : "");
const int = (t: string): number | null => (/^-?\d+$/.test(t.trim()) ? Number(t.trim()) : null);

function ResourceForm({
  initial,
  submitLabel,
  withActive,
  onSubmit,
  onCancel,
}: {
  initial: ResourceFormValue;
  submitLabel: string;
  withActive: boolean;
  onSubmit: (v: ResourceFormValue) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState(initial.kind);
  const [cap, setCap] = useState(String(initial.capacity));
  const [clean, setClean] = useState(String(initial.cleanupMin));
  const [sort, setSort] = useState(String(initial.sortOrder));
  const [active, setActive] = useState(initial.active !== false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const capacity = int(cap);
    const cleanupMin = int(clean);
    const sortOrder = int(sort);
    if (capacity === null || cleanupMin === null || sortOrder === null) {
      setErr("รับได้ · เวลาเก็บ · ลำดับ ต้องเป็นจำนวนเต็ม");
      return;
    }
    setBusy(true);
    setErr(null);
    const e = await onSubmit({ kind, name, capacity, cleanupMin, sortOrder, ...(withActive ? { active } : {}) });
    setBusy(false);
    if (e) setErr(e);
  };
  return (
    <div data-bq-resource-form="" className="flex flex-col gap-3 rounded-xl bg-[color:var(--color-surface-2)] p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>ชื่อทรัพยากร</span>
          <input className={INPUT} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>ชนิด</span>
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value)}>
            {RESOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESOURCE_KIND_LABELS_TH[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>รับได้ (คน)</span>
          <input className={INPUT} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>เก็บ/เตรียมหลังใช้ (นาที)</span>
          <input className={INPUT} inputMode="numeric" value={clean} onChange={(e) => setClean(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>ลำดับ (น้อย = เลือกก่อน)</span>
          <input className={INPUT} inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} />
        </label>
        {withActive && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>ใช้งาน (ปิด = ไม่รับจองใหม่)</span>
            <Switch checked={active} label="ใช้งาน" onChange={setActive} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()}>
          {submitLabel}
        </button>
        <button type="button" className={BTN_GHOST} onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
      {err && <span className="text-xs text-[color:var(--color-danger)]">{err}</span>}
    </div>
  );
}

function MaintenanceForm({ row, onSave, onCancel }: { row: ResourceViewRow; onSave: (ws: { startAt: string; endAt: string | null; note?: string }[]) => Promise<string | null>; onCancel: () => void }) {
  const first = row.maintenance[0];
  const [from, setFrom] = useState(toLocal(first?.startAt ?? null));
  const [until, setUntil] = useState(toLocal(first?.endAt ?? null));
  const [note, setNote] = useState(first?.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (ws: { startAt: string; endAt: string | null; note?: string }[]) => {
    setBusy(true);
    setErr(null);
    const e = await onSave(ws);
    setBusy(false);
    if (e) setErr(e);
  };
  const save = () => {
    const s = toIso(from);
    const e = until.trim() ? toIso(until) : null;
    if (!s || (until.trim() && !e)) {
      setErr("กรอกวันเวลาเริ่ม (และวันเวลาเปิดใช้อีกครั้ง ถ้ามี) ให้ครบ");
      return;
    }
    void run([{ startAt: s, endAt: e, ...(note.trim() ? { note: note.trim() } : {}) }]);
  };
  return (
    <div data-bq-maintenance-form="" className="flex flex-col gap-3 rounded-xl bg-[color:var(--color-surface-2)] p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>ปิดซ่อมตั้งแต่</span>
          <input className={INPUT} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>เปิดใช้อีกครั้ง (ว่าง = จนกว่าจะปลด)</span>
          <input className={INPUT} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className={MUTED}>หมายเหตุ</span>
          <input className={INPUT} maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <p className={cx("text-xs", MUTED)}>ช่วงที่ทับนัดที่จองไว้แล้วจะบันทึกไม่ได้ — ย้ายนัดเหล่านั้นก่อน</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
          บันทึกปิดซ่อม
        </button>
        {row.maintenance.length > 0 && (
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => void run([])}>
            ปลดปิดซ่อม
          </button>
        )}
        <button type="button" className={BTN_GHOST} onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
      {err && <span className="text-xs text-[color:var(--color-danger)]">{err}</span>}
    </div>
  );
}

/** ส่วนทรัพยากรใต้ตารางคน (ภาพ 12) — กล่อง data-bq-resources */
export default function BookingResources({ model, actions }: { model: ResourcesModel; actions: BookingResourceActions }) {
  const [adding, setAdding] = useState(false);
  const create = async (v: ResourceFormValue): Promise<string | null> => {
    try {
      const r = await actions.create(v);
      if (r.ok) {
        setAdding(false);
        return null;
      }
      return failText(r);
    } catch {
      return "บันทึกไม่สำเร็จ ลองอีกครั้ง";
    }
  };
  return (
    <section data-bq-resources="" data-total={String(model.total)} data-under-repair={String(model.underRepair)} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">ห้อง · เตียง · อุปกรณ์</h2>
        {model.canEdit && (
          <button type="button" data-bq-resource-add="" className={BTN_GHOST} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            + เพิ่มทรัพยากร
          </button>
        )}
      </div>
      {adding && (
        <ResourceForm
          initial={{ kind: "BED", name: "", capacity: 1, cleanupMin: 0, sortOrder: (model.rows[model.rows.length - 1]?.sortOrder ?? 0) + 1 }}
          submitLabel="เพิ่ม"
          withActive={false}
          onCancel={() => setAdding(false)}
          onSubmit={create}
        />
      )}
      <div className="overflow-x-auto rounded-2xl border bg-[color:var(--color-surface)]">
        <table data-bq-resource-table="" className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className={cx("bg-[color:var(--color-surface-2)] text-left text-xs", MUTED)}>
              <th className="px-3 py-2.5 font-semibold">ทรัพยากร</th>
              <th className="px-3 py-2.5 font-semibold">ชนิด</th>
              <th className="px-3 py-2.5 font-semibold">รับได้ (คน)</th>
              <th className="px-3 py-2.5 font-semibold">เก็บ/เตรียม</th>
              <th className="px-3 py-2.5 font-semibold">ใช้กับบริการ</th>
              <th className="px-3 py-2.5 font-semibold">สถานะ</th>
              {model.canEdit && <th className="px-3 py-2.5" aria-label="แก้ไข" />}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((r) => (
              <ResourceTableRow key={r.id} row={r} actions={actions} canEdit={model.canEdit} />
            ))}
          </tbody>
        </table>
        {model.rows.length === 0 && (
          <p className={cx("p-4 text-sm", MUTED)}>ยังไม่มีทรัพยากร — ร้านที่ต้องว่างทั้งคนและห้อง/เตียง เพิ่มทรัพยากรแล้วประกาศที่หน้า “บริการ” ว่าบริการไหนต้องใช้ชนิดใด</p>
        )}
      </div>
      <p className={cx("text-xs", MUTED)}>
        ทรัพยากรที่ปิดซ่อม = ช่องจองของบริการที่ต้องใช้มันลดลงเอง · ร้านตัดผมใช้ชนิด “เก้าอี้” ผูกช่างประจำ (ไม่ต้องจองแยก) · คลินิกใช้ชนิด “ห้องตรวจ”
      </p>
    </section>
  );
}

function ResourceTableRow({ row, actions, canEdit }: { row: ResourceViewRow; actions: BookingResourceActions; canEdit: boolean }) {
  const [mode, setMode] = useState<"none" | "edit" | "maint">("none");
  const call = async (p: Promise<Ok | Fail>): Promise<string | null> => {
    try {
      const r = await p;
      if (r.ok) {
        setMode("none");
        return null;
      }
      return failText(r);
    } catch {
      return "บันทึกไม่สำเร็จ ลองอีกครั้ง";
    }
  };
  const link = cx("inline-flex min-h-11 items-center px-2 text-xs underline", MUTED);
  return (
    <>
      <tr data-resource-id={row.id} data-status={row.status} className="border-t align-top">
        <td data-col="name" className="px-3 py-2 font-semibold">
          <span className="inline-flex min-h-11 items-center">{row.name}</span>
        </td>
        <td data-col="kind" className="px-3 py-2">{row.kindTh}</td>
        <td data-col="capacity" className="px-3 py-2">{row.capacity}</td>
        <td data-col="cleanup" className="px-3 py-2">{row.cleanupMin > 0 ? `${row.cleanupMin} นาที` : "0"}</td>
        <td data-col="services" className="px-3 py-2">{row.servicesTh}</td>
        <td data-col="status" className="px-3 py-2">
          <span className={STATUS_CLS[row.status]}>{row.statusTh}</span>
        </td>
        {canEdit && (
          <td className="whitespace-nowrap px-3 py-2 text-right">
            <button type="button" className={link} onClick={() => setMode(mode === "edit" ? "none" : "edit")} aria-expanded={mode === "edit"}>
              แก้
            </button>
            <button type="button" className={link} onClick={() => setMode(mode === "maint" ? "none" : "maint")} aria-expanded={mode === "maint"}>
              ปิดซ่อม
            </button>
          </td>
        )}
      </tr>
      {canEdit && mode !== "none" && (
        <tr data-resource-edit={row.id}>
          <td colSpan={7} className="px-3 pb-3">
            {mode === "edit" ? (
              <ResourceForm
                initial={{ kind: row.kind, name: row.name, capacity: row.capacity, cleanupMin: row.cleanupMin, sortOrder: row.sortOrder, active: row.active }}
                submitLabel="บันทึก"
                withActive
                onCancel={() => setMode("none")}
                onSubmit={(v) => call(actions.update({ id: row.id, ...v }))}
              />
            ) : (
              <MaintenanceForm row={row} onCancel={() => setMode("none")} onSave={(ws) => call(actions.maintenance({ id: row.id, windows: ws }))} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
