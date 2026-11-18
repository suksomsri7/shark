// HR VIS-5c ▸ ส่วนของทะเบียนพนักงาน + โปรไฟล์ (ภาพ 02) ฝั่ง server — หัวโปรไฟล์ · แท็บ · มุมมองอ่าน (เลขอ่อนไหวปิดแล้ว) · เชื่อมระบบ ·
//   รายการรับเข้า (อ่านอย่างเดียว) · แท็บลา/เงินเดือน/เอกสาร · ไม่มี "use client" — เลขเต็มไม่เคยถึง HTML/props ของมุมมองอ่าน
//   (ดูเลขเต็ม = หน้าแก้ไข ?edit=1 ที่มีอยู่เดิม) · ผู้แก้ = ผู้ถือ hr.employee.create (คีย์เดียวกับ action ทุกตัวของหน้านี้) · ไม่มีตัวเลขเงินในไฟล์นี้ ◂
import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { evaluate } from "@/lib/core/rbac";
import { THAI_MONTH_SHORT, formatShortDate, formatThaiDateFull, thaiDateKey } from "@/lib/ui/date"; // HR VIS-5c ▸ r2: + THAI_MONTH_SHORT (วัน+เดือนแบบภาพ "15 ต.ค.") ◂
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { addEmployeeDocAction, removeEmployeeDocAction } from "./actions";
import { profileFormId, type EmployeeDocDto, type EmployeeProfileDto } from "./privacy-shared";
import type { HrViewer } from "./privacy";
import { canSeeLifecycle, cardSubjectOf, isLinkedTo, listChecklist } from "./lifecycle"; // HR VIS-5c ▸ r2: + canSeeLifecycle · isLinkedTo (ลิงก์ "ประเมิน ›" ตามด่านเดียวกับปุ่มยืนยันของ LifecycleBanner) ◂
import { loadAttendanceMonth } from "./judge"; // HR VIS-5c ▸ r2: สาย/ขาด/OT ช่วงทดลองงาน (ด่านเดิมของตัวอ่านปฏิทินลงเวลา · null = ไม่แสดงตัวเลข) ◂
import { leaveBalances } from "./leave";
import { ageOn, initialOf, maskBankAccount, maskNationalId, maskSso, ymdOf } from "./people-rules";

const muted = "text-[color:var(--color-muted)]";
const ghost = "btn btn-ghost min-h-[44px] whitespace-nowrap text-sm";
const card = "rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";
const link = "inline-flex min-h-[44px] items-center text-sm font-semibold text-[color:var(--color-accent)]";

/** ผู้แก้ทะเบียน/โปรไฟล์ = ผู้ถือ hr.employee.create (OWNER · MANAGER · คีย์ตรง) — คีย์ที่ action แก้ไขทุกตัวของสองหน้านี้ตรวจ (ด่านปุ่ม ≠ ด่านจริง: action ตรวจซ้ำ) */
export function canEditPeople(v: HrViewer): boolean {
  return evaluate(v, { module: "hr", action: "hr.employee.create" });
}

/** วันที่ของคอลัมน์ @db.Date: th "14 พ.ย. 2541" (formatThaiDateFull) · en "14 Nov 1998" (formatShortDate) */
export function dayText(d: Date | string | null | undefined, locale: string): string {
  const ymd = ymdOf(d);
  if (!ymd) return "";
  return locale === "en" ? formatShortDate(new Date(`${ymd}T00:00:00Z`), "en") : formatThaiDateFull(ymd);
}

/** HR VIS-5c ▸ r2: วัน+เดือนไม่มีปี (ภาพ 02 "ครบ 15 ต.ค." · "สัญญาถึง 31 ต.ค.") — th "15 ต.ค." · en "15 Oct" ◂ */
export function dayMonth(d: Date | string | null | undefined, locale: string): string {
  const ymd = ymdOf(d);
  if (!ymd) return "";
  const day = Number(ymd.slice(8, 10)), m = Number(ymd.slice(5, 7));
  return locale === "en" ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : `${day} ${THAI_MONTH_SHORT[m - 1] ?? ""}`;
}

export const profileHref = (systemId: string, employeeId: string, q = "") => `/app/sys/${systemId}/hr/employees/${encodeURIComponent(employeeId)}${q}`;

function Kv({ k, children, testId }: { k: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[color:var(--color-line)] py-2.5 text-sm last:border-b-0">
      <span className={`w-28 shrink-0 ${muted}`}>{k}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2 break-words" data-testid={testId}>
        {children}
      </span>
    </div>
  );
}

// ═════════════ หัวโปรไฟล์: รูปย่อ · ชื่อ · รหัส · ตำแหน่ง · สาขา · แผนก · ปุ่มแก้ไข ═════════════
// HR VIS-5c ▸ r2 (A1/B7): ปุ่ม "แก้ไข" ย้ายไปหัวข้อ "ข้อมูลส่วนตัว" (EmployeeReadView) · ชื่อเรื่องแต่ละส่วนไม่ตัดกลางคำ (ขึ้นบรรทัดได้ที่ " · " เท่านั้น · ยาวเกิน = … + title) ◂
export async function ProfileHeader({ emp, close }: { systemId?: string; emp: EmployeeProfileDto; canEdit?: boolean; onEdit?: boolean; close?: string }) {
  const t = await getTranslations("hr.people");
  const parts = [emp.nickname || emp.name, emp.code, emp.position].filter((x): x is string => !!x); // HR VIS-5c ◂
  const sub = [emp.nickname && emp.nickname !== emp.name ? emp.name : null, emp.unitName, emp.department].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3.5">
      <span aria-hidden="true" className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-xl font-bold text-[color:var(--color-ink-soft)]">
        {initialOf(emp.nickname || emp.name)}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold leading-snug">
          {parts.map((p, i) => (
            <span key={i} title={p} className="inline-block max-w-full truncate whitespace-nowrap align-bottom">
              {i > 0 ? <span className={`px-1.5 font-normal ${muted}`}>·</span> : null}
              {p}
            </span>
          ))}
          {/* HR VIS-5c ◂ */}
        </h2>
        {sub && <p className={`text-sm ${muted}`}>{sub}</p>}
      </div>
      {close && (
        <Link href={close} data-testid="hr-people-panel-close" aria-label={t("panel.close")} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-lg text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]">
          ×
        </Link>
      )}
    </div>
  );
}

// ═════════════ แท็บโปรไฟล์ (ลิงก์ ?tab= · aria-current ตัวเดียว) ═════════════
export const PROFILE_TABS = ["general", "docs", "schedule", "leave", "pay", "history"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];
export const profileTabOf = (v: unknown): ProfileTab => (PROFILE_TABS.includes(v as ProfileTab) ? (v as ProfileTab) : "general");

export async function ProfileTabs({ href, tab, tabs, compact }: { href: (tab: ProfileTab) => string; tab: ProfileTab | null; tabs: readonly ProfileTab[]; compact?: boolean /* HR VIS-5c ▸ r2: แผงข้างทะเบียน — ระยะแท็บแคบลง (6 แท็บพอดีแผง) ◂ */ }) {
  const t = await getTranslations("hr.people");
  return (
    <nav aria-label={t("prof.tab.label")} data-scroll="x" className="-mx-1 flex gap-1 overflow-x-auto border-b border-[color:var(--color-line)]">
      {tabs.map((k) => (
        <Link
          key={k}
          href={href(k)}
          data-testid={`hr-profile-tab-${k}`}
          aria-current={tab === k ? "page" : undefined}
          className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap text-sm ${compact ? "px-2" : "px-3"} ${tab === k /* HR VIS-5c ▸ r2 (B2): shrink-0 — แท็บไม่ถูกบีบจนป้ายชนกันที่ 390 ◂ */ ? "border-b-2 border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]" : muted}`}
        >
          {t(`prof.tab.${k}`)}
        </Link>
      ))}
    </nav>
  );
}

// ═════════════ HR VIS-5c ▸ r2 (A1/B6): แถบทดลองงาน (ภาพ 02) — "ทดลองงาน · ครบ <วัน> (อีก N วัน)" + "เริ่ม … · N วัน · สาย · ขาด · OT" + ลิงก์ "ประเมิน ›" ไปแท็บประวัติ ·
//   ปุ่มยืนยันผ่านทดลองงานจริง (LifecycleBanner · confirmProbationAction) อยู่ที่แท็บประวัติเท่านั้น — ที่นี่ไม่ผูก action ·
//   ข้อมูล = DTO ที่ไม่อ่อนไหว (สถานะ · วันครบทดลองงาน · วันเริ่มงาน — แถว "การจ้างงาน" ของมุมมองอ่านแสดงอยู่แล้วกับผู้ดูทุกคน) · ลิงก์ประเมินตามด่านปุ่มยืนยันเดิม (ผู้ดูข้อมูลบันทึก · ไม่ใช่ตัวเอง · ยังทำงาน) ·
//   สาย/ขาด/OT = loadAttendanceMonth (ด่านเดิม) รวมทุกเดือนตั้งแต่เดือนเริ่มงานถึงเดือนนี้ · ตัวอ่านปฏิเสธ ⇒ ไม่แสดงตัวเลข ◂ ═════════════
export async function ProbationStats({ systemId, tenantId, viewer, emp }: { systemId: string; tenantId: string; viewer: HrViewer; emp: EmployeeProfileDto }) {
  const t = await getTranslations("hr.people");
  const locale = await getLocale();
  const start = ymdOf(emp.startDate), end = ymdOf(emp.probationEndAt);
  if (!start) return null;
  const days = end ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) : null;
  const months: string[] = [];
  const now = thaiDateKey(new Date()).slice(0, 7);
  for (let m = start.slice(0, 7); m <= now && months.length <= 13; ) {
    months.push(m);
    const [y, mm] = m.split("-").map(Number) as [number, number];
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  let late = 0, absent = 0, otMin = 0, ok = months.length > 0 && months.length <= 13;
  for (const month of ok ? months : []) {
    const r = await loadAttendanceMonth({ tenantId, systemId }, viewer, { employeeId: emp.id, month }).catch(() => null);
    if (!r) { ok = false; break; }
    late += r.summary.lateCount; absent += r.summary.absentDays; otMin += r.summary.otMin;
  }
  const date = locale === "en" ? dayText(start, locale) : formatThaiDateFull(start);
  const head = days !== null && days > 0 ? t("prob.stats", { date, days }) : t("prob.stats", { date, days: "—" });
  return (
    <small data-testid="hr-people-prob-stats" className="mt-1 block text-[13px] text-[color:var(--color-ink-soft)]">
      {head}
      {ok ? ` · ${t("prob.counts", { late, absent, ot: String(+(otMin / 60).toFixed(2)) })}` : ""}
    </small>
  );
}

export async function ProfileProbation({ systemId, tenantId, viewer, emp, reviewTestId = "hr-people-prob-review" }: { systemId: string; tenantId: string; viewer: HrViewer; emp: EmployeeProfileDto; reviewTestId?: string }) {
  const probEnd = ymdOf(emp.probationEndAt);
  if (emp.employmentStatus !== "PROBATION" || !probEnd) return null;
  const tl = await getTranslations("hr.life");
  const t = await getTranslations("hr.people");
  const locale = await getLocale();
  const today = thaiDateKey(new Date());
  const left = Math.round((Date.parse(`${probEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const leftText = left > 0 ? tl("banner.left", { n: left }) : left === 0 ? tl("banner.today") : tl("banner.over", { n: -left });
  const canReview = emp.active && canSeeLifecycle(viewer) && !(await isLinkedTo({ tenantId, systemId }, viewer.userId, emp.id));
  return (
    <div data-testid="hr-life-banner" className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <b className="flex items-center gap-1.5 text-[15px] text-[color:var(--color-accent)]">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M5 21V4" />
            <path d="M5 4h11l-2 4 2 4H5" />
          </svg>
          {/* วันที่และ "อีก N วัน" ไม่ถูกตัดกลาง (ขึ้นบรรทัดที่ช่องว่าง) */}
          <span className="min-w-0">
            {tl("banner.probation", { date: "\u0001", left: "\u0002" })
              .replace("(\u0002)", "\u0003")
              .split(/(\u0001|\u0002|\u0003)/)
              .map((p, i) => (p === "\u0001" ? <span key={i} className="whitespace-nowrap">{dayMonth(probEnd, locale)}</span> : p === "\u0002" || p === "\u0003" ? <span key={i} className="whitespace-nowrap">{p === "\u0003" ? `(${leftText})` : leftText}</span> : p))}
          </span>
        </b>
        <ProbationStats systemId={systemId} tenantId={tenantId} viewer={viewer} emp={emp} />
      </div>
      {canReview && (
        <Link href={profileHref(systemId, emp.id, "?tab=history#hr-life")} data-testid={reviewTestId} className="btn btn-primary min-h-[44px] whitespace-nowrap text-sm">
          {t("prob.review")} ›
        </Link>
      )}
    </div>
  );
}

// ═════════════ มุมมองอ่าน: ข้อมูลส่วนตัว (เลขอ่อนไหวปิดแล้ว) + การจ้างงาน + ผู้ติดต่อฉุกเฉิน ═════════════
/** sensitive = view.canSeeSensitive (privacy.ts) · ไม่มีสิทธิ์ = คีย์อ่อนไหวไม่อยู่ใน DTO ตั้งแต่ต้น ⇒ แถว "ซ่อน" · ตาเปิดหน้าแก้ไขเฉพาะผู้เห็นเลข ∧ ผู้แก้ */
export async function EmployeeReadView({ systemId, emp, sensitive, canEdit, compact }: { systemId: string; emp: EmployeeProfileDto; sensitive: boolean; canEdit: boolean; compact?: boolean }) {
  const t = await getTranslations("hr.people");
  const locale = await getLocale();
  const today = thaiDateKey(new Date());
  const none = <span className={muted}>{t("prof.none")}</span>;
  const birth = ymdOf(emp.birthDate);
  const age = birth ? ageOn(birth, today) : null;
  const address = [emp.addressLine, emp.subdistrict, emp.district, emp.province, emp.postcode].filter(Boolean).join(" ");
  const revealHref = profileHref(systemId, emp.id, "?edit=1#hr-profile-sensitive");
  const eye = (k: string) =>
    canEdit ? (
      <Link href={revealHref} data-testid={`hr-profile-reveal-${k}`} aria-label={t("prof.reveal")} title={t("prof.reveal")} className="-my-2.5 ml-auto grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </Link>
    ) : null;
  const hidden = <span className={muted}>{t("prof.hidden")}</span>;
  const typeText = emp.employmentType ? t(`type.${emp.employmentType as "FULL_TIME"}`) : null;
  const statusText = emp.employmentStatus === "PROBATION" ? t("status.probation") : emp.employmentStatus === "ENDED" ? t("status.ended") : emp.employmentStatus === "ACTIVE" ? t("status.active") : null;
  const emergency = [emp.emergencyName, emp.emergencyRelation, emp.emergencyPhone].filter(Boolean).join(" · ");
  const h3 = "mb-1 flex items-center gap-2 text-[15px] font-bold";
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className={h3}>
          {t("prof.personal")}
          <span className="flex-1" />
          {canEdit && (
            <Link href={profileHref(systemId, emp.id, "?edit=1")} data-testid="hr-profile-edit" className={`${link} -my-3 text-[13px]`}>
              {t("prof.edit")}
            </Link>
          )}
          {/* HR VIS-5c ▸ r2 (A1/B7): "แก้ไข" = ลิงก์ท้ายหัวข้อข้อมูลส่วนตัว (ภาพ 02) · ผู้ถือ hr.employee.create เท่านั้น ◂ */}
        </h3>
        {/* HR VIS-5c ▸ r2: แถวชื่อเล่นออก — ชื่อเล่นอยู่บนหัวโปรไฟล์แล้ว (ภาพ 02 เริ่มที่ เบอร์) ◂ */}
        <Kv k={t("prof.phone")}>{emp.phone || none}</Kv>
        <Kv k={t("prof.email")}>{emp.email ? <span className="break-all">{emp.email}</span> : none}</Kv>
        {(
          [
            ["nid", t("prof.nid"), maskNationalId(emp.nationalId), true],
            ["sso", t("prof.sso"), maskSso(emp.ssoNumber), true],
            ["bank", t("prof.bank"), maskBankAccount(emp.bankName, emp.bankAccountNo), false],
          ] as const
        ).map(([k, label, masked, withEye]) => (
          <Kv key={k} k={label}>
            {sensitive ? (
              <>
                <span data-testid={`hr-profile-mask-${k}`}>{masked}</span>
                {withEye && eye(k)}
              </>
            ) : (
              hidden
            )}
          </Kv>
        ))}
        <Kv k={t("prof.birth")}>{birth ? (age !== null ? t("prof.age", { date: dayText(birth, locale), n: age }) : dayText(birth, locale)) : none}</Kv>
        <Kv k={t("prof.address")}>{address || none}</Kv>
      </section>
      {!compact && (
        <section>
          <h3 className={h3}>{t("prof.employment")}</h3>
          <Kv k={t("prof.position")}>{emp.position || none}</Kv>
          <Kv k={t("prof.dept")}>{emp.department || none}</Kv>
          <Kv k={t("prof.unit")}>{emp.unitName || (emp.unitId ? t("otherUnit") : t("noUnit"))}</Kv>
          <Kv k={t("prof.type")}>{typeText || none}</Kv>
          <Kv k={t("prof.start")}>{emp.startDate ? dayText(emp.startDate, locale) : none}</Kv>
          {statusText && <Kv k={t("prof.status")}>{statusText}</Kv>}
          {emp.probationEndAt && <Kv k={t("prof.probationEnd")}>{dayText(emp.probationEndAt, locale)}</Kv>}
          {emp.contractEndAt && <Kv k={t("prof.contractEnd")}>{dayText(emp.contractEndAt, locale)}</Kv>}
        </section>
      )}
      {!compact && (emergency || emp.note) && (
        <section>
          {emergency && (
            <>
              <h3 className={h3}>{t("prof.emergency")}</h3>
              <Kv k={t("prof.contact")}>{emergency}</Kv>
            </>
          )}
          {emp.note && <Kv k={t("prof.note")}>{emp.note}</Kv>}
        </section>
      )}
    </div>
  );
}

// ═════════════ เชื่อมระบบ: บัญชี SHARK (ผูก/ไม่ผูก) · PIN ลงเวลา · LINE ═════════════
/** บัญชี SHARK = มี/ไม่มีบัญชีผูก (มติ 5c-5: ไม่แสดงบทบาท) · ระบบจอง/CRM ไม่มีตัวอ่านฝั่ง HR ⇒ ไม่แสดง (owner list) */
export async function ProfileConnections({ systemId, tenantId, emp, canEdit, line }: { systemId: string; tenantId: string; emp: EmployeeProfileDto; canEdit: boolean; line?: ReactNode }) {
  const t = await getTranslations("hr.people");
  const subject = await cardSubjectOf({ tenantId, systemId }, emp.id);
  const linked = !!subject?.linkedUserId;
  const row = "flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-[color:var(--color-line)] px-3.5 py-2.5 text-sm first:border-t-0";
  const nm = `w-28 shrink-0 ${muted}`;
  return (
    <section data-testid="hr-profile-connections">
      <h3 className="mb-2.5 text-[15px] font-bold">{t("prof.conn.title")}</h3>
      <div className="overflow-hidden rounded-2xl border border-[color:var(--color-line)]">
        <div className={row}>
          <span className={nm}>{t("prof.conn.account")}</span>
          <span className={linked ? "font-semibold" : muted}>{linked ? `✓ ${t("prof.conn.accountYes")}` : t("prof.conn.accountNo")}</span>
          {linked && <span className={`ml-auto text-xs ${muted}`}>{t("prof.conn.accountYesSub")}</span>}
        </div>
        <div className={row}>
          <span className={nm}>{t("prof.conn.pin")}</span>
          <span className={emp.hasPin ? "font-semibold" : muted}>{emp.hasPin ? `✓ ${t("pinSet")}` : t("pinNone")}</span>
          {canEdit && emp.active && (
            <Link href={`/app/sys/${systemId}/hr/employees?q=${encodeURIComponent(emp.code || emp.name)}`} data-testid="hr-profile-conn-pin" className={`ml-auto ${link}`}>
              {t("prof.conn.pinChange")}
            </Link>
          )}
        </div>
        {line && (
          <div className={row}>
            <span className={nm}>{t("prof.conn.line")}</span>
            <span className="min-w-0 flex-1">{line}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ═════════════ รายการรับพนักงานใหม่ (อ่านอย่างเดียว · ติ๊ก/บันทึก/สิ้นสุดการจ้าง = แท็บประวัติ) ═════════════
/** ตัวอ่าน + ด่าน = listChecklist ของ lifecycle.ts (null = ไม่มีสิทธิ์/นอกสาขา/ของตัวเอง ⇒ ไม่แสดง) · life = ผลของ loadLifecycleForViewer (null ⇒ ไม่แสดง เหมือน LifecycleProfile) */
export async function ProfileChecklist({ systemId, tenantId, viewer, employeeId, life, manageHref, testId }: { systemId: string; tenantId: string; viewer: HrViewer; employeeId: string; life: unknown; manageHref?: string; testId?: string }) {
  if (!life) return null;
  const check = await listChecklist({ tenantId, systemId }, viewer, employeeId);
  if (!check || !check.onboarding.length) return null;
  const t = await getTranslations("hr.life");
  const tp = await getTranslations("hr.people");
  const done = check.onboarding.filter((x) => x.done).length;
  const total = check.onboarding.length;
  return (
    <section data-testid={testId} className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        {t("checklist.onboarding")}
        <span className="flex-1" />
        <b className="text-sm">{t("checklist.progress", { done, total })}</b>
      </h3>
      <div className="h-2 overflow-hidden rounded border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]">
        <i className="block h-full bg-[color:var(--color-ink)]" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {check.onboarding.map((x) => (
          <li key={x.id} className={`flex items-center gap-2.5 text-sm ${x.done ? "" : "font-semibold"}`}>
            <span aria-hidden="true" className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded border text-[11px] ${x.done ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border-[color:var(--color-ink)]"}`}>
              {x.done ? "✓" : ""}
            </span>
            <span className="min-w-0 break-words">{x.title}</span>
            <span className="sr-only">{x.done ? t("checklist.markDone") : t("checklist.markOpen")}</span>
          </li>
        ))}
      </ul>
      {manageHref && (
        <Link href={manageHref} data-testid="hr-profile-checklist-manage" className={`self-start ${link}`}>
          {tp("prof.check.manage")} →
        </Link>
      )}
    </section>
  );
}

// ═════════════ แท็บลา: ยอดวันลาปีนี้ (leaveBalances ตัดสินสิทธิ์ + สาขาเอง) ═════════════
export async function ProfileLeaveTab({ systemId, tenantId, viewer, employeeId }: { systemId: string; tenantId: string; viewer: HrViewer; employeeId: string }) {
  const t = await getTranslations("hr.people");
  const r = await leaveBalances({ tenantId, systemId }, viewer, { employeeId, at: thaiDateKey(new Date()) });
  if (!r.ok) return <p className={`text-sm ${muted}`}>{t("prof.leave.no")}</p>;
  const th = `px-3 py-2.5 text-left text-xs font-semibold ${muted}`;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold">{t("prof.leave.title")}</h3>
      {r.items.length === 0 ? (
        <p className={`text-sm ${muted}`}>{t("prof.leave.none")}</p>
      ) : (
        <div data-scroll="x" className="overflow-x-auto rounded-2xl border border-[color:var(--color-line)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)]">
                <th className={th}>{t("prof.leave.policy")}</th>
                <th className={th}>{t("prof.leave.balance")}</th>
                <th className={th}>{t("prof.leave.used")}</th>
                <th className={th}>{t("prof.leave.pending")}</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.policyId} className="border-b border-[color:var(--color-line)] last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">{i.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{i.unlimited ? t("prof.leave.unlimited") : t("prof.leave.days", { n: i.balance })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{t("prof.leave.days", { n: i.used })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{t("prof.leave.days", { n: i.pending })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ═════════════ แท็บเงินเดือน: ลิงก์ไปหน้าเงินเดือน (ไม่มีตัวเลขในโปรไฟล์ · มติ 5c-2) ═════════════
export async function ProfilePayTab({ systemId, sensitive }: { systemId: string; sensitive: boolean }) {
  const t = await getTranslations("hr.people");
  if (!sensitive) return <p className={`text-sm ${muted}`}>{t("prof.pay.no")}</p>;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[15px] font-bold">{t("prof.pay.title")}</h3>
      <p className={`text-sm ${muted}`}>{t("prof.pay.hint")}</p>
      <Link href={`/app/sys/${systemId}/hr/payroll`} data-testid="hr-profile-pay-open" className={`self-start ${ghost}`}>
        {t("prof.pay.open")} →
      </Link>
    </section>
  );
}

// ═════════════ แท็บเอกสาร: รายการ (ผู้เห็นข้อมูลอ่อนไหว) · แนบ/ลบ (ผู้แก้เท่านั้น) · ไม่มีวันหมดอายุ (ไม่มีข้อมูลรองรับ) ═════════════
const DOC_KINDS = ["ID_CARD", "HOUSE_REG", "CONTRACT", "CERTIFICATE", "SSO_FORM", "BANK_BOOK", "OTHER"] as const;
export async function ProfileDocsTab({ systemId, employeeId, docs, sensitive, canEdit }: { systemId: string; employeeId: string; docs: EmployeeDocDto[]; sensitive: boolean; canEdit: boolean }) {
  const t = await getTranslations("hr.people");
  if (!sensitive) return <p className={`text-sm ${muted}`}>{t("prof.docs.hidden")}</p>;
  const kind = (k: string) => (DOC_KINDS.includes(k as (typeof DOC_KINDS)[number]) ? t(`prof.docs.kinds.${k as "OTHER"}`) : k);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold">{t("prof.docs.title")}</h3>
      {docs.length === 0 && <p className={`text-sm ${muted}`}>{canEdit ? t("prof.docs.empty") : t("prof.docs.emptyRead")}</p>}
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--color-line)] px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm">{doc.title}</span>
            <span className={`block truncate text-xs ${muted}`}>
              {kind(doc.kind)}
              {doc.note ? ` · ${doc.note}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Link href={doc.url} target="_blank" rel="noopener noreferrer" data-testid={`hr-profile-doc-open-${doc.id}`} className="inline-flex min-h-[44px] items-center px-2 text-sm underline">
              {t("prof.docs.open")}
            </Link>
            {canEdit && (
              <form action={removeEmployeeDocAction}>
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="employeeId" value={employeeId} />
                <input type="hidden" name="docId" value={doc.id} />
                <button data-testid={`hr-profile-doc-remove-${doc.id}`} className="inline-flex min-h-[44px] items-center px-2 text-sm text-[color:var(--color-danger)] underline">{t("prof.docs.remove")}</button>
              </form>
            )}
          </span>
        </div>
      ))}
      {canEdit && (
        <form action={addEmployeeDocAction} className="mt-1 grid grid-cols-1 gap-3 border-t border-[color:var(--color-line)] pt-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="employeeId" value={employeeId} />
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            {t("prof.docs.kind")}
            <select name="kind" data-testid="hr-profile-doc-kind" className="input min-h-11" defaultValue="ID_CARD">
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kind(k)}
                </option>
              ))}
            </select>
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            {t("prof.docs.docTitle")}
            <input name="title" required data-testid="hr-profile-doc-title" placeholder={t("prof.docs.docTitlePh")} className="input min-h-11" />
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted} sm:col-span-2`}>
            {t("prof.docs.url")}
            <input name="url" required data-testid="hr-profile-doc-url" placeholder="https://…" className="input min-h-11" />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton variant="ghost" className="min-h-[44px]" data-testid="hr-profile-doc-add">{t("prof.docs.add")}</SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}

/** กรอบการ์ดของส่วนโปรไฟล์ (ใช้ร่วมกับหน้า) */
export function PeopleCard({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={`${card} p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}

// ═════════════ ชิ้นของหน้าโปรไฟล์ที่ต้องใช้ข้อความ (แปลในคอมโพเนนต์ — หน้าไม่ถือข้อความเอง) ═════════════
/** หัวหน้า: ชื่อระบบ + ลิงก์กลับทะเบียน */
export async function ProfilePageHeader({ title, systemId }: { title: string; systemId: string }) {
  const t = await getTranslations("hr.people");
  return <PageHeader title={title} back={{ href: `/app/sys/${systemId}/hr/employees`, label: t("prof.back") }} />;
}

/** แถบ "ถูกลบออกจากทะเบียนแล้ว" */
export async function ProfileRemovedNote() {
  const t = await getTranslations("hr.people");
  return <p className="rounded-lg border px-3 py-2 text-xs text-[color:var(--color-danger)]">{t("prof.removedNote")}</p>;
}

/** การ์ดโหมดแก้ไข: หัว + สาขาประจำ (ช่องของฟอร์มโปรไฟล์ทาง form={…} · ตัวเลือก = สาขาในขอบเขตผู้แก้ · action ตรวจซ้ำ) + ฟอร์ม (children) */
export async function ProfileEditCard({ emp, units, allBranches, children }: { emp: EmployeeProfileDto; units: { id: string; name: string }[]; allBranches: boolean; children: ReactNode }) {
  const t = await getTranslations("hr.people");
  return (
    <div className={`${card} p-4 md:p-5`}>
      <h2 className="mb-4 text-lg font-bold">{t("prof.editTitle")}</h2>
      {units.length > 0 && (
        <label className={`mb-3 flex flex-col gap-1 text-xs ${muted}`}>
          {t("prof.unit")}
          <select name="unitId" form={profileFormId(emp.id)} data-testid="hr-profile-unit" defaultValue={emp.unitId ?? ""} className="input min-h-11">
            {(allBranches || !emp.unitId) && <option value="">{t("noUnit")}</option>}
            {emp.unitId && !units.some((u) => u.id === emp.unitId) && <option value={emp.unitId}>{emp.unitName ?? t("otherUnit")}</option>}
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {children}
    </div>
  );
}
