"use client";
// ─────────────────────────────────────────────────────────────
// InputVatSection.tsx — ภาษีซื้อของเอกสารซื้อ (ACC T1.4): สถานะทั้งใบ + คำเตือน (ทะเบียนกลาง) · design note ledger/wo-notes/T1.4.md §9
//   ค่าเริ่ม (ไม่เลือก) = ตามคู่ค้า/ธงบัญชี — server ตัดสินซ้ำด้วยตัวคำนวณเดียวกัน (input-vat-shared)
//   ต่อบรรทัดอยู่ใน DocLineTable (InputVatLineSelect)
// 🔴 client: import ได้เฉพาะไฟล์ pure
// ─────────────────────────────────────────────────────────────
import {
  defaultInputVatStatus,
  hasVendorTaxId,
  INPUT_VAT_NONCLAIM_REASONS,
  INPUT_VAT_STATUS_LABEL_TH,
  INPUT_VAT_STATUS_SHORT_TH,
  INPUT_VAT_STATUSES,
  inputVatWarnings,
  statusFromTreatment,
  type InputVatSettings,
  type InputVatStatus,
} from "@/lib/modules/account/input-vat-shared";
import type { DocTotalsLineOut } from "@/lib/modules/account/totals";
import type { LedgerOption, LineDraft } from "./doc-editor-types";
import { LegalWarnings } from "./LegalWarnings";

export function InputVatSection({
  docType,
  status,
  onChange,
  vendor,
  contactId,
  lines,
  breakdown,
  vatAmount,
  accounts,
  settings,
}: {
  docType: string;
  status: InputVatStatus | null;
  onChange: (s: InputVatStatus | null) => void;
  vendor: { name: string; taxId: string | null } | null;
  contactId: string | null;
  lines: LineDraft[];
  breakdown: DocTotalsLineOut[];
  vatAmount: number;
  accounts: LedgerOption[];
  settings: InputVatSettings;
}) {
  const def = defaultInputVatStatus({ vendorTaxId: vendor?.taxId ?? null, settings });
  const effective = status ?? def.status;
  const why = !contactId
    ? "ยังไม่ได้เลือกคู่ค้า"
    : hasVendorTaxId(vendor?.taxId)
      ? "คู่ค้ามีเลขประจำตัวผู้เสียภาษี"
      : "คู่ค้าไม่มีเลขประจำตัวผู้เสียภาษี";
  const treat = (id: string | null) => (id ? (accounts.find((a) => a.id === id)?.vatTreatment ?? null) : null);
  const warnings = inputVatWarnings(
    { docType, vatAmount, inputVatStatus: effective, vatMode: "EXCLUDE", contactId },
    lines.map((l, i) => {
      const fromAcc = statusFromTreatment(treat(l.accountId));
      return {
        description: l.name,
        amount: breakdown[i]?.net ?? 0,
        vatRateBp: l.vatRateBp,
        inputVatStatus: l.inputVatStatus ?? fromAcc?.status ?? null,
        inputVatReason: l.inputVatReason ?? (fromAcc?.status === "NO_CLAIM" && fromAcc.explicitReason ? fromAcc.reason : effective === "NO_CLAIM" && !status ? def.reason : null),
        accountTreatment: treat(l.accountId),
      };
    }),
    vendor,
  ).filter((w) => w.code !== "EXPENSE_PAYEE_MISSING"); // แสดงที่ช่องผู้ติดต่อแล้ว
  return (
    <div className="flex flex-col gap-2" data-testid="input-vat-section">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-[color:var(--color-muted)]">ภาษีซื้อของเอกสารนี้</span>
        <select
          className="input"
          value={status ?? ""}
          onChange={(e) => onChange((e.target.value || null) as InputVatStatus | null)}
          data-testid="input-vat-status"
        >
          <option value="">ตามค่าเริ่ม: {INPUT_VAT_STATUS_LABEL_TH[def.status]}</option>
          {INPUT_VAT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INPUT_VAT_STATUS_LABEL_TH[s]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-[color:var(--color-muted)]" data-testid="input-vat-hint">
        {status ? "ตั้งไว้ในเอกสาร" : `ค่าเริ่ม — ${why}`} ·{" "}
        {effective === "CLAIM"
          ? "ภาษีซื้อเข้าบัญชีภาษีซื้อ (ภ.พ.30 เดือนนี้)"
          : effective === "PENDING"
            ? "พักไว้ที่ภาษีซื้อรอใบกำกับ จนกว่าจะบันทึกรับใบกำกับภาษีซื้อ (ขึ้นในรายการรอรับ)"
            : "ลงบัญชีภาษีซื้อไม่ขอคืน — ไม่เข้า ภ.พ.30"}{" "}
        · บรรทัดที่บัญชีเป็นหมวดภาษีซื้อต้องห้ามตั้งเป็นเคลมไม่ได้ให้เอง (เปลี่ยนได้ที่บรรทัด)
      </p>
      <LegalWarnings warnings={warnings} testId="input-vat-warnings" />
    </div>
  );
}

/** ตัวเลือกสถานะต่อบรรทัด (ใต้ชื่อรายการ) + เหตุเมื่อเคลมไม่ได้ */
export function InputVatLineSelect({
  value,
  reason,
  inherited,
  onChange,
  testId,
}: {
  value: InputVatStatus | null;
  reason: string | null;
  /** สถานะที่บรรทัดจะได้ถ้าไม่เลือก (ธงบัญชี → ตามใบ) */
  inherited: { status: InputVatStatus; label: string };
  onChange: (v: { inputVatStatus: InputVatStatus | null; inputVatReason: string | null }) => void;
  testId?: string;
}) {
  const eff = value ?? inherited.status;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      <span className="text-[color:var(--color-muted)]">ภาษีซื้อ</span>
      <select
        className="input h-8 w-auto min-w-0 px-1 text-xs"
        value={value ?? ""}
        onChange={(e) => onChange({ inputVatStatus: (e.target.value || null) as InputVatStatus | null, inputVatReason: reason })}
        aria-label="สถานะภาษีซื้อของบรรทัด"
        data-testid={testId}
      >
        <option value="">{inherited.label}</option>
        {INPUT_VAT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INPUT_VAT_STATUS_SHORT_TH[s]}
          </option>
        ))}
      </select>
      {eff === "NO_CLAIM" && (
        <select
          className="input h-8 w-auto min-w-0 px-1 text-xs"
          value={reason ?? ""}
          onChange={(e) => onChange({ inputVatStatus: value, inputVatReason: e.target.value || null })}
          aria-label="เหตุที่เคลมไม่ได้"
          data-testid={testId ? `${testId}-reason` : undefined}
        >
          <option value="">— เหตุ (ไม่ระบุ) —</option>
          {INPUT_VAT_NONCLAIM_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.labelTh} ({r.sectionTh})
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
