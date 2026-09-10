// MembersSavedViewsMenu.tsx — มุมมองที่บันทึกไว้ของหน้ารวมสมาชิก (M1.5 · ภาพ 01 · แบบ K2.5)
// ส่วนตัว/ทั้งทีม — กดแถวไหน = ไปหน้ารวมพร้อม `?view={id}` ทันที · testid `members-views`
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { saveViewAction, deleteViewAction } from "@/lib/modules/member/members-list-actions";

export type MembersSavedView = {
  id: string;
  name: string;
  scope: "PRIVATE" | "TEAM";
  ownerUserId: string | null;
};

export function MembersSavedViewsMenu({
  systemId,
  isManagerPlus,
  viewerUserId,
  views,
  currentFilters,
}: {
  systemId: string;
  /** MANAGER ขึ้นไป — เห็นตัวเลือก "ทั้งทีม" ตอนบันทึกมุมมองใหม่ */
  isManagerPlus: boolean;
  viewerUserId: string;
  views: MembersSavedView[];
  /** ตัวกรอง/เรียง/คอลัมน์ปัจจุบัน (จาก URL ที่ page.tsx อ่านแล้ว) — เก็บลงมุมมองใหม่ตอนกด "บันทึกมุมมองนี้" */
  currentFilters: { filters: Record<string, unknown>; columns: string[]; sort?: string };
}) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState(views);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const teamViews = rows.filter((v) => v.scope === "TEAM");
  const privateViews = rows.filter((v) => v.scope === "PRIVATE");
  const activeId = searchParams.get("view");
  const activeView = rows.find((v) => v.id === activeId) ?? null;

  const hrefOf = (id: string) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("view", id);
    qs.delete("page");
    return `${pathname}?${qs.toString()}`;
  };

  const remove = async (id: string) => {
    setBusyId(id);
    const res = await deleteViewAction({ systemId, viewId: id });
    setBusyId(null);
    if (res.ok) setRows((prev) => prev.filter((v) => v.id !== id));
  };

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  return (
    <span data-testid="members-views" className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="members-views-trigger"
        onClick={toggleOpen}
        className="inline-flex items-center rounded-full text-sm font-semibold whitespace-nowrap"
        style={
          activeView
            ? { gap: 6, height: 27, padding: "0 10px", border: "1px solid var(--color-accent)", color: "var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }
            : { gap: 6, height: 27, padding: "0 10px", border: "1px solid var(--color-line)", color: "var(--color-muted)", background: "var(--color-surface)", fontWeight: 400 }
        }
      >
        <MemberIcon name="star" size="sm" />
        {activeView ? `มุมมองที่บันทึก: ${activeView.name}` : "มุมมองที่บันทึกไว้"}
        <MemberIcon name="chevronDown" size="xs" />
      </button>
      {open && pos && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            data-testid="members-views-list"
            className="flex w-72 flex-col gap-1 rounded-xl p-2"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 20,
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              boxShadow: "0 14px 34px rgba(10,10,10,.12)",
              fontSize: 12.5,
            }}
          >
            {rows.length === 0 && (
              <p className="px-2 py-3" style={{ color: "var(--color-muted)", fontSize: 12 }}>
                ยังไม่มีมุมมองที่บันทึกไว้ — ตั้งตัวกรองที่ต้องการแล้วกด &quot;บันทึกมุมมองปัจจุบัน&quot; ด้านล่าง
              </p>
            )}
            {teamViews.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-2 pt-1" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
                  ทั้งทีม
                </span>
                {teamViews.map((v) => (
                  <ViewRow key={v.id} view={v} active={v.id === activeId} href={hrefOf(v.id)} onClose={() => setOpen(false)} canDelete={isManagerPlus} busy={busyId === v.id} onDelete={() => remove(v.id)} />
                ))}
              </div>
            )}
            {privateViews.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-2 pt-1" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
                  ส่วนตัว
                </span>
                {privateViews.map((v) => (
                  <ViewRow key={v.id} view={v} active={v.id === activeId} href={hrefOf(v.id)} onClose={() => setOpen(false)} canDelete={v.ownerUserId === viewerUserId} busy={busyId === v.id} onDelete={() => remove(v.id)} />
                ))}
              </div>
            )}
            <button
              type="button"
              data-testid="members-view-save-open"
              onClick={() => {
                setOpen(false);
                setSaveOpen(true);
              }}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-2 text-left"
              style={{ borderTop: "1px solid var(--color-line)", color: "var(--color-accent)", fontWeight: 600 }}
            >
              <MemberIcon name="plus" size="xs" />
              บันทึกมุมมองปัจจุบัน
            </button>
          </div>
        </>
      )}
      {saveOpen && (
        <SaveViewModal
          systemId={systemId}
          isManagerPlus={isManagerPlus}
          currentFilters={currentFilters}
          onClose={() => setSaveOpen(false)}
          onSaved={(v) => setRows((prev) => [...prev, v])}
        />
      )}
    </span>
  );
}

function ViewRow({
  view,
  active,
  href,
  canDelete,
  busy,
  onClose,
  onDelete,
}: {
  view: MembersSavedView;
  active: boolean;
  href: string;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <Link
        href={href}
        data-testid="members-view-item"
        onClick={onClose}
        className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5"
        style={{ background: active ? "var(--color-surface-2)" : "transparent", fontWeight: active ? 700 : 500, color: "var(--color-ink)" }}
      >
        {view.name}
      </Link>
      {canDelete && (
        <button type="button" aria-label={`ลบมุมมอง ${view.name}`} disabled={busy} onClick={onDelete} className="grid shrink-0 place-items-center" style={{ width: 24, height: 24, color: "var(--color-muted)" }}>
          <MemberIcon name="x" size="xs" />
        </button>
      )}
    </span>
  );
}

function SaveViewModal({
  systemId,
  isManagerPlus,
  currentFilters,
  onClose,
  onSaved,
}: {
  systemId: string;
  isManagerPlus: boolean;
  currentFilters: { filters: Record<string, unknown>; columns: string[]; sort?: string };
  onClose: () => void;
  onSaved: (v: MembersSavedView) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PRIVATE" | "TEAM">("PRIVATE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("ต้องตั้งชื่อมุมมองก่อนจึงบันทึกได้");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveViewAction({ systemId, name: trimmed, scope, filters: currentFilters.filters, columns: currentFilters.columns, sort: currentFilters.sort });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onSaved({ id: res.data.id, name: res.data.name, scope: res.data.scope, ownerUserId: res.data.ownerUserId });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="members-view-save-modal"
        role="dialog"
        aria-modal="true"
        aria-label="บันทึกมุมมองปัจจุบัน"
        className="relative flex w-full max-w-[380px] flex-col gap-3 rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>บันทึกมุมมองปัจจุบัน</h2>
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>บันทึกตัวกรอง + คอลัมน์ + การเรียงลำดับที่ตั้งอยู่ตอนนี้ ไว้เรียกกลับมาใช้ทีหลัง</p>
        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          ชื่อมุมมอง
          <input autoFocus data-testid="members-view-name-input" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder='เช่น "VIP ที่หายไป 60 วัน"' />
        </label>
        {isManagerPlus && (
          <div className="flex flex-col gap-1.5" style={{ fontSize: 12.5 }}>
            <span>มองเห็นได้โดย</span>
            <div className="flex" style={{ gap: 6 }}>
              <ScopeChip active={scope === "PRIVATE"} label="เฉพาะฉัน" onClick={() => setScope("PRIVATE")} />
              <ScopeChip active={scope === "TEAM"} label="ทั้งทีม" onClick={() => setScope("TEAM")} />
            </div>
          </div>
        )}
        {error && (
          <p data-testid="members-view-save-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" data-testid="members-view-save-submit" className="btn btn-primary text-sm" onClick={submit} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกมุมมอง"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center"
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-line)"}`,
        background: active ? "var(--color-out)" : "var(--color-surface)",
        color: active ? "var(--color-accent)" : "var(--color-ink-soft)",
      }}
    >
      {label}
    </button>
  );
}

export default MembersSavedViewsMenu;
