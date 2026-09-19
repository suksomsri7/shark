"use client";

// ปุ่มของหน้าผู้ติดต่อ 360 (CRM v2 · ใบ C1.4 · ภาพ 05): แปลง lead (โมดัล 3 ติ๊ก สมาชิก/บริษัท/ดีล) · เมนู "…"
// (แก้ไข · ผู้ดูแล · ขั้น/สถานะ lead · แท็ก · รวม · เก็บถาวร/กู้คืน) · กล่องความยินยอม/ไม่รับข่าวสาร (C20)
// 🔴 ไฟล์ client: import ได้เฉพาะ contacts-shared (บริสุทธิ์) + server actions — ไม่ลากโมดูลที่ถึง prisma
// 🔴 การกระทำอันตราย (รวม · เก็บถาวร) = ติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษร (X9) · ข้อผิดพลาดแสดงในกล่อง ไม่ใช้ alert()

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CONTACT_REASON_MIN,
  // CRM C1.11 ▸ เลือกค่าต่อฟิลด์ตอนรวม ◂
  MERGE_CHOICE_FIELDS,
  MERGE_CHOICE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LIFECYCLE_LABEL,
  LIFECYCLE_STAGES,
  cleanTags,
  contactPhoneProblem,
  emailProblem,
  nameProblem,
  type ConsentView,
  type ContactLeadStatus,
  type ContactLifecycle,
  type ConvertOptions,
} from "@/lib/modules/crm/contacts-shared";
import {
  archiveContactAction,
  assignContactAction,
  convertContactAction,
  mergeContactsAction,
  contactMergeValuesAction,
  searchCompaniesAction,
  searchContactsAction,
  setConsentAction,
  setOptOutAction,
  setStatusAction,
  setTagsAction,
  updateContactAction,
} from "@/lib/modules/crm/contacts-actions";
import { ContactPicker } from "./ContactPicker";
// CRM C1.11 ▸ เลือกค่าต่อฟิลด์ตอนรวม ◂
import { MergeFieldChoices, choosableFields, toFieldChoices } from "@/components/crm/merge/MergeFieldChoices";

type Opt = { id: string; name: string };

function Sheet({ label, sub, testid, onClose, children, wide }: { label: string; sub?: string; testid: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => (e.target === e.currentTarget ? onClose() : undefined)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-testid={testid}
        className={`flex max-h-[92vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl`}
      >
        {sub && <span className="text-xs text-[color:var(--color-muted)]">{sub}</span>}
        <h2 className="text-base font-semibold">{label}</h2>
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ text, testid }: { text: string | null; testid: string }) {
  if (!text) return null;
  return (
    <p className="text-sm text-[color:var(--color-danger)]" data-testid={testid} role="alert">
      {text}
    </p>
  );
}

function newKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ───────────────────────── แปลง lead ─────────────────────────

export function ConvertButton({
  systemId,
  contactId,
  contactName,
  options,
  member,
  companyName,
  jobTitle,
  converted,
}: {
  systemId: string;
  contactId: string;
  contactName: string;
  options: ConvertOptions;
  member: { label: string } | null;
  companyName: string | null;
  jobTitle: string | null;
  converted: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [tickMember, setTickMember] = useState(true);
  const [memberSystem, setMemberSystem] = useState(options.memberSystems[0]?.id ?? "");
  const [tickCompany, setTickCompany] = useState(true);
  const [companyMode, setCompanyMode] = useState<"new" | "pick">("new");
  const [companyNew, setCompanyNew] = useState(companyName ?? "");
  const [companyPick, setCompanyPick] = useState("");
  const [tickDeal, setTickDeal] = useState(true);
  const defaultPipe = options.pipelines[0];
  const [pipelineId, setPipelineId] = useState(defaultPipe?.id ?? "");
  const [stageId, setStageId] = useState(defaultPipe?.stages[0]?.id ?? "");
  const [title, setTitle] = useState(`ดีล ${contactName}`);
  const [valueBaht, setValueBaht] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pipe = options.pipelines.find((p) => p.id === pipelineId);

  const openModal = () => {
    setKey(newKey()); // 1 การเปิดโมดัล = 1 คีย์ ⇒ กดแปลงรัวกี่ครั้งก็ได้ชุดเดียว
    setError(null);
    setOpen(true);
  };
  const submit = () =>
    start(async () => {
      setError(null);
      if (!tickMember && !tickCompany && !tickDeal) return setError("ติ๊กอย่างน้อย 1 อย่างก่อนกดแปลง");
      if (tickMember && !member && !memberSystem) return setError("ร้านนี้ยังไม่มีระบบสมาชิก — เปิดระบบสมาชิกก่อน หรือเอาติ๊กสมาชิกออก");
      if (tickCompany && companyMode === "new" && !companyNew.trim()) return setError("ใส่ชื่อบริษัทที่จะสร้าง");
      if (tickCompany && companyMode === "pick" && !companyPick) return setError("เลือกบริษัทที่จะผูก");
      if (tickDeal && (!pipelineId || !title.trim())) return setError("เลือก pipeline และใส่ชื่อดีล");
      const baht = valueBaht.trim() ? Number(valueBaht.replace(/,/g, "")) : 0;
      if (tickDeal && (!Number.isFinite(baht) || baht < 0)) return setError("มูลค่าดีลต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
      const r = await convertContactAction(systemId, contactId, {
        idempotencyKey: key,
        member: tickMember && memberSystem ? { systemId: memberSystem } : null,
        company: tickCompany ? (companyMode === "new" ? { new: { name: companyNew.trim() } } : { id: companyPick }) : null,
        deal: tickDeal ? { pipelineId, stageId: stageId || null, title: title.trim(), valueSatang: Math.round(baht * 100) } : null,
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });

  const box = (on: boolean) => ({ borderColor: on ? "var(--color-accent)" : "var(--color-line)", background: on ? "var(--color-surface-2)" : undefined });

  return (
    <>
      <button type="button" className="btn btn-primary text-sm" onClick={openModal} disabled={converted} data-testid="contact-convert-btn" title={converted ? "ผู้ติดต่อนี้แปลงแล้ว" : undefined}>
        ⇄ แปลง lead
      </button>
      {open && (
        <Sheet label="เลือกสิ่งที่จะสร้าง/ผูกจากผู้ติดต่อนี้" sub={`แปลง lead — ${contactName}`} testid="contact-convert-modal" onClose={() => setOpen(false)} wide>
          <section className="flex flex-col gap-2 rounded-xl border p-3" style={box(tickMember)} data-testid="contact-convert-member-section">
            <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={tickMember} onChange={(e) => setTickMember(e.target.checked)} data-testid="contact-convert-member" />
                สร้างสมาชิก
              </span>
              {member && (
                <span className="rounded-md border px-1.5 text-xs font-semibold" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
                  มีแล้ว — {member.label}
                </span>
              )}
            </label>
            {member ? (
              <span className="text-xs text-[color:var(--color-muted)]">ผู้ติดต่อนี้ผูกกับสมาชิกอยู่แล้ว ไม่ต้องสร้างซ้ำ</span>
            ) : options.memberSystems.length === 0 ? (
              <span className="text-xs text-[color:var(--color-muted)]">ร้านนี้ยังไม่มีระบบสมาชิก</span>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                <span>ระบบสมาชิก</span>
                <select value={memberSystem} onChange={(e) => setMemberSystem(e.target.value)} className="input text-sm" disabled={!tickMember} data-testid="contact-convert-member-system">
                  {options.memberSystems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-xl border p-3" style={box(tickCompany)} data-testid="contact-convert-company-section">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={tickCompany} onChange={(e) => setTickCompany(e.target.checked)} data-testid="contact-convert-company" />
              สร้าง/ผูกบริษัท
            </label>
            {tickCompany && (
              <>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="convert-company-mode" checked={companyMode === "new"} onChange={() => setCompanyMode("new")} data-testid="contact-convert-company-mode-new" />
                    สร้างบริษัทใหม่
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="convert-company-mode" checked={companyMode === "pick"} onChange={() => setCompanyMode("pick")} data-testid="contact-convert-company-mode-pick" />
                    ผูกบริษัทที่มีอยู่
                  </label>
                </div>
                {companyMode === "new" ? (
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                    <span>ชื่อบริษัท</span>
                    <input value={companyNew} onChange={(e) => setCompanyNew(e.target.value)} className="input text-sm" placeholder="เช่น โรงแรมกะตะ คลิฟ รีสอร์ท" data-testid="contact-convert-company-name" />
                  </label>
                ) : (
                  <ContactPicker
                    kind="convert-company"
                    label="ค้นด้วยเลขภาษี/ชื่อ"
                    placeholder="พิมพ์ชื่อบริษัท"
                    emptyLabel="— เลือกบริษัท —"
                    value={companyPick}
                    onChange={setCompanyPick}
                    search={(q) => searchCompaniesAction(systemId, q)}
                  />
                )}
                {jobTitle && <span className="text-xs text-[color:var(--color-muted)]">ตำแหน่งของผู้ติดต่อนี้: {jobTitle}</span>}
              </>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-xl border p-3" style={box(tickDeal)} data-testid="contact-convert-deal-section">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={tickDeal} onChange={(e) => setTickDeal(e.target.checked)} data-testid="contact-convert-deal" />
              เปิดดีล
            </label>
            {tickDeal &&
              (options.pipelines.length === 0 ? (
                <span className="text-xs text-[color:var(--color-muted)]">ระบบนี้ยังไม่มี pipeline — เปิดหน้าดีลครั้งแรกเพื่อสร้าง pipeline เริ่มต้น</span>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                    <span>pipeline</span>
                    <select
                      value={pipelineId}
                      onChange={(e) => {
                        setPipelineId(e.target.value);
                        setStageId(options.pipelines.find((p) => p.id === e.target.value)?.stages[0]?.id ?? "");
                      }}
                      className="input text-sm"
                      data-testid="contact-convert-deal-pipeline"
                    >
                      {options.pipelines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                    <span>ขั้นเริ่มต้น</span>
                    <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="input text-sm" data-testid="contact-convert-deal-stage">
                      {(pipe?.stages ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                    <span>ชื่อดีล</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="input text-sm" data-testid="contact-convert-deal-title" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                    <span>มูลค่าโดยประมาณ (บาท)</span>
                    <input value={valueBaht} onChange={(e) => setValueBaht(e.target.value)} inputMode="decimal" className="input text-sm" placeholder="110,000" data-testid="contact-convert-deal-value" />
                  </label>
                </div>
              ))}
          </section>
          <ErrorLine text={error} testid="contact-convert-error" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)} data-testid="contact-convert-cancel">
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={submit} data-testid="contact-convert-submit">
              {pending ? "กำลังแปลง…" : "✓ แปลง"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── เมนู "…" ─────────────────────────

type MenuContact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  jobTitle: string;
  ownerUserId: string;
  lifecycleStage: ContactLifecycle;
  leadStatus: ContactLeadStatus;
  tags: string[];
  archived: boolean;
  companyId: string | null;
};

export function ContactMenu({ systemId, contact, owners }: { systemId: string; contact: MenuContact; owners: Opt[] }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<null | "edit" | "owner" | "status" | "tags" | "merge" | "archive">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState({ firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone, email: contact.email, jobTitle: contact.jobTitle });
  const [companyId, setCompanyId] = useState("");
  const [moveDeals, setMoveDeals] = useState(false);
  const [owner, setOwner] = useState(contact.ownerUserId);
  const [stage, setStage] = useState<string>(contact.lifecycleStage);
  const [lead, setLead] = useState<string>(contact.leadStatus);
  const [tags, setTags] = useState(contact.tags.join(", "));
  const [mergeId, setMergeId] = useState("");
  // CRM C1.11 ▸ ฟิลด์ที่ให้ใช้ค่าของผู้ติดต่อที่ถูกรวมแทน (fieldChoices = "merge") — ไม่ติ๊ก = ค่าของคนนี้ (ว่าง = เติมจากอีกคน) ◂
  const [takeOther, setTakeOther] = useState<Record<string, boolean>>({});
  // ค่าของทั้งสองฝั่ง (ผ่านการมองเห็นฝั่งเซิร์ฟเวอร์) — โหลดใหม่เมื่อเลือกผู้ติดต่อที่จะรวม
  const [mergeVals, setMergeVals] = useState<{ keep: Record<string, string | null>; other: Record<string, string | null> } | null>(null);
  useEffect(() => {
    setTakeOther({});
    setMergeVals(null);
    if (!mergeId) return;
    let live = true;
    void contactMergeValuesAction(systemId, contact.id, mergeId).then((r) => {
      if (!live || !r.ok) return;
      const k = r.items.find((x) => x.id === contact.id);
      const o = r.items.find((x) => x.id === mergeId);
      if (k && o) setMergeVals({ keep: k.values, other: o.values });
    });
    return () => {
      live = false;
    };
  }, [systemId, contact.id, mergeId]);
  const mergeFieldList = MERGE_CHOICE_FIELDS.map((f) => ({ key: f, label: MERGE_CHOICE_LABEL[f] }));
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const base = `/app/sys/${systemId}/crm/contacts`;

  const openSheet = (s: typeof sheet) => {
    setMenu(false);
    setError(null);
    setReason("");
    setConfirm(false);
    setSheet(s);
  };
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setSheet(null);
      if (after) after();
      else router.refresh();
    });
  const danger = (what: string) => {
    if (reason.trim().length < CONTACT_REASON_MIN) {
      setError(`ใส่เหตุผลอย่างน้อย ${CONTACT_REASON_MIN} ตัวอักษร`);
      return false;
    }
    if (!confirm) {
      setError(`ติ๊กยืนยัน${what}ก่อน`);
      return false;
    }
    return true;
  };
  const dangerFields = (kind: "merge" | "archive", what: string) => (
    <>
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>เหตุผล (อย่างน้อย {CONTACT_REASON_MIN} ตัวอักษร)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" data-testid={`contact-${kind}-reason`} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid={`contact-${kind}-confirm`} />
        ยืนยัน{what}
      </label>
    </>
  );
  const footer = (kind: "edit" | "owner" | "status" | "tags" | "merge" | "archive", label: string, onClick: () => void) => (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setSheet(null)} data-testid={`contact-${kind}-cancel`}>
        ยกเลิก
      </button>
      <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={onClick} data-testid={`contact-${kind}-submit`}>
        {pending ? "กำลังบันทึก…" : label}
      </button>
    </div>
  );

  const ITEMS: { key: NonNullable<typeof sheet>; label: string; show: boolean }[] = [
    { key: "edit", label: "แก้ไขข้อมูลติดต่อ", show: !contact.archived },
    { key: "owner", label: "เปลี่ยนผู้ดูแล", show: !contact.archived },
    { key: "status", label: "ขั้น / สถานะ lead", show: !contact.archived },
    { key: "tags", label: "แท็ก", show: !contact.archived },
    { key: "merge", label: "รวมกับผู้ติดต่อที่ซ้ำ", show: !contact.archived },
    { key: "archive", label: contact.archived ? "กู้คืนผู้ติดต่อ" : "เก็บถาวร", show: true },
  ];

  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost px-3 text-sm" aria-label="เมนูเพิ่มเติมของผู้ติดต่อ" aria-expanded={menu} onClick={() => setMenu((v) => !v)} data-testid="contact-menu-btn">
        …
      </button>
      {menu && (
        <div className="absolute right-0 z-40 mt-1 flex w-56 flex-col rounded-xl border bg-[color:var(--color-surface)] p-1 shadow-lg" role="menu" data-testid="contact-menu">
          {ITEMS.filter((i) => i.show).map((i) => (
            <button key={i.key} type="button" role="menuitem" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]" onClick={() => openSheet(i.key)} data-testid={`contact-menu-${i.key}`}>
              {i.label}
            </button>
          ))}
        </div>
      )}

      {sheet === "edit" && (
        <Sheet label="แก้ไขข้อมูลติดต่อ" testid="contact-edit-modal" onClose={() => setSheet(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["firstName", "ชื่อจริง"],
                ["lastName", "นามสกุล"],
                ["phone", "เบอร์โทร"],
                ["email", "อีเมล"],
                ["jobTitle", "ตำแหน่ง"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                <span>{label}</span>
                <input value={edit[k]} onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))} className="input text-sm" data-testid={`contact-edit-${k}`} />
              </label>
            ))}
          </div>
          <ContactPicker kind="edit-company" label="ย้ายไปบริษัทหลัก (ไม่เลือก = คงเดิม)" placeholder="พิมพ์ชื่อบริษัท" emptyLabel="— คงบริษัทเดิม —" value={companyId} onChange={setCompanyId} search={(q) => searchCompaniesAction(systemId, q)} />
          {companyId && contact.companyId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={moveDeals} onChange={(e) => setMoveDeals(e.target.checked)} data-testid="contact-edit-move-deals" />
              ย้ายดีลที่ยังเปิดของบริษัทเดิมไปบริษัทใหม่ด้วย
            </label>
          )}
          <ErrorLine text={error} testid="contact-edit-error" />
          {footer("edit", "บันทึก", () => {
            const p = nameProblem(edit.firstName, "ชื่อจริง", true) ?? nameProblem(edit.lastName, "นามสกุล", false) ?? contactPhoneProblem(edit.phone) ?? emailProblem(edit.email);
            if (p) return setError(p);
            run(() =>
              updateContactAction(systemId, contact.id, {
                firstName: edit.firstName,
                lastName: edit.lastName || null,
                phone: edit.phone || null,
                email: edit.email || null,
                jobTitle: edit.jobTitle || null,
                ...(companyId ? { companyId, moveOpenDeals: moveDeals } : {}),
              }),
            );
          })}
        </Sheet>
      )}

      {sheet === "owner" && (
        <Sheet label="เปลี่ยนผู้ดูแล" testid="contact-owner-modal" onClose={() => setSheet(null)}>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input text-sm" aria-label="ผู้ดูแล" data-testid="contact-owner-select">
            <option value="">ยังไม่มีผู้ดูแล</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <ErrorLine text={error} testid="contact-owner-error" />
          {footer("owner", "บันทึก", () => run(() => assignContactAction(systemId, contact.id, owner || null)))}
        </Sheet>
      )}

      {sheet === "status" && (
        <Sheet label="ขั้นของผู้ติดต่อ / สถานะ lead" testid="contact-status-modal" onClose={() => setSheet(null)}>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ขั้น (เดินหน้าได้ทางเดียว)</span>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="input text-sm" data-testid="contact-status-stage">
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {LIFECYCLE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>สถานะ lead</span>
            <select value={lead} onChange={(e) => setLead(e.target.value)} className="input text-sm" data-testid="contact-status-lead">
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <ErrorLine text={error} testid="contact-status-error" />
          {footer("status", "บันทึก", () =>
            run(() =>
              setStatusAction(systemId, contact.id, {
                ...(lead !== contact.leadStatus ? { leadStatus: lead } : {}),
                ...(stage !== contact.lifecycleStage ? { lifecycleStage: stage } : {}),
              }),
            ),
          )}
        </Sheet>
      )}

      {sheet === "tags" && (
        <Sheet label="แท็กของผู้ติดต่อ" testid="contact-tags-modal" onClose={() => setSheet(null)}>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>คั่นด้วย , หรือ ;</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="input text-sm" data-testid="contact-tags-input" />
          </label>
          <ErrorLine text={error} testid="contact-tags-error" />
          {footer("tags", "บันทึก", () => {
            const t = cleanTags(tags.split(/[;,]/));
            if (t.problem) return setError(t.problem);
            run(() => setTagsAction(systemId, contact.id, t.tags));
          })}
        </Sheet>
      )}

      {sheet === "merge" && (
        <Sheet label="รวมกับผู้ติดต่อที่ซ้ำ" testid="contact-merge-modal" onClose={() => setSheet(null)}>
          <p className="text-xs text-[color:var(--color-muted)]">ผู้ติดต่อที่เลือกจะถูกรวมเข้าคนนี้ — ดีล กิจกรรม บทบาทในบริษัท ไฟล์ และรายการที่ผูกไว้ย้ายมาที่นี่ · แถวเดิมเก็บไว้เป็นประวัติ</p>
          <ContactPicker kind="merge" label="ผู้ติดต่อที่จะรวมเข้ามา" placeholder="พิมพ์ชื่อ เบอร์ หรืออีเมล" emptyLabel="— เลือกผู้ติดต่อ —" value={mergeId} onChange={setMergeId} search={(q) => searchContactsAction(systemId, contact.id, q)} />
          {/* CRM C1.11 ▸ เลือกค่าต่อฟิลด์ + เหตุผล/ยืนยัน (AUDIT-CLASS X9) ◂ */}
          {mergeVals && (
            <MergeFieldChoices fields={mergeFieldList} keepLabel="คนนี้" otherLabel="ผู้ติดต่อที่ถูกรวม" keep={mergeVals.keep} other={mergeVals.other} value={takeOther} onChange={setTakeOther} />
          )}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>เหตุผล (อย่างน้อย {CONTACT_REASON_MIN} ตัวอักษร)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" data-testid="contact-merge-reason" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="contact-merge-confirm" />
            ยืนยันการรวมผู้ติดต่อ
          </label>
          <ErrorLine text={error} testid="contact-merge-error" />
          {footer("merge", "รวม", () => {
            if (!mergeId) return setError("เลือกผู้ติดต่อที่จะรวมก่อน");
            if (!danger("การรวมผู้ติดต่อ")) return;
            const fieldChoices = mergeVals ? toFieldChoices(takeOther, choosableFields(mergeFieldList, mergeVals.keep, mergeVals.other)) : {};
            run(
              () => mergeContactsAction(systemId, { keepId: contact.id, mergeId, confirm, reason, fieldChoices }),
              () => router.push(`${base}/${contact.id}?merged=1`),
            );
          })}
        </Sheet>
      )}

      {sheet === "archive" && (
        <Sheet label={contact.archived ? "กู้คืนผู้ติดต่อ" : "เก็บผู้ติดต่อนี้ถาวร"} testid="contact-archive-modal" onClose={() => setSheet(null)}>
          <p className="text-xs text-[color:var(--color-muted)]">{contact.archived ? "ผู้ติดต่อจะกลับมาอยู่ในรายชื่อและแก้ไขได้อีกครั้ง" : "ผู้ติดต่อจะหายจากรายชื่อ (ข้อมูลยังเก็บไว้ · กู้คืนได้)"}</p>
          {dangerFields("archive", contact.archived ? "การกู้คืน" : "การเก็บถาวร")}
          <ErrorLine text={error} testid="contact-archive-error" />
          {footer("archive", contact.archived ? "กู้คืน" : "เก็บถาวร", () => {
            if (!danger(contact.archived ? "การกู้คืน" : "การเก็บถาวร")) return;
            run(() => archiveContactAction(systemId, contact.id, confirm, reason, contact.archived));
          })}
        </Sheet>
      )}
    </div>
  );
}

// ───────────────────────── ความยินยอม / ไม่รับข่าวสาร (C20) ─────────────────────────

export function ConsentBlock({ systemId, contactId, consent, disabled }: { systemId: string; contactId: string; consent: ConsentView; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <section className="card flex flex-col gap-3 p-4" data-testid="contact-consent">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">ความยินยอม · การรับข่าวสาร</h2>
        {consent.memberLinked && <span className="text-xs text-[color:var(--color-muted)]">ผูกสมาชิกแล้ว — ใช้ค่าของระบบสมาชิก</span>}
      </div>
      <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
        <span>
          ไม่รับข่าวสารการตลาด
          <span className="block text-xs text-[color:var(--color-muted)]">
            {consent.memberLinked
              ? "เปิด = ไม่ส่งโปรโมชัน/ข่าวสารทุกช่องทาง และถอนความยินยอมทุกช่องทางในระบบสมาชิกด้วย · ปิดภายหลังไม่คืนความยินยอมให้ ต้องขอใหม่รายช่องทาง (เอกสารซื้อขายยังส่งได้)"
              : "เปิด = ไม่ส่งโปรโมชัน/ข่าวสารทุกช่องทาง · ปิดภายหลัง ช่องทางที่ลูกค้ายินยอมไว้ด้านล่างจะกลับมาส่งได้ (เอกสารซื้อขายยังส่งได้)"}
          </span>
        </span>
        <input type="checkbox" checked={consent.optOut} disabled={disabled || pending} onChange={(e) => run(() => setOptOutAction(systemId, contactId, e.target.checked))} data-testid="contact-optout-toggle" />
      </label>
      {consent.emailBounced && <p className="text-xs text-[color:var(--color-danger)]">อีเมลของผู้ติดต่อนี้ส่งไม่ถึง (เด้งกลับ) — ระบบหยุดส่งอีเมลให้แล้ว</p>}
      <ul className="flex flex-col divide-y text-sm">
        {consent.channels.map((c) => (
          <li key={c.channel} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {c.label}{" "}
              <span className="text-xs text-[color:var(--color-muted)]">{c.granted === null ? "ยังไม่เคยถาม" : c.granted ? "ยินยอม" : "ไม่ยินยอม"}</span>
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                style={c.granted === true ? { borderColor: "var(--color-accent)", color: "var(--color-accent)", fontWeight: 600 } : undefined}
                disabled={disabled || pending || c.granted === true}
                onClick={() => run(() => setConsentAction(systemId, contactId, c.channel, true))}
                data-testid="contact-consent-grant"
              >
                ยินยอม
              </button>
              <button
                type="button"
                className="btn btn-ghost px-2 py-1 text-xs"
                style={c.granted === false ? { borderColor: "var(--color-danger)", color: "var(--color-danger)", fontWeight: 600 } : undefined}
                disabled={disabled || pending || c.granted === false}
                onClick={() => run(() => setConsentAction(systemId, contactId, c.channel, false))}
                data-testid="contact-consent-revoke"
              >
                ไม่ยินยอม
              </button>
            </span>
          </li>
        ))}
      </ul>
      <ErrorLine text={error} testid="contact-consent-error" />
    </section>
  );
}
