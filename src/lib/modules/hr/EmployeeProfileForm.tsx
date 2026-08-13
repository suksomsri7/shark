"use client";

import { useActionState } from "react";
import { saveEmployeeProfileAction, type ProfileState } from "./actions";

// ฟอร์มโปรไฟล์พนักงาน — บันทึกทีเดียวทั้งหน้า + ผลลัพธ์ inline (ไม่ใช้ alert)
// ช่องอ่อนไหวจะถูก render เฉพาะผู้มีสิทธิ์ (ตัดสินฝั่ง server แล้วส่ง canSeeSensitive มา)
type Emp = {
  id: string;
  name: string;
  nickname: string | null;
  code: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthDate: Date | null;
  maritalStatus: string | null;
  position: string | null;
  department: string | null;
  employmentType: string | null;
  startDate: Date | null;
  endDate: Date | null;
  addressLine: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  note: string | null;
  nationalId: string | null;
  ssoNumber: string | null;
  houseRegAddress: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
};

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

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">ข้อมูลส่วนตัว</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ชื่อ-นามสกุล *">
            <input name="name" required defaultValue={emp.name} className="input" />
          </Field>
          <Field label="ชื่อเล่น">
            <input name="nickname" defaultValue={emp.nickname ?? ""} className="input" />
          </Field>
          <Field label="รหัสพนักงาน">
            <input name="code" defaultValue={emp.code ?? ""} placeholder="เช่น EMP-001" className="input" />
          </Field>
          <Field label="เพศ">
            <select name="gender" defaultValue={emp.gender ?? ""} className="input">
              <option value="">ไม่ระบุ</option>
              <option value="MALE">ชาย</option>
              <option value="FEMALE">หญิง</option>
              <option value="OTHER">อื่นๆ</option>
            </select>
          </Field>
          <Field label="วันเกิด">
            <input name="birthDate" type="date" defaultValue={d(emp.birthDate)} className="input" />
          </Field>
          <Field label="สถานะสมรส">
            <select name="maritalStatus" defaultValue={emp.maritalStatus ?? ""} className="input">
              <option value="">ไม่ระบุ</option>
              <option value="SINGLE">โสด</option>
              <option value="MARRIED">สมรส</option>
              <option value="DIVORCED">หย่า</option>
              <option value="WIDOWED">คู่สมรสเสียชีวิต</option>
              <option value="OTHER">อื่นๆ</option>
            </select>
          </Field>
          <Field label="เบอร์โทร">
            <input name="phone" inputMode="tel" defaultValue={emp.phone ?? ""} className="input" />
          </Field>
          <Field label="อีเมล">
            <input name="email" type="email" defaultValue={emp.email ?? ""} className="input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">การจ้างงาน</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ตำแหน่งงาน">
            <input name="position" defaultValue={emp.position ?? ""} placeholder="เช่น ช่างตัดผม" className="input" />
          </Field>
          <Field label="แผนก">
            <input name="department" defaultValue={emp.department ?? ""} placeholder="เช่น หน้าร้าน" className="input" />
          </Field>
          <Field label="ประเภทการจ้าง">
            <select name="employmentType" defaultValue={emp.employmentType ?? ""} className="input">
              <option value="">ไม่ระบุ</option>
              <option value="FULL_TIME">ประจำ (เต็มเวลา)</option>
              <option value="PART_TIME">พาร์ตไทม์</option>
              <option value="CONTRACT">สัญญาจ้าง</option>
              <option value="DAILY">รายวัน</option>
              <option value="PROBATION">ทดลองงาน</option>
            </select>
          </Field>
          <Field label="วันเริ่มงาน">
            <input name="startDate" type="date" defaultValue={d(emp.startDate)} className="input" />
          </Field>
          <Field label="วันสิ้นสุดงาน (ถ้าลาออกแล้ว)">
            <input name="endDate" type="date" defaultValue={d(emp.endDate)} className="input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">ที่อยู่ปัจจุบัน</legend>
        <Field label="บ้านเลขที่ / ถนน">
          <input name="addressLine" defaultValue={emp.addressLine ?? ""} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ตำบล/แขวง">
            <input name="subdistrict" defaultValue={emp.subdistrict ?? ""} className="input" />
          </Field>
          <Field label="อำเภอ/เขต">
            <input name="district" defaultValue={emp.district ?? ""} className="input" />
          </Field>
          <Field label="จังหวัด">
            <input name="province" defaultValue={emp.province ?? ""} className="input" />
          </Field>
          <Field label="รหัสไปรษณีย์">
            <input name="postcode" inputMode="numeric" maxLength={5} defaultValue={emp.postcode ?? ""} className="input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="text-sm font-medium">ผู้ติดต่อกรณีฉุกเฉิน</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ชื่อ">
            <input name="emergencyName" defaultValue={emp.emergencyName ?? ""} className="input" />
          </Field>
          <Field label="เบอร์โทร">
            <input name="emergencyPhone" inputMode="tel" defaultValue={emp.emergencyPhone ?? ""} className="input" />
          </Field>
          <Field label="ความสัมพันธ์">
            <input name="emergencyRelation" defaultValue={emp.emergencyRelation ?? ""} placeholder="เช่น คู่สมรส" className="input" />
          </Field>
        </div>
      </fieldset>

      {canSeeSensitive && (
        <fieldset className="flex flex-col gap-3 border-t pt-4">
          <legend className="text-sm font-medium">🔒 ข้อมูลอ่อนไหว</legend>
          <p className={`text-xs ${muted}`}>
            เห็นได้เฉพาะเจ้าของกิจการหรือผู้ได้รับสิทธิ์ดูเงินเดือน — กรอกเท่าที่ร้านต้องใช้จริง (ทำเอกสาร/ประกันสังคม/โอนเงินเดือน)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="เลขบัตรประชาชน (13 หลัก)">
              <input name="nationalId" inputMode="numeric" defaultValue={emp.nationalId ?? ""} className="input" />
            </Field>
            <Field label="เลขประกันสังคม">
              <input name="ssoNumber" inputMode="numeric" defaultValue={emp.ssoNumber ?? ""} className="input" />
            </Field>
          </div>
          <Field label="ที่อยู่ตามทะเบียนบ้าน (ถ้าต่างจากที่อยู่ปัจจุบัน)">
            <textarea name="houseRegAddress" rows={2} defaultValue={emp.houseRegAddress ?? ""} className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ธนาคาร">
              <input name="bankName" defaultValue={emp.bankName ?? ""} placeholder="เช่น กสิกรไทย" className="input" />
            </Field>
            <Field label="เลขบัญชี">
              <input name="bankAccountNo" inputMode="numeric" defaultValue={emp.bankAccountNo ?? ""} className="input" />
            </Field>
            <Field label="ชื่อบัญชี">
              <input name="bankAccountName" defaultValue={emp.bankAccountName ?? ""} className="input" />
            </Field>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2 border-t pt-4">
        <legend className="text-sm font-medium">บันทึกเพิ่มเติม</legend>
        <textarea name="note" rows={2} defaultValue={emp.note ?? ""} className="input" />
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : "บันทึกข้อมูลพนักงาน"}
        </button>
        {state.status === "error" && (
          <span className="text-sm text-[color:var(--color-danger)]">{state.message}</span>
        )}
        {state.status === "ok" && <span className={`text-sm ${muted}`}>{state.message}</span>}
      </div>
    </form>
  );
}
