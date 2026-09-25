"use client";

// FormTargetsTable.tsx — หน้า "ฟอร์มรับลูกค้า → CRM" (ใบ C2.6 · RESOLUTIONS R-A: `/settings/forms` เป็นของใบนี้)
//   ตัวสร้างฟอร์ม (ช่องกรอก/ลำดับ) ยังอยู่ที่ `/app/forms` เหมือนเดิม — หน้านี้ตั้งเฉพาะ "ฝั่ง CRM" ของฟอร์ม
//
// 🔴 ระบบ CRM ปลายทาง · กฎมอบหมาย · คะแนนเมื่อกรอก · บริษัทจากช่อง · กันสแปม · โค้ดฝัง
// 🔴 ข้อความผิดพลาดขึ้น inline ต่อแถว (ห้าม alert) · ทุกตัวควบคุมมี `data-testid`
// 🔴 390: แถวกลายเป็นการ์ดคอลัมน์เดียว (ไม่มีล้นแนวนอน)

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveFormTarget } from "@/app/app/sys/[id]/crm/settings/tracking/actions";
import type { CrmFormsPageData, CrmTrackFormTargetRow } from "./types";

const input = "min-w-0 rounded-lg border px-2 py-1.5 text-sm text-[color:var(--color-ink)] bg-[color:var(--color-surface)]";
const btn = "rounded-lg border px-3 py-1.5 text-sm font-medium";

export function FormTargetsTable({ data }: { data: CrmFormsPageData }) {
  const router = useRouter();
  const [rows, setRows] = useState<CrmTrackFormTargetRow[]>(data.forms);
  const [err, setErr] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function patch(row: CrmTrackFormTargetRow, p: Parameters<typeof saveFormTarget>[2]) {
    setBusy(true);
    setErr({ ...err, [row.formId]: "" });
    const r = await saveFormTarget(data.systemId, row.formId, p);
    setBusy(false);
    if (!r.ok) {
      setErr({ ...err, [row.formId]: r.error });
      return;
    }
    setRows(rows.map((x) => (x.formId === row.formId ? r.data : x)));
    setNote({ ...note, [row.formId]: "บันทึกแล้ว" });
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="crm-forms-page">
      <p className="text-xs text-[color:var(--color-muted)]">
        ฟอร์มของร้านทุกใบอยู่ที่นี่ — เลือกว่าคำตอบเข้าระบบ CRM ไหน ใครรับ ได้คะแนนเท่าไร และเอา “โค้ดฝัง” ไปวางบนเว็บได้เลย
      </p>
      {rows.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีฟอร์มในร้าน — สร้างได้ที่เมนู “ฟอร์ม”</p>}
      {rows.map((f) => {
        const guard = (f.spamGuard ?? {}) as Record<string, unknown>;
        const honeypot = guard.honeypot !== false;
        return (
          <section key={f.formId} className="card flex min-w-0 flex-col gap-2 p-3" data-testid={`crm-forms-row-${f.formId}`}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                <div className="truncate text-xs text-[color:var(--color-muted)]">{f.publicUrl}</div>
              </div>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">{f.active ? "เปิดรับ" : "ปิดรับ"}</span>
            </div>

            {/* 🔴 (รีวิวรอบ 2 · B1) ฟอร์มที่ตั้งชื่อช่องชนกับช่องของด่านกันสแปม: ระบบ **ไม่ตีความ** ค่านั้นเป็นช่องหลอกบอต
                แล้ว (คำตอบจริงไม่หายอีก) แต่ต้องบอกเจ้าของร้านให้เปลี่ยนชื่อ ไม่ใช่เงียบ ๆ — ช่องหลอกบอตของฟอร์มใบนี้
                จะปิดอยู่จนกว่าจะเปลี่ยนชื่อช่อง */}
            {(f.reservedKeys ?? []).length > 0 && (
              <p className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-xs text-[color:var(--color-danger)]" data-testid={`crm-forms-reserved-${f.formId}`}>
                ฟอร์มนี้มีช่องชื่อ {(f.reservedKeys ?? []).join(" · ")} ซึ่งระบบกันสแปมสงวนไว้ (ชื่อที่ขึ้นต้นด้วย “_sd_”) — คำตอบของลูกค้ายังเข้าครบทุกใบ
                แต่ด่านกันสแปมที่ใช้ชื่อเดียวกันถูกปิดไว้ · เปลี่ยนชื่อช่องที่เมนู “ฟอร์ม” แล้วกันสแปมจะกลับมาทำงานเอง
              </p>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>ระบบ CRM ปลายทาง</span>
                <select
                  className={input}
                  value={f.crmSystemId ?? ""}
                  onChange={(e) => void patch(f, { crmSystemId: e.target.value || null })}
                  data-testid={`crm-forms-system-${f.formId}`}
                  aria-label={`ระบบ CRM ปลายทางของฟอร์ม ${f.name}`}
                >
                  <option value="">ระบบ CRM แรกของร้าน (ค่าเริ่มต้น)</option>
                  {data.crmSystems.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>กฎมอบหมายผู้ดูแล</span>
                <select
                  className={input}
                  value={f.assignRuleId ?? ""}
                  onChange={(e) => void patch(f, { assignRuleId: e.target.value || null })}
                  data-testid={`crm-forms-assign-${f.formId}`}
                  aria-label={`กฎมอบหมายของฟอร์ม ${f.name}`}
                >
                  <option value="">ใช้กฎตามลำดับของระบบ</option>
                  {data.rules.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>คะแนนเมื่อกรอกฟอร์ม</span>
                <input
                  className={input}
                  type="number"
                  min={0}
                  max={1000}
                  defaultValue={f.scoreOnSubmit ?? 0}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n !== (f.scoreOnSubmit ?? 0)) void patch(f, { scoreOnSubmit: n > 0 ? n : null });
                  }}
                  data-testid={`crm-forms-score-${f.formId}`}
                  aria-label={`คะแนนเมื่อกรอกฟอร์ม ${f.name}`}
                />
              </label>

              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>สร้างบริษัทจากช่อง</span>
                <select
                  className={input}
                  value={f.createCompanyFromField ?? ""}
                  onChange={(e) => void patch(f, { createCompanyFromField: e.target.value || null })}
                  data-testid={`crm-forms-company-${f.formId}`}
                  aria-label={`ช่องที่ใช้สร้างบริษัทของฟอร์ม ${f.name}`}
                >
                  <option value="">ไม่สร้างบริษัท</option>
                  {f.fieldKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={honeypot}
                  onChange={(e) => void patch(f, { spamGuard: { ...guard, honeypot: e.target.checked } })}
                  data-testid={`crm-forms-spam-${f.formId}`}
                  aria-label={`กันสแปมของฟอร์ม ${f.name}`}
                />
                <span>กันสแปม (ช่องหลอกบอต + เวลากรอกขั้นต่ำ + เพดานความถี่)</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={f.utmCapture}
                  onChange={(e) => void patch(f, { utmCapture: e.target.checked })}
                  data-testid={`crm-forms-utm-${f.formId}`}
                  aria-label={`เก็บ utm ของฟอร์ม ${f.name}`}
                />
                <span>เก็บ utm ของลิงก์ที่ลูกค้ามาจาก</span>
              </label>
            </div>

            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>โค้ดฝังบนเว็บของร้าน</span>
              <textarea className={`${input} font-mono text-[11px]`} rows={2} readOnly value={f.embedCode} data-testid={`crm-forms-embed-${f.formId}`} aria-label={`โค้ดฝังของฟอร์ม ${f.name}`} />
            </label>

            {err[f.formId] && (
              <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid={`crm-forms-error-${f.formId}`}>
                {err[f.formId]}
              </p>
            )}
            {!err[f.formId] && note[f.formId] && <p className="text-xs text-[color:var(--color-accent)]">{note[f.formId]}</p>}
            <div className="flex justify-end">
              <button type="button" className={btn} disabled={busy} onClick={() => void patch(f, {})} data-testid={`crm-forms-refresh-${f.formId}`}>
                รีเฟรชค่า
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
