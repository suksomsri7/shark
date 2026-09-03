"use client";

// ContactModal — modal เพิ่ม/แก้ไขผู้ติดต่อ พื้นฐาน|ขั้นสูง (WO 3.3 · DESIGN-SPEC-V2 §7.2)
// เฟรมอ้างอิง: docs/design/account-v2/g5-contact-modal.png (สถานะแท็บ "ขั้นสูง")
// checklist ไล่ทีละองค์ประกอบ + ความต่างที่ตั้งใจ อยู่ใน ledger/wo-notes/3.3.md
//
// กติกา:
//   1) validation แสดง inline ใต้ช่อง (ไม่ใช่ alert) + toast รวมท้ายจอ — BLUEPRINT §0.3 ข้อ 9
//   2) เตือนซ้ำต้อง **ไม่ทำให้สิ่งที่พิมพ์หาย** ⇒ บันทึกผ่าน server action ที่คืนค่า ไม่ใช่ form redirect
//   3) มือถือ 390 = แผ่นเต็มจอ (Modal sheetOnMobile)

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { AccountIcon } from "./AccountIcon";
import { FormField } from "@/components/ui/FormField";
import { THAI_PROVINCES, LEGAL_ENTITY_TYPES, PERSON_TITLES } from "./thai-provinces";
import {
  saveContactAction,
  dbdLookupAction,
  suggestContactLinksAction,
  linkContactAction,
  type ContactFormPayload,
} from "@/lib/modules/account/actions";

export type ContactModalContact = {
  id: string;
  code: string | null;
  kind: string;
  legalType: string;
  name: string;
  taxId: string | null;
  taxIdCountry: string | null;
  branchCode: string | null;
  officeType: string | null;
  legalEntityType: string | null;
  personTitle: string | null;
  contactPerson: string | null;
  addressLine: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  fax: string | null;
  lineId: string | null;
  creditTermDays: number;
  defaultPriceMode: string | null;
  defaultWhtType: string | null;
  defaultWhtRateBp: number | null;
  bankAccountNote: string | null;
  arAccountCode: string | null;
  apAccountCode: string | null;
  ownerUserId: string | null;
  note: string | null;
  tags: string[];
  groupIds: string[];
  partyId: string | null;
};

type FormState = {
  kind: string;
  legalType: string;
  code: string;
  taxId: string;
  taxIdCountry: string;
  officeType: string;
  branchCode: string;
  legalEntityType: string;
  personTitle: string;
  name: string;
  contactPerson: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  fax: string;
  lineId: string;
  creditTermDays: string;
  defaultPriceMode: string;
  defaultWhtType: string;
  defaultWhtRateBp: string;
  bankAccountNote: string;
  arAccountCode: string;
  apAccountCode: string;
  ownerUserId: string;
  note: string;
};

const PRICE_MODES: [string, string][] = [
  ["", "ราคาปกติ"],
  ["EXCL_VAT", "แยก VAT (ราคายังไม่รวมภาษี)"],
  ["INCL_VAT", "รวม VAT แล้ว"],
  ["NO_VAT", "ไม่มี VAT"],
];

const WHT_TYPES: [string, string][] = [
  ["", "— ไม่หัก"],
  ["M40_1", "40(1) เงินเดือน/ค่าจ้าง"],
  ["M40_2", "40(2) ค่านายหน้า/รับจ้างทำงาน"],
  ["M40_3", "40(3) ค่าลิขสิทธิ์/goodwill"],
  ["M40_4", "40(4) ดอกเบี้ย/เงินปันผล"],
  ["M40_5", "40(5) ค่าเช่าทรัพย์สิน"],
  ["M40_6", "40(6) วิชาชีพอิสระ"],
  ["M40_7", "40(7) รับเหมา"],
  ["M40_8", "40(8) บริการ/อื่นๆ"],
];

const WHT_RATES: [string, string][] = [
  ["", "— ไม่ระบุ"],
  ["50", "0.5%"],
  ["100", "1%"],
  ["150", "1.5%"],
  ["200", "2%"],
  ["300", "3%"],
  ["500", "5%"],
  ["1000", "10%"],
  ["1500", "15%"],
];

const MAXLEN = {
  name: 256, contactPerson: 100, addressLine: 200, email: 50, phone: 20,
  website: 50, fax: 20, lineId: 50, note: 512,
};

function emptyForm(): FormState {
  return {
    kind: "CUSTOMER", legalType: "COMPANY", code: "", taxId: "", taxIdCountry: "TH",
    officeType: "HQ", branchCode: "", legalEntityType: "", personTitle: "", name: "",
    contactPerson: "", addressLine: "", subdistrict: "", district: "", province: "",
    postcode: "", country: "TH", email: "", phone: "", website: "", fax: "", lineId: "",
    creditTermDays: "0", defaultPriceMode: "", defaultWhtType: "", defaultWhtRateBp: "",
    bankAccountNote: "", arAccountCode: "", apAccountCode: "", ownerUserId: "", note: "",
  };
}

function formOf(c: ContactModalContact | null, nextCode: string): FormState {
  if (!c) return { ...emptyForm(), code: nextCode };
  return {
    kind: c.kind, legalType: c.legalType, code: c.code ?? "", taxId: c.taxId ?? "",
    taxIdCountry: c.taxIdCountry ?? "TH", officeType: c.officeType ?? "HQ",
    branchCode: c.branchCode ?? "", legalEntityType: c.legalEntityType ?? "",
    personTitle: c.personTitle ?? "", name: c.name, contactPerson: c.contactPerson ?? "",
    addressLine: c.addressLine ?? "", subdistrict: c.subdistrict ?? "", district: c.district ?? "",
    province: c.province ?? "", postcode: c.postcode ?? "", country: c.country ?? "TH",
    email: c.email ?? "", phone: c.phone ?? "", website: c.website ?? "", fax: c.fax ?? "",
    lineId: c.lineId ?? "", creditTermDays: String(c.creditTermDays ?? 0),
    defaultPriceMode: c.defaultPriceMode ?? "", defaultWhtType: c.defaultWhtType ?? "",
    defaultWhtRateBp: c.defaultWhtRateBp != null ? String(c.defaultWhtRateBp) : "",
    bankAccountNote: c.bankAccountNote ?? "", arAccountCode: c.arAccountCode ?? "",
    apAccountCode: c.apAccountCode ?? "", ownerUserId: c.ownerUserId ?? "", note: c.note ?? "",
  };
}

/** ตรวจ inline ฝั่ง client — ชุดกติกาเดียวกับ validateContactPayload ฝั่ง server (server คือคนตัดสินจริง) */
function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "จำเป็นต้องกรอก";
  if (!f.phone.trim()) e.phone = "จำเป็นต้องกรอก";
  for (const [k, max] of Object.entries(MAXLEN))
    if ((f[k as keyof FormState] ?? "").length > max) e[k] = `ยาวเกิน ${max} ตัวอักษร`;
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "รูปแบบอีเมลไม่ถูกต้อง";
  const tax = f.taxId.replace(/\D/g, "");
  if (f.taxIdCountry === "TH" && f.taxId.trim() && tax.length !== 13) e.taxId = "เลขทะเบียนไทยต้องเป็นตัวเลข 13 หลัก";
  if (f.officeType === "BRANCH" && f.branchCode.trim() && !/^\d{5}$/.test(f.branchCode.trim()))
    e.branchCode = "เลขสาขาต้องเป็นตัวเลข 5 หลัก";
  if (f.postcode.trim() && !/^\d{5}$/.test(f.postcode.trim())) e.postcode = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  const days = Number(f.creditTermDays || "0");
  if (!Number.isInteger(days) || days < 0 || days > 365) e.creditTermDays = "กรอกเป็นจำนวนวัน 0–365";
  return e;
}

// ── ชิ้นส่วนเล็ก ๆ ที่ g5 ใช้ซ้ำ ──

function Radio({ checked, onChange, children, testId }: { checked: boolean; onChange: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
      <input type="radio" checked={checked} onChange={onChange} className="h-4 w-4" data-testid={testId} />
      <span>{children}</span>
    </label>
  );
}

/** กล่องมีกรอบ + หัวข้อ (class `.msec` ของ mockup) — ใช้กับ เลขทะเบียน / ที่อยู่ / ช่องทางติดต่อ / เชื่อมกับ */
function Fieldset({
  title, right, children, collapsible, testId,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={testId}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">
          {title}
          {collapsible && <span className="font-normal text-[color:var(--color-muted)]"> ({open ? "ขยาย" : "ย่อ"})</span>}
        </h3>
        <span className="flex-1" />
        {right}
        {collapsible && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
            {open ? "ย่อ" : "ขยาย"}
          </button>
        )}
      </div>
      {(!collapsible || open) && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}

/** แถบผลลัพธ์สีฟ้าใต้ช่อง (class `.matchbox` ของ mockup) — ใช้ทั้งผล DBD และผล "เชื่อมกับ" */
function MatchBox({ icon, children, testId }: { icon: "check" | "link"; children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
      style={{ borderColor: "var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 8%, transparent)" }}
      data-testid={testId}
    >
      <AccountIcon name={icon === "check" ? "check" : "link"} className="h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

function ChipRow({ items, onRemove, onAdd, placeholder, testId }: {
  items: string[];
  onRemove: (v: string) => void;
  onAdd: (v: string) => void;
  placeholder: string;
  testId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      {items.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--color-line)" }}>
          {t}
          <button type="button" aria-label={`ลบ ${t}`} onClick={() => onRemove(t)} className="text-[color:var(--color-muted)]">
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(""); setAdding(false); }
          }}
          placeholder={placeholder}
          className="w-40 rounded-full border px-2 py-0.5 text-xs outline-none"
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
          + เพิ่ม
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function ContactModal({
  systemId,
  contactsPath,
  contact,
  nextCode,
  groups,
  owners,
  dbdEnabled,
  dbdDisabledReason,
  defaultTab,
}: {
  systemId: string;
  /** path หน้ารายการผู้ติดต่อ — ใช้ปิด modal (ถอด ?new/?edit) และทำลิงก์ "เปิด C00012" */
  contactsPath: string;
  contact: ContactModalContact | null;
  nextCode: string;
  groups: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  dbdEnabled: boolean;
  dbdDisabledReason: string;
  defaultTab: "basic" | "advanced";
}) {
  const router = useRouter();
  const isEdit = !!contact;
  const [tab, setTab] = useState<"basic" | "advanced">(defaultTab);
  const [f, setF] = useState<FormState>(() => formOf(contact, nextCode));
  const [tags, setTags] = useState<string[]>(contact?.tags ?? []);
  const [groupIds, setGroupIds] = useState<string[]>(contact?.groupIds ?? []);
  const [codeEditable, setCodeEditable] = useState(false);
  // 🔴 ตรวจด้วย useMemo ไม่ใช่ useState+useEffect: ของเดิม (setErrors ใน effect) ทำให้ **ทุกตัวอักษรที่พิมพ์
  //    เกิด render 2 รอบ** ⇒ พิมพ์เร็ว ๆ ตัวอักษรหล่นจริง (เจอตอนถ่ายภาพ WO 3.3: ชื่อ "ปิยธิดา อินสุ่ม"
  //    กลายเป็น "ปิยธิดาอินสุ่ม" · เบอร์ "076100019" เหลือ "0") — ผู้ใช้จริงที่พิมพ์เร็วก็เจอเหมือนกัน
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [dup, setDup] = useState<{ id: string; code: string | null; name: string; reason: string; blocked: boolean } | null>(null);
  const [saveError, setSaveError] = useState("");
  const [pending, start] = useTransition();

  // DBD
  const [dbdPending, setDbdPending] = useState(false);
  const [dbd, setDbd] = useState<{ ok: boolean; name?: string; reason?: string; address?: Record<string, string | null> } | null>(null);

  // เชื่อมกับ (สมาชิก/CRM)
  const [linkQuery, setLinkQuery] = useState(contact?.phone ?? "");
  const [links, setLinks] = useState<{
    member: { id: string; label: string; reason: string; linked: boolean }[];
    crm: { id: string; label: string; reason: string; linked: boolean }[];
    available: { member: boolean; crm: boolean };
  } | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");

  const set = <K extends keyof FormState>(k: K, v: string) => {
    setF((prev) => ({ ...prev, [k]: v }));
    // แก้อะไรก็ตาม = การยืนยันซ้ำเดิมใช้ไม่ได้แล้ว (เรียกเฉพาะตอนยังมีแถบค้างอยู่ — ไม่ setState เปล่า ๆ ทุกตัวอักษร)
    setDup((prev) => (prev ? null : prev));
  };

  // ตรวจ inline ระหว่างพิมพ์ (โชว์เฉพาะหลังกดบันทึกครั้งแรก — ไม่ด่าตอนยังพิมพ์ไม่จบ)
  // รวมกับข้อผิดพลาดที่ server ตีกลับ (server คือคนตัดสินจริง — ดู validateContactPayload)
  const errors = useMemo(() => ({ ...validate(f), ...serverErrors }), [f, serverErrors]);

  const toastTimer = useRef<number | null>(null);
  const flash = (text: string, tone: "error" | "success") => {
    setToast({ text, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  // useCallback: ส่งเข้า <Modal onClose> — identity นิ่งช่วยลด render ที่ไม่จำเป็น
  // (ตัว Modal เองก็ถูกแก้ไม่ให้ผูก effect กับ onClose แล้ว — ดูคอมเมนต์บั๊กใน Modal.tsx)
  const close = useCallback(() => router.push(contactsPath), [router, contactsPath]);

  const errOf = (k: string) => (showErrors ? errors[k] : undefined);
  const inputStyle = (k: string) =>
    errOf(k) ? { borderColor: "var(--color-danger)", boxShadow: "0 0 0 1px var(--color-danger)" } : undefined;

  // สร้าง payload ตอนกดบันทึกเท่านั้น (useMemo เดิมคำนวณใหม่ทุกตัวอักษรโดยไม่มีใครใช้ผลระหว่างพิมพ์)
  const buildPayload = useCallback(
    (): ContactFormPayload => ({
      id: contact?.id,
      kind: f.kind, legalType: f.legalType, name: f.name.trim(), code: f.code.trim(),
      taxId: f.taxId.trim(), taxIdCountry: f.taxIdCountry,
      branchCode: f.officeType === "BRANCH" ? f.branchCode.trim() || "00000" : "00000",
      officeType: f.officeType, legalEntityType: f.legalEntityType, personTitle: f.personTitle,
      contactPerson: f.contactPerson.trim(), addressLine: f.addressLine.trim(),
      subdistrict: f.subdistrict.trim(), district: f.district.trim(), province: f.province,
      postcode: f.postcode.trim(), country: f.country, email: f.email.trim(), phone: f.phone.trim(),
      website: f.website.trim(), fax: f.fax.trim(), lineId: f.lineId.trim(),
      creditTermDays: Number(f.creditTermDays || "0"),
      defaultPriceMode: f.defaultPriceMode, defaultWhtType: f.defaultWhtType,
      defaultWhtRateBp: f.defaultWhtRateBp ? Number(f.defaultWhtRateBp) : null,
      bankAccountNote: f.bankAccountNote.trim(), arAccountCode: f.arAccountCode.trim(),
      apAccountCode: f.apAccountCode.trim(), ownerUserId: f.ownerUserId, note: f.note.trim(),
      tags, groupIds,
    }),
    [f, tags, groupIds, contact?.id],
  );

  const submit = (confirmDuplicate: boolean) => {
    const e = validate(f);
    setServerErrors({});
    setShowErrors(true);
    if (Object.keys(e).length > 0) {
      flash("โปรดกรอกช่องที่ไฮไลต์", "error");
      return;
    }
    setSaveError("");
    start(async () => {
      const res = await saveContactAction(systemId, { ...buildPayload(), confirmDuplicate });
      if (res.ok) {
        router.push(contactsPath);
        router.refresh();
        return;
      }
      if (res.error === "duplicate") {
        setDup({ ...res.duplicate, blocked: res.blocked });
        flash(
          res.blocked
            ? "มีผู้ติดต่อรายนี้อยู่แล้ว — ร้านนี้ตั้งค่าไว้ว่าห้ามสร้างซ้ำ"
            : "ระบบพบผู้ติดต่อที่คล้ายกัน — ตรวจก่อนบันทึก",
          "error",
        );
        return;
      }
      if (res.error === "validation") {
        setServerErrors(res.fields);
        flash("โปรดกรอกช่องที่ไฮไลต์", "error");
        return;
      }
      setSaveError(res.reason);
      flash(res.reason, "error");
    });
  };

  const runDbd = () => {
    setDbd(null);
    setDbdPending(true);
    start(async () => {
      const res = await dbdLookupAction(systemId, f.taxId);
      setDbdPending(false);
      if (!res.ok) {
        setDbd({ ok: false, reason: res.reason });
        return;
      }
      setDbd({ ok: true, name: res.name, address: res.address as unknown as Record<string, string | null> });
    });
  };

  const applyDbd = () => {
    if (!dbd?.ok) return;
    const a = dbd.address ?? {};
    setF((prev) => ({
      ...prev,
      name: dbd.name ?? prev.name,
      addressLine: a.addressLine ?? prev.addressLine,
      subdistrict: a.subdistrict ?? prev.subdistrict,
      district: a.district ?? prev.district,
      province: a.province ?? prev.province,
      postcode: a.postcode ?? prev.postcode,
    }));
    flash("เติมข้อมูลจากกรมพัฒน์ฯ แล้ว", "success");
  };

  const runSuggest = () => {
    setLinkMsg("");
    setLinkPending(true);
    start(async () => {
      const res = await suggestContactLinksAction(systemId, {
        phone: linkQuery || f.phone,
        email: f.email,
        taxId: f.taxId,
        partyId: contact?.partyId ?? undefined,
      });
      setLinkPending(false);
      setLinks({ member: res.member, crm: res.crm, available: res.available });
      if (res.member.length === 0 && res.crm.length === 0) setLinkMsg("ยังไม่พบรายการที่ตรงกัน");
    });
  };

  const confirmLink = (target: "member" | "crm", targetId: string) => {
    if (!contact) {
      setLinkMsg("บันทึกผู้ติดต่อก่อน แล้วจึงเชื่อมกับสมาชิก/CRM ได้");
      return;
    }
    start(async () => {
      const res = await linkContactAction(systemId, { contactId: contact.id, target, targetId });
      if (res.ok) {
        setLinkMsg("เชื่อมเป็นคนเดียวกันแล้ว");
        runSuggest();
        router.refresh();
      } else setLinkMsg(res.reason);
    });
  };

  const isPerson = f.legalType === "PERSON";

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      sheetOnMobile
      testId="contact-modal"
      title={isEdit ? "แก้ไขผู้ติดต่อ" : "เพิ่มผู้ติดต่อ"}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={close} data-testid="contact-modal-cancel">
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => submit(false)}
            data-testid="contact-modal-submit"
          >
            {pending ? "กำลังบันทึก…" : isEdit ? "บันทึก" : "+ เพิ่ม"}
          </button>
        </>
      }
    >
      {/* แท็บ พื้นฐาน | ขั้นสูง (g5) */}
      <div className="mb-4 flex gap-4 border-b" style={{ borderColor: "var(--color-line)" }} data-testid="contact-modal-tabs">
        {([["basic", "พื้นฐาน"], ["advanced", "ขั้นสูง"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            data-testid={`contact-modal-tab-${k}`}
            className="-mb-px border-b-2 px-1 pb-2 text-sm"
            style={
              tab === k
                ? { borderColor: "var(--color-ink)", fontWeight: 600 }
                : { borderColor: "transparent", color: "var(--color-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {/* แถบเตือนซ้ำ (§7.2 "มีอยู่แล้ว: C00012 — เปิด/รวม") */}
        {dup && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--color-danger)", background: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }}
            data-testid="contact-dup-banner"
          >
            <AccountIcon name="warn" className="h-4 w-4 shrink-0" />
            <span>
              มีอยู่แล้ว: <b>{dup.code ?? "—"}</b> {dup.name}
              <span className="text-[color:var(--color-muted)]">
                {" · "}
                {dup.reason === "taxId" ? "เลขทะเบียนซ้ำ" : dup.reason === "phone" ? "เบอร์โทรซ้ำ" : "ชื่อซ้ำ"}
              </span>
            </span>
            <span className="flex-1" />
            <a
              href={`${contactsPath}/${dup.id}`}
              className="text-xs font-semibold"
              style={{ color: "var(--color-accent)" }}
              data-testid="contact-dup-open-link"
            >
              เปิด {dup.code ?? "รายการนี้"}
            </a>
            {!dup.blocked && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => submit(true)}
                disabled={pending}
                data-testid="contact-dup-confirm"
              >
                คนละราย บันทึกต่อ
              </button>
            )}
          </div>
        )}
        {saveError && <p className="text-sm text-[color:var(--color-danger)]">{saveError}</p>}

        {/* ── ประเภทผู้ติดต่อ + รหัส ── */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">ประเภทผู้ติดต่อ</span>
            <div className="flex flex-wrap gap-4">
              <Radio checked={f.kind === "CUSTOMER"} onChange={() => set("kind", "CUSTOMER")} testId="contact-kind-customer">ลูกค้า</Radio>
              <Radio checked={f.kind === "VENDOR"} onChange={() => set("kind", "VENDOR")} testId="contact-kind-vendor">ผู้ขาย</Radio>
              <Radio checked={f.kind === "BOTH"} onChange={() => set("kind", "BOTH")} testId="contact-kind-both">ทั้งคู่</Radio>
            </div>
          </div>
          <div className="w-[180px] shrink-0">
            <FormField label="รหัส" hint={codeEditable ? "แก้ได้ · ห้ามซ้ำกับรายอื่น" : undefined}>
              <span className="relative block">
                <input
                  value={f.code}
                  readOnly={!codeEditable}
                  onChange={(e) => set("code", e.target.value)}
                  className="input pr-8"
                  data-testid="contact-code"
                />
                <button
                  type="button"
                  aria-label="แก้ไขรหัส"
                  onClick={() => setCodeEditable(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]"
                  data-testid="contact-code-edit"
                >
                  <AccountIcon name="edit" className="h-4 w-4" />
                </button>
              </span>
            </FormField>
          </div>
        </div>

        {/* ── ข้อมูลกิจการ ── */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ข้อมูลกิจการ</span>
          <div className="flex flex-wrap gap-4">
            <Radio checked={!isPerson} onChange={() => set("legalType", "COMPANY")} testId="contact-legal-company">นิติบุคคล</Radio>
            <Radio checked={isPerson} onChange={() => set("legalType", "PERSON")} testId="contact-legal-person">บุคคลธรรมดา</Radio>
          </div>
        </div>

        {/* ── เลขทะเบียน 13 หลัก + ปุ่มค้นหา DBD ── */}
        <Fieldset
          title="เลขทะเบียน 13 หลัก"
          testId="contact-taxid-section"
          right={
            <span className="flex gap-3">
              <Radio checked={f.taxIdCountry === "TH"} onChange={() => set("taxIdCountry", "TH")} testId="contact-taxid-th">ไทย</Radio>
              <Radio checked={f.taxIdCountry !== "TH"} onChange={() => set("taxIdCountry", "FOREIGN")} testId="contact-taxid-foreign">ต่างประเทศ</Radio>
            </span>
          }
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <FormField label="" hint="สูงสุด 13 หลัก" error={errOf("taxId")}>
                <input
                  value={f.taxId}
                  onChange={(e) => set("taxId", e.target.value)}
                  maxLength={20}
                  inputMode="numeric"
                  className="input"
                  style={inputStyle("taxId")}
                  data-testid="contact-taxid"
                />
              </FormField>
            </div>
            <button
              type="button"
              onClick={runDbd}
              disabled={!dbdEnabled || dbdPending}
              title={dbdEnabled ? "ดึงชื่อ/ที่อยู่จากกรมพัฒนาธุรกิจการค้า" : dbdDisabledReason}
              className={`btn-sm mt-4 flex shrink-0 items-center gap-1.5 ${dbdEnabled ? "" : "cursor-not-allowed opacity-40"}`}
              data-testid="btn-dbd-lookup"
            >
              <AccountIcon name="search" className="h-4 w-4" /> {dbdPending ? "กำลังค้นหา…" : "ค้นหา"}
            </button>
          </div>
          {!dbdEnabled && (
            <p className="text-xs text-[color:var(--color-muted)]" data-testid="dbd-disabled-reason">
              {dbdDisabledReason}
            </p>
          )}
          {dbd && dbd.ok && (
            <MatchBox icon="check" testId="dbd-result">
              <span>
                พบข้อมูลจากกรมพัฒน์ฯ: <b>{dbd.name}</b>
              </span>
              <span className="flex-1" />
              <button type="button" onClick={applyDbd} className="text-xs font-bold" style={{ color: "var(--color-accent)" }} data-testid="dbd-apply">
                ใช้ข้อมูลนี้
              </button>
            </MatchBox>
          )}
          {dbd && !dbd.ok && (
            <p className="text-xs text-[color:var(--color-muted)]" data-testid="dbd-result-fail">
              {dbd.reason}
            </p>
          )}
        </Fieldset>

        {/* ── ประเภทสำนักงาน + เลขสาขา ── */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">ประเภทสำนักงาน</span>
            <div className="flex flex-wrap gap-4">
              <Radio checked={f.officeType === "UNSPECIFIED"} onChange={() => set("officeType", "UNSPECIFIED")}>ไม่ระบุ</Radio>
              <Radio checked={f.officeType === "HQ"} onChange={() => set("officeType", "HQ")} testId="contact-office-hq">สำนักงานใหญ่</Radio>
              <Radio checked={f.officeType === "BRANCH"} onChange={() => set("officeType", "BRANCH")} testId="contact-office-branch">สาขา</Radio>
            </div>
          </div>
          <div className="w-[150px] shrink-0">
            <FormField label="เลขสาขา" error={errOf("branchCode")}>
              <input
                value={f.branchCode}
                onChange={(e) => set("branchCode", e.target.value)}
                placeholder="00000"
                maxLength={5}
                inputMode="numeric"
                disabled={f.officeType !== "BRANCH"}
                className="input"
                style={inputStyle("branchCode")}
                data-testid="contact-branch-code"
              />
            </FormField>
          </div>
        </div>

        {/* ── ประเภทนิติบุคคล / คำนำหน้าบุคคล ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="ประเภทนิติบุคคล">
            <select
              value={f.legalEntityType}
              onChange={(e) => set("legalEntityType", e.target.value)}
              disabled={isPerson}
              className="input"
              data-testid="contact-legal-entity-type"
            >
              <option value="">— เลือก</option>
              {LEGAL_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
          <FormField label="คำนำหน้าบุคคล">
            <select
              value={f.personTitle}
              onChange={(e) => set("personTitle", e.target.value)}
              disabled={!isPerson}
              className="input"
              data-testid="contact-person-title"
            >
              <option value="">— (ใช้กับบุคคลธรรมดา)</option>
              {PERSON_TITLES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
        </div>

        {/* ── ชื่อกิจการ/ชื่อ + ค้นหาด้วยชื่อ ── */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <FormField label="ชื่อกิจการ/ชื่อ" required error={errOf("name")}>
              <input
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={MAXLEN.name}
                className="input"
                style={inputStyle("name")}
                data-testid="contact-name"
              />
            </FormField>
          </div>
          <button
            type="button"
            disabled
            title="กรมพัฒน์ฯ ยังไม่เปิดค้นหาด้วยชื่อผ่าน OpenAPI — ใช้เลขทะเบียน 13 หลักแทน"
            className="btn-sm mt-4 flex shrink-0 cursor-not-allowed items-center gap-1.5 opacity-40"
            data-testid="btn-dbd-name-search"
          >
            <AccountIcon name="search" className="h-4 w-4" /> ค้นหาด้วยชื่อ
          </button>
        </div>

        {/* ── ที่อยู่จดทะเบียน ── */}
        <Fieldset title="ที่อยู่จดทะเบียน" collapsible testId="contact-address-section">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="ผู้ติดต่อ" error={errOf("contactPerson")}>
              <input
                value={f.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
                placeholder="ชื่อผู้ติดต่อ ≤100"
                maxLength={MAXLEN.contactPerson}
                className="input"
                style={inputStyle("contactPerson")}
                data-testid="contact-person"
              />
            </FormField>
            <FormField label="ที่อยู่" error={errOf("addressLine")}>
              <input
                value={f.addressLine}
                onChange={(e) => set("addressLine", e.target.value)}
                maxLength={MAXLEN.addressLine}
                className="input"
                style={inputStyle("addressLine")}
                data-testid="contact-address-line"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="แขวง/ตำบล">
              <input value={f.subdistrict} onChange={(e) => set("subdistrict", e.target.value)} className="input" data-testid="contact-subdistrict" />
            </FormField>
            <FormField label="เขต/อำเภอ">
              <input value={f.district} onChange={(e) => set("district", e.target.value)} className="input" data-testid="contact-district" />
            </FormField>
            <FormField label="จังหวัด">
              <select value={f.province} onChange={(e) => set("province", e.target.value)} className="input" data-testid="contact-province">
                <option value="">— เลือกจังหวัด</option>
                {THAI_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="รหัสไปรษณีย์" error={errOf("postcode")}>
              <input
                value={f.postcode}
                onChange={(e) => set("postcode", e.target.value)}
                placeholder="83000"
                maxLength={5}
                inputMode="numeric"
                className="input"
                style={inputStyle("postcode")}
                data-testid="contact-postcode"
              />
            </FormField>
            <FormField label="ประเทศ">
              <select value={f.country} onChange={(e) => set("country", e.target.value)} className="input" data-testid="contact-country">
                <option value="TH">ไทย</option>
                <option value="OTHER">ประเทศอื่น</option>
              </select>
            </FormField>
          </div>
        </Fieldset>

        {/* ── ช่องทางติดต่อ ── */}
        <Fieldset title="ช่องทางติดต่อ" collapsible testId="contact-channels-section">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="อีเมล" error={errOf("email")}>
              <input
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
                type="email"
                maxLength={MAXLEN.email}
                className="input"
                style={inputStyle("email")}
                data-testid="contact-email"
              />
            </FormField>
            <FormField label="เบอร์โทร" required error={errOf("phone")}>
              <input
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="099-999-9999"
                inputMode="tel"
                maxLength={MAXLEN.phone}
                className="input"
                style={inputStyle("phone")}
                data-testid="contact-phone"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="เว็บไซต์" error={errOf("website")}>
              <input value={f.website} onChange={(e) => set("website", e.target.value)} maxLength={MAXLEN.website} className="input" data-testid="contact-website" />
            </FormField>
            <FormField label="แฟกซ์" error={errOf("fax")}>
              <input value={f.fax} onChange={(e) => set("fax", e.target.value)} placeholder="076-311-221" maxLength={MAXLEN.fax} className="input" data-testid="contact-fax" />
            </FormField>
            <FormField label="LINE ID" error={errOf("lineId")}>
              <input value={f.lineId} onChange={(e) => set("lineId", e.target.value)} maxLength={MAXLEN.lineId} className="input" data-testid="contact-line-id" />
            </FormField>
          </div>
        </Fieldset>

        {/* ══════════ ขั้นสูง ══════════ */}
        {tab === "advanced" && (
          <>
            <hr style={{ borderColor: "var(--color-line)" }} />
            <h3 className="text-[12.5px] font-bold" data-testid="contact-advanced-heading">ขั้นสูง</h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="เครดิตเทอม (วัน)" error={errOf("creditTermDays")}>
                <input
                  value={f.creditTermDays}
                  onChange={(e) => set("creditTermDays", e.target.value)}
                  type="number"
                  min={0}
                  max={365}
                  className="input"
                  style={inputStyle("creditTermDays")}
                  data-testid="contact-credit-term"
                />
              </FormField>
              <FormField label="ประเภทราคาเริ่มต้น">
                <select value={f.defaultPriceMode} onChange={(e) => set("defaultPriceMode", e.target.value)} className="input" data-testid="contact-price-mode">
                  {PRICE_MODES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="หัก ณ ที่จ่ายเริ่มต้น — ประเภทเงินได้">
                <select value={f.defaultWhtType} onChange={(e) => set("defaultWhtType", e.target.value)} className="input" data-testid="contact-wht-type">
                  {WHT_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="หัก ณ ที่จ่ายเริ่มต้น — อัตรา">
                <select value={f.defaultWhtRateBp} onChange={(e) => set("defaultWhtRateBp", e.target.value)} className="input" data-testid="contact-wht-rate">
                  {WHT_RATES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="ช่องทางรับ/จ่ายเงินที่ใช้ประจำ (เลขบัญชีธนาคารของผู้ขาย)">
              <input value={f.bankAccountNote} onChange={(e) => set("bankAccountNote", e.target.value)} className="input" data-testid="contact-bank-account" />
            </FormField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="บัญชีลูกหนี้เฉพาะราย (ใช้แทนค่าเริ่มต้น 1100)">
                <input value={f.arAccountCode} onChange={(e) => set("arAccountCode", e.target.value)} placeholder="ค่าเริ่มต้น 1100" className="input" data-testid="contact-ar-account" />
              </FormField>
              <FormField label="บัญชีเจ้าหนี้เฉพาะราย (ใช้แทนค่าเริ่มต้น 2000)">
                <input value={f.apAccountCode} onChange={(e) => set("apAccountCode", e.target.value)} placeholder="ค่าเริ่มต้น 2000" className="input" data-testid="contact-ap-account" />
              </FormField>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">กลุ่มกำหนดเอง</span>
              {groups.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีกลุ่มกำหนดเอง — สร้างได้จากแถบซ้ายของหน้าผู้ติดต่อ</p>
              ) : (
                <div className="flex flex-wrap gap-1.5" data-testid="contact-groups">
                  {groups.map((g) => {
                    const on = groupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGroupIds((prev) => (on ? prev.filter((x) => x !== g.id) : [...prev, g.id]))}
                        className="rounded-full border px-2.5 py-1 text-xs"
                        style={
                          on
                            ? { background: "var(--color-ink)", color: "var(--color-surface)", borderColor: "var(--color-ink)" }
                            : { borderColor: "var(--color-line)" }
                        }
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">แท็ก</span>
              <ChipRow
                items={tags}
                onAdd={(v) => setTags((prev) => (prev.includes(v) ? prev : [...prev, v]))}
                onRemove={(v) => setTags((prev) => prev.filter((t) => t !== v))}
                placeholder="พิมพ์แท็กแล้ว Enter"
                testId="contact-tags"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="ผู้ดูแล (พนักงาน)">
                <select value={f.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)} className="input" data-testid="contact-owner">
                  <option value="">— ไม่ระบุ</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="หมายเหตุ" error={errOf("note")}>
                <input value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={MAXLEN.note} className="input" data-testid="contact-note" />
              </FormField>
            </div>

            {/* ── เชื่อมกับ ── */}
            <Fieldset title="เชื่อมกับ" testId="contact-link-section">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <FormField label="สมาชิก (ค้นหาเบอร์/รหัส)">
                    <input
                      value={linkQuery}
                      onChange={(e) => setLinkQuery(e.target.value)}
                      placeholder="เช่น 081-234-5678"
                      className="input"
                      data-testid="contact-link-query"
                    />
                  </FormField>
                </div>
                <button type="button" onClick={runSuggest} disabled={linkPending} className="btn-sm shrink-0" data-testid="contact-link-search">
                  {linkPending ? "กำลังค้นหา…" : "ค้นหา"}
                </button>
              </div>

              {links?.member.map((m) => (
                <MatchBox key={m.id} icon="link" testId="contact-link-suggestion">
                  <span>
                    ระบบพบข้อมูลตรงกัน: <b>{m.label}</b> · {m.reason}
                  </span>
                  <span className="flex-1" />
                  {m.linked ? (
                    <span className="text-xs text-[color:var(--color-muted)]">เชื่อมแล้ว</span>
                  ) : (
                    <>
                      <button type="button" className="btn btn-primary text-xs" onClick={() => confirmLink("member", m.id)} data-testid="contact-link-confirm">
                        ใช่ คนเดียวกัน
                      </button>
                      <button type="button" className="btn-sm" onClick={() => setLinks((p) => (p ? { ...p, member: p.member.filter((x) => x.id !== m.id) } : p))}>
                        ไม่ใช่
                      </button>
                    </>
                  )}
                </MatchBox>
              ))}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="CRM">
                  {links && links.crm.length > 0 ? (
                    <div className="flex flex-col gap-1.5" data-testid="contact-link-crm">
                      {links.crm.map((c) => (
                        <MatchBox key={c.id} icon="link">
                          <span>
                            <b>{c.label}</b> · {c.reason}
                          </span>
                          <span className="flex-1" />
                          {c.linked ? (
                            <span className="text-xs text-[color:var(--color-muted)]">เชื่อมแล้ว</span>
                          ) : (
                            <button type="button" className="btn btn-primary text-xs" onClick={() => confirmLink("crm", c.id)}>
                              ใช่ คนเดียวกัน
                            </button>
                          )}
                        </MatchBox>
                      ))}
                    </div>
                  ) : (
                    <input readOnly value="" placeholder="ยังไม่พบดีลที่ตรงกัน" className="input" data-testid="contact-link-crm-empty" />
                  )}
                </FormField>
                {/* แชท: ยังไม่มีเส้นเชื่อม account→chat (ห้ามแตะ chat/**) — ดู contact-links.ts ข้อ 2 */}
                <FormField label="แชท" hint="ห้องแชทจะเชื่อมอัตโนมัติเมื่อระบบแชทเปิดใช้ Party (อยู่ระหว่างดำเนินการ)">
                  <input readOnly value="" placeholder="ยังไม่เชื่อม" className="input" data-testid="contact-link-chat" />
                </FormField>
              </div>
              {linkMsg && <p className="text-xs text-[color:var(--color-muted)]" data-testid="contact-link-msg">{linkMsg}</p>}
            </Fieldset>
          </>
        )}
      </div>

      {/* toast รวมท้ายจอ (g5) */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div
            role="status"
            className="flex items-center gap-2 rounded-full px-4 py-3 text-sm shadow-[0_8px_24px_rgba(10,10,10,.24)]"
            style={{ background: toast.tone === "error" ? "var(--color-ink)" : "var(--color-accent)", color: "var(--color-surface)" }}
            data-testid="contact-modal-toast"
          >
            <AccountIcon name="warn" className="h-4 w-4" /> {toast.text}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default ContactModal;
