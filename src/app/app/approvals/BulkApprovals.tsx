"use client";

import { useActionState, useEffect, useState } from "react";
import { bulkDecideAction, type BulkDecideState } from "@/lib/modules/approval/actions";

// เลือกหลายคำขอ (checkbox) แล้วอนุมัติ/ปฏิเสธพร้อมกัน — สรุปผลแสดง inline
// อยู่ในหน้า /app/approvals แทนปุ่มรายใบเดิม (เลือก 1 ใบ = ทำรายเดียวได้)
// POS P1.15U ▸ ภาพ 21A: คำขอ POS มีการ์ดเต็ม — ยอดขวา · บรรทัดเหตุผล · ชิปแดง "เกินเพดาน" · รายละเอียด (ผู้ขอ/เครื่อง/เวลา/เหตุผล/ถ้าอนุมัติ) · บรรทัดนโยบาย
//   ข้อความทั้งหมดประกอบที่หน้าเพจ (เซิร์ฟเวอร์ · แปลแล้ว) — ปุ่มอนุมัติ/ปฏิเสธ = ชุดเดิมของหน้านี้ ◂
type PosCard = { amount: string | null; reason: string | null; chip: string | null; rows: [string, string][]; policy: string | null; detailLabel: string };
type Item = { id: string; label: string; meta: string; pos?: PosCard };

export default function BulkApprovals({ items }: { items: Item[] }) {
  const [state, formAction, pending] = useActionState<BulkDecideState, FormData>(
    bulkDecideAction,
    { status: "idle" },
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "APPROVED" | "REJECTED">(null);

  // ทำเสร็จ → ปิดกล่องยืนยัน + ล้างที่เลือก (รายการที่ผ่านจะหายไปหลัง revalidate)
  useEffect(() => {
    if (state.status === "done") {
      setConfirm(null);
      setSelected(new Set());
    }
  }, [state]);

  const allChecked = items.length > 0 && selected.size === items.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));
  const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? id;
  // HF-HR-0 ▸ รอบ 5b (H3 · มติ D2): เหตุผลที่คำขอนี้ถูกปฏิเสธ (เช่น คำขอของตัวเอง) แสดงในแถวของมันเอง — เลือก 1 ใบ = ทางรายใบ ◂
  const refusedOf = (id: string) => (state.status === "done" ? state.failed.find((f) => f.id === id)?.reason : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-5 w-5" />
        เลือกทั้งหมด ({selected.size}/{items.length})
      </label>

      <div className="flex flex-col gap-2">
        {items.map((i) =>
          i.pos ? (
            <div
              key={i.id}
              data-testid="approval-pos-card"
              className={`flex flex-col gap-2 rounded-xl border px-3 py-3 text-sm ${selected.has(i.id) ? "border-2 border-[color:var(--color-ink)]" : ""}`}
            >
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name="requestIds"
                  value={i.id}
                  checked={selected.has(i.id)}
                  onChange={() => toggle(i.id)}
                  className="mt-0.5 h-5 w-5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 font-semibold">{i.label}</span>
                    {i.pos.amount ? <span className="shrink-0 font-bold tabular-nums">{i.pos.amount}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-[color:var(--color-muted)]">{i.meta}</span>
                  {refusedOf(i.id) && ( // MAIN-MERGE ▸ HF-HR-0 รอบ 5b เหตุผลรายแถวบนการ์ด POS ด้วย ◂
                    <span role="alert" className="block text-xs text-[color:var(--color-danger)]">
                      ไม่สำเร็จ: {refusedOf(i.id)}
                    </span>
                  )}
                </span>
              </label>
              {i.pos.chip ? (
                <span className="self-start rounded-md border border-[color:var(--color-danger)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-danger)]">
                  {i.pos.chip}
                </span>
              ) : null}
              {i.pos.reason ? <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-xs">{i.pos.reason}</p> : null}
              <details className="text-xs">
                <summary className="flex min-h-[44px] cursor-pointer items-center text-[color:var(--color-ink-soft)]">{i.pos.detailLabel}</summary>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2">
                  {i.pos.rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[color:var(--color-muted)]">{k}</dt>
                      <dd className="min-w-0 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
                {i.pos.policy ? (
                  <p className="mt-2 rounded-lg bg-[color:var(--color-accent-soft)] px-3 py-2 font-semibold text-[color:var(--color-accent)]">{i.pos.policy}</p>
                ) : null}
              </details>
            </div>
          ) : (
            <label
              key={i.id}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name="requestIds"
                value={i.id}
                checked={selected.has(i.id)}
                onChange={() => toggle(i.id)}
                className="h-5 w-5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{i.label}</span>
                <span className="block truncate text-xs text-[color:var(--color-muted)]">{i.meta}</span>
                {refusedOf(i.id) && (
                  <span role="alert" className="block text-xs text-[color:var(--color-danger)]">
                    ไม่สำเร็จ: {refusedOf(i.id)}
                  </span>
                )}
              </span>
            </label>
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={() => setConfirm("APPROVED")}
          className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
        >
          อนุมัติที่เลือก ({selected.size})
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={() => setConfirm("REJECTED")}
          className="btn min-h-[44px] text-sm text-white disabled:opacity-50"
          style={{ background: "var(--color-danger)" }}
        >
          ปฏิเสธที่เลือก ({selected.size})
        </button>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              {confirm === "APPROVED" ? "อนุมัติคำขอที่เลือก?" : "ปฏิเสธคำขอที่เลือก?"}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-muted)]">
              เลือกไว้ {selected.size} รายการ
              {confirm === "REJECTED" ? " — จะถูกปฏิเสธทันที ไม่ไปขั้นถัดไป" : ""}
            </p>
            <label className="mt-4 flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              {confirm === "REJECTED" ? "เหตุผลที่ไม่อนุมัติ" : "หมายเหตุ (ถ้ามี)"}
              <input
                name="note"
                required={confirm === "REJECTED"}
                className="input"
                placeholder={confirm === "REJECTED" ? "เช่น เกินงบที่ตั้งไว้" : ""}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost min-h-[44px] text-sm"
                onClick={() => setConfirm(null)}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                name="decision"
                value={confirm}
                disabled={pending}
                className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
                style={confirm === "REJECTED" ? { background: "var(--color-danger)" } : undefined}
              >
                {pending ? "กำลังทำรายการ…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "done" && (
        <div className="rounded-lg border px-3 py-2 text-sm">
          <div className="font-medium">
            สำเร็จ {state.done} รายการ
            {state.failed.length > 0 ? ` · ล้มเหลว ${state.failed.length} รายการ` : ""}
          </div>
          {state.failed.map((f) => (
            <div key={f.id} className="text-xs text-[color:var(--color-danger)]">
              • {labelOf(f.id)}: {f.reason}
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
