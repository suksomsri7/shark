"use client";

import { useActionState, useEffect, useState } from "react";
import { addSystemAction, type AddSystemState } from "@/lib/actions/systems";
import { SYSTEM_DEFS, isFixedPageSystem } from "@/lib/systems";

// Modal "เพิ่มระบบ" กลางจอ 2 จังหวะ — เลือกระบบ → ตั้งชื่อ → สร้าง
// reuse server action เดิม (addSystemAction ของหน้า settings/systems) — ห้าม fork logic / ห้ามแตะ prisma
// สร้างสำเร็จ: addSystemAction redirect ไปหน้าระบบใหม่เอง (/app/sys/<id> หรือ /app/u/<slug>) → modal หายไปพร้อมหน้าเปลี่ยน
const initial: AddSystemState = { status: "idle" };
// ระบบ "หน้า fixed" (เช่น คลังความรู้) เข้าถึงตรงจากเมนู ไม่ได้สร้างเป็น instance → ไม่แสดงในตัวเลือก
const CREATABLE_DEFS = SYSTEM_DEFS.filter((s) => !isFixedPageSystem(s.code));

export function AddSystemModal({
  open,
  onClose,
  openedCodes = [],
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  openedCodes?: string[];
  preselect?: string | null;
}) {
  const [state, action, pending] = useActionState(addSystemAction, initial);
  // จังหวะ: null = เลือกระบบ · มีค่า = ฟอร์มตั้งชื่อระบบที่เลือก
  const [selected, setSelected] = useState<string | null>(preselect ?? null);
  const selectedDef = selected ? SYSTEM_DEFS.find((s) => s.code === selected) : null;

  // เปิดพร้อม preselect (จาก checklist ?add-system=<CODE>) → เข้าจังหวะตั้งชื่อทันที
  // ปิด modal = รีเซ็ตกลับจังหวะเลือกระบบเสมอ (เปิดครั้งหน้าเริ่มใหม่)
  useEffect(() => {
    if (open) setSelected(preselect ?? null);
    else setSelected(null);
  }, [open, preselect]);

  if (!open) return null;

  const close = () => {
    setSelected(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* ฉากหลังมืดโปร่ง — แตะเพื่อปิด */}
      <div className="absolute inset-0 bg-black/40" onClick={close} />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-[color:var(--color-surface)] shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        {/* หัว modal — ย้อนกลับ (จังหวะตั้งชื่อ) + ชื่อขั้นตอน + ปุ่มปิด */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            {selectedDef && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="ย้อนกลับ"
                className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
              >
                ←
              </button>
            )}
            <div className="font-semibold">{selectedDef ? "ตั้งชื่อระบบ" : "เพิ่มระบบ"}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedDef ? (
            // ── จังหวะ 1 — เลือกระบบจาก catalog จริง (SYSTEM_DEFS) ──
            <div className="grid grid-cols-2 gap-2">
              {CREATABLE_DEFS.map((s) => {
                // business สร้างซ้ำได้ (หลายสาขา) — "เปิดแล้ว" บล็อกเฉพาะ feature ที่ instantiate ครั้งเดียว
                const opened = s.kind === "feature" && openedCodes.includes(s.code);
                const comingSoon = s.status === "coming_soon";
                const disabled = comingSoon || opened;
                return (
                  <button
                    type="button"
                    key={s.code}
                    disabled={disabled}
                    onClick={() => !disabled && setSelected(s.code)}
                    className={[
                      "relative rounded-xl border p-3 text-left transition-colors",
                      disabled
                        ? "cursor-not-allowed opacity-45"
                        : "hover:bg-[color:var(--color-surface-2)]",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">{s.hint}</div>
                    {opened ? (
                      <span className="absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                        เปิดแล้ว
                      </span>
                    ) : comingSoon ? (
                      <span className="absolute right-2 top-2 rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                        เร็วๆ นี้
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            // ── จังหวะ 2 — ตั้งชื่อระบบที่เลือก (default = ชื่อไทยของระบบ) ──
            <form action={action} className="flex flex-col gap-4">
              <input type="hidden" name="code" value={selectedDef.code} />
              <div className="flex items-center gap-3 rounded-xl border bg-[color:var(--color-surface-2)] p-3">
                <span className="text-xl">{selectedDef.icon}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{selectedDef.label}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">{selectedDef.hint}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm text-[color:var(--color-muted)]" htmlFor="sysName">
                  ชื่อระบบ
                </label>
                <input
                  id="sysName"
                  name="name"
                  required
                  minLength={2}
                  key={selectedDef.code}
                  defaultValue={selectedDef.label}
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
                />
              </div>

              {state.status === "error" && (
                <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="btn btn-ghost"
                >
                  ย้อนกลับ
                </button>
                <button type="submit" disabled={pending} className="btn btn-primary flex-1">
                  {pending ? "กำลังสร้าง..." : "สร้างระบบ"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
