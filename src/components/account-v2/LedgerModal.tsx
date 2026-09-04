"use client";

// LedgerModal — modal เพิ่ม/แก้ไขบัญชีในผังบัญชี (WO 6.1 · DESIGN-SPEC-V2 §11.1)
// ช่องตาม SPEC: รหัส (ตรวจช่วงของหมวดย่อย) · ชื่อ TH/EN · หมวดย่อย · ประเภท (สืบทอดจากหมวด) ·
//              อัตราหัก ณ ที่จ่ายเริ่มต้น · ประเภทภาษี · คำอธิบาย
// pattern เดียวกับ FinanceModal/ContactModal: เรียก server action ตรง · error ใต้ช่อง · ข้อมูลที่กรอกไม่หาย

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { FormField } from "@/components/ui/FormField";
import { saveLedgerAction } from "@/app/app/sys/[id]/account/accounts/actions";
import { VAT_TREATMENT_LABEL, WHT_TYPE_LABEL, type SubGroupOption } from "@/lib/modules/account/coa-v2";

export type LedgerModalAccount = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  groupPrefix: string;
  description: string | null;
  defaultWhtRateBp: number | null;
  defaultWhtType: string | null;
  vatTreatment: string | null;
  isSystem: boolean;
};

const WHT_RATE_OPTS: { value: string; label: string }[] = [
  { value: "", label: "ไม่ใช้กับบัญชีนี้" },
  { value: "100", label: "1%" },
  { value: "150", label: "1.5%" },
  { value: "200", label: "2%" },
  { value: "300", label: "3%" },
  { value: "500", label: "5%" },
  { value: "1000", label: "10%" },
];

export function LedgerModal({
  systemId,
  accountsPath,
  groups,
  account,
}: {
  systemId: string;
  accountsPath: string;
  groups: SubGroupOption[];
  /** null = เพิ่มบัญชีใหม่ */
  account: LedgerModalAccount | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [groupPrefix, setGroupPrefix] = useState(account?.groupPrefix ?? groups[0]?.prefix ?? "");
  const group = useMemo(() => groups.find((g) => g.prefix === groupPrefix) ?? null, [groups, groupPrefix]);
  const [code, setCode] = useState(account?.code ?? group?.nextCode ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [nameEn, setNameEn] = useState(account?.nameEn ?? "");
  const [whtRate, setWhtRate] = useState(account?.defaultWhtRateBp != null ? String(account.defaultWhtRateBp) : "");
  const [whtType, setWhtType] = useState(account?.defaultWhtType ?? "");
  const [vat, setVat] = useState(account?.vatTreatment ?? "");
  const [description, setDescription] = useState(account?.description ?? "");

  const editing = !!account;
  const range = group?.range ?? null;

  function close() {
    router.push(account ? `${accountsPath}?a=${account.id}` : accountsPath);
  }

  function onGroupChange(prefix: string) {
    setGroupPrefix(prefix);
    const g = groups.find((x) => x.prefix === prefix);
    // เพิ่มใหม่ = เติมรหัสว่างถัดไปของหมวดให้เลย (ผู้ใช้แก้เองได้) · แก้ไข = ไม่แตะรหัสเดิม
    if (!editing && g?.nextCode) setCode(g.nextCode);
  }

  function save() {
    setErrors({});
    start(async () => {
      const res = await saveLedgerAction(systemId, {
        id: account?.id,
        code: code.trim(),
        name: name.trim(),
        nameEn: nameEn.trim() || null,
        groupPrefix,
        description: description.trim() || null,
        defaultWhtRateBp: whtRate ? Number(whtRate) : null,
        defaultWhtType: whtRate ? whtType || null : null,
        vatTreatment: vat || null,
      });
      if (res.ok) {
        router.push(`${accountsPath}?a=${res.id}`);
        router.refresh();
      } else {
        setErrors(res.fields);
      }
    });
  }

  return (
    <Modal
      open
      onClose={close}
      title={editing ? "แก้ไขบัญชี" : "เพิ่มบัญชี"}
      size="lg"
      sheetOnMobile
      testId="coa-modal"
      actions={
        <>
          <button type="button" className="btn-sm" onClick={close} disabled={pending}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={pending} data-testid="coa-modal-save">
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="หมวดย่อย" required error={errors.groupPrefix}>
          <select
            className="input"
            value={groupPrefix}
            onChange={(e) => onGroupChange(e.target.value)}
            disabled={editing && account.isSystem}
            data-testid="coa-modal-group"
          >
            {groups.map((g) => (
              <option key={g.prefix} value={g.prefix}>
                {g.parentLabel} › {g.label}
              </option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="รหัสบัญชี"
            required
            error={errors.code}
            hint={range ? `รหัสต้องอยู่ในช่วง ${range.min}–${range.max} ของหมวดย่อยที่เลือก` : undefined}
          >
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              disabled={editing && account.isSystem}
              data-testid="coa-modal-code"
            />
          </FormField>
          <FormField label="ประเภทบัญชี">
            <input className="input" value={group?.typeLabel ?? "—"} readOnly disabled data-testid="coa-modal-type" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="ชื่อบัญชี (ไทย)" required error={errors.name}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="coa-modal-name" />
          </FormField>
          <FormField label="ชื่อบัญชี (อังกฤษ)" error={errors.nameEn}>
            <input className="input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} data-testid="coa-modal-name-en" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="อัตราหัก ณ ที่จ่ายเริ่มต้น" error={errors.defaultWhtRateBp}>
            <select className="input" value={whtRate} onChange={(e) => setWhtRate(e.target.value)} data-testid="coa-modal-wht-rate">
              {WHT_RATE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="ประเภทเงินได้">
            <select
              className="input"
              value={whtType}
              onChange={(e) => setWhtType(e.target.value)}
              disabled={!whtRate}
              data-testid="coa-modal-wht-type"
            >
              <option value="">ไม่ระบุ</option>
              {Object.entries(WHT_TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="ประเภทภาษี (ฝั่งซื้อ)" error={errors.vatTreatment}>
          <select className="input" value={vat} onChange={(e) => setVat(e.target.value)} data-testid="coa-modal-vat">
            <option value="">ไม่ระบุ</option>
            {Object.entries(VAT_TREATMENT_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="คำอธิบาย" error={errors.description}>
          <textarea
            className="input min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="coa-modal-desc"
          />
        </FormField>
      </div>
    </Modal>
  );
}

export default LedgerModal;
