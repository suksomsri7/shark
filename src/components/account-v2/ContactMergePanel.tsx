"use client";

// ContactMergePanel.tsx — หน้า "รวมผู้ติดต่อซ้ำ" (WO 3.4 · DESIGN-SPEC-V2 §7.3 · ภาพ g7-contact-merge.png)
//
// ผังตามเฟรม: ซ้าย = การ์ดคู่ที่สงสัย (chip เหตุผล) · ขวา = ตารางเทียบทีละฟิลด์ (radio ซ้าย/ขวา)
//              แถบฟ้าสรุป "หลังรวม: …" · ปุ่ม "ข้าม" + ดำ "⇄ รวมผู้ติดต่อ" · modal ยืนยันก่อนทำจริง

import { useMemo, useState, useTransition } from "react";
import { Modal } from "./Modal";
import { mergeContactsAction, dismissMergeCandidateAction } from "@/lib/modules/account/actions";
import type { MergeCandidate, MergeCandidateContact, MergeFieldKey, MergeSide } from "@/lib/modules/account/contact-merge";

type FieldDef = { key: MergeFieldKey; label: string };

function valueOf(c: MergeCandidateContact, key: MergeFieldKey): string {
  switch (key) {
    case "name":
      return c.name;
    case "taxId":
      return c.taxId ?? "—";
    case "branchCode":
      return c.branchCode === "00000" ? "สำนักงานใหญ่ 00000" : c.branchCode ? `สาขา ${c.branchCode}` : "—";
    case "address":
      return c.address ?? "—";
    case "phone":
      return c.phoneDisplay ?? "—";
    case "email":
      return c.email ?? "—";
    case "creditTermDays":
      return `${c.creditTermDays} วัน`;
    case "note":
      return c.note ?? "—";
    case "partyId":
      return c.memberLinkLabel ?? "— ยังไม่เชื่อม";
  }
}

function Radio({
  checked,
  onSelect,
  label,
  testId,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={onSelect}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
      style={{ borderColor: checked ? "var(--color-ink)" : "var(--color-line)" }}
    >
      {checked && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-ink)" }} />}
    </button>
  );
}

export function ContactMergePanel({
  systemId,
  fields,
  candidates,
  selectedKey,
}: {
  systemId: string;
  fields: FieldDef[];
  candidates: MergeCandidate[];
  selectedKey: string | null;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(selectedKey ?? candidates[0]?.key ?? null);
  const [swapped, setSwapped] = useState(false);
  const [choices, setChoices] = useState<Partial<Record<MergeFieldKey, MergeSide>>>({});
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone?: "danger" } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const visible = candidates.filter((c) => !done.has(c.key));
  const active = useMemo(() => visible.find((c) => c.key === activeKey) ?? visible[0] ?? null, [visible, activeKey]);

  if (candidates.length === 0)
    return (
      <p className="rounded-xl border p-6 text-sm text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }} data-testid="merge-empty">
        ไม่พบผู้ติดต่อที่น่าจะซ้ำกัน — ระบบตรวจจากเลขภาษี เบอร์โทร และชื่อที่คล้ายกัน ≥ 90%
      </p>
    );

  if (!active)
    return (
      <p className="rounded-xl border p-6 text-sm text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }} data-testid="merge-empty">
        จัดการครบทุกคู่แล้ว
      </p>
    );

  const primary = swapped ? active.b : active.a;
  const secondary = swapped ? active.a : active.b;
  const totalDocs = primary.docCount + secondary.docCount;

  const pick = (key: MergeFieldKey): MergeSide => choices[key] ?? "primary";
  const setPick = (key: MergeFieldKey, side: MergeSide) => setChoices((p) => ({ ...p, [key]: side }));

  const selectPair = (key: string) => {
    setActiveKey(key);
    setSwapped(false);
    setChoices({});
  };

  const doMerge = () => {
    setConfirm(false);
    start(async () => {
      const res = await mergeContactsAction(systemId, {
        primaryId: primary.id,
        secondaryId: secondary.id,
        fieldChoices: choices,
      });
      if (res.ok) {
        setDone((p) => new Set(p).add(active.key));
        setActiveKey(null);
        setChoices({});
        setToast({
          text: `รวมเรียบร้อย — ย้ายเอกสาร ${res.moved.documents} ใบ · สมุดรายวัน ${res.moved.journalLines} บรรทัด · กฎเอกสารประจำ ${res.moved.recurringRules} กฎ`,
        });
      } else {
        setToast({ text: res.reason, tone: "danger" });
      }
    });
  };

  const doDismiss = () => {
    start(async () => {
      const res = await dismissMergeCandidateAction(systemId, { aId: primary.id, bId: secondary.id });
      if (res.ok) {
        setDone((p) => new Set(p).add(active.key));
        setActiveKey(null);
        setToast({ text: "บันทึกแล้วว่าไม่ใช่คนเดียวกัน — คู่นี้จะไม่ขึ้นมาอีก" });
      } else {
        setToast({ text: res.reason, tone: "danger" });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row" data-testid="merge-page">
      {/* ซ้าย: การ์ดคู่ที่สงสัย */}
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[380px]">
        {visible.map((c) => {
          const on = c.key === active.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => selectPair(c.key)}
              data-testid={`merge-pair-${c.a.code}-${c.b.code}`}
              className="flex flex-col items-start gap-2 rounded-xl border p-4 text-left"
              style={{ borderColor: on ? "var(--color-ink)" : "var(--color-line)", borderWidth: on ? 2 : 1 }}
            >
              <span className="text-sm font-semibold">
                {c.a.code} {c.a.name} <span className="text-[color:var(--color-muted)]">↔</span> {c.b.code} {c.b.name}
              </span>
              <span
                className="rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]"
                style={{ borderColor: "var(--color-line)" }}
                data-testid={`merge-reason-${c.a.code}`}
              >
                {c.reasonLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* ขวา: ตารางเทียบ */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
          {/* หัวตาราง: ซ้าย = เก็บไว้ · ขวา = ปิดใช้งาน (สลับได้ด้วยปุ่ม "สลับตัวหลัก") */}
          <div className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex flex-col">
              <span className="text-sm font-semibold" data-testid="merge-primary-label">
                เก็บไว้ · {primary.code}
              </span>
              <span className="text-xs text-[color:var(--color-muted)]">{primary.name}</span>
            </div>
            <button type="button" className="btn-sm" onClick={() => setSwapped((v) => !v)} data-testid="merge-swap">
              ⇄ สลับตัวหลัก
            </button>
            <div className="flex flex-col text-right">
              <span className="text-sm font-semibold" style={{ color: "var(--color-accent)" }} data-testid="merge-secondary-label">
                ปิดใช้งาน · {secondary.code}
              </span>
              <span className="text-xs text-[color:var(--color-muted)]">{secondary.name}</span>
            </div>
          </div>

          <div className="flex flex-col">
            {fields.map((f) => {
              const side = pick(f.key);
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-[20px_minmax(0,1fr)_120px_minmax(0,1fr)_20px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0"
                  style={{ borderColor: "var(--color-line)" }}
                  role="radiogroup"
                  aria-label={f.label}
                >
                  <Radio checked={side === "primary"} onSelect={() => setPick(f.key, "primary")} label={`${f.label} — ใช้ค่าของ ${primary.code}`} testId={`merge-radio-${f.key}-primary`} />
                  <span className="min-w-0 break-words">{valueOf(primary, f.key)}</span>
                  <span className="text-center text-xs text-[color:var(--color-muted)]">{f.label}</span>
                  <span className="min-w-0 break-words text-right">{valueOf(secondary, f.key)}</span>
                  <Radio checked={side === "secondary"} onSelect={() => setPick(f.key, "secondary")} label={`${f.label} — ใช้ค่าของ ${secondary.code}`} testId={`merge-radio-${f.key}-secondary`} />
                </div>
              );
            })}

            {/* แถวที่ "ย้ายเสมอ" — ไม่มี radio (เอกสาร/สมุดรายวัน/กลุ่ม ต้องย้ายครบตามกติกาการรวม) */}
            <div className="grid grid-cols-[20px_minmax(0,1fr)_120px_minmax(0,1fr)_20px] items-center gap-3 border-t px-4 py-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
              <span />
              <span data-testid="merge-primary-docs">เอกสาร {primary.docCount} ใบ</span>
              <span className="text-center text-xs text-[color:var(--color-muted)]">เอกสาร</span>
              <span className="text-right" data-testid="merge-secondary-docs">
                เอกสาร {secondary.docCount} ใบ
              </span>
              <span />
            </div>
            <div className="grid grid-cols-[20px_minmax(0,1fr)_120px_minmax(0,1fr)_20px] items-center gap-3 border-t px-4 py-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
              <span />
              <span>{primary.groupNames.length > 0 ? primary.groupNames.join(" · ") : "—"}</span>
              <span className="text-center text-xs text-[color:var(--color-muted)]">กลุ่ม</span>
              <span className="text-right">{secondary.groupNames.length > 0 ? secondary.groupNames.join(" · ") : "—"}</span>
              <span />
            </div>
          </div>
        </div>

        {/* แถบสรุป "หลังรวม" (g7 — แถบฟ้า) */}
        <p
          className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--color-accent)", color: "var(--color-ink)" }}
          data-testid="merge-summary"
        >
          <span aria-hidden>⇄</span>
          หลังรวม: เอกสาร <strong>{totalDocs} ใบ</strong> ย้ายไป <strong>{primary.code}</strong> · {secondary.code} ปิดใช้งาน
        </p>

        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-sm" onClick={doDismiss} disabled={pending} title="ไม่ใช่คนเดียวกัน" data-testid="merge-dismiss">
            ข้าม
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setConfirm(true)} disabled={pending} data-testid="merge-submit">
            ⇄ รวมผู้ติดต่อ
          </button>
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="รวมผู้ติดต่อ 2 รายเป็นรายเดียว?"
        size="sm"
        testId="merge-confirm"
        actions={
          <>
            <button type="button" className="btn-sm" onClick={() => setConfirm(false)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" onClick={doMerge} data-testid="merge-confirm-ok">
              ยืนยันรวม
            </button>
          </>
        }
      >
        <p className="text-sm text-[color:var(--color-muted)]">
          {secondary.code} “{secondary.name}” จะถูกปิดใช้งานและย้ายเอกสารทั้งหมด ({secondary.docCount} ใบ)
          {secondary.journalLineCount > 0 ? ` · สมุดรายวัน ${secondary.journalLineCount} บรรทัด` : ""}
          {secondary.groupNames.length > 0 ? ` · กลุ่ม ${secondary.groupNames.length} กลุ่ม` : ""} ไปรวมกับ {primary.code} “{primary.name}” —
          การทำรายการนี้ไม่สามารถย้อนกลับได้
        </p>
      </Modal>

      {toast && (
        <p
          role="status"
          data-testid="merge-message"
          className="fixed inset-x-0 bottom-4 z-[60] mx-auto w-fit max-w-[92vw] rounded-full px-4 py-3 text-sm shadow-[0_8px_24px_rgba(10,10,10,.24)]"
          style={{
            background: toast.tone === "danger" ? "var(--color-danger)" : "var(--color-ink)",
            color: "var(--color-surface)",
          }}
        >
          {toast.text}
        </p>
      )}
    </div>
  );
}

export default ContactMergePanel;
