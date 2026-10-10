"use client";

// ฟอร์มเพิ่มบริษัท (CRM v2 · ใบ C1.3 · §3.17) — ตรวจค่าในช่อง (inline ไม่ใช่ alert) ด้วยตัวตรวจชุดเดียวกับบริการ
// ผลลัพธ์: ซ้ำเลขภาษี → กล่องบอก + ลิงก์บริษัทเดิม · ชื่อคล้าย/โดเมนเดียวกัน → สร้างแล้ว + รายชื่อ "อาจซ้ำ" ให้ตรวจ

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_REASON_MIN,
  COMPANY_SIZES,
  COMPANY_SIZE_LABEL,
  DUPLICATE_REASON_LABEL,
  branchCodeProblem,
  emailDomainProblem,
  emailProblem,
  phoneProblem,
  taxIdProblem,
  websiteProblem,
  type CompanyCandidate,
} from "@/lib/modules/crm/companies-shared";
import { createCompanyAction, restoreCompanyAction, searchCompanyOptionsAction } from "@/lib/modules/crm/companies-actions";
import { ServerPicker } from "./ServerPicker";
import { FieldError, useFieldErrors } from "@/components/crm/form/field-errors";

type Opt = { id: string; name: string };
type CustomField = { key: string; label: string; type: string; required: boolean; choices: { value: string; label: string }[] };

const FIELDS = ["name", "taxId", "branchCode", "industry", "size", "website", "emailDomain", "phone", "email", "ownerUserId", "parentCompanyId", "note"] as const;
type Key = (typeof FIELDS)[number];

const CHECK: Partial<Record<Key, (v: string) => string | null>> = {
  name: (v) => (v.trim() ? null : "ใส่ชื่อบริษัทก่อนบันทึก"),
  taxId: taxIdProblem,
  branchCode: branchCodeProblem,
  website: websiteProblem,
  emailDomain: emailDomainProblem,
  phone: phoneProblem,
  email: emailProblem,
};

export function NewCompanyForm({ systemId, owners, defaultOwner, customFields }: { systemId: string; owners: Opt[]; defaultOwner: string; customFields: CustomField[] }) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/companies`;
  const [values, setValues] = useState<Record<Key, string>>(() => ({ ...(Object.fromEntries(FIELDS.map((k) => [k, ""])) as Record<Key, string>), ownerUserId: defaultOwner }));
  const [custom, setCustom] = useState<Record<string, string>>({});
  // C4.3-fix part 2 ▸ ข้อความใต้ช่อง + โฟกัสช่องแรกที่ผิด (แบบแผนเดียวของฟอร์ม CRM) ◂
  //   ช่องข้อมูลเพิ่มเติม (custom) ต่อท้ายลำดับ — key `cf:<fieldKey>` (reviewer S2: ช่องบังคับที่ว่างบอกใต้ช่องนั้น + โฟกัส)
  const fe = useFieldErrors<string>([...FIELDS, ...customFields.map((f) => `cf:${f.key}`)]);
  const errors = fe.errors;
  const [formError, setFormError] = useState<string | null>(null);
  const [dup, setDup] = useState<{ id: string; archived: boolean } | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; candidates: CompanyCandidate[] } | null>(null);
  const [pending, start] = useTransition();

  const set = (k: Key, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    fe.clear(k);
  };
  // ตรวจตอนออกจากช่อง: เพิ่ม/ลบข้อความของช่องนี้ช่องเดียว (ไม่ย้ายโฟกัส — ผู้ใช้กำลังไปช่องถัดไป)
  // 🔴 ช่องว่าง = ไม่บอกตอน blur (บอกตอนกดบันทึก): ข้อความที่โผล่ตอน blur ดันปุ่มบันทึกลง ⇒ คลิกที่กดลงไปแล้วหลุดปุ่ม
  //    (mousedown → blur → ข้อความเกิด → mouseup นอกปุ่ม = ไม่มี submit · C4.3-fix part 2 จับได้ด้วย oracle b)
  const blur = (k: Key) => {
    if (!values[k].trim()) return fe.clear(k);
    const p = CHECK[k]?.(values[k]) ?? null;
    if (!p) fe.clear(k);
    else if (errors[k] !== p) fe.set(k, p);
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const next: Partial<Record<Key, string>> = {};
    for (const k of FIELDS) {
      const p = CHECK[k]?.(values[k]) ?? null;
      if (p) next[k] = p;
    }
    setFormError(null);
    setDup(null);
    const all: Record<string, string> = { ...(next as Record<string, string>) };
    for (const f of customFields) if (f.required && !String(custom[f.key] ?? "").trim()) all[`cf:${f.key}`] = `ช่อง "${f.label}" เป็นข้อมูลที่ต้องกรอก`;
    if (fe.show(all)) return;
    const fields: Record<string, unknown> = {};
    for (const f of customFields) {
      const raw = custom[f.key];
      if (raw === undefined || raw === "") continue;
      fields[f.key] = f.type === "NUMBER" ? Number(raw) : f.type === "BOOLEAN" ? raw === "true" : raw;
    }
    start(async () => {
      const r = await createCompanyAction(systemId, {
        name: values.name,
        taxId: values.taxId || null,
        branchCode: values.branchCode || null,
        industry: values.industry || null,
        size: values.size || null,
        website: values.website || null,
        emailDomain: values.emailDomain || null,
        phone: values.phone || null,
        email: values.email || null,
        ownerUserId: values.ownerUserId || null,
        parentCompanyId: values.parentCompanyId || null,
        note: values.note || null,
        ...(Object.keys(fields).length ? { fields } : {}),
      });
      if (!r.ok) {
        if (r.code === "DUPLICATE" && r.duplicateOf) setDup({ id: r.duplicateOf, archived: false });
        else if (!fe.show(r.fieldErrors)) setFormError(r.error);
        return;
      }
      if (!r.created && r.duplicateOf) {
        setDup({ id: r.duplicateOf, archived: r.duplicateArchived });
        return;
      }
      if (r.candidates.length > 0) {
        setCreated({ id: r.id, candidates: r.candidates });
        return;
      }
      router.push(`${base}/${r.id}`);
    });
  };

  if (created) {
    return (
      <div className="card flex flex-col gap-3 p-4" data-testid="company-new-candidates">
        <p className="font-semibold">เพิ่มบริษัทแล้ว — มีบริษัทที่อาจเป็นรายเดียวกัน</p>
        <p className="text-sm text-[color:var(--color-muted)]">ระบบไม่ได้รวมให้อัตโนมัติ ลองเปิดดูแล้วใช้เมนู &quot;รวมบริษัท&quot; ในหน้าบริษัท ถ้าเป็นรายเดียวกันจริง</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {created.candidates.map((c) => (
            <li key={c.companyId} className="flex flex-wrap items-center gap-2">
              <Link href={`${base}/${c.companyId}`} className="underline" data-testid="company-new-candidate-link">
                {c.name}
              </Link>
              <span className="rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">{DUPLICATE_REASON_LABEL[c.reason]}</span>
            </li>
          ))}
        </ul>
        <div>
          <Link href={`${base}/${created.id}`} className="btn btn-primary text-sm" data-testid="company-new-open-created">
            ไปหน้าบริษัทที่เพิ่ม
          </Link>
        </div>
      </div>
    );
  }

  const field = (k: Key, label: string, opts: { required?: boolean; placeholder?: string; hint?: string; type?: string; inputMode?: "numeric" | "email" | "tel" | "url" } = {}) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      <span>
        {label}
        {opts.required && <span className="text-[color:var(--color-danger)]"> *</span>}
      </span>
      <input
        name={k}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        value={values[k]}
        placeholder={opts.placeholder}
        onChange={(e) => set(k, e.target.value)}
        onBlur={() => blur(k)}
        {...fe.field(k)}
        className="input text-sm"
        data-testid={`company-new-${k}`}
      />
      {opts.hint && !errors[k] && <span>{opts.hint}</span>}
      <FieldError id={fe.errorId(k)} message={errors[k]} testid={`company-new-${k}-error`} />
    </label>
  );

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-4" data-testid="company-new-form" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{field("name", "ชื่อบริษัท", { required: true, placeholder: "เช่น บริษัท ไทยทัวร์เอเชีย จำกัด" })}</div>
        {field("taxId", "เลขประจำตัวผู้เสียภาษี", { placeholder: "13 หลัก", inputMode: "numeric", hint: "มีเลขภาษี = ระบบกันบริษัทซ้ำให้แน่นอน" })}
        {field("branchCode", "รหัสสาขา", { placeholder: "00000 = สำนักงานใหญ่", inputMode: "numeric" })}
        {field("industry", "อุตสาหกรรม", { placeholder: "เช่น ท่องเที่ยว/ทัวร์" })}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ขนาดกิจการ</span>
          <select value={values.size} onChange={(e) => set("size", e.target.value)} className="input text-sm" data-testid="company-new-size">
            <option value="">ไม่ระบุ</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {COMPANY_SIZE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {field("website", "เว็บไซต์", { placeholder: "https://", inputMode: "url" })}
        {field("emailDomain", "โดเมนอีเมล", { placeholder: "example.co.th", hint: "ใช้จับคู่อีเมลของพนักงานบริษัทนี้" })}
        {field("phone", "เบอร์โทร", { inputMode: "tel" })}
        {field("email", "อีเมลกลาง", { inputMode: "email" })}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผู้ดูแล</span>
          <select value={values.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)} className="input text-sm" data-testid="company-new-owner">
            <option value="">ยังไม่กำหนด</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <ServerPicker
          kind="newparent"
          label="บริษัทแม่ (ถ้าเป็นบริษัทในเครือ)"
          placeholder="พิมพ์ชื่อหรือเลขภาษีเพื่อค้นหา"
          emptyLabel="ไม่มี"
          value={values.parentCompanyId}
          onChange={(v) => set("parentCompanyId", v)}
          search={(q) => searchCompanyOptionsAction(systemId, null, q)}
        />
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
          <span>โน้ต</span>
          <textarea value={values.note} onChange={(e) => set("note", e.target.value)} rows={3} className="input text-sm" data-testid="company-new-note" />
        </label>
      </div>

      {customFields.length > 0 && (
        <fieldset className="grid gap-3 border-t pt-3 sm:grid-cols-2" data-testid="company-new-custom">
          <legend className="text-sm font-semibold">ข้อมูลเพิ่มเติม</legend>
          {customFields.map((f) => (
            <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>
                {f.label}
                {f.required && <span className="text-[color:var(--color-danger)]"> *</span>}
              </span>
              {f.type === "SELECT" ? (
                <select value={custom[f.key] ?? ""} onChange={(e) => {
                    setCustom((s) => ({ ...s, [f.key]: e.target.value }));
                    fe.clear(`cf:${f.key}`);
                  }}
                  {...fe.field(`cf:${f.key}`)} className="input text-sm" data-testid="company-new-field-select">
                  <option value="">ไม่ระบุ</option>
                  {f.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "BOOLEAN" ? (
                <select value={custom[f.key] ?? ""} onChange={(e) => {
                    setCustom((s) => ({ ...s, [f.key]: e.target.value }));
                    fe.clear(`cf:${f.key}`);
                  }}
                  {...fe.field(`cf:${f.key}`)} className="input text-sm" data-testid="company-new-field-bool">
                  <option value="">ไม่ระบุ</option>
                  <option value="true">ใช่</option>
                  <option value="false">ไม่ใช่</option>
                </select>
              ) : f.type === "LONG_TEXT" ? (
                <textarea value={custom[f.key] ?? ""} onChange={(e) => {
                    setCustom((s) => ({ ...s, [f.key]: e.target.value }));
                    fe.clear(`cf:${f.key}`);
                  }}
                  {...fe.field(`cf:${f.key}`)} rows={2} className="input text-sm" data-testid="company-new-field-textarea" />
              ) : (
                <input
                  type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
                  value={custom[f.key] ?? ""}
                  onChange={(e) => {
                    setCustom((s) => ({ ...s, [f.key]: e.target.value }));
                    fe.clear(`cf:${f.key}`);
                  }}
                  {...fe.field(`cf:${f.key}`)}
                  className="input text-sm"
                  data-testid="company-new-field-input"
                />
              )}
              <FieldError id={fe.errorId(`cf:${f.key}`)} message={fe.errors[`cf:${f.key}`]} testid={`company-new-f-${f.key}-error`} />
            </label>
          ))}
        </fieldset>
      )}

      {dup && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-danger)" }} data-testid="company-new-duplicate">
          <span>
            {dup.archived ? "เลขภาษีนี้เป็นของบริษัทที่เคยเก็บถาวรไว้ในระบบนี้ — ไม่ได้สร้างซ้ำ" : "เลขภาษีนี้มีบริษัทอยู่แล้วในระบบนี้ — ไม่ได้สร้างซ้ำ"}{" "}
            <Link href={`${base}/${dup.id}`} className="underline" data-testid="company-new-duplicate-link">
              เปิดบริษัทเดิม
            </Link>
          </span>
          {dup.archived && (
            <div className="flex flex-col gap-2 border-t pt-2" data-testid="company-new-restore">
              <span className="font-semibold">กู้คืนบริษัทนี้</span>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                <span>เหตุผล (อย่างน้อย {COMPANY_REASON_MIN} ตัวอักษร)</span>
                <input value={restoreReason} onChange={(e) => setRestoreReason(e.target.value)} className="input text-sm" placeholder="เช่น ลูกค้ากลับมาใช้บริการ" data-testid="company-new-restore-reason" />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.checked)} data-testid="company-new-restore-confirm" />
                ยืนยันกู้คืนบริษัทเดิม
              </label>
              {restoreError && <span className="text-xs text-[color:var(--color-danger)]">{restoreError}</span>}
              <div>
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  data-testid="company-new-restore-submit"
                  disabled={pending || !restoreConfirm || restoreReason.trim().length < COMPANY_REASON_MIN}
                  onClick={() =>
                    start(async () => {
                      setRestoreError(null);
                      const r = await restoreCompanyAction(systemId, dup.id, restoreConfirm, restoreReason);
                      if (!r.ok) {
                        setRestoreError(r.error);
                        return;
                      }
                      router.push(`${base}/${dup.id}`);
                    })
                  }
                >
                  กู้คืนบริษัทนี้
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {formError && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="company-new-error">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={base} className="btn btn-ghost text-sm" data-testid="company-new-cancel">
          ยกเลิก
        </Link>
        <button type="submit" className="btn btn-primary text-sm" disabled={pending} data-testid="company-new-submit">
          {pending ? "กำลังบันทึก…" : "บันทึกบริษัท"}
        </button>
      </div>
    </form>
  );
}
