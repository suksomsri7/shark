"use client";
// HR H4.5 ▸ ส่วนที่กดได้ของ LINE พนักงาน (brief hr-brief-H4.5 R11 · ไม่มี mockup — ตามการ์ดของหน้า "ของฉัน"/หน้าตั้งค่า HR)
//   การ์ด "LINE ของฉัน" (/app/me/hr/profile): สถานะ · ขอรหัสผูก (แสดงครั้งเดียว + เวลาหมดอายุ + ลิงก์เปิดแชท OA) · ยกเลิกผูก · ประโยค PDPA
//   การ์ดค่าตั้ง (หน้าตั้งค่า HR): เปิด/ปิด · ชนิดเหตุการณ์ · ทันที/สรุป · เวลาสรุป · เพดาน/เดือน · OA สำรอง · "ส่งเดือนนี้ N / เพดาน" · ป้ายยังไม่ได้ทดสอบกับ OA จริง
//   (ชิปหน้าโปรไฟล์พนักงานเรนเดอร์ฝั่ง server ในหน้าเอง — หน้าโปรไฟล์มี client component ได้ตัวเดียว: qc-hf-hr-privacy S-2)
//   🔴 ไฟล์นี้ไม่ import อะไรที่ถึงฐาน/แชท/แพลตฟอร์ม — ข้อมูลมาจากหน้า server · action ส่งมาเป็น prop · รหัสผูกอยู่ใน state ของจอเท่านั้น ◂
import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

type Res = { ok: boolean; reason?: string } | null;
type CodeRes = { ok: true; code: string; deepLink: string | null; expiresAt: string } | { ok: false; reason: string } | null;
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const muted = "text-xs text-[color:var(--color-muted)]";
const danger = "text-xs text-[color:var(--color-danger)]";
const bkkTime = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const bkkDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });

export type LineSelfStatus = { state: "NONE" | "PENDING" | "ACTIVE" | "NOT_AVAILABLE"; linkedAt: string | null; displayName: string | null; shopEnabled: boolean };

/** การ์ด "LINE ของฉัน" — ตัวตนจาก session ฝั่ง action เสมอ (การ์ดไม่ส่ง id ใด ๆ) */
export function LineSelfCard({
  status,
  canWrite,
  issueAction,
  unlinkAction,
}: {
  status: LineSelfStatus;
  canWrite: boolean;
  issueAction: () => Promise<CodeRes>;
  unlinkAction: () => Promise<Res>;
}) {
  const t = useTranslations("hr.line");
  const [code, setCode] = useState<CodeRes>(null);
  const [unl, setUnl] = useState<Res>(null);
  const [pending, start] = useTransition();
  const active = status.state === "ACTIVE" && !unl?.ok;
  const stateText = active ? t("stateActive") : status.state === "PENDING" ? t("statePending") : status.state === "NOT_AVAILABLE" ? t("stateNotAvailable") : t("stateNone");
  return (
    <section className="card flex flex-col gap-2 p-4" data-testid="hr-self-line-card">
      <h2 className="text-sm font-semibold">{t("title")}</h2>
      <p className="text-sm" data-testid="hr-self-line-status">
        {stateText}
        {active && status.displayName ? ` · ${t("linkedAs", { name: status.displayName })}` : ""}
        {active && status.linkedAt ? ` · ${t("linkedAt", { date: bkkDate(status.linkedAt) })}` : ""}
      </p>
      <p className={muted}>{t("pdpa")}</p>
      {!status.shopEnabled && <p className={muted}>{t("shopOff")}</p>}
      {canWrite && status.shopEnabled && !active && status.state !== "NOT_AVAILABLE" && (
        <button
          type="button"
          className={`${btn} self-start`}
          disabled={pending}
          data-testid="hr-self-line-link"
          onClick={() => start(async () => setCode(await issueAction()))}
        >
          {t("getCode")}
        </button>
      )}
      {code?.ok && (
        <div className="flex flex-col gap-1 rounded-lg border p-3">
          <span className="font-mono text-lg font-semibold tracking-widest" data-testid="hr-self-line-code">
            {code.code}
          </span>
          <span className={muted}>{t("codeHint", { time: bkkTime(code.expiresAt) })}</span>
          {code.deepLink && (
            <a href={code.deepLink} className={`${ghost} self-start`} target="_blank" rel="noopener noreferrer" data-testid="hr-self-line-deeplink">
              {t("openLine")}
            </a>
          )}
        </div>
      )}
      {code && !code.ok && (
        <p role="alert" className={danger}>
          {code.reason}
        </p>
      )}
      {active && (
        <button type="button" className={`${ghost} self-start`} disabled={pending} data-testid="hr-self-line-unlink" onClick={() => start(async () => setUnl(await unlinkAction()))}>
          {t("unlink")}
        </button>
      )}
      {unl && (
        <p role={unl.ok ? "status" : "alert"} className={unl.ok ? muted : danger}>
          {unl.ok ? t("unlinked") : unl.reason}
        </p>
      )}
    </section>
  );
}

export type LineSettingsData = {
  enabled: boolean;
  events: Record<"ROSTER" | "LEAVE" | "OT" | "SWAP" | "SLIP", boolean>;
  mode: "IMMEDIATE" | "DIGEST";
  digestAt: string;
  monthlyCap: number;
  unitId: string | null;
};
const EVENTS = ["ROSTER", "LEAVE", "OT", "SWAP", "SLIP"] as const;

/** การ์ดค่าตั้งแจ้งเตือน LINE ของระบบ HR (ผู้ตั้งค่า HR · service ตรวจสิทธิ์ซ้ำจากฐาน) */
export function LineSettingsCard({
  systemId,
  policy,
  sentThisMonth,
  units,
  canSave,
  saveAction,
}: {
  systemId: string;
  policy: LineSettingsData;
  sentThisMonth: number;
  units: { id: string; name: string }[];
  canSave: boolean;
  saveAction: (fd: FormData) => Promise<Res>;
}) {
  const t = useTranslations("hr.line");
  const [state, run, pending] = useActionState<Res, FormData>((_p, fd) => saveAction(fd), null);
  return (
    <section className="card flex flex-col gap-3 p-4" id="hr-line-settings" data-testid="hr-line-settings-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("settingsTitle")}</h2>
        <span className="rounded-full border px-2 py-1 text-xs" data-testid="hr-line-settings-pilot">
          {t("pilot")}
        </span>
      </div>
      <p className={muted}>{t("settingsDesc")}</p>
      <p className="text-sm" data-testid="hr-line-settings-sent">
        {t("sentThisMonth", { n: sentThisMonth, cap: policy.monthlyCap })}
      </p>
      <form action={run} className="flex flex-col gap-3">
        <input type="hidden" name="systemId" value={systemId} />
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={policy.enabled} disabled={!canSave} data-testid="hr-line-settings-enabled" />
          {t("enabled")}
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className={muted}>{t("events")}</legend>
          <div className="flex flex-wrap gap-3">
            {EVENTS.map((k) => (
              <label key={k} className="flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" name={`ev_${k}`} defaultChecked={policy.events[k]} disabled={!canSave} />
                {t(`ev${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <label className={`flex flex-col gap-1 ${muted}`}>
            {t("mode")}
            <select name="mode" className="input min-h-[44px]" defaultValue={policy.mode} disabled={!canSave} data-testid="hr-line-settings-mode">
              <option value="IMMEDIATE">{t("modeImmediate")}</option>
              <option value="DIGEST">{t("modeDigest")}</option>
            </select>
          </label>
          <label className={`flex flex-col gap-1 ${muted}`}>
            {t("digestAt")}
            <input name="digestAt" type="time" step={60} className="input min-h-[44px] w-28" defaultValue={policy.digestAt} disabled={!canSave} data-testid="hr-line-settings-digest" />
          </label>
          <label className={`flex flex-col gap-1 ${muted}`}>
            {t("cap")}
            <input name="monthlyCap" type="number" min={0} max={5000} step={1} className="input min-h-[44px] w-28" defaultValue={policy.monthlyCap} disabled={!canSave} data-testid="hr-line-settings-cap" />
          </label>
          <label className={`flex flex-col gap-1 ${muted}`}>
            {t("fallbackUnit")}
            <select name="unitId" className="input min-h-[44px]" defaultValue={policy.unitId ?? ""} disabled={!canSave} data-testid="hr-line-settings-unit">
              <option value="">{t("none")}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={muted}>{t("costNote")}</p>
        {canSave && (
          <button type="submit" className={`${btn} self-start`} disabled={pending} data-testid="hr-line-settings-save">
            {t("save")}
          </button>
        )}
        {state && (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? muted : danger}>
            {state.ok ? t("saved") : state.reason}
          </p>
        )}
      </form>
    </section>
  );
}
