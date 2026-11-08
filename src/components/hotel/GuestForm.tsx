"use client";
// SVC H.4 ▸ ฟอร์มผู้พัก 1 คน = ช่องของบัตรทะเบียนผู้พัก (ร.ร.3) — ชื่อ · สัญชาติ · ชนิด+เลขเอกสาร · วันเกิด · เพศ · อาชีพ · ที่อยู่ · มาจาก/ไปต่อ (+ ตรวจลงตรา/ตม.6 ของต่างด้าว)
//   🔴 เลขเอกสาร: ช่องกรอกรับค่าจากพนักงานเท่านั้น — แก้แถวเดิมแสดงเฉพาะ 4 ตัวท้าย (idNumberLast4 · mask) ไม่เติมเลขเต็มจากเซิร์ฟเวอร์
//   ค่าที่ระบบอ่านจากรูป (aiProposed) ต้องติ๊กยืนยัน (confirmed) ก่อนบันทึก · เก็บสำเนารูปเอกสาร (keepIdImage) ติ๊กต่อครั้ง
//   มือถือ/แท็บเล็ต 390: ช่องเรียงลงแนวตั้ง (grid 1 คอลัมน์ · 2 คอลัมน์จาก sm)
import { COMMON_NATIONALITIES, maskLast4, type GuestFormValue } from "./checkin-shared";

type Props = {
  value: GuestFormValue;
  onChange: (v: GuestFormValue) => void;
  title: string;
  existingLast4?: string | null;
  hasImage?: boolean;
};

const INPUT = "min-h-11 w-full min-w-0 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";
const LABEL = "flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]";

export default function GuestForm({ value, onChange, title, existingLast4 = null, hasImage = false }: Props) {
  const set = (patch: Partial<GuestFormValue>) => onChange({ ...value, ...patch });
  const foreign = value.nationality.trim().toUpperCase() !== "THA" && value.nationality.trim() !== "";
  const idLabel = value.idType === "THAI_ID" ? "เลขบัตรประชาชน 13 หลัก" : value.idType === "PASSPORT" ? "เลขหนังสือเดินทาง" : "เลขเอกสาร";
  return (
    <fieldset data-guest-form="" className="flex min-w-0 flex-col gap-3 rounded-xl border border-[color:var(--color-line)] p-3">
      <legend className="px-1 text-sm font-bold">{title}</legend>
      {value.aiProposed ? (
        <p data-ai-proposed="" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ระบบอ่านจากรูปให้ — ตรวจทุกช่องให้ตรงกับเอกสารจริง แล้วติ๊กยืนยันด้านล่าง
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          ชื่อ-สกุล (ตามเอกสาร)
          <input className={INPUT} value={value.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="off" required maxLength={200} />
        </label>
        <label className={LABEL}>
          สัญชาติ (รหัส 3 ตัวอักษร)
          <input className={INPUT} list="hotel-nationalities" value={value.nationality} onChange={(e) => set({ nationality: e.target.value.toUpperCase().slice(0, 3), idType: e.target.value.toUpperCase() === "THA" ? value.idType : value.idType === "THAI_ID" ? "PASSPORT" : value.idType })} required maxLength={3} />
          <datalist id="hotel-nationalities">
            {COMMON_NATIONALITIES.map((n) => (
              <option key={n.code} value={n.code}>
                {n.th}
              </option>
            ))}
          </datalist>
        </label>
        <label className={LABEL}>
          ชนิดเอกสาร
          <select className={INPUT} value={value.idType} onChange={(e) => set({ idType: e.target.value === "THAI_ID" ? "THAI_ID" : e.target.value === "OTHER" ? "OTHER" : "PASSPORT" })}>
            <option value="PASSPORT">หนังสือเดินทาง</option>
            <option value="THAI_ID">บัตรประชาชน</option>
            <option value="OTHER">เอกสารอื่น</option>
          </select>
        </label>
        <label className={LABEL}>
          {idLabel}
          <input className={INPUT} value={value.idNo} onChange={(e) => set({ idNo: e.target.value })} autoComplete="off" inputMode={value.idType === "THAI_ID" ? "numeric" : "text"} placeholder={existingLast4 ? `เดิม ${maskLast4(existingLast4)} · กรอกใหม่เพื่อแก้` : ""} required={!existingLast4} maxLength={40} />
        </label>
        <label className={LABEL}>
          วันเกิด
          <input type="date" className={INPUT} value={value.dob} onChange={(e) => set({ dob: e.target.value })} />
        </label>
        <label className={LABEL}>
          เพศ
          <select className={INPUT} value={value.sex} onChange={(e) => set({ sex: e.target.value === "M" || e.target.value === "F" || e.target.value === "X" ? e.target.value : "" })}>
            <option value="">—</option>
            <option value="M">ชาย</option>
            <option value="F">หญิง</option>
            <option value="X">ไม่ระบุ</option>
          </select>
        </label>
        <label className={LABEL}>
          อาชีพ
          <input className={INPUT} value={value.occupation} onChange={(e) => set({ occupation: e.target.value })} maxLength={120} />
        </label>
        <label className={LABEL}>
          ที่อยู่ปัจจุบัน
          <input className={INPUT} value={value.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} />
        </label>
        <label className={LABEL}>
          มาจาก
          <input className={INPUT} value={value.arrivedFrom} onChange={(e) => set({ arrivedFrom: e.target.value })} maxLength={120} />
        </label>
        <label className={LABEL}>
          จะไปที่
          <input className={INPUT} value={value.nextDestination} onChange={(e) => set({ nextDestination: e.target.value })} maxLength={120} />
        </label>
        {foreign ? (
          <>
            <label className={LABEL}>
              ประเภทการตรวจลงตรา (วีซ่า)
              <input className={INPUT} value={value.visaType} onChange={(e) => set({ visaType: e.target.value })} maxLength={40} />
            </label>
            <label className={LABEL}>
              เลขที่ตรวจลงตรา
              <input className={INPUT} value={value.visaNo} onChange={(e) => set({ visaNo: e.target.value })} maxLength={40} />
            </label>
            <label className={LABEL}>
              วันเดินทางเข้าประเทศ
              <input type="date" className={INPUT} value={value.arrivalDate} onChange={(e) => set({ arrivalDate: e.target.value })} />
            </label>
            <label className={LABEL}>
              ด่านตรวจคนเข้าเมือง
              <input className={INPUT} value={value.portOfEntry} onChange={(e) => set({ portOfEntry: e.target.value })} maxLength={80} />
            </label>
            <label className={LABEL}>
              เลข ตม.6 (ถ้ามี)
              <input className={INPUT} value={value.tm6No} onChange={(e) => set({ tm6No: e.target.value })} maxLength={40} />
            </label>
            <label className={LABEL}>
              หนังสือเดินทางหมดอายุ
              <input type="date" className={INPUT} value={value.docExpiry} onChange={(e) => set({ docExpiry: e.target.value })} />
            </label>
          </>
        ) : null}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={value.keepIdImage} onChange={(e) => set({ keepIdImage: e.target.checked })} />
        เก็บสำเนารูปเอกสารไว้เป็นหลักฐาน ร.ร.3 (แขกยินยอม){value.imageDataUrl ? " · มีรูปแล้ว" : hasImage ? " · มีรูปเดิม" : ""}
      </label>
      {value.aiProposed ? (
        <label data-confirm-ai="" className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={value.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} />
          ตรวจแล้ว ข้อมูลทุกช่องตรงกับเอกสาร (ยืนยัน)
        </label>
      ) : null}
    </fieldset>
  );
}
