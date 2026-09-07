// SavedViewsMenu.tsx — dropdown "มุมมองที่บันทึกไว้" ในหัวบอร์ด (K2.5 · พิมพ์เขียว §2.3/§3.10)
//
// ทั้งทีม (BOARD scope) มาก่อนเสมอ แล้วตามด้วยส่วนตัว (PRIVATE) — เรียงมาจาก `listViews` แล้ว (server)
// กดแถวไหน = ไปหน้าบอร์ดพร้อมตัวกรอง/มุมมอง/เรียง/จัดกลุ่มของมุมมองนั้นทันที (href คำนวณจาก config ที่
// มีอยู่แล้วในมือ — ไม่ต้องรอ server action ก่อนค่อยนำทาง) · ปุ่ม "บันทึกมุมมองนี้" เก็บ view/filters/
// sort/group ปัจจุบันของ URL เป็นมุมมองใหม่ (scope เลือกได้เฉพาะ ADMIN — ที่เหลือบันทึกเป็นส่วนตัวเสมอ)
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { KanbanIcon } from "./KanbanIcon";
import { boardFiltersFromParams, describeSavedViewConfig, hrefForSavedView } from "@/lib/modules/kanban/filters";
import { deleteViewAction, saveViewAction } from "@/lib/modules/kanban/actions";
import type { SavedViewDto, ViewConfig } from "@/lib/modules/kanban/types";

/**
 * อ่าน view/filters/sort/group ปัจจุบันจาก URL ⇒ ก้อน config ที่พร้อมส่งให้ `saveViewAction`
 * 🔴 ตัวกรองผ่าน `boardFiltersFromParams` เดิม (คัดกรอง enum ที่รู้จักแล้ว) — ไม่พิมพ์ตรรกะ parse ซ้ำ
 *    ที่นี่ (`ViewFilters` เป็น subset ของ `BoardFilters` พอดี ไม่มี `board`)
 */
function currentConfigFromParams(searchParams: URLSearchParams): ViewConfig {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of searchParams.entries()) raw[k] = v;
  const f = boardFiltersFromParams(raw);
  const rawView = raw.view;
  const view: ViewConfig["view"] =
    rawView === "table" || rawView === "calendar" || rawView === "summary" || rawView === "timeline" ? rawView : "board";
  const filters: NonNullable<ViewConfig["filters"]> = {
    ...(f.assignee ? { assignee: f.assignee } : {}),
    ...(f.label ? { label: f.label } : {}),
    ...(f.due ? { due: f.due } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { q: f.q } : {}),
    ...(f.column ? { column: f.column } : {}),
  };
  const sort = raw.sort;
  const group = raw.group;
  return {
    view,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(sort ? { sort } : {}),
    ...(group ? { group } : {}),
  };
}

export function SavedViewsMenu({
  systemId,
  boardId,
  isAdmin,
  viewerUserId,
  views,
}: {
  systemId: string;
  boardId: string;
  isAdmin: boolean;
  /** ใช้ตัดสินว่าแถว PRIVATE ใบไหนเป็น "ของฉัน" (ลบได้) */
  viewerUserId: string;
  views: SavedViewDto[];
}) {
  const [open, setOpen] = useState(false);
  // 🔴 ตำแหน่งของแผงคำนวณเองแทนที่จะใช้ `position:absolute` ธรรมดา — หัวบอร์ด (`BoardHeader.tsx`)
  //    มี `overflow-x-auto` (แถบไอคอนเลื่อนแนวนอนได้บนจอกลาง) ซึ่งตาม CSS spec บังคับให้ overflow-y
  //    ของกล่องเดียวกัน "คำนวณเป็น auto" ไปด้วยเสมอ (ไม่ว่าจะตั้ง overflow-y ไว้เป็นอะไรก็ตาม) ⇒ อะไรก็ตาม
  //    ที่เป็น `position:absolute` แล้วโผล่พ้นความสูงของ `<header>` จะถูกครอบตัดจนไม่เห็นอะไรเลย (0 พิกเซล
  //    ไม่ใช่แค่โดนตัดครึ่ง) — เจอจริงตอนถ่ายภาพ QC ของ K2.5 (เมนู "⋯" เดิมก็โดนปัญหาเดียวกัน แต่ไม่มีใคร
  //    เคยถ่ายภาพตอนเปิดมันมาก่อน) ⇒ ใช้ `position:fixed` คำนวณพิกัดจาก `getBoundingClientRect()` ของปุ่ม
  //    แทน ซึ่งไม่ยึดกับ containing block ของ header จึงไม่โดน clip (ดู wo-notes/kanban-K2.5.md)
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState(views);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const teamViews = rows.filter((v) => v.scope === "BOARD");
  const privateViews = rows.filter((v) => v.scope === "PRIVATE");
  const activeId = searchParams.get("savedView");

  const removeView = async (viewId: string) => {
    setBusyId(viewId);
    const res = await deleteViewAction({ systemId, boardId, viewId });
    setBusyId(null);
    if (res.ok) setRows((prev) => prev.filter((v) => v.id !== viewId));
  };

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  return (
    <span className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="saved-views"
        onClick={toggleOpen}
        title="มุมมองที่บันทึกไว้"
        className="hidden items-center lg:flex"
        style={{
          height: 31,
          padding: "0 10px",
          borderRadius: 7,
          fontSize: 12.5,
          border: "1px solid var(--color-line)",
          background: "var(--color-surface)",
          color: "var(--color-muted)",
          gap: 7,
          whiteSpace: "nowrap",
        }}
      >
        <KanbanIcon name="book" size="sm" />
        มุมมอง
      </button>
      {open && pos && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            data-testid="saved-views-list"
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
                ยังไม่มีมุมมองที่บันทึกไว้ — ตั้งตัวกรอง/มุมมองที่ต้องการแล้วกด &ldquo;บันทึกมุมมองนี้&rdquo; ด้านล่าง
              </p>
            )}
            {teamViews.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-2 pt-1" style={{ fontSize: 10.5, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  ทั้งทีม
                </span>
                {teamViews.map((v) => (
                  <SavedViewRow key={v.id} view={v} active={v.id === activeId} pathname={pathname} onClose={() => setOpen(false)} canDelete={isAdmin} busy={busyId === v.id} onDelete={() => removeView(v.id)} />
                ))}
              </div>
            )}
            {privateViews.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-2 pt-1" style={{ fontSize: 10.5, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  ส่วนตัว
                </span>
                {privateViews.map((v) => (
                  <SavedViewRow
                    key={v.id}
                    view={v}
                    active={v.id === activeId}
                    pathname={pathname}
                    onClose={() => setOpen(false)}
                    canDelete={v.ownerUserId === viewerUserId}
                    busy={busyId === v.id}
                    onDelete={() => removeView(v.id)}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              data-testid="save-view-open"
              onClick={() => {
                setOpen(false);
                setSaveOpen(true);
              }}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-2 text-left"
              style={{ borderTop: "1px solid var(--color-line)", color: "var(--color-accent)", fontWeight: 600 }}
            >
              <KanbanIcon name="plus" size="xs" />
              บันทึกมุมมองนี้
            </button>
          </div>
        </>
      )}
      {saveOpen && (
        <SaveViewModal
          systemId={systemId}
          boardId={boardId}
          isAdmin={isAdmin}
          config={currentConfigFromParams(searchParams)}
          onClose={() => setSaveOpen(false)}
          onSaved={(view) => setRows((prev) => [...prev, view])}
        />
      )}
    </span>
  );
}

function SavedViewRow({
  view,
  active,
  pathname,
  canDelete,
  busy,
  onClose,
  onDelete,
}: {
  view: SavedViewDto;
  active: boolean;
  pathname: string;
  canDelete: boolean;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <Link
        href={hrefForSavedView(pathname, view.id, view.config)}
        data-testid="saved-view-item"
        onClick={onClose}
        className="flex min-w-0 flex-1 flex-col rounded-lg px-2 py-1.5"
        style={{ background: active ? "var(--color-surface-2)" : "transparent" }}
      >
        <span className="truncate" style={{ fontWeight: active ? 700 : 500, color: "var(--color-ink)" }}>
          {view.name}
        </span>
        <span className="truncate" style={{ fontSize: 11, color: "var(--color-muted)" }}>
          {describeSavedViewConfig(view.config)}
        </span>
      </Link>
      {canDelete && (
        <button
          type="button"
          aria-label={`ลบมุมมอง ${view.name}`}
          title="ลบมุมมองนี้"
          disabled={busy}
          onClick={onDelete}
          className="grid shrink-0 place-items-center"
          style={{ width: 24, height: 24, borderRadius: 6, color: "var(--color-muted)" }}
        >
          <KanbanIcon name="trash" size="xs" />
        </button>
      )}
    </span>
  );
}

/** โมดัลเล็ก "บันทึกมุมมองนี้" — ชื่อ + scope (ทั้งทีม เฉพาะ ADMIN) — validation แบบ inline (ไม่ใช้ alert) */
function SaveViewModal({
  systemId,
  boardId,
  isAdmin,
  config,
  onClose,
  onSaved,
}: {
  systemId: string;
  boardId: string;
  isAdmin: boolean;
  config: ViewConfig;
  onClose: () => void;
  onSaved: (view: SavedViewDto) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PRIVATE" | "BOARD">("PRIVATE");
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
    const res = await saveViewAction({ systemId, boardId, name: trimmed, scope, config });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(res.view);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="save-view-modal"
        role="dialog"
        aria-modal="true"
        aria-label="บันทึกมุมมองนี้"
        className="relative flex w-full max-w-[380px] flex-col gap-3 rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>บันทึกมุมมองนี้</h2>
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
          บันทึกตัวกรอง + การแสดงผล + การเรียงลำดับที่ตั้งอยู่ตอนนี้ ไว้เรียกกลับมาใช้ทีหลัง
        </p>
        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          ชื่อมุมมอง
          <input
            autoFocus
            data-testid="save-view-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            aria-invalid={error ? "true" : undefined}
            placeholder="เช่น งานเลยกำหนดของฉัน"
          />
        </label>
        {isAdmin && (
          <div className="flex flex-col gap-1.5" style={{ fontSize: 12.5 }}>
            <span>มองเห็นได้โดย</span>
            <div className="flex" style={{ gap: 6 }}>
              <ScopeChip testId="save-view-scope-private" active={scope === "PRIVATE"} label="เฉพาะฉัน" onClick={() => setScope("PRIVATE")} />
              <ScopeChip testId="save-view-scope-board" active={scope === "BOARD"} label="ทั้งทีม" onClick={() => setScope("BOARD")} />
            </div>
          </div>
        )}
        {error && (
          <p data-testid="save-view-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" data-testid="save-view-submit" className="btn btn-primary text-sm" onClick={submit} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกมุมมองนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeChip({ active, label, onClick, testId }: { active: boolean; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
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

export default SavedViewsMenu;
