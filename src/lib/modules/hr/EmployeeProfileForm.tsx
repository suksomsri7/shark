"use client";

import { useActionState } from "react";
import Link from "next/link"; // HR VIS-5c ▸ ยกเลิก = กลับมุมมองอ่าน ◂
import { useTranslations } from "next-intl"; // HR VIS-5c ▸ ข้อความแถบล่าง (hr.people.form) ◂
import { saveEmployeeProfileAction, type ProfileState } from "./actions";
import { profileFormId, type EmployeeProfileDto } from "./privacy-shared"; // HR H1.1 ▸ profileFormId ◂

// ฟอร์มโปรไฟล์พนักงาน — บันทึกทีเดียวทั้งหน้า + ผลลัพธ์ inline (ไม่ใช้ alert)
// ช่องอ่อนไหวจะถูก render เฉพาะผู้มีสิทธิ์ (ตัดสินฝั่ง server แล้วส่ง canSeeSensitive มา)
// HF-HR-0 (D4): รับเฉพาะ DTO ที่ server กรองแล้ว (privacy-shared) — ช่องอ่อนไหวมีคีย์เฉพาะผู้ดูเงินเดือน · ไม่มี PIN
type Emp = EmployeeProfileDto;

const muted = "text-[color:var(--color-muted)]";
const d = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : "");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${muted}`}>
      {label}
      {children}
    </label>
  );
}

export default function EmployeeProfileForm({
  systemId,
  emp,
  canSeeSensitive,
}: {
  systemId: string;
  emp: Emp;
  canSeeSensitive: boolean;
}) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    async (prev, formData) => saveEmployeeProfileAction(systemId, emp.id, prev, formData),
    { status: "idle" },
  );
  const t = useTranslations("hr.people.form"); // HR VIS-5c ◂

  return (
    <form id={profileFormId(emp.id)} action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("legend.personal")}</legend>{/* HR VIS-5c */}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("name")}>{/* HR VIS-5c */}
            <input name="name" required defaultValue={emp.name} className="input" />
          </Field>
          <Field label={t("nickname")}>{/* HR VIS-5c */}
            <input name="nickname" defaultValue={emp.nickname ?? ""} className="input" />
          </Field>
          <Field label={t("code")}>{/* HR VIS-5c */}
            <input name="code" defaultValue={emp.code ?? ""} placeholder={t("codePh")} className="input" />
          </Field>
          <Field label={t("gender")}>{/* HR VIS-5c */}
            <select name="gender" defaultValue={emp.gender ?? ""} className="input">
              <option value="">{t("notSet")}</option>{/* HR VIS-5c */}
              <option value="MALE">{t("genderOpt.MALE")}</option>
              <option value="FEMALE">{t("genderOpt.FEMALE")}</option>
              <option value="OTHER">{t("genderOpt.OTHER")}</option>
            </select>
          </Field>
          <Field label={t("birth")}>{/* HR VIS-5c */}
            <input name="birthDate" type="date" defaultValue={d(emp.birthDate)} className="input" />
          </Field>
          <Field label={t("marital")}>{/* HR VIS-5c */}
            <select name="maritalStatus" defaultValue={emp.maritalStatus ?? ""} className="input">
              <option value="">{t("notSet")}</option>{/* HR VIS-5c */}
              <option value="SINGLE">{t("maritalOpt.SINGLE")}</option>
              <option value="MARRIED">{t("maritalOpt.MARRIED")}</option>
              <option value="DIVORCED">{t("maritalOpt.DIVORCED")}</option>
              <option value="WIDOWED">{t("maritalOpt.WIDOWED")}</option>
              <option value="OTHER">{t("maritalOpt.OTHER")}</option>
            </select>
          </Field>
          <Field label={t("phone")}>{/* HR VIS-5c */}
            <input name="phone" inputMode="tel" defaultValue={emp.phone ?? ""} className="input" />
          </Field>
          <Field label={t("email")}>{/* HR VIS-5c */}
            <input name="email" type="email" defaultValue={emp.email ?? ""} className="input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">{t("legend.employment")}</legend>{/* HR VIS-5c */}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("position")}>{/* HR VIS-5c */}
            <input name="position" defaultValue={emp.position ?? ""} placeholder={t("positionPh")} className="input" />
          </Field>
          <Field label={t("department")}>{/* HR VIS-5c */}
            <input name="department" defaultValue={emp.department ?? ""} placeholder={t("departmentPh")} className="input" />
          </Field>
          <Field label={t("employmentType")}>{/* HR VIS-5c */}
            <select name="employmentType" defaultValue={emp.employmentType ?? ""} className="input">
              <option value="">{t("notSet")}</option>{/* HR VIS-5c */}
              <option value="FULL_TIME">{t("typeOpt.FULL_TIME")}</option>
              <option value="PART_TIME">{t("typeOpt.PART_TIME")}</option>
              <option value="CONTRACT">{t("typeOpt.CONTRACT")}</option>
              <option value="DAILY">{t("typeOpt.DAILY")}</option>
              <option value="PROBATION">{t("typeOpt.PROBATION")}</option>
            </select>
          </Field>
          <Field label={t("startDate")}>{/* HR VIS-5c */}
            <input name="startDate" type="date" defaultValue={d(emp.startDate)} className="input" />
          </Field>
          <Field label={t("endDate")}>{/* HR VIS-5c */}
            <input name="endDate" type="date" defaultValue={d(emp.endDate)} className="input" />
          </Field>
          {/* HR H1.1 ▸ R7 สถานะการจ้าง · วันครบทดลองงาน · วันสิ้นสุดสัญญา (ข้อมูลอย่างเดียว — เตือนล่วงหน้า = H2.x) · สาขาประจำอยู่บนหน้า (form=) ◂ */}
          <Field label={t("employmentStatus")}>{/* HR VIS-5c */}
            <select name="employmentStatus" data-testid="hr-profile-employment-status" defaultValue={emp.employmentStatus ?? ""} className="input min-h-11">
              <option value="">{t("notSet")}</option>{/* HR VIS-5c */}
              <option value="PROBATION">{t("statusOpt.PROBATION")}</option>
              <option value="ACTIVE">{t("statusOpt.ACTIVE")}</option>
              <option value="ENDED">{t("statusOpt.ENDED")}</option>
            </select>
          </Field>
          <Field label={t("probationEnd")}>{/* HR VIS-5c */}
            <input name="probationEndAt" type="date" defaultValue={d(emp.probationEndAt)} className="input" />
          </Field>
          <Field label={t("contractEnd")}>{/* HR VIS-5c */}
            <input name="contractEndAt" type="date" defaultValue={d(emp.contractEndAt)} className="input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">{t("legend.address")}</legend>{/* HR VIS-5c */}
        <Field label={t("addressLine")}>
          <input name="addressLine" defaultValue={emp.addressLine ?? ""} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("subdistrict")}>{/* HR VIS-5c */}
            <input name="subdistrict" defaultValue={emp.subdistrict ?? ""} className="input" />
          </Field>
          <Field label={t("district")}>{/* HR VIS-5c */}
            <input name="district" defaultValue={emp.district ?? ""} className="input" />
          </Field>
          <Field label={t("province")}>{/* HR VIS-5c */}
            <input name="province" defaultValue={emp.province ?? ""} className="input" />
          </Field>
          <Field label={t("postcode")}>{/* HR VIS-5c */}
            <input name="postcode" inputMode="numeric" maxLength={5} defaultValue={emp.postcode ?? ""} className="input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">{t("legend.emergency")}</legend>{/* HR VIS-5c */}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("emergencyName")}>{/* HR VIS-5c */}
            <input name="emergencyName" defaultValue={emp.emergencyName ?? ""} className="input" />
          </Field>
          <Field label={t("emergencyPhone")}>{/* HR VIS-5c */}
            <input name="emergencyPhone" inputMode="tel" defaultValue={emp.emergencyPhone ?? ""} className="input" />
          </Field>
          <Field label={t("emergencyRelation")}>{/* HR VIS-5c */}
            <input name="emergencyRelation" defaultValue={emp.emergencyRelation ?? ""} placeholder={t("emergencyRelationPh")} className="input" />
          </Field>
        </div>
      </fieldset>

      {canSeeSensitive && (
        <fieldset id="hr-profile-sensitive" className="flex scroll-mt-24 flex-col gap-3 border-t pt-4" /* HR VIS-5c ▸ ปลายทางของปุ่มตา (?edit=1#hr-profile-sensitive) ◂ */>
          <legend className="text-sm font-medium">{t("legend.sensitive")}</legend>
          <p className={`text-xs ${muted}`}>
            {t("sensitiveHint") /* HR VIS-5c */}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("nationalId")}>{/* HR VIS-5c */}
              <input name="nationalId" inputMode="numeric" defaultValue={emp.nationalId ?? ""} className="input" />
            </Field>
            <Field label={t("sso")}>{/* HR VIS-5c */}
              <input name="ssoNumber" inputMode="numeric" defaultValue={emp.ssoNumber ?? ""} className="input" />
            </Field>
          </div>
          <Field label={t("houseReg")}>{/* HR VIS-5c */}
            <textarea name="houseRegAddress" rows={2} defaultValue={emp.houseRegAddress ?? ""} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("bankName")}>{/* HR VIS-5c */}
              <input name="bankName" defaultValue={emp.bankName ?? ""} placeholder={t("bankNamePh")} className="input" />
            </Field>
            <Field label={t("bankAccountNo")}>{/* HR VIS-5c */}
              <input name="bankAccountNo" inputMode="numeric" defaultValue={emp.bankAccountNo ?? ""} className="input" />
            </Field>
            <Field label={t("bankAccountName")}>{/* HR VIS-5c */}
              <input name="bankAccountName" defaultValue={emp.bankAccountName ?? ""} className="input" />
            </Field>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2 border-t pt-4">
        <legend className="text-sm font-medium">{t("legend.note")}</legend>{/* HR VIS-5c */}
        <textarea name="note" rows={2} defaultValue={emp.note ?? ""} className="input" />
      </fieldset>

      {/* HR VIS-5c ▸ แถบล่างติดขอบจอ (ภาพ 02): บันทึก · ยกเลิก (กลับมุมมองอ่าน) · สิ้นสุดการจ้าง (#hr-life ใต้ฟอร์ม · ด่านเดิมของ LifecycleProfile) ◂ */}
      <div data-testid="hr-profile-footer" className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-3 md:-mx-5 md:-mb-5 md:px-5">
        <button type="submit" disabled={pending} data-testid="hr-profile-footer-save" className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50">
          {pending ? t("saving") : t("save")}{/* HR VIS-5c */}
        </button>
        {/* HR VIS-5c */}<Link href={`/app/sys/${systemId}/hr/employees/${emp.id}`} data-testid="hr-profile-footer-cancel" className="btn btn-ghost min-h-[44px] text-sm">
          {t("cancel")}
        </Link>
        {state.status === "error" && (
          <span className="text-sm text-[color:var(--color-danger)]">{state.message}</span>
        )}
        {state.status === "ok" && <span className={`text-sm ${muted}`}>{state.message}</span>}
        <span className="flex-1" />{/* HR VIS-5c */}
        {emp.active && (
          <Link href="#hr-life" data-testid="hr-profile-footer-end" className="btn btn-ghost min-h-[44px] text-sm text-[color:var(--color-danger)]">
            {t("end")}
          </Link>
        )}
      </div>
    </form>
  );
}
