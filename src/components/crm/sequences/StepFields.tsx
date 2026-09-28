"use client";

// StepFields.tsx — ช่องกรอกของ "ขั้น" หนึ่งขั้นในลำดับการติดตาม (ใบ C2.2 · ภาพ 07 ล่าง)
// 🔴 ใช้ร่วมกันทั้งฟอร์มสร้างลำดับใหม่ (หน้ารายการ) และตัวแก้ไข — ชุดช่องกรอกชุดเดียว ไม่เขียนซ้ำสองที่
// 🔴 client ล้วน: ไม่ import โมดูล CRM (ตัวตรวจค่าจริงอยู่ในบริการ `sequences-shared.cleanStep`) · ข้อความผิดแสดงในหน้า ไม่ใช้ alert

import { SEQ_KIND_OPTIONS, SEQ_TASK_TYPE_OPTIONS, type SeqKind, type SeqStepDraft, type SeqStepPayload } from "./types";
import { FieldError, type FieldErrorsApi } from "@/components/crm/form/field-errors";

// C4.3-fix part 2 ▸ ช่องของขั้นที่ต้องกรอกตามชนิด — ตรวจก่อนส่ง (ข้อความตรงกับ `cleanStep` ของบริการ ไม่มีเลขขั้นนำหน้า)
//   บริการตรวจซ้ำเสมอ (และเป็นตัวตัดสินเรื่องความยาว/บรรทัดเดียว) — ข้อความปฏิเสธของบริการชี้กลับมาที่ช่องผ่าน fieldErrors ◂
export type StepFieldKey = "subject" | "body" | "taskTitle" | "waitDays";
export function stepProblems(s: SeqStepDraft): Partial<Record<StepFieldKey, string>> {
  if (s.kind === "WAIT") return (Number(s.waitDays) || 0) === 0 && (Number(s.waitHours) || 0) === 0 ? { waitDays: "ระบุจำนวนวันหรือชั่วโมงที่ต้องรออย่างน้อย 1" } : {};
  if (s.kind === "TASK") return s.taskTitle.trim() ? {} : { taskTitle: "ใส่ชื่องานที่จะสร้างให้ผู้ดูแล" };
  if (s.kind === "EMAIL") return { ...(s.subject.trim() ? {} : { subject: "ใส่หัวเรื่องอีเมล" }), ...(s.body.trim() ? {} : { body: "ใส่เนื้อความของอีเมล" }) };
  return s.body.trim() ? {} : { body: "ใส่ข้อความที่จะส่ง" };
}

export function emptyStep(kind: SeqKind = "EMAIL", key = "new"): SeqStepDraft {
  return { key, kind, subject: "", body: "", waitDays: 1, waitHours: 0, taskTitle: "", taskType: "TASK", templateId: "", channel: "" };
}

/**
 * ขั้นในหน้าจอ → ค่าที่ส่งให้ server action (ตัดช่องที่ชนิดนี้ไม่ใช้ทิ้ง)
 * 🔴 `templateId`/`channel` ส่งกลับไปเสมอ (NOTE รีวิว C2.2): หน้าจอนี้ยังไม่มีช่องให้แก้ แต่ถ้าไม่พกกลับ การกดบันทึกครั้งเดียว
 *    จะลบค่าที่ตั้งไว้จากที่อื่น (เทมเพลตอีเมลของใบ C2.5) ทิ้งเงียบ ๆ
 */
export function stepPayload(s: SeqStepDraft): SeqStepPayload {
  const keep = { templateId: s.templateId || null, channel: s.channel || null };
  if (s.kind === "WAIT") return { kind: "WAIT", waitDays: Number(s.waitDays) || 0, waitHours: Number(s.waitHours) || 0, ...keep };
  if (s.kind === "TASK") return { kind: "TASK", taskTitle: s.taskTitle, taskType: s.taskType || "TASK", body: s.body, ...keep };
  if (s.kind === "EMAIL") return { kind: "EMAIL", subject: s.subject, body: s.body, ...keep };
  return { kind: s.kind, body: s.body, ...keep };
}

/** เทียบว่า "ขั้น" เปลี่ยนจริงไหม (ใช้ตัดสินว่าจะส่ง steps ไปกับการบันทึกหรือไม่ — การส่งไปเปล่า ๆ = ขึ้นเวอร์ชันใหม่ฟรี) */
export const stepsChanged = (a: SeqStepDraft[], b: SeqStepDraft[]): boolean => JSON.stringify(a.map(stepPayload)) !== JSON.stringify(b.map(stepPayload));

const lbl = "flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]";

export function StepFields({
  step,
  onChange,
  disabled,
  fe,
}: {
  step: SeqStepDraft;
  onChange: (patch: Partial<SeqStepDraft>) => void;
  disabled?: boolean;
  /** ผูกข้อความใต้ช่อง + โฟกัส (ฟอร์มสร้างลำดับใหม่) — ไม่ส่ง = แสดงช่องอย่างเดียว (ตัวแก้ไข) */
  fe?: FieldErrorsApi<StepFieldKey>;
}) {
  const hint = SEQ_KIND_OPTIONS.find((k) => k.value === step.kind)?.hint ?? "";
  const bind = (k: StepFieldKey) => (fe ? fe.field(k) : {});
  const err = (k: StepFieldKey) => (fe ? <FieldError id={fe.errorId(k)} message={fe.errors[k]} testid={`crm-seq-step-${k}-error-${step.key}`} /> : null);
  const change = (k: StepFieldKey | null, patch: Partial<SeqStepDraft>) => {
    onChange(patch);
    if (fe && k) fe.clear(k);
  };
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={`crm-seq-step-fields-${step.key}`}>
      <label className={lbl}>
        <span>ชนิดของขั้น</span>
        <select
          value={step.kind}
          disabled={disabled}
          onChange={(e) => {
            onChange({ kind: e.target.value as SeqKind });
            for (const k of ["subject", "body", "taskTitle", "waitDays"] as const) fe?.clear(k);
          }}
          className="input text-sm"
          data-testid={`crm-seq-step-kind-${step.key}`}
        >
          {SEQ_KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-[color:var(--color-muted)]">{hint}</p>

      {step.kind === "WAIT" && (
        <div className="flex flex-wrap gap-2">
          <label className={lbl}>
            <span>รอกี่วัน</span>
            <input
              {...bind("waitDays")}
              type="number"
              min={0}
              max={365}
              value={step.waitDays}
              disabled={disabled}
              onChange={(e) => change("waitDays", { waitDays: Number(e.target.value) })}
              className="input w-[120px] text-sm"
              data-testid={`crm-seq-step-wait-days-${step.key}`}
            />
            {err("waitDays")}
          </label>
          <label className={lbl}>
            <span>และอีกกี่ชั่วโมง</span>
            <input
              type="number"
              min={0}
              max={720}
              value={step.waitHours}
              disabled={disabled}
              onChange={(e) => change("waitDays", { waitHours: Number(e.target.value) })}
              className="input w-[140px] text-sm"
              data-testid={`crm-seq-step-wait-hours-${step.key}`}
            />
          </label>
        </div>
      )}

      {step.kind === "TASK" && (
        <>
          <label className={lbl}>
            <span>ชื่องานที่จะสร้าง</span>
            <input
              {...bind("taskTitle")}
              value={step.taskTitle}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => change("taskTitle", { taskTitle: e.target.value })}
              placeholder='เช่น "โทรติดตามใบเสนอราคา"'
              className="input text-sm"
              data-testid={`crm-seq-step-task-title-${step.key}`}
            />
            {err("taskTitle")}
          </label>
          <label className={lbl}>
            <span>ชนิดงาน</span>
            <select
              value={step.taskType}
              disabled={disabled}
              onChange={(e) => onChange({ taskType: e.target.value })}
              className="input w-[160px] text-sm"
              data-testid={`crm-seq-step-task-type-${step.key}`}
            >
              {SEQ_TASK_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {step.kind === "EMAIL" && (
        <label className={lbl}>
          <span>หัวเรื่องอีเมล</span>
          <input
            {...bind("subject")}
            value={step.subject}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => change("subject", { subject: e.target.value })}
            placeholder="เช่น ติดตามใบเสนอราคา {{contact.firstName}}"
            className="input text-sm"
            data-testid={`crm-seq-step-subject-${step.key}`}
          />
          {err("subject")}
        </label>
      )}

      {step.kind !== "WAIT" && (
        <label className={lbl}>
          <span>{step.kind === "TASK" ? "รายละเอียดงาน (ไม่บังคับ)" : "ข้อความที่จะส่ง"}</span>
          <textarea
            {...bind("body")}
            value={step.body}
            rows={3}
            maxLength={4000}
            disabled={disabled}
            onChange={(e) => change("body", { body: e.target.value })}
            placeholder="ใส่ {{contact.firstName}} เพื่อแทนชื่อผู้ติดต่อ"
            className="input text-sm"
            data-testid={`crm-seq-step-body-${step.key}`}
          />
          {err("body")}
        </label>
      )}
    </div>
  );
}
