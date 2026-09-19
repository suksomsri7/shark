"use client";

// ปุ่มของหน้าบริษัท 360 (CRM v2 · ใบ C1.3 · ภาพ 04): เพิ่มผู้ติดต่อ · ปุ่มในแถวผู้ติดต่อ (ตั้งหลัก/บทบาท/ถอด) ·
// เมนู "…" (แก้ไข · ผู้ดูแล · บริษัทแม่ · รวมบริษัท · เก็บถาวร)
// 🔴 การกระทำอันตราย (รวม · เก็บถาวร) = ติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร (X9) · ข้อความผิดพลาดแสดงในกล่อง ไม่ใช้ alert()

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_CONTACT_ROLES,
  COMPANY_CONTACT_ROLE_LABEL,
  COMPANY_REASON_MIN,
  // CRM C1.11 ▸ เลือกค่าต่อฟิลด์ตอนรวม ◂
  MERGE_CHOICE_FIELDS,
  MERGE_CHOICE_LABEL,
  COMPANY_SIZES,
  COMPANY_SIZE_LABEL,
  emailDomainProblem,
  emailProblem,
  phoneProblem,
  taxIdProblem,
  websiteProblem,
  type CompanyDto,
} from "@/lib/modules/crm/companies-shared";
import {
  addContactAction,
  archiveCompanyAction,
  mergeCompaniesAction,
  companyMergeValuesAction,
  removeContactAction,
  setOwnerAction,
  setParentAction,
  setPrimaryAction,
  searchCompanyOptionsAction,
  searchContactOptionsAction,
  setRoleAction,
  updateCompanyAction,
} from "@/lib/modules/crm/companies-actions";
import { ServerPicker } from "./ServerPicker";
// CRM C1.11 ▸ เลือกค่าต่อฟิลด์ตอนรวม ◂
import { MergeFieldChoices, choosableFields, toFieldChoices } from "@/components/crm/merge/MergeFieldChoices";

type Opt = { id: string; name: string };

function Sheet({ label, testid, onClose, children }: { label: string; testid: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => (e.target === e.currentTarget ? onClose() : undefined)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testid}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
      >
        <h2 className="text-base font-semibold">{label}</h2>
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ text, testid }: { text: string | null; testid: string }) {
  if (!text) return null;
  return (
    <p className="text-sm text-[color:var(--color-danger)]" data-testid={testid}>
      {text}
    </p>
  );
}

// ───────────────────────── เพิ่มผู้ติดต่อ ─────────────────────────

export function AddContactButton({ systemId, companyId, disabled }: { systemId: string; companyId: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState("OTHER");
  const [jobTitle, setJobTitle] = useState("");
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      if (!contactId) {
        setError("เลือกผู้ติดต่อก่อน");
        return;
      }
      const r = await addContactAction(systemId, companyId, { contactId, role, jobTitle: jobTitle || null, isPrimary: primary });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setContactId("");
      setJobTitle("");
      setPrimary(false);
      router.refresh();
    });
  return (
    <>
      <button type="button" className="btn btn-ghost text-sm" data-testid="company-add-contact-btn" disabled={disabled} onClick={() => setOpen(true)}>
        + เพิ่มผู้ติดต่อ
      </button>
      {open && (
        <Sheet label="เพิ่มผู้ติดต่อเข้าบริษัท" testid="company-add-contact-modal" onClose={() => setOpen(false)}>
          <>
              <ServerPicker
                kind="contact"
                label="ผู้ติดต่อ (พิมพ์ชื่อเพื่อค้นหา)"
                placeholder="พิมพ์ชื่อผู้ติดต่อ"
                emptyLabel="— เลือกผู้ติดต่อ —"
                value={contactId}
                onChange={setContactId}
                search={(q) => searchContactOptionsAction(systemId, companyId, q)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  <span>บทบาท</span>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="input text-sm" data-testid="company-add-contact-role">
                    {COMPANY_CONTACT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {COMPANY_CONTACT_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  <span>ตำแหน่ง</span>
                  <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="input text-sm" placeholder="เช่น ฝ่ายจัดซื้อ" data-testid="company-add-contact-jobtitle" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} data-testid="company-add-contact-primary" />
                ตั้งเป็นผู้ติดต่อหลักของบริษัท
              </label>
          </>
          <ErrorLine text={error} testid="company-add-contact-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" data-testid="company-add-contact-cancel" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" data-testid="company-add-contact-submit" disabled={pending || !contactId} onClick={submit}>
              {pending ? "กำลังบันทึก…" : "เพิ่ม"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── ตารางผู้ติดต่อ (ภาพ 04: ชื่อ · ตำแหน่ง · บทบาท · หลัก · ช่องทาง) ─────────────────────────
// แถวเดียวต่อคน: จอกว้าง = กริดคอลัมน์แบบตาราง · มือถือ = ซ้อนลงเป็นการ์ด (ไม่มี element ซ้ำสองชุด → testid ไม่ซ้ำ)

export type ContactRowView = { contactId: string; name: string; jobTitle: string | null; role: string; isPrimary: boolean; channelLabel: string | null };

const GRID = "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_150px_56px_80px_88px] md:items-center md:gap-3";

export function CompanyContactsTable({ systemId, companyId, rows, disabled }: { systemId: string; companyId: string; rows: ContactRowView[]; disabled?: boolean }) {
  return (
    <div className="flex flex-col border-t">
      <div className={`hidden bg-[color:var(--color-surface-2)] px-4 py-2 text-xs text-[color:var(--color-muted)] ${GRID}`}>
        <span>ชื่อ</span>
        <span>ตำแหน่ง</span>
        <span>บทบาท</span>
        <span className="text-center">หลัก</span>
        <span>ช่องทาง</span>
        <span />
      </div>
      {rows.map((r) => (
        <ContactRow key={r.contactId} systemId={systemId} companyId={companyId} row={r} disabled={disabled} />
      ))}
    </div>
  );
}

function ContactRow({ systemId, companyId, row, disabled }: { systemId: string; companyId: string; row: ContactRowView; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmRemove(false);
      router.refresh();
    });
  return (
    <div className={`flex flex-col gap-1.5 border-b px-4 py-2.5 last:border-b-0 ${GRID}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs" aria-hidden>
          {row.name.trim().slice(0, 1) || "?"}
        </span>
        <span className="min-w-0 break-words text-sm font-semibold">{row.name}</span>
      </div>
      <span className="min-w-0 break-words text-xs text-[color:var(--color-muted)] md:text-sm md:text-[color:var(--color-ink)]">{row.jobTitle ?? "—"}</span>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <select
          aria-label={`บทบาทของ ${row.name}`}
          value={row.role}
          disabled={disabled || pending}
          onChange={(e) => run(() => setRoleAction(systemId, companyId, row.contactId, e.target.value))}
          className="input w-auto py-1 text-xs"
          data-testid="company-contact-role-select"
        >
          {COMPANY_CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>
              {COMPANY_CONTACT_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <span className="md:text-center">
          <button
            type="button"
            className="rounded px-1.5 text-base leading-none"
            aria-label={row.isPrimary ? `${row.name} เป็นผู้ติดต่อหลัก` : `ตั้ง ${row.name} เป็นผู้ติดต่อหลัก`}
            title={row.isPrimary ? "ผู้ติดต่อหลัก" : "ตั้งเป็นผู้ติดต่อหลัก"}
            data-testid="company-contact-primary-btn"
            disabled={disabled || pending || row.isPrimary}
            onClick={() => run(() => setPrimaryAction(systemId, companyId, row.contactId))}
            style={{ color: row.isPrimary ? "var(--color-accent)" : "var(--color-muted)" }}
          >
            {row.isPrimary ? "★" : "☆"}
          </button>
        </span>
        <span className="text-xs text-[color:var(--color-muted)] md:text-sm">{row.channelLabel ?? "—"}</span>
        <span className="flex items-center gap-1 md:justify-end">
          {confirmRemove ? (
            <>
              <button type="button" className="btn btn-ghost px-2 py-1 text-xs" style={{ color: "var(--color-danger)" }} data-testid="company-contact-remove-confirm" disabled={pending} onClick={() => run(() => removeContactAction(systemId, companyId, row.contactId))}>
                ยืนยัน
              </button>
              <button type="button" className="btn btn-ghost px-2 py-1 text-xs" data-testid="company-contact-remove-cancel" onClick={() => setConfirmRemove(false)}>
                ไม่
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost px-2 py-1 text-xs" aria-label={`ถอด ${row.name} ออกจากบริษัท`} data-testid="company-contact-remove-btn" disabled={disabled || pending} onClick={() => setConfirmRemove(true)}>
              ถอด
            </button>
          )}
        </span>
      </div>
      {error && <span className="text-xs text-[color:var(--color-danger)] md:col-span-6">{error}</span>}
    </div>
  );
}

// ───────────────────────── เมนู "…" ─────────────────────────

type Mode = null | "edit" | "owner" | "parent" | "merge" | "archive";

export function CompanyMenu({ systemId, company, owners, parent: currentParent }: { systemId: string; company: CompanyDto; owners: Opt[]; parent: Opt | null }) {
  const router = useRouter();
  const base = `/app/sys/${systemId}/crm/companies`;
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const live = !company.archivedAt && !company.mergedIntoId;
  // CRM C1.11 ▸ ฟิลด์ที่ให้ใช้ค่าของบริษัทที่ถูกรวมแทน (fieldChoices = "merge") ◂
  const [takeOther, setTakeOther] = useState<Record<string, boolean>>({});

  // แก้ไข
  const [edit, setEdit] = useState(() => ({
    name: company.name,
    taxId: company.taxId ?? "",
    industry: company.industry ?? "",
    size: company.size ?? "",
    website: company.website ?? "",
    emailDomain: company.emailDomain ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    note: company.note ?? "",
  }));
  const [editErr, setEditErr] = useState<Record<string, string>>({});
  // ผู้ดูแล / บริษัทแม่
  const [owner, setOwner] = useState(company.ownerUserId ?? "");
  const [parent, setParent] = useState(company.parentCompanyId ?? "");
  // รวม / เก็บถาวร
  const [other, setOther] = useState("");
  const [keepThis, setKeepThis] = useState(true);
  // CRM C1.11 ▸ (รีวิว SF-5) ค่าของทั้งสองบริษัท (ผ่านการมองเห็น) — เสนอเฉพาะฟิลด์ที่อีกฝั่งมีค่าและต่างกัน ◂
  const [coVals, setCoVals] = useState<Record<string, Record<string, string | null>> | null>(null);
  useEffect(() => {
    setTakeOther({});
    setCoVals(null);
    if (!other) return;
    let live = true;
    void companyMergeValuesAction(systemId, company.id, other).then((r) => {
      if (!live || !r.ok) return;
      if (r.items.length === 2) setCoVals(Object.fromEntries(r.items.map((x) => [x.id, x.values])));
    });
    return () => {
      live = false;
    };
  }, [systemId, company.id, other]);
  const coFieldList = MERGE_CHOICE_FIELDS.map((f) => ({ key: f, label: MERGE_CHOICE_LABEL[f] }));
  const coKeep = coVals ? coVals[keepThis ? company.id : other] ?? null : null;
  const coOther = coVals ? coVals[keepThis ? other : company.id] ?? null : null;
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");

  const openMode = (m: Mode) => {
    setMenu(false);
    setError(null);
    setConfirm(false);
    setReason("");
    setMode(m);
  };
  const close = () => setMode(null);
  const done = (href?: string) => {
    setMode(null);
    if (href) router.push(href);
    else router.refresh();
  };

  const saveEdit = () => {
    const errs: Record<string, string> = {};
    if (!edit.name.trim()) errs.name = "ใส่ชื่อบริษัทก่อนบันทึก";
    const checks: [string, string | null][] = [
      ["taxId", taxIdProblem(edit.taxId)],
      ["website", websiteProblem(edit.website)],
      ["emailDomain", emailDomainProblem(edit.emailDomain)],
      ["phone", phoneProblem(edit.phone)],
      ["email", emailProblem(edit.email)],
    ];
    for (const [k, p] of checks) if (p) errs[k] = p;
    setEditErr(errs);
    if (Object.keys(errs).length) return;
    start(async () => {
      setError(null);
      const r = await updateCompanyAction(systemId, company.id, {
        name: edit.name,
        taxId: edit.taxId || null,
        industry: edit.industry || null,
        size: edit.size || null,
        website: edit.website || null,
        emailDomain: edit.emailDomain || null,
        phone: edit.phone || null,
        email: edit.email || null,
        note: edit.note || null,
      });
      if (!r.ok) setError(r.error);
      else done();
    });
  };

  const reasonShort = reason.trim().length < COMPANY_REASON_MIN;

  const editInput = (k: keyof typeof edit, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      <span>{label}</span>
      <input value={edit[k]} onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))} className="input text-sm" aria-invalid={!!editErr[k]} data-testid={`company-edit-${k}`} />
      {editErr[k] && <span className="text-[color:var(--color-danger)]">{editErr[k]}</span>}
    </label>
  );

  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost px-3 text-sm" aria-label="เมนูเพิ่มเติมของบริษัท" aria-expanded={menu} data-testid="company-menu-btn" onClick={() => setMenu((v) => !v)}>
        …
      </button>
      {menu && (
        <div className="absolute right-0 z-40 mt-1 flex w-52 flex-col rounded-xl border bg-[color:var(--color-surface)] p-1 text-sm shadow-lg" role="menu" data-testid="company-menu">
          <button type="button" role="menuitem" className="rounded-lg px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" data-testid="company-menu-edit" disabled={!live} onClick={() => openMode("edit")}>
            แก้ไขข้อมูลบริษัท
          </button>
          <button type="button" role="menuitem" className="rounded-lg px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" data-testid="company-menu-owner" disabled={!live} onClick={() => openMode("owner")}>
            เปลี่ยนผู้ดูแล
          </button>
          <button type="button" role="menuitem" className="rounded-lg px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" data-testid="company-menu-parent" disabled={!live} onClick={() => openMode("parent")}>
            ตั้งบริษัทแม่
          </button>
          <button type="button" role="menuitem" className="rounded-lg px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" data-testid="company-menu-merge" disabled={!live} onClick={() => openMode("merge")}>
            รวมกับบริษัทที่ซ้ำ
          </button>
          <button type="button" role="menuitem" className="rounded-lg px-3 py-2 text-left hover:bg-[color:var(--color-surface-2)]" style={{ color: "var(--color-danger)" }} data-testid="company-menu-archive" disabled={!live} onClick={() => openMode("archive")}>
            เก็บถาวร
          </button>
        </div>
      )}

      {mode === "edit" && (
        <Sheet label="แก้ไขข้อมูลบริษัท" testid="company-edit-modal" onClose={close}>
          {editInput("name", "ชื่อบริษัท *")}
          {editInput("taxId", "เลขประจำตัวผู้เสียภาษี")}
          <div className="grid gap-3 sm:grid-cols-2">
            {editInput("industry", "อุตสาหกรรม")}
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>ขนาดกิจการ</span>
              <select value={edit.size} onChange={(e) => setEdit((s) => ({ ...s, size: e.target.value }))} className="input text-sm" data-testid="company-edit-size">
                <option value="">ไม่ระบุ</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {COMPANY_SIZE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {editInput("website", "เว็บไซต์")}
          {editInput("emailDomain", "โดเมนอีเมล")}
          <div className="grid gap-3 sm:grid-cols-2">
            {editInput("phone", "เบอร์โทร")}
            {editInput("email", "อีเมลกลาง")}
          </div>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>โน้ต</span>
            <textarea value={edit.note} onChange={(e) => setEdit((s) => ({ ...s, note: e.target.value }))} rows={3} className="input text-sm" data-testid="company-edit-note" />
          </label>
          <ErrorLine text={error} testid="company-edit-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" data-testid="company-edit-cancel" onClick={close}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" data-testid="company-edit-submit" disabled={pending} onClick={saveEdit}>
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </Sheet>
      )}

      {mode === "owner" && (
        <Sheet label="เปลี่ยนผู้ดูแลบริษัท" testid="company-owner-modal" onClose={close}>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ผู้ดูแล</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input text-sm" data-testid="company-owner-select">
              <option value="">ยังไม่กำหนด</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <ErrorLine text={error} testid="company-owner-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" data-testid="company-owner-cancel" onClick={close}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              data-testid="company-owner-submit"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setOwnerAction(systemId, company.id, owner || null);
                  if (!r.ok) setError(r.error);
                  else done();
                })
              }
            >
              บันทึก
            </button>
          </div>
        </Sheet>
      )}

      {mode === "parent" && (
        <Sheet label="ตั้งบริษัทแม่ (บริษัทในเครือ)" testid="company-parent-modal" onClose={close}>
          <ServerPicker
            kind="parent"
            label="บริษัทแม่ (พิมพ์ชื่อหรือเลขภาษีเพื่อค้นหา)"
            placeholder="พิมพ์ชื่อบริษัท"
            emptyLabel="ไม่มี (เป็นบริษัทอิสระ)"
            value={parent}
            onChange={setParent}
            pinned={currentParent}
            search={(q) => searchCompanyOptionsAction(systemId, company.id, q)}
          />
          <ErrorLine text={error} testid="company-parent-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" data-testid="company-parent-cancel" onClick={close}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              data-testid="company-parent-submit"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setParentAction(systemId, company.id, parent || null);
                  if (!r.ok) setError(r.error);
                  else done();
                })
              }
            >
              บันทึก
            </button>
          </div>
        </Sheet>
      )}

      {mode === "merge" && (
        <Sheet label="รวมกับบริษัทที่ซ้ำ" testid="company-merge-modal" onClose={close}>
          <p className="text-xs text-[color:var(--color-muted)]">
            ผู้ติดต่อ ดีล กิจกรรม เอกสารบัญชี และรายการที่ผูกไว้ของบริษัทที่ถูกรวมจะย้ายไปอยู่กับบริษัทที่เก็บไว้ · บริษัทที่ถูกรวมจะถูกเก็บถาวร (ไม่ลบ) · ย้อนกลับเองไม่ได้
          </p>
          <ServerPicker
            kind="merge"
            label={`บริษัทที่ซ้ำกับ "${company.name}" (พิมพ์ชื่อหรือเลขภาษีเพื่อค้นหา)`}
            placeholder="พิมพ์ชื่อบริษัท"
            emptyLabel="— เลือกบริษัท —"
            value={other}
            onChange={setOther}
            search={(q) => searchCompanyOptionsAction(systemId, company.id, q)}
          />
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 text-xs text-[color:var(--color-muted)]">เก็บบริษัทไหนไว้</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="keep" checked={keepThis} onChange={() => { setKeepThis(true); setTakeOther({}); }} data-testid="company-merge-keep-this" />
              เก็บบริษัทนี้ (&quot;{company.name}&quot;)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="keep" checked={!keepThis} onChange={() => { setKeepThis(false); setTakeOther({}); }} data-testid="company-merge-keep-other" />
              เก็บบริษัทที่เลือก
            </label>
          </fieldset>
          {/* CRM C1.11 ▸ เลือกค่าต่อฟิลด์ (ไม่ติ๊ก = ค่าของบริษัทที่เก็บไว้ · ช่องว่างเติมจากอีกบริษัทให้เอง) ◂ */}
          {coKeep && coOther && (
            <MergeFieldChoices fields={coFieldList} keepLabel="บริษัทที่เก็บไว้" otherLabel="บริษัทที่ถูกรวม" keep={coKeep} other={coOther} value={takeOther} onChange={setTakeOther} />
          )}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เหตุผล (อย่างน้อย {COMPANY_REASON_MIN} ตัวอักษร)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" placeholder="เช่น จดทะเบียนซ้ำ บริษัทเดียวกัน" data-testid="company-merge-reason" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="company-merge-confirm" />
            ยืนยันรวมสองบริษัทนี้
          </label>
          <ErrorLine text={error} testid="company-merge-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" data-testid="company-merge-cancel" onClick={close}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              style={{ background: "var(--color-danger)" }}
              data-testid="company-merge-submit"
              disabled={pending || !other || !confirm || reasonShort}
              onClick={() =>
                start(async () => {
                  const fieldChoices = coKeep && coOther ? toFieldChoices(takeOther, choosableFields(coFieldList, coKeep, coOther)) : {}; // CRM C1.11 ◂
                  const r = await mergeCompaniesAction(systemId, { keepId: keepThis ? company.id : other, mergeId: keepThis ? other : company.id, confirm, reason, fieldChoices });
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  // ผลของขั้นหลัง commit (เอกสารบัญชี/รายการที่ผูก) แสดงเป็นแถบบนหน้าบริษัทที่เก็บไว้ (รีวิว SF10)
                  const flag = r.accountMergeSkipped ? "&acct=skipped" : r.accountMergeFailed ? "&acct=failed" : r.warnings.length ? "&acct=warn" : "";
                  done(`${base}/${r.keptId}?merged=1${flag}`);
                })
              }
            >
              {pending ? "กำลังรวม…" : "รวมบริษัท"}
            </button>
          </div>
        </Sheet>
      )}

      {mode === "archive" && (
        <Sheet label="เก็บถาวรบริษัทนี้" testid="company-archive-modal" onClose={close}>
          <p className="text-xs text-[color:var(--color-muted)]">บริษัทจะหายจากรายการปกติ (ดูได้ด้วยตัวกรอง &quot;รวมที่เก็บถาวร&quot;) · ดีล เอกสาร และประวัติยังอยู่ครบ</p>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เหตุผล (อย่างน้อย {COMPANY_REASON_MIN} ตัวอักษร)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" placeholder="เช่น ลูกค้าเลิกกิจการ" data-testid="company-archive-reason" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="company-archive-confirm" />
            ยืนยันเก็บถาวร
          </label>
          <ErrorLine text={error} testid="company-archive-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" data-testid="company-archive-cancel" onClick={close}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              style={{ background: "var(--color-danger)" }}
              data-testid="company-archive-submit"
              disabled={pending || !confirm || reasonShort}
              onClick={() =>
                start(async () => {
                  const r = await archiveCompanyAction(systemId, company.id, confirm, reason);
                  if (!r.ok) setError(r.error);
                  else done(base);
                })
              }
            >
              {pending ? "กำลังเก็บ…" : "เก็บถาวร"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
