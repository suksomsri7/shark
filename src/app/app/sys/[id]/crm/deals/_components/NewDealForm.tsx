"use client";

// NewDealForm.tsx — ฟอร์มเพิ่มดีล (CRM v2 · ใบ C1.5 · พิมพ์เขียว §5.4 createDeal)
// ผู้ติดต่อค้นฝั่งเซิร์ฟเวอร์ (พิมพ์แล้วรอ 250 ms) · บริษัท = บริษัทที่ผู้ติดต่ออยู่ (ลิงก์ที่ยังใช้งาน · หลักก่อน)
// เปิดจากบริษัท 360 (`?companyId=`) → หน้าเซิร์ฟเวอร์ resolve บริษัท + ผู้ติดต่อของบริษัทมาให้ตั้งต้น (ไม่เชื่อ id จาก URL)
// ตรวจช่องก่อนส่งแบบ inline (ไม่ใช้ alert) · บริการเป็นตัวตัดสินจริง (ข้อความไทยของบริการแสดงใต้ฟอร์ม)

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { contactCompaniesAction, createDealAction, searchDealContactsAction } from "@/lib/modules/crm/deals-actions";
import { DEAL_TITLE_MAX, FORECAST_CATEGORIES, FORECAST_CATEGORY_LABEL, bahtTextToSatang, type PipelineDto } from "@/lib/modules/crm/deals-shared";

type Opt = { id: string; name: string };

export function NewDealForm({
  systemId,
  pipelines,
  owners,
  defaultOwner,
  defaultPipelineId,
  defaultStageId,
  company,
  companyContacts,
  contact = null,
}: {
  systemId: string;
  pipelines: PipelineDto[];
  owners: Opt[];
  defaultOwner: string;
  defaultPipelineId: string;
  defaultStageId: string;
  /** บริษัทตั้งต้น (resolve ฝั่งเซิร์ฟเวอร์จาก ?companyId=) */
  company: Opt | null;
  companyContacts: Opt[];
  // CRM C1.11 ▸ ผู้ติดต่อตั้งต้น (resolve ฝั่งเซิร์ฟเวอร์จาก ?contactId= ผ่านการมองเห็น) — เลือกไว้ให้ก่อน ◂
  contact?: Opt | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<Opt[]>(contact && !companyContacts.some((c) => c.id === contact.id) ? [contact, ...companyContacts] : companyContacts);
  const [contactId, setContactId] = useState(contact?.id ?? companyContacts[0]?.id ?? "");
  const [companies, setCompanies] = useState<{ id: string; name: string; primary: boolean }[]>(company ? [{ ...company, primary: true }] : []);
  const [companyId, setCompanyId] = useState(company?.id ?? "");
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);
  const pipe = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const openStages = (pipe?.stages ?? []).filter((s) => s.kind === "OPEN");
  const [stageId, setStageId] = useState(defaultStageId || openStages[0]?.id || "");
  const [value, setValue] = useState("");
  const [close, setClose] = useState("");
  const [owner, setOwner] = useState(defaultOwner);
  const [category, setCategory] = useState<string>("PIPELINE");
  const [nextStep, setNextStep] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const skipFirst = useRef(companyContacts.length > 0);

  // ค้นผู้ติดต่อฝั่งเซิร์ฟเวอร์
  useEffect(() => {
    if (skipFirst.current && !q) {
      skipFirst.current = false;
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchDealContactsAction(systemId, q);
      if (my !== seq.current) return;
      if (r.ok) setContacts(r.items);
    }, 250);
    return () => clearTimeout(t);
  }, [q, systemId]);

  // บริษัทของผู้ติดต่อที่เลือก
  useEffect(() => {
    if (!contactId) return;
    let alive = true;
    void contactCompaniesAction(systemId, contactId).then((r) => {
      if (!alive || !r.ok) return;
      setCompanies(r.items);
      setCompanyId((cur) => (r.items.some((c) => c.id === cur) ? cur : (r.items[0]?.id ?? "")));
    });
    return () => {
      alive = false;
    };
  }, [contactId, systemId]);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "ใส่ชื่อดีลก่อน";
    if (title.trim().length > DEAL_TITLE_MAX) e.title = `ชื่อดีลยาวเกิน ${DEAL_TITLE_MAX} ตัวอักษร`;
    if (!contactId) e.contact = "เลือกผู้ติดต่อก่อน";
    if (!pipe) e.pipeline = "ยังไม่มี pipeline — สร้างที่หน้าตั้งค่า pipeline ก่อน";
    const v = bahtTextToSatang(value);
    if (v === null) e.value = "มูลค่าต้องเป็นตัวเลข (บาท) ทศนิยมไม่เกิน 2 ตำแหน่ง";
    setErrors(e);
    if (Object.keys(e).length > 0 || !pipe || v === null) return;
    setBusy(true);
    setServerError(null);
    const r = await createDealAction(systemId, {
      pipelineId: pipe.id,
      stageId: stageId || null,
      title: title.trim(),
      contactId,
      companyId: companyId || null,
      valueSatang: v,
      expectedCloseAt: close || null,
      ownerUserId: owner || null,
      forecastCategory: category,
      nextStep: nextStep.trim() || null,
    });
    setBusy(false);
    if (!r.ok) return setServerError(r.error);
    router.push(`/app/sys/${systemId}/crm/deals/${r.id}`);
  };

  const err = (k: string) => (errors[k] ? <span className="text-xs text-[color:var(--color-danger)]">{errors[k]}</span> : null);

  return (
    <form
      className="card flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="deal-new-form"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span>ชื่อดีล</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={DEAL_TITLE_MAX + 20} className="input text-sm" placeholder='เช่น "คอร์สดำน้ำพนักงาน 10 คน"' data-testid="deal-new-title" />
        {err("title")}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <label className="flex flex-col gap-1">
            <span>ค้นหาผู้ติดต่อ</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input text-sm" placeholder="ชื่อ · เบอร์ · อีเมล" data-testid="deal-new-contact-q" />
          </label>
          <select aria-label="ผู้ติดต่อหลัก" value={contactId} onChange={(e) => setContactId(e.target.value)} className="input text-sm" data-testid="deal-new-contact">
            <option value="">— เลือกผู้ติดต่อหลัก —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {err("contact")}
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>บริษัท</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input text-sm" data-testid="deal-new-company">
            <option value="">ไม่ผูกบริษัท</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.primary ? " (หลัก)" : ""}
              </option>
            ))}
          </select>
          <span className="text-xs text-[color:var(--color-muted)]">เลือกได้เฉพาะบริษัทที่ผู้ติดต่อคนนี้อยู่</span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>pipeline</span>
          <select
            value={pipelineId}
            onChange={(e) => {
              setPipelineId(e.target.value);
              const p = pipelines.find((x) => x.id === e.target.value);
              setStageId(p?.stages.find((s) => s.kind === "OPEN")?.id ?? "");
            }}
            className="input text-sm"
            data-testid="deal-new-pipeline"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {err("pipeline")}
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>ขั้นเริ่มต้น</span>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="input text-sm" data-testid="deal-new-stage">
            {openStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.probability}%)
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>มูลค่า (บาท · ก่อน VAT)</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className="input text-sm" placeholder="0" data-testid="deal-new-value" />
          {err("value")}
          <span className="text-xs text-[color:var(--color-muted)]">เพิ่มรายการสินค้าได้ที่หน้าดีล — มูลค่าจะคิดจากรายการอัตโนมัติ</span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>วันที่คาดว่าจะปิด</span>
          <input type="date" value={close} onChange={(e) => setClose(e.target.value)} className="input text-sm" data-testid="deal-new-close" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>ผู้ดูแล</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input text-sm" data-testid="deal-new-owner">
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span>หมวดพยากรณ์</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input text-sm" data-testid="deal-new-category">
            {FORECAST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FORECAST_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span>ขั้นถัดไป (ไม่บังคับ)</span>
        <input value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="input text-sm" placeholder="เช่น โทรนัดสาธิตวันพฤหัส" data-testid="deal-new-next-step" />
      </label>
      {serverError && (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="deal-new-error">
          {serverError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost text-sm" onClick={() => router.back()} data-testid="deal-new-cancel">
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-primary text-sm" disabled={busy} data-testid="deal-new-submit">
          {busy ? "กำลังบันทึก…" : "เพิ่มดีล"}
        </button>
      </div>
    </form>
  );
}
