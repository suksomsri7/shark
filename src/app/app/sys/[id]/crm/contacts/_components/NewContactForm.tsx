"use client";

// ฟอร์มเพิ่มผู้ติดต่อ (CRM v2 · ใบ C1.4 · §3.17) — ตรวจค่าในช่อง (inline ไม่ใช่ alert) ด้วยตัวตรวจชุดเดียวกับบริการ
// ผลลัพธ์: เบอร์/อีเมลซ้ำกับคนในระบบนี้ → กล่องบอก + ลิงก์คนเดิม + ปุ่ม "สร้างใหม่อยู่ดี" (ตั้งเป็นคู่สงสัยซ้ำ) · สำเร็จ → ไปหน้า 360

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CONTACT_SOURCES,
  CONTACT_SOURCE_LABEL,
  cleanTags,
  contactPhoneProblem,
  emailProblem,
  nameProblem,
  type DuplicateHit,
} from "@/lib/modules/crm/contacts-shared";
import { createContactAction, searchCompaniesAction } from "@/lib/modules/crm/contacts-actions";
import { ContactPicker } from "./ContactPicker";

type Opt = { id: string; name: string };
type CustomField = { key: string; label: string; type: string; required: boolean; choices: { value: string; label: string }[] };

const FIELDS = ["firstName", "lastName", "phone", "email", "jobTitle", "sourceKind", "ownerUserId", "tags"] as const;
type Key = (typeof FIELDS)[number];

const CHECK: Partial<Record<Key, (v: string) => string | null>> = {
  firstName: (v) => nameProblem(v, "ชื่อจริง", true),
  lastName: (v) => nameProblem(v, "นามสกุล", false),
  phone: contactPhoneProblem,
  email: emailProblem,
  tags: (v) => cleanTags(v.split(/[;,]/)).problem,
};

export function NewContactForm({ systemId, owners, defaultOwner, customFields }: { systemId: string; owners: Opt[]; defaultOwner: string; customFields: CustomField[] }) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/contacts`;
  const [values, setValues] = useState<Record<Key, string>>(() => ({ ...(Object.fromEntries(FIELDS.map((k) => [k, ""])) as Record<Key, string>), ownerUserId: defaultOwner, sourceKind: "CRM" }));
  const [companyId, setCompanyId] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dups, setDups] = useState<DuplicateHit[] | null>(null);
  const [pending, start] = useTransition();

  const set = (k: Key, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const blur = (k: Key) => {
    const p = CHECK[k]?.(values[k]) ?? null;
    setErrors((e) => ({ ...e, [k]: p ?? undefined }));
  };

  const send = (force: boolean) =>
    start(async () => {
      const next: Partial<Record<Key, string>> = {};
      for (const k of FIELDS) {
        const p = CHECK[k]?.(values[k]) ?? null;
        if (p) next[k] = p;
      }
      setErrors(next);
      setFormError(null);
      if (Object.keys(next).length > 0) return;
      const missing = customFields.find((f) => f.required && !String(custom[f.key] ?? "").trim());
      if (missing) {
        setFormError(`ช่อง "${missing.label}" เป็นข้อมูลที่ต้องกรอก`);
        return;
      }
      const fields: Record<string, unknown> = {};
      for (const f of customFields) {
        const v = String(custom[f.key] ?? "").trim();
        if (!v) continue;
        fields[f.key] = f.type === "NUMBER" ? Number(v) : f.type === "BOOLEAN" ? v === "true" : v;
      }
      const r = await createContactAction(systemId, {
        firstName: values.firstName,
        lastName: values.lastName || null,
        phone: values.phone || null,
        email: values.email || null,
        jobTitle: values.jobTitle || null,
        sourceKind: values.sourceKind || null,
        ownerUserId: values.ownerUserId || null,
        tags: values.tags ? values.tags.split(/[;,]/) : [],
        companyId: companyId || null,
        fields,
        force,
      });
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      if (!r.created) {
        setDups(r.duplicates);
        return;
      }
      router.push(`${base}/${r.id}${r.warnings.length ? "?warn=company" : ""}`);
    });

  const field = (k: Key, label: string, props: { type?: string; placeholder?: string; required?: boolean } = {}) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      <span>
        {label}
        {props.required && <span className="text-[color:var(--color-danger)]"> *</span>}
      </span>
      <input
        type={props.type ?? "text"}
        value={values[k]}
        onChange={(e) => set(k, e.target.value)}
        onBlur={() => blur(k)}
        placeholder={props.placeholder}
        className="input text-sm"
        aria-invalid={!!errors[k]}
        data-testid={`contact-new-${k}`}
      />
      {errors[k] && (
        <span className="text-xs text-[color:var(--color-danger)]" data-testid={`contact-new-${k}-error`}>
          {errors[k]}
        </span>
      )}
    </label>
  );

  return (
    <form
      className="card flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send(false);
      }}
      data-testid="contact-new-form"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field("firstName", "ชื่อจริง", { required: true, placeholder: "เช่น สมชาย" })}
        {field("lastName", "นามสกุล", { placeholder: "เช่น ธนพร" })}
        {field("phone", "เบอร์โทร", { type: "tel", placeholder: "0812345678" })}
        {field("email", "อีเมล", { type: "email", placeholder: "name@example.com" })}
        {field("jobTitle", "ตำแหน่ง", { placeholder: "เช่น ผู้จัดการฝ่ายจัดซื้อ" })}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ที่มา</span>
          <select value={values.sourceKind} onChange={(e) => set("sourceKind", e.target.value)} className="input text-sm" data-testid="contact-new-sourceKind">
            {CONTACT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {CONTACT_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ผู้ดูแล</span>
          <select value={values.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)} className="input text-sm" data-testid="contact-new-ownerUserId">
            <option value="">ให้ระบบเลือก (คนที่เพิ่ม)</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {field("tags", "แท็ก (คั่นด้วย , หรือ ;)", { placeholder: "เช่น vip, งานแฟร์" })}
      </div>
      <ContactPicker
        kind="company"
        label="บริษัท (พิมพ์ชื่อเพื่อค้นหา — ไม่บังคับ)"
        placeholder="พิมพ์ชื่อบริษัท"
        emptyLabel="— ยังไม่ผูกบริษัท —"
        value={companyId}
        onChange={setCompanyId}
        search={(q) => searchCompaniesAction(systemId, q)}
      />
      {customFields.length > 0 && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          {customFields.map((f) => (
            <label key={f.key} className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>
                {f.label}
                {f.required && <span className="text-[color:var(--color-danger)]"> *</span>}
              </span>
              {f.type === "SELECT" ? (
                <select value={custom[f.key] ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))} className="input text-sm" data-testid={`contact-new-f-${f.key}`}>
                  <option value="">—</option>
                  {f.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
                  value={custom[f.key] ?? ""}
                  onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
                  className="input text-sm"
                  data-testid={`contact-new-f-${f.key}`}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {formError && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="contact-new-error" role="alert">
          {formError}
        </p>
      )}
      {dups && dups.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-accent)" }} data-testid="contact-new-duplicates">
          <p className="font-medium">มีผู้ติดต่อในระบบนี้ที่เบอร์หรืออีเมลตรงกันอยู่แล้ว — ใช่คนเดียวกันไหม?</p>
          <ul className="flex flex-col gap-1">
            {dups.map((d) => (
              <li key={d.contactId}>
                <Link href={`${base}/${d.contactId}`} className="underline" data-testid="contact-new-duplicate-link">
                  {d.name}
                </Link>{" "}
                <span className="text-xs text-[color:var(--color-muted)]">({d.reason === "PHONE" ? "เบอร์ตรงกัน" : "อีเมลตรงกัน"})</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={() => send(true)} data-testid="contact-new-force">
              ไม่ใช่ — สร้างเป็นคนใหม่ (ตั้งเป็นคู่สงสัยซ้ำ)
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={base} className="btn btn-ghost text-sm" data-testid="contact-new-cancel">
          ยกเลิก
        </Link>
        <button type="submit" className="btn btn-primary text-sm" disabled={pending} data-testid="contact-new-submit">
          {pending ? "กำลังบันทึก…" : "บันทึกผู้ติดต่อ"}
        </button>
      </div>
    </form>
  );
}
