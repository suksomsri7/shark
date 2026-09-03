"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { DateText } from "@/lib/ui/DateText";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";
import { PRESET_LABEL, type DateRangePreset } from "./ListFilters";
import { Stepper } from "./Stepper";

// ─────────────────────────────────────────────────────────────
// AdjustWizardStep1 — ขั้น ① ของ wizard เอกสารปรับปรุงหนี้ (WO 1.6 §5.2 J · mockup g3-creditnote-wizard.png)
// ใช้ร่วมกับ CN/DN/CNR/DNR (เอกสารมีมูลค่าเงิน) และ RPR (เอกสารมีจำนวนสินค้า — `showOutstanding=false`)
// ตัวกรอง (วันที่/ผู้ติดต่อ/ค้นหา/ประเภทเอกสาร) เป็น GET form ธรรมดา (โหลดหน้าใหม่ — แบบเดียวกับ ListFilters)
// ส่วนที่เป็น client จริง ๆ คือแค่: radio อ้างอิง/ไม่อ้างอิง + เลือกแถว + ปุ่ม "ถัดไป"
// ─────────────────────────────────────────────────────────────

export type AdjustWizardRow = {
  id: string;
  docNo: string | null;
  issueDate: Date;
  dueDate?: Date | null;
  amountSatang?: number;
  amountText?: string;
  outstandingSatang?: number;
  statusLabel: string;
};

export function AdjustWizardStep1({
  pathname,
  docLabel,
  refTypeOptions,
  refDocType,
  contacts,
  filters,
  rows,
  page,
  pageCount,
  total,
  amountColLabel,
  showOutstanding,
  dueColLabel,
  cancelHref,
}: {
  pathname: string;
  docLabel: string;
  refTypeOptions: { value: string; label: string }[];
  refDocType: string;
  contacts: { id: string; name: string }[];
  filters: { contactId?: string; preset?: DateRangePreset; from?: string; to?: string; q?: string };
  rows: AdjustWizardRow[];
  page: number;
  pageCount: number;
  total: number;
  amountColLabel: string;
  showOutstanding: boolean;
  dueColLabel?: string;
  cancelHref: string;
}) {
  const [mode, setMode] = useState<"ref" | "noref">("ref");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const preset = filters.preset ?? "this_year";

  const nextHref = mode === "ref" ? (selectedId ? `${pathname}?ref=${selectedId}` : undefined) : `${pathname}?noref=1`;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 pb-28" data-testid="adjust-wizard-step1">
      <div className="flex items-baseline gap-2">
        <h1 className="text-xl font-semibold">สร้าง{docLabel}</h1>
        <span className="text-sm text-[color:var(--color-muted)]">ขั้น 1 จาก 2 · เลือกเอกสารอ้างอิง</span>
      </div>

      <div className="card px-5 py-4">
        <Stepper
          steps={[
            { code: "1", label: "เลือกเอกสารอ้างอิง", state: "current" },
            { code: "2", label: docLabel, state: "next" },
          ]}
          testId="wizard-step"
        />
      </div>

      <div className="card flex flex-col gap-4">
        <h2 className="text-sm font-semibold">อ้างอิงเอกสารเดิม</h2>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ref-mode"
              checked={mode === "ref"}
              onChange={() => setMode("ref")}
              data-testid="ref-radio-ref"
            />
            อ้างอิงจากเอกสารเดิม
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ref-mode"
              checked={mode === "noref"}
              onChange={() => setMode("noref")}
              data-testid="ref-radio-noref"
            />
            ไม่อ้างอิง (กรอกเอง)
          </label>
        </div>

        {mode === "ref" && (
          <>
            <form action={pathname} method="GET" className="flex flex-wrap items-center gap-2" data-testid="wizard-filters">
              <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
                <AccountIcon name="calendar" className="h-4 w-4 text-[color:var(--color-muted)]" />
                <select name="preset" defaultValue={preset} className="border-0 bg-transparent py-2 pr-1 outline-none">
                  {(Object.keys(PRESET_LABEL) as DateRangePreset[]).map((p) => (
                    <option key={p} value={p}>
                      {PRESET_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              {preset === "custom" && (
                <>
                  <input type="date" name="from" defaultValue={filters.from} className="input w-auto" />
                  <input type="date" name="to" defaultValue={filters.to} className="input w-auto" />
                </>
              )}
              <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
                <span className="text-[color:var(--color-muted)]">ประเภทเอกสาร</span>
                <select name="reftype" defaultValue={refDocType} className="border-0 bg-transparent py-2 pr-1 outline-none" data-testid="wizard-reftype">
                  {refTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 rounded-lg border px-2 text-sm">
                <AccountIcon name="user" className="h-4 w-4 text-[color:var(--color-muted)]" />
                <select name="contactId" defaultValue={filters.contactId ?? ""} className="border-0 bg-transparent py-2 pr-1 outline-none">
                  <option value="">ผู้ติดต่อ: ทั้งหมด</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="relative min-w-[200px] flex-1">
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.q}
                  placeholder="ค้นหาเลขที่เอกสาร"
                  className="input"
                  data-testid="wizard-search"
                />
              </div>
              <button type="submit" className="btn-sm">
                ค้นหา
              </button>
            </form>

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">
                ไม่พบเอกสารที่อ้างอิงได้ตามตัวกรองนี้
              </p>
            ) : (
              <>
                {/* เดสก์ท็อป: ตารางจริง — colgroup กำหนดความกว้างต่อคอลัมน์ชัดเจน (กัน "ค้างชำระ"/"สถานะ" ชนกัน) */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: 32 }} />
                      <col style={{ width: 160 }} />
                      <col style={{ width: 100 }} />
                      {dueColLabel && <col style={{ width: 120 }} />}
                      <col style={{ width: 130 }} />
                      {showOutstanding && <col style={{ width: 130 }} />}
                      <col style={{ width: 130 }} />
                    </colgroup>
                    <thead>
                      <tr className="text-left text-xs text-[color:var(--color-muted)]">
                        <th className="py-2" />
                        <th className="py-2">เลขที่</th>
                        <th className="py-2">วันที่</th>
                        {dueColLabel && <th className="py-2">{dueColLabel}</th>}
                        <th className="py-2 pr-3 text-right">{amountColLabel}</th>
                        {showOutstanding && <th className="py-2 pr-3 text-right">ค้างชำระ</th>}
                        <th className="py-2">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const isSel = r.id === selectedId;
                        return (
                          <tr
                            key={r.id}
                            onClick={() => setSelectedId(r.id)}
                            className="cursor-pointer border-t"
                            style={isSel ? { background: "var(--color-surface-2)" } : undefined}
                            data-testid={`ref-row-${r.docNo ?? r.id}`}
                            data-selected={isSel ? "1" : "0"}
                          >
                            <td className="py-2">
                              <input type="radio" name="ref-row" checked={isSel} onChange={() => setSelectedId(r.id)} />
                            </td>
                            <td className="truncate py-2 font-medium text-[color:var(--color-accent)]">{r.docNo ?? "—"}</td>
                            <td className="py-2">
                              <DateText value={r.issueDate} />
                            </td>
                            {dueColLabel && (
                              <td className="py-2">{r.dueDate ? <DateText value={r.dueDate} /> : "—"}</td>
                            )}
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {r.amountSatang != null ? <MoneyText satang={r.amountSatang} decimals /> : (r.amountText ?? "—")}
                            </td>
                            {showOutstanding && (
                              <td className="py-2 pr-3 text-right tabular-nums">
                                <MoneyText satang={r.outstandingSatang ?? 0} decimals />
                              </td>
                            )}
                            <td className="py-2">
                              <StatusChip value={r.statusLabel} tone={r.outstandingSatang ? "strong" : "muted"} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* มือถือ (f13): การ์ดทั้งใบแตะเลือกได้ + radio ที่มุมซ้ายเหมือนช่อง checkbox ของ DocTable */}
                <div className="flex flex-col gap-2 md:hidden">
                  {rows.map((r) => {
                    const isSel = r.id === selectedId;
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedId(r.id);
                        }}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 text-sm"
                        style={isSel ? { background: "var(--color-surface-2)" } : undefined}
                        data-testid={`ref-row-${r.docNo ?? r.id}`}
                        data-selected={isSel ? "1" : "0"}
                      >
                        <input
                          type="radio"
                          name="ref-row-m"
                          checked={isSel}
                          onChange={() => setSelectedId(r.id)}
                          className="mt-0.5 shrink-0"
                          aria-label={`เลือก ${r.docNo ?? r.id}`}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-[color:var(--color-accent)]">{r.docNo ?? "—"}</span>
                            <span className="shrink-0">
                              <StatusChip value={r.statusLabel} tone={r.outstandingSatang ? "strong" : "muted"} />
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--color-muted)]">
                            <span>
                              <DateText value={r.issueDate} />
                              {dueColLabel && r.dueDate ? (
                                <>
                                  {" · "}
                                  {dueColLabel} <DateText value={r.dueDate} />
                                </>
                              ) : null}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-[color:var(--color-muted)]">{amountColLabel}</span>
                            <span className="font-medium tabular-nums">
                              {r.amountSatang != null ? <MoneyText satang={r.amountSatang} decimals /> : (r.amountText ?? "—")}
                            </span>
                          </div>
                          {showOutstanding && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-[color:var(--color-muted)]">ค้างชำระ</span>
                              <span className="font-medium tabular-nums">
                                <MoneyText satang={r.outstandingSatang ?? 0} decimals />
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {pageCount > 1 && (
              <div className="flex items-center justify-between text-xs text-[color:var(--color-muted)]">
                <span>
                  หน้า {page}/{pageCount} · {total} รายการ
                </span>
                <span className="flex gap-2">
                  {page > 1 && (
                    <Link href={withPage(pathname, filters, refDocType, page - 1)} className="underline">
                      ก่อนหน้า
                    </Link>
                  )}
                  {page < pageCount && (
                    <Link href={withPage(pathname, filters, refDocType, page + 1)} className="underline">
                      ถัดไป
                    </Link>
                  )}
                </span>
              </div>
            )}
          </>
        )}

        {mode === "noref" && (
          <p className="text-sm text-[color:var(--color-muted)]">
            จะสร้าง{docLabel}โดยไม่อ้างอิงเอกสารเดิม — กรอกรายการและระบุเหตุผลเองในขั้นถัดไป
          </p>
        )}
      </div>

      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-[color:var(--color-surface)] px-4 py-3">
        <Link href={cancelHref} className="btn btn-ghost text-sm" data-testid="btn-cancel">
          ยกเลิก
        </Link>
        <span className="flex-1 text-sm text-[color:var(--color-muted)]">
          {mode === "ref" &&
            (selected
              ? (
                <>
                  เลือกแล้ว 1 ใบ · {selected.docNo}{" "}
                  {showOutstanding && (
                    <>
                      ค้างชำระ <MoneyText satang={selected.outstandingSatang ?? 0} decimals />
                    </>
                  )}
                </>
              )
              : "ยังไม่ได้เลือกเอกสาร")}
        </span>
        {nextHref ? (
          <Link href={nextHref} className="btn btn-primary text-sm" data-testid="btn-next">
            ถัดไป: กรอก{docLabel} →
          </Link>
        ) : (
          <button type="button" className="btn btn-primary text-sm" disabled data-testid="btn-next">
            ถัดไป: กรอก{docLabel} →
          </button>
        )}
      </div>
    </div>
  );
}

function withPage(pathname: string, filters: { contactId?: string; preset?: DateRangePreset; from?: string; to?: string; q?: string }, reftype: string, page: number): string {
  const sp = new URLSearchParams();
  if (filters.preset) sp.set("preset", filters.preset);
  if (filters.from) sp.set("from", filters.from);
  if (filters.to) sp.set("to", filters.to);
  if (filters.contactId) sp.set("contactId", filters.contactId);
  if (filters.q) sp.set("q", filters.q);
  sp.set("reftype", reftype);
  sp.set("page", String(page));
  return `${pathname}?${sp.toString()}`;
}

export default AdjustWizardStep1;
